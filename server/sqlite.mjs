import {
  chmodSync, closeSync, existsSync, fsyncSync, fstatSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync,
  unlinkSync, writeFileSync,
} from "fs";
import path from "path";
import { randomToken } from "./runtime.mjs";

let sqlModule;
const missingFile = error => error.code === "ENOENT";
const sqliteError = (message, code = "SQLITE_BUSY") => Object.assign(new Error(message), { code });

function fileStat(filename) {
  try { return statSync(filename); } catch (error) { if (missingFile(error)) return null; throw error; }
}

function canonicalFilename(filename) {
  if (filename === ":memory:") return filename;
  const absolute = path.resolve(filename);
  mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const canonical = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));
  try {
    const info = lstatSync(canonical);
    // Aliases would bypass the lease filename and permit an unsafe second writer.
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw sqliteError("SQLite requires a regular file without symbolic or hard links.");
  } catch (error) { if (!missingFile(error)) throw error; }
  return canonical;
}

function acquireLease(filename) {
  if (filename === ":memory:") return () => {};
  const lock = filename + ".collector-lock";
  const owner = JSON.stringify({ pid: process.pid, token: randomToken(24) });
  let descriptor;
  try {
    descriptor = openSync(lock, "wx", 0o600);
    writeFileSync(descriptor, owner, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) { try { closeSync(descriptor); } catch {} try { unlinkSync(lock); } catch {} }
    if (error.code === "EEXIST") throw sqliteError("SQLite file is already in use (or has a stale .collector-lock). Stop every process using this database before removing a stale lock; use MySQL for multiple Collector instances.");
    throw error;
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener("exit", release);
    try { if (readFileSync(lock, "utf8") === owner) unlinkSync(lock); } catch (error) { if (!missingFile(error)) throw error; }
  };
  // Never steal a stale lease automatically: PID reuse and startup races make that unsafe.
  process.once("exit", release);
  return release;
}

function syncDirectory(filename) {
  // Windows does not expose directory fsync through Node. rename/link still publish atomically.
  if (process.platform === "win32") return;
  const descriptor = openSync(path.dirname(filename), "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function atomicWrite(filename, data, replace) {
  const temporary = filename + "." + randomToken(18) + ".tmp";
  let descriptor;
  let created = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    created = true;
    writeFileSync(descriptor, data);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o600);
    if (replace) renameSync(temporary, filename);
    else { linkSync(temporary, filename); unlinkSync(temporary); }
    created = false;
    syncDirectory(filename);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) { try { unlinkSync(temporary); } catch (error) { if (!missingFile(error)) throw error; } }
  }
}

function rejectSidecars(filename) {
  if (filename === ":memory:") return;
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(filename + suffix)) throw sqliteError("sql.js cannot open a database with SQLite " + suffix + " state. Close the native SQLite writer and checkpoint/recover the database with native SQLite first; do not delete journal files.");
  }
}

const signature = info => info ? [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":") : null;
const keywords = sql => sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ").split(";").map(part => /^\s*([a-z]+)/i.exec(part)).filter(Boolean).map(match => match[1].toUpperCase());

// sql.js has a private in-memory filesystem, not OS SQLite locking. All Collector
// SQLite engines therefore take the same exclusive lifetime lease. External SQLite
// tools must only access a closed database. Use MySQL for concurrent processes.
export class SqlJsDatabase {
  constructor(SQL, filename) {
    this.engine = "sql.js";
    this.filename = canonicalFilename(filename);
    this.release = acquireLease(this.filename);
    this.active = false;
    this.dirty = false;
    this.closed = false;
    try {
      rejectSidecars(this.filename);
      const info = this.filename === ":memory:" ? null : fileStat(this.filename);
      if (info) chmodSync(this.filename, 0o600);
      this.database = info && info.size ? new SQL.Database(readFileSync(this.filename)) : new SQL.Database();
      this.configure();
      this.diskSignature = this.filename === ":memory:" ? null : signature(fileStat(this.filename));
    } catch (error) {
      try { if (this.database) this.database.close(); } catch {}
      finally { this.release(); }
      throw error;
    }
  }

