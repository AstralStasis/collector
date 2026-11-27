import { ArchiveApi, ArchiveSynchronizer } from "./api-client.js";
const $ = (selector, root = document) => root.querySelector(selector);
// Keep nullish defaults lazy and preserve optional method receivers on Node 12.
const optional = (value, read) => value === null || value === undefined ? undefined : read(value);
const valueOr = (value, fallback) => value === null || value === undefined ? fallback() : value;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const esc = (value) =>
  String(valueOr(value, () => "")).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
const paths = {
  star: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"/><path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7Z"/>',
  sparkles:
    '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/><path d="m21 2 .4 1.6L23 4l-1.6.4L21 6l-.4-1.6L19 4l1.6-.4Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  mount:
    '<path d="m4 19 1-8 4-5 3 1 2-4 2 4 4 3-1 5-6 1-1 4M8 7l2 5-3 7M12 7l2 5 6-2"/><circle cx="16.5" cy="10" r=".5" fill="currentColor"/>',
  pet: '<path d="M8 15c-4 5 0 8 4 5 4 3 8 0 4-5l-2-2a3 3 0 0 0-4 0Z"/><ellipse cx="4.7" cy="10" rx="2" ry="3" transform="rotate(-25 4.7 10)"/><ellipse cx="9" cy="5" rx="1.8" ry="2.8" transform="rotate(-10 9 5)"/><ellipse cx="15" cy="5" rx="1.8" ry="2.8" transform="rotate(10 15 5)"/><ellipse cx="19.3" cy="10" rx="2" ry="3" transform="rotate(25 19.3 10)"/>',
  emote:
    '<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01" stroke-width="2"/>',
  music:
    '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="5.5" cy="18.5" rx="3.5" ry="2.5"/><ellipse cx="17.5" cy="16.5" rx="3.5" ry="2.5"/>',
  sword:
    '<path d="m15 3 6 0 0 6-10 10-6-6Z"/><path d="m4 12 8 8M8 16l-5 5m0-4 4 4M12 12l6-6"/>',
  hammer:
    '<path d="m14 3 7 7-4 4-3-3L5 21l-3-3 10-9-3-3Z"/><path d="m9 6 5 5"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  route:
    '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v7a4 4 0 0 0 4 4h2m6-1v-7a4 4 0 0 0-4-4h-2M10 4l2 2-2 2m4 8-2 2 2 2"/>',
  trophy:
    '<path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v6m-4 3h8m-7-3h6v3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  settings:
    '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  book: '<path d="M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  compass:
    '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  folder:
    '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  filter:
    '<path d="M4 6h16M7 12h10M10 18h4"/><circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  external:
    '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>',
  feather:
    '<path d="M20 3c-7-2-12 3-12 9v4h4c6 0 10-6 8-13ZM3 21 16 8M8 16v-5m0 5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh:
    '<path d="M3 10a9 9 0 0 1 15-5l3 3M21 2v6h-6M21 14A9 9 0 0 1 6 19l-3-3M3 22v-6h6"/>',
};
const categories = {
  "ultimates": {
    "name": "绝本武器",
    "title": "绝本武器",
    "icon": "sword",
    "color": "#bf94d3",
    "english": "ULTIMATE WEAPONS"
  },
  "relics": {
    "name": "战职肝武",
    "title": "战职肝武",
    "icon": "sword",
    "color": "#bca0d1",
    "english": "RELIC WEAPONS"
  },
  "tools": {
    "name": "生产采集",
    "title": "生产采集",
    "icon": "hammer",
    "color": "#83b99e",
    "english": "CRAFTING & GATHERING"
  },
  "mounts": {
    "name": "坐骑",
    "title": "坐骑",
    "icon": "mount",
    "color": "#d7b77d",
    "english": "MOUNTS"
  },
  "minions": {
    "name": "宠物",
    "title": "宠物",
    "icon": "pet",
    "color": "#b1a2df",
    "english": "MINIONS"
  },
  "bardings": {
    "name": "鸟甲",
    "title": "鸟甲",
    "icon": "mount",
    "color": "#bfaa85",
    "english": "CHOCOBO BARDING"
  },
  "orchestrions": {
    "name": "乐谱",
    "title": "乐谱",
    "icon": "music",
    "color": "#84a6ce",
    "english": "ORCHESTRION ROLLS"
  },
  "cards": {
    "name": "九宫幻卡",
    "title": "九宫幻卡",
    "icon": "grid",
    "color": "#c5aa76",
    "english": "TRIPLE TRIAD"
  },
  "facewear": {
    "name": "面部配饰",
    "title": "面部配饰",
    "icon": "circle",
    "color": "#83b8bb",
    "english": "FACEWEAR"
  },
  "fashions": {
    "name": "时尚配饰",
    "title": "时尚配饰",
    "icon": "feather",
    "color": "#bd91af",
    "english": "FASHION ACCESSORIES"
  },
  "frames": {
    "name": "肖像教材",
    "title": "肖像教材",
    "icon": "book",
    "color": "#9caccf",
    "english": "FRAMER KITS"
  },
  "emotes": {
    "name": "表情动作",
    "title": "表情动作",
    "icon": "emote",
    "color": "#82b5b0",
    "english": "EMOTES"
  }
};
const colors = [
  "#cf9f56",
  "#baa66f",
  "#bd8597",
  "#729db7",
  "#c3afa0",
  "#a38cce",
  "#7ba8cd",
  "#d7bb8b",
];
const storageKey = "eorzea.archive.v1";
let catalog = [],
  catalogMeta = {},
  data,
  view = "overview",
  category = "mounts",
  status = "all",
  query = "",
  sort = "recommended",
  layout = "grid",
  source = "",
  patchFilter = "",
  jobFilter = "",
  seriesFilter = "",
  exchangeCurrency = "",
  exchangeExpansion = "",
  exchangeRegion = "",
  showFilters = false,
  activeModal = null,
  modalKey = null,
  returnFocus = null,
  toastTimer,
  generated = [],
  preferenceDraft = null;
