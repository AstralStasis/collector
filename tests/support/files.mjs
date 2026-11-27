import { promises } from "fs";

export const readFile = promises.readFile.bind(promises);
export const stat = promises.stat.bind(promises);
export const mkdtemp = promises.mkdtemp.bind(promises);
export const mkdir = promises.mkdir.bind(promises);
export const writeFile = promises.writeFile.bind(promises);

// fs.rm was added after Node 12; only test-created temporary paths use this.
export async function rm(filename, options = {}) {
  if (promises.rm) return promises.rm(filename, options);
  try {
    const info = await promises.lstat(filename);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      if (options.recursive) {
        const names = await promises.readdir(filename);
        const path = await import("path");
        for (const name of names) await rm(path.join(filename, name), options);
      }
      await promises.rmdir(filename);
    } else await promises.unlink(filename);
  } catch (error) { if (!(options.force && error.code === "ENOENT")) throw error; }
}
