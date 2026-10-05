/**
 * Builds docs/Duet-Class-Presentation.pptx from the latest screenshots and test totals.
 *   npm run slides
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PptxGenJS from 'pptxgenjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'docs', 'screenshots');
const out = path.join(root, 'docs', 'Duet-Class-Presentation.pptx');

const C = {
  linen: 'F4EFE6',
  paper: 'FFFDF8',
  ink: '2A2622',
  muted: '6F675E',
  clay: 'C46A4A',
  claySoft: 'F8E6DE',
  sage: '4F6F5C',
  sageSoft: 'E4EEE7',
  line: 'E6DCCD',
};
const HEAD = 'Georgia';
const BODY = 'Segoe UI';
const W = 13.333;

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = 'Duet — voice-first household baby log';
pptx.subject = 'AI Integration Class project presentation';
pptx.company = 'AI Integration Class';

const titleStyle = { fontFace: HEAD, fontSize: 32, bold: true, color: C.ink, align: 'left', valign: 'middle', margin: 0 };

// Real master layouts so every slide has a true title (outline view, navigation, accessibility)
// and PowerPoint-managed slide numbers.
pptx.defineSlideMaster({
  title: 'DUET_CONTENT',
  background: { color: C.linen },
  objects: [
    { text: { text: 'Duet · AI Integration Class', options: { x: 0.7, y: 7.0, w: 5, h: 0.3, fontFace: BODY, fontSize: 10, color: C.muted } } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 0.72, w: 11.9, h: 0.85, ...titleStyle }, text: '' } },
  ],
  slideNumber: { x: W - 1.2, y: 7.0, w: 0.5, h: 0.3, fontFace: BODY, fontSize: 10, color: C.muted, align: 'right' },
});
pptx.defineSlideMaster({
  title: 'DUET_TITLE',
  background: { color: C.linen },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.93, y: 2.65, w: 7, h: 1.3, fontFace: HEAD, fontSize: 72, bold: true, color: C.ink, align: 'left', margin: 0 }, text: '' } },
  ],
});
pptx.defineSlideMaster({
  title: 'DUET_END',
  background: { color: C.ink },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0, y: 2.9, w: W, h: 1.2, fontFace: HEAD, fontSize: 54, bold: true, color: C.paper, align: 'center', margin: 0 }, text: '' } },
  ],
});

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/**
 * Place an image inside a box, keeping its proportions.
 * crop: fractions of the source image { l, t, w, h }; maxRatio crops tall full-page shots from the top.
 */
function image(slide, name, box, { maxRatio, crop } = {}) {
  const file = path.join(shotsDir, name);
  const { w, h } = pngSize(file);
  let c = crop || { l: 0, t: 0, w: 1, h: 1 };
  if (!crop && maxRatio && h / w > maxRatio) c = { l: 0, t: 0, w: 1, h: (w * maxRatio) / h };
  const rw = w * c.w;
  const rh = h * c.h;
  const scale = Math.min(box.w / rw, box.h / rh);
  const dw = rw * scale;
  const dh = rh * scale;
  const x = box.x + (box.w - dw) / 2;
  const y = box.y + (box.h - dh) / 2;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x - 0.06, y: y - 0.06, w: dw + 0.12, h: dh + 0.12,
    fill: { color: C.paper }, line: { color: C.line, width: 1 }, rectRadius: 0.12,
    shadow: { type: 'outer', color: '000000', opacity: 0.12, blur: 8, offset: 3, angle: 90 },
  });
  const opts = { path: file, x, y, w: w * scale, h: h * scale };
  if (c.w < 1 || c.h < 1) {
    opts.sizing = { type: 'crop', x: c.l * w * scale, y: c.t * h * scale, w: dw, h: dh };
  }
  slide.addImage(opts);
  return { x, y, w: dw, h: dh };
}

let pageNo = 0;
function base(kicker, title, notes) {
  pageNo += 1;
  const s = pptx.addSlide({ masterName: 'DUET_CONTENT' });
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: 0.7, y: 0.4, w: 9, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: C.clay, charSpacing: 2,
    });
  }
  if (title) s.addText(title, { placeholder: 'title', ...titleStyle });
  if (notes) s.addNotes(notes);
  return s;
}

