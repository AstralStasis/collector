import test from "./support/test.mjs";
import { strict as assert } from "assert";
import { readDatabaseConfig } from "../server/database-config.mjs";
const root = process.cwd();

test("database configuration preserves memory SQLite and rejects unknown clients", () => {
  assert.deepEqual(readDatabaseConfig({ root, env: { DATABASE_CLIENT: "sqlite", DATABASE_PATH: ":memory:" } }), { client: "sqlite", filename: ":memory:" });
  assert.equal(readDatabaseConfig({ root, env: {} }).client, "sqlite");
  assert.throws(() => readDatabaseConfig({ root, env: { DATABASE_CLIENT: "postgres" } }), /DATABASE_CLIENT/);
});

test("MySQL URL credentials are decoded and explicit fields override them", () => {
  const config = readDatabaseConfig({ root, env: { MYSQL_URL: "mysql://user:p%40ss%23word@localhost:13306/archive", MYSQL_HOST: "127.0.0.1", MYSQL_USER: "app", MYSQL_PASSWORD: "", MYSQL_CONNECTION_LIMIT: "4" } });
  assert.equal(config.client, "mysql");
  assert.deepEqual(config.connection, { host: "127.0.0.1", user: "app", password: "", database: "archive", port: 13306, connectionLimit: 4, connectTimeout: 10000 });
  const decoded = readDatabaseConfig({ root, env: { MYSQL_URL: "mysql://user:p%40ss%23word@localhost/archive" } });
  assert.equal(decoded.connection.password, "p@ss#word");
});

test("partial MySQL settings never silently select SQLite", () => {
  assert.throws(() => readDatabaseConfig({ root, env: { MYSQL_USER: "app" } }), /MYSQL_DATABASE/);
  const config = readDatabaseConfig({ root, env: { MYSQL_USER: "app", MYSQL_DATABASE: "archive", MYSQL_SSL: "true" } });
  assert.equal(config.connection.host, "127.0.0.1");
  assert.equal(config.connection.ssl.rejectUnauthorized, true);
});

test("MySQL rejects unsafe URLs, invalid limits and ambiguous TLS settings", () => {
  const base = { DATABASE_CLIENT: "mysql", MYSQL_USER: "app", MYSQL_DATABASE: "archive" };
  for (const env of [
    { MYSQL_PORT: "0" }, { MYSQL_PORT: "65536" }, { MYSQL_PORT: "3306x" },
    { MYSQL_CONNECTION_LIMIT: "0" }, { MYSQL_CONNECTION_LIMIT: "101" },
    { MYSQL_CONNECT_TIMEOUT: "-1" }, { MYSQL_SSL: "disable-verification" },
    { MYSQL_SSL_CA: "missing.pem" }, { MYSQL_URL: "postgres://user:pass@localhost/archive" },
    { MYSQL_URL: "mysql://user:secret@localhost/archive?ssl=false" },
  ]) assert.throws(() => readDatabaseConfig({ root, env: { ...base, ...env } }));
  assert.throws(() => readDatabaseConfig({ root, env: { ...base, MYSQL_URL: "mysql://user:do-not-echo@host/db?invalid=yes" } }), error => !error.message.includes("do-not-echo"));
});
