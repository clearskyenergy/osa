# Making Grid Atlas callable

The console wants to run a site's address through Grid Atlas during screening
and keep the result on the deal. `grid-atlas-adapter.js` is written and wired;
it needs one thing from `grid-atlas.html`.

## The problem

Grid Atlas is an HTML **page**, not a service. Somebody opens it, types an
address, reads the map. Nothing wrong with that — it is what a human-facing map
tool should be — but there is no function anything else can call.

## Three ways to fix it

**1 — Extract the core.** Move the analysis into `grid-atlas-core.js`:

```js
window.GridAtlas = {
  async analyze({ lat, lng, address }) {
    return {
      score: 87,                       // 0-100 grid proximity
      summary: '138 kV line 1.1 km north, 90 MW available',
      substations: [ { name, distanceKm, voltageKv, owner } ],
      lines:       [ { name, distanceKm, voltageKv } ],
      plants:      [ { name, distanceKm, fuel, capacityMw } ],
      findings:    [ { severity: 'risk', text: 'Queue position 14' } ]
    };
  }
};
```

`grid-atlas.html` loads that file and calls the same function it always did;
nothing changes for anyone using the page. The console loads the same file and
gets the same answer. **One implementation, no drift.** This is the one to do.

**2 — iframe and postMessage.** No refactor, but slow, brittle the first time
the page's internals move, and a silent cross-frame failure is genuinely
unpleasant to debug.

**3 — Reimplement it in the console.** Two copies of the same logic, guaranteed
to disagree within a month, and the disagreement surfaces as two numbers for
one site with nobody able to say which is right. Don't.

## Until then

The adapter falls back to opening Grid Atlas with the address prefilled, so the
rep does the lookup they were going to do anyway without retyping. Turn
`portfolio.gridAtlas.enabled` on in `config.js` once `window.GridAtlas.analyze`
exists.

## What the console does with it

- Stores it on the deal as a **measurement**, separate from the viability score.
  A substation 1.1 km away is a fact; the score is a judgement. Re-scoring must
  not change the fact.
- **Prefills the interconnection criterion** on the manual scoring form
  (87/100 → 9/10), clearly labelled, and overrulable. Proximity is not capacity.
- **Sends it to OGI** in the screening payload. They are scoring a site they
  have never visited; withholding a measurement we already hold would make
  their answer worse for no reason.
- Runs **automatically when a deal reaches screening**, silently. A failure
  there must not look like the assignment failed.

## What it deliberately does not do

Decide anything on its own. A site next to a substation with no capacity in it
scores well on proximity and is still unbuildable — which is exactly why this
is an input to the score rather than the score.
