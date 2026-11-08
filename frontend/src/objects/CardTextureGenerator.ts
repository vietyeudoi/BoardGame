/**
 * CardTextureGenerator.ts — Procedural Canvas Texture Generation for 3D Cards
 * Creates and updates high-resolution front and back textures using HTML Canvas.
 * Supports canvas reuse to eliminate memory allocation churn.
 */
import * as THREE from 'three';
import { getCardFaceRules, RULE_FONT, RULE_PANEL } from './CardFaceRules';
import { getCardTitle } from './CardTypeHelper';
import { CARD_CONFIG } from './CardConfig';
import { FAN_CARD_ART, getExpansionCardArt } from '../utils/CardArt';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CardTextureGenerator');

export interface CardRenderContent {
  title?: string;
  description?: string;
  artwork?: string | HTMLCanvasElement | HTMLImageElement;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}


export class CardTextureGenerator {
  private static readonly _frontTextures = new Map<string, { texture: THREE.CanvasTexture; users: number }>();

  static acquireFrontTexture(key: string): THREE.CanvasTexture | null {
    const entry = this._frontTextures.get(key);
    if (entry) {
      entry.users++;
      return entry.texture;
    }
    const canvas = this.getOrCreateCanvas();
    if (!canvas) return null;
    this.drawFront(canvas, key ? { title: getCardTitle(key) } : undefined, key);
    const texture = this.createTextureFromCanvas(canvas);
    if (texture) this._frontTextures.set(key, { texture, users: 1 });
    return texture;
  }

  static releaseFrontTexture(key: string): void {
    const entry = this._frontTextures.get(key);
    if (!entry || --entry.users > 0) return;
    this._frontTextures.delete(key);
    entry.texture.dispose();
  }
  /**
   * Checks if the runtime environment supports HTML Canvas 2D context.
   * Gracefully returns false in headless or JSDOM environments.
   */
  static isCanvasSupported(): boolean {
    if (
      typeof document === 'undefined' ||
      typeof navigator === 'undefined' ||
      navigator.userAgent?.includes('jsdom')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Creates or resizes an HTMLCanvasElement with standard card resolution.
   */
  static getOrCreateCanvas(existingCanvas?: HTMLCanvasElement | null): HTMLCanvasElement | null {
    if (!CardTextureGenerator.isCanvasSupported()) return null;

    const width = CARD_CONFIG.TEXTURE_WIDTH;
    const height = CARD_CONFIG.TEXTURE_HEIGHT;

    if (existingCanvas) {
      if (existingCanvas.width !== width || existingCanvas.height !== height) {
        existingCanvas.width = width;
        existingCanvas.height = height;
      }
      return existingCanvas;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    } catch (e) {
      logger.warn('Failed to create canvas element', { error: String(e) });
      return null;
    }
  }

  /**
   * Generates or re-draws the card's front face on the provided canvas.
   */
  static drawFront(canvas: HTMLCanvasElement, content?: CardRenderContent, cardType?: string | null): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const bgColor = content?.backgroundColor ?? CARD_CONFIG.DEFAULT_BG_FRONT;
    const textColor = content?.textColor ?? CARD_CONFIG.DEFAULT_TEXT_COLOR;
    const art = cardType ? FAN_CARD_ART[cardType] : undefined;
    const expansion = getExpansionCardArt(cardType);
    const accentColor = content?.accentColor ?? art?.accent ?? expansion?.color ?? CARD_CONFIG.DEFAULT_ACCENT_COLOR;
    const title = content?.title ?? 'Card';
    const description = content?.description ?? '';
    const rules = getCardFaceRules(cardType);

    // 1. Base card background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // 2. Elegant inner border
    const pad = 24;
    ctx.lineWidth = 4;
    ctx.strokeStyle = accentColor;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d1d5db';
    ctx.strokeRect(pad + 6, pad + 6, w - (pad + 6) * 2, h - (pad + 6) * 2);

    // 3. Header title banner
    const bannerY = pad + 16;
    const bannerH = 58;
    ctx.fillStyle = accentColor;
    ctx.fillRect(pad + 12, bannerY, w - (pad + 12) * 2, bannerH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.toUpperCase(), w / 2, bannerY + bannerH / 2, w - pad * 4);

    // 4. Central artwork area
    const artX = pad + 16;
    const artY = bannerY + bannerH + 16;
    const artW = w - artX * 2;
    const artH = rules ? h * RULE_PANEL.top - artY - 12 : 340;

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(artX, artY, artW, artH);
    if (art) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = accentColor;
      ctx.fillRect(artX, artY, artW, artH);
      ctx.restore();
    }
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(artX, artY, artW, artH);

    // Draw artwork if provided as canvas or image
    if (content?.artwork && typeof content.artwork !== 'string') {
      try {
        ctx.drawImage(content.artwork, artX, artY, artW, artH);
      } catch {
        // Fallback to geometric icon
        CardTextureGenerator._drawDefaultArtIcon(ctx, artX, artY, artW, artH, accentColor);
      }
    } else if (expansion) {
      ctx.fillStyle = expansion.color;
      ctx.font = '700 34px Arial, sans-serif';
      ctx.fillText(expansion.name, w / 2, artY + artH * 0.42, artW - pad);
      ctx.font = '600 22px Arial, sans-serif';
      ctx.fillText(expansion.pack, w / 2, artY + artH * 0.68, artW - pad);
    } else if (art) {
      ctx.font = "140px Segoe UI Emoji, sans-serif";
      ctx.fillStyle = accentColor;
      ctx.fillText(art.icon, w / 2, artY + artH / 2);
    } else {
      CardTextureGenerator._drawDefaultArtIcon(ctx, artX, artY, artW, artH, accentColor);
    }


    if (rules) {
      const x = w * RULE_PANEL.left;
      const y = h * RULE_PANEL.top;
      const width = w * RULE_PANEL.width;
      const height = h * RULE_PANEL.height;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + rules.titleSize + 'px ' + RULE_FONT;
      let lineY = y + RULE_PANEL.padding + rules.titleSize * 0.575;
      const left = x + RULE_PANEL.padding;
      const availableWidth = width - RULE_PANEL.padding * 2;
      ctx.fillText(rules.title, left, lineY, availableWidth);
      lineY += rules.titleSize * 0.575 + RULE_PANEL.gap + rules.lineHeight / 2;
      ctx.fillStyle = '#f1f5f9';
      ctx.font = rules.bodySize + 'px ' + RULE_FONT;
      for (const line of rules.lines) {
        ctx.fillText(line, left, lineY, availableWidth);
        lineY += rules.lineHeight;
      }
      return;
    }

    // 5. Description text area
    const descY = artY + artH + 18;
    const descH = h - descY - pad - 16;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(artX, descY, artW, descH);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(artX, descY, artW, descH);

    if (description) {
      ctx.fillStyle = textColor;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      CardTextureGenerator._wrapText(ctx, description, w / 2, descY + 18, artW - 24, 28);
    }
  }

