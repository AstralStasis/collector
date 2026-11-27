/**
 * Isolated UI checks: read app.js, replace its API/DOM/timers in memory,
 * and suppress init(). No service, database, network, or product-file writes.
 * Run from project root: npm test
 */
import fs from "node:fs";
import vm from "node:vm";
import { strict as assert } from "assert";
import test from "./support/test.mjs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../app.js", import.meta.url));
const original = fs.readFileSync(appPath, "utf8");
assert.match(original, /^import \{ ArchiveApi, ArchiveSynchronizer \} from "\.\/api-client\.js";/);
assert.match(original, /\ninit\(\);\s*$/);
const source = original.replace(/^import[^\n]+\n/, "").replace(/\ninit\(\);\s*$/, "\n");
const section = { innerHTML: "" };
const node = {
  innerHTML: "", textContent: "", value: "",
  classList: { remove() {}, add() {} },
  removeAttribute() {}, querySelectorAll() { return []; },
};
const listeners = {}, timers = new Map();
let timerId = 0;
const context = vm.createContext({
  console,
  ArchiveApi: class {},
  ArchiveSynchronizer: class { constructor() { this.state = { message: "" }; } },
  window: { addEventListener() {} },
  document: {
    querySelector(selector) { return selector === "#catalog-section" ? section : node; },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { (listeners[name] || (listeners[name] = [])).push(handler); },
  },
  localStorage: { setItem() {} },
  fetch() { throw new Error("Network is disabled in collect-ui-check"); },
  setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
  clearTimeout(id) { timers.delete(id); },
});
vm.runInContext(source, context, { filename: appPath });
const run = (code) => vm.runInContext(code, context);
const checks = [];
function check(name, verify) { test(name, verify); checks.push(name); }
context.items = Array.from({ length: 3414 }, (_, index) => ({
  key: "mounts-" + index, id: index, category: "mounts", name: "藏品" + index,
  english: "Item" + index, patch: "7.1", source: "任务", sourceType: "任务奖励",
  image: "assets/test.webp", description: "背景", sourceOriginal: [],
}));
run('catalog=items;rebuildCatalogIndexes();data={...demo(),owned:[...catalog.map(x=>x.key),"unknown-1"],wishlist:[],plan:[]};refreshArchiveIndexes();view="explore";category="all";');

check("3414 indexes; 96/192 batches; search includes last item", () => {
  assert.equal(run('find("mounts-3413").id'), 3413);
  run("renderCatalog()");
  assert.equal((section.innerHTML.match(/<article class="collectible"/g) || []).length, 96);
  assert.match(section.innerHTML, /再显示 96 件/);
  run("visibleLimit+=96;renderCatalog()");
  assert.equal((section.innerHTML.match(/<article class="collectible"/g) || []).length, 192);
  run('query="藏品3413";renderCatalog()');
  assert.equal((section.innerHTML.match(/<article class="collectible"/g) || []).length, 1);
  assert.match(section.innerHTML, /藏品3413/);
  assert.equal(run("catalog.length"), 3414);
});

check("unknown archive keys/order retained; progress counts only known keys", () => {
  assert.equal(run("countOwned()"), 3414);
  assert.equal(run("Math.round(countOwned()/catalog.length*100)"), 100);
  const normalized = run('normalize({...data,owned:["emotes-217","unknown-1","emotes-217"],wishlist:["emotes-198","emotes-217"],plan:["unknown-1","emotes-217"]})');
  assert.deepEqual(Array.from(normalized.owned), ["emotes-217", "unknown-1"]);
  assert.deepEqual(Array.from(normalized.wishlist), ["emotes-198"]);
  assert.deepEqual(Array.from(normalized.plan), ["unknown-1", "emotes-217"]);
});

