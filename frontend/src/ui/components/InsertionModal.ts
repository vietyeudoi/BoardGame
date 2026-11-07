/**
 * InsertionModal.ts — Modal dialog for custom card/stack insertion (M1.3.4.5)
 * Allows entering the number of cards below the inserted card/stack.
 * Enforces integer bounds [0, maxCount], blocks invalid/NaN input,
 * and provides Confirm / Cancel actions with keyboard support (Enter/Escape).
 */
import { Logger } from '../../utils/Logger';

const logger = Logger.create('InsertionModal');

export interface InsertionModalOptions {
  title?: string;
  description?: string;
  currentCount: number;
  initialValue?: number;
  onConfirm: (index: number) => void;
  onCancel?: () => void;
}

export class InsertionModal {
  private readonly _overlay: HTMLElement;
  private readonly _modal: HTMLElement;
  private readonly _input: HTMLInputElement;
  private readonly _errorMsg: HTMLElement;
  private readonly _countLabel: HTMLElement;
  private readonly _titleEl: HTMLElement;
  private readonly _descEl: HTMLElement;
  private _currentMax = 0;
  private _onConfirmCallback: ((index: number) => void) | null = null;
  private _onCancelCallback: (() => void) | null = null;

  constructor(private readonly _container: HTMLElement) {
    this._overlay = document.createElement('div');
    this._overlay.id = 'insertion-modal-overlay';
    this._overlay.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 2000;
      align-items: center;
      justify-content: center;
    `;

    this._modal = document.createElement('div');
    this._modal.style.cssText = `
      background: rgba(18, 18, 32, 0.95);
      border: 1px solid #3d3d5c;
      border-radius: 12px;
      padding: 20px 24px;
      width: 340px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
      font-family: inherit;
      color: #e0e0f0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      user-select: none;
    `;

    this._titleEl = document.createElement('div');
    this._titleEl.style.cssText = 'font-weight: 700; font-size: 1rem; color: #60a5fa;';
    this._titleEl.textContent = 'Vị trí chèn bài';

    this._descEl = document.createElement('div');
    this._descEl.style.cssText = 'font-size: 0.8rem; color: #94a3b8; line-height: 1.4;';
    this._descEl.textContent = 'Số lá bài nằm phía trên vị trí chèn (tính từ đỉnh xuống):';

    this._countLabel = document.createElement('div');
    this._countLabel.style.cssText =
      'font-size: 0.72rem; color: #a5b4fc; background: #1e1b4b; padding: 6px 10px; border-radius: 6px; line-height: 1.4;';
    this._countLabel.innerHTML =
      '<div>Số lượng bài hiện tại: 0</div><div style="color:#818cf8; font-size:0.68rem; margin-top:2px;">• 0 = Trên cùng &nbsp;|&nbsp; 1 = Dưới lá trên cùng &nbsp;|&nbsp; Max = Dưới cùng</div>';

    this._input = document.createElement('input');
    this._input.type = 'number';
    this._input.min = '0';
    this._input.step = '1';
    this._input.style.cssText = `
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.9rem;
      color: #f8fafc;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    `;
    this._input.addEventListener('focus', () => {
      this._input.style.borderColor = '#3b82f6';
    });
    this._input.addEventListener('blur', () => {
      this._input.style.borderColor = '#334155';
    });
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._confirm();
      } else if (e.key === 'Escape') {
        this._cancel();
      }
    });

    this._errorMsg = document.createElement('div');
    this._errorMsg.style.cssText = 'font-size: 0.75rem; color: #f87171; display: none;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Hủy';
    cancelBtn.style.cssText = `
      background: #334155;
      color: #cbd5e1;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 0.8rem;
      cursor: pointer;
      font-weight: 600;
    `;
    cancelBtn.addEventListener('click', () => this._cancel());

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Xác nhận';
    confirmBtn.style.cssText = `
      background: #2563eb;
      color: #ffffff;
      border: 1px solid #3b82f6;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 0.8rem;
      cursor: pointer;
      font-weight: 600;
    `;
    confirmBtn.addEventListener('click', () => this._confirm());

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    this._modal.appendChild(this._titleEl);
    this._modal.appendChild(this._descEl);
    this._modal.appendChild(this._countLabel);
    this._modal.appendChild(this._input);
    this._modal.appendChild(this._errorMsg);
    this._modal.appendChild(btnRow);

    this._overlay.appendChild(this._modal);
    this._container.appendChild(this._overlay);

    // Click outside to cancel
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) {
        this._cancel();
      }
    });
  }

  show(options: InsertionModalOptions): void {
    this._titleEl.textContent = options.title ?? 'Vị trí chèn bài';
    this._descEl.textContent =
      options.description ?? 'Số lá bài nằm phía trên vị trí chèn (tính từ đỉnh xuống):';
    this._currentMax = Math.max(0, options.currentCount);
    this._countLabel.innerHTML = `
      <div>Số lượng bài hiện tại của đích: <b>${this._currentMax}</b> lá (Hợp lệ: 0 - ${this._currentMax})</div>
      <div style="color:#818cf8; font-size:0.68rem; margin-top:2px;">• 0 = Trên cùng &nbsp;|&nbsp; 1 = Dưới lá trên cùng &nbsp;|&nbsp; ${this._currentMax} = Dưới cùng</div>
    `;

    const initial =
      options.initialValue !== undefined
        ? Math.max(0, Math.min(options.initialValue, this._currentMax))
        : 0;
    this._input.value = initial.toString();
    this._input.max = this._currentMax.toString();

    this._errorMsg.style.display = 'none';
    this._errorMsg.textContent = '';

    this._onConfirmCallback = options.onConfirm;
    this._onCancelCallback = options.onCancel ?? null;

    this._overlay.style.display = 'flex';
    setTimeout(() => this._input.focus(), 50);
    logger.debug('InsertionModal shown');
  }

  hide(): void {
    this._overlay.style.display = 'none';
    this._onConfirmCallback = null;
    this._onCancelCallback = null;
  }

  private _confirm(): void {
    const rawVal = this._input.value.trim();
    const parsed = Number(rawVal);

    if (rawVal === '' || isNaN(parsed) || !Number.isInteger(parsed)) {
      this._showError('Vui lòng nhập một số nguyên hợp lệ.');
      return;
    }

    if (parsed < 0) {
      this._showError('Số lượng bài phía trên không được âm.');
      return;
    }

    if (parsed > this._currentMax) {
      this._showError(
        `Giá trị không được vượt quá số lượng bài hiện tại (${this._currentMax}).`
      );
      return;
    }

    const cb = this._onConfirmCallback;
    this.hide();
    cb?.(parsed);
  }

  private _cancel(): void {
    const cb = this._onCancelCallback;
    this.hide();
    cb?.();
  }

  private _showError(msg: string): void {
    this._errorMsg.textContent = msg;
    this._errorMsg.style.display = 'block';
  }

  dispose(): void {
    this._overlay.remove();
  }
}

