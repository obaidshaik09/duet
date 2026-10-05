/**
 * Copy Duet PWA icons into Android launcher + splash assets.
 * Run after `npm run icons` (also invoked from cap:sync).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(res)) {
  console.log('android/ not present yet — skip icon copy');
  process.exit(0);
}

const map = [
  ['public/icons/icon-48.png', 'mipmap-mdpi/ic_launcher.png'],
  ['public/icons/icon-48.png', 'mipmap-mdpi/ic_launcher_round.png'],
  ['public/icons/icon-72.png', 'mipmap-mdpi/ic_launcher_foreground.png'],
  ['public/icons/icon-72.png', 'mipmap-hdpi/ic_launcher.png'],
  ['public/icons/icon-72.png', 'mipmap-hdpi/ic_launcher_round.png'],
  ['public/icons/icon-96.png', 'mipmap-hdpi/ic_launcher_foreground.png'],
  ['public/icons/icon-96.png', 'mipmap-xhdpi/ic_launcher.png'],
  ['public/icons/icon-96.png', 'mipmap-xhdpi/ic_launcher_round.png'],
  ['public/icons/icon-144.png', 'mipmap-xhdpi/ic_launcher_foreground.png'],
  ['public/icons/icon-144.png', 'mipmap-xxhdpi/ic_launcher.png'],
  ['public/icons/icon-144.png', 'mipmap-xxhdpi/ic_launcher_round.png'],
  ['public/icons/icon-192.png', 'mipmap-xxhdpi/ic_launcher_foreground.png'],
  ['public/icons/icon-192.png', 'mipmap-xxxhdpi/ic_launcher.png'],
  ['public/icons/icon-192.png', 'mipmap-xxxhdpi/ic_launcher_round.png'],
  ['public/icons/icon-256.png', 'mipmap-xxxhdpi/ic_launcher_foreground.png'],
];

for (const [src, dest] of map) {
  const from = path.join(root, src);
  const to = path.join(res, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// Splash screens: warm linen + clay mark (reuse 512 icon as centered splash art)
const splashSrc = path.join(root, 'public/icons/icon-512.png');
const splashTargets = [
  'drawable/splash.png',
  'drawable-port-mdpi/splash.png',
  'drawable-port-hdpi/splash.png',
  'drawable-port-xhdpi/splash.png',
  'drawable-port-xxhdpi/splash.png',
  'drawable-port-xxxhdpi/splash.png',
  'drawable-land-mdpi/splash.png',
  'drawable-land-hdpi/splash.png',
  'drawable-land-xhdpi/splash.png',
  'drawable-land-xxhdpi/splash.png',
  'drawable-land-xxxhdpi/splash.png',
];
for (const rel of splashTargets) {
  const to = path.join(res, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(splashSrc, to);
}

const bg = path.join(res, 'values', 'ic_launcher_background.xml');
fs.writeFileSync(
  bg,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#F4EFE6</color>
</resources>
`,
);

console.log('Copied Duet icons into android/app/src/main/res');
