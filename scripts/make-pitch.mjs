/**
 * Builds the narrated sales pitch: docs/Duet-Sales-Pitch.pptx plus one voiceover clip per slide
 * (free Microsoft neural voice via the edge-tts Python package: pip install edge-tts).
 *   npm run pitch   (also embeds the audio, sets timings and exports an MP4 through PowerPoint)
 * Each slide's narration is also its speaker notes, so you can present it live instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import PptxGenJS from 'pptxgenjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'docs', 'screenshots');
const audioDir = path.join(root, 'docs', 'pitch-audio');
const out = path.join(root, 'docs', 'Duet-Sales-Pitch.pptx');
const VOICE = process.env.PITCH_VOICE || 'en-US-AvaMultilingualNeural';
const icon = path.join(root, 'public', 'icons', 'icon-512.png');

const C = {
  linen: 'F4EFE6',
  paper: 'FFFDF8',
  ink: '2A2622',
  muted: '6F675E',
  faint: 'B9AFA3',
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
pptx.title = 'Duet — sales pitch';
pptx.subject = 'Voice-first baby log for the whole household';
pptx.company = 'AI Integration Class';

const titleStyle = { fontFace: HEAD, fontSize: 34, bold: true, color: C.ink, align: 'left', valign: 'middle', margin: 0 };
pptx.defineSlideMaster({
  title: 'PITCH_CONTENT',
  background: { color: C.linen },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 0.72, w: 11.9, h: 0.9, ...titleStyle }, text: '' } }],
});
pptx.defineSlideMaster({
  title: 'PITCH_HERO',
  background: { color: C.linen },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.93, y: 2.55, w: 7, h: 1.3, fontFace: HEAD, fontSize: 66, bold: true, color: C.ink, align: 'left', margin: 0 }, text: '' } }],
});
pptx.defineSlideMaster({
  title: 'PITCH_DARK',
  background: { color: C.ink },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 2.45, w: W - 1, h: 1.5, fontFace: HEAD, fontSize: 58, bold: true, color: C.paper, align: 'center', valign: 'middle', margin: 0 }, text: '' } }],
});

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Image framed in a rounded card, kept in proportion; crop is fractions of the source { l, t, w, h }. */
function image(s, name, box, crop = { l: 0, t: 0, w: 1, h: 1 }) {
  const file = path.join(shotsDir, name);
  const { w, h } = pngSize(file);
  const scale = Math.min(box.w / (w * crop.w), box.h / (h * crop.h));
  const dw = w * crop.w * scale;
  const dh = h * crop.h * scale;
  const x = box.x + (box.w - dw) / 2;
  const y = box.y + (box.h - dh) / 2;
  s.addShape(pptx.ShapeType.roundRect, {
    x: x - 0.06, y: y - 0.06, w: dw + 0.12, h: dh + 0.12,
    fill: { color: C.paper }, line: { color: C.line, width: 1 }, rectRadius: 0.12,
    shadow: { type: 'outer', color: '000000', opacity: 0.14, blur: 10, offset: 4, angle: 90 },
  });
  const opts = { path: file, x, y, w: w * scale, h: h * scale };
  if (crop.w < 1 || crop.h < 1) opts.sizing = { type: 'crop', x: crop.l * w * scale, y: crop.t * h * scale, w: dw, h: dh };
  s.addImage(opts);
}

function card(s, x, y, w, h, fill = C.paper) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: C.line, width: 1 }, rectRadius: 0.15 });
}

function dot(s, x, y, color = C.clay, d = 0.3) {
  s.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { color } });
}

const slides = [];
function slide(master, narration, build) {
  const s = pptx.addSlide({ masterName: master });
  s.addNotes(narration);
  build(s);
  slides.push(narration);
}

function content(kicker, title, narration, build) {
  slide('PITCH_CONTENT', narration, (s) => {
    s.addText(kicker.toUpperCase(), { x: 0.7, y: 0.4, w: 9, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: C.clay, charSpacing: 2 });
    s.addText(title, { placeholder: 'title', ...titleStyle });
    build(s);
  });
}

