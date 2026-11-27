import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(path.join(root, "tests")).filter(name => name.endsWith(".test.mjs")).sort();
async function main() {
  if (Number(process.versions.node.split(".")[0]) >= 18 && process.env.COLLECTOR_PORTABLE_TESTS !== "1") {
    const result = spawnSync(process.execPath, ["--test", ...files.map(name => path.join(root, "tests", name))], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
    return;
  }
  for (const name of files) await import(pathToFileURL(path.join(root, "tests", name)).href);
  const { runRegisteredTests } = await import("../tests/support/test.mjs");
  await runRegisteredTests();
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