function card(s, x, y, w, h, fill = C.paper) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, fill: { color: fill }, line: { color: C.line, width: 1 }, rectRadius: 0.15,
  });
}

function cardText(s, x, y, w, h, title, body, { fill, titleColor = C.ink, size = 15 } = {}) {
  card(s, x, y, w, h, fill);
  s.addText([
    { text: title, options: { bold: true, fontSize: size + 3, color: titleColor, breakLine: true, fontFace: BODY } },
    { text: ' ', options: { fontSize: 6, breakLine: true } },
    { text: body, options: { fontSize: size, color: C.muted, fontFace: BODY } },
  ], { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: h - 0.4, valign: 'top' });
}

function arrow(s, x1, y1, x2, y2, color = C.muted) {
  s.addShape(pptx.ShapeType.line, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color, width: 2, endArrowType: 'triangle' },
  });
}

function box(s, x, y, w, h, text, { fill = C.paper, color = C.ink, size = 14, bold = true, sub } = {}) {
  card(s, x, y, w, h, fill);
  const runs = [{ text, options: { bold, fontSize: size, color, breakLine: Boolean(sub) } }];
  if (sub) runs.push({ text: sub, options: { fontSize: size - 3, color: C.muted } });
  s.addText(runs, { x, y, w, h, align: 'center', valign: 'middle', fontFace: BODY });
}

// 1 — Title
{
  pageNo += 1;
  const s = pptx.addSlide({ masterName: 'DUET_TITLE' });
  s.addImage({ path: path.join(root, 'public', 'icons', 'icon-512.png'), x: 0.9, y: 1.25, w: 1.3, h: 1.3 });
  s.addText('Duet', { placeholder: 'title', fontFace: HEAD, fontSize: 72, bold: true, color: C.ink, align: 'left', margin: 0 });
  s.addText('A voice-first baby log for the whole household', {
    x: 0.9, y: 3.9, w: 7, h: 0.9, fontFace: HEAD, fontSize: 26, color: C.ink,
  });
  s.addText('Talk. Log. Stay in sync.', {
    x: 0.9, y: 4.85, w: 7, h: 0.5, fontFace: BODY, fontSize: 18, color: C.clay, bold: true,
  });
  s.addText('AI Integration Class · Project presentation', {
    x: 0.9, y: 6.2, w: 7, h: 0.4, fontFace: BODY, fontSize: 14, color: C.muted,
  });
  image(s, '05-voice-logged-phone.png', { x: 8.6, y: 0.6, w: 3.6, h: 6.3 });
  s.addNotes('Introduce Duet: a baby log you talk to. Built for the first 12 weeks, when several people share the care and everyone is exhausted. This deck covers what it does, how it is built, and how it was tested — 115 automated checks, all passing.');
}

// 2 — Problem
{
  const s = base('The problem', 'The first 12 weeks are a blur',
    'Three pain points. Hands are full, so tapping through forms is hard. Care is shared, so information is scattered across texts. Existing trackers are built around dashboards and charts, not quick capture.');
  const cards = [
    ['Hands are full', 'Feeding, rocking, burping — there is rarely a free hand to tap through a form at 3 AM.'],
    ['Care is shared', 'Parents, grandparents and night nurses each hold part of the picture. "Did she eat yet?" lives in group texts.'],
    ['Trackers are form-heavy', 'Popular apps are built around charts and dashboards. Logging one bottle takes several taps.'],
  ];
  cards.forEach(([t, b], i) => cardText(s, 0.7 + i * 4.05, 1.95, 3.8, 2.6, t, b, { size: 17 }));
  card(s, 0.7, 4.95, 11.9, 1.4, C.sageSoft);
  s.addText([
    { text: 'Goal  ', options: { bold: true, color: C.clay } },
    { text: 'Logging should take one sentence, and everyone should see it instantly.', options: { bold: true, color: C.sage } },
  ], { x: 1.0, y: 4.95, w: 11.3, h: 1.4, fontFace: BODY, fontSize: 21, valign: 'middle' });
}

