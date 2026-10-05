import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocal, pluralMinutes } from './parseLocal.js';

const caregivers = [
  { id: 'alex', name: 'Alex' },
  { id: 'sam', name: 'Sam' },
];

const baseCtx = { babyName: 'Nora', caregivers, events: [] };

describe('parseLocal', () => {
  it('logs a bottle feed with ounces converted to ml', () => {
    const r = parseLocal('Just gave her a 3 ounce bottle.', 'sam', baseCtx);
    assert.equal(r.intent, 'log');
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].type, 'feed');
    assert.equal(r.events[0].subtype, 'bottle');
    assert.equal(r.events[0].amountMl, 90);
    assert.match(r.reply, /bottle/i);
  });

  it('starts a nap', () => {
    const r = parseLocal("She's down for a nap.", 'alex', baseCtx);
    assert.equal(r.intent, 'log');
    assert.equal(r.events[0].subtype, 'nap_start');
  });

  it('ends an open nap with duration', () => {
    const started = new Date(Date.now() - 48 * 60000).toISOString();
    const ctx = {
      ...baseCtx,
      events: [{ type: 'nap', subtype: 'nap_start', occurredAt: started, caregiverId: 'alex' }],
    };
    const r = parseLocal("She's up.", 'sam', ctx);
    assert.equal(r.intent, 'log');
    assert.equal(r.events[0].subtype, 'nap_end');
    assert.ok(r.events[0].durationMin >= 47);
    assert.match(r.reply, /minute/);
    assert.doesNotMatch(r.reply, /1 minutes/);
  });

  it('logs a wet diaper', () => {
    const r = parseLocal('Changed a wet diaper.', 'maya', baseCtx);
    assert.equal(r.events[0].type, 'diaper');
    assert.equal(r.events[0].subtype, 'wet');
  });

  it('answers last feed queries from context', () => {
    const ctx = {
      ...baseCtx,
      events: [{
        type: 'feed',
        subtype: 'bottle',
        amountMl: 90,
        occurredAt: new Date(Date.now() - 10 * 60000).toISOString(),
        caregiverId: 'sam',
      }],
    };
    const r = parseLocal('When did she last eat?', 'maya', ctx);
    assert.equal(r.intent, 'query');
    assert.equal(r.events.length, 0);
    assert.match(r.reply, /Sam/);
  });

  it('refuses medical advice', () => {
    const r = parseLocal('She feels warm, should I give Tylenol?', 'alex', baseCtx);
    assert.equal(r.intent, 'medical');
    assert.equal(r.events.length, 0);
    assert.match(r.reply, /can't give medical advice/i);
  });

  it('falls back on gibberish', () => {
    const r = parseLocal('purple elephant dancing', 'alex', baseCtx);
    assert.equal(r.intent, 'unclear');
    assert.equal(r.events.length, 0);
  });

  it('strips filler words from messy voice transcripts', () => {
    const r = parseLocal('Um, like, just gave her a 3 ounce bottle, uh.', 'sam', baseCtx);
    assert.equal(r.intent, 'log');
    assert.equal(r.events[0].amountMl, 90);
  });

  it('logs a feed from plural ounces without the word bottle', () => {
    const r = parseLocal('So she just had 4 ounces, you know.', 'sam', baseCtx);
    assert.equal(r.intent, 'log');
    assert.equal(r.events[0].type, 'feed');
    assert.equal(r.events[0].amountMl, 120);
  });

  it('logs a feed from "drank" with milliliters', () => {
    const r = parseLocal('She drank 90 milliliters.', 'sam', baseCtx);
    assert.equal(r.events[0].type, 'feed');
    assert.equal(r.events[0].amountMl, 90);
  });

  it('pluralizes one minute correctly', () => {
    assert.equal(pluralMinutes(1), '1 minute');
    assert.equal(pluralMinutes(2), '2 minutes');
  });
});
