/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Access Layer  (v1)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Loaded by BOTH consoles in this repo — index.html (verification) and
   portfolio.html (deal flow). Identity has to be one implementation or the two
   pages drift into two different answers to "who is this person", and the one
   that drifts is always the one nobody is looking at.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT CHANGED, AND WHAT IT COSTS
   ─────────────────────────────────────────────────────────────────────────────
   v1 of the verification console gated sign-in on a hardcoded domain allowlist
   in config.js. That was right for two named partners and wrong for a portal
   meant to hold every manufacturer, utility and shareholder who refers a deal:
   every new partner meant an edit and a redeploy, and the person who most
   needed access was the person you hadn't added yet.

   So access is now a REQUEST plus an APPROVAL, held in `omega_users`.

   Be clear-eyed about the trade. The allowlist meant a stranger could not get
   in at all. The approval queue means a stranger can reach a pending screen.
   That is only safe if pending leaks nothing, so:

     · a pending user's queries are refused by the rules, not merely hidden
     · the pending screen names no deal, no partner and no other user
     · nothing is created for them beyond their own request document

   Check those three before widening anything here.

   ─────────────────────────────────────────────────────────────────────────────
   THE OWNER IS PINNED IN CONFIG AND CANNOT BE REMOVED FROM THE UI
   ─────────────────────────────────────────────────────────────────────────────
   `access.owner` in config.js. The owner cannot be demoted, suspended or
   deleted by anyone including themselves, and the rules say so independently.

   This is not deference to a person. It is that the account which can restore
   everyone else's access must not be losable by a misclick, and every
   role system that skips this eventually locks its own administrators out at
   the worst possible moment. Moving it is a config edit and a redeploy, which
   is the correct amount of friction for that particular change.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var COLLECTION = 'omega_users';
  var ORGS       = 'omega_partner_orgs';

  /* ── Roles ───────────────────────────────────────────────────────────────
     Six, and the two in the middle are the ones the shape exists for.

     `limited_admin` is an admin scoped to named orgs. It exists because "can
     approve users" and "can approve ANY user" are very different grants, and
     collapsing them means the only way to let somebody manage their region is
     to let them manage everyone's.

     `partner_admin` manages their OWN org's members and nobody else's. It is
     what lets a manufacturer onboard their own five engineers without a
     ClearSky ticket — which is the difference between a portal that scales and
     one where you are the bottleneck.

     The first user of a NEW org can never be approved by their own org's
     partner_admin, because there isn't one yet. ClearSky approves the first;
     they approve the rest. Without that rule anyone with a company address
     invents an org and approves themselves into it.                        */
  var ROLES = [
    { key:'owner', label:'Owner', rank:100, internal:true,
      hint:'Pinned in config. Cannot be demoted or suspended by anyone.',
      can:['approve_any','role_any','manage_orgs_any','write_deal','write_funding',
           'write_bom','sign_verdict','see_all','lock_attribution'] },

    { key:'admin', label:'Administrator', rank:80, internal:true,
      hint:'Full access. Can approve anyone and grant any role below admin.',
      can:['approve_any','role_below_admin','manage_orgs_any','write_deal','write_funding',
           'write_bom','sign_verdict','see_all','lock_attribution'] },

    { key:'limited_admin', label:'Limited administrator', rank:60, internal:true,
      hint:'Administrator, but only over the partner organisations named on their account.',
      can:['approve_scoped','role_below_admin','write_deal','write_bom','see_scoped'] },

    { key:'partner_admin', label:'Partner administrator', rank:40,
      hint:'Manages their own organisation\u2019s users. Sees only their own org\u2019s deals.',
      can:['approve_own_org','role_below_partner_admin','sign_verdict','see_own'] },

    { key:'member', label:'Member', rank:20,
      hint:'Works their organisation\u2019s assignments and deals.',
      can:['sign_verdict','see_own'] },

    { key:'viewer', label:'Viewer', rank:10,
      hint:'Read-only on their own organisation. Cannot sign anything.',
      can:['see_own'] }
  ];

  var STATUSES = [
    { key:'pending',   label:'Awaiting approval', color:'#D97706' },
    { key:'active',    label:'Active',            color:'#16A34A' },
    { key:'suspended', label:'Suspended',         color:'#DC2626' },
    { key:'rejected',  label:'Rejected',          color:'#6B7280' }
  ];

  /* Why a partner is in the portal at all. Not cosmetic: a battery
     manufacturer who refers a site AND supplies its cells has two separate
     commercial relationships with you, and a single "partner" label makes the
     second one invisible in every report you will ever run. */
  var ORG_KINDS = [
    { key:'manufacturer', label:'Manufacturer',      hint:'Battery, inverter, module, EVSE.' },
    { key:'developer',    label:'Developer / EPC',   hint:'Builds or co-develops.' },
    { key:'utility',      label:'Utility',           hint:'Offtake, interconnection, siting.' },
    { key:'investor',     label:'Investor',          hint:'Provides capital.' },
    { key:'shareholder',  label:'Shareholder',       hint:'Holds equity in ClearSky.' },
    { key:'verifier',     label:'Verification partner', hint:'Signs feasibility / bankability opinions.' },
    { key:'broker',       label:'Broker / referrer', hint:'Introduces deals, no delivery role.' },
    { key:'internal',     label:'ClearSky',          hint:'Our own staff.' }
  ];

  function find(list, k) {
    for (var i = 0; i < list.length; i++) if (list[i].key === k) return list[i];
    return null;
  }
  function roleOf(k)    { return find(ROLES, k) || { key:k||'none', label:'No role', rank:0, can:[] }; }
  function statusOf(k)  { return find(STATUSES, k) || { key:k, label:k || 'Unknown', color:'#6B7280' }; }
  function orgKindOf(k) { return find(ORG_KINDS, k) || { key:k, label:k || 'Partner' }; }


  /* ── Config ─────────────────────────────────────────────────────────────── */
  function cfg()    { return (global.CLEARSKY_CONFIG || {}); }
  function acc()    { return cfg().access || {}; }
  function ownerEmail() { return String(acc().owner || '').toLowerCase(); }
  function internalDomains() {
    return (cfg().adminDomains || ['clearsky-usa.com', 'csebuilders.com'])
      .map(function (d) { return String(d).toLowerCase(); });
  }
  function domainOf(email) {
    var s = String(email || '').toLowerCase(), i = s.indexOf('@');
    return i < 0 ? '' : s.slice(i + 1);
  }
  function isInternalDomain(email) {
    return internalDomains().indexOf(domainOf(email)) >= 0;
  }


  /* ── State ──────────────────────────────────────────────────────────────── */
  var _db = null, _me = null, _orgs = {}, _users = [];

  function stamp() { return new Date().toISOString(); }

  /* Doc id is the Auth uid, not the email. An email can be reassigned inside a
     company; a uid cannot. Keying on email would mean a departing employee's
     successor silently inherits their approvals along with their mailbox. */
  function docId(user) { return user.uid; }

  /* ── Sign-in resolution ──────────────────────────────────────────────────
     Returns the caller's record, creating a pending one on first sign-in.

     ClearSky's own domains are auto-activated as `admin` — they are already
     inside the trust boundary and making staff wait for approval from staff is
     a loop with no exit. The OWNER is forced to `owner` on every sign-in
     regardless of what the document says, so a bad write cannot orphan the
     account that fixes bad writes.                                          */
  function resolve(db, user) {
    _db = db;
    var email = String(user.email || '').toLowerCase();
    var ref = db.collection(COLLECTION).doc(docId(user));

    return ref.get().then(function (snap) {
      if (snap.exists) {
        var d = snap.data() || {};
        return finish(normalize(snap.id, d), ref, user);
      }
      /* First sign-in. Create the request, not the access. */
      var seed = {
        uid:       user.uid,
        email:     email,
        name:      user.displayName || email.split('@')[0],
        orgId:     domainOf(email),
        orgName:   '',
        role:      isInternalDomain(email) ? 'admin' : 'viewer',
        status:    isInternalDomain(email) ? 'active' : 'pending',
        requestedAt: stamp(),
        approvedAt:  isInternalDomain(email) ? stamp() : null,
        approvedBy:  isInternalDomain(email) ? 'auto (ClearSky domain)' : '',
        manageOrgs:  [],
        lastSeenAt:  stamp()
      };
      if (email === ownerEmail()) {
        seed.role = 'owner'; seed.status = 'active';
        seed.approvedBy = 'config.access.owner';
      }
      return ref.set(seed).then(function () {
        return finish(normalize(user.uid, seed), ref, user);
      });
    });
  }

  function finish(rec, ref, user) {
    /* The owner is asserted from config on every sign-in, never read from the
       document. A wrong value in Firestore must not be able to demote the one
       account that can repair Firestore. */
    if (rec.email === ownerEmail()) { rec.role = 'owner'; rec.status = 'active'; }
    _me = rec;
    /* Non-blocking. A failed heartbeat is not a reason to refuse a sign-in. */
    ref.update({ lastSeenAt: stamp() })['catch'](function () {});
    return rec;
  }

  function normalize(id, d) {
    d = d || {};
    return {
      id:         id,
      uid:        d.uid || id,
      email:      String(d.email || '').toLowerCase(),
      name:       d.name || String(d.email || '').split('@')[0],
      orgId:      String(d.orgId || '').toLowerCase(),
      orgName:    d.orgName || '',
      role:       d.role || 'viewer',
      status:     d.status || 'pending',
      /* Which partner orgs a limited_admin governs. Empty on every other role
         and meaningless there — see canApprove(). */
      manageOrgs: (d.manageOrgs || []).map(function (s) { return String(s).toLowerCase(); }),
      title:      d.title || '',
      phone:      d.phone || '',
      requestedAt:d.requestedAt || null,
      approvedAt: d.approvedAt || null,
      approvedBy: d.approvedBy || '',
      suspendedAt:d.suspendedAt || null,
      lastSeenAt: d.lastSeenAt || null,
      note:       d.note || '',
      _raw:       d
    };
  }

  function me() { return _me; }
  function isOwner(u)     { return (u || _me) && (u || _me).email === ownerEmail(); }
  function isActive(u)    { u = u || _me; return !!u && u.status === 'active'; }
  function isInternal(u)  { u = u || _me; return !!u && roleOf(u.role).internal === true; }
  function can(perm, u) {
    u = u || _me;
    if (!u || u.status !== 'active') return false;
    return roleOf(u.role).can.indexOf(perm) >= 0;
  }

  /* ── Who may act on whom ─────────────────────────────────────────────────
     One function, used by every button that changes somebody's access, so the
     rule is stated once. The UI calls it to decide what to show; the rules
     enforce the same thing independently, because a hidden button is not a
     permission check.                                                       */
  function canApprove(target, u) {
    u = u || _me;
    if (!u || u.status !== 'active') return false;
    if (u.email === target.email) return false;      // nobody approves themselves
    if (isOwner(target)) return false;               // the owner is untouchable

    if (can('approve_any', u)) return true;

    if (can('approve_scoped', u))
      return u.manageOrgs.indexOf(target.orgId) >= 0;

    if (can('approve_own_org', u))
      /* STRICTLY below their own rank, not at-or-below. At-or-below would let
         two partner admins in the same company suspend each other, and the
         first one to click wins an argument that should never have been
         settled in software. It also means a partner admin cannot mint a
         second one and lose control of their own org.

         The rules clamp the same thing independently; this is here so the
         button is absent rather than present-and-failing. */
      return target.orgId === u.orgId && roleOf(target.role).rank < roleOf(u.role).rank;

    return false;
  }

  /* Roles this person may hand out. Nobody grants a role above their own —
     the classic privilege-escalation hole, and it is one line to close. */
  function grantableRoles(u) {
    u = u || _me;
    if (!u) return [];
    var mine = roleOf(u.role).rank;
    return ROLES.filter(function (r) {
      if (r.key === 'owner') return false;                       // config only
      if (r.internal && !isInternal(u)) return false;            // no partner mints staff
      if (can('role_any', u)) return true;
      return r.rank < mine;
    });
  }


  /* ── Writes ─────────────────────────────────────────────────────────────
     Every one of these logs. Access changes are the events you most want a
     trail for and the ones people most often make quietly.                 */
  function audit(action, target, detail) {
    return {
      ts: stamp(), action: action,
      by: _me ? _me.email : '', byName: _me ? _me.name : '',
      target: target ? target.email : '', detail: detail || ''
    };
  }

  function setAccess(target, fields, action, detail) {
    if (!_db) return Promise.reject(new Error('Not connected.'));
    if (isOwner(target))
      return Promise.reject(new Error(
        'The owner account is pinned in config.js and cannot be changed here. '
        + 'Moving it is a config edit and a redeploy \u2014 which is the right amount of '
        + 'friction for the one account that can restore everyone else\u2019s access.'));
    if (!canApprove(target, _me))
      return Promise.reject(new Error('You cannot change access for ' + target.email + '.'));

    var body = {};
    for (var k in fields) if (fields.hasOwnProperty(k)) body[k] = fields[k];
    body.updatedAt = stamp();
    body.accessLog = firebase.firestore.FieldValue.arrayUnion(audit(action, target, detail));
    return _db.collection(COLLECTION).doc(target.id).update(body);
  }

  function approve(target, role, orgName, manageOrgs) {
    var grantable = grantableRoles().map(function (r) { return r.key; });
    if (grantable.indexOf(role) < 0)
      return Promise.reject(new Error('You cannot grant the role ' + roleOf(role).label + '.'));
    return setAccess(target, {
      status:'active', role:role,
      orgName: orgName || target.orgName || '',
      manageOrgs: role === 'limited_admin' ? (manageOrgs || []) : [],
      approvedAt: stamp(), approvedBy: _me.email, suspendedAt: null
    }, 'approved', roleOf(role).label);
  }
  function reject(target, why) {
    if (!why) return Promise.reject(new Error('Give a reason. It goes in the record.'));
    return setAccess(target, { status:'rejected', note:why }, 'rejected', why);
  }
  function suspend(target, why) {
    return setAccess(target, { status:'suspended', suspendedAt:stamp(), note:why || '' },
      'suspended', why || '');
  }
  function restore(target) {
    return setAccess(target, { status:'active', suspendedAt:null }, 'restored', '');
  }
  function setRole(target, role) {
    var grantable = grantableRoles().map(function (r) { return r.key; });
    if (grantable.indexOf(role) < 0)
      return Promise.reject(new Error('You cannot grant the role ' + roleOf(role).label + '.'));
    return setAccess(target, {
      role: role,
      manageOrgs: role === 'limited_admin' ? (target.manageOrgs || []) : []
    }, 'role_changed', roleOf(role).label);
  }
  function setManagedOrgs(target, orgs) {
    if (target.role !== 'limited_admin')
      return Promise.reject(new Error('Managed organisations only apply to a limited administrator.'));
    return setAccess(target, { manageOrgs: orgs || [] }, 'scope_changed', (orgs || []).join(', '));
  }

  /* A person editing their OWN profile. Deliberately a different function with
     a different field list: if this shared setAccess() then one forgotten
     field name is a self-promotion path. */
  function updateSelf(fields) {
    if (!_db || !_me) return Promise.reject(new Error('Not signed in.'));
    var allowed = ['name', 'title', 'phone', 'orgName'], body = {};
    for (var i = 0; i < allowed.length; i++)
      if (fields[allowed[i]] != null) body[allowed[i]] = fields[allowed[i]];
    if (!Object.keys(body).length) return Promise.resolve();
    body.updatedAt = stamp();
    return _db.collection(COLLECTION).doc(_me.id).update(body);
  }


  /* ── Reads ──────────────────────────────────────────────────────────────── */
  function loadUsers() {
    if (!_db || !_me) return Promise.resolve([]);
    var col = _db.collection(COLLECTION);
    /* A partner_admin reads only their own org. Scoping the QUERY as well as
       the rules matters: an unscoped query against a scoped rule is refused
       outright, which surfaces as "the user list is broken" rather than as
       "you are not allowed to see that". */
    var q = (can('approve_any') || can('approve_scoped')) ? col : col.where('orgId', '==', _me.orgId);
    return q.get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(normalize(d.id, d.data() || {})); });
      out.sort(function (a, b) {
        /* Pending first — it is the only row anybody has to act on. */
        if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
        return (a.orgId + a.name).localeCompare(b.orgId + b.name);
      });
      _users = out;
      return out;
    });
  }
  function users() { return _users.slice(); }
  function pendingCount() {
    var n = 0;
    for (var i = 0; i < _users.length; i++)
      if (_users[i].status === 'pending' && canApprove(_users[i])) n++;
    return n;
  }

  /* ── Partner organisations ───────────────────────────────────────────────
     A registry, not a gate. Sign-in no longer depends on it — approval does.
     What it holds is the commercial fact about an org that a user document
     should not: what kind of partner they are, and what the referral
     arrangement is. Those belong to the company, not to whoever from it
     happens to be logged in.                                               */
  function loadOrgs() {
    if (!_db) return Promise.resolve({});
    return _db.collection(ORGS).get().then(function (snap) {
      var map = {};
      snap.forEach(function (d) {
        var v = d.data() || {};
        map[d.id.toLowerCase()] = {
          orgId:    d.id.toLowerCase(),
          name:     v.name || d.id,
          kind:     v.kind || 'broker',
          kinds:    v.kinds || (v.kind ? [v.kind] : []),
          agreementRef:  v.agreementRef || '',
          referralBasis: v.referralBasis || '',
          isShareholder: v.isShareholder === true,
          active:   v.active !== false,
          note:     v.note || ''
        };
      });
      _orgs = map;
      return map;
    })['catch'](function (e) {
      console.warn('[access] org registry unreadable:', e && e.message);
      return {};
    });
  }
  /* The registry, with config's known organisations underneath it. A written
     registry entry always wins: editing an organisation in the console has to
     beat editing a file nobody redeploys, or the console lies. */
  function orgs() {
    var known = (acc().knownOrgs) || {}, out = {};
    for (var k in known) if (known.hasOwnProperty(k)) {
      out[k] = { orgId:k, name:known[k].name, kind:known[k].kind || 'broker',
                 note:known[k].note || '', active:true, seeded:true };
    }
    for (var j in _orgs) if (_orgs.hasOwnProperty(j)) out[j] = _orgs[j];
    return out;
  }
  function orgName(orgId) {
    var k = String(orgId || '').toLowerCase();
    var all = orgs();
    return (all[k] && all[k].name) || k || '\u2014';
  }
  function saveOrg(orgId, fields) {
    if (!_db) return Promise.reject(new Error('Not connected.'));
    if (!can('approve_any')) return Promise.reject(new Error('Administrators only.'));
    fields.updatedAt = stamp();
    return _db.collection(ORGS).doc(String(orgId).toLowerCase()).set(fields, { merge:true });
  }

  /* What a pending user is told. It names nothing — no deal, no partner, no
     other user — because a pending account is an unverified stranger and the
     screen they can reach is the one place that has to assume it. */
  function pendingMessage(rec) {
    return 'Your request to join the ClearSky-OMEGA partner portal is with an administrator. '
         + 'You will be able to sign in as soon as it is approved. Requested '
         + (rec && rec.requestedAt ? new Date(rec.requestedAt).toLocaleDateString() : 'just now')
         + '.';
  }
  function blockedMessage(rec) {
    if (!rec) return 'This account has no access to the portal.';
    if (rec.status === 'suspended')
      return 'This account is suspended. Contact ' + (cfg().supportEmail || 'ClearSky') + '.';
    if (rec.status === 'rejected')
      return 'This access request was not approved. Contact ' + (cfg().supportEmail || 'ClearSky') + '.';
    return pendingMessage(rec);
  }

  global.OmegaAccess = {
    ROLES:ROLES, STATUSES:STATUSES, ORG_KINDS:ORG_KINDS,
    roleOf:roleOf, statusOf:statusOf, orgKindOf:orgKindOf,
    domainOf:domainOf, isInternalDomain:isInternalDomain, ownerEmail:ownerEmail,
    resolve:resolve, normalize:normalize, me:me,
    isOwner:isOwner, isActive:isActive, isInternal:isInternal, can:can,
    canApprove:canApprove, grantableRoles:grantableRoles,
    approve:approve, reject:reject, suspend:suspend, restore:restore,
    setRole:setRole, setManagedOrgs:setManagedOrgs, updateSelf:updateSelf,
    loadUsers:loadUsers, users:users, pendingCount:pendingCount,
    loadOrgs:loadOrgs, orgs:orgs, orgName:orgName, saveOrg:saveOrg,
    pendingMessage:pendingMessage, blockedMessage:blockedMessage,
    COLLECTION:COLLECTION, ORGS:ORGS
  };
})(window);
