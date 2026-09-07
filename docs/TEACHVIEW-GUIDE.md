---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ This is the READER'S MANUAL for html/teachview.html — how to interpret what
# the page shows you, and what each state actually means.
# It is NOT the design inventory; that is docs/TEACHVIEW-INVENTORY.md.
status: verified
sources:
  - html/teachview.html
verified-scope: |
  CREATED 2026-09-07 during the documentation sweep, on the operator's
  instruction: the teach-view card on the page legend had grown to 8,503 bytes -
  an entire manual embedded in an index card, where every neighbouring card is
  400 to 700 bytes. "its a fucking text wall when it needs its own readme
  instead of havoing the readme on the card ... needs to get to the point and
  not blather on with filler".

  Every word of that card's content is preserved here, reorganised. The card now
  states what the page is in three lines and links to this guide.
last-verified: "aa0a87cb 2026-09-07"
---

# TEACH VIEW — the reader's manual

**What it is:** a live window on **the training itself.** The exact sentence, definition or fact going into Unity *at this moment*, shown beside **the picture entering her mind's eye** — because the words and the images are one education, not two.

> ⛔ **Why this page had to exist.** Before it, **no channel anywhere carried the text she learns.** The lane that trains every corpus sentence had no log and no publish at all — which is how a curriculum of **931 pages went a year unnoticed.**

---

## Contents

