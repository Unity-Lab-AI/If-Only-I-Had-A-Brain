# EgoDeath — Master Audio Equation

The sonification layer (OSLO mod). The SOUND is driven by the equation-templates
pulled from the images (Gee's "temple" = templates), per Gee's spec:
line-vectoring → amplitude+frequency; color → tone + bass/treble; vector fadeout → decay.
Pure Web Audio synthesis; no samples, no AI. This is the math, frame by frame.

## Inputs (per frame)

From the image template (`imagery.json`, coverage-weighted over the 6-color palette `Pᵢ=(rᵢ,gᵢ,bᵢ,wᵢ)`):

    (r,g,b) = ( Σ wᵢrᵢ , Σ wᵢgᵢ , Σ wᵢbᵢ ) / Σ wᵢ
    B = 0.299 r + 0.587 g + 0.114 b          brightness   ∈ [0,1]
    W = r − b                                 warmth      ∈ [−1,1]
    S = max(r,g,b) − min(r,g,b)               saturation  ∈ [0,1]
    E = edge density  (line-vectoring)        ∈ [0,1]
    θ = dominant edge angle                    ∈ [0,2π)
    C = luminance contrast                     ∈ [0,1]

From the field: I = intensity, ρ = rotSpeed, δ = decay, Φ = dimPhase,
σ = structDrive, p = pattern index, a₀=(x₀,y₀) = lead attractor, dt = frame time.

## Music frame

    Σ  = SCALES[ p mod 5 ]                     active scale, |Σ| ∈ {5,6,7}
    r₀ = −12 + round( (½ sinΦ + ½)·7 )         root, semitones (slow key drift)
    dθ = ⌊ (θ/2π)·|Σ| ⌋ mod |Σ|                dominant-angle → scale degree

## Output equations

**(1) Color → tone / EQ**

    highShelf =  −6 + 16·B                     dB   (bright palette → treble)
    lowShelf  =  11·clamp₀₁( 0.6(1−B) + max(0,W) )  dB  (dark/warm → bass)
    f_cut     =  500 + 4200·B + 1200·I          Hz   (brightness → openness)
    Q_tone    =  0.6 + 2·S                            (saturation → resonance)

**(2) Structure → drone bed** (3 sine voices: root, 5th, octave)

    A_drone   =  0.04 + 0.12·( ½σ + ½C )
    detuneₖ   =  30ρ + 4(k−1)                   cents,  k = 0,1,2

**(3) Line-vectoring → rate** (tempo)

    Δt_step   =  0.5 − 0.38·clamp₀₁( 0.6E + 0.5I )    seconds/note

**(4) Per step → a note**  (edge → amplitude+freq; vector fadeout → release)

    d   = ( dθ + ⌊(½x₀+½)·3⌋ ) mod |Σ|
    o   = 12 if y₀ ≤ 0 else 24                   octave, semitones
    n   = r₀ + Σ[d] + o                          pitch, semitones
    f   = 110·2^(n/12)                            Hz
    fire if   U(0,1) < 0.4 + 0.55·E               (edge density → note density)
    A   = 0.06 + 0.26·E                           amplitude (edge density)
    τ   = 0.18 + 1.12·E                           release seconds (vector fadeout)
    g(t)= A·exp(−t/τ′)  after 6 ms linear attack to A

**(5) Visual feedback → echo**

    delay = 0.36 s ;  feedback = 0.28 + 0.42·δ

**(6) Stochastic injection → transient**

    if  Δinject > 0.05 :  noise tick, gain 0.18 + 0.12·E, 120 ms decay, BP@1700 Hz

## Signal chain

    (drone + plucks + echo) → tone LPF[f_cut,Q_tone] → lowShelf → highShelf
                            → master gain → compressor(limiter) → output

Every audible parameter traces to a template/field quantity above — the image
and the sound share one source. Tunable constants (the 0.4/0.55/0.26/etc. note
gates, the EQ ranges, Δt curve) are the dials; the structure is the equation.

— OSLO, for Gee
