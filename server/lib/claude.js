import Anthropic from '@anthropic-ai/sdk';
import {
  getTodaysEvents,
  getOpenNap,
  getLastOfType,
  getHouseholdById,
  listMembers,
  weekOfLife,
} from './db.js';
import { labelEvent } from './parseLocal.js';
import { validateEvents, sanitizeReply, looksMedical, MEDICAL_REFUSAL } from './guardrails.js';

const SYSTEM = `You are Duet, a calm household care log for a baby's first weeks.
You are NOT a clinician. Never diagnose, interpret symptoms, recommend medicine, or say what anyone "should" do medically.

You only help with logging feed / nap / diaper events, answering factual questions from the provided log, and short calm replies (1–2 sentences).

If the user asks about fever, medicine, illness, "is this normal?", or anything clinical, set intent to "medical" and do not invent events.

Return ONLY a single JSON object (no markdown):
{
  "intent": "log" | "query" | "medical" | "unclear",
  "events": [
    {
      "type": "feed" | "nap" | "diaper",
      "subtype": "bottle" | "breast_left" | "breast_right" | "nap_start" | "nap_end" | "wet" | "dirty" | "both",
      "amountMl": number | null,
      "durationMin": number | null,
      "occurredAt": ISO-8601 string,
      "confidence": "high" | "low",
      "notes": string | null
    }
  ],
  "reply": "short calm sentence"
}

Rules:
- Resolve relative times against the provided now.
- Convert ounces to milliliters (1 oz ≈ 30 ml).
- If a nap is open and the baby is up, emit nap_end with duration.
- Queries: answer only from the event list.
- medical: empty events, refusal pointing them to their pediatrician.`;

function buildContext(householdId, memberId) {
  const household = getHouseholdById(householdId);
  const members = listMembers(householdId);
  const member = members.find((m) => m.id === memberId) || members[0];
  const events = getTodaysEvents(householdId);
  const openNap = getOpenNap(householdId);
  const lastFeed = getLastOfType(householdId, 'feed');
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));

  return {
    now: new Date().toISOString(),
    babyName: household.babyName,
    week: weekOfLife(household.birthDate),
    caregiver: { id: member.id, name: member.name, role: member.role },
    openNap,
    lastFeed,
    todaysEvents: events.map((e) => ({
      ...e,
      label: labelEvent(e),
      caregiverName: byId[e.memberId]?.name || 'Someone',
    })),
  };
}

function extractJson(text) {
  const trimmed = (text || '').trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function runTurnWithClaude(transcript, householdId, memberId, apiKey) {
  if (looksMedical(transcript)) {
    return { intent: 'medical', events: [], reply: MEDICAL_REFUSAL, source: 'guard' };
  }

  const client = new Anthropic({ apiKey });
  const context = buildContext(householdId, memberId);

  const message = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 800,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Context:\n${JSON.stringify(context, null, 2)}\n\nCaregiver utterance:\n"""${transcript}"""`,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const parsed = extractJson(text);
  const intent = ['log', 'query', 'medical', 'unclear'].includes(parsed.intent)
    ? parsed.intent
    : 'unclear';

  let events = [];
  if (intent === 'log') {
    events = validateEvents(parsed.events || []).map((e) => ({
      ...e,
      memberId,
      caregiverId: memberId,
    }));
  }

  return {
    intent,
    events,
    reply: sanitizeReply(parsed.reply || 'Okay.', intent),
    source: 'claude',
  };
}

export async function runSummaryWithClaude(factualText, apiKey) {
  if (!apiKey) return factualText;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 600,
      system:
        'Rewrite the household care log into a calm, factual day note for caregivers or a pediatrician visit. Do not add advice, diagnosis, or interpretation. Keep counts and times. End with: This is a household log for organization only. It is not medical advice.',
      messages: [{ role: 'user', content: factualText }],
    });
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return sanitizeReply(text, 'query') === MEDICAL_REFUSAL ? factualText : text;
  } catch {
    return factualText;
  }
}
