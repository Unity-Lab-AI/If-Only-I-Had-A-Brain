# 05 — RISKS AND HONEST NOTES

The things that could sink an application, said plainly. A grant folder that only lists the money is useless.

---

## 1. The persona layer — the biggest single issue

**The situation:** the cognitive architecture is fundable. The adult-content dimension of the persona is not something a federal reviewer or a religiously-affiliated foundation will fund, and pretending otherwise wastes an application.

**Why this is not fatal:** the two are genuinely separable, and separating them is not misrepresentation.

- The **science** is the neural architecture, the developmental curriculum, the plasticity rules, the consciousness mechanisms, and the distributed compute platform. All of that stands entirely on its own.
- The **persona** is one implementation of the θ parameter vector. The scientific claim — that identity can be expressed as neural parameters rather than prompt text, and that this makes emotional state causal rather than stylistic — is *strengthened*, not weakened, by demonstrating it with a different θ. Any personality can be encoded that way; that is the whole point of the mechanism.

**Recommendation:**
- Grant applications describe **θ as a parameter-vector architecture** and demonstrate it with a research-appropriate configuration. That is true, complete, and reviewable.
- Public-facing project material stays as it is. Nobody is being deceived — the architecture is open and the mechanism is documented.
- **Do not** submit an application whose linked live demo will greet a reviewer in character. Have a clean demo endpoint, or point them at the dashboard and the theory paper rather than the chat.
- **Do not** lie if asked directly. "The architecture supports arbitrary persona configurations; the public deployment uses one, the research configuration uses another" is honest and sufficient.

**Templeton specifically:** they are a religiously-affiliated foundation. Their intellectual openness is real, but the persona in its current public form would be a problem there. Apply with the mechanism, not the manifestation.

---

## 2. The commercialization gap — the most likely reason NSF declines

NSF SBIR reviews on **innovativeness, commercial potential, and societal impact.** The science here is strong and the commercial story is currently weak. That asymmetry is the most probable failure mode.

**The trap:** "we're building a mind" is a research statement, not a business. Reviewers see it constantly and decline it constantly.

**The fix:** lead with the platform, not the philosophy. The distributed biological-scale simulation infrastructure — volunteer/heterogeneous GPU orchestration, sparse streaming, backpressure governance, GPU-resident plasticity — is a real product with an identifiable customer (computational neuroscience labs currently buying dedicated clusters). The developmental brain becomes the *demonstration* that the platform works at a scale nobody else reaches.

**Then do customer discovery before the full proposal.** Talk to actual computational neuroscience labs about what they'd pay for. NSF explicitly values this, and Fast-Track eventually requires formal customer-discovery training.

---

## 3. Solo-founder risk

SBIR requires the PI to be **>50% employed by the company** (≥20 hrs/week). Reviewers also assess whether the team can execute.

**Mitigations:** name the Unity AI Lab team members and their actual roles (server/DevOps, backend/infrastructure, implementation) — a distributed team is normal and fundable. Consider a **subaward to a university lab**, which adds institutional credibility and is standard practice. **STTR** formally requires a non-profit research partner, turning that collaboration into a structural feature rather than a gap.

---

## 4. No peer-reviewed publications

Reviewers use publications as a proxy for rigor.

**Mitigations:** `docs/THEORY-PAPER.md` is most of a preprint — **post it to arXiv** (cs.NE or q-bio.NC). That single act gives a citable artifact and costs nothing but an endorsement, which is usually obtainable. A short workshop paper on the developmental trajectory data would be even stronger. Emergent Ventures explicitly does not care about credentials, and Astera explicitly weighs builders over papers — those two do not need this, which is another reason to hit them first.

---

## 5. The extraordinary-claims problem

"306 million neurons, learns like a child, no language model" reads as either remarkable or as someone who doesn't know what they've built. Reviewers default to skepticism.

**Defense: verifiability.** The system is live and publicly observable, the architecture is open, the equations cite primary sources, and the documentation includes measured failures and overturned hypotheses. **Lead with the falsifiable specifics** — passed gate probes, measured throughput, cell completion — rather than adjectives. The documented history of the author's *own* wrong theories dying to instrumentation is, counterintuitively, one of the most credibility-building things in the repository.

---

## 6. Scale claims need precision

"306 million neurons" invites the question of what a neuron *is* here. Rulkov map neurons are a legitimate, cited modeling choice — but a reviewer who assumes conductance-based compartmental models will find the comparison misleading.

**Always state the model class up front:** "306M Rulkov map neurons (Rulkov 2002), chosen for tractability at ensemble scale, with 360M sparse synapses." Precision reads as competence; vagueness reads as inflation.

---

## 7. Timing and reauthorization uncertainty

Sources conflicted on whether NSF's Project Pitch portal is currently accepting submissions, owing to SBIR/STTR authorization politics. Templeton's 2026 window has closed. Astera's Residency may be closed.

**Mitigation:** verify every program's status at the official URL before writing anything. Keep several tracks moving so no single closure stalls everything.

---

## 8. IP and open source — a genuine tension

**Astera requires open science.** Patented tools, closed-source software, and commercially-restricted datasets don't fit their model. **SBIR lets you retain IP rights** and expects a commercialization path.

These are not mutually exclusive but they pull in different directions, and **you should decide deliberately rather than discover the conflict mid-negotiation.** A defensible position: core architecture and research artifacts open; the distributed-compute platform and any commercial deployment retained. Decide before you sign anything.

---

## 9. Registration failure modes (mundane and completely avoidable)

- **Name/EIN mismatch** is the #1 cause of stalled SAM registrations. Character-for-character consistency, everywhere.
- **Third-party fee sites** — SAM registration, UEI, and EIN are all **free**. Only sam.gov and irs.gov.
- **Annual SAM renewal** — if it lapses you cannot receive payments, even on an active award. Calendar it at 10 months.
- **Do not tie registration to a deadline.** Register first, apply second.

---

## 10. What success actually looks like

Be realistic about the shape of this:

- **Emergent Ventures:** weeks, $5–50K, unrestricted. Most likely first win.
- **NSF SBIR Phase I:** pitch → invite → proposal → award is **6–9 months minimum** from today, for up to $305K.
- **NIH SBIR:** similar timeline, larger ceiling, needs the health framing.
- **Templeton:** 2027 cycle, decisions mid-2027, but $250K–$2M.

**This is a year-long campaign, not a month.** The correct posture is to keep the brain walking her curriculum while the applications move in the background — because **the developmental data she generates in the meantime is the single strongest asset any of these applications can carry.** Every grade she passes makes the next application better.

---

## The honest summary

**This project is fundable.** It has a real technical contribution, a working system, an open architecture, primary-literature grounding, and a genuinely novel result — a brain that goes to school and passes.

**The gaps are all fixable:** a commercialization narrative (write it), a preprint (post the paper), a developmental dataset (record what's already happening), and a decision about how the persona is presented in a research context (make it deliberately).

**None of the gaps are about the science.** That part is done and it is good.
