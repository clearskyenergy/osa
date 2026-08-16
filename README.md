# ClearSky-OMEGA — Partner Portal

The deployment partners sign into. Verification firms who assess a site and sign
an opinion; manufacturers, utilities, developers and shareholders who refer
deals and want to see what happened to them.

It is the only ClearSky surface an external company gets a login to, and every
decision in here follows from that.

Two consoles, one deployment:

| | | |
|---|---|---|
| `index.html` | **Verification** | a third party works assigned projects and signs an opinion |
| `portfolio.html` | **Portfolio** | who brought each deal, how far it got, what got funded, and what got bought |

`PROCESS.md` is the operating model for the first. `PORTFOLIO.md` is the model
for the second — attribution, stage gates, the five money numbers, and the
access model. Read those for the *why*; this file is the *what*.

---

## What it is for

Projects that pass your screening go over with a packet. The partner opens one,
sees what you sent, and returns four things:

1. **The project's categories** — their own, recorded next to yours
2. **A feasibility verdict** — can this be built here
3. **A bankability verdict** — would a lender fund it on these terms
4. **A signed document** — the artifact that leaves your company

Plus notes, and the ability to hand a thin packet back rather than guess at it.

---

## The one structural decision — read this before anything else

**A verification is its own document. It is not a `verified: true` field on the
project.** Everything else in this repo follows, so it's worth the two minutes.

**Two opinions on one site.** You may want CIR *and* Juels AI on the same
project — it is the only way to find out whether either is reliable. A field
holds one answer and the second writer destroys the first. Documents hold both,
and the disagreement between them is the most valuable number in the pipeline.

**Access.** A field on `intake_projects` means a partner with write access to
`intake_projects`. There is no rule that grants "write one field" without the
read that makes the record findable, so a client's whole queue — every site,
every fee, every contact — would be one query away from an external company.
A verification document is scoped to one `partnerOrg` in a single rules line.

**The opinion is the artifact.** A bankability verdict is signed, dated and
attributed. Something a later save can quietly overwrite is not something a
lender can rely on, which is why signing here *appends* rather than replaces.

---

## The packet is a snapshot, not a join

`packet` is a frozen copy of the project as it stood at assignment. Two things
follow, and both are the point:

- The partner needs **no read on `intake_projects` or `projects` at all**. The
  cost is duplicated JSON, which is the correct side of that trade by a wide
  margin.
- A verdict stays attached to the facts it was given. Resize the site after
  assignment and the opinion does not silently start describing a different
  project — it goes stale, visibly, and you reassign. **Silent staleness is
  what makes a signed document worthless six months later**, and it is
  invisible until it isn't.

---

## The pipeline

```
  assigned        ──▶ sent, not opened. Turnaround clock running.
      │
  accepted        ──▶ partner took it and declared no conflict
      │
  in_review       ──▶ under assessment
      │
  info_requested  ──▶ they asked us something. CLOCK PAUSED.
      │
  submitted       ──▶ verdict signed. Read-only.
      │
  closed          ──▶ ClearSky accepted it into the project record
```

`declined` and `withdrawn` sit outside. Both exist so that "we are not doing
this" never has to be expressed as a verdict on a site nobody assessed.

### Why `info_requested` pauses the clock

Because otherwise the metric measures your packet quality and bills it to the
partner. They sit on a question you haven't answered, their SLA turns red, and
the lesson they take is that asking cost them. **Thin packets coming back is
the behaviour you want**, so it has to be free.

Accounting is two fields — `pausedMs` accumulates on resume, `pausedAt` holds
the open interval — rather than a walk of the activity log. The log is a
display artifact, and deriving a contractual number from it means a cosmetic
change to logging silently moves an SLA.

---

## Four values on each axis, and the fourth is the one that matters

| Feasibility | Bankability |
|---|---|
| Feasible | Bankable |
| Feasible with conditions | Bankable with conditions |
| Not feasible | Not bankable |
| **Cannot determine** | **Cannot determine** |

Give a reviewer only pass/conditional/fail and they will pick one. You will
never know which of your passes were guesses, and the packet that produced the
guess will never get fixed.

Same principle as *Needs sizing* in the ops console: an unanswered question is
not a small number, and burying it in the nearest real value destroys the only
signal that would have told you the input was thin.

### What the console refuses to let through

Each of these is a rule you would otherwise discover by reading a useless
opinion three weeks later:

