import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

// Build-time helper only: application runtime always serves the local image paths.
// node scripts/sync-collect-assets.mjs [--expand-api --api-cache data/collect-cache]
// node scripts/sync-collect-assets.mjs --catalog catalog.json [--offline]
// --frame-previews additionally downloads the original PNG portrait previews.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const API_CATEGORIES = Object.freeze({ mounts: "mounts", minions: "minions", emotes: "emotes", orchestrions: "orchestrions", bardings: "bardings", "triad-cards": "cards", facewear: "facewear", fashions: "fashions", frames: "frames" });
const SHARED = { frames: "https://ffxivcollect.com/images/frame.webp", orchestrions: "https://ffxivcollect.com/images/orchestrion.webp" };

export function canonicalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Image URL must use HTTP(S)");
  url.hash = "";
  url.searchParams.sort();
  return url.href;
}

export function imageFormat(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 20 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" && /^(VP8 |VP8L|VP8X)$/.test(b.toString("ascii", 12, 16)) && b.readUInt32LE(4) + 8 === b.length) return { format: "webp", contentType: "image/webp", extension: ".webp" };
  if (b.length >= 45 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString("ascii", 12, 16) === "IHDR" && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0 && b.toString("ascii", b.length - 8, b.length - 4) === "IEND") return { format: "png", contentType: "image/png", extension: ".png" };
  if (b.length >= 16 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length - 2] === 255 && b[b.length - 1] === 217) return { format: "jpeg", contentType: "image/jpeg", extension: ".jpg" };
  throw new Error("Empty, incomplete, or unsupported image data");
}

