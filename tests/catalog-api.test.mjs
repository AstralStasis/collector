import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { gunzipSync } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/application.mjs";
import { readDatabaseConfig } from "../server/database-config.mjs";

const catalog = JSON.parse(await readFile(new URL("../catalog.json", import.meta.url), "utf8"));
const copy = value => JSON.parse(JSON.stringify(value));
const sorted = values => [...values].sort();

// node:http leaves wire bytes untouched, unlike fetch automatic decompression.
function request(origin, pathname, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(new URL(pathname, origin), {
      method, agent: false,
      headers: { Accept: "application/json", ...(payload === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }), ...headers },
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        try {
          const bytes = Buffer.concat(chunks);
          const decoded = res.headers["content-encoding"] === "gzip" ? gunzipSync(bytes) : bytes;
          resolve({ status: res.statusCode, headers: res.headers, bytes, body: JSON.parse(decoded.toString("utf8")) });
        } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Catalog HTTP request timed out.")));
    req.end(payload);
  });
}

async function fixture(t, kind) {
  assert.ok(catalog.items.length >= 3);
  const root = await mkdtemp(path.join(tmpdir(), "eorzea-catalog-http-"));
  const users = new Set();
  let app, origin, cookie = "", csrf = "";
  t.after(async () => {
    try {
      if (app) {
        try {
          // MYSQL_TEST_URL is test-only opt-in; delete only users made here.
          for (const id of users) {
            if (kind === "mysql") await app.store.pool.execute("DELETE FROM users WHERE id = ?", [id]);
            else app.store.db.prepare("DELETE FROM users WHERE id = ?").run(id);
          }
        } finally { await app.close(); }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  const databaseConfig = kind === "sqlite"
    ? { client: "sqlite", filename: path.join(root, "archive.sqlite") }
    : readDatabaseConfig({ root, env: { DATABASE_CLIENT: "mysql", MYSQL_URL: process.env.MYSQL_TEST_URL } });
  if (kind === "mysql") assert.match(databaseConfig.connection.database, /(?:^|[_-])test(?:[_-]|$)/i, "MYSQL_TEST_URL must name a dedicated test database.");
  await writeFile(path.join(root, "catalog.json"), JSON.stringify({ meta: catalog.meta, items: catalog.items.slice(0, 3) }));
  async function open() {
    app = await createApplication({ root, databaseConfig, logger: { error() {} } });
    const address = await app.listen(0, "127.0.0.1");
    origin = "http://127.0.0.1:" + address.port;
  }
  await open();
  return {
    get app() { return app; },
    async expand() {
      await writeFile(path.join(root, "catalog.json"), JSON.stringify(catalog));
      await app.store.seedCatalog(catalog);
    },
    async restart() {
      const previous = app;
      app = undefined;
      await previous.close();
      await open();
    },
    async request(pathname, { acceptEncoding, ...options } = {}) {
      const result = await request(origin, pathname, {
        ...options,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...(acceptEncoding === undefined ? {} : { "Accept-Encoding": acceptEncoding }), ...options.headers },
      });
      if (result.headers["set-cookie"]) cookie = result.headers["set-cookie"][0].split(";", 1)[0];
      if (result.body.csrfToken) csrf = result.body.csrfToken;
      if (result.body.user?.id) users.add(result.body.user.id);
      return result;
    },
  };
}

function expectOk(response, status = 200) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.headers["cache-control"], "no-store");
  return response.body;
}

for (const kind of ["sqlite", "mysql"]) {
  test(kind + " catalog HTTP transport and complete archive regression", { skip: kind === "mysql" && !process.env.MYSQL_TEST_URL, timeout: 240000 }, async t => {
    const f = await fixture(t, kind);
    const oldKeys = catalog.items.slice(0, 3).map(item => item.key);
    let current, accountId;

    await t.test("old owned, wishlist and plan survive catalog expansion and idempotent seed", async () => {
      const session = await f.request("/api/session", { acceptEncoding: "gzip" });
      current = expectOk(session);
      accountId = current.user.id;
      assert.equal(session.headers["content-encoding"], undefined);
      assert.ok(current.csrfToken);
      const archive = { ...copy(current.archive), owned: [oldKeys[0]], wishlist: [oldKeys[1]], plan: [oldKeys[2], oldKeys[0]] };
      const saved = await f.request("/api/archive", { method: "PUT", acceptEncoding: "gzip", body: { archive, revision: current.revision } });
      current = expectOk(saved);
      assert.equal(saved.headers["content-encoding"], undefined);
      const registered = await f.request("/api/auth/register", { method: "POST", acceptEncoding: "gzip", body: { username: "catalog_" + randomUUID().replaceAll("-", "").slice(0, 20), password: "catalog-http-test-2026" } });
      assert.equal(registered.headers["content-encoding"], undefined);
      assert.deepEqual(expectOk(registered, 201).archive, current.archive);
      const before = copy(current);
      await f.expand();
      assert.deepEqual(expectOk(await f.request("/api/archive", { acceptEncoding: "gzip" })), before);
      for (let i = 0; i < 2; i++) assert.equal(await f.app.store.seedCatalog(catalog), false);
      assert.deepEqual(expectOk(await f.request("/api/archive")), before);
      assert.deepEqual(sorted(f.app.store.catalog.items.map(item => item.key)), sorted(catalog.items.map(item => item.key)));
    });

    await t.test("full public catalog preserves nested raw fields, count, keys and detail", async () => {
      const stored = f.app.store.catalog;
      const enriched = copy(stored);
      // Exercise unknown raw API fields even before the enriched catalog is installed.
      const first = enriched.items[0];
      first.collect = { ...first.collect, data: { ...first.collect?.data, transportFixture: { item_id: null, tradeable: false, owned: 0, empty: [], sources: [{ type: "Achievement", related_id: 2227, nested: [null, { name: "完整原始字段", flags: [false, 0, ""] }] }] } } };
      f.app.store.catalog = enriched;
      try {
        const expected = { meta: enriched.meta, items: enriched.items, count: enriched.items.length };
        const plain = await f.request("/api/catalog");
        assert.deepEqual(expectOk(plain), expected);
        assert.deepEqual(Object.keys(plain.body).sort(), ["count", "items", "meta"]);
        assert.equal(plain.body.count, catalog.items.length);
        assert.equal(new Set(plain.body.items.map(item => item.key)).size, plain.body.count);
        assert.deepEqual(plain.body.items.map(item => item.key), catalog.items.map(item => item.key));
        assert.equal(plain.headers["content-encoding"], undefined);
        assert.equal(plain.headers.vary, "Accept-Encoding");
        assert.equal(plain.headers["set-cookie"], undefined);
        assert.ok(plain.headers["content-type"].startsWith("application/json"));
        for (const [acceptEncoding, compressed] of [
          ["gzip", true], ["deflate, GZip;Q=1", true], ["gzip ; Q = 0.8", true], ["br;q=1, gzip;q=0.125", true],
          ["", false], ["br", false], ["*", false], ["gzip;q=0", false], ["GZIP;Q=0.000, br;q=1", false],
          ["*;q=1, gzip;Q=0", false], ["gzip;q=invalid", false], ["gzip;q=1.1", false], ["gzip;q", false], ["gzip;q=0, gzip;q=1", false],
        ]) {
          const response = await f.request("/api/catalog", { acceptEncoding });
          assert.equal(response.headers["content-encoding"], compressed ? "gzip" : undefined, acceptEncoding);
          assert.equal(response.headers.vary, "Accept-Encoding");
          assert.deepEqual(expectOk(response), expected, acceptEncoding);
          if (compressed) {
            assert.deepEqual([...response.bytes.subarray(0, 2)], [0x1f, 0x8b]);
            assert.ok(response.bytes.length < plain.bytes.length);
            assert.deepEqual(gunzipSync(response.bytes), plain.bytes);
          } else assert.deepEqual(response.bytes, plain.bytes);
        }
        for (const item of [first, enriched.items.at(-1)]) {
          const detail = await f.request("/api/catalog/" + item.key, { acceptEncoding: "gzip" });
          assert.deepEqual(expectOk(detail), item);
          assert.equal(detail.headers["content-encoding"], undefined);
        }
        for (const category of [...new Set(enriched.items.map(item => item.category))].slice(0, 2).concat("does-not-exist")) {
          const filtered = await f.request("/api/catalog?category=" + encodeURIComponent(category), { acceptEncoding: "gzip" });
          const items = enriched.items.filter(item => item.category === category);
          assert.deepEqual(expectOk(filtered), { meta: enriched.meta, items, count: items.length });
          assert.equal(filtered.headers["content-encoding"], "gzip");
          assert.equal(filtered.headers.vary, "Accept-Encoding");
        }
        const missing = await f.request("/api/catalog?q=transport-no-such-item-" + randomUUID(), { acceptEncoding: "gzip" });
        assert.deepEqual(expectOk(missing), { meta: enriched.meta, items: [], count: 0 });
        assert.deepEqual(expectOk(await f.request("/api/catalog")), expected);
        const updated = copy(enriched);
        updated.meta.transportRevision = 2;
        updated.items[0].collect.data.transportFixture.sources[0].related_id = 999;
        f.app.store.catalog = updated;
        for (const acceptEncoding of [undefined, "gzip"]) {
          const response = await f.request("/api/catalog", { acceptEncoding });
          assert.deepEqual(expectOk(response), { meta: updated.meta, items: updated.items, count: updated.items.length });
        }
        const wrongMethod = await f.request("/api/catalog", { method: "POST", acceptEncoding: "gzip", body: {} });
        assert.equal(wrongMethod.status, 404);
        assert.equal(wrongMethod.headers["content-encoding"], undefined);
      } finally { f.app.store.catalog = stored; }
      assert.deepEqual(expectOk(await f.request("/api/catalog", { acceptEncoding: "gzip" })), { ...stored, count: stored.items.length });
    });

    await t.test("all keys round-trip in each collection list and persist after database reopen", async () => {
      const keys = catalog.items.map(item => item.key);
      const plan = [...keys].reverse();
      for (const field of ["owned", "wishlist", "plan"]) {
        const archive = { ...copy(current.archive), owned: [], wishlist: [], plan: [], [field]: field === "plan" ? plan : keys };
        const saved = await f.request("/api/archive", { method: "PUT", acceptEncoding: "gzip", body: { archive, revision: current.revision } });
        current = expectOk(saved);
        assert.equal(saved.headers["content-encoding"], undefined);
        assert.deepEqual(field === "plan" ? current.archive[field] : sorted(current.archive[field]), field === "plan" ? plan : sorted(keys));
        assert.deepEqual(expectOk(await f.request("/api/archive", { acceptEncoding: "gzip" })), current);
      }
      const archive = { ...copy(current.archive), owned: keys.filter((_, i) => i % 3 === 0), wishlist: keys.filter((_, i) => i % 3 === 1), plan };
      current = expectOk(await f.request("/api/archive", { method: "PUT", body: { archive, revision: current.revision } }));
      assert.deepEqual(sorted(current.archive.owned), sorted(archive.owned));
      assert.deepEqual(sorted(current.archive.wishlist), sorted(archive.wishlist));
      assert.deepEqual(current.archive.plan, plan);
      const before = copy(current);
      assert.equal(await f.app.store.seedCatalog(catalog), false);
      assert.deepEqual(expectOk(await f.request("/api/archive")), before);
      await f.restart();
      const restored = await f.request("/api/archive", { acceptEncoding: "gzip" });
      assert.deepEqual(expectOk(restored), before);
      assert.equal(restored.headers["content-encoding"], undefined);
      const session = await f.request("/api/session", { acceptEncoding: "gzip" });
      assert.equal(expectOk(session).user.id, accountId);
      assert.equal(session.body.user.isGuest, false);
      assert.deepEqual(session.body.archive, before.archive);
      assert.equal(session.headers["content-encoding"], undefined);
      assert.deepEqual(expectOk(await f.request("/api/catalog", { acceptEncoding: "gzip" })).items, f.app.store.catalog.items);
    });
  });
}
