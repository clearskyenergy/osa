/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — OMEGA PARTNER VERIFICATION CONSOLE (external)
   ClearSky-OMEGA EnergyOS · deployment for third-party verification partners

   This is NOT the ops console and NOT a client tenant. It is the deployment a
   third party — CIR, Juels AI, an independent engineer — signs into to work the
   projects you have assigned them, and it is the only ClearSky surface anyone
   outside the company gets a login to.

   Three consequences, and every one of them is load-bearing:

     1. It reads ONE collection: `verifications`. It has no read on
        intake_projects and no read on projects. A partner sees the packet you
        assigned them and nothing else — not the client's other sites, not the
        queue, not the fee. This is enforced in the rules, not here.

     2. Assignments carry a SNAPSHOT of the project, not a reference to it.
        Granting cross-collection reads to an external party to save a copy
        would be trading the entire access boundary for some duplicated JSON.

     3. One deployment serves every partner. Which partner you are is resolved
        from your email domain against `partner.orgs` below, and the queue is
        filtered on it in the rules. Standing up a second deployment per
        partner would mean a second set of credentials to rotate.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {


window.CLEARSKY_CONFIG = {

  /* ── Firebase ──────────────────────────────────────────────────────────────
     Same clearsky-portal project as everything else. It has to be: the ops
     console writes the assignment and the partner reads it, and cross-project
     Firestore reads do not exist.

     Web credentials, public by design. The security boundary is the rules —
     see firestore.rules.partner, and read it before you deploy this, because
     without it a partner signs in to an empty queue that looks like a bug.  */
  firebase: {
    apiKey:            'AIzaSyABoM1lgOYUnd5ZadaoTMhYmA9cHa8Tyo0',
    authDomain:        'clearsky-portal.firebaseapp.com',
    projectId:         'clearsky-portal',
    storageBucket:     'clearsky-portal.firebasestorage.app',
    messagingSenderId: '742134484347',
    appId:             '1:742134484347:web:ab0f95fd221536158481de',
    measurementId:     'G-8D92GNW555'
  },

  platformName: 'ClearSky-OMEGA',
  supportEmail: 'dev@clearsky-usa.com',

  /* ── The deployment's own identity ─────────────────────────────────────────
     Deliberately NOT a tenant block. omega-brand.js resolves a tenant from a
     single allowedDomain, which is the right shape for a client portal and the
     wrong shape here: this deployment admits several unrelated companies and
     has to tell them apart. `partner.orgs` below does that job instead, and
     partner-data.js reads it.                                               */
  tenant: {
    type:        'partner',
    clientName:  'Verification Partner',
    logo:        '/omega-logo.png',
    accountTier: 'Partner',
    tierLevel:   1
  },

  /* ClearSky's own domains. Staff signing in here see every partner's queue
     read-only, which is how you check what a partner is sitting on without
     asking them. They cannot sign a verdict — see partner-data.js § canSign. */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],


  /* ═════════════════════════════════════════════════════════════════════════
     PARTNER SETTINGS
     Read by /partner-data.js. This is the only file to edit.
     ═════════════════════════════════════════════════════════════════════════ */
  partner: {

    /* ── Where assignments live ────────────────────────────────────────────
       One collection, written by the ops console, read by the partner. The
       ops console's own queue stays in `intake_projects` and is not touched
       by anything in this repo. */
    collection: 'verifications',

    /* Storage prefix for uploaded bankability documents. Keyed by
       verification id so a rules match on the path can scope a partner to
       their own folder without a Firestore lookup. */
    storagePrefix: 'verifications',

    /* ── Verification partners ─────────────────────────────────────────────
       NO LONGER A SIGN-IN GATE. It was in v1, and that was wrong for a portal
       meant to hold every manufacturer, utility and shareholder who refers a
       deal: every new partner meant an edit and a redeploy, and the person
       who most needed access was always the one you hadn't added yet.

       Access is now request-and-approve, in `omega_users` — see
       /access-data.js and the `access` block below.

       What survives here is the VERIFICATION SCOPE. Being approved into the
       portal does not make an organisation a verifier: signing a bankability
       opinion is a retained engagement, not a login level. An org absent from
       this list can be assigned nothing to verify, and an org listed for
       feasibility only never sees the bankability field — better than seeing
       it, filling it in, and having it quietly ignored.

       `key` must equal the org's email domain AND the `partnerOrg` written on
       the assignment. Both are compared lowercase.

       `signers` narrows who on that domain may sign, as opposed to review.
       Empty allows the whole domain. Naming them is worth the maintenance:
       the opinion carries the signer's name.                              */
    orgs: {
      'cir-engineering.com': {
        name:     'CIR',
        scopes:   ['feasibility', 'bankability'],
        signers:  [],
        note:     'Bankable-solution reviewer. Signs the opinion the lender sees.'
      },
      'juels.ai': {
        name:     'Juels AI',
        scopes:   ['feasibility'],
        signers:  [],
        note:     'Feasibility screen. Not currently retained for bankability.'
      }
    },

    /* ── What a partner may be asked for ───────────────────────────────────
       An assignment names its scope. A partner whose `scopes` above omits
       'bankability' cannot be assigned it and does not see the field — which
       is better than seeing it, filling it in, and having it quietly ignored. */
    scopes: {
      feasibility: { label:'Feasibility',  note:'Can this be built here.' },
      bankability: { label:'Bankability',  note:'Would a lender fund it on these terms.' }
    },

    /* ── Blind review ──────────────────────────────────────────────────────
       False hides the client company name and contact from the packet; the
       site, sizing and numbers still go over. An independent opinion is more
       defensible when the reviewer does not know whose deal it is, and less
       convenient to run when they need to ask a question.

       This is a display setting ONLY. The assignment document still carries
       orgId, because the ops console needs it — so if you need real blinding,
       strip it at assignment time in assign-panel.js rather than here.      */
    discloseClient: false,

    /* ── Turnaround targets, wall-clock hours ──────────────────────────────
       Measured assignedAt → submittedAt, with the clock PAUSED while status
       is 'info_requested'. That pause is the difference between a metric that
       measures the partner and one that measures your own packet quality: a
       partner sitting on a question you haven't answered is not late.      */
    sla: { critical: 48, standard: 120, low: 240 },
    warnAt: 0.7,

    /* ── Documents ─────────────────────────────────────────────────────────
       A signed verdict requires at least one document of a kind listed in
       `requiredFor`. An opinion with no attachment is a chat message.

       50 MB matches ops-data.js. PDF only for the signed opinion — a Word
       file is an editable document and the whole point of the artifact is
       that it isn't.                                                       */
    maxFileMb: 50,
    documentKinds: {
      bankability: { label:'Bankability opinion',  pdfOnly:true,  requiredFor:['bankability'] },
      feasibility: { label:'Feasibility report',   pdfOnly:true,  requiredFor:['feasibility'] },
      evidence:    { label:'Supporting evidence',  pdfOnly:false, requiredFor:[] }
    },

    /* ── Categories ────────────────────────────────────────────────────────
       The same eight the ops console screens on — six from the intake's
       `scope` map plus the two that only ever appear on an editor-drawn site.
       Keep this list identical to ops.finance.qualify's keys in the ops
       repo's config.js. A category the partner can select that the ops
       console cannot screen is a category that vanishes on the way back.

       The partner sets these independently of what we sent. Their
       recategorisation IS a finding — "you called this solar, there's a
       battery in it" is worth more than the checkbox suggests, and the
       console shows the two side by side rather than overwriting ours.     */
    categories: [
      { key:'bess',     label:'Battery storage',   short:'BESS' },
      { key:'solar',    label:'Solar',             short:'PV'   },
      { key:'compute',  label:'Data centre',       short:'DC'   },
      { key:'der',      label:'Distributed energy',short:'DER'  },
      { key:'dcfc',     label:'DC fast charging',  short:'DCFC' },
      { key:'l2',       label:'Level 2 charging',  short:'L2'   },
      { key:'powergen', label:'On-site generation',short:'GEN'  },
      { key:'charging', label:'Charging (mixed)',  short:'EVSE' }
    ],

    /* ── Demo mode ─────────────────────────────────────────────────────────
       Fabricated assignments, in memory only, nothing written. Every row is
       flagged in the UI. Use it to walk a prospective partner through the
       console before they have Firestore access — which is the situation you
       are actually in on the first call with CIR. */
    allowSample: true
  },


  /* ═════════════════════════════════════════════════════════════════════════
     ACCESS CONTROL
     Read by /access-data.js. Governs both consoles in this repo.
     ═════════════════════════════════════════════════════════════════════════ */
  access: {

    /* ── The owner ─────────────────────────────────────────────────────────
       Pinned here and asserted on every sign-in, never read from Firestore.
       This account cannot be demoted, suspended or deleted from the UI, and
       the rules enforce that independently.

       Not deference to a person: the account that can restore everyone else's
       access must not be losable by a misclick, and every role system that
       skips this eventually locks its own administrators out at the worst
       possible moment. Moving it is a config edit and a redeploy, which is the
       right amount of friction for this one change.                        */
    owner: 'tom@clearsky-usa.com',

    /* ── Open registration ─────────────────────────────────────────────────
       True means anyone can sign in and land in the approval queue. False
       means only addresses an administrator has pre-created can even request.

       True is the intended setting: the portal is meant to hold every partner
       who brings a deal, and pre-creating each of them puts you back in the
       bottleneck the allowlist created. It is only safe because a PENDING
       account is refused by the rules rather than merely hidden by the UI, and
       the pending screen names no deal, no partner and no other user.

       If you ever set this false, say so in the sign-in copy. A silent refusal
       reads to an invited partner as a broken password.                    */
    openRegistration: true,

    /* Domains auto-approved as administrators on first sign-in. ClearSky's
       own — making staff wait for approval from staff is a loop with no exit.
       Note this is `adminDomains` above; repeated here only as a reminder that
       the two must not drift. */
    autoApproveInternal: true,

    /* Default role for an approved external user when the approver doesn't
       pick one. 'viewer' deliberately: the failure mode of guessing too low is
       a second click, and of guessing too high is a stranger with write
       access to a funding record. */
    defaultRole: 'viewer',

    /* ── The organisations that use this portal ────────────────────────────
       Seeded here so that a person from one of them who signs in is recognised
       immediately — their org name renders correctly, they appear in the
       assignee pickers, and an administrator approving them sees who they are
       rather than a bare domain.

       THIS IS NOT A GATE. Anyone can still request access from any domain and
       land in the approval queue; this only pre-fills what we already know.
       The registry in omega_partner_orgs overrides these once written, so
       editing an organisation in the console beats editing this file.

       clearsky-usa.com is auto-activated as administrator by the access layer
       because it is a ClearSky domain. OGI Solar and Sunesol still go through
       approval — being a known partner is not the same as being an approved
       user, and collapsing the two would mean anyone at a partner domain
       admits themselves. */
    knownOrgs: {
      'clearsky-usa.com': { name:'OMEGA',          kind:'internal',
        note:'ClearSky Energy Solutions. Staff, auto-approved as administrators.' },
      'ogisolar.com':     { name:'OGI Solar',      kind:'developer',
        note:'Development partner. Assignable for verification, pre-dev and design.' },
      'sunesol.com':      { name:'Sunesol Energy', kind:'developer',
        note:'Development partner. Assignable for verification, pre-dev and design.' }
    },

    /* Shown on the pending screen so a waiting partner knows who to chase. */
    approvalContact: 'tom@clearsky-usa.com'
  },


  /* ═════════════════════════════════════════════════════════════════════════
     PORTFOLIO
     Read by /portfolio-data.js and /portfolio.html.
     ═════════════════════════════════════════════════════════════════════════ */
  portfolio: {

    collection: 'deals',

    /* Where the site editor is served from. Frequently a different host from
       this console, so it is configurable rather than assumed — a hardcoded
       path that works in development and 404s in production is the kind of
       thing nobody notices until a designer clicks it.

       The editor takes ?project=<id> and loads from the same `projects`
       collection this console writes to, which is why "Create in editor"
       needs no export step and no API. */
    editorUrl: '/editor.html',

    /* Where a referral can come from. Recorded per deal alongside the org,
       because "our shareholder introduced it" and "they submitted the web
       form" are different channels with different economics even when the
       same company is on both. */
    channels: [
      'Manufacturer referral',
      'Shareholder introduction',
      'Utility referral',
      'Developer partner',
      'Broker',
      'Inbound web',
      'Conference / event',
      'ClearSky origination'
    ],

    /* Default referral fee wording. Per-deal `feeBasis` overrides it. Kept as
       free text on purpose: fee arrangements differ per MSA and encoding them
       as a percentage field would quietly misstate the ones that aren't. */
    defaultFeeBasis: '',

    /* ── Project types ─────────────────────────────────────────────────────
       WHAT WE BUILD. This is the first question on intake and it drives
       everything downstream: which viability criteria apply, which equipment
       categories appear on the BOM, and which manufacturers are offered.

       Deliberately NOT the same list as `categories` below. A category is a
       technology present on a site; a project TYPE is the thing we are selling
       and financing. "Solar + BESS" is one project with one economic model,
       not a solar project that happens to have batteries — and conflating the
       two is why hybrid sites get costed twice and financed as neither.

       `categories` lists which technology tags a type implies, so the BOM and
       the partner reporting stay consistent without anybody re-tagging. */
    projectTypes: [
      { key:'solar',        label:'Solar',                 categories:['solar'],
        hint:'Standalone PV, ground or roof.' },
      { key:'solar_bess',   label:'Solar + storage',       categories:['solar','bess'],
        hint:'One project, one model \u2014 not a solar site with batteries bolted on.' },
      { key:'bess',         label:'Standalone storage',    categories:['bess'],
        hint:'Front-of-meter or C&I battery, no generation.' },
      { key:'compute',      label:'Data centre / compute', categories:['compute'],
        hint:'Load-led. Power procurement is the project.' },
      { key:'compute_gen',  label:'Compute + on-site generation', categories:['compute','powergen','bess'],
        hint:'Behind-the-meter generation serving a compute load.' },
      { key:'microgrid',    label:'Microgrid',             categories:['der','bess','solar','powergen'],
        hint:'Islandable, multiple assets, controls are the hard part.' },
      { key:'der',          label:'Distributed energy',    categories:['der'],
        hint:'Aggregated or behind-the-meter DER portfolio.' },
      { key:'dcfc',         label:'DC fast charging',      categories:['dcfc'],
        hint:'Highway or fleet depot fast charging.' },
      { key:'l2',           label:'Level 2 charging',      categories:['l2'],
        hint:'Workplace, multifamily, destination.' },
      { key:'charging_bess',label:'Charging + storage',    categories:['dcfc','bess'],
        hint:'Demand-charge managed charging.' },
      { key:'powergen',     label:'On-site generation',    categories:['powergen'],
        hint:'Gensets, CHP, fuel cells.' }
    ],

    /* ── Equipment manufacturers ───────────────────────────────────────────
       Offered on BOM lines, filtered by category. Adding one here makes it
       selectable everywhere; it does not commit you to anything.

       `orgId` matters: if a manufacturer is also a portal partner, purchase
       orders against them roll into that partner's portfolio view alongside
       any deals they referred. That is the loop PORTFOLIO.md \u00a7 2 is about \u2014
       two commercial relationships with the same company, counted separately. */
    manufacturers: [
      { key:'canadian_solar', name:'Canadian Solar', orgId:'',
        categories:['module','inverter','bess'] },
      { key:'fenecon',        name:'FENECON',        orgId:'fenecon.com',
        categories:['bess','inverter'] },
      { key:'gotion',         name:'Gotion',         orgId:'',
        categories:['battery','bess'] },
      { key:'sparkz',         name:'SPARKZ',         orgId:'',
        categories:['battery','bess'] }
    ],

    /* ── Distributors ──────────────────────────────────────────────────────
       Who we actually order through. Separate from the manufacturer because
       the purchase order, the lead time and the payment terms belong to the
       distributor, and the warranty belongs to the manufacturer. One field
       for both loses whichever one you need at the moment you need it. */
    distributors: [
      { key:'res',     name:'RES',                  orgId:'',
        note:'Balance of system, racking, electrical.' },
      { key:'walters', name:'Walters Distribution', orgId:'',
        note:'General electrical distribution and ordering.' }
    ],

    /* ── Finance partners and their funding stages ─────────────────────────
       Capital does not arrive in one payment. Each partner releases against
       their own milestones, and the gap between "approved" and "in the
       account" is the number a supplier waiting on a purchase order actually
       feels \u2014 see PORTFOLIO.md \u00a7 4.

       `stages` are that partner's OWN release schedule, in order, each with
       the share of the facility it represents. Percentages are indicative and
       editable per deal: the schedule is a template, not a contract, and the
       moment it is treated as one somebody will report a draw that never
       happened.

       Pull further partners from the financing marketplace as they engage;
       Amperage is the standing one. */
    financePartners: [
      { key:'amperage', name:'Amperage Capital', orgId:'',
        note:'Primary capital partner. Phased release against milestones.',
        stages: [
          { key:'ntp',          label:'Notice to proceed',      pct:10,
            hint:'Released at NTP. Mobilisation and long-lead deposits.' },
          { key:'procurement',  label:'Equipment procurement',  pct:30,
            hint:'Against issued purchase orders.' },
          { key:'construction', label:'Construction milestone', pct:35,
            hint:'Typically at mechanical completion of major works.' },
          { key:'commissioning',label:'Commissioning',          pct:15,
            hint:'On successful commissioning and utility witness test.' },
          { key:'cod',          label:'Commercial operation',   pct:10,
            hint:'Final release at COD, after punch list.' }
        ] }
    ],

    /* ── Document kinds ────────────────────────────────────────────────────
       What a link on a deal is. Categorised rather than a flat list because
       "show me the interconnection correspondence" is a question somebody
       asks eighteen months later, and scrolling forty untitled Drive links
       is not an answer.

       LINKS, NOT UPLOADS, and that is a deliberate trade:

         · your team already works in Drive and Dropbox. A second copy in
           Firebase Storage would go stale the moment somebody edits the
           original, and nobody would know which one was current
         · permissions stay where the file is. The portal never becomes the
           thing standing between an engineer and a drawing
         · it costs nothing to store and nothing to serve

       THE COST, stated plainly: the portal cannot guarantee anybody can
       actually open what you link. A partner clicking a Drive link they have
       not been shared on gets "request access", not the file. So share the
       folder in Drive as well as pasting the link here — the console says so
       on the form rather than letting people discover it on a call.

       The signed verification opinion is the one exception and is uploaded
       properly, because that document has to be the artifact a lender
       receives rather than a link that might rot. */
    /* Upload ceiling. Stamped drawing sets get large; past this, link it from
       Drive rather than making somebody wait on a 60 MB upload over hotel
       wifi. */
    maxUploadMb: 50,

    linkKinds: [
      { key:'folder',      label:'Project folder',        hint:'The whole Drive or Dropbox folder for this site.' },
      { key:'energy',      label:'Energy report / model', hint:'Production estimates, load studies, savings analysis.' },
      { key:'schematic',   label:'Schematic / one-line',  hint:'Electrical drawings, one-lines, panel schedules.' },
      { key:'drawing',     label:'Site drawing / layout', hint:'Site plan, civil, layout, editor exports.' },
      { key:'survey',      label:'Survey / photos',       hint:'Site visit photos, drone, measurements.' },
      { key:'utility',     label:'Utility correspondence',hint:'Interconnection applications, studies, responses.' },
      { key:'permit',      label:'Permitting',            hint:'Applications, approvals, AHJ correspondence.' },
      { key:'financial',   label:'Financial model',       hint:'Pro forma, capex build-up, sensitivity.' },
      { key:'contract',    label:'Contract / agreement',  hint:'Lease, offtake, EPC, MSA.' },
      { key:'proposal',    label:'Proposal / deck',       hint:'Anything client-facing.' },
      { key:'other',       label:'Other',                 hint:'' }
    ],

    /* ── Grid Atlas ────────────────────────────────────────────────────────
       Our own interconnection and grid-proximity tool, run against the site
       address during screening \u2014 before anybody scores anything, because
       "how far to the nearest substation" is a measurement and the score is a
       judgement that should be made knowing it.

       `enabled` stays false until grid-atlas.html exposes its analysis as a
       module (see grid-atlas-adapter.js). Until then the console still offers
       the tool, opening it with the address prefilled, which is one click
       instead of a copy-paste. */
    gridAtlas: {
      enabled: false,
      url: '/grid-atlas.html',
      /* Run it automatically the first time a deal reaches screening, rather
         than waiting to be asked. It costs nothing, it is the same lookup the
         rep would do by hand, and having it already there is the difference
         between a screening that happens and one that gets deferred. */
      autoRunOnScreening: true
    },

    /* ── Partner screening tool ────────────────────────────────────────────
       Which skill runs for which project type. A type absent from this map is
       not an error \u2014 it falls through to manual scoring.

       Endpoint and key are NOT here. They are Vercel environment variables
       read by /api/score.js, because everything in this file is public.
       See AGENT-SPEC.md for the contract we send them. */
    scoring: {
      enabled: false,            /* flip on once the endpoint is confirmed */
      relayUrl: '/api/score',
      skills: {
        compute:       'datacenter-feasibility',
        compute_gen:   'datacenter-feasibility',
        solar:         'solar-storage-ntp',
        solar_bess:    'solar-storage-ntp',
        bess:          'solar-storage-ntp',
        charging_bess: 'solar-storage-ntp'
      },
      /* WHO RUNS EACH TOOL. Named rather than anonymous for two reasons: the
         button should say "Send to OGI Solar" rather than "run the tool", and
         the score gets stamped with the organisation that produced it, so a
         year from now "who scored this" has an answer and OGI's screening work
         shows up in their partner record alongside anything they referred. */
      providers: {
        'datacenter-feasibility': { name:'OGI Solar', orgId:'ogisolar.com' },
        'solar-storage-ntp':      { name:'OGI Solar', orgId:'ogisolar.com' }
      },
      labels: {
        'datacenter-feasibility': 'OGI Solar \u2014 data centre feasibility',
        'solar-storage-ntp':      'OGI Solar \u2014 solar / storage bankability'
      },

      /* WHICH ENVIRONMENT VARIABLE HOLDS WHICH ENDPOINT. Names only \u2014 the
         values live in Vercel, never here, because this file is public.

         Per skill rather than one global endpoint because the two tools may
         well be separate services on OGI's side, and finding that out after
         wiring a single URL is a rewrite rather than a config line. Both can
         point at the same variable if they share an endpoint. */
      endpoints: {
        'datacenter-feasibility': { urlEnv:'OGI_DATACENTER_URL', keyEnv:'OGI_API_KEY' },
        'solar-storage-ntp':      { urlEnv:'OGI_SOLAR_URL',      keyEnv:'OGI_API_KEY' }
      },
      /* Which axis each answers \u2014 feasibility is a claim about the SITE,
         bankability a claim about the DEAL. Same two axes the verification
         partners sign later, so an agent score and a signed opinion on the
         same site are directly comparable. */
      axis: {
        'datacenter-feasibility': 'feasibility',
        'solar-storage-ntp':      'bankability'
      }
    },

    /* ── Viability scoring ─────────────────────────────────────────────────
       The gate into spend. Edit the criteria and weights freely; the weights
       are relative, not percentages, so adding a criterion does not require
       rebalancing the others.

       Each criterion is scored 0-10 by the person reviewing. The weighted
       result is expressed 0-100 and compared against `threshold`.

       AN UNSCORED CRITERION IS NOT A ZERO. It drops out of both sides of the
       fraction and is reported as unscored, because scoring it zero silently
       punishes a site for a question nobody asked — which turns a weighted
       model into a random one and nobody notices for months.

       If you score with your own tool instead, post the number in and this
       block is only used for the threshold. Either way the breakdown is stored:
       a score with no breakdown cannot be argued with, and a gate nobody can
       argue with is a gate people route around rather than fix. */
    viability: {
      model:     'clearsky-v1',
      threshold: 60,
      criteria: [
        { key:'interconnect', weight:3, label:'Interconnection',
          hint:'Capacity, queue position, distance to a point of interconnection.' },
        { key:'land',         weight:3, label:'Land control',
          hint:'Site control secured or credibly securable. This is a phone call, not a database.' },
        { key:'offtake',      weight:2, label:'Offtake',
          hint:'Is there a buyer for the output on terms that clear.' },
        { key:'permitting',   weight:2, label:'Permitting and zoning',
          hint:'AHJ posture, zoning fit, known objections.' },
        { key:'site',         weight:1, label:'Physical site',
          hint:'Grade, access, flood, wetlands, obstructions.' },
        { key:'economics',    weight:3, label:'Economics',
          hint:'Capex against revenue at plausible assumptions.' },
        { key:'sponsor',      weight:1, label:'Sponsor and counterparty',
          hint:'Can whoever is behind this actually deliver it.' }
      ]
    },

    /* Permitting application types offered in the picker. Free text is still
       allowed — this is a convenience, not a schema. */
    permitTypes: [
      'Interconnection application',
      'Utility study (feasibility)',
      'Utility study (system impact)',
      'Conditional use permit',
      'Zoning / rezoning',
      'Building permit',
      'Electrical permit',
      'Environmental review',
      'Stormwater / grading',
      'Fire marshal review',
      'Air permit',
      'Other'
    ],

    /* Stage-age thresholds, in days. A deal sitting in one stage past its
       threshold is flagged on the board — not late exactly, but stale, and
       stale is what a pipeline review is for. */
    stallDays: {
      referred: 21, screening: 30, qualified: 45, pre_dev: 120, permitting: 180,
      verified: 45, marketplace: 90, committed: 60, funded: 45, construction: 365
    },

    /* Portfolio-level targets, shown against actuals on the dashboard. Set
       them or delete the block; a target nobody set is worse than none,
       because a number with an arbitrary bar next to it reads as a verdict. */
    targets: {
      referralsPerQuarter: null,
      fundedPerYear:       null,
      closedUsdPerYear:    null
    },

    allowSample: true
  }
};