| Section | What it covers |
|---|---|
| [The reading pane](#the-reading-pane--pause--step--clear) | why the feed is slow, and what is *not* slow |
| [Training knobs](#training-knobs--set-vs-make-default) | `set` vs `make default`, and the three states |
| [A cell's full record](#everything-a-cell-ever-taught) | the complete stored history for one cell |
| [Weight downloads & restore](#weight-downloads-and-the-walk-position-restore) | saving checkpoints, restoring a walk position |
| [Press controls](#press-controls--grouped-by-what-each-one-costs) | grouped by what each one **destroys** |
| [Training finalization](#training-finalization--the-end-of-the-walk) | the six ordered end-of-walk steps |
| [Wiring · exam · handwriting · lanes](#the-wiring-audit-the-exam-battery-her-handwriting-the-deferred-lanes) | the four remaining instruments |

---

## Who can use it

⛔ **Everything this page READS is public and needs no login.** Every instrument comes from the same cached snapshot the public dashboard uses.

Only the **writes** are gated, server-side. A refused write says *"not your lane"* rather than *"the brain is broken"* — those are different problems and must not look alike.

⭐ **Controls are dimmed, never hidden.** A control that vanishes teaches you it does not exist; one that is visibly refused teaches you why.

---

## The reading pane — pause · step · clear

**The feed is deliberately slow.** Teaching runs at thousands of items a second and nobody can read that, so the reading pane paces itself and lets you pause, step and scrub.

Those three buttons freeze, advance or empty **the display**. They never stop the teaching.

> ⛔⛔ **THE SLOWNESS IS ONLY IN THE READING PANE — this is the most important thing on the page.**
>
> The counts, the per-lane and per-source bars, and the words-per-cell totals are **complete and never sampled.** The page also prints how many taught items it has **not** shown you.
>
> ⭐ **Why that matters:** a *sampled* view of a poisoned lesson can miss the poison. **That is the exact failure this page exists to end**, so anything that could hide a bad lesson is counted in full rather than sampled.

It also carries the **flags** — a lane reporting success while teaching nothing, a word with no definition behind it, a cell below its corpus target.

---

## Training knobs — `set` vs `make default`

**Two controls, two different promises.**

| Control | What it does |
|---|---|
| **`set`** | changes the running brain **immediately** — and is **lost at the next restart** |
| **`make default`** | changes **nothing now**, and is what the box **starts with** from then on |

⭐ **Every knob gets a default, including the ones frozen at boot** — for which a default is the *only* thing that can ever set them.

### Conclude from the state

| State | What it means |
|---|---|
| *running this default* | the brain is **not** running code behaviour on that knob |
| *saved — takes effect at the next restart* | it is in the file, **not in this process** |
| *stored, but the environment overrides it* | ⛔ the value is saved **and doing nothing** — the service unit already set that knob |

⚠ **That third reading is the one worth learning.** Without it, a saved-but-overridden knob sends people hunting for a bug that is not there.

---

## Everything a cell ever taught

**start · newer · older** — the complete stored record for one cell, paged to its true end.

⚠ **Deliberately a different instrument from the reading pane above**, which is a 400-row window. This one does not sample and does not stop.

---

## Weight downloads, and the walk-position restore

One button per weights file that exists **right now**; the browser's own Save As dialog opens.

> ⛔ **A save in flight is REFUSED rather than served.** Half a multi-gigabyte checkpoint downloads as a file that **looks complete and restores as garbage.**

Dropping a weights file restores the **walk position** it carries. ⛔ **A file whose save version does not match the weights on the box is refused with both numbers named** — because resuming from a position those weights were never at looks perfectly healthy while being wrong.

⭐ **Conclude:** a restore changes **a file and nothing else.** The running brain still holds the old position in memory until it restarts.

---

## Press controls — grouped by what each one COSTS

| Press | What it destroys |
|---|---|
| **Restart** | nothing |
| **Update code · keeps training** | nothing |
| **Re-walk from pre-K** | keeps every weight; **resets only the position** |
| **Update code · WIPES all training** | ⛔ **everything she has learned. Cannot be undone.** |

⭐ **The two that destroy a position confirm twice; the two that do not, deliberately confirm once.** A needless dialog is what trains you to click through the real one.

### Before it fires — the restart safeties

- Whether a checkpoint is being written **right now** — checked at the moment of the press, **not read off a poll**.
- Whether knobs were set live and will silently revert.
- Whether saved defaults are waiting on this restart to apply.

### ⛔ Conclude from the verdict — and this is the important one

**A press is confirmed by measurement, never by assumption.**

A working restart makes the server exit, so the connection drops — **which is also exactly what an unreachable server looks like.** So the page waits for the brain's uptime to come back **lower than it was at the press**, which only a real reboot can produce.

| Verdict | Meaning |
|---|---|
| *waiting* | not yet confirmed |
| **could not tell** | it never confirmed — ⭐ **the page never claims the press worked** |

### Two dashboard controls are deliberately absent

**Stop Brain** (which leaves nothing to revive the process) and **Reset** (which the re-walk does non-destructively). Both stay on the dashboard, **where you go on purpose.**

---

## Training finalization — the end of the walk

**Six ordered steps:** the last cell closing · the grade ledger settling · the graduation record being written · **her own memory of finishing being banked** · the corpus verdict · the deferred lanes taking over.

### Conclude from each state

| State | Meaning |
|---|---|
| **pending** | not reached yet — **correct** while she is still walking |
| **waiting** | deliberately idle because something else holds the substrate — **also correct** |
| **blocked** | it **cannot** run, and the note says why. ⛔ A cannot-tell, **never a pass** |
| **failed** | it should have happened and did not. ⚠ On the memory step that means **she finished and does not remember it** |

---

## The wiring audit, the exam battery, her handwriting, the deferred lanes

**Wiring** — how many incoming connections each neuron got at construction.

> ⛔⛔ **The learning rule can only adjust connections that already exist, so EMPTY ROWS are the worst reading on the page.** Those neurons can never learn anything, ever — **and nothing else anywhere would show it.**

**Exam** — only *authored* questions can block a grade. A cell with none reads **"not gated"**, which is correct rather than suspicious. ⭐ **No question text is ever published.**

**Handwriting** — if this is low, a drawing with no words on it is her being **honest about what she can write**, not a broken renderer.

**Lanes** — standing still while the walk owns the substrate is **correct**. Queued work off-walk with nothing draining is **the regression**.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
