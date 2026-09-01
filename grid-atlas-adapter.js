/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Grid Atlas adapter  (v1)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Runs a deal's address through Grid Atlas during screening and brings back the
   interconnection picture: nearest substations, transmission lines, generating
   plants, and a proximity score.

   ─────────────────────────────────────────────────────────────────────────────
   THE PROBLEM THIS SOLVES, AND THE ONE IT CANNOT
   ─────────────────────────────────────────────────────────────────────────────
   Grid Atlas is an HTML PAGE, not an API. It is a browser tool a person opens,
   types an address into, and reads. Nothing about that is wrong — it is exactly
   what a human-facing map tool should be — but it means there is no endpoint to
   call, and "run it automatically" needs the analysis to be reachable from
   somewhere other than that page.

   Three ways to do that, in order of how well they age:

     1. EXTRACT THE CORE. Grid Atlas's analysis becomes grid-atlas-core.js
        exposing one function; grid-atlas.html loads it and so does this
        console. One implementation, no drift, and the tool keeps working
        exactly as it does today. THIS IS THE ONE TO DO.

     2. IFRAME AND postMessage. No refactor needed, but it is slow, it breaks
        the first time the page's internals change, and debugging a silent
        cross-frame failure is genuinely unpleasant.

     3. REIMPLEMENT IT HERE. Two copies of the same logic, guaranteed to
        disagree within a month, and the disagreement will surface as two
        different numbers for one site with nobody able to say which is right.

   This adapter is written for (1) and falls back gracefully when it is not
   there yet: it opens Grid Atlas with the address prefilled, so the worst case
   is one click and a paste back rather than nothing.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT I NEED TO FINISH THIS
   ─────────────────────────────────────────────────────────────────────────────
   grid-atlas.html itself. Specifically: which function performs the analysis,
   what it takes (address? lat/lng?), and what it returns. Everything below the
   CONTRACT section is guesswork shaped to be easy to correct — one adapter
   function, clearly marked.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function cfg()   { return (global.CLEARSKY_CONFIG || {}); }
  function gcfg()  { return (cfg().portfolio || {}).gridAtlas || {}; }
  function stamp() { return new Date().toISOString(); }

  var _me = null;
  function init(me) { _me = me || null; }

  function enabled() { return gcfg().enabled === true; }
  function pageUrl() { return gcfg().url || '/grid-atlas.html'; }

  /* ── Geocoding ───────────────────────────────────────────────────────────
     A deal carries a free-text address; Grid Atlas needs coordinates. The
     editor already geocodes with the Maps SDK, so this uses the same one when
     it is loaded on the page.

     Deliberately NOT a server-side geocoding call: that would need another API
     key in another place, and the console already has the SDK available on any
     page that wants it. */
  function geocode(address) {
    return new Promise(function (resolve, reject) {
      if (!address) return reject(new Error('This deal has no address to look up.'));
      if (!global.google || !google.maps || !google.maps.Geocoder)
        return reject(new Error(
          'The map SDK is not loaded on this page, so the address cannot be turned into '
          + 'coordinates. Add the Maps script to portfolio.html, or run Grid Atlas '
          + 'directly and paste the result back.'));
      new google.maps.Geocoder().geocode({ address: address }, function (res, status) {
        if (status !== 'OK' || !res || !res.length)
          return reject(new Error('Could not find "' + address + '" on the map ('
            + status + '). Check the address on the deal.'));
        var loc = res[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng(), resolved: res[0].formatted_address });
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     THE CONTRACT  —  the one function to correct once grid-atlas.html is to hand
     ═══════════════════════════════════════════════════════════════════════
     Expected shape, which the rest of this file and the console are written
     against. If Grid Atlas returns something different, change the mapping in
     `normalise()` below and nothing else has to move.

       {
         score: 0-100,                 // grid proximity / interconnection
         summary: 'string',
         substations: [ { name, distanceKm, voltageKv, owner } ],
         lines:       [ { name, distanceKm, voltageKv } ],
         plants:      [ { name, distanceKm, fuel, capacityMw } ],
         findings:    [ { severity, text } ]
       }

     HOW IT IS CALLED. In order, first one available wins:

       window.GridAtlas.analyze({lat,lng,address})   ← the extracted core
       window.GridAtlas.score(...)                    ← alternative name
       (nothing)                                      ← open the page prefilled
     ═══════════════════════════════════════════════════════════════════════ */
  function core() {
    var g = global.GridAtlas;
    if (!g) return null;
    if (typeof g.analyze === 'function') return g.analyze;
    if (typeof g.score === 'function')   return g.score;
    if (typeof g.run === 'function')     return g.run;
    return null;
  }

  function normalise(out) {
    out = out || {};
    var n = function (v) { var x = Number(v); return isFinite(x) ? x : null; };
    return {
      score:       n(out.score),
      summary:     out.summary || '',
      substations: Array.isArray(out.substations) ? out.substations : [],
      lines:       Array.isArray(out.lines) ? out.lines : [],
      plants:      Array.isArray(out.plants) ? out.plants : [],
      findings:    Array.isArray(out.findings) ? out.findings : [],
      raw:         out
    };
  }

  /* ── Running it ──────────────────────────────────────────────────────────
     Geocode, call the core, normalise, hand back. The caller writes it to the
     deal — same reasoning as the OGI relay: whatever computes a number, the
     write goes through the normal path so the rules and the audit trail apply. */
  /* THE SERVICE FIRST. /api/grid-atlas geocodes and analyses server-side, so
     this works without the Maps SDK on the page, without the analysis being
     extracted into a module, and — the reason it is worth building — it can
     be called by OGI too, so their score is informed by our grid data.

     Falls back to an in-page module if one exists, then to opening the page.
     Three tiers, best available wins, and none of them is a dead end. */
  function viaService(deal) {
    var url = gcfg().serviceUrl || '/api/grid-atlas';
    return fetch(url, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        address: deal.address, sizeMw: deal.sizeMw, dealId: deal.id,
        /* Coordinates set by hand win over the address. Some sites genuinely
           cannot be geocoded \u2014 a rural parcel with no street number, a new
           subdivision \u2014 and dropping a pin should not require the address to
           be fudged into something a geocoder happens to accept. */
        lat: deal.grid && deal.grid.lat, lng: deal.grid && deal.grid.lng
      })
    }).then(function (r) {
      return r.json()['catch'](function () { return null; }).then(function (j) {
        if (!r.ok) {
          var e = new Error((j && (j.error || j.detail)) || ('Grid Atlas returned ' + r.status));
          /* 404 means the endpoint is not deployed — that is a "not wired in
             yet" rather than a failure, and the caller offers the page. */
          if (r.status === 404) e.needsExtraction = true;
          throw e;
        }
        return j;
      });
    });
  }

  function run(deal) {
    var haveCoords = deal.grid && deal.grid.lat != null && deal.grid.lng != null;
    if (!deal.address && !haveCoords)
      return Promise.reject(new Error(
        'This deal has no address to look up. Add one, or set the coordinates by hand.'));

    return viaService(deal).then(function (out) {
      var g = normalise(out);
      g.lat = out.lat; g.lng = out.lng;
      g.resolvedAddress = out.resolvedAddress || deal.address;
      g.ranAt = stamp(); g.ranBy = _me ? _me.email : '';
      g.source = out.model || 'grid-atlas-service';
      return g;
    })['catch'](function (e) {
      /* Service unavailable: try an in-page module before giving up. */
      var fn = core();
      if (!fn) throw e;
      return geocode(deal.address).then(function (loc) {
        return Promise.resolve(fn({ lat: loc.lat, lng: loc.lng, address: deal.address }))
          .then(function (out) {
            var g = normalise(out);
            g.lat = loc.lat; g.lng = loc.lng; g.resolvedAddress = loc.resolved;
            g.ranAt = stamp(); g.ranBy = _me ? _me.email : '';
            g.source = 'grid-atlas-module';
            return g;
          });
      });
    });
  }

  /* The fallback, and it is not nothing: Grid Atlas opens with the address
     already in it, so the person does the lookup they were going to do anyway
     without retyping. Beats a dead button while the extraction is pending. */
  function openWith(deal) {
    var u = pageUrl();
    var q = 'address=' + encodeURIComponent(deal.address || '')
          + '&deal=' + encodeURIComponent(deal.id)
          + '&name=' + encodeURIComponent(deal.name || '');
    global.open(u + (u.indexOf('?') >= 0 ? '&' : '?') + q, '_blank', 'noopener');
  }

  /* Turning the measurement into something the score can use. Grid Atlas
     produces 0-100; the viability criteria are 0-10. Rounded rather than
     truncated so a 95 does not read as a 9 alongside a 90.

     THIS DOES NOT OVERWRITE A HUMAN'S SCORE. It prefills the interconnection
     criterion when somebody opens the scoring form, and it travels to OGI in
     the payload. What it never does is decide the deal on its own \u2014 grid
     proximity is one input, and a site can be next to a substation with no
     capacity in it. */
  function asCriterion(grid) {
    if (!grid || grid.score == null) return null;
    return {
      key: 'interconnect',
      value: Math.round(grid.score / 10),
      note: grid.summary
         || (grid.substations.length
             ? 'Nearest substation ' + (grid.substations[0].distanceKm != null
                 ? grid.substations[0].distanceKm + ' km' : 'found')
             : 'From Grid Atlas')
    };
  }

  /* Grid Atlas as the PRESCREEN. Its score is a measurement of the one thing
     that kills the most sites earliest — whether the grid is reachable — so a
     threshold on it is a far better fast filter than four questions somebody
     answers from memory.

     Deliberately a LOW bar. This is not the decision, it is the gate before
     spending an OGI call: everything plausible should pass, and only sites
     that are genuinely nowhere near a grid connection should stop here. */
  function prescreenThreshold() {
    var t = gcfg().prescreenThreshold;
    return t == null ? 35 : t;
  }
  function prescreenVerdict(grid) {
    if (!grid || grid.score == null) return null;
    return grid.score >= prescreenThreshold() ? 'pass' : 'fail';
  }

  global.GridAtlasAdapter = {
    init: init, enabled: enabled, pageUrl: pageUrl,
    prescreenThreshold: prescreenThreshold, prescreenVerdict: prescreenVerdict,
    run: run, openWith: openWith, geocode: geocode,
    normalise: normalise, asCriterion: asCriterion, core: core
  };
})(window);