| Refused | Because |
|---|---|
| Conditional with no conditions listed | reads as a yes to anyone in a hurry |
| Negative with no blocker named | cannot be worked or appealed |
| *Cannot determine* with no summary | the whole value is saying what was missing |
| A summary under 40 characters | the summary is the part that gets read |
| Signing with no document attached | an opinion with nothing attached is a chat message |
| No confidence stated | a low-confidence pass and a high-confidence pass are different answers |

---

## Categories: theirs and yours, side by side

The eight categories are the ones the ops console already screens on — the six
in the intake's `scope` map plus `powergen` and `charging`, which only ever
appear on an editor-drawn site. Keep `partner.categories` in step with
`ops.finance.qualify`'s keys in the ops repo, or a partner can pick a category
your own screening cannot express, and it vanishes on the way back.

The form arrives pre-filled with **your** categorisation, so the reviewer either
confirms it by doing nothing or changes it deliberately. **The change is a
finding, not a correction** — "you called this solar, there's 900 kWh of storage
in it" is worth more than the checkbox suggests. Both sets are stored, the
Completed table shows what moved, and the dashboard counts how often it happens.

---

## Signing is append-only

The previous verdict goes to `verdictHistory` with the reason it was superseded.
Nothing is deleted, and the rules refuse `delete` on the collection outright —
from both sides, administrators included.

Reissuing an opinion is a normal act. Doing it invisibly is not, and "we edited
it after the fact" is a sentence you do not want to have to say to a lender.

**ClearSky staff cannot write a partner's verdict.** Same shape as the
commission-approval chain in the ops console, same reason: the entire value of
an independent opinion is that it is independent, and one party able to both
commission and author it collapses that to nothing. If a verdict has to change,
the partner reissues. If the partner has gone away, withdraw the assignment and
say why.

---

## Who gets in

Resolved from the email domain against `partner.orgs` in `config.js`. The
browser check is the polite one; `firestore.rules` is the real one.

**Partners are not discovered.** Tenants in the ops console appear because they
submitted something, which is a convenience. A verification partner appearing
because they signed in would be a stranger holding a queue. Every entry in
`partner.orgs` is a deliberate act.

Three strings have to agree, all lowercase:

| | Where |
|---|---|
| the `partner.orgs` key | this repo's `config.js` |
| `partnerOrg` on the document | written by `assign-panel.js` |
| the domain the reviewer signs in from | their mailbox |

A capital letter in any of them is an empty queue on their side, which reads to
them as *ClearSky never sent it*.

`signers` narrows who on that domain may sign, as opposed to review. Leave it
empty to allow the whole domain — but the opinion carries the signer's name, and
"anyone with a company address" is probably not who you meant.

**ClearSky staff signing in here** get every partner's queue, read-only. That is
how you see what a partner is sitting on without asking them, and it is
deliberately not a signing seat.

---

## Blind review

`partner.discloseClient: false` hides the client name and contact from the UI.
The site, sizing and numbers still go over.

**It is a display setting only.** `assign-panel.js` is what actually strips the
client from the packet, because a determined reviewer can read their own
Firestore document. If you need real blinding, that is the file — this flag is
the courtesy version.

---

## The portfolio side

`portfolio.html` tracks the commercial life of a site: who referred it, how far
it got, what closed, where the money went, and what got bought from whom.
`PORTFOLIO.md` is the argument; the short version is four decisions.

**Attribution is write-once.** `origination.partnerOrg` decides who gets paid,
and it locks the moment a deal leaves *Referred*. Changing it takes an
administrator, a written reason, and leaves the previous partner in
`originationHistory` permanently. An editable field here is not a fact — it is
the opening position in an argument you will have eighteen months from now.

**Origination and participation are different relationships.** A battery
manufacturer who refers a site and then supplies its cells has two commercial
relationships with you, a referral fee and a purchase order. One "partner" field
makes the second invisible in every report you run. So `origination` is one org,
`participants[]` is many with roles, `bom[].supplierOrg` is per line, and the
Partners view totals all three separately.

**Five money numbers, never merged.** Requested, committed, closed, drawn,
deployed. People merge the first two because both feel like a yes and the middle
two because both feel like money, and both merges hide the failure that matters:
capital promised and never closed, and capital closed and sitting undrawn while
a supplier waits to be paid. Drawn and deployed are computed from the lines
beneath them, never stored.

**Dead deals stay in the denominator forever.** A partner who referred forty
sites and funded one is a different partner from one who referred one and funded
one. Deletion is refused in the rules for everyone including administrators, a
dead deal needs a reason from a fixed list, and the conversion cascade counts
deals that *ever reached* each gate rather than what is sitting there now —
otherwise the curve improves every time something blows up.

