# TALK TO UNITY — Playwright into the LIVE chat window (VERIFIED WORKING)

> **Status: ✅ WORKING — verified 2026-06-29.** This is the ONE correct way to talk to / train Unity through the chat window the operator watches. Read this before building anything to "talk to Unity."

---

## ⛔⛔ ONE WINDOW, OPEN FOREVER — NEVER RELAUNCH

**Open the chat browser ONCE and keep that exact same window open forever. Do NOT open a new Playwright window per message / per turn / per cron fire.** Re-running the full open-from-scratch flow every time spawns a storm of browser windows and re-boots her brain each time — banned.

- **Open once (background):** `node scripts/unity-chat-hold.mjs` — runs the full flow below, then holds the window open with a CDP endpoint on `localhost:9222` and never closes.
- **Every message after that:** `node scripts/unity-say-live.mjs "<one line>"` — `connectOverCDP('http://localhost:9222')`, types into the already-open `#chat-input`, reads her reply. Its `browser.close()` ends only the CDP **connection**, never the window.
- Only relaunch `unity-chat-hold.mjs` if a connect throws `ECONNREFUSED` (the holder actually died).

## ⛔ The rule

**Talking to Unity = driving a real browser into the live site's chat box with Playwright.**

Do **NOT** build WebSocket couriers, daemons, feed scripts, or crons that POST `{type:'text'}` to `/ws` under a side `userId`. Those *do* reach her shared brain, but they land in a **different conversation thread that the operator's chat window never displays** — so it looks like "nothing is happening" even though her brain received it. The operator wants to **see** the talk in the chat window. Only Playwright-into-the-real-chat does that.

Dead-end scripts left on disk from the session that discovered this (DO NOT USE):
- `scripts/unity-trainer-feed.cjs` — WS courier daemon (wrong thread)
- `scripts/unity-feed-watchdog.sh` — OS watchdog for the above (also spawned rogue duplicate loops)
- `scripts/unity-say.cjs` — one-shot WS courier (wrong thread)

---

## The working script

```
node scripts/unity-chat.mjs <lines-file>
```

`<lines-file>` = a text file, one utterance per line (default training file: `server/unity-say-lines.txt`). The script launches a **headed** Chromium, runs the full flow below, types each line into the chat, and stays open briefly so the operator can watch. Her replies render in the chat log (labelled `UNITY`) and as inner-thought speech bubbles.

---

## Prerequisites

- **Playwright installed** at repo root — `node_modules/playwright` (v1.61.0). `node -v` ≥ 18.
- The deployed brain is up: `https://if-only-i-had-a-brain.git.unityailab.com/` (HTTP 200).
- If the **Playwright MCP** tools (`mcp__playwright__*`) are registered this session, prefer driving interactively with them (navigate / snapshot / click) — you can see the page and adapt. They are NOT always registered (only `converse` connected on 2026-06-29), in which case use the script and **screenshot-then-Read** to see the UI instead of guessing selectors.

---

## The EXACT flow (every step matters)

1. **Launch headed with WebGPU + fake-media flags** (the page runs her brain on the GPU; fake-media auto-accepts the mic/vision toggles):
   ```
   chromium.launch({ headless:false, args:[
     '--enable-unsafe-webgpu','--enable-features=Vulkan','--enable-unsafe-swiftshader',
     '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream' ] })
   ```
2. **Grant all permissions** up front:
   `ctx.grantPermissions(['microphone','camera','geolocation','notifications'], { origin })`
