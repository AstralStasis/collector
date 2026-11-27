import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "../server/runtime.mjs";
import { createStore } from "../server/store.mjs";
import { readDatabaseConfig } from "../server/database-config.mjs";

async function main() {
  const root=fileURLToPath(new URL("../",import.meta.url));
  try{loadEnvFile(path.join(root,".env"));}catch(error){if(error.code!=="ENOENT")throw error;}
  const command=process.argv[2]||"migrate",config=readDatabaseConfig({root});
  if(!["migrate","seed","backup","health"].includes(command))throw Error("Usage: node scripts/database.mjs migrate|seed|backup|health [output.sqlite]");
  if(command==="backup"&&config.client==="mysql")throw Error("MySQL backups require mysqldump --single-transaction; see README.md.");
  const store=await createStore(config);
  try{
    if(command==="seed"){await store.seedCatalog(JSON.parse(readFileSync(path.join(root,"catalog.json"),"utf8")));console.log(`Seeded ${store.catalog.items.length} items.`);}
    else if(command==="backup"){const filename=path.resolve(root,process.argv[3]||`data/backups/archive-${new Date().toISOString().replace(/[:.]/g,"-")}.sqlite`);await store.backup(filename);console.log(`Backup created: ${filename}`);}
    else if(command==="migrate")console.log("Database migrations are up to date.");
    else if(command==="health")console.log(JSON.stringify(await store.health()));
  }finally{await store.close();}
}

main().catch(error=>{console.error(error.stack || error.message);process.exitCode=1;});