// 1 — Hook
slide('PITCH_DARK',
  "It's three in the morning. The baby is crying, and you're holding her with one arm. Your partner asks: did she eat at midnight, or was that ten? Nobody knows. Every new family lives this moment, over and over, every single day.",
  (s) => {
    s.addText('3:00 AM', { x: 0.5, y: 1.55, w: W - 1, h: 0.6, align: 'center', fontFace: BODY, fontSize: 20, bold: true, color: C.clay, charSpacing: 6 });
    s.addText('\u201CDid anyone feed her?\u201D', { placeholder: 'title', fontFace: HEAD, fontSize: 58, bold: true, color: C.paper, align: 'center', margin: 0 });
    s.addText('Every new family asks this, over and over, every single day.', {
      x: 0.5, y: 4.25, w: W - 1, h: 0.6, align: 'center', fontFace: BODY, fontSize: 20, color: C.faint,
    });
  });

// 2 — Problem
content('The problem', 'Newborn care never stops, and it is shared',
  'A newborn eats eight to twelve times a day, and needs at least six diaper changes. The care is shared between parents, grandparents, and sometimes a night nurse. So the record ends up scattered across group texts and tired memories. And the tracking apps out there are built around forms and charts. Logging one bottle takes several taps, with hands that are already full.',
  (s) => {
    const stats = [
      ['8\u201312', 'feeds a day', C.clay],
      ['6+', 'diaper changes a day', C.sage],
      ['0', 'free hands at 3 AM', C.ink],
    ];
    stats.forEach(([big, label, color], i) => {
      const x = 0.7 + i * 4.05;
      card(s, x, 1.95, 3.8, 2.75);
      s.addText(big, { x, y: 2.1, w: 3.8, h: 1.55, align: 'center', fontFace: HEAD, fontSize: 72, bold: true, color });
      s.addText(label, { x, y: 3.65, w: 3.8, h: 0.6, align: 'center', fontFace: BODY, fontSize: 19, color: C.muted });
    });
    card(s, 0.7, 5.05, 11.9, 1.3, C.claySoft);
    s.addText([
      { text: 'Today: ', options: { bold: true, color: C.clay } },
      { text: 'the record lives in group texts and memory, and tracker apps make you tap through forms to log one bottle.', options: { color: C.ink } },
    ], { x: 1.0, y: 5.05, w: 11.3, h: 1.3, fontFace: BODY, fontSize: 19, valign: 'middle' });
    s.addText('Feeding and diaper ranges: typical newborn guidance from the American Academy of Pediatrics.', {
      x: 0.7, y: 6.7, w: 11.9, h: 0.3, fontFace: BODY, fontSize: 10, color: C.muted,
    });
  });

// 3 — Meet Duet
slide('PITCH_HERO',
  "Meet Duet. The baby log you simply talk to. Say, just gave her a three ounce bottle, and it's logged. And everyone in your household sees it, instantly.",
  (s) => {
    s.addImage({ path: icon, x: 0.95, y: 1.15, w: 1.25, h: 1.25 });
    s.addText('Meet Duet', { placeholder: 'title', fontFace: HEAD, fontSize: 66, bold: true, color: C.ink, align: 'left', margin: 0 });
    s.addText('The baby log you simply talk to.', { x: 0.9, y: 3.95, w: 7, h: 0.7, fontFace: HEAD, fontSize: 28, color: C.ink });
    s.addText('Talk. Log. Stay in sync.', { x: 0.9, y: 4.75, w: 7, h: 0.5, fontFace: BODY, fontSize: 20, bold: true, color: C.clay });
    image(s, '05-voice-logged-phone.png', { x: 8.6, y: 0.6, w: 3.6, h: 6.3 });
  });

