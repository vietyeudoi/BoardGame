import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';
import { CARD_CONFIG } from './CardConfig';

export const RULE_PANEL = { left: 0.078125, top: 0.51, width: 0.84375, height: 0.433, padding: 18, gap: 8 };
export const RULE_FONT = 'Arial, sans-serif';

interface RuleLayout {
  title: string;
  titleSize: number;
  lines: string[];
  bodySize: number;
  lineHeight: number;
}

const layouts = new Map<CardType, RuleLayout>();
let measureContext: CanvasRenderingContext2D | null | undefined;

function measure(text: string, size: number, bold = false): number {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' || typeof navigator === 'undefined' || navigator.userAgent.includes('jsdom')
      ? null : document.createElement('canvas').getContext('2d');
  }
  if (!measureContext) return text.length * size * 0.55;
  measureContext.font = (bold ? '700 ' : '') + size + 'px ' + RULE_FONT;
  return measureContext.measureText(text).width;
}

function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? line + ' ' + word : word;
    if (line && measure(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function getCardFaceRules(cardType?: string | null): RuleLayout | undefined {
  const definition = CARD_DEFINITIONS.get(cardType as CardType);
  if (!definition) return;
  const cached = layouts.get(definition.type);
  if (cached) return cached;
  const width = CARD_CONFIG.TEXTURE_WIDTH * RULE_PANEL.width - RULE_PANEL.padding * 2;
  let titleSize = 40;
  while (titleSize > 26 && measure(definition.name, titleSize, true) > width) titleSize--;
  const height = CARD_CONFIG.TEXTURE_HEIGHT * RULE_PANEL.height - RULE_PANEL.padding * 2
    - titleSize * 1.15 - RULE_PANEL.gap;
  let bodySize = 36;
  let lines = wrap(definition.description, bodySize, width);
  while (bodySize > 26 && lines.length * bodySize * 1.21 > height) {
    bodySize--;
    lines = wrap(definition.description, bodySize, width);
  }
  const result = { title: definition.name, titleSize, lines, bodySize, lineHeight: bodySize * 1.21 };
  layouts.set(definition.type, result);
  return result;
}
