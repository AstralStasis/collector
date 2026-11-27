import { createRequire } from "module";

const require = createRequire(import.meta.url);
let nativeTest;
if (process.env.COLLECTOR_PORTABLE_TESTS !== "1") {
  try { nativeTest = require("node:test"); }
  catch (error) {
    if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_UNKNOWN_BUILTIN_MODULE") throw error;
  }
}
const registered = [];
export const usesNativeRunner = Boolean(nativeTest);
export default function test(name, options, verify) {
  if (typeof options === "function") { verify = options; options = {}; }
  options = options || {};
  if (nativeTest) return nativeTest(name, options, verify);
  if (typeof verify !== "function") throw new TypeError("A test callback is required: " + name);
  registered.push({ name, options, verify });
}

// Node 12 has no node:test. This small runner implements the subset used by
// this project: sequential tests/subtests, after hooks, skip and timeouts.
// Newer Node versions continue to use the built-in runner unchanged.
export async function runRegisteredTests() {
  if (nativeTest) throw new Error("Portable runner must not replace native node:test.");
  const totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  console.log("TAP version 13");
  async function execute(entry, parentName) {
    const name = (parentName ? parentName + " > " : "") + entry.name;
    const label = name.replace(/[\r\n]/g, " ");
    if (entry.options.skip) {
      totals.tests++; totals.skipped++;
      console.log("ok " + totals.tests + " - " + label + " # SKIP");
      return true;
    }
    const hooks = [];
    let failedChild = false, failure, timer;
    const context = {
      after(callback) { hooks.push(callback); },
      async test(childName, options, verify) {
        if (typeof options === "function") { verify = options; options = {}; }
        const passed = await execute({ name: childName, options: options || {}, verify }, name);
        if (!passed) failedChild = true;
      }
    };
    const timeout = entry.options.timeout || 120000;
    try {
      await Promise.race([
        Promise.resolve().then(() => entry.verify(context)),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("Test timed out after " + timeout + "ms")), timeout); })
      ]);
    } catch (error) { failure = error; }
    finally {
      clearTimeout(timer);
      for (const hook of hooks) {
        try { await hook(); } catch (error) { if (!failure) failure = error; }
      }
    }
    if (!failure && failedChild) failure = new Error("A subtest failed.");
    totals.tests++;
    if (failure) {
      totals.fail++;
      console.log("not ok " + totals.tests + " - " + label);
      console.log(String(failure.stack || failure).split("\n").map(line => "# " + line).join("\n"));
    } else { totals.pass++; console.log("ok " + totals.tests + " - " + label); }
    return !failure;
  }
  for (const entry of registered) await execute(entry, "");
  console.log("1.." + totals.tests);
  for (const key of ["tests", "pass", "fail", "skipped"]) console.log("# " + key + " " + totals[key]);
  if (totals.fail) process.exitCode = 1;
  return totals;
}
