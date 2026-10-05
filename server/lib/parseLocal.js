/**
 * Pure local NLU for baby-care utterances.
 * Accepts an optional context object so unit tests never need SQLite.
 */
import { looksMedical, MEDICAL_REFUSAL } from './guardrails.js';

/** Strip filler words common in real voice transcripts. */
export function cleanupSpeech(raw) {
  return String(raw || '')
    .replace(/\b(um+|uh+|erm+|ah+|like|you know|basically|actually)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

function parseRelativeTime(text) {
  const ago = text.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\s+ago/i);
  if (ago) {
    const n = parseFloat(ago[1]);
    const mins = /hour|hr/i.test(ago[2]) ? n * 60 : n;
    return new Date(Date.now() - mins * 60000).toISOString();
  }
  return nowIso();
}

function mlFromText(text) {
  const oz = text.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/i);
  if (oz) return Math.round(parseFloat(oz[1]) * 30);
  const ml = text.match(/(\d+(?:\.\d+)?)\s*(ml|milliliters?)\b/i);
  if (ml) return Math.round(parseFloat(ml[1]));
  return null;
}

function minutesFromText(text) {
  const m = text.match(/(\d+)\s*(minutes?|mins?)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function isQuery(text) {
  return /when|how many|last (feed|eat|bottle|nap|diaper)|did she|has she|who (logged|fed|changed)/i.test(text);
}

function ozFromMl(ml) {
  if (!ml) return '';
  const oz = ml / 30;
  return Number.isInteger(oz) ? `${oz} oz` : `${oz.toFixed(1)} oz`;
}

export function labelEvent(event) {
  if (event.type === 'feed') {
    if (event.subtype === 'breast_left') {
      return event.durationMin ? `Left breast, ${event.durationMin} min` : 'Left breast';
    }
    if (event.subtype === 'breast_right') {
      return event.durationMin ? `Right breast, ${event.durationMin} min` : 'Right breast';
    }
    return event.amountMl ? `Bottle, ${ozFromMl(event.amountMl)}` : 'Bottle';
  }
  if (event.type === 'nap') {
    if (event.subtype === 'nap_start') return 'Nap started';
    return event.durationMin ? `Nap ended, ${event.durationMin} min` : 'Nap ended';
  }
  if (event.subtype === 'dirty') return 'Dirty diaper';
  if (event.subtype === 'both') return 'Wet and dirty diaper';
  return 'Wet diaper';
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function relTime(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
}

function pluralMinutes(n) {
  return `${n} minute${n === 1 ? '' : 's'}`;
}

function caregiverName(ctx, id) {
  const list = ctx.caregivers || [];
  const found = list.find((c) => c.id === id);
  return found?.name || 'Someone';
}

function findOpenNap(events) {
  let open = null;
  for (const event of events || []) {
    if (event.type === 'nap' && event.subtype === 'nap_start') open = event;
    if (event.type === 'nap' && event.subtype === 'nap_end') open = null;
  }
  return open;
}

function lastOfType(events, type) {
  const list = [...(events || [])].reverse();
  return list.find((e) => e.type === type && e.subtype !== 'nap_start')
    || list.find((e) => e.type === type)
    || null;
}

function replyFor(events, babyName) {
  return events.map((e) => {
    if (e.type === 'feed') return `Logged ${labelEvent(e).toLowerCase()}.`;
    if (e.type === 'nap' && e.subtype === 'nap_start') {
      return `Logged that ${babyName} is down for a nap.`;
    }
    if (e.type === 'nap') {
      return e.durationMin
        ? `Logged wake-up after about ${pluralMinutes(e.durationMin)}.`
        : `Logged that ${babyName} is up.`;
    }
    return `Logged a ${labelEvent(e).toLowerCase()}.`;
  }).join(' ');
}

function answerQuery(text, ctx) {
  const babyName = ctx.babyName || 'Baby';
  const events = ctx.events || [];

  if (/how many/.test(text) && /feed|bottle|ate/i.test(text)) {
    const n = events.filter((e) => e.type === 'feed').length;
    return {
      intent: 'query',
      events: [],
      reply: n
        ? `${babyName} has had ${n} feed${n === 1 ? '' : 's'} so far today.`
        : 'No feeds logged yet today.',
    };
  }

  if (/how many/.test(text) && /diaper/i.test(text)) {
    const n = events.filter((e) => e.type === 'diaper').length;
    return {
      intent: 'query',
      events: [],
      reply: n ? `${n} diaper${n === 1 ? '' : 's'} logged today.` : 'No diapers logged yet today.',
    };
  }

  if (/nap/i.test(text) && /last|when|is she/i.test(text)) {
    const open = findOpenNap(events);
    if (open) {
      return {
        intent: 'query',
        events: [],
        reply: `${babyName} is still down. ${caregiverName(ctx, open.caregiverId)} logged the start at ${fmtTime(open.occurredAt)}.`,
      };
    }
    const last = [...events].reverse().find((e) => e.type === 'nap');
    return {
      intent: 'query',
      events: [],
      reply: last
        ? `Last nap update was ${relTime(last.occurredAt)}, logged by ${caregiverName(ctx, last.caregiverId)}.`
        : 'No naps logged yet today.',
    };
  }

  const last = lastOfType(events, 'feed');
  if (last) {
    return {
      intent: 'query',
      events: [],
      reply: `Last feed was ${relTime(last.occurredAt)} — ${labelEvent(last)}, logged by ${caregiverName(ctx, last.caregiverId)}.`,
    };
  }

  return {
    intent: 'query',
    events: [],
    reply: "Nothing is on today's log yet. Tell me about a feed, nap, or diaper.",
  };
}

/**
 * @param {string} raw
 * @param {string} caregiverId
 * @param {{ babyName?: string, events?: Array, caregivers?: Array }} [ctx]
 */
export function parseLocal(raw, caregiverId, ctx = {}) {
  const cleaned = cleanupSpeech(raw);
  const text = cleaned.trim();
  const babyName = ctx.babyName || 'Baby';
  const eventsToday = ctx.events || [];

  if (!text) {
    return {
      intent: 'unclear',
      events: [],
      reply: "I didn't catch that. Try a feed, a nap, or a diaper.",
    };
  }

  if (looksMedical(text)) {
    return { intent: 'medical', events: [], reply: MEDICAL_REFUSAL };
  }

  if (isQuery(text)) return answerQuery(text, ctx);

  const events = [];
  const occurredAt = parseRelativeTime(text);

  const mentionsFeed = /\b(feed|fed|feeding|bottle|breast|nursed?|nursing|formula|ate|eat|drank|ounces?|oz|ml|milliliters?)\b/i.test(text);
  const mentionsNap = /\b(nap|napping|asleep|sleeping|slept|put (her|him|them) down|down for|woke|she's up|shes up|up from)\b/i.test(text);
  const mentionsDiaper = /\b(diaper|wet|dirty|poop|poopy|pee|soiled|blowout|changed)\b/i.test(text);

  if (mentionsFeed) {
    let subtype = 'bottle';
    if (/\bleft\b/i.test(text)) subtype = 'breast_left';
    else if (/\bright\b/i.test(text)) subtype = 'breast_right';
    else if (/\bbreast|nursed?|nursing\b/i.test(text)) subtype = 'breast_left';
    events.push({
      type: 'feed',
      subtype,
      amountMl: mlFromText(text),
      durationMin: minutesFromText(text),
      occurredAt,
      caregiverId,
      confidence: 'high',
    });
  }

  if (mentionsNap) {
    const waking = /\b(woke|wake|up from|she's up|shes up|up now|done napping|finished (her |the )?nap)\b/i.test(text);
    const open = findOpenNap(eventsToday);
    if (waking && open) {
      const durationMin = Math.max(
        1,
        Math.round((Date.now() - new Date(open.occurredAt).getTime()) / 60000),
      );
      events.push({
        type: 'nap',
        subtype: 'nap_end',
        durationMin,
        occurredAt,
        caregiverId,
        confidence: 'high',
      });
    } else if (waking && !open) {
      events.push({
        type: 'nap',
        subtype: 'nap_end',
        durationMin: minutesFromText(text),
        occurredAt,
        caregiverId,
        confidence: 'high',
      });
    } else {
      events.push({
        type: 'nap',
        subtype: 'nap_start',
        occurredAt,
        caregiverId,
        confidence: 'high',
      });
    }
  }

  if (mentionsDiaper) {
    let subtype = 'wet';
    if (/\b(both|wet and dirty)\b/i.test(text)) subtype = 'both';
    else if (/\b(dirty|poop|poopy|soiled|blowout)\b/i.test(text)) subtype = 'dirty';
    events.push({
      type: 'diaper',
      subtype,
      occurredAt,
      caregiverId,
      confidence: 'high',
    });
  }

  if (!events.length) {
    return {
      intent: 'unclear',
      events: [],
      reply: 'I can log a feed, a nap, or a diaper — or answer when the last one happened.',
    };
  }

  return {
    intent: 'log',
    events,
    reply: replyFor(events, babyName),
  };
}

export { findOpenNap, pluralMinutes };
