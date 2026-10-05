/** Simple in-process pub/sub for multi-device live sync (SSE). */
const channels = new Map();

export function subscribe(householdId, res) {
  if (!channels.has(householdId)) channels.set(householdId, new Set());
  channels.get(householdId).add(res);
  return () => {
    channels.get(householdId)?.delete(res);
  };
}

export function publish(householdId, payload) {
  const set = channels.get(householdId);
  if (!set?.size) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch {
      set.delete(res);
    }
  }
}
