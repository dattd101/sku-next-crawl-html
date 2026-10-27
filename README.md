# Next Crawler — Next.js 15 + Bootstrap 5.0

Giao diện Bootstrap 5.0 (không sử dụng Tailwind). Có 2 tab: **1 Site** và **Nhiều Site** (tối đa 3 URL mỗi lượt). Mỗi URL chỉ chụp **một trang** và các assets tải được, không đi theo liên kết sang các trang khác.

## Chạy trên Windows

```cmd
npm install
npx playwright install chromium
npm run dev
```

Mở http://localhost:3000. Kiểm tra build bằng `npm run build`.

**Quan trọng:** API `/api/crawl` hiện chỉ chạy khi `NODE_ENV=development` (`npm run dev`), kể cả khi `npm run build` thành công. `npm run start` sẽ trả HTTP 403 cho API này để tránh công khai crawler chưa có bảo vệ SSRF. Triển khai Vercel cần thêm kiểm tra IP/DNS, chống redirect nội bộ, giới hạn tài nguyên, xác thực và cấu hình Chromium serverless.

## ZIP

- 1 Site: `offline-page.zip` chứa `index.html`, `assets/`, `manifest.json`, `crawl-manifest.json`.
- Nhiều Site: `offline-sites.zip` chứa `site-01.html`, `site-02.html`, `site-03.html` (tùy số URL), **một thư mục `assets/` dùng chung**, và `crawl-manifest.json`. Các tài nguyên trùng URL được lưu một lần. Site lỗi được ghi trong manifest; các site thành công vẫn được đóng gói.
- Dữ liệu tạm: thư mục `path-html` trong OS temp, tự xóa sau khi tạo ZIP.

## Giới hạn

Trang có API động, đăng nhập, iframe, video, hoặc script phụ thuộc server có thể không hoạt động khi mở offline. Assets tải sau thời điểm chụp có thể thiếu. Dùng trên máy tin cậy, không mở endpoint này cho người dùng Internet.
