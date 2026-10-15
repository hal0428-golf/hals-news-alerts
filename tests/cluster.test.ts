import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findCandidates, sameStory, tokens, clusterStories } from '../src/cluster';
import { Story } from '../src/parse';

const NOW = new Date('2026-10-15T17:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60000);
let n = 0;
const story = (source: string, title: string, min: number | null): Story => ({
  source,
  title,
  url: `https://example.com/${source.replace(/\W/g, '')}/${n++}`,
  publishedAt: min === null ? null : ago(min),
});

const SCOTUS = [
  story('NPR', 'Supreme Court strikes down Trump tariffs in 6-3 ruling', 12),
  story('Fox News', "Supreme Court strikes down Trump's sweeping tariffs", 10),
  story('Washington Examiner', 'Justices strike down Trump tariffs, ruling against White House', 9),
  story('National Review', 'Supreme Court tariffs ruling: Trump loses at the high court', 8),
  story('Daily Caller', 'Trump tariffs struck down by Supreme Court majority', 5),
];

test('tokens drop short and filler words and trim plurals', () => {
  const t = tokens("Supreme Court strikes down Trump's tariffs");
  assert.ok(t.has('supreme') && t.has('court') && t.has('strike') && t.has('trump') && t.has('tariff'));
  assert.ok(!t.has('down'));
});

test('same story with different wording is recognized', () => {
  assert.ok(sameStory(SCOTUS[0]!.title, SCOTUS[2]!.title));
});

test('different stories are not matched', () => {
  assert.ok(!sameStory('Supreme Court strikes down Trump tariffs', 'Hurricane forecast shifts toward Florida coast'));
  assert.ok(!sameStory('Trump signs executive order on housing', 'Trump visits Texas border for rally'));
});

test('a story covered by 3+ outlets including NPR or Fox is a candidate; headline comes from the highest-priority outlet', () => {
  const c = findCandidates(SCOTUS, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.reason, 'multi-outlet');
  assert.equal(c[0]!.outlets, 5);
  assert.equal(c[0]!.story.source, 'NPR');
});

test('2 outlets is not enough, 3 is', () => {
  assert.equal(findCandidates(SCOTUS.slice(0, 2), NOW).length, 0);
  assert.equal(findCandidates(SCOTUS.slice(0, 3), NOW).length, 1);
});

test('3 outlets that do not include NPR or Fox News is not enough', () => {
  const commentary = SCOTUS.slice(2, 5); // Washington Examiner, National Review, Daily Caller
  assert.equal(findCandidates(commentary, NOW).length, 0);
  assert.equal(findCandidates([...commentary, SCOTUS[1]!], NOW).length, 1);
});

test('the same outlet reporting twice counts once', () => {
  const dup = [SCOTUS[0]!, SCOTUS[1]!, story('NPR', 'Supreme Court tariffs ruling explained: what Trump loses', 4)];
  assert.equal(findCandidates(dup, NOW).length, 0);
});

test('old coverage is ignored', () => {
  const old = SCOTUS.map((s, i) => ({ ...s, publishedAt: ago(120 + i) }));
  assert.equal(findCandidates(old, NOW).length, 0);
});

test('a story whose newest report is over 45 minutes old is no longer news', () => {
  const stale = SCOTUS.map((s, i) => ({ ...s, publishedAt: ago(50 + i) }));
  assert.equal(findCandidates(stale, NOW).length, 0);
});

test('undated and future-dated stories are ignored', () => {
  const bad = SCOTUS.map((s, i) => ({ ...s, publishedAt: i < 2 ? null : new Date(NOW.getTime() + 3600000) }));
  assert.equal(findCandidates(bad, NOW).length, 0);
});

test('unrelated headlines do not combine into a false cluster', () => {
  const mixed = [
    story('NPR', 'Supreme Court strikes down Trump tariffs', 5),
    story('Fox News', 'Hurricane forecast shifts toward Florida coast', 5),
    story('Daily Wire', 'Senate confirms new ambassador to Japan', 5),
    story('Breitbart', 'Tiger Woods announces return to competitive golf', 5),
    story('Free Beacon', 'Pentagon unveils new drone procurement plan', 5),
  ];
  assert.equal(findCandidates(mixed, NOW).length, 0);
  assert.equal(clusterStories(mixed).length, 5);
});

test('an NPR or Fox "BREAKING:" tag counts on its own when fresh', () => {
  const c = findCandidates([story('Fox News', 'BREAKING: Major earthquake strikes off California coast', 10)], NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.reason, 'tagged');
  assert.equal(c[0]!.story.title, 'Major earthquake strikes off California coast');
});

test('a BREAKING tag from another outlet, or an old one, does not count', () => {
  assert.equal(findCandidates([story('Breitbart', 'BREAKING: something happened', 5)], NOW).length, 0);
  assert.equal(findCandidates([story('NPR', 'Breaking: old news', 40)], NOW).length, 0);
});

test('the word breaking inside a headline is not a tag', () => {
  assert.equal(findCandidates([story('NPR', 'Why breaking up the big banks is back on the table', 5)], NOW).length, 0);
});

test('the most widely covered story comes first', () => {
  const other = [
    story('NPR', 'Federal Reserve cuts interest rates by half point', 20),
    story('Fox News', 'Fed cuts interest rates half point surprising markets', 18),
    story('Daily Wire', 'Federal Reserve interest rates cut half point', 17),
    story('Breitbart', 'Fed slashes interest rates by half point', 16),
  ];
  const c = findCandidates([...other, ...SCOTUS], NOW);
  assert.equal(c.length, 2);
  assert.equal(c[0]!.outlets, 5);
  assert.equal(c[1]!.outlets, 4);
});
