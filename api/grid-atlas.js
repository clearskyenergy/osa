/* тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
   /api/grid-atlas.js тАФ Grid Atlas as a service
   Vercel serverless function.

   тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   WHY A SERVICE RATHER THAN THE PAGE
   тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   grid-atlas.html is a browser tool: somebody opens it, types an address, reads
   the map. That is the right shape for a human, and the wrong shape for four
   things we now want:

     ┬╖ running it automatically when a deal reaches screening
     ┬╖ running it for a hundred adopted sites without opening a hundred tabs
     ┬╖ letting OGI's tool call it, so their score is informed by our grid data
     ┬╖ getting the same answer every time, from anywhere

   A service does all four. The page keeps working exactly as it does; it can
   even be pointed at this endpoint so there is one implementation rather than
   two тАФ see the note at the bottom.

   тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   WHAT YOU HAVE TO FILL IN
   тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   Everything here is real except the three data lookups, which are marked
   тЪа DATA SOURCE. Grid Atlas already queries something for substations, lines
   and plants тАФ HIFLD, EIA, a cached layer, your own table. Point those three
   functions at whatever it uses and this is finished.

   The scoring model below is deliberate and defensible, but it is a starting
   position: if Grid Atlas already scores, replace `score()` with that logic
   rather than keeping two.

   ENVIRONMENT VARIABLES тАФ both optional
     GOOGLE_GEOCODING_KEY   fallback geocoder for addresses the free US Census
                            geocoder cannot match. Not needed to start.
     GRID_ATLAS_KEY         require callers to present this, so OGI can call
                            the endpoint without it being open to the internet.
   тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР */

/* тФАтФА The scoring model тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   Four measurements, weighted. Every one of them is a distance or a number
   somebody could check on a map, which is the point: this is a MEASUREMENT,
   and the judgement about whether the site is worth developing happens
   elsewhere with this as an input.

   Weights are here rather than buried so they can be argued with. */
/* Stamped into every response, including errors. The last round of confusion
   was entirely "which version of this function is actually running" тАФ the
   console showed a new build stamp while the serverless function was still the
   previous one, and nothing in the reply said so. Bump this whenever the file
   changes and the answer is visible from any response. */
const BUILD = '2026-09-01.geocode-guarded';

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
         both sides rather than counting against the site тАФ scoring a missing
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

/* тФАтФА Geocoding тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   NOBODY SHOULD HAVE TO TYPE COORDINATES. A site has an address; turning that
   into a point is this file's job, and asking a person to right-click a map
   means the automation failed.

   Three things make that work in practice.

   1 ┬╖ CLEAN THE ADDRESS FIRST. Real addresses on real deals carry building and
       suite designators тАФ "600 N Union Ave Blg 6B" тАФ and street-level
       geocoders reject the whole string rather than ignoring the part they do
       not understand. Stripping the unit is not lossy for this purpose: Grid
       Atlas cares which parcel the building sits on, not which door.

   2 ┬╖ TRY MORE THAN ONE PROVIDER, all free. Census is authoritative for US
       street addresses; Nominatim covers what Census misses, including places
       named rather than numbered. Google is used only if a key happens to be
       set, and is not needed.

   3 ┬╖ DEGRADE, DO NOT FAIL. If the full address will not match, try it without
       the unit, then without the street number, then the town. A point two
       streets away still answers "how far to the nearest substation" usefully;
       no point at all answers nothing. Whatever it settles for is reported, so
       a rough match is visible rather than silently passed off as exact. */

const UNIT_RE = /[,\s]+(?:apt|apartment|bldg|blg|bld|building|ste|suite|unit|fl|floor|rm|room|lot|trlr|space|spc|dept|hangar|slip|pier)\.?\s*[\w-]*/ig;
const HASH_RE = /[,\s]*#\s*[\w-]+/g;

function cleanAddress(a) {
  return String(a || '')
    .replace(/\s+/g, ' ')
    .replace(UNIT_RE, '')
    .replace(HASH_RE, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/[,\s]+$/, '')
    .replace(/^\s*,\s*/, '')
    .trim();
}

/* Progressively less specific attempts. Each is a real address somebody could
   post a letter to, so a match against one is a real place тАФ just less precise
   than the last. */
