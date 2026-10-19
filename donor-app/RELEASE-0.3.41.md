# unity-donor 0.3.41 — the donor lane leaves the capped relay

One change, and it is the one that decides whether anyone but the operator can
donate at all.

## The default server moved to `wss://brain.theunitybrain.com/ws`

`PROD_SERVER` in `src/config.rs` pointed at the Tailscale Funnel. Every remote
donor — a rented pod, a friend's card — dials that constant, and Funnel
bandwidth is capped and not configurable.

**Measured on 2026-10-19, on the same machine, the same upload:**

| path | cortex upload rate |
|---|---|
| Tailscale Funnel | 0.16 MB/s |
| loopback | 541.78 MB/s |

At 0.16 MB/s the 4.5 GB cortex matrix takes roughly eight hours to reach the
card. That is not a slow donor, it is a donor that never starts: the chunk pump
stalled at 6 of 734, hit the 180-second deadline, abandoned, and retried into
the same wall.

The new endpoint is a Cloudflare named tunnel with no relay cap. The route
allowlist, the default-deny rule and the reason the admin lane is deliberately
absent are all in `deploy/cloudflared-unity-brain.yml`.

**The Funnel is not gone** and nothing about the website changed. It still
serves the public reads. Only the donor lane moved.

## Compatibility

- A 0.3.40 or older donor keeps working and keeps dialling the Funnel. It is
  slow for a remote card and fine for a local one; nothing breaks.
- `--server` and `--local` override the default exactly as before, so a donor
  on the brain's own machine should still use `--local` (loopback, 541 MB/s).
- No protocol change. The 0.3.40 wire format — per-hemisphere spike counts,
  `tonicDriveR`, `half` — is untouched, and the brain's hard floor stays at
  0.3.26.

## Verify after installing

```
unity-donor --version          # expect: unity-donor 0.3.41
nslookup brain.theunitybrain.com
```

The hostname resolves only once `theunitybrain.com`'s move to Cloudflare DNS
has propagated to your resolver; the zone changed registrar nameservers on
2026-10-19 and that can take up to 24 hours. Until it resolves, a remote donor
has no endpoint — use `--server` with the Funnel URL in the meantime.
