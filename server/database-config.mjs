import path from "path";
import { readFileSync } from "fs";

const integer = (value, fallback, name, max) => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > max) throw new Error(name + " must be a positive integer up to " + max + ".");
  return Number(value);
};

export function readDatabaseConfig({ root, env = process.env } = {}) {
  const client = env.DATABASE_CLIENT || (env.MYSQL_URL || env.MYSQL_HOST || env.MYSQL_USER || env.MYSQL_DATABASE ? "mysql" : "sqlite");
  if (client === "sqlite") return { client, filename: env.DATABASE_PATH === ":memory:" ? ":memory:" : path.resolve(root, env.DATABASE_PATH || "data/eorzea.sqlite") };
  if (client !== "mysql") throw new Error("DATABASE_CLIENT must be sqlite or mysql.");
  let address = {};
  if (env.MYSQL_URL) {
    try {
      const url = new URL(env.MYSQL_URL);
      if (url.protocol !== "mysql:" || url.search || url.hash) throw new Error();
      address = { host: url.hostname.replace(/^\[|\]$/g, ""), port: url.port, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) };
    } catch { throw new Error("MYSQL_URL must be mysql://user:password@host:port/database (without query parameters)."); }
  }
  const host = env.MYSQL_HOST || address.host || "127.0.0.1";
  const user = env.MYSQL_USER || address.user;
  const database = env.MYSQL_DATABASE || address.database;
  if (!user || !database || database.includes("/") || database.length > 64) throw new Error("MySQL requires MYSQL_USER and MYSQL_DATABASE, or a complete MYSQL_URL.");
  if (env.MYSQL_SSL && !["true", "false"].includes(env.MYSQL_SSL)) throw new Error("MYSQL_SSL must be true or false.");
  if (env.MYSQL_SSL_CA && env.MYSQL_SSL !== "true") throw new Error("MYSQL_SSL_CA requires MYSQL_SSL=true.");
  const ssl = env.MYSQL_SSL === "true" ? { rejectUnauthorized: true, ...(env.MYSQL_SSL_CA ? { ca: readFileSync(path.resolve(root, env.MYSQL_SSL_CA), "utf8") } : {}) } : undefined;
  return {
    client,
    connection: {
      host, user, database, password: env.MYSQL_PASSWORD == null ? (address.password == null ? "" : address.password) : env.MYSQL_PASSWORD,
      port: integer(env.MYSQL_PORT == null ? address.port : env.MYSQL_PORT, 3306, "MYSQL_PORT", 65535),
      connectionLimit: integer(env.MYSQL_CONNECTION_LIMIT, 10, "MYSQL_CONNECTION_LIMIT", 100),
      connectTimeout: integer(env.MYSQL_CONNECT_TIMEOUT, 10000, "MYSQL_CONNECT_TIMEOUT", 120000),
      ...(ssl ? { ssl } : {}),
    },
  };
}
