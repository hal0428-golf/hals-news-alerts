import { readFileSync, writeFileSync } from 'node:fs';

import { Candidate, clusterStories, findCandidates } from './cluster';
import { FEEDS } from './feeds';
import { parseStories, Story } from './parse';
import { LIMITS, State, decide, emptyState, localParts, normalizeState, pruneState } from './policy';
import { alertMessage, sendPush } from './push';

// Usage: tsx src/run.ts --mode run|dry-run|test
//   run      normal scheduled behaviour: send an alert if one qualifies, save state
//   dry-run  show what would happen; sends nothing and saves nothing
//   test     send one test notification right now (ignores limits), saves nothing
const mode = process.argv[process.argv.indexOf('--mode') + 1] ?? 'run';
const STATE_PATH = new URL('../state/state.json', import.meta.url);

function loadState(): State {
  try {
    return normalizeState(JSON.parse(readFileSync(STATE_PATH, 'utf8')));
  } catch {
    return emptyState();
  }
}

async function fetchAll(): Promise<{ stories: Story[]; ok: number }> {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        headers: { 'user-agent': 'HalsNewsAlerts/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseStories(await res.text(), f.source);
    }),
  );
  const stories: Story[] = [];
  let ok = 0;
  results.forEach((r, i) => {
    const name = FEEDS[i]!.source;
    if (r.status === 'fulfilled') {
      ok++;
      stories.push(...r.value);
      console.log(`  ${name}: ${r.value.length} stories`);
    } else {
      console.log(`  ${name}: FAILED (${(r.reason as Error).message})`);
    }
  });
  return { stories, ok };
}

function describe(c: Candidate): string {
  const outlets = [...new Set(c.reports.map((r) => r.source))].join(', ');
  return `[${c.reason}, ${c.outlets} outlet(s): ${outlets}] ${c.story.source}: ${c.story.title}`;
}

async function main() {
  const token = process.env.EXPO_PUSH_TOKEN ?? '';
  const now = new Date();

  if (mode === 'test') {
    await sendPush(token, {
      title: "Hal's News test alert",
      body: 'If you can see this, breaking-news alerts are set up correctly.',
      url: 'https://www.npr.org',
    });
    console.log('Test notification accepted by Expo.');
    return;
  }

  console.log(`Checking ${FEEDS.length} feeds at ${now.toISOString()} (mode: ${mode})`);
  const { stories, ok } = await fetchAll();
  if (ok === 0) throw new Error('Could not load any feed.');

  const candidates = findCandidates(stories, now);
  let state = pruneState(loadState(), now);
  const decision = decide(candidates, state, now);

  if (mode === 'dry-run') {
    // Wider than the real rule (6 hours) so a single dry run shows how often stories spread.
    const wide = stories.filter((s) => s.publishedAt && now.getTime() - s.publishedAt.getTime() < 360 * 60000);
    console.log(`\n${wide.length} stories from the last 6 hours. Stories reported by 2+ outlets (most outlets first):`);
    const groups = clusterStories(wide)
      .map((g) => ({ g, outlets: new Set(g.map((s) => s.source)) }))
      .filter((x) => x.outlets.size >= 2)
      .sort((a, b) => b.outlets.size - a.outlets.size);
    for (const { g, outlets } of groups.slice(0, 20)) {
      const newest = Math.max(...g.map((s) => s.publishedAt!.getTime()));
      const mins = Math.round((now.getTime() - newest) / 60000);
      console.log(`  ${outlets.size} outlets (${[...outlets].join(', ')}), newest ${mins} min ago: ${g[0]!.title}`);
    }
    console.log(`\nQualifying as breaking: ${candidates.length}`);
    candidates.forEach((c) => console.log('  ' + describe(c)));
    console.log(`\nDecision: ${decision.send ? 'WOULD SEND ' + describe(decision.send) : 'no alert (' + decision.reason + ')'}`);
    return;
  }

  let dirty = false;
  if (decision.send) {
    const c = decision.send;
    await sendPush(token, alertMessage(c.story.title, c.story.source, c.story.url));
    state.sent.push({ at: now.toISOString(), url: c.story.url, title: c.story.title });
    dirty = true;
    console.log('Sent: ' + describe(c));
  } else {
    console.log('No alert: ' + decision.reason);
  }

  // Keep-alive: GitHub switches off scheduled runs in a public repository after 60 days with no
  // repository activity. Recording a date about once a week produces a small commit.
  const today = localParts(now).date;
  const heartbeatAge = state.heartbeat ? (Date.parse(today) - Date.parse(state.heartbeat)) / 86400000 : Infinity;
  if (heartbeatAge >= 7) {
    state = { ...state, heartbeat: today };
    dirty = true;
  }

  if (dirty) writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
