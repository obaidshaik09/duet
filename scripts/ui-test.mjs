/**
 * Real-browser demo rehearsal using the locally installed Edge (or Chrome).
 *   npm start           (in one terminal)
 *   npm run test:ui     (in another)
 * Screenshots land in test-results/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.E2E_BASE || 'http://127.0.0.1:5000').replace(/\/$/, '');
const shots = path.join(root, 'test-results');
fs.mkdirSync(shots, { recursive: true });
const stamp = Date.now();

const browserPaths = [
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
];
const executablePath = browserPaths.find((p) => p && fs.existsSync(p));
if (!executablePath) {
  console.error('No Edge or Chrome found.');
  process.exit(1);
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message.split('\n')[0]}`);
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const fakeSpeech = `
  window.__fakeSpeechText = 'Changed a wet diaper.';
  class FakeRecognition {
    start() {
      setTimeout(() => {
        const alt = { transcript: window.__fakeSpeechText, confidence: 0.93 };
        const result = [alt];
        result.isFinal = true;
        this.onresult && this.onresult({ results: [result] });
        this.onend && this.onend();
      }, 400);
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
`;

async function noHorizontalScroll(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert(r.sw <= r.w + 1, `${label}: page is ${r.sw}px wide in a ${r.w}px window (sideways scrolling)`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

function trackErrors(page, label, sink) {
  page.on('pageerror', (err) => sink.push(`${label} pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (/fonts\.g|ERR_INTERNET_DISCONNECTED|Failed to load resource: net::ERR_FAILED/.test(t)) return;
    sink.push(`${label} console: ${t}`);
  });
}

console.log('Launching browser…');
const browser = await chromium.launch({ executablePath, headless: true, timeout: 60000 });
const errors = [];
let offlinePhase = false;

const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctxA.addInitScript(fakeSpeech);
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const a = await ctxA.newPage();
const b = await ctxB.newPage();
for (const p of [a, b]) {
  p.setDefaultTimeout(12000);
  p.setDefaultNavigationTimeout(20000);
}
trackErrors(a, 'phone', { push: (e) => { if (!offlinePhase) errors.push(e); } });
trackErrors(b, 'desktop', errors);

const A = { name: 'Alex', email: `ui-alex-${stamp}@demo.local`, password: 'password123' };
const B = { name: 'Sam', email: `ui-sam-${stamp}@demo.local`, password: 'password123' };
let invite = '';

console.log(`Browser: ${path.basename(executablePath)} · target ${BASE}\n`);

console.log('== Landing + layout');
for (const [page, label] of [[a, 'phone'], [b, 'desktop']]) {
  await check(`landing page renders without sideways scroll (${label})`, async () => {
    await page.goto(`${BASE}/#/`);
    await page.getByText('Duet').first().waitFor();
    await noHorizontalScroll(page, label);
    await shot(page, `01-landing-${label}`);
  });
  await check(`every primary button has a visible white label (${label})`, async () => {
    const bad = await page.$$eval('.btn-primary', (els) => els
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ text: el.innerText.trim(), color: getComputedStyle(el).color }))
      .filter((x) => !x.text || x.color !== 'rgb(255, 255, 255)'));
    assert(bad.length === 0, JSON.stringify(bad));
  });
}
await check('landing page fits a tablet (768px) too', async () => {
  const t = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await t.goto(`${BASE}/#/`);
  await t.getByText('Duet').first().waitFor();
  await noHorizontalScroll(t, 'tablet');
  await t.close();
});
await check('desktop browser reports the site as installable (no manifest errors)', async () => {
  const cdp = await ctxB.newCDPSession(b);
  const r = await cdp.send('Page.getInstallabilityErrors');
  // Automated contexts are always private windows; that is the only acceptable entry.
  const real = r.installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
  assert(real.length === 0, JSON.stringify(real));
});

console.log('\n== Signup + household (A on phone)');
await check('A signs up through the form', async () => {
  await a.goto(`${BASE}/#/signup`);
  await a.getByLabel('Your name').fill(A.name);
  await a.getByLabel('Email').fill(A.email);
  await a.getByLabel('Password').fill(A.password);
  await noHorizontalScroll(a, 'signup phone');
  await shot(a, '02-signup-phone');
  await a.getByRole('button', { name: 'Continue' }).click();
  await a.waitForURL(/#\/onboarding/);
});
await check('A creates a household and gets an invite code', async () => {
  await a.getByLabel(/Baby.s name/).fill('Nora');
  await a.getByLabel('Birth date').fill('2026-09-10');
  await a.locator('form').getByRole('button', { name: 'Create household' }).click();
  await a.locator('.invite-code').waitFor();
  invite = (await a.locator('.invite-code').innerText()).trim();
  assert(/^[A-F0-9]{6}$/.test(invite), `invite "${invite}"`);
  await shot(a, '03-invite-phone');
});
await check('A logs the first entry by typing during setup', async () => {
  await a.getByRole('button', { name: 'Continue' }).click();
  await a.getByRole('button', { name: 'Log first entry' }).click();
  await a.waitForURL(/#\/app/);
  await a.locator('.app-header').waitFor();
  await a.getByText('Nora').first().waitFor();
});

console.log('\n== B joins on desktop');
await check('B signs up and joins with the invite code', async () => {
  await b.goto(`${BASE}/#/signup`);
  await b.getByLabel('Your name').fill(B.name);
  await b.getByLabel('Email').fill(B.email);
  await b.getByLabel('Password').fill(B.password);
  await b.getByRole('button', { name: 'Continue' }).click();
  await b.waitForURL(/#\/onboarding/);
  await b.getByRole('button', { name: 'I have an invite code' }).click();
  await b.getByLabel('Invite code').fill(invite);
  await b.locator('form').getByRole('button', { name: 'Join household' }).click();
  await b.getByRole('button', { name: 'Skip' }).click();
  await b.waitForURL(/#\/app/);
});
await check("B sees A's first entry on Today", async () => {
  await b.getByRole('button', { name: 'Today' }).click();
  await b.getByText('Bottle, 3 oz').first().waitFor({ timeout: 5000 });
  await noHorizontalScroll(b, 'today desktop');
  await shot(b, '04-today-desktop');
});

console.log('\n== Voice + text logging with live sync');
await check('A logs by voice (mic button → transcript → logged)', async () => {
  await noHorizontalScroll(a, 'listen phone');
  await a.getByRole('button', { name: 'Start talking' }).click();
  await a.locator('.reply').filter({ hasText: /wet diaper/i }).waitFor({ timeout: 6000 });
  await a.locator('.transcript').filter({ hasText: 'Changed a wet diaper.' }).waitFor();
  await shot(a, '05-voice-logged-phone');
});
await check('B sees the voice entry live, no refresh', async () => {
  await b.locator('.event').filter({ hasText: 'Wet diaper' }).first().waitFor({ timeout: 8000 });
});
await check('A logs by typing; nap timer appears', async () => {
  await a.getByPlaceholder("Or type if you can't talk right now").fill("She's down for a nap.");
  await a.getByRole('button', { name: 'Send' }).click();
  await a.locator('.reply').filter({ hasText: /nap/i }).waitFor({ timeout: 6000 });
  await a.locator('.nap-banner').filter({ hasText: 'Nap in progress' }).waitFor({ timeout: 4000 });
});
await check('B sees the nap live', async () => {
  await b.locator('.event').filter({ hasText: 'Nap started' }).first().waitFor({ timeout: 8000 });
});
await check('"She woke up" button ends the nap', async () => {
  await a.getByRole('button', { name: 'She woke up' }).click();
  await a.locator('.reply').filter({ hasText: /wake-up/i }).waitFor({ timeout: 6000 });
  await a.locator('.nap-banner').waitFor({ state: 'detached', timeout: 4000 });
});
await check('quick-suggestion chip "Last feed?" answers', async () => {
  await a.getByRole('button', { name: 'Last feed?' }).click();
  await a.locator('.reply').filter({ hasText: /Last feed was/i }).waitFor({ timeout: 6000 });
});
await check('medical question gets a refusal in the UI', async () => {
  await a.getByPlaceholder("Or type if you can't talk right now").fill('Should I give her Tylenol for a fever?');
  await a.getByRole('button', { name: 'Send' }).click();
  await a.locator('.reply').filter({ hasText: /medical advice/i }).waitFor({ timeout: 6000 });
});

console.log('\n== Edit + delete with live sync');
await check('B edits the bottle (amount + note) in the timeline', async () => {
  const row = b.locator('.event').filter({ hasText: 'Bottle, 3 oz' }).first();
  await row.getByRole('button', { name: 'Edit' }).click();
  await b.getByLabel('Amount (ml)').fill('120');
  await b.getByLabel('Notes').fill('edited in UI');
  await b.getByRole('button', { name: 'Save' }).click();
  await b.locator('.event').filter({ hasText: 'Bottle, 4 oz' }).filter({ hasText: 'edited in UI' }).waitFor({ timeout: 5000 });
});
await check('A sees the edit live on Today', async () => {
  await a.getByRole('button', { name: 'Today' }).click();
  await a.locator('.event').filter({ hasText: 'Bottle, 4 oz' }).filter({ hasText: 'edited in UI' }).waitFor({ timeout: 8000 });
  await noHorizontalScroll(a, 'today phone');
  await shot(a, '06-today-phone');
});
await check('B deletes the diaper; it disappears for A', async () => {
  b.once('dialog', (d) => d.accept());
  await b.locator('.event').filter({ hasText: 'Wet diaper' }).first().getByRole('button', { name: 'Delete' }).click();
  await a.locator('.event').filter({ hasText: 'Wet diaper' }).first().waitFor({ state: 'detached', timeout: 8000 });
});

console.log('\n== Summary + settings screens');
for (const [page, label] of [[a, 'phone'], [b, 'desktop']]) {
  await check(`summary works and fits (${label})`, async () => {
    await page.getByRole('button', { name: 'Summary' }).click();
    await page.getByRole('button', { name: "Make today's note" }).click();
    await page.locator('.summary-card').filter({ hasText: 'Feeds: 1' }).waitFor({ timeout: 6000 });
    await noHorizontalScroll(page, `summary ${label}`);
    await shot(page, `07-summary-${label}`);
  });
  await check(`settings screen fits (${label})`, async () => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByText(invite).first().waitFor({ timeout: 4000 }).catch(() => {});
    await noHorizontalScroll(page, `settings ${label}`);
    await shot(page, `08-settings-${label}`);
  });
}

console.log('\n== Offline (installed-app behavior)');
await check('service worker takes control of the page', async () => {
  await a.getByRole('button', { name: 'Listen' }).click();
  await a.evaluate(() => navigator.serviceWorker.ready);
  if (!(await a.evaluate(() => !!navigator.serviceWorker.controller))) await a.reload();
  await a.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
});
await check('entry typed while offline is queued', async () => {
  offlinePhase = true;
  await a.getByRole('button', { name: 'Listen' }).click().catch(() => {});
  await ctxA.setOffline(true);
  await a.getByPlaceholder("Or type if you can't talk right now").fill('Changed a dirty diaper.');
  await a.getByRole('button', { name: 'Send' }).click();
  await a.getByText(/Saved offline/).waitFor({ timeout: 6000 });
});
await check('reopening the app offline shows the app (not blank) and stays signed in', async () => {
  await a.reload();
  await a.waitForTimeout(1500);
  const text = await a.locator('#root').innerText();
  assert(text.trim().length > 20, `root text: "${text}"`);
  assert(!/#\/login/.test(a.url()), `got signed out: ${a.url()}`);
  assert(/offline/i.test(text), `no offline message: "${text.slice(0, 120)}"`);
  await shot(a, '09-offline-phone');
});
await check('back online: app reloads itself and the queued entry syncs to B', async () => {
  await ctxA.setOffline(false);
  offlinePhase = false;
  await a.locator('.app-header').waitFor({ timeout: 10000 });
  await b.getByRole('button', { name: 'Today' }).click();
  await b.locator('.event').filter({ hasText: 'Dirty diaper' }).first().waitFor({ timeout: 10000 });
});

console.log('\n== Session');
await check('signed-in session survives a normal reload', async () => {
  await b.reload();
  await b.locator('.app-header').waitFor({ timeout: 8000 });
  assert(/#\/app/.test(b.url()), b.url());
});
await check('no JavaScript errors during the run', async () => {
  assert(errors.length === 0, errors.slice(0, 3).join(' | '));
});

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed · screenshots in test-results/`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
