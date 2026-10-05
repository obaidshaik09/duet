import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import {
  createUser,
  getUserByEmail,
  getUserById,
  createHousehold,
  getHouseholdById,
  getHouseholdByInvite,
  getMembership,
  getUserHouseholds,
  joinHousehold,
  listMembers,
  updateMember,
  removeMember,
  updateHousehold,
  rotateInviteCode,
  getBootstrap,
  getTodaysEvents,
  getCounts,
  getLastOfType,
  addEvents,
  updateEvent,
  softDeleteEvent,
  endOpenNap,
  addMessage,
  weekOfLife,
  exportHouseholdData,
  deleteHousehold,
  getOpenNap,
} from './lib/db.js';
import { parseLocal, labelEvent, cleanupSpeech } from './lib/parseLocal.js';
import { runTurnWithClaude, runSummaryWithClaude } from './lib/claude.js';
import { sanitizeReply, validateEvents } from './lib/guardrails.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from './lib/auth.js';
import { subscribe, publish } from './lib/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '4mb' }));

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function requireMember(req, res) {
  const householdId = req.headers['x-household-id'] || req.body?.householdId || req.query.householdId;
  if (!householdId) {
    res.status(400).json({ error: { message: 'householdId is required.' } });
    return null;
  }
  const membership = getMembership(req.user.id, householdId);
  if (!membership) {
    res.status(403).json({ error: { message: 'You are not in this household.' } });
    return null;
  }
  const household = getHouseholdById(householdId);
  return { household, membership };
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function buildFactualSummary(householdId) {
  const household = getHouseholdById(householdId);
  const members = listMembers(householdId);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const events = getTodaysEvents(householdId);
  const counts = getCounts(householdId);
  const date = new Date().toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const who = [...new Set(events.map((e) => byId[e.memberId]?.name).filter(Boolean))];
  const lines = [
    `${household.babyName} · ${date} · week ${weekOfLife(household.birthDate)}`,
    '',
    `Feeds: ${counts.feeds}`,
    `Naps: ${counts.naps}`,
    `Diapers: ${counts.diapers}`,
    '',
  ];
  if (!events.length) {
    lines.push('No care events were logged today.');
  } else {
    lines.push('Timeline');
    for (const event of events) {
      lines.push(`• ${fmtTime(event.occurredAt)} — ${labelEvent(event)} (${byId[event.memberId]?.name || 'Someone'})`);
    }
    const lastFeed = getLastOfType(householdId, 'feed');
    if (lastFeed) lines.push('', `Last feed: ${fmtTime(lastFeed.occurredAt)} · ${labelEvent(lastFeed)}`);
    if (who.length) lines.push(`Logged by: ${who.join(', ')}`);
  }
  lines.push('', 'This is a household log for organization only. It is not medical advice.');
  return lines.join('\n');
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(API_KEY && !API_KEY.includes('your-real-key')),
    free: true,
  });
});

app.post('/api/auth/signup', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    if (!email || !password || !name) {
      return res.status(400).json({ error: { message: 'Name, email, and password are required.' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { message: 'Password must be at least 8 characters.' } });
    }
    if (getUserByEmail(email)) {
      return res.status(409).json({ error: { message: 'An account with that email already exists.' } });
    }
    const user = createUser({ email, passwordHash: hashPassword(password), name });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: publicUser(user), households: [] });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const row = getUserByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: { message: 'Invalid email or password.' } });
  }
  const user = getUserById(row.id);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({
    token,
    user: publicUser(user),
    households: getUserHouseholds(user.id),
  });
});

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: { message: 'Please sign in.' } });
  res.json({ user: publicUser(user), households: getUserHouseholds(user.id) });
});

app.post('/api/households', requireAuth, (req, res) => {
  const babyName = String(req.body?.babyName || '').trim();
  const birthDate = String(req.body?.birthDate || '').trim();
  const displayName = String(req.body?.displayName || req.user.name || '').trim();
  const role = String(req.body?.role || 'Parent').trim();
  if (!babyName || !birthDate) {
    return res.status(400).json({ error: { message: 'Baby name and birth date are required.' } });
  }
  const household = createHousehold({
    ownerId: req.user.id,
    babyName,
    birthDate,
    ownerDisplayName: displayName,
    ownerRole: role,
  });
  const membership = getMembership(req.user.id, household.id);
  res.status(201).json({ household, membership });
});

