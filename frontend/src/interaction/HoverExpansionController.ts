/**
 * HoverExpansionController.ts — Local Card Hover Expansion Effect (M1.5.3)
 *
 * Manages the "fan out" animation when hovering over a group of cards
 * belonging to the same owner on the table surface.
 *
 * Rules:
 * - Only activates for cards with ownerId === localPlayerId and location === 'TABLE'.
 * - Groups cards within radius R = 5 units of the hovered card.
 * - Animation is 100% client-side: no WebSocket messages sent.
 * - DOES NOT modify CardRegistry positions.
 */
import type { CardObject3D } from '../objects/CardObject3D';
import { Logger } from '../utils/Logger';

const logger = Logger.create('HoverExpansionController');

/** Physical grouping radius (world units). */
const GROUP_RADIUS = 5;
/** Card spread spacing multiplier relative to card width. */
const SPREAD_MULTIPLIER = 1.1;
/** Y lift applied to hovered card. */
const HOVER_LIFT_Y = 0.5;
/** Uniform scale applied to whole group. */
const GROUP_SCALE = 1.15;
/** Animation duration in milliseconds. */
const ANIMATION_DURATION_MS = 200;

interface BaselineTransform {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

interface GroupCard {
  card: CardObject3D;
  baseline: BaselineTransform;
  /** Target position/scale for expanded state. */
  targetX: number;
  targetY: number;
  targetZ: number;
  targetScaleX: number;
  targetScaleY: number;
  targetScaleZ: number;
}

/** Linearly interpolates from a to b by t ∈ [0, 1]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class HoverExpansionController {
  private _localPlayerId: string | null = null;
  /**
   * M1.7.6: authoritative eligibility check supplied by the scene layer.
   * The controller's `_ownerId` mirror can be stale after a HAND→TABLE
   * transition, so it must never be the only gate for a TABLE presentation.
   */
  private _eligibilityCheck: ((card: CardObject3D) => boolean) | null = null;
  private _activeGroup: GroupCard[] | null = null;
  private _animationId: number | null = null;
  private _expanded = false;
  private _animStartTime = 0;
  private _animatingIn = false;

  /** Callback to request a scene render frame. */
  private readonly _requestRender: () => void;

