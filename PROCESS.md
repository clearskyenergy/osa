# The verification pipeline — operating model

This is the theoretical answer to "how do we run the process," written so the
human gaps are visible as gaps rather than as things that quietly don't happen.
`README.md` describes the software that implements the last third of it.

**Assumptions I am making about your vocabulary.** Correct any that are wrong;
several structural decisions below hang off them.

| Term | Read here as | If that's wrong |
|---|---|---|
| OSA | origination — where sites first enter, before anyone has judged them | the funnel start moves, nothing else does |
| Receptacle | the intake form → `intake_projects` | already true in the code |
| India desk | your own staff doing human verification, employed by you | if they're a vendor, they belong in stage 5's model, not stage 3's |
| Amperage | the offtake/lease counterparty who prices the deal | if Amperage is instead a modelling tool, stage 4 collapses into stage 2 |
| CIR / Juels AI | independent third parties who sign a bankability opinion | — |
| TJ's model / your model | two independently-built scenario models over the same site | if one is a refinement of the other they are one model and §4 does not apply |

---

## 1 · The shape of the problem

You have one funnel and two very different questions in it, and most of the
confusion in the notes comes from them being treated as one.

**Feasibility** is a physics-and-paperwork question. Can this be built here?
Interconnection capacity, land control, zoning, flood, wetlands, grade,
transmission distance, AHJ. It is falsifiable. A model can get most of the way
and a human with imagery can close it out. It is cheap to be wrong early.

**Bankability** is a counterparty question. Would somebody fund this on these
terms? It depends on offtake, sponsor credit, EPC, technology, and the specific
appetite of the specific lender. It is not falsifiable in the same way — it is
an opinion, and it is only worth anything when it is signed by someone whose
signature carries weight.

These need different evidence, different people, and different failure modes,
and they must not be collapsed into one score. A site can be perfectly feasible
and completely unbankable, and the whole point of the pipeline is to find that
out in that order — because feasibility is cheap to test and bankability is
expensive.

**So the funnel is: machine narrows → your humans confirm → the market prices →
a third party signs.** Nothing skips a stage, and the expensive signature is
last.

---

## 2 · The stages

```
  0  ORIGINATION            OSA → receptacle → CRM
        │                    every site gets a record, including the ones you reject
        ▼
  1  MACHINE SCREEN         model A + model B run the same site
        │                    output: probability + the drivers behind it
        ▼
  ┌──── GATE 1 ─── agreement + threshold ────────────────┐
  │  agree & high  → fast path        agree & low → park │
  │  disagree      → human, always                       │
  └──────────────────────────────────────────────────────┘
        ▼
  2  HUMAN VERIFICATION     India desk, structured checklist
        │                    confirms or overturns SPECIFIC drivers
        ▼
  ┌──── GATE 2 ─── feasibility verdict ───────────────────┐
  │  pass → on    conditional → on, flagged    fail → out │
  └───────────────────────────────────────────────────────┘
        ▼
  3  COMMERCIAL             Amperage — lease / offtake terms
        │                    a site with no price is not a deal yet
        ▼
  ┌──── GATE 3 ─── is there a deal on the table? ─────────┐
  └───────────────────────────────────────────────────────┘
        ▼
  4  THIRD-PARTY REVIEW     CIR / Juels AI  ◀── this repo
        │                    independent feasibility + bankability opinion
        ▼
  5  BANKABLE PACKAGE       signed opinion + terms + model → greenfield dev
```

The gates are the product. Stages are where work happens; gates are where you
decide, and a pipeline with stages and no gates is just a list of things in
progress.

---

## 3 · Stage by stage: who does what

### Stage 0 — Origination

Everything from OSA lands in the receptacle and becomes a CRM record **before
anyone judges it**. This is not bureaucracy: your rejection data is the only
data that tells you whether your screen is calibrated, and a funnel that only
records winners can never be measured. The repo already gets this right —
`intake_projects` keeps `declined` records and keeps them in the averages.

*Owner:* origination. *Output:* a CRM record with a site, a size, and a source.

### Stage 1 — Machine screen

Both models run. Each returns **a probability and the drivers that produced
it** — not a number alone. A bare 0.72 is unusable downstream: nobody can
confirm it, overturn it, or learn from it. A 0.72 that says *interconnect
queue position (−), land control unconfirmed (−), substation 1.2 km (+)* is a
worklist.

This is the single most important design constraint in the pipeline, so state
it as a rule: **the model's output schema and the human's checklist schema are
the same schema.** Same driver names, same value types. If the model says
"land control: unconfirmed" the human's form has a field called land control
with the same options. Without that you cannot compare them, and every human
review is a fresh opinion rather than a correction.

*Owner:* automated. *Output:* two scored runs, versioned, stored on the record.

### Stage 2 — Human verification (India desk)

A named person opens the site with imagery, GIS and the utility's own maps and
works the driver list. Three things they can do to each driver: **confirm**,
**overturn with evidence**, or **cannot determine**.

The third one has to exist and has to be used. A checklist that only offers
yes/no gets you confident guesses on the fields nobody could actually check,
and those are precisely the fields that later blow up.

What they must not do is edit the probability. The number is the model's; the
drivers are the humans'. Recompute the score from the corrected drivers instead
— then the delta between machine and human is a real measurement rather than
somebody's feel.

*Owner:* India desk, with the India team lead visible on every record in flight
(the "team in India aware of what's going on" requirement is a queue view, not
a status meeting).
*Output:* a feasibility verdict — pass / conditional / fail / insufficient —
with the corrected driver set.

### Stage 3 — Commercial (Amperage)

Feasible sites go to Amperage for lease/offtake terms. This sits **before**
third-party review deliberately. A bankability opinion on a site with no terms
is an opinion about a hypothetical, and you will pay for it twice — once now
and once again when the real terms arrive.

