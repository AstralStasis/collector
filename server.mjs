import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./server/runtime.mjs";
import { createApplication } from "./server/application.mjs";
import { readDatabaseConfig } from "./server/database-config.mjs";

async function main() {
  const root=path.dirname(fileURLToPath(import.meta.url));
  try{loadEnvFile(path.join(root,".env"));}catch(error){if(error.code!=="ENOENT")throw error;}
  const app=await createApplication({root,databaseConfig:readDatabaseConfig({root}),publicOrigin:process.env.PUBLIC_ORIGIN||"",secureCookies:process.env.COOKIE_SECURE==="true"||process.env.NODE_ENV==="production"});
  const port=Number(process.env.PORT)||4173,host=process.env.HOST||"127.0.0.1";
  try { await app.listen(port,host); } catch(error) { await app.close(); throw error; }
  console.log(`光之藏馆 http://${host}:${port} · ${app.store.kind === "mysql" ? "MySQL" : "SQLite"} 已连接 · 图鉴 ${app.store.catalog.items.length} 条`);
  let closing=false;
  for(const signal of ["SIGINT","SIGTERM"])process.on(signal,async()=>{if(closing)return;closing=true;try{await app.close();process.exitCode=0;}catch(error){console.error(error.message);process.exitCode=1;}});
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
