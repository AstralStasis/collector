import test from "./support/test.mjs";
import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { randomUUID } from "../server/runtime.mjs";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/store.mjs";
import { readDatabaseConfig } from "../server/database-config.mjs";
import { hashPassword, verifyPassword } from "../server/auth.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(readFileSync(new URL("../catalog.json", import.meta.url), "utf8"));
const backends = ["sqlite", "mysql"];
const username = () => "test_" + randomUUID().split("-").join("").slice(0, 24);
const sorted = (values) => [...values].sort();
const copy = (value) => JSON.parse(JSON.stringify(value));

// MYSQL_TEST_URL is explicit opt-in; its database must already exist.
// Never drop/truncate tables: remove only UUIDs created by this test.
async function fixture(t, kind) {
  const env = kind === "sqlite"
    ? { DATABASE_CLIENT: "sqlite", DATABASE_PATH: ":memory:" }
    : { DATABASE_CLIENT: "mysql", MYSQL_URL: process.env.MYSQL_TEST_URL };
  const store = await createStore(readDatabaseConfig({ root, env }));
  const users = new Set();
  t.after(async () => {
    try {
      for (const id of users) {
        if (kind === "mysql") await store.pool.execute("DELETE FROM users WHERE id = ?", [id]);
        else store.db.prepare("DELETE FROM users WHERE id = ?").run(id);
      }
    } finally { await store.close(); }
  });
  await store.seedCatalog(catalog);
  return { store, async guest() { const id = await store.createGuest(); users.add(id); return id; } };
}

