import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ApiError } from "./errors.mjs";
import { defaults, validateArchive } from "./validation.mjs";
const hash=(s) => createHash("sha256").update(s).digest("hex");
export class ArchiveStore {
  constructor(filename, {clock=Date.now}={}) {
    if(filename !== ":memory:") mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    this.kind="sqlite"; this.db=new DatabaseSync(filename); this.clock=clock;
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    this.migrate(); this.refreshCatalog();
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value=fn(); this.db.exec("COMMIT"); return value; }
    catch(error) { this.db.exec("ROLLBACK"); throw error; }
  }
  migrate() {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT");
    const dir=fileURLToPath(new URL("../database/migrations/",import.meta.url));
    for(const name of readdirSync(dir).filter(x=>/^\d+_.+\.sql$/.test(x)).sort()) {
      const version=Number(name.split("_")[0]);
      if(this.db.prepare("SELECT version FROM schema_migrations WHERE version=?").get(version)) continue;
      this.transaction(()=>{this.db.exec(readFileSync(path.join(dir,name),"utf8"));this.db.prepare("INSERT INTO schema_migrations VALUES(?,?)").run(version,this.clock());});
    }
  }
  refreshCatalog() {
    const rows=this.db.prepare("SELECT item_key,category,document FROM catalog_items ORDER BY rowid").all();
    this.keys=new Set(rows.map(x=>x.item_key)); this.categories=new Set(rows.map(x=>x.category));
    this.catalog={meta:JSON.parse(this.db.prepare("SELECT document FROM catalog_metadata WHERE id=1").get()?.document ?? "{}"),items:rows.map(x=>JSON.parse(x.document))};
  }
  seedCatalog(catalog) {
    if(!catalog || !Array.isArray(catalog.items) || !catalog.items.length) throw Error("Catalog seed is empty.");
    const digest=hash(JSON.stringify(catalog));
    if(this.db.prepare("SELECT digest FROM catalog_metadata WHERE id=1").get()?.digest === digest) return false;
    this.transaction(()=>{
      const item=this.db.prepare("INSERT INTO catalog_items VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(item_key) DO UPDATE SET game_id=excluded.game_id,category=excluded.category,name=excluded.name,english=excluded.english,patch=excluded.patch,source_type=excluded.source_type,document=excluded.document");
      const offer=this.db.prepare("INSERT OR IGNORE INTO exchange_offers VALUES(?,?,?,?,?,?)");
      const clear=this.db.prepare("DELETE FROM exchange_offers WHERE item_key=?");
      for(const x of catalog.items) {
        item.run(x.key,x.id,x.category,x.name,x.english,x.patch,x.sourceType,JSON.stringify(x));clear.run(x.key);
        for(const e of x.exchanges ?? []) offer.run(x.key,e.currency,e.amount,e.expansion ?? "",e.region ?? "",e.rank ?? null);
      }
      this.db.prepare("INSERT INTO catalog_metadata VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest,document=excluded.document,updated_at=excluded.updated_at").run(digest,JSON.stringify(catalog.meta ?? {}),this.clock());
    });
    this.refreshCatalog(); return true;
  }
  createGuest() {
    const id=randomUUID(), a=defaults(), now=this.clock();
    this.transaction(()=>{
      this.db.prepare("INSERT INTO users VALUES(?,NULL,NULL,?)").run(id,now);
      this.db.prepare("INSERT INTO profiles VALUES(?,?,?,?,?,?,0,?)").run(id,a.profile.name,a.profile.server,0,JSON.stringify(a.preferences),"[]",now);
    });return id;
  }
  publicUser(id) {
    const row=this.db.prepare("SELECT id,username FROM users WHERE id=?").get(id);
    return row ? {...row,isGuest:row.username === null} : null;
  }
  findUser(username) { return this.db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(username); }
  register(id, username, passwordHash) {
    this.transaction(()=>{
      if(!this.publicUser(id)?.isGuest) throw new ApiError(409,"already_registered","当前会话已经登录。");
      if(this.findUser(username)) throw new ApiError(409,"username_taken","这个账号已被使用。");
      this.db.prepare("UPDATE users SET username=?,password_hash=? WHERE id=?").run(username,passwordHash,id);
    });
  }
  createSession(id, days=30) { return this.rotateSession(id,undefined,days); }
  rotateSession(id, previous, days=30) {
    const token=randomBytes(32).toString("base64url"), csrfToken=randomBytes(24).toString("base64url"), now=this.clock();
    this.transaction(()=>{
      this.db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
      this.db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?)").run(hash(token),id,csrfToken,now+days*86400000,now);
      if(previous)this.deleteSession(previous);
    });
    return {token,csrfToken,userId:id,expiresAt:now+days*86400000};
  }
  getSession(token) {
    if(typeof token !== "string" || token.length > 100) return null;
    const row=this.db.prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?").get(hash(token),this.clock());
    return row ? {userId:row.user_id,csrfToken:row.csrf_token,expiresAt:row.expires_at} : null;
  }
  deleteSession(token) { if(token) this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token)); }
  getArchive(id) {
    const p=this.db.prepare("SELECT * FROM profiles WHERE user_id=?").get(id);
    if(!p) throw new ApiError(404,"archive_not_found","档案不存在。");
    const rows=this.db.prepare("SELECT * FROM collection_entries WHERE user_id=? ORDER BY item_key").all(id);
    return {revision:p.revision,updatedAt:p.updated_at,archive:{version:1,profile:{name:p.display_name,server:p.server_name,demo:!!p.is_demo},owned:rows.filter(x=>x.owned).map(x=>x.item_key),wishlist:rows.filter(x=>x.wishlist).map(x=>x.item_key),plan:rows.filter(x=>x.plan_position !== null).sort((a,b)=>a.plan_position-b.plan_position).map(x=>x.item_key),preferences:JSON.parse(p.preferences),activity:JSON.parse(p.activity),lastUpdated:p.updated_at}};
  }
  saveArchive(id, input, revision) {
    const a=validateArchive(input,this.keys,this.categories);
    return this.transaction(()=>{
      const current=this.getArchive(id);
      if(current.revision !== revision) throw new ApiError(409,"revision_conflict","其他窗口或设备已经更新了档案。",{current});
      const owned=new Set(a.owned), wish=new Set(a.wishlist), plan=new Map(a.plan.map((x,i)=>[x,i]));
      this.db.prepare("DELETE FROM collection_entries WHERE user_id=?").run(id);
      const insert=this.db.prepare("INSERT INTO collection_entries VALUES(?,?,?,?,?)");
      for(const key of new Set([...a.owned,...a.wishlist,...a.plan])) insert.run(id,key,owned.has(key)?1:0,wish.has(key)?1:0,plan.get(key) ?? null);
      this.db.prepare("UPDATE profiles SET display_name=?,server_name=?,is_demo=?,preferences=?,activity=?,revision=revision+1,updated_at=? WHERE user_id=?").run(a.profile.name,a.profile.server,a.profile.demo?1:0,JSON.stringify(a.preferences),JSON.stringify(a.activity),this.clock(),id);
      return this.getArchive(id);
    });
  }
  backup(filename) { mkdirSync(path.dirname(filename),{recursive:true,mode:0o700}); this.db.prepare("VACUUM INTO ?").run(filename); }
  health() { this.db.prepare("SELECT 1").get(); return {database:this.kind,schemaVersion:1}; }
  close() { this.db.close(); }
}
