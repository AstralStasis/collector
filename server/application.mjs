import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createStore } from "./store.mjs";
import { ApiError, invalid } from "./errors.mjs";
import { credentials, revisionOf } from "./validation.mjs";
import { hashPassword, verifyPassword } from "./auth.mjs";
const cookieName="eorzea_session";
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"};
function json(res,status,body,headers={}) { res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers});res.end(JSON.stringify(body)); }
function cookies(req) {
  const result={};for(const p of (req.headers.cookie ?? "").split(";")){const i=p.indexOf("=");if(i>0)try{result[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());}catch{}}
  return result;
}
function readJson(req, limit=1024*1024) {
  if(!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) throw new ApiError(415,"json_required","请求体必须使用 application/json。");
  if(Number(req.headers["content-length"])>limit){req.resume();throw new ApiError(413,"body_too_large","请求内容过大。");}
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,failed=false;
    req.on("data",chunk=>{size+=chunk.length;if(size>limit){if(!failed)reject(new ApiError(413,"body_too_large","请求内容过大。"));failed=true;chunks.length=0;}else if(!failed)chunks.push(chunk);});
    req.on("end",()=>{if(failed)return;try{const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!body || typeof body!=="object" || Array.isArray(body))invalid("请求体必须是 JSON 对象。");resolve(body);}catch(e){reject(e instanceof ApiError ? e : new ApiError(400,"invalid_json","JSON 格式无效。"));}});
    req.on("error",reject);
  });
}
const safeEqual=(a,b)=>typeof a==="string"&&typeof b==="string"&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function createApplication({root,databasePath=path.join(root,"data/eorzea.sqlite"),databaseConfig,publicOrigin="",secureCookies=false,logger=console,authLimit=20}={}) {
  const store=await createStore(databaseConfig ?? {client:"sqlite",filename:databasePath});
  try{await store.seedCatalog(JSON.parse(await readFile(path.join(root,"catalog.json"),"utf8")));}catch(error){await store.close();throw error;}
  const attempts=new Map();
  const allowAuth=(req)=>{
    const key=req.socket.remoteAddress ?? "unknown",now=Date.now();
    for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
    const record=attempts.get(key) ?? {count:0,until:now+15*60*1000};record.count++;attempts.set(key,record);
    if(record.count>authLimit)throw new ApiError(429,"rate_limited","尝试次数过多，请稍后重试。");
  };
  const sessionPayload=async(session)=>({user:await store.publicUser(session.userId),csrfToken:session.csrfToken,...(await store.getArchive(session.userId))});
  const issue=async(res,id,previous)=>{
    const session=await store.rotateSession(id,previous);
    res.setHeader("Set-Cookie",`${cookieName}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureCookies?"; Secure":""}`);
    return session;
  };
  const requireSession=async(req)=>{
    const session=await store.getSession(cookies(req)[cookieName]);
    if(!session)throw new ApiError(401,"session_required","会话已过期，请重新连接或登录。");
    return session;
  };
  const protect=(req,session)=>{
    const origin=req.headers.origin;
    if(origin){let allowed=false;try{const supplied=new URL(origin);allowed=publicOrigin?supplied.origin===new URL(publicOrigin).origin:["http:","https:"].includes(supplied.protocol)&&supplied.host===req.headers.host;}catch{}if(!allowed)throw new ApiError(403,"origin_rejected","不允许跨站修改档案。");}
    if(!safeEqual(req.headers["x-csrf-token"],session.csrfToken))throw new ApiError(403,"csrf_rejected","请求校验失败，请刷新后重试。");
  };
  async function api(req,res,url,pathname) {
    const method=req.method;
    if(pathname==="/api/health"&&method==="GET"){
      try{return json(res,200,{ok:true,...(await store.health())});}
      catch{throw new ApiError(503,"database_unavailable","数据库暂时不可用。");}
    }
    if(pathname==="/api/session"&&method==="GET"){
      let session=await store.getSession(cookies(req)[cookieName]);
      if(!session)session=await issue(res,await store.createGuest());
      return json(res,200,await sessionPayload(session));
    }
    if(pathname==="/api/catalog"&&method==="GET"){
      const q=(url.searchParams.get("q")??"").slice(0,200).toLocaleLowerCase();
      const fields={category:"category",source:"sourceType",series:"series",job:"job"};
      let items=store.catalog.items;
      for(const [parameter,field]of Object.entries(fields)){const value=url.searchParams.get(parameter);if(value)items=items.filter(x=>x[field]===value);}
      const patch=url.searchParams.get("patch");if(patch)items=items.filter(x=>x.patch.startsWith(patch));
      const currency=url.searchParams.get("currency"),region=url.searchParams.get("region"),expansion=url.searchParams.get("expansion");
      if(currency||region||expansion)items=items.filter(x=>x.exchangeExclusive&&(x.exchanges??[]).some(e=>(!currency||e.currency===currency)&&(!region||e.region===region)&&(!expansion||e.expansion===expansion)));
      if(q)items=items.filter(x=>[x.name,x.english,x.source,x.sourceEnglish,x.series,x.seriesAlias,x.job,x.jobAbbr].join(" ").toLocaleLowerCase().includes(q));
      return json(res,200,{meta:store.catalog.meta,items,count:items.length});
    }
    const itemMatch=pathname.match(/^\/api\/catalog\/([a-z]+-\d+)$/);
    if(itemMatch&&method==="GET"){const item=store.catalog.items.find(x=>x.key===itemMatch[1]);if(!item)throw new ApiError(404,"item_not_found","图鉴条目不存在。");return json(res,200,item);}
    const known=["/api/archive","/api/auth/register","/api/auth/login","/api/auth/logout","/api/profile","/api/preferences","/api/wishlist","/api/plan"];
    const collectionMatch=pathname.match(/^\/api\/collection\/([a-z]+-\d+)$/);
    if(!known.includes(pathname)&&!collectionMatch)throw new ApiError(404,"not_found","接口不存在。");
    const allowed={"/api/archive":["GET","PUT"],"/api/auth/register":["POST"],"/api/auth/login":["POST"],"/api/auth/logout":["POST"],"/api/profile":["PATCH"],"/api/preferences":["PATCH"],"/api/wishlist":["PUT"],"/api/plan":["PUT"]}[pathname]??["PATCH"];
    if(!allowed.includes(method)){res.setHeader("Allow",allowed.join(", "));throw new ApiError(405,"method_not_allowed","请求方式不支持。");}
    const session=await requireSession(req);
    if(method==="GET")return json(res,200,await store.getArchive(session.userId));
    protect(req,session);
    if(pathname.startsWith("/api/auth/")&&pathname!=="/api/auth/logout")allowAuth(req);
    const body=await readJson(req);
    if(pathname==="/api/auth/register"){
      const {username,password}=credentials(body);const encoded=await hashPassword(password);
      await store.register(session.userId,username,encoded);
      return json(res,201,await sessionPayload(await issue(res,session.userId,cookies(req)[cookieName])));
    }
    if(pathname==="/api/auth/login"){
      const {username,password}=credentials(body),user=await store.findUser(username);
      if(!(await verifyPassword(password,user?.password_hash)))throw new ApiError(401,"invalid_credentials","账号或密码不正确。");
      if(body.mergeGuest!==undefined&&typeof body.mergeGuest!=="boolean")invalid("mergeGuest 必须是布尔值。");
      if(body.mergeGuest&&session.userId!==user.id&&(await store.publicUser(session.userId))?.isGuest){
        const guest=(await store.getArchive(session.userId)).archive;
        if(!guest.profile.demo){const remote=await store.getArchive(user.id);const a=remote.archive;a.owned=[...new Set([...a.owned,...guest.owned])];a.wishlist=[...new Set([...a.wishlist,...guest.wishlist])].filter(x=>!a.owned.includes(x));a.plan=[...new Set([...a.plan,...guest.plan])];await store.saveArchive(user.id,a,remote.revision);}
      }
      return json(res,200,await sessionPayload(await issue(res,user.id,cookies(req)[cookieName])));
    }
    if(pathname==="/api/auth/logout")return json(res,200,await sessionPayload(await issue(res,await store.createGuest(),cookies(req)[cookieName])));
    const revision=revisionOf(body.revision);
    if(pathname==="/api/archive")return json(res,200,await store.saveArchive(session.userId,body.archive,revision));
    const current=await store.getArchive(session.userId),a=current.archive;
    if(pathname==="/api/profile")a.profile={...a.profile,...body.profile};
    if(pathname==="/api/preferences")a.preferences={...a.preferences,...body.preferences};
    if(pathname==="/api/wishlist")a.wishlist=body.keys;
    if(pathname==="/api/plan")a.plan=body.keys;
    if(collectionMatch){
      const key=collectionMatch[1];if(!store.keys.has(key))throw new ApiError(404,"item_not_found","图鉴条目不存在。");
      if(!["owned","wishlist","planned"].some(k=>Object.hasOwn(body,k)))invalid("请提供要修改的收藏状态。");
      for(const [field,list]of [["owned","owned"],["wishlist","wishlist"],["planned","plan"]])if(Object.hasOwn(body,field)){if(typeof body[field]!=="boolean")invalid("收藏状态必须是布尔值。");a[list]=body[field]?[...new Set([...a[list],key])]:a[list].filter(x=>x!==key);}
    }
    return json(res,200,await store.saveArchive(session.userId,a,revision));
  }
  const server=http.createServer(async(req,res)=>{
    const requestId=randomUUID();res.setHeader("X-Request-Id",requestId);res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Content-Security-Policy","default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try{
      const url=new URL(req.url,"http://localhost");let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{throw new ApiError(400,"invalid_path","路径格式无效。");}
      if(pathname.includes("..")||pathname.includes("\\")||pathname.split("/").some(s=>s.startsWith(".")))throw new ApiError(403,"forbidden","禁止访问。");
      if(pathname.startsWith("/api/"))return await api(req,res,url,pathname);
      if(!["GET","HEAD"].includes(req.method))throw new ApiError(405,"method_not_allowed","请求方式不支持。");
      if(!["/","/index.html","/app.js","/api-client.js","/archive-model.js","/style.css","/catalog.json","/favicon.svg"].includes(pathname)&&!/^\/assets\/[a-zA-Z0-9_-]+\.(webp|jpg|png|svg)$/.test(pathname))throw new ApiError(404,"not_found","未找到文件。");
      const filename=path.join(root,pathname==="/"?"index.html":pathname);if(!(await stat(filename)).isFile())throw new ApiError(404,"not_found","未找到文件。");const buffer=await readFile(filename);
      res.writeHead(200,{"Content-Type":mime[path.extname(filename)],"Cache-Control":pathname.startsWith("/assets/")?"public, max-age=86400":"no-cache"});res.end(req.method==="HEAD"?undefined:buffer);
    }catch(error){
      if(res.headersSent){res.end();return;}
      if(error instanceof ApiError)return json(res,error.status,{error:{code:error.code,message:error.message},...error.details,requestId});
      if(error.code==="ENOENT")return json(res,404,{error:{code:"not_found",message:"未找到文件。"},requestId});
      logger.error?.("Request failed",requestId,error.message);json(res,500,{error:{code:"internal_error",message:"服务暂时不可用，请稍后重试。"},requestId});
    }
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  return {server,store,async listen(port=0,host="127.0.0.1"){await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,host,()=>{server.removeListener("error",reject);resolve();});});return server.address();},async close(){if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await store.close();}};
}
