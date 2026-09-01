/* ═══════════════════════════════════════════════════════════════════════════════
   /api/score.js — relay to OGI Solar's screening tools
   Vercel serverless function.

   WHY THIS EXISTS. Everything else here runs in the browser against Firestore.
   An API key cannot live in a browser: it is in the page source, the network
   tab, and every user's cache, and requiring a login does not help because the
   key is readable by anyone who has one.

   WHAT IT DELIBERATELY DOES NOT DO. It does not write to Firestore. That would
   need a service-account credential — a second set of secrets AND a second
   trust boundary bypassing every rule in firestore.rules. The score comes back
   to the browser and the browser writes it through the same path a
   hand-entered score takes: same rules, same audit line, same history append.

   ── ENVIRONMENT VARIABLES ─────────────────────────────────────────────────
   Set in Vercel → Project → Settings → Environment Variables:

     OGI_API_KEY          OGI's key (shared by both tools unless they differ)
     OGI_DATACENTER_URL   endpoint for data centre site feasibility
     OGI_SOLAR_URL        endpoint for solar / storage bankability

   PER-SKILL ON PURPOSE. The two tools answer different questions and may well
   be separate services on OGI's side. If they share one endpoint, point both
   variables at the same URL — that is a two-second change. Discovering they
   are separate AFTER hardcoding one URL is a rewrite.

   A single OGI_SCORING_URL is still honoured as a fallback so nothing breaks
   if only one is set.
   ═══════════════════════════════════════════════════════════════════════════════ */

/* Must match portfolio.scoring.endpoints in config.js. Kept here as well
   because a serverless function cannot read the browser's config, and a
   mismatch should fail loudly rather than silently route to the wrong tool. */
const SKILLS = {
  'datacenter-feasibility': { urlEnv: 'OGI_DATACENTER_URL', keyEnv: 'OGI_API_KEY',
                              label: 'data centre feasibility' },
  'solar-storage-ntp':      { urlEnv: 'OGI_SOLAR_URL',      keyEnv: 'OGI_API_KEY',
                              label: 'solar / storage bankability' }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const p = req.body && typeof req.body === 'object' ? req.body : null;
  if (!p || !p.dealId || !p.skill)
    return res.status(400).json({ error: 'dealId and skill are required.' });

  const cfg = SKILLS[p.skill];
  if (!cfg) return res.status(400).json({ error: 'Unknown skill: ' + p.skill });

  const url = process.env[cfg.urlEnv] || process.env.OGI_SCORING_URL;
  const key = process.env[cfg.keyEnv] || process.env.OGI_API_KEY;

  if (!url || !key) {
    /* Name the missing variable. "It didn't work" costs somebody twenty
       minutes; "OGI_SOLAR_URL is not set" costs them thirty seconds. */
    const missing = [];
    if (!url) missing.push(cfg.urlEnv + ' (or OGI_SCORING_URL)');
    if (!key) missing.push(cfg.keyEnv);
    return res.status(500).json({
      error: 'The ' + cfg.label + ' tool is not configured on the server.',
      detail: 'Missing ' + missing.join(' and ')
            + '. Set it in the Vercel environment variables and redeploy.'
    });
  }

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 55000);
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /* ⚠ CONFIRM WITH OGI. Bearer is the common case; some want X-Api-Key.
           One line to change once they say which. */
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(p),
      signal: ctl.signal
    });
    clearTimeout(timer);

    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!upstream.ok) {
      /* Pass the status through rather than flattening to 500 — a 401 and a
         503 need completely different responses from the person looking. */
      return res.status(upstream.status).json({
        error: 'OGI returned ' + upstream.status,
        detail: (data && (data.error || data.message)) || text.slice(0, 300)
      });
    }
    if (!data) return res.status(502).json({
      error: 'OGI did not return JSON.', detail: text.slice(0, 300) });

    /* Validate the two fields the console cannot do without, HERE, so a
       malformed response is one clear message rather than NaN on a deal. */
    const score = Number(data.score);
    if (!isFinite(score) || score < 0 || score > 100)
      return res.status(502).json({ error: 'OGI did not return a usable score.',
        detail: 'Expected a number 0-100, got: ' + JSON.stringify(data.score) });
    if (!data.model)
      return res.status(502).json({ error: 'OGI did not return a model version.',
        detail: 'A score with no version cannot be traced when the tool changes. '
              + 'Ask for a `model` string in the response.' });

    res.status(200).json({
      score,
      threshold: data.threshold != null ? Number(data.threshold) : null,
      verdict:   data.verdict || null,
      model:     String(data.model),
      summary:   data.summary || '',
      criteria:  Array.isArray(data.criteria)  ? data.criteria  : [],
      findings:  Array.isArray(data.findings)  ? data.findings  : [],
      pathToNtp: Array.isArray(data.pathToNtp) ? data.pathToNtp : [],
      skill:     p.skill
    });
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted
        ? 'OGI did not respond within 55 seconds. If screening is a long job rather '
          + 'than a quick call it needs a callback, not a wait.'
        : 'Could not reach OGI.',
      detail: String((err && err.message) || err).slice(0, 300)
    });
  }
};
