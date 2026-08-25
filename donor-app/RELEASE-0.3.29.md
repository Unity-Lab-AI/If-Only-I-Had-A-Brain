# donor-v0.3.29 — LOOPBACK: a donor could not reach a brain on its own machine · SOLOCARD: the 10% that was never asked for

Three fixes, all of them cases where the donor reported something other than what was true.

---

## LOOPBACK — the native donor was refused by a server on the same computer

**The symptom that made it confusing:** the dashboard loaded fine and the donor did not connect. Same machine, same brain, one worked and one didn't.

**The cause.** The brain server binds `127.0.0.1` — **IPv4 only**. Windows resolves `localhost` to `::1` (IPv6) first. So the native client dialled `::1`, was refused, and reported a connection failure; the **browser** fell back to IPv4 and worked, which is exactly why the page looked healthy while the donor looked broken.

**The fix.** `LOCAL_SERVER` is now `127.0.0.1` outright, and `normalize_ws_host` **repairs persisted `localhost` URLs at both chokepoints** — config load and connect — so a config saved by an earlier version heals itself instead of failing forever.

⚠ **The lesson worth keeping:** "the browser can reach it, so the network is fine" is not evidence about a native client. They resolve names differently, and a dual-stack host will happily give one of them an address the listener never bound.

---

## SOLOCARD — the GUI hardcoded every card to 10% utilisation

v0.3.25 had already changed the CLI default for `--utilization` to `all` (= 100), precisely so a volunteer's card would not silently donate a tenth of itself. **The GUI kept hardcoding every slider to `10.0`**, contradicting that default — so the fix worked headless and was undone in the window.

The caution that the 10% originally existed for — not monopolising a card that is also driving a display — **is already covered by the enabled mask**, which is the correct mechanism: exclude the display GPU, rather than cripple every GPU.

---

## The "separate lane" was one physical card counted twice

A card that appeared to be two donation lanes was **one physical GPU enumerated once per graphics backend** (Vulkan **and** Dx12). `RUNPOD.16` had already deduplicated this on the server side for a hard reason: counting one card twice told the brain it had **two replicas**, and the data-parallel merge then treated one card's deltas as independent corroboration of themselves.

---

**Compatibility.** No wire-format change. A v0.3.29 donor is protocol-identical to v0.3.28 against the deployed server.

⚠ **This is the version the production pod runs.** It reached it by RESTART, not by the updater noticing — the old supervisor re-resolved the release URL only when the donor process exited, and a pod with 3.55 days of uptime and no exit never re-checked. "Self-updating" was true on reconnect and false in steady state. `deploy/runpod-donor-launcher.sh` carries the corrected supervisor (5-minute upgrade watchdog, no stale version pin, kill-by-PID) for the next pod that is created — RunPod's `args` field is not mutable via the API, so it cannot be applied to a running pod.