const catalogByKey = new Map(), catalogIndex = new Map(), searchIndex = new Map();
let ownedKeys = new Set(), wishlistKeys = new Set(), planKeys = new Set();
let visibleLimit = 96, resultScope = "", searchTimer, searchComposing = false;
function refreshArchiveIndexes() {
  ownedKeys = new Set(data.owned);
  wishlistKeys = new Set(data.wishlist);
  planKeys = new Set(data.plan);
}
function rebuildCatalogIndexes() {
  catalogByKey.clear(); catalogIndex.clear(); searchIndex.clear();
  catalog.forEach((x, index) => {
    catalogByKey.set(x.key, x); catalogIndex.set(x.key, index);
    const raw = optional(x.collect, entry => entry.data) || {};
    searchIndex.set(x.key, [x.name, x.english, x.source, x.sourceEnglish, x.sourceType, x.series, x.seriesAlias, x.seriesEnglish, x.jobAbbr, x.weaponType, x.command, x.cardNumber, x.id, ...itemJobs(x), raw.name, raw.description, raw.enhanced_description, ...(Array.isArray(raw.sources) ? raw.sources.map(s => s.text) : [])].join(" ").toLowerCase());
  });
}
const countOwned = (cat) => catalog.filter(x => (!cat || x.category === cat) && ownedKeys.has(x.key)).length;
const find = (key) => catalogByKey.get(key);
const itemColor = (x) => colors[(catalogIndex.get(x.key) || 0) % colors.length];
function catalogUpdatedAt() {
  const sync = catalogMeta.apiSync || {};
  const value = typeof sync === "string" ? sync : sync.fetchedAt || sync.completedAt || sync.updatedAt || sync.generatedAt;
  if (!value) return "未提供更新时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未提供更新时间" : date.toLocaleString("zh-CN");
}
const itemJobs = (x) => Array.isArray(x.jobs) ? x.jobs : x.job ? [x.job] : [];
const itemSourceUrl = (x) => {
  const url = x.sourceUrl || `https://ffxivcollect.com/${x.category}/${x.id}`;
  return url.startsWith("https://") ? url : "https://ffxivcollect.com/";
};
const hasOwnedRate = (x) => typeof x.ownedRate === "number" && Number.isFinite(x.ownedRate);
const latestItemPatch = () => catalogMeta.latestCollectiblePatch || catalogMeta.latestObtainablePatch || catalogMeta.latestItemPatch || optional([...catalog].sort((a, b) => parseFloat(b.patch) - parseFloat(a.patch))[0], entry => entry.patch) || "—";
const archiveSync = new ArchiveSynchronizer({
  getArchive: () => data,
  setArchive: (archive, remote) => {
    data = normalize(archive);
    persistLocalArchive();
    if (remote && $("#main")) {
      render();
      if (activeModal === "detail" && modalKey) openDetail(modalKey, false);
    }
  },
  onState: updateSyncIndicators,
});
function selectOptions(values, current) {
  return values.map((value) => `<option value="${esc(value)}" ${current === value ? "selected" : ""}>${esc(value)}</option>`).join("");
}
function demo() {
  return {
    version: 1,
    profile: { name: "光之冒险者", server: "艾欧泽亚", demo: true },
    owned: [
      "mounts-47",
      "mounts-171",
      "mounts-49",
      "mounts-263",
      "mounts-284",
      "mounts-201",
      "mounts-29",
      "mounts-28",
      "minions-110",
      "minions-304",
      "minions-119",
      "minions-41",
      "minions-12",
      "emotes-199",
      "emotes-122",
      "emotes-121",
      "orchestrions-499",
      "orchestrions-315",
    ],
    wishlist: ["mounts-105", "mounts-181", "mounts-186", "minions-427"],
    plan: [],
    preferences: {
      category: "all",
      style: "casual",
      budget: "45",
      excludePaid: true,
      prioritizeWish: true,
    },
    activity: [],
    lastUpdated: Date.now(),
  };
}
function normalize(raw) {
  if (
    !raw ||
    raw.version !== 1 ||
    !raw.profile ||
    !Array.isArray(raw.owned) ||
    !Array.isArray(raw.wishlist) ||
    !Array.isArray(raw.plan)
  )
    throw Error("无效的档案文件，请选择从本站导出的 JSON 备份。");
  // Keep saved keys even when a fallback catalog is older than this archive.
  const list = (v) => [...new Set(v)].filter((x) => typeof x === "string");
  const owned = list(raw.owned), ownedSet = new Set(owned);
  const p = raw.preferences || {},
    preferences = {
      category:
        p.category === "weapons" ? "relics" : p.category === "all" || hasOwn(categories, p.category)
          ? p.category
          : "all",
      style: ["casual", "solo", "challenge"].includes(p.style)
        ? p.style
        : "casual",
      budget: ["20", "45", "90"].includes(p.budget) ? p.budget : "45",
      excludePaid: p.excludePaid !== false,
      prioritizeWish: p.prioritizeWish !== false,
    };
  return {
    version: 1,
    profile: {
      name: String(raw.profile.name || "光之冒险者").trim().slice(0, 18) || "光之冒险者",
      server: String(raw.profile.server || "艾欧泽亚").trim().slice(0, 24) || "艾欧泽亚",
      demo: !!raw.profile.demo,
    },
    owned,
    wishlist: list(raw.wishlist).filter((x) => !ownedSet.has(x)),
    plan: list(raw.plan),
    preferences,
    activity: (Array.isArray(raw.activity) ? raw.activity : [])
      .filter((x) => x && typeof x === "object")
      .slice(0, 30)
      .map((x) => ({
        text: String(x.text || "").slice(0, 160),
        at: Math.max(0, Math.floor(Number(x.at) || Date.now())),
      })),
    lastUpdated: Number(raw.lastUpdated) || Date.now(),
  };
}
function save(activity) {
  if (activity) data.activity.unshift({text:activity.slice(0,160),at:Date.now()});
  data.activity = data.activity.slice(0,30);
  data.lastUpdated = Date.now();
  persistLocalArchive();
  archiveSync.queue();
}
function persistLocalArchive() {
  refreshArchiveIndexes();
  try { localStorage.setItem(storageKey,JSON.stringify(data)); }
  catch { toast("浏览器未允许保存离线备份，请导出档案。"); }
}
function updateSyncIndicators(state) {
  document.querySelectorAll("[data-sync-status]").forEach(el=>{el.textContent=state.message;el.title=state.error||state.message;});
  document.querySelectorAll("[data-sync-error]").forEach(el=>{el.textContent=state.error;el.hidden=!state.error;});
}
function accountPanelHtml() {
  const state=archiveSync.state;
  const status=`<p class="sync-summary" data-sync-status>${esc(state.message)}</p><p class="sync-error" data-sync-error ${state.error?"":"hidden"}>${esc(state.error)}</p><button class="text-btn" type="button" data-action="sync-retry">${icon("refresh")} 重试同步／获取最新记录</button>`;
  if(state.user&&!state.user.isGuest)return `<section class="account-panel"><h3>收藏站账号 · ${esc(state.user.username)}</h3>${status}<p>当前档案保存到站点数据库；在其他浏览器登录同一账号可继续收藏。</p><button class="secondary-btn" type="button" data-action="account-logout">退出账号</button></section>`;
  return `<section class="account-panel"><h3>账号与数据库</h3>${status}<p>访客档案已连接时会保存到数据库。注册后可在其他浏览器登录；这里使用独立的收藏站账号，请勿填写游戏账号密码。</p><form id="account-form"><div class="form-field"><label for="account-name">收藏站账号</label><input id="account-name" name="username" autocomplete="username" minlength="3" maxlength="32" required placeholder="3～32 位中文、字母或数字"></div><div class="form-field"><label for="account-password">密码</label><input id="account-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required placeholder="8～128 位"></div><label class="account-merge"><input type="checkbox" name="mergeGuest" ${data.profile.demo?"disabled":"checked"}> 登录时合并当前访客收藏（演示记录不会合并）</label><div class="form-actions"><button class="primary-btn" type="submit" name="mode" value="login">登录并同步</button><button class="secondary-btn" type="submit" name="mode" value="register">注册并保留当前档案</button></div></form></section>`;
}
async function submitAccount(form,mode) {
  const buttons=[...form.querySelectorAll("button")];buttons.forEach(x=>x.disabled=true);
  try {
    const values=new FormData(form);
    await archiveSync.authenticate(mode,{username:String(values.get("username")||""),password:String(values.get("password")||""),mergeGuest:values.has("mergeGuest")&&!data.profile.demo});
    openProfile();toast(mode==="register"?"账号已创建，当前档案已保留":"已登录并载入账号档案");
  }catch(error){toast(error.message);}finally{buttons.forEach(x=>x.disabled=false);}
}
async function reconnectArchive() {
  const ok=archiveSync.ready?await archiveSync.pull():await archiveSync.start();
  toast(ok?"档案已与数据库同步":archiveSync.state.error||"本机记录已保留，请稍后重试");
}
async function logoutAccount() {
  try { await archiveSync.logout();openProfile();toast("已退出账号，账号收藏仍保存在数据库"); }
  catch(error){toast(error.message);}
}

