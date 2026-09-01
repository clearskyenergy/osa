/* ═══════════════════════════════════════════════════════════════════════════════
   /api/grid-atlas.js — Grid Atlas as a service
   Vercel serverless function.

   ─────────────────────────────────────────────────────────────────────────────
   WHY A SERVICE RATHER THAN THE PAGE
   ─────────────────────────────────────────────────────────────────────────────
   grid-atlas.html is a browser tool: somebody opens it, types an address, reads
   the map. That is the right shape for a human, and the wrong shape for four
   things we now want:

     · running it automatically when a deal reaches screening
     · running it for a hundred adopted sites without opening a hundred tabs
     · letting OGI's tool call it, so their score is informed by our grid data
     · getting the same answer every time, from anywhere

   A service does all four. The page keeps working exactly as it does; it can
   even be pointed at this endpoint so there is one implementation rather than
   two — see the note at the bottom.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT YOU HAVE TO FILL IN
   ─────────────────────────────────────────────────────────────────────────────
   Everything here is real except the three data lookups, which are marked
   ⚠ DATA SOURCE. Grid Atlas already queries something for substations, lines
   and plants — HIFLD, EIA, a cached layer, your own table. Point those three
   functions at whatever it uses and this is finished.

   The scoring model below is deliberate and defensible, but it is a starting
   position: if Grid Atlas already scores, replace `score()` with that logic
   rather than keeping two.

   ENVIRONMENT VARIABLES
     GOOGLE_GEOCODING_KEY   turns an address into coordinates
     GRID_ATLAS_KEY         optional: require callers to present this, so OGI
                            can call it without the endpoint being open to
                            the internet
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ── The scoring model ────────────────────────────────────────────────────
   Four measurements, weighted. Every one of them is a distance or a number
   somebody could check on a map, which is the point: this is a MEASUREMENT,
   and the judgement about whether the site is worth developing happens
   elsewhere with this as an input.

   Weights are here rather than buried so they can be argued with. */
const MODEL = {
  version: 'grid-atlas-svc-v1',
  weights: { substation: 4, voltage: 3, transmission: 2, congestion: 1 },

  /* Distance to the nearest substation. The curve is deliberately steep early:
     the difference between 0.5 km and 2 km is most of the interconnection cost,
     while the difference between 20 km and 30 km barely matters because both
     are "you are building a line". */
  substationScore(km) {
    if (km == null) return null;
    if (km <= 0.5) return 10;
    if (km <= 1)   return 9;
    if (km <= 2)   return 8;
    if (km <= 5)   return 6;
    if (km <= 10)  return 4;
    if (km <= 20)  return 2;
    return 1;
  },

  /* Is the voltage class useful for a project this size? A 12 kV distribution
     tap is fine for 2 MW and useless for 75 MW, so this is scored against the
     project rather than in the abstract. */
  voltageScore(kv, sizeMw) {
    if (kv == null) return null;
    const mw = sizeMw || 5;
    if (mw <= 5)   return kv >= 12  ? 10 : 5;
    if (mw <= 20)  return kv >= 34  ? 10 : kv >= 12 ? 6 : 3;
    if (mw <= 100) return kv >= 115 ? 10 : kv >= 69 ? 7 : 3;
    return kv >= 230 ? 10 : kv >= 115 ? 7 : 3;
  },

  transmissionScore(km) {
    if (km == null) return null;
    if (km <= 1)  return 10;
    if (km <= 3)  return 8;
    if (km <= 10) return 5;
    return 2;
  },

  /* Generation already nearby is a mixed signal: it proves the area is
     interconnectable, and it is also what fills a queue. Scored mildly and
     weighted lightly for exactly that reason. */
  congestionScore(plants) {
    const n = (plants || []).length;
    if (n === 0) return 7;
    if (n <= 2)  return 8;
    if (n <= 5)  return 6;
    return 4;
  }
};

function weightedScore(parts) {
  let earned = 0, total = 0;
  const rows = [];
  for (const [key, weight] of Object.entries(MODEL.weights)) {
    const v = parts[key];
    if (v == null) {
      /* UNSCORED IS NOT ZERO. A measurement we could not take drops out of
         both sides rather than counting against the site — scoring a missing
         lookup as nil quietly turns a weighted model into a random one. */
      rows.push({ key, weight, value: null, unscored: true });
      continue;
    }
    earned += v * weight;
    total  += weight;
    rows.push({ key, weight, value: v, unscored: false });
  }
  return {
    score: total ? Math.round((earned / (total * 10)) * 100) : null,
    rows,
    unscored: rows.filter(r => r.unscored).length
  };
}

/* ── Geocoding ───────────────────────────────────────────────────────────── */
async function geocode(address) {
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) throw new Error('GOOGLE_GEOCODING_KEY is not set on the server.');
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address='
            + encodeURIComponent(address) + '&key=' + key;
  const r = await fetch(url);
  const j = await r.json();
  if (j.status !== 'OK' || !j.results || !j.results.length)
    throw new Error('Could not locate "' + address + '" (' + j.status + ').');
  const g = j.results[0];
  return { lat: g.geometry.location.lat, lng: g.geometry.location.lng,
           resolved: g.formatted_address };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ⚠ DATA SOURCE — the three functions to point at whatever Grid Atlas uses
   ═══════════════════════════════════════════════════════════════════════════
   Each takes a point and a radius and returns the features near it, nearest
   first, with distanceKm computed. Return [] rather than throwing when a layer
   is unavailable: a partial answer with the gap declared is far more useful
   than no answer, and weightedScore() already treats a missing measurement as
   unscored rather than bad. */

