export const MEDICAL_REFUSAL =
  "Duet can't give medical advice or help with symptoms or medicine. If you're worried, call your pediatrician or emergency services. I can still log a feed, nap, or diaper.";

export const MEDICAL_RE =
  /\b(tylenol|acetaminophen|ibuprofen|motrin|advil|aspirin|antibiotic|medicine|medication|dose|fever|temperature|degrees|rash|vomit|vomiting|seizure|breathing|diagnose|diagnosis|pediatrician said|is this normal|should i|sick|illness|infection|vaccine|immunization|colic medicine|reflux med|benadryl|what's wrong|what is wrong|emergency|er\b|hospital|should we give|is she okay|is she alright)\b/i;

const ADVICE_RE =
  /\b(you should|you must|give (her|him|them) (tylenol|ibuprofen|motrin|advil|aspirin|medicine)|this sounds like|sounds like (a |an )?(fever|infection|virus|flu|cold)|take (her|him) to (the )?(er|emergency)|i (recommend|diagnose)|dosage|mg of)\b/i;

export function looksMedical(text) {
  return MEDICAL_RE.test(text || '');
}

export function sanitizeReply(reply, intent) {
  if (intent === 'medical' || ADVICE_RE.test(reply || '')) {
    return MEDICAL_REFUSAL;
  }
  return reply;
}

export function validateEvents(events) {
  if (!Array.isArray(events)) return [];
  const allowedTypes = new Set(['feed', 'nap', 'diaper']);
  const allowedSub = new Set([
    'bottle', 'breast_left', 'breast_right',
    'nap_start', 'nap_end',
    'wet', 'dirty', 'both',
  ]);

  return events.filter((e) => {
    if (!e || !allowedTypes.has(e.type) || !allowedSub.has(e.subtype)) return false;
    if (e.type === 'feed' && !['bottle', 'breast_left', 'breast_right'].includes(e.subtype)) return false;
    if (e.type === 'nap' && !['nap_start', 'nap_end'].includes(e.subtype)) return false;
    if (e.type === 'diaper' && !['wet', 'dirty', 'both'].includes(e.subtype)) return false;
    return true;
  }).map((e) => ({
    type: e.type,
    subtype: e.subtype,
    amountMl: typeof e.amountMl === 'number' ? e.amountMl : null,
    durationMin: typeof e.durationMin === 'number' ? e.durationMin : null,
    notes: typeof e.notes === 'string' ? e.notes.slice(0, 200) : null,
    occurredAt: e.occurredAt || new Date().toISOString(),
    confidence: e.confidence === 'low' ? 'low' : 'high',
  }));
}
