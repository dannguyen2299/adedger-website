# AdLedger V2 — Đối soát quảng cáo & cổng thanh toán khách hàng

Website HTML/CSS/JavaScript thuần, chạy trên hosting tĩnh (ví dụ GitHub Pages hoặc Hostinger). Backend là Google Apps Script Web App; lưu dữ liệu trên Google Sheets. Đăng nhập qua Google Identity Services, phân quyền bằng bảng `Users` tại backend. Cách triển khai tương tự dự án mẫu `cardinvite/goldhome-edu-dangky`, nhưng đây là source riêng.

## Quy trình thanh toán **hai xác nhận**

1. **Admin** cấu hình thông tin ngân hàng và tải ảnh mã QR nhận tiền; tạo một khách hàng và cấp quyền đăng nhập cho email Google của họ.
2. **Khách hàng** đăng nhập, chỉ xem dữ liệu của chính mình, đối chiếu ngân sách/chi phí, quét QR và chuyển khoản ngân hàng.
3. **Khách hàng** bấm **“Xác nhận đã thanh toán”**, nhập số tiền, ngày chuyển, kỳ đối soát và mã giao dịch (nếu có). Hệ thống tạo khoản thanh toán `PENDING` (chờ Admin), **không** tính vào tiền đã nhận.
4. **Admin** mở mục **Thanh toán** → danh sách **“Thanh toán khách đang chờ xác nhận”** hiển thị **tất cả các kỳ**. Sau khi kiểm tra tài khoản ngân hàng thực tế, nhấn **“Đã nhận được tiền”**: hệ thống đổi thành `CONFIRMED` và **chỉ lúc đó** cộng vào số dư đối soát. Nếu khách báo nhầm, Admin chọn **“Từ chối”** (`REJECTED`).
5. Nếu khách không vào web, **Admin tự ghi khoản đã nhận** trên trang Thanh toán; khoản này được xác nhận trực tiếp bởi Admin.

**Lưu ý:** Xác nhận từ khách là lời khai, không chứng minh tiền đã vào ngân hàng. Website **không tự chuyển khoản**, không kiểm tra số dư ngân hàng và chưa có tích hợp webhook ngân hàng. Trạng thái `PENDING`/`REJECTED` không cộng vào thu ròng.

## Các trang

- Dashboard: kế hoạch tuần, chi phí thực chi, tiền đã được xác nhận, số dư phải thu / chuyển kỳ.
- Đối soát tuần: tuần từ **thứ Hai đến Chủ Nhật**, số dư đầu và cuối, chi phí theo chiến dịch; in và xuất CSV. Chỉ Admin chốt/mở kỳ.
- Chi phí: ghi chi phí thực tế theo ngày và chiến dịch.
- Thanh toán: QR và nút **“Xác nhận đã thanh toán”** dành cho khách; danh sách **“Đã nhận được tiền”** / từ chối dành cho Admin.
- Khách hàng, tài khoản chạy Ads, nền tảng, chiến dịch và ngân sách: Admin quản lý.
- **Tài khoản khách**: Admin tạo email Google có vai trò `CLIENT` và gắn đúng một `client_id` (có thể tạo nhiều email cùng xem một khách).
- **QR & ngân hàng**: Admin lưu tên ngân hàng, số tài khoản, chủ tài khoản, nội dung chuyển khoản; upload QR PNG, JPG, WebP tối đa **300KB**. Ảnh lưu vào **Google Drive của người triển khai Apps Script** và chỉ trả về cho phiên đã đăng nhập.

### Cách tính tiền

`Số dư cuối kỳ = Số dư đầu kỳ + Thu ròng đã được Admin xác nhận - Chi phí quảng cáo thực tế`

Số dư dương là tiền ứng trước còn dư; số dư âm là công nợ khách cần thanh toán. Giao dịch khách báo chuyển nhưng Admin chưa xác nhận không làm thay đổi số dư. Giao dịch lịch sử từ V1 không có cột `status` được xem là đã được xác nhận để bảo toàn số dư cũ. Kỳ đã chốt phải mở lại các kỳ liên quan trước khi Admin xác nhận khoản thanh toán mới vào kỳ đó.

## Chạy demo không cần Google

Mở file **`adledger-demo-v2.html`** được bàn giao riêng (đã nhúng HTML/CSS/JS vào một file). Demo lưu dữ liệu trong localStorage, không ghi Google Sheets. Trên thanh trên cùng có nút **“Xem như khách”**, nhấn để chuyển qua giao diện khách và thử báo chuyển khoản; nhấn **“Quay về Admin”** để thử xác nhận đã nhận tiền. Đây chỉ là mô phỏng giao diện, không phải kiểm thử bảo mật production.

Hoặc chạy trong thư mục này:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

