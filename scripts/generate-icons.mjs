import fs from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crc]);
}

function png(size, paint) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = 1 + x * 4;
      row[i] = r;
      row[i + 1] = g;
      row[i + 2] = b;
      row[i + 3] = a;
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function circleIcon(size, { maskable = false } = {}) {
  return png(size, (x, y, s) => {
    const cx = s / 2;
    const cy = s / 2;
    const pad = maskable ? s * 0.1 : 0;
    const linen = [244, 239, 230, 255];
    const clay = [196, 106, 74, 255];
    const white = [255, 253, 248, 255];
    let color = linen;
    const dx = x - cx;
    const dy = y - cy;
    const rOuter = s / 2 - pad - s * 0.06;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= rOuter) color = clay;
    const micW = s * 0.09;
    const micH = s * 0.18;
    if (Math.abs(dx) < micW && dy > -micH && dy < micH * 0.35) color = white;
    if (dy > micH * 0.2 && dy < micH * 0.55 && Math.abs(dx) < s * 0.02) color = white;
    if (dy > micH * 0.5 && dy < micH * 0.58 && Math.abs(dx) < micW * 1.1) color = white;
    return color;
  });
}

fs.mkdirSync('public/icons', { recursive: true });
const sizes = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
for (const s of sizes) {
  fs.writeFileSync(`public/icons/icon-${s}.png`, circleIcon(s));
}
fs.writeFileSync('public/icons/maskable-192.png', circleIcon(192, { maskable: true }));
fs.writeFileSync('public/icons/maskable-512.png', circleIcon(512, { maskable: true }));
fs.writeFileSync('public/apple-touch-icon.png', circleIcon(180));
fs.writeFileSync('public/icon-192.png', circleIcon(192));
fs.writeFileSync('public/icon-512.png', circleIcon(512));
fs.writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f4efe6"/><circle cx="32" cy="32" r="18" fill="#c46a4a"/><rect x="28" y="20" width="8" height="16" rx="4" fill="#fffdf8"/><rect x="30" y="36" width="4" height="8" fill="#fffdf8"/><rect x="24" y="42" width="16" height="3" rx="1.5" fill="#fffdf8"/></svg>`,
);
console.log('Generated', sizes.length, 'icons + maskable + apple-touch');
