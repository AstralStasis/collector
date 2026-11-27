import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import dotenv from "dotenv";

export function randomUUID() {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

export function randomToken(bytes) {
  return randomBytes(bytes).toString("base64").replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/, "");
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

// Parse with dotenv 16 (Node >=12), preserving variables already set by the host.
// Read directly so ENOENT and other I/O failures keep their original error codes.
export function loadEnvFile(filename = ".env") {
  const parsed = dotenv.parse(readFileSync(filename, "utf8"));
  for (const key of Object.keys(parsed)) if (!hasOwn(process.env, key)) process.env[key] = parsed[key];
}
