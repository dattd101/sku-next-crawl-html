"use client";

import { FormEvent, useState } from "react";
type Mode = "single" | "multi";
const MAX_URLS = 3;

export default function Home() {
  const [mode, setMode] = useState<Mode>("single");
  const [url, setUrl] = useState("");
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [blocked, setBlocked] = useState(false);
  const parsed = urls.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  function switchMode(next: Mode) {
    if (loading) return;
    setMode(next); setError(""); setSuccess(""); setBlocked(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(""); setSuccess(""); setBlocked(false);
    if (mode === "multi" && (parsed.length === 0 || parsed.length > MAX_URLS)) {
      setError(`Vui lòng nhập từ 1 đến ${MAX_URLS} URL.`); return;
    }
    setLoading(true);
    try {
      const payload = mode === "single" ? { url: url.trim() } : { urls: parsed };
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = mode === "single" ? "offline-page.zip" : "offline-sites.zip";
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10000);
      setSuccess(mode === "multi" ? "Đã tạo ZIP. Mở site-01.html, site-02.html… trong thư mục giải nén; tất cả dùng chung assets/." : "Đã tạo ZIP. Giải nén và mở index.html để xem trang đã lưu.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Có lỗi xảy ra khi crawl.";
      setBlocked(message.includes("CLOUDFLARE_CHALLENGE"));
      setError(message.replace(/^CLOUDFLARE_CHALLENGE:\s*/, ""));
    } finally { setLoading(false); }
  }

  return <main className="container app-shell py-5">
    <header className="text-center mb-4 mb-md-5">
      <div className="hero-icon mb-3" aria-hidden="true">↓</div>
      <h1 className="fw-bold h2">Next Crawler</h1>
    </header>

    <section className="card app-card bg-white">
      <div className="d-flex border-bottom" role="tablist" aria-label="Chế độ crawl">
        <button className="tab-button flex-fill" type="button" role="tab" id="tab-single" aria-controls="panel-crawl" aria-selected={mode === "single"} disabled={loading} onClick={() => switchMode("single")}>1 Site</button>
        <button className="tab-button flex-fill" type="button" role="tab" id="tab-multi" aria-controls="panel-crawl" aria-selected={mode === "multi"} disabled={loading} onClick={() => switchMode("multi")}>Nhiều Site</button>
      </div>
      <div className="card-body p-4 p-md-5" id="panel-crawl" role="tabpanel" aria-labelledby={mode === "single" ? "tab-single" : "tab-multi"}>
        <form onSubmit={submit}>
          {mode === "single" ? <div className="mb-4">
            <label htmlFor="url" className="form-label fw-semibold">URL website</label>
            <input id="url" className="form-control" type="url" placeholder="https://example.com/" required value={url} onChange={e => setUrl(e.target.value)} disabled={loading} />
            <div className="form-text">Chỉ crawl trang được nhập và các tài nguyên của trang đó.</div>
          </div> : <div className="mb-4">
            <label htmlFor="urls" className="form-label fw-semibold">Danh sách URL (mỗi dòng một URL)</label>
            <textarea id="urls" className="form-control" rows={6} placeholder={"https://example.com/\nhttps://example.org/"} required value={urls} onChange={e => setUrls(e.target.value)} disabled={loading} />
            <div className="form-text">{parsed.length}/{MAX_URLS} URL · Xử lý lần lượt · Mỗi trang là một file HTML, dùng chung thư mục assets/.</div>
          </div>}
          <div className="result-box p-3 mb-4">
            <div className="fw-semibold mb-1">Kết quả: {mode === "single" ? "offline-page.zip" : "offline-sites.zip"}</div>
            <div className="small muted-note">Bao gồm các file HTML, một thư mục assets/ dùng chung và crawl-manifest.json.</div>
          </div>
          <button className="btn btn-primary btn-lg w-100 fw-semibold" type="submit" disabled={loading || (mode === "single" ? !url.trim() : parsed.length < 1 || parsed.length > MAX_URLS)}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"/>Đang crawl và tạo ZIP…</> : "Crawl & Download ZIP"}
          </button>
          {error && <div role="alert" className="alert alert-danger mt-4 mb-0">{error}</div>}
          {blocked && mode === "single" && <div className="alert alert-warning mt-3" role="status">
            <strong>Xác minh thủ công</strong>
            <p className="mb-2 mt-2">Mở website trong cửa sổ Chrome mới để tự xác minh. Sau đó có thể thử crawl lại. Lưu ý: phiên Chrome của bạn không được chia sẻ với Playwright trên Vercel; việc xác minh không đảm bảo crawl thành công.</p>
            <button type="button" className="btn btn-outline-dark" onClick={() => { try { const target = new URL(url); if (!["http:", "https:"].includes(target.protocol)) return; window.open(target.href, "_blank", "popup=yes,width=1100,height=800,noopener,noreferrer"); } catch { setError("URL không hợp lệ."); } }}>Mở cửa sổ xác minh ↗</button>
          </div>}
          {success && <div role="status" className="alert alert-success mt-4 mb-0">{success}</div>}
        </form>
      </div>
    </section>
  </main>;
}
