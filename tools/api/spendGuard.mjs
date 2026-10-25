// A small spend guard for the server-side Gemini key. The key on a deployed
// box has money behind it and the box is public, so each visitor gets a few
// calls a minute and the box as a whole gets a daily allowance. Past either,
// the call is refused with a plain sentence rather than spent. Counters live
// in memory: a restart forgets them, which is the right trade for a demo box.
//
// Tunables come from the environment on the box (see docs/credentials.md):
//   GEMINI_PER_MINUTE  calls one address may make per minute   (default 10)
//   GEMINI_PER_DAY     calls the whole box may make per UTC day (default 500)

export function makeSpendGuard({ perMinute = 10, perDay = 500, now = Date.now } = {}) {
  const minute = new Map(); // address -> { windowStart, count }
  let day = { key: '', count: 0 };

  function check(address) {
    const t = now();
    const dayKey = new Date(t).toISOString().slice(0, 10);
    if (day.key !== dayKey) day = { key: dayKey, count: 0 };
    if (day.count >= perDay) {
      return { ok: false, status: 429, error: `the daily allowance of ${perDay} Gemini calls is used up; it resets at midnight UTC` };
    }
    const slot = minute.get(address);
    if (!slot || t - slot.windowStart >= 60_000) {
      minute.set(address, { windowStart: t, count: 1 });
    } else if (slot.count >= perMinute) {
      const wait = Math.ceil((60_000 - (t - slot.windowStart)) / 1000);
      return { ok: false, status: 429, error: `${perMinute} Gemini calls a minute is the limit; try again in ${wait}s` };
    } else {
      slot.count += 1;
    }
    day.count += 1;
    if (minute.size > 5000) for (const [k, v] of minute) if (t - v.windowStart >= 60_000) minute.delete(k);
    return { ok: true, remainingToday: perDay - day.count };
  }

  return { check };
}

// The visitor's address as nginx reports it, falling back to the socket's.
export function clientAddress(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
