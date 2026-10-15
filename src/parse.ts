import { XMLParser } from 'fast-xml-parser';

export interface Story {
  title: string;
  url: string;
  source: string;
  publishedAt: Date | null;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
});

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return text((value as { '#text': unknown })['#text']);
  }
  return '';
}

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse an RSS 2.0 feed into at most `limit` stories (newest-first feeds are the norm). */
export function parseStories(xml: string, source: string, limit = 25): Story[] {
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item;
  const items: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const out: Story[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const title = plain(text(item.title));
    let url = text(item.link);
    if (/^http:\/\//i.test(url)) url = 'https://' + url.slice(7);
    if (!title || !/^https:\/\//i.test(url)) continue;
    const ms = Date.parse(text(item.pubDate));
    out.push({ title, url, source, publishedAt: Number.isNaN(ms) ? null : new Date(ms) });
    if (out.length >= limit) break;
  }
  return out;
}
