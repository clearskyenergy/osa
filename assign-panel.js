/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Send to verification partner
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THIS FILE BELONGS IN THE OPS REPO, NOT THIS ONE. It is shipped here so the
   two halves of the handoff can be read side by side; copy it into the ops
   console next to ops-data.js and add two things:

     <script src="/assign-panel.js?v=1"></script>          after ops-data.js
     <button onclick="OmegaAssign.open(req)">Send to partner</button>

   in the intake drawer's footer. Nothing else in the ops console changes.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT IT DOES, AND THE ONE DECISION INSIDE IT
   ─────────────────────────────────────────────────────────────────────────────
   It builds a PACKET — a frozen copy of the project as it stands right now —
   and writes it into a new `verifications` document. It does not write a
   reference to the intake, and it does not grant the partner any read on
   intake_projects.

   That copy is the whole access model. A reference would mean the partner
   needs read access to the collection holding every client's queue, every fee
   and every contact, to see one site. Copying some JSON is the cheaper half of
   that trade by a wide margin.

   The second effect is subtler and matters more over time: a verdict stays
   attached to the facts it was given. Resize the site after assignment and the
   opinion does not silently start describing a different project — it goes
   stale, visibly, and you reassign. Silent staleness is what makes a signed
   document worthless six months later, and it is invisible until it isn't.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var COLLECTION = 'verifications';

  /* Partners are named here, not discovered. Keep this in step with
     partner.orgs in the partner console's config.js — the `key` must equal
     both the partner's email domain and what gets written to partnerOrg, and
     all three are compared lowercase. A capital letter is an empty queue on
     their side, which reads to them as "ClearSky never sent it". */
  var PARTNERS = [
    { key:'cir-engineering.com', name:'CIR',
      scopes:['feasibility','bankability'],
      note:'Signs the bankability opinion a lender receives.' },
    { key:'juels.ai', name:'Juels AI',
      scopes:['feasibility'],
      note:'Feasibility screen only \u2014 not retained for bankability.' }
  ];

  function cfg() { return (global.CLEARSKY_CONFIG || {}); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function stamp() { return new Date().toISOString(); }


  /* ── Building the packet ────────────────────────────────────────────────
     Reads through OpsData so the sizing the partner sees is the same sizing
     the Accounts page screened on. Recomputing it here with a second set of
     field names is how the two numbers drift apart, and the one that reaches
     the partner would be the one nobody checks.                            */
  function buildPacket(req, opts) {
    opts = opts || {};
    var D = global.OpsData;
    var sizes = (D && D.scopeSizes) ? D.scopeSizes(req) : [];

    var packet = {
      builtAt:     stamp(),
      builtBy:     (opts.me && opts.me.email) || '',

      projectName: req.projectName || 'Untitled site',
      siteName:    req.siteName || '',
      address:     req.address || '',
      utility:     req.utility || '',
      ahj:         req.ahj || '',
      stage:       req.projectStage || '',

      /* Our categorisation. The partner's own goes in their verdict and the
         two are shown side by side rather than merged — where they differ,
         that difference is the finding. */
      categories:  sizes.map(function (s) { return s.key; }),
      sizing:      sizes.map(function (s) {
                     return { key:s.key, label:s.label, text:s.text, mw:s.mw };
                   }),
      screen:      (D && D.qualify) ? summariseScreen(D.qualify(req)) : null,

      /* The model output, if one has been attached to the record. Passing the
         probability WITHOUT its drivers is worse than passing nothing: a bare
         number anchors the reviewer and gives them nothing to check. If the
         drivers are missing, send no score. */
      modelRun:    modelRun(req),

      commercial:  opts.commercial || null,
      files:       (req.files || []).map(function (f) {
                     return { name:f.name, url:f.url }; }),
      notes:       opts.briefing || req.internalNotes || ''
    };

    /* Blind review. The console's `discloseClient` only hides the name in the
       UI; stripping it here is what actually blinds the review, because a
       determined reviewer can read their own Firestore document. */
    if (opts.discloseClient) {
      packet.clientName = req.clientName || '';
      packet.contact    = { name:req.contactName || '', email:req.contactEmail || '' };
    }
    return packet;
  }

  function summariseScreen(q) {
    if (!q) return null;
    return { verdict: q.verdict || q.state || '', mw: q.mw != null ? q.mw : null };
  }

  function modelRun(req) {
    var raw = (req._raw || {});
    var m = raw.modelRun || raw.scenario || null;
    if (!m) return null;
    var drivers = m.drivers || m.factors || [];
    if (!drivers.length) {
      /* Deliberate. A probability with no drivers behind it cannot be
         confirmed or overturned, so it is not evidence — it is an anchor.
         Send the run without the number rather than the number alone. */
      return { version: m.version || '', runAt: m.runAt || null, drivers: [],
               probability: null,
               note: 'Score withheld: this run carries no drivers, and a bare '
                   + 'probability anchors the reviewer without giving them '
                   + 'anything to check.' };
    }
    return { version: m.version || '', runAt: m.runAt || null,
             probability: m.probability != null ? m.probability : null,
             drivers: drivers };
  }


  /* ── Writing the assignment ─────────────────────────────────────────────
     ISO strings, not serverTimestamp, for the same reason as everywhere else
     in this platform: every other tool reading these dates does `new Date(str)`
     and a Firestore Timestamp renders there as "Invalid Date".              */
  function assign(db, me, req, opts) {
    opts = opts || {};
    var partner = null;
    for (var i = 0; i < PARTNERS.length; i++)
      if (PARTNERS[i].key === opts.partnerOrg) partner = PARTNERS[i];
    if (!partner) return Promise.reject(new Error('Pick a partner.'));

    var scopes = (opts.scopes || []).filter(function (s) {
      return partner.scopes.indexOf(s) >= 0;
    });
    if (!scopes.length)
      return Promise.reject(new Error(partner.name + ' is not retained for the scope you picked.'));

    var doc = {
      schemaVersion: 1,
      source:        req.source === 'editor' ? 'editor' : 'intake',
      sourceId:      req.id,
      round:         1,

      /* Lowercased on write. The rules lowercase on read. Removing either end
         of that is an empty queue on the partner's side. */
      partnerOrg:    String(partner.key).toLowerCase(),
      partnerName:   partner.name,
      scopeRequested:scopes,
      priority:      opts.priority || 'standard',

      orgId:         String(req.orgId || '').toLowerCase(),
      packet:        buildPacket(req, { me:me, briefing:opts.briefing,
                                        commercial:opts.commercial,
                                        discloseClient:opts.discloseClient }),

      status:        'assigned',
      assignedBy:    { name:(me && me.name) || '', email:(me && me.email) || '' },
      assignedAt:    stamp(),
      dueAt:         opts.dueAt || null,
      pausedMs:      0,
      pausedAt:      null,

      verdict:        null,
      verdictHistory: [],
      draft:          null,
      notes:          [],
      documents:      [],
      infoRequests:   [],
      activity:      [{ ts:stamp(), type:'assigned',
                        message:'Assigned to ' + partner.name + ' for '
                              + scopes.join(' + ') + '.',
                        actor:(me && me.name) || (me && me.email) || 'ClearSky' }],
      updatedAt:     stamp()
    };

    return db.collection(COLLECTION).add(doc).then(function (ref) {
      /* Back-reference on the intake so the ops drawer can show what has been
         sent where. Failure here is non-fatal: the assignment already exists
         and the partner can already see it, so refusing to proceed because a
         convenience field didn't write would be the wrong way round. */
      var back = { verificationIds: firebase.firestore.FieldValue.arrayUnion(ref.id) };
      var col  = (cfg().ops || {}).collection || 'intake_projects';
      return db.collection(col).doc(req.id).update(back)
        ['catch'](function (e) {
          console.warn('[assign] back-reference not written:', e && e.message);
        })
        .then(function () { return ref.id; });
    });
  }


  /* ── The dialog ─────────────────────────────────────────────────────────
     Injected rather than added to index.html so this file stays a drop-in.
     Styling piggybacks on the ops console's own tokens — it is the same page.  */
  function open(req) {
    close();
    var D = global.OpsData;
    var sizes = (D && D.scopeSizes) ? D.scopeSizes(req) : [];

    var el = document.createElement('div');
    el.id = 'assign-modal';
    el.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(11,34,51,.45);'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';

    var opts = PARTNERS.map(function (p) {
      return '<label style="display:flex;gap:9px;align-items:flex-start;border:1.5px solid #E4E8EC;'
        + 'border-radius:8px;padding:10px 12px;cursor:pointer;margin-bottom:7px">'
        + '<input type="radio" name="ap-partner" value="' + esc(p.key) + '">'
        + '<span><b style="font-size:13px;color:#08384F">' + esc(p.name) + '</b>'
        + '<span style="display:block;font-size:11.5px;color:#556B82;margin-top:2px">'
        + esc(p.note) + '</span></span></label>';
    }).join('');

    el.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:520px;width:100%;'
      + 'max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      + '<div style="padding:16px 20px;border-bottom:1px solid #E4E8EC">'
      +   '<b style="font-size:16px;color:#08384F">Send to a verification partner</b>'
      +   '<div style="font-size:12.5px;color:#556B82;margin-top:4px;line-height:1.5">'
      +     esc(req.projectName || 'Untitled') + ' \u00b7 '
      +     esc(sizes.map(function (s) { return s.short + ' ' + s.text; }).join(' \u00b7 ')
              || 'no sizing on this record')
      +   '</div></div>'
      + '<div style="padding:18px 20px">'

      +   '<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;'
      +   'color:#8A9BAB;margin-bottom:7px">Partner</div>' + opts

      +   '<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;'
      +   'color:#8A9BAB;margin:16px 0 7px">What are we asking for</div>'
      +   '<label style="display:block;font-size:13px;margin-bottom:6px">'
      +     '<input type="checkbox" id="ap-feas" checked> Feasibility \u2014 can it be built here</label>'
      +   '<label style="display:block;font-size:13px">'
      +     '<input type="checkbox" id="ap-bank"> Bankability \u2014 would a lender fund it</label>'

      +   '<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;'
      +   'color:#8A9BAB;margin:16px 0 7px">Briefing</div>'
      +   '<textarea id="ap-brief" style="width:100%;min-height:80px;border:1.5px solid #DDE3E9;'
      +   'border-radius:8px;padding:10px;font:400 13px \'DM Sans\',sans-serif;resize:vertical" '
      +   'placeholder="What do you want them to look at? The open question is more useful '
      +   'to them than a summary of what you already know."></textarea>'

      +   '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:14px;font-size:12.5px;'
      +   'color:#556B82;line-height:1.5">'
      +     '<input type="checkbox" id="ap-disclose" style="margin-top:3px">'
      +     '<span>Include the client\u2019s name and contact. Leave this off for a blind '
      +     'review \u2014 the site, sizing and numbers still go over.</span></label>'

      +   '<div id="ap-err" style="display:none;background:#FDECEC;color:#8A1F1F;font-size:12.5px;'
      +   'border-radius:8px;padding:10px 12px;margin-top:14px;line-height:1.5"></div>'

      +   '<div style="display:flex;gap:9px;margin-top:18px">'
      +     '<button id="ap-go" style="background:#4338CA;color:#fff;border:none;border-radius:8px;'
      +     'padding:10px 18px;font:600 13px \'DM Sans\',sans-serif;cursor:pointer">Send</button>'
      +     '<button id="ap-x" style="background:#fff;border:1.5px solid #DDE3E9;border-radius:8px;'
      +     'padding:10px 16px;font:600 13px \'DM Sans\',sans-serif;cursor:pointer">Cancel</button>'
      +   '</div>'
      + '</div></div>';

    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    document.getElementById('ap-x').onclick = close;
    document.getElementById('ap-go').onclick = function () { submit(req); };
  }

  function fail(msg) {
    var e = document.getElementById('ap-err');
    if (!e) return;
    e.textContent = msg; e.style.display = 'block';
  }

  function submit(req) {
    var sel = document.querySelector('input[name="ap-partner"]:checked');
    if (!sel) return fail('Pick a partner.');

    var scopes = [];
    if (document.getElementById('ap-feas').checked) scopes.push('feasibility');
    if (document.getElementById('ap-bank').checked) scopes.push('bankability');
    if (!scopes.length) return fail('Say what you are asking them for.');

    var brief = document.getElementById('ap-brief').value.trim();
    /* Not a hard block, but worth the friction: a packet with no question in
       it comes back as a restatement of what you already knew. */
    if (!brief && !confirm('No briefing. The reviewer will decide for themselves what to '
        + 'look at, and you will probably get back a confirmation of what you already know.\n\n'
        + 'Send anyway?')) return;

    var btn = document.getElementById('ap-go');
    btn.disabled = true; btn.textContent = 'Sending…';

    assign(firebase.firestore(), (global.ME || {}), req, {
      partnerOrg:     sel.value,
      scopes:         scopes,
      briefing:       brief,
      discloseClient: document.getElementById('ap-disclose').checked
    }).then(function () {
      close();
      if (global.toast) global.toast('Sent to partner');
      if (global.refresh) global.refresh();
    })['catch'](function (e) {
      btn.disabled = false; btn.textContent = 'Send';
      fail((e && e.message) || 'That didn\u2019t send.');
    });
  }

  function close() {
    var el = document.getElementById('assign-modal');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  global.OmegaAssign = {
    PARTNERS: PARTNERS,
    buildPacket: buildPacket,
    assign: assign,
    open: open,
    close: close
  };
})(window);
