import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Candidate } from '../src/cluster';
import { LIMITS, State, decide, inQuietHours, localParts, normalizeState, pruneState } from '../src/policy';

// October 15 2026 is Central Daylight Time (UTC-5).
const at = (utc: string) => new Date(utc);
const NOON = at('2026-10-15T17:00:00Z'); // 12:00 CDT

const cand = (title: string, url = 'https://example.com/a', outlets = 5): Candidate => {
  const story = { title, url, source: 'NPR', publishedAt: NOON };
  return { story, reports: [story], outlets, reason: 'multi-outlet', newest: NOON };
};
const empty: State = { sent: [], heartbeat: '' };

test('Central time parts follow daylight saving', () => {
  assert.deepEqual(localParts(at('2026-10-15T17:00:00Z')), { date: '2026-10-15', hour: 12 });
  assert.deepEqual(localParts(at('2026-12-15T17:00:00Z')), { date: '2026-12-15', hour: 11 });
  assert.deepEqual(localParts(at('2026-10-16T04:30:00Z')), { date: '2026-10-15', hour: 23 });
});

test('quiet hours are 10 pm to 6 am Central', () => {
  assert.equal(inQuietHours(at('2026-10-16T03:00:00Z')), true); // 22:00
  assert.equal(inQuietHours(at('2026-10-16T05:00:00Z')), true); // 00:00
  assert.equal(inQuietHours(at('2026-10-16T10:59:00Z')), true); // 05:59
  assert.equal(inQuietHours(at('2026-10-16T11:00:00Z')), false); // 06:00
  assert.equal(inQuietHours(at('2026-10-16T02:59:00Z')), false); // 21:59
  assert.equal(inQuietHours(NOON), false);
});

test('sends the first candidate when everything allows it', () => {
  const d = decide([cand('Big story one')], empty, NOON);
  assert.equal(d.send?.story.title, 'Big story one');
});

test('nothing when there are no candidates', () => {
  assert.equal(decide([], empty, NOON).send, null);
});

test('holds alerts during quiet hours', () => {
  const d = decide([cand('Big story one')], empty, at('2026-10-16T05:00:00Z'));
  assert.equal(d.send, null);
  assert.equal(d.reason, 'quiet hours');
});

test('stops at 5 alerts per Central day, and resets the next day', () => {
  const sent = [0, 1, 2, 3, 4].map((i) => ({
    at: at(`2026-10-15T${String(12 + i).padStart(2, '0')}:00:00Z`).toISOString(),
    url: `https://example.com/${i}`,
    title: `Different story number ${i} about topic${i}`,
  }));
  const full: State = { sent, heartbeat: '' };
  const later = at('2026-10-15T22:30:00Z'); // 17:30 CDT, same day
  assert.match(decide([cand('Brand new unrelated headline words appear')], full, later).reason, /daily limit/);
  const nextDay = at('2026-10-16T15:00:00Z'); // 10:00 CDT next day
  assert.ok(decide([cand('Brand new unrelated headline words appear')], full, nextDay).send);
});

test('waits 20 minutes between alerts', () => {
  const state: State = {
    sent: [{ at: at('2026-10-15T16:50:00Z').toISOString(), url: 'https://example.com/x', title: 'Older story about weather' }],
    heartbeat: '',
  };
  assert.match(decide([cand('Fresh story about economy numbers')], state, NOON).reason, /minutes since/);
  assert.ok(decide([cand('Fresh story about economy numbers')], state, at('2026-10-15T17:15:00Z')).send);
});

test('does not repeat a story already sent (same link or same story reworded)', () => {
  const state: State = {
    sent: [{ at: at('2026-10-15T14:00:00Z').toISOString(), url: 'https://example.com/a', title: 'Supreme Court strikes down Trump tariffs' }],
    heartbeat: '',
  };
  assert.match(decide([cand('Something else entirely', 'https://example.com/a')], state, NOON).reason, /already sent/);
  assert.match(decide([cand('Justices strike down Trump tariffs in ruling', 'https://example.com/b')], state, NOON).reason, /already sent/);
  assert.ok(decide([cand('Hurricane forecast shifts toward Florida coast', 'https://example.com/c')], state, NOON).send);
});

test('skips an already-sent candidate and sends the next one', () => {
  const state: State = {
    sent: [{ at: at('2026-10-15T14:00:00Z').toISOString(), url: 'https://example.com/a', title: 'Supreme Court strikes down Trump tariffs' }],
    heartbeat: '',
  };
  const d = decide(
    [cand('Supreme Court strikes down Trump tariffs', 'https://example.com/a'), cand('Hurricane forecast shifts toward Florida coast', 'https://example.com/c', 4)],
    state,
    NOON,
  );
  assert.equal(d.send?.story.url, 'https://example.com/c');
});

test('old sent alerts are forgotten after 48 hours', () => {
  const state: State = {
    sent: [
      { at: at('2026-10-10T12:00:00Z').toISOString(), url: 'u1', title: 't1' },
      { at: at('2026-10-15T12:00:00Z').toISOString(), url: 'u2', title: 't2' },
    ],
    heartbeat: '2026-10-01',
  };
  const pruned = pruneState(state, NOON);
  assert.deepEqual(pruned.sent.map((s) => s.url), ['u2']);
  assert.equal(pruned.heartbeat, '2026-10-01');
});

test('damaged state files are repaired', () => {
  assert.deepEqual(normalizeState(null), { sent: [], heartbeat: '' });
  assert.deepEqual(normalizeState({ sent: [{ at: 1 }, { at: 'x', url: 'u', title: 't' }], heartbeat: 5 }), {
    sent: [{ at: 'x', url: 'u', title: 't' }],
    heartbeat: '',
  });
  assert.equal(LIMITS.dailyCap, 5);
});