  configure() {
    this.database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE;");
  }

  check() {
    if (this.closed) throw sqliteError("SQLite database is closed.", "SQLITE_MISUSE");
    if (this.failure) throw this.failure;
  }

  inspect(sql, allowControl) {
    if (typeof sql !== "string") throw new TypeError("SQLite SQL must be a string.");
    const commands = keywords(sql);
    if (commands.some(command => ["ATTACH", "DETACH", "VACUUM", "SAVEPOINT", "RELEASE"].includes(command))) throw sqliteError("sql.js does not support ATTACH, DETACH, VACUUM or savepoints through this adapter; use store.backup for backups.", "SQLITE_MISUSE");
    if (commands.some(command => ["BEGIN", "COMMIT", "END", "ROLLBACK"].includes(command)) && (!allowControl || commands.length !== 1)) throw sqliteError("Execute BEGIN, COMMIT and ROLLBACK separately through db.exec.", "SQLITE_MISUSE");
    if (/\bjournal_mode\b/i.test(sql) && !/^\s*PRAGMA\s+journal_mode\s*(?:=\s*DELETE\s*)?;?\s*$/i.test(sql)) throw sqliteError("sql.js requires journal_mode=DELETE; WAL is unsafe for its in-memory filesystem.", "SQLITE_MISUSE");
    return commands;
  }

  exportBytes() {
    // Database.export closes/reopens sql.js internally and resets connection pragmas.
    try { return Buffer.from(this.database.export()); } finally { this.configure(); }
  }

  persist() {
    if (this.filename === ":memory:") return;
    try {
      rejectSidecars(this.filename);
      if (signature(fileStat(this.filename)) !== this.diskSignature) throw sqliteError("SQLite file changed outside this Collector process; refusing to overwrite it.");
      atomicWrite(this.filename, this.exportBytes(), true);
      this.diskSignature = signature(fileStat(this.filename));
    } catch (error) {
      // A failed commit must never be acknowledged, nor overwritten by a later request.
      this.failure = sqliteError("SQLite persistence failed; close and reopen the store before retrying: " + error.message, "SQLITE_IOERR");
      throw this.failure;
    }
  }

  execute(sql, operation) {
    this.check();
    const commands = this.inspect(sql, false);
    const writes = commands.some(command => !["SELECT", "EXPLAIN"].includes(command));
    if (!writes) return operation();
    if (this.active) { this.dirty = true; return operation(); }
    // Keep multi-statement exec atomic even when the caller did not begin a transaction.
    const pragma = commands.length && commands.every(command => command === "PRAGMA");
    if (!pragma) this.database.exec("BEGIN IMMEDIATE");
    let result;
    try {
      result = operation();
      if (!pragma) this.database.exec("COMMIT");
    } catch (error) {
      if (!pragma) { try { this.database.exec("ROLLBACK"); } catch {} }
      throw error;
    }
    this.persist();
    return result;
  }

  exec(sql) {
    this.check();
    const commands = this.inspect(sql, true);
    const command = commands.length === 1 ? commands[0] : "";
    if (command === "BEGIN") {
      this.database.exec(sql);
      this.active = true;
      this.dirty = false;
    } else if (command === "COMMIT" || command === "END") {
      this.database.exec(sql);
      this.active = false;
      const dirty = this.dirty;
      this.dirty = false;
      if (dirty) this.persist();
    } else if (command === "ROLLBACK") {
      this.database.exec(sql);
      this.active = false;
      this.dirty = false;
    } else this.execute(sql, () => { this.database.exec(sql); });
  }

