# Ảnh mặt bài

Ảnh gốc nằm trong `shared/constants`. Trình duyệt dùng ảnh WebP theo hash nội dung trong `frontend/public/card-faces`. Hai cỡ có chiều rộng tối đa 384 và 768 px, chất lượng WebP 80. Ảnh nhỏ hơn giới hạn giữ nguyên kích thước.

## Sinh lại ảnh

Cần Python 3 và Pillow 12.2.0 để mã hóa lại ảnh. Sau khi cập nhật ảnh gốc hoặc cấu hình ghép, chạy từ thư mục gốc của repo:

```sh
python -m pip install Pillow==12.2.0
npm run optimize:card-faces
npm run generate:card-faces -- --check
```

Script tái sử dụng tệp có cùng cấu hình và hash. Khi đưa thay đổi lên Git, đưa cùng ảnh WebP đã sinh, chỉ mục và các tệp manifest sinh tự động. Dev và build kiểm tra tài sản đã sinh bằng Node.js.

## Phục vụ bản build

Deploy toàn bộ `frontend/dist`, kể cả `card-faces/`. Vite dev và preview cục bộ đặt cache dài cho URL có hash. Với host tĩnh/CDN, cấu hình cho đường dẫn `/card-faces/*`:

- `Cache-Control: public, max-age=31536000, immutable`.
- `Content-Type: image/webp`. Giữ ETag nếu host hỗ trợ. WebP đã nén, nên không cần nén HTTP riêng cho các tệp ảnh này.
- Giữ chính sách cập nhật riêng cho HTML của ứng dụng để trình duyệt nhận URL mới sau deploy.

URL đổi khi byte ảnh đổi. Trình duyệt tái sử dụng HTTP cache theo URL cũ cho đến khi mục đó hết hạn hoặc bị loại. Hàng đợi tải trong app giữ ảnh đã giải mã có giới hạn và ưu tiên ảnh đang hiển thị. Nạp nền chỉ dùng danh sách bộ công khai đã bật. Chế độ tiết kiệm dữ liệu và mạng 3G hoặc chậm hơn dùng ảnh nhỏ, đồng thời bỏ nạp nền.