// 3 — Solution
{
  const s = base('The solution', 'Talk. Log. Stay in sync.',
    'Walk through the example: you say a normal sentence, Duet logs it and replies in one line. Everyone in the household sees it live. It answers questions from the shared log, and refuses medical questions — it is a log, not a doctor. And it is free.');
  const items = [
    ['Speak naturally', '"Just gave her a 3 ounce bottle" becomes a logged feed.'],
    ['Everyone sees it live', 'Every caregiver\'s screen updates within a second.'],
    ['Ask the log', '"When did she last eat?" is answered from today\'s entries.'],
    ['Never gives medical advice', 'Symptom or medicine questions are redirected to the pediatrician.'],
    ['Free', 'No paywall, no credit card. Invite as many caregivers as you need.'],
  ];
  items.forEach(([t, b], i) => {
    const y = 1.85 + i * 0.95;
    s.addShape(pptx.ShapeType.ellipse, { x: 0.75, y: y + 0.12, w: 0.32, h: 0.32, fill: { color: C.clay }, line: { color: C.clay } });
    s.addText([
      { text: `${t}  `, options: { bold: true, color: C.ink } },
      { text: b, options: { color: C.muted } },
    ], { x: 1.25, y, w: 6.3, h: 0.6, fontFace: BODY, fontSize: 15, valign: 'middle' });
  });
  card(s, 8.0, 1.9, 4.6, 4.5);
  s.addText('Example', { x: 8.3, y: 2.05, w: 4, h: 0.4, fontFace: BODY, fontSize: 12, bold: true, color: C.clay });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.3, y: 2.6, w: 4.0, h: 0.9, fill: { color: C.linen }, line: { color: C.line }, rectRadius: 0.15 });
  s.addText('You say: "Just gave her a 3 ounce bottle."', { x: 8.45, y: 2.6, w: 3.7, h: 0.9, fontFace: BODY, fontSize: 14, color: C.ink, valign: 'middle' });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.3, y: 3.7, w: 4.0, h: 0.8, fill: { color: C.sageSoft }, line: { color: C.sageSoft }, rectRadius: 0.15 });
  s.addText('Duet: "Logged bottle, 3 oz."', { x: 8.45, y: 3.7, w: 3.7, h: 0.8, fontFace: BODY, fontSize: 14, color: C.sage, bold: true, valign: 'middle' });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.3, y: 4.7, w: 4.0, h: 1.4, fill: { color: C.claySoft }, line: { color: C.claySoft }, rectRadius: 0.15 });
  s.addText('Partner\'s phone updates instantly: "Bottle, 3 oz — Alex · just now"', { x: 8.45, y: 4.7, w: 3.7, h: 1.4, fontFace: BODY, fontSize: 14, color: C.ink, valign: 'middle' });
}

// 4 — Demo screens
{
  const s = base('What it looks like', 'One household, two screens, live',
    'Left is Alex on a phone, logging by voice. Right is Sam on a laptop — the entry shows up on the Today timeline without refreshing. Both screenshots come straight from the automated browser test.');
  image(s, '05-voice-logged-phone.png', { x: 1.2, y: 1.75, w: 4.2, h: 4.7 });
  image(s, '04-today-desktop.png', { x: 6.6, y: 1.75, w: 5.6, h: 4.7 }, { crop: { l: 0.2, t: 0, w: 0.6, h: 1 } });
  s.addText('Alex on a phone logs by voice', { x: 1.2, y: 6.55, w: 4.2, h: 0.35, fontFace: BODY, fontSize: 14, bold: true, color: C.ink, align: 'center' });
  s.addText('Sam on a laptop sees the shared timeline', { x: 6.6, y: 6.55, w: 5.6, h: 0.35, fontFace: BODY, fontSize: 14, bold: true, color: C.ink, align: 'center' });
}