async function findSubstations(lat, lng, radiusKm) {
  // return [{ name, distanceKm, voltageKv, owner }]
  return [];
}
async function findLines(lat, lng, radiusKm) {
  // return [{ name, distanceKm, voltageKv }]
  return [];
}
async function findPlants(lat, lng, radiusKm) {
  // return [{ name, distanceKm, fuel, capacityMw }]
  return [];
}

/* Haversine, for computing distanceKm once the raw features are in hand. */
function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat/2) ** 2
          + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng/2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  /* Optional shared secret. Set GRID_ATLAS_KEY once OGI is calling this, so
     the endpoint is not simply open. Skipped when unset so it works from the
     console on day one without ceremony. */
  const want = process.env.GRID_ATLAS_KEY;
  if (want) {
    const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (got !== want) return res.status(401).json({ error: 'Bad or missing key.' });
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const { address, sizeMw } = body;
  let { lat, lng } = body;
  const radiusKm = Number(body.radiusKm) || 25;

  if (lat == null || lng == null) {
    if (!address) return res.status(400).json({ error: 'address or lat/lng required.' });
    try {
      const g = await geocode(address);
      lat = g.lat; lng = g.lng;
      body.resolvedAddress = g.resolved;
    } catch (e) {
      return res.status(422).json({ error: String(e.message || e) });
    }
  }

  try {
    /* In parallel: one slow layer should not serialise the others. */
    const [substations, lines, plants] = await Promise.all([
      findSubstations(lat, lng, radiusKm).catch(() => null),
      findLines(lat, lng, radiusKm).catch(() => null),
      findPlants(lat, lng, radiusKm).catch(() => null)
    ]);

    /* null means the layer failed; [] means it worked and found nothing. The
       difference matters: "no substation within 25 km" is a finding, "we could
       not check" is not. */
    const nearestSub  = substations && substations[0];
    const nearestLine = lines && lines[0];

    const computed = weightedScore({
      substation:   substations ? MODEL.substationScore(nearestSub ? nearestSub.distanceKm : 999) : null,
      voltage:      substations && nearestSub ? MODEL.voltageScore(nearestSub.voltageKv, sizeMw) : null,
      transmission: lines ? MODEL.transmissionScore(nearestLine ? nearestLine.distanceKm : 999) : null,
      congestion:   plants ? MODEL.congestionScore(plants) : null
    });

    const findings = [];
    if (!substations) findings.push({ severity:'note', text:'Substation layer unavailable — not scored.' });
    if (!lines)       findings.push({ severity:'note', text:'Transmission layer unavailable — not scored.' });
    if (substations && !nearestSub)
      findings.push({ severity:'blocker', text:'No substation within ' + radiusKm + ' km.' });
    if (nearestSub && nearestSub.distanceKm > 10)
      findings.push({ severity:'risk', text:'Nearest substation is ' + nearestSub.distanceKm
        + ' km — interconnection cost will dominate the budget.' });
    if (nearestSub && sizeMw && nearestSub.voltageKv && MODEL.voltageScore(nearestSub.voltageKv, sizeMw) <= 3)
      findings.push({ severity:'risk', text:'Nearest substation is '
        + nearestSub.voltageKv + ' kV, thin for ' + sizeMw + ' MW.' });

    const summary = nearestSub
      ? nearestSub.voltageKv + ' kV substation ' + nearestSub.distanceKm + ' km away'
        + (nearestLine ? ', transmission ' + nearestLine.distanceKm + ' km' : '')
      : 'No substation found within ' + radiusKm + ' km';

    res.status(200).json({
      score: computed.score,
      model: MODEL.version,
      summary,
      lat, lng,
      resolvedAddress: body.resolvedAddress || address || '',
      substations: substations || [],
      lines: lines || [],
      plants: plants || [],
      criteria: computed.rows,
      unscored: computed.unscored,
      findings
    });
  } catch (err) {
    res.status(502).json({ error: 'Grid Atlas failed.',
      detail: String((err && err.message) || err).slice(0, 300) });
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   POINTING grid-atlas.html AT THIS
   ─────────────────────────────────────────────────────────────────────────────
   Optional, and worth doing eventually. If the page calls this endpoint instead
   of doing its own lookups, there is one implementation of the scoring model
   and the page cannot drift from what the pipeline records. The map rendering
   stays exactly where it is — only the analysis moves.

       const r = await fetch('/api/grid-atlas', {
         method:'POST', headers:{'Content-Type':'application/json'},
         body: JSON.stringify({ address, sizeMw })
       });

   Until then the two coexist safely: the console uses this, the page uses its
   own, and the only cost is that a number in the console may not exactly match
   the same site opened in the page. Worth closing, not urgent.
   ───────────────────────────────────────────────────────────────────────────── */
