// Telemetry client.
//
// Every lane edit, filter verdict and parameter sweep is a time-series row.
// The browser posts them to /api/events; the server (tools/api/server.mjs)
// writes them into a Timescale hypertable when one is configured. If no server
// is running the calls fail silently and the app carries on — the panel then
// says so rather than inventing numbers.

const QUEUE = [];
let serverState = 'unknown'; // unknown | live | absent

export function logEvent(kind, payload = {}) {
  const row = { kind, at: new Date().toISOString(), ...payload };
  QUEUE.push(row);
  if (QUEUE.length > 200) QUEUE.shift();
  if (serverState === 'absent') return;
  fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(row),
    keepalive: true,
  })
    .then((res) => {
      serverState = res.ok ? 'live' : 'absent';
    })
    .catch(() => {
      serverState = 'absent';
    });
}

export async function roomPanel() {
  try {
    const res = await fetch('/api/room');
    if (!res.ok) throw new Error(String(res.status));
    serverState = 'live';
    return await res.json();
  } catch {
    serverState = 'absent';
    return null;
  }
}

export function localEvents() {
  return [...QUEUE];
}

export function telemetryState() {
  return serverState;
}
