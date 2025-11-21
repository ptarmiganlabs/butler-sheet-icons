#!/usr/bin/env node
/**
 * Fetch latest release asset matching a regex and save to bsi/bin.
 * Usage:
 *   node script/fetch-release-asset.js --repo owner/repo --assetRegex "pattern" --outDir path --binName name
 */
import fs from "fs";
import path from "path";
import https from "https";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || !v) continue;
    if (k === "--repo") out.repo = v;
    if (k === "--assetRegex") out.assetRegex = v;
    if (k === "--outDir") out.outDir = v;
    if (k === "--binName") out.binName = v;
  }
  if (!out.repo || !out.assetRegex || !out.outDir || !out.binName) {
    console.error(
      "Missing required args. --repo, --assetRegex, --outDir, --binName"
    );
    process.exit(2);
  }
  return out;
}

function ghGet(url, headers = {}) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const allHeaders = {
    "User-Agent": "bsi-e2e-downloader",
    Accept: "application/vnd.github+json",
    ...headers,
  };
  if (token) allHeaders.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: allHeaders }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      })
      .on("error", reject);
  });
}

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // Follow redirect
          download(res.headers.location, outPath).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(outPath)));
      })
      .on("error", (err) => {
        fs.unlink(outPath, () => reject(err));
      });
  });
}

async function main() {
  const { repo, assetRegex, outDir, binName } = parseArgs();
  const pattern = new RegExp(assetRegex, "i");

  const rel = await ghGet(
    `https://api.github.com/repos/${repo}/releases/latest`
  );
  if (!rel.assets || !Array.isArray(rel.assets)) {
    console.error("No assets found in latest release.");
    process.exit(1);
  }

  const match = rel.assets.find((a) => pattern.test(a.name));
  if (!match) {
    console.error("No matching asset. Available assets:");
    for (const a of rel.assets) console.error(`- ${a.name}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, binName);
  const url = match.browser_download_url;
  console.log(`Downloading ${match.name} -> ${outPath}`);
  await download(url, outPath);
  console.log("Download complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
