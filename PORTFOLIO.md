# The portfolio model

`PROCESS.md` describes how a site moves from origination to a signed opinion.
This describes what happens either side of that: who brought it, and what the
money did afterwards.

The two documents share one idea. A pipeline with stages and no gates is a list
of things in progress, and a partner report with no denominators is a
congratulations card.

---

## 1 · Two relationships, not one

Every model of this that fails does so in the same way: one "partner" field.

A battery manufacturer refers a site. Eighteen months later they supply its
cells. Those are **two commercial relationships** — a referral fee and a
purchase order — with different economics, different counterparties inside the
same company, and different failure modes. Store them in one field and the
second one is invisible in every report you ever run, including the one you
show them when they ask why they should keep sending you deals.

So:

| | Field | Cardinality | Locks |
|---|---|---|---|
| **Who brought it** | `origination` | exactly one org | yes, at the first gate |
| **Who else is on it** | `participants[]` | many orgs with roles | no |
| **Who supplied what** | `bom[].supplierOrg` | per line | no |

The Partners view totals all three separately, and the deal drawer flags a BOM
line whose supplier also referred the site — because that is the fact you want
in front of you on the call.

---

## 2 · Attribution locks

`origination.partnerOrg` decides who gets paid. An editable field is not a fact;
it is the opening position in an argument you will have eighteen months from now
with a manufacturer holding a different email thread.

It locks the moment the deal leaves `referred` — the moment real work starts on
the strength of who brought it. Before that a mis-keyed partner is a typo. After
it:

- changing it takes an **owner or administrator**, enforced in the rules, not
  just the UI
- a **written reason is required**
- the previous value is preserved in `originationHistory`, permanently
- the change is logged with who and when

The escape hatch is deliberately narrow. Everyone on the deal knows whether the
field can be quietly edited, and that knowledge is what determines whether the
number means anything.

**Unattributed deals are allowed and shown in red.** Own origination is real,
and a deal with a blank originator is a gap to close rather than a record to
refuse. It sits in its own pipeline filter so it does not just get forgotten.

---

## 3 · The stages, and what each one costs to assert

```
  referred      a partner brought it. attribution set here.
  screening     machine screen + human desk. no money spent.
  pre_dev       we are spending: land, interconnection, permits, studies.
  verified      a third party has SIGNED an opinion.
  marketplace   listed to capital.
  committed     term sheet signed. not money.
  funded        financial close. legally committed capital.
  construction  notice to proceed. the BOM is live.
  operating     commercial operation.
```

Plus `parked` (revisit on a trigger) and `dead` (reason required). Both stay in
every partner denominator forever — see §6.

Each stage names evidence, and the console refuses to advance without it:

| Stage | Needs | Because |
|---|---|---|
| `pre_dev` | a budget | pre-dev without one is how a screening exercise becomes a six-figure line item nobody approved |
| `verified` | a signed verdict id | this stage claims an outside signature exists — the one claim in this pipeline you cannot walk back |
| `marketplace` | size and capex | a listing with neither wastes an investor's first look |
| `committed` | amount and counterparty | committed is a promise, and a promise from nobody is not one |
| `funded` | amount, date, investor | close needs all three or it is not close |
| `construction` | NTP date | — |
| `operating` | COD | — |

Same discipline as the verification console refusing a conditional verdict with
no conditions listed. The stage list without the gates is just labels.

**Entering a number does not move the stage.** Typing `closedUsd` is
bookkeeping; declaring close is a decision. Auto-advancing on a typo would mark
a deal funded in every report before anyone noticed, and the report is what
somebody quotes on a call.

---

## 4 · Five money numbers, none of which collapse

| | Means | Common mistake |
|---|---|---|
| **Requested** | what we asked the market for | treating it as pipeline value |
| **Committed** | a term sheet is signed | reading it as closed — it is real and revocable |
| **Closed** | financial close, legally committed | reading it as cash |
| **Drawn** | actually disbursed. sum of funded draws | — |
| **Deployed** | spent on the asset: committed BOM + pre-dev spend | — |

People merge the first two because both feel like a yes, and the middle two
because both feel like money. Both merges hide the failure that matters:

- capital that was **promised and never closed** — visible only as
  committed ≫ closed
- capital that **closed and is sitting undrawn** while a supplier waits to be
  paid — visible only as closed − drawn

**Drawn and deployed are computed, never stored.** A stored total that disagrees
with the lines beneath it is worse than no total, because someone will quote it.

### Draws

Each draw carries an amount, a **required purpose**, and three dates —
requested, approved, funded. The gap between requested and funded is the number
a partner actually feels, and it is invisible if you only track a balance.

A draw that would take total drawn plus outstanding past the closed facility is
**flagged, not blocked**. Over-drawing happens; the thing you want is for it to
be visible in the console rather than blocked here and recorded in a
spreadsheet somewhere else.

---

## 5 · BOM: the loop back to the partner

Every line can carry a `supplierOrg`. That single field is what closes the
circle: the manufacturer who referred the site sees the purchase order it
produced, in the same view as the referral.

- Lines roll up by category and by supplier, portfolio-wide
- `specified → quoted → ordered → delivered → installed`, with the last three
  counting as committed spend
- A line with no supplier is fine and common
- A supplier who is not a partner is also fine — they appear in the rollup and
  simply have no login

---

