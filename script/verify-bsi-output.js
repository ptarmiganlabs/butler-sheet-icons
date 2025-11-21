#!/usr/bin/env node
/**
 * Verify that BSI produced expected screenshots and at least one thumbnail.
 * Writes a simple JSON summary to bsi-summary.json
 */
import fs from "fs";
import path from "path";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { baseDir: "img/cloud" };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || !v) continue;
    if (k === "--appId") out.appId = v;
    if (k === "--baseDir") out.baseDir = v;
  }
  if (!out.appId) {
    console.error("--appId is required");
    process.exit(2);
  }
  return out;
}

function fileExistsNonEmpty(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function main() {
  const { appId, baseDir } = parseArgs();
  const dir = path.join(baseDir, appId);
  if (!fs.existsSync(dir)) {
    console.error(`Expected output dir not found: ${dir}`);
    process.exit(1);
  }

  const required = [
    "loginpage-1.png",
    "loginpage-2.png",
    "overview-1.png",
    "overview-before-verify.png",
    "overview-after-verify.png",
  ];
  const summary = { appId, baseDir: dir, requiredFiles: {}, thumbnails: [] };

  for (const f of required) {
    const p = path.join(dir, f);
    summary.requiredFiles[f] = fileExistsNonEmpty(p);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
  const thumbs = files.filter((f) => f.startsWith("thumbnail"));
  summary.thumbnails = thumbs;

  const allRequiredOk = Object.values(summary.requiredFiles).every(Boolean);
  const hasAtLeastOneThumb = thumbs.length > 0;

  fs.writeFileSync("bsi-summary.json", JSON.stringify(summary, null, 2));

  if (!allRequiredOk) {
    console.error(
      "Missing one or more required screenshots (login or overview)."
    );
    process.exit(1);
  }
  if (!hasAtLeastOneThumb) {
    console.error("No thumbnails were produced.");
    process.exit(1);
  }
  console.log("Verification OK");
}

main();
