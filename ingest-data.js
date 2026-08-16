/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Ingest Layer  (v1)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Fills the portfolio from the systems that already hold your deals, and from
   spreadsheets. Loaded by portfolio.html only.

   ─────────────────────────────────────────────────────────────────────────────
   ADOPTION, NOT MIGRATION
   ─────────────────────────────────────────────────────────────────────────────
   Nothing moves and nothing is copied. A `fin_projects` record stays exactly
   where it is and keeps working exactly as it does; it gains a `dealId`, and
   the new deal gains a `finProjectId`. Two ids, one relationship.

   That is the whole design, and it has a consequence worth knowing: THIS
   NEEDED NO RULES CHANGE. A ClearSky address already has read on fin_projects
   (via isAdmin()), read on intake_projects and projects (via isOmegaStaff()),
   and the existing update clauses on both permit writing a reference field.
   Adoption is a staff action and staff already hold the permissions. Not luck
   — it is what "the spine references, it does not duplicate" buys you.

   ─────────────────────────────────────────────────────────────────────────────
   WHY THIS IS A REVIEWED INBOX AND NOT A BACKGROUND JOB
   ─────────────────────────────────────────────────────────────────────────────
   "Every deal in the marketplace should show up in the portfolio" sounds right
   and is not. A sponsor's abandoned draft, a deal that died in review, a test
   record from last year — adopt all of them and the denominators are
   meaningless from day one, which destroys the only numbers in the partner
   reporting worth having.

   Worse, there is one question the source records CANNOT answer:

       WHO BROUGHT IT.

   fin_projects has developerUid and orgKey. That is who FILED it, which is
   frequently not who REFERRED it. Defaulting one to the other would put wrong
   attribution on the entire back catalogue in a single click — and attribution
   locks the moment a deal advances. So every adoption asks, and the console
   will not let you skip it.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function cfg()   { return (global.CLEARSKY_CONFIG || {}); }
  function stamp() { return new Date().toISOString(); }
  function F()     { return global.Portfolio; }
  function A()     { return global.OmegaAccess; }

  var _db = null, _me = null;
  function init(db, me) { _db = db; _me = me || null; }

  function lower(s) { return String(s == null ? '' : s).toLowerCase(); }
  function ms(v)    { return F().ms(v); }

  /* ── Which source collections we look at ─────────────────────────────────
     Named here rather than inferred, because a wrong guess reads a collection
     nobody meant to expose and the failure is silent (an empty inbox looks the
     same as nothing to adopt). */
  var SOURCES = [
    { key:'fin',    collection:'fin_projects',    label:'Marketplace',
      hint:'Deals filed into the financing portal. The main back catalogue.' },
    { key:'intake', collection:'intake_projects', label:'Project intake',
      hint:'Work requests filed through a tenant portal.' },
    { key:'editor', collection:'projects',        label:'Editor projects',
      hint:'Drawings the design team has already built. Usually adopt these by '
         + 'linking them to an existing deal rather than creating a new one.' }
  ];

  /* Statuses in fin_projects that are NOT worth adopting by default. Drafts
     are somebody's unfinished note; a deal that never left draft is not part of
     your pipeline history and counting it as a referral that failed would be a
     lie about your own conversion. Shown behind a toggle rather than hidden,
     because "why isn't X here" needs an answer. */
  var FIN_SKIP_BY_DEFAULT = ['draft'];


  /* ── Reading the sources ────────────────────────────────────────────────
     Each returns a normalised CANDIDATE: enough to decide, not the whole
     record. The full record stays where it lives. */
  function candidateFromFin(id, d) {
    var sizes = [];
    if (d.sizeMw != null)   sizes.push(F().num(d.sizeMw));
    if (d.capacityMw != null) sizes.push(F().num(d.capacityMw));
    return {
      source:'fin', sourceId:id, collection:'fin_projects',
      name:      d.name || d.projectName || d.title || 'Untitled listing',
      address:   d.location || d.address || d.city || '',
      state:     d.state || '',
      status:    d.status || '',
      /* WHO FILED IT. Deliberately not called partnerOrg \u2014 see the header. */
      filedByOrg: lower(d.orgKey || ''),
      filedByUid: d.developerUid || '',
      sizeMw:    sizes.length ? sizes[0] : null,
      capexUsd:  F().num(d.capexUsd != null ? d.capexUsd : d.totalCost),
      askUsd:    F().num(d.raiseUsd != null ? d.raiseUsd : d.askAmount),
      categories: guessCategories(d),
      createdAt: d.createdAt || d.filedAt || null,
      dealId:    d.dealId || '',
      /* A stage SUGGESTION, never applied without review. Marketplace status
         maps onto our ladder imperfectly and the mapping is a judgement. */
      suggestStage: d.status === 'awarded' ? 'committed'
                  : d.status === 'open'     ? 'marketplace'
                  : d.status === 'exclusive'? 'marketplace'
                  : d.status === 'review'   ? 'screening'
                  : 'screening',
      _raw: d
    };
  }

  function candidateFromIntake(id, d) {
    var cb = d.createdBy || {};
    return {
      source:'intake', sourceId:id, collection:'intake_projects',
      name:      d.projectName || d.siteName || 'Untitled intake',
      address:   d.address || '',
      status:    d.status || '',
      filedByOrg: lower(d.orgId || (cb.email || '').split('@')[1] || ''),
      filedByUid: cb.uid || '',
      contactName: (d.customer || {}).name || cb.name || '',
      sizeMw:    null,
      capexUsd:  null,
      categories: guessCategories(d),
      createdAt: d.createdAt || null,
      dealId:    d.dealId || '',
      suggestStage: 'screening',
      _raw: d
    };
  }

  function candidateFromEditor(id, d) {
    return {
      source:'editor', sourceId:id, collection:'projects',
      name:      d.name || d.projectName || 'Untitled project',
      address:   d.address || d.siteAddress || '',
      status:    d.status || '',
      filedByOrg: lower(d.orgId || ''),
      filedByUid: d.uid || '',
      sizeMw:    F().num(d.sizeMw),
      capexUsd:  null,
      categories: guessCategories(d),
      createdAt: d.createdAt || d.savedAt || null,
      dealId:    d.dealId || '',
      suggestStage: 'pre_dev',
      _raw: d
    };
  }

  /* Best-effort, and clearly labelled as such in the UI. A wrong guess the
     reviewer corrects is fine; a wrong guess applied silently is not. */
  function guessCategories(d) {
    var out = {}, blob = JSON.stringify(d || {}).toLowerCase();
    var map = { bess:['bess','battery','storage','mwh'], solar:['solar','pv ','photovolt'],
                compute:['data cent','datacent','compute','colocat'],
                dcfc:['dcfc','fast charg'], l2:['level 2','l2 charg'],
                evse:['evse'], powergen:['genset','generation','turbine'],
                der:['microgrid','der '] };
    for (var k in map) {
      for (var i=0;i<map[k].length;i++) if (blob.indexOf(map[k][i]) >= 0) { out[k]=1; break; }
    }
    if (out.evse && !out.dcfc && !out.l2) { out.charging = 1; }
    delete out.evse;
    return Object.keys(out);
  }


  /* ── The inbox ───────────────────────────────────────────────────────────
     Everything adoptable, with anything already adopted marked rather than
     dropped. "Why isn't X in the list" has to have an answer, and the answer
     "it is, look, it's already linked" is the most common one. */
  function loadInbox(opts) {
    opts = opts || {};
    if (!_db) return Promise.resolve({ candidates:[], errors:[] });

    var wanted = opts.sources || ['fin', 'intake'];
    var jobs = [], errors = [];

    SOURCES.forEach(function (s) {
      if (wanted.indexOf(s.key) < 0) return;
      jobs.push(
        _db.collection(s.collection).get().then(function (snap) {
          var out = [];
          snap.forEach(function (doc) {
            var d = doc.data() || {};
            var c = s.key === 'fin'    ? candidateFromFin(doc.id, d)
                  : s.key === 'intake' ? candidateFromIntake(doc.id, d)
                  :                      candidateFromEditor(doc.id, d);
            out.push(c);
          });
          return out;
        })['catch'](function (e) {
          /* One unreadable source must not empty the whole inbox. A partial
             list with a visible error beats a blank screen that looks like
             "nothing to adopt". */
          errors.push({ source:s.key, collection:s.collection,
                        message:(e && e.message) || String(e) });
          return [];
        })
      );
    });

    return Promise.all(jobs).then(function (sets) {
      var all = [];
      sets.forEach(function (arr) { all = all.concat(arr); });
      all.sort(function (a,b) { return ms(b.createdAt) - ms(a.createdAt); });
      return { candidates: all, errors: errors };
    });
  }

  /* Cross-references against deals already in the portfolio, so the inbox can
     mark what is done. Matches on the stored id first, then on name+address as
     a WARNING only \u2014 never as an automatic link. A fuzzy match that adopts
     silently is how one site becomes two deals with half the money each. */
  function annotate(candidates, deals) {
    var byFin = {}, byIntake = {}, byProject = {}, byName = {};
    deals.forEach(function (d) {
      if (d.finProjectId) byFin[d.finProjectId] = d;
      if (d.intakeId)     byIntake[d.intakeId] = d;
      if (d.projectId)    byProject[d.projectId] = d;
      var k = normKey(d.name, d.address);
      if (k) (byName[k] = byName[k] || []).push(d);
    });
    return candidates.map(function (c) {
      var linked = c.source === 'fin'    ? byFin[c.sourceId]
                 : c.source === 'intake' ? byIntake[c.sourceId]
                 :                         byProject[c.sourceId];
      var maybe = !linked ? (byName[normKey(c.name, c.address)] || []) : [];
      c.linkedDeal   = linked || null;
      c.possibleDupes = maybe;
      c.skipByDefault = c.source === 'fin' && FIN_SKIP_BY_DEFAULT.indexOf(c.status) >= 0;
      return c;
    });
  }
  function normKey(name, addr) {
    var s = (String(name||'') + '|' + String(addr||'')).toLowerCase()
      .replace(/[^a-z0-9|]+/g, '');
    return s === '|' ? '' : s;
  }


  /* ── Adopting ────────────────────────────────────────────────────────────
     Creates the deal, then writes the back-reference. In that order, and the
     back-reference failure is non-fatal: the deal already exists and is
     already useful, so refusing the whole operation because a convenience
     field would not write is the wrong way round. It IS reported, because a
     missing back-reference means this record will show up as adoptable again
     tomorrow and somebody will adopt it twice. */
  function adopt(c, choices) {
    choices = choices || {};
    if (!choices.partnerOrg)
      return Promise.reject(new Error(
        'Say who brought this deal. The source record cannot tell us \u2014 it holds who '
        + 'FILED it, which is often not who referred it, and attribution locks as soon '
        + 'as the deal advances.'));

    var stage = choices.stage || c.suggestStage || 'screening';
    if (F().stageOf(stage).rank > F().stageOf('marketplace').rank && !choices.force)
      return Promise.reject(new Error(
        'Adopting straight into ' + F().stageOf(stage).label + ' would put a deal past '
        + 'gates it never passed. Adopt it earlier and advance it, or confirm the override.'));

    var fields = {
      name:        choices.name || c.name,
      address:     choices.address || c.address,
      state:       c.state || '',
      clientOrgId: choices.clientOrgId || c.filedByOrg || '',
      partnerOrg:  choices.partnerOrg,
      partnerName: choices.partnerName || '',
      channel:     choices.channel || 'Adopted from ' + sourceLabel(c.source),
      categories:  choices.categories || c.categories || [],
      sizeMw:      choices.sizeMw != null ? choices.sizeMw : c.sizeMw,
      capexUsd:    choices.capexUsd != null ? choices.capexUsd : c.capexUsd,
      requestedUsd: c.askUsd,
      referredAt:  c.createdAt || stamp()
    };

    return F().create(fields).then(function (ref) {
      var dealId = ref.id;
      var link = { adoptedFrom: c.source, adoptedAt: stamp() };
      link[c.source === 'fin' ? 'finProjectId'
         : c.source === 'intake' ? 'intakeId' : 'projectId'] = c.sourceId;

      var p = _db.collection(F().COLLECTION).doc(dealId).update(link);

      /* Advance to the reviewed stage, through the normal gate machinery, so
         an adopted deal cannot land somewhere a filed deal could not. */
      if (stage !== 'referred') {
        p = p.then(function () {
          return _db.collection(F().COLLECTION).doc(dealId).get();
        }).then(function (snap) {
          var deal = F().normalize(dealId, snap.data() || {});
          return F().advance(deal, stage, 'Adopted from ' + sourceLabel(c.source))
            ['catch'](function (e) {
              /* Gate refused. The deal exists at 'referred', which is correct
                 and recoverable \u2014 report rather than swallow. */
              return { softFail: e };
            });
        });
      }

      return p.then(function (r) {
        return backReference(c, dealId).then(function (backOk) {
          return { dealId: dealId, backReferenced: backOk,
                   stageIssue: r && r.softFail ? r.softFail : null };
        });
      });
    });
  }

  /* Writes dealId onto the source record. Permitted today by the existing
     rules for a ClearSky admin; returns false rather than throwing if not, so
     the caller can warn instead of failing. */
  function backReference(c, dealId) {
    return _db.collection(c.collection).doc(c.sourceId)
      .update({ dealId: dealId })
      .then(function () { return true; })
      ['catch'](function (e) {
        console.warn('[ingest] back-reference not written:', c.collection, c.sourceId,
                     e && e.message);
        return false;
      });
  }

  /* Linking an EXISTING deal to a source record, rather than creating one.
     The right move for editor projects almost always, and for any marketplace
     listing of a site you already track. */
  function linkExisting(c, deal) {
    var fields = { adoptedFrom: c.source, adoptedAt: stamp() };
    fields[c.source === 'fin' ? 'finProjectId'
         : c.source === 'intake' ? 'intakeId' : 'projectId'] = c.sourceId;
    return F().patch(deal, fields,
      { type:'link', message:'Linked to ' + sourceLabel(c.source) + ' record ' + c.sourceId })
      .then(function () { return backReference(c, deal.id); });
  }

  function sourceLabel(k) {
    for (var i=0;i<SOURCES.length;i++) if (SOURCES[i].key === k) return SOURCES[i].label;
    return k;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     THE THREE HANDOFFS
     ═══════════════════════════════════════════════════════════════════════
     A deal leaves this console three times and comes back once. These are the
     pivotal steps, and until now they were a text box asking you to paste an
     id — which is not a workflow, it is a note to yourself.

       createEditorProject   deal  \u2192  projects        (design team picks it up)
       pushToMarketplace     deal  \u2192  fin_projects    (capital sees it)
       syncMarketplace       fin_projects \u2192 deal       (an offer was accepted)

     All three work under the CURRENT rules for a ClearSky admin. No rules
     change; see the notes on each. */

  /* ── 1 · Into the editor ─────────────────────────────────────────────────
     Creates the project stamped with the CLIENT's orgId, not ours. That is
     the whole point: the design team's finished drawing appears in the
     client's own portal with no export step, which is the same path the ops
     console's "Start build" already uses.

     Permitted because /projects create admits isOmegaStaff() and isAdmin()
     for ANY orgId \u2014 that grant exists precisely so staff can build into a
     tenant's workspace. */
  function createEditorProject(deal, opts) {
    opts = opts || {};
    var orgId = String(opts.orgId || deal.clientOrgId || '').toLowerCase();
    if (!orgId) return Promise.reject(new Error(
      'This deal has no client organisation, so there is nowhere to put the project. '
      + 'Set the client on the deal first \u2014 a drawing filed into our own org never '
      + 'reaches the person who asked for it.'));

    var t = F().typeOf(deal.projectType) || {};
    var doc = {
      name:      opts.name || deal.name,
      orgId:     orgId,
      uid:       _me ? _me.uid : '',
      createdBy: { uid:_me ? _me.uid : '', email:_me ? _me.email : '',
                   name:_me ? _me.name : '' },
      /* Everything the editor can usefully prefill. Deliberately a COPY, not
         a reference: the drawing is a work product with its own life, and a
         designer must not find the site dimensions changing under them
         because somebody edited the deal mid-draw. */
      address:     deal.address || '',
      state:       deal.state || '',
      siteAddress: deal.address || '',
      projectType: deal.projectType || '',
      categories:  (deal.categories || []).slice(),
      sizeMw:      deal.sizeMw,
      sizeMwh:     deal.sizeMwh,
      utility:     deal._raw && deal._raw.utility || '',
      ahj:         deal._raw && deal._raw.ahj || '',
      /* The back-reference. Without it the drawing is an orphan the moment
         somebody renames it. */
      dealId:      deal.id,
      dealName:    deal.name,
      source:      'portfolio',
      status:      'draft',
      notes:       opts.brief || '',
      createdAt:   stamp(),
      updatedAt:   stamp()
    };

    return _db.collection('projects').add(doc).then(function (ref) {
      return F().patch(deal, { projectId: ref.id }, { type:'assignment',
        message:'Editor project created in ' + orgId
              + (opts.designLead ? ' \u2014 assigned to ' + opts.designLead : '') })
        .then(function () {
          if (!opts.designLead && !opts.devLead) return ref.id;
          return F().assign(deal, { designLead:opts.designLead, devLead:opts.devLead,
                                    dueAt:opts.dueAt })
            .then(function () { return ref.id; });
        });
    });
  }

  /* ── 2 · Out to the marketplace ──────────────────────────────────────────
     Creates the fin_projects listing capital actually browses, and links it
     both ways.

     THREE THINGS THE RULES FORCE, and each would be a permission-denied with
     no useful message if missed:

       developerUid MUST be the caller. The marketplace treats that field as
       the sponsor, so whoever presses the button owns the listing.

       status MUST be one of open / draft / review. 'exclusive' is refused on
       create by design \u2014 a first-look hold is applied by the operator, never
       filed into.

       orgKey MUST BE OMITTED unless you know the caller has a fin_profile.
       The rule reads `!('orgKey' in data) || orgKey == myOrgKey()`, and
       myOrgKey() is a bare get on fin_profiles that ERRORS when the document
       is absent. Omitting the field short-circuits the check; including it
       fails the whole evaluation for anyone who has never used the financing
       portal. Do not "helpfully" add it back.

     If the intake gate is on and this technology is gated, the listing lands
     in `review` rather than `open` \u2014 the portal respects the gate you already
     configured rather than routing around it. */
  function pushToMarketplace(deal, opts) {
    opts = opts || {};
    if (!_me || !_me.uid) return Promise.reject(new Error('Not signed in.'));

    return _db.collection('fin_settings').doc('intake').get()
      ['catch'](function () { return { exists:false }; })
      .then(function (snap) {
        var s = (snap && snap.exists) ? (snap.data() || {}) : {};
        var gated = s.gateEnabled === true
                 && (s.gateTechs || ['bess']).some(function (t) {
                      return (deal.categories || []).indexOf(t) >= 0; });
        var status = opts.status || (gated ? 'review' : 'open');

        var doc = {
          name:         opts.name || deal.name,
          location:     deal.address || '',
          state:        deal.state || '',
          status:       status,
          developerUid: _me.uid,           /* pinned by the rules */
          awardedTo:    null,              /* pinned by the rules */
          projectType:  deal.projectType || '',
          categories:   (deal.categories || []).slice(),
          sizeMw:       deal.sizeMw,
          sizeMwh:      deal.sizeMwh,
          capexUsd:     deal.capexUsd,
          raiseUsd:     opts.raiseUsd != null ? F().num(opts.raiseUsd)
                                              : deal.funding.requestedUsd,
          summary:      opts.summary || '',
          /* What a capital partner most wants and least often gets: whether
             anybody independent has looked at it. */
          verification: deal.verification.verdictId ? {
            verifier:    deal.verification.verifierOrg,
            feasibility: deal.verification.feasibility,
            bankability: deal.verification.bankability,
            signedAt:    deal.verification.signedAt
          } : null,
          viabilityScore: deal.viability.score,
          dealId:       deal.id,
          filedAt:      stamp(),
          createdAt:    stamp()
          /* orgKey deliberately absent \u2014 see the note above. */
        };

        return _db.collection('fin_projects').add(doc).then(function (ref) {
          return F().patch(deal, {
            finProjectId: ref.id,
            'funding.listedAt': stamp()
          }, { type:'marketplace',
               message:'Listed on the marketplace as ' + status
                     + (gated ? ' (gated technology \u2014 queued for approval)' : '') })
            .then(function () {
              /* Advance if the gates allow. A listing that cannot reach the
                 marketplace stage is still a real listing \u2014 report, do not
                 unwind it. */
              if (deal.stage === 'marketplace') return { id:ref.id, status:status };
              return F().advance(deal, 'marketplace', 'Listed on the marketplace')
                .then(function () { return { id:ref.id, status:status }; })
                ['catch'](function (e) {
                  return { id:ref.id, status:status, stageIssue:e };
                });
            });
        });
      });
  }

  /* ── 3 · Back from the marketplace ───────────────────────────────────────
     The one inbound handoff. An offer being accepted happens over there, and
     nothing tells this console about it.

     A POLL, NOT A WEBHOOK, and deliberately so: a webhook needs a server, and
     everything here runs in the browser against Firestore. Polling on refresh
     is a few reads and cannot silently lose an event the way a failed webhook
     does. When there is a backend, replace this and nothing else changes.

     It does NOT auto-advance. `awarded` in the marketplace means an offer was
     accepted; `committed` here means a term sheet is signed with an amount and
     a counterparty. Those are adjacent, not identical, and moving the deal
     automatically would put money in the dashboard that nobody entered. It
     surfaces the news and lets you act. */
  function syncMarketplace(deals) {
    if (!_db) return Promise.resolve([]);
    var linked = deals.filter(function (d) { return d.finProjectId; });
    if (!linked.length) return Promise.resolve([]);

    return Promise.all(linked.map(function (d) {
      return _db.collection('fin_projects').doc(d.finProjectId).get()
        .then(function (s) {
          if (!s.exists) return null;
          var f = s.data() || {};
          var news = null;
          if (f.status === 'awarded' && F().stageOf(d.stage).rank < F().stageOf('committed').rank)
            news = { kind:'awarded', label:'An offer was accepted',
                     detail:'Marketplace shows this awarded. Record the terms and move it '
                          + 'to Committed \u2014 not done automatically, because "an offer was '
                          + 'accepted" and "a term sheet is signed for this amount" are '
                          + 'adjacent, not identical.' };
          else if (f.status === 'exclusive' && !d._sawExclusive)
            news = { kind:'exclusive', label:'On first-look hold',
                     detail:'Held for a capital partner before the open marketplace.' };
          else if (f.status === 'review' && d.stage === 'marketplace')
            news = { kind:'review', label:'Waiting on marketplace approval',
                     detail:'Gated technology. Not visible to partners until approved.' };
          return news ? { deal:d, finStatus:f.status, news:news } : null;
        })['catch'](function () { return null; });
    })).then(function (r) { return r.filter(Boolean); });
  }


  /* ═══════════════════════════════════════════════════════════════════════
     EXCEL / CSV IMPORT
     ═══════════════════════════════════════════════════════════════════════
     Parses in the browser with SheetJS, maps columns to deal fields, previews
     every row, and imports only what you confirm.

     TWO RULES THAT DO NOT RELAX:

       1. A row with no originating organisation is REFUSED. An import is the
          easiest way to lose attribution on a hundred deals at once, and
          attribution is the number the partner reporting is built on.

       2. Rows land in `referred` or `screening` and no further. A spreadsheet
          cannot carry the evidence the later gates require, so importing
          straight to `funded` would put money in your dashboard that never
          passed a gate. Advance them afterwards, through the gates, like
          anything else.

     Every imported deal carries importBatch \u2014 filename plus timestamp \u2014
     because in six months "which import did this come from" is the first
     question somebody asks about a number that looks wrong. */
  var FIELDS = [
    { key:'name',        label:'Site name',            required:true },
    { key:'partnerOrg',  label:'Brought by (domain)',  required:true,
      hint:'The organisation that referred it. Refused if blank.' },
    { key:'partnerName', label:'Brought by (name)' },
    { key:'address',     label:'Location' },
    { key:'state',       label:'State / region' },
    { key:'clientOrgId', label:'Client (domain)' },
    { key:'categories',  label:'Categories',  hint:'Comma-separated: bess, solar, dcfc\u2026' },
    { key:'sizeMw',      label:'Size (MW)',   numeric:true },
    { key:'sizeMwh',     label:'Energy (MWh)',numeric:true },
    { key:'capexUsd',    label:'Capex (USD)', numeric:true },
    { key:'requestedUsd',label:'Capital sought (USD)', numeric:true },
    { key:'channel',     label:'Channel' },
    { key:'referredAt',  label:'Referred date' },
    { key:'stage',       label:'Stage',
      hint:'Only referred or screening are accepted. Anything else is clamped.' }
  ];

  function parseWorkbook(file) {
    return new Promise(function (resolve, reject) {
      if (!global.XLSX) return reject(new Error(
        'The spreadsheet reader did not load. Check the network and reload the page.'));
      var r = new FileReader();
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.onload = function (e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
          var sheets = wb.SheetNames.map(function (n) {
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'' });
            return { name:n, rows:rows };
          });
          resolve(sheets);
        } catch (err) { reject(new Error('That file could not be parsed: ' + err.message)); }
      };
      r.readAsArrayBuffer(file);
    });
  }

  /* Suggests a column for each field by header name. A suggestion the person
     corrects in one click; never applied without the preview. */
  function suggestMapping(headers) {
    var map = {};
    var hints = {
      name:['site','project','name','asset'],
      partnerOrg:['partner domain','brought by domain','referrer domain','source domain','partner'],
      partnerName:['partner name','brought by','referrer','source'],
      address:['location','address','city','site address'],
      state:['state','region','province'],
      clientOrgId:['client','customer','account'],
      categories:['category','categories','technology','tech','type'],
      sizeMw:['mw','size','capacity','power'],
      sizeMwh:['mwh','energy','duration'],
      capexUsd:['capex','cost','total cost','budget'],
      requestedUsd:['raise','ask','capital','funding sought','requested'],
      channel:['channel','origin','how'],
      referredAt:['date','referred','created','received'],
      stage:['stage','status','phase']
    };
    FIELDS.forEach(function (f) {
      var want = hints[f.key] || [];
      for (var i=0;i<headers.length;i++) {
        var h = String(headers[i] || '').toLowerCase().trim();
        if (!h) continue;
        for (var j=0;j<want.length;j++) {
          if (h === want[j] || h.indexOf(want[j]) >= 0) { map[f.key] = i; return; }
        }
      }
    });
    return map;
  }

  function buildRows(sheet, mapping, opts) {
    opts = opts || {};
    var headerRow = opts.headerRow != null ? opts.headerRow : 0;
    var out = [];
    for (var r = headerRow + 1; r < sheet.rows.length; r++) {
      var raw = sheet.rows[r];
      if (!raw || !raw.length) continue;
      var v = {}, blank = true;
      FIELDS.forEach(function (f) {
        var idx = mapping[f.key];
        var cell = (idx == null) ? '' : raw[idx];
        if (cell !== '' && cell != null) blank = false;
        v[f.key] = cell;
      });
      if (blank) continue;

      var problems = [];
      if (!String(v.name || '').trim()) problems.push('No site name.');
      if (!String(v.partnerOrg || '').trim())
        problems.push('No originating organisation \u2014 refused. Attribution added later '
                    + 'is attribution somebody argued for.');

      var stage = String(v.stage || '').toLowerCase().trim();
      var clamped = null;
      if (stage && ['referred','screening'].indexOf(stage) < 0) {
        clamped = stage; stage = 'screening';
      }

      out.push({
        row: r + 1,
        values: {
          name:        String(v.name || '').trim(),
          partnerOrg:  lower(String(v.partnerOrg || '').trim()),
          partnerName: String(v.partnerName || '').trim(),
          address:     String(v.address || '').trim(),
          state:       String(v.state || '').trim(),
          clientOrgId: lower(String(v.clientOrgId || '').trim()),
          categories:  String(v.categories || '').split(/[,;]/)
                         .map(function (s) { return s.trim().toLowerCase(); })
                         .filter(Boolean),
          sizeMw:      F().num(v.sizeMw),
          sizeMwh:     F().num(v.sizeMwh),
          capexUsd:    F().num(v.capexUsd),
          requestedUsd:F().num(v.requestedUsd),
          channel:     String(v.channel || '').trim() || 'Imported',
          referredAt:  parseDate(v.referredAt),
          stage:       stage || 'screening'
        },
        clampedFrom: clamped,
        problems: problems,
        ok: !problems.length
      });
    }
    return out;
  }

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      /* Excel serial date. The 1899-12-30 epoch is deliberate: Excel treats
         1900 as a leap year, which it was not, and this offset absorbs it. */
      return new Date(Math.round((v - 25569) * 86400000)).toISOString();
    }
    var t = Date.parse(v);
    return isNaN(t) ? null : new Date(t).toISOString();
  }

  /* Sequential, not parallel. A hundred concurrent writes will trip rate
     limits and leave you unable to say which rows landed \u2014 and "which rows
     landed" is the only question that matters when an import half-fails. */
  function runImport(rows, batchLabel, onProgress) {
    var good = rows.filter(function (r) { return r.ok; });
    var results = { created:0, failed:0, errors:[], batch:batchLabel };
    var i = 0;

    function step() {
      if (i >= good.length) return Promise.resolve(results);
      var r = good[i++];
      var fields = {};
      for (var k in r.values) fields[k] = r.values[k];
      fields.importBatch = batchLabel;

      return F().create(fields).then(function (ref) {
        results.created++;
        if (r.values.stage === 'screening') {
          return _db.collection(F().COLLECTION).doc(ref.id)
            .update({ stage:'screening', importBatch:batchLabel })
            ['catch'](function () {});
        }
      })['catch'](function (e) {
        results.failed++;
        results.errors.push({ row:r.row, name:r.values.name,
                              message:(e && e.message) || String(e) });
      }).then(function () {
        if (onProgress) onProgress(i, good.length);
        return step();
      });
    }
    return step();
  }


  global.Ingest = {
    SOURCES:SOURCES, FIELDS:FIELDS,
    init:init, loadInbox:loadInbox, annotate:annotate,
    adopt:adopt, linkExisting:linkExisting, backReference:backReference,
    sourceLabel:sourceLabel,
    createEditorProject:createEditorProject, pushToMarketplace:pushToMarketplace,
    syncMarketplace:syncMarketplace,
    parseWorkbook:parseWorkbook, suggestMapping:suggestMapping,
    buildRows:buildRows, runImport:runImport
  };
})(window);