  constructor(requestRender: () => void) {
    this._requestRender = requestRender;
    logger.debug('HoverExpansionController initialized');
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Sets the local player ID used to filter owned cards. */
  setLocalPlayerId(playerId: string | null): void {
    this._localPlayerId = playerId;
  }

  /**
   * M1.7.6: installs an authoritative ownership/location predicate (backed by
   * the CardRegistry + local session). When set, expansion requires both this
   * check and the owner-id check below to pass.
   */
  setEligibilityCheck(check: ((card: CardObject3D) => boolean) | null): void {
    this._eligibilityCheck = check;
  }

  /**
   * Called when hover state changes over a table card.
   * @param card The card being hovered (null when hover leaves).
   * @param isHovering Whether we are entering (true) or leaving (false).
   * @param allTableCards All current cards on the table to build the group from.
   */
  onTableCardHoverChanged(
    card: CardObject3D | null,
    isHovering: boolean,
    allTableCards: CardObject3D[]
  ): void {
    if (isHovering && card !== null) {
      this._tryExpand(card, allTableCards);
    } else {
      this.collapseExpansion();
    }
  }

  /**
   * Immediately collapses any active expansion (e.g., when drag starts).
   * Skips animation and snaps back to baseline.
   */
  cancelExpansion(): void {
    this._stopAnimation();
    if (this._activeGroup) {
      for (const entry of this._activeGroup) {
        this._applyBaseline(entry);
      }
      this._activeGroup = null;
    }
    this._expanded = false;
    this._requestRender();
  }

  /**
   * Smoothly collapses the expansion back to baseline.
   */
  collapseExpansion(): void {
    if (!this._activeGroup || !this._expanded) {
      this._activeGroup = null;
      return;
    }
    // Reverse: use current positions as "from", baseline as "to"
    this._animatingIn = false;
    this._startAnimation();
  }

  /** Dispose and clean up (no GPU resources to free here). */
  dispose(): void {
    this.cancelExpansion();
    this._localPlayerId = null;
    logger.debug('HoverExpansionController disposed');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private _tryExpand(hoveredCard: CardObject3D, allTableCards: CardObject3D[]): void {
    if (!this._localPlayerId) return;
    if (hoveredCard.isDisposed() || hoveredCard.isInHand()) return;

    // M1.7.6: authoritative location/ownership gate. A card that just left a
    // hand must not be expanded through a stale `_ownerId` mirror.
    if (this._eligibilityCheck && !this._eligibilityCheck(hoveredCard)) return;

    // Guard: only activate for cards owned by local player
    const ownerId = this._getOwnerId(hoveredCard);
    if (!ownerId || ownerId !== this._localPlayerId) return;

    // Collapse any previous group first (instant)
    if (this._activeGroup) {
      this._stopAnimation();
      for (const entry of this._activeGroup) {
        this._applyBaseline(entry);
      }
      this._activeGroup = null;
      this._expanded = false;
    }

    // Gather group: same ownerId, within R units
    const group = this._gatherGroup(hoveredCard, ownerId, allTableCards);
    if (group.length === 0) return;

    // Compute targets for fan-out layout
    const cardWidth = hoveredCard.cardWidth;
    this._computeTargets(group, hoveredCard, cardWidth);

    this._activeGroup = group;
    this._animatingIn = true;
    this._startAnimation();
  }

  /**
   * Retrieves the ownerId stored on the card. M1.7.6: prefer the public getter
   * so the controller follows the same ownership source as CardObject3D.
   */
  private _getOwnerId(card: CardObject3D): string | null {
    return card.getOwnerId();
  }

  private _gatherGroup(
    hoveredCard: CardObject3D,
    ownerId: string,
    allTableCards: CardObject3D[]
  ): GroupCard[] {
    const result: GroupCard[] = [];
    const hx = hoveredCard.position.x;
    const hz = hoveredCard.position.z;

    for (const card of allTableCards) {
      if (card.isDisposed()) continue;
      if (card.isInHand()) continue;
      if (card.isInStack()) continue;

      const cardOwnerId = card.getOwnerId();
      if (cardOwnerId !== ownerId) continue;

      const dx = card.position.x - hx;
      const dz = card.position.z - hz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > GROUP_RADIUS) continue;

      result.push({
        card,
        baseline: {
          x: card.position.x,
          y: card.position.y,
          z: card.position.z,
          scaleX: card.scale.x,
          scaleY: card.scale.y,
          scaleZ: card.scale.z,
        },
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        targetScaleX: GROUP_SCALE,
        targetScaleY: GROUP_SCALE,
        targetScaleZ: GROUP_SCALE,
      });
    }
    return result;
  }

  private _computeTargets(
    group: GroupCard[],
    hoveredCard: CardObject3D,
    cardWidth: number
  ): void {
    const count = group.length;
    const spacing = cardWidth * SPREAD_MULTIPLIER;
    const totalWidth = spacing * (count - 1);
    const startX = hoveredCard.position.x - totalWidth / 2;
    const baseZ = hoveredCard.position.z;
    const baseY = hoveredCard.position.y;

    // Sort by current X so ordering is stable
    group.sort((a, b) => a.baseline.x - b.baseline.x);

    for (let i = 0; i < count; i++) {
      const entry = group[i]!;
      const isHovered = entry.card === hoveredCard;
      entry.targetX = startX + i * spacing;
      entry.targetY = baseY + (isHovered ? HOVER_LIFT_Y : 0);
      entry.targetZ = baseZ;
      entry.targetScaleX = GROUP_SCALE;
      entry.targetScaleY = GROUP_SCALE;
      entry.targetScaleZ = GROUP_SCALE;
    }
  }

  private _startAnimation(): void {
    this._stopAnimation();
    this._animStartTime = performance.now();
    this._tick();
  }

  private _stopAnimation(): void {
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  }

  private _tick(): void {
    const elapsed = performance.now() - this._animStartTime;
    const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);

    if (!this._activeGroup) {
      this._stopAnimation();
      return;
    }

    const tEased = t * t * (3 - 2 * t); // Smoothstep

    if (this._animatingIn) {
      for (const entry of this._activeGroup) {
        entry.card.position.x = lerp(entry.baseline.x, entry.targetX, tEased);
        entry.card.position.y = lerp(entry.baseline.y, entry.targetY, tEased);
        entry.card.position.z = lerp(entry.baseline.z, entry.targetZ, tEased);
        entry.card.scale.set(
          lerp(entry.baseline.scaleX, entry.targetScaleX, tEased),
          lerp(entry.baseline.scaleY, entry.targetScaleY, tEased),
          lerp(entry.baseline.scaleZ, entry.targetScaleZ, tEased)
        );
      }
    } else {
      // Collapsing back to baseline
      for (const entry of this._activeGroup) {
        entry.card.position.x = lerp(entry.targetX, entry.baseline.x, tEased);
        entry.card.position.y = lerp(entry.targetY, entry.baseline.y, tEased);
        entry.card.position.z = lerp(entry.targetZ, entry.baseline.z, tEased);
        entry.card.scale.set(
          lerp(entry.targetScaleX, entry.baseline.scaleX, tEased),
          lerp(entry.targetScaleY, entry.baseline.scaleY, tEased),
          lerp(entry.targetScaleZ, entry.baseline.scaleZ, tEased)
        );
      }
    }

    this._requestRender();

    if (t < 1) {
      this._animationId = requestAnimationFrame(() => this._tick());
    } else {
      this._animationId = null;
      if (this._animatingIn) {
        this._expanded = true;
      } else {
        // Snap to exact baseline
        for (const entry of this._activeGroup) {
          this._applyBaseline(entry);
        }
        this._activeGroup = null;
        this._expanded = false;
        this._requestRender();
      }
    }
  }

  private _applyBaseline(entry: GroupCard): void {
    entry.card.position.set(entry.baseline.x, entry.baseline.y, entry.baseline.z);
    entry.card.scale.set(entry.baseline.scaleX, entry.baseline.scaleY, entry.baseline.scaleZ);
  }
}