Each stage also names the evidence required to enter it and refuses without it:
no pre-dev without a budget, no *Verified* without a signed opinion id, no
*Funded* without an amount, a date and an investor. Same discipline as refusing
a conditional verdict with no conditions listed.

---

## Who gets in — this changed

**v1 gated sign-in on a hardcoded domain allowlist in `config.js`. That is
gone.** It was right for two named verifiers and wrong for a portal meant to
hold every manufacturer, utility and shareholder who refers a deal: each new
partner meant an edit and a redeploy, and the person who most needed access was
always the one you had not added yet.

Access is now request-and-approve, in `omega_users`. Anyone can sign in; what
they reach is a waiting screen until somebody approves them.

**The trade is real and worth stating.** The allowlist meant a stranger could
not get in at all. The queue means a stranger can reach a screen. That is only
safe because a pending user's queries are *refused by the rules* rather than
hidden by the UI, the waiting screen names no deal, partner or other user, and
the only document a pending account can read anywhere is its own row. If an
`isActive()` check in the rules is ever relaxed to `signedIn()` for
convenience, the approval queue becomes decoration.

| Role | Approves | Sees | Signs verdicts |
|---|---|---|---|
| Owner | anyone | everything | — |
| Administrator | anyone below admin | everything | — |
| Limited administrator | only their named orgs | only their named orgs | — |
| Partner administrator | own org, below their rank | own org's deals | yes |
| Member | — | own org's deals | yes |
| Viewer | — | own org's deals | — |

**Limited administrator** is a full administrator scoped to named partner
organisations — the "other limited admins" case. It exists because "can approve
users" and "can approve *any* user" are different grants, and without the
distinction the only way to let somebody run a region is to let them run
everything. They can work a pipeline but cannot touch attribution or funding: a
regional manager should not be able to declare a financial close.

**Partner administrator** lets a manufacturer onboard their own engineers
without a ClearSky ticket. The *first* user of a new org can never be approved
by their own org's partner admin — there isn't one yet — so ClearSky approves
the first and they approve the rest. Without that, anyone with a company address
invents an org and approves themselves into it.

Three holes closed in the rules, not just the UI: nobody approves themselves,
nobody grants a role above their own, and a partner admin cannot mint a second
partner admin.

### The owner is pinned and cannot be removed

`access.owner` in `config.js` — currently `tom@clearsky-usa.com`. Asserted from
config on every sign-in and never read from Firestore, so a bad write cannot
demote the account that repairs bad writes. Neither console offers a way to
demote, suspend or delete it, and the rules refuse independently.

Not deference to a person: the account that can restore everyone else's access
must not be losable by a misclick, and every role system that skips this locks
its own administrators out eventually. Moving it is a config edit and a
redeploy, which is the right friction for this one change.

⚠️ **`portalOwnerEmail()` in `firestore.rules` must match `access.owner` in
`config.js`.** Change one, change both. It is hardcoded in the rules rather than
read from a document precisely because the owner has to survive a bad write to
Firestore.

### Verification scope survives, separately

### Run check-rules.py before every rules deploy

```
python3 check-rules.py firestore.rules
```

**The rules lexer does not nest block comments.** The first `*/` after a `/*`
ends the comment wherever it appears — so a literal `*/` inside prose (writing a
glob like `portal` + `*/` + `p*`, for instance) closes the comment early and
every following line of prose gets parsed as code.

The failure is nasty out of proportion to its cause. The console reports an
error at the first prose token after the early close, which can be dozens of
lines from the actual mistake, then buries it under one
`token recognition error at: '—'` per em-dash in the remainder of the file.
On a rules file that explains itself as thoroughly as this one, that is
hundreds of lines of noise hiding a one-character bug.

`check-rules.py` strips comments the way the lexer does and fails if any prose
character survives, if a literal `*/` sits inside a comment, if braces don't
balance, or if a top-level function is defined twice. The comments in this file
are the point of it, so this check is the price of keeping them.

### Helper names in the merged rules

Every portal helper is prefixed `portal*` / `p*` — `isPortalAdmin()`,
`pActive()`, `pOrg()` and so on. That is not styling. Five names the portal
wanted (`signedIn`, `isAdmin`, `isOwner`, `myRole`, `isPartner`) **already exist
in your rules with different meanings** — `isPartner()` gates who can browse the
financing portal's deal flow, and `isOwner()` is a local function inside
`/fin_projects` meaning the deal's sponsor. Redefining any of them would have
silently rewritten the financing portal's access model. Don't tidy the prefixes
away.

