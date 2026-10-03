import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./d1-stub.mjs";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `inventory-${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const HOST = "https://integ.example.workers.dev";
const PASSWORD = "inventory-test-pw";
const ctx = { waitUntil() {}, passThroughOnException() {} };

function api(env, path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Basic ${Buffer.from(`u:${PASSWORD}`).toString("base64")}`;
  const init = { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) };
  return worker.fetch(new Request(`${HOST}/api/inventory${path}`, init), { ASSETS: { fetch: async () => new Response("nf", { status: 404 }) }, APP_PASSWORD: PASSWORD, ...env }, ctx);
}

const list = async (env) => (await (await api(env, "")).json()).items;
const fresh = () => ({ DB: createD1() });

test("inventory needs the password for every method", async () => {
  const env = fresh();
  for (const [method, path, body] of [["GET", ""], ["POST", "", {}], ["PATCH", "", {}], ["DELETE", "?id=1"]]) {
    assert.equal((await api(env, path, { method, body, auth: false })).status, 401, method);
  }
});

test("add, list, adjust, edit and delete stock", async () => {
  const env = fresh();
  assert.deepEqual(await list(env), []);

  const part = await api(env, "", { method: "POST", body: { kind: "part", name: "iPhone 13 电池", category: "电池", quantity: "5", unitCost: "18.5", location: "A1" } });
  assert.equal(part.status, 201);
  const partId = (await part.json()).id;
  const badDevice = await api(env, "", { method: "POST", body: { kind: "device", name: "ThinkPad T14", condition: "broken", quantity: 2 } });
  const goodDevice = await api(env, "", { method: "POST", body: { kind: "device", name: "ThinkPad T14", condition: "good", quantity: 1 } });
  assert.equal(badDevice.status, 201);
  assert.equal(goodDevice.status, 201);

  let items = await list(env);
  assert.equal(items.length, 3);
  const stored = items.find((item) => item.id === partId);
  assert.deepEqual({ kind: stored.kind, condition: stored.condition, quantity: stored.quantity, unitCost: stored.unitCost }, { kind: "part", condition: "good", quantity: 5, unitCost: 18.5 });
  assert.deepEqual(items.filter((item) => item.name === "ThinkPad T14").map((item) => item.condition).sort(), ["broken", "good"]);

  assert.equal((await api(env, "", { method: "PATCH", body: { id: partId, delta: -2 } })).status, 200);
  assert.equal((await api(env, "", { method: "PATCH", body: { id: partId, delta: 10 } })).status, 200);
  assert.equal((await list(env)).find((item) => item.id === partId).quantity, 13);

  assert.equal((await api(env, "", { method: "PATCH", body: { id: partId, name: "iPhone 13 原装电池", location: "B2" } })).status, 200);
  const edited = (await list(env)).find((item) => item.id === partId);
  assert.deepEqual({ name: edited.name, location: edited.location, quantity: edited.quantity, kind: edited.kind }, { name: "iPhone 13 原装电池", location: "B2", quantity: 13, kind: "part" });

  assert.equal((await api(env, `?id=${partId}`, { method: "DELETE" })).status, 200);
  items = await list(env);
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.id !== partId));
});

test("spare parts can only be good: broken parts are rejected", async () => {
  const env = fresh();
  const rejected = await api(env, "", { method: "POST", body: { kind: "part", name: "坏屏幕", condition: "broken", quantity: 1 } });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /损坏/);

  const id = (await (await api(env, "", { method: "POST", body: { kind: "part", name: "好屏幕", quantity: 1 } })).json()).id;
  assert.equal((await api(env, "", { method: "PATCH", body: { id, condition: "broken" } })).status, 400);
  assert.equal((await list(env))[0].condition, "good");
});

test("a device's condition can be changed, and is validated", async () => {
  const env = fresh();
  const id = (await (await api(env, "", { method: "POST", body: { kind: "device", name: "iPad Air", quantity: 1 } })).json()).id;
  assert.equal((await list(env))[0].condition, "good");
  assert.equal((await api(env, "", { method: "PATCH", body: { id, condition: "broken" } })).status, 200);
  assert.equal((await list(env))[0].condition, "broken");
  assert.equal((await api(env, "", { method: "PATCH", body: { id, condition: "meh" } })).status, 400);
});

test("quantity can never go negative, even with rapid adjustments", async () => {
  const env = fresh();
  const id = (await (await api(env, "", { method: "POST", body: { kind: "part", name: "排线", quantity: 1 } })).json()).id;
  const results = await Promise.all([1, 2, 3].map(() => api(env, "", { method: "PATCH", body: { id, delta: -1 } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400]);
  assert.equal((await list(env))[0].quantity, 0);
});

test("bad input is a 400, missing rows are a 404", async () => {
  const env = fresh();
  const bad = [
    { kind: "part", name: "", quantity: 1 },
    { kind: "part", name: "x", quantity: -1 },
    { kind: "part", name: "x", quantity: 1.5 },
    { kind: "part", name: "x", quantity: "abc" },
    { kind: "part", name: "x", quantity: 1, unitCost: -3 },
    { kind: "phone", name: "x", quantity: 1 },
    { name: "no kind", quantity: 1 },
    { kind: "part", name: "x".repeat(101), quantity: 1 },
  ];
  for (const body of bad) assert.equal((await api(env, "", { method: "POST", body })).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal((await api(env, "", { method: "POST", body: "{not json" })).status, 400);
  assert.equal((await api(env, "", { method: "POST", body: "[]" })).status, 400);
  assert.equal((await api(env, "", { method: "DELETE" })).status, 400);
  assert.equal((await list(env)).length, 0);

  assert.equal((await api(env, "", { method: "PATCH", body: { id: 999, delta: 1 } })).status, 404);
  assert.equal((await api(env, "", { method: "PATCH", body: { id: 999, name: "x" } })).status, 404);
  assert.equal((await api(env, "?id=999", { method: "DELETE" })).status, 404);
  assert.equal((await api(env, "", { method: "PUT", body: {} })).status, 405);
});
