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
  private _previousFocus?: HTMLElement;
  private readonly _abortController = new AbortController();

  constructor(private readonly _container: HTMLElement) {
    this._element = document.createElement('div');
    this._element.id = 'tabletop-context-menu';
    this._element.setAttribute('role', 'menu');
    this._element.tabIndex = -1;
    this._element.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1000;
      background: rgba(18, 18, 32, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid #3d3d5c;
      border-radius: 8px;
      padding: 6px 0;
      min-width: min(180px, calc(100vw - 16px));
      box-sizing: border-box;
      max-width: calc(100vw - 16px);
      max-height: calc(100dvh - 16px);
      overflow-y: auto;
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

    this.hide();
    this._previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this._element.innerHTML = '';

    for (const item of items) {
      const btn = document.createElement('div');
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('aria-disabled', String(!!item.disabled));
      btn.tabIndex = -1;
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

    (this._enabledItems()[0] ?? this._element).focus({ preventScroll: true });
    logger.debug('Context menu displayed', { x: posX, y: posY });
  }

  hide(): void {
    if (!this._isOpen) return;
    const hadFocus = this._element.contains(document.activeElement);
    this._element.style.display = 'none';
    this._isOpen = false;
    if (hadFocus) this._previousFocus?.focus({ preventScroll: true });
    this._previousFocus = undefined;
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  private _enabledItems(): HTMLElement[] {
    return [...this._element.querySelectorAll<HTMLElement>('[role="menuitem"][aria-disabled="false"]')];
  }

  private _setupGlobalListeners(): void {
    const opts = { signal: this._abortController.signal };

    window.addEventListener('pointerdown', e => {
      if (this._isOpen && (!(e.target instanceof Node) || !this._element.contains(e.target))) this.hide();
    }, { ...opts, capture: true });

    window.addEventListener('click', e => {
      if (this._isOpen && (!(e.target instanceof Node) || !this._element.contains(e.target))) this.hide();
    }, opts);

    window.addEventListener('scroll', e => {
      if (this._isOpen && (!(e.target instanceof Node) || !this._element.contains(e.target))) this.hide();
    }, { ...opts, capture: true });

    window.addEventListener('contextmenu', (e) => {
      // If clicking outside context menu, hide it
      if (this._isOpen && (!(e.target instanceof Node) || !this._element.contains(e.target))) {
        this.hide();
      }
    }, opts);

    this._element.addEventListener('keydown', e => {
      const items = this._enabledItems();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!items.length) return;
      if (e.key === 'Enter' || e.key === ' ') items[index]?.click();
      else {
        const next = e.key === 'ArrowDown' ? index + 1 : index < 0 ? items.length - 1 : index - 1;
        items[(next + items.length) % items.length]?.focus({ preventScroll: true });
      }
    }, opts);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._isOpen) {
        e.preventDefault();
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

