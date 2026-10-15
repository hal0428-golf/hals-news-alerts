import { Candidate, sameStory } from './cluster';

/** How often and when alerts may be sent. Change these to taste. */
export const LIMITS = {
  dailyCap: 5,
  /** No alerts from quietStartHour (inclusive) until quietEndHour (exclusive), Central Time. */
  quietStartHour: 22,
  quietEndHour: 6,
  timeZone: 'America/Chicago',
  /** Minimum minutes between two alerts. */
  minGapMinutes: 20,
  /** Remember sent alerts this long (hours) to avoid repeating a story. */
  memoryHours: 48,
};

export interface SentAlert {
  at: string;
  url: string;
  title: string;
}

export interface State {
  sent: SentAlert[];
  /** Local date (YYYY-MM-DD) of the last keep-alive update; see run.ts. */
  heartbeat: string;
}

export function emptyState(): State {
  return { sent: [], heartbeat: '' };
}

export function normalizeState(raw: unknown): State {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as { sent?: unknown; heartbeat?: unknown };
  if (Array.isArray(r.sent)) {
    for (const x of r.sent) {
      const e = x as Partial<SentAlert>;
      if (typeof e?.at === 'string' && typeof e.url === 'string' && typeof e.title === 'string') {
        s.sent.push({ at: e.at, url: e.url, title: e.title });
      }
    }
  }
  if (typeof r.heartbeat === 'string') s.heartbeat = r.heartbeat;
  return s;
}

/** Calendar date and hour (0-23) in Central Time. */
export function localParts(d: Date, timeZone = LIMITS.timeZone): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

export function inQuietHours(now: Date, limits = LIMITS): boolean {
  const { hour } = localParts(now, limits.timeZone);
  return limits.quietStartHour > limits.quietEndHour
    ? hour >= limits.quietStartHour || hour < limits.quietEndHour
    : hour >= limits.quietStartHour && hour < limits.quietEndHour;
}

export function pruneState(state: State, now: Date, limits = LIMITS): State {
  const cutoff = now.getTime() - limits.memoryHours * 3600 * 1000;
  return { ...state, sent: state.sent.filter((s) => Date.parse(s.at) >= cutoff) };
}

export function alreadySent(c: Candidate, state: State): boolean {
  const urls = new Set(state.sent.map((s) => s.url));
  return c.reports.some(
    (r) => urls.has(r.url) || state.sent.some((s) => sameStory(s.title, r.title)),
  );
}

export interface Decision {
  send: Candidate | null;
  reason: string;
}

/** Applies quiet hours, the daily cap, spacing and repeat protection. At most one alert per run. */
export function decide(candidates: Candidate[], state: State, now: Date, limits = LIMITS): Decision {
  if (candidates.length === 0) return { send: null, reason: 'nothing qualifies as breaking right now' };
  if (inQuietHours(now, limits)) return { send: null, reason: 'quiet hours' };

  const today = localParts(now, limits.timeZone).date;
  const sentToday = state.sent.filter((s) => localParts(new Date(s.at), limits.timeZone).date === today);
  if (sentToday.length >= limits.dailyCap) {
    return { send: null, reason: `daily limit of ${limits.dailyCap} reached` };
  }

  const last = Math.max(0, ...state.sent.map((s) => Date.parse(s.at)));
  if (now.getTime() - last < limits.minGapMinutes * 60000) {
    return { send: null, reason: `less than ${limits.minGapMinutes} minutes since the last alert` };
  }

  const fresh = candidates.find((c) => !alreadySent(c, state));
  if (!fresh) return { send: null, reason: 'qualifying stories were already sent' };
  return { send: fresh, reason: 'ok' };
}
