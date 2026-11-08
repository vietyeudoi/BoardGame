// Biểu tượng nét dùng chung trên thanh công cụ.
const ICONS = {
  deck: '<rect x="4" y="3" width="13" height="16" rx="2"/><path d="M8 22h10a2 2 0 0 0 2-2V8M8 11h5"/>',
  flip: '<rect x="3" y="5" width="11" height="14" rx="2"/><path d="M16 8h5v5m0-5-6 6"/>',
  rotate: '<path d="M20 10a8 8 0 1 0-2 8m2-14v6h-6"/>',
  stack: '<path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5"/>',
  bomb: '<circle cx="10" cy="14" r="6"/><path d="m14 9 3-3m2-3v3h3"/>',
  shuffle: '<path d="M3 6h3c4 0 7 12 11 12h4m-4-4 4 4-4 4M3 18h3c1 0 2-1 3-3m4-6c1-2 2-3 4-3h4m-4-4 4 4-4 4"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="16" r="1.4"/></g>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10m2.5-8.5h-3.6a1.8 1.8 0 0 0 0 3.5h2.2a1.8 1.8 0 0 1 0 3.5H9.5"/>',
  area: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><circle cx="12" cy="12" r="2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2"/>',
} as const;

export function hudIcon(name: keyof typeof ICONS): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
    stroke-linecap="round" stroke-linejoin="round">` + ICONS[name] + `</svg>`;
}

function action(id: string, icon: keyof typeof ICONS, label: string, title: string, key = '', state = ''): string {
  return `<button id="` + id + `" class="hud-action" type="button" aria-label="` + label + `" title="` + title + (key ? ' (' + key + ')' : '') + `" ` + state + `>`
    + hudIcon(icon) + `<span class="hud-action-label">` + label + `</span>`
    + (key ? '<kbd aria-hidden="true">' + key + '</kbd>' : '') + '</button>';
}

export const GAME_HUD_MARKUP = `
  <div id="hud-shell">
    <div id="hud-top" role="group" aria-label="Thanh công cụ bàn chơi">
      <div class="hud-group hud-identity">
        <span class="hud-brand" title="Cat Boom Online">
          <span id="conn-dot" role="img" aria-label="Mất kết nối"></span>
          <span id="conn-text">Cat Boom Online</span>
        </span>
        <button id="hud-room-badge" class="hud-badge" type="button" title="Sao chép mã phòng"></button>
        <span id="hud-player-badge" class="hud-badge"></span>
      </div>
      <div class="hud-group hud-deck" aria-label="Chồng bài và cài đặt chồng">
        <span id="hud-deck-pill" class="hud-badge" title="Số lá trong chồng bốc"></span>
        <div id="hud-insert-mode-group" role="group" aria-label="Vị trí chèn">
          <span class="hud-field-label">Chèn</span>
          <button id="btn-insert-top" type="button" aria-pressed="true" title="Chèn ở đỉnh · cài đặt chung">Đỉnh</button>
          <button id="btn-insert-bottom" type="button" aria-pressed="false" title="Chèn ở đáy · cài đặt chung">Đáy</button>
          <button id="btn-insert-custom" type="button" aria-pressed="false" title="Chèn tùy chọn · chỉ áp dụng cho bạn">Tùy chọn</button>
        </div>
        <div id="hud-deck-controls" hidden>
          <label for="hud-affected-count" class="hud-field-label" title="Số lá tác động">Tác động</label>
          <span class="hud-stepper" role="group" aria-label="Số lá tác động">
            <button id="hud-affected-minus" aria-label="Giảm số lá tác động" type="button">−</button>
            <input id="hud-affected-count" type="number" min="1" step="1" aria-label="Số lá tác động" title="Số lá tác động">
            <button id="hud-affected-plus" aria-label="Tăng số lá tác động" type="button">+</button>
          </span>
          <label id="hud-deck-position-label" hidden title="Vị trí chèn riêng">Vị trí
            <input id="hud-deck-position" type="number" min="1" step="1">
          </label>
        </div>
      </div>
      <div class="hud-group hud-cards" role="group" aria-label="Thao tác bài">
        ` + action('btn-flip-card', 'flip', 'Lật', 'Lật bài', 'F') + `
        ` + action('btn-rotate-card', 'rotate', 'Xoay', 'Xoay bài 90°', 'R') + `
        ` + action('btn-stack-cards', 'stack', 'Xếp', 'Xếp chồng các lá đang chọn') + `
        ` + action('btn-gather-bombs', 'bomb', 'Gom bom', 'Lấy hết bom thường trong chồng bốc, xếp úp trước mặt', 'G', 'hidden') + `
        ` + action('btn-shuffle-hand', 'shuffle', 'Xáo tay', 'Xáo bài trên tay', 'S', 'hidden') + `
      </div>
      <div class="hud-group hud-tools" role="group" aria-label="Công cụ chơi">
        ` + action('btn-roll-dice', 'dice', 'Xúc xắc', 'Tung xúc xắc 6 mặt', 'D', 'disabled') + `
        ` + action('btn-roll-coin', 'coin', 'Đồng xu', 'Tung đồng xu Ngửa hoặc Sấp', 'C', 'disabled') + `
      </div>
      <div class="hud-group hud-system">
        <details id="hud-system-menu">
          <summary class="hud-control" title="Hệ thống" aria-label="Hệ thống">•••</summary>
          <div class="hud-popover">
            <button id="btn-reset-cam" type="button" title="Về góc nhìn mặc định">Reset Camera</button>
            <button id="btn-round-reset" hidden type="button">Làm lại ván</button>
            <button id="btn-to-lobby" type="button">Về sảnh</button>
          </div>
        </details>
      </div>
    </div>
    <div id="hud-deck-view" hidden>
      <span id="hud-deck-view-lock" role="status"></span>
      <span id="hud-deck-view-swap" hidden>
        <input id="deck-view-from" type="number" min="1" value="1" aria-label="Vị trí thứ nhất">
        <input id="deck-view-to" type="number" min="1" value="2" aria-label="Vị trí thứ hai">
        <button id="btn-deck-view-swap" type="button">Đổi chỗ</button>
      </span>
      <button id="btn-deck-view-confirm" hidden type="button">Xác nhận</button>
      <button id="btn-deck-view-close" hidden type="button">Xong</button>
    </div>
    <div class="hud-dock">
      <div id="hud-panels"></div>
      <aside id="hud-notifications" aria-label="Thông báo bàn chơi">
        <div id="hud-roll-notices" role="status" aria-live="polite">
          <div id="hud-game-error" role="alert" hidden></div>
        </div>
        <output id="hud-deck-status" hidden></output>
      </aside>
    </div>
  </div>
  <details id="hud-bottom-hint">
    <summary class="hud-control" title="Phím tắt (?)" aria-label="Phím tắt">?</summary>
    <section class="hud-popover" aria-label="Bảng phím tắt">
      <strong>Phím tắt bàn chơi</strong>
      <dl>
        <dt>Bài</dt><dd><kbd>F</kbd> Lật · <kbd>R</kbd>/<kbd>Shift+R</kbd> Xoay · Lăn chuột để xoay tự do · <kbd>S</kbd> Xáo tay</dd>
        <dt>Camera</dt><dd>Lăn chuột để thu phóng · <kbd>R</kbd> Đặt lại khi không chọn bài</dd>
        <dt>Chồng bài</dt><dd><kbd>H</kbd> Rút vào tay · <kbd>G</kbd> Gom bom · Chuột phải mở menu · <kbd>Esc</kbd> Đóng See/Alter</dd>
        <dt>Chọn nhiều</dt><dd><kbd>Ctrl+Click</kbd> hoặc kéo từ vùng trống · <kbd>Shift</kbd> Thêm · <kbd>Ctrl</kbd> Đảo chọn · <kbd>Esc</kbd> Hủy khung</dd>
        <dt>Công cụ chơi</dt><dd><kbd>D</kbd> Xúc xắc · <kbd>C</kbd> Đồng xu</dd>
        <dt>Đổi chỗ</dt><dd>Bấm vào ghế trống để ngồi hoặc bấm ghế người khác để xin đổi</dd>
      </dl>
      <small><kbd>?</kbd> Mở/đóng bảng · <kbd>Esc</kbd> Đóng</small>
    </section>
  </details>
`;
