// Gera os PNGs de ícone do PWA a partir do SVG fonte.
// Uso: npm run icons   (requer a devDependency `sharp`)
//
// Saídas em src/icons/:
//   icon-192.png, icon-512.png          → ícones "any" (transparentes)
//   icon-maskable-512.png               → Android adaptive (safe zone ~78%, fundo sólido)
//   apple-touch-icon.png (180)          → iOS (fundo sólido, sem transparência)

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(here, '..', 'src', 'icons');
const svgPath = path.join(iconsDir, 'weight-chart-icon.svg');

/** Fundo igual ao miolo do ícone — a moldura escura "funde" com o canvas. */
const DARK = '#18181b';
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const svg = await readFile(svgPath);

const render = (size) =>
    sharp(svg, { density: 600 }).resize(size, size, { fit: 'contain', background: transparent });

async function any(size, out) {
    await render(size).png().toFile(path.join(iconsDir, out));
}

async function flatten(size, out, bg = DARK) {
    await render(size).flatten({ background: bg }).png().toFile(path.join(iconsDir, out));
}

async function maskable(size, out, bg = DARK, scale = 0.78) {
    const inner = Math.round(size * scale);
    const iconBuf = await render(inner).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
        .composite([{ input: iconBuf, gravity: 'center' }])
        .png()
        .toFile(path.join(iconsDir, out));
}

await any(192, 'icon-192.png');
await any(512, 'icon-512.png');
await maskable(512, 'icon-maskable-512.png');
await flatten(180, 'apple-touch-icon.png');

console.log('Ícones PNG gerados em src/icons/.');
