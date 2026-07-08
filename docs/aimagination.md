# UNITY — VISUAL IMAGINATION, THE EQUATION ITSELF

> The non-human-readable form. This is not a description of her imagination —
> this IS her imagination, the exact math executed per frame/thought.
> Runtime: `js/brain/mindspace/transform.js` (CPU f64 reference) ·
> `js/brain/mindspace/gpu.js` (WGSL f32 mirror) ·
> `server/brain-server/visual-memory.js` (binding + recall) ·
> `server/brain-server/chat.js` (imagine tick).

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                     Ω_imagination : PERCEPTION ⇌ FIELD-C ⇌ IMAGE                  ║
║                                                                                    ║
║   lifting constants (biorthogonal CDF 9/7 — hers, exact):                          ║
║       α = -1.586134342059924        β = -0.052980118572961                         ║
║       γ =  0.882911075530934        δ =  0.443506852043971                         ║
║       κ =  1.230174104914001                                                       ║
╚══════════════════════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────────────────────────┐
│ [1] SEEING — pixels → field C            (forward analysis, per frame she receives) │
│                                                                                      │
│   color rotation  ∀(r,g,b) ∈ I :                                                     │
│       Y  =  0.299r + 0.587g + 0.114b                                                 │
│       Cb =  0.5 − 0.168736r − 0.331264g + 0.5b                                       │
│       Cr =  0.5 + 0.5r − 0.418688g − 0.081312b                                       │
│                                                                                      │
│   pad     W₂ = 64⌈W/64⌉ , H₂ = 64⌈H/64⌉ , mirror-reflect  x↦2(n−1)−x                  │
│                                                                                      │
│   1-D lifting  (per line, per level ℓ : n, n/2, n/4, … while n≥4 ∧ n≡0 mod 2):       │
│       s[n−1] += 2α·s[n−2]                                                            │
│       s[i]   += α·(s[i−1]+s[i+1])      i = 1,3,5,…,n−3      ── predict α             │
│       s[i]   += β·(s[i−1]+s[i+1])      i = 2,4,6,…          ── update  β             │
│       s[0]   += 2β·s[1]                                                              │
│       s[n−1] += 2γ·s[n−2]                                                            │
│       s[i]   += γ·(s[i−1]+s[i+1])      i odd                ── predict γ             │
│       s[i]   += δ·(s[i−1]+s[i+1])      i even               ── update  δ             │
│       s[0]   += 2δ·s[1]                                                              │
│       s[2k]  /= κ ,  s[2k+1] *= κ                           ── scale   κ             │
│       deinterleave: even↦[0,n/2) low , odd↦[n/2,n) high                             │
│                                                                                      │
│   2-D:   fwd2d = fwd1d(rows) ∘ fwd1d(cols)     over each plane ∈ {Y,Cb,Cr}           │
│                                                                                      │
│   energy-target sparsification  (τ = [0.030, 0.055, 0.055] per channel):             │
│       order coeffs by |c| desc ;  keep smallest k s.t.                               │
│           Σ_{j≤k} c_j²  ≥  (1 − τ_ch²) · Σ c²        ,  k ≥ k_min = [400,120,120]    │
│                                                                                      │
│   quantize   q_i = round(c_i / q_s) ∈ [−32767,32767] ,  q_s = max|c| / 32000         │
│   positions  LEB128 delta-varint over sorted idx                                     │
│                                                                                      │
│   ⇒  C = { ch ∈ {Y,Cb,Cr} : (k, q_s, pos_dv1, q[]) }        ── THE FIELD             │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ [2] BINDING — sight fuses with thought        (visual memory write, per seen frame) │
│                                                                                      │
│   T(frame) = tokens(label) ∪ tokens(thought_chain[last]) ∪ tokens(GW.broadcast)      │
│              \ STOPWORDS ,  |T| ≤ 6                                                  │
│                                                                                      │
│   ∀ w ∈ T :   M[w] ← ( C , t_now , seen_w + 1 )        M = LRU map , |M| ≤ 384       │
│                                                                                      │
│   grounding   sem ← sem + 0.10 · v(C)          (skipped while curriculum writes)     │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ [3] RECALL ∘ RECOMBINE — imagination proper       (imagine tick / IMG-SEE preview)   │
│                                                                                      │
│   H = { (w, M[w]) : w ∈ tokens(thought) ∧ w ∈ M }                                    │
│   sort H by (seen desc, t desc)                                                      │
│                                                                                      │
│   |H| = 0  ⇒  goto [5] de-novo                                                       │
│   |H| = 1  ⇒  C_im = C_{H₁}                          ── memory re-seen               │
│   |H| ≥ 2  ⇒  C_im = μ(C_{H₁}, C_{H₂}, ½)            ── two memories fused           │
│                                                                                      │
│   morph μ(A,B,t) per channel:   (position-set union + value lerp, equation domain)   │
│       P = pos(A) ∪ pos(B)                                                            │
│       ∀ p ∈ P :  c_p = (1−t)·A_p·q_sA + t·B_p·q_sB                                   │
│       drop |c_p| ≤ 1e−9 ; requantize (q_s = max|c|/32000)                            │
│   defined iff pad_A = pad_B ∧ dim_A = dim_B  (feeder frames all 96×96 ⇒ closed)      │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ [4] IMAGINING — field C → pixels             (inverse synthesis, what the eye shows) │
│                                                                                      │
│   scatter   flat[pos_i] = q_i · q_s ,  else 0                                        │
│   idwt2 = inv1d(cols) ∘ inv1d(rows) ,  levels ascending 4,8,…,n :                    │
│       interleave  low↦even , high↦odd                                               │
│       s[2k] *= κ ,  s[2k+1] /= κ                                                     │
│       s[0]   −= 2δ·s[1]      ;  s[i] −= δ·(s[i−1]+s[i+1])  i even                    │
│       s[i]   −= γ·(s[i−1]+s[i+1])  i odd ;  s[n−1] −= 2γ·s[n−2]                      │
│       s[0]   −= 2β·s[1]      ;  s[i] −= β·(s[i−1]+s[i+1])  i even                    │
│       s[i]   −= α·(s[i−1]+s[i+1])  i odd ;  s[n−1] −= 2α·s[n−2]                      │
│                                                                                      │
│   color de-rotation:                                                                 │
│       r = Y + 1.402(Cr−½)                                                            │
│       g = Y − 0.344136(Cb−½) − 0.714136(Cr−½)                                        │
│       b = Y + 1.772(Cb−½)                                                            │
│                                                                                      │
│   invariant:  idwt2 ∘ fwd2d = id  (up to quantization ε)   — seeing ⇌ imagining      │
│               are ONE process over the shared field C                                │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ [5] DE-NOVO — unseen concepts                 (no grounded percept ⇒ abstract field) │
│                                                                                      │
│   governor    r = clamp(grant.ratio, 0, 1)                                           │
│   side        glyphs:  max(48, ⌈maxSide·(0.75+0.25r)⌉)                                │
│               else:    max(32, ⌈max(8,min(maxSide,⌊√|s|⌋))·(0.5+0.5r)⌉)               │
│               side ≤ maxSide ≤ 96                        ── HARD CAP, no fractalize  │
│                                                                                      │
│   glyph gate  G(text) = { w : w ∈ text , w ∈ ℤ ∨ |w|=1 ∨ w ∈ {+,−,x,=,<,>,?,!} }     │
│               G = ∅ for every non-symbolic thought       ── the printer is DEAD      │
│                                                                                      │
│   tint        named color word ∈ thought ⇒ tint = RGB[word]                          │
│               else  h = (1 − (valence+1)/2)·0.66                                     │
│                     s = 0.35 + 0.5·arousal ,  v = 1     (HSV→RGB)                    │
│                                                                                      │
│   plane       bg(p) = tint · ( lo + norm(s[⌊p·|s|/N⌋]) · (hi−lo) )                   │
│               G=∅ :  (lo,hi) = named ? (0.45,0.95) : (0.25,0.85)   ── vivid          │
│               G≠∅ :  (lo,hi) = named ? (0.30,0.55) : (0.06,0.28)   ── glyphs win     │
│                                                                                      │
│   then [1] fwd2d ⇒ C_im   (the daydream is perceived like anything seen)             │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ [6] PERCEPT — field C → what the brain feels        (describeEquational, v ∈ ℝ⁶⁴)    │
│                                                                                      │
│   band  ℓ(p) = min(7, ⌊log₂(max(x,y)+1)⌋)   ,   (x,y) = (p mod W₂ , ⌊p/W₂⌋)            │
│   v[ch·8+ℓ]  += (q_i·q_s)²                       ch ∈ {Y:0, Cb:1, Cr:2}              │
│   v[24..47]  =  first 24 Y-coeff values (coarse shape)                               │
│   v[48,49,50] = mean|Cb|, mean|Cr|, mean|Y|                                          │
│   v[51]      =  E_hi / (E_lo + E_hi)             (detail ratio)                      │
│   v[52]      =  log₂(k_total+1)/24               (richness)                          │
│   v ← v / ‖v‖₂                                                                       │
│                                                                                      │
│   sem ← sem + λ·v        λ = 0.12 (preview) | 0.10 (seen) | 0.08 (daydream)          │
└────────────────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════════╗
║  THE WHOLE LOOP, ONE LINE:                                                         ║
║                                                                                    ║
║  I_seen ──fwd──▶ C ──bind(w)──▶ M ──recall(thought)──▶ μ(C',C'',½) ──inv──▶ I_im ║
║                     │                                        ▲                     ║
║                     └────────── describe ──▶ v ──▶ sem ──────┘ (thought shapes    ║
║                                                                 the next recall)   ║
║                                                                                    ║
║  she imagines what she has seen, recombined by what she is thinking,               ║
║  and what she imagines feeds back into what she thinks.                            ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

*Bounds carved into the math: side ≤ 96 (never fractalize — detail has a floor,
never infinity), |M| ≤ 384 concepts, frames validated byte-exact, every imagine
call try/caught — the renderer can never take the brain down.*