`partner.orgs` is no longer a sign-in gate but is still the list of who may
**sign an opinion**. Portal access is a login level; signing a bankability
opinion is a retained engagement. A utility that refers deals belongs in the
first and must never land in the second by accident. An approved org that is not
a retained verifier sees the verification console, sees an empty queue, and is
told plainly why.

---

## What's in here

| File | Goes where | Notes |
|---|---|---|
| `index.html` | this repo | Verification console |
| `portfolio.html` | this repo | Deal pipeline, partners, funding, BOM, users |
| `access-data.js` | this repo | Identity, roles, approval queue. **Both consoles** |
| `portfolio-data.js` | this repo | Deals, stages, viability, permitting, assignment, funding, BOM, KPIs |
| `ingest-data.js` | this repo | Adoption from existing collections + Excel import |
| `partner-data.js` | this repo | Assignment model, verdicts, SLA, documents |
| `config.js` | this repo | **The only file to edit** |
| `firestore.rules` | **complete file** | Your live rules with the four new collections merged in. Deploy as-is |
| `storage.rules.additions` | **fragment** | One match block to paste into your *existing* storage.rules |
| `check-rules.py` | dev tool | Run before every rules deploy. See below |
| `assign-panel.js` | **the ops repo** | Drop-in "Send to partner" for the ops console |
| `PROCESS.md` / `PORTFOLIO.md` / `PLATFORM.md` | — | The operating models. Not code |
| `omega-logo.png` | platform asset | Copy from the ops repo |

`assign-panel.js` is shipped here so both halves of the handoff can be read side
by side. It belongs next to `ops-data.js`. Two lines in the ops console:

```html
<script src="/assign-panel.js?v=1"></script>
```
```html
<button onclick="OmegaAssign.open(req)">Send to partner</button>
```

Nothing else in the ops console changes.

---

## Deploying

1. Copy `omega-logo.png` from the ops repo. There is no logo in here.
2. Set `access.owner` in `config.js` **and** `portalOwnerEmail()` in
   `firestore.rules` to the same address. With no owner, the first
   external person to sign in lands in an approval queue nobody has the standing
   to clear — the setup guard says so on the sign-in screen rather than letting
   it look like a password problem.
3. **Run `python3 check-rules.py firestore.rules` first, then deploy it.** It is your live rules file with the four new
   collections merged in — every existing collection, helper and clause is
   present and unchanged. Deploying replaces the whole database's rules, so
   deploy this file rather than a fragment. Without it everyone signs in fine
   and sees an empty queue, which looks like *nothing assigned yet* and not
   like a permissions problem. Check this first whenever somebody says they
   can't see anything.
4. Paste the block from `storage.rules.additions` into your **existing**
   `storage.rules` — it is a fragment, not a file, and replacing your storage
   rules wholesale would revoke every upload path the editor and intake form
   already use. Without it a reviewer works a whole assessment and the upload
   fails at the last step, which looks like a file problem rather than a rules
   problem.
5. Push to its own Vercel project on its own hostname. **Do not serve it from
   the ops console's domain** — a partner and a member of staff sharing an
   origin is one config mistake away from sharing a session.
6. Sign in as the owner first, before inviting anyone. The owner's record is
   created on first sign-in; approving people before it exists means approving
   them as nobody.
7. Bump the `?v=` on `config.js`, `access-data.js`, `partner-data.js`,
   `portfolio-data.js` and `ingest-data.js` when any of them change, or the browser serves
   yesterday's copy and the new page runs against the old data layer. That fails
   as *the queue is blank*, not as a load error.

Empty on day one is expected. **Load sample assignments** and **Load a sample
portfolio** give fabricated records, in memory only, shaped like real
documents — which is what you want on the first call with a prospective partner,
before they have any access at all.

---

## What this deliberately does not do

- **No client contact.** The partner cannot message the client, and no client
  address appears anywhere in the packet even with `discloseClient` on. The
  relationship is yours.
- **No fees.** `quote.total` never leaves the ops console. What you charge the
  client is not the reviewer's business and would anchor them if it were.
- **No cross-project view.** A partner sees their assignments and nothing else.
  There is no client list, no portfolio, no search.
- **No verdict deletion, and no deal deletion.** By anyone, including
  administrators. Withdraw or mark dead instead — the record stays visible,
  which is the state you actually want, and it keeps the partner denominators
  honest.
- **No fee calculation.** `feeBasis` is free text and `feeUsd` is entered by
  hand. Fee arrangements differ per MSA and encoding them as a percentage field
  would quietly misstate the ones that don't fit.
- **No accounting integration.** `drawn` is what the console was told, not what
  the bank says. Reconciling those is a real project, and an unlabelled number
  pretending otherwise would be worse than the gap.