// 4 — How it works
content('How it works', 'One sentence. That\u2019s the whole interface.',
  "Here's how it works. Tap the mic and speak naturally. Duet understands feeds, naps, and diaper changes, converts the amounts, and confirms in one short line. Within about a second, every caregiver's screen updates. No forms. No typing. Just one sentence.",
  (s) => {
    const steps = [
      ['1', 'Say it', '\u201CJust gave her a 3 ounce bottle.\u201D', C.paper],
      ['2', 'Duet logs it', 'Feed \u00B7 3 oz (90 ml) \u00B7 3:02 AM', C.sageSoft],
      ['3', 'Everyone sees it', 'Every caregiver\u2019s screen updates in about a second.', C.claySoft],
    ];
    steps.forEach(([n, t, b, fill], i) => {
      const x = 0.7 + i * 4.15;
      card(s, x, 2.0, 3.65, 3.1, fill);
      s.addShape(pptx.ShapeType.ellipse, { x: x + 0.3, y: 2.3, w: 0.75, h: 0.75, fill: { color: C.clay }, line: { color: C.clay } });
      s.addText(n, { x: x + 0.3, y: 2.3, w: 0.75, h: 0.75, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 24, bold: true, color: C.paper });
      s.addText(t, { x: x + 0.3, y: 3.25, w: 3.1, h: 0.55, fontFace: BODY, fontSize: 22, bold: true, color: C.ink });
      s.addText(b, { x: x + 0.3, y: 3.8, w: 3.1, h: 1.1, fontFace: BODY, fontSize: 16, color: C.muted, valign: 'top' });
      if (i < 2) {
        s.addShape(pptx.ShapeType.line, { x: x + 3.7, y: 3.55, w: 0.4, h: 0, line: { color: C.muted, width: 2.5, endArrowType: 'triangle' } });
      }
    });
    s.addText('No forms. No typing. One sentence.', {
      x: 0.7, y: 5.55, w: 11.9, h: 0.8, align: 'center', fontFace: HEAD, fontSize: 28, bold: true, color: C.sage,
    });
  });

// 5 — Demo
content('See it in action', 'One household, two screens, live',
  "Here it is in action. Alex just speaks into her phone, and Duet logs it. Sam, on a laptop across town, sees every entry appear on the shared timeline, without refreshing. And if anyone asks, when did she last eat, Duet answers straight from the log.",
  (s) => {
    image(s, '05-voice-logged-phone.png', { x: 1.2, y: 1.85, w: 4.2, h: 4.55 });
    image(s, '04-today-desktop.png', { x: 6.6, y: 1.85, w: 5.6, h: 4.55 }, { l: 0.2, t: 0, w: 0.6, h: 1 });
    s.addText('Alex logs by voice on her phone', { x: 1.2, y: 6.55, w: 4.2, h: 0.4, fontFace: BODY, fontSize: 15, bold: true, color: C.ink, align: 'center' });
    s.addText('Sam sees it live on a laptop', { x: 6.6, y: 6.55, w: 5.6, h: 0.4, fontFace: BODY, fontSize: 15, bold: true, color: C.ink, align: 'center' });
  });

// 6 — Why Duet
content('Why Duet', 'What makes Duet different',
  "What makes Duet different? It's voice first, built for the moments when your hands are full. It's made for the whole household, with private invite codes for partners, grandparents, and nannies. It works everywhere: in any browser, on your home screen, or as an Android app, even offline. And it's safe by design. Duet is a log, not a doctor. Medical questions always go to the pediatrician.",
  (s) => {
    const items = [
      ['Voice-first', 'Built for full hands. Speak a sentence instead of filling in a form.', C.clay],
      ['The whole household', 'Partners, grandparents and nannies join with a private invite code.', C.sage],
      ['Works everywhere', 'Any browser, installed on the home screen, or the Android app. Even offline.', C.clay],
      ['Safe by design', 'A log, not a doctor. Medical questions are sent to the pediatrician.', C.sage],
    ];
    items.forEach(([t, b, color], i) => {
      const x = 0.7 + (i % 2) * 6.05;
      const y = 1.95 + Math.floor(i / 2) * 2.4;
      card(s, x, y, 5.85, 2.2);
      dot(s, x + 0.35, y + 0.42, color, 0.36);
      s.addText(t, { x: x + 0.95, y: y + 0.28, w: 4.6, h: 0.6, fontFace: BODY, fontSize: 22, bold: true, color: C.ink });
      s.addText(b, { x: x + 0.95, y: y + 0.9, w: 4.6, h: 0.95, fontFace: BODY, fontSize: 16, color: C.muted, valign: 'top' });
    });
  });

