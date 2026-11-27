import { copyArchive, archiveFingerprint, mergeArchives } from "./archive-model.js";
export class ArchiveApiError extends Error {
  constructor(message,status=0,code="unavailable",details={}) { super(message);this.status=status;this.code=code;Object.assign(this,details); }
}
export class ArchiveApi {
  constructor({fetchImpl=(...args)=>fetch(...args)}={}) { this.fetch=fetchImpl;this.csrfToken=""; }
  async request(path,{method="GET",body}={}) {
    const headers={Accept:"application/json"};
    if(body!==undefined)headers["Content-Type"]="application/json";
    if(method!=="GET")headers["X-CSRF-Token"]=this.csrfToken;
    const controller=typeof AbortController==="function"?new AbortController():null;
    let timer;
    const timeout=new Promise((resolve,reject)=>{
      timer=setTimeout(()=>{if(controller)controller.abort();reject(new Error("Request timed out"));},15000);
      if(timer&&typeof timer.unref==="function")timer.unref();
    });
    try {
      let response;
      try { response=await Promise.race([this.fetch(path,{method,headers,credentials:"same-origin",cache:"no-store",...(controller?{signal:controller.signal}:{}),...(body===undefined?{}:{body:JSON.stringify(body)})}),timeout]); }
      catch { throw new ArchiveApiError("数据库暂未连接，本机记录已保留。"); }
      let data;try{data=await Promise.race([response.json(),timeout]);}catch{throw new ArchiveApiError("服务器返回内容无效。",response.status);}
      const error=data.error||{};
      if(!response.ok)throw new ArchiveApiError(error.message||"请求失败，请稍后重试。",response.status,error.code||"request_failed",{current:data.current});
      if(data.csrfToken)this.csrfToken=data.csrfToken;
      return data;
    } finally { clearTimeout(timer); }
  }
  catalog() { return this.request("/api/catalog"); }
  session() { return this.request("/api/session"); }
  archive() { return this.request("/api/archive"); }
  save(archive,revision) { return this.request("/api/archive",{method:"PUT",body:{archive,revision}}); }
  authenticate(mode,values) { return this.request(`/api/auth/${mode}`,{method:"POST",body:values}); }
  logout() { return this.request("/api/auth/logout",{method:"POST",body:{}}); }
}

