/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Form Engine  (v1)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS
   ───────────────────────────────────────────────────────────────────────────
   The first version of the portfolio console asked for input with a chain of
   browser prompt() dialogs. Seventy of them. That was a shortcut and it was the
   wrong one, for reasons that are worth writing down so nobody reintroduces it:

     · You cannot see what you already typed. Every prompt is modal and blind,
       so a five-field entry is five separate acts of memory.
     · You cannot go back. Getting field three wrong means cancelling and
       starting over, which is how people learn to avoid a feature.
     · You cannot offer a list. "Enter a number: 1) BESS 2) Solar" is a dropdown
       that has been flattened into a memory test, and it makes typos into data.
     · There is no validation until submit, and no explanation of why something
       was refused.
     · It cannot be used on a phone in any real sense.

   So: one modal, all the fields visible at once, real dropdowns, inline help,
   validation before anything is written. Everything the console asks for now
   goes through openForm().

   DELIBERATELY NOT A FRAMEWORK. No build step, no dependencies, ~400 lines. It
   renders a field list to HTML, reads values back on submit, and resolves a
   promise. That is the whole contract, and it is small enough that the next
   person can read it in one sitting rather than learning something.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  var _open = null;   // the live form, so Escape and the scrim can close it

  /* ── Field types ─────────────────────────────────────────────────────────
       text      single line
       textarea  multi-line
       number    numeric, optional min/max/step
       money     numeric, rendered with a $ prefix
       select    one of options[] — {value,label,hint} or plain strings
       radio     one of options[], shown as cards. For 3-6 choices that carry
                 a consequence, where a dropdown hides the trade-off
       multi     several of options[], as toggle chips
       date      native date input
       org       an organisation, picked from the registry with free entry
       user      a person, picked from the approved user list
       score     0-10 slider with a "cannot tell" escape. See the note there:
                 blank is not zero, and the control has to make that possible
       static    read-only text, for context inside the form
       divider   a labelled rule
     Every field: { key, type, label, hint, required, value, options, ... } */

  function fieldHtml(f, idx) {
    var id = 'ff_' + idx;
    var req = f.required ? ' <span style="color:var(--bad)">*</span>' : '';
    var h = '<div class="ff" data-key="' + esc(f.key || '') + '" data-type="' + esc(f.type) + '">';

    if (f.type === 'divider') {
      return '<div class="ff-div"><span>' + esc(f.label || '') + '</span></div>';
    }
    if (f.type === 'static') {
      return '<div class="ff-static">' + (f.html || esc(f.value || '')) + '</div>';
    }

    h += '<label class="ff-l" for="' + id + '">' + esc(f.label || f.key) + req + '</label>';

    switch (f.type) {
      case 'textarea':
        h += '<textarea id="' + id + '" class="ff-i" rows="' + (f.rows || 3) + '" '
           + 'placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>';
        break;

      case 'number':
      case 'money':
        h += '<div class="ff-money">' + (f.type === 'money' ? '<span>$</span>' : '')
           + '<input id="' + id + '" class="ff-i" type="number" '
           + (f.step ? 'step="' + f.step + '" ' : 'step="any" ')
           + (f.min != null ? 'min="' + f.min + '" ' : '')
           + (f.max != null ? 'max="' + f.max + '" ' : '')
           + 'placeholder="' + esc(f.placeholder || '') + '" '
           + 'value="' + esc(f.value == null ? '' : f.value) + '"></div>';
        break;

      case 'date':
        h += '<input id="' + id + '" class="ff-i" type="date" value="'
           + esc(f.value ? String(f.value).slice(0,10) : '') + '">';
        break;

      case 'select':
        h += '<select id="' + id + '" class="ff-i">';
        if (!f.required || f.value == null || f.value === '')
          h += '<option value="">' + esc(f.placeholder || 'Choose\u2026') + '</option>';
        (f.options || []).forEach(function (o) {
          var v = (o && o.value != null) ? o.value : o;
          var l = (o && o.label != null) ? o.label : o;
          h += '<option value="' + esc(v) + '"' + (String(f.value) === String(v) ? ' selected' : '')
             + '>' + esc(l) + '</option>';
        });
        h += '</select>';
        break;

      /* Cards, not a dropdown. For a small set of choices where each one
         carries a consequence the person should see before picking — a
         dropdown hides the hint text exactly when it matters most. */
      case 'radio':
        h += '<div class="ff-cards">';
        (f.options || []).forEach(function (o, i) {
          var v = (o && o.value != null) ? o.value : o;
          var l = (o && o.label != null) ? o.label : o;
          var on = String(f.value) === String(v);
          h += '<label class="ff-card' + (on ? ' on' : '') + '">'
             + '<input type="radio" name="' + id + '" value="' + esc(v) + '"' + (on ? ' checked' : '') + '>'
             + '<span><b>' + esc(l) + '</b>'
             + (o && o.hint ? '<em>' + esc(o.hint) + '</em>' : '') + '</span></label>';
        });
        h += '</div>';
        break;

      case 'multi':
        var cur = Array.isArray(f.value) ? f.value.map(String) : [];
        h += '<div class="ff-chips" id="' + id + '">';
        (f.options || []).forEach(function (o) {
          var v = (o && o.value != null) ? o.value : o;
          var l = (o && o.label != null) ? o.label : o;
          h += '<span class="ff-chip' + (cur.indexOf(String(v)) >= 0 ? ' on' : '') + '" '
             + 'data-v="' + esc(v) + '">' + esc(l) + '</span>';
        });
        h += '</div>';
        break;

      /* ── Organisations, picked by NAME ───────────────────────────────────
         A datalist puts the VALUE in the box, and for an organisation the
         value is the domain — so the field showed "sunesol.com" while the
         person was looking for "Sunesol Energy". The domain is what the system
         needs; the name is what people know.

         So: a real select listing names, with the domain as small print, plus
         an explicit "add a new one" escape that reveals a text input. The
         registry stays a convenience rather than a gate — an organisation
         nobody has registered yet still has to be nameable, or the first thing
         the form does is block the work. */
      case 'orgpick':
        var newId = id + '_new';
        h += '<select id="' + id + '" class="ff-i" '
           + 'onchange="this.parentNode.querySelector(\'.ff-neworg\').style.display='
           +   '(this.value===\'__new__\'?\'block\':\'none\')">';
        if (!f.required || !f.value) h += '<option value="">' + esc(f.placeholder || 'Choose\u2026') + '</option>';
        (f.options || []).forEach(function (o) {
          var v = (o && o.value != null) ? o.value : o;
          var l = (o && o.label != null) ? o.label : o;
          h += '<option value="' + esc(v) + '"' + (String(f.value) === String(v) ? ' selected' : '')
             + '>' + esc(l) + '</option>';
        });
        h += '<option value="__new__">+ A company not listed here\u2026</option></select>'
           + '<div class="ff-neworg" style="display:none;margin-top:8px">'
           +   '<input id="' + newId + '" class="ff-i" placeholder="Email domain, e.g. acme.com">'
           +   '<div class="ff-h">Their email domain. It is how people from that company '
           +   'sign in and how their deals are scoped, so it has to be real.</div>'
           + '</div>';
        break;

      /* A datalist rather than a hard select: the registry is a convenience,
         not a gate. A partner you have not registered yet still has to be
         nameable, or the first thing the form does is block the work. */
      case 'org':
      case 'user':
        var listId = id + '_list';
        h += '<input id="' + id + '" class="ff-i" list="' + listId + '" '
           + 'placeholder="' + esc(f.placeholder || '') + '" '
           + 'value="' + esc(f.value || '') + '" autocomplete="off">'
           + '<datalist id="' + listId + '">';
        (f.options || []).forEach(function (o) {
          var v = (o && o.value != null) ? o.value : o;
          var l = (o && o.label != null) ? o.label : v;
          h += '<option value="' + esc(v) + '">' + esc(l) + '</option>';
        });
        h += '</datalist>';
        break;

      /* 0-10 with an explicit "cannot tell". The escape has to be a control,
         not an empty box: if leaving it blank is indistinguishable from not
         having reached it yet, people fill in a guess, and a guessed criterion
         is worse than a missing one because it looks the same as knowledge. */
      case 'score':
        var val = (f.value == null || f.value === '') ? '' : f.value;
        h += '<div class="ff-score" id="' + id + '">'
           + '<input type="range" min="0" max="10" step="1" value="' + (val === '' ? 5 : val) + '"'
           + (val === '' ? ' disabled' : '') + '>'
           + '<output>' + (val === '' ? '\u2014' : val + '/10') + '</output>'
           + '<label class="ff-na"><input type="checkbox"' + (val === '' ? ' checked' : '') + '> '
           + 'Cannot tell</label></div>';
        break;

      default:
        h += '<input id="' + id + '" class="ff-i" type="' + (f.inputType || 'text') + '" '
           + 'placeholder="' + esc(f.placeholder || '') + '" '
           + 'value="' + esc(f.value == null ? '' : f.value) + '"'
           + (f.autofocus ? ' autofocus' : '') + '>';
    }

    if (f.hint) h += '<div class="ff-h">' + esc(f.hint) + '</div>';
    h += '<div class="ff-err"></div></div>';
    return h;
  }


  function readField(el, f) {
    var t = f.type;
    if (t === 'divider' || t === 'static') return undefined;

    if (t === 'orgpick') {
      var sel = el.querySelector('select');
      var v = sel ? sel.value : '';
      if (v === '__new__') {
        var nu = el.querySelector('.ff-neworg input');
        return nu ? nu.value.trim().toLowerCase() : '';
      }
      return v;
    }
    if (t === 'multi') {
      var out = [];
      el.querySelectorAll('.ff-chip.on').forEach(function (c) { out.push(c.getAttribute('data-v')); });
      return out;
    }
    if (t === 'radio') {
      var r = el.querySelector('input[type=radio]:checked');
      return r ? r.value : '';
    }
    if (t === 'score') {
      var na = el.querySelector('.ff-na input');
      if (na && na.checked) return null;           // null means "cannot tell"
      var rg = el.querySelector('input[type=range]');
      return rg ? Number(rg.value) : null;
    }
    var i = el.querySelector('.ff-i');
    if (!i) return '';
    if (t === 'number' || t === 'money') return i.value === '' ? null : Number(i.value);
    if (t === 'date') return i.value ? new Date(i.value + 'T12:00:00').toISOString() : null;
    return i.value.trim();
  }


  /* ── openForm ────────────────────────────────────────────────────────────
     Resolves with the values object, or with null if cancelled. Cancelling
     resolves rather than rejects, deliberately: a cancelled dialog is a normal
     outcome and forcing every caller into a catch block to handle "the user
     changed their mind" is how real errors end up swallowed. */
  function openForm(spec) {
    return new Promise(function (resolve) {
      close();

      var fields = (spec.fields || []).filter(Boolean);
      var wrap = document.createElement('div');
      wrap.className = 'ff-scrim';
      wrap.innerHTML =
          '<div class="ff-modal" role="dialog" aria-modal="true">'
        +   '<div class="ff-head">'
        +     '<div><h3>' + esc(spec.title || 'Details') + '</h3>'
        +     (spec.intro ? '<p>' + esc(spec.intro) + '</p>' : '') + '</div>'
        +     '<button class="ff-x" aria-label="Close">\u00d7</button>'
        +   '</div>'
        +   '<div class="ff-body">'
        +     (spec.warning ? '<div class="ff-warn">' + esc(spec.warning) + '</div>' : '')
        +     fields.map(fieldHtml).join('')
        +   '</div>'
        +   '<div class="ff-foot">'
        +     '<div class="ff-foot-note">' + esc(spec.footNote || '') + '</div>'
        +     '<button class="ff-btn ff-cancel">' + esc(spec.cancelLabel || 'Cancel') + '</button>'
        +     '<button class="ff-btn ff-go' + (spec.danger ? ' danger' : '') + '">'
        +       esc(spec.submitLabel || 'Save') + '</button>'
        +   '</div>'
        + '</div>';
      document.body.appendChild(wrap);

      var els = wrap.querySelectorAll('.ff');

      /* ── Errors clear as you fix them ──────────────────────────────────
         Validation only ran on submit, and the message stayed on screen while
         the person typed the correction — so a field showing "add the city and
         state" was still showing it after the city and state had been added.
         That reads as "the app does not believe me", which is worse than no
         message at all.

         Only clears; never validates as you type. Complaining at somebody
         halfway through typing an address is its own kind of rude. */
      wrap.addEventListener('input', clearFieldError, true);
      wrap.addEventListener('change', clearFieldError, true);
      function clearFieldError(e) {
        var f = e.target && e.target.closest ? e.target.closest('.ff') : null;
        if (!f || !f.classList.contains('bad')) return;
        f.classList.remove('bad');
        var err = f.querySelector('.ff-err');
        if (err) err.textContent = '';
      }

      /* Chips and score controls need live handlers; everything else is read
         on submit. Kept here rather than delegated so the markup above stays
         a pure function of the spec. */
      wrap.querySelectorAll('.ff-chips').forEach(function (box) {
        box.addEventListener('click', function (e) {
          var c = e.target.closest('.ff-chip');
          if (c) c.classList.toggle('on');
        });
      });
      wrap.querySelectorAll('.ff-cards').forEach(function (box) {
        box.addEventListener('change', function () {
          box.querySelectorAll('.ff-card').forEach(function (c) {
            c.classList.toggle('on', !!c.querySelector('input:checked'));
          });
        });
      });
      wrap.querySelectorAll('.ff-score').forEach(function (box) {
        var rg = box.querySelector('input[type=range]');
        var out = box.querySelector('output');
        var na = box.querySelector('.ff-na input');
        function paint() {
          if (na.checked) { rg.disabled = true;  out.textContent = '\u2014'; }
          else            { rg.disabled = false; out.textContent = rg.value + '/10'; }
        }
        rg.addEventListener('input', paint);
        na.addEventListener('change', paint);
      });

      function collect() {
        var v = {}, problems = [];
        fields.forEach(function (f, i) {
          if (f.type === 'divider' || f.type === 'static') return;
          var el = wrap.querySelector('.ff[data-key="' + f.key + '"]');
          if (!el) return;
          var val = readField(el, f);
          v[f.key] = val;
          var errEl = el.querySelector('.ff-err');
          errEl.textContent = ''; el.classList.remove('bad');

          var empty = val == null || val === ''
                   || (Array.isArray(val) && !val.length);
          if (f.required && empty) {
            problems.push({ key:f.key, msg: f.requiredMsg || 'Required.' });
          } else if (!empty && f.validate) {
            var m = f.validate(val, v);
            if (m) problems.push({ key:f.key, msg:m });
          }
        });
        if (!problems.length && spec.validate) {
          var m2 = spec.validate(v);
          if (m2) problems.push({ key: m2.key || (fields[0] && fields[0].key), msg: m2.msg || m2 });
        }
        return { values:v, problems:problems };
      }

      function submit() {
        var r = collect();
        if (r.problems.length) {
          r.problems.forEach(function (p) {
            var el = wrap.querySelector('.ff[data-key="' + p.key + '"]');
            if (el) { el.classList.add('bad'); el.querySelector('.ff-err').textContent = p.msg; }
          });
          var first = wrap.querySelector('.ff.bad');
          if (first) first.scrollIntoView({ block:'center', behavior:'smooth' });
          return;
        }
        done(r.values);
      }
      function done(v) { cleanup(); resolve(v); }

      /* ── LOSING TYPED WORK IS NOT AN ACCEPTABLE OUTCOME ──────────────────
         The first version closed on a scrim click, which meant a stray click
         beside a long form threw the whole thing away with no warning and no
         undo. On the New project form that is a dozen fields.

         So the rules are now:

           scrim click  never closes. It nudges, so the click is visibly
                        registered rather than seeming ignored.
           Escape       closes immediately if nothing has been typed;
                        otherwise needs a second press, with the footer
                        saying so.
           Cancel / ×   explicit intent, so they work — but if anything has
                        been typed they ask once first.

         The asymmetry is deliberate. Clicking the background is ambiguous;
         pressing Cancel is not. */
      function isDirty() {
        try { return JSON.stringify(collect().values) !== baseline; }
        catch (e) { return true; }   /* if in doubt, protect the work */
      }
      function nudge() {
        var m = wrap.querySelector('.ff-modal');
        if (!m) return;
        m.classList.remove('ff-nudge');
        void m.offsetWidth;                 /* restart the animation */
        m.classList.add('ff-nudge');
        hint('Close with Cancel or \u00d7 \u2014 clicking outside will not discard this.');
      }
      var _hintT;
      function hint(msg) {
        var el = wrap.querySelector('.ff-foot-note');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('warn');
        clearTimeout(_hintT);
        _hintT = setTimeout(function () {
          el.textContent = spec.footNote || '';
          el.classList.remove('warn');
        }, 4000);
      }

      var armed = false, _armT;
      function cancel(force) {
        if (!force && isDirty() && !armed) {
          armed = true;
          var btn = wrap.querySelector('.ff-cancel');
          if (btn) btn.textContent = 'Discard changes?';
          hint('Press again to discard what you have typed.');
          clearTimeout(_armT);
          _armT = setTimeout(function () {
            armed = false;
            if (btn) btn.textContent = spec.cancelLabel || 'Cancel';
          }, 4000);
          return;
        }
        cleanup(); resolve(null);
      }
      function cleanup() {
        document.removeEventListener('keydown', key);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        _open = null;
      }
      function key(e) {
        if (e.key === 'Escape') cancel();
        /* Cmd/Ctrl+Enter submits from anywhere, including a textarea, so a
           long form does not require reaching for the mouse. */
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
      }

      wrap.querySelector('.ff-go').addEventListener('click', submit);
      wrap.querySelector('.ff-cancel').addEventListener('click', function () { cancel(); });
      wrap.querySelector('.ff-x').addEventListener('click', function () { cancel(); });
      /* Scrim: nudge, never close. See the note on cancel(). */
      wrap.addEventListener('click', function (e) { if (e.target === wrap) nudge(); });
      document.addEventListener('keydown', key);
      _open = { cleanup: cleanup };

      /* Snapshot AFTER render, so the comparison is against what the form was
         opened with rather than against empty — otherwise every edit form
         with prefilled values would look dirty the moment it appeared. */
      var baseline = '';
      try { baseline = JSON.stringify(collect().values); } catch (e) { baseline = ''; }

      var focus = wrap.querySelector('.ff-i, .ff-card input, .ff-chip');
      if (focus && focus.focus) setTimeout(function () { focus.focus(); }, 40);
    });
  }

  function close() { if (_open) _open.cleanup(); }

  /* A yes/no that matches the form styling, so a destructive act does not
     drop back to a native confirm() halfway through a considered flow. */
  function confirmDialog(spec) {
    return openForm({
      title: spec.title,
      intro: spec.intro,
      warning: spec.warning,
      fields: spec.fields || [],
      submitLabel: spec.submitLabel || 'Confirm',
      cancelLabel: spec.cancelLabel || 'Cancel',
      danger: spec.danger !== false,
      footNote: spec.footNote
    }).then(function (v) { return v !== null; });
  }

  global.Forms = { open: openForm, close: close, confirm: confirmDialog, esc: esc };
})(window);
