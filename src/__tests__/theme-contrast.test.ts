import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../styles/variables.css'), 'utf8');

function blockTokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector not found: ${selector}`);
  const end = css.indexOf('\n}', start);
  const body = css.slice(start, end);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

const light = blockTokens(':root');
const themes: Record<string, Record<string, string>> = {
  light,
  dark: { ...light, ...blockTokens("[data-theme='dark']") },
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5;

const pairings: Array<[text: string, background: string]> = [
  ['--color-error-text', '--color-error-light'],
  ['--color-warning-text', '--color-warning-light'],
  ['--color-info-text', '--color-info-light'],
  ['--color-success-text', '--color-success-light'],
  ['--color-error-text', '--color-bg-primary'],
  ['--color-error-text', '--color-bg-secondary'],
  ['--color-error-text', '--color-error-surface'],
  ['--color-warning-text', '--color-warning-surface'],
  ['--color-warning-light', '--color-warning-text'],
];

describe('theme status token contrast (WCAG AA)', () => {
  for (const [themeName, tokens] of Object.entries(themes)) {
    describe(`${themeName} theme`, () => {
      for (const [text, background] of pairings) {
        it(`${text} on ${background} is at least ${AA_TEXT}:1`, () => {
          expect(tokens[text], `${text} is defined`).toBeDefined();
          expect(tokens[background], `${background} is defined`).toBeDefined();
          expect(contrast(tokens[text], tokens[background])).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }

      it('error border is at least 3:1 on the error background', () => {
        expect(
          contrast(tokens['--color-error'], tokens['--color-error-light'])
        ).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
