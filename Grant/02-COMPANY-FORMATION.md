# 02 — WHAT "START A COMPANY" ACTUALLY ENTAILS

**Researched 2026-08-18.** This is the mechanical answer to "what do we have to do." Not legal advice — **use an attorney and an accountant before filing.**

---

## The short version

To receive SBIR money you need a **U.S. for-profit small business** with four things done, in this order:

```
1. Legal entity (LLC or corporation)     → state filing fee, 1 day – 2 weeks
2. EIN from the IRS                      → FREE, same day online
3. SAM.gov registration → UEI issued     → FREE, 1–3 hrs work + 7–10 business days validation
4. SBA Company Registry → SBC Control ID → FREE, minutes
   (+ Research.gov account for NSF specifically)
```

**Total realistic timeline: 4–6 weeks.** **Total unavoidable cost: the state filing fee only** — every federal registration in that list is free.

**The critical scheduling fact:** you do **not** need any of this to submit an NSF **Project Pitch**. Pitch first, register while you wait for their answer. That sequencing costs you nothing and saves 6 weeks.

---

## Step 1 — The legal entity

### Do you actually need an LLC?

Technically, no — **sole proprietors, LLCs, corporations, and partnerships can all register**, and a sole proprietor may even use an SSN in place of an EIN. But for this project an entity is strongly advisable because of **liability separation** (a public-facing AI service with user chat is a liability surface), **ownership clarity** (SBIR requires ≥51% U.S. citizen ownership — provable on paper), **credibility**, and the ability to hold IP and hire.

### LLC vs C-Corp

| | **LLC** | **C-Corporation** |
|---|---|---|
| Setup | Simplest, cheapest | More paperwork, corporate formalities |
| Taxes | Pass-through (profit hits your personal return) | Entity taxed separately; double taxation on dividends |
| SBIR eligible | ✅ Yes | ✅ Yes |
| Outside investors later | Awkward — VCs generally want Delaware C-Corp | Standard vehicle |
| Ongoing burden | Low | Board minutes, resolutions, more filings |

**Recommendation for this project: start as an LLC.** SBIR takes no equity, so there's no investor pressure forcing a C-Corp on day one, and an LLC can convert later if you ever raise. Don't pay for Delaware unless an investor demands it — **register in your home state**, where you'd otherwise owe foreign-qualification fees anyway.

⚠️ **The one SBIR-specific ownership trap:** the business must be **≥51% owned and controlled by U.S. citizens or permanent residents**, and **majority ownership by VC firms, hedge funds, or private equity disqualifies you.** If you ever take investment, model this constraint *before* signing.

### The naming rule that breaks registrations later

Whatever name you file, **write it down character-for-character and use it identically everywhere afterward.** The federal validation system compares your business name and EIN against IRS records, and **"Smith & Associates LLC" is not the same as "Smith and Associates, LLC"** — punctuation, abbreviations, and capitalization all count. **Entity validation failure is the single most common reason registrations stall.**

**Cost:** state filing fees vary widely (roughly $50–$500 depending on state). Optional registered-agent service runs ~$100–$300/year. Both are real quotes to get, not numbers to trust from a document.

---

## Step 2 — EIN (Employer Identification Number)

- **Free**, directly from the IRS, **issued immediately** through the online application
- Only from **irs.gov** — anything charging you for an EIN is a scam
- Save the **EIN confirmation letter (CP 575)**. You will need the exact legal name from it repeatedly

---

## Step 3 — SAM.gov registration (this is where the UEI comes from)

