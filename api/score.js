/* ═══════════════════════════════════════════════════════════════════════════════
   /api/score.js — relay to the partner's screening tools
   Vercel serverless function.

   WHY THIS EXISTS. Everything else here runs in the browser against Firestore.
   An API key cannot live in a browser: it is in the page source, the network
   tab, and every user's cache, and requiring a login does not help because the
   key is readable by anyone who has one.

   WHAT IT DELIBERATELY DOES NOT DO. It does not write to Firestore. That would
   need a service-account credential — a second set of secrets AND a second
   trust boundary that bypasses every rule in firestore.rules. The score comes
   back to the browser and the browser writes it through the same path a
   hand-entered score takes: same rules, same audit line, same history append.

   SET BEFORE THIS WORKS (Vercel → Settings → Environment Variables):
     SCORING_API_URL   the partner's endpoint
     SCORING_API_KEY   their key
   ═══════════════════════════════════════════════════════════════════════════════ */

const ALLOWED_SKILLS = ['datacenter-feasibility', 'solar-storage-ntp'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const url = process.env.SCORING_API_URL;
  const key = process.env.SCORING_API_KEY;
  if (!url || !key) {
    return res.status(500).json({
      error: 'Screening is not configured on the server. Missing '
           + [!url && 'SCORING_API_URL', !key && 'SCORING_API_KEY'].filter(Boolean).join(' and ')
           + '. Set them in the Vercel environment variables and redeploy.'
    });
  }

  const p = req.body && typeof req.body === 'object' ? req.body : null;
  if (!p || !p.dealId || !p.skill)
    return res.status(400).json({ error: 'dealId and skill are required.' });
  if (ALLOWED_SKILLS.indexOf(p.skill) < 0)
    return res.status(400).json({ error: 'Unknown skill: ' + p.skill });

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 55000);
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /* ⚠ CONFIRM THE SCHEME. Bearer is the common case; some want X-Api-Key. */
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
        error: 'The screening tool returned ' + upstream.status,
        detail: (data && (data.error || data.message)) || text.slice(0, 300)
      });
    }
    if (!data) return res.status(502).json({
      error: 'The screening tool did not return JSON.', detail: text.slice(0, 300) });

    /* Validate the two fields the console cannot do without, HERE, so a
       malformed response is one clear message rather than NaN on a deal. */
    const score = Number(data.score);
    if (!isFinite(score) || score < 0 || score > 100)
      return res.status(502).json({ error: 'No usable score returned.',
        detail: 'Expected a number 0-100, got: ' + JSON.stringify(data.score) });
    if (!data.model)
      return res.status(502).json({ error: 'No model version returned.',
        detail: 'A score with no version cannot be traced when the tool changes.' });

    res.status(200).json({
      score, threshold: data.threshold != null ? Number(data.threshold) : null,
      verdict: data.verdict || null, model: String(data.model),
      summary: data.summary || '',
      criteria:  Array.isArray(data.criteria)  ? data.criteria  : [],
      findings:  Array.isArray(data.findings)  ? data.findings  : [],
      pathToNtp: Array.isArray(data.pathToNtp) ? data.pathToNtp : [],
      skill: p.skill
    });
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted
        ? 'No response within 55 seconds. If screening is a long job rather than a '
          + 'quick call it needs a callback, not a wait.'
        : 'Could not reach the screening tool.',
      detail: String((err && err.message) || err).slice(0, 300)
    });
  }
};
