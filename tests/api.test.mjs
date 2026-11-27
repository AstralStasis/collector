import test from "./support/test.mjs";
import { strict as assert } from "assert";
import { randomUUID, hasOwn } from "../server/runtime.mjs";
import fetch, { timeoutSignal } from "../scripts/http.mjs";
import { fileURLToPath } from "node:url";
import { createApplication } from "../server/application.mjs";
import { readDatabaseConfig } from "../server/database-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const copy = (value) => JSON.parse(JSON.stringify(value));
const sorted = (values) => [...values].sort();
const uniqueUsername = () => "http_" + randomUUID().split("-").join("").slice(0, 24);

async function fixture(t, kind) {
  const options = { root, authLimit: 100, logger: { error() {} } };
  if (kind === "sqlite") options.databasePath = ":memory:";
  else options.databaseConfig = readDatabaseConfig({ root, env: { DATABASE_CLIENT: "mysql", MYSQL_URL: process.env.MYSQL_TEST_URL } });
  const app = await createApplication(options);
  const users = new Set();
  t.after(async () => {
    try {
      // Only delete users returned to these test clients; never drop a database.
      for (const id of users) {
        if (kind === "mysql") await app.store.pool.execute("DELETE FROM users WHERE id = ?", [id]);
        else app.store.db.prepare("DELETE FROM users WHERE id = ?").run(id);
      }
    } finally { await app.close(); }
  });
  const address = await app.listen(0, "127.0.0.1");
  const origin = "http://127.0.0.1:" + address.port;
  function client() {
    let cookie = "", csrf = "";
    return {
      get cookie() { return cookie; },
      get csrf() { return csrf; },
      async request(path, { method = "GET", body, csrfToken = csrf, requestOrigin, cookieOverride, contentType = "application/json" } = {}) {
        const headers = { Accept: "application/json" };
        const sessionCookie = cookieOverride === undefined ? cookie : cookieOverride;
        if (sessionCookie) headers.Cookie = sessionCookie;
        if (body !== undefined) headers["Content-Type"] = contentType;
        if (method !== "GET" && csrfToken !== null) headers["X-CSRF-Token"] = csrfToken;
        if (requestOrigin !== undefined) headers.Origin = requestOrigin;
        const response = await fetch(origin + path, { method, headers, signal: timeoutSignal(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const payload = await response.json();
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";", 1)[0];
        if (payload.csrfToken) csrf = payload.csrfToken;
        if (payload.user && payload.user.id) users.add(payload.user.id);
        return { status: response.status, body: payload, headers: response.headers };
      },
    };
  }
  return { app, client, origin };
}

function expectStatus(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  if (code) assert.equal((response.body.error && response.body.error.code), code);
  return response.body;
}

for (const kind of ["sqlite", "mysql"]) {
  test(kind + " real HTTP integration", { skip: kind === "mysql" && !process.env.MYSQL_TEST_URL, timeout: 120000 }, async (t) => {
    const { app, client, origin } = await fixture(t, kind);
    const browser = client();
    const keys = app.store.catalog.items.slice(0, 5).map((item) => item.key);
    const username = uniqueUsername();
    const password = "http-test-password-2026";
    let current;
    let accountId;
    let accountArchive;

    await t.test("health, catalog and missing-session errors", async () => {
      const health = await browser.request("/api/health");
      assert.deepEqual(expectStatus(health, 200), { ok: true, database: kind, schemaVersion: 1 });
      assert.equal(health.headers.get("cache-control"), "no-store");
      assert.ok(health.headers.get("x-request-id"));
      const catalog = expectStatus(await browser.request("/api/catalog"), 200);
      assert.ok(catalog.items.length >= 5);
      assert.equal(catalog.count, catalog.items.length);
      assert.equal(expectStatus(await browser.request("/api/catalog/" + keys[0]), 200).key, keys[0]);
      expectStatus(await browser.request("/api/archive"), 401, "session_required");
      expectStatus(await browser.request("/api/catalog/mounts-999999999"), 404, "item_not_found");
    });

    await t.test("first visit creates a reusable guest session", async () => {
      const result = await browser.request("/api/session");
      current = expectStatus(result, 200);
      accountId = current.user.id;
      assert.equal(current.user.isGuest, true);
      assert.equal(current.revision, 0);
      assert.deepEqual(current.archive.owned, []);
      assert.equal(current.archive.profile.demo, false);
      const cookie = result.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Max-Age=2592000/i);
      assert.ok(browser.csrf);
      const again = expectStatus(await browser.request("/api/session"), 200);
      assert.equal(again.user.id, accountId);
      assert.equal(again.csrfToken, current.csrfToken);
      assert.deepEqual(expectStatus(await browser.request("/api/archive"), 200).archive, current.archive);
    });

    await t.test("full archive and each partial-save route persist normalized data", async () => {
      const archive = copy(current.archive);
      archive.profile.name = "HTTP 测试";
      archive.owned = [keys[0]];
      archive.wishlist = [keys[0], keys[1], keys[1]];
      archive.plan = [keys[2], keys[0]];
      current = expectStatus(await browser.request("/api/archive", { method: "PUT", body: { archive, revision: current.revision } }), 200);
      assert.equal(current.revision, 1);
      assert.equal(typeof current.updatedAt, "number");
      assert.equal(current.archive.lastUpdated, current.updatedAt);
      assert.deepEqual(current.archive.wishlist, [keys[1]]);
      current = expectStatus(await browser.request("/api/profile", { method: "PATCH", body: { profile: { name: "改名测试", server: "测试世界" }, revision: current.revision } }), 200);
      assert.equal(current.archive.profile.name, "改名测试");
      assert.equal(current.archive.profile.server, "测试世界");
      current = expectStatus(await browser.request("/api/preferences", { method: "PATCH", body: { preferences: { style: "solo", budget: "90", excludePaid: false }, revision: current.revision } }), 200);
      assert.equal(current.archive.preferences.style, "solo");
      assert.equal(current.archive.preferences.budget, "90");
      assert.equal(current.archive.preferences.excludePaid, false);
      current = expectStatus(await browser.request("/api/wishlist", { method: "PUT", body: { keys: [keys[0], keys[1], keys[1]], revision: current.revision } }), 200);
      assert.deepEqual(current.archive.wishlist, [keys[1]]);
      current = expectStatus(await browser.request("/api/plan", { method: "PUT", body: { keys: [keys[2], keys[1], keys[2]], revision: current.revision } }), 200);
      assert.deepEqual(current.archive.plan, [keys[2], keys[1]]);
      current = expectStatus(await browser.request("/api/collection/" + keys[1], { method: "PATCH", body: { owned: true, planned: false, revision: current.revision } }), 200);
      assert.deepEqual(sorted(current.archive.owned), sorted([keys[0], keys[1]]));
      assert.deepEqual(current.archive.wishlist, []);
      assert.deepEqual(current.archive.plan, [keys[2]]);
      assert.equal(current.revision, 6);
      assert.deepEqual(expectStatus(await browser.request("/api/archive"), 200), current);
    });

    await t.test("stale and concurrent writes return complete 409 snapshots", async () => {
      const stale = expectStatus(await browser.request("/api/archive", { method: "PUT", body: { archive: current.archive, revision: current.revision - 1 } }), 409, "revision_conflict");
      assert.deepEqual(stale.current, current);
      const candidates = ["HTTP 并发甲", "HTTP 并发乙"].map((name) => ({ ...copy(current.archive), profile: { ...current.archive.profile, name } }));
      const results = await Promise.all(candidates.map((archive) => browser.request("/api/archive", { method: "PUT", body: { archive, revision: current.revision } })));
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      const winner = results.find((result) => result.status === 200).body;
      const loser = results.find((result) => result.status === 409).body;
      assert.equal(loser.error.code, "revision_conflict");
      assert.equal(winner.revision, current.revision + 1);
      assert.deepEqual(loser.current, winner);
      current = expectStatus(await browser.request("/api/archive"), 200);
      assert.deepEqual(current, winner);
    });

    await t.test("CSRF, origin, invalid content and SQL-injection usernames are rejected", async () => {
      const update = { profile: { name: "不应写入" }, revision: current.revision };
      expectStatus(await browser.request("/api/profile", { method: "PATCH", body: update, csrfToken: null }), 403, "csrf_rejected");
      expectStatus(await browser.request("/api/profile", { method: "PATCH", body: update, csrfToken: "wrong-csrf" }), 403, "csrf_rejected");
      expectStatus(await browser.request("/api/profile", { method: "PATCH", body: update, requestOrigin: "https://attacker.invalid" }), 403, "origin_rejected");
      expectStatus(await browser.request("/api/profile", { method: "PATCH", body: update, requestOrigin: origin, contentType: "text/plain" }), 415, "json_required");
      for (const mode of ["register", "login"]) {
        expectStatus(await browser.request("/api/auth/" + mode, { method: "POST", body: { username: "x' OR 1=1 --", password } }), 400, "validation_error");
      }
      expectStatus(await browser.request("/api/collection/" + keys[0], { method: "PATCH", body: { owned: "true", revision: current.revision } }), 400, "validation_error");
      assert.deepEqual(expectStatus(await browser.request("/api/archive"), 200), current);
      assert.equal(expectStatus(await browser.request("/api/health"), 200).ok, true);
    });

    await t.test("registration preserves guest data and rotates cookie and CSRF", async () => {
      const previousCookie = browser.cookie, previousCsrf = browser.csrf;
      const registered = expectStatus(await browser.request("/api/auth/register", { method: "POST", body: { username, password } }), 201);
      assert.equal(registered.user.id, accountId);
      assert.equal(registered.user.username, username);
      assert.equal(registered.user.isGuest, false);
      assert.equal(hasOwn(registered.user, "password_hash"), false);
      assert.deepEqual(registered.archive, current.archive);
      assert.equal(registered.revision, current.revision);
      assert.notEqual(browser.cookie, previousCookie);
      assert.notEqual(browser.csrf, previousCsrf);
      expectStatus(await browser.request("/api/archive", { cookieOverride: previousCookie }), 401, "session_required");
      current = registered;
      accountArchive = copy(registered.archive);
      const duplicate = client();
      expectStatus(await duplicate.request("/api/session"), 200);
      expectStatus(await duplicate.request("/api/auth/register", { method: "POST", body: { username: username.toUpperCase(), password } }), 409, "username_taken");
      expectStatus(await duplicate.request("/api/auth/login", { method: "POST", body: { username, password: "incorrect-password" } }), 401, "invalid_credentials");
    });

    await t.test("logout creates a new guest; login merges only non-demo collections", async () => {
      const accountCookie = browser.cookie;
      const fresh = expectStatus(await browser.request("/api/auth/logout", { method: "POST", body: {} }), 200);
      assert.equal(fresh.user.isGuest, true);
      assert.notEqual(fresh.user.id, accountId);
      assert.equal(fresh.revision, 0);
      assert.deepEqual(fresh.archive.owned, []);
      expectStatus(await browser.request("/api/archive", { cookieOverride: accountCookie }), 401, "session_required");
      assert.deepEqual((await app.store.getArchive(accountId)).archive, accountArchive);
      const guestArchive = copy(fresh.archive);
      guestArchive.profile.name = "访客名字不应覆盖账号";
      guestArchive.owned = [keys[2]];
      guestArchive.wishlist = [keys[3]];
      guestArchive.plan = [keys[3], keys[0]];
      expectStatus(await browser.request("/api/archive", { method: "PUT", body: { archive: guestArchive, revision: fresh.revision } }), 200);
      const guestCookie = browser.cookie;
      current = expectStatus(await browser.request("/api/auth/login", { method: "POST", body: { username: username.toUpperCase(), password, mergeGuest: true } }), 200);
      assert.equal(current.user.id, accountId);
      assert.equal(current.user.isGuest, false);
      assert.deepEqual(sorted(current.archive.owned), sorted([...new Set([...accountArchive.owned, keys[2]])]));
      assert.deepEqual(current.archive.wishlist, [keys[3]]);
      assert.deepEqual(current.archive.plan, [...new Set([...accountArchive.plan, keys[3], keys[0]])]);
      assert.deepEqual(current.archive.profile, accountArchive.profile);
      assert.deepEqual(current.archive.preferences, accountArchive.preferences);
      expectStatus(await browser.request("/api/archive", { cookieOverride: guestCookie }), 401, "session_required");
      const revisionBeforeDemo = current.revision;
      const savedBeforeDemo = copy(current.archive);
      const demoGuest = expectStatus(await browser.request("/api/auth/logout", { method: "POST", body: {} }), 200);
      const demo = copy(demoGuest.archive);
      demo.profile.demo = true;
      demo.owned = [keys[4]];
      expectStatus(await browser.request("/api/archive", { method: "PUT", body: { archive: demo, revision: demoGuest.revision } }), 200);
      const loggedIn = expectStatus(await browser.request("/api/auth/login", { method: "POST", body: { username, password, mergeGuest: true } }), 200);
      assert.equal(loggedIn.user.id, accountId);
      assert.equal(loggedIn.revision, revisionBeforeDemo);
      assert.deepEqual(loggedIn.archive, savedBeforeDemo);
      assert.equal(loggedIn.archive.owned.includes(keys[4]), false);
    });
  });
}