// 5 — Phone + desktop
{
  const s = base('Responsive', 'Works on a phone and on a full desktop screen',
    'It is a normal website too. The landing page uses the full desktop width; the app itself stays in a comfortable phone-width column on a laptop. Tests confirm nothing scrolls sideways at phone, tablet or desktop sizes.');
  image(s, '01-landing-desktop.png', { x: 0.7, y: 1.75, w: 7.6, h: 4.6 });
  image(s, '06-today-phone.png', { x: 8.9, y: 1.75, w: 3.6, h: 4.6 }, { maxRatio: 2.0 });
  s.addText('Desktop: full-width landing page', { x: 0.7, y: 6.5, w: 7.6, h: 0.35, fontFace: BODY, fontSize: 14, bold: true, color: C.ink, align: 'center' });
  s.addText('Phone: Today timeline', { x: 8.9, y: 6.5, w: 3.6, h: 0.35, fontFace: BODY, fontSize: 14, bold: true, color: C.ink, align: 'center' });
}

// 6 — Architecture
{
  const s = base('How it is built', 'Architecture',
    'One React web app runs everywhere. It talks to a small Express server with a SQLite database. Each sentence goes to the parser — a built-in rule-based parser, with an optional Claude AI model if an API key is set. When anything changes, the server pushes a live update to every caregiver using Server-Sent Events.');
  box(s, 0.7, 1.9, 2.7, 1.1, 'Browser', { sub: 'phone or desktop' });
  box(s, 0.7, 3.2, 2.7, 1.1, 'Installed web app', { sub: 'Add to Home Screen' });
  box(s, 0.7, 4.5, 2.7, 1.1, 'Android app', { sub: 'Capacitor wrapper' });
  box(s, 4.3, 3.0, 2.8, 1.5, 'React app', { fill: C.claySoft, sub: 'one codebase (Vite)' });
  box(s, 8.0, 3.0, 2.4, 1.5, 'Express API', { fill: C.sageSoft, sub: 'Node.js server' });
  box(s, 11.1, 3.0, 1.6, 1.5, 'SQLite', { sub: 'database' });
  box(s, 7.6, 5.2, 3.2, 1.2, 'Sentence parser', { sub: 'local rules · optional Claude AI' });
  box(s, 7.6, 1.6, 3.2, 1.0, 'Live sync', { sub: 'Server-Sent Events' });
  arrow(s, 3.4, 2.45, 4.3, 3.4);
  arrow(s, 3.4, 3.75, 4.3, 3.75);
  arrow(s, 3.4, 5.05, 4.3, 4.1);
  arrow(s, 7.1, 3.75, 8.0, 3.75);
  arrow(s, 10.4, 3.75, 11.1, 3.75);
  arrow(s, 9.2, 4.5, 9.2, 5.2);
  arrow(s, 9.2, 3.0, 9.2, 2.6);
  arrow(s, 7.6, 2.1, 5.7, 3.0, C.clay);
  s.addText('pushes updates to every caregiver', { x: 4.3, y: 2.0, w: 3.0, h: 0.4, fontFace: BODY, fontSize: 11, color: C.clay, italic: true });
}

// 7 — Three ways to run
{
  const s = base('One codebase', 'Three ways to run the same app',
    'No forked code. The same build runs as a website, as an installable app, and inside the Android app. For Android the key detail is networking: the emulator cannot reach "localhost" on the laptop, so the app uses the special address 10.0.2.2.');
  cardText(s, 0.7, 1.9, 3.8, 3.75, 'Website',
    'Opens in any browser.\n\nPhone layout on small screens, full-width landing page on desktop.\n\nSame accounts and live sync everywhere.', { size: 14 });
  cardText(s, 4.75, 1.9, 3.8, 3.75, 'Installable web app',
    'Web app manifest with name, colors and "standalone" display.\n\nIcons from 48 to 512 px, plus a maskable icon.\n\nService worker stores the app for offline use.\n\nSeparate iPhone tags and home-screen icon.', { size: 14, fill: C.claySoft });
  cardText(s, 8.8, 1.9, 3.8, 3.75, 'Android app',
    'Capacitor wraps the same build.\n\nApp ID com.duet.household, Duet icon and splash.\n\nEmulator reaches the laptop at 10.0.2.2:5000.\n\nMicrophone permission for voice.', { size: 14, fill: C.sageSoft });
  s.addText([
    { text: 'No forked code: ', options: { bold: true, color: C.clay } },
    { text: 'one command (npm run cap:sync) copies the latest web build into the Android project.', options: { color: C.ink } },
  ], { x: 0.7, y: 5.95, w: 11.9, h: 0.5, fontFace: BODY, fontSize: 16 });
}

