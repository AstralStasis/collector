import {readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const root=fileURLToPath(new URL("../",import.meta.url));
const files=["app.js","api-client.js","archive-model.js","server.mjs",...["server","scripts","tests"].flatMap(dir=>readdirSync(path.join(root,dir)).filter(x=>/\.(mjs|js)$/.test(x)).map(x=>dir+"/"+x))];
for(const file of files){const result=spawnSync(process.execPath,["--check",path.join(root,file)],{stdio:"inherit"});if(result.status!==0)process.exit(result.status||1);}
console.log(`Syntax checked ${files.length} files.`);