## Cài Google Sheets & Apps Script

1. Tạo Google Sheet mới (hoặc **sao lưu** Google Sheet V1 hiện có).
2. Mở **Extensions → Apps Script**. Thay mã nguồn bằng toàn bộ `apps-script/Code.gs`.
3. Chọn và chạy hàm **`setupAdLedger`** một lần. Hàm tạo các tab `clients`, `platforms`, `accounts`, `campaigns`, `expenses`, `payments`, `closings`, `Users`, `Sessions`, `AuditLogs`, `PaymentConfig`. Với dữ liệu V1, hàm chỉ nối thêm các cột vào cuối tab `payments` / `Users`, không xóa giao dịch cũ. Không tự chỉnh tiêu đề cột.
4. Bảng `Users` có các cột `email | name | role | active | client_id`. Nhập email Google của bạn với `role=ADMIN`, `active=TRUE` và để `client_id` trống; hàm setup thường tự thêm tài khoản sở hữu Sheet nếu đọc được email.
5. Trên Google Cloud Console tạo OAuth 2.0 **Web application** Client ID. Thêm **Authorized JavaScript origins** cho URL frontend (ví dụ `https://tenban.github.io` và `http://localhost:8080` khi chạy local). Copy Client ID dạng `...apps.googleusercontent.com`.
6. Trong **Apps Script → Project Settings → Script Properties**, thêm `GOOGLE_CLIENT_ID` đúng bằng Client ID. Nếu dùng Apps Script độc lập không gắn Sheet, thêm `SPREADSHEET_ID` của Google Sheet.
7. Deploy → **New deployment → Web app**. Chọn **Execute as: Me**; **Who has access: Anyone** (để website tĩnh gọi HTTP API). Bản thân backend luôn xác minh Google token, kiểm tra phiên, vai trò và `client_id` trước khi trả dữ liệu. **Không** chia sẻ quyền sửa trực tiếp Google Sheets cho khách.
8. Trong `config.js`, điền `API_URL` = URL Web App `/exec`, `GOOGLE_CLIENT_ID` = Client ID; nên đặt `DEMO_ALLOWED:false` trên site production.
9. Upload các file `index.html`, `styles.css`, `app.js`, `core.js`, `config.js` lên hosting/GitHub Pages. **Không** đưa session token hoặc OAuth secret vào repository.
10. Admin vào **Tài khoản khách** để cấp email Google của khách và gắn `client_id`. Sau đó vào **QR & ngân hàng** upload QR và điền thông tin nhận tiền.

**Khi sửa backend**: Apps Script → Deploy → Manage deployments → Edit → **New version** → Deploy. Đừng để URL Web App vẫn chạy phiên bản `Code.gs` cũ. Việc tải QR cần cho phép Apps Script truy cập Google Drive; cấp quyền khi Google hiển thị hộp thoại yêu cầu.

## Phân quyền

| Vai trò | Quyền |
|---|---|
| `ADMIN` | Toàn hệ thống; quản lý khách, nền tảng, Users, QR, chốt kỳ; ghi tiền đã nhận, xác nhận/từ chối thanh toán khách. |
| `EDITOR` | Xem toàn bộ dữ liệu và ghi chi phí, không được tự duyệt tiền. |
| `VIEWER` | Chỉ xem dữ liệu toàn hệ thống. |
| `CLIENT` | Backend **chỉ trả dữ liệu gắn với `client_id`**: ngân sách, chi phí, số dư, lịch sử thanh toán của chính khách; được báo đã chuyển khoản, **không thể** xác nhận đã nhận tiền. |

Hệ thống ghi audit các thao tác quan trọng tại `AuditLogs` (người, thời điểm, trạng thái trước và sau). Sau khi khách hàng bị khóa ở `Users`, API từ chối các phiên tiếp theo dù trình duyệt còn token.

## Kiểm thử

```bash
node tests/core.test.js
node tests/backend.mock.test.js
node tests/payments-v2.mock.test.js
node tests/frontend.smoke.test.js
node --check app.js
```

Kiểm thử backend sử dụng Google Sheets **giả lập**; chưa chứng minh kết nối thành công Google Sheets, Google OAuth hoặc Google Drive thực tế. Trước khi bàn giao production, nên thử 2 email khách thật, tải QR, kiểm tra Google Drive, xử lý chờ/nhận/từ chối, và thử khách không thể xem dữ liệu người khác.

## Cấu trúc

```text
ads-reconcile/
├── index.html
├── styles.css
├── app.js
├── core.js
├── config.js
├── apps-script/Code.gs
├── tests/
│   ├── core.test.js
│   ├── backend.mock.test.js
│   ├── payments-v2.mock.test.js
│   └── frontend.smoke.test.js
└── README.md
```