// 8 — Voice
{
  const s = base('Voice', 'Voice works in the browser and in the Android app',
    'In Chrome, voice uses the built-in Web Speech API. Inside the Android app\'s web view that API is unreliable, so on Android Duet switches to a native speech-recognition plugin. Both paths produce the same text, which goes through the same parser — so a spoken entry behaves exactly like a typed one.');
  box(s, 0.7, 2.0, 3.2, 1.2, 'In the browser', { sub: 'Web Speech API' });
  box(s, 0.7, 3.9, 3.2, 1.2, 'In the Android app', { sub: 'native speech plugin' });
  box(s, 0.7, 5.6, 3.2, 0.9, 'Or just type', { size: 13 });
  box(s, 4.9, 3.3, 2.5, 1.3, 'Transcript', { fill: C.claySoft, sub: '"um, she had 4 ounces"' });
  box(s, 8.3, 3.3, 2.0, 1.3, 'Parser', { fill: C.sageSoft, sub: 'feed · 120 ml' });
  box(s, 11.0, 3.3, 1.7, 1.3, 'Logged', { sub: '+ live sync' });
  arrow(s, 3.9, 2.6, 4.9, 3.7);
  arrow(s, 3.9, 4.5, 4.9, 4.0);
  arrow(s, 3.9, 6.05, 4.9, 4.4);
  arrow(s, 7.4, 3.95, 8.3, 3.95);
  arrow(s, 10.3, 3.95, 11.0, 3.95);
  card(s, 4.9, 5.1, 7.8, 1.4, C.paper);
  s.addText([
    { text: 'Why a native plugin on Android?', options: { bold: true, color: C.ink, breakLine: true } },
    { text: 'The browser speech API is unreliable inside the Android app\'s built-in web view. On Android: tap the mic to start, tap again when finished.', options: { color: C.muted } },
  ], { x: 5.15, y: 5.1, w: 7.3, h: 1.4, fontFace: BODY, fontSize: 14, valign: 'middle' });
}

// 9 — Testing strategy
{
  const s = base('Testing', 'Three layers of automated tests',
    'Testing goes from small to big. Unit tests check the sentence parser alone. End-to-end tests act as two caregivers plus an outsider and use every server feature. Browser tests click through the real app in Edge on a phone-sized and a desktop-sized window at the same time.');
  const layers = [
    ['Browser tests', '31', 'Does the real app work on phone and desktop, live, even offline?', C.sageSoft, 6.4],
    ['End-to-end tests', '73', 'Does every feature work for two caregivers, and keep outsiders out?', C.claySoft, 7.6],
    ['Unit tests', '11', 'Does Duet understand the sentence?', C.paper, 8.8],
  ];
  layers.forEach(([name, n, q, fill, w], i) => {
    const x = 0.7 + (8.8 - w) / 2;
    const y = 1.9 + i * 1.5;
    card(s, x, y, w, 1.3, fill);
    s.addText(n, { x: x + 0.2, y, w: 1.3, h: 1.3, fontFace: HEAD, fontSize: 36, bold: true, color: C.clay, valign: 'middle' });
    s.addText([
      { text: name, options: { bold: true, fontSize: 16, color: C.ink, breakLine: true } },
      { text: q, options: { fontSize: 13, color: C.muted } },
    ], { x: x + 1.5, y, w: w - 1.7, h: 1.3, fontFace: BODY, valign: 'middle' });
  });
  card(s, 10.0, 1.9, 2.6, 4.3, C.ink);
  s.addText([
    { text: '115', options: { fontFace: HEAD, fontSize: 60, bold: true, color: C.paper, breakLine: true } },
    { text: 'automated checks', options: { fontFace: BODY, fontSize: 16, color: C.linen } },
  ], { x: 10.0, y: 1.9, w: 2.6, h: 4.3, align: 'center', valign: 'middle' });
}

