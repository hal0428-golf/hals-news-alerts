export interface Feed {
  source: string;
  url: string;
}

/**
 * The outlets watched for breaking news. Order = priority when choosing which outlet's headline
 * is shown in the alert. Keep in sync with MAIN_FEEDS in the app's src/tabs.ts (a test checks this).
 */
export const FEEDS: Feed[] = [
  { source: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
  { source: 'Fox News', url: 'https://moxie.foxnews.com/google-publisher/latest.xml' },
  { source: 'Washington Examiner', url: 'https://www.washingtonexaminer.com/feed' },
  { source: 'National Review', url: 'https://www.nationalreview.com/feed/' },
  { source: 'Daily Wire', url: 'https://www.dailywire.com/feeds/rss.xml' },
  { source: 'Daily Caller', url: 'https://dailycaller.com/feed/' },
  { source: 'Breitbart', url: 'https://feeds.feedburner.com/breitbart' },
  { source: 'Free Beacon', url: 'https://freebeacon.com/feed/' },
  { source: 'The Federalist', url: 'https://thefederalist.com/feed/' },
  { source: 'Blaze Media', url: 'https://www.theblaze.com/feeds/feed.rss' },
  { source: 'Just the News', url: 'https://justthenews.com/rss.xml' },
];