for (const kind of backends) {
  test(kind + " store contract", { skip: kind === "mysql" && !process.env.MYSQL_TEST_URL, timeout: 120000 }, async (t) => {
    const { store, guest } = await fixture(t, kind);
    const keys = catalog.items.slice(0, 4).map((item) => item.key);
    const password = "test-password-2026";
    const passwordHash = await hashPassword(password);

    await t.test("backend health and stable catalog seed", async () => {
      assert.equal(store.kind, kind);
      await store.health();
      assert.ok(store.catalog.items.length >= catalog.items.length);
      for (const key of keys) assert.equal(store.keys.has(key), true);
      const order = store.catalog.items.map((item) => item.key);
      await store.seedCatalog(catalog);
      assert.deepEqual(store.catalog.items.map((item) => item.key), order);
    });

    await t.test("guest registration preserves archive and hides credentials", async () => {
      const id = await guest();
      assert.deepEqual(await store.publicUser(id), { id, username: null, isGuest: true });
      const initial = await store.getArchive(id);
      assert.equal(initial.revision, 0);
      assert.equal(initial.archive.version, 1);
      assert.equal(initial.archive.profile.demo, false);
      assert.deepEqual(initial.archive.owned, []);
      const archive = copy(initial.archive);
      archive.profile.name = "数据库测试";
      archive.owned = [keys[0]];
      const saved = await store.saveArchive(id, archive, 0);
      const name = username();
      await store.register(id, name, passwordHash);
      assert.deepEqual(await store.publicUser(id), { id, username: name, isGuest: false });
      assert.deepEqual(await store.getArchive(id), saved);
      const user = await store.findUser(name.toUpperCase());
      assert.equal(user.id, id);
      assert.notEqual(user.password_hash, password);
      assert.equal(await verifyPassword(password, user.password_hash), true);
      assert.equal(await verifyPassword("wrong-password", user.password_hash), false);
    });

    await t.test("session issue, lookup, expiry and deletion", async () => {
      const id = await guest();
      const session = await store.createSession(id);
      assert.equal(typeof session.token, "string");
      assert.equal(typeof session.csrfToken, "string");
      assert.notEqual(session.token, session.csrfToken);
      const loaded = await store.getSession(session.token);
      assert.equal(loaded.userId, id);
      assert.equal(loaded.csrfToken, session.csrfToken);
      assert.equal(typeof loaded.expiresAt, "number");
      assert.ok(loaded.expiresAt > Date.now());
      assert.equal(await store.getSession(undefined), null);
      assert.equal(await store.getSession("x".repeat(101)), null);
      assert.equal(await store.getSession("not-a-session"), null);
      await store.deleteSession(session.token);
      assert.equal(await store.getSession(session.token), null);
      const expired = await store.createSession(id, -1);
      assert.equal(await store.getSession(expired.token), null);
    });

    await t.test("session rotation commits atomically and preserves old session on failure", async () => {
      const id = await guest();
      const original = await store.createSession(id);
      const rotated = await store.rotateSession(id, original.token);
      assert.equal(await store.getSession(original.token), null);
      assert.equal((await store.getSession(rotated.token)).userId, id);
      await assert.rejects(async () => store.rotateSession(randomUUID(), rotated.token));
      assert.equal((await store.getSession(rotated.token)).userId, id);
    });

    await t.test("parallel independent users retain complete archives", async () => {
      const ids = await Promise.all(Array.from({ length: 6 }, () => guest()));
      const archives = await Promise.all(ids.map(id => store.getArchive(id)));
      const saved = await Promise.all(ids.map((id, index) => store.saveArchive(id, { ...archives[index].archive, owned: [keys[index % keys.length]], plan: [keys[(index + 1) % keys.length]] }, 0)));
      const loaded = await Promise.all(ids.map(id => store.getArchive(id)));
      assert.deepEqual(loaded, saved);
      assert.ok(loaded.every(value => value.revision === 1));
    });

    await t.test("archive normalization, ordered plans and stale revision", async () => {
      const id = await guest();
      const initial = await store.getArchive(id);
      const archive = copy(initial.archive);
      archive.profile = { name: "  合约测试  ", server: "  测试服  ", demo: false };
      archive.owned = [keys[0], keys[0]];
      archive.wishlist = [keys[0], keys[1], keys[1]];
      archive.plan = [keys[2], keys[0], keys[2], keys[1]];
      archive.preferences.category = "weapons";
      archive.activity = [{ text: "测试保存", at: 123456789 }];
      const saved = await store.saveArchive(id, archive, 0);
      assert.equal(saved.revision, 1);
      assert.equal(typeof saved.updatedAt, "number");
      assert.equal(saved.archive.lastUpdated, saved.updatedAt);
      assert.equal(saved.archive.profile.name, "合约测试");
      assert.equal(saved.archive.profile.server, "测试服");
      assert.deepEqual(saved.archive.owned, [keys[0]]);
      assert.deepEqual(saved.archive.wishlist, [keys[1]]);
      assert.deepEqual(saved.archive.plan, [keys[2], keys[0], keys[1]]);
      assert.equal(saved.archive.preferences.category, "relics");
      assert.deepEqual(saved.archive.activity, archive.activity);
      await assert.rejects(async () => store.saveArchive(id, archive, 0), (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, "revision_conflict");
        assert.deepEqual(error.details.current, saved);
        return true;
      });
      assert.deepEqual(await store.getArchive(id), saved);
      const invalid = copy(saved.archive);
      invalid.owned = ["mounts-999999999"];
      await assert.rejects(async () => store.saveArchive(id, invalid, saved.revision), { status: 400, code: "validation_error" });
      assert.deepEqual(await store.getArchive(id), saved);
    });

    await t.test("concurrent same-revision saves commit exactly one complete archive", async () => {
      const id = await guest();
      const initial = await store.getArchive(id);
      const candidates = ["并发甲", "并发乙"].map((name, index) => ({
        ...copy(initial.archive), profile: { ...initial.archive.profile, name },
        owned: [keys[index]], plan: [keys[index + 1], keys[index]],
      }));
      const results = await Promise.allSettled(candidates.map((archive) => Promise.resolve().then(() => store.saveArchive(id, archive, 0))));
      const successful = results.filter((result) => result.status === "fulfilled");
      const failed = results.filter((result) => result.status === "rejected");
      assert.equal(successful.length, 1);
      assert.equal(failed.length, 1);
      assert.equal(failed[0].reason.status, 409);
      assert.equal(failed[0].reason.code, "revision_conflict");
      const current = await store.getArchive(id);
      assert.equal(current.revision, 1);
      assert.deepEqual(current, successful[0].value);
      assert.deepEqual(failed[0].reason.details.current, current);
      const winner = candidates.find((archive) => archive.profile.name === current.archive.profile.name);
      assert.deepEqual(sorted(current.archive.owned), sorted(winner.owned));
      assert.deepEqual(current.archive.plan, winner.plan);
    });

    await t.test("concurrent case-insensitive registration has one winner", async () => {
      const ids = [await guest(), await guest()];
      const name = username();
      const results = await Promise.allSettled(ids.map((id, index) => Promise.resolve().then(() => store.register(id, index ? name.toUpperCase() : name, passwordHash))));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const failure = results.find((result) => result.status === "rejected");
      assert.equal(failure.reason.status, 409);
      assert.equal(failure.reason.code, "username_taken");
      const winner = await store.findUser(name);
      assert.ok(ids.includes(winner.id));
      const loser = ids.find((id) => id !== winner.id);
      assert.equal((await store.publicUser(loser)).isGuest, true);
    });
  });
}
