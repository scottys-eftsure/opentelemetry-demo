# Eftsure Observability CTF — Facilitator Kickoff (read-aloud)

Talking points to open the event — roughly 2–3 minutes, then the live demo.

## 1. Welcome & purpose
- Welcome — this is a hands-on **observability CTF**.
- We've broken a live microservices demo; when an issue is triggered, a hidden flag appears in its
  telemetry. Your job is to find it in **Grafana** and DM it to me.
- The goal is to get comfortable with **Grafana Cloud** and have some fun.

## 2. How it works (scoring)
- I trigger an issue → a **30-minute clock** starts for that flag.
- Your score = **minutes remaining** when you DM me the correct `EFTSURE_FLAG{...}` **plus a
  screenshot** of where you found it and your team name. Do not post flags in the main chat — DM them
  to me only, so other teams don't get a free ride.
- Cadence is **loose** — I might kick off the next one early once everyone has cracked it, or several might run at the same time.
- Live standings are on the **scoreboard** (link in the brief).

## 3. Live demo (do this live in Grafana — share your screen)
- Walk one example end-to-end using the **`failedReadinessProbe`** flag (the cart readiness log).
- **This is the demo flag and is NOT scored** — that leaves the other **7 flags** for the event.
- Trigger it → show the cart health-check error surfacing in **Logs** → search out the
  `EFTSURE_FLAG{...}` → submit it the way teams will (flag + screenshot).
- Then show **Explore**: switching between **logs / metrics / traces**, and drilling into a log
  field / metric label / span attribute — so everyone has seen *where values live* before they're on
  the clock.

## 4. Ground rules
- **Grafana Assistant (AI) and gcx CLI are switched off** — the point is to learn the platform
  yourself.
- **Shared instance** — anything you build is visible to everyone, so be considerate.
- **Alerts haven't been tuned** — some may fire, some won't; a warning isn't necessarily the flag.
- **Found one early?** Use the spare time to explore and set yourself up for the next.
- **Stay in the spirit** — there are ways to game it, but that's not the point.

## 5. Teams
- Form teams of **2–3** — and deliberately **not** your usual squad or the people you work with daily.
  Mix it up.

## 6. Setup window
- You've got about **30 minutes** to form your team, pick a **team name**, and **DM it to me**. This will go up on the scoreboard, so make sure to check and let me know if your team name isnt up there.

## 7. Logistics
- There's a **breakout room per team** — jump into yours.
- **Help is always available in the main room** — ask anytime.
- Facilitators will periodically drop into the breakout rooms to see how you're going.

## 8. Go
- The participant brief is shared for reference.
- Teams + names to me in **30 minutes**. Have fun!
