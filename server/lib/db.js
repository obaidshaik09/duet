import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { findOpenNap } from './parseLocal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'duet-v3.db');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    baby_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    photo_data TEXT,
    invite_code TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(household_id, user_id),
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT NOT NULL,
    amount_ml INTEGER,
    duration_min INTEGER,
    notes TEXT,
    occurred_at TEXT NOT NULL,
    member_id TEXT NOT NULL,
    source_transcript TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id TEXT NOT NULL,
    transcript TEXT NOT NULL,
    reply TEXT NOT NULL,
    intent TEXT,
    member_id TEXT,
    created_at TEXT NOT NULL
  );
`);

const memberCols = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
if (!memberCols.includes('removed_at')) {
  db.exec('ALTER TABLE members ADD COLUMN removed_at TEXT');
}

function uid(prefix = '') {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

function inviteCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function todayKey(d = new Date()) {
  return d.toLocaleDateString('en-CA');
}

function mapEvent(row) {
  return {
    id: row.id,
    householdId: row.household_id,
    type: row.type,
    subtype: row.subtype,
    amountMl: row.amount_ml,
    durationMin: row.duration_min,
    notes: row.notes,
    occurredAt: row.occurred_at,
    memberId: row.member_id,
    caregiverId: row.member_id,
    sourceTranscript: row.source_transcript,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row) {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    role: row.role,
    name: row.display_name,
    displayName: row.display_name,
    lastLoggedAt: row.last_logged_at || null,
  };
}

function mapHousehold(row) {
  if (!row) return null;
  return {
    id: row.id,
    babyName: row.baby_name,
    birthDate: row.birth_date,
    photoData: row.photo_data,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

export function createUser({ email, passwordHash, name }) {
  const id = uid('u_');
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, email.toLowerCase().trim(), passwordHash, name.trim(), createdAt);
  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim()) || null;
}

export function getUserById(id) {
  const row = db.prepare('SELECT id, email, name, created_at AS createdAt, password_hash AS passwordHash FROM users WHERE id = ?').get(id);
  return row || null;
}

export function createHousehold({ ownerId, babyName, birthDate, ownerDisplayName, ownerRole = 'Parent' }) {
  const id = uid('h_');
  const createdAt = new Date().toISOString();
  const code = inviteCode();
  db.prepare(`
    INSERT INTO households (id, baby_name, birth_date, invite_code, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, babyName.trim(), birthDate, code, ownerId, createdAt);

  const memberId = uid('m_');
  db.prepare(`
    INSERT INTO members (id, household_id, user_id, role, display_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memberId, id, ownerId, ownerRole, ownerDisplayName.trim(), createdAt);

  return getHouseholdById(id);
}

export function getHouseholdById(id) {
  return mapHousehold(db.prepare('SELECT * FROM households WHERE id = ?').get(id));
}

export function getHouseholdByInvite(code) {
  return mapHousehold(
    db.prepare('SELECT * FROM households WHERE upper(invite_code) = upper(?)').get(String(code).trim()),
  );
}

export function getMembership(userId, householdId) {
  const row = db.prepare(
    'SELECT * FROM members WHERE user_id = ? AND household_id = ? AND removed_at IS NULL',
  ).get(userId, householdId);
  return row ? mapMember(row) : null;
}

export function getUserHouseholds(userId) {
  const rows = db.prepare(`
    SELECT h.* FROM households h
    JOIN members m ON m.household_id = h.id
    WHERE m.user_id = ? AND m.removed_at IS NULL
    ORDER BY h.created_at DESC
  `).all(userId);
  return rows.map(mapHousehold);
}

export function joinHousehold({ householdId, userId, displayName, role = 'Caregiver' }) {
  const existing = getMembership(userId, householdId);
  if (existing) return existing;
  const removed = db.prepare(
    'SELECT id FROM members WHERE user_id = ? AND household_id = ? AND removed_at IS NOT NULL',
  ).get(userId, householdId);
  if (removed) {
    db.prepare('UPDATE members SET removed_at = NULL, role = ?, display_name = ? WHERE id = ?')
      .run(role, displayName.trim(), removed.id);
    return getMembership(userId, householdId);
  }
  const id = uid('m_');
  db.prepare(`
    INSERT INTO members (id, household_id, user_id, role, display_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, householdId, userId, role, displayName.trim(), new Date().toISOString());
  return getMembership(userId, householdId);
}

export function listMembers(householdId) {
  const rows = db.prepare(`
    SELECT m.*, (
      SELECT MAX(e.occurred_at) FROM events e
      WHERE e.member_id = m.id AND e.household_id = m.household_id AND e.deleted_at IS NULL
    ) AS last_logged_at
    FROM members m
    WHERE m.household_id = ? AND m.removed_at IS NULL
    ORDER BY m.created_at ASC
  `).all(householdId);
  return rows.map(mapMember);
}

export function updateMember(memberId, householdId, { displayName, role }) {
  const m = db.prepare('SELECT * FROM members WHERE id = ? AND household_id = ?').get(memberId, householdId);
  if (!m) return null;
  db.prepare('UPDATE members SET display_name = ?, role = ? WHERE id = ?').run(
    displayName ?? m.display_name,
    role ?? m.role,
    memberId,
  );
  return listMembers(householdId).find((x) => x.id === memberId) || null;
}

/** Soft-remove: access is revoked but the caregiver's past entries stay attributed to them. */
export function removeMember(memberId, householdId) {
  db.prepare('UPDATE members SET removed_at = ? WHERE id = ? AND household_id = ? AND removed_at IS NULL')
    .run(new Date().toISOString(), memberId, householdId);
}

