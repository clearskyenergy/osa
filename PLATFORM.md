# The platform, and why the portfolio is empty

You have deals. They are in `fin_projects`, `intake_projects` and `projects`. The
portfolio console reads `deals`, which nobody has written to yet. That is the
whole reason the screen says *Nothing here* — not a bug, a missing seam.

This document is the answer to "make it a living CRM," in the order the pieces
have to land. `PORTFOLIO.md` is the model; this is how the model meets the four
systems you already run.

---

## 1 · One spine, four systems, no copies

You are one decision away from the worst outcome available here, which is
duplicating deal records into `deals` and then maintaining both. Everything
below exists to avoid that.

```
   intake_projects        the work request. a customer described a site.
        │                 owner: ops console
        │
   projects               the drawing. what the design team built.
        │                 owner: editor
        │
   fin_projects           the listing. what capital sees, offers, unlocks.
        │                 owner: financing portal
        │
   verifications          the signed opinion. third-party feasibility/bankability.
        │                 owner: verification console
        ▼
   deals ◀────────────────────────────────────────────────────────────
        the commercial life of the SITE. who brought it, how far it got,
        what it cost, what it earned, who worked it, where the money went.
```

**A deal holds what no other collection can hold: the thing that is true across
all four.** Attribution, stage, money, assignment, and the audit trail of how it
moved. Everything else stays where it lives and is referenced by id.

| The deal stores | The deal does NOT store |
|---|---|
| `intakeId`, `projectId`, `finProjectId`, `verificationIds` | the intake's form fields |
| stage, and when it entered each one | the drawing, the layout, the equipment |
| attribution, participants, fees | the offers, the NDAs, the unlock ledger |
| viability score, permitting, assignment | the signed PDF |
| the five money numbers, draws, BOM | — |

The one exception is the verification **packet**, which is deliberately a frozen
copy — for the reason in `PORTFOLIO.md` §2. Everything else is a live reference,
because a deal is supposed to change and a snapshot of a moving thing goes stale
silently.

### Adoption, not migration

An existing `fin_projects` record does not move. It gets a `dealId` written onto
it, and a deal gets `finProjectId` written onto it. Two ids, one relationship,
nothing copied, both systems keep working exactly as they do today.

**This needed no rules change**, which is worth knowing because it means you can
do it today: a ClearSky address already has read on `fin_projects` (via
`isAdmin()`), read on `intake_projects` and `projects` (via `isOmegaStaff()`),
and the update clauses on both permit writing a reference field. Adoption is a
staff action and staff already have the permissions. That is not luck — it is
what "the spine references, it does not copy" buys you.

---

## 2 · The lifecycle you actually run

The ladder in v1 was missing two stages you named, and one of them is where most
of your calendar time goes.

```
  referred      a partner brought it. attribution locks on exit.
  screening     machine screen + human desk.
  qualified     ◀ NEW. passed viability scoring. THE GATE INTO SPEND.
  pre_dev       spending: land, interconnection, studies.
  permitting    ◀ NEW. AHJ and utility applications in flight.
  verified      third-party opinion signed.
  marketplace   listed to capital.
  committed     term sheet signed.
  funded        financial close.
  construction  NTP issued. BOM live.
  operating     COD.
```

**One honest caveat about the ladder.** Permitting overlaps pre-dev and often
runs past funding; a linear stage cannot express that. The stage means *the
furthest point this deal has reached*, not *the only thing happening to it*.
That is exactly why the conversion cascade counts `everReached` rather than
current stage, and why `permitting.applications[]` tracks the real, parallel
work independently of what the stage label says. Don't read the stage as a
schedule.

### `qualified` is the gate that matters

It is the only stage between "we are looking at it" and "we are spending money
on it," so it is the one worth defending:

- entering it **requires a viability score**, and the score must pass its
  threshold. The console refuses otherwise — same discipline as refusing a
  conditional verdict with no conditions listed
- the score, its model version, its criteria breakdown, who ran it and when are
  all stored on the deal. A number with no breakdown cannot be argued with, and
  a gate you cannot argue with is a gate people route around
- **scores are appended, not overwritten**. Re-scoring a deal after new
  information keeps the old score visible. "It scored 41 in March and 78 in
  June" is the interesting fact; a lone 78 is not

You said you score with your own tool. The console does both: it has a default
weighted criteria set in `config.js` you can edit, and it accepts an
externally-computed score posted onto the deal. Use whichever; the gate only
cares that a score exists, passes, and says what it was made of.