  /**
   * Generates or re-draws the card's back face on the provided canvas.
   * Produces a classic tabletop card back with geometric lattice and framing.
   */
  static drawBack(canvas: HTMLCanvasElement, customBg?: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const bg = customBg ?? CARD_CONFIG.DEFAULT_BG_BACK;

    // 1. Dark field
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 2. White outer border margin
    const borderPad = 20;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(borderPad, borderPad, w - borderPad * 2, h - borderPad * 2);

    // Gold accent framing
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.strokeRect(borderPad + 8, borderPad + 8, w - (borderPad + 8) * 2, h - (borderPad + 8) * 2);

    // 3. Geometric diamond lattice pattern
    ctx.save();
    ctx.beginPath();
    ctx.rect(borderPad + 14, borderPad + 14, w - (borderPad + 14) * 2, h - (borderPad + 14) * 2);
    ctx.clip();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
    ctx.lineWidth = 2;
    const step = 32;

    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }

    // 4. Central circular emblem
    const cx = w / 2;
    const cy = h / 2;
    const radius = 64;

    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2);
    ctx.stroke();

    // Emblem diamond inside
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 28);
    ctx.lineTo(cx + 28, cy);
    ctx.lineTo(cx, cy + 28);
    ctx.lineTo(cx - 28, cy);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private static _drawDefaultArtIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ): void {
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.fill();

    // Inner star
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy);
  }

  private static _wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split(' ');
    let line = '';
    let currY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, currY);
        line = words[n] + ' ';
        currY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, currY);
  }

  /**
   * Helper to build a fallback CanvasTexture or Texture when canvas is not available.
   */
  static createTextureFromCanvas(canvas: HTMLCanvasElement | null): THREE.CanvasTexture | null {
    if (!canvas) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }
}
