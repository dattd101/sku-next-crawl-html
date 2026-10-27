import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function publicIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.includes(":")) {
    if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("ff") || v.startsWith("2001:db8:") || v.startsWith("::ffff:")) return false;
    return true;
  }
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a,b,c] = p;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
}

export async function validatePublicUrl(raw: unknown): Promise<string> {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("URL không hợp lệ.");
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || (u.port && !["80", "443"].includes(u.port))) throw new Error("Chỉ cho phép URL HTTP/HTTPS công khai.");
  const host = u.hostname.replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Không thể crawl địa chỉ nội bộ.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(a => !publicIp(a.address))) throw new Error("Không thể crawl IP riêng hoặc nội bộ.");
  return u.href;
}
