/**
 * Gives Duet a public HTTPS link (free Cloudflare quick tunnel, no account) so anyone can open it
 * on a phone or laptop while this computer is running.
 *   npm run share
 * Starts the Duet server too if it isn't already running. Press Ctrl+C to stop sharing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { Tunnel } from 'cloudflared';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5000);
const qrPath = path.join(root, 'docs', 'duet-link-qr.png');
const linkPath = path.join(root, 'docs', 'duet-link.txt');

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
  }
  return null;
}

let server = null;
if (await portInUse(PORT)) {
  console.log(`Duet server already running on port ${PORT}.`);
} else {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    console.log('Building the app first…');
    const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }
  console.log(`Starting the Duet server on port ${PORT}…`);
  server = spawn(process.execPath, ['server/index.js'], { cwd: root, stdio: 'inherit' });
  for (let i = 0; i < 50 && !(await portInUse(PORT)); i++) await new Promise((r) => setTimeout(r, 200));
}

console.log('Opening a public link…');
const tunnel = Tunnel.quick(`http://localhost:${PORT}`);

tunnel.once('url', async (url) => {
  const lan = lanAddress();
  fs.writeFileSync(linkPath, `${url}\n`);
  await QRCode.toFile(qrPath, url, { width: 600, margin: 2, color: { dark: '#2a2622', light: '#ffffff' } });
  const qrText = await QRCode.toString(url, { type: 'terminal', small: true });

  console.log(`
==============================================================
  Duet is live:  ${url}
==============================================================
  Works on any phone or laptop, voice and "Add to Home Screen" included.
  This computer:      http://localhost:${PORT}${lan ? `\n  Same Wi-Fi only:    http://${lan}:${PORT}  (no mic or install over plain http)` : ''}
  QR code saved to:   docs/duet-link-qr.png

${qrText}
  The link stays live while this window is open. Press Ctrl+C to stop.
  A new link is created each time you run "npm run share".
`);
});

tunnel.on('error', (err) => console.error('Tunnel error:', err.message));
tunnel.on('exit', (code) => {
  console.log(`Public link closed (code ${code}).`);
  server?.kill();
  process.exit(code ?? 0);
});

function stop() {
  console.log('\nStopping…');
  tunnel.stop();
  server?.kill();
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
