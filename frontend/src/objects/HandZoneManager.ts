/**
 * HandZoneManager.ts — Lifecycle and Spatial Manager for All Hand Zones (M1.5.0)
 * Manages hand zones across 2–8 player configurations and preserves card assignments.
 * Strict TypeScript, no magic numbers, files <= 400 lines per PROJECT_RULES.md.
 */

import * as THREE from 'three';
import { HandZoneObject3D } from './HandZoneObject3D';
import { computeHandZoneLayout } from './HandZoneConfig';
import { PlayerCount } from './TableShapeConfig';
import { CardObject3D } from './CardObject3D';
import { Logger } from '../utils/Logger';

const logger = Logger.create('HandZoneManager');

export class HandZoneManager {
  private readonly _zones = new Map<string, HandZoneObject3D>();
  private readonly _scene: THREE.Scene;
  private readonly _requestRender: () => void;
  private _playerCount = 0;
  private _isCardSelectedCallback?: (card: CardObject3D) => boolean;
  private _isCardHoveredCallback?: (card: CardObject3D) => boolean;
  private _onCardsChangedCallback?: (zone: HandZoneObject3D) => void;
  private _localPlayerIndex: number | null = 0;

  constructor(
    scene: THREE.Scene,
    requestRender: () => void,
    isCardSelectedCallback?: (card: CardObject3D) => boolean,
    isCardHoveredCallback?: (card: CardObject3D) => boolean
  ) {
    this._scene = scene;
    this._requestRender = requestRender;
    this._isCardSelectedCallback = isCardSelectedCallback;
    this._isCardHoveredCallback = isCardHoveredCallback;
  }

  // ─── Layout Management ────────────────────────────────────────────────────

  setupLayout(
    playerCount: PlayerCount,
    playerLabels?: string[],
    circumradius?: number
  ): void {
    this.clearLayout();

    const positions = computeHandZoneLayout(playerCount, circumradius);
    this._playerCount = playerCount;

    positions.forEach((pos, i) => {
      const label = playerLabels?.[i] ?? pos.label;
      const zone = new HandZoneObject3D({
        id: pos.id,
        playerIndex: pos.playerIndex,
        x: pos.x,
        z: pos.z,
        rotationY: pos.rotationY,
        label,
        width: pos.width,
        depth: pos.depth,
        isCardSelected: this._isCardSelectedCallback,
        isCardHovered: this._isCardHoveredCallback,
      });

      this._zones.set(pos.id, zone);
      zone.setCardsChangedCallback((changedZone) => {
        this._onCardsChangedCallback?.(changedZone);
      });
      zone.setLocalPlayer(pos.playerIndex === this._localPlayerIndex);
      this._scene.add(zone);
    });

    this._requestRender();
    logger.info(`HandZoneManager set up for ${playerCount} players`);
  }

  setLocalPlayerIndex(playerIndex: number | null): void {
    this._localPlayerIndex = playerIndex;
    for (const zone of this._zones.values()) zone.setLocalPlayer(zone.playerIndex === playerIndex);
    this.rearrangeAllHands();
  }

  clearLayout(): void {
    for (const zone of this._zones.values()) {
      this._scene.remove(zone);
      zone.dispose();
    }
    this._zones.clear();
    this._playerCount = 0;
    this._requestRender();
  }

  // ─── Dynamic Table Scaling & Rebuild (Section 8) ──────────────────────────

  rebuildHandZones(
    newPlayerCount: PlayerCount,
    playerLabels?: string[],
    circumradius?: number
  ): void {
    // 1. Collect and preserve cards currently in each hand zone
    const savedCardsByPlayer = new Map<number, CardObject3D[]>();
    for (const zone of this._zones.values()) {
      const cards = zone.getCards();
      if (cards.length > 0) {
        savedCardsByPlayer.set(zone.playerIndex, cards);
      }
    }

    // 2. Clear old 3D visual zones (cards are detached, not disposed)
    for (const zone of this._zones.values()) {
      this._scene.remove(zone);
      zone.dispose();
    }
    this._zones.clear();

    // 3. Setup new layout positions for newPlayerCount
    this.setupLayout(newPlayerCount, playerLabels, circumradius);

    // 4. Restore cards to appropriate hand zones in the new layout
    for (const [pIndex, cards] of savedCardsByPlayer.entries()) {
      const targetZone =
        pIndex < newPlayerCount
          ? this.getHandZoneForPlayer(pIndex)
          : this.getHandZoneForPlayer(0); // If player count decreased, preserve cards into Player 1's hand

      if (targetZone) {
        for (const card of cards) {
          targetZone.addCard(card);
        }
      }
    }

    this.rearrangeAllHands();
    this._requestRender();
    logger.info(`HandZoneManager rebuilt for ${newPlayerCount} players with cards preserved`);
  }

  // ─── Accessors & Queries ──────────────────────────────────────────────────

  getHandZone(zoneId: string): HandZoneObject3D | undefined {
    return this._zones.get(zoneId);
  }

  getHandZoneForPlayer(playerIndex: number): HandZoneObject3D | undefined {
    for (const zone of this._zones.values()) {
      if (zone.playerIndex === playerIndex) {
        return zone;
      }
    }
    return undefined;
  }

  getAllHandZones(): HandZoneObject3D[] {
    return Array.from(this._zones.values());
  }

  getAllZones(): HandZoneObject3D[] {
    return this.getAllHandZones();
  }

  getPlayerCount(): number {
    return this._playerCount;
  }

  findHandZoneAtPoint(x: number, z: number, tolerance = 0): HandZoneObject3D | null {
    for (const zone of this._zones.values()) {
      if (zone.containsPoint(x, z, tolerance)) {
        return zone;
      }
    }
    return null;
  }

  getHandZoneContainingCard(cardId: string): HandZoneObject3D | null {
    for (const zone of this._zones.values()) {
      if (zone.hasCard(cardId)) {
        return zone;
      }
    }
    return null;
  }

  addCardToHand(zoneId: string, card: CardObject3D, index?: number): boolean {
    const zone = this._zones.get(zoneId);
    if (!zone) return false;

    // If card was in another hand, remove from old hand first
    const oldZone = this.getHandZoneContainingCard(card.cardId);
    if (oldZone && oldZone.zoneId !== zoneId) {
      oldZone.removeCard(card.cardId);
    }

    zone.addCard(card, index);
    this._requestRender();
    return true;
  }

  removeCardFromHand(cardId: string): HandZoneObject3D | null {
    const zone = this.getHandZoneContainingCard(cardId);
    if (!zone) return null;

    zone.removeCard(cardId);
    this._requestRender();
    return zone;
  }

  rearrangeAllHands(): void {
    for (const zone of this._zones.values()) {
      zone.arrangeCards();
    }
    this._requestRender();
  }

  setSelectionCallback(cb?: (card: CardObject3D) => boolean): void {
    this._isCardSelectedCallback = cb;
    for (const zone of this._zones.values()) {
      zone.setSelectionCallback(cb);
    }
  }

  setHoverCallback(cb?: (card: CardObject3D) => boolean): void {
    this._isCardHoveredCallback = cb;
    for (const zone of this._zones.values()) {
      zone.setHoverCallback(cb);
    }
  }

  /** M1.7.8: observe hand membership/order changes across all zones. */
  setCardsChangedCallback(cb?: (zone: HandZoneObject3D) => void): void {
    this._onCardsChangedCallback = cb;
    for (const zone of this._zones.values()) {
      zone.setCardsChangedCallback(cb ? (changedZone) => cb(changedZone) : undefined);
    }
  }

  dispose(): void {
    this.clearLayout();
  }
}

