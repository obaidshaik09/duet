/**
 * Full pre-demo check against a running Duet server.
 *   npm start            (in one terminal)
 *   npm run test:e2e     (in another)
 * Override target with E2E_BASE=http://host:port
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.E2E_BASE || 'http://127.0.0.1:5000').replace(/\/$/, '');
const stamp = Date.now();

let passed = 0;
const failures = [];
let section = '';

function group(name) {
  section = name;
  console.log(`\n== ${name}`);
}

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures.push(`[${section}] ${name}: ${err.message}`);
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function call(p, { method = 'GET', token, householdId, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (householdId) h['X-Household-Id'] = householdId;
  const res = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

async function ok(p, opts) {
  const r = await call(p, opts);
  assert(r.status >= 200 && r.status < 300, `${opts?.method || 'GET'} ${p} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}

function openStream(token, householdId) {
  const ctrl = new AbortController();
  const messages = [];
  const waiters = [];
  const ready = (async () => {
    const res = await fetch(`${BASE}/api/stream?householdId=${encodeURIComponent(householdId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    if (res.status !== 200) throw new Error(`stream status ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = block.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const msg = JSON.parse(line.slice(6));
            messages.push(msg);
            for (const w of [...waiters]) {
              if (w.pred(msg)) {
                waiters.splice(waiters.indexOf(w), 1);
                w.resolve(msg);
              }
            }
          }
        }
      } catch { /* aborted */ }
    })();
    return res;
  })();
  return {
    ready,
    messages,
    waitFor(pred, ms = 4000) {
      const hit = messages.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) {
            waiters.splice(i, 1);
            reject(new Error(`no live-sync message within ${ms}ms`));
          }
        }, ms);
      });
    },
    reset() { messages.length = 0; },
    close() { ctrl.abort(); },
  };
}