app.post('/api/invites/join', requireAuth, (req, res) => {
  const code = String(req.body?.code || '').trim();
  const displayName = String(req.body?.displayName || req.user.name || '').trim();
  const role = String(req.body?.role || 'Caregiver').trim();
  const household = getHouseholdByInvite(code);
  if (!household) return res.status(404).json({ error: { message: 'Invite code not found.' } });
  const membership = joinHousehold({
    householdId: household.id,
    userId: req.user.id,
    displayName,
    role,
  });
  publish(household.id, { type: 'members' });
  res.json({ household, membership });
});

app.get('/api/bootstrap', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  res.json(getBootstrap(ctx.household.id, ctx.membership.id));
});

app.get('/api/events', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  res.json({
    events: getTodaysEvents(ctx.household.id),
    counts: getCounts(ctx.household.id),
    openNap: getOpenNap(ctx.household.id),
    caregivers: listMembers(ctx.household.id),
    household: ctx.household,
    week: weekOfLife(ctx.household.birthDate),
  });
});

app.get('/api/stream', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
  const unsub = subscribe(ctx.household.id, res);
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* closed */ }
  }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    unsub();
  });
});

app.post('/api/turn', requireAuth, async (req, res) => {
  try {
    const ctx = requireMember(req, res);
    if (!ctx) return;

    const transcript = cleanupSpeech(String(req.body?.transcript || ''));
    if (!transcript) {
      return res.status(400).json({
        error: { message: "I didn't catch any words. Tap the mic and try again, or type below." },
      });
    }

    const members = listMembers(ctx.household.id);
    const parseCtx = {
      babyName: ctx.household.babyName,
      events: getTodaysEvents(ctx.household.id),
      caregivers: members,
    };

    let result;
    const keyOk = Boolean(API_KEY && !API_KEY.includes('your-real-key'));
    if (keyOk) {
      try {
        result = await runTurnWithClaude(transcript, ctx.household.id, ctx.membership.id, API_KEY);
      } catch (err) {
        console.warn('Claude turn failed, using local parser:', err.message);
        result = { ...parseLocal(transcript, ctx.membership.id, parseCtx), source: 'local-fallback' };
      }
    } else {
      result = { ...parseLocal(transcript, ctx.membership.id, parseCtx), source: 'local' };
    }

    result.reply = sanitizeReply(result.reply, result.intent);

    let saved = [];
    if (result.intent === 'log' && result.events?.length) {
      const validated = validateEvents(result.events)
        .filter((e) => e.confidence !== 'low')
        .map((e) => ({ ...e, memberId: ctx.membership.id, caregiverId: ctx.membership.id }));
      saved = addEvents(ctx.household.id, validated, transcript);
    }

    addMessage(ctx.household.id, {
      transcript,
      reply: result.reply,
      intent: result.intent,
      memberId: ctx.membership.id,
    });

    publish(ctx.household.id, { type: 'events' });

    res.json({
      intent: result.intent,
      reply: result.reply,
      events: saved,
      pending: (result.events || []).filter((e) => e.confidence === 'low'),
      source: result.source,
      counts: getCounts(ctx.household.id),
      todaysEvents: getTodaysEvents(ctx.household.id),
      openNap: getOpenNap(ctx.household.id),
      caregivers: listMembers(ctx.household.id),
    });
  } catch (err) {
    console.error('Turn error:', err);
    res.status(500).json({ error: { message: err.message || 'Turn failed.' } });
  }
});

app.patch('/api/events/:id', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  const updated = updateEvent(ctx.household.id, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: { message: 'Event not found.' } });
  publish(ctx.household.id, { type: 'events' });
  res.json({
    event: updated,
    events: getTodaysEvents(ctx.household.id),
    counts: getCounts(ctx.household.id),
    openNap: getOpenNap(ctx.household.id),
    caregivers: listMembers(ctx.household.id),
  });
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  const ok = softDeleteEvent(ctx.household.id, req.params.id);
  if (!ok) return res.status(404).json({ error: { message: 'Event not found.' } });
  publish(ctx.household.id, { type: 'events' });
  res.json({
    ok: true,
    events: getTodaysEvents(ctx.household.id),
    counts: getCounts(ctx.household.id),
    openNap: getOpenNap(ctx.household.id),
    caregivers: listMembers(ctx.household.id),
  });
});