function addressVariants(a) {
  const out = [];
  const push = v => { v = (v || '').trim(); if (v && out.indexOf(v) < 0) out.push(v); };
  push(a);
  push(cleanAddress(a));

  const cleaned = cleanAddress(a);
  const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);

  /* Drop the street number: "600 N Union Ave" becomes "N Union Ave", which
     still lands on the right street. */
  if (parts.length) {
    const noNumber = parts[0].replace(/^\s*\d+[A-Za-z]?\s+/, '');
    if (noNumber !== parts[0]) push([noNumber].concat(parts.slice(1)).join(', '));
  }
  /* Town and state alone. Coarse, and reported as such in the response. */
  if (parts.length > 1) push(parts.slice(1).join(', '));
  return out;
}

async function tryCensus(q) {
  const url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
            + '?address=' + encodeURIComponent(q)
            + '&benchmark=Public_AR_Current&format=json';
  const r = await fetch(url);
  if (!r.ok) throw new Error('census ' + r.status);
  const j = await r.json();
  const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
  if (!m) throw new Error('census: no match');
  return { lat: m.coordinates.y, lng: m.coordinates.x,
           resolved: m.matchedAddress, provider: 'census' };
}

/* OpenStreetMap. Free, no key. Their policy asks for an identifying
   User-Agent, which is why one is set тАФ sending a generic one would be
   rude and gets you blocked. */
async function tryNominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1'
            + '&countrycodes=us&q=' + encodeURIComponent(q);
  const r = await fetch(url, {
    headers: { 'User-Agent': 'ClearSky-OMEGA/1.0 (grid-atlas; ops@clearsky-usa.com)' }
  });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const j = await r.json();
  if (!j || !j.length) throw new Error('nominatim: no match');
  return { lat: Number(j[0].lat), lng: Number(j[0].lon),
           resolved: j[0].display_name, provider: 'nominatim' };
}

async function tryGoogle(q) {
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) throw new Error('google: no key set');
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address='
            + encodeURIComponent(q) + '&key=' + key;
  const r = await fetch(url);
  const j = await r.json();
  if (j.status !== 'OK' || !j.results || !j.results.length)
    throw new Error('google: ' + j.status);
  const g = j.results[0];
  return { lat: g.geometry.location.lat, lng: g.geometry.location.lng,
           resolved: g.formatted_address, provider: 'google' };
}

/* тФАтФА Guarding against a confident wrong match тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   "600 N Union Ave Blg 6B" has no city, state or postcode, so Census matched
   "600 W NORTH UNION RD, AUBURN, MI" тАФ a real address 900 km from the real
   site, in the wrong state. Everything downstream then measured the wrong
   place and reported it with the same confidence as a correct one.

   Two defences:

   1 ┬╖ REFUSE A BARE STREET. Without a city, state or ZIP there is nothing to
       disambiguate between the dozens of "N Union Ave" in the country, and a
       geocoder will pick one rather than admit it cannot tell. Asking for the
       city is a five-second fix; a silently wrong location is not.

   2 ┬╖ CHECK THE MATCH AGAINST WHAT WAS ASKED. If the address named a state or
       ZIP and the match came back in a different one, that is not a near miss,
       it is a different place. */

const STATES = ('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN '
  + 'MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC')
  .split(' ');

function statesIn(s) {
  var up = ' ' + String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ') + ' ';
  return STATES.filter(function (st) { return up.indexOf(' ' + st + ' ') >= 0; });
}
function zipsIn(s) {
  return (String(s || '').match(/\b\d{5}\b/g) || []);
}