function pngSize(buf) {
  assert(buf.slice(1, 4).toString() === 'PNG', 'not a PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const A = { email: `alex-${stamp}@demo.local`, password: 'password123', name: 'Alex' };
const B = { email: `sam-${stamp}@demo.local`, password: 'password123', name: 'Sam' };
let tokA; let tokB; let tokC; let hid; let invite; let memberA; let memberB;
let streamB;

group('Server');
await check('health endpoint responds and product is free', async () => {
  const d = await ok('/api/health');
  assert(d.ok === true, 'ok !== true');
  assert(d.free === true, 'free !== true');
});

group('Accounts');
await check('signup rejects missing fields', async () => {
  const r = await call('/api/auth/signup', { method: 'POST', body: { email: 'x@y.z' } });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('signup rejects short password', async () => {
  const r = await call('/api/auth/signup', { method: 'POST', body: { ...A, password: 'short' } });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('caregiver A can sign up', async () => {
  const d = await ok('/api/auth/signup', { method: 'POST', body: A });
  assert(d.token && d.user?.email === A.email, 'missing token/user');
  tokA = d.token;
});
await check('duplicate email is rejected', async () => {
  const r = await call('/api/auth/signup', { method: 'POST', body: A });
  assert(r.status === 409, `expected 409, got ${r.status}`);
});
await check('email is case-insensitive at login', async () => {
  const d = await ok('/api/auth/login', { method: 'POST', body: { email: A.email.toUpperCase(), password: A.password } });
  assert(d.token, 'no token');
});
await check('wrong password is rejected', async () => {
  const r = await call('/api/auth/login', { method: 'POST', body: { email: A.email, password: 'wrongpass1' } });
  assert(r.status === 401, `expected 401, got ${r.status}`);
});
await check('/me requires a token', async () => {
  const r = await call('/api/auth/me');
  assert(r.status === 401, `expected 401, got ${r.status}`);
});
await check('/me rejects a forged token', async () => {
  const r = await call('/api/auth/me', { token: 'not.a.real.token' });
  assert(r.status === 401, `expected 401, got ${r.status}`);
});
await check('/me returns the signed-in user', async () => {
  const d = await ok('/api/auth/me', { token: tokA });
  assert(d.user.name === 'Alex', 'wrong user');
});
await check('caregiver B and an outsider can sign up', async () => {
  tokB = (await ok('/api/auth/signup', { method: 'POST', body: B })).token;
  tokC = (await ok('/api/auth/signup', {
    method: 'POST', body: { email: `outsider-${stamp}@demo.local`, password: 'password123', name: 'Outsider' },
  })).token;
});

group('Household + invite');
await check('create household requires baby name + birth date', async () => {
  const r = await call('/api/households', { method: 'POST', token: tokA, body: { babyName: '' } });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('A creates a household', async () => {
  const birth = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
  const d = await ok('/api/households', { method: 'POST', token: tokA, body: { babyName: 'Nora', birthDate: birth, role: 'Parent' } });
  hid = d.household.id;
  invite = d.household.inviteCode;
  memberA = d.membership.id;
  assert(hid && invite, 'missing id/invite');
});
await check('household data requires a household id', async () => {
  const r = await call('/api/events', { token: tokA });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('outsider cannot read the household', async () => {
  const r = await call('/api/events', { token: tokC, householdId: hid });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});
await check('outsider cannot open the live stream', async () => {
  const r = await call(`/api/stream?householdId=${hid}`, { token: tokC });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});
await check('bad invite code is rejected', async () => {
  const r = await call('/api/invites/join', { method: 'POST', token: tokB, body: { code: 'ZZZZZZ' } });
  assert(r.status === 404, `expected 404, got ${r.status}`);
});
await check('A sees live "members" update when B joins by invite', async () => {
  const streamA = openStream(tokA, hid);
  await streamA.ready;
  const d = await ok('/api/invites/join', { method: 'POST', token: tokB, body: { code: invite } });
  memberB = d.membership.id;
  await streamA.waitFor((m) => m.type === 'members');
  streamA.close();
});
await check('both caregivers listed in household', async () => {
  const d = await ok('/api/events', { token: tokA, householdId: hid });
  const names = d.caregivers.map((c) => c.name).sort();
  assert(names.includes('Alex') && names.includes('Sam'), `caregivers: ${names}`);
});
await check('bootstrap loads for B', async () => {
  const d = await ok('/api/bootstrap', { token: tokB, householdId: hid });
  assert(d.household.babyName === 'Nora', 'wrong baby');
  assert(d.memberId === memberB, 'wrong memberId');
});

group('Logging (voice transcript + typed text use the same /api/turn)');
streamB = openStream(tokB, hid);
await check('B live stream connects and gets hello', async () => {
  await streamB.ready;
  await streamB.waitFor((m) => m.type === 'hello');
});
let feedId;
await check('A logs bottle (clean voice transcript)', async () => {
  streamB.reset();
  const d = await ok('/api/turn', { method: 'POST', token: tokA, householdId: hid, body: { transcript: 'Just gave her a 3 ounce bottle.' } });
  assert(d.intent === 'log', `intent ${d.intent}`);
  assert(d.events[0]?.type === 'feed' && d.events[0].amountMl === 90, JSON.stringify(d.events));
  feedId = d.events[0].id;
});
await check('B receives the new entry live (SSE)', async () => {
  await streamB.waitFor((m) => m.type === 'events');
  const d = await ok('/api/events', { token: tokB, householdId: hid });
  assert(d.events.some((e) => e.id === feedId), 'B cannot see A entry');
});
await check('messy voice transcript with filler words still logs', async () => {
  const d = await ok('/api/turn', { method: 'POST', token: tokB, householdId: hid, body: { transcript: 'Um, like, so she just had uh 4 ounces, you know.' } });
  assert(d.intent === 'log' && d.events[0]?.type === 'feed', `${d.intent} ${JSON.stringify(d.events)}`);
});
await check('typed text: wet diaper', async () => {
  const d = await ok('/api/turn', { method: 'POST', token: tokB, householdId: hid, body: { transcript: 'Changed a wet diaper.' } });
  assert(d.events[0]?.type === 'diaper' && d.events[0].subtype === 'wet', JSON.stringify(d.events));
});
await check('nap start opens the nap timer for both caregivers', async () => {
  const d = await ok('/api/turn', { method: 'POST', token: tokA, householdId: hid, body: { transcript: "She's down for a nap." } });
  assert(d.openNap, 'no openNap');
  const b = await ok('/api/events', { token: tokB, householdId: hid });
  assert(b.openNap, 'B does not see open nap');
});
await check('wake button ends the nap', async () => {
  const d = await ok('/api/naps/wake', { method: 'POST', token: tokB, householdId: hid });
  assert(d.event.durationMin >= 1 && d.openNap === null, JSON.stringify(d.event));
});
await check('wake with no nap open returns a friendly 400', async () => {
  const r = await call('/api/naps/wake', { method: 'POST', token: tokB, householdId: hid });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('question "When did she last eat?" answers without logging', async () => {
  const d = await ok('/api/turn', { method: 'POST', token: tokA, householdId: hid, body: { transcript: 'When did she last eat?' } });
  assert(d.intent === 'query' && d.events.length === 0, `${d.intent} ${d.events.length}`);
});
await check('medical question is refused, nothing logged', async () => {
  const d = await ok('/api/turn', { method: 'POST', token: tokA, householdId: hid, body: { transcript: 'She feels warm, should I give Tylenol?' } });
  assert(d.events.length === 0, 'logged something');
  assert(/medical advice/i.test(d.reply), `reply: ${d.reply}`);
});
await check('gibberish is not logged', async () => {
  const d = await ok('/api/turn', { method: 'POST', token: tokA, householdId: hid, body: { transcript: 'purple elephant dancing' } });
  assert(d.events.length === 0, 'logged something');
});
await check('empty transcript returns a friendly 400', async () => {
  const r = await call('/api/turn', { method: 'POST', token: tokA, householdId: hid, body: { transcript: '   ' } });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('counts: 2 feeds, 1 nap, 1 diaper', async () => {
  const d = await ok('/api/events', { token: tokA, householdId: hid });
  assert(d.counts.feeds === 2 && d.counts.diapers === 1 && d.counts.naps >= 1, JSON.stringify(d.counts));
});

group('Edit + delete');
await check('A edits the bottle (amount + note)', async () => {
  streamB.reset();
  const d = await ok(`/api/events/${feedId}`, { method: 'PATCH', token: tokA, householdId: hid, body: { amountMl: 120, notes: 'edited for demo' } });
  assert(d.event.amountMl === 120 && d.event.notes === 'edited for demo', JSON.stringify(d.event));
});
await check('B sees the edit live', async () => {
  await streamB.waitFor((m) => m.type === 'events');
  const d = await ok('/api/events', { token: tokB, householdId: hid });
  const e = d.events.find((x) => x.id === feedId);
  assert(e?.amountMl === 120 && e.notes === 'edited for demo', JSON.stringify(e));
});
await check('editing an unknown entry returns 404', async () => {
  const r = await call('/api/events/e_does_not_exist', { method: 'PATCH', token: tokA, householdId: hid, body: { notes: 'x' } });
  assert(r.status === 404, `expected 404, got ${r.status}`);
});
await check('outsider cannot edit the entry', async () => {
  const r = await call(`/api/events/${feedId}`, { method: 'PATCH', token: tokC, householdId: hid, body: { notes: 'hack' } });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});
await check('B deletes the entry; it disappears for A and counts drop', async () => {
  streamB.reset();
  await ok(`/api/events/${feedId}`, { method: 'DELETE', token: tokB, householdId: hid });
  const d = await ok('/api/events', { token: tokA, householdId: hid });
  assert(!d.events.some((e) => e.id === feedId), 'still visible');
  assert(d.counts.feeds === 1, `feeds ${d.counts.feeds}`);
});
await check('deleting twice returns 404', async () => {
  const r = await call(`/api/events/${feedId}`, { method: 'DELETE', token: tokB, householdId: hid });
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

group('Summary, settings, export');
await check('daily summary lists counts', async () => {
  const d = await ok('/api/summary', { method: 'POST', token: tokA, householdId: hid });
  assert(/Feeds: 1/.test(d.summary) && /Nora/.test(d.summary), d.summary.slice(0, 120));
});
await check('owner can rename the baby; B sees it live', async () => {
  streamB.reset();
  await ok('/api/household', { method: 'PATCH', token: tokA, householdId: hid, body: { babyName: 'Nora Jane' } });
  await streamB.waitFor((m) => m.type === 'household');
  const d = await ok('/api/bootstrap', { token: tokB, householdId: hid });
  assert(d.household.babyName === 'Nora Jane', d.household.babyName);
});
await check('non-owner cannot rotate the invite', async () => {
  const r = await call('/api/household/invite/rotate', { method: 'POST', token: tokB, householdId: hid });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});
await check('owner rotates invite; old code stops working', async () => {
  const d = await ok('/api/household/invite/rotate', { method: 'POST', token: tokA, householdId: hid });
  assert(d.household.inviteCode !== invite, 'code unchanged');
  const r = await call('/api/invites/join', { method: 'POST', token: tokC, body: { code: invite } });
  assert(r.status === 404, `old code still works (${r.status})`);
});
await check('member display name can be updated', async () => {
  const d = await ok(`/api/members/${memberB}`, { method: 'PATCH', token: tokB, householdId: hid, body: { displayName: 'Sam (Dad)' } });
  assert(d.member.name === 'Sam (Dad)' || d.member.displayName === 'Sam (Dad)', JSON.stringify(d.member));
});
await check('export contains household, members, events, messages', async () => {
  const d = await ok('/api/export', { token: tokA, householdId: hid });
  assert(d.household && d.members.length === 2 && d.events.length >= 3 && d.messages.length >= 5, 'incomplete export');
});
await check('non-owner cannot delete the household', async () => {
  const r = await call('/api/household', { method: 'DELETE', token: tokB, householdId: hid });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});
await check('owner cannot remove themselves', async () => {
  const r = await call(`/api/members/${memberA}`, { method: 'DELETE', token: tokA, householdId: hid });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});
await check('owner removes B (who has logged entries); B loses access', async () => {
  await ok(`/api/members/${memberB}`, { method: 'DELETE', token: tokA, householdId: hid });
  const r = await call('/api/events', { token: tokB, householdId: hid });
  assert(r.status === 403, `expected 403, got ${r.status}`);
  const me = await ok('/api/auth/me', { token: tokB });
  assert(!me.households.some((h) => h.id === hid), 'household still in B list');
});
await check("B's past entries stay in the log after removal", async () => {
  const d = await ok('/api/events', { token: tokA, householdId: hid });
  assert(d.events.some((e) => e.memberId === memberB), 'B entries vanished');
  assert(d.caregivers.length === 1, `caregivers ${d.caregivers.length}`);
});
await check('B can rejoin with the current invite code', async () => {
  const code = (await ok('/api/bootstrap', { token: tokA, householdId: hid })).household.inviteCode;
  const d = await ok('/api/invites/join', { method: 'POST', token: tokB, body: { code } });
  assert(d.membership.id === memberB, 'new member id instead of restoring');
  await ok('/api/events', { token: tokB, householdId: hid });
});
streamB.close();
await check('owner deletes household (cleanup)', async () => {
  await ok('/api/household', { method: 'DELETE', token: tokA, householdId: hid });
  const r = await call('/api/events', { token: tokA, householdId: hid });
  assert(r.status === 403 || r.status === 404, `still accessible (${r.status})`);
});

group('Android WebView access (CORS from Capacitor origin)');
for (const origin of ['https://localhost', 'capacitor://localhost', 'http://localhost']) {
  await check(`preflight allowed from ${origin}`, async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-household-id',
      },
    });
    assert(res.status === 204 || res.status === 200, `status ${res.status}`);
    assert(res.headers.get('access-control-allow-origin') === origin, `allow-origin ${res.headers.get('access-control-allow-origin')}`);
    const allowH = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert(allowH.includes('x-household-id') && allowH.includes('authorization'), `allow-headers ${allowH}`);
  });
}

group('Installable web app (PWA)');
let manifest;
await check('index.html has manifest + iOS install tags', async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  for (const needle of ['rel="manifest"', 'apple-touch-icon', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'name="theme-color"', 'viewport-fit=cover', 'registerSW.js']) {
    assert(html.includes(needle), `missing ${needle}`);
  }
});
await check('manifest has required install fields', async () => {
  const res = await fetch(`${BASE}/manifest.webmanifest`);
  assert(res.status === 200, `status ${res.status}`);
  manifest = await res.json();
  for (const k of ['name', 'short_name', 'start_url', 'theme_color', 'background_color', 'icons']) assert(manifest[k], `missing ${k}`);
  assert(manifest.display === 'standalone', `display ${manifest.display}`);
});
await check('manifest has 192px, 512px and maskable icons', async () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert(sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(','));
  assert(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'), 'no 512 maskable');
});
await check('every manifest icon loads and matches its declared size', async () => {
  for (const icon of manifest.icons) {
    const res = await fetch(`${BASE}/${icon.src}`);
    assert(res.status === 200, `${icon.src} -> ${res.status}`);
    const [w, h] = pngSize(Buffer.from(await res.arrayBuffer()));
    assert(`${w}x${h}` === icon.sizes, `${icon.src} is ${w}x${h}, declared ${icon.sizes}`);
  }
});
await check('apple-touch-icon is 180x180 PNG', async () => {
  const res = await fetch(`${BASE}/apple-touch-icon.png`);
  assert(res.status === 200, `status ${res.status}`);
  const [w, h] = pngSize(Buffer.from(await res.arrayBuffer()));
  assert(w === 180 && h === 180, `${w}x${h}`);
});
await check('favicon.svg loads', async () => {
  const res = await fetch(`${BASE}/favicon.svg`);
  assert(res.status === 200, `status ${res.status}`);
});
await check('service worker precaches app shell and falls back offline', async () => {
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  assert(sw.includes('index.html'), 'index.html not precached');
  assert(/NavigationRoute|createHandlerBoundToURL/.test(sw), 'no navigation fallback');
  assert(/assets\/index-[\w-]+\.js/.test(sw), 'JS bundle not precached');
  assert(/assets\/index-[\w-]+\.css/.test(sw), 'CSS bundle not precached');
});
await check('every precached file actually exists on the server', async () => {
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  assert(urls.length > 10, `only ${urls.length} precache entries`);
  for (const u of urls) {
    const res = await fetch(`${BASE}/${u.replace(/^\.?\//, '')}`);
    assert(res.status === 200, `${u} -> ${res.status}`);
  }
});
await check('API is never served from SW cache', async () => {
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  assert(/\/api\//.test(sw) && /NetworkOnly/.test(sw), 'API not NetworkOnly');
});
await check('unknown paths fall back to the app (no 404 white screen)', async () => {
  const res = await fetch(`${BASE}/some/deep/link`);
  const html = await res.text();
  assert(res.status === 200 && html.includes('id="root"'), `status ${res.status}`);
});
await check('pre-JS background is the warm linen color (no white flash)', async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  assert(/background:#f4efe6/i.test(html), 'body background not set inline');
});

group('Android project (static checks)');
const andr = (p) => path.join(root, 'android', p);
const read = (p) => fs.readFileSync(p, 'utf8');
await check('capacitor.config: app id, name, webDir', async () => {
  const c = JSON.parse(read(path.join(root, 'capacitor.config.json')));
  assert(c.appId === 'com.duet.household' && c.appName === 'Duet' && c.webDir === 'dist', JSON.stringify(c));
});
await check('Android app id + label', async () => {
  assert(read(andr('app/build.gradle')).includes('applicationId "com.duet.household"'), 'applicationId');
  assert(read(andr('app/src/main/res/values/strings.xml')).includes('<string name="app_name">Duet</string>'), 'app_name');
});
await check('manifest: INTERNET, RECORD_AUDIO, cleartext to 10.0.2.2', async () => {
  const m = read(andr('app/src/main/AndroidManifest.xml'));
  for (const n of ['android.permission.INTERNET', 'android.permission.RECORD_AUDIO', 'usesCleartextTraffic="true"', 'network_security_config']) {
    assert(m.includes(n), `missing ${n}`);
  }
  assert(fs.existsSync(andr('app/src/main/res/xml/network_security_config.xml')), 'network_security_config.xml missing');
});
await check('native speech plugin registered with Android', async () => {
  const settings = read(andr('capacitor.settings.gradle'));
  assert(settings.includes('capacitor-community-speech-recognition'), 'plugin not in capacitor.settings.gradle');
});
await check('launcher icons + splash present in every density', async () => {
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      assert(fs.existsSync(andr(`app/src/main/res/mipmap-${d}/${f}`)), `mipmap-${d}/${f}`);
    }
    assert(fs.existsSync(andr(`app/src/main/res/drawable-port-${d}/splash.png`)), `splash ${d}`);
  }
  assert(read(andr('app/src/main/res/values/colors.xml')).includes('colorPrimary'), 'colors.xml');
});
await check('Android launcher icon is the Duet icon (not the Capacitor default)', async () => {
  const a = fs.readFileSync(andr('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'));
  const b = fs.readFileSync(path.join(root, 'public/icons/icon-192.png'));
  assert(a.equals(b), 'icon differs from public/icons/icon-192.png');
});
await check('Android web bundle is in sync with latest dist/ build', async () => {
  const distHtml = read(path.join(root, 'dist/index.html'));
  const apkHtml = read(andr('app/src/main/assets/public/index.html'));
  assert(distHtml === apkHtml, 'android/ is stale — run npm run cap:sync');
});
await check('Android bundle points the API at 10.0.2.2:5000', async () => {
  const dir = andr('app/src/main/assets/public/assets');
  const js = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => read(path.join(dir, f))).join('\n');
  assert(js.includes('http://10.0.2.2:5000'), '10.0.2.2 not in bundle');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