---

## 3 · Assignment: the design team is not a stage

"Assign the dev and design which is done in the editor" is a different axis from
stage, and merging them is the mistake to avoid. A deal in `pre_dev` might have
design finished and permitting stalled; a deal in `permitting` might have design
not started.

So `assignment` is its own block: a design lead, a dev lead, a due date, and the
`projectId` of the editor job. Two consequences:

- **the editor project is created from the deal**, stamped with the client's
  `orgId`, so the work lands in the client's own portal with no export step —
  the same path the ops console's "Start build" already uses
- a person's workload is a query across deals, not a column on one

What this deliberately does not do is duplicate `omega_staff`. Assignees are
resolved from the staff roster you already maintain. One definition of who works
here.

---

## 4 · The CRM question, answered honestly

You want Monday, Zoho or Salesforce sync. **Do not build that yet**, and the
reason is not effort — it is that a sync built now would encode a schema you are
still changing, and every one of those integrations is easier to add later than
to unpick.

What matters *now* is leaving the seam in the right shape, which costs almost
nothing:

1. **A stable external id.** Every deal carries `externalIds: { monday: '',
   salesforce: '', zoho: '', hubspot: '' }`. Empty today. The moment you sync,
   the mapping already has a home, and you are never matching on site name —
   which is how duplicate CRM records get created.
2. **An outbox, not a push.** Every write already appends to `activity`. A sync
   worker reads that trail and replays it outward. Calling a CRM API inline from
   the browser means a failed call silently loses a change, and you find out
   during a pipeline review.
3. **One direction, decided per field.** The classic failure is bidirectional
   sync with no owner: the CRM and the platform each overwrite the other and the
   record oscillates. Decide per field which system is authoritative. My
   suggestion, from what you have described: **attribution, stage, money and BOM
   are authoritative here** (they are enforced by rules here and by nothing
   there); **contacts and activity/notes are authoritative in the CRM** (that is
   what a CRM is actually good at).

Point 3 is the one to settle before writing a line of connector code. Everything
else follows from it.

---

## 5 · Excel import

Real, and worth doing early, because your existing portfolio is in spreadsheets
and typing it in twice is how it never gets in at all.

The importer maps columns to deal fields, previews every row, and **refuses to
import a row with no originating organisation** — same rule as the referral
form, for the same reason. An import is the easiest way to lose attribution on a
hundred deals at once.

Two rules I would not relax:

- **imported rows land in `referred` or `screening`, never further.** A
  spreadsheet cannot carry the evidence the later gates require, and importing
  straight to `funded` would put numbers in your dashboard that never passed a
  gate
- **every imported deal is tagged `source: 'import'` with the filename and
  timestamp.** When a number looks wrong in six months, "which import did this
  come from" is the first question

---

## 6 · Sequencing

In the order that unblocks the most, soonest.

| | What | Why now |
|---|---|---|
| **1** | **Adopt existing records** — `fin_projects`, `intake_projects`, `projects` into deals | Your screen is empty and your deals are real. Nothing else matters until this works. No rules change needed |
| **2** | Viability scoring + the `qualified` gate | It is the decision you described most concretely, and it gates spend |
| **3** | Assignment + editor project creation | Closes the loop to the design team |
| **4** | Permitting tracking | Long-running, and currently invisible |
| **5** | Excel import | Gets the back catalogue in |
| **6** | CRM sync | Only after the schema stops moving. Settle §4.3 first |

Steps 1–5 are in this build. Step 6 is not, deliberately.

---

## 7 · What I would push back on

**"They should show up in here" is doing a lot of work.** Not every
`fin_projects` record should become a deal. A sponsor's draft, a deal that died
in review, a test record from 2025 — adopting all of them gives you a portfolio
whose denominators are meaningless from day one, and the denominators are the
entire point of the partner reporting.

So adoption is a **reviewed inbox**, not a background job. The console shows you
what is adoptable, you pick, and each adoption asks one question the source
record cannot answer: **who brought it.** `fin_projects` has a `developerUid`
and an `orgKey` — that is who *filed* it, which is frequently not who *referred*
it. Getting that wrong at adoption time means getting attribution wrong on your
entire back catalogue at once, and attribution locks.

Budget the time. Fifty deals at thirty seconds each is half an hour, once.