/* ═══════════════════════════════════════════════════════════════════════════════
   SETUP GUARD — same shape as the other repos, one extra check.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (cfg) {
  var problems = [];

  var fb = cfg.firebase || {};
  for (var k in fb) {
    if (fb.hasOwnProperty(k) && String(fb[k]).indexOf('REPLACE_ME') >= 0) {
      problems.push('/config.js still has placeholder Firebase credentials.');
      break;
    }
  }

  /* partner.orgs is no longer checked here \u2014 it stopped being the sign-in gate
     when access moved to request-and-approve. What IS fatal is having no owner:
     with none, the first person to sign in from a non-ClearSky domain lands in
     an approval queue that nobody has the standing to clear. */
  if (!((cfg.access || {}).owner)) {
    problems.push('No owner is set. Nobody can approve access requests \u2014 set '
      + 'access.owner in /config.js to the account that administers the portal.');
  }

  var host = location.hostname;
  var localish = (host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
  if (location.protocol === 'http:' && !localish) {
    problems.push('This page is served over HTTP. Firebase Auth requires HTTPS outside '
      + 'localhost \u2014 sign-in will fail. Install a certificate for ' + host + '.');
  }

  if (!problems.length) return;

  var MSG = 'Deployment not finished: ' + problems.join(' \u00B7 ');
  if (window.console && console.error) {
    for (var i = 0; i < problems.length; i++) console.error('[OMEGA partner setup] ' + problems[i]);
  }

  function apply() {
    var el = document.getElementById('auth-err');
    if (!el) { return setTimeout(apply, 200); }
    el.textContent = MSG;
    el.style.display = 'block';
    var ids = ['email-auth-btn', 'google-signin-btn'];
    for (var j = 0; j < ids.length; j++) {
      var b = document.getElementById(ids[j]);
      if (b) { b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'not-allowed'; b.title = MSG; }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})(window.CLEARSKY_CONFIG);


})();