// 10 — Two-caregiver scenario
{
  const s = base('Testing', 'What the browser test actually does',
    'This is the scenario the browser test plays out, with two separate browser sessions. Alex is on a phone-sized screen, Sam on a desktop. Every step is checked automatically, including that changes show up on the other screen without refreshing.');
  const steps = [
    ['1', 'Alex signs up', 'phone'],
    ['2', 'Creates household, gets invite code', 'phone'],
    ['3', 'Sam joins with the code', 'desktop'],
    ['4', 'Alex logs by voice', 'phone'],
    ['5', 'Sam sees it live', 'desktop'],
    ['6', 'Sam edits and deletes', 'desktop'],
    ['7', 'Alex sees changes live', 'phone'],
    ['8', 'Alex goes offline, logs, reconnects', 'phone'],
  ];
  steps.forEach(([n, t, who], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 0.7 + col * 3.05;
    const y = 1.9 + row * 1.95;
    card(s, x, y, 2.8, 1.7, who === 'phone' ? C.claySoft : C.sageSoft);
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fill: { color: C.ink }, line: { color: C.ink } });
    s.addText(n, { x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.5, fontFace: BODY, fontSize: 14, bold: true, color: C.paper, align: 'center', valign: 'middle' });
    s.addText(who === 'phone' ? 'Alex · phone' : 'Sam · desktop', { x: x + 0.8, y: y + 0.2, w: 1.9, h: 0.5, fontFace: BODY, fontSize: 12, color: C.muted, valign: 'middle' });
    s.addText(t, { x: x + 0.2, y: y + 0.8, w: 2.4, h: 0.8, fontFace: BODY, fontSize: 16, bold: true, color: C.ink, valign: 'top' });
  });
  s.addText([
    { text: 'Every step is checked automatically, ', options: { bold: true, color: C.sage } },
    { text: 'including that the other person\'s screen updates without a refresh.', options: { color: C.ink } },
  ], { x: 0.7, y: 5.95, w: 11.9, h: 0.5, fontFace: BODY, fontSize: 16 });
}

// 11 — Results
{
  const s = base('Results', '115 of 115 checks passed',
    'Every area passed in the final run on October 1. The left column is the server-side and parser tests, the right column is what was clicked through in the real browser.');
  const head = (t) => ({ text: t, options: { bold: true, color: C.paper, fill: { color: C.ink } } });
  const row = (a, n) => [a, { text: String(n), options: { align: 'center' } }, { text: 'Pass', options: { color: C.sage, bold: true, align: 'center' } }];
  const opts = (x) => ({
    x, y: 1.75, w: 5.85, colW: [3.85, 1.0, 1.0], fontFace: BODY, fontSize: 12, color: C.ink,
    fill: { color: C.paper }, border: { type: 'solid', color: C.line, pt: 1 }, rowH: 0.36, valign: 'middle',
  });
  s.addTable([
    [head('Unit + end-to-end'), head('Checks'), head('Result')],
    row('Sentence understanding (unit)', 11),
    row('Accounts and sign-in', 10),
    row('Households and invites', 9),
    row('Logging by voice and text', 13),
    row('Edit and delete', 6),
    row('Summary, settings, export', 12),
    row('Android app reaching the server', 3),
    row('Installable web app files', 11),
    row('Android project setup', 8),
    row('Server health', 1),
  ], opts(0.7));
  s.addTable([
    [head('Real browser (Edge)'), head('Checks'), head('Result')],
    row('Layout and installability', 6),
    row('Signup and joining', 5),
    row('Voice and text with live sync', 7),
    row('Edit and delete with live sync', 3),
    row('Summary and settings screens', 4),
    row('Offline behavior', 4),
    row('Session and no JavaScript errors', 2),
  ], opts(6.8));
  card(s, 6.8, 5.0, 5.85, 1.35, C.sageSoft);
  s.addText([
    { text: '115 passed · 0 failed', options: { bold: true, fontSize: 22, color: C.sage, breakLine: true, fontFace: HEAD } },
    { text: '11 unit · 73 end-to-end · 31 browser', options: { fontSize: 13, color: C.muted } },
  ], { x: 6.8, y: 5.0, w: 5.85, h: 1.35, align: 'center', valign: 'middle', fontFace: BODY });
}