  prepare(sql) {
    this.check();
    this.inspect(sql, false);
    const query = (mode, parameters) => this.execute(sql, () => {
      const statement = this.database.prepare(sql);
      try {
        if (parameters.length) statement.bind(parameters.length === 1 && (Array.isArray(parameters[0]) || (parameters[0] && typeof parameters[0] === "object" && !Buffer.isBuffer(parameters[0]))) ? parameters[0] : parameters);
        if (mode === "get") return statement.step() ? statement.getAsObject() : undefined;
        const rows = [];
        while (statement.step()) if (mode === "all") rows.push(statement.getAsObject());
        if (mode === "all") return rows;
        return { changes: this.database.getRowsModified(), lastInsertRowid: this.database.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] };
      } finally { statement.free(); }
    });
    // Keep no live wasm Statement: export invalidates every prepared statement.
    return { get: (...parameters) => query("get", parameters), all: (...parameters) => query("all", parameters), run: (...parameters) => query("run", parameters) };
  }

  backup(filename) {
    this.check();
    if (this.active) throw sqliteError("Cannot back up SQLite inside an active transaction.", "SQLITE_MISUSE");
    const target = canonicalFilename(filename);
    if (target === ":memory:") throw new Error("SQLite backup requires a file path.");
    const release = acquireLease(target);
    try {
      rejectSidecars(target);
      if (existsSync(target)) throw sqliteError("SQLite backup destination already exists.", "SQLITE_ERROR");
      atomicWrite(target, this.exportBytes(), false);
    } finally { release(); }
  }

  close() {
    if (this.closed) return;
    // Do not export here: an unfinished transaction or persistence failure must not land.
    try {
      try { if (this.active) this.database.exec("ROLLBACK"); }
      finally { this.database.close(); }
    } finally { this.closed = true; this.release(); }
  }
}

class NativeDatabase {
  constructor(DatabaseSync, filename) {
    this.engine = "native";
    this.filename = canonicalFilename(filename);
    this.release = acquireLease(this.filename);
    try {
      if (this.filename !== ":memory:") {
        const descriptor = openSync(this.filename, "a", 0o600);
        try { if (!fstatSync(descriptor).isFile()) throw new Error("SQLite requires a regular file."); } finally { closeSync(descriptor); }
        chmodSync(this.filename, 0o600);
      }
      this.database = new DatabaseSync(this.filename);
      this.database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    } catch (error) {
      try { if (this.database) this.database.close(); } catch {}
      finally { this.release(); }
      throw error;
    }
  }
  exec(sql) { return this.database.exec(sql); }
  prepare(sql) { return this.database.prepare(sql); }
  backup(filename) {
    const target = canonicalFilename(filename);
    if (target === ":memory:") throw new Error("SQLite backup requires a file path.");
    const release = acquireLease(target);
    const temporary = target + "." + randomToken(18) + ".tmp";
    try {
      rejectSidecars(target);
      if (existsSync(target)) throw sqliteError("SQLite backup destination already exists.", "SQLITE_ERROR");
      // VACUUM INTO accepts an existing empty file; reserve it with private permissions.
      const reservation = openSync(temporary, "wx", 0o600);
      closeSync(reservation);
      this.database.prepare("VACUUM INTO ?").run(temporary);
      chmodSync(temporary, 0o600);
      const descriptor = openSync(temporary, "r+");
      try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
      linkSync(temporary, target);
      unlinkSync(temporary);
      syncDirectory(target);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (!missingFile(error)) throw error; }
      finally { release(); }
    }
  }
  close() {
    if (this.closed) return;
    try { this.database.close(); } finally { this.closed = true; this.release(); }
  }
}

export async function createSQLiteDatabase(filename, { forceFallback = false } = {}) {
  if (!forceFallback) {
    let native;
    try { native = await import("node:sqlite"); }
    catch (error) { if (!["ERR_UNKNOWN_BUILTIN_MODULE", "ERR_MODULE_NOT_FOUND"].includes(error.code)) throw error; }
    if (native) return new NativeDatabase(native.DatabaseSync, filename);
  }
  if (!sqlModule) sqlModule = import("sql.js").then(module => module.default());
  return new SqlJsDatabase(await sqlModule, filename);
}
