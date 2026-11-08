/**
 * PlayerAreaHUD.ts — HTML overlay panel for player area controls.
 * Provides visibility toggle and selected area label.
 * UI communicates with 3D scene exclusively via callbacks.
 */


// ─── PlayerAreaHUD ────────────────────────────────────────────────────────────

import { hudIcon } from './GameHudMarkup';

export class PlayerAreaHUD {
  private readonly _panel: HTMLDetailsElement;
  private readonly _toggleBtn: HTMLButtonElement;
  private readonly _areaLabel: HTMLDivElement;
  private readonly _events = new AbortController();
  private _panelVisible = true;

  /** Callback: show/hide toggle button pressed */
  public onToggleVisibility: (() => void) | null = null;
  /** Callback: area selection changed (external set) */
  public onAreaSelected: ((areaId: string | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this._panel = document.createElement('details');
    this._panel.id = 'player-area-hud';

    const title = document.createElement('summary');
    title.className = 'hud-control';
    title.title = 'Khu vực người chơi';
    title.setAttribute('aria-label', title.title);
    title.innerHTML = hudIcon('area');

    const controls = document.createElement('div');
    controls.className = 'hud-popover';
    this._toggleBtn = document.createElement('button');
    this._toggleBtn.id = 'toggle-areas-btn';
    this._toggleBtn.type = 'button';
    this._toggleBtn.textContent = 'Ẩn/Hiện khu vực';
    this._toggleBtn.addEventListener('click', () => this.onToggleVisibility?.(), { signal: this._events.signal });

    this._areaLabel = document.createElement('div');
    this._areaLabel.id = 'selected-area-label';
    controls.append(this._toggleBtn, this._areaLabel);
    this._panel.append(title, controls);
    container.append(this._panel);
  }

  // ─── Public Methods ───────────────────────────────────────────────────────

  setSelectedAreaLabel(label: string | null): void {
    this._areaLabel.textContent = label ? `✔ ${label}` : '';
  }

  setVisible(visible: boolean): void {
    this._panelVisible = visible;
    this._panel.hidden = !visible;
  }

  isVisible(): boolean {
    return this._panelVisible;
  }

  dispose(): void {
    this._events.abort();
    this._panel.remove();
    this.onToggleVisibility = null;
    this.onAreaSelected = null;
  }
}

