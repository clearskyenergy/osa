/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Partner Verification Data Layer  (v1)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   THE ONE STRUCTURAL DECISION, AND WHY
   ─────────────────────────────────────────────────────────────────────────────
   A verification is its own document. It is NOT a `verified:true` field on
   intake_projects, and the difference decides everything else in this file.

   Three reasons, in order of how much they cost to get wrong:

     1. TWO OPINIONS ON ONE SITE. You may want CIR and Juels AI on the same
        project — that is the only way to find out whether either is reliable.
        A field holds one answer and the second writer silently destroys the
        first. Documents hold both, and the disagreement between them is the
        most valuable number in the pipeline.

     2. ACCESS. A field on intake_projects means a partner with write access to
        intake_projects. There is no rule that grants "write one field" without
        granting the read that makes the record findable, so the client's whole
        queue — every site, every fee, every contact — would be one query away
        from an external company. A verification document is scoped to one
        partnerOrg in a single rules line.

     3. THE OPINION IS THE ARTIFACT. A bankability verdict is signed, dated and
        attributed. Something a later save can quietly overwrite is not an
        opinion anyone can rely on, which is why signing here appends to
        verdictHistory rather than replacing.

   ─────────────────────────────────────────────────────────────────────────────
   THE PACKET IS A SNAPSHOT
   ─────────────────────────────────────────────────────────────────────────────
   `packet` is a frozen copy of the project as it stood at assignment. Not a
   join, not a reference. Two things follow and both are deliberate:

     · The partner needs no read on intake_projects or projects at all.
     · A verdict stays attached to the facts it was given. If the site is
       resized after assignment the opinion does not silently start describing
       a different project — it goes stale, visibly, and the ops console can
       reassign it. Silent staleness is the failure mode that makes a signed
       document worthless.

   The cost is duplicated JSON. That is the correct trade against handing an
   external party a cross-collection read.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var HOUR = 3600000, DAY = 86400000;

  /* ── Status model ────────────────────────────────────────────────────────
     Eight states, and the two that look redundant are the ones earning their
     keep.

     'declined' exists because a partner must be able to say "conflict of
     interest" or "outside our competence" without inventing a verdict. Force
     that through the verdict field and you get a fail on a site nobody
     assessed, which is worse than no answer.

     'info_requested' exists because a thin packet should come back rather than
     be guessed at. It also PAUSES the turnaround clock — see clock(). Without
     the pause the partner is measured on your packet quality, learns that
     asking questions costs them, and stops asking.                          */
  var STATUS = [
    { key:'assigned',      label:'Assigned',        short:'New',      color:'#0070F2', open:true,
      hint:'Sent to the partner. Not opened yet \u2014 the turnaround clock is running.' },
    { key:'accepted',      label:'Accepted',        short:'Accepted', color:'#6366F1', open:true,
      hint:'The partner has taken the job and confirmed no conflict.' },
    { key:'in_review',     label:'In review',       short:'Review',   color:'#8B5CF6', open:true,
      hint:'Under assessment.' },
    { key:'info_requested',label:'Waiting on us',   short:'Blocked',  color:'#D97706', open:true, paused:true,
      hint:'The partner has asked a question. Their clock is paused until it is answered.' },
    { key:'submitted',     label:'Verdict signed',  short:'Signed',   color:'#16A34A', open:false, terminal:true,
      hint:'Signed and returned. Read-only unless a new round is opened.' },
    { key:'closed',        label:'Closed',          short:'Closed',   color:'#0F766E', open:false, terminal:true,
      hint:'Verdict accepted by ClearSky and folded into the project record.' },
    { key:'declined',      label:'Declined',        short:'Declined', color:'#6B7280', open:false, terminal:true,
      hint:'The partner will not take it \u2014 conflict, or outside their scope.' },
    { key:'withdrawn',     label:'Withdrawn',       short:'Pulled',   color:'#6B7280', open:false, terminal:true,
      hint:'Pulled back by ClearSky before a verdict.' }
  ];

  /* ── Verdict vocabularies ────────────────────────────────────────────────
     FOUR values on each axis, not three, and 'insufficient' is the one that
     matters. A reviewer who cannot tell has to be able to say so; give them
     only pass/conditional/fail and they will pick one, and you will never know
     which of your passes were actually guesses.

     Same principle as "Needs sizing" in the ops console: an unanswered
     question is not a small number, and burying it in the nearest real value
     loses the only signal that would have told you your packet was thin.    */
  var FEASIBILITY = [
    { key:'pass',         label:'Feasible',              color:'#16A34A',
      hint:'Buildable as described. No blocker found.' },
    { key:'conditional',  label:'Feasible with conditions', color:'#D97706',
      hint:'Buildable if the listed conditions are met. List them \u2014 the field is required.' },
    { key:'fail',         label:'Not feasible',          color:'#DC2626',
      hint:'A blocker that cannot be engineered or priced away.' },
    { key:'insufficient', label:'Cannot determine',      color:'#6B7280',
      hint:'The packet does not contain enough to answer. Say what is missing.' }
  ];

  var BANKABILITY = [
    { key:'bankable',     label:'Bankable',              color:'#16A34A',
      hint:'Would be financed on the terms provided.' },
    { key:'conditional',  label:'Bankable with conditions', color:'#D97706',
      hint:'Financeable once the conditions are cleared.' },
    { key:'not_bankable', label:'Not bankable',          color:'#DC2626',
      hint:'Would not be financed as presented.' },
    { key:'insufficient', label:'Cannot determine',      color:'#6B7280',
      hint:'Not enough on terms, sponsor or offtake to form a view.' }
  ];

  var CONFIDENCE = [
    { key:'high',   label:'High',   hint:'Verified against primary sources.' },
    { key:'medium', label:'Medium', hint:'Reasonable inference from what was provided.' },
    { key:'low',    label:'Low',    hint:'Directional. Would not stand behind it for a lender.' }
  ];

  var PRIORITY = [
    { key:'critical', label:'Critical' },
    { key:'standard', label:'Standard' },
    { key:'low',      label:'Low' }
  ];

  function listFind(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function statusOf(k)      { return listFind(STATUS, k)      || { key:k||'?', label:k||'Unknown', short:'?', color:'#6B7280' }; }
  function feasibilityOf(k) { return listFind(FEASIBILITY, k) || null; }
  function bankabilityOf(k) { return listFind(BANKABILITY, k) || null; }
  function confidenceOf(k)  { return listFind(CONFIDENCE, k)  || null; }
  function labelFor(list, k){ var f = listFind(list, k); return f ? f.label : (k || '\u2014'); }


  /* ── Config ─────────────────────────────────────────────────────────────── */
  function cfg()  { return (global.CLEARSKY_CONFIG || {}); }
  function P()    { return cfg().partner || {}; }
  function collectionName() { return P().collection || 'verifications'; }
  function categories()     { return P().categories || []; }
  function categoryOf(k)    { return listFind(categories(), k) || { key:k, label:k, short:String(k||'?').toUpperCase() }; }
  function scopeCfg()       { return P().scopes || {}; }
  function docKinds()       { return P().documentKinds || {}; }
  function maxFileMb()      { return P().maxFileMb || 50; }
  function discloseClient() { return P().discloseClient === true; }

  function domainOf(email) {
    var s = String(email || '').toLowerCase();
    var i = s.indexOf('@');
    return i < 0 ? '' : s.slice(i + 1);
  }
  function isInternal(email) {
    var d = domainOf(email), list = cfg().adminDomains || [];
    for (var i = 0; i < list.length; i++) if (String(list[i]).toLowerCase() === d) return true;
    return false;
  }

  /* ── Who is signing in ───────────────────────────────────────────────────
     TWO SEPARATE QUESTIONS, and v1 answered them with one lookup, which is why
     adding a partner used to mean a redeploy:

       1. May this person use the portal at all?  ← OmegaAccess / omega_users
       2. May their organisation sign a verdict?  ← partner.orgs in config.js

     They are genuinely different. Being approved into the portal is a login
     level; signing a bankability opinion is a retained engagement. A utility
     that refers deals belongs in (1) and must never land in (2) by accident,
     and the only way to guarantee that is to keep the second list short,
     explicit, and unconnected to who happens to have a password.

     So this takes the access record as its input and layers the verification
     scope on top. An org absent from partner.orgs gets `scopes: []` — they
     can be shown an assignment (they won't have one) but can sign nothing.

     ClearSky staff resolve to an internal observer: every partner's queue,
     read-only. That is how you see what a partner is sitting on without asking
     them, and it is deliberately not a signing seat — an opinion we signed
     ourselves is not an independent one.                                   */
  function resolveActor(rec) {
    if (!rec || rec.status !== 'active') return null;
    var d = rec.orgId || domainOf(rec.email);

    var A = global.OmegaAccess;
    if (A && A.isInternal(rec)) {
      return { kind:'internal', orgId:d, name:'ClearSky (observer)',
               role:rec.role, scopes:['feasibility','bankability'],
               canSign:false, canSee:'all' };
    }

    var orgs = P().orgs || {};
    var v = orgs[d] || null;
    var signers = ((v && v.signers) || []).map(function (s) { return String(s).toLowerCase(); });

    /* A viewer never signs, whatever their org is retained for. Role and
       engagement both have to say yes. */
    var roleAllows = !A || A.can('sign_verdict', rec);

    return {
      kind:    'partner',
      orgId:   d,
      name:    (v && v.name) || rec.orgName || d,
      note:    (v && v.note) || '',
      /* Empty when the org is not a retained verifier. The console shows the
         queue (which will be empty) rather than an access error, because
         "you have nothing assigned" is the true statement. */
      scopes:  (v && v.scopes) || [],
      retained: !!v,
      canSign: !!v && roleAllows && (!signers.length || signers.indexOf(rec.email) >= 0),
      canSee:  'own'
    };
  }

  function accessMessage(email) {
    var d = domainOf(email);
    if (!d) return 'Enter a work email address.';
    return 'This account does not have access to the verification console yet. '
         + 'Access is granted per person \u2014 contact '
         + (cfg().supportEmail || 'ClearSky') + ' if you were expecting it.';
  }


  /* ── Time ───────────────────────────────────────────────────────────────── */
  function ms(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var t = Date.parse(v); return isNaN(t) ? 0 : t; }
    if (v.toDate)  { try { return v.toDate().getTime(); } catch (e) { return 0; } }
    if (v.seconds) return v.seconds * 1000;
    return 0;
  }
  function stamp() { return new Date().toISOString(); }

  function fmtDate(v) {
    var t = ms(v); if (!t) return '\u2014';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var d = new Date(t);
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDateTime(v) {
    var t = ms(v); if (!t) return '\u2014';
    return fmtDate(v) + ', ' + new Date(t).toLocaleTimeString('en-US',
      { hour:'numeric', minute:'2-digit' });
  }
  function fmtDur(msVal) {
    if (msVal == null) return '\u2014';
    var neg = msVal < 0, v = Math.abs(msVal), out;
    if (v < 60000)      out = Math.round(v / 1000) + 's';
    else if (v < HOUR)  out = Math.round(v / 60000) + 'm';
    else if (v < DAY) {
      var h = Math.floor(v / HOUR), mn = Math.round((v % HOUR) / 60000);
      out = h + 'h' + (mn ? ' ' + mn + 'm' : '');
    } else {
      var dd = Math.floor(v / DAY), hh = Math.round((v % DAY) / HOUR);
      out = dd + 'd' + (hh ? ' ' + hh + 'h' : '');
    }
    return (neg ? '-' : '') + out;
  }
  function fmtAgo(v) {
    var t = ms(v); if (!t) return '\u2014';
    var diff = Date.now() - t;
    return diff < 0 ? 'in ' + fmtDur(-diff) : fmtDur(diff) + ' ago';
  }
  function fmtNum(n) {
    if (n == null) return '\u2014';
    if (n >= 1000) return Math.round(n).toLocaleString('en-US');
    return String(Math.round(n * 100) / 100);
  }


  /* ── The turnaround clock ────────────────────────────────────────────────
     assignedAt → submittedAt, MINUS every interval spent in 'info_requested'.

     The pause is the whole design. Without it the number measures your packet
     quality and bills it to the partner: they sit on an unanswered question,
     their SLA turns red, and the lesson they take is that asking cost them.
     Thin packets coming back is the behaviour you want, so it must be free.

     pausedMs accumulates on resume; pausedAt holds the open interval. Two
     fields rather than a walk of the activity log, because the log is a
     display artifact and deriving a contractual number from it means a
     cosmetic change to logging silently moves an SLA.                      */
  function targetMs(v) {
    var hours = (P().sla || {})[v.priority] || (P().sla || {}).standard || 120;
    return hours * HOUR;
  }
  function pausedTotal(v, now) {
    var acc = Number(v.pausedMs) || 0;
    var open = ms(v.pausedAt);
    if (open) acc += Math.max(0, (now || Date.now()) - open);
    return acc;
  }
  function elapsedMs(v, now) {
    now = now || Date.now();
    var start = ms(v.assignedAt);
    if (!start) return null;
    var end = ms(v.submittedAt) || now;
    return Math.max(0, (end - start) - pausedTotal(v, end === now ? now : ms(v.submittedAt)));
  }
  function clock(v, now) {
    now = now || Date.now();
    var t = targetMs(v), e = elapsedMs(v, now);
    if (e == null) return { pct:0, state:'ok', text:'\u2014', elapsed:null, target:t, paused:false, done:false };
    var st = statusOf(v.status);
    var done = !!ms(v.submittedAt) || st.terminal === true;
    var frac = t ? e / t : 0;
    var warn = P().warnAt != null ? P().warnAt : 0.7;
    return {
      elapsed: e,
      target:  t,
      remaining: t - e,
      pct:     Math.max(0, Math.min(frac, 1.6)) * 100,
      /* Overtime keeps counting rather than parking at 100%. A two-hour miss
         and a two-week miss should not look the same on a board. */
      state:   done ? 'done' : frac >= 1 ? 'breach' : frac >= warn ? 'warn' : 'ok',
      paused:  v.status === 'info_requested',
      done:    done,
      text:    fmtDur(e)
    };
  }


  /* ── Normalisation ──────────────────────────────────────────────────────
     `_raw` keeps the original document so the drawer can render anything this
     layer failed to map, the same way ops-data.js does. A wrong guess should
     be visible and correctable rather than a silent blank.                 */
  function normalize(id, d) {
    d = d || {};
    var pk = d.packet || {};
    var vd = d.verdict || {};

    return {
      id:            id,
      schemaVersion: d.schemaVersion || 1,

      /* Where it came from. sourceId is for the ops console's benefit on the
         way back; the partner console never queries with it. */
      source:        d.source || 'intake',
      sourceId:      d.sourceId || '',
      round:         d.round || 1,

      partnerOrg:    String(d.partnerOrg || '').toLowerCase(),
      partnerName:   d.partnerName || '',
      scopeRequested:Array.isArray(d.scopeRequested) ? d.scopeRequested : ['feasibility'],
      priority:      d.priority || 'standard',

      /* The packet — everything the reviewer is given. Blind review hides the
         client from the UI only; see config.js § discloseClient. */
      clientOrgId:   String(d.orgId || '').toLowerCase(),
      clientName:    pk.clientName || '',
      projectName:   pk.projectName || 'Untitled site',
      siteName:      pk.siteName || '',
      address:       pk.address || '',
      lat:           pk.lat != null ? Number(pk.lat) : null,
      lng:           pk.lng != null ? Number(pk.lng) : null,
      utility:       pk.utility || '',
      ahj:           pk.ahj || '',
      stage:         pk.stage || '',
      briefing:      pk.notes || '',

      /* Our categorisation and our sizing, kept separate from theirs so the
         console can show the two side by side. Overwriting ours with theirs
         would destroy the disagreement, which is the finding. */
      ourCategories: Array.isArray(pk.categories) ? pk.categories : [],
      sizing:        Array.isArray(pk.sizing) ? pk.sizing : [],
      screen:        pk.screen || null,
      modelRun:      pk.modelRun || null,
      packetFiles:   Array.isArray(pk.files) ? pk.files : [],
      commercial:    pk.commercial || null,

      status:        d.status || 'assigned',
      assignedBy:    d.assignedBy || null,
      assignedAt:    d.assignedAt || null,
      dueAt:         d.dueAt || null,
      acceptedAt:    d.acceptedAt || null,
      startedAt:     d.startedAt || null,
      submittedAt:   d.submittedAt || null,
      closedAt:      d.closedAt || null,
      pausedMs:      Number(d.pausedMs) || 0,
      pausedAt:      d.pausedAt || null,

      /* Current verdict. Empty until signed; a draft lives in `draft`. */
      verdict: {
        categories:  Array.isArray(vd.categories) ? vd.categories : [],
        feasibility: vd.feasibility || '',
        bankability: vd.bankability || '',
        confidence:  vd.confidence || '',
        conditions:  Array.isArray(vd.conditions) ? vd.conditions : [],
        blockers:    Array.isArray(vd.blockers) ? vd.blockers : [],
        summary:     vd.summary || '',
        reviewer:    vd.reviewer || null,
        signedAt:    vd.signedAt || null
      },
      /* Superseded verdicts, oldest first. Never trimmed. */
      verdictHistory: Array.isArray(d.verdictHistory) ? d.verdictHistory : [],
      /* Unsigned working copy. Not an opinion and never shown as one. */
      draft:         d.draft || null,

      notes:         Array.isArray(d.notes) ? d.notes : [],
      documents:     Array.isArray(d.documents) ? d.documents : [],
      infoRequests:  Array.isArray(d.infoRequests) ? d.infoRequests : [],
      activity:      Array.isArray(d.activity) ? d.activity : [],

      _raw:  d,
      _demo: !!d._demo
    };
  }

  function isSigned(v) { return !!ms(v.verdict && v.verdict.signedAt); }
  function isOpen(v)   { return statusOf(v.status).open === true; }
  function wants(v, scope) { return (v.scopeRequested || []).indexOf(scope) >= 0; }


  /* ── Firestore ──────────────────────────────────────────────────────────── */
  var _db = null, _me = { email:'', name:'', uid:'' }, _actor = null;

  function init(db, me, actor) {
    _db = db || null;
    if (me)    _me = { email:(me.email || '').toLowerCase(), name: me.name || '', uid: me.uid || '' };
    if (actor) _actor = actor;
  }
  function me()    { return _me; }
  function actor() { return _actor; }
  function canSign(v) {
    if (!_actor || !_actor.canSign) return false;
    if (_actor.kind === 'partner' && v && v.partnerOrg !== _actor.orgId) return false;
    return true;
  }

  /* ── ISO strings, NOT serverTimestamp ────────────────────────────────────
     Same rule as ops-data.js, same reason. Every other tool touching this
     document model stores dates as ISO strings and reads them back with
     `new Date(str)`; a Firestore Timestamp round-trips fine here and renders
     as "Invalid Date" on the ops side. If clock skew ever matters enough to
     want server time, move every tool together or not at all.              */
  function loadAssignments() {
    if (!_db || !_actor) return Promise.resolve([]);
    var col = _db.collection(collectionName());
    /* Internal observers read across partners; a partner reads their own. The
       rules enforce this independently — the filter here is so the query does
       not get refused, not so the data stays private. */
    var q = (_actor.kind === 'internal') ? col : col.where('partnerOrg', '==', _actor.orgId);
    return q.get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) { out.push(normalize(doc.id, doc.data() || {})); });
      out.sort(function (a, b) { return ms(b.assignedAt) - ms(a.assignedAt); });
      return out;
    });
  }

  function entry(type, message) {
    return { ts: stamp(), type: type, message: message,
             actor: _me.name || _me.email, actorEmail: _me.email };
  }

  /* Every write goes through here so nothing reaches the collection without
     an activity line and an updatedAt. A verification whose history has gaps
     is a verification somebody will argue about later. */
  function patch(id, fields, note) {
    if (!_db) return Promise.reject(new Error('Not connected.'));
    var body = {};
    for (var k in fields) if (fields.hasOwnProperty(k)) body[k] = fields[k];
    body.updatedAt = stamp();
    if (note) {
      body.activity = firebase.firestore.FieldValue.arrayUnion(entry(note.type || 'note', note.message || ''));
    }
    return _db.collection(collectionName()).doc(id).update(body);
  }


  /* ── Workflow transitions ────────────────────────────────────────────────
     Each of these is a named business event, not a status setter. Callers do
     not write `status` directly: the pause accounting, the timestamps and the
     activity line have to move together or the clock drifts from the log.  */

  /* Taking the job. Deliberately explicit rather than inferred from opening
     the record — accepting is also the conflict-of-interest declaration, and
     that should be an act, not a page view. */
  function accept(v) {
    return patch(v.id, { status:'accepted', acceptedAt: stamp() },
      { type:'accepted', message:'Assignment accepted. No conflict declared.' });
  }

  function decline(v, reason) {
    if (!reason) return Promise.reject(new Error('A reason is required to decline.'));
    return patch(v.id, { status:'declined', declinedAt: stamp(), declineReason: reason },
      { type:'declined', message:'Declined: ' + reason });
  }

  function startReview(v) {
    var f = { status:'in_review' };
    if (!ms(v.startedAt))  f.startedAt  = stamp();
    if (!ms(v.acceptedAt)) f.acceptedAt = stamp();
    /* Resuming from a question closes the paused interval. Doing it here and
       nowhere else is what keeps pausedMs honest. */
    if (ms(v.pausedAt)) {
      f.pausedMs = (Number(v.pausedMs) || 0) + Math.max(0, Date.now() - ms(v.pausedAt));
      f.pausedAt = null;
    }
    return patch(v.id, f, { type:'started', message:'Review started.' });
  }

  /* Bouncing a thin packet back. Pauses the clock — see clock(). */
  function requestInfo(v, question) {
    if (!question) return Promise.reject(new Error('Say what is missing.'));
    var req = { ts: stamp(), by: _me.name || _me.email, question: question, answeredAt: null, answer: '' };
    return patch(v.id, {
      status:   'info_requested',
      pausedAt: ms(v.pausedAt) ? v.pausedAt : stamp(),
      infoRequests: firebase.firestore.FieldValue.arrayUnion(req)
    }, { type:'info_requested', message:'Information requested: ' + question });
  }

  function addNote(v, text, shared) {
    if (!text) return Promise.reject(new Error('Nothing to save.'));
    var n = { ts: stamp(), author: _me.name || _me.email, authorEmail: _me.email,
              visibility: shared ? 'shared' : 'partner', text: text };
    return patch(v.id, { notes: firebase.firestore.FieldValue.arrayUnion(n) },
      { type:'note', message: (shared ? 'Shared note' : 'Internal note') + ' added.' });
  }

  /* Working copy. Saved as `draft`, never as `verdict` — an unsigned opinion
     must not be readable as a signed one anywhere in the system, including by
     a future version of this console reading the field by name. */
  function saveDraft(v, form) {
    return patch(v.id, { draft: cleanVerdict(form), draftSavedAt: stamp() },
      { type:'draft', message:'Draft saved.' });
  }

  function cleanVerdict(form) {
    form = form || {};
    function lines(x) {
      if (Array.isArray(x)) return x.filter(Boolean);
      return String(x || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return {
      categories:  (form.categories || []).slice(),
      feasibility: form.feasibility || '',
      bankability: form.bankability || '',
      confidence:  form.confidence || '',
      conditions:  lines(form.conditions),
      blockers:    lines(form.blockers),
      summary:     String(form.summary || '').trim()
    };
  }

  /* ── What a verdict has to contain before it can be signed ───────────────
     Returned as a list of problems rather than a boolean so the form can
     point at the field. Every one of these is a rule you would otherwise
     discover by reading a useless opinion three weeks later.               */
  function validate(v, form) {
    var out = [], f = cleanVerdict(form);

    if (!f.categories.length)
      out.push({ field:'categories', msg:'Mark at least one project category.' });

    if (wants(v, 'feasibility') && !f.feasibility)
      out.push({ field:'feasibility', msg:'Give a feasibility verdict.' });

    if (wants(v, 'bankability') && !f.bankability)
      out.push({ field:'bankability', msg:'Give a bankability verdict.' });

    /* "Conditional" with no conditions is the single most common way an
       opinion arrives unusable: it reads as a yes to whoever is in a hurry. */
    if ((f.feasibility === 'conditional' || f.bankability === 'conditional') && !f.conditions.length)
      out.push({ field:'conditions', msg:'A conditional verdict needs its conditions listed. '
        + 'Without them it reads as a yes.' });

    if ((f.feasibility === 'fail' || f.bankability === 'not_bankable') && !f.blockers.length)
      out.push({ field:'blockers', msg:'Name the blocker. A negative verdict with no reason '
        + 'cannot be worked or appealed.' });

    /* Same principle in the other direction: "cannot determine" is only
       useful if it says what was missing. */
    if ((f.feasibility === 'insufficient' || f.bankability === 'insufficient') && !f.summary)
      out.push({ field:'summary', msg:'Say what was missing from the packet.' });

    if (!f.confidence)
      out.push({ field:'confidence', msg:'State your confidence.' });

    if (f.summary.length < 40)
      out.push({ field:'summary', msg:'The summary is what gets read. Write at least a couple of sentences.' });

    /* A signed opinion with nothing attached is a chat message. */
    var kinds = docKinds(), need = [];
    for (var k in kinds) {
      if (!kinds.hasOwnProperty(k)) continue;
      var req = kinds[k].requiredFor || [];
      for (var i = 0; i < req.length; i++) {
        if (wants(v, req[i]) && !hasDoc(v, k)) { need.push(kinds[k].label); break; }
      }
    }
    if (need.length)
      out.push({ field:'documents', msg:'Upload the ' + need.join(' and ') + ' before signing.' });

    if (!canSign(v))
      out.push({ field:'sign', msg: _actor && _actor.kind === 'internal'
        ? 'ClearSky staff can read this queue but cannot sign a partner verdict.'
        : 'Your account is not on the signer list for ' + (_actor ? _actor.name : 'this organisation') + '.' });

    return out;
  }

  function hasDoc(v, kind) {
    var d = v.documents || [];
    for (var i = 0; i < d.length; i++) if (d[i] && d[i].kind === kind) return true;
    return false;
  }

  /* ── Signing ─────────────────────────────────────────────────────────────
     Appends. The previous verdict is pushed to verdictHistory with the reason
     it was superseded, and nothing is ever deleted.

     A bankability opinion a later save can quietly rewrite is not an opinion
     a lender can rely on, and "we edited it after the fact" is a sentence you
     do not want to have to say. Reissuing is a normal act; doing it invisibly
     is not.                                                                */
  function sign(v, form, supersedeReason) {
    var problems = validate(v, form);
    if (problems.length) return Promise.reject({ validation: problems });

    var f = cleanVerdict(form);
    f.reviewer = { name:_me.name || _me.email, email:_me.email,
                   org:_actor ? _actor.name : '', orgId:_actor ? _actor.orgId : '' };
    f.signedAt = stamp();

    var fields = {
      verdict:     f,
      draft:       null,
      status:      'submitted',
      submittedAt: stamp()
    };
    /* Close any open pause so the recorded turnaround is final. */
    if (ms(v.pausedAt)) {
      fields.pausedMs = (Number(v.pausedMs) || 0) + Math.max(0, Date.now() - ms(v.pausedAt));
      fields.pausedAt = null;
    }
    if (isSigned(v)) {
      var old = {};
      for (var k in v.verdict) if (v.verdict.hasOwnProperty(k)) old[k] = v.verdict[k];
      old.supersededAt     = stamp();
      old.supersededBy     = _me.email;
      old.supersededReason = supersedeReason || '';
      fields.verdictHistory = firebase.firestore.FieldValue.arrayUnion(old);
      fields.round = (v.round || 1) + 1;
    }

    var msg = 'Verdict signed by ' + (_me.name || _me.email)
            + (isSigned(v) ? ' (reissued: ' + (supersedeReason || 'no reason given') + ')' : '');
    return patch(v.id, fields, { type:'signed', message: msg });
  }


  /* ── Documents ───────────────────────────────────────────────────────────
     Storage path is keyed by verification id first, so a Storage rule can
     scope a partner to their own folder by path without a Firestore lookup —
     Storage rules cannot read Firestore cheaply and a design that needs them
     to is a design that will be deployed without the rule.                 */
  function storage() {
    if (!global.firebase || !firebase.storage) throw new Error('Storage SDK not loaded.');
    return firebase.storage();
  }
  function filePath(v, fileId, name) {
    var clean = String(name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    return (P().storagePrefix || 'verifications') + '/' + v.id + '/' + fileId + '_' + clean;
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function uploadDocument(v, file, kind, onProgress) {
    var kinds = docKinds(), spec = kinds[kind];
    if (!spec) return Promise.reject(new Error('Unknown document type.'));
    if (!file) return Promise.reject(new Error('No file selected.'));

    var mb = maxFileMb();
    if (file.size > mb * 1048576)
      return Promise.reject(new Error('That file is ' + fmtBytes(file.size)
        + '. The limit is ' + mb + ' MB.'));

    var ct = file.type || 'application/octet-stream';
    /* PDF only for the signed artifacts. A Word file is an editable document
       and the point of the opinion is that it isn't. */
    if (spec.pdfOnly && !/^application\/pdf$/.test(ct))
      return Promise.reject(new Error('The ' + spec.label.toLowerCase()
        + ' must be a PDF. Export it and upload again.'));

    var id = 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    var path = filePath(v, id, file.name);
    var task = storage().ref(path).put(file, { contentType: ct });

    return new Promise(function (resolve, reject) {
      task.on('state_changed',
        function (s) { if (onProgress && s.totalBytes) onProgress(s.bytesTransferred / s.totalBytes); },
        reject,
        function () {
          task.snapshot.ref.getDownloadURL().then(function (url) {
            var rec = { id:id, kind:kind, name:file.name, size:file.size, contentType:ct,
                        path:path, url:url, uploadedBy:_me.email,
                        uploadedByName:_me.name || _me.email, uploadedAt:stamp() };
            return patch(v.id, { documents: firebase.firestore.FieldValue.arrayUnion(rec) },
              { type:'document', message:(spec.label) + ' uploaded: ' + file.name })
              .then(function () { resolve(rec); });
          })['catch'](reject);
        });
    });
  }

  /* Removal is refused once the verdict is signed. The document is part of
     the opinion at that point, and an opinion whose evidence can be pulled
     afterwards is not evidence of anything. */
  function removeDocument(v, doc) {
    if (isSigned(v))
      return Promise.reject(new Error('This verdict is signed. Its documents are part of the '
        + 'record and cannot be removed \u2014 reissue the verdict instead.'));
    var p = Promise.resolve();
    if (doc.path) p = storage().ref(doc.path)['delete']()['catch'](function () {});
    return p.then(function () {
      return patch(v.id, { documents: firebase.firestore.FieldValue.arrayRemove(doc) },
        { type:'document', message:'Removed ' + doc.name });
    });
  }


  /* ── Summary for the header strip ───────────────────────────────────────── */
  function summarize(list, now) {
    now = now || Date.now();
    var s = { total:list.length, open:0, unopened:0, blocked:0, signed:0, breach:0, warn:0,
              medianMs:null, agreeing:0, disagreeing:0 };
    var times = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i], c = clock(v, now);
      if (isOpen(v)) s.open++;
      if (v.status === 'assigned') s.unopened++;
      if (v.status === 'info_requested') s.blocked++;
      if (isSigned(v)) {
        s.signed++;
        if (c.elapsed != null) times.push(c.elapsed);
        var agree = sameSet(v.ourCategories, v.verdict.categories);
        if (agree) s.agreeing++; else s.disagreeing++;
      } else {
        if (c.state === 'breach') s.breach++;
        else if (c.state === 'warn') s.warn++;
      }
    }
    if (times.length) {
      times.sort(function (a, b) { return a - b; });
      var mid = Math.floor(times.length / 2);
      s.medianMs = times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
    }
    return s;
  }
  function sameSet(a, b) {
    a = (a || []).slice().sort(); b = (b || []).slice().sort();
    return a.length === b.length && a.join('|') === b.join('|');
  }


  /* ── Sample data ─────────────────────────────────────────────────────────
     In memory only, nothing written, every row flagged in the UI. This exists
     for the first call with a prospective partner, when they have no Firestore
     access and you still need to show them the console. The shapes match real
     documents so it also exercises the field-tolerance paths.              */
  function sample(orgId, orgName) {
    var now = Date.now();
    function t(hoursAgo) { return new Date(now - hoursAgo * HOUR).toISOString(); }

    var rows = [
      { partnerOrg:orgId, partnerName:orgName, source:'intake', sourceId:'demo-a', round:1,
        orgId:'concordenergyusa.com', priority:'standard', status:'assigned',
        scopeRequested:['feasibility','bankability'], assignedAt:t(31),
        assignedBy:{ name:'Thomas', email:'tom@clearsky-usa.com' },
        packet:{ clientName:'Concord Energy', projectName:'Cedar Rapids fleet depot',
          address:'Cedar Rapids, IA', utility:'Alliant Energy', ahj:'Linn County',
          stage:'Site control signed', categories:['dcfc','bess'],
          sizing:[{ key:'dcfc', label:'DC fast charging', text:'24 dispensers \u00b7 350 kW', mw:8.4 },
                  { key:'bess', label:'Battery storage', text:'6 MW \u00b7 24 MWh', mw:6 }],
          screen:{ verdict:'qualified', mw:8.4 },
          modelRun:{ probability:0.78, version:'scenario-v3', runAt:t(40),
            drivers:[{ label:'Substation 1.1 km', effect:'+' },
                     { label:'Interconnect queue position unknown', effect:'-' },
                     { label:'Land control confirmed', effect:'+' }] },
          commercial:{ counterparty:'Amperage', status:'Indicative lease issued', term:'20 yr' },
          notes:'Human desk confirmed grade and access from imagery. Queue position is the open item.' } },

      { partnerOrg:orgId, partnerName:orgName, source:'editor', sourceId:'demo-b', round:1,
        orgId:'iqgen.energy', priority:'critical', status:'info_requested',
        scopeRequested:['feasibility'], assignedAt:t(62), acceptedAt:t(60), startedAt:t(59),
        pausedAt:t(38), pausedMs:0,
        assignedBy:{ name:'Thomas', email:'tom@clearsky-usa.com' },
        packet:{ clientName:'iQGen Technologies', projectName:'El Paso compute campus',
          address:'El Paso, TX', utility:'El Paso Electric', ahj:'City of El Paso',
          stage:'Option agreement', categories:['compute','powergen'],
          sizing:[{ key:'compute', label:'Data centre', text:'75 MW IT load', mw:75 }],
          screen:{ verdict:'qualified', mw:75 },
          modelRun:{ probability:0.41, version:'scenario-v3', runAt:t(70),
            drivers:[{ label:'Water availability marginal', effect:'-' },
                     { label:'Transmission capacity 138 kV adjacent', effect:'+' },
                     { label:'Two models disagree \u2014 escalated', effect:'!' }] },
          notes:'Model A and Model B disagreed by 34 points. Routed to full human review, then here.' },
        infoRequests:[{ ts:t(38), by:'Reviewer', question:'No interconnection study attached. Is one in progress?', answeredAt:null, answer:'' }],
        activity:[{ ts:t(38), type:'info_requested', message:'Information requested: interconnection study', actor:'Reviewer' }] },

      { partnerOrg:orgId, partnerName:orgName, source:'intake', sourceId:'demo-c', round:1,
        orgId:'sunesol.com', priority:'standard', status:'submitted',
        scopeRequested:['feasibility','bankability'],
        assignedAt:t(300), acceptedAt:t(296), startedAt:t(290), submittedAt:t(196), pausedMs:12*HOUR,
        assignedBy:{ name:'Thomas', email:'tom@clearsky-usa.com' },
        packet:{ clientName:'SunESol', projectName:'Bakersfield rooftop portfolio',
          address:'Bakersfield, CA', utility:'PG&E', ahj:'Kern County',
          stage:'Leases executed', categories:['solar'],
          sizing:[{ key:'solar', label:'Solar', text:'2,100 kW DC', mw:2.1 }],
          screen:{ verdict:'below', mw:2.1 },
          modelRun:{ probability:0.66, version:'scenario-v3', runAt:t(310), drivers:[] } },
        verdict:{ categories:['solar','bess'], feasibility:'conditional', bankability:'conditional',
          confidence:'medium',
          conditions:['Structural letter required on buildings 3 and 7 before financing',
                      'Confirm PG&E interconnection agreement assignability on sale'],
          blockers:[],
          summary:'Roofs are adequate on five of seven buildings. Two need a structural letter, '
                + 'which is routine but is a condition precedent for any lender we would take '
                + 'this to. Added BESS to the categorisation \u2014 the packet describes 900 kWh '
                + 'of storage that was not categorised.',
          reviewer:{ name:'Sample Reviewer', email:'reviewer@' + orgId, org:orgName },
          signedAt:t(196) },
        documents:[{ id:'d_demo1', kind:'bankability', name:'bakersfield-bankability-opinion.pdf',
          size:1841000, contentType:'application/pdf', uploadedByName:'Sample Reviewer', uploadedAt:t(197) }] }
    ];

    var out = [];
    for (var i = 0; i < rows.length; i++) {
      rows[i]._demo = true;
      out.push(normalize('demo-' + (i + 1), rows[i]));
    }
    return out;
  }


  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* Anything in the raw document this layer did not map, so a field we are
     missing surfaces as visible data rather than as a blank row. */
  var KNOWN = ['schemaVersion','source','sourceId','round','partnerOrg','partnerName',
    'scopeRequested','priority','orgId','packet','status','assignedBy','assignedAt','dueAt',
    'acceptedAt','startedAt','submittedAt','closedAt','declinedAt','declineReason',
    'pausedMs','pausedAt','verdict','verdictHistory','draft','draftSavedAt','notes',
    'documents','infoRequests','activity','updatedAt','_demo'];
  function unmapped(v) {
    var raw = v._raw || {}, out = {}, n = 0;
    for (var k in raw) {
      if (!raw.hasOwnProperty(k) || KNOWN.indexOf(k) >= 0) continue;
      out[k] = raw[k]; n++;
    }
    return n ? out : null;
  }


  global.PartnerData = {
    STATUS:STATUS, FEASIBILITY:FEASIBILITY, BANKABILITY:BANKABILITY,
    CONFIDENCE:CONFIDENCE, PRIORITY:PRIORITY,
    statusOf:statusOf, feasibilityOf:feasibilityOf, bankabilityOf:bankabilityOf,
    confidenceOf:confidenceOf, labelFor:labelFor,
    categories:categories, categoryOf:categoryOf, scopeCfg:scopeCfg,
    docKinds:docKinds, maxFileMb:maxFileMb, discloseClient:discloseClient,
    resolveActor:resolveActor, accessMessage:accessMessage, domainOf:domainOf,
    isInternal:isInternal,
    ms:ms, stamp:stamp, fmtDate:fmtDate, fmtDateTime:fmtDateTime, fmtDur:fmtDur,
    fmtAgo:fmtAgo, fmtNum:fmtNum, fmtBytes:fmtBytes, esc:esc,
    clock:clock, targetMs:targetMs, elapsedMs:elapsedMs,
    normalize:normalize, isSigned:isSigned, isOpen:isOpen, wants:wants, hasDoc:hasDoc,
    init:init, me:me, actor:actor, canSign:canSign, collectionName:collectionName,
    loadAssignments:loadAssignments, patch:patch,
    accept:accept, decline:decline, startReview:startReview, requestInfo:requestInfo,
    addNote:addNote, saveDraft:saveDraft, cleanVerdict:cleanVerdict,
    validate:validate, sign:sign,
    uploadDocument:uploadDocument, removeDocument:removeDocument,
    summarize:summarize, sameSet:sameSet, sample:sample, unmapped:unmapped
  };
})(window);