function toast(text) {
  clearTimeout(toastTimer);
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
const action = (name, label, extra = "", cls = "secondary-btn") =>
  `<button class="${cls}" data-action="${name}" ${extra}>${label}</button>`;
function navItem(id, label, i, count = "", group = false) {
  return `<button class="nav-item ${view === id ? "active" : ""}" data-action="navigate" data-view="${id}" ${view === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span>${count !== "" ? `<span class="nav-count ${group ? "count-badge" : ""}">${count}</span>` : ""}</button>`;
}
const exchangeCurrencies = { gemstones: "双色宝石", mgp: "金碟币", allied: "同盟徽章", centurio: "兵团徽章", nuts: "怪物狩猎的战利品" };
function matchesExchange(x, currency = exchangeCurrency, expansion = exchangeExpansion, region = exchangeRegion) {
  return !!x.exchangeExclusive && (x.exchanges || []).some((e) => (!currency || e.currency === currency) && (!expansion || e.expansion === expansion) && (!region || e.region === region));
}
function matchesCollectionScope(x) {
  if (view === "wishlist") return wishlistKeys.has(x.key);
  if (view === "exchange") return matchesExchange(x);
  return true;
}
function exchangeCount(currency = "", expansion = "", region = "") {
  return catalog.filter((x) => matchesExchange(x, currency, expansion, region)).length;
}
function seriesLabel(value) {
  const alias = optional(catalogMeta.mindmap, mindmap => optional(mindmap.seriesAliases, aliases => aliases[value]));
  return alias && alias !== value ? `${alias} · ${value}` : value;
}
function exchangeNavButton(label, currency, expansion = "", region = "") {
  const count = exchangeCount(currency, expansion, region);
  const active = view === "exchange" && exchangeCurrency === currency && exchangeExpansion === expansion && exchangeRegion === region;
  return `<button class="nav-subitem ${active ? "active" : ""}" data-action="exchange-track" data-currency="${esc(currency)}" data-expansion="${esc(expansion)}" data-region="${esc(region)}" ${active ? 'aria-current="page"' : ""}><span>${esc(label)}</span><small>${count}</small></button>`;
}
function catalogNavigation() {
  const special = ["ultimates", "relics", "tools"];
  const kinds = ["mounts", "minions", "bardings", "orchestrions", "cards", "facewear", "fashions", "frames"];
  const regions = optional(catalogMeta.mindmap, mindmap => mindmap.gemstoneRegions) || {};
  return `<div class="nav-label">可兑换的独占物品</div><nav class="nav-stack">${navItem("exchange", "兑换物品总览", "folder", exchangeCount())}<details class="nav-tree" ${view === "exchange" && exchangeCurrency === "gemstones" ? "open" : ""}><summary>双色宝石 <small>${exchangeCount("gemstones")}</small></summary>${exchangeNavButton("全部双色兑换", "gemstones")}${Object.entries(regions).map(([version, areas]) => `<details class="nav-tree nested" ${exchangeExpansion === version ? "open" : ""}><summary>${esc(version)} 版本</summary>${exchangeNavButton("本版本全部", "gemstones", version)}${areas.map((area) => exchangeNavButton(area, "gemstones", version, area)).join("")}</details>`).join("")}</details>${exchangeNavButton("金碟币", "mgp")}<details class="nav-tree" ${view === "exchange" && ["allied", "centurio", "nuts"].includes(exchangeCurrency) ? "open" : ""}><summary>狩猎点数</summary>${["allied", "centurio", "nuts"].map((key) => exchangeNavButton(exchangeCurrencies[key], key)).join("")}</details></nav><div class="nav-label">特殊装备</div><nav class="nav-stack">${special.map((id) => navItem(id, categories[id].title, categories[id].icon, catalog.filter((x) => x.category === id).length)).join("")}</nav><div class="nav-label">收集物品类型</div><nav class="nav-stack">${kinds.map((id) => navItem(id, categories[id].title, categories[id].icon, catalog.filter((x) => x.category === id).length)).join("")}</nav><div class="nav-label">补充收藏</div><nav class="nav-stack">${navItem("emotes", "表情动作", "emote", catalog.filter((x) => x.category === "emotes").length)}</nav>`;
}
function exchangeFiltersHtml() {
  if (view !== "exchange") return "";
  const regions = optional(catalogMeta.mindmap, mindmap => mindmap.gemstoneRegions) || {};
  if (!hasOwn(exchangeCurrencies, exchangeCurrency)) exchangeCurrency = "";
  if (exchangeCurrency !== "gemstones") { exchangeExpansion = ""; exchangeRegion = ""; }
  if (exchangeExpansion && !hasOwn(regions, exchangeExpansion)) exchangeExpansion = "";
  const areas = exchangeExpansion ? regions[exchangeExpansion] : Object.values(regions).flat();
  if (exchangeRegion && !areas.includes(exchangeRegion)) exchangeRegion = "";
  return `<section class="exchange-panel" aria-label="兑换清单筛选"><div><strong>${icon("folder")} 可兑换的独占物品列表</strong><p>按导图中的货币、版本和地区查找；只统计已核实兑换来源的收藏。</p></div><div class="filter-panel exchange-options"><label>兑换货币 <select id="exchange-currency" aria-label="兑换货币"><option value="">全部货币</option>${["gemstones", "mgp"].map((key) => `<option value="${key}" ${exchangeCurrency === key ? "selected" : ""}>${exchangeCurrencies[key]}</option>`).join("")}<optgroup label="狩猎点数">${["allied", "centurio", "nuts"].map((key) => `<option value="${key}" ${exchangeCurrency === key ? "selected" : ""}>${exchangeCurrencies[key]}</option>`).join("")}</optgroup></select></label>${exchangeCurrency === "gemstones" ? `<label>双色版本 <select id="exchange-expansion" aria-label="双色版本"><option value="">全部版本</option>${selectOptions(Object.keys(regions), exchangeExpansion)}</select></label><label>兑换地区 <select id="exchange-region" aria-label="兑换地区"><option value="">全部地区</option>${selectOptions(areas, exchangeRegion)}</select></label>` : ""}</div></section>`;
}

function render() {
  const titles = {
    overview: "收藏总览",
    wishlist: "我的心愿单",
    plan: "收集计划",
    progress: "收藏进度",
    explore: "搜索图鉴",
    exchange: "可兑换的独占物品",
  };
  $("#app").innerHTML =
    `<div class="mobile-overlay" data-action="close-menu"></div><aside class="sidebar" aria-label="主要导航"><button class="brand" data-action="navigate" data-view="overview" aria-label="光之藏馆首页"><span class="brand-symbol">${icon("star")}</span><span><h1>光之藏馆</h1><small>EORZEA ARCHIVE</small></span></button><div class="nav-label">你的冒险手记</div><nav class="nav-stack">${navItem("overview", "收藏总览", "grid")}${navItem("wishlist", "我的心愿单", "heart", data.wishlist.length, true)}${navItem("plan", "收集计划", "route", data.plan.filter((k) => !ownedKeys.has(k)).length)}</nav>${catalogNavigation()}<div class="nav-label">成长记录</div><nav class="nav-stack">${navItem("progress", "收藏进度", "trophy")}</nav><div class="sidebar-bottom"><div class="sidebar-note">${icon("feather")}<strong>每一份热爱，都有回响</strong><p>不必急着抵达终点。<br>下一份珍藏，就在下一段旅途。</p><button data-action="planner">寻找收藏灵感 ${icon("arrow")}</button></div><button class="save-status" data-action="profile"><span class="dot"></span><span data-sync-status>${esc(archiveSync.state.message)}</span></button><div class="sidebar-footer">${icon("settings")}<button data-action="profile">档案设置</button><span>v1.0</span></div></div></aside><div class="app-shell"><header class="topbar"><button class="icon-btn mobile-menu" data-action="open-menu" aria-label="打开导航">${icon("menu")}</button><div class="breadcrumb">${icon("home")}<span>我的藏馆</span><span class="slash">/</span><span>${titles[view] || optional(categories[view], entry => entry.title) || "收藏总览"}</span></div><div class="top-actions"><label class="global-search">${icon("search")}<input id="global-search" type="search" autocomplete="off" maxlength="80" placeholder="搜索藏品、名称或获取方式…" value="${esc(query)}" aria-label="搜索全部藏品"><kbd>Ctrl K</kbd></label><button class="icon-btn notice-button" data-action="activity" aria-label="查看收藏动态">${icon("bell")}</button><button class="profile-button" data-action="profile"><span class="profile-avatar">光</span><div><strong>${esc(data.profile.name)}</strong><small>${data.profile.demo ? "演示档案 · " : ""}收藏家</small></div>${icon("down")}</button></div></header><main id="main" class="main" tabindex="-1"></main></div>`;
  renderMain();
}
function ring() {
  const percent = Math.round((countOwned() / catalog.length) * 100);
  return `<div class="progress-ring"><svg viewBox="0 0 114 114" aria-hidden="true"><circle cx="57" cy="57" r="48"/><circle class="ring-value" cx="57" cy="57" r="48" stroke-dasharray="301.59" stroke-dashoffset="${301.59 * (1 - percent / 100)}"/></svg><div class="ring-text"><strong>${percent}<small>%</small></strong><span>图鉴完成度</span></div></div>`;
}
function stats() {
  return `<div class="stats-row">${Object.entries(categories)
    .map(([id, c]) => {
      const n = catalog.filter((x) => x.category === id).length,
        owned = countOwned(id),
        p = n ? Math.round((owned / n) * 100) : 0;
      return `<button class="stat-card" style="--accent:${c.color}" data-action="navigate" data-view="${id}"><div class="stat-top"><span class="stat-icon">${icon(c.icon)}</span><span>${c.name}</span><span>${c.english}</span></div><div class="stat-number">${owned}<small>/ ${n}</small><span>${p}% 已收集</span></div><div class="mini-track"><span style="width:${p}%"></span></div></button>`;
    })
    .join("")}</div>`;
}
function footer() {
  return `<footer class="site-footer"><div>${icon("feather")}<strong>为每一位热爱艾欧泽亚的光之战士而作</strong><span>·</span><button class="text-btn" data-action="about">关于藏馆</button></div><span>非官方同人项目 · 资料来自 <a href="https://ffxivcollect.com/" target="_blank" rel="noopener noreferrer">FFXIV Collect</a> / XIVAPI<br>© SQUARE ENIX CO., LTD. All Rights Reserved.</span></footer>`;
}
function renderMain() {
  const main = $("#main");
  if (view === "progress") {
    main.innerHTML = progressPage() + footer();
    return;
  }
  if (view === "plan") {
    main.innerHTML = planPage() + footer();
    return;
  }
  const isOverview = view === "overview";
  const heading = isOverview
    ? `<div class="welcome"><div><p>属于你的艾欧泽亚收藏手记</p><h2>你好，${esc(data.profile.name)} <span>✧</span></h2></div><div><span class="welcome-note">${data.profile.demo ? "正在浏览演示收藏" : "继续书写你的收藏故事"}</span><button class="secondary-btn" data-action="profile">${icon("folder")} 管理收藏档案</button></div></div><div class="hero-row"><section class="hero" aria-labelledby="hero-title"><div class="hero-content"><div class="eyebrow">${icon("sparkles")} EVERY COLLECTION TELLS A STORY</div><h2 id="hero-title">把艾欧泽亚的浪漫，<br><span>一件件收藏。</span></h2><p>从第一只陆行鸟，到心心念念的那一道光。<br>记录你的热爱，发现下一段值得出发的旅程。</p><button class="primary-btn" data-action="discover">发现下一份珍藏 ${icon("arrow")}</button></div><span class="hero-caption">${icon("compass")} 8.0 EVERCOLD · 官方预告插画</span></section><section class="journey-card" aria-label="我的收藏旅程"><div class="section-title"><h2>我的收藏旅程</h2>${icon("trophy")}</div>${ring()}<div class="journey-stats">已点亮 <strong>${countOwned()}</strong> 件珍藏 <span> / </span>  ${catalog.length} 件</div><div class="journey-bottom"><span>${icon("feather")} 每一步，都算数</span><button data-action="navigate" data-view="progress">查看旅程 →</button></div></section></div>${stats()}`
    : pageHeading();
  main.innerHTML =
    heading +
    `<div class="explore-layout"><section class="catalog-section" id="catalog-section" aria-labelledby="catalog-title"></section>${rightRail()}</div>` +
    footer();
  renderCatalog();
}
function pageHeading() {
  if (view === "exchange") return `<div class="page-heading"><div class="eyebrow">EXCLUSIVE EXCHANGE COLLECTIONS</div><h2>可兑换的独占物品列表</h2><p>双色宝石、金碟币与三类狩猎货币 · 已收录 ${exchangeCount()} 件兑换独占收藏</p><a class="text-btn" href="${esc(optional(catalogMeta.mindmap, mindmap => mindmap.source) || "https://docs.qq.com/mind/DQ21qZGxMamNMYUJV")}" target="_blank" rel="noopener noreferrer">分类依据：收藏站思维导图 ${icon("external")}</a></div>`;
  const c = categories[view];
  return `<div class="page-heading"><div class="eyebrow">${view === "wishlist" ? "SAVED FOR YOUR NEXT ADVENTURE" : view === "explore" ? "FIND YOUR NEXT FAVORITE" : optional(c, entry => entry.english) || "YOUR COLLECTION"}</div><div class="heading-row"><div><h2>${view === "wishlist" ? "把心动，留给下一场冒险" : view === "explore" ? "寻找属于你的珍藏" : optional(c, entry => entry.title)}</h2><p>${view === "wishlist" ? "这里住着你想带回家的珍藏。收藏后会自动从心愿单移除。" : view === "explore" ? `搜索「${esc(query)}」· 支持中文、英文及获取途径` : `${catalog.filter((x) => x.category === view).length} 件${optional(c, entry => entry.name)} · 已点亮 ${countOwned(view)} 件 · 收藏进度由你亲手记录`}</p></div><button class="primary-btn" data-action="planner">${icon("sparkles")} 智能收集规划</button></div></div>`;
}
function rightRail() {
  const wishes = data.wishlist.map(find).filter(Boolean).slice(0, 3);
  return `<aside class="right-rail" aria-label="收藏灵感"><section class="assistant-card"><div class="section-title"><h2>${icon("sparkles")} 收藏灵感</h2><span class="ai-pill">FOR YOU</span></div><div class="eyebrow">YOUR NEXT LITTLE OBSESSION</div><h3>下一份心动，<br>从哪里开始？</h3><p>根据你的收藏进度和心愿清单，<br>找到适合今天的收集目标。</p><div class="suggestion-tags"><button data-action="quick-plan" data-style="solo">一个人也能出发</button><button data-action="quick-plan" data-style="casual">轻松收藏</button><button data-action="quick-plan" data-style="challenge">挑战稀有珍藏</button></div><button class="primary-btn" data-action="planner">${icon("route")} 生成专属收集计划 ${icon("arrow")}</button><div class="assistant-note"><span class="dot"></span>基于收藏偏好推荐 · 无需对话</div></section><section class="rail-panel"><div class="section-title"><h2>${icon("heart")} 心愿清单 <span class="muted">${data.wishlist.length}</span></h2><button data-action="navigate" data-view="wishlist">查看全部 →</button></div><div class="wish-preview">${wishes.length ? wishes.map((x) => `<button class="wish-row" data-action="detail" data-key="${esc(x.key)}"><span class="wish-thumb"><img src="${esc(x.image)}" alt="" loading="lazy"></span><span><strong>${esc(x.name)}</strong><small>${esc(x.sourceType)} · ${categories[x.category].name}</small></span>${icon("right")}</button>`).join("") : '<p class="muted" style="font-size:10px;line-height:1.8">点击藏品上的爱心，把下一份期待放在这里。</p>'}</div></section><div class="rail-tip"><div class="eyebrow">LITTLE REMINDER</div><p>「旅途的意义，<br>也藏在那些不经意的收获里。」</p><small>慢慢来，你的故事才刚刚开始。</small></div></aside>`;
}
function baseItems() {
  return catalog.filter(
    (x) =>
      (category === "all" || x.category === category) &&
      matchesCollectionScope(x) &&
      (!query ||
        optional(searchIndex.get(x.key), entry => entry.includes(query.toLowerCase()))) &&
      (!source || x.sourceType === source) &&
      (!patchFilter || String(valueOr(x.patch, () => "")).startsWith(patchFilter)) &&
      (!jobFilter || itemJobs(x).includes(jobFilter)) &&
      (!seriesFilter || x.series === seriesFilter),
  );
}
function filteredItems() {
  let items = baseItems().filter(
    (x) =>
      status === "all" ||
      (status === "owned"
        ? ownedKeys.has(x.key)
        : !ownedKeys.has(x.key)),
  );
  if (sort === "rare") items.sort((a, b) => (hasOwnedRate(a) ? a.ownedRate : Infinity) - (hasOwnedRate(b) ? b.ownedRate : Infinity));
  if (sort === "patch")
    items.sort((a, b) => parseFloat(b.patch) - parseFloat(a.patch));
  if (sort === "name")
    items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return items;
}
function cascadingFilterOptions() {
  const context = catalog.filter((x) => (category === "all" || x.category === category) && matchesCollectionScope(x));
  const sources = [...new Set(context.map((x) => x.sourceType))];
  if (source && !sources.includes(source)) source = "";
  const sourceItems = context.filter((x) => !source || x.sourceType === source);
  const patches = [
    ["2.", "重生之境 2.x"],
    ["3.", "苍穹之禁城 3.x"],
    ["4.", "红莲之狂潮 4.x"],
    ["5.", "暗影之逆焰 5.x"],
    ["6.", "晓月之终途 6.x"],
    ["7.", "黄金的遗产 7.x"],
  ].filter(([prefix]) => sourceItems.some((x) => String(valueOr(x.patch, () => "")).startsWith(prefix)));
  if (patchFilter && !patches.some(([prefix]) => prefix === patchFilter)) patchFilter = "";
  const patchItems = sourceItems.filter((x) => !patchFilter || String(valueOr(x.patch, () => "")).startsWith(patchFilter));
  const series = [...new Set(patchItems.map((x) => x.series).filter(Boolean))];
  if (seriesFilter && !series.includes(seriesFilter)) seriesFilter = "";
  const seriesItems = patchItems.filter((x) => !seriesFilter || x.series === seriesFilter);
  const jobs = [...new Set(seriesItems.flatMap(itemJobs))];
  if (jobFilter && !jobs.includes(jobFilter)) jobFilter = "";
  return { sources, patches, series, jobs };
}
function renderCatalog() {
  const section = $("#catalog-section");
  if (!section) return;
  const exchangeFilters = exchangeFiltersHtml();
  const scope = JSON.stringify([view, category, status, query, sort, source, patchFilter, jobFilter, seriesFilter, exchangeCurrency, exchangeExpansion, exchangeRegion]);
  if (scope !== resultScope) { resultScope = scope; visibleLimit = 96; }
  const { sources, patches, series, jobs } = cascadingFilterOptions();
  const base = baseItems(),
    items = filteredItems(),
    owned = base.filter((x) => ownedKeys.has(x.key)).length;
  section.innerHTML = `${exchangeFilters}<div class="section-title"><h2 id="catalog-title">${icon(view === "wishlist" ? "heart" : "compass")}${view === "wishlist" ? "我的心愿珍藏" : view === "overview" ? "探索你的下一份珍藏" : view === "explore" ? "图鉴搜索结果" : view === "exchange" ? "兑换收藏图鉴" : optional(categories[view], entry => entry.title)}</h2><button class="text-btn" data-action="filter-toggle">${icon("filter")} 筛选藏品</button></div><p class="catalog-subtitle">${view === "overview" ? "那些尚未相遇的风景，正等待着你。" : `找到 ${items.length} 件藏品 · 点击卡片查看获取途径`}</p><div class="catalog-update"><span>${icon("refresh")} 国际服 ${esc(catalogMeta.latestReleasedPatch || "—")} · 已收录至 ${esc(latestItemPatch())} 版本藏品 · 共 ${catalog.length} 件 · ${esc(catalogUpdatedAt())}</span><button class="text-btn" data-action="latest">探索 7.x 新藏品 ${icon("arrow")}</button></div><div class="tabs" role="tablist" aria-label="图鉴分类">${[["all", "全部藏品"], ...Object.entries(categories).map(([id, c]) => [id, c.name])].map(([id, name]) => `<button class="tab ${category === id ? "active" : ""}" role="tab" aria-selected="${category === id}" data-action="tab" data-category="${id}">${name}<small>${catalog.filter((x) => (id === "all" || x.category === id) && matchesCollectionScope(x)).length}</small></button>`).join("")}</div><div class="filters"><div class="filter-left">${[
    ["all", "全部", base.length],
    ["missing", "未收藏", base.length - owned],
    ["owned", "已收藏", owned],
  ]
    .map(
      ([id, name, n]) =>
        `<button class="filter-chip ${status === id ? "active" : ""}" data-action="status" data-status="${id}" aria-pressed="${status === id}">${name} <small>${n}</small></button>`,
    )
    .join(
      "",
    )}</div><div class="filter-right"><select class="sort-select" id="sort-select" aria-label="排序方式"><option value="recommended" ${sort === "recommended" ? "selected" : ""}>推荐顺序</option><option value="rare" ${sort === "rare" ? "selected" : ""}>社区持有率从低到高</option><option value="patch" ${sort === "patch" ? "selected" : ""}>版本从新到旧</option><option value="name" ${sort === "name" ? "selected" : ""}>名称排序</option></select><div class="view-toggle">${action("layout", icon("grid"), 'data-layout="grid" aria-label="卡片视图" aria-pressed="' + (layout === "grid") + '"', layout === "grid" ? "active" : "")}${action("layout", icon("list"), 'data-layout="list" aria-label="列表视图" aria-pressed="' + (layout === "list") + '"', layout === "list" ? "active" : "")}</div></div></div>${
    showFilters
      ? `<div class="filter-panel"><label>获取方式 <select id="source-select" aria-label="获取方式"><option value="">全部方式</option>${sources.map((s) => `<option value="${esc(s)}" ${source === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label><label>资料片 <select id="patch-select" aria-label="资料片"><option value="">全部版本</option>${patches
          .map(
            ([v, n]) =>
              `<option value="${v}" ${patchFilter === v ? "selected" : ""}>${n}</option>`,
          )
          .join(
            "",
          )} </select></label>${series.length ? `<label>强化 / 绝本系列 <select id="series-select" aria-label="强化或绝本系列"><option value="">全部系列</option>${series.map((value) => `<option value="${esc(value)}" ${seriesFilter === value ? "selected" : ""}>${esc(seriesLabel(value))}</option>`).join("")}</select></label>` : ""}${jobs.length ? `<label>职业 <select id="job-select" aria-label="职业"><option value="">全部职业</option>${selectOptions(jobs, jobFilter)}</select></label>` : ""}<button class="text-btn" data-action="clear-filters">重置筛选</button></div>`
      : ""
  }<div class="collection-grid ${layout === "list" ? "list-mode" : ""}">${items.length ? items.slice(0, visibleLimit).map(card).join("") : emptyState(view === "wishlist" && !data.wishlist.length ? "心愿单还在等待第一份心动" : "还没有找到这份珍藏", view === "wishlist" && !data.wishlist.length ? "到图鉴逛一逛，点击爱心保存你的收集愿望。" : "试着换个关键词，或放宽一下筛选条件。", view === "wishlist" && !data.wishlist.length ? "browse" : "clear-filters", view === "wishlist" && !data.wishlist.length ? "去探索图鉴" : "清除筛选")}</div>${items.length > visibleLimit ? `<button class="load-more" data-action="load-more">${icon("plus")} 再显示 ${Math.min(96, items.length - visibleLimit)} 件 · 已显示 ${visibleLimit} / ${items.length} 件</button>` : ""}${items.length ? `<p class="catalog-end">${icon("sparkles")} 已展示 ${Math.min(visibleLimit, items.length)} / ${items.length} 件藏品</p>` : ""}`;
}
function card(x, index) {
  const isOwned = ownedKeys.has(x.key),
    isWish = wishlistKeys.has(x.key);
  const color = itemColor(x);
  return `<article class="collectible" style="--item-color:${color};animation-delay:${Math.min(index, 9) * 25}ms"><button class="card-heart ${isWish ? "selected" : ""}" data-action="wish-toggle" data-key="${esc(x.key)}" aria-label="${isWish ? "从心愿单移除" : "加入心愿单"}${esc(x.name)}" aria-pressed="${isWish}">${icon("heart")}</button><button class="card-open" data-action="detail" data-key="${esc(x.key)}" aria-label="查看${esc(x.name)}详情"><div class="card-art ${["relics", "ultimates", "tools", "bardings", "cards", "facewear", "fashions", "frames"].includes(x.category) ? "equipment-art" : x.category === "orchestrions" ? "music-art" : x.category === "emotes" ? "emote-art" : ""}"><span class="card-badge ${isOwned ? "owned" : ""}">${isOwned ? icon("check") + " 已收藏" : "PATCH " + x.patch}</span><img src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy" width="192" height="192"></div><div class="card-info"><h3>${esc(x.name)}</h3><span class="english">${x.name === x.english ? (optional(x.collect, entry => entry.data) ? "API 名称" : "原始名称") : esc(x.english)}</span>${x.series ? `<div class="equipment-tags"><span>${esc(itemJobs(x).join(" / "))}</span><span>${esc(x.series)}</span></div>` : ""}<div class="card-source"><span>${icon(x.sourceType === "商城特典" ? "star" : x.sourceType === "金碟游乐场" ? "trophy" : "compass")} ${esc(x.sourceType)}</span><span>${categories[x.category].name}</span></div></div></button><div class="card-foot"><button class="owned-btn ${isOwned ? "is-owned" : ""}" data-action="owned-toggle" data-key="${esc(x.key)}" aria-pressed="${isOwned}" aria-label="${isOwned ? "取消收藏" : "标记已收藏"}${esc(x.name)}">${icon(isOwned ? "checkcircle" : "circle")} ${isOwned ? "已收入藏馆" : "标记已收藏"}</button><span>NO. ${String(x.id).padStart(3, "0")}</span></div></article>`;
}
function emptyState(title, text, act, label) {
  return `<div class="empty-state">${icon("compass")}<h3>${title}</h3><p>${text}</p><button class="secondary-btn" data-action="${act}">${label} ${icon("arrow")}</button></div>`;
}
function progressPage() {
  return `<div class="page-heading"><div class="eyebrow">EVERY LITTLE STEP COUNTS</div><h2>你的收藏，正在闪闪发光</h2><p>这里只统计本站的 ${catalog.length} 件藏品，记录属于你的每一次收获。</p></div><div class="progress-summary">${ring()}<div><h3>已经点亮了 ${countOwned()} 份艾欧泽亚的浪漫</h3><p>${data.profile.demo ? "当前显示演示档案，可在设置中清空后开始记录。" : "每一次相遇，都让你的冒险手记更完整。"}<br>下一份心动或许就在眼前，慢慢收集，也是一种享受。</p></div></div><div class="progress-page-grid">${Object.entries(
    categories,
  )
    .map(([id, c]) => {
      const total = catalog.filter((x) => x.category === id).length,
        n = countOwned(id);
      return `<section class="progress-category" style="--accent:${c.color}"><h3>${icon(c.icon)}${c.title}</h3><div class="big-number">${n} <small>/ ${total} 件</small></div><div class="mini-track"><span style="width:${total ? (n / total) * 100 : 0}%"></span></div><p>${n === total ? "这一页的珍藏，已经全部与你相遇。" : `还有 ${total - n} 件珍藏，等待着与你相遇。`}</p><button class="text-btn" data-action="navigate" data-view="${id}">继续探索${c.name} ${icon("arrow")}</button></section>`;
    })
    .join("")}</div>`;
}
function planPage() {
  const planned = data.plan.map(find).filter(Boolean);
  return `<div class="page-heading"><div class="eyebrow">A LITTLE PLAN, A NEW ADVENTURE</div><div class="heading-row"><div><h2>下一站，奔赴你的热爱</h2><p>为心愿留一点时间，把遥远的目标变成今天的一小步。</p></div><button class="primary-btn" data-action="planner">${icon("sparkles")} 生成收集计划</button></div></div>${planned.length ? `<div class="plan-list">${planned.map((x, i) => `<article class="plan-row ${ownedKeys.has(x.key) ? "completed" : ""}"><span class="plan-num">${String(i + 1).padStart(2, "0")}</span><button class="card-open" style="width:auto;flex:0" data-action="detail" data-key="${esc(x.key)}" aria-label="查看${esc(x.name)}详情"><img class="plan-image" src="${esc(x.image)}" alt="${esc(x.name)}"></button><div class="plan-detail"><h3>${esc(x.name)} <span class="tag">${categories[x.category].name}</span></h3><p>${esc(x.source)}</p><small>${ownedKeys.has(x.key) ? "这份珍藏已与你相遇" : "先核对解锁条件，再按自己的节奏推进"}</small></div><div class="plan-actions"><button class="secondary-btn" data-action="owned-toggle" data-key="${esc(x.key)}">${icon(ownedKeys.has(x.key) ? "checkcircle" : "circle")} ${ownedKeys.has(x.key) ? "已收藏" : "我收集到了"}</button><button class="icon-btn" data-action="plan-toggle" data-key="${esc(x.key)}" aria-label="从计划移除${esc(x.name)}">${icon("trash")}</button></div></article>`).join("")}</div><p class="plan-help">${icon("info")} 推荐依据为本地收藏偏好，不承诺掉落概率或完成时间。规划不会自动操作游戏，也不会同步游戏账号。</p>` : emptyState("为下一次出发，留一点小小的期待", "在藏品详情中加入目标，或根据你的偏好生成专属计划。", "planner", "寻找收藏灵感")}`;
}
function navigate(next) {
  clearTimeout(searchTimer);
  if (next === "weapons") next = "relics";
  exchangeCurrency = "";
  exchangeExpansion = "";
  exchangeRegion = "";
  view =
    hasOwn(categories, next) ||
    ["overview", "wishlist", "plan", "progress", "explore", "exchange"].includes(next)
      ? next
      : "overview";
  category = hasOwn(categories, view)
    ? view
    : view === "overview"
      ? "mounts"
      : "all";
  status = "all";
  query = "";
  source = "";
  patchFilter = "";
  jobFilter = "";
  seriesFilter = "";
  showFilters = ["ultimates", "relics", "tools", "exchange"].includes(view);
  closeModal(false);
  history.replaceState(null, "", "#" + view);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function toggleOwned(key) {
  const item = find(key);
  if (!item) return;
  const owned = ownedKeys.has(key);
  if (owned) data.owned = data.owned.filter((k) => k !== key);
  else {
    data.owned.push(key);
    data.wishlist = data.wishlist.filter((k) => k !== key);
  }
  save((owned ? "取消收藏：" : "收藏了新的珍藏：") + item.name);
  render();
  toast(
    owned ? "已取消收藏 " + item.name : "✧ " + item.name + " 已收入你的藏馆",
  );
  if (activeModal === "detail") openDetail(key, false);
}
function toggleWish(key) {
  const item = find(key);
  if (!item) return;
  if (ownedKeys.has(key)) {
    toast("这件珍藏已经在你的藏馆里啦");
    return;
  }
  const selected = wishlistKeys.has(key);
  data.wishlist = selected
    ? data.wishlist.filter((k) => k !== key)
    : [...data.wishlist, key];
  save();
  render();
  toast(selected ? "已从心愿单移除" : "♡ 已加入心愿单，下一场冒险见");
  if (activeModal === "detail") openDetail(key, false);
}
function togglePlan(key) {
  const item = find(key);
  if (!item) return;
  const selected = planKeys.has(key);
  data.plan = selected
    ? data.plan.filter((k) => k !== key)
    : [...data.plan, key];
  save();
  render();
  toast(selected ? "已从收集计划移除" : "已加入收集计划");
  if (activeModal === "detail") openDetail(key, false);
}
function showModal(content, type, extra = "", remember = true) {
  if (remember && !activeModal) returnFocus = document.activeElement;
  activeModal = type;
  document.body.classList.add("body-modal");
  $("#app").inert = true;
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${extra}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><button class="icon-btn modal-close" data-action="close-modal" aria-label="关闭窗口">${icon("close")}</button>${content}</section></div>`;
  queueMicrotask(() => optional($(".modal"), entry => entry.focus()));
}
function closeModal(restore = true) {
  activeModal = null;
  modalKey = null;
  generated = [];
  $("#modal-root").innerHTML = "";
  document.body.classList.remove("body-modal");
  $("#app").inert = false;
  if (restore && optional(returnFocus, entry => entry.isConnected)) returnFocus.focus();
  else if (restore) optional($("#global-search"), entry => entry.focus());
}
const apiValuePresent = (value) => value !== undefined && value !== null && value !== "";
const rawCollectData = (item) => optional(item.collect, entry => entry.data) && typeof item.collect.data === "object" ? item.collect.data : {};
function apiValueText(value) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map(apiValueText).join(" / ");
  if (value && typeof value === "object") return Object.entries(value).filter(([, v]) => apiValuePresent(v)).map(([k, v]) => `${({ id: "编号", name: "名称", top: "上", right: "右", bottom: "下", left: "左" })[k] || k}：${apiValueText(v)}`).join(" · ");
  return String(valueOr(value, () => ""));
}
function apiFactsHtml(entries) {
  const facts = entries.filter(([, value]) => apiValuePresent(value));
  return facts.length ? `<dl class="detail-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(apiValueText(value))}</dd></div>`).join("")}</dl>` : "";
}
function collectDetailsHtml(x) {
  const raw = rawCollectData(x), parts = [];
  const enhanced = valueOr(x.enhancedDescription, () => raw.enhanced_description);
  const tooltip = valueOr(x.tooltip, () => raw.tooltip);
  if (enhanced && enhanced !== x.description) parts.push(`<section class="detail-source"><h3>背景资料</h3><p class="api-text">${esc(enhanced)}</p></section>`);
  if (tooltip) parts.push(`<blockquote class="detail-quote">${esc(tooltip)}</blockquote>`);
  const facts = [["物品 ID", valueOr(x.itemId, () => valueOr(raw.item_id, () => (["relics", "ultimates", "tools"].includes(x.category) ? x.id : undefined)))], ["编号", valueOr(x.cardNumber, () => raw.number)], ["资料分类", raw.category], ["动作指令", valueOr(x.command, () => raw.command)], ["可交易", valueOr(raw.tradeable, () => x.tradeable)]];
  if (x.category === "mounts") facts.push(["移动方式", raw.movement], ["座位数", raw.seats], ["自带音乐", raw.custom_music]);
  if (x.category === "minions") facts.push(["行为", raw.behavior], ["种族", raw.race]);
  if (x.category === "cards") {
    const stats = valueOr(optional(raw.stats, entry => entry.formatted), () => valueOr(optional(raw.stats, entry => entry.numeric), () => x.cardStats));
    facts.push(["星级", valueOr(x.stars, () => valueOr(raw.stars, () => valueOr(optional(raw.rarity, entry => entry.stars), () => raw.rarity)))], ["点数", stats], ["卖价", valueOr(raw.sell_price, () => raw.sale_price)], ["卡牌类型", raw.type]);
  }
  const factsHtml = apiFactsHtml(facts);
  if (factsHtml) parts.push(`<section class="detail-source"><h3>藏品资料</h3>${factsHtml}</section>`);
  if (raw.verminion && typeof raw.verminion === "object") {
    const labels = { cost: "召唤成本", attack: "攻击力", defense: "防御力", hp: "生命值", speed: "移动速度", area_attack: "范围攻击", skill: "特殊技", skill_description: "特殊技说明", skill_angle: "技能角度", skill_cost: "特殊技点数", eye: "搜索之眼特效", gate: "传送门特效", shield: "护盾特效", skill_type: "特殊技类型" };
    parts.push(`<section class="detail-source"><h3>萌宠之王</h3>${apiFactsHtml(Object.entries(raw.verminion).map(([key, value]) => [labels[key] || key, value]))}</section>`);
  }
  if (x.category === "frames" && !Array.isArray(raw.sources)) parts.push('<p class="detail-note">FFXIV Collect API 未提供此肖像教材的获取来源；现有来源记录请以游戏内为准。可交易状态等缺失字段属于未知，不代表“否”。</p>');
  if (!optional(x.collect, entry => entry.data)) parts.push('<p class="detail-note">FFXIV Collect API 尚未覆盖此条目，保留已有资料。</p>');
  if (optional(x.collect, entry => entry.data)) parts.push(`<details class="detail-raw"><summary>查看完整 API 资料</summary><pre>${esc(JSON.stringify(raw, null, 2))}</pre></details>`);
  return parts.join("");
}
function collectSourcesHtml(x) {
  const raw = rawCollectData(x);
  const sources = Array.isArray(raw.sources) ? raw.sources : Array.isArray(x.sourceOriginal) ? x.sourceOriginal : [];
  if (!sources.length) return "";
  return `<details><summary>查看原始来源与关联编号</summary>${sources.map(s => `<p>${esc(apiValueText(s.type))} · ${esc(s.text)}${apiValuePresent(s.related_id) ? `<br>关联资料：${esc(s.related_type || "未提供类型")} #${esc(s.related_id)}` : ""}</p>`).join("")}</details>`;
}
function openDetail(key, remember = true) {
  const x = find(key);
  if (!x) return;
  modalKey = key;
  const owned = ownedKeys.has(key),
    wish = wishlistKeys.has(key),
    plan = planKeys.has(key);
  const detailImage = typeof x.previewImage === "string" && /^\/?assets\//.test(x.previewImage) ? x.previewImage : x.image;
  showModal(
    `<div class="detail-art ${["emotes", "orchestrions", "relics", "ultimates", "tools", "bardings", "cards", "facewear", "fashions", "frames"].includes(x.category) ? "icon-detail" : ""}" style="--item-color:${itemColor(x)}"><img src="${esc(detailImage)}" alt="${esc(x.name)}"></div><div class="detail-content"><span class="tag">${categories[x.category].name} · PATCH ${esc(x.patch)}</span><h2 id="modal-title">${esc(x.name)}</h2><span class="english">${x.name === x.english ? (optional(x.collect, entry => entry.data) ? "API 名称" : "原始名称") : esc(x.english)}</span>${x.series ? `<div class="detail-equipment-meta"><span class="tag">${esc(x.series)}</span><span class="tag">${esc(itemJobs(x).join(" / "))}</span>${x.stage ? `<span class="tag">${esc(x.stage)}</span>` : ""}</div>` : ""}${x.canonicalName && x.canonicalName !== x.name ? `<p class="detail-canonical">资料库名称：${esc(x.canonicalName)}</p>` : ""}<p class="description">${esc(x.description)}</p>${collectDetailsHtml(x)}<div class="detail-source"><h3>${icon("compass")} 获取途径</h3><p>${esc(x.source)}</p>${x.command ? `<p style="margin-top:7px;color:#bfa87a">动作指令：${esc(x.command)}</p>` : ""}${collectSourcesHtml(x)}</div><div class="detail-meta"><span>${hasOwnedRate(x) ? `社区持有率 ${x.ownedRate}%` : "社区持有率：暂无数据"}</span><span>资料编号 #${x.id}</span><a href="${esc(itemSourceUrl(x))}" target="_blank" rel="noopener noreferrer">原始资料 ${icon("external")}</a>${x.nameSource ? `<a href="${esc(x.nameSource)}" target="_blank" rel="noopener noreferrer">中文名依据 ${icon("external")}</a>` : ""}</div><div class="detail-actions"><button class="primary-btn" data-action="owned-toggle" data-key="${esc(x.key)}">${icon(owned ? "checkcircle" : "plus")} ${owned ? "已收藏 · 点击取消" : "标记为已收藏"}</button><button class="secondary-btn" data-action="wish-toggle" data-key="${esc(x.key)}" ${owned ? "disabled" : ""}>${icon("heart")} ${wish ? "移出心愿单" : "加入心愿单"}</button><button class="secondary-btn" data-action="plan-toggle" data-key="${esc(x.key)}">${icon("route")} ${plan ? "移出收集计划" : "加入收集计划"}</button></div><p class="detail-note">资料供规划参考，获取条件以游戏内为准。武器与工具按物品独立记录；系列筛选不代表已收录每一中间强化阶段。中文名称未核实时保留英文。持有率仅在来源提供时显示，不代表掉落率。</p></div>`,
    "detail",
    "",
    remember,
  );
}
function openProfile() {
  showModal(
    `<div class="simple-modal"><div class="eyebrow" style="margin-bottom:12px">YOUR PERSONAL ARCHIVE</div><h2 id="modal-title">你的冒险档案</h2><p class="muted">给藏馆留一个名字，让每一份收藏都属于你。<br>档案可保存到当前站点数据库，浏览器保留离线备份。无需提供游戏账号或密码。</p><form id="profile-form"><div class="form-field"><label for="profile-name">冒险者昵称</label><input id="profile-name" name="name" maxlength="18" required value="${esc(data.profile.name)}"></div><div class="form-field"><label for="profile-server">服务器 / 冒险世界</label><input id="profile-server" name="server" maxlength="24" value="${esc(data.profile.server)}"></div><div class="form-actions"><button class="primary-btn" type="submit">${icon("check")} 保存档案</button><button class="secondary-btn" type="button" data-action="close-modal">稍后再说</button></div></form>${accountPanelHtml()}<div class="data-actions"><h3>数据与备份 ${data.profile.demo ? '<span class="tag">当前为演示档案</span>' : ""}</h3><p>本机已保存 ${countOwned()} 件收藏、${data.wishlist.length} 件心愿和 ${data.plan.length} 个计划目标。数据库连接时会自动同步；访客身份依赖本浏览器会话，跨设备使用请注册账号。建议定期导出备份。</p><div class="form-actions"><button class="secondary-btn" data-action="export">${icon("download")} 导出档案</button><button class="secondary-btn" data-action="import">${icon("upload")} 导入备份</button><button class="secondary-btn danger-btn" data-action="clear-request">${icon("refresh")} ${data.profile.demo ? "清空演示，开始收藏" : "清空当前档案"}</button></div><input id="import-file" type="file" accept=".json,application/json" hidden></div></div>`,
    "profile",
  );
}
function openClearConfirm() {
  showModal(
    `<div class="simple-modal"><div class="eyebrow" style="margin-bottom:14px">A FRESH START</div><h2 id="modal-title">开启一份全新的收藏手记？</h2><p class="muted">这会清空当前档案中的收藏、心愿单、收集计划和动态，并在连接时同步到数据库，保留你的昵称与服务器。你可以先导出备份，之后随时恢复。</p><div class="form-actions"><button class="secondary-btn" data-action="export">${icon("download")} 先导出备份</button><button class="primary-btn" data-action="clear-confirm">确认清空并开始</button><button class="text-btn" data-action="profile">返回设置</button></div></div>`,
    "clear",
  );
}
function openAbout() {
  showModal(
    `<div class="simple-modal about-copy"><div class="eyebrow" style="margin-bottom:12px">MADE FOR THE JOURNEY</div><h2 id="modal-title">关于光之藏馆</h2><p>为热爱 FINAL FANTASY XIV 的光之战士制作的非官方收藏手记。本站收录 ${catalog.length} 个藏品，并非完整游戏数据库。</p><h3>版本与收录范围</h3><p>最新已发布国际服客户端：${esc(catalogMeta.latestReleasedPatch || "—")}；图鉴按 API 列表整理，活动开放与实际可获取状态以游戏内为准。8.0 Evercold 尚未发售，仅使用已公开的官方预告插画。武器和工具按实际物品记录，覆盖已收录系列的终阶与绝本物品，不等于包含全部强化中间阶段。</p><h3>资料与图片来源</h3><p>条目及社区持有率来自 <a href="https://ffxivcollect.com/" target="_blank" rel="noopener noreferrer">FFXIV Collect</a>，游戏图标来自 <a href="https://v2.xivapi.com/" target="_blank" rel="noopener noreferrer">XIVAPI</a>；背景使用 <a href="https://na.finalfantasyxiv.com/evercold/media/" target="_blank" rel="noopener noreferrer">8.0 Evercold 官方媒体页</a>。API 资料同步时间：${esc(catalogUpdatedAt())}。武器与工具物品资料来自 XIVAPI 游戏数据；未核实中文名的新增条目保留英文原名。条件以游戏内及原始资料为准。</p><h3>智能规划如何工作</h3><p>推荐在浏览器本地完成，根据未收藏条目、心愿单、玩法偏好和目标数量进行排序。没有模型对话，也不需要 API 密钥。时间预算只用于控制计划长度，不是获取耗时估计。</p><h3>你的收藏，属于你</h3><p>数据库连接时档案会自动同步，浏览器同时保留离线备份。注册收藏站账号后可跨浏览器使用，也可导入或导出 JSON 档案。本站不连接游戏账号，不自动同步角色信息。</p><p>© SQUARE ENIX CO., LTD. All Rights Reserved.<br>FINAL FANTASY XIV 及其相关图像、名称归各权利人所有。</p></div>`,
    "about",
  );
}
function openActivity() {
  const list = data.activity.slice(0, 12);
  showModal(
    `<div class="simple-modal"><div class="eyebrow" style="margin-bottom:12px">LITTLE MOMENTS, BIG MEMORIES</div><h2 id="modal-title">收藏动态</h2><p class="muted">记录每一次相遇，也记录每一步成长。</p><div class="notice-list">${list.length ? list.map((x) => `<div class="notice-entry">${icon("sparkles")}<div>${esc(x.text)}<small>${esc(new Date(x.at).toLocaleString("zh-CN"))}</small></div></div>`).join("") : `<div class="notice-entry">${icon("book")}<div>${data.profile.demo ? "当前为演示档案，欢迎先体验图鉴和收藏功能。" : "你的收藏故事，从这里开始。"}<small>标记新的收藏后，这里会留下记录。</small></div></div>`}</div></div>`,
    "activity",
  );
}
function openPlanner(style) {
  preferenceDraft = {
    ...data.preferences,
    ...(style ? { style } : {}),
    category: hasOwn(categories, view)
      ? view
      : data.preferences.category,
  };
  renderPlanner();
}
function renderPlanner() {
  const p = preferenceDraft;
  showModal(
    `<div class="simple-modal planner-modal"><div class="eyebrow" style="margin-bottom:12px">A PLAN MADE JUST FOR YOU</div><h2 id="modal-title">今天，想怎样冒险？</h2><p class="muted">告诉藏馆一点偏好，从未收藏的条目中发现下一份心动。</p><form id="planner-form"><div class="planner-label">想收集什么？</div><div class="choice-row category-choices">${[["all", "不限分类", "compass"], ...Object.entries(categories).map(([id, c]) => [id, c.name, c.icon])].map(([v, n, i]) => `<label class="choice-chip"><input type="radio" name="category" value="${v}" ${p.category === v ? "checked" : ""}>${icon(i)}<span>${n}</span></label>`).join("")}</div><div class="planner-label">今天的冒险方式</div><div class="style-choices">${[
      ["casual", "feather", "轻松收藏", "优先任务、兑换与日常目标"],
      ["solo", "compass", "独自出发", "优先可独立推进的获取方式"],
      ["challenge", "trophy", "挑战珍藏", "优先成就、副本与低持有率目标"],
    ]
      .map(
        ([v, i, n, d]) =>
          `<label class="style-choice"><input type="radio" name="style" value="${v}" ${p.style === v ? "checked" : ""}><span class="style-icon">${icon(i)}</span><strong>${n}</strong><small>${d}</small><span class="choice-dot"></span></label>`,
      )
      .join(
        "",
      )}</div><div class="planner-label">给今天的收藏留一点时间</div><div class="choice-row budget-choices">${[
      ["20", "20 分钟", "2 个目标"],
      ["45", "45 分钟", "3 个目标"],
      ["90", "90 分钟", "4 个目标"],
    ]
      .map(
        ([v, n, d]) =>
          `<label class="choice-chip"><input type="radio" name="budget" value="${v}" ${p.budget === v ? "checked" : ""}>${icon("clock")}<span>${n}<small>${d}</small></span></label>`,
      )
      .join(
        "",
      )}</div><p class="planner-budget-note">时间预算仅用于控制目标数量，不代表预计获取耗时。</p><div class="planner-options"><label><input type="checkbox" name="excludePaid" ${p.excludePaid ? "checked" : ""}> 排除商城与付费特典</label><label><input type="checkbox" name="prioritizeWish" ${p.prioritizeWish ? "checked" : ""}> 优先心愿清单</label></div><div class="planner-submit"><span>${icon("lock")} 偏好随收藏档案保存</span><button type="submit" class="primary-btn">${icon("sparkles")} 寻找下一份珍藏 ${icon("arrow")}</button></div></form></div>`,
    "planner",
  );
}
function generatePlan(p) {
  let pool = catalog.filter(
    (x) =>
      !ownedKeys.has(x.key) &&
      (p.category === "all" || x.category === p.category) &&
      (!p.excludePaid || !x.premium),
  );
  if (p.style === "solo")
    pool = pool.filter(
      (x) =>
        [
          "金碟游乐场",
          "雇员探险",
          "友好部族",
          "狩猎兑换",
          "商店购买",
          "危命任务",
          "商城特典",
        ].includes(x.sourceType) ||
        ["emotes-199", "emotes-126", "emotes-121", "emotes-122"].includes(
          x.key,
        ),
    );
  return pool
    .map((x, i) => {
      let score =
        1 + (p.prioritizeWish && wishlistKeys.has(x.key) ? 80 : 0);
      if (p.style === "casual")
        score +=
          ({
            任务奖励: 40,
            金碟游乐场: 26,
            商店购买: 15,
            雇员探险: 24,
            友好部族: 20,
            狩猎兑换: 22,
          }[x.sourceType] || 0) +
          (hasOwnedRate(x) ? x.ownedRate : 50) / 10;
      if (p.style === "challenge")
        score +=
          ({ 团队副本: 35, 蛮神讨伐: 28, 成就奖励: 40, 深层迷宫: 22, 绝境战: 55, 武器强化: 30, 工具强化: 25 }[
            x.sourceType
          ] || 0) +
          (hasOwnedRate(x) ? (100 - x.ownedRate) / 4 : 0);
      if (p.style === "solo")
        score +=
          { 任务奖励: 35, 金碟游乐场: 30, 雇员探险: 28, 友好部族: 24 }[
            x.sourceType
          ] || 0;
      return { x, score: score - i / 1000 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, { 20: 2, 45: 3, 90: 4 }[p.budget] || 3)
    .map((r) => r.x);
}
function renderRecommendations() {
  const items = generated.map(find).filter(Boolean),
    p = data.preferences;
  showModal(
    `<div class="simple-modal recommendation-modal"><div class="eyebrow" style="margin-bottom:12px">YOUR NEXT CHAPTER</div><h2 id="modal-title">为今天的你，挑好了这些珍藏</h2><p class="muted">${p.style === "solo" ? "独自出发" : p.style === "challenge" ? "挑战珍藏" : "轻松收藏"} · ${esc(p.budget)} 分钟规划 · ${items.length} 个目标<br>基于你的未收藏条目${p.prioritizeWish ? "与心愿清单" : ""}，在本机完成推荐。</p>${items.length ? `<div class="recommendation-list">${items.map((x, i) => `<article class="recommendation-item"><span class="recommendation-number">0${i + 1}</span><img src="${esc(x.image)}" alt="${esc(x.name)}"><div><h3>${esc(x.name)} ${wishlistKeys.has(x.key) ? '<span class="tag">心愿优先</span>' : ""}</h3><p>${esc(x.source)}</p><small>${p.style === "solo" ? "先检查解锁前置与所需货币" : p.style === "challenge" ? "按当前进度准备条件，掉落结果具有随机性" : "优先推进已有任务或货币接近的目标"}</small></div></article>`).join("")}</div><div class="planner-result-note">${icon("info")} 时间预算用于控制目标数量，不承诺完成时间。实际解锁条件与获取方式请核对游戏内资料。</div><div class="planner-submit"><button class="text-btn" data-action="planner">${icon("refresh")} 调整偏好</button><button class="primary-btn" data-action="accept-plan">${icon("plus")} 加入我的收集计划</button></div>` : emptyState("这一页，暂时没有新的目标", "可以调整分类或获取方式，再寻找新的收藏灵感。", "planner", "调整偏好")}</div>`,
    "recommendations",
  );
}
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "eorzea-archive-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast("收藏档案已导出");
}
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action,
    key = el.dataset.key;
  if (a === "backdrop") {
    if (event.target === el) closeModal();
    return;
  }
  if (a === "load-more") {
    const previous = visibleLimit; visibleLimit += 96; renderCatalog();
    optional($(".collection-grid"), grid => optional(grid.querySelectorAll(".card-open")[previous], entry => entry.focus()));
    return;
  }
  if (a === "navigate") return navigate(el.dataset.view);
  if (a === "detail") return openDetail(key);
  if (a === "owned-toggle") return toggleOwned(key);
  if (a === "wish-toggle") return toggleWish(key);
  if (a === "plan-toggle") return togglePlan(key);
  if (a === "profile") return openProfile();
  if (a === "sync-retry") { void reconnectArchive(); return; }
  if (a === "account-logout") { void logoutAccount(); return; }
  if (a === "about") return openAbout();
  if (a === "activity") return openActivity();
  if (a === "close-modal") return closeModal();
  if (a === "open-menu") {
    $(".sidebar").classList.add("open");
    $(".mobile-overlay").classList.add("visible");
    return;
  }
  if (a === "close-menu") {
    $(".sidebar").classList.remove("open");
    $(".mobile-overlay").classList.remove("visible");
    return;
  }
  if (a === "exchange-track") {
    navigate("exchange");
    exchangeCurrency = hasOwn(exchangeCurrencies, el.dataset.currency) ? el.dataset.currency : "";
    exchangeExpansion = el.dataset.expansion || "";
    exchangeRegion = el.dataset.region || "";
    render();
    return;
  }
  if (a === "latest") {
    navigate("overview");
    category = "all";
    patchFilter = "7.";
    sort = "patch";
    showFilters = true;
    renderCatalog();
    optional($("#catalog-section"), entry => entry.scrollIntoView({ block: "start" }));
    return;
  }
  if (a === "discover") {
    optional($("#catalog-section"), entry => entry.scrollIntoView({
      behavior: "smooth",
      block: "start",
    }));
    return;
  }
  if (a === "tab") {
    const targetCategory = el.dataset.category;
    if (hasOwn(categories, view)) {
      if (targetCategory === "all") {
        navigate("overview");
        category = "all";
        renderCatalog();
        optional($("#catalog-section"), entry => entry.scrollIntoView({ block: "start" }));
      } else {
        navigate(targetCategory);
      }
      return;
    }
    category = targetCategory;
    source = "";
    patchFilter = "";
    jobFilter = "";
    seriesFilter = "";
    renderCatalog();
    return;
  }
  if (a === "status") {
    status = el.dataset.status;
    renderCatalog();
    return;
  }
  if (a === "layout") {
    layout = el.dataset.layout;
    renderCatalog();
    return;
  }
  if (a === "filter-toggle") {
    showFilters = !showFilters;
    renderCatalog();
    return;
  }
  if (a === "clear-filters") {
    clearTimeout(searchTimer);
    exchangeCurrency = "";
    exchangeExpansion = "";
    exchangeRegion = "";
    source = "";
    patchFilter = "";
    jobFilter = "";
    seriesFilter = "";
    status = "all";
    query = "";
    const input = $("#global-search");
    if (input) input.value = "";
    if (view === "explore") {
      renderMain();
      $(".page-heading p").textContent = "浏览全部藏品 · 支持中文、英文及获取途径";
    } else {
      renderCatalog();
    }
    return;
  }
  if (a === "browse") return navigate("overview");
  if (a === "export") return exportData();
  if (a === "import") return optional($("#import-file"), entry => entry.click());
  if (a === "clear-request") return openClearConfirm();
  if (a === "clear-confirm") {
    data = {
      ...demo(),
      profile: { ...data.profile, demo: false },
      owned: [],
      wishlist: [],
      plan: [],
      activity: [],
    };
    save("开启了一份全新的收藏手记");
    closeModal(false);
    render();
    toast("新的收藏旅程，从这里开始");
    return;
  }
  if (a === "planner") return openPlanner();
  if (a === "quick-plan") return openPlanner(el.dataset.style);
  if (a === "accept-plan") {
    const count = generated.filter((k) => !planKeys.has(k)).length;
    data.plan = [...new Set([...data.plan, ...generated])];
    save("为下一次出发制定了收集计划");
    navigate("plan");
    toast(
      count
        ? "已将 " + count + " 个新目标加入收集计划"
        : "这些目标已经在你的收集计划中了",
    );
    return;
  }
});
function applySearch(input) {
  query = input.value.trim();
  view = "explore";
  category = "all";
  status = "all";
  source = "";
  patchFilter = "";
  jobFilter = "";
  seriesFilter = "";
  renderMain();
  $(".breadcrumb span:last-child").textContent = "搜索图鉴";
  document.querySelectorAll(".nav-item.active").forEach((el) => {
    el.classList.remove("active");
    el.removeAttribute("aria-current");
  });
}
function scheduleSearch(input) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(input), 150);
}
document.addEventListener("compositionstart", (event) => {
  if (event.target.id !== "global-search") return;
  searchComposing = true; clearTimeout(searchTimer);
});
document.addEventListener("compositionend", (event) => {
  if (event.target.id !== "global-search") return;
  searchComposing = false; scheduleSearch(event.target);
});
document.addEventListener("input", (event) => {
  if (event.target.id === "global-search" && !event.isComposing && !searchComposing) scheduleSearch(event.target);
});
document.addEventListener("change", async (event) => {
  if (["exchange-currency", "exchange-expansion", "exchange-region"].includes(event.target.id)) {
    if (event.target.id === "exchange-currency") {
      exchangeCurrency = event.target.value;
      exchangeExpansion = "";
      exchangeRegion = "";
    } else if (event.target.id === "exchange-expansion") {
      exchangeExpansion = event.target.value;
      exchangeRegion = "";
    } else exchangeRegion = event.target.value;
    category = "all";
    source = "";
    patchFilter = "";
    seriesFilter = "";
    jobFilter = "";
    renderCatalog();
    return;
  }

  if (event.target.id === "sort-select") {
    sort = event.target.value;
    renderCatalog();
  }
  if (event.target.id === "source-select") {
    source = event.target.value;
    renderCatalog();
  }
  if (event.target.id === "patch-select") {
    patchFilter = event.target.value;
    renderCatalog();
  }
  if (event.target.id === "job-select" || event.target.id === "series-select") {
    if (event.target.id === "job-select") jobFilter = event.target.value;
    else seriesFilter = event.target.value;
    renderCatalog();
  }
  if (event.target.id === "import-file") {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2e6)
        throw Error("备份文件过大，请选择小于 2 MB 的本站档案。");
      const imported = normalize(JSON.parse(await file.text()));
      window.pendingImport = imported;
      showModal(
        `<div class="simple-modal"><h2 id="modal-title">恢复这份收藏档案？</h2><p class="muted">来自 ${esc(imported.profile.name)} 的备份包含 ${imported.owned.length} 件收藏、${imported.wishlist.length} 件心愿、${imported.plan.length} 个计划目标。导入后将替换本机现有档案。</p><div class="form-actions"><button class="primary-btn" id="confirm-import">确认导入</button><button class="secondary-btn" data-action="profile">返回设置</button></div></div>`,
        "import",
      );
      $("#confirm-import").addEventListener("click", () => {
        data = window.pendingImport;
        delete window.pendingImport;
        save("从备份恢复了收藏档案");
        closeModal(false);
        render();
        toast("收藏档案已恢复");
      });
    } catch (error) {
      toast(
        error instanceof SyntaxError
          ? "文件不是有效的 JSON 备份"
          : error.message,
      );
      event.target.value = "";
    }
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "account-form") {
    event.preventDefault();
    void submitAccount(event.target, optional(event.submitter, entry => entry.value) === "register" ? "register" : "login");
    return;
  }
  if (event.target.id === "profile-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    data.profile.name =
      String(form.get("name")).trim().slice(0, 18) || "光之冒险者";
    data.profile.server =
      String(form.get("server")).trim().slice(0, 24) || "艾欧泽亚";
    save();
    closeModal(false);
    render();
    toast("冒险档案已保存");
  }
  if (event.target.id === "planner-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    data.preferences = {
      category: String(form.get("category") || "all"),
      style: String(form.get("style") || "casual"),
      budget: String(form.get("budget") || "45"),
      excludePaid: form.has("excludePaid"),
      prioritizeWish: form.has("prioritizeWish"),
    };
    save();
    generated = generatePlan(data.preferences).map((x) => x.key);
    renderRecommendations();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (activeModal) closeModal(false);
    optional($("#global-search"), entry => entry.focus());
    optional($("#global-search"), entry => entry.select());
  }
  if (event.key === "Escape") {
    if (activeModal) closeModal();
    optional($(".sidebar"), entry => entry.classList.remove("open"));
    optional($(".mobile-overlay"), entry => entry.classList.remove("visible"));
  }
  if (event.key === "Tab" && activeModal) {
    const els = [
        ...document.querySelectorAll(
          '.modal button:not(:disabled),.modal a[href],.modal input:not([hidden]):not([type="file"]),.modal select,.modal textarea,.modal summary',
        ),
      ].filter((x) => x.offsetParent !== null),
      first = els[0],
      last = els[els.length - 1];
    if (!els.length) return;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === $(".modal"))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === $(".modal"))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  if (
    event.target.getAttribute("role") === "tab" &&
    ["ArrowLeft", "ArrowRight"].includes(event.key)
  ) {
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[role="tab"]')],
      i = tabs.indexOf(event.target),
      n =
        (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[n].click();
    optional(document.querySelectorAll('[role="tab"]')[n], entry => entry.focus());
  }
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (next === "main") {
    optional($("#main"), entry => entry.focus());
    return;
  }
  navigate(next);
});
async function init() {
  try {
    let json;
    try { json = await archiveSync.api.catalog(); }
    catch {
      const response = await fetch("catalog.json");
      if (!response.ok) throw Error("catalog unavailable");
      json = await response.json();
    }
    catalog = json.items;
    catalogMeta = json.meta || {};
    rebuildCatalogIndexes();
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey));
    } catch {}
    try {
      data = stored ? normalize(stored) : demo();
    } catch {
      data = demo();
    }
    persistLocalArchive();
    const initial = location.hash.slice(1);
    if (initial) navigate(initial);
    else render();
    void archiveSync.start();
  } catch {
    $("#app").innerHTML =
      '<main class="page-error"><h1>还差一步，就能打开你的藏馆</h1><p>请通过本地服务打开网站，而不是双击 HTML 文件。<br>在项目文件夹运行：</p><code>npm start</code><p>然后打开 http://127.0.0.1:4173</p></main>';
  }
}
window.addEventListener("online", () => { if (data) void archiveSync.start(); });
window.addEventListener("focus", () => { if (data && !activeModal) void archiveSync.pull(); });
window.addEventListener("pagehide", () => { if (data) persistLocalArchive(); });
init();