/* Enough to place it: a state, a ZIP, or a comma-separated locality. */
function hasLocality(a) {
  var s = String(a || '').trim();
  if (zipsIn(s).length) return true;
  if (statesIn(s).length) return true;
  /* "275 Research Parkway, Meriden" тАФ a comma with words after it is a town. */
  return /,\s*[A-Za-z][A-Za-z .'-]{2,}\s*$/.test(s);
}

function matchConflicts(asked, matched) {
  var aS = statesIn(asked), mS = statesIn(matched);
  if (aS.length && mS.length && aS.indexOf(mS[0]) < 0 && mS.indexOf(aS[0]) < 0)
    return 'the address says ' + aS[0] + ' but the match is in ' + mS[0];
  var aZ = zipsIn(asked), mZ = zipsIn(matched);
  if (aZ.length && mZ.length && aZ[0] !== mZ[0]
      && aZ[0].slice(0, 3) !== mZ[0].slice(0, 3))
    return 'the address says ' + aZ[0] + ' but the match is ' + mZ[0];
  return null;
}

async function geocode(address) {
  if (!hasLocality(address))
    throw Object.assign(new Error(
      'The address "' + address + '" has no city, state or ZIP, so there is nothing to '
      + 'tell it apart from every other street of that name in the country. A geocoder '
      + 'will pick one rather than admit it cannot tell \u2014 which is how a New Jersey '
      + 'site gets measured in Michigan. Add the city and state to the deal.'),
      { needsLocality: true });

  const variants = addressVariants(address);
  const providers = [tryCensus, tryNominatim, tryGoogle];
  const tried = [];

  /* Variant-major: every provider gets a go at the most precise form before
     anything falls back to a rougher one. A precise match from the second
     provider beats a coarse match from the first. */
  for (let vi = 0; vi < variants.length; vi++) {
    for (const p of providers) {
      try {
        const hit = await p(variants[vi]);
        /* A match in the wrong state is not a near miss. Rejecting it and
           carrying on is better than returning it with a caveat nobody reads. */
        const conflict = matchConflicts(address, hit.resolved);
        if (conflict) { tried.push('rejected a match where ' + conflict); continue; }
        hit.precision = vi === 0 ? 'exact'
                      : vi === 1 ? 'street'
                      : vi === 2 ? 'street-approx' : 'area';
        hit.queried = variants[vi];
        if (vi > 0) hit.note = 'Matched on "' + variants[vi]
          + '" rather than the full address.';
        return hit;
      } catch (e) { tried.push(e.message || String(e)); }
    }
  }
  throw new Error('Could not locate "' + address + '". Tried '
    + variants.length + ' forms of the address against Census, OpenStreetMap'
    + (process.env.GOOGLE_GEOCODING_KEY ? ' and Google' : '')
    + '. Either the address is wrong, or this site has none тАФ set coordinates by hand.');
}

/* тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
   тЪа DATA SOURCE тАФ the three functions to point at whatever Grid Atlas uses
   тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
   Each takes a point and a radius and returns the features near it, nearest
   first, with distanceKm computed. Return [] rather than throwing when a layer
   is unavailable: a partial answer with the gap declared is far more useful
   than no answer, and weightedScore() already treats a missing measurement as
   unscored rather than bad. */

/* тЪа RETURN null UNTIL CONNECTED, NOT [].

   This distinction cost a real site a real verdict. An empty array means "we
   looked and there is nothing within the radius" тАФ a finding, and a damning
   one: no substation for 25 km scores 1 out of 10. null means "we did not
   look", which drops the measurement out of the calculation entirely.

   With the stubs returning [], a Hillside NJ site that Grid Atlas rates 56
   scored 21 here and was marked prescreen FAIL. The number was confident,
   precise, and completely fabricated. Returning null makes the score null,
   which writes no verdict at all тАФ the console then says "not scored" rather
   than "not viable", and nobody is misled.

   Replace each `return null` with the real lookup and the scoring starts
   working. Return [] only when you have genuinely queried and found nothing. */
async function findSubstations(lat, lng, radiusKm) {
  // return [{ name, distanceKm, voltageKv, owner }] тАФ or null while unconnected
  return null;
}
async function findLines(lat, lng, radiusKm) {
  // return [{ name, distanceKm, voltageKv }] тАФ or null while unconnected
  return null;
}
async function findPlants(lat, lng, radiusKm) {
  // return [{ name, distanceKm, fuel, capacityMw }] тАФ or null while unconnected
  return null;
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
  /* GET is a health check. "Is it deployed and what is configured" should be
     answerable from a browser address bar rather than by finding a deal with
     an address on it and pressing a button. */
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      build: BUILD,
      model: MODEL.version,
      geocoder: 'US Census, then OpenStreetMap \u2014 both free, no key'
        + (process.env.GOOGLE_GEOCODING_KEY ? ', then Google' : ' (no Google key set, not needed)'),
      addressHandling: 'Unit and building designators are stripped, then the address is '
        + 'retried progressively less specific until something matches.',
      authRequired: !!process.env.GRID_ATLAS_KEY,
      dataSources: {
        substations: 'not connected \u2014 see \u26a0 DATA SOURCE in this file',
        lines:       'not connected',
        plants:      'not connected'
      },
      note: 'Scores return with unscored layers until the three lookups are pointed '
          + 'at real data. An unscored layer drops out of the calculation rather than '
          + 'counting against the site.'
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST.' });

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
      body.geocode = { provider: g.provider, precision: g.precision,
                       queried: g.queried, note: g.note || '' };
    } catch (e) {
      return res.status(422).json({ build: BUILD, error: String(e.message || e) });
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
    if (!anyLayer) findings.push({ severity:'note',
      text:'No grid data sources are connected to this service yet, so nothing was '
         + 'measured and no score was produced. See \u26a0 DATA SOURCE in api/grid-atlas.js.' });
    if (anyLayer && !substations) findings.push({ severity:'note', text:'Substation layer unavailable тАФ not scored.' });
    if (anyLayer && !lines)       findings.push({ severity:'note', text:'Transmission layer unavailable тАФ not scored.' });
    if (substations && !nearestSub)
      findings.push({ severity:'blocker', text:'No substation within ' + radiusKm + ' km.' });
    if (nearestSub && nearestSub.distanceKm > 10)
      findings.push({ severity:'risk', text:'Nearest substation is ' + nearestSub.distanceKm
        + ' km тАФ interconnection cost will dominate the budget.' });
    if (nearestSub && sizeMw && nearestSub.voltageKv && MODEL.voltageScore(nearestSub.voltageKv, sizeMw) <= 3)
      findings.push({ severity:'risk', text:'Nearest substation is '
        + nearestSub.voltageKv + ' kV, thin for ' + sizeMw + ' MW.' });

    /* No score means no claim. Saying "no substation found" when we never
       looked is the same lie in words that the 21 was in numbers. */
    const anyLayer = substations || lines || plants;
    const summary = !anyLayer
      ? 'No grid layers connected yet \u2014 nothing measured.'
      : nearestSub
        ? nearestSub.voltageKv + ' kV substation ' + nearestSub.distanceKm + ' km away'
          + (nearestLine ? ', transmission ' + nearestLine.distanceKm + ' km' : '')
        : substations
          ? 'No substation found within ' + radiusKm + ' km'
          : 'Substation layer not connected';

    /* A rough match must be visible. A score computed from a point two streets
       away is still useful; a score computed from the middle of the town while
       everyone assumes it was the parcel is not \u2014 the number looks identical
       either way, so the only defence is saying so. */
    if (body.geocode && body.geocode.precision && body.geocode.precision !== 'exact') {
      findings.unshift({ severity: body.geocode.precision === 'area' ? 'risk' : 'note',
        text: 'Location is approximate \u2014 ' + body.geocode.note });
    }

    res.status(200).json({
      build: BUILD,
      score: computed.score,
      model: MODEL.version,
      summary,
      lat, lng,
      geocode: body.geocode || null,
      resolvedAddress: body.resolvedAddress || address || '',
      substations: substations || [],
      lines: lines || [],
      plants: plants || [],
      criteria: computed.rows,
      unscored: computed.unscored,
      findings
    });
  } catch (err) {
    res.status(502).json({ build: BUILD, error: 'Grid Atlas failed.',
      detail: String((err && err.message) || err).slice(0, 300) });
  }
};

/* тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   POINTING grid-atlas.html AT THIS
   тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА
   Optional, and worth doing eventually. If the page calls this endpoint instead
   of doing its own lookups, there is one implementation of the scoring model
   and the page cannot drift from what the pipeline records. The map rendering
   stays exactly where it is тАФ only the analysis moves.

       const r = await fetch('/api/grid-atlas', {
         method:'POST', headers:{'Content-Type':'application/json'},
         body: JSON.stringify({ address, sizeMw })
       });

   Until then the two coexist safely: the console uses this, the page uses its
   own, and the only cost is that a number in the console may not exactly match
   the same site opened in the page. Worth closing, not urgent.
   тФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФАтФА */
