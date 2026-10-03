import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./d1-stub.mjs";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `auth-${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const HOST = "https://integ.example.workers.dev";
const PASSWORD = "correct horse: 口令";
const ctx = { waitUntil() {}, passThroughOnException() {} };
const assets = { fetch: async () => new Response("Not found", { status: 404 }) };

const basic = (password) => `Basic ${Buffer.from(`anyone:${password}`, "utf8").toString("base64")}`;

function call(path, { env = {}, password, ip, method = "GET", body } = {}) {
  const headers = { accept: "text/html" };
  if (password !== undefined) headers.Authorization = basic(password);
  if (ip) headers["CF-Connecting-IP"] = ip;
  const request = new Request(`${HOST}${path}`, { method, headers, body });
  return worker.fetch(request, { ASSETS: assets, APP_PASSWORD: PASSWORD, ...env }, ctx);
}

test("page and API need the password; every method is blocked without it", async () => {
  const env = { DB: createD1() };

  assert.equal((await call("/", { env })).status, 401);
  assert.equal((await call("/", { env, password: "wrong" })).status, 401);
  const page = await call("/", { env, password: PASSWORD });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Integ Workshop/);

  for (const method of ["GET", "POST", "PATCH"]) {
    const res = await call("/api/workshop", { env, method, body: method === "GET" ? undefined : "{}" });
    assert.equal(res.status, 401, method);
    assert.match(res.headers.get("www-authenticate") ?? "", /^Basic realm=/);
  }
  const api = await call("/api/workshop", { env, password: PASSWORD });
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { repairs: [], parts: [] });
});

test("image endpoint is gated too", async () => {
  const res = await call("/_vinext/image?url=%2Fog.png&w=640&q=75", { env: { DB: createD1() } });
  assert.equal(res.status, 401);
});

test("fails closed when no password is configured, except on localhost", async () => {
  assert.equal((await call("/", { env: { APP_PASSWORD: undefined } })).status, 503);
  assert.equal((await call("/api/workshop", { env: { APP_PASSWORD: undefined } })).status, 503);

  const local = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: assets },
    ctx,
  );
  assert.equal(local.status, 200);
});

test("locks an IP out after 5 wrong passwords, even for the right one", async () => {
  const env = { DB: createD1() };
  for (let i = 0; i < 5; i++) {
    assert.equal((await call("/api/workshop", { env, password: `guess-${i}`, ip: "203.0.113.7" })).status, 401);
  }

  const locked = await call("/api/workshop", { env, password: PASSWORD, ip: "203.0.113.7" });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  assert.equal(locked.headers.get("www-authenticate"), null);

  // Other visitors are unaffected.
  assert.equal((await call("/api/workshop", { env, password: PASSWORD, ip: "203.0.113.8" })).status, 200);
});

test("the lock expires and a correct password then resets the counter", async () => {
  const db = createD1();
  const env = { DB: db };
  for (let i = 0; i < 5; i++) await call("/", { env, password: "nope", ip: "198.51.100.1" });
  assert.equal((await call("/", { env, password: PASSWORD, ip: "198.51.100.1" })).status, 429);

  db.sqlite.exec(`UPDATE auth_failures SET window_start = window_start - ${16 * 60_000}`);
  assert.equal((await call("/", { env, password: PASSWORD, ip: "198.51.100.1" })).status, 200);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM auth_failures").get().n, 0);
});

test("a successful login clears earlier typos", async () => {
  const env = { DB: createD1() };
  const ip = "192.0.2.50";
  for (let i = 0; i < 3; i++) await call("/", { env, password: "typo", ip });
  assert.equal((await call("/", { env, password: PASSWORD, ip })).status, 200);

  // 3 + 4 would lock without the reset; 4 on its own must not.
  for (let i = 0; i < 4; i++) assert.equal((await call("/", { env, password: "typo", ip })).status, 401);
  assert.equal((await call("/", { env, password: PASSWORD, ip })).status, 200);
});

test("requests without credentials never touch the throttle table", async () => {
  const db = createD1();
  for (let i = 0; i < 10; i++) assert.equal((await call("/", { env: { DB: db }, ip: "192.0.2.99" })).status, 401);
  assert.equal(db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'auth_failures'").get(), undefined);
});

test("a hanging database delays a request by at most the throttle cap", async () => {
  const never = new Promise(() => {});
  const stuck = { prepare: () => ({ bind: () => ({ first: () => never, run: () => never }), run: () => never }), batch: () => never };
  const env = { DB: stuck };
  const log = console.error;
  console.error = () => {};
  try {
    for (const [password, status] of [["wrong", 401], [PASSWORD, 200]]) {
      const started = Date.now();
      assert.equal((await call("/", { env, password, ip: "192.0.2.2" })).status, status);
      assert.ok(Date.now() - started < 5_000, "request must not wait on a stuck database");
    }
  } finally {
    console.error = log;
  }
});

test("a broken database never changes the password verdict", async () => {
  const broken = {
    prepare() {
      throw new Error("D1 is down");
    },
    batch() {
      throw new Error("D1 is down");
    },
  };
  const env = { DB: broken };
  const log = console.error;
  console.error = () => {};
  try {
    assert.equal((await call("/", { env, password: "wrong", ip: "192.0.2.1" })).status, 401);
    assert.equal((await call("/", { env, password: PASSWORD, ip: "192.0.2.1" })).status, 200);
  } finally {
    console.error = log;
  }
});
