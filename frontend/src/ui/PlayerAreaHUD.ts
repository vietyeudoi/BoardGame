/**
 * PlayerAreaHUD.ts — HTML overlay panel for player area controls.
 * Provides player count selector, visibility toggle, and selected area label.
 * UI communicates with 3D scene exclusively via callbacks.
 */

import { PlayerCount } from '../objects/TableShapeConfig';

// ─── PlayerAreaHUD ────────────────────────────────────────────────────────────

export class PlayerAreaHUD {
  private readonly _container: HTMLElement;
  private readonly _panel: HTMLDivElement;
  private readonly _countSelect: HTMLSelectElement;
  private readonly _toggleBtn: HTMLButtonElement;
  private readonly _areaLabel: HTMLDivElement;
  private _panelVisible = true;

  /** Callback: player count changed via selector */
  public onSetPlayerCount: ((count: PlayerCount) => void) | null = null;
  /** Callback: show/hide toggle button pressed */
  public onToggleVisibility: (() => void) | null = null;
  /** Callback: area selection changed (external set) */
  public onAreaSelected: ((areaId: string | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this._container = container;

    this._panel = document.createElement('div');
    this._panel.id = 'player-area-hud';
    Object.assign(this._panel.style, {
      position: 'absolute',
      bottom: '14px',
      right: '14px',
      background: 'rgba(10,14,28,0.82)',
      border: '1px solid #00ccff55',
      borderRadius: '8px',
      padding: '10px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      color: '#cceeff',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      zIndex: '200',
      minWidth: '160px',
      backdropFilter: 'blur(4px)',
      userSelect: 'none',
    } as CSSStyleDeclaration);

    // Row: title
    const title = document.createElement('span');
    title.textContent = '⬡ Khu vực người chơi';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '12px';
    title.style.opacity = '0.7';

    // Row: player count
    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.alignItems = 'center';
    row1.style.gap = '8px';

    const countLabel = document.createElement('span');
    countLabel.textContent = 'Người chơi:';

    this._countSelect = document.createElement('select');
    this._countSelect.id = 'player-count-select';
    Object.assign(this._countSelect.style, {
      background: '#0a1428',
      color: '#00ccff',
      border: '1px solid #00ccff55',
      borderRadius: '4px',
      padding: '2px 6px',
      fontSize: '13px',
      cursor: 'pointer',
    } as CSSStyleDeclaration);

    for (const n of [2, 3, 4, 5, 6, 7, 8] as const) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      this._countSelect.appendChild(opt);
    }
    this._countSelect.value = '4';

    this._countSelect.addEventListener('change', () => {
      const count = parseInt(this._countSelect.value, 10) as PlayerCount;
      this.onSetPlayerCount?.(count);
    });

    row1.appendChild(countLabel);
    row1.appendChild(this._countSelect);

    // Row: toggle button
    this._toggleBtn = document.createElement('button');
    this._toggleBtn.id = 'toggle-areas-btn';
    this._toggleBtn.textContent = '👁 Ẩn/Hiện Khu vực';
    Object.assign(this._toggleBtn.style, {
      background: '#0a1428',
      color: '#00ccff',
      border: '1px solid #00ccff55',
      borderRadius: '4px',
      padding: '4px 8px',
      fontSize: '12px',
      cursor: 'pointer',
    } as CSSStyleDeclaration);

    this._toggleBtn.addEventListener('click', () => {
      this.onToggleVisibility?.();
    });

    // Row: selected area label
    this._areaLabel = document.createElement('div');
    this._areaLabel.id = 'selected-area-label';
    this._areaLabel.textContent = '';
    Object.assign(this._areaLabel.style, {
      fontSize: '12px',
      opacity: '0.75',
      minHeight: '16px',
    } as CSSStyleDeclaration);

    this._panel.appendChild(title);
    this._panel.appendChild(row1);
    this._panel.appendChild(this._toggleBtn);
    this._panel.appendChild(this._areaLabel);

    this._container.appendChild(this._panel);
  }

  // ─── Public Methods ───────────────────────────────────────────────────────

  setSelectedAreaLabel(label: string | null): void {
    this._areaLabel.textContent = label ? `✔ ${label}` : '';
  }

  setPlayerCount(count: number): void {
    this._countSelect.value = String(count);
  }

  setVisible(visible: boolean): void {
    this._panelVisible = visible;
    this._panel.style.display = visible ? 'flex' : 'none';
  }

  isVisible(): boolean {
    return this._panelVisible;
  }

  dispose(): void {
    if (this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
    this.onSetPlayerCount = null;
    this.onToggleVisibility = null;
    this.onAreaSelected = null;
  }
}