export function validateImage(bytes, contentType) {
  const detected = imageFormat(bytes);
  const type = String(contentType || "").split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (type !== detected.contentType) throw new Error(`Content-Type ${type || "(missing)"} does not match ${detected.contentType}`);
  return { ...detected, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function parseArgs(args, cwd = process.cwd()) {
  const options = { catalog: path.join(projectRoot, "catalog.json"), apiCache: path.join(projectRoot, "data/collect-cache"), cacheDir: path.join(projectRoot, "data/collect-assets"), assetsDir: path.join(projectRoot, "assets"), concurrency: 4, retries: 4, timeout: 45000, expandApi: false, framePreviews: false, offline: false, dryRun: false };
  const valueFlags = { "--catalog": "catalog", "--api-cache": "apiCache", "--cache-dir": "cacheDir", "--assets-dir": "assetsDir", "--concurrency": "concurrency", "--retries": "retries", "--timeout": "timeout" };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag in valueFlags) {
      const key = valueFlags[flag], value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value after ${flag}`);
      options[key] = ["concurrency", "retries", "timeout"].includes(key) ? Number(value) : path.resolve(cwd, value);
      if (flag === "--catalog") options.expandApi = false;
    } else if (flag === "--expand-api") options.expandApi = true;
    else if (flag === "--frame-previews") options.framePreviews = true;
    else if (flag === "--offline") options.offline = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown argument ${flag}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) throw new Error("Concurrency must be an integer from 1 to 4");
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 8) throw new Error("Retries must be an integer from 0 to 8");
  if (!Number.isInteger(options.timeout) || options.timeout < 1000) throw new Error("Timeout must be at least 1000 ms");
  return options;
}

export function buildAssetRequests(apiByCategory, catalogItems, { expandApi = true, framePreviews = false } = {}) {
  const byKey = new Map(catalogItems.map(item => [item.key || `${item.category}-${item.id}`, { ...item }]));
  for (const [endpoint, category] of Object.entries(API_CATEGORIES)) {
    for (const item of apiByCategory[endpoint] || []) {
      const key = `${category}-${item.id}`;
      if (((category === "mounts" && Number(item.id) === 419) || (category === "minions" && Number(item.id) === 560)) && !byKey.has(key)) continue;
      if (!expandApi && !byKey.has(key)) continue;
      const previous = byKey.get(key) || {};
      const source = SHARED[category] || (category === "cards" ? item.icon || item.image : item.image || item.icon);
      byKey.set(key, { ...previous, key, category, id: item.id, image: previous.image || "", originalImage: previous.originalImage || source, apiImage: source, previewOriginalImage: previous.previewOriginalImage || (category === "frames" ? item.image : undefined) });
    }
  }
  return [...byKey.values()].map(item => ({
    key: item.key || `${item.category}-${item.id}`,
    category: item.category,
    id: item.id,
    image: item.image || "",
    originalImage: item.originalImage || item.apiImage || (/^https?:/.test(item.image || "") ? item.image : ""),
    sourceUrl: item.originalImage || item.apiImage || (/^https?:/.test(item.image || "") ? item.image : ""),
    previewImage: item.previewImage,
    previewOriginalImage: item.previewOriginalImage,
    downloadPreview: framePreviews && item.category === "frames" && Boolean(item.previewOriginalImage),
    shared: !item.image && Boolean(SHARED[item.category])
  }));
}

export async function mapLimit(items, limit, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

export function extractSharedIcon(html, sourceUrl) {
  const source = new URL(sourceUrl);
  if (source.origin !== "https://ffxivcollect.com") return null;
  const name = /^\/images\/(frame|orchestrion)\.webp$/.exec(source.pathname)?.[1];
  if (!name) return null;
  const expression = new RegExp("/assets/" + name + "-[a-f0-9]+\\.webp", "i");
  const match = String(html).match(expression);
  return match ? new URL(match[0], source.origin).href : null;
}

export async function downloadImage(url, { retries = 4, timeout = 45000, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onRetry = () => {} } = {}) {
  const errors = [];
  let resolvedUrl = url;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const fetchImage = target => fetchImpl(target, { signal: AbortSignal.timeout(timeout), headers: { Accept: "image/webp,image/png,image/jpeg", "User-Agent": "Collector-local-asset-sync/1.0" } });
      let response = await fetchImage(resolvedUrl);
      // The API uses skip_pipeline URLs; these can redirect to HTML after an asset rebuild.
      if (resolvedUrl === url && /^https:\/\/ffxivcollect\.com\/images\/(frame|orchestrion)\.webp$/.test(url) && (!response.ok || !String(response.headers.get("content-type")).startsWith("image/"))) {
        const pageUrl = url.includes("/frame.webp") ? "https://ffxivcollect.com/frames" : "https://ffxivcollect.com/orchestrions";
        const page = await fetchImpl(pageUrl, { signal: AbortSignal.timeout(timeout), headers: { Accept: "text/html" } });
        if (!page.ok) throw new Error(`Shared icon discovery HTTP ${page.status}`);
        const discovered = extractSharedIcon(await page.text(), url);
        if (!discovered) throw new Error("Official shared icon was not found in the asset pipeline");
        resolvedUrl = discovered;
        response = await fetchImage(resolvedUrl);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      const contentType = response.headers.get("content-type");
      const bytes = Buffer.from(await response.arrayBuffer());
      const metadata = validateImage(bytes, contentType);
      return { data: bytes, ...metadata, status: response.status, responseUrl: response.url || resolvedUrl, attempts: attempt + 1 };
    } catch (error) {
      errors.push(error.message);
      if (attempt === retries) throw new Error(`${url}: ${errors.join("; ")}`);
      const delay = Math.min(16000, 1000 * 2 ** attempt);
      onRetry({ url, attempt: attempt + 1, delay, error: error.message });
      await sleep(delay);
    }
  }
}

async function readJson(filename, fallback) {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}

async function atomicJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = filename + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, filename);
}

async function loadApiCache(directory) {
  let files;
  try { files = await readdir(directory); } catch (error) { if (error.code === "ENOENT") return {}; throw error; }
  const result = {};
  for (const endpoint of Object.keys(API_CATEGORIES)) {
    const filename = files.includes(`${endpoint}.en.json`) ? `${endpoint}.en.json` : files.filter(file => file.endsWith(`-${endpoint}.json`) && /^\d{8}-en-live-\d+-/.test(file)).sort().at(-1);
    if (!filename) continue;
    const json = await readJson(path.join(directory, filename));
    if (!Array.isArray(json.results) || json.results.length !== json.count) throw new Error(`Incomplete API cache ${filename}`);
    result[endpoint] = json.results;
  }
  return result;
}

function localPath(image, options) {
  if (!image || /^https?:/.test(image)) return null;
  const normalized = image.replaceAll("\\", "/");
  if (!normalized.startsWith("assets/") || normalized.includes("..") || normalized.includes("?")) throw new Error(`Unsafe local image path ${image}`);
  return path.join(options.assetsDir, normalized.slice(7));
}

async function inspectLocal(image, options) {
  const filename = localPath(image, options);
  if (!filename) return null;
  let bytes;
  try { bytes = await readFile(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const metadata = imageFormat(bytes);
  const ext = path.extname(filename).toLowerCase();
  if (ext !== metadata.extension && !(ext === ".jpeg" && metadata.format === "jpeg")) throw new Error(`Extension mismatch: ${image} contains ${metadata.format}`);
  return { image, ...metadata, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function syncAssets(options, log = message => console.log(message)) {
  const catalog = options.catalogData || await readJson(options.catalog);
  if (!Array.isArray(catalog.items)) throw new Error("Catalog must contain an items array");
  const api = options.apiData || await loadApiCache(options.apiCache);
  if (options.expandApi && Object.keys(api).length !== Object.keys(API_CATEGORIES).length) throw new Error("All nine complete English API caches are required for expansion");
  const requests = buildAssetRequests(api, catalog.items, options);
  const manifestFile = path.join(options.cacheDir, "url-cache.json"), mapFile = path.join(options.cacheDir, "image-map.json"), reportFile = path.join(options.cacheDir, "sync-report.json");
  const manifest = await readJson(manifestFile, { version: 1, urls: {} });
  const priorMap = await readJson(mapFile, {});
  const imageMap = {}, urls = new Map(), failures = [];
  let reusedEntries = 0, completed = 0, downloadedBytes = 0;
  const assetInfo = new Map();
  async function inspect(image) {
    if (!image) return null;
    if (!assetInfo.has(image)) assetInfo.set(image, await inspectLocal(image, options));
    return assetInfo.get(image);
  }
  function queue(item, role, source, desiredImage) {
    if (!source) { failures.push({ key: item.key, role, error: "No remote source for missing local image" }); return; }
    const url = canonicalUrl(source);
    if (!urls.has(url)) urls.set(url, { url, source, targets: [], desiredImage, shared: item.shared && role === "image", category: item.category, key: item.key, role });
    urls.get(url).targets.push({ key: item.key, role, originalImage: source });
  }
  for (const item of requests) {
    const local = await inspect(item.image);
    const previous = priorMap[item.key] || {};
    if (local) {
      imageMap[item.key] = { ...local, originalImage: item.originalImage, reused: true };
      reusedEntries++;
      if (item.originalImage) manifest.urls[canonicalUrl(item.originalImage)] = { ...local, originalImage: item.originalImage };
    } else {
      imageMap[item.key] = { originalImage: item.originalImage };
      queue(item, "image", item.sourceUrl, item.image);
    }
    if (item.previewOriginalImage) imageMap[item.key].previewOriginalImage = item.previewOriginalImage;
    const preview = await inspect(item.previewImage || previous.previewImage);
    if (preview) imageMap[item.key].previewImage = preview.image;
    else if (item.downloadPreview) queue(item, "previewImage", item.previewOriginalImage, "");
  }
  const pending = [];
  for (const request of urls.values()) {
    const cached = manifest.urls[request.url];
    const local = cached && await inspect(cached.image);
    if (local) {
      for (const target of request.targets) {
        if (target.role === "image") { Object.assign(imageMap[target.key], local, { originalImage: target.originalImage, reused: true }); reusedEntries++; }
        else imageMap[target.key].previewImage = local.image;
      }
    } else pending.push(request);
  }
  const summary = { entries: requests.length, reusedEntries, uniqueDownloads: pending.length, previewDownloads: pending.filter(x => x.role === "previewImage").length, concurrency: options.concurrency, excluded: ["mounts-419", "minions-560"] };
  log(JSON.stringify({ event: "plan", ...summary }));
  if (options.dryRun) return { ...summary, pending: pending.map(x => ({ url: x.source, keys: x.targets.map(t => t.key), role: x.role })) };
  await mkdir(options.assetsDir, { recursive: true });
  await mkdir(options.cacheDir, { recursive: true });
  let saving = Promise.resolve();
  const persist = () => { saving = saving.then(() => atomicJson(manifestFile, manifest)).then(() => atomicJson(mapFile, imageMap)); return saving; };
  await persist();
  await mapLimit(pending, options.concurrency, async request => {
    try {
      if (options.offline) throw new Error("Offline mode: image is not cached locally");
      const download = await downloadImage(request.source, { retries: options.retries, timeout: options.timeout, onRetry: info => log(JSON.stringify({ event: "retry", ...info })) });
      let name;
      if (request.desiredImage && !/^https?:/.test(request.desiredImage)) name = path.basename(request.desiredImage, path.extname(request.desiredImage)) + download.extension;
      else if (request.shared) name = `collect-${request.category}${download.extension}`;
      else name = `collect-${request.key}${request.role === "previewImage" ? "-preview" : ""}${download.extension}`;
      const image = "assets/" + name, filename = path.join(options.assetsDir, name);
      try { await writeFile(filename, download.data, { flag: "wx" }); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = await inspectLocal(image, options);
        if (!existing || existing.sha256 !== download.sha256) throw new Error(`Refusing to overwrite existing image ${image}`);
      }
      const metadata = { image, originalImage: request.source, bytes: download.data.length, sha256: download.sha256, format: download.format, contentType: download.contentType, status: download.status, attempts: download.attempts, responseUrl: download.responseUrl };
      manifest.urls[request.url] = metadata;
      assetInfo.set(image, metadata);
      for (const target of request.targets) {
        if (target.role === "image") Object.assign(imageMap[target.key], metadata, { originalImage: target.originalImage, reused: false });
        else imageMap[target.key].previewImage = image;
      }
      downloadedBytes += download.data.length;
      completed++;
      if (completed % 25 === 0 || completed === pending.length) { log(JSON.stringify({ event: "progress", downloaded: completed, planned: pending.length, bytes: downloadedBytes })); await persist(); }
    } catch (error) {
      failures.push({ url: request.source, keys: request.targets.map(x => x.key), role: request.role, error: error.message });
      log(JSON.stringify({ event: "failure", ...failures.at(-1) }));
    }
  });
  await persist();
  const missing = requests.filter(item => !imageMap[item.key]?.image).map(item => item.key);
  const formats = {}, uniqueFiles = new Map();
  for (const item of Object.values(imageMap)) {
    if (item.image) uniqueFiles.set(item.image, item);
    if (item.previewImage && !uniqueFiles.has(item.previewImage)) uniqueFiles.set(item.previewImage, await inspect(item.previewImage));
  }
  let totalBytes = 0;
  for (const item of uniqueFiles.values()) { if (item) { formats[item.format] = (formats[item.format] || 0) + 1; totalBytes += item.bytes; } }
  const report = { ...summary, generatedAt: new Date().toISOString(), downloaded: completed, downloadedBytes, mapped: requests.length - missing.length, missing, failures, uniqueFiles: uniqueFiles.size, totalBytes, formats, mapFile };
  await atomicJson(reportFile, report);
  log(JSON.stringify({ event: "complete", ...report }));
  return { ...report, imageMap };
}

export async function syncCatalogAssets({ catalog, root = projectRoot, concurrency = 4, cacheDir, offline = false, framePreviews = false, retries = 4, timeout = 45000, log = message => console.log(message) } = {}) {
  if (!catalog || !Array.isArray(catalog.items)) throw new Error("Catalog must contain an items array");
  const options = { ...parseArgs(["--concurrency", String(concurrency), "--retries", String(retries), "--timeout", String(timeout)]), assetsDir: path.join(path.resolve(root), "assets"), cacheDir: path.resolve(cacheDir || path.join(root, "data/collect-assets")), expandApi: false, offline, framePreviews, apiData: {} };
  const items = await mapLimit(catalog.items, concurrency, async item => {
    const data = item.collect?.data || {};
    const local = await inspectLocal(item.image, options);
    const source = SHARED[item.category] || (item.category === "cards" ? data.icon || data.image : data.image || data.icon) || item.originalImage || (/^https?:/.test(item.image || "") ? item.image : "");
    let reusable = local;
    if (!reusable && source) {
      const stem = SHARED[item.category] ? `collect-${item.category}` : `collect-${item.key || `${item.category}-${item.id}`}`;
      for (const extension of [".webp", ".png", ".jpg"]) { reusable = await inspectLocal(`assets/${stem}${extension}`, options); if (reusable) break; }
    }
    return { ...item, image: reusable?.image || "", originalImage: local ? item.originalImage || source : source, previewOriginalImage: item.previewOriginalImage || (item.category === "frames" ? data.image : undefined) };
  });
  options.catalogData = { ...catalog, items };
  return syncAssets(options, log);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log("Usage: node scripts/sync-collect-assets.mjs [--catalog <file>] [--expand-api] [--api-cache <dir>] [--cache-dir <dir>] [--assets-dir <dir>] [--concurrency 1..4] [--retries 0..8] [--timeout ms] [--frame-previews] [--offline] [--dry-run]");
    return;
  }
  const report = await syncAssets(options);
  if (report.failures?.length || report.missing?.length) process.exitCode = 1;
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