*Owner:* commercial. *Output:* indicative terms, or a decline that goes back
into the CRM as a reason.

### Stage 4 — Third-party review (CIR / Juels AI)

The bankable-solution stage. This is what the software in this repo runs.

The third party gets a **packet**, not a login to your system: the site, your
categorisation, your sizing, your model's probability and drivers, the human
desk's corrections, the commercial terms, and your files. They return four
things — a category confirmation, a feasibility verdict, a bankability verdict,
and a signed document.

Two rules about this stage:

**They must never be the first human to look at it.** They are the expensive
signature and, more importantly, the reusable one. Sending them junk costs you
their turnaround time now and their willingness later. Everything that reaches
them has already survived a human at stage 2.

**Their verdict is not a field you overwrite.** It is an independent opinion
with an author, a date and a document, and you may want two of them on the same
site (CIR *and* Juels AI). That is why verifications are their own records in
the schema rather than a `verified: true` on the project.

*Owner:* the partner. *Output:* a signed opinion, appended to the site's record.

### Stage 5 — Bankable package

Signed opinion + terms + model + the evidence trail. This is what a lender or a
JV partner actually receives, and it is the only artifact in the pipeline whose
audience is outside your company.

---

## 4 · Two models: use them as a disagreement detector, not an ensemble

The instinct with two models is to average them or to pick a winner. Both waste
what you have.

Averaging destroys the signal. Two models built independently that agree on a
site agree for structural reasons, and two that disagree are telling you the
site sits somewhere their assumptions diverge — which is exactly where a human
should be looking. Average them and you get a mid number with no flag on it,
and you have converted your best routing signal into noise.

So use agreement to route:

| Model A | Model B | Route |
|---|---|---|
| high | high | fast path — light human check, sample-audited |
| high | low *(or the reverse)* | **full human review, always** — this is the highest-value queue you have |
| low | low | park with a reason; revisit on a trigger (new substation, rezoning, tariff change) |
| either abstains / missing inputs | — | route to data collection, not to review |

"High" and "low" want to be your own numbers, and you should expect to move
them. Set them where the fast path is about 20–30% of volume to start — small
enough that a sampling audit can actually cover it.

**Picking a winner is a decision you make later, with evidence.** After a few
hundred human verdicts you will be able to say which model is better calibrated
*and on which kinds of site* — probably not the same answer for a data centre
and a rural solar farm. That is a far more valuable thing to know than which
model is better overall, and you only get it by keeping both running and
logging both against the human outcome.

---

## 5 · The learning loop, which is the actual asset

Every human verdict is a labelled example. If you log nothing else, log this:

```
site_id · model · version · predicted_drivers · predicted_p
        · human_drivers · human_verdict · who · when
        · partner_verdict · partner_conditions · when
```

Three things fall out of it and nothing else gives you any of them:

1. **Calibration.** Of the sites the model scored 0.8, how many passed? If it's
   0.5 the model isn't wrong, it's miscalibrated, and that's a fixable problem
   in a way that "the model is bad" is not.
2. **Which drivers the model gets wrong.** Overturn rate per driver. If the desk
   overturns "interconnect capacity" 40% of the time and everything else 5%,
   you have found your next engineering task, and it is a data-source problem
   rather than a model problem.
3. **Where the third party disagrees with your own desk.** This one is
   uncomfortable and it is the point. If CIR routinely downgrades sites your
   desk passed, your desk's bar is in the wrong place, and you would rather
   learn that from twenty records than from a lender.

Set a review cadence on it — monthly is about right at low volume — and give it
an owner. A learning loop nobody reads is just a bigger table.

---

## 6 · Where the AI goes, and where it doesn't

The useful line is not "AI does easy things, humans do hard things." It is
**AI proposes, humans dispose, and the AI never signs.**

| Task | Machine | Human |
|---|---|---|
| Pull parcel, zoning, flood, substation distance | ✅ all of it | — |
| Score the site, produce drivers | ✅ | — |
| Read imagery for grade, access, obstructions | first pass, flagged | confirms |
| Interconnection queue position | fetch | interpret |
| Land control | fetch what's public | **human only** — this is a phone call |
| Judge whether a condition is fatal or priced | — | **human only** |
| Bankability opinion | — | **third party only, signed** |
| Draft the packet that goes to the third party | ✅ | reviews before send |
| Draft the client-facing summary | ✅ | approves |

The two rows worth defending: **land control** is where automated screening
fails silently and expensively, because public records are stale and a site
with a willing owner looks identical to one with a hostile one. And a
**bankability opinion has to be signed by someone with something to lose** —
that is what makes it bankable. An unsigned machine opinion is a screen, and
calling it anything else is the one mistake in this pipeline you cannot walk
back.

---

## 7 · What you still have to decide

These are genuine forks, not oversights. The software supports either side of
each; you should pick deliberately.

1. **Does the partner see the client's identity?** Blind review is more
   defensible and harder to run. `partner.discloseClient` in `config.js`;
   default is off, and the packet carries the site without the company.
2. **One verifier or two?** Sending the same site to CIR *and* Juels AI costs
   more and gives you an inter-rater number, which is the only way to know
   whether either is reliable. Worth doing on a sample even if not routinely.
3. **Who pays for a rejected verification?** If the partner is paid per opinion
   they have no incentive to bounce a thin packet back, and thin packets are
   what you actually want returned. Consider paying for `info_requested` too.
4. **What is the fast path's audit rate?** A fast path nobody samples becomes
   the whole funnel within two quarters.
5. **Is the India desk measured on throughput?** If it is, "cannot determine"
   will stop appearing within a month, and it is the most informative value on
   the form.
