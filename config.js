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

    /* Shown on the pending screen so a waiting partner knows who to chase. */
    approvalContact: 'tom@clearsky-usa.com'
  },


  /* ═════════════════════════════════════════════════════════════════════════
     PORTFOLIO
     Read by /portfolio-data.js and /portfolio.html.
     ═════════════════════════════════════════════════════════════════════════ */
  portfolio: {

    collection: 'deals',

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

    /* Stage-age thresholds, in days. A deal sitting in one stage past its
       threshold is flagged on the board — not late exactly, but stale, and
       stale is what a pipeline review is for. */
    stallDays: {
      referred: 21, screening: 30, pre_dev: 120, verified: 45,
      marketplace: 90, committed: 60, funded: 45, construction: 365
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
