# Hal's News — breaking-news alerts

A small program that GitHub runs for free every 5 minutes. It reads the same 11 news feeds as the
app, decides whether something is big enough to be "breaking", and if so sends one push
notification to Hal's iPhone through Expo's free push service. Tapping the alert opens the article
in the app.

## What counts as breaking (src/cluster.ts, `RULES`)
- The same story (similar headlines) is reported by **3 or more different outlets, at least one of
  them NPR or Fox News**, and the newest of those reports is **under 45 minutes old**; or
- NPR or Fox News publishes a headline that starts with "BREAKING:" or "JUST IN:" in the last 30 minutes.

## How often (src/policy.ts, `LIMITS`)
- At most **5 alerts per day** (Central Time calendar day).
- **No alerts from 10 pm to 6 am Central.** A story that qualifies overnight is dropped, not saved for morning.
- At least **20 minutes** between alerts; the same story is never sent twice (remembered for 48 hours).
- At most one alert per 5-minute run; the most widely reported story goes first.

Change any of these numbers, run `npm test`, and push to GitHub.

## Files
- `src/run.ts` — the program (`--mode run | dry-run | test`)
- `state/state.json` — which alerts were sent (updated automatically; do not edit)
- `.github/workflows/breaking-news.yml` — the schedule

## Limits to know about
- GitHub starts scheduled runs when it has capacity. They can be **late by 5–30 minutes** and a run
  can occasionally be skipped. Alerts are therefore "within about half an hour", not instant.
- GitHub switches off scheduled runs in a public repository after 60 days with no activity. The
  program records a date in `state/state.json` about once a week to avoid that. If alerts ever stop,
  open the repository's **Actions** tab and press **Enable workflow**.
- Some outlets may refuse requests from GitHub's servers. A dry run lists every feed and whether it loaded.
- Only the push token (a secret named `EXPO_PUSH_TOKEN`) is private. This repository contains no other secrets.
