/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Portfolio Data Layer  (v1)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   One document per deal in `deals`, from the moment a partner refers it to the
   moment it is operating. This is the spine: intake_projects holds the work
   request, projects holds the drawing, verifications holds the opinions, and a
   deal holds the commercial life of the site across all three.

   ─────────────────────────────────────────────────────────────────────────────
   FOUR DECISIONS. THE REST OF THE FILE IS CONSEQUENCE.
   ─────────────────────────────────────────────────────────────────────────────

   1 · ATTRIBUTION IS WRITE-ONCE
       Who brought the deal decides who gets paid. An editable field is not a
       fact, it is the opening position in an argument you will have eighteen
       months from now with a manufacturer holding a different email thread.
       So `origination` locks the first time the deal leaves `referred`, and
       changing it afterwards takes an owner, a reason, and leaves the previous
       value in `originationHistory`. Nothing is overwritten.

   2 · ORIGINATION AND PARTICIPATION ARE DIFFERENT RELATIONSHIPS
       A battery manufacturer who refers a site and then supplies its cells has
       TWO commercial relationships with you: a referral fee and a purchase
       order. One "partner" field makes the second invisible in every report
       you will ever run. So `origination` is one org, and `participants[]` is
       many orgs with roles, and the partner view totals both separately.

   3 · FIVE MONEY NUMBERS, NEVER MERGED
       requested / committed / closed / drawn / deployed. Every one of them is
       a different question, they diverge constantly, and the classic error is
       treating a term sheet as money in the ground. See § FUNDING.

   4 · DEAD DEALS STAY IN THE DENOMINATOR, FOREVER
       A partner who referred 40 sites and funded 1 looks identical to one who
       referred 1 and funded 1 if you only count what funded. Conversion is the
       number that tells you which partners to spend time on, and it needs the
       failures. Same principle as `declined` keeping its response time in the
       ops console's averages.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var COLLECTION = 'deals';
  var DAY = 86400000;

  /* ── Stages ──────────────────────────────────────────────────────────────
     A pipeline with stages and no gates is a list of things in progress. Each
     stage below names the evidence required to enter it, and advance() refuses
     without it — the same discipline as refusing a conditional verdict with no
     conditions listed in the verification console.

     `needs` is checked against the deal. It is not paperwork: every one of
     these is a number somebody will later assume exists.                    */
  var STAGES = [
    { key:'referred',     label:'Referred',      short:'Ref',    rank:10, color:'#6B7280',
      hint:'A partner brought it. Attribution is set here and locks when it advances.',
      needs:['origination.partnerOrg'] },

    { key:'screening',    label:'Screening',     short:'Screen', rank:20, color:'#0070F2',
      hint:'A rep works the site and runs it through the partner\u2019s scoring tool.',
      needs:['assignment.rep'],
      why:'Screening is somebody\u2019s job, not a state a deal drifts into. Without a '
        + 'named rep it sits in the column and nobody is answerable for it.' },

    /* THE GATE INTO SPEND. Everything before this is looking; everything after
       costs money. It is the only stage with a computed condition rather than a
       field-presence check, and that is deliberate — see checkQualified(). */
    { key:'qualified',    label:'Qualified',     short:'Qual',   rank:30, color:'#0D9488',
      hint:'Passed viability scoring. The gate between looking at a site and spending on one.',
      needs:['viability.score'],
      check:function (d) {
        var v = d.viability || {};
        if (v.score == null) return 'Score the deal first.';
        if (v.verdict !== 'pass')
          return 'The viability score is ' + v.score + ', below the threshold of '
               + (v.threshold != null ? v.threshold : '\u2014')
               + '. Re-score it or override with a written reason.';
        return null;
      },
      why:'A gate you can walk through without a score is not a gate, and this is '
        + 'the one standing between a screening exercise and a six-figure line item.' },

    { key:'pre_dev',      label:'Pre-development', short:'PreDev', rank:40, color:'#6366F1',
      hint:'We are spending: land, interconnection, permits, studies.',
      /* NO GATE. A budget was required here and that was wrong: at the point a
         deal qualifies, nobody yet knows what developing it costs \u2014 that is
         what the design produces. Requiring a number people do not have gets a
         guess typed in to clear the gate, which is worse than no number at all,
         because a guess looks like a decision afterwards.

         The OSA budget stays available and is worth setting once it is real. It
         is simply not a barrier to starting. */
      needs:[] },

    /* Permitting genuinely OVERLAPS pre-dev and often runs past funding. A linear
       ladder cannot express that, so the stage means "furthest point reached" and
       permitting.applications[] tracks the real, parallel work. Do not read the
       stage as a schedule \u2014 see PLATFORM.md \u00a7 2. */
    { key:'permitting',   label:'Permitting',    short:'Permit', rank:50, color:'#7C3AED',
      hint:'AHJ and utility applications in flight. Overlaps pre-dev; the ladder shows the furthest point, not the only work.',
      needs:['permitting.startedAt'] },

    { key:'verified',     label:'Verified',      short:'Verified', rank:60, color:'#8B5CF6',
      hint:'A third party has signed a feasibility or bankability opinion.',
      needs:['verification.verdictId'],
      why:'This stage means an outside signature exists. Asserting it without '
        + 'one is the single claim in this pipeline you cannot walk back.' },

    { key:'marketplace',  label:'In marketplace', short:'Market', rank:70, color:'#0891B2',
      hint:'Listed to capital.',
      needs:['sizeMw','capexUsd'],
      why:'A listing with no size and no capex is not a listing, it is a '
        + 'placeholder that wastes an investor\u2019s first look.' },

    { key:'committed',    label:'Committed',     short:'Commit', rank:80, color:'#D97706',
      hint:'Term sheet or LOI signed. Not money.',
      needs:['funding.committedUsd','funding.counterparty'],
      why:'Committed is a promise. It belongs in a different column from cash '
        + 'and in a different column from close.' },

    { key:'funded',       label:'Funded',        short:'Funded', rank:90, color:'#16A34A',
      hint:'Financial close. The money is legally committed.',
      needs:['funding.closedUsd','funding.closedAt','funding.investorOrg'],
      why:'Close is the only event that converts a pipeline into a portfolio. '
        + 'It needs a date, an amount and a counterparty or it is not close.' },

    { key:'construction', label:'Construction',  short:'Build',  rank:100, color:'#0F766E',
      hint:'Notice to proceed issued. The BOM is live.',
      needs:['build.ntpAt'] },

    { key:'operating',    label:'Operating',     short:'COD',    rank:110, color:'#065F46',
      hint:'Commercial operation.',
      needs:['build.codAt'] }
  ];

  /* Outside the ladder. Both keep the deal in every partner denominator — that
     is the entire reason they are statuses and not deletions. */
  /* ── Outside the ladder ──────────────────────────────────────────────────
     THREE, and the difference between the last two is the whole point.

     `dead` is a deal that HAPPENED and did not work out. It stays in every
     denominator forever, because a partner who brought forty sites and funded
     one is a different partner from one who brought one and funded one.

     `discarded` is a record that was NEVER A DEAL: a test row, a
     mis-adoption, a duplicate created by a bug. Keeping those in the
     denominator does not make the numbers more honest, it makes them less —
     a test record counted as "referred but never funded" is a lie about that
     partner's conversion, told by us.

     So discarded is excluded from every count, every funnel and every partner
     statistic, and it is reversible. Getting this distinction wrong in either
     direction is bad: delete real failures and you flatter yourself; keep
     junk and you libel your partners. */
  var EXITS = [
    /* NOT a failure and NOT an exit in the usual sense: a deal that scored below
       the threshold and needs something changed before it is worth re-running.
       It stays in every denominator because it really was referred and really
       did get screened \u2014 the whole point of the conversion numbers.

       It exists because "scored 41" and "dead" are different facts, and
       collapsing them loses the pile of deals that would pass if somebody
       fixed one input. That pile is where the cheapest wins are. */
    { key:'reevaluate', label:'Re-evaluate', short:'Re-eval', color:'#D97706',
      hint:'Scored below the threshold. Change something and re-score, or mark it dead.' },
    { key:'parked',    label:'Parked',  short:'Parked', color:'#94A3AF',
      hint:'Not now. Revisit on a trigger \u2014 new substation, rezoning, tariff change.' },
    { key:'dead',      label:'Dead',    short:'Dead',   color:'#DC2626',
      hint:'It happened and it did not work out. Stays in every denominator, permanently.' },
    { key:'discarded', label:'Discarded', short:'Disc.', color:'#94A3AF', excluded:true,
      hint:'Never a real deal — a test row, a mis-adoption, a duplicate. Excluded from '
         + 'every count rather than counted as a failure.' }
  ];

  /* Reasons a record was never a deal. Fixed list, same as DEAD_REASONS, so
     that "why is my portfolio smaller than I remember" has an answer. */
  var DISCARD_REASONS = [
    'Test record',
    'Adopted in error',
    'Duplicate of another deal',
    'Imported in error',
    'Belongs to another system',
    'Other'
  ];

  /* THE FILTER EVERY STATISTIC RUNS THROUGH. Anything counting deals calls
     this first; anything listing them can choose. One function so the two
     cannot drift — which is exactly how a discarded record ends up back in
     a partner report six months later. */
  function counted(list) {
    return (list || []).filter(function (d) { return d.stage !== 'discarded'; });
  }

  var DEAD_REASONS = [
    'Interconnection cost or timeline',
    'Land control lost',
    'Permitting / zoning',
    'Offtake unavailable',
    'Economics below hurdle',
    'Not bankable (third-party opinion)',
    'Client withdrew',
    'Partner withdrew',
    'Superseded by another site',
    'Other'
  ];

  /* Roles a partner can hold on a deal ALONGSIDE having referred it. See
     decision 2 at the top of this file. */
  var PARTICIPANT_ROLES = [
    { key:'supplier',   label:'Supplier',        hint:'Equipment on the BOM.' },
    { key:'epc',        label:'EPC / installer', hint:'Builds it.' },
    { key:'investor',   label:'Investor',        hint:'Provides the capital.' },
    { key:'offtaker',   label:'Offtaker',        hint:'Buys the output.' },
    { key:'utility',    label:'Utility',         hint:'Interconnection or siting counterparty.' },
    { key:'landowner',  label:'Landowner',       hint:'Holds the site.' },
    { key:'codev',      label:'Co-developer',    hint:'Shares development risk and upside.' }
  ];

  /* BOM lines roll up by category, and category is what a manufacturer
     partner's report is grouped by. Keep this list stable — renaming a key
     silently re-buckets every historical line. */
  var BOM_CATEGORIES = [
    { key:'battery',      label:'Battery / cells' },
    { key:'inverter',     label:'Inverters / PCS' },
    { key:'module',       label:'PV modules' },
    { key:'racking',      label:'Racking / tracker' },
    { key:'transformer',  label:'Transformers' },
    { key:'switchgear',   label:'Switchgear / protection' },
    { key:'evse',         label:'EV charging equipment' },
    { key:'genset',       label:'On-site generation' },
    { key:'bos',          label:'Balance of system' },
    { key:'civil',        label:'Civil / site works' },
    { key:'labor',        label:'Installation labour' },
    { key:'interconnect', label:'Interconnection works' },
    { key:'other',        label:'Other' }
  ];

  var BOM_STATUS = [
    { key:'specified', label:'Specified', color:'#6B7280', committed:false },
    { key:'quoted',    label:'Quoted',    color:'#0070F2', committed:false },
    { key:'ordered',   label:'Ordered',   color:'#8B5CF6', committed:true },
    { key:'delivered', label:'Delivered', color:'#0891B2', committed:true },
    { key:'installed', label:'Installed', color:'#16A34A', committed:true }
  ];

  /* Draw states. `requested` and `funded` are different dates and the gap
     between them is the number a partner actually feels. */
  var DRAW_STATUS = [
    { key:'requested', label:'Requested', color:'#D97706' },
    { key:'approved',  label:'Approved',  color:'#0070F2' },
    { key:'funded',    label:'Funded',    color:'#16A34A' },
    { key:'rejected',  label:'Rejected',  color:'#DC2626' }
  ];

  function find(l, k) { for (var i=0;i<l.length;i++) if (l[i].key===k) return l[i]; return null; }
  function stageOf(k) {
    return find(STAGES, k) || find(EXITS, k)
        || { key:k||'?', label:k||'Unknown', short:'?', rank:0, color:'#6B7280' };
  }
  function isExit(k)   { return !!find(EXITS, k); }
  function bomCatOf(k) { return find(BOM_CATEGORIES, k) || { key:k, label:k || 'Other' }; }
  function bomStatusOf(k) { return find(BOM_STATUS, k) || BOM_STATUS[0]; }
  function drawStatusOf(k){ return find(DRAW_STATUS, k) || DRAW_STATUS[0]; }
  function roleOf(k)   { return find(PARTICIPANT_ROLES, k) || { key:k, label:k || 'Partner' }; }


  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function cfg() { return (global.CLEARSKY_CONFIG || {}); }
  function stamp() { return new Date().toISOString(); }
  function ms(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var t = Date.parse(v); return isNaN(t) ? 0 : t; }
    if (v.toDate) { try { return v.toDate().getTime(); } catch(e){ return 0; } }
    if (v.seconds) return v.seconds * 1000;
    return 0;
  }
  function dig(o, path) {
    var p = String(path).split('.'), c = o;
    for (var i=0;i<p.length;i++){ if (c==null) return undefined; c = c[p[i]]; }
    return c;
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var m = v.replace(/[$,\s]/g,'').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  function money(n, compact) {
    if (n == null) return '\u2014';
    var v = Number(n) || 0;
    if (compact) {
      if (Math.abs(v) >= 1e9) return '$' + (v/1e9).toFixed(2) + 'B';
      if (Math.abs(v) >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
      if (Math.abs(v) >= 1e3) return '$' + Math.round(v/1e3) + 'k';
    }
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  /* Plain thousands separator. Added because the site panel referenced a
     helper that did not exist — which would have thrown on the first deal
     that actually had an annual kWh figure. */
  function fmtNumber(n) {
    if (n == null || n === '') return '\u2014';
    var v = Number(n);
    return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '\u2014';
  }
  function mw(n) { return n == null ? '\u2014' : (Math.round(n*100)/100) + ' MW'; }
  function pct(a, b) { return !b ? '\u2014' : Math.round((a/b)*100) + '%'; }
  function fmtDate(v) {
    var t = ms(v); if (!t) return '\u2014';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var d = new Date(t);
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
  }
  function days(a, b) {
    var x = ms(a), y = ms(b);
    if (!x || !y) return null;
    return Math.round((y - x) / DAY);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }


  /* ── Normalisation ──────────────────────────────────────────────────────── */
  function normalize(id, d) {
    d = d || {};
    var o = d.origination || {}, f = d.funding || {}, b = d.build || {}, pd = d.preDev || {};
    var vb = d.viability || {}, pm = d.permitting || {}, as = d.assignment || {};

    return {
      id:        id,
      name:      d.name || 'Untitled site',
      address:   d.address || '',
      state:     d.state || '',
      clientOrgId: String(d.clientOrgId || '').toLowerCase(),

      /* Links out to the other collections. Deliberately ids, not copies: a
         deal is the live spine and is supposed to change, unlike a verification
         packet which is frozen on purpose. */
      verificationIds: Array.isArray(d.verificationIds) ? d.verificationIds : [],

      /* ── Attribution ───────────────────────────────────────────────────── */
      origination: {
        partnerOrg:   String(o.partnerOrg || '').toLowerCase(),
        partnerName:  o.partnerName || '',
        contactName:  o.contactName || '',
        contactEmail: o.contactEmail || '',
        referredAt:   o.referredAt || null,
        channel:      o.channel || '',
        agreementRef: o.agreementRef || '',
        feeBasis:     o.feeBasis || '',
        feeUsd:       num(o.feeUsd),
        feePaidAt:    o.feePaidAt || null,
        locked:       o.locked === true,
        lockedAt:     o.lockedAt || null
      },
      originationHistory: Array.isArray(d.originationHistory) ? d.originationHistory : [],
      participants: Array.isArray(d.participants) ? d.participants : [],

      /* ── Stage ─────────────────────────────────────────────────────────── */
      stage:        d.stage || 'referred',
      stageHistory: Array.isArray(d.stageHistory) ? d.stageHistory : [],
      deadReason:   d.deadReason || '',
      reevaluateReason: d.reevaluateReason || '',
      discardReason:d.discardReason || '',
      discardedAt:  d.discardedAt || null,
      deadAt:       d.deadAt || null,

      /* ── Physical / economic ───────────────────────────────────────────── */
      /* What we are building and financing. Drives the viability criteria, the
         BOM categories offered, and which manufacturers appear. Distinct from
         `categories`, which is the technology present — see config.js. */
      projectType:  d.projectType || '',
      /* What is actually knowable at intake. Before a design exists there is no
         capex and often no MW — but there IS a bill, a meter count and what
         somebody saw on site. Asking for those instead of numbers nobody has
         is the difference between a form people fill in and one they abandon. */
      siteNotes:    d.siteNotes || '',
      energy: {
        monthlyBillUsd: num((d.energy||{}).monthlyBillUsd),
        annualKwh:      num((d.energy||{}).annualKwh),
        meters:         num((d.energy||{}).meters),
        loadKw:         num((d.energy||{}).loadKw),
        utilityAccount: (d.energy||{}).utilityAccount || ''
      },
      categories:   Array.isArray(d.categories) ? d.categories : [],
      sizeMw:       num(d.sizeMw),
      sizeMwh:      num(d.sizeMwh),
      capexUsd:     num(d.capexUsd),

      /* ── Viability ─────────────────────────────────────────────────────
         Scores are APPENDED, never overwritten. "It scored 41 in March and 78
         in June" is the interesting fact; a lone 78 tells you nothing about
         whether the site improved or the scorer did. `viability` is the
         current one, `viabilityHistory` is every one before it. */
      viability: {
        score:     num(vb.score),
        threshold: vb.threshold != null ? num(vb.threshold) : null,
        verdict:   vb.verdict || '',
        model:     vb.model || '',
        criteria:  Array.isArray(vb.criteria) ? vb.criteria : [],
        scoredBy:  vb.scoredBy || '',
        scoredAt:  vb.scoredAt || null,
        override:  vb.override || '',
        source:    vb.source || '',
        /* WRITTEN BY requestScore() AND PREVIOUSLY DROPPED HERE. Anything the
           normaliser does not name is invisible to the rest of the console —
           so the score saved, and the findings, the path to NTP and the axis
           it answered all vanished on the next read. Silent, because nothing
           throws when a field is simply absent. */
        axis:         vb.axis || '',
        agentVerdict: vb.agentVerdict || '',
        providerName: vb.providerName || '',
        providerOrg:  vb.providerOrg || '',
        summary:      vb.summary || '',
        findings:     Array.isArray(vb.findings) ? vb.findings : [],
        pathToNtp:    Array.isArray(vb.pathToNtp) ? vb.pathToNtp : []
      },
      viabilityHistory: Array.isArray(d.viabilityHistory) ? d.viabilityHistory : [],

      /* ── Permitting ────────────────────────────────────────────────────
         Applications are tracked independently of stage, because permitting
         overlaps pre-dev and routinely outlives funding. The stage says how
         far the deal got; this says what is actually in flight. */
      permitting: {
        startedAt: pm.startedAt || null,
        ahj:       pm.ahj || '',
        utility:   pm.utility || '',
        owner:     pm.owner || '',
        applications: Array.isArray(pm.applications) ? pm.applications : []
      },

      /* ── Grid Atlas ────────────────────────────────────────────────────
         Interconnection and grid-proximity intel for the site: nearest
         substations, transmission lines, generating plants, EIA data. Run
         during screening, before anybody scores anything.

         Kept as its own block rather than folded into `viability` because it
         is a DIFFERENT KIND OF THING: viability is a judgement, this is a
         measurement. The measurement feeds the judgement — it becomes the
         interconnection criterion and travels in the payload sent to OGI —
         but a substation 1.1 km away is a fact that does not change when
         somebody re-scores the deal. */
      grid: {
        score:       num((d.grid||{}).score),
        ranAt:       (d.grid||{}).ranAt || null,
        ranBy:       (d.grid||{}).ranBy || '',
        source:      (d.grid||{}).source || '',
        lat:         num((d.grid||{}).lat),
        lng:         num((d.grid||{}).lng),
        resolvedAddress: (d.grid||{}).resolvedAddress || '',
        geocode:     (d.grid||{}).geocode || null,
        substations: Array.isArray((d.grid||{}).substations) ? (d.grid||{}).substations : [],
        lines:       Array.isArray((d.grid||{}).lines) ? (d.grid||{}).lines : [],
        plants:      Array.isArray((d.grid||{}).plants) ? (d.grid||{}).plants : [],
        findings:    Array.isArray((d.grid||{}).findings) ? (d.grid||{}).findings : [],
        summary:     (d.grid||{}).summary || '',
        raw:         (d.grid||{}).raw || null
      },

      /* ── Design handoff ────────────────────────────────────────────────
         Pre-development is where the project actually gets built: the site map
         drawn, the equipment laid out, and the price falls out of it. That is a
         handoff to a named team with a round trip, not a single flag.

         Tracked separately from `assignment` because a design has a state of
         its own — sent, in progress, returned, being revised — and folding it
         into stage would mean a deal in pre-development could not express
         "drawn once, sent back for changes". */
      design: {
        status:     (d.design||{}).status || 'not_started',
        team:       Array.isArray((d.design||{}).team) ? (d.design||{}).team : [],
        lead:       String((d.design||{}).lead || '').toLowerCase(),
        sentAt:     (d.design||{}).sentAt || null,
        dueAt:      (d.design||{}).dueAt || null,
        returnedAt: (d.design||{}).returnedAt || null,
        rounds:     num((d.design||{}).rounds) || 0,
        brief:      (d.design||{}).brief || '',
        note:       (d.design||{}).note || ''
      },

      /* ── Assignment ────────────────────────────────────────────────────
         A DIFFERENT AXIS FROM STAGE, and merging the two is the mistake this
         block exists to avoid: a deal in pre_dev may have design finished and
         permitting stalled, and a deal in permitting may have design not
         started. Assignees resolve against omega_staff \u2014 this deliberately
         does not keep a second roster. */
      assignment: {
        /* The rep who works screening. Distinct from the design and dev leads:
           screening happens before anybody draws anything, and the person who
           qualifies a site is usually not the person who designs it. */
        rep:        String(as.rep || '').toLowerCase(),
        designLead: String(as.designLead || '').toLowerCase(),
        devLead:    String(as.devLead || '').toLowerCase(),
        reviewers:  Array.isArray(as.reviewers) ? as.reviewers : [],
        dueAt:      as.dueAt || null,
        assignedAt: as.assignedAt || null,
        assignedBy: as.assignedBy || '',
        notes:      as.notes || ''
      },

      /* ── Where this deal already lives ─────────────────────────────────
         Ids, not copies. The spine references; it does not duplicate. */
      intakeId:      d.intakeId || '',
      projectId:     d.projectId || '',
      finProjectId:  d.finProjectId || '',
      adoptedFrom:   d.adoptedFrom || '',
      adoptedAt:     d.adoptedAt || null,
      importBatch:   d.importBatch || '',

      /* ── The CRM seam ──────────────────────────────────────────────────
         Empty until you sync. It exists now so that when you do, the mapping
         already has a home and you are never matching on site name \u2014 which
         is exactly how duplicate CRM records get created. See PLATFORM.md \u00a7 4. */
      externalIds: d.externalIds || {},

      preDev: {
        budgetUsd: num(pd.budgetUsd),
        spentUsd:  num(pd.spentUsd),
        startedAt: pd.startedAt || null,
        owner:     pd.owner || ''
      },

      verification: {
        verdictId:   d.verification && d.verification.verdictId || '',
        verifierOrg: d.verification && d.verification.verifierOrg || '',
        feasibility: d.verification && d.verification.feasibility || '',
        bankability: d.verification && d.verification.bankability || '',
        signedAt:    d.verification && d.verification.signedAt || null
      },

      /* ── Money ─────────────────────────────────────────────────────────── */
      funding: {
        requestedUsd: num(f.requestedUsd),
        committedUsd: num(f.committedUsd),
        closedUsd:    num(f.closedUsd),
        counterparty: f.counterparty || '',
        investorOrg:  String(f.investorOrg || '').toLowerCase(),
        structure:    f.structure || '',
        /* Which capital partner, and their own release schedule instantiated
           onto this deal. Stored per deal rather than read from config at
           render time, because a partner changing their standard schedule
           must not silently rewrite the terms of a deal that already closed. */
        partnerKey:   f.partnerKey || '',
        stages:       Array.isArray(f.stages) ? f.stages : [],
        listedAt:     f.listedAt || null,
        committedAt:  f.committedAt || null,
        closedAt:     f.closedAt || null,
        draws:        Array.isArray(f.draws) ? f.draws : []
      },

      build: {
        ntpAt:  b.ntpAt || null,
        codAt:  b.codAt || null,
        epcOrg: String(b.epcOrg || '').toLowerCase(),
        note:   b.note || ''
      },

      bom:       Array.isArray(d.bom) ? d.bom : [],
      /* Links to where the real files live — see config.js § linkKinds for
         why these are links rather than uploads. */
      links:     Array.isArray(d.links) ? d.links : [],
      /* Prescreen: the fast, pre-scoring look. Separate from `viability`
         because they answer different questions — prescreen asks "is this
         worth an hour of somebody's time", scoring asks "is this worth
         money". Collapsing them means either screening everything slowly or
         spending on things nobody looked at. */
      /* `source` distinguishes a Grid Atlas prescreen from one a person did,
         which is what lets the automatic one refresh itself without ever
         overwriting a human judgement. */
      prescreen: d.prescreen || null,
      notes:     Array.isArray(d.notes) ? d.notes : [],
      activity:  Array.isArray(d.activity) ? d.activity : [],

      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
      _raw:      d,
      _demo:     !!d._demo
    };
  }


  /* ── Derived money ───────────────────────────────────────────────────────
     § FUNDING — FIVE NUMBERS AND WHY NONE OF THEM COLLAPSE

       requested   what we asked the market for. A hope with a decimal point.
       committed   a term sheet is signed. Real, revocable, not cash.
       closed      financial close. Legally committed capital.
       drawn       actually disbursed. Sum of funded draws.
       deployed    spent on the asset. Sum of committed BOM lines + pre-dev.

     People merge `committed` and `closed` because both feel like a yes, and
     merge `closed` and `drawn` because both feel like money. Both merges hide
     the two failure modes that matter: capital that was promised and never
     closed, and capital that closed and is sitting undrawn while a partner
     waits to be paid.

     drawn and deployed are computed, never stored. A stored total that
     disagrees with the lines under it is worse than no total at all.       */
  function drawnUsd(deal) {
    var t = 0, dr = deal.funding.draws;
    for (var i=0;i<dr.length;i++)
      if (dr[i] && dr[i].status === 'funded') t += num(dr[i].amountUsd) || 0;
    return t;
  }
  function requestedDrawUsd(deal) {
    var t = 0, dr = deal.funding.draws;
    for (var i=0;i<dr.length;i++)
      if (dr[i] && (dr[i].status === 'requested' || dr[i].status === 'approved'))
        t += num(dr[i].amountUsd) || 0;
    return t;
  }
  function bomTotalUsd(deal, opts) {
    opts = opts || {};
    var t = 0;
    for (var i=0;i<deal.bom.length;i++) {
      var l = deal.bom[i];
      if (!l) continue;
      if (opts.committedOnly && !bomStatusOf(l.status).committed) continue;
      if (opts.supplierOrg && String(l.supplierOrg||'').toLowerCase() !== opts.supplierOrg) continue;
      if (opts.category && l.category !== opts.category) continue;
      t += lineTotal(l);
    }
    return t;
  }
  function lineTotal(l) {
    var q = num(l.qty), u = num(l.unitCostUsd);
    if (q != null && u != null) return q * u;
    return num(l.totalUsd) || 0;
  }
  function deployedUsd(deal) {
    return bomTotalUsd(deal, { committedOnly:true }) + (deal.preDev.spentUsd || 0);
  }
  function undrawnUsd(deal) {
    var c = deal.funding.closedUsd;
    return c == null ? null : Math.max(0, c - drawnUsd(deal));
  }

  /* ── Cycle times ─────────────────────────────────────────────────────────
     Measured from the stage history, which is why advance() writes it even
     when nothing else changed. Referral-to-close is the number a partner asks
     about on every call. */
  function enteredAt(deal, stageKey) {
    var h = deal.stageHistory;
    for (var i=0;i<h.length;i++) if (h[i] && h[i].to === stageKey) return h[i].at;
    if (stageKey === 'referred') return deal.origination.referredAt || deal.createdAt;
    return null;
  }
  function daysToFund(deal) {
    return days(deal.origination.referredAt || deal.createdAt, deal.funding.closedAt);
  }
  function ageDays(deal) {
    var start = deal.origination.referredAt || deal.createdAt;
    var end = isExit(deal.stage) ? (deal.deadAt || deal.updatedAt) : Date.now();
    return days(start, end);
  }


  /* ── Firestore ──────────────────────────────────────────────────────────── */
  var _db = null, _me = null, _deals = [];

  function init(db, me) { _db = db; _me = me || null; }

  function visibleQuery() {
    var col = _db.collection(COLLECTION);
    var A = global.OmegaAccess;
    if (!A || !A.me()) return null;
    if (A.can('see_all')) return col;
    if (A.can('see_scoped')) {
      var scope = A.me().manageOrgs;
      if (!scope.length) return col.where('origination.partnerOrg','==',A.me().orgId);
      /* Firestore caps `in` at 10. Beyond that, scope the read at the rules
         and filter here — slower, but a limited admin with eleven orgs is a
         real configuration and a silently truncated query is not an option. */
      return scope.length <= 10
        ? col.where('origination.partnerOrg','in',scope)
        : col;
    }
    /* Everyone else sees deals their own org touched. `originators` is a flat
       array maintained on write precisely so this is one indexed query rather
       than three unions the client has to merge. */
    return col.where('orgsInvolved','array-contains', A.me().orgId);
  }

  function loadDeals() {
    if (!_db) return Promise.resolve([]);
    var q = visibleQuery();
    if (!q) return Promise.resolve([]);
    return q.get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(normalize(d.id, d.data() || {})); });
      /* Client-side narrowing for the >10 limited-admin case above. */
      var A = global.OmegaAccess;
      if (A && A.can('see_scoped') && A.me().manageOrgs.length > 10) {
        var s = A.me().manageOrgs;
        out = out.filter(function (x) { return s.indexOf(x.origination.partnerOrg) >= 0; });
      }
      out.sort(function (a,b) { return stageOf(b.stage).rank - stageOf(a.stage).rank; });
      _deals = out;
      return out;
    });
  }
  function deals() { return _deals.slice(); }

  function entry(type, message) {
    return { ts:stamp(), type:type, message:message,
             actor:_me ? (_me.name || _me.email) : '', actorEmail:_me ? _me.email : '' };
  }

  /* Every org that touches the deal, flattened on write so the member-level
     read above is one indexed query. Derived, never hand-edited. */
  function orgsInvolved(deal) {
    var s = {};
    if (deal.origination.partnerOrg) s[deal.origination.partnerOrg] = 1;
    if (deal.clientOrgId)            s[deal.clientOrgId] = 1;
    if (deal.funding.investorOrg)    s[deal.funding.investorOrg] = 1;
    if (deal.build.epcOrg)           s[deal.build.epcOrg] = 1;
    (deal.participants||[]).forEach(function (p) { if (p && p.orgId) s[String(p.orgId).toLowerCase()] = 1; });
    (deal.bom||[]).forEach(function (l) { if (l && l.supplierOrg) s[String(l.supplierOrg).toLowerCase()] = 1; });
    (deal.verificationIds||[]).length && (s[deal.verification.verifierOrg] = 1);
    delete s['']; delete s[undefined];
    return Object.keys(s);
  }

  function patch(deal, fields, note) {
    if (!_db) return Promise.reject(new Error('Not connected.'));
    var body = {};
    for (var k in fields) if (fields.hasOwnProperty(k)) body[k] = fields[k];
    body.updatedAt = stamp();
    if (note) body.activity = firebase.firestore.FieldValue.arrayUnion(entry(note.type, note.message));
    return _db.collection(COLLECTION).doc(deal.id).update(body);
  }


  /* ── Creating a deal ─────────────────────────────────────────────────────
     A deal cannot be created without an originating org. That is the only
     required field and it is required for the reason at the top of this file:
     attribution added later is attribution somebody negotiated.            */
  function create(fields) {
    if (!_db) return Promise.reject(new Error('Not connected.'));
    if (!fields.partnerOrg)
      return Promise.reject(new Error('Say who brought this deal. It cannot be added later '
        + 'without an owner\u2019s approval \u2014 attribution assigned after the fact is '
        + 'attribution somebody argued for.'));

    var doc = {
      schemaVersion: 1,
      name:      fields.name || 'Untitled site',
      address:   fields.address || '',
      state:     fields.state || '',
      clientOrgId: String(fields.clientOrgId || '').toLowerCase(),
      intakeId:  fields.intakeId || '',
      projectId: fields.projectId || '',
      verificationIds: [],

      origination: {
        partnerOrg:   String(fields.partnerOrg).toLowerCase(),
        partnerName:  fields.partnerName || '',
        contactName:  fields.contactName || '',
        contactEmail: String(fields.contactEmail || '').toLowerCase(),
        referredAt:   fields.referredAt || stamp(),
        channel:      fields.channel || '',
        agreementRef: fields.agreementRef || '',
        feeBasis:     fields.feeBasis || '',
        feeUsd:       num(fields.feeUsd),
        locked:       false
      },
      originationHistory: [],
      participants: [],

      stage: 'referred',
      stageHistory: [{ at:stamp(), from:'', to:'referred',
                       by:_me ? _me.email : '', note:'Referred by ' + (fields.partnerName || fields.partnerOrg) }],

      categories: fields.categories || [],
      sizeMw:   num(fields.sizeMw),
      sizeMwh:  num(fields.sizeMwh),
      capexUsd: num(fields.capexUsd),

      preDev:  { budgetUsd:null, spentUsd:0, startedAt:null, owner:'' },
      verification: { verdictId:'', verifierOrg:'', feasibility:'', bankability:'', signedAt:null },
      funding: { requestedUsd:num(fields.requestedUsd), committedUsd:null, closedUsd:null,
                 counterparty:'', investorOrg:'', structure:'',
                 listedAt:null, committedAt:null, closedAt:null, draws:[] },
      build:   { ntpAt:null, codAt:null, epcOrg:'', note:'' },

      bom: [], notes: [],
      activity: [entry('created', 'Deal created. Referred by '
                  + (fields.partnerName || fields.partnerOrg) + '.')],
      orgsInvolved: [String(fields.partnerOrg).toLowerCase(),
                     String(fields.clientOrgId||'').toLowerCase()].filter(Boolean),
      createdAt: stamp(), updatedAt: stamp()
    };
    return _db.collection(COLLECTION).add(doc);
  }


  /* ── Advancing ───────────────────────────────────────────────────────────
     Refuses without the evidence the target stage names, and returns the
     missing field names so the form can point at them. This is the gate; the
     stage list is just labels without it.

     Advancing out of `referred` LOCKS attribution. That moment is chosen
     deliberately: before it, a mis-keyed partner is a typo; after it, real
     work has been done on the strength of who brought it.                  */
  function missingFor(deal, targetKey) {
    var st = find(STAGES, targetKey);
    if (!st) return [];
    var out = [];
    for (var i=0;i<st.needs.length;i++) {
      var v = dig(deal, st.needs[i]);
      if (v == null || v === '' || (typeof v === 'number' && !isFinite(v)))
        out.push(st.needs[i]);
    }
    /* A computed condition, for gates a field-presence check cannot express.
       `qualified` is the only one today: the score has to EXIST and to PASS,
       and "a number is present" is not the same claim. Returned in the same
       list so the caller has one thing to check. */
    if (st.check && !out.length) {
      var msg = st.check(deal);
      if (msg) out.push('!' + msg);
    }
    return out;
  }

  function canAdvance(deal, targetKey) {
    return { missing: missingFor(deal, targetKey), stage: find(STAGES, targetKey) };
  }

  function advance(deal, targetKey, note) {
    var st = find(STAGES, targetKey);
    if (!st) return Promise.reject(new Error('Unknown stage.'));
    var missing = missingFor(deal, targetKey);
    if (missing.length) return Promise.reject({ missing:missing, stage:st });

    var fields = {
      stage: targetKey,
      stageHistory: firebase.firestore.FieldValue.arrayUnion({
        at:stamp(), from:deal.stage, to:targetKey,
        by:_me ? _me.email : '', note:note || '' }),
      orgsInvolved: orgsInvolved(deal)
    };
    /* The lock. One-way from here without an owner. */
    if (deal.stage === 'referred' && !deal.origination.locked) {
      fields['origination.locked']   = true;
      fields['origination.lockedAt'] = stamp();
    }
    if (targetKey === 'marketplace' && !deal.funding.listedAt) fields['funding.listedAt'] = stamp();

    return patch(deal, fields,
      { type:'stage', message:'Moved to ' + st.label + (note ? ' \u2014 ' + note : '') });
  }

  function markDead(deal, reason, note) {
    if (!reason) return Promise.reject(new Error(
      'A dead deal needs a reason. It is what makes the partner report worth reading \u2014 '
      + 'twelve sites lost to interconnection cost is a finding, twelve blanks is not.'));
    return patch(deal, {
      stage:'dead', deadReason:reason, deadAt:stamp(),
      stageHistory: firebase.firestore.FieldValue.arrayUnion({
        at:stamp(), from:deal.stage, to:'dead', by:_me?_me.email:'', note:reason })
    }, { type:'stage', message:'Dead \u2014 ' + reason + (note ? ': ' + note : '') });
  }

  /* Discarding. Reversible, logged, and it does NOT delete — the record stays
     readable so "where did that go" always has an answer. */
  function discard(deal, reason, note) {
    if (!reason) return Promise.reject(new Error(
      'Say why this was never a real deal. The reason is what stops "discarded" '
      + 'becoming a bin for anything inconvenient.'));
    return patch(deal, {
      stage:'discarded', discardReason:reason, discardedAt:stamp(),
      discardedBy:_me ? _me.email : '',
      stageHistory: firebase.firestore.FieldValue.arrayUnion({
        at:stamp(), from:deal.stage, to:'discarded', by:_me?_me.email:'', note:reason })
    }, { type:'stage', message:'Discarded \u2014 ' + reason + (note ? ': ' + note : '')
            + ' (excluded from all counts)' });
  }
  function restore(deal, toStage) {
    return patch(deal, {
      stage: toStage || 'referred', discardReason:'', discardedAt:null,
      stageHistory: firebase.firestore.FieldValue.arrayUnion({
        at:stamp(), from:'discarded', to:toStage||'referred',
        by:_me?_me.email:'', note:'Restored' })
    }, { type:'stage', message:'Restored from discarded' });
  }

  /* ── Permanent deletion ──────────────────────────────────────────────────
     Owner only, and ONLY on a record already discarded. Two steps on purpose:
     discarding is the reversible act that removes it from your numbers, and
     that is what people actually want 95% of the time. Deletion is for the
     other 5% — genuine test data you never want to see again.

     The rules enforce both halves independently, so a client that skipped the
     discard step is refused rather than trusted. */
  function destroy(deal) {
    if (!_db) return Promise.reject(new Error('Not connected.'));
    if (deal.stage !== 'discarded')
      return Promise.reject(new Error(
        'Discard it first. Deletion is deliberately two steps — discarding already '
        + 'removes it from every count and can be undone, which is what is usually wanted.'));
    return _db.collection(COLLECTION).doc(deal.id)['delete']();
  }

  /* Score came back under the threshold. Not dead \u2014 something needs changing. */
  function toReevaluate(deal, reason) {
    return patch(deal, {
      stage:'reevaluate', reevaluateReason: reason || '',
      stageHistory: firebase.firestore.FieldValue.arrayUnion({
        at:stamp(), from:deal.stage, to:'reevaluate', by:_me?_me.email:'',
        note:reason || '' })
    }, { type:'stage', message:'Moved to re-evaluate' + (reason ? ' \u2014 ' + reason : '') });
  }

  function park(deal, note) {
    return patch(deal, {
      stage:'parked',
      stageHistory: firebase.firestore.FieldValue.arrayUnion({
        at:stamp(), from:deal.stage, to:'parked', by:_me?_me.email:'', note:note||'' })
    }, { type:'stage', message:'Parked' + (note ? ' \u2014 ' + note : '') });
  }


  /* ── Reattribution ───────────────────────────────────────────────────────
     Owner only, reason required, previous value preserved. This is the escape
     hatch for a genuine mistake, and it is deliberately narrow: an editable
     attribution field is not a fact, and every party to the deal knows it. */
  function reattribute(deal, partnerOrg, partnerName, reason) {
    var A = global.OmegaAccess;
    if (!A || !A.can('lock_attribution'))
      return Promise.reject(new Error('Only an owner or administrator can change attribution.'));
    if (!reason)
      return Promise.reject(new Error('Reattribution needs a written reason. It is kept '
        + 'permanently and the previous partner stays in the record.'));

    var prev = {};
    for (var k in deal.origination) if (deal.origination.hasOwnProperty(k)) prev[k] = deal.origination[k];
    prev.changedAt = stamp();
    prev.changedBy = _me ? _me.email : '';
    prev.reason    = reason;

    return patch(deal, {
      'origination.partnerOrg':  String(partnerOrg).toLowerCase(),
      'origination.partnerName': partnerName || '',
      originationHistory: firebase.firestore.FieldValue.arrayUnion(prev),
      orgsInvolved: orgsInvolved(deal).concat([String(partnerOrg).toLowerCase()])
    }, { type:'attribution',
         message:'Attribution changed from ' + (deal.origination.partnerName || deal.origination.partnerOrg)
               + ' to ' + (partnerName || partnerOrg) + ' \u2014 ' + reason });
  }

  function addParticipant(deal, orgId, orgName, role, note) {
    if (!orgId || !role) return Promise.reject(new Error('Pick an organisation and a role.'));
    var p = { orgId:String(orgId).toLowerCase(), orgName:orgName||'', role:role,
              note:note||'', addedAt:stamp(), addedBy:_me?_me.email:'' };
    return patch(deal, {
      participants: firebase.firestore.FieldValue.arrayUnion(p),
      orgsInvolved: orgsInvolved(deal).concat([p.orgId])
    }, { type:'participant', message:(orgName||orgId) + ' added as ' + roleOf(role).label });
  }
  function removeParticipant(deal, p) {
    return patch(deal, { participants: firebase.firestore.FieldValue.arrayRemove(p) },
      { type:'participant', message:'Removed ' + (p.orgName||p.orgId) });
  }


  /* ── Funding ─────────────────────────────────────────────────────────────
     Setting closedUsd does NOT advance the stage on its own. Two separate
     acts, deliberately: entering a number is bookkeeping, declaring close is a
     decision, and auto-advancing on a typo would mark a deal funded in every
     report before anyone noticed.                                          */
  function setFunding(deal, f) {
    var fields = {};
    ['requestedUsd','committedUsd','closedUsd'].forEach(function (k) {
      if (f[k] !== undefined) fields['funding.' + k] = num(f[k]);
    });
    ['counterparty','structure'].forEach(function (k) {
      if (f[k] !== undefined) fields['funding.' + k] = f[k] || '';
    });
    if (f.investorOrg !== undefined) fields['funding.investorOrg'] = String(f.investorOrg||'').toLowerCase();
    ['committedAt','closedAt'].forEach(function (k) {
      if (f[k] !== undefined) fields['funding.' + k] = f[k] || null;
    });
    fields.orgsInvolved = orgsInvolved(deal);
    return patch(deal, fields, { type:'funding', message:'Funding updated.' });
  }

  function addDraw(deal, draw) {
    var amt = num(draw.amountUsd);
    if (!amt) return Promise.reject(new Error('A draw needs an amount.'));
    if (!draw.purpose) return Promise.reject(new Error(
      'A draw needs a purpose. "Where did the money go" is the question this whole '
      + 'section exists to answer, and it cannot be reconstructed later.'));

    var closed = deal.funding.closedUsd;
    if (closed != null && drawnUsd(deal) + requestedDrawUsd(deal) + amt > closed) {
      /* A warning, not a refusal — over-drawing against a facility does happen
         and is exactly the thing you want visible rather than blocked and
         then recorded somewhere else. */
      draw.overCommitted = true;
    }
    var d = {
      id: 'dr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      no: (deal.funding.draws.length + 1),
      amountUsd: amt, purpose: draw.purpose, category: draw.category || 'other',
      status: draw.status || 'requested',
      requestedAt: stamp(), approvedAt: null, fundedAt: null,
      overCommitted: !!draw.overCommitted,
      by: _me ? _me.email : ''
    };
    return patch(deal, { 'funding.draws': firebase.firestore.FieldValue.arrayUnion(d) },
      { type:'draw', message:'Draw ' + d.no + ' requested: ' + money(amt) + ' \u2014 ' + d.purpose });
  }

  function setDrawStatus(deal, draw, status) {
    var next = deal.funding.draws.map(function (x) {
      if (!x || x.id !== draw.id) return x;
      var c = {}; for (var k in x) c[k] = x[k];
      c.status = status;
      if (status === 'approved' && !c.approvedAt) c.approvedAt = stamp();
      if (status === 'funded')  { c.fundedAt = stamp(); if (!c.approvedAt) c.approvedAt = stamp(); }
      return c;
    });
    return patch(deal, { 'funding.draws': next },
      { type:'draw', message:'Draw ' + draw.no + ' ' + drawStatusOf(status).label.toLowerCase()
                           + ' (' + money(draw.amountUsd) + ')' });
  }


  /* ── BOM ─────────────────────────────────────────────────────────────────
     Every line can carry a supplierOrg, and that is the loop that closes the
     partner story: the manufacturer who referred the site sees the purchase
     order it produced, in the same portfolio view as the referral.

     A line with no supplier is fine and common. A line with a supplier who is
     not a partner is also fine — orgsInvolved picks it up and they simply have
     no login.                                                              */
  function addBomLine(deal, line) {
    if (!line.item) return Promise.reject(new Error('Name the item.'));
    var l = {
      id: 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      category:   line.category || 'other',
      item:       line.item,
      spec:       line.spec || '',
      supplierOrg:String(line.supplierOrg || '').toLowerCase(),
      supplierName:line.supplierName || '',
      qty:        num(line.qty),
      unit:       line.unit || 'ea',
      unitCostUsd:num(line.unitCostUsd),
      status:     line.status || 'specified',
      poRef:      line.poRef || '',
      addedAt:    stamp(), addedBy:_me?_me.email:''
    };
    return patch(deal, {
      bom: firebase.firestore.FieldValue.arrayUnion(l),
      orgsInvolved: orgsInvolved(deal).concat(l.supplierOrg ? [l.supplierOrg] : [])
    }, { type:'bom', message:'BOM: ' + l.item + ' \u2014 ' + money(lineTotal(l))
                           + (l.supplierName ? ' (' + l.supplierName + ')' : '') });
  }
  function setBomStatus(deal, line, status) {
    var next = deal.bom.map(function (x) {
      if (!x || x.id !== line.id) return x;
      var c = {}; for (var k in x) c[k] = x[k];
      c.status = status;
      c[status + 'At'] = stamp();
      return c;
    });
    return patch(deal, { bom: next },
      { type:'bom', message:line.item + ' \u2192 ' + bomStatusOf(status).label.toLowerCase() });
  }
  function removeBomLine(deal, line) {
    return patch(deal, { bom: firebase.firestore.FieldValue.arrayRemove(line) },
      { type:'bom', message:'Removed ' + line.item });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ONE NEXT STEP
     ═══════════════════════════════════════════════════════════════════════
     The console shows everything a deal has at once, which is right for
     reading and wrong for working. At any given moment a deal has exactly one
     thing that should happen next, and burying it among eleven panels is what
     makes this feel complicated when the process itself is not.

     This returns that one thing. The drawer renders it at the top, the board
     puts it on the card, and everything else stays available underneath for
     when somebody actually wants it.

     `who` matters: half these steps are an administrator's and half are the
     assigned rep's, and "waiting on somebody else" is a legitimate answer that
     stops people hunting for an action that is not theirs. */
  function nextStep(deal) {
    /* `short` is what goes on a board card, `label` is what goes in the panel.
       The full sentence is right when it is the only instruction on screen and
       wrong on a 214px card, where it wraps to three lines and gets clipped.
       Defaults to the label so a step without one still renders. */
    var S = function (id, label, hint, who, action, short) {
      return { id:id, label:label, short:short || label, hint:hint,
               who:who || 'anyone', action:action || null };
    };

    if (deal.stage === 'discarded')
      return S('none','Discarded','Excluded from every count. Restore it if that was wrong.','—');
    if (deal.stage === 'dead')
      return S('none','Dead \u2014 ' + (deal.deadReason || 'no reason recorded'),
               'Stays in the denominators. Reopen if something changed.','—');
    if (deal.stage === 'parked')
      return S('none','Parked','Waiting on a trigger. Reopen when it fires.','—');

    if (deal.stage === 'reevaluate')
      return S('reevaluate','Fix something and re-score, or mark it dead',
        (deal.reevaluateReason || 'Scored below the threshold')
        + '. Change what the score was wrong about \u2014 usually a missing bill, '
        + 'meter count or load figure \u2014 then run it again.',
        'rep','doRescore','Re-score or close');

    if (deal.stage === 'referred')
      return S('assign_rep','Assign a rep to screen it',
        'A referral sits still until somebody owns it. This is the only thing '
        + 'standing between it and screening.','admin','doAssignRep','Assign a rep');

    if (deal.stage === 'screening') {
      if (!deal.assignment.rep)
        return S('assign_rep','Assign a rep','Nobody is working this.','admin','doAssignRep','Assign a rep');
      /* GRID ATLAS FIRST. It is the cheap measurement, and calling OGI on a
         site with no grid connection anywhere near it wastes their run and our
         money. */
      if (!deal.grid.ranAt)
        return S('grid','Run the address through Grid Atlas',
          'Checks substations, transmission and plants near the site. It is the fast '
          + 'filter \u2014 and it is what gets sent to OGI, so their answer is better for '
          + 'having it.','rep','doGridAtlas','Run Grid Atlas');

      if (deal.prescreen && deal.prescreen.verdict === 'fail')
        return S('grid_fail','Grid Atlas says the site is not reachable',
          (deal.prescreen.reason || '')
          + '. Either the address is wrong, or this is not worth an OGI run.',
          'rep','doPrescreen','Review it');

      if (deal.viability.score == null) {
        /* Names the partner rather than saying "the tool" \u2014 the person
           pressing it should know whose service they are spending. */
        var prov = skillProvider(skillFor(deal));
        var who  = prov ? prov.name : 'the screening tool';
        return S('score','Send it to ' + who + ' for screening',
          'Pushes the site notes, energy figures and documents to ' + who
          + ', then routes on the result: over the threshold goes to Qualified, '
          + 'under goes to Re-evaluate.',
          'rep','doAgentScore', prov ? 'Send to ' + prov.name : 'Run screening');
      }
      return S('advance','Move it to Qualified','It has a passing score.','rep','doAdvanceNext','Move to Qualified');
    }

    if (deal.stage === 'qualified')
      return S('predev','Move it to pre-development',
        'Qualified means it is worth spending on. Set an OSA budget when you know '
        + 'one \u2014 it is not required to start.','admin','doAdvanceNext',
        'Start pre-dev');

    if (deal.stage === 'pre_dev') {
      var dz = deal.design;
      /* THE DESIGN ROUND TRIP, step by step. Each of these is a real handoff
         with somebody waiting at the other end, so the console names who and
         what rather than collapsing it into "in pre-development". */
      if (!dz.team.length && !dz.lead)
        return S('design_assign','Assign the design team',
          'Pre-development is where the site map gets drawn, the equipment laid out '
          + 'and the price worked out. Name who is doing it before anything else.',
          'admin','doAssignDesign','Assign design');

      if (!deal.projectId)
        return S('design_open','Create it in the editor',
          'Creates the project in the client\u2019s workspace and opens the editor, so the '
          + 'finished drawing lands in their own portal with no export step.',
          'admin','doCreateProject','Open the editor');

      if (dz.status === 'not_started' || dz.status === 'in_design')
        return S('design_wait','Waiting on design',
          'With ' + (dz.lead || dz.team[0] || 'the design team')
          + (dz.dueAt ? ', due ' + fmtDate(dz.dueAt) : '')
          + '. Mark it returned once the drawing and the price come back.',
          'rep','doDesignReturned','Mark returned');

      if (deal.capexUsd == null)
        return S('capex','Record the price from the design',
          'The drawing is back. Bring its number onto the deal \u2014 until then the rest '
          + 'of the pipeline has nothing to work with.','rep','doDesignReturned',
          'Add the price');

      return S('advance','Move it forward','Design is back and priced.','rep','doAdvanceNext',
        'Move it forward');
    }

    if (deal.stage === 'permitting')
      return S('permits',
        (deal.permitting.applications || []).length ? 'Update the applications'
                                                    : 'Log the permit applications',
        'Permitting runs for months in parallel. Tracking each application is the '
        + 'only way to know what is actually blocking.','rep','doAddApp','Update permits');

    if (deal.stage === 'verified')
      return S('market','Push it to the marketplace',
        'It has a signed opinion. Capital can see it now.','admin','doPushMarketplace','List it');

    if (deal.stage === 'marketplace')
      return deal.finProjectId
        ? S('wait','Waiting on an offer',
            'Listed. The console checks the marketplace on every refresh and will '
            + 'tell you when something is accepted.','—')
        : S('market','List it on the marketplace',
            'The stage says marketplace but no listing exists.','admin','doPushMarketplace','List it');

    if (deal.stage === 'committed')
      return S('close','Record the financial close',
        'A term sheet is signed. Close is the event that turns this into a '
        + 'portfolio asset.','admin','doEditFunding','Record the close');

    if (deal.stage === 'funded')
      return (deal.funding.stages || []).length
        ? S('ntp','Issue notice to proceed','Money is committed. NTP starts the build.','admin','doAdvanceNext','Issue NTP')
        : S('schedule','Apply the release schedule',
            'Capital arrives against milestones, not in one payment.','admin','doApplySchedule','Apply schedule');

    if (deal.stage === 'construction')
      return S('build','Track the BOM and draws',
        'Building. Keep the purchase orders and releases current.','rep','doAddBom','Update the BOM');

    if (deal.stage === 'operating')
      return S('none','Operating','Nothing outstanding.','—');

    return S('none','\u2014','','—');
  }

  /* ── Project type ────────────────────────────────────────────────────────
     Setting the type also sets the technology categories it implies, so the
     BOM and the partner reporting stay consistent without anybody re-tagging.
     Categories the person added by hand are preserved — a type is a default,
     not an eraser. */
  function projectTypes() { return (cfg().portfolio || {}).projectTypes || []; }
  function typeOf(k) {
    var l = projectTypes();
    for (var i=0;i<l.length;i++) if (l[i].key === k) return l[i];
    return null;
  }
  function setProjectType(deal, key, extraCategories) {
    var t = typeOf(key);
    if (!t) return Promise.reject(new Error('Unknown project type.'));
    var cats = (t.categories || []).slice();
    (extraCategories || deal.categories || []).forEach(function (c) {
      if (cats.indexOf(c) < 0) cats.push(c);
    });
    return patch(deal, { projectType:key, categories:cats },
      { type:'edit', message:'Project type set to ' + t.label });
  }

  /* ── Prescreen ───────────────────────────────────────────────────────────
     The fast look, before anybody spends an hour on a full score. Four
     questions, a verdict, and a reason. It is deliberately NOT the viability
     score: prescreen asks whether this is worth looking at, scoring asks
     whether it is worth money, and a pipeline that only has the second one
     either screens everything slowly or spends on things nobody read. */
  function savePrescreen(deal, p) {
    var pass = p.verdict === 'pass';
    var rec = {
      verdict:   p.verdict || '',
      reason:    p.reason || '',
      fit:       p.fit || '',
      size:      p.size || '',
      offtake:   p.offtake || '',
      timing:    p.timing || '',
      by:        _me ? _me.email : '',
      at:        stamp()
    };
    return patch(deal, { prescreen: rec },
      { type:'prescreen', message:'Prescreen: ' + (rec.verdict || 'no verdict')
            + (rec.reason ? ' \u2014 ' + rec.reason : '') })
      .then(function () { return pass; });
  }

  /* ── Funding stages ──────────────────────────────────────────────────────
     Instantiates a capital partner's release schedule onto this deal, with
     each stage's amount computed from the closed facility. Copied rather than
     referenced on purpose: a partner revising their standard schedule must
     not silently rewrite the terms of a deal that already closed. */
  function financePartners() { return (cfg().portfolio || {}).financePartners || []; }
  function financePartnerOf(k) {
    var l = financePartners();
    for (var i=0;i<l.length;i++) if (l[i].key === k) return l[i];
    return null;
  }
  function applyFundingSchedule(deal, partnerKey, facilityUsd) {
    var fp = financePartnerOf(partnerKey);
    if (!fp) return Promise.reject(new Error('Unknown finance partner.'));
    var total = num(facilityUsd) != null ? num(facilityUsd) : deal.funding.closedUsd;
    var stages = (fp.stages || []).map(function (s) {
      return { key:s.key, label:s.label, pct:s.pct,
               amountUsd: total != null ? Math.round(total * (s.pct/100)) : null,
               status:'pending', releasedAt:null, drawId:'' };
    });
    return patch(deal, {
      'funding.partnerKey': partnerKey,
      'funding.counterparty': fp.name,
      'funding.stages': stages
    }, { type:'funding', message:fp.name + ' schedule applied \u2014 '
          + stages.length + ' release stages' });
  }

  /* Releasing a stage creates the DRAW, rather than just flipping a flag.
     Two records would drift; one record with a stage reference cannot. */
  function releaseStage(deal, stageKey) {
    var st = null;
    (deal.funding.stages || []).forEach(function (s) { if (s.key === stageKey) st = s; });
    if (!st) return Promise.reject(new Error('Unknown funding stage.'));
    if (st.status === 'released')
      return Promise.reject(new Error('That stage has already been released.'));

    var draw = {
      id: 'dr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      no: (deal.funding.draws.length + 1),
      amountUsd: st.amountUsd, purpose: st.label, category: 'stage',
      stageKey: stageKey, status:'requested',
      requestedAt: stamp(), approvedAt:null, fundedAt:null,
      by: _me ? _me.email : ''
    };
    var stages = (deal.funding.stages || []).map(function (s) {
      if (s.key !== stageKey) return s;
      var c = {}; for (var k in s) c[k] = s[k];
      c.status = 'requested'; c.drawId = draw.id;
      return c;
    });
    return patch(deal, {
      'funding.stages': stages,
      'funding.draws': firebase.firestore.FieldValue.arrayUnion(draw)
    }, { type:'draw', message:'Requested ' + st.label + ' \u2014 ' + money(st.amountUsd) });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VIABILITY SCORING — the gate into spend
     ═══════════════════════════════════════════════════════════════════════
     Two ways in, because you already have a tool and the console should not
     insist on being it:

       score(deal, criteria)   compute here from the weighted criteria in
                               config.js, showing the breakdown
       postScore(deal, {...})  accept a number computed anywhere else

     Both store the breakdown, the model version, who and when. A score with no
     breakdown cannot be argued with, and a gate nobody can argue with is a gate
     people route around rather than fix.

     APPEND-ONLY, same as a verification verdict. Re-scoring pushes the previous
     score into viabilityHistory with its date. The trajectory is the finding:
     a site that went 41 \u2192 78 after an interconnection study is a different
     story from one that scored 78 first time, and a single current number
     cannot tell them apart. */
  function criteriaSet() {
    return ((cfg().portfolio || {}).viability || {}).criteria || [];
  }
  function threshold() {
    var t = ((cfg().portfolio || {}).viability || {}).threshold;
    return t == null ? 60 : t;
  }

  /* values: { criterionKey: 0..10 }. Weighted to a 0..100 score. */
  function computeScore(values) {
    var cs = criteriaSet(), totalWeight = 0, earned = 0, rows = [];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      var raw = values[c.key];
      if (raw == null || raw === '') {
        /* An unscored criterion is NOT a zero. Scoring it zero silently
           punishes a site for a question nobody asked, which is how a
           weighted model quietly becomes a random one. It drops out of both
           sides of the fraction and is reported as unscored. */
        rows.push({ key:c.key, label:c.label, weight:c.weight, value:null, unscored:true });
        continue;
      }
      var v = Math.max(0, Math.min(10, Number(raw)));
      totalWeight += c.weight;
      earned += v * c.weight;
      rows.push({ key:c.key, label:c.label, weight:c.weight, value:v, unscored:false });
    }
    var score = totalWeight ? Math.round((earned / (totalWeight * 10)) * 100) : null;
    var scoredCount = rows.filter(function (r) { return !r.unscored; }).length;
    return {
      score: score,
      criteria: rows,
      coverage: cs.length ? scoredCount / cs.length : 0,
      unscored: rows.filter(function (r) { return r.unscored; }).length
    };
  }

  function saveScore(deal, computed, opts) {
    opts = opts || {};
    var th = opts.threshold != null ? num(opts.threshold) : threshold();
    var v = {
      score:     computed.score,
      threshold: th,
      verdict:   computed.score == null ? '' : (computed.score >= th ? 'pass' : 'fail'),
      model:     opts.model || ((cfg().portfolio || {}).viability || {}).model || 'default-v1',
      criteria:  computed.criteria || [],
      coverage:  computed.coverage != null ? computed.coverage : null,
      scoredBy:  _me ? _me.email : '',
      scoredAt:  stamp(),
      source:    opts.source || 'console',
      override:  ''
    };
    var fields = { viability: v };
    if (deal.viability && deal.viability.score != null) {
      var prev = {};
      for (var k in deal.viability) if (deal.viability.hasOwnProperty(k)) prev[k] = deal.viability[k];
      prev.supersededAt = stamp();
      fields.viabilityHistory = firebase.firestore.FieldValue.arrayUnion(prev);
    }
    return patch(deal, fields, { type:'viability',
      message:'Scored ' + (v.score == null ? 'incomplete' : v.score + '/100')
            + ' against a threshold of ' + th + ' \u2014 ' + (v.verdict || 'no verdict')
            + (computed.unscored ? ' (' + computed.unscored + ' criteria unscored)' : '') });
  }

  /* ── The partner's screening tool ────────────────────────────────────────
     Pushes the site to the partner's API, gets a score back, and routes on it:
     over the threshold goes to Qualified, under goes to Re-evaluate. The
     browser never holds the API key \u2014 /api/score.js does. */
  function scoringCfg()   { return (cfg().portfolio || {}).scoring || {}; }
  function scoringEnabled(){ return scoringCfg().enabled === true; }
  function skillFor(deal) { return (scoringCfg().skills || {})[deal.projectType] || null; }
  function skillLabel(k)  { return ((scoringCfg().labels || {})[k]) || k; }
  function skillAxis(k)   { return ((scoringCfg().axis || {})[k]) || ''; }
  /* Who runs the tool. Stamped onto the score so "who screened this" has an
     answer later, and so OGI's screening work shows up in their partner record
     next to anything they referred \u2014 two relationships with one company,
     counted separately, same as a manufacturer who refers and then supplies. */
  function skillProvider(k) { return ((scoringCfg().providers || {})[k]) || null; }

  /* Everything we know, in the shape AGENT-SPEC.md documents. Empty stays
     empty: the agent should treat a missing field as unknown rather than zero,
     and inventing defaults here would hide that a site is thin. */
  function scoringPayload(deal, skill) {
    var raw = deal._raw || {};
    return {
      dealId: deal.id, skill: skill, requestedAt: stamp(),
      requestedBy: _me ? _me.email : '',
      project: {
        name: deal.name, type: deal.projectType || '',
        categories: (deal.categories || []).slice(),
        address: deal.address || '', state: deal.state || '',
        sizeMw: deal.sizeMw, sizeMwh: deal.sizeMwh, capexUsd: deal.capexUsd,
        utility: raw.utility || '', ahj: raw.ahj || ''
      },
      /* The things we DO know at screening, which is the point: bills, meters
         and the site notes are often all anybody has before design. */
      /* OUR OWN GRID MEASUREMENT, sent across. OGI is scoring a site they have
         never visited; the substation distances and line voltages we already
         looked up are among the most useful things we can hand them, and
         withholding a measurement we already hold would make their answer
         worse for no reason. Null when it has not been run \u2014 absent, not
         zero, same rule as everything else in this payload. */
      grid: deal.grid && deal.grid.ranAt ? {
        score:       deal.grid.score,
        lat:         deal.grid.lat,
        lng:         deal.grid.lng,
        substations: deal.grid.substations,
        lines:       deal.grid.lines,
        plants:      deal.grid.plants,
        summary:     deal.grid.summary,
        ranAt:       deal.grid.ranAt
      } : null,

      site: {
        notes:         deal.siteNotes || '',
        monthlyBillUsd:deal.energy.monthlyBillUsd,
        annualKwh:     deal.energy.annualKwh,
        meters:        deal.energy.meters,
        loadKw:        deal.energy.loadKw
      },
      prescreen: deal.prescreen || null,
      commercial: {
        requestedUsd: deal.funding.requestedUsd,
        committedUsd: deal.funding.committedUsd,
        closedUsd:    deal.funding.closedUsd,
        counterparty: deal.funding.counterparty || ''
      },
      context: {
        stage: deal.stage, preDevBudgetUsd: deal.preDev.budgetUsd,
        referredBy: deal.origination.partnerOrg || '',
        permitting: { started: !!deal.permitting.startedAt,
                      applications: (deal.permitting.applications || []).length },
        links: (deal.links || []).map(function (l) {
          return { kind:l.kind, label:l.label, url:l.url }; })
      }
    };
  }

  /* ── Grid Atlas onto the deal ────────────────────────────────────────────
     Written here rather than by the adapter so it goes through patch() like
     everything else: same rules, same activity line, same history.

     GRID ATLAS IS THE PRESCREEN. Its score measures the thing that kills the
     most sites earliest \u2014 whether the grid is reachable \u2014 so a verdict
     derived from it replaces four questions somebody answered from memory with
     a measurement anybody can check. */
  function gridPrescreen(g) {
    var GA = global.GridAtlasAdapter;
    /* NO SCORE, NO VERDICT. A null score means nothing was measured, and
       writing "fail" from an absent measurement is exactly the failure that
       marked a workable NJ site as not viable. */
    if (!GA || g.score == null) return null;
    return {
      verdict: GA.prescreenVerdict(g),
      reason:  (g.summary || 'Grid Atlas') + ' \u2014 scored ' + g.score
             + ' against a bar of ' + GA.prescreenThreshold(),
      fit:'', size:'', offtake:'', timing:'',
      source:  'grid-atlas',
      by:      _me ? _me.email : '',
      at:      stamp()
    };
  }

  function saveGrid(deal, g) {
    var fields = { grid: g };
    /* Only writes a prescreen if nobody has done one BY HAND. Somebody who
       looked at the site and formed a view outranks a distance measurement,
       and silently overwriting them would be the console deciding it knows
       better than the person who went there. */
    var pre = gridPrescreen(g);
    if (pre && (!deal.prescreen || deal.prescreen.source === 'grid-atlas'))
      fields.prescreen = pre;
    return patch(deal, fields, { type:'grid',
      message:'Grid Atlas run' + (g.score != null ? ' \u2014 ' + g.score + '/100' : '')
        + (pre ? ', prescreen ' + pre.verdict : '')
        + (g.substations && g.substations.length && g.substations[0].distanceKm != null
           ? ', nearest substation ' + g.substations[0].distanceKm + ' km' : '') });
  }

  function requestScore(deal, onState) {
    var skill = skillFor(deal);
    if (!skill) return Promise.reject(new Error(
      'No screening tool is mapped to ' + ((typeOf(deal.projectType) || {}).label
      || 'this project type') + '. Score it by hand, or add the mapping in '
      + 'config.js under portfolio.scoring.skills.'));
    if (!scoringEnabled()) return Promise.reject(new Error(
      'Partner screening is switched off. Set portfolio.scoring.enabled once the '
      + 'endpoint is confirmed.'));

    if (onState) onState('sending');
    return fetch(scoringCfg().relayUrl || '/api/score', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(scoringPayload(deal, skill))
    }).then(function (r) {
      return r.json()['catch'](function () { return null; }).then(function (j) {
        if (!r.ok) throw new Error((j && (j.error || j.detail))
          || ('The screening tool returned ' + r.status));
        return j;
      });
    }).then(function (out) {
      if (onState) onState('saving');
      return saveScore(deal, {
        score: out.score,
        criteria: (out.criteria || []).map(function (c) {
          return { key:c.key, label:c.label || c.key, weight:c.weight,
                   value: c.unscored ? null : c.value,
                   unscored: !!c.unscored, note:c.note || '' }; }),
        coverage: null,
        unscored: (out.criteria || []).filter(function (c) { return c.unscored; }).length
      }, { model: out.model, source: skill, threshold: out.threshold })
      .then(function () {
        var extra = { 'viability.axis': skillAxis(skill) };
        if ((out.findings || []).length)  extra['viability.findings']  = out.findings;
        if ((out.pathToNtp || []).length) extra['viability.pathToNtp'] = out.pathToNtp;
        if (out.summary)                  extra['viability.summary']   = out.summary;
        if (out.verdict)                  extra['viability.agentVerdict'] = out.verdict;
        return patch(deal, extra, null);
      })
      .then(function () { return out; });
    });
  }

  /* ── Routing on the result ───────────────────────────────────────────────
     Over the threshold advances to Qualified; under moves to Re-evaluate.

     THE ADVANCE STILL GOES THROUGH THE GATE. If Qualified needs something the
     deal has not got, it is reported rather than forced \u2014 an automatic move
     that bypasses its own gate is just a gate that does not exist. */
  function routeOnScore(deal, out) {
    var th = out.threshold != null ? num(out.threshold) : threshold();
    var passed = out.score != null && out.score >= th;
    /* Re-read: saveScore has changed the document under us and the local copy
       is stale, so the gate would be checked against the old score. */
    return _db.collection(COLLECTION).doc(deal.id).get().then(function (snap) {
      var fresh = normalize(deal.id, snap.data() || {});
      if (!passed) {
        return toReevaluate(fresh, 'Scored ' + out.score + ', below ' + th)
          .then(function () { return { passed:false, score:out.score, threshold:th }; });
      }
      return advance(fresh, 'qualified', 'Passed screening at ' + out.score + '/' + th)
        .then(function () { return { passed:true, score:out.score, threshold:th }; })
        ['catch'](function (e) {
          return { passed:true, score:out.score, threshold:th, gateIssue:e };
        });
    });
  }

  /* A score from your own tool. Same storage, same gate, `source` records
     where it came from so a model change can be traced later. */
  function postScore(deal, payload) {
    var s = num(payload.score);
    if (s == null) return Promise.reject(new Error('A score is required.'));
    return saveScore(deal, {
      score: s,
      criteria: Array.isArray(payload.criteria) ? payload.criteria : [],
      coverage: null, unscored: 0
    }, { model: payload.model || 'external', source: payload.source || 'external',
         threshold: payload.threshold });
  }

  /* Advancing a failing deal anyway. Allowed, because a model that can never
     be overruled is a model nobody trusts with real decisions \u2014 but it takes
     a written reason, it is logged, and the failing score stays on the record
     rather than being quietly re-run until it passes. */
  function overrideViability(deal, reason) {
    if (!reason) return Promise.reject(new Error(
      'An override needs a written reason. The failing score stays on the record either way \u2014 '
      + 'what the reason adds is why you went anyway.'));
    return patch(deal, { 'viability.verdict':'pass', 'viability.override':reason },
      { type:'viability', message:'Viability overridden: ' + reason });
  }


  /* ── Permitting ─────────────────────────────────────────────────────────
     Applications are their own list because they run in parallel, take months,
     and each has its own counterparty. A single "permitting: in progress" flag
     tells you nothing you can chase. */
  function startPermitting(deal, fields) {
    return patch(deal, {
      'permitting.startedAt': fields.startedAt || stamp(),
      'permitting.ahj':       fields.ahj || deal.ahj || '',
      'permitting.utility':   fields.utility || '',
      'permitting.owner':     fields.owner || ''
    }, { type:'permitting', message:'Permitting opened.' });
  }
  function addApplication(deal, app) {
    if (!app.type) return Promise.reject(new Error('What kind of application?'));
    var a = {
      id: 'ap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      type: app.type, authority: app.authority || '', ref: app.ref || '',
      status: app.status || 'preparing',
      submittedAt: app.submittedAt || null, approvedAt: null,
      note: app.note || '', addedBy: _me ? _me.email : '', addedAt: stamp()
    };
    return patch(deal, {
      permitting: Object.assign({}, deal.permitting, {
        startedAt: deal.permitting.startedAt || stamp(),
        applications: (deal.permitting.applications || []).concat([a])
      })
    }, { type:'permitting', message:'Application added: ' + a.type });
  }
  function setApplicationStatus(deal, appId, status) {
    var next = (deal.permitting.applications || []).map(function (x) {
      if (!x || x.id !== appId) return x;
      var c = {}; for (var k in x) c[k] = x[k];
      c.status = status;
      if (status === 'submitted' && !c.submittedAt) c.submittedAt = stamp();
      if (status === 'approved') c.approvedAt = stamp();
      return c;
    });
    return patch(deal, {
      permitting: Object.assign({}, deal.permitting, { applications: next })
    }, { type:'permitting', message:'Application \u2192 ' + status });
  }


  /* ── Assignment ─────────────────────────────────────────────────────────
     Assignees are emails resolved against omega_staff, not a second roster.
     One definition of who works here \u2014 the same reason the ops console reuses
     isOmegaStaff() instead of a parallel domain check. */
  /* Assigning the rep who will screen it. Its own function because it is the
     act that moves a referral into somebody's queue, and it wants its own line
     in the history rather than being folded into a generic assignment. */
  /* ── The design handoff ─────────────────────────────────────────────────
     Sending it to the team, and getting it back. Two functions rather than one
     status dropdown because each direction has different consequences: going
     out sets a clock and a brief, coming back carries the price. */
  function assignDesign(deal, a) {
    var team = (a.team || []).map(function (e) { return String(e).toLowerCase(); });
    var lead = String(a.lead || team[0] || '').toLowerCase();
    if (!lead && !team.length)
      return Promise.reject(new Error('Name at least one person.'));
    return patch(deal, {
      'design.team':   team,
      'design.lead':   lead,
      'design.dueAt':  a.dueAt || null,
      'design.brief':  a.brief || '',
      'design.status': 'in_design',
      'design.sentAt': stamp(),
      /* Mirrored onto assignment so the workload view picks it up without
         needing to know anything about the design model. */
      'assignment.designLead': lead
    }, { type:'design', message:'Design assigned to ' + (lead || team.join(', '))
          + (a.dueAt ? ', due ' + fmtDate(a.dueAt) : '') });
  }

  /* Back from the team, with the number. The price is the point of the round
     trip \u2014 before a design exists nobody knows what the project costs, which
     is the whole reason capex is not asked for at intake. */
  function designReturned(deal, r) {
    var fields = {
      'design.status':     'returned',
      'design.returnedAt': stamp(),
      'design.rounds':     (deal.design.rounds || 0) + 1,
      'design.note':       r.note || deal.design.note || ''
    };
    if (num(r.capexUsd) != null) fields.capexUsd = num(r.capexUsd);
    if (num(r.sizeMw)   != null) fields.sizeMw   = num(r.sizeMw);
    if (num(r.sizeMwh)  != null) fields.sizeMwh  = num(r.sizeMwh);
    return patch(deal, fields, { type:'design',
      message:'Design returned' + (num(r.capexUsd) != null
        ? ' \u2014 ' + money(num(r.capexUsd)) : '')
        + ' (round ' + ((deal.design.rounds || 0) + 1) + ')' });
  }

  /* Sending it back for changes. Keeps the round count, because "this took
     four passes" is a fact about the site or the brief, and it is invisible if
     each revision quietly overwrites the last. */
  function designRevise(deal, why) {
    if (!why) return Promise.reject(new Error('Say what needs changing.'));
    return patch(deal, {
      'design.status':'in_design', 'design.note':why, 'design.returnedAt':null
    }, { type:'design', message:'Sent back for revision \u2014 ' + why });
  }

  function assignRep(deal, email, note) {
    if (!email) return Promise.reject(new Error('Pick who is screening it.'));
    return patch(deal, {
      'assignment.rep': String(email).toLowerCase(),
      'assignment.assignedAt': stamp(),
      'assignment.assignedBy': _me ? _me.email : '',
      'assignment.notes': note || deal.assignment.notes || ''
    }, { type:'assignment', message:'Assigned to ' + email + ' for screening' });
  }

  function assign(deal, a) {
    var fields = {
      'assignment.rep':        String(a.rep || deal.assignment.rep || '').toLowerCase(),
      'assignment.designLead': String(a.designLead || '').toLowerCase(),
      'assignment.devLead':    String(a.devLead || '').toLowerCase(),
      'assignment.dueAt':      a.dueAt || null,
      'assignment.notes':      a.notes || '',
      'assignment.assignedAt': stamp(),
      'assignment.assignedBy': _me ? _me.email : ''
    };
    var who = [a.designLead, a.devLead].filter(Boolean).join(', ') || 'nobody';
    return patch(deal, fields, { type:'assignment', message:'Assigned to ' + who });
  }

  /* Links an editor project to the deal. The project itself is created by the
     caller against the CLIENT's orgId, so the finished drawing lands in the
     client's own portal with no export step \u2014 the same path the ops console's
     "Start build" already uses. */
  function attachProject(deal, projectId, note) {
    return patch(deal, { projectId: projectId },
      { type:'assignment', message:'Design project linked' + (note ? ' \u2014 ' + note : '') });
  }

  /* Everything assigned to one person, across the portfolio. A workload is a
     query across deals, never a column on one. */
  function workload(list, email) {
    email = String(email || '').toLowerCase();
    return list.filter(function (d) {
      return d.assignment.designLead === email || d.assignment.devLead === email;
    });
  }


  /* ── The loop back from the verification console ─────────────────────────
     Called when an opinion is signed. Copies the VERDICT, not a reference,
     because the deal is the thing people read and a stage gate that depends on
     a second document nobody has permission to open is a gate that gets
     asserted by hand.

     The verification document remains the source of truth and is still
     append-only. This is a cached summary, and it is stamped with the id so
     the two can be reconciled if they ever disagree.                       */
  function attachVerification(deal, ver) {
    return patch(deal, {
      verificationIds: firebase.firestore.FieldValue.arrayUnion(ver.id),
      'verification.verdictId':   ver.id,
      'verification.verifierOrg': String(ver.partnerOrg || '').toLowerCase(),
      'verification.feasibility': (ver.verdict && ver.verdict.feasibility) || '',
      'verification.bankability': (ver.verdict && ver.verdict.bankability) || '',
      'verification.signedAt':    (ver.verdict && ver.verdict.signedAt) || null,
      orgsInvolved: orgsInvolved(deal).concat([String(ver.partnerOrg||'').toLowerCase()])
    }, { type:'verification',
         message:'Opinion signed by ' + (ver.partnerName || ver.partnerOrg) + ': '
               + ((ver.verdict && ver.verdict.feasibility) || 'no feasibility') + ' / '
               + ((ver.verdict && ver.verdict.bankability) || 'no bankability') });
  }

  /* ── Documents ───────────────────────────────────────────────────────────
     A link, a kind, and a label. The label matters more than it looks: a
     Drive URL is opaque, so a list of bare links is unusable within a month
     and the person who pasted them is the only one who knows what they are. */
  function linkKinds() { return (cfg().portfolio || {}).linkKinds || []; }
  function linkKindOf(k) {
    var l = linkKinds();
    for (var i=0;i<l.length;i++) if (l[i].key === k) return l[i];
    return { key:k, label:k || 'Other' };
  }

  /* Rejects anything that is not a URL, because a half-pasted link fails
     silently later — somebody clicks it on a call and nothing happens. */
  function normalizeUrl(u) {
    var s = String(u || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) {
      if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) s = 'https://' + s;
      else return null;
    }
    return s;
  }

  function addLink(deal, l) {
    var url = normalizeUrl(l.url);
    if (!url) return Promise.reject(new Error(
      'That does not look like a link. Paste the full address, starting https://'));
    if (!l.label) return Promise.reject(new Error(
      'Give it a name. A list of bare Drive URLs is unreadable within a month, '
      + 'and the person who pasted them is the only one who knows what they are.'));
    var rec = {
      id:'lk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      url:url, label:l.label, kind:l.kind || 'other', note:l.note || '',
      addedBy:_me ? _me.email : '', addedByName:_me ? _me.name : '', addedAt:stamp()
    };
    return patch(deal, { links: firebase.firestore.FieldValue.arrayUnion(rec) },
      { type:'link', message:'Link added: ' + rec.label
            + ' (' + linkKindOf(rec.kind).label + ')' });
  }

  function updateLink(deal, id, fields) {
    var next = (deal.links || []).map(function (x) {
      if (!x || x.id !== id) return x;
      var c = {}; for (var k in x) c[k] = x[k];
      if (fields.url != null)   { var u = normalizeUrl(fields.url); if (u) c.url = u; }
      if (fields.label != null) c.label = fields.label;
      if (fields.kind != null)  c.kind = fields.kind;
      if (fields.note != null)  c.note = fields.note;
      c.updatedAt = stamp();
      return c;
    });
    return patch(deal, { links: next }, { type:'link', message:'Link updated.' });
  }

  /* ── Uploading ───────────────────────────────────────────────────────────
     Uploads land in the SAME `links` array as pasted links, flagged with
     stored:true. One list, because the person looking for the energy report
     does not care which mechanism put it there \u2014 splitting them into two
     panels would make them hunt twice.

     PDF and images only, deliberately. A DWG or an XLSX is a working file
     that belongs in Drive where it can still be edited; uploading one here
     creates a second copy that goes stale silently. PDF is the archival
     format \u2014 the version somebody signed, which will never change again. */
  function storage() {
    if (!global.firebase || !firebase.storage)
      throw new Error('The file uploader did not load. Reload the page and try again.');
    return firebase.storage();
  }
  function maxUploadMb() { return (cfg().portfolio || {}).maxUploadMb || 50; }

  function uploadDoc(deal, file, meta, onProgress) {
    meta = meta || {};
    if (!file) return Promise.reject(new Error('No file selected.'));

    var ct = file.type || '';
    if (!/^application\/pdf$/.test(ct) && !/^image\//.test(ct))
      return Promise.reject(new Error(
        'PDF and images only. A spreadsheet or a CAD file is a working document \u2014 keep it '
        + 'in Drive and paste the link, or it becomes a second copy that goes stale the '
        + 'moment somebody edits the original.'));

    var mb = maxUploadMb();
    if (file.size > mb * 1048576)
      return Promise.reject(new Error('That file is ' + Math.round(file.size/1048576)
        + ' MB. The limit is ' + mb + ' MB \u2014 link it from Drive instead.'));

    var id = 'lk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    var clean = String(file.name || 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    var path = 'deals/' + deal.id + '/' + id + '_' + clean;
    var task = storage().ref(path).put(file, { contentType: ct });

    return new Promise(function (resolve, reject) {
      task.on('state_changed',
        function (s) { if (onProgress && s.totalBytes) onProgress(s.bytesTransferred / s.totalBytes); },
        reject,
        function () {
          task.snapshot.ref.getDownloadURL().then(function (url) {
            var rec = {
              id:id, url:url, label:meta.label || file.name,
              kind:meta.kind || 'other', note:meta.note || '',
              stored:true, path:path, size:file.size, contentType:ct,
              fileName:file.name,
              addedBy:_me ? _me.email : '', addedByName:_me ? _me.name : '',
              addedAt:stamp()
            };
            return patch(deal, { links: firebase.firestore.FieldValue.arrayUnion(rec) },
              { type:'link', message:'Uploaded ' + rec.label
                    + ' (' + linkKindOf(rec.kind).label + ')' })
              .then(function () { resolve(rec); });
          })['catch'](reject);
        });
    });
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function removeLink(deal, link) {
    /* An uploaded file is deleted from Storage too \u2014 leaving the object behind
       would mean a document nobody can find in the console but which is still
       reachable by anyone holding the old URL. Failure is non-fatal: the
       record goes either way, and a stranded object is a cleanup job rather
       than a reason to refuse. */
    if (link && link.stored && link.path) {
      try {
        storage().ref(link.path)['delete']()['catch'](function (e) {
          console.warn('[storage] object not removed:', link.path, e && e.message);
        });
      } catch (e) { /* SDK absent \u2014 remove the record anyway */ }
    }
    return patch(deal, { links: firebase.firestore.FieldValue.arrayRemove(link) },
      { type:'link', message:'Link removed: ' + (link.label || link.url) });
  }

  /* Renaming a deal. Its own function rather than a field on the site-details
     patch because the name appears on the marketplace listing, the editor
     project and every activity line — so the rename is logged with the old
     value, and somebody asking "what was this called before" has an answer. */
  function rename(deal, name) {
    var n = String(name || '').trim();
    if (!n) return Promise.reject(new Error('A name is required.'));
    if (n === deal.name) return Promise.resolve();
    return patch(deal, { name:n },
      { type:'edit', message:'Renamed from \u201c' + deal.name + '\u201d to \u201c' + n + '\u201d' });
  }

  function addNote(deal, text) {
    if (!text) return Promise.reject(new Error('Nothing to save.'));
    var n = { ts:stamp(), author:_me?(_me.name||_me.email):'', text:text };
    return patch(deal, { notes: firebase.firestore.FieldValue.arrayUnion(n) },
      { type:'note', message:'Note added.' });
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PARTNER PORTFOLIO — the KPIs
     ═══════════════════════════════════════════════════════════════════════
     Everything here counts a DENOMINATOR. A partner who referred forty sites
     and funded one is a different partner from one who referred one and funded
     one, and a report that only counts funded deals cannot tell them apart.

     `reached` counts a stage as reached if the deal is AT it or PAST it, or
     ever passed through it on the way to dying. A deal that got to funded and
     then failed in construction still reached funded, and pretending otherwise
     would make the conversion curve improve every time something blew up.  */
  function everReached(deal, stageKey) {
    var target = stageOf(stageKey).rank;
    if (!isExit(deal.stage) && stageOf(deal.stage).rank >= target) return true;
    var h = deal.stageHistory;
    for (var i=0;i<h.length;i++)
      if (h[i] && stageOf(h[i].to).rank >= target) return true;
    return false;
  }

  function partnerStats(list, orgId) {
    orgId = String(orgId || '').toLowerCase();
    list = counted(list);
    var own = list.filter(function (d) { return d.origination.partnerOrg === orgId; });

    var s = {
      orgId: orgId,
      referred: own.length,
      live:  0, dead: 0, parked: 0,
      reached: {}, funnel: [],
      mwReferred: 0, mwFunded: 0,
      capexReferred: 0,
      committedUsd: 0, closedUsd: 0, drawnUsd: 0, deployedUsd: 0,
      /* Separately: what this org supplied on ANYONE's deal. The second
         relationship, and the one a single "partner" field would hide. */
      supplyLines: 0, supplyUsd: 0, supplyCommittedUsd: 0, supplyOnDeals: 0,
      participantOn: 0,
      feeUsd: 0, feePaidUsd: 0,
      medianDaysToFund: null,
      deadReasons: {}
    };

    var fundDays = [];
    own.forEach(function (d) {
      if (d.stage === 'dead')       { s.dead++;   s.deadReasons[d.deadReason||'Not stated'] = (s.deadReasons[d.deadReason||'Not stated']||0)+1; }
      else if (d.stage === 'parked'){ s.parked++; }
      else s.live++;

      s.mwReferred    += d.sizeMw || 0;
      s.capexReferred += d.capexUsd || 0;
      s.committedUsd  += d.funding.committedUsd || 0;
      s.closedUsd     += d.funding.closedUsd || 0;
      s.drawnUsd      += drawnUsd(d);
      s.deployedUsd   += deployedUsd(d);
      s.feeUsd        += d.origination.feeUsd || 0;
      if (d.origination.feePaidAt) s.feePaidUsd += d.origination.feeUsd || 0;
      if (everReached(d, 'funded')) s.mwFunded += d.sizeMw || 0;
      var dd = daysToFund(d);
      if (dd != null) fundDays.push(dd);
    });

    STAGES.forEach(function (st) {
      var n = own.filter(function (d) { return everReached(d, st.key); }).length;
      s.reached[st.key] = n;
      s.funnel.push({ key:st.key, label:st.label, short:st.short, color:st.color,
                      count:n, pct: own.length ? n/own.length : 0 });
    });

    /* Supply side: every deal, not just their own. */
    var seen = {};
    list.forEach(function (d) {
      var hit = false;
      d.bom.forEach(function (l) {
        if (!l || String(l.supplierOrg||'').toLowerCase() !== orgId) return;
        hit = true; s.supplyLines++;
        s.supplyUsd += lineTotal(l);
        if (bomStatusOf(l.status).committed) s.supplyCommittedUsd += lineTotal(l);
      });
      if (hit && !seen[d.id]) { seen[d.id] = 1; s.supplyOnDeals++; }
      if ((d.participants||[]).some(function (p) {
            return p && String(p.orgId||'').toLowerCase() === orgId; })) s.participantOn++;
    });

    if (fundDays.length) {
      fundDays.sort(function (a,b) { return a-b; });
      var m = Math.floor(fundDays.length/2);
      s.medianDaysToFund = fundDays.length % 2 ? fundDays[m]
        : Math.round((fundDays[m-1]+fundDays[m])/2);
    }
    return s;
  }

  /* Portfolio-wide roll-up. Same shape so one renderer draws both. */
  function portfolio(list) {
    list = counted(list);
    var s = {
      total: list.length, live:0, dead:0, parked:0,
      reached:{}, funnel:[],
      mw:0, mwFunded:0, capex:0,
      committedUsd:0, closedUsd:0, drawnUsd:0, deployedUsd:0, undrawnUsd:0,
      preDevBudget:0, preDevSpent:0,
      partners:{}, deadReasons:{}
    };
    list.forEach(function (d) {
      if (d.stage === 'dead')        { s.dead++; s.deadReasons[d.deadReason||'Not stated'] = (s.deadReasons[d.deadReason||'Not stated']||0)+1; }
      else if (d.stage === 'parked') s.parked++;
      else s.live++;
      s.mw += d.sizeMw || 0;
      if (everReached(d,'funded')) s.mwFunded += d.sizeMw || 0;
      s.capex        += d.capexUsd || 0;
      s.committedUsd += d.funding.committedUsd || 0;
      s.closedUsd    += d.funding.closedUsd || 0;
      s.drawnUsd     += drawnUsd(d);
      s.deployedUsd  += deployedUsd(d);
      s.preDevBudget += d.preDev.budgetUsd || 0;
      s.preDevSpent  += d.preDev.spentUsd || 0;
      var p = d.origination.partnerOrg || 'unattributed';
      s.partners[p] = (s.partners[p]||0) + 1;
    });
    s.undrawnUsd = Math.max(0, s.closedUsd - s.drawnUsd);
    STAGES.forEach(function (st) {
      var n = list.filter(function (d) { return everReached(d, st.key); }).length;
      s.reached[st.key] = n;
      s.funnel.push({ key:st.key, label:st.label, short:st.short, color:st.color,
                      count:n, pct: list.length ? n/list.length : 0 });
    });
    return s;
  }

  /* Every org that appears anywhere, with its stats. Drives the Partners
     table. Includes orgs that only ever supplied — they are partners too and
     leaving them off is how a manufacturer's contribution goes unnoticed. */
  function allPartners(list) {
    list = counted(list);
    var set = {};
    list.forEach(function (d) {
      orgsInvolved(d).forEach(function (o) { if (o) set[o] = 1; });
    });
    return Object.keys(set).map(function (o) { return partnerStats(list, o); })
      .sort(function (a,b) {
        return (b.closedUsd - a.closedUsd) || (b.referred - a.referred)
            || (b.supplyUsd - a.supplyUsd);
      });
  }


  /* ── Sample data ─────────────────────────────────────────────────────────
     In memory only. Shaped to exercise the awkward cases: a deal that died
     after reaching funded, a supplier who is also the originator, a draw that
     is approved but not funded, and an unattributed deal.                   */
  function sample() {
    var now = Date.now();
    function d(ago) { return new Date(now - ago*DAY).toISOString(); }

    var rows = [
      { name:'Cedar Rapids fleet depot', address:'Cedar Rapids, IA', state:'IA',
        clientOrgId:'concordenergyusa.com', stage:'construction',
        categories:['dcfc','bess'], sizeMw:8.4, sizeMwh:24, capexUsd:14200000,
        origination:{ partnerOrg:'voltcore-cells.com', partnerName:'VoltCore Cells',
          contactName:'Ana Beltran', referredAt:d(320), channel:'Manufacturer referral',
          agreementRef:'MSA-2024-11', feeBasis:'1.5% of closed capital', feeUsd:135000,
          feePaidAt:d(60), locked:true, lockedAt:d(300) },
        preDev:{ budgetUsd:240000, spentUsd:218400, startedAt:d(295), owner:'Thomas' },
        verification:{ verdictId:'ver-1', verifierOrg:'cir-engineering.com',
          feasibility:'conditional', bankability:'bankable', signedAt:d(180) },
        funding:{ requestedUsd:9500000, committedUsd:9500000, closedUsd:9000000,
          counterparty:'Northbridge Infrastructure', investorOrg:'northbridge-cap.com',
          structure:'Construction + term', listedAt:d(200), committedAt:d(150), closedAt:d(120),
          draws:[
            { id:'dr1', no:1, amountUsd:2200000, purpose:'Long-lead battery deposit',
              category:'battery', status:'funded', requestedAt:d(115), fundedAt:d(110) },
            { id:'dr2', no:2, amountUsd:3100000, purpose:'Civil works and switchgear',
              category:'civil', status:'funded', requestedAt:d(70), fundedAt:d(64) },
            { id:'dr3', no:3, amountUsd:2400000, purpose:'EVSE and commissioning',
              category:'evse', status:'approved', requestedAt:d(12), approvedAt:d(6) }
          ] },
        build:{ ntpAt:d(100), codAt:null, epcOrg:'meridian-epc.com' },
        participants:[
          { orgId:'northbridge-cap.com', orgName:'Northbridge Infrastructure', role:'investor', addedAt:d(150) },
          { orgId:'meridian-epc.com', orgName:'Meridian EPC', role:'epc', addedAt:d(102) },
          { orgId:'alliant.com', orgName:'Alliant Energy', role:'utility', addedAt:d(250) } ],
        bom:[
          { id:'b1', category:'battery', item:'VoltCore VC-280 rack', qty:44, unit:'rack',
            unitCostUsd:41000, supplierOrg:'voltcore-cells.com', supplierName:'VoltCore Cells',
            status:'delivered', poRef:'PO-1181' },
          { id:'b2', category:'evse', item:'350 kW dispenser', qty:24, unit:'ea',
            unitCostUsd:78000, supplierOrg:'spatco.com', supplierName:'SPATCO',
            status:'ordered', poRef:'PO-1194' },
          { id:'b3', category:'civil', item:'Site civil package', qty:1, unit:'lot',
            unitCostUsd:1850000, supplierOrg:'meridian-epc.com', supplierName:'Meridian EPC',
            status:'installed', poRef:'PO-1176' },
          { id:'b4', category:'transformer', item:'2.5 MVA pad-mount', qty:3, unit:'ea',
            unitCostUsd:186000, supplierOrg:'', supplierName:'', status:'specified' } ],
        stageHistory:[
          { at:d(320), to:'referred' }, { at:d(300), to:'screening' }, { at:d(295), to:'pre_dev' },
          { at:d(180), to:'verified' }, { at:d(200), to:'marketplace' },
          { at:d(150), to:'committed' }, { at:d(120), to:'funded' }, { at:d(100), to:'construction' } ] },

      { name:'El Paso compute campus', address:'El Paso, TX', state:'TX',
        clientOrgId:'iqgen.energy', stage:'marketplace',
        categories:['compute','powergen'], sizeMw:75, capexUsd:340000000,
        origination:{ partnerOrg:'sundial-power.com', partnerName:'Sundial Power',
          contactName:'Marcus Hale', referredAt:d(210), channel:'Shareholder introduction',
          feeBasis:'0.5% of closed capital', locked:true, lockedAt:d(200) },
        preDev:{ budgetUsd:1400000, spentUsd:612000, startedAt:d(195), owner:'TJ' },
        verification:{ verdictId:'ver-2', verifierOrg:'juels.ai', feasibility:'conditional',
          bankability:'', signedAt:d(60) },
        funding:{ requestedUsd:240000000, committedUsd:null, closedUsd:null,
          counterparty:'', investorOrg:'', listedAt:d(40), draws:[] },
        build:{ ntpAt:null, codAt:null, epcOrg:'' },
        participants:[{ orgId:'epelectric.com', orgName:'El Paso Electric', role:'utility', addedAt:d(180) }],
        bom:[],
        stageHistory:[ { at:d(210), to:'referred' }, { at:d(200), to:'screening' },
          { at:d(195), to:'pre_dev' }, { at:d(60), to:'verified' }, { at:d(40), to:'marketplace' } ] },

      { name:'Ulm C&I retrofit', address:'Ulm, DE', state:'DE',
        clientOrgId:'fenecon.com', stage:'dead',
        deadReason:'Interconnection cost or timeline', deadAt:d(30),
        categories:['bess'], sizeMw:1.4, sizeMwh:2.8, capexUsd:2100000,
        origination:{ partnerOrg:'voltcore-cells.com', partnerName:'VoltCore Cells',
          referredAt:d(260), channel:'Manufacturer referral', locked:true, lockedAt:d(250) },
        preDev:{ budgetUsd:60000, spentUsd:58000 },
        verification:{ verdictId:'', verifierOrg:'' },
        funding:{ requestedUsd:1500000, committedUsd:1500000, closedUsd:null,
          counterparty:'Rheinwerk Kapital', investorOrg:'rheinwerk.de', committedAt:d(90), draws:[] },
        build:{}, participants:[], bom:[],
        stageHistory:[ { at:d(260), to:'referred' }, { at:d(250), to:'screening' },
          { at:d(240), to:'pre_dev' }, { at:d(120), to:'marketplace' },
          { at:d(90), to:'committed' }, { at:d(30), to:'dead' } ] },

      { name:'Bakersfield rooftop portfolio', address:'Bakersfield, CA', state:'CA',
        clientOrgId:'sunesol.com', stage:'funded',
        categories:['solar','bess'], sizeMw:2.1, capexUsd:4400000,
        origination:{ partnerOrg:'sundial-power.com', partnerName:'Sundial Power',
          referredAt:d(190), channel:'Shareholder introduction', feeUsd:38000, locked:true },
        preDev:{ budgetUsd:90000, spentUsd:87500 },
        verification:{ verdictId:'ver-3', verifierOrg:'cir-engineering.com',
          feasibility:'conditional', bankability:'conditional', signedAt:d(70) },
        funding:{ requestedUsd:3800000, committedUsd:3800000, closedUsd:3800000,
          counterparty:'Northbridge Infrastructure', investorOrg:'northbridge-cap.com',
          structure:'Term', listedAt:d(110), committedAt:d(60), closedAt:d(25),
          draws:[{ id:'dr9', no:1, amountUsd:900000, purpose:'Module and inverter deposit',
                   category:'module', status:'requested', requestedAt:d(4) }] },
        build:{}, participants:[
          { orgId:'northbridge-cap.com', orgName:'Northbridge Infrastructure', role:'investor', addedAt:d(60) }],
        bom:[{ id:'b9', category:'module', item:'540 W bifacial module', qty:3900, unit:'ea',
               unitCostUsd:186, supplierOrg:'sundial-power.com', supplierName:'Sundial Power',
               status:'quoted' }],
        stageHistory:[ { at:d(190), to:'referred' }, { at:d(150), to:'pre_dev' },
          { at:d(70), to:'verified' }, { at:d(110), to:'marketplace' },
          { at:d(60), to:'committed' }, { at:d(25), to:'funded' } ] },

      { name:'Laredo substation-adjacent BESS', address:'Laredo, TX', state:'TX',
        clientOrgId:'', stage:'screening', categories:['bess'], sizeMw:20,
        origination:{ partnerOrg:'', partnerName:'', referredAt:d(14), channel:'Inbound web' },
        preDev:{}, verification:{}, funding:{ draws:[] }, build:{},
        participants:[], bom:[],
        stageHistory:[{ at:d(14), to:'referred' }, { at:d(9), to:'screening' }] }
    ];

    return rows.map(function (r, i) {
      r._demo = true; r.createdAt = r.origination.referredAt;
      return normalize('demo-' + (i+1), r);
    });
  }

  /* Anything unmapped, surfaced rather than dropped. */
  var KNOWN = ['schemaVersion','name','address','state','clientOrgId','intakeId','projectId',
    'verificationIds','origination','originationHistory','participants','stage','stageHistory',
    'deadReason','deadAt','categories','sizeMw','sizeMwh','capexUsd','preDev','verification',
    'funding','build','bom','notes','activity','orgsInvolved','createdAt','updatedAt','_demo',
    'viability','viabilityHistory','permitting','assignment','finProjectId','adoptedFrom',
    'adoptedAt','importBatch','externalIds','projectType','prescreen',
    'discardReason','discardedAt','discardedBy','links','reevaluateReason',
    'siteNotes','energy','design','grid'];
  function unmapped(deal) {
    var raw = deal._raw || {}, out = {}, n = 0;
    for (var k in raw) { if (!raw.hasOwnProperty(k) || KNOWN.indexOf(k) >= 0) continue; out[k] = raw[k]; n++; }
    return n ? out : null;
  }

  global.Portfolio = {
    STAGES:STAGES, EXITS:EXITS, DEAD_REASONS:DEAD_REASONS,
    PARTICIPANT_ROLES:PARTICIPANT_ROLES, BOM_CATEGORIES:BOM_CATEGORIES,
    BOM_STATUS:BOM_STATUS, DRAW_STATUS:DRAW_STATUS,
    stageOf:stageOf, isExit:isExit, bomCatOf:bomCatOf, bomStatusOf:bomStatusOf,
    drawStatusOf:drawStatusOf, roleOf:roleOf,
    ms:ms, num:num, money:money, mw:mw, fmtNumber:fmtNumber, pct:pct, fmtDate:fmtDate, days:days, esc:esc, stamp:stamp,
    normalize:normalize, init:init, loadDeals:loadDeals, deals:deals, patch:patch,
    counted:counted, discard:discard, restore:restore, destroy:destroy,
    DISCARD_REASONS:DISCARD_REASONS,
    create:create, canAdvance:canAdvance, missingFor:missingFor, advance:advance,
    markDead:markDead, park:park, toReevaluate:toReevaluate, reattribute:reattribute,
    addParticipant:addParticipant, removeParticipant:removeParticipant,
    setFunding:setFunding, addDraw:addDraw, setDrawStatus:setDrawStatus,
    addBomLine:addBomLine, setBomStatus:setBomStatus, removeBomLine:removeBomLine,
    addNote:addNote, attachVerification:attachVerification,
    linkKinds:linkKinds, linkKindOf:linkKindOf, normalizeUrl:normalizeUrl,
    addLink:addLink, updateLink:updateLink, removeLink:removeLink, rename:rename,
    uploadDoc:uploadDoc, fmtBytes:fmtBytes, maxUploadMb:maxUploadMb,
    projectTypes:projectTypes, typeOf:typeOf, setProjectType:setProjectType,
    nextStep:nextStep,
    savePrescreen:savePrescreen, financePartners:financePartners,
    financePartnerOf:financePartnerOf, applyFundingSchedule:applyFundingSchedule,
    releaseStage:releaseStage,
    criteriaSet:criteriaSet, threshold:threshold, computeScore:computeScore,
    saveScore:saveScore, postScore:postScore, overrideViability:overrideViability,
    saveGrid:saveGrid, gridPrescreen:gridPrescreen,
    scoringEnabled:scoringEnabled, skillFor:skillFor, skillLabel:skillLabel,
    skillAxis:skillAxis, skillProvider:skillProvider,
    scoringPayload:scoringPayload, requestScore:requestScore,
    routeOnScore:routeOnScore,
    startPermitting:startPermitting, addApplication:addApplication,
    setApplicationStatus:setApplicationStatus,
    assign:assign, assignRep:assignRep, attachProject:attachProject, workload:workload,
    assignDesign:assignDesign, designReturned:designReturned, designRevise:designRevise,
    drawnUsd:drawnUsd, requestedDrawUsd:requestedDrawUsd, undrawnUsd:undrawnUsd,
    deployedUsd:deployedUsd, bomTotalUsd:bomTotalUsd, lineTotal:lineTotal,
    everReached:everReached, enteredAt:enteredAt, daysToFund:daysToFund, ageDays:ageDays,
    orgsInvolved:orgsInvolved,
    partnerStats:partnerStats, portfolio:portfolio, allPartners:allPartners,
    sample:sample, unmapped:unmapped, COLLECTION:COLLECTION
  };
})(window);