export function updateHousehold(householdId, { babyName, birthDate, photoData }) {
  const h = getHouseholdById(householdId);
  if (!h) return null;
  db.prepare(`
    UPDATE households SET baby_name = ?, birth_date = ?, photo_data = COALESCE(?, photo_data)
    WHERE id = ?
  `).run(
    babyName ?? h.babyName,
    birthDate ?? h.birthDate,
    photoData === undefined ? null : photoData,
    householdId,
  );
  if (photoData === null) {
    db.prepare('UPDATE households SET photo_data = NULL WHERE id = ?').run(householdId);
  }
  return getHouseholdById(householdId);
}

export function rotateInviteCode(householdId) {
  const code = inviteCode();
  db.prepare('UPDATE households SET invite_code = ? WHERE id = ?').run(code, householdId);
  return getHouseholdById(householdId);
}

export function weekOfLife(birthDate) {
  const born = new Date(`${birthDate}T00:00:00`);
  const days = Math.floor((Date.now() - born.getTime()) / 86400000);
  return Math.max(1, Math.min(52, Math.floor(days / 7) || 1));
}

export function getTodaysEvents(householdId) {
  const key = todayKey();
  return db.prepare(`
    SELECT * FROM events
    WHERE household_id = ? AND deleted_at IS NULL
    ORDER BY occurred_at ASC
  `).all(householdId)
    .map(mapEvent)
    .filter((e) => todayKey(new Date(e.occurredAt)) === key);
}

export function getOpenNap(householdId) {
  return findOpenNap(getTodaysEvents(householdId));
}

export function getLastOfType(householdId, type) {
  const events = [...getTodaysEvents(householdId)].reverse();
  return events.find((e) => e.type === type && e.subtype !== 'nap_start')
    || events.find((e) => e.type === type)
    || null;
}

export function getCounts(householdId) {
  const events = getTodaysEvents(householdId);
  const naps = events.filter((e) => e.type === 'nap' && e.subtype === 'nap_end').length
    + (getOpenNap(householdId) ? 1 : 0);
  return {
    feeds: events.filter((e) => e.type === 'feed').length,
    naps,
    diapers: events.filter((e) => e.type === 'diaper').length,
  };
}

export function addEvents(householdId, events, transcript) {
  const saved = [];
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO events (id, household_id, type, subtype, amount_ml, duration_min, notes, occurred_at, member_id, source_transcript, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const event of events) {
    const id = event.id || uid('e_');
    stmt.run(
      id,
      householdId,
      event.type,
      event.subtype,
      event.amountMl ?? null,
      event.durationMin ?? null,
      event.notes ?? null,
      event.occurredAt || now,
      event.memberId || event.caregiverId,
      transcript || null,
      now,
      now,
    );
    saved.push(mapEvent(db.prepare('SELECT * FROM events WHERE id = ?').get(id)));
  }
  return saved;
}

export function updateEvent(householdId, eventId, patch) {
  const row = db.prepare(
    'SELECT * FROM events WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  ).get(eventId, householdId);
  if (!row) return null;
  const next = {
    type: patch.type ?? row.type,
    subtype: patch.subtype ?? row.subtype,
    amountMl: patch.amountMl !== undefined ? patch.amountMl : row.amount_ml,
    durationMin: patch.durationMin !== undefined ? patch.durationMin : row.duration_min,
    notes: patch.notes !== undefined ? patch.notes : row.notes,
    occurredAt: patch.occurredAt ?? row.occurred_at,
  };
  db.prepare(`
    UPDATE events SET type = ?, subtype = ?, amount_ml = ?, duration_min = ?, notes = ?, occurred_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.type,
    next.subtype,
    next.amountMl,
    next.durationMin,
    next.notes,
    next.occurredAt,
    new Date().toISOString(),
    eventId,
  );
  return mapEvent(db.prepare('SELECT * FROM events WHERE id = ?').get(eventId));
}

export function softDeleteEvent(householdId, eventId) {
  const info = db.prepare(`
    UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL
  `).run(new Date().toISOString(), new Date().toISOString(), eventId, householdId);
  return info.changes > 0;
}

export function endOpenNap(householdId, memberId) {
  const open = getOpenNap(householdId);
  if (!open) return null;
  const durationMin = Math.max(
    1,
    Math.round((Date.now() - new Date(open.occurredAt).getTime()) / 60000),
  );
  return addEvents(householdId, [{
    type: 'nap',
    subtype: 'nap_end',
    durationMin,
    occurredAt: new Date().toISOString(),
    memberId,
  }], 'Wake up')[0];
}

export function addMessage(householdId, { transcript, reply, intent, memberId }) {
  db.prepare(`
    INSERT INTO messages (household_id, transcript, reply, intent, member_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(householdId, transcript, reply, intent || null, memberId || null, new Date().toISOString());
}

export function exportHouseholdData(householdId) {
  const household = getHouseholdById(householdId);
  const members = listMembers(householdId);
  const events = db.prepare(
    'SELECT * FROM events WHERE household_id = ? ORDER BY occurred_at ASC',
  ).all(householdId).map(mapEvent);
  const messages = db.prepare(
    'SELECT transcript, reply, intent, created_at AS createdAt FROM messages WHERE household_id = ? ORDER BY id ASC',
  ).all(householdId);
  return { exportedAt: new Date().toISOString(), household, members, events, messages };
}

export function deleteHousehold(householdId) {
  db.prepare('DELETE FROM messages WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM events WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM members WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
}

export function getBootstrap(householdId, memberId) {
  const household = getHouseholdById(householdId);
  const members = listMembers(householdId);
  const events = getTodaysEvents(householdId);
  const openNap = getOpenNap(householdId);
  return {
    household,
    week: weekOfLife(household.birthDate),
    caregivers: members,
    members,
    memberId,
    events,
    counts: getCounts(householdId),
    openNap,
  };
}

export { uid };
