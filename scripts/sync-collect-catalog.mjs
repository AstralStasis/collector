import path from "node:path";
import {readFile, writeFile, mkdir, rename, stat} from "node:fs/promises";
import {fileURLToPath, pathToFileURL} from "node:url";

export const COLLECTION_ENDPOINTS = Object.freeze({mounts:"mounts",minions:"minions",emotes:"emotes",orchestrions:"orchestrions",bardings:"bardings",cards:"triad/cards",facewear:"facewear",fashions:"fashions",frames:"frames"});
export const API_BASE = "https://ffxivcollect.com/api/";
// These two seasonal rewards were already deliberately excluded from the site's
// current collection. A patch number or 0% ownership alone is not a release flag.
export const DEFERRED_ITEMS = Object.freeze({"mounts-419":"2026 圣芒星节奖励；活动开放后再纳入当前收集清单。","minions-560":"2027 降神节奖励；活动开放后再纳入当前收集清单。"});
const sourceTypes = {Event:"活动奖励","Gold Saucer":"金碟游乐场",Achievement:"成就奖励",Quest:"任务奖励",PvP:"PvP","Occult Crescent":"新月岛",Premium:"商城特典","Cosmic Exploration":"宇宙探索",Trial:"讨伐歼灭战","Wondrous Tails":"天书奇谈","V&C Dungeon":"多变迷宫",Raid:"团队任务","Deep Dungeon":"深层迷宫",Tribal:"友好部族","Treasure Hunt":"藏宝图","Chaotic Raid":"纷争副本",Hunts:"狩猎兑换",Gathering:"采集",FATE:"危命任务",Purchase:"商人购买","Island Sanctuary":"无人岛开拓",Bozja:"博兹雅",Skybuilders:"伊修加德重建",Crafting:"制作",Eureka:"优雷卡",Dungeon:"迷宫掉落",Voyages:"潜水艇探险",Other:"其他",Venture:"雇员探险",Beastmaster:"驯兽师",NPC:"幻卡对战"};
const currencyRules = [
  {currency:"gemstones",currencyName:"双色宝石",pattern:/(\d[\d,]*)\s+Bicolor Gemstones?/i},
  {currency:"mgp",currencyName:"金碟币",pattern:/(\d[\d,]*)\s+MGP\b/i},
  {currency:"allied",currencyName:"同盟徽章",pattern:/(\d[\d,]*)\s+Allied Seals?/i},
  {currency:"centurio",currencyName:"兵团徽章",pattern:/(\d[\d,]*)\s+Centurio Seals?/i},
  {currency:"nuts",currencyName:"怪物狩猎的战利品",pattern:/(\d[\d,]*)\s+Sacks? of Nuts/i},
];
const regions = {
  Lakeland:["5.0","雷克兰德"],Kholusia:["5.0","珂露西亚岛"],"Amh Araeng":["5.0","安穆艾兰"],"Il Mheg":["5.0","伊尔美格"],"Rak'tika Greatwood":["5.0","拉凯提卡大森林"],Tempest:["5.0","黑风海"],
  Labyrinthos:["6.0","迷津"],Thavnair:["6.0","萨维奈岛"],Garlemald:["6.0","加雷马"],"Mare Lamentorum":["6.0","叹息海"],Elpis:["6.0","厄尔庇斯"],"Ultima Thule":["6.0","天外天垓"],
  Urqopacha:["7.0","奥阔帕恰山"],"Kozama'uka":["7.0","克扎玛乌卡湿地"],"Yak T'el":["7.0","亚克特尔树海"],Shaaloani:["7.0","夏劳尼荒野"],"Heritage Found":["7.0","遗产之地"],"Living Memory":["7.0","活着的记忆"],
};
const hasChinese = value => /[\u3400-\u9fff]/u.test(value || "");
const sameSources = (a,b) => JSON.stringify((a || []).map(x=>[x.type,String(x.text || "").normalize("NFKC").toLowerCase()])) === JSON.stringify((b || []).map(x=>[x.type,String(x.text || "").normalize("NFKC").toLowerCase()]));
export function ownershipPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) throw new Error("Invalid API ownership percentage: " + value);
  const number = Number(match[1]);
  if (number > 100) throw new Error("API ownership percentage exceeds 100");
  return number;
}
export function validateList(value, label) {
  if (!value || !Array.isArray(value.results) || value.count !== value.results.length || value.results.length === 0) throw new Error("Incomplete API list: " + label);
  const ids = new Set();
  for (const row of value.results) {
    if (!Number.isSafeInteger(row.id) || row.id < 1 || !row.name || ids.has(row.id)) throw new Error("Invalid/duplicate API id: " + label);
    ids.add(row.id);
  }
  return value.results;
}
export function deriveExchanges(sources) {
  const exchanges=[];
  let allExchange=sources.length > 0;
  for(const source of sources) {
    const text=source.text || "";
    const rule=currencyRules.find(rule=>rule.pattern.test(text));
    if(!rule){allExchange=false;continue;}
    const amount=Number(text.match(rule.pattern)[1].replaceAll(",",""));
    const location=Object.entries(regions).find(([en])=>text.includes(en))?.[1] || ["",""];
    // Gemstone vouchers and unnamed vendors do not establish a regional rank.
    const rank=text.match(/Rank\s+(\d+)/i);
    exchanges.push({currency:rule.currency,currencyName:rule.currencyName,amount,expansion:location[0],region:location[1],rank:rank?Number(rank[1]):null,original:text});
  }
  return {exchanges,exchangeExclusive:allExchange && exchanges.length > 0};
}
function translateSources(sources) {
  return sources.map(source=>[sourceTypes[source.type] || source.type,source.text].filter(Boolean).join("：")).join("；");
}
function safeImage(value) {
  if (!value) return null;
  const url=new URL(value);
  if(url.protocol !== "https:" || !["ffxivcollect.com","v2.xivapi.com","xivapi-v2.xivcdn.com"].includes(url.hostname)) throw new Error("Unexpected API image host");
  return url.href;
}
export function adaptCollectible(category, english, localized, existing, fetchedAt, imageMap={}) {
  if(english.id !== localized.id) throw new Error("Localized API ID mismatch");
  const key=category+"-"+english.id;
  const raw={...english,...localized};
  const sources=Array.isArray(raw.sources)?raw.sources:[];
  const englishSources=Array.isArray(english.sources)?english.sources:[];
  const preserveSource=existing?.source && sameSources(existing.sourceOriginal,englishSources);
  const name=existing?.name && hasChinese(existing.name)?existing.name:raw.name || english.name;
  const originalImage=safeImage(raw.image || raw.icon);
  if(!originalImage) throw new Error("API item has no image: " + key);
  const image=imageMap[key]?.image || existing?.image || "assets/"+key+".webp";
  const derived=deriveExchanges(englishSources);
  const translatedSource=translateSources(sources);
  const source=preserveSource?existing.source:translatedSource || "FFXIV Collect API 未提供具体获取途径，请在游戏内核对。";
  const sourceType=preserveSource && existing.sourceType?existing.sourceType:sourceTypes[sources[0]?.type] || "资料未提供";
  const result={...existing,key,id:raw.id,category,name,english:english.name,canonicalName:raw.name,nameLanguage:hasChinese(name)?"zh-CN":"en",nameStatus:existing?.nameStatus || (hasChinese(raw.name)?"verified_chinese_collect_api":"api_english_fallback"),nameSource:existing?.nameSource || API_BASE+COLLECTION_ENDPOINTS[category]+"/"+raw.id+"?language=chs",
    description:raw.description || (category === "emotes" && raw.command ? "表情指令："+raw.command : ""),enhancedDescription:raw.enhanced_description || "",tooltip:raw.tooltip || "",source,sourceEnglish:englishSources.map(s=>[s.type,s.text].filter(Boolean).join(": ")).join("；"),sourceType,sourceOriginal:englishSources,sourceUrl:"https://ffxivcollect.com/"+COLLECTION_ENDPOINTS[category]+"/"+raw.id,
    patch:String(raw.patch),ownedRate:ownershipPercent(raw.owned),premium:englishSources.some(s=>s.type === "Premium"),image,originalImage,command:raw.command ?? null,
    ...derived,acquisitionIncomplete:sources.length === 0,collect:{apiUrl:API_BASE+COLLECTION_ENDPOINTS[category]+"/"+raw.id+"?language=chs",fetchedAt,language:"chs",data:raw}};
  if(preserveSource && existing.exchanges?.length) Object.assign(result,{exchanges:existing.exchanges,exchangeExclusive:existing.exchangeExclusive === true});
  if(!result.description) result.description=category === "frames" && raw.item_name?raw.item_name:"FFXIV Collect API 未提供条目说明。";
  if(category === "cards") Object.assign(result,{stars:raw.stars,cardNumber:raw.number,cardStats:raw.stats?.numeric || null});
  if(imageMap[key]) Object.assign(result,imageMap[key]);
  return result;
}
export function buildCatalog(current, snapshots, {fetchedAt=new Date().toISOString(),imageMap={}}={}) {
  if(!current?.meta || !Array.isArray(current.items)) throw new Error("Existing catalog is required to preserve archive keys");
  const oldByKey=new Map(current.items.map(x=>[x.key,x]));
  if(oldByKey.size !== current.items.length) throw new Error("Existing catalog has duplicate keys");
  const ordinary=[];
  const counts={};
  const deferred=[];
  for(const [category,endpoint] of Object.entries(COLLECTION_ENDPOINTS)) {
    const english=validateList(snapshots[category]?.en,category+":en");
    const localized=validateList(snapshots[category]?.chs,category+":chs");
    const localizedById=new Map(localized.map(x=>[x.id,x]));
    if(english.length !== localized.length || english.some(x=>!localizedById.has(x.id))) throw new Error("Localized ID coverage differs: "+category);
    counts[category]={endpoint:API_BASE+endpoint,apiCount:english.length,included:0};
    for(const row of english) {
      const key=category+"-"+row.id;
      if(DEFERRED_ITEMS[key] && !oldByKey.has(key)){deferred.push({key,reason:DEFERRED_ITEMS[key],patch:row.patch,sources:row.sources});continue;}
      ordinary.push(adaptCollectible(category,row,localizedById.get(row.id),oldByKey.get(key),fetchedAt,imageMap));counts[category].included++;
    }
  }
  const relics=validateList(snapshots.relics?.en,"relics:en");
  const localizedRelics=validateList(snapshots.relics?.chs,"relics:chs");
  const relicById=new Map(relics.map(x=>[x.id,x])),localizedRelicById=new Map(localizedRelics.map(x=>[x.id,x]));
  if(relics.length !== localizedRelics.length || relics.some(x=>!localizedRelicById.has(x.id))) throw new Error("Localized ID coverage differs: relics");
  const equipment=current.items.filter(x=>["relics","ultimates","tools"].includes(x.category)).map(item=>{
    const raw=localizedRelicById.get(item.id) || relicById.get(item.id);
    if(!raw)return {...item,collect:{apiUrl:API_BASE+"relics",fetchedAt,coverage:"not_in_api",reason:"FFXIV Collect 装备 API 未单列此物品；保留已核对的游戏物品编号及既有资料。"}};
    const expected={relics:"weapons",ultimates:"ultimate",tools:"tools"}[item.category];
    if(raw.type?.category !== expected)throw new Error("Equipment category mismatch: "+item.key);
    return {...item,canonicalName:raw.name,ownedRate:ownershipPercent(raw.owned),collect:{apiUrl:API_BASE+"relics/"+item.id+"?language=chs",fetchedAt,language:"chs",data:raw}};
  });
  const freshByKey=new Map([...ordinary,...equipment].map(x=>[x.key,x]));
  // A source removal must never silently remove a user's collection key.
  for(const item of current.items)if(!freshByKey.has(item.key))freshByKey.set(item.key,{...item,collect:{...item.collect,coverage:"not_in_api",fetchedAt}});
  const items=current.items.map(x=>freshByKey.get(x.key));
  const existingKeys=new Set(current.items.map(x=>x.key));
  items.push(...[...freshByKey.values()].filter(x=>!existingKeys.has(x.key)));
  if(items.some(x=>!x.name || !x.source || !x.image || typeof x.patch !== "string")) throw new Error("Incomplete normalized collectible");
  const date=fetchedAt.slice(0,10);
  const meta={...current.meta,curated:false,fetchedAt:date,notice:"九类普通收藏按 FFXIV Collect API 全量列表整理；特殊装备保留既有终阶段范围。所有既有条目编号与收藏记录保持兼容，API 字段缺失明确标示，版本与可获取状态以游戏内为准。",patchNotice:"资料同步日期 "+date+"。API 分配版本不等于活动已开放；两条既有明确延后收录的季节奖励保留排除说明。中文文本存在不代表国服已经开放。",apiSync:{fetchedAt,source:API_BASE,endpointCounts:counts,deferred,equipmentMatched:equipment.filter(x=>x.collect.data).length,equipmentNotListed:equipment.filter(x=>!x.collect.data).map(x=>x.key),total:items.length,ordinaryTotal:ordinary.length,notice:"列表 count 与 results.length 及双语 ID 集合均已校验；完整原始条目保存在 collect.data。肖像 API 不提供获取来源，盾牌 API 未覆盖不视为无持有者。"},equipment:{...current.meta.equipment,apiFetchedAt:date,ownershipSource:API_BASE+"relics",notice:`保留六代战职肝武终阶段、七个绝本武器系列与五个生产采集工具系列，共${equipment.length}件。按游戏物品ID匹配API，未单列的${equipment.filter(x=>!x.collect.data).length}件保留原资料与空持有率。不包含全部中间强化阶段。`},mindmap:{...current.meta.mindmap,notice:"按思维导图组织收藏类型与兑换路径，九类普通收藏覆盖同步时API完整列表（明确延后季节奖励除外），装备为既有终阶段收录。兑换独占仅表示API所列来源均为对应货币兑换，不推断游戏绝对独占。"}};
  return {meta,items};
}
async function readJson(filename){return JSON.parse((await readFile(filename,"utf8")).replace(/^\uFEFF/,""));}
async function fetchList(endpoint,language,cacheDirectory) {
  const filename=path.join(cacheDirectory,endpoint.replaceAll("/","-")+"."+language+".json");
  const response=await fetch(API_BASE+endpoint+"?language="+language,{headers:{Accept:"application/json","User-Agent":"EorzeaArchive catalog updater"},signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error("API request failed "+response.status+": "+endpoint);
  const data=await response.json();validateList(data,endpoint+":"+language);
  await mkdir(cacheDirectory,{recursive:true});await writeFile(filename,JSON.stringify(data));return data;
}
export async function loadSnapshots({cacheDirectory,offline=false}) {
  const snapshots={};
  for(const [category,endpoint] of [...Object.entries(COLLECTION_ENDPOINTS),["relics","relics"]]) {
    snapshots[category]={};
    for(const language of ["en","chs"]) snapshots[category][language]=offline?await readJson(path.join(cacheDirectory,endpoint.replaceAll("/","-")+"."+language+".json")):await fetchList(endpoint,language,cacheDirectory);
  }
  return snapshots;
}
export async function validateCatalogImages(catalog, root) {
  const images=new Set(catalog.items.map(item=>item.image));
  for(const image of images) {
    if(typeof image !== "string" || !/^assets\/[A-Za-z0-9._-]+\.(?:webp|png|jpg)$/.test(image)) throw new Error("Catalog image is not a supported local asset: "+image);
    const info=await stat(path.join(root,image)).catch(()=>null);
    if(!info?.isFile() || info.size === 0) throw new Error("Catalog image is missing or empty: "+image);
  }
  return images.size;
}
async function main() {
  const root=fileURLToPath(new URL("../",import.meta.url));
  const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
  const cacheDirectory=path.resolve(value("--cache-dir") || path.join(root,"data/collect-cache"));
  const current=await readJson(path.join(root,"catalog.json"));
  const snapshots=await loadSnapshots({cacheDirectory,offline:args.includes("--offline")});
  const imageMapFile=value("--image-map");
  let catalog=buildCatalog(current,snapshots,{imageMap:imageMapFile?await readJson(path.resolve(imageMapFile)):{}});
  if(!args.includes("--skip-assets")) {
    const {syncCatalogAssets}=await import("./sync-collect-assets.mjs");
    const result=await syncCatalogAssets({catalog,root,concurrency:4});
    if(result.failures?.length || result.missing?.length || catalog.items.some(item=>!result.imageMap?.[item.key]?.image)) throw new Error("Image sync is incomplete; catalog was not replaced");
    catalog={...catalog,items:catalog.items.map(item=>({...item,...result.imageMap[item.key]}))};
  }
  await validateCatalogImages(catalog,root);
  const output=path.resolve(value("--output") || path.join(root,"catalog.json"));
  const temporary=output+".tmp";
  await writeFile(temporary,JSON.stringify(catalog,null,2)+"\n");await rename(temporary,output);
  console.log(JSON.stringify({total:catalog.items.length,ordinary:catalog.meta.apiSync.ordinaryTotal,equipmentMatched:catalog.meta.apiSync.equipmentMatched,equipmentNotListed:catalog.meta.apiSync.equipmentNotListed.length,deferred:catalog.meta.apiSync.deferred.map(x=>x.key),output}));
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