## 6 · Dead deals stay in the denominator. Forever.

A partner who referred forty sites and funded one is a different partner from
one who referred one and funded one. A report that only counts what funded
cannot tell them apart, and it is the report every vendor of this kind of
software ships.

So:

- **Deletion is refused in the rules**, for everyone including administrators.
  Deleting a dead deal flatters exactly the partner whose deals keep dying.
- A dead deal **requires a reason** from a fixed list. Twelve sites lost to
  interconnection cost is a finding you can act on; twelve blanks is not.
- The conversion cascade counts deals that **ever reached** each gate, not what
  is sitting there now. A site that funded and then failed in construction
  still reached funded — counting current stage would make the curve improve
  every time something blew up.

The reason table on the Overview page is the most useful thing on it once it
has a hundred rows.

---

## 7 · Access: request, approve, scope

v1 gated sign-in on a hardcoded domain allowlist. That was right for two named
verification partners and wrong for a portal meant to hold every manufacturer,
utility and shareholder who refers a deal: every new partner meant an edit and a
redeploy, and the person who most needed access was always the one you had not
added yet.

Access is now a request plus an approval, in `omega_users`.

**Be clear about the trade.** The allowlist meant a stranger could not get in at
all. The queue means a stranger can reach a pending screen. That is only safe
because:

- a pending user's queries are **refused by the rules**, not merely hidden by
  the UI
- the pending screen names no deal, no partner and no other user
- the only document a pending account can read anywhere is its own row

Those three are the whole safety argument. If one of the `isActive()` checks in
the rules is ever relaxed to `signedIn()` for convenience, the approval queue
becomes decoration and no UI change puts it back.

### Roles

| Role | Approves | Sees | Signs |
|---|---|---|---|
| **Owner** | anyone | everything | — |
| **Administrator** | anyone below admin | everything | — |
| **Limited administrator** | only their named orgs | only their named orgs | — |
| **Partner administrator** | their own org, below their rank | their own org's deals | verdicts |
| **Member** | — | their own org's deals | verdicts |
| **Viewer** | — | their own org's deals | — |

**Limited administrator** is the "other limited admins" you asked for: a full
administrator scoped to named partner organisations. It exists because "can
approve users" and "can approve *any* user" are very different grants, and
without the distinction the only way to let somebody run a region is to let them
run everything. They can work a pipeline but cannot touch attribution or
funding — a regional manager should not be able to declare a financial close.

**Partner administrator** lets a manufacturer onboard their own five engineers
without a ClearSky ticket. That is the difference between a portal that scales
and one where you are the bottleneck. The **first** user of a new organisation
can never be approved by their own org's partner admin, because there isn't one
yet — ClearSky approves the first, they approve the rest. Without that rule
anyone with a company address invents an org and approves themselves into it.

Three rules close the obvious holes, in the rules file and not only the UI:
nobody approves themselves, nobody grants a role above their own, and a partner
admin cannot mint a second partner admin.

### The owner is pinned in config and unremovable

`access.owner` in `config.js`, currently `tom@clearsky-usa.com`. Asserted on
every sign-in and never read from Firestore, so a bad write cannot demote the
account that repairs bad writes. It cannot be demoted, suspended or deleted from
either console, and the rules refuse it independently.

This is not deference to a person. The account that can restore everyone else's
access must not be losable by a misclick, and every role system that skips this
locks its own administrators out eventually, at the worst possible moment.
Moving it is a config edit and a redeploy — the right amount of friction for
this one change.

**The hardcoded `portalOwnerEmail()` in `firestore.rules` must match
`access.owner` in `config.js`.** Change one, change both.

`firestore.rules` in this repo is a **complete, deployable file** — the live
ClearSky rules with four collections merged in, not a fragment. Deploying
replaces the whole database's rules, so there is no safe way to ship this as a
snippet. Every portal helper in it is prefixed `portal*` / `p*` because five of
the names the portal wanted (`signedIn`, `isAdmin`, `isOwner`, `myRole`,
`isPartner`) already exist there with different meanings — `isPartner()` gates
the financing portal's deal flow. Renaming them back would silently rewrite that
portal's access model.

### Verification scope is separate from portal access

Being approved into the portal is a login level. Signing a bankability opinion
is a **retained engagement**. A utility that refers deals belongs in the first
and must never land in the second by accident, so `partner.orgs` in `config.js`
survives as a short, explicit list of who may sign — unconnected to who happens
to have a password.

An approved org that is not a retained verifier sees the verification console,
sees an empty queue, and is told plainly why.

---

## 8 · What this still does not do

Worth saying out loud, because each is a decision rather than an omission.

- **No fee calculation.** `feeBasis` is free text and `feeUsd` is entered by
  hand. Fee arrangements differ per MSA and encoding them as a percentage field
  would quietly misstate the ones that aren't. Compute it when the arrangements
  have converged, not before.
- **No investor-facing view.** An investor org appears in `participants` and can
  see the deals they are on, but there is no data room, no document exchange and
  no drawdown request workflow from their side.
- **No accounting integration.** `drawn` is what the console was told, not what
  the bank says. Reconciling those is a real project and pretending otherwise
  with an unlabelled number would be worse than the gap.
- **No forecast.** Every number here is what happened. Weighted-pipeline
  forecasting needs conversion rates you do not have yet — and the whole point
  of §6 is that in about two quarters you will.
