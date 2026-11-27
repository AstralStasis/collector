/** Real-catalog filter checks run without a browser, network or database writes. */
import fs from "fs";
import vm from "vm";
import { strict as assert } from "assert";
import test from "./support/test.mjs";

const frontend = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8")
  .replace(/^import[^\n]+\n/, "").replace(/\ninit\(\);\s*$/, "\n");
const items = JSON.parse(fs.readFileSync(new URL("../catalog.json", import.meta.url), "utf8")).items;
const ordinary = ["mounts", "minions", "bardings", "orchestrions", "cards", "facewear", "fashions", "frames", "emotes"];
function harness(fixture = items) {
  const listeners = {}, nodes = new Map();
  const element = () => ({ innerHTML: "", value: "", classList: { add() {}, remove() {} }, querySelectorAll() { return []; }, focus() {}, scrollIntoView() {} });
  const document = {
    body: { classList: { add() {}, remove() {} } },
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { (listeners[name] || (listeners[name] = [])).push(handler); },
  };
  const context = vm.createContext({
    console, fixture, document,
    ArchiveApi: class {},
    ArchiveSynchronizer: class { constructor() { this.state = { message: "" }; } },
    window: { addEventListener() {}, scrollTo() {} },
    history: { replaceState() {} }, localStorage: { setItem() {} },
    setTimeout() { return 1; }, clearTimeout() {},
  });
  vm.runInContext(frontend, context);
  const run = code => vm.runInContext(code, context);
  run("catalog=fixture;rebuildCatalogIndexes();data=demo();refreshArchiveIndexes();");
  return {
    run,
    html: () => document.querySelector("#catalog-section").innerHTML,
    change: (id, value) => listeners.change[0]({ target: { id, value } }),
    click: (action, dataset = {}) => listeners.click[0]({ target: { closest: () => ({ dataset: { action, ...dataset } }) } }),
  };
}
const keys = rows => rows.map(row => row.key).sort();
test("ordinary category tabs reveal filters from overview and search", () => {
  const ui = harness();
  for (const view of ["overview", "explore", "wishlist"]) {
    for (const category of ordinary) {
      ui.run("navigate(" + JSON.stringify(view) + ")");
      ui.click("tab", { category });
      assert.match(ui.html(), /id="source-select"/);
      assert.match(ui.html(), /id="patch-select"/);
      assert.equal(ui.run("category"), category);
    }
  }
});
for (const category of ordinary) {
  test(category + " exposes version and acquisition filters, combines them and resets", async () => {
    const ui = harness(), rows = items.filter(row => row.category === category);
    ui.run("navigate(" + JSON.stringify(category) + ")");
    assert.match(ui.html(), /id="source-select"/);
    assert.match(ui.html(), /id="patch-select"/);
    assert(!ui.html().includes('id="series-select"'));
    assert(!ui.html().includes('id="job-select"'));
    const sources = Array.from(ui.run("cascadingFilterOptions().sources")).sort();
    assert.deepEqual(sources, [...new Set(rows.map(row => row.sourceType))].sort());
    const sample = rows[0], patch = String(sample.patch).split(".")[0] + ".";
    await ui.change("source-select", sample.sourceType);
    await ui.change("patch-select", patch);
    const expected = rows.filter(row => row.sourceType === sample.sourceType && String(row.patch).startsWith(patch));
    assert.deepEqual(Array.from(ui.run("filteredItems().map(x=>x.key)")).sort(), keys(expected));
    assert.match(ui.html(), new RegExp("找到 " + expected.length + " 件藏品"));
    assert.equal(ui.run("visibleLimit"), 96);
    ui.click("clear-filters");
    assert.equal(ui.run("source"), ""); assert.equal(ui.run("patchFilter"), "");
    assert.equal(ui.run("filteredItems().length"), rows.length);
    ui.click("filter-toggle"); assert(!ui.html().includes('id="source-select"'));
    ui.run("navigate(" + JSON.stringify(category) + ")");
    assert.match(ui.html(), /id="source-select"/);
  });
}
test("changing acquisition clears an invalid version without breaking load more", async () => {
  const fixture = Array.from({ length: 180 }, (_, index) => ({
    ...items.find(row => row.category === "mounts"), key: "filter-" + index,
    patch: index < 50 ? "2.0" : "7.1", sourceType: index < 50 ? "任务奖励" : "成就奖励",
  }));
  const ui = harness(fixture);
  ui.run('navigate("mounts")');
  await ui.change("source-select", "任务奖励"); await ui.change("patch-select", "2.");
  await ui.change("source-select", "成就奖励");
  assert.equal(ui.run("patchFilter"), "");
  assert.equal(ui.run("filteredItems().length"), 130);
  assert.equal((ui.html().match(/<article class="collectible"/g) || []).length, 96);
  ui.click("load-more");
  assert.equal((ui.html().match(/<article class="collectible"/g) || []).length, 130);
});
test("category changes clear incompatible selections and equipment keeps its extra filters", async () => {
  const ui = harness();
  ui.run('navigate("mounts");source="不存在的来源";patchFilter="2.";jobFilter="旧职业";seriesFilter="旧系列";navigate("facewear")');
  assert.equal(ui.run("source+patchFilter+jobFilter+seriesFilter"), "");
  assert.equal(ui.run("filteredItems().length"), items.filter(row => row.category === "facewear").length);
  assert.deepEqual(Array.from(ui.run("cascadingFilterOptions().patches.map(x=>x[0])")), ["7."]);
  for (const category of ["ultimates", "relics", "tools"]) {
    ui.run("navigate(" + JSON.stringify(category) + ")");
    assert.match(ui.html(), /id="source-select"/); assert.match(ui.html(), /id="patch-select"/);
    assert.match(ui.html(), /id="series-select"/); assert.match(ui.html(), /id="job-select"/);
  }
});