check("mount false/zero, source relation IDs, and escaped API text", () => {
  context.mount = { category: "mounts", description: "desc", collect: { data: {
    seats: 0, custom_music: false, tradeable: false, item_id: 24626,
    enhanced_description: "背景<script>x</script>", tooltip: "引语<img>",
    sources: [{ type: "Achievement", text: "来源<&", related_type: "Achievement", related_id: 2227 }],
  } } };
  const html = run("collectDetailsHtml(mount)"), sources = run("collectSourcesHtml(mount)");
  assert.match(html, /座位数<\/dt><dd>0/);
  assert.match(html, /自带音乐<\/dt><dd>否/);
  assert.match(html, /可交易<\/dt><dd>否/);
  assert(!html.includes("<script>")); assert(!html.includes("<img>"));
  assert.match(sources, /#2227/); assert.match(sources, /&lt;&amp;/);
});

check("minion behavior/race and complete verminion facts", () => {
  context.minion = { category: "minions", collect: { data: {
    behavior: { id: 2, name: "自主" }, race: { id: 2, name: "魔物" },
    verminion: { cost: 0, attack: 30, defense: 40, hp: 390, speed: 2, area_attack: false,
      skill: "自爆", skill_description: "说明", skill_angle: 360, skill_cost: 30,
      eye: true, gate: false, shield: true, skill_type: { id: 1, name: "攻击" } },
  } } };
  const html = run("collectDetailsHtml(minion)");
  assert.match(html, /自主/); assert.match(html, /魔物/); assert.match(html, /萌宠之王/);
  assert.match(html, /召唤成本<\/dt><dd>0/); assert.match(html, /范围攻击<\/dt><dd>否/);
  assert.match(html, /特殊技点数/); assert.match(html, /特殊技类型/);
});

check("card formatted A points and zero sell_price", () => {
  context.card = { category: "cards", cardStats: { top: 10, right: 2, bottom: 3, left: 4 }, collect: { data: {
    number: "No. 1", stars: 1, sell_price: 0,
    stats: { numeric: { top: 10, right: 2, bottom: 3, left: 4 }, formatted: { top: "A", right: 2, bottom: 3, left: 4 } },
    type: { id: 0, name: "Normal" },
  } } };
  const html = run("collectDetailsHtml(card)");
  assert.match(html, /上：A · 右：2 · 下：3 · 左：4/);
  assert.match(html, /卖价<\/dt><dd>0/);
});

check("frame missing source/tradeable stays unknown rather than false", () => {
  context.frame = { category: "frames", collect: { data: { id: 254 } } };
  const html = run("collectDetailsHtml(frame)");
  assert.match(html, /未提供此肖像教材/);
  assert(!html.includes("<dt>可交易</dt><dd>否"));
});

check("2B API name label; optional preview accepts only local assets", () => {
  run('showModal=(html)=>{captured=html;};catalog[0].name="2B";catalog[0].english="2B";catalog[0].collect={data:{id:0}};catalog[0].previewImage="https://outside.example/image.png";openDetail("mounts-0")');
  const html = run("captured");
  assert.match(html, /src="assets\/test.webp"/);
  assert(!html.includes('src="https://outside'));
  assert(!html.includes("中文名待核实"));
  assert.match(html, /API 名称/);
  run('catalog[0].previewImage="assets/local-preview.webp";openDetail("mounts-0")');
  assert.match(run("captured"), /src="assets\/local-preview.webp"/);
});

check("150ms debounce waits for IME completion", () => {
  const input = { id: "global-search", value: "未提交拼音" };
  listeners.compositionstart[0]({ target: input });
  listeners.input[0]({ target: input, isComposing: true });
  assert.equal(timers.size, 0);
  listeners.compositionend[0]({ target: input });
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 150);
  assert.equal(run("query"), "藏品3413");
  input.value = "啦哩吼舞";
  [...timers.values()][0].fn();
  assert.equal(run("query"), "啦哩吼舞");
});

check("website announcements are shared updates rather than personal collection activity", async () => {
  context.originalArchiveJSON = run("JSON.stringify(data)");
  context.originalShowModal = run("showModal");
  try {
    run('data.activity=[{text:"PRIVATE_COLLECTION_ACTIVITY",at:1}];showModal=(html,type)=>{announcementCapture={html,type};};');
    const archiveBefore = run("JSON.stringify(data)");
    await listeners.click[0]({ target: { closest: () => ({ dataset: { action: "announcements" } }) } });
    const captured = run("announcementCapture"), entries = Array.from(run("siteAnnouncements"));
    assert.equal(captured.type, "announcements");
    assert.match(captured.html, /<h2 id="modal-title">网站修改公告<\/h2>/);
    assert(entries.length > 0);
    assert.equal((captured.html.match(/class="notice-entry"/g) || []).length, entries.length);
    for (const entry of entries) {
      assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
      assert(captured.html.includes(entry.title));
      assert(captured.html.includes('<time datetime="' + entry.date + '">'));
    }
    assert(!captured.html.includes("PRIVATE_COLLECTION_ACTIVITY"));
    assert(!captured.html.includes("收藏动态"));
    assert.equal(run("JSON.stringify(data)"), archiveBefore);
    run('data.activity=[];data.profile.demo=false;openAnnouncements();');
    assert.equal(run("announcementCapture.html"), captured.html);
  } finally {
    run("showModal=originalShowModal;data=JSON.parse(originalArchiveJSON);refreshArchiveIndexes();");
  }
});

