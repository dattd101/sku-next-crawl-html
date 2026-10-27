# Next Crawler

## Deploy Vercel từ GitHub

1. Push toàn bộ project lên GitHub.
2. Import repository vào Vercel (Framework: Next.js).
3. Deploy. API `/api/crawl` được bật trong production.
4. Serverless Chromium (`@sparticuz/chromium`) được dùng tự động trên Vercel; không cần `playwright install` tại Vercel.

**Lưu ý:** Crawling dùng Chromium, tốn RAM và thời gian; Vercel có giới hạn bộ nhớ, kích thước response và thời gian chạy theo gói. ZIP lớn hoặc 3 trang có thể thất bại trên serverless. Nếu cần crawl nặng, triển khai trên VPS/container.

## Local

```bash
npm install
npx playwright install chromium
npm run dev
```

Để hạn chế truy cập API công khai, có thể đặt biến môi trường `CRAWLER_API_KEY` và gửi header `x-crawler-key` từ client đáng tin cậy. **Không đưa khóa bí mật vào frontend công khai**; cần triển khai đăng nhập/proxy riêng nếu muốn bảo vệ giao diện.

URL được lọc để từ chối IP nội bộ; production nên bổ sung bảo vệ mạng egress và rate limiting tại hạ tầng.
