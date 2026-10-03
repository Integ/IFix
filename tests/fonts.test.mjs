import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("self-hosted font URLs point at files in the client build", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `fonts-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);

  // Fonts are referenced from the inlined @font-face CSS and the preload Link header.
  const referenced = `${await response.text()}\n${response.headers.get("link") ?? ""}`;
  const fontUrls = [...new Set(referenced.match(/\/[^\s"'()<>,;]+\.woff2/g) ?? [])];
  assert.ok(fontUrls.length > 0, "expected the page to reference self-hosted .woff2 fonts");

  // The browser requests these paths from the site origin, so each one must be
  // a file the deploy actually serves. A path copied from another machine
  // (e.g. /workspace/.../.vinext/fonts/...) 404s in production.
  const missing = fontUrls.filter((url) => !existsSync(new URL(`../dist/client${url}`, import.meta.url)));
  assert.deepEqual(missing, [], "font URLs with no matching file in dist/client");
});
