export async function createStore(config) {
  if (config.client === "mysql") {
    const { MySQLArchiveStore } = await import("./mysql-store.mjs");
    const store = new MySQLArchiveStore(config.connection);
    try { await store.initialize(); return store; }
    catch (error) { await store.close(); throw error; }
  }
  if (config.client === "sqlite") {
    const { ArchiveStore } = await import("./database.mjs");
    return new ArchiveStore(config.filename);
  }
  throw new Error("Unsupported database client.");
}
