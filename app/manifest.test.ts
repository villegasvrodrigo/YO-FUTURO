import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import manifest from './manifest';

const root = path.resolve(__dirname, '..');

// Width and height straight from a PNG file's header.
function pngSize(file: string): { width: number; height: number } {
  const data = readFileSync(file);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('manifest', () => {
  const m = manifest();

  it('installs as "Yo Futuro", full screen, opening on Inicio, with the app colors', () => {
    expect(m).toMatchObject({
      name: 'Yo Futuro',
      short_name: 'Yo Futuro',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      background_color: '#12141c',
      theme_color: '#12141c',
      lang: 'es-MX',
    });
  });

  it('lists the 192 and 512 icons, normal and maskable, and every one exists at its size', () => {
    expect(m.icons).toHaveLength(4);
    for (const icon of m.icons ?? []) {
      const file = path.join(root, 'public', icon.src);
      const [w, h] = (icon.sizes ?? '').split('x').map(Number);

      expect(existsSync(file)).toBe(true);
      expect(pngSize(file)).toEqual({ width: w, height: h });
    }
    expect(m.icons?.filter((icon) => icon.purpose === 'maskable')).toHaveLength(2);
  });
});

describe('app icons', () => {
  it('the iPhone icon is 180 x 180 and the tab icon 192 x 192', () => {
    expect(pngSize(path.join(root, 'app/apple-icon.png'))).toEqual({ width: 180, height: 180 });
    expect(pngSize(path.join(root, 'app/icon.png'))).toEqual({ width: 192, height: 192 });
  });

  it("Next's default favicon is gone", () => {
    expect(existsSync(path.join(root, 'app/favicon.ico'))).toBe(false);
  });
});