// 12 — Bugs found
{
  const s = base('Why test?', 'Testing found 4 real bugs, all fixed',
    'This is the value of testing. None of these showed up in normal clicking around. Each one is fixed, and each now has a test so it cannot come back unnoticed.');
  const bugs = [
    ['Removing a caregiver crashed the server', 'Failed for anyone who had logged an entry.', 'End-to-end test', 'Removal now revokes access but keeps their history; they can rejoin.'],
    ['"She had 4 ounces" wasn\'t logged', 'The parser knew "ounce" but not "ounces" or "drank".', 'End-to-end test', 'Added the missing words and 2 new unit tests.'],
    ['Opening the app offline signed you out', 'The failed account check erased the saved login.', 'Code review for the offline test', 'Stays signed in, shows "You\'re offline", reloads on reconnect.'],
    ['Header button had no visible label', 'Dark text on a dark button: a blank black bar.', 'Reviewing test screenshots', 'Fixed the color; a test now checks every main button.'],
  ];
  bugs.forEach(([t, cause, found, fix], i) => {
    const x = 0.7 + (i % 2) * 6.05;
    const y = 1.8 + Math.floor(i / 2) * 2.55;
    card(s, x, y, 5.8, 2.3);
    s.addText([
      { text: t, options: { bold: true, fontSize: 18, color: C.ink, breakLine: true } },
      { text: cause, options: { fontSize: 14, color: C.muted, breakLine: true } },
      { text: ' ', options: { fontSize: 8, breakLine: true } },
      { text: 'Found by: ', options: { bold: true, fontSize: 14, color: C.clay } },
      { text: found, options: { fontSize: 14, color: C.ink, breakLine: true } },
      { text: 'Fix: ', options: { bold: true, fontSize: 14, color: C.sage } },
      { text: fix, options: { fontSize: 14, color: C.ink } },
    ], { x: x + 0.25, y: y + 0.15, w: 5.3, h: 2.0, fontFace: BODY, valign: 'top' });
  });
}

// 13 — Offline
{
  const s = base('Offline', 'No signal? Duet still opens',
    'The service worker stores the app on the device. Opened with no connection, Duet shows a clear offline message instead of a blank page, keeps you signed in, and saves entries to send later. When the connection returns it reloads by itself and the saved entry reaches the other caregiver. All of this is checked by the browser test.');
  image(s, '09-offline-phone.png', { x: 0.7, y: 2.6, w: 3.5, h: 3.0 }, { crop: { l: 0.06, t: 0.38, w: 0.88, h: 0.24 } });
  s.addText('What you see with no connection', { x: 0.7, y: 5.45, w: 3.5, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: C.ink, align: 'center' });
  const steps = [
    ['Stored on the device', 'The service worker keeps the app shell, so it opens with no network.'],
    ['Clear message, still signed in', '"You\'re offline. Duet will load your household automatically when you reconnect."'],
    ['Entries are queued', 'Anything logged offline is saved on the phone.'],
    ['Syncs on reconnect', 'The app reloads itself and the queued entry reaches every caregiver.'],
  ];
  steps.forEach(([t, b], i) => cardText(s, 4.6, 1.8 + i * 1.25, 8.0, 1.1, t, b, { size: 13 }));
}