export class ArchiveSynchronizer {
  constructor({api=new ArchiveApi(),getArchive,setArchive,onState=()=>{},storage,storageKey="eorzea.archive.v1.sync"}) {
    if(!storage)try{storage=globalThis.localStorage;}catch{}
    storage=storage||{getItem:()=>null,setItem:()=>{}};
    Object.assign(this,{api,getArchive,setArchive,onState,storage,storageKey});
    this.ready=false;this.base=null;this.revision=0;this.running=null;this.timer=null;
    this.state={connected:false,pending:false,busy:false,user:null,message:"正在连接数据库",error:""};
    const saved=this.metadata();this.base=saved.base||null;this.state.pending=!!saved.pending;this.connecting=null;
  }
  metadata() { try{return JSON.parse(this.storage.getItem(this.storageKey))||{};}catch{return {};} }
  persist() {
    try {
      const user=this.state.user;let owner=user===null||user===undefined?undefined:user.id;
      if(owner===null||owner===undefined)owner=this.metadata().owner;
      if(owner===null||owner===undefined)owner=null;
      this.storage.setItem(this.storageKey,JSON.stringify({owner,pending:this.state.pending,base:this.base}));
    } catch {}
  }
  emit(message,error="") { if(message)this.state.message=message;this.state.error=error;this.onState(this.state); }
  settledMessage() { const user=this.state.user;return (user!==null&&user!==undefined&&user.isGuest)?"访客档案已保存到数据库":"账号档案已同步到数据库"; }
  backupLocal() { try{this.storage.setItem(this.storageKey+".before-login",JSON.stringify(this.getArchive()));}catch{} }
  async start() {
    if(this.connecting)return this.connecting;
    this.connecting=this.connect();
    try{return await this.connecting;}finally{this.connecting=null;}
  }
  async connect() {
    try {
      const session=await this.api.session(),meta=this.metadata(),local=this.getArchive();
      const pending=this.state.pending||!!meta.pending;
      this.ready=true;this.state.connected=true;this.state.user=session.user;this.revision=session.revision;
      if(session.user.isGuest&&session.revision===0) {
        this.base=session.archive;this.state.pending=archiveFingerprint(local)!==archiveFingerprint(this.base);
      } else if(pending&&(meta.owner===session.user.id||session.user.isGuest)) {
        this.base=meta.base||session.archive;
        const merged=mergeArchives(this.base,local,session.archive);
        this.base=session.archive;this.setArchive(merged,true);
        this.state.pending=archiveFingerprint(merged)!==archiveFingerprint(this.base);
      } else {
        if(pending&&meta.owner&&meta.owner!==session.user.id)this.backupLocal();
        this.base=session.archive;this.state.pending=false;
        if(archiveFingerprint(local)!==archiveFingerprint(session.archive))this.setArchive(session.archive,true);
      }
      this.persist();this.emit(this.state.pending?"正在同步本机记录":this.settledMessage());
      if(this.state.pending)return await this.flush();
      return true;
    } catch(error) {
      this.ready=false;this.state.connected=false;this.persist();this.emit("仅本机保存 · 数据库未连接",error.message);return false;
    }
  }
  queue() {
    this.state.pending=true;this.persist();clearTimeout(this.timer);
    this.emit(this.ready?"本机已保存 · 等待数据库同步":"本机已保存 · 等待数据库连接");
    if(this.ready)this.timer=setTimeout(()=>void this.flush(),250);
  }
  async flush() {
    clearTimeout(this.timer);
    if(this.running)return this.running;
    if(!this.ready)return false;
    this.running=(async()=>{
      this.state.busy=true;let conflicts=0;
      try {
        while(this.state.pending) {
          const snapshot=copyArchive(this.getArchive());this.emit("正在保存到数据库");
          try {
            const result=await this.api.save(snapshot,this.revision);
            this.revision=result.revision;this.base=result.archive;
            this.state.connected=true;
            if(archiveFingerprint(this.getArchive())===archiveFingerprint(snapshot)){this.setArchive(result.archive,false);this.state.pending=false;}else this.state.pending=archiveFingerprint(this.getArchive())!==archiveFingerprint(result.archive);
            this.persist();
          } catch(error) {
            if(error.code==="revision_conflict"&&error.current&&conflicts++<4) {
              const merged=mergeArchives(this.base,this.getArchive(),error.current.archive);
              this.revision=error.current.revision;this.base=error.current.archive;
              this.setArchive(merged,true);this.state.pending=true;this.persist();continue;
            }
            if(error.status===401||error.status===0){this.ready=false;this.state.connected=false;}
            this.persist();this.emit("本机已保存 · 等待同步",error.message);return false;
          }
        }
        this.emit(this.settledMessage());return true;
      } finally {this.state.busy=false;this.onState(this.state);}
    })();
    try{return await this.running;}finally{this.running=null;}
  }
  applySession(result) {
    this.ready=true;this.state.connected=true;this.state.user=result.user;this.revision=result.revision;this.base=result.archive;
    this.state.pending=false;this.setArchive(result.archive,true);this.persist();this.emit(this.settledMessage());
  }
  async authenticate(mode,values) {
    if(!this.ready&&!(await this.start()))throw new ArchiveApiError("数据库未连接，请稍后重试。");
    if(this.state.pending&&!(await this.flush()))throw new ArchiveApiError("本机还有待同步记录，请先重试同步。");
    this.backupLocal();const result=await this.api.authenticate(mode,values);this.applySession(result);return result;
  }
  async logout() {
    if(this.state.pending&&!(await this.flush()))throw new ArchiveApiError("本机还有待同步记录，请先重试同步。");
    const result=await this.api.logout();this.applySession(result);return result;
  }
  async pull() {
    if(this.running)return this.running;
    if(this.state.pending)return this.ready?this.flush():this.start();
    return this.start();
  }
}
