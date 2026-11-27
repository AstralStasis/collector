import mysql from "mysql2/promise";
import { promises as fsPromises } from "fs";
const { readFile, readdir } = fsPromises;
import { createHash } from "crypto";
import { ApiError } from "./errors.mjs";
import { defaults, validateArchive } from "./validation.mjs";
import { randomUUID, randomToken, delay } from "./runtime.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const decode = value => typeof value === "string" ? JSON.parse(value) : value;
const first = async (connection, sql, values = []) => (await connection.execute(sql, values))[0][0];

export class MySQLArchiveStore {
  constructor(connection, { clock = Date.now } = {}) {
    this.kind = "mysql";
    this.clock = clock;
    this.database = connection.database;
    // MySQL 8.0.24 has incomplete query-attribute support; keep prepared statements on the classic protocol.
    this.pool = mysql.createPool({ ...connection, flags: "-CLIENT_QUERY_ATTRIBUTES", charset: "utf8mb4", timezone: "Z", supportBigNumbers: true, waitForConnections: true, queueLimit: 100, multipleStatements: false, enableKeepAlive: true });
  }

  async initialize() {
    const { version } = await first(this.pool, "SELECT VERSION() AS version");
    const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    const compatible = parts && !/mariadb/i.test(version) && (Number(parts[1]) > 8 || (Number(parts[1]) === 8 && (Number(parts[2]) > 0 || Number(parts[3]) >= 24)));
    if (!compatible) throw new Error("MySQL 8.0.24 or later is required.");
    this.serverVersion = version;
    await this.migrate();
    await this.refreshCatalog();
  }

  async transaction(fn, { isolation = "REPEATABLE READ" } = {}) {
    // Callbacks contain database work only: a deadlocked transaction can be replayed safely.
    for (let attempt = 0; ; attempt++) {
      const connection = await this.pool.getConnection();
      let retry = false;
      try {
        await connection.query(isolation === "READ COMMITTED" ? "SET TRANSACTION ISOLATION LEVEL READ COMMITTED" : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
      } catch (error) {
        try { await connection.rollback(); } catch { /* Preserve the original failure. */ }
        retry = attempt < 2 && ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code);
        if (!retry) throw error;
      } finally { connection.release(); }
      if (retry) await delay(10 * 2 ** attempt);
    }
  }

  async withLock(name, fn) {
    const connection = await this.pool.getConnection();
    const lock = "eorzea:" + name + ":" + hash(this.database).slice(0, 32);
    let acquired = false;
    try {
      const row = await first(connection, "SELECT GET_LOCK(?, 30) AS acquired", [lock]);
      if (Number(row.acquired) !== 1) throw new Error("Timed out waiting for database " + name + " lock.");
      acquired = true;
      return await fn(connection);
    } finally {
      if (acquired) {
        try { await connection.execute("SELECT RELEASE_LOCK(?)", [lock]); }
        catch { connection.destroy(); }
      }
      connection.release();
    }
  }

