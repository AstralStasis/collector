import test from "./support/test.mjs";
import { strict as assert } from "assert";
import http from "http";
import path from "path";
import os from "os";
import { readFile, writeFile, mkdtemp, rm } from "./support/files.mjs";
import { randomUUID, randomToken, loadEnvFile, hasOwn } from "../server/runtime.mjs";
import { createStore } from "../server/store.mjs";
import fetch, { timeoutSignal } from "../scripts/http.mjs";
import { downloadImage } from "../scripts/sync-collect-assets.mjs";

const fixtureCatalog={meta:{runtimeFixture:true},items:[{key:"mounts-1",id:1,category:"mounts",name:"兼容测试",english:"Runtime fixture",patch:"2.0",sourceType:"任务奖励",source:"测试",image:"assets/test.webp"}]};

test("runtime UUID and session tokens keep their existing formats",()=>{
  const ids=Array.from({length:100},()=>randomUUID());
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(randomToken(32),/^[A-Za-z0-9_-]{43}$/);
  assert.match(randomToken(24),/^[A-Za-z0-9_-]{32}$/);
  assert.equal(hasOwn(Object.create({inherited:true}),"inherited"),false);
  assert.equal(hasOwn({zero:0},"zero"),true);
});

test("environment loading preserves inherited values and parses quoted values",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"collector-env-"));
  const suffix=randomUUID().split("-").join("");
  const inherited="COLLECTOR_TEST_INHERITED_"+suffix,value="COLLECTOR_TEST_VALUE_"+suffix;
  process.env[inherited]="from-process";
  try{
    const filename=path.join(root,"test.env");
    await writeFile(filename,inherited+'=from-file\n'+value+'="中文 # value"\n');
    loadEnvFile(filename);
    assert.equal(process.env[inherited],"from-process");
    assert.equal(process.env[value],"中文 # value");
  }finally{delete process.env[inherited];delete process.env[value];await rm(root,{recursive:true,force:true});}
});

test("SQLite files preserve committed data, reject a second writer and produce readable backups",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"collector-sqlite-runtime-"));
  const filename=path.join(root,"archive.sqlite"),backup=path.join(root,"backup.sqlite");
  let store,restored;
  try{
    store=await createStore({client:"sqlite",filename});
    await store.seedCatalog(fixtureCatalog);
    const id=await store.createGuest(),before=await store.getArchive(id);
    await assert.rejects(createStore({client:"sqlite",filename}));
    assert.throws(()=>store.transaction(()=>{
      store.db.prepare("UPDATE profiles SET display_name=? WHERE user_id=?").run("must-rollback",id);
      throw new Error("intentional rollback");
    }),/intentional rollback/);
    assert.equal((await store.publicUser(id)).username,null);
    assert.deepEqual(await store.getArchive(id),before);
    await store.backup(backup);
    assert.equal((await readFile(backup)).subarray(0,15).toString("ascii"),"SQLite format 3");
    restored=await createStore({client:"sqlite",filename:backup});
    assert.deepEqual(await restored.getArchive(id),before);
    await restored.close();restored=undefined;
    await store.close();store=undefined;
    store=await createStore({client:"sqlite",filename});
    assert.deepEqual(await store.getArchive(id),before);
    assert.equal((await store.publicUser(id)).username,null);
  }finally{
    if(restored)await restored.close();
    if(store)await store.close();
    await rm(root,{recursive:true,force:true});
  }
});

async function httpFixture(t){
  const sockets=new Set();
  const image=await readFile(new URL("../assets/mounts-186.webp",import.meta.url));
  const server=http.createServer((req,res)=>{
    if(req.url==="/wait")return;
    if(req.url==="/image"){res.writeHead(200,{"Content-Type":"image/webp"});res.end(image);return;}
    if(req.url==="/html"){res.writeHead(200,{"Content-Type":"text/html"});res.end("<html>not an image</html>");return;}
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({value:0,flag:false}));
  });
  server.on("connection",socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));});
  t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  return "http://127.0.0.1:"+server.address().port;
}

test("HTTP compatibility supports JSON, abort timeouts and unchanged globals",async t=>{
  const original=globalThis.fetch,origin=await httpFixture(t);
  const result=await fetch(origin+"/json",{signal:timeoutSignal(5000)});
  assert.deepEqual(await result.json(),{value:0,flag:false});
  await assert.rejects(fetch(origin+"/wait",{signal:timeoutSignal(30)}),error=>error.name==="AbortError");
  assert.equal(globalThis.fetch,original);
});

test("asset downloader validates actual bytes through the Node12 HTTP layer",async t=>{
  const origin=await httpFixture(t);
  const image=await downloadImage(origin+"/image",{retries:0,timeout:5000});
  assert.equal(image.format,"webp");assert.ok(image.data.length>20);
  await assert.rejects(downloadImage(origin+"/html",{retries:0,timeout:5000}),/unsupported image data/);
});
