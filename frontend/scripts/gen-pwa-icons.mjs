/**
 * Gera os PNGs de ícone do PWA a partir do public/arasaka-mark.svg.
 *
 * Roda: node scripts/gen-pwa-icons.mjs
 * Saída:
 *   public/icon-192.png
 *   public/icon-512.png
 *   public/icon-maskable-512.png
 *   public/apple-touch-icon.png  (180x180)
 *
 * Os PNGs sao referenciados pelo manifest.ts. SVG no manifest funciona
 * em Chrome/Firefox/Edge, mas Android (Samsung Internet/MIUI) ainda
 * exige PNG raster pra renderizar o icone na home screen.
 *
 * Re-rodar quando o SVG mudar.
 */

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'public', 'arasaka-mark.svg');
const PUBLIC = join(ROOT, 'public');

const BG = { r: 10, g: 10, b: 14 }; // combina com --bg-void

const svg = readFileSync(SRC);

async function renderStandard(size) {
  // Renderiza no tamanho `size` com fundo opaco — launchers Android e
  // Safari "Add to Home Screen" tratam transparencia mal.
  return sharp(svg, { density: Math.max(72, size) })
    .resize(size, size, { fit: 'contain', background: { ...BG, alpha: 1 } })
    .flatten({ background: { ...BG, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderMaskable(size, safeRatio = 0.7) {
  // Maskable PNG: o icone ocupa apenas o "safe zone" (70%) centralizado.
  // Android pode cortar ate 20% das bordas em mascaras circulares.
  const inner = Math.round(size * safeRatio);
  const inset = Math.round((size - inner) / 2);
  const glyph = await sharp(svg, { density: Math.max(72, inner) })
    .resize(inner, inner, { fit: 'contain', background: { ...BG, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...BG, alpha: 1 },
    },
  })
    .composite([{ input: glyph, top: inset, left: inset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const targets = [
    { name: 'icon-192.png', buf: await renderStandard(192) },
    { name: 'icon-512.png', buf: await renderStandard(512) },
    { name: 'icon-maskable-512.png', buf: await renderMaskable(512) },
    { name: 'apple-touch-icon.png', buf: await renderStandard(180) },
  ];

  for (const { name, buf } of targets) {
    const path = join(PUBLIC, name);
    await writeFile(path, buf);
    console.log(`  ✓ ${name} (${buf.length.toLocaleString()} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