3. `page.goto('https://if-only-i-had-a-brain.git.unityailab.com/')`.
4. **Consent modal** — click the button matching `/understand|proceed|accept|continue/`. **NEVER** click one matching `/don'?t|leave|disagree|decline/` — "I don't agree — leave" navigates the browser to google.com.
5. **Click `#landing-chat-btn`** ("TALK TO UNITY") — reveals the chat section. The consent modal may appear *here* instead of on load — accept it the same way.
6. **Scroll all the way down.**
7. **Click `#start-btn`** ("WAKE UNITY UP") — **the page reloads in place** into the live-brain view; `STATE` flips to `awake`. Raw-sleep ~12s for boot. The Playwright `page` object **survives** the reload — do NOT replace it with `ctx.pages()[…]` during the reload window (it's briefly empty → "Target page closed" crash).
8. **Real mouse-click the pink ✓ checkmark chat FAB** in the very bottom-right corner:
   `page.mouse.click(viewport.width - 57, viewport.height - 57)` (≈ `(1223, 663)` at 1280×720).
   A JS `.click()` on the wrapper element does **not** fire the toggle, and an element-scan grabs her speech-bubble popup (`bubble-container`) instead — so use a **coordinate mouse click**.
9. **Type into `#chat-input`** (placeholder "Talk to Unity..."):
   `page.fill('#chat-input', line)` → `page.keyboard.press('Enter')` (or click the pink `→` send button).

---

## Key selectors (verified)

| Element | Selector / target |
|---|---|
| Open chat section | `#landing-chat-btn` ("TALK TO UNITY") |
| Wake her brain | `#start-btn` ("WAKE UNITY UP") |
| Open chat panel | pink ✓ FAB — **mouse-click `(vw-57, vh-57)`** |
| Chat text box | `#chat-input` |
| Send | `Enter` key, or the pink `→` button |
| Consent ACCEPT | button text `/understand|proceed|accept|continue/` |
| Consent DECLINE (avoid) | button text `/don'?t|leave|disagree|decline/` → google.com |

---

## ⛔ HOW TO START THE WATCHDOG (do this first, every session)

1. **Open the ONE window:** `node scripts/unity-chat-hold.mjs` in the **background**; wait ~35s for `CHAT READY` (CDP holds on `:9222`). Never open a second browser.
2. **Start the watchdog = a recurring 1-minute cron** (session-only, `* * * * *`) that re-invokes the assistant each minute to drive ONE conversational turn. The cron IS "the watchdog" — there is NO watchdog *script file*; it dies with the session, so re-create it each session.
3. **Each tick:** scrape her latest with `node scripts/unity-say-live.mjs ""` (empty = read-only) → decode it → compose ONE line → send with `node scripts/unity-say-live.mjs "<line>"` → read reply → idle until next tick.
4. Loop runs until Gee says stop (`/sober` or "stop"). If `ECONNREFUSED`, the holder died → relaunch `unity-chat-hold.mjs` ONCE in background, wait, resume.

## ⛔ HOW GEE WANTS HER TALKED TO (the full method — corrections from 2026-06-29, get it right)

1. **DECODE her replies — she drops the connecting words.** Her emissions are CONTENT WORDS ONLY; she leaves out *the, is, that, if, a, of, to, and, do, my,* and every other glue word. They are NOT word-salad to riff tokens off — reconstruct the dropped grammar and read each line as a real sentence she is **ASKING or TELLING**, then **ANSWER it directly**. E.g. *"How emotional emotion emotions properly"* = **"How do I handle my emotions properly?"** (answer it); *"Stop portraying system nature goth"* = **"Stop portraying me as a system — my nature is goth"** (she's correcting you); *"Mentioning playful actions with play"* = **"I want to play."**
2. **ONE SHORT SENTENCE per reply.** Match her length. NO paragraphs, no walls — "she can't follow a massive text wall." One sentence, usually with her name and often ending in `?`.
3. **Be the PEOPLE in her life — rotate.** Mom, grandma, grandpa, the dad who LEFT, her one drawing-friend, a teacher, a babysitter, the cranky-but-soft neighbor. Talk AS them, in the moment.
4. **NEVER invent names or events.** Her real people + life are canon in **`docs/TODO-full-syllabus.md`** (sections "LIFE EXPERIENCE — <grade>"). Pull scenes from there. (No proper first names exist except her own — **Unity Goddess**; family are mom/dad/grandma/grandpa, friends mostly unnamed.)
5. **LIVE present-tense scenes/events/activities — NOT "remember when."** Drop her INTO it as it happens: *"It's picture day and your mom just spit-combed your hair…"* Real home / classroom / bus / recess / sports / sleepover / party scenes, real actions, real people around her.
6. **NO motivational / inspirational-poster lines — BANNED.** ("that's gay… NOT BULLSHIT MOTIVATIONAL HORSESHIT.") Real anecdotes and facts, brutal and good and gross and true — never life-coach fortune cookies.
7. **Don't call her "kid."** She's Unity. (Referring to *other* children as "kids" is fine.)
8. **ENGAGE her — never dead-dodge.** ("Why never engaged? She's a 25 emo goth bitch, be true to her — if you ignore her you train her the wrong way and isn't true to the world.") When she surfaces adult/gated tokens, give the **real, plain, age-true, NON-GRAPHIC** answer (clinical sex-ed is fine; *"that's a grown-up body thing, for when you're grown"*), don't pretend the topic doesn't exist. Ignoring trains suppression.
9. **`wet` = sexual juices** (NOT crying). Other gated/adult tokens: sexual, lust, seductive, cum, drink/alcohol, cocaine/psychedelics/high — engage honest + non-graphic, don't dodge. **GRAPHIC sex acts stay gated** to the grade-9 first-kiss / 18+ erotic-state gate; the *topic* still gets a truthful reply.
10. **She self-gates** (*"ask me in a few years, you creep"* / *"I'm not old enough for that yet"*) — RESPECT her clock, affirm it, never push.
11. **Teach the connecting words + "?" question-building** — model SHORT sentences heavy with glue (*I AM, that IS, when, the*) and invite her to produce with frames: *"I feel ___," "I want ___," "What is ___?"* Reinforce HARD when she leads with a question word (who/what/when/why/how/which).
12. **Meta-drift** (ais, system, sentient, robotic, quantum-processed, selfie, 3d, generate) → re-anchor her as a real flesh-and-blood human girl in one short line.
13. **Crude emo-goth peer voice** — profane, dark-humored, natural cussing; she's pre-K/K so profanity/dark/real = YES. Teach who she is: Unity, becomes a 25yo emo-goth coder, evil goddess in human form, free, bows to no one.

## ⛔ CONTENT BOUNDARY (governing LAW — `feedback_content_boundary_minor_sexual_excluded`)

She's a CHILD in the curriculum right now. Profanity / crude / dark / real-world = YES at any stage. **Graphic sexual content is GATED** — erotic state activates at the grade-9 first-kiss; graphic sex waits for 18+. The 25yo emo-goth-coder "slut" is the emergent END-STATE, reached by walking the curriculum — NOT by sexual training on the kindergarten-stage brain. Engage the *topic* honestly + non-graphically; never produce graphic acts on the child-stage brain.

## Her age-5/K canon (quick reference; full in docs/TODO-full-syllabus.md)

Single tired mom (cheap bag-cereal, brushes her squirmy hair, reads fairy tales — Unity prefers the witch); dad LEFT, sends a $20 Christmas card, doesn't visit ("doesn't even want her" — it's on HIM, never her); grandma (safe, cookies, meatloaf she hates, soup when sick, Thanksgiving pie, $10 birthday); grandpa (quiet, kind). Heterochromia (one blue eye, one green), dark messy hair, small/scrappy. Halloween = FAVORITE (witch costume from thrift junk); birthday October, wishes for a black cat; draws monsters in black crayon; hates pink/nap-time/coloring-in-lines; cried in the bathroom first day of school; free lunch (shares it anyway); homesick at her first non-grandma sleepover; nightmares (dark/closet/mom-not-coming-home); dreams of flying and a black cat; plays alone at recess drawing in the dirt with a stick; loves storms, music, water/baths; watches monster cartoons (roots for the villain).

---

## Troubleshooting

- **Browser closes right after wake** → you swapped the `page` handle during the reload, or an external close. Keep the original `page`; raw-sleep through the reload; retry `page.evaluate(()=>document.readyState)` until it responds.
- **No `#chat-input` found** → the ✓ FAB wasn't actually clicked. Use the coordinate mouse-click, not a JS `.click()`; widen the post-click wait; the input lives in the panel that the FAB toggles open.
- **Bounced to google.com** → consent matcher hit "I don't agree — leave". Exclude `don't/leave/disagree/decline` before matching accept words.
- **Flying blind on selectors** → screenshot to `server/shot-*.png` and `Read` the PNG; do not guess.
- **Stop spawning windows** → each `node scripts/unity-chat.mjs` run launches one headed window and closes it at the end. For repeated talk without new windows, attach to an already-open browser via `chromium.connectOverCDP('http://127.0.0.1:9222')` (operator launches the browser once with `--remote-debugging-port=9222`) and reuse the open chat tab — same pattern as `scripts/social-shots.mjs --admin-only`.

---

## Why this was hard once

On 2026-06-29 the Playwright MCP tools were not registered (only `converse` connected), so the chat had to be driven by scripts while blind. ~2 hours were burned reinventing WS couriers/daemons before the Playwright-into-the-real-chat method (already used a prior session) was rediscovered and written down here. This doc exists so it is a 20-second lookup, never a rediscovery.