// 14 — Limits
{
  const s = base('Honest limits', 'What has not been tested yet',
    'Be upfront about these three. The Android project is configured and verified, but it has not been run in an emulator because Android Studio was not installed on the test machine. Real speech cannot be automated. And no iPhone was available.');
  const rows = [
    ['Running in the Android emulator', 'Android Studio not installed on the test computer', 'Install Android Studio, run npm run cap:sync then npm run cap:open, press Run'],
    ['Real spoken voice', 'Automated tests cannot use a microphone (a stand-in recognizer was used)', 'Open in Chrome, tap the mic, say "Just gave her a 3 ounce bottle"'],
    ['iPhone "Add to Home Screen"', 'No iPhone or Mac available', 'Safari → Share → Add to Home Screen'],
  ];
  const head = (t) => ({ text: t, options: { bold: true, color: C.paper, fill: { color: C.ink } } });
  s.addTable([
    [head('Not tested'), head('Why'), head('How to check it')],
    ...rows,
  ], {
    x: 0.7, y: 1.9, w: 11.9, colW: [3.2, 4.2, 4.5], fontFace: BODY, fontSize: 14, color: C.ink,
    fill: { color: C.paper }, border: { type: 'solid', color: C.line, pt: 1 }, rowH: [0.5, 1.0, 1.0, 1.0], valign: 'middle',
  });
  s.addText('Everything else, including the Android project\'s settings, is covered by the 115 automated checks.', {
    x: 0.7, y: 5.9, w: 11.9, h: 0.5, fontFace: BODY, fontSize: 15, color: C.sage, bold: true,
  });
}

// 15 — How to run
{
  const s = base('Try it', 'Run it and test it yourself',
    'Everything is free and runs locally. Start the server, then run the three test commands; each should end with 0 failed. The browser test saves fresh screenshots every time.');
  card(s, 0.7, 1.9, 5.8, 4.1, C.ink);
  s.addText([
    { text: '# start the app', options: { color: 'B8AE9F', breakLine: true } },
    { text: 'npm start', options: { color: C.paper, breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: '# run every test', options: { color: 'B8AE9F', breakLine: true } },
    { text: 'npm test', options: { color: C.paper, breakLine: true } },
    { text: 'npm run test:e2e', options: { color: C.paper, breakLine: true } },
    { text: 'npm run test:ui', options: { color: C.paper, breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: '# Android', options: { color: 'B8AE9F', breakLine: true } },
    { text: 'npm run cap:sync', options: { color: C.paper, breakLine: true } },
    { text: 'npm run cap:open', options: { color: C.paper } },
  ], { x: 1.0, y: 2.1, w: 5.3, h: 3.7, fontFace: 'Consolas', fontSize: 17, valign: 'middle' });
  cardText(s, 6.9, 1.9, 5.7, 1.9, 'Open the app', 'http://localhost:5000 in any browser.\nOn a phone: install it from the browser menu or Share sheet.', { size: 15 });
  cardText(s, 6.9, 4.1, 5.7, 1.9, 'Read the full report', 'docs/TEST_REPORT.md lists every check, the bugs found, and the raw test output.', { size: 15 });
}

// 16 — Thanks
{
  pageNo += 1;
  const s = pptx.addSlide({ masterName: 'DUET_END' });
  s.addShape(pptx.ShapeType.roundRect, {
    x: (W - 1.5) / 2, y: 1.2, w: 1.5, h: 1.5, fill: { color: C.linen }, line: { color: C.linen }, rectRadius: 0.3,
  });
  s.addImage({ path: path.join(root, 'public', 'icons', 'icon-512.png'), x: (W - 1.3) / 2, y: 1.3, w: 1.3, h: 1.3 });
  s.addText('Thank you', { placeholder: 'title', fontFace: HEAD, fontSize: 54, bold: true, color: C.paper, align: 'center', margin: 0 });
  s.addText('Questions? Happy to do a live demo.', { x: 0, y: 4.1, w: W, h: 0.6, fontFace: BODY, fontSize: 20, color: C.linen, align: 'center' });
  s.addText('115 automated checks · 4 bugs found and fixed · one codebase for web and Android', {
    x: 0, y: 5.3, w: W, h: 0.5, fontFace: BODY, fontSize: 14, color: 'B8AE9F', align: 'center',
  });
  s.addNotes('Offer a live demo: open the app on a phone and a laptop side by side, log by voice on one, and show it appear on the other.');
}

await pptx.writeFile({ fileName: out });
console.log(`Wrote ${path.relative(root, out)} (${pageNo} slides)`);
