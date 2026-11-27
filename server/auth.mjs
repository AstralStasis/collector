import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
const scrypt=promisify(scryptCallback);
const options={N:16384,r:8,p:1,maxmem:64*1024*1024};
export async function hashPassword(password) {
  const salt=randomBytes(16).toString("hex");
  const key=await scrypt(password,salt,64,options);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const parts=typeof encoded === "string" ? encoded.split("$") : [];
  const valid=parts.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  const key=await scrypt(password,valid ? parts[1] : "0".repeat(32),64,options);
  return !!valid && timingSafeEqual(key,Buffer.from(parts[2],"hex"));
}
