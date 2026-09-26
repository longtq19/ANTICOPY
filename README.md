# Quản lý khách hàng trong mạng LAN

Website quản lý & hiển thị danh sách khách hàng (React + Node.js/Express), chạy trong mạng LAN, dùng được trên laptop và điện thoại. Số điện thoại được bảo vệ nhiều lớp.

## Chạy nhanh

Yêu cầu: Node.js 20+.

```bash
npm install
npm run dev      # chế độ phát triển (hot reload), cổng 3000
# hoặc
npm start        # build frontend rồi chạy bản production, cổng 3000
npm run serve    # chạy bản production đã build sẵn (không build lại)
```

Đổi cổng: `set PORT=8080 && npm start` (CMD), `$env:PORT=8080; npm start` (PowerShell), `PORT=8080 npm start` (macOS/Linux).

Tài khoản demo (mật khẩu được tự động băm scrypt trong `data/users.json` ở lần chạy đầu):

| Tài khoản | Mật khẩu | Quyền |
|---|---|---|
| admin | admin123 | Thêm / sửa / xóa + xem |
| nhanvien | nhanvien123 | Chỉ xem |

Thêm tài khoản: thêm object `{ "username", "displayName", "role": "admin" | "viewer", "password" }` vào `data/users.json` rồi khởi động lại server.

## Truy cập từ thiết bị khác trong LAN

Server bind `0.0.0.0`, khi khởi động sẽ in sẵn các URL LAN:

```text
  Máy này:        http://localhost:3000
  Thiết bị LAN:   http://192.168.1.100:3000
```

Mở URL `Thiết bị LAN` trên điện thoại/laptop khác **cùng mạng Wi-Fi/LAN**. Sau khi đăng nhập, URL này cũng hiện ở cuối trang.

Tự lấy IP LAN của máy chạy server:

- **Windows:** `ipconfig` → dòng `IPv4 Address` của card Wi-Fi/Ethernet.
- **macOS:** `ipconfig getifaddr en0` (Wi-Fi) hoặc System Settings → Network.
- **Linux:** `hostname -I` hoặc `ip -4 addr`.

Nếu thiết bị khác không vào được:

1. **Windows Firewall**: khi Windows hỏi, chọn *Allow* cho mạng *Private*; hoặc mở PowerShell (Admin):
   ```powershell
   New-NetFirewallRule -DisplayName "LAN CRM 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
   Đảm bảo mạng Wi-Fi đang ở chế độ *Private* chứ không phải *Public*.
2. Hai thiết bị phải cùng mạng; Wi-Fi khách (guest) / "AP isolation" sẽ chặn kết nối giữa các thiết bị.

## Cấu trúc

```text
data/                 Dữ liệu JSON (customers.json, users.json, audit.log)
server/index.js       Express: REST API, header bảo mật, phục vụ frontend
server/auth.js        Phiên đăng nhập, phân quyền, rate limit, khóa khi vi phạm
server/store.js       Đọc/ghi JSON, validate, nhật ký audit
server/phoneGlyph.js  Chuyển số điện thoại thành nét vẽ vector cho canvas
src/                  React (Vite)
  protection/guard.js       Lớp bảo vệ phía trình duyệt
  components/PhoneCanvas.jsx Vẽ số điện thoại bằng canvas, nhấn giữ để xem
  components/Watermark.jsx   Watermark truy vết toàn màn hình
```

### REST API

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/login` | — | Đăng nhập, trả token |
| POST | `/api/logout` | đăng nhập | Hủy phiên |
| GET | `/api/me` | đăng nhập | Thông tin phiên |
| GET | `/api/customers?q=&group=` | đăng nhập | Danh sách (**không có số điện thoại**) |
| POST | `/api/customers` | admin | Thêm |
| PUT | `/api/customers/:id` | admin | Sửa (bỏ trống `phone` = giữ nguyên) |
| DELETE | `/api/customers/:id` | admin | Xóa |
| POST | `/api/customers/:id/phone-glyph` | đăng nhập | Nét vẽ số điện thoại (hết hạn sau 8s) |
| POST | `/api/security-events` | đăng nhập | Client báo vi phạm (DevTools, chụp màn hình…) |
| GET | `/api/server-info` | đăng nhập | URL LAN |

## Các lớp bảo vệ số điện thoại

