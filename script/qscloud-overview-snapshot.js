#!/usr/bin/env node
/**
 * Log into QS Cloud and capture the app overview page as a PNG.
 * Inputs via args:
 *   --tenantUrl <url> (e.g. https://tenant.eu.qlikcloud.com or tenant.eu.qlikcloud.com)
 *   --appId <uuid>
 *   --user <email>
 *   --pwd <password>
 *   --outfile <path>
 *   --headless <true|false> (optional, default true)
 */
import { install, computeExecutablePath } from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { headless: true };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || typeof v === "undefined") continue;
    if (k === "--tenantUrl") out.tenantUrl = v;
    if (k === "--appId") out.appId = v;
    if (k === "--user") out.user = v;
    if (k === "--pwd") out.pwd = v;
    if (k === "--outfile") out.outfile = v;
    if (k === "--headless") out.headless = v === "true";
  }
  if (!out.tenantUrl || !out.appId || !out.user || !out.pwd || !out.outfile) {
    console.error(
      "Missing required args: --tenantUrl, --appId, --user, --pwd, --outfile"
    );
    process.exit(2);
  }
  if (!out.tenantUrl.startsWith("http")) {
    out.tenantUrl = `https://${out.tenantUrl}`;
  }
  return out;
}

async function ensureChrome() {
  // Install latest stable chrome via @puppeteer/browsers
  const cacheDir = path.join(process.cwd(), ".cache", "browsers");
  fs.mkdirSync(cacheDir, { recursive: true });
  await install({
    cacheDir,
    browser: "chrome",
    // empty buildId => latest
    buildId: "",
  });
  const exePath = computeExecutablePath({
    cacheDir,
    browser: "chrome",
    buildId: "",
  });
  return exePath;
}

async function loginIfNeeded(page, user, pwd) {
  // Try to detect a login form. QS Cloud changes occasionally; be flexible.
  try {
    // Email/username entry (sometimes a first step)
    const emailSel =
      'input[type="email"], input[name="email"], input#email, input[name="username"], input#username, input[type="text"]';
    const emailInput = await page.$(emailSel);
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(user, { delay: 10 });
      // Try continue/next buttons
      const continueBtn = await page.$(
        'button[type="submit"], button:has-text("Continue"), button:has-text("Next")'
      );
      if (continueBtn) await continueBtn.click();
      else await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
    }
  } catch {}

  try {
    // Password step
    const pwdSel =
      'input[type="password"], input#password, input[name="password"]';
    const pwdInput = await page.waitForSelector(pwdSel, { timeout: 8000 });
    if (pwdInput) {
      await pwdInput.click({ clickCount: 3 });
      await pwdInput.type(pwd, { delay: 10 });
      const loginBtn = await page.$(
        'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")'
      );
      if (loginBtn) await loginBtn.click();
      else await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);
    }
  } catch {
    // Possibly already logged in or SSO; proceed.
  }
}

async function navigateAndScreenshot(
  tenantUrl,
  appId,
  user,
  pwd,
  outfile,
  headless
) {
  const exePath = await ensureChrome();
  const browser = await puppeteer.launch({ executablePath: exePath, headless });
  const page = await browser.newPage();
  try {
    const appUrl = `${tenantUrl}/sense/app/${appId}/hubUrl/%2Fhub`;
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await loginIfNeeded(page, user, pwd);
    // Wait for overview content to load; fall back to network idle
    try {
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 });
    } catch {}
    await page.waitForTimeout(2000);
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await page.screenshot({ path: outfile, fullPage: true });
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  const { tenantUrl, appId, user, pwd, outfile, headless } = parseArgs();
  await navigateAndScreenshot(tenantUrl, appId, user, pwd, outfile, headless);
  console.log(`Saved overview screenshot -> ${outfile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
