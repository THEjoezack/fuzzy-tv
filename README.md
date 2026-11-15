# Fuzzy TV

Always-on music video channel: one video at a time, like old-school MTV minus the shows. Focused on newer, independent-ish rock artists.

Tap "Press to tune in" once and it runs hands-free: a burst of TV static between videos, and an MTV-style caption (artist, "title", album) for the first and last 8 seconds of each one.

- Design: [`docs/superpowers/specs/2026-11-15-fuzzy-tv-design.md`](docs/superpowers/specs/2026-11-15-fuzzy-tv-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-11-15-fuzzy-tv.md`](docs/superpowers/plans/2026-11-15-fuzzy-tv.md)

## Develop

Needs Node 22.

```sh
npm install
npm run dev      # local site at http://localhost:5173
npm test         # unit tests (also guards against committed API keys)
npm run build    # type-check + production build into dist/
```

## How the schedule works

Every viewer sees the same thing at the same moment, like real TV. `public/videos.json` is an ordered loop of videos with their durations. The loop starts at **midnight Eastern time** every day; the page takes the seconds since midnight on the America/New_York wall clock, wraps that by the playlist's total length, and walks the list to find the video that's on and how far into it to start.

- Every 30 seconds the player checks its position and seeks back if it has drifted more than 5 seconds (buffering, a sleeping tab).
- When a video won't play (removed, embedding blocked), the next video in the list plays from its start, and the schedule takes over again when it ends.
- If `videos.json` is missing or empty, the page shows an off-air card.

At midnight the loop restarts from the first video, even mid-video. That jump is intentional.

## Rebuild the playlist

`npm run build:playlist` discovers, filters, and orders videos, then rewrites `public/videos.json`. It runs on your machine; the site never sees the API keys.

1. Copy `.env.example` to `.env` and fill in:
   - `YOUTUBE_API_KEY`: a YouTube Data API v3 key from the Google Cloud Console.
   - `LASTFM_API_KEY`: from <https://www.last.fm/api/account/create>.

   `.env` is gitignored. Never put keys anywhere else in the repo; `npm test` fails if it finds one.
2. Edit `curation/seeds.json`: seed artists, trusted channels (live-session channels and labels), genre tags, and the fairness knobs.
3. Run `npm run build:playlist`. It prints a report: artists found, candidates, rejections by reason, final count, total hours, seed share.
4. Spot-check a few entries, then commit `public/videos.json`.

API responses are cached forever in `curation/cache/` (gitignored), so reruns are cheap and a run that hits the YouTube daily quota can pick up the next day. Delete that folder to refresh.

## Deploy (Netlify)

1. In the Netlify UI: **Add new site → Import an existing project**, and pick the `fuzzy-tv` GitHub repo.
2. Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`, Node 22. There are no environment variables to set.
3. Every push to `main` redeploys. `videos.json` is served with a 5-minute cache, so a new playlist reaches viewers within minutes.

## Known device behavior

Not yet tested on real hardware. To check:

- **iPad, Safari:** tap to tune in, then leave it running through at least two video changes.
- **iPhone → TV:** AirPlay through the player, then separately through Screen Mirroring, each through two video changes.

If AirPlay through the player stalls at video changes (iOS can send only the video to the TV while the page stays on the phone), Screen Mirroring is the supported path. Record results here.