### Backend
- **Không bao giờ gửi số dạng chữ.** API danh sách loại bỏ trường `phone`; tìm kiếm không hỗ trợ theo số điện thoại (tránh dò số).
- **Số được gửi dưới dạng nét vẽ vector** (`phoneGlyph.js`): mỗi chữ số là các đoạn thẳng có nhiễu ngẫu nhiên, xoay/lệch nhẹ, **thứ tự đoạn bị xáo trộn**, kèm đường nhiễu. Mỗi lần gọi cho hình khác nhau; trong Network tab chỉ thấy mảng tọa độ.
- **Chỉ cấp khi có yêu cầu từng số**, qua `POST`, có `Cache-Control: no-store`.
- **Rate limit** 20 lượt xem/phút/tài khoản; 10 lần đăng nhập/phút/IP.
- **Phiên gắn với IP** đăng nhập; token hết hạn sau 8 giờ, lưu `sessionStorage` (đóng tab là mất).
- **Chặn client lạ**: yêu cầu header `X-Anticopy-Client` và `Sec-Fetch-Site: same-origin` (khi trình duyệt gửi).
- **Khóa 5 phút** quyền xem mọi số nếu xem 2 số điện thoại khác nhau trong vòng 5 phút (không cần liền nhau).
- **Khóa 60 giây** quyền xem số khi client báo DevTools, can thiệp watermark hoặc đọc canvas.
- **Nhật ký audit** (`data/audit.log`): ai xem số của khách nào, lúc nào, từ IP nào; mọi vi phạm.
- Header bảo mật: CSP chặt (production), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

### Frontend
- **Vẽ bằng canvas**: số không nằm trong DOM → không bôi đen, không copy, không "Inspect" ra chữ được.
- **Nhấn giữ để xem**: chỉ hiện khi đang giữ nút, tối đa 8 giây, thả tay là xóa sạch canvas. Trên điện thoại, vừa giữ màn hình vừa bấm tổ hợp chụp màn hình là khá khó.
- **Chặn đọc ngược canvas**: `toDataURL`, `toBlob`, `getImageData` bị chặn trên canvas được bảo vệ.
- **Chặn copy / cắt / kéo thả / chọn chữ / menu chuột phải** ở vùng bảo vệ.
- **Watermark toàn màn hình**: tên, tài khoản, IP, thời gian — ảnh chụp bị rò rỉ sẽ truy ra người chụp. Xóa hoặc ẩn watermark bằng DevTools → trang tự khóa số điện thoại.
- **Tự ẩn + làm mờ** khi: cửa sổ mất focus (Snipping Tool, Win+Shift+S, chuyển app), tab bị ẩn, con trỏ rời trang, bấm PrintScreen / Win / Cmd+Shift+3/4/5, in trang.
- **PrintScreen**: ẩn số và cố ghi đè clipboard.
- **In trang**: CSS `@media print` chỉ in ra dòng "Trang này không được phép in".

### DevTools
- Chặn phím F12, Ctrl/Cmd+Shift+I/J/C/K, Ctrl+U (xem nguồn), Ctrl+S, Ctrl+P.
- Phát hiện DevTools gắn trong cửa sổ (chênh lệch kích thước cửa sổ) và bẫy `debugger` (bản production) → ẩn số và báo server khóa 60 giây.
- Bản build không có source map, code được minify.

## Giới hạn cần biết

Trình duyệt **không có API nào chặn được chụp màn hình ở mức hệ điều hành**, và mọi thứ đã hiển thị lên màn hình thì luôn có thể bị chụp lại (kể cả dùng một điện thoại khác để chụp). Các lớp trên nhằm **tăng độ khó, rút ngắn thời gian hiển thị và truy vết được người làm lộ**, chứ không đảm bảo tuyệt đối:

- Nút chụp phần cứng trên điện thoại (Nguồn + Giảm âm lượng) không phát sinh sự kiện nào cho trang web. Chống chụp thật sự cần ứng dụng native (ví dụ Android `FLAG_SECURE`).
- Người dùng kỹ thuật cao có thể giải mã tọa độ nét vẽ, vô hiệu hóa JavaScript bảo vệ hoặc dùng DevTools tách rời cửa sổ. Khi đó audit log và watermark là lớp phòng thủ cuối.
- Phát hiện DevTools theo kích thước có thể báo nhầm khi zoom trình duyệt khác 100%.
- Chạy HTTP trong LAN nên dữ liệu không được mã hóa trên đường truyền. Nếu cần, đặt server sau reverse proxy HTTPS (Caddy/nginx) với chứng chỉ nội bộ.
