import { CARD_PACKS, getEditableCardLimit } from '@shared/constants/cardTypes';
import { CardType, type CardDefinition, type CardPack, type CardPackId } from '@shared/types/gameObjects';
import type { DeckSetup, RoundSetup } from '@shared/types/room';

interface PackControls {
  count: HTMLElement;
  toggle?: HTMLInputElement;
}

export class RoundSetupPanel {
  private readonly _root = document.createElement('section');
  private readonly _abort = new AbortController();
  private readonly _preview = document.createElement('p');
  private readonly _validation = document.createElement('p');
  private readonly _warning = document.createElement('p');
  private readonly _deal = document.createElement('button');
  private readonly _packs = new Map<CardPackId, PackControls>();
  private readonly _inputs = new Map<CardType, HTMLInputElement>();
  private readonly _editControls: (HTMLInputElement | HTMLButtonElement)[] = [];
  private _setup?: DeckSetup;
  private _isHost = false;
  onConfigure?: (setup: DeckSetup) => void;
  onDeal?: () => void;

  constructor(container: HTMLElement) {
    this._root.id = 'round-setup';
    this._root.hidden = true;
    this._root.style.cssText = 'position:absolute;top:72px;left:16px;width:min(390px,calc(100vw - 32px));max-height:calc(100dvh - 100px);overflow:auto;box-sizing:border-box;pointer-events:auto;background:#131823ef;color:#f1f5f9;border:1px solid #475569;border-radius:12px;padding:14px;font:14px system-ui;z-index:1';
    const heading = document.createElement('h2');
    heading.textContent = 'Bộ bài';
    heading.style.cssText = 'font-size:19px;margin:0 0 8px';
    this._preview.setAttribute('aria-live', 'polite');
    this._preview.style.whiteSpace = 'pre-line';
    this._validation.setAttribute('role', 'status');
    this._validation.style.color = '#fecaca';
    this._warning.setAttribute('role', 'status');
    this._warning.style.color = '#fde68a';
    this._deal.id = 'btn-round-deal';
    this._deal.textContent = 'Chia bài';
    this._deal.type = 'button';
    this._deal.style.cssText = 'background:#1d4ed8;color:white;border:1px solid #60a5fa;padding:6px 12px;border-radius:6px';
    this._deal.addEventListener('click', () => this.onDeal?.(), { signal: this._abort.signal });
    this._root.append(heading, this._preview, this._validation, this._warning, this._deal);
    for (const pack of CARD_PACKS) this._root.append(this._buildPack(pack));
    container.append(this._root);
  }

  private _buildPack(pack: CardPack): HTMLElement {
    const row = document.createElement('section');
    row.dataset['packId'] = pack.id;
    row.style.cssText = 'margin-top:9px;padding:8px;border:1px solid #334155;border-left:4px solid ' + pack.color + ';border-radius:6px';
    const details = document.createElement('details');
    details.open = pack.kind === 'base';
    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;font-weight:650';
    summary.append(pack.name + ' · ');
    const count = document.createElement('span');
    summary.append(count);
    details.append(summary);
    const controls: PackControls = { count };
    if (pack.kind === 'expansion') {
      const toggleLabel = document.createElement('label');
      toggleLabel.style.cssText = 'float:right;margin-left:5px';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.setAttribute('aria-label', 'Bật ' + pack.name);
      toggleLabel.append(toggle, ' Bật');
      row.append(toggleLabel);
      controls.toggle = toggle;
      this._editControls.push(toggle);
      toggle.addEventListener('change', () => {
        const enabledPacks = CARD_PACKS.filter(item => item.kind === 'base' || this._packs.get(item.id)?.toggle?.checked).map(item => item.id);
        this._change({ enabledPacks });
      }, { signal: this._abort.signal });
    }
    this._packs.set(pack.id, controls);
    const description = document.createElement('p');
    description.textContent = pack.kind === 'base' ? 'Các lá còn lại giữ số mặc định theo tùy chọn của phòng.' : pack.description;
    description.style.cssText = 'color:#cbd5e1;font-size:12px;margin:7px 0';
    details.append(description);
    for (const card of pack.cards) {
      const limit = getEditableCardLimit(card.type);
      if (limit !== undefined) details.append(this._buildCount(card, limit));
    }
    if (pack.kind === 'expansion') {
      details.append(this._button('Đặt lại mặc định', () => {
        this._setCounts(Object.fromEntries(pack.cards.map(card => [card.type, card.count])));
      }));
    }
    row.append(details);
    return row;
  }

  private _button(text: string, action: () => void, label?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    if (label) button.setAttribute('aria-label', label);
    button.addEventListener('click', action, { signal: this._abort.signal });
    this._editControls.push(button);
    return button;
  }

