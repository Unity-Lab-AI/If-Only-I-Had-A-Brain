# unity-donor 0.3.42 — the donor keeps what it trains, and says why it died

Two changes, both about not losing things.

## The donor keeps its own copy of the weights it trains

Most of the brain's learning runs on the matrices resident on the donor's
card. The brain only sees them when it pulls them back, every 30 minutes, so
a donor that crashed between pulls took up to half an hour of learning with it.

Now the donor writes every resident matrix's trained values to its own disk:

- **on the brain's cadence** — the brain sends it (10 minutes by default, set
  brain-side with `DREAM_DONOR_CHECKPOINT_MS`);
- **when it stops** — Stop in the GUI or Ctrl+C.

Files go under the donor's data directory in `checkpoint/`: one `.bin` per
matrix plus a `manifest.json`, each written to a temporary name and renamed into
place, the manifest last, so a crash mid-write leaves the previous checkpoint
whole.

**It hands them back.** After the brain re-uploads, the donor puts its own
checkpoint back onto the card when three things hold:

1. it belongs to **the same brain** — the lineage is her seed, which carries
   across a Savestart and changes on a fresh walk;
2. it is **newer** than the last time the brain pulled the card's weights in;
3. each matrix has **exactly the same size** and its file matches the
   checksum in the manifest.

The donor then reports what it restored, and the brain pulls those weights into
its master through the same checksum-verified readback it already uses, and
saves.

**And it leaves politely.** On Stop, a checkpointing donor writes its
checkpoint, tells the brain it is leaving, and keeps serving the brain's
readback until the brain confirms it holds the weights (`leave_ok`), for at
most five minutes. If the brain does not answer, the disk copy still holds
them for the next connection.

## The donor writes down why it died — even on an abort

The panic hook could not see an abort: a stack overflow, an allocation the OS
refuses, or a double panic reaches Rust's `abort_internal` without it, and
Windows reports only `0xc0000409`. Both donor deaths on 2026-10-18 were that
class and left no `crash.log`.

The donor now runs itself as a child process under a small supervisor. When
the child exits with anything but success, the supervisor appends the exit
code, its name where known (`0xC0000409` fail-fast abort, stack overflow,
access violation, out of memory) and the child's last 80 stderr lines to the
same `crash.log`. Set `UNITY_DONOR_NO_SUPERVISOR=1` to run unsupervised.

## Compatibility

- **Older brains:** a brain that does not send `donor_checkpoint` gets the old
  behaviour exactly — no checkpoint, an immediate close on Stop.
- **Older donors:** the brain only sends checkpoint messages to 0.3.42+.
- No change to the binary wire format. The hard floor stays at 0.3.26.

## Verify after installing

```
unity-donor --version          # expect: unity-donor 0.3.42
```

After the first ten minutes connected to her, the donor's data directory holds
`checkpoint/manifest.json`, and the brain's state reads
`donorCheckpoint.saves >= 1`.