// 7 — Market
content('Who it\u2019s for', 'Every baby comes with a team',
  "About three point six million babies are born in the United States every year. Behind every one of them is a team of caregivers who need to stay in sync. Duet starts with new parents in those first twelve weeks, then grows to grandparents, nannies, and night nurses, and later to clinics and birthing classes.",
  (s) => {
    card(s, 0.7, 1.95, 5.2, 4.4, C.claySoft);
    s.addText('3.6M', { x: 0.7, y: 2.35, w: 5.2, h: 1.7, align: 'center', fontFace: HEAD, fontSize: 96, bold: true, color: C.clay });
    s.addText('babies born in the US every year', { x: 0.7, y: 4.05, w: 5.2, h: 0.6, align: 'center', fontFace: BODY, fontSize: 20, color: C.ink });
    s.addText('Source: CDC, U.S. births 2023', { x: 0.7, y: 5.6, w: 5.2, h: 0.4, align: 'center', fontFace: BODY, fontSize: 11, color: C.muted });
    const who = [
      ['New parents', 'The first 12 weeks. Where we start.', C.clay],
      ['Grandparents and relatives', 'Helping out in shifts.', C.sage],
      ['Nannies and night nurses', 'Hand-offs without a paper notebook.', C.sage],
      ['Next: clinics and birthing classes', 'Recommend Duet to every new family.', C.muted],
    ];
    who.forEach(([t, b, color], i) => {
      const y = 2.0 + i * 1.08;
      dot(s, 6.4, y + 0.2, color, 0.3);
      s.addText(t, { x: 6.95, y, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 20, bold: true, color: C.ink });
      s.addText(b, { x: 6.95, y: y + 0.45, w: 5.6, h: 0.4, fontFace: BODY, fontSize: 15, color: C.muted });
    });
  });

// 8 — Business model
content('Business model', 'Free to start. Built to grow.',
  "Our model is simple. The core of Duet is free, forever: voice logging, unlimited caregivers, and live sync. Next, we plan Duet Plus, a small subscription with visit-ready reports for the pediatrician, long-term trends, and support for more than one child. And we'll partner with hospitals and birthing classes, so families get Duet before they even go home. And growth is built in: every family that signs up brings its own caregivers along.",
  (s) => {
    const cols = [
      ['Free', 'Core, forever', ['Voice logging', 'Unlimited caregivers', 'Live sync on every device'], C.paper, C.sage],
      ['Duet Plus', 'Planned subscription', ['Visit-ready reports for the pediatrician', 'Long-term trends', 'More than one child'], C.claySoft, C.clay],
      ['Partners', 'Planned channel', ['Hospitals', 'Birthing classes', 'Families start before they go home'], C.sageSoft, C.sage],
    ];
    cols.forEach(([t, sub, bullets, fill, color], i) => {
      const x = 0.7 + i * 4.05;
      card(s, x, 1.95, 3.8, 3.45, fill);
      s.addText(t, { x: x + 0.35, y: 2.2, w: 3.1, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color });
      s.addText(sub.toUpperCase(), { x: x + 0.35, y: 2.9, w: 3.1, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.muted, charSpacing: 1.5 });
      s.addText(bullets.map((b) => ({ text: b, options: { bullet: { indent: 18 }, breakLine: true } })), {
        x: x + 0.35, y: 3.4, w: 3.2, h: 1.85, fontFace: BODY, fontSize: 17, color: C.ink, valign: 'top', paraSpaceAfter: 8,
      });
    });
    card(s, 0.7, 5.7, 11.9, 0.95, C.paper);
    s.addText([
      { text: 'Built-in growth: ', options: { bold: true, color: C.clay } },
      { text: 'every family that signs up invites its own partner, grandparents and nannies.', options: { color: C.ink } },
    ], { x: 1.0, y: 5.7, w: 11.3, h: 0.95, fontFace: BODY, fontSize: 18, valign: 'middle' });
  });