  private _buildCount(card: CardDefinition, limit: number): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:4px;margin:4px 0';
    const label = document.createElement('label');
    label.textContent = card.englishName;
    label.title = card.name + ' · ' + card.description;
    const group = document.createElement('span');
    group.style.cssText = 'display:inline-flex;gap:3px';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(limit);
    input.step = '1';
    input.required = true;
    input.style.width = '3.1rem';
    input.id = card.type === CardType.ExplodingKitten ? 'setup-exploding-kittens'
      : card.type === CardType.Defuse ? 'setup-defuses' : 'setup-' + card.type.replace(':', '-');
    label.htmlFor = input.id;
    this._inputs.set(card.type, input);
    this._editControls.push(input);
    const set = (value: number) => {
      input.value = String(value);
      this._setCounts({ [card.type]: value });
    };
    const bump = (delta: number) => set(Math.max(0, Math.min(limit, this._count(card) + delta)));
    input.addEventListener('change', () => {
      if (input.reportValidity()) set(input.valueAsNumber);
      else input.value = String(this._count(card));
    }, { signal: this._abort.signal });
    group.append(this._button('−', () => bump(-1), 'Giảm ' + card.englishName),
      input, this._button('+', () => bump(1), 'Tăng ' + card.englishName));
    row.append(label, group);
    return row;
  }

  private _count(card: CardDefinition): number {
    const configured = this._setup?.cardCounts?.[card.type];
    if (configured !== undefined) return configured;
    if (card.type === CardType.ExplodingKitten) return this._setup?.explodingKittens ?? card.count;
    if (card.type === CardType.Defuse) return this._setup?.defuses ?? card.count;
    return card.count;
  }

  private _setCounts(counts: DeckSetup['cardCounts']): void {
    if (!this._setup || !counts) return;
    this._change({
      cardCounts: { ...this._setup.cardCounts, ...counts },
      explodingKittens: counts[CardType.ExplodingKitten] ?? this._setup.explodingKittens,
      defuses: counts[CardType.Defuse] ?? this._setup.defuses,
    });
  }

  private _change(update: Partial<DeckSetup>): void {
    if (!this._setup || !this._isHost) return;
    this._setup = { ...this._setup, ...update };
    this.onConfigure?.(this._setup);
  }

  update(round: RoundSetup | undefined, isHost: boolean): void {
    this._root.hidden = round?.phase !== 'SETUP';
    this._isHost = isHost;
    this._setup = undefined;
    if (this._root.hidden || !round) return;
    const { explodingKittens, defuses, enabledPacks, cardCounts } = round;
    this._setup = { explodingKittens, defuses, enabledPacks, cardCounts };
    for (const control of this._editControls) control.disabled = !isHost;
    const included: string[] = [];
    for (const pack of CARD_PACKS) {
      const controls = this._packs.get(pack.id)!;
      const enabled = pack.kind === 'base' || enabledPacks?.includes(pack.id) === true;
      const configured = pack.cards.reduce((sum, card) => sum + this._count(card), 0);
      const activeTotal = round.packTotals?.[pack.id] ?? (pack.kind === 'base' ? round.totalCards : configured);
      controls.count.textContent = (enabled ? activeTotal : configured) + (enabled ? ' lá' : ' lá · đang tắt');
      if (controls.toggle) controls.toggle.checked = enabled;
      if (enabled) included.push(pack.name + ' ' + activeTotal);
      for (const card of pack.cards) {
        const input = this._inputs.get(card.type);
        if (input) input.value = String(this._count(card));
      }
    }
    const remaining = round.validationError ? '—' : String(round.remainingCards);
    const remainingDefuses = round.validationError ? '—' : String(round.remainingDefuses);
    const remainingBombs = round.validationError ? '—' : String(round.remainingBombs ?? explodingKittens);
    this._preview.textContent = [
      'Tổng ' + round.totalCards + ' lá · ' + round.seatedCount + ' người đang ngồi',
      included.join(' · '),
      (round.bombCount ?? explodingKittens) + ' bom · ' + defuses + ' Gỡ Bom',
      'Sau khi chia: ' + remaining + ' lá · ' + remainingBombs + ' bom · ' + remainingDefuses + ' Gỡ Bom',
    ].join('\n');
    this._validation.textContent = round.validationError ?? '';
    this._warning.textContent = round.streakingWarning ? 'Streaking Kittens: số bom trong chồng nên bằng số người chơi.' : '';
    this._deal.hidden = !isHost;
    this._deal.disabled = !isHost || Boolean(round.validationError);
  }

  dispose(): void {
    this._abort.abort();
    this._root.remove();
  }
}
