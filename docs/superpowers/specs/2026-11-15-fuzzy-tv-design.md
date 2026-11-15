# Fuzzy TV — Design

## Intent

A website that is always playing a music video, one at a time, like old-school MTV without the shows or news. It focuses on newer, independent-ish artists, starting with **rock** (heavy, psych, garage, post-punk, darker indie). Reference videos:

| Video | Channel | Length |
|---|---|---|
| King Gizzard & the Lizard Wizard - Alien Metal [Visualiser] (`rdQyYsl_rDs`) | artist's own | 308s |
| Chelsea Wolfe - The Dark (Live on KEXP) (`Gpld7f3w2Jo`) | KEXP (session channel) | 219s |
| SLIFT - The Day of Execution (Official Lyric Video) (`1gLt9sRdADE`) | artist's own | 314s |

Any format counts: official videos, visualizers, lyric videos, live sessions.

**Where it runs:**
- **On an iPad while the owner works:** background music with visuals for hours. It must never stall or go silent.
- **AirPlayed from an iPhone to a TV with friends:** people glance up and ask "who is this?", so the screen should answer that.

## Goals

- Always on and hands-free after one tap.
- **Like real TV:** the schedule is fixed, so every viewer at a given moment sees the same video at the same point.
- An MTV-style caption shows artist / song (and album when known).
- A mix of bands the owner loves and bands that are new to the owner, with room for surprises.
- Curation that keeps out floods and junk (see Curation rules).

## Non-goals (for now)

- No skip, "more like this", accounts, or chat.
- No genres beyond rock yet. The genre lives in config, so adding one later means changing config, not code.
- No server or database.

## Anti-goals (it fails even if it technically works if...)

- One prolific artist dominates the channel.
- Long videos (10+ min) or full sets eat the time.
- Fan rips, reaction videos, or low-quality uploads show up.
- It goes silent, stalls on a broken video, or needs babysitting.

## Constraints

- Completable in about a week. Costs under $20/week (target: $0).
- **Hosting: Netlify** (static site). Public GitHub repo `fuzzy-tv`.
- The owner is typing one-handed for a while, so the code is written by agents.

## Approaches considered

1. **Static schedule file + clock-based player (chosen by the owner).** An offline script curates `public/videos.json` (an ordered list of videos with durations). The page works out what's on from the current Eastern time. No backend, $0, and every viewer is in sync.
2. **Live picking in the browser.** The page queries the YouTube and Last.fm APIs itself. Rejected: it exposes API keys, burns quota per viewer, and isn't in sync across viewers.
3. **Nightly serverless job.** A Netlify scheduled function rebuilds the playlist. Deferred: it's a good later step, but a manual rebuild is simpler for week one.

## Schedule rule (decided by owner)

The playlist is a loop that starts at **midnight America/New_York** each day.

- `t` = seconds since midnight on the **wall clock** in America/New_York.
- `elapsed = t mod totalDuration`.
- Walk the list, adding up durations, to find the video that contains `elapsed` and the offset into it.

Example: with ten 6-minute videos, at 12:13:00am ET video #3 (index 2) is playing, 60s in. At midnight it restarts from video #1, even if mid-video. That jump is acceptable.

The curation script caps the playlist at **24 hours** of total length, so each video airs at least once a day.

## Player behavior

- **Tune-in screen** ("Press to tune in") is required because browsers block autoplay with sound until the first tap. After that tap, it runs hands-free.
- Uses the YouTube IFrame Player API with `playsinline=1`, no controls, and modest branding.
- **Resync:** when a video ends, recompute what's on and load it. Every 30s, if the playing position drifts more than 5s from the schedule (for example after buffering or a sleeping tab), seek to the scheduled position.
- **Broken video** (embed blocked or removed): play the next video in the list from its start, then resync on the next end.
- **Transitions:** a brief TV-static "fuzz" (about 0.6s) between videos. This is the brand.
- **Caption (lower third):** artist, title, and album (if present). It shows for the first 8s and the last 8s of each video, like MTV.
- **Off-air card** if `videos.json` is empty or fails to load.

## Curation rules (offline script)

**Inputs:** `curation/seeds.json` holds a list of seed artists the owner loves, plus trusted channels (live-session channels like KEXP, and labels like Sub Pop and Sacred Bones). The owner edits this file.

**Discovery:** the script expands the seed artists through Last.fm "similar artists" to depth 2. It keeps only artists whose Last.fm top tags match the rock tag allowlist.

**Sources per artist:** the artist's own YouTube channel, plus trusted-channel uploads whose title begins with a known, genre-matched artist.

**Video filters (all must pass):**
- 60s ≤ duration < 600s
- embeddable and public
- views ≥ 2,000 (configurable)
- not a "- Topic" auto-generated channel
- title doesn't match: full set / full album / full concert / full show / full performance / reaction / tutorial / lesson / interview / teaser / trailer / #shorts / cover

**Fairness and mix:**
- At most 3 videos per artist.
- About 1 in 3 slots goes to seed artists, 2 in 3 to discovered artists.
- An artist can't air again within 3 hours of playlist time.
- Smaller artists get weighted up (by inverse log of Last.fm listeners).
- The order is shuffled deterministically from a configured seed, so rebuilds are reproducible.

**Output:** `public/videos.json`. The owner runs the script locally with API keys in `.env` and commits the result. Netlify only builds the static site and never needs the keys.

**Quota:** YouTube Data API's free tier (10,000 units/day). `search.list` costs 100 units, so each artist's channel lookup is cached permanently in `curation/cache/`. Uploads are fetched through cheap 1-unit calls.

## Decided vs. left to the builder

- **Decided by the owner:** Netlify; a static file of videos + durations; the clock-based schedule from midnight ET; no skip button; rock first; the curation themes (mix, no floods, <10 min, quality floor).
- **Proposed by Claude and accepted:** seeds + similar-artist discovery; the 1:2 mix; the per-artist cap; the "official channel or trusted session channel" quality line.
- **Claude's calls (correct if wrong):** Vite + TypeScript + Vitest; Last.fm for similarity; 8s caption windows; 5s drift tolerance; 3h artist gap; 2,000-view floor; the 24h playlist cap; static-fuzz transitions.
- **Left to the builder:** visual details beyond what's described, and file-internal structure.

## Risks

- **AirPlay from an iPhone:** iOS may send only the video to the TV while the page stays on the phone. If the page is paused, the next video may not start. The owner must test this on real hardware (Task 4). Screen mirroring is the fallback.
