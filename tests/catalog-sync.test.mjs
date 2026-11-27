import test from "node:test";
import assert from "node:assert/strict";
import {readFile,stat,mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs,extractSharedIcon} from "../scripts/sync-collect-assets.mjs";
import {COLLECTION_ENDPOINTS,buildCatalog,ownershipPercent,deriveExchanges,validateList,validateCatalogImages} from "../scripts/sync-collect-catalog.mjs";
const image="https://v2.xivapi.com/api/asset?format=webp&path=ui/icon/068000/068146_hr1.tex";
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const snapshots={};
  for(const category of Object.keys(COLLECTION_ENDPOINTS)) {
    const en={id:1,name:category+" item",description:"Official description",enhanced_description:"Official background",tooltip:"Quotation",patch:"2.0",owned:"0%",image,icon:image,item_id:null,tradeable:null,sources:[{type:"Achievement",text:"Example",related_type:"Achievement",related_id:2227}]};
    const chs={...en,name:"资料库中文名称",description:"真实中文说明",enhanced_description:"真实背景",sources:[{type:"Achievement",text:"示例成就",related_type:"Achievement",related_id:2227}]};
    snapshots[category]={en:{count:1,results:[en]},chs:{count:1,results:[chs]}};
  }
  snapshots.relics={en:{count:1,results:[{id:10054,name:"Excalibur Zeta",owned:"7.4%",type:{category:"weapons",name:"A Relic Reborn"}}]},chs:{count:1,results:[{id:10054,name:"王者之剑·本我",owned:"7.4%",type:{category:"weapons",name:"A Relic Reborn"}}]}};
  const current={meta:{equipment:{},mindmap:{}},items:[{key:"mounts-1",id:1,category:"mounts",name:"保留的中文别名",english:"Old",description:"Old",source:"已核对的中文来源",sourceType:"成就奖励",sourceOriginal:snapshots.mounts.en.results[0].sources,patch:"2.0",image:"assets/mounts-1.webp"},{key:"weapon-10054",id:10054,category:"relics",name:"王者之剑·本我",english:"Excalibur Zeta",source:"既有任务资料",sourceType:"武器强化",patch:"2.51",image:"assets/weapon-10054.webp",ownedRate:null},{key:"weapon-10063",id:10063,category:"relics",name:"圣盾·本我",english:"Aegis Shield Zeta",source:"既有任务资料",sourceType:"武器强化",patch:"2.51",image:"assets/weapon-10063.webp",ownedRate:null}]};
  return {snapshots,current};
}
test("API percentages preserve a real zero and distinguish unknown",()=>{assert.equal(ownershipPercent("0%"),0);assert.equal(ownershipPercent("6.5%"),6.5);assert.equal(ownershipPercent(null),null);assert.throws(()=>ownershipPercent("unknown"));assert.throws(()=>ownershipPercent("101%"));});
test("incomplete and duplicate API lists fail closed",()=>{assert.throws(()=>validateList({count:2,results:[{id:1,name:"one"}]},"test"));assert.throws(()=>validateList({count:2,results:[{id:1,name:"one"},{id:1,name:"duplicate"}]},"test"));});
test("import enriches detail while preserving old keys, Chinese names and verified sources",()=>{
  const {current,snapshots}=fixture();const before=clone(current);
  const result=buildCatalog(current,snapshots,{fetchedAt:"2026-11-27T04:00:00.000Z"});
  assert.deepEqual(current,before);
  for(const old of current.items)assert.ok(result.items.some(item=>item.key===old.key));
  const mount=result.items.find(item=>item.key==="mounts-1");
  assert.equal(mount.name,"保留的中文别名");assert.equal(mount.canonicalName,"资料库中文名称");assert.equal(mount.description,"真实中文说明");assert.equal(mount.enhancedDescription,"真实背景");assert.equal(mount.source,"已核对的中文来源");assert.equal(mount.collect.data.item_id,null);assert.equal(mount.collect.data.tradeable,null);assert.equal(mount.collect.data.sources[0].related_id,2227);assert.equal(mount.ownedRate,0);
  assert.equal(result.items.find(item=>item.key==="weapon-10054").ownedRate,7.4);
  const shield=result.items.find(item=>item.key==="weapon-10063");assert.equal(shield.ownedRate,null);assert.equal(shield.collect.coverage,"not_in_api");assert.equal(shield.source,"既有任务资料");
});
test("source changes refresh normalized sources and do not retain stale acquisition text",()=>{
  const {current,snapshots}=fixture();snapshots.mounts.en.results[0].sources=[{type:"Quest",text:"New quest"}];snapshots.mounts.chs.results[0].sources=[{type:"Quest",text:"新任务"}];const row=buildCatalog(current,snapshots).items.find(item=>item.key==="mounts-1");assert.equal(row.source,"任务奖励：新任务");assert.equal(row.sourceType,"任务奖励");
});
test("missing API fields stay missing and unknown frames acquisition is explicit",()=>{
  const {current,snapshots}=fixture();for(const language of ["en","chs"]){delete snapshots.frames[language].results[0].sources;delete snapshots.frames[language].results[0].tradeable;delete snapshots.frames[language].results[0].item_id;}
  const frame=buildCatalog(current,snapshots).items.find(item=>item.key==="frames-1");assert.equal(frame.acquisitionIncomplete,true);assert.equal(frame.collect.data.tradeable,undefined);assert.match(frame.source,/未提供/);assert.deepEqual(frame.sourceOriginal,[]);
});
test("a partial localized list and unsafe upstream image are rejected",()=>{
  const {current,snapshots}=fixture();snapshots.mounts.chs.results[0].id=2;assert.throws(()=>buildCatalog(current,snapshots),/coverage/);
  snapshots.mounts.chs.results[0].id=1;snapshots.mounts.chs.results[0].image="https://example.com/icon.webp";assert.throws(()=>buildCatalog(current,snapshots),/image host/);
});
test("exchange-only classification does not promote mixed acquisition methods",()=>{
  const only=deriveExchanges([{type:"Gold Saucer",text:"20,000 MGP"}]);assert.equal(only.exchanges[0].amount,20000);assert.equal(only.exchangeExclusive,true);
  const mixed=deriveExchanges([{type:"Gold Saucer",text:"20,000 MGP"},{type:"Quest",text:"A quest"}]);assert.equal(mixed.exchangeExclusive,false);
  const gem=deriveExchanges([{type:"FATE",text:"Rral Wuruq - Yak T'el - 700 Bicolor Gemstones (Rank 4)"}]);assert.deepEqual([gem.exchanges[0].region,gem.exchanges[0].expansion,gem.exchanges[0].rank],["亚克特尔树海","7.0",4]);
});
test("catalog replacement rejects missing or non-local images",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"collector-images-"));
  try {
    await mkdir(path.join(root,"assets"));
    await writeFile(path.join(root,"assets","valid.webp"),Buffer.from([1]));
    assert.equal(await validateCatalogImages({items:[{image:"assets/valid.webp"},{image:"assets/valid.webp"}]},root),1);
    await assert.rejects(validateCatalogImages({items:[{image:"assets/missing.webp"}]},root),/missing or empty/);
    await assert.rejects(validateCatalogImages({items:[{image:"https://ffxivcollect.com/image.webp"}]},root),/local asset/);
    await assert.rejects(validateCatalogImages({items:[{image:"assets/../escape.webp"}]},root),/local asset/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test("asset CLI defaults to the portable current-catalog workflow",()=>{
  const options=parseArgs([]);assert.equal(options.expandApi,false);
  assert.equal(options.apiCache,fileURLToPath(new URL("../data/collect-cache",import.meta.url)));
  assert.equal(options.cacheDir,fileURLToPath(new URL("../data/collect-assets",import.meta.url)));
  assert.equal(parseArgs(["--expand-api"]).expandApi,true);
});
test("shared icon discovery accepts only the expected official asset name",()=>{
  const html='<img src="/assets/frame-a1b2c3.webp">';
  assert.equal(extractSharedIcon(html,"https://ffxivcollect.com/images/frame.webp"),"https://ffxivcollect.com/assets/frame-a1b2c3.webp");
  assert.equal(extractSharedIcon(html,"https://example.com/images/frame.webp"),null);
  assert.equal(extractSharedIcon(html,"https://ffxivcollect.com/images/orchestrion.webp"),null);
});
test("catalog snapshot has unique keys, complete API metadata and local images",async()=>{
  const catalog=JSON.parse(await readFile(new URL("../catalog.json",import.meta.url),"utf8"));
  assert.equal(new Set(catalog.items.map(item=>item.key)).size,catalog.items.length);
  assert.ok(catalog.meta.apiSync,"The checked-in catalog must contain a complete API synchronization snapshot.");
  assert.equal(catalog.meta.apiSync.total,catalog.items.length);assert.equal(catalog.meta.apiSync.ordinaryTotal,catalog.items.filter(item=>Object.hasOwn(COLLECTION_ENDPOINTS,item.category)).length);
  for(const item of catalog.items){assert.match(item.image,/^assets\/[a-zA-Z0-9_-]+\.(webp|png|jpg)$/);assert.ok((await stat(new URL("../"+item.image,import.meta.url))).size>0);assert.ok(item.collect);assert.ok(item.name&&item.source);if(item.collect.data)assert.equal(item.collect.data.id,item.id);assert.ok(item.ownedRate===null||(Number.isFinite(item.ownedRate)&&item.ownedRate>=0&&item.ownedRate<=100));}
  assert.equal(catalog.items.find(item=>item.key==="emotes-217").name,"啦哩吼舞");assert.equal(catalog.items.find(item=>item.key==="emotes-198").name,"绅士舞步");
  const ozma=catalog.items.find(item=>item.key==="mounts-186");assert.equal(ozma.collect.data.item_id,24626);assert.ok(ozma.enhancedDescription.length>20);
});
