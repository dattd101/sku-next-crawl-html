import { chromium, type Response } from "playwright";
import * as cheerio from "cheerio";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const MAX_ASSETS = 180;
const MAX_TOTAL_BYTES = 65 * 1024 * 1024;
const MAX_SINGLE_BYTES = 7 * 1024 * 1024;
const CAPTURE_MS = 42000;
const BLOCKED = ["google-analytics.com", "googletagmanager.com", "doubleclick.net", "hotjar.com", "connect.facebook.net", "analytics.tiktok.com"];
type Asset = { filename: string; body: Buffer; mime: string };

function assetName(url: string, mime: string) {
  const u = new URL(url);
  const ext = path.posix.extname(u.pathname).toLowerCase();
  const allowed = /^\.(css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|avif|bmp)$/;
  const types: Record<string, string> = {
    "text/css": ".css", "application/javascript": ".js", "text/javascript": ".js",
    "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg",
    "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif",
    "font/woff": ".woff", "font/woff2": ".woff2", "font/ttf": ".ttf",
  };
  return `assets/${createHash("sha256").update(url).digest("hex").slice(0, 24)}${allowed.test(ext) ? ext : (types[mime] || ".bin")}`;
}

export async function capturePage(input: string) {
  const dir = path.join(os.tmpdir(), "path-html", randomUUID());
  await fs.mkdir(dir, { recursive: true });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const assets = new Map<string, Asset>();
  const pending = new Set<Promise<void>>();
  const errors: string[] = [];
  let totalBytes = 0;
  let finalUrl = input;
  let capturedHtml = "";
  const started = Date.now();
  const deadline = started + CAPTURE_MS;
  try {
    browser = await chromium.launch({ headless: true, timeout: 12000 });
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(15000);
    page.setDefaultTimeout(5000);
    await page.route("**/*", async route => {
      try {
        const u = new URL(route.request().url());
        if (BLOCKED.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
          await route.abort(); return;
        }
        await route.continue();
      } catch { await route.abort().catch(() => {}); }
    });
    page.on("response", (response: Response) => {
      if (Date.now() >= deadline || pending.size >= 40 || assets.size >= MAX_ASSETS) return;
      const task = (async () => {
        try {
          const url = response.url();
          if (!/^https?:\/\//i.test(url) || !response.ok() || assets.has(url)) return;
          const mime = (response.headers()["content-type"] || "").split(";")[0].trim().toLowerCase();
          const kind = response.request().resourceType();
          if (!( ["stylesheet", "script", "image", "font"].includes(kind) || /^(text\/css|image\/|font\/|application\/javascript|text\/javascript)/.test(mime))) return;
          if (Number(response.headers()["content-length"] || 0) > MAX_SINGLE_BYTES) return;
          const body = await response.body();
          if (body.length > MAX_SINGLE_BYTES || assets.size >= MAX_ASSETS || totalBytes + body.length > MAX_TOTAL_BYTES) return;
          assets.set(url, { filename: assetName(url, mime), body, mime });
          totalBytes += body.length;
        } catch { /* An aborted or streaming response may not have a body. */ }
      })();
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });

    try {
      await page.goto(input, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (error) {
      // Some sites never fire DOMContentLoaded; keep a usable rendered snapshot if possible.
      if ((await page.locator("body").count().catch(() => 0)) === 0) throw error;
      errors.push(`Navigation timed out; captured partial page: ${String(error)}`);
    }
    await page.waitForTimeout(1200);
    // Trigger lazy-loading, but cap work for very long news homepages.
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, Math.max(window.innerHeight, 600));
        await new Promise(resolve => setTimeout(resolve, 180));
      }
      window.scrollTo(0, 0);
    }).catch(() => {});
    await page.waitForTimeout(500);
    finalUrl = page.url();
    capturedHtml = await page.content();
    // Do not wait forever for ad streams or pending network responses.
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise<void>(resolve => setTimeout(resolve, Math.min(3500, Math.max(0, deadline - Date.now())))),
    ]);
    await context.close().catch(() => {});

    const localRef = (raw: string, base: string, from: string) => {
      if (!raw || /^(data:|blob:|javascript:|#|mailto:|tel:)/i.test(raw.trim())) return raw;
      try {
        const match = assets.get(new URL(raw, base).href);
        return match ? path.posix.relative(path.posix.dirname(from), match.filename) : raw;
      } catch { return raw; }
    };
    const rewriteCss = (css: string, base: string, from: string) => css
      .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (_m, q: string, raw: string) => `url(${q}${localRef(raw, base, from)}${q})`)
      .replace(/@import\s+(['"])([^'"]+)\1/gi, (_m, q: string, raw: string) => `@import ${q}${localRef(raw, base, from)}${q}`);

    const $ = cheerio.load(capturedHtml);
    $("base").remove();
    $("meta[http-equiv]").filter((_, el) => /content-security-policy/i.test($(el).attr("http-equiv") || "")).remove();
    $("[integrity]").removeAttr("integrity");
    $("*").each((_, el) => {
      const node = $(el);
      for (const attr of ["src", "href", "poster", "data-src", "data-background"]) {
        const value = node.attr(attr);
        if (value) node.attr(attr, localRef(value, finalUrl, "index.html"));
      }
      for (const attr of ["srcset", "data-srcset"]) {
        const value = node.attr(attr);
        if (value) node.attr(attr, value.split(",").map(part => {
          const pieces = part.trim().split(/\s+/);
          pieces[0] = localRef(pieces[0], finalUrl, "index.html");
          return pieces.join(" ");
        }).join(", "));
      }
      const style = node.attr("style");
      if (style) node.attr("style", rewriteCss(style, finalUrl, "index.html"));
    });
    $("style").each((_, el) => {
      const node = $(el);
      node.text(rewriteCss(node.html() || "", finalUrl, "index.html"));
    });
    // Prevent an offline snapshot from making unexpected network connections via CSP-unsafe meta refresh.
    $("meta[http-equiv]").filter((_, el) => /refresh/i.test($(el).attr("http-equiv") || "")).remove();
    for (const [url, asset] of assets) {
      const destination = path.join(dir, asset.filename);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, asset.mime === "text/css"
        ? Buffer.from(rewriteCss(asset.body.toString("utf8"), url, asset.filename))
        : asset.body);
    }
    await fs.writeFile(path.join(dir, "index.html"), $.html(), "utf8");
    await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({
      source: input, finalUrl, assetCount: assets.size, totalAssetBytes: totalBytes,
      durationMs: Date.now() - started, warnings: errors,
      note: "Single-page snapshot. External APIs, login, and dynamic features may not work offline.",
    }, null, 2));
    return dir;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser?.close().catch(() => {});
  }
}