app.post('/api/naps/wake', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  const ended = endOpenNap(ctx.household.id, ctx.membership.id);
  if (!ended) return res.status(400).json({ error: { message: 'No nap in progress.' } });
  publish(ctx.household.id, { type: 'events' });
  res.json({
    event: ended,
    events: getTodaysEvents(ctx.household.id),
    counts: getCounts(ctx.household.id),
    openNap: null,
    reply: `Logged wake-up after about ${ended.durationMin} minute${ended.durationMin === 1 ? '' : 's'}.`,
    caregivers: listMembers(ctx.household.id),
  });
});

app.post('/api/summary', requireAuth, async (req, res) => {
  try {
    const ctx = requireMember(req, res);
    if (!ctx) return;
    const factual = buildFactualSummary(ctx.household.id);
    const keyOk = Boolean(API_KEY && !API_KEY.includes('your-real-key'));
    const text = keyOk ? await runSummaryWithClaude(factual, API_KEY) : factual;
    res.json({ summary: text });
  } catch (err) {
    res.status(500).json({ error: { message: err.message || 'Summary failed.' } });
  }
});

app.patch('/api/household', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  if (ctx.membership.role !== 'Parent' && ctx.household.ownerId !== req.user.id) {
    return res.status(403).json({ error: { message: 'Only a parent/owner can edit baby settings.' } });
  }
  const household = updateHousehold(ctx.household.id, {
    babyName: req.body?.babyName,
    birthDate: req.body?.birthDate,
    photoData: req.body?.photoData,
  });
  publish(ctx.household.id, { type: 'household' });
  res.json({ household });
});

app.post('/api/household/invite/rotate', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  if (ctx.household.ownerId !== req.user.id) {
    return res.status(403).json({ error: { message: 'Only the household owner can rotate the invite.' } });
  }
  const household = rotateInviteCode(ctx.household.id);
  res.json({ household });
});

app.patch('/api/members/:id', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  const member = updateMember(req.params.id, ctx.household.id, {
    displayName: req.body?.displayName,
    role: req.body?.role,
  });
  if (!member) return res.status(404).json({ error: { message: 'Member not found.' } });
  publish(ctx.household.id, { type: 'members' });
  res.json({ member, members: listMembers(ctx.household.id) });
});

app.delete('/api/members/:id', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  if (ctx.household.ownerId !== req.user.id && ctx.membership.id !== req.params.id) {
    return res.status(403).json({ error: { message: 'Not allowed.' } });
  }
  const target = listMembers(ctx.household.id).find((m) => m.id === req.params.id);
  if (!target) return res.status(404).json({ error: { message: 'Member not found.' } });
  if (target.userId === ctx.household.ownerId) {
    return res.status(400).json({ error: { message: 'The household owner cannot be removed.' } });
  }
  removeMember(req.params.id, ctx.household.id);
  publish(ctx.household.id, { type: 'members' });
  res.json({ members: listMembers(ctx.household.id) });
});

app.get('/api/export', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  const data = exportHouseholdData(ctx.household.id);
  res.setHeader('Content-Disposition', `attachment; filename="duet-${ctx.household.babyName}-export.json"`);
  res.json(data);
});

app.delete('/api/household', requireAuth, (req, res) => {
  const ctx = requireMember(req, res);
  if (!ctx) return;
  if (ctx.household.ownerId !== req.user.id) {
    return res.status(403).json({ error: { message: 'Only the owner can delete the household.' } });
  }
  deleteHousehold(ctx.household.id);
  res.json({ ok: true });
});

const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong. Please try again.' } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Duet server on http://0.0.0.0:${PORT} (phone/emulator: use host LAN IP or 10.0.2.2:${PORT})`);
  if (!API_KEY || API_KEY.includes('your-real-key')) {
    console.warn('ANTHROPIC_API_KEY not set — using local parser.');
  }
});