**[sam.gov](https://sam.gov) — the ONLY legitimate URL. Third-party sites charge for a free service.**

- First create a **Login.gov** account — the secure front door to federal systems
- **The UEI is assigned automatically** when you start a SAM registration. You do not apply for it separately. (DUNS numbers were retired in April 2022.)
- A **CAGE code** (5-character identifier used by DoD/NATO) is also assigned automatically

**Have ready before you start:**
- EIN + the exact legal name from the IRS letter
- Physical address and mailing address
- **Bank routing number, account number, account type, and the bank's ACH department phone number** (for electronic funds transfer setup)
- **NAICS codes** matched to what you'll apply for — for this project, likely `541715` (R&D in physical/engineering/life sciences) and/or `541511` (custom computer programming)
- Name and contact details for your **Electronic Business Point of Contact (EBiz POC)**

**Timeline — sources disagreed, so plan conservatively:**

| Source | Estimate |
|---|---|
| GovContract Daily | 1–3 hrs of forms + 7–10 business days validation |
| Matter Labs | 10–14 business days total |
| Granted AI | 3–4 weeks |
| Funding Landscape | 2–4 weeks, longer with validation issues |

**Plan for 4 weeks. Never tie this to a deadline** — without an active SAM registration a proposal can be delayed or disqualified outright.

**⚠️ Annual renewal is mandatory** and can take as long as the initial registration. **If it lapses you cannot receive payments** — even on active awards. Put a calendar reminder at 10 months.

---

## Step 4 — SBA Company Registry

- Required of **all SBIR/STTR applicants before proposal submission**
- Produces a unique **SBC Control ID** used across all **11 participating SBIR/STTR agencies** — do this once, use it for NSF, NIH, DoD, DOE, and the rest
- Free, and quick once SAM is active

---

## Step 5 — Agency portal (NSF)

**Research.gov** account for the organization and for you as PI. **SAM registration must be complete first** — you can't begin entering a proposal in Research.gov without it.

Your company name, physical address, and identifying info must be **entered identically** in SAM, Research.gov, and the SBA Company Registry. Mismatches stall submissions.

---

## What it costs, honestly

| Item | Cost |
|---|---|
| State LLC filing | **~$50–$500** (state dependent) |
| Registered agent (optional) | ~$100–$300/yr |
| EIN | **FREE** |
| SAM.gov + UEI + CAGE | **FREE** |
| SBA Company Registry | **FREE** |
| Research.gov | **FREE** |
| NSF Project Pitch | **FREE** |
| Attorney review (recommended) | varies — get quotes |
| Accountant setup (recommended) | varies — get quotes |

**Every step in the federal registration process is free.** The only guaranteed cost is your state's filing fee.

---

## What running the company entails afterward

This is the part people underestimate:

**Financial:** a **separate business bank account** (do not commingle — it destroys liability protection), bookkeeping from day one, and federal/state tax filings. **SBIR awards require accounting rigor** — you must be able to document how every dollar was spent, and Phase II can trigger an audit of your accounting system's adequacy.

**Employment:** the SBIR PI rule means **you must be >50% employed by your own company** (≥20 hrs/week) during the project. That means real payroll, which means payroll tax registration and withholding. An accountant earns their fee here.

**Compliance:** annual state report/franchise fee, annual SAM renewal, and — once you hold a federal award — periodic technical and financial reporting.

**Records:** federal grants require retaining records for years after the award closes.

---

## The two-entity question (for-profit + non-profit)

Some research groups run a **for-profit LLC** (holds SBIR awards, commercial work) alongside a **501(c)(3) non-profit** (holds foundation grants, academic collaborations, and unlocks funders that exclude for-profits).

**Real advantages:** foundations like Templeton and Simons often fund non-profits/institutions rather than companies, and a non-profit can serve as the STTR research partner.

**Real costs:** a 501(c)(3) requires IRS Form 1023 (a substantial filing with a real fee), a board of directors, public disclosure, restrictions on private benefit, and separate books. **Related-party transactions between the two entities are heavily scrutinized.**

**Recommendation: do not do this on day one.** Form the LLC, chase SBIR. Revisit the non-profit only if a specific foundation opportunity requires it and the money justifies the overhead.

---

## Order of operations (the actual answer to "what do we do")

```
WEEK 0   → Submit the NSF Project Pitch. FREE. NO COMPANY NEEDED.
         → Apply to Emergent Ventures the same day. FREE. NO COMPANY NEEDED.

WEEK 1   → Talk to an attorney + accountant. Decide state and entity type.
         → File the LLC. Record the exact legal name.
         → Get the EIN (same day, free).

WEEK 2   → Open the business bank account (needs EIN + formation docs).
         → Start SAM.gov: Login.gov account, then registration. UEI issues automatically.

WEEK 3-6 → SAM validation processes. Fix any name/EIN mismatch immediately.
         → When SAM is active: SBA Company Registry → SBC Control ID.
         → Create Research.gov accounts (org + PI).

MEANWHILE→ NSF answers the Project Pitch (~1–2 months).
         → If invited: write the full proposal against the next window.
         → If not invited: the feedback tells you how to reframe. You may pitch
           again (max 2 per 12 months) — spend the second one deliberately.
```

**The whole point of this ordering:** the two free, no-company actions happen in week 0, and the 4–6 week registration runs *during* NSF's 1–2 month review instead of after it. Nothing waits on anything it doesn't have to.

---

## Sources

- [NSF required registrations](https://seedfund.nsf.gov/how-to-submit/required-registrations) · [NSF SBIR eligibility](https://seedfund.nsf.gov/solicitation-eligibility/)
- [SBIR.gov — apply](https://www.sbir.gov/apply)
- [SAM.gov registration guide 2026 — Matter Labs](https://matter-labs.com/guides/sam-gov-registration)
- [SAM.gov guide — GovContract Daily](https://govcontractdaily.com/blog/guide-sam-gov-registration.html)
- [SAM.gov guide — Funding Landscape](https://fundinglandscape.com/answers/sam-gov-registration-guide-2026)
- [SBIR SAM.gov renewal guide — Granted AI](https://grantedai.com/blog/sbir-sam-gov-registration-renewal-guide-2026)
- [Demystifying SAM.gov for SBIR/STTR — E.B. Howard Consulting](https://www.ebhoward.com/demystifying-sam-gov-what-startups-need-to-know-for-sbir-sttr-registration/)
