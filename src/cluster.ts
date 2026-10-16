import { FEEDS } from './feeds';
import { Story } from './parse';

/** What counts as "breaking". Change these numbers to make alerts rarer or more frequent. */
export const RULES = {
  /** A story must be reported by at least this many different outlets... */
  minOutlets: 3,
  /** ...and at least one of them must be one of these (keeps out stories only commentary sites echo). */
  anchorOutlets: ['NPR', 'Fox News'],
  /** ...with the newest of those reports no older than this (minutes). */
  freshMinutes: 45,
  /** Only reports from the last this-many minutes are considered at all. */
  recentMinutes: 90,
  /** An outlet's own "BREAKING:" tag counts on its own if it is this fresh (minutes). */
  taggedFreshMinutes: 45,
  /** Outlets whose own "BREAKING:" tag is trusted. */
  taggedOutlets: ['NPR', 'Fox News'],
};

const STOP = new Set(
  ('about after again against also amid been before being between could does doing down from have here into ' +
    'just more most over than that their them then there these they this those through under until very want ' +
    'what when where which while will with would your says said new now news')
    .split(' '),
);

/** Significant words of a headline (4+ letters, simple plural trimming, no filler words). */
export function tokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    let w = raw;
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length < 4 || STOP.has(w)) continue;
    out.add(w);
  }
  return out;
}

/** Two headlines are about the same story if they share 3+ significant words and half the shorter one. */
export function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared >= 3 && shared / Math.min(a.size, b.size) >= 0.5;
}

export function sameStory(titleA: string, titleB: string): boolean {
  return similar(tokens(titleA), tokens(titleB));
}

export interface Candidate {
  /** The headline shown in the alert. */
  story: Story;
  /** Every report grouped into this story. */
  reports: Story[];
  outlets: number;
  reason: 'multi-outlet' | 'tagged';
  newest: Date;
}

const BREAKING_TAG = /^\s*(?:breaking|just in)\b\s*[:\-–—|]/i;

function priority(source: string): number {
  const i = FEEDS.findIndex((f) => f.source === source);
  return i < 0 ? 999 : i;
}

/** Groups similar headlines (single-link clustering). */
export function clusterStories(stories: Story[]): Story[][] {
  const toks = stories.map((s) => tokens(s.title));
  const parent = stories.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      if (similar(toks[i]!, toks[j]!)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Story[]>();
  stories.forEach((s, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(s);
    else groups.set(root, [s]);
  });
  return [...groups.values()];
}

function headlineFor(reports: Story[]): Story {
  return [...reports].sort(
    (a, b) =>
      priority(a.source) - priority(b.source) ||
      (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0),
  )[0]!;
}

/** All stories that qualify as breaking right now, strongest first. Ignores caps and quiet hours. */
export function findCandidates(all: Story[], now: Date, rules = RULES): Candidate[] {
  const minutesAgo = (s: Story) => (now.getTime() - (s.publishedAt?.getTime() ?? NaN)) / 60000;
  // Ignore undated stories and anything dated in the future (feeds with wrong clocks).
  const recent = all.filter((s) => {
    const m = minutesAgo(s);
    return Number.isFinite(m) && m >= -5 && m <= rules.recentMinutes;
  });

  const out: Candidate[] = [];
  const used = new Set<Story>();

  for (const reports of clusterStories(recent)) {
    const outlets = new Set(reports.map((r) => r.source)).size;
    const newest = new Date(Math.max(...reports.map((r) => r.publishedAt!.getTime())));
    const fresh = (now.getTime() - newest.getTime()) / 60000 <= rules.freshMinutes;
    const anchored = reports.some((r) => rules.anchorOutlets.includes(r.source));
    if (outlets >= rules.minOutlets && anchored && fresh) {
      reports.forEach((r) => used.add(r));
      out.push({ story: headlineFor(reports), reports, outlets, reason: 'multi-outlet', newest });
    }
  }

  for (const s of recent) {
    if (used.has(s)) continue;
    if (!rules.taggedOutlets.includes(s.source) || !BREAKING_TAG.test(s.title)) continue;
    if (minutesAgo(s) > rules.taggedFreshMinutes) continue;
    const title = s.title.replace(BREAKING_TAG, '').trim();
    out.push({
      story: { ...s, title },
      reports: [s],
      outlets: 1,
      reason: 'tagged',
      newest: s.publishedAt!,
    });
  }

  return out.sort((a, b) => b.outlets - a.outlets || b.newest.getTime() - a.newest.getTime());
}
