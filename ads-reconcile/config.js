// Dán thông tin sau khi triển khai Apps Script & Google OAuth.
// Khi để trống, trang chỉ hoạt động ở chế độ DEMO (localStorage của trình duyệt).
window.ADLEDGER_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzf2d3-wWUvwp8L29E30EaM01CHH5tC1HUPuflly92qg3TqnDzYBY_agdPb2c9ZzinITw/exec', // https://script.google.com/macros/s/xxxxxxxx/exec
  GOOGLE_CLIENT_ID: '884064042089-drsbl39b8utv2rttar95aaoea45pstt8.apps.googleusercontent.com', // Lấy từ repo mẫu cardinvite/goldhome-edu-dangky
  DEMO_ALLOWED: true, // Đặt false sau khi cấu hình production nếu không muốn mở demo.
};
