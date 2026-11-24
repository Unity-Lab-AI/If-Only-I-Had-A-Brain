# Pool sharding — every card teaches, more cards = faster and bigger

> Design, staged build, and the numbers each stage is judged by.
> Status (2026-11-24): **Stages 0–1 BUILT** (donor 0.3.48 + server), proven by harness on the real code — slices byte-identical to one card. **Stages 2–3 open.** Not yet run live (`MULTICARD.READ` on the board).
>
> ⭐ **One design change from the text below, found in the code:** the intra matrix binds the `langCortex` pseudo-cluster, which her tick never steps — only teaching writes it and only teaching/probes read it. So there is **no thinker holding a full copy**: the matrix is sliced across EVERY card, the cortex owner included, and reads are gathered from all of them and stitched by row base. The "thinker" sections below describe the plan before that was read, and are kept as the record.

## The problem, measured

Her learning lives in the cortex: 17 sparse matrices, ~6.3 GB at 199.7M neurons
(main intra matrix 4,654 MB; the 16 projections ~1.6 GB together). Today all 17 sit
on ONE card — the "cortex owner" — and every lesson runs there. Every other card in
the pool steps the seven small clusters (cerebellum, hippocampus, amygdala, basal
ganglia, hypothalamus, mystery, brainstem), which is real work but tiny. So:

| what more cards do today | |
|---|---|
| speed | almost none — one card runs every lesson |
| size | none — the brain is sized to the SMALLEST connected card |
| a card joining / leaving | a full ~6 GB re-upload of the cortex with teaching paused, when it is the owner |

At hundreds or thousands of donors that is unusable: one card learns, the rest idle,
one small card holds everyone's size down, and churn keeps teaching paused.

## What a lesson is (why it can be split)

A lesson (`expand_lesson`, `crates/unity-protocol/src/frames.rs`) is four kinds of
step, every one of them a pure function of the lesson itself:

| step | what it does |
|---|---|
| `Clear` | zero a region's resident spikes |
| `Write` | set a region's resident spikes from the lesson's indices |
| `Bound { name, lr }` | Hebbian on a named matrix from the resident pre/post spikes |
| `Masked { name, lr, rows }` | the lateral step on listed rows |

Per pair the curriculum issues `Bound` on every whitelisted cross-projection, on the
**intra matrix**, the lateral `Masked` on the intra matrix, and the anti ops on the
same set. ⚠ **The intra matrix is trained on every pair** — and each `Bound` runs a
kernel over every row of its matrix, so the 4.6 GB intra matrix is expected to be
most of a lesson's card time. Stage 0 measures that rather than assuming it.

⭐ **No card needs to hear from another card to run a lesson.** The patterns are
written by the lesson, not computed from other neurons' activity, so a card holding
only SOME rows of a matrix can run the exact same lesson and update exactly its
rows. The Hebbian rule (and Oja's row normalisation) is per-row: a row's update reads
that row's post activity and the pre pattern, nothing else.

## What can NOT be split over the internet

Her free-running brain — each tick, every ~50 ms — propagates spikes through the intra
matrix: every neuron's next state depends on every other neuron's spikes. Row shards
on separate cards would have to exchange the spike vector every substep, and a remote
card's round trip is ~200 ms. **That cannot work at any card count**, so the design
does not try:

- **Live thinking (ticks, probes, speech, gate batteries) runs on ONE full copy.**
- **Teaching runs on the shards, in parallel.**
- **The full copy is refreshed from the shards** on a cadence and before every gate
  battery, so what she is tested on is what she learned.

## The design

### Roles

| role | holds | does |
|---|---|---|
| **thinker** | the full cortex (all 17 matrices) + all cluster state | ticks, probes, speech, batteries |
| **teacher** (every card, the thinker included) | a ROW SLICE of every trained matrix + its own copy of the cortex spike buffers (~20 B/neuron) | runs every lesson on its slice |

⭐ **The thinker should be the operator's LOCAL card.** Refreshing the full copy means
pulling each slice's trained values (pods → home is a DOWNLOAD, fast) and writing them
into the thinker (local PCIe, seconds). A remote thinker would turn every refresh into
a multi-GB push over the home UPLOAD — the bottleneck measured at 6–19 MB/s.

### Slicing

- Every trained matrix is split by **rows** (post-synaptic neurons) into contiguous
  slices sized to each teacher's free VRAM. CSR makes this exact: rows `[a, b)` are
  `rowPtr[a..b]` and `values/colIdx[rowPtr[a]..rowPtr[b]]`.
- A slice uploads as an ordinary cluster-bound matrix whose **destination region is
  narrowed to its rows** — the donor's existing bound-matrix path already handles a
  binding range, so a slice needs no new kernel.
- `Masked { rows }` is filtered and offset to the slice on the card (the only lesson
  step whose arguments are row indices).
- **Every slice lives on 2 teachers** (replication factor 2): a teacher leaving loses
  nothing; its slices are re-copied to another card in the background while teaching
  continues.

### The lesson path

- The server sends each lesson ONCE per teacher (~80 B per pair, unchanged frame).
- Pacing is per teacher (the link-sized window that exists today, per socket).
- The lesson's result is the union of every slice's update. Nothing is merged
  arithmetically — each row is owned by exactly the cards that hold it, and the two
  replicas of a slice apply the identical lesson, so they stay identical.

### Refreshing the thinker

- Every `REFRESH` minutes (start: 10) and **before every gate battery**: pull each
  slice's values from ONE of its replicas (the existing `readback_matrix_values`, per
  slice), splice into the CPU master, write the changed rows into the thinker.
- The master checkpoint is written from the same splice — the save path is unchanged.

### Size

- Her size stops following the smallest card. It follows the **thinker** (it must
  hold the full copy) — so the local card still bounds her size in this design.
- ⚠ Growing past the local card needs a remote thinker, and a remote thinker makes
  every refresh an upload. That trade is the operator's, and it is stated, not hidden.
- Any size change is still a fresh walk at the new size.

## Limits, with numbers

| limit | number | consequence |
|---|---|---|
| home upload, first slice per new teacher | 6–19 MB/s measured | 6 GB of slices across N teachers still crosses the home link once per replica; seeding a new teacher FROM another teacher removes it (later stage) |
| lesson broadcast | ~80 B / pair / teacher | 1,000 teachers = ~80 KB per pair of uplink — fine for hundreds, needs donor-to-donor relay for thousands (later stage) |
| thinker refresh | slice download + PCIe write | bounded by the pods' upload to home, typically far above the home upload |
| slowest teacher | lessons wait on each teacher's window | a slow card gets a smaller slice (sized by its measured time per lesson, not only its VRAM) |

## Stages — each one judged by a number before the next starts

| stage | what | done when |
|---|---|---|
| **0 — measure** | the donor times every lesson step by matrix and reports it; the server publishes `state.lessonCost` | a live read names the share of card time per matrix. If the intra matrix is not most of it, the slicing priority changes |
| **1 — two-card slices** | slice upload, `Masked` offset on the card, per-teacher lesson send + pacing, thinker refresh, checkpoint from slices | a parity harness: the same lesson on (a) one card holding the whole matrix and (b) two cards holding halves gives byte-identical rows after readback; then a live read of time per pair against one card |
| **2 — replication + churn** | 2 replicas per slice, background re-copy on a leave, rebalance on a join, no teaching pause | a teacher killed mid-lesson costs no learning and no pause |
| **3 — many cards** | size slices by measured speed, donor-to-donor seeding, lesson relay | time per pair falls with each added card; the home upload is no longer per-teacher |