// 9 — Proof
content('Traction', 'Built, tested, and working today',
  "And this isn't just an idea. Duet is built and working today, as a website, an installable app, and an Android app. It passed all one hundred and fifteen automated checks, including live sync between two caregivers and offline use.",
  (s) => {
    card(s, 0.7, 1.95, 4.4, 4.4, C.sageSoft);
    s.addText('115/115', { x: 0.7, y: 2.4, w: 4.4, h: 1.5, align: 'center', fontFace: HEAD, fontSize: 66, bold: true, color: C.sage });
    s.addText('automated checks passed', { x: 0.7, y: 3.9, w: 4.4, h: 0.6, align: 'center', fontFace: BODY, fontSize: 20, color: C.ink });
    s.addText('unit \u00B7 end-to-end \u00B7 real browser', { x: 0.7, y: 4.5, w: 4.4, h: 0.5, align: 'center', fontFace: BODY, fontSize: 14, color: C.muted });
    const proof = [
      ['Website, installable app and Android app', 'One codebase.'],
      ['Live sync tested on two screens', 'A phone and a laptop, at the same time.'],
      ['Works offline', 'Entries are saved and sent when you reconnect.'],
    ];
    proof.forEach(([t, b], i) => {
      const y = 2.05 + i * 1.45;
      dot(s, 5.5, y + 0.12, C.sage, 0.32);
      s.addText([
        { text: t, options: { fontSize: 18, bold: true, color: C.ink, breakLine: true } },
        { text: b, options: { fontSize: 14, color: C.muted } },
      ], { x: 6.0, y, w: 3.75, h: 1.2, fontFace: BODY, valign: 'top', margin: 0 });
    });
    image(s, '07-summary-phone.png', { x: 10.0, y: 1.95, w: 2.6, h: 4.4 }, { l: 0, t: 0, w: 1, h: 0.72 });
  });

// 10 — The ask
slide('PITCH_DARK',
  "Here's our ask. Help us find ten families for a two week pilot, and tell us what would make Duet a must-have. Because at three in the morning, nobody should have to wonder: did she eat? Duet. Talk, log, stay in sync.",
  (s) => {
    s.addShape(pptx.ShapeType.roundRect, { x: W / 2 - 0.7, y: 0.75, w: 1.4, h: 1.4, fill: { color: C.linen }, line: { color: C.linen }, rectRadius: 0.25 });
    s.addImage({ path: icon, x: W / 2 - 0.55, y: 0.9, w: 1.1, h: 1.1 });
    s.addText('Try Duet with us.', { placeholder: 'title', fontFace: HEAD, fontSize: 58, bold: true, color: C.paper, align: 'center', margin: 0 });
    const asks = ['10 families', '2-week pilot', 'Your feedback'];
    asks.forEach((t, i) => {
      const x = W / 2 - 5.1 + i * 3.5;
      s.addShape(pptx.ShapeType.roundRect, { x, y: 4.35, w: 3.2, h: 0.85, fill: { color: i === 1 ? C.clay : '3A352F' }, line: { color: i === 1 ? C.clay : '4A443D' }, rectRadius: 0.42 });
      s.addText(t, { x, y: 4.35, w: 3.2, h: 0.85, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 20, bold: true, color: C.paper });
    });
    s.addText('Duet  \u00B7  Talk. Log. Stay in sync.', { x: 0.5, y: 6.2, w: W - 1, h: 0.5, align: 'center', fontFace: BODY, fontSize: 16, color: C.faint });
  });

await pptx.writeFile({ fileName: out });
console.log(`Wrote ${path.relative(root, out)} (${slides.length} slides)`);

fs.mkdirSync(audioDir, { recursive: true });
for (const [i, text] of slides.entries()) {
  const base = path.join(audioDir, `slide${String(i + 1).padStart(2, '0')}`);
  const stamp = `${VOICE}\n${text}`;
  if (fs.existsSync(`${base}.mp3`) && fs.existsSync(`${base}.txt`) && fs.readFileSync(`${base}.txt`, 'utf8') === stamp) continue;
  const r = spawnSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate=-4%', '--text', text, '--write-media', `${base}.mp3`], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('Voiceover failed. Install the free voice tool with: python -m pip install --user edge-tts');
    process.exit(1);
  }
  fs.writeFileSync(`${base}.txt`, stamp);
  console.log(`Voiceover ${i + 1}/${slides.length} done`);
}