  async migrate() {
    await this.withLock("migrate", async connection => {
      await connection.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at BIGINT NOT NULL) ENGINE=InnoDB");
      const directory = new URL("../database/mysql/", import.meta.url);
      for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
        const version = Number(name.split("_")[0]);
        if (await first(connection, "SELECT version FROM schema_migrations WHERE version=?", [version])) continue;
        // MySQL DDL commits implicitly. Migration files must be safely rerunnable after interruption.
        const sql = await readFile(new URL(name, directory), "utf8");
        for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await connection.query(statement);
        await connection.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [version, this.clock()]);
      }
    });
  }

  async refreshCatalog() {
    const catalog = await this.transaction(async connection => {
      const [rows] = await connection.query("SELECT item_key, category, document FROM catalog_items ORDER BY sort_order");
      const meta = await first(connection, "SELECT document FROM catalog_metadata WHERE id=1");
      return { meta: meta ? decode(meta.document) : {}, items: rows.map(row => decode(row.document)) };
    });
    this.catalog = catalog;
    this.keys = new Set(catalog.items.map(item => item.key));
    this.categories = new Set(catalog.items.map(item => item.category));
  }

  async seedCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.items) || !catalog.items.length) throw new Error("Catalog seed is empty.");
    const digest = hash(JSON.stringify(catalog));
    const changed = await this.withLock("seed", async connection => {
      await connection.beginTransaction();
      try {
        const meta = await first(connection, "SELECT digest FROM catalog_metadata WHERE id=1 FOR UPDATE");
        if (meta && meta.digest === digest) { await connection.commit(); return false; }
        for (const item of catalog.items) {
          await connection.execute("INSERT INTO catalog_items (item_key, game_id, category, name, english, patch, source_type, document) VALUES (?, ?, ?, ?, ?, ?, ?, ?) AS incoming ON DUPLICATE KEY UPDATE game_id=incoming.game_id, category=incoming.category, name=incoming.name, english=incoming.english, patch=incoming.patch, source_type=incoming.source_type, document=incoming.document", [item.key, item.id, item.category, item.name, item.english, item.patch, item.sourceType, JSON.stringify(item)]);
          await connection.execute("DELETE FROM exchange_offers WHERE item_key=?", [item.key]);
          for (const offer of item.exchanges == null ? [] : item.exchanges) {
            await connection.execute("INSERT INTO exchange_offers (item_key, currency, amount, expansion, region, `rank`) VALUES (?, ?, ?, ?, ?, ?) AS incoming ON DUPLICATE KEY UPDATE `rank`=incoming.`rank`", [item.key, offer.currency, offer.amount, offer.expansion == null ? "" : offer.expansion, offer.region == null ? "" : offer.region, offer.rank == null ? null : offer.rank]);
          }
        }
        await connection.execute("INSERT INTO catalog_metadata (id, digest, document, updated_at) VALUES (1, ?, ?, ?) AS incoming ON DUPLICATE KEY UPDATE digest=incoming.digest, document=incoming.document, updated_at=incoming.updated_at", [digest, JSON.stringify(catalog.meta == null ? {} : catalog.meta), this.clock()]);
        await connection.commit();
        return true;
      } catch (error) { try { await connection.rollback(); } catch {} throw error; }
    });
    await this.refreshCatalog();
    return changed;
  }

  async createGuest() {
    const id = randomUUID(), archive = defaults(), now = this.clock();
    await this.transaction(async connection => {
      await connection.execute("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, NULL, NULL, ?)", [id, now]);
      await connection.execute("INSERT INTO profiles (user_id, display_name, server_name, is_demo, preferences, activity, revision, updated_at) VALUES (?, ?, ?, 0, ?, '[]', 0, ?)", [id, archive.profile.name, archive.profile.server, JSON.stringify(archive.preferences), now]);
    });
    return id;
  }

  async publicUser(id) {
    const row = await first(this.pool, "SELECT id, username FROM users WHERE id=?", [id]);
    return row ? { ...row, isGuest: row.username === null } : null;
  }

  async findUser(username) { return first(this.pool, "SELECT * FROM users WHERE username=?", [username]); }

  async register(id, username, passwordHash) {
    try {
      await this.transaction(async connection => {
        const row = await first(connection, "SELECT username FROM users WHERE id=? FOR UPDATE", [id]);
        if (!row || row.username !== null) throw new ApiError(409, "already_registered", "当前会话已经登录。");
        await connection.execute("UPDATE users SET username=?, password_hash=? WHERE id=?", [username, passwordHash, id]);
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw new ApiError(409, "username_taken", "这个账号已被使用。");
      throw error;
    }
  }

  async createSession(id, days = 30) { return this.rotateSession(id, undefined, days); }

  async rotateSession(id, previous, days = 30) {
    const token = randomToken(32), csrfToken = randomToken(24), now = this.clock(), expiresAt = now + days * 86400000;
    await this.transaction(async connection => {
      await connection.execute("DELETE FROM sessions WHERE expires_at<=?", [now]);
      await connection.execute("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", [hash(token), id, csrfToken, expiresAt, now]);
      if (previous) await connection.execute("DELETE FROM sessions WHERE token_hash=?", [hash(previous)]);
    }, { isolation: "READ COMMITTED" });
    return { token, csrfToken, userId: id, expiresAt };
  }

  async getSession(token) {
    if (typeof token !== "string" || token.length > 100) return null;
    const row = await first(this.pool, "SELECT user_id, csrf_token, expires_at FROM sessions WHERE token_hash=? AND expires_at>?", [hash(token), this.clock()]);
    return row ? { userId: row.user_id, csrfToken: row.csrf_token, expiresAt: Number(row.expires_at) } : null;
  }

  async deleteSession(token) { if (token) await this.pool.execute("DELETE FROM sessions WHERE token_hash=?", [hash(token)]); }

  async readArchive(connection, id, profile) {
    const row = profile == null ? await first(connection, "SELECT * FROM profiles WHERE user_id=?", [id]) : profile;
    if (!row) throw new ApiError(404, "archive_not_found", "档案不存在。");
    const [entries] = await connection.execute("SELECT * FROM collection_entries WHERE user_id=? ORDER BY item_key", [id]);
    const updatedAt = Number(row.updated_at);
    return {
      revision: Number(row.revision), updatedAt,
      archive: {
        version: 1, profile: { name: row.display_name, server: row.server_name, demo: !!row.is_demo },
        owned: entries.filter(entry => entry.owned).map(entry => entry.item_key),
        wishlist: entries.filter(entry => entry.wishlist).map(entry => entry.item_key),
        plan: entries.filter(entry => entry.plan_position !== null).sort((a, b) => a.plan_position - b.plan_position).map(entry => entry.item_key),
        preferences: decode(row.preferences), activity: decode(row.activity), lastUpdated: updatedAt,
      },
    };
  }

  async getArchive(id) { return this.transaction(connection => this.readArchive(connection, id)); }

  async saveArchive(id, input, revision) {
    const archive = validateArchive(input, this.keys, this.categories);
    return this.transaction(async connection => {
      const profile = await first(connection, "SELECT * FROM profiles WHERE user_id=? FOR UPDATE", [id]);
      const current = await this.readArchive(connection, id, profile);
      if (current.revision !== revision) throw new ApiError(409, "revision_conflict", "其他窗口或设备已经更新了档案。", { current });
      const owned = new Set(archive.owned), wish = new Set(archive.wishlist), plan = new Map(archive.plan.map((key, index) => [key, index]));
      await connection.execute("DELETE FROM collection_entries WHERE user_id=?", [id]);
      for (const key of new Set([...archive.owned, ...archive.wishlist, ...archive.plan])) {
        await connection.execute("INSERT INTO collection_entries (user_id, item_key, owned, wishlist, plan_position) VALUES (?, ?, ?, ?, ?)", [id, key, owned.has(key) ? 1 : 0, wish.has(key) ? 1 : 0, plan.has(key) ? plan.get(key) : null]);
      }
      await connection.execute("UPDATE profiles SET display_name=?, server_name=?, is_demo=?, preferences=?, activity=?, revision=revision+1, updated_at=? WHERE user_id=?", [archive.profile.name, archive.profile.server, archive.profile.demo ? 1 : 0, JSON.stringify(archive.preferences), JSON.stringify(archive.activity), this.clock(), id]);
      return this.readArchive(connection, id);
    }, { isolation: "READ COMMITTED" });
  }

  async health() { await this.pool.query("SELECT 1"); return { database: this.kind, schemaVersion: 1 }; }
  async backup() { throw new Error("Use mysqldump --single-transaction for MySQL backups; see README.md."); }
  async close() { await this.pool.end(); }
}
