import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseStories } from '../src/parse';
import { alertMessage, isExpoPushToken } from '../src/push';

const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Feed</title>
<item><title><![CDATA[Senate passes <b>bill</b> &amp; more]]></title><link>http://example.com/a</link><pubDate>Thu, 15 Oct 2026 16:55:00 +0000</pubDate></item>
<item><title>Second &amp; story</title><link>https://example.com/b</link><pubDate>Thu, 15 Oct 2026 16:00:00 GMT</pubDate></item>
<item><title>No link here</title></item>
<item><title>Bad date</title><link>https://example.com/c</link><pubDate>nonsense</pubDate></item>
</channel></rss>`;

test('parses titles, https links and dates; skips items without a link', () => {
  const s = parseStories(xml, 'Test');
  assert.equal(s.length, 3);
  assert.equal(s[0]!.title, 'Senate passes bill & more');
  assert.equal(s[0]!.url, 'https://example.com/a');
  assert.equal(s[0]!.publishedAt?.toISOString(), '2026-10-15T16:55:00.000Z');
  assert.equal(s[1]!.title, 'Second & story');
  assert.equal(s[2]!.publishedAt, null);
});

test('handles a feed with a single item and respects the limit', () => {
  const one = '<rss><channel><item><title>Only</title><link>https://e.com/1</link></item></channel></rss>';
  assert.equal(parseStories(one, 'T').length, 1);
  assert.equal(parseStories(xml, 'T', 1).length, 1);
  assert.equal(parseStories('<html></html>', 'T').length, 0);
});

test('push token format check', () => {
  assert.ok(isExpoPushToken('ExponentPushToken[AbC123_-xyz]'));
  assert.ok(isExpoPushToken('ExpoPushToken[AbC123]'));
  assert.ok(!isExpoPushToken(''));
  assert.ok(!isExpoPushToken('ExponentPushToken[]'));
  assert.ok(!isExpoPushToken('abc'));
});

test('alert text is short enough and carries the link', () => {
  const m = alertMessage('x'.repeat(300), 'NPR', 'https://npr.org/a');
  assert.ok(m.body.length <= 160);
  assert.equal(m.title, 'Breaking news · NPR');
  assert.equal(m.url, 'https://npr.org/a');
});
