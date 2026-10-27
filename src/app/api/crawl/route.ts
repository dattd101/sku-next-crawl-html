import { NextRequest, NextResponse } from "next/server";
import { capturePage } from "@/lib/offline";
import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function packShared(zip: JSZip, root: string, htmlName: string) {
  // Every page lives at the ZIP root and refers to the same root-level assets/ directory.
  zip.file(htmlName, await fs.readFile(path.join(root, "index.html")));
  const assetsDir = path.join(root, "assets");
  for (const entry of await fs.readdir(assetsDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue;
    const name = `assets/${entry.name}`;
    // Asset names are deterministic hashes of their original URLs; reuse duplicates.
    if (!zip.file(name)) zip.file(name, await fs.readFile(path.join(assetsDir, entry.name)));
  }
}
function validate(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("URL không hợp lệ.");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Chỉ chấp nhận URL HTTP/HTTPS.");
  return url.href;
}
export async function POST(request: NextRequest) {
  // Local-only: public deployment requires authentication, SSRF protection and network egress controls.
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "API chỉ bật khi chạy npm run dev trên localhost." }, { status: 403 });
  const folders: string[] = [];
  try {
    const body = await request.json();
    const multi = Array.isArray(body?.urls);
    const urls: string[] = multi ? body.urls.map(validate) : [validate(body?.url)];
    if (urls.length < 1 || urls.length > 3) return NextResponse.json({ error: "Chỉ cho phép 1–3 URL mỗi lần." }, { status: 400 });
    const zip = new JSZip();
    const manifest: { url: string; folder: string; error?: string }[] = [];
    for (let i = 0; i < urls.length; i++) {
      const htmlName = multi ? `site-${String(i + 1).padStart(2, "0")}.html` : "index.html";
      try {
        console.log(`[CRAWL] ${i+1}/${urls.length} ${urls[i]}`);
        const folder = await capturePage(urls[i]); folders.push(folder);
        await packShared(zip, folder, htmlName);
        manifest.push({ url: urls[i], folder: htmlName });
      } catch (e) {
        console.error("[CRAWL ERROR]", urls[i], e);
        manifest.push({ url: urls[i], folder: htmlName, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }
    if (manifest.every(item => item.error)) throw new Error(manifest.map(x => `${x.url}: ${x.error}`).join("; "));
    zip.file("crawl-manifest.json", JSON.stringify(manifest, null, 2));
    const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 3 } });
    // Copy to a real ArrayBuffer-backed Uint8Array to satisfy Next.js 15 BodyInit typing.
    const zipBlob = new Blob([Uint8Array.from(output)], { type: "application/zip" });
    return new NextResponse(zipBlob, { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${multi ? "offline-sites.zip" : "offline-page.zip"}"`,
      "Content-Length": String(output.length),
      "Cache-Control": "private, no-store",
    }});
  } catch (e) {
    console.error("[CRAWL ERROR]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Crawl failed" }, { status: 500 });
  } finally {
    await Promise.all(folders.map(folder => fs.rm(folder, { recursive: true, force: true }).catch(console.error)));
  }
}
