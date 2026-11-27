import {readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const root=fileURLToPath(new URL("../",import.meta.url));
function sourceFiles(directory) {
  const files=[];
  for(const entry of readdirSync(path.join(root,directory),{withFileTypes:true})) {
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory()) files.push(...sourceFiles(filename));
    else if(entry.isFile() && /[.](?:mjs|cjs|js)$/.test(entry.name)) files.push(filename);
  }
  return files;
}
const files=readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile() && /[.](?:mjs|cjs|js)$/.test(entry.name)).map(entry=>entry.name);
for(const directory of ["server","scripts","tests"]) files.push(...sourceFiles(directory));
let failures=0;
for(const file of files) {
  const result=spawnSync(process.execPath,["--check",path.join(root,file)],{stdio:"inherit"});
  if(result.error) console.error(result.error.stack || result.error.message);
  if(result.error || result.status!==0) failures++;
}
if(failures) {
  console.error(`Syntax checks failed for ${failures} of ${files.length} files.`);
  process.exitCode=1;
} else console.log(`Syntax checked ${files.length} files.`);
