/**
 * ContextMenu.ts — Floating Tabletop Action Context Menu (M1.3.4)
 * Displays available manipulation actions on right-click over CardObject3D.
 */
import { Logger } from '../utils/Logger';

const logger = Logger.create('ContextMenu');

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
}

export class ContextMenu {
  private readonly _element: HTMLElement;
  private _isOpen = false;
  private readonly _abortController = new AbortController();

  constructor(private readonly _container: HTMLElement) {
    this._element = document.createElement('div');
    this._element.id = 'tabletop-context-menu';
    this._element.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1000;
      background: rgba(18, 18, 32, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid #3d3d5c;
      border-radius: 8px;
      padding: 6px 0;
      min-width: 180px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      user-select: none;
      font-family: inherit;
      font-size: 0.8rem;
      color: #e0e0f0;
    `;
    this._container.appendChild(this._element);

    this._setupGlobalListeners();
  }

  show(clientX: number, clientY: number, items: ContextMenuItem[]): void {
    if (items.length === 0) return;

    this._element.innerHTML = '';

    for (const item of items) {
      const btn = document.createElement('div');
      btn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 14px;
        cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
        opacity: ${item.disabled ? '0.4' : '1'};
        gap: 12px;
        transition: background 0.12s;
      `;

      if (!item.disabled) {
        btn.addEventListener('mouseenter', () => {
          btn.style.background = '#2563eb';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'transparent';
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          item.action();
          this.hide();
        });
      }

      const left = document.createElement('span');
      left.textContent = `${item.icon ? item.icon + ' ' : ''}${item.label}`;

      btn.appendChild(left);

      if (item.shortcut) {
        const right = document.createElement('span');
        right.textContent = item.shortcut;
        right.style.cssText = 'color: #94a3b8; font-size: 0.7rem; font-family: monospace;';
        btn.appendChild(right);
      }

      this._element.appendChild(btn);
    }

    // Position and clamp within viewport
    this._element.style.display = 'block';
    this._isOpen = true;

    const rect = this._element.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;

    const posX = Math.max(8, Math.min(maxX, clientX));
    const posY = Math.max(8, Math.min(maxY, clientY));

    this._element.style.left = `${posX}px`;
    this._element.style.top = `${posY}px`;

    logger.debug('Context menu displayed', { x: posX, y: posY });
  }

  hide(): void {
    if (!this._isOpen) return;
    this._element.style.display = 'none';
    this._isOpen = false;
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  private _setupGlobalListeners(): void {
    const opts = { signal: this._abortController.signal };

    window.addEventListener('click', () => {
      if (this._isOpen) this.hide();
    }, opts);

    window.addEventListener('contextmenu', (e) => {
      // If clicking outside context menu, hide it
      if (this._isOpen && !this._element.contains(e.target as Node)) {
        this.hide();
      }
    }, opts);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        this.hide();
      }
    }, opts);

    window.addEventListener('resize', () => {
      if (this._isOpen) this.hide();
    }, opts);
  }

  dispose(): void {
    this._abortController.abort();
    this._element.remove();
    logger.info('ContextMenu disposed');
  }
}

