/* usual: the window. Talks to usual's own little server on this computer. */
(function () {
  'use strict';
  var C = JSON.parse(document.getElementById('config').textContent);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $('#main');
  var S = { d: null, tab: 'usuals', sel: null, way: null, fields: [], edit: null, sheet: null };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var night = function () { return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(what, body) {
    return fetch(C.base + '/api/' + what, { method: 'POST', headers: { 'content-type': 'application/json', 'x-usual': C.secret }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 423) { showLock(); throw new Error('usual is locked.'); }
          if (!r.ok) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error("usual isn't running. Open it again from Terminal (usual) or Spotlight."); });
  }
  function money(n) { var c = (S.d && S.d.settings.currency) || '$'; n = Number(n) || 0; return (n < 0 ? '-' : '') + c + Math.abs(n).toFixed(2); }
  var toastT = 0;
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2400); }
  function copy(text, btn) {
    var done = function () {
      if (btn) { var was = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('copied'); setTimeout(function () { btn.textContent = was; btn.classList.remove('copied'); }, 1400); }
      else toast('Copied');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast("Couldn't copy"); } ta.remove(); }
  }
  function ago(t) {
    if (!t) return '';
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var days = Math.round((d0 - new Date(new Date(t).setHours(0, 0, 0, 0))) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return 'on ' + DAYS[new Date(t).getDay()];
    return 'on ' + new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function find(id) { return S.d.orders.filter(function (o) { return o.id === id; })[0]; }
  function place(id) { return S.d.places.filter(function (p) { return p.id === id; })[0]; }
  function person(id) { return S.d.people.filter(function (p) { return p.id === id; })[0]; }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* ---------- loading, and the lock ---------- */
  function load() {
    return api('status').then(function (s) {
      $('#lockNow').hidden = !s.lock;
      if (s.locked) return showLock(s);
      return api('state').then(function (d) { S.d = d; $('#locked').hidden = true; render(); });
    }).catch(function (e) { if (!/locked/.test(e.message)) { main.innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; } });
  }
  function showLock(s) {
    $('#locked').hidden = false;
    $('#lockNote').textContent = s && s.touch && !s.touch.touchId && s.touch.password ? 'This Mac has no Touch ID, so it asks for your Mac\'s password.' : '';
    $('#unlockBtn').textContent = s && s.touch && !s.touch.touchId ? 'Unlock with your Mac password' : 'Unlock with Touch ID';
    S.d = null;
    main.innerHTML = '';
    closeSheet();
  }
  $('#unlockBtn').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    $('#lockWhy').textContent = 'Look for the box from macOS…';
    api('unlock').then(function (r) {
      b.disabled = false;
      if (r.ok) { $('#lockWhy').textContent = "Your details stay hidden until your Mac checks it's you."; return load(); }
      $('#lockWhy').textContent = r.why === 'cancelled' ? 'Cancelled. Try again when you\'re ready.' : r.why === 'not a Mac' || r.why === 'unavailable' ? "This computer can't check Touch ID. Turn the lock off in Terminal: usual lock off" : 'That didn\'t work (' + r.why + '). Try again.';
    }).catch(function (e) { b.disabled = false; $('#lockWhy').textContent = e.message; });
  });
  $('#lockNow').addEventListener('click', function () { api('lock').then(function () { showLock(); }); });
  setInterval(function () { if (!document.hidden && S.d) api('status').then(function (s) { if (s.locked) showLock(s); }).catch(function () {}); }, 60000);

  /* ---------- tabs ---------- */
  function setTab(t) {
    S.tab = t;
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
    render();
    main.focus({ preventScroll: true });
  }
  $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });

  function render() {
    if (!S.d) return;
    var f = { usuals: renderUsuals, places: renderPlaces, people: renderPeople, history: renderHistory, you: renderYou }[S.tab];
    main.innerHTML = f();
    if (S.tab === 'you') wireYou();
  }

  /* ---------- usuals ---------- */
  function renderStart() {
    var d = S.d;
    var me = !!(d.me.name && (d.me.phone || d.me.email) && d.me.addresses.length);
    var pl = d.places.length > 0;
    return '<div class="start"><h2 class="title">Set up your usual</h2><p class="lede">Three things, once. After that, ordering your usual takes a click: your details are ready to paste, and usual tells you what to say on the phone.</p>' +
      '<ol class="steps">' +
      '<li class="' + (me ? 'done' : '') + '"><div><b>Tell usual who you are</b><span>Your name, phone number, email, and where food goes.</span></div><button class="' + (me ? 'btn' : 'go') + '" data-act="tab" data-tab="you">' + (me ? 'Change' : 'Fill it in') + '</button></li>' +
      '<li class="' + (pl ? 'done' : '') + '"><div><b>Add a place you order from</b><span>Its name, phone number and website.</span></div><button class="' + (!me || pl ? 'btn' : 'go') + '" data-act="new-place">' + (pl ? 'Add another' : 'Add a place') + '</button></li>' +
      '<li><div><b>Make your usual</b><span>What you get from there, and who each thing is for.</span></div><button class="' + (pl ? 'go' : 'btn') + '" data-act="new-order"' + (pl ? '' : ' disabled') + '>Make it</button></li>' +
      '</ol></div>';
  }

  function renderUsuals() {
    var d = S.d;
    if (!d.orders.length) return renderStart();
    if (!S.sel || !find(S.sel)) S.sel = d.orders[0].id;
    var o = find(S.sel);
    var hint = d.suggest && find(d.suggest.order) ? '<p class="hint">' + esc(d.suggest.say) + (d.suggest.order !== S.sel ? ' <button class="link" data-act="pick" data-id="' + esc(d.suggest.order) + '">Show it</button>' : '') + '</p>' : '';
    var list = d.orders.map(function (x) {
      var p = place(x.place) || {};
      return '<li><button data-act="pick" data-id="' + esc(x.id) + '" aria-current="' + (x.id === S.sel) + '"><span class="n">' + esc(x.name) + '</span><span class="m">' + esc(p.name || '?') + ' · ' + (x.mode === 'delivery' ? 'delivery' : 'pickup') + (x.count ? ' · ' + x.count + '×' : '') + '</span><span class="t">' + (x.card.totals.total ? money(x.card.totals.total) : '') + '</span></button></li>';
    }).join('');
    return '<div class="desk"><div>' + hint +
      '<div class="list-head"><h3>Your usuals</h3><button class="link" data-act="new-order">New usual</button></div>' +
      '<ul class="usuals">' + list + '</ul></div>' +
      slip(o) + ways(o) + '</div>';
  }

  function slip(o) {
    var c = o.card, t = c.totals, p = c.place || {};
    var items = o.items.map(function (i) {
      var who = i.who ? (person(i.who) || {}).name : '';
      var sub = [who ? 'for ' + who : '', i.notes].filter(Boolean).join(' · ');
      return '<li><span class="q">' + i.qty + '×</span><span>' + esc(i.name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span>' + (i.price ? money(i.qty * i.price) : '') + '</span></li>';
    }).join('');
    var row = function (k, v, cls) { return '<div class="row ' + (cls || '') + '"><span class="k">' + k + '</span><span>' + v + '</span></div>'; };
    var sums = t.sub ? row('Food', money(t.sub)) + (t.tax ? row('Tax (' + S.d.settings.tax + '%)', money(t.tax)) : '') + (t.fee ? row('Delivery fee', money(t.fee)) : '') + (t.tip ? row('Tip (' + o.tip + '%)', money(t.tip)) : '') + row('About', money(t.total), 'total')
      : '<p class="noprice">Add prices to see the total.</p>';
    var split = t.people.length > 1 && t.sub ? '<hr><div class="split">' + t.people.map(function (x) { return row(esc(x.name), money(x.share)); }).join('') + '</div>' : '';
    var addr = c.address;
    var sub = o.mode === 'delivery' ? 'Delivery' + (addr ? ' to ' + esc(addr.label || addr.street) : '') : 'Pickup';
    return '<div><div class="slip-wrap"><article class="slip" aria-label="' + esc(o.name) + '">' +
      '<h2>' + esc(p.name || 'A place') + '</h2><p class="sub">' + sub + (p.phone ? ' · ' + esc(p.phone) : '') + '</p><hr>' +
      '<ol>' + items + '</ol>' + (o.notes ? '<p class="sub" style="text-align:left">' + esc(o.notes) + '</p>' : '') + '<hr>' + sums + split +
      (t.belowMin ? '<p class="warn">' + money(t.belowMin) + ' short of ' + esc(p.name) + "'s minimum order.</p>" : '') +
      '<p class="foot">' + (o.count ? 'Ordered ' + plural(o.count, 'time') + ' · last ' + ago(o.used) : 'Not ordered yet') + '</p>' +
      '<div class="stamp" id="stamp"></div></article></div>' +
      '<div class="slip-tools"><button class="btn sm" data-act="edit-order" data-id="' + esc(o.id) + '">Change it</button><button class="btn sm" data-act="copy-order" data-id="' + esc(o.id) + '">Make a copy</button></div></div>';
  }

  function ways(o) {
    var c = o.card, p = c.place || {}, t = c.totals;
    var opts = [];
    if (p.web) opts.push(['online', 'Order online']);
    if (p.phone) opts.push(['call', 'Call']);
    opts.push(['send', p.email ? 'Email' : 'Copy the order']);
    if (!S.way || !opts.some(function (w) { return w[0] === S.way; })) S.way = opts[0][0];
    var seg = opts.length > 1 ? '<div class="seg" role="group" aria-label="How to order">' + opts.map(function (w) { return '<button data-act="way" data-way="' + w[0] + '" aria-pressed="' + (S.way === w[0]) + '">' + w[1] + '</button>'; }).join('') + '</div>' : '';
    var body = '';
    S.fields = c.fields;
    if (S.way === 'online') {
      body = '<p>Open the website, add the food, then copy your details into its boxes one by one. (Or use the filler: see You.)</p>' +
        '<p><a class="go" href="' + esc(p.web) + '" target="_blank" rel="noopener noreferrer">Open ' + esc(host(p.web)) + '</a></p>' +
        '<ul class="fields">' + c.fields.map(function (f, i) { return '<li><span class="k">' + esc(f[0]) + '</span><span class="v">' + esc(f[1]) + '</span><button class="btn sm" data-act="copy-field" data-i="' + i + '">Copy</button></li>'; }).join('') + '</ul>';
    } else if (S.way === 'call') {
      body = '<p class="phone">' + esc(p.phone) + ' <button class="btn sm" data-act="copy-text" data-what="phone">Copy</button></p>' +
        '<p>What to say:</p><ol class="say">' + c.say.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ol>' +
        '<p class="small">Call from any phone. On a Mac, FaceTime can call too, if an iPhone is linked to it.</p>';
    } else {
      body = '<p>' + (p.email ? 'Send the order by email, or copy it and paste it anywhere (a text, a chat, an order form).' : 'Copy the order and paste it anywhere: a text, a chat, an order form.') + '</p><pre class="paste">' + esc(c.text) + '</pre>' +
        '<p>' + (p.email ? '<a class="go" href="mailto:' + esc(p.email) + '?subject=' + encodeURIComponent('Order for ' + (o.mode === 'delivery' ? 'delivery' : 'pickup')) + '&body=' + encodeURIComponent(c.text) + '">Write the email</a> ' : '') + '<button class="btn" data-act="copy-text" data-what="order">Copy the order</button></p>';
    }
    return '<section class="ways" aria-label="How to order it"><h3>Order it</h3>' + seg + '<div class="way">' + body + '</div>' +
      '<div class="done-row"><button class="go" data-act="ordered" data-id="' + esc(o.id) + '">I ordered it</button>' +
      '<label>Paid <input type="number" id="paid" min="0" step="0.01" inputmode="decimal" placeholder="' + (t.total ? t.total.toFixed(2) : '0.00') + '"></label>' +
      '<span class="small">It goes in your history.</span></div></section>';
  }

  /* ---------- places ---------- */
  function renderPlaces() {
    var d = S.d;
    var rows = d.places.map(function (p) {
      var m = [p.phone, p.web ? host(p.web) : '', p.fee ? money(p.fee) + ' delivery' : '', p.min ? money(p.min) + ' minimum' : ''].filter(Boolean).map(esc).join(' · ');
      var n = d.orders.filter(function (o) { return o.place === p.id; }).length;
      return '<li><div class="n">' + esc(p.name) + '<span class="kind">' + esc(p.kind) + '</span></div><div class="m">' + (m || 'No phone or website yet') + (n ? ' · ' + plural(n, 'usual') : '') + '</div><div class="acts"><button class="btn sm" data-act="edit-place" data-id="' + esc(p.id) + '">Change</button></div></li>';
    }).join('');
    return '<h2 class="title">Places</h2><p class="lede">Where you order from. Add the phone number and website, so the order is one click away.</p>' +
      (rows ? '<ul class="rows">' + rows + '</ul>' : '<p class="empty">No places yet.</p>') + '<button class="go" data-act="new-place">Add a place</button>';
  }

  /* ---------- people ---------- */
  function renderPeople() {
    var d = S.d;
    var rows = '<li><div class="n">You' + (d.me.name ? ' <span class="kind">' + esc(d.me.name) + '</span>' : '') + '</div><div class="m">Change your details in You.</div><div class="acts"><button class="btn sm" data-act="tab" data-tab="you">Open</button></div></li>' +
      d.people.map(function (p) {
        return '<li><div class="n">' + esc(p.name) + '</div><div class="m">' + esc([p.phone, p.notes].filter(Boolean).join(' · ') || 'No notes') + '</div><div class="acts"><button class="btn sm" data-act="edit-person" data-id="' + esc(p.id) + '">Change</button></div></li>';
      }).join('');
    return '<h2 class="title">People</h2><p class="lede">Who you order for. In a usual, pick who each thing is for, and usual works out what each person owes. Notes are handy for "no onions" or "allergic to peanuts".</p>' +
      '<ul class="rows">' + rows + '</ul><button class="go" data-act="new-person">Add someone</button>';
  }

  /* ---------- history ---------- */
  function renderHistory() {
    var d = S.d, s = d.spending;
    var max = Math.max.apply(null, [1].concat(s.places.map(function (p) { return p.total; })));
    var bars = s.places.length ? '<h3 class="list-head" style="display:block"><span class="small">Where it goes</span></h3><ul class="bars">' + s.places.map(function (p) {
      return '<li><span>' + esc(p.name) + '</span><i style="width:' + Math.max(1, Math.round(p.total / max * 100)) + '%"></i><span class="v">' + money(p.total) + '</span></li>';
    }).join('') + '</ul>' : '';
    var rows = d.history.map(function (h) {
      var when = new Date(h.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      return '<li><div class="n">' + esc(h.name) + '</div><div class="m"><span class="when">' + esc(when) + '</span> · ' + esc(h.placeName || '?') + ' · ' + plural(h.items, 'thing') + (h['for'] && h['for'].length ? ' · for you and ' + esc(h['for'].join(', ')) : '') + '</div>' +
        '<div class="acts"><span class="when">' + money(h.total) + '</span>' + (find(h.order) ? '<button class="btn sm" data-act="again" data-id="' + esc(h.order) + '">Order again</button>' : '') + '<button class="btn sm" data-act="hist-del" data-at="' + h.at + '" aria-label="Remove from history">Remove</button></div></li>';
    }).join('');
    return '<h2 class="title">History</h2><p class="lede">What you\'ve ordered. Press "I ordered it" on a usual and it lands here.</p>' +
      '<div class="spend"><div><span class="big">' + money(s.thisMonth) + '</span><span class="small">this month, ' + plural(s.nThis, 'order') + '</span></div><div><span class="big">' + money(s.lastMonth) + '</span><span class="small">last month, ' + plural(s.nLast, 'order') + '</span></div></div>' +
      bars + (rows ? '<ul class="rows">' + rows + '</ul>' : '<p class="empty">Nothing yet.</p>');
  }

  /* ---------- you ---------- */
  function addrBox(a, i) {
    var f = function (k, label, cls, ph, ac) { return '<label class="f ' + cls + '">' + label + '<input data-a="' + i + '" data-k="' + k + '" value="' + esc(a[k]) + '" placeholder="' + esc(ph || '') + '" autocomplete="' + (ac || 'off') + '"></label>'; };
    return '<div class="addr"><div class="addr-head"><b>' + esc(a.label || 'Address') + '</b>' + (S.d.me.addresses.length > 1 || a.street ? '<button class="link" data-act="addr-del" data-i="' + i + '">Remove</button>' : '') + '</div><div class="grid">' +
      f('label', 'Call it', 'c2', 'Home', 'off') + f('street', 'Street', 'c4', '12 Maple Street', 'address-line1') +
      f('apt', 'Apt, floor', 'c2', '', 'address-line2') + f('city', 'Town', 'c2', '', 'address-level2') + f('state', 'State', 'c1', '', 'address-level1') + f('zip', 'ZIP', 'c1', '', 'postal-code') +
      '<label class="f c6">For the driver<input data-a="' + i + '" data-k="notes" value="' + esc(a.notes) + '" placeholder="Side door, ring the bell"></label></div></div>';
  }
  function renderYou() {
    var d = S.d, me = d.me;
    if (!me.addresses.length) me.addresses.push({ id: '', label: 'Home', street: '', apt: '', city: '', state: '', zip: '', notes: '' });
    var remind = (d.settings.remind || []).map(function (r, i) {
      return '<div class="remind"><span class="days" role="group" aria-label="Days">' + DAYS.map(function (n, k) { return '<label title="' + n + '"><input type="checkbox" data-r="' + i + '" data-day="' + k + '"' + (r.days.indexOf(k) >= 0 ? ' checked' : '') + '>' + n[0] + '</label>'; }).join('') + '</span>' +
        '<input type="time" data-r="' + i + '" data-k="time" value="' + esc(r.time.length === 4 ? '0' + r.time : r.time) + '" aria-label="Time">' +
        '<select data-r="' + i + '" data-k="order" aria-label="Which usual"><option value="">Any usual</option>' + d.orders.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === r.order ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select>' +
        '<button class="link" data-act="remind-del" data-i="' + i + '">Remove</button></div>';
    }).join('');
    var fill = (d.fillers || []).map(function (f) { return '<a class="filler" href="' + esc(f.href) + '" data-act="filler" title="Drag me to your bookmarks bar">Fill in my details' + (d.fillers.length > 1 ? ' (' + esc(f.label) + ')' : '') + '</a>'; }).join(' ');
    return '<div class="form"><h2 class="title">You</h2><p class="lede">Saved on this computer only. usual never sends your details anywhere: you choose when to paste them.</p>' +
      '<section><h3>Your details</h3><p class="note">What places ask for.</p><div class="grid">' +
      '<label class="f c6">Your name<input id="meName" value="' + esc(me.name) + '" autocomplete="name"></label>' +
      '<label class="f c3">Phone number<input id="mePhone" value="' + esc(me.phone) + '" autocomplete="tel" inputmode="tel"></label>' +
      '<label class="f c3">Email<input id="meEmail" value="' + esc(me.email) + '" autocomplete="email" inputmode="email"></label></div></section>' +
      '<section><h3>Where food goes</h3><p class="note">Add more than one (home, school, a friend\'s), then pick one in each usual.</p><div id="addrs">' + me.addresses.map(addrBox).join('') + '</div><button class="btn" data-act="addr-add">Add another address</button></section>' +
      '<div class="saverow"><button class="go" data-act="save-me">Save my details</button><span class="saved" id="savedMe" hidden>Saved</span></div>' +
      '<section><h3>Money</h3><p class="note">Sales tax, so the totals come out close to what you\'ll pay. (No card numbers here: the place takes payment.)</p><div class="grid">' +
      '<label class="f c2">Sales tax %<input type="number" id="tax" min="0" max="30" step="0.125" value="' + esc(d.settings.tax) + '"></label>' +
      '<label class="f c1">Money sign<input id="cur" value="' + esc(d.settings.currency) + '" maxlength="3"></label></div></section>' +
      '<section><h3>Reminders</h3><p class="note">A note in the corner of your screen, like "Friday pizza?", on the days you pick. They pop up while usual is running' + (C.mac ? ' (run <b>usual on</b> once in Terminal, and it always is)' : '') + '.</p>' + remind + '<p><button class="btn" data-act="remind-add">Add a reminder</button></p></section>' +
      (C.mac ? '<section><h3>Touch ID lock</h3><div class="switch"><input type="checkbox" id="lockOn"' + (d.settings.lock ? ' checked' : '') + '><label for="lockOn"><b>Ask for Touch ID before showing anything</b><br><span class="note">On Macs without Touch ID it asks for your Mac\'s password. It\'s Apple\'s own check, so a photo can\'t fool it. It locks again after 15 quiet minutes.</span></label></div></section>' : '') +
      '<section><h3>Fill in checkout pages</h3><p class="note">Drag this button onto your bookmarks bar. On a restaurant\'s checkout page, click the bookmark: it fills in your name, phone, email and address (check them before you order). To drag it, <a href="' + esc(location.href) + '" target="_blank" rel="noopener">open usual in a normal browser window</a> and press ⌘⇧B to show the bookmarks bar.</p>' + (fill || '<p class="small">Save your details first.</p>') + '</section></div>';
  }
  function readMe() {
    var me = S.d.me;
    me.name = $('#meName').value; me.phone = $('#mePhone').value; me.email = $('#meEmail').value;
    $$('#addrs input').forEach(function (el) { me.addresses[Number(el.dataset.a)][el.dataset.k] = el.value; });
    return me;
  }
  function wireYou() {
    var d = S.d;
    $('#tax').addEventListener('change', function () { saveSettings({ tax: Number(this.value) }); });
    $('#cur').addEventListener('change', function () { saveSettings({ currency: this.value }); });
    $$('#main [data-r]').forEach(function (el) {
      el.addEventListener('change', function () {
        var r = d.settings.remind[Number(el.dataset.r)];
        if (el.dataset.day) { var k = Number(el.dataset.day); r.days = r.days.filter(function (x) { return x !== k; }); if (el.checked) r.days.push(k); }
        else r[el.dataset.k] = el.value;
        if (!r.days.length) { toast('Pick at least one day'); return; }
        saveSettings({ remind: d.settings.remind }, true);
      });
    });
    var lk = $('#lockOn');
    if (lk) lk.addEventListener('change', function () {
      var want = lk.checked;
      toast('Look for the box from macOS…');
      api('settings', { lock: want }).then(function (nd) { S.d = nd; $('#lockNow').hidden = !want; toast(want ? 'The lock is on' : 'The lock is off'); })
        .catch(function (e) { lk.checked = !want; toast(e.message); });
    });
  }
  function saveSettings(b, quiet) {
    return api('settings', b).then(function (nd) { S.d = nd; if (!quiet) render(); toast('Saved'); }).catch(function (e) { toast(e.message); });
  }

  /* ---------- sheets (adding and changing things) ---------- */
  function openSheet(html, focus) {
    $('#sheet').innerHTML = html;
    $('#sheetWrap').hidden = false;
    var el = $(focus || '#sheet input, #sheet select', $('#sheet'));
    if (el) setTimeout(function () { el.focus(); }, 30);
  }
  function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; S.edit = null; S.sheet = null; }
  function sheetErr(m) { var e = $('#sheet .err'); if (e) e.textContent = m; }
  function head(t) { return '<header><h2 id="sheetTitle">' + esc(t) + '</h2><button class="quiet" data-act="sheet-close" aria-label="Close">Close</button></header>'; }

  // --- a usual
  function orderSheet(o) {
    var d = S.d;
    if (!d.places.length) { placeSheet(null, function () { orderSheet(); }); return; }
    var isNew = !o;
    S.edit = o ? JSON.parse(JSON.stringify(o)) : { id: null, name: '', place: S.lastPlace || d.places[0].id, items: [{ name: '', qty: 1, price: 0, who: '', notes: '' }], mode: 'delivery', address: (d.me.addresses[0] || {}).id || '', tip: 15, notes: '' };
    delete S.edit.card;
    S.sheet = 'order';
    var e = S.edit;
    var places = d.places.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === e.place ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '<option value="__new">A new place…</option>';
    var addrs = d.me.addresses.filter(function (a) { return a.id; }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === e.address ? ' selected' : '') + '>' + esc(a.label + (a.street ? ': ' + a.street : '')) + '</option>'; }).join('');
    openSheet(head(isNew ? 'A new usual' : 'Change ' + e.name) +
      '<form id="orderForm" class="body" autocomplete="off"><div class="grid">' +
      '<label class="f c3">Call it<input id="oName" value="' + esc(e.name) + '" placeholder="Friday pizza"></label>' +
      '<label class="f c3">From<select id="oPlace">' + places + '</select></label>' +
      '<div class="c6"><div class="seg" role="group" aria-label="Delivery or pickup" style="margin:6px 0 0"><button type="button" data-act="mode" data-mode="delivery" aria-pressed="' + (e.mode === 'delivery') + '">Delivery</button><button type="button" data-act="mode" data-mode="pickup" aria-pressed="' + (e.mode === 'pickup') + '">Pickup</button></div></div>' +
      '<label class="f c3" id="addrWrap"' + (e.mode === 'delivery' ? '' : ' hidden') + '>Deliver to' + (addrs ? '<select id="oAddr">' + addrs + '</select>' : '<span class="small">Add your address in You first.</span>') + '</label>' +
      '<label class="f c3" id="tipWrap"' + (e.mode === 'delivery' ? '' : ' hidden') + '>Tip %<input type="number" id="oTip" min="0" max="100" step="1" value="' + esc(e.tip) + '"></label>' +
      '</div><h3 style="margin:22px 0 4px;font-size:15px">What you get</h3><p class="small" style="margin:0 0 6px">Prices are optional: add them to see the total and who owes what.</p>' +
      '<table class="items"><thead><tr><th>How many</th><th>What</th><th>Price each</th><th>For</th><th></th></tr></thead><tbody id="items"></tbody></table>' +
      '<button type="button" class="btn sm" data-act="item-add">Add another thing</button>' +
      '<label class="f" style="margin-top:18px">Anything else to tell them<textarea id="oNotes" placeholder="Extra napkins, please">' + esc(e.notes) + '</textarea></label>' +
      '<p class="preview" id="preview"></p></form>' +
      '<footer><button class="go" type="submit" form="orderForm">' + (isNew ? 'Save this usual' : 'Save changes') + '</button><button class="btn" data-act="sheet-close" type="button">Cancel</button><span class="err"></span><span class="sp"></span>' + (isNew ? '' : '<button class="link" data-act="order-del" data-id="' + esc(e.id) + '">Delete it</button>') + '</footer>', '#oName');
    drawItems();
    var form = $('#orderForm');
    form.addEventListener('submit', function (ev) { ev.preventDefault(); saveOrder(); });
    $('#oPlace').addEventListener('change', function () {
      if (this.value === '__new') { var keep = readOrder(); placeSheet(null, function (id) { keep.place = id; orderSheet(keep); }, function () { orderSheet(keep); }); return; }
      e.place = this.value; preview();
    });
    form.addEventListener('input', function () { readOrder(); preview(); });
    preview();
  }
  function drawItems() {
    var e = S.edit, d = S.d;
    var who = function (sel) { return '<option value="">You</option>' + d.people.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); };
    $('#items').innerHTML = e.items.map(function (i, k) {
      return '<tr data-k="' + k + '"><td class="qty"><input type="number" min="1" max="99" data-f="qty" value="' + esc(i.qty) + '" aria-label="How many"></td>' +
        '<td><input data-f="name" value="' + esc(i.name) + '" placeholder="' + (k === 0 ? 'Large pepperoni pizza' : 'Garlic knots') + '" aria-label="What"><input class="notes" data-f="notes" value="' + esc(i.notes) + '" placeholder="How you like it (optional)" aria-label="How you like it"></td>' +
        '<td class="price"><input type="number" min="0" step="0.01" data-f="price" value="' + (i.price ? esc(i.price) : '') + '" placeholder="0.00" aria-label="Price each"></td>' +
        '<td class="who"><select data-f="who" aria-label="For">' + who(i.who) + '</select></td>' +
        '<td><button type="button" class="x" data-act="item-del" data-k="' + k + '" aria-label="Remove">×</button></td></tr>';
    }).join('');
  }
  function readOrder() {
    var e = S.edit;
    e.name = $('#oName').value; e.notes = $('#oNotes').value;
    var pl = $('#oPlace').value; if (pl !== '__new') e.place = pl;
    if ($('#oAddr')) e.address = $('#oAddr').value;
    e.tip = Number($('#oTip').value) || 0;
    $$('#items tr').forEach(function (tr) {
      var i = e.items[Number(tr.dataset.k)];
      $$('[data-f]', tr).forEach(function (el) { var f = el.dataset.f; i[f] = f === 'qty' ? Math.max(1, Math.round(Number(el.value) || 1)) : f === 'price' ? Math.max(0, Number(el.value) || 0) : el.value; });
    });
    return e;
  }
  function preview() {
    var e = S.edit, p = place(e.place) || {};
    var sub = e.items.reduce(function (s, i) { return s + (i.qty || 1) * (i.price || 0); }, 0);
    if (!sub) { $('#preview').textContent = ''; return; }
    var tax = sub * (Number(S.d.settings.tax) || 0) / 100, fee = e.mode === 'delivery' ? p.fee || 0 : 0, tip = e.mode === 'delivery' ? sub * (e.tip || 0) / 100 : 0;
    $('#preview').innerHTML = 'Food ' + money(sub) + (tax ? ' + tax ' + money(tax) : '') + (fee ? ' + delivery ' + money(fee) : '') + (tip ? ' + tip ' + money(tip) : '') + ' = <b>about ' + money(sub + tax + fee + tip) + '</b>';
  }
  function saveOrder() {
    var e = readOrder();
    e.items = e.items.filter(function (i) { return String(i.name).trim(); });
    if (!e.items.length) { e.items.push({ name: '', qty: 1, price: 0, who: '', notes: '' }); drawItems(); sheetErr('Add at least one thing to the order.'); return; }
    S.lastPlace = e.place;
    api('order', { order: e }).then(function (r) { S.d = r; S.sel = r.id; closeSheet(); setTab('usuals'); toast('Saved'); }).catch(function (x) { drawItems(); sheetErr(x.message); });
  }

  // --- a place
  function placeSheet(p, after, cancel) {
    var isNew = !p;
    p = p || { id: null, name: '', kind: 'Pizza', phone: '', web: '', address: '', email: '', fee: 0, min: 0, notes: '' };
    S.sheet = 'place';
    S.after = after || null;
    S.cancel = cancel || null;
    var f = function (id, label, cls, val, ph, type) { return '<label class="f ' + cls + '">' + label + '<input id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"' + (type ? ' type="' + type + '" min="0" step="0.01"' : '') + '></label>'; };
    openSheet(head(isNew ? 'A new place' : 'Change ' + p.name) +
      '<form id="placeForm" class="body" autocomplete="off"><div class="grid">' +
      f('pName', 'Name', 'c4', p.name, "Sal's Pizza") +
      '<label class="f c2">Kind of food<select id="pKind">' + S.d.kinds.map(function (k) { return '<option' + (k === p.kind ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></label>' +
      f('pPhone', 'Phone number', 'c3', p.phone, '(555) 123-4567') + f('pWeb', 'Website (where you order)', 'c3', p.web, 'salspizza.com/order') +
      f('pAddr', 'Address (for pickup)', 'c4', p.address, '') + f('pEmail', 'Email (if they take orders by email)', 'c2', p.email, '') +
      f('pFee', 'Delivery fee', 'c2', p.fee || '', '0.00', 'number') + f('pMin', 'Minimum order', 'c2', p.min || '', '0.00', 'number') +
      '<label class="f c6">Notes<textarea id="pNotes" placeholder="Closed Mondays. Ask for the corner piece.">' + esc(p.notes) + '</textarea></label></div></form>' +
      '<footer><button class="go" type="submit" form="placeForm">' + (isNew ? 'Add this place' : 'Save changes') + '</button><button class="btn" type="button" data-act="sheet-cancel">Cancel</button><span class="err"></span><span class="sp"></span>' + (isNew ? '' : '<button class="link" data-act="place-del" data-id="' + esc(p.id) + '">Delete it</button>') + '</footer>', '#pName');
    $('#placeForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!$('#pName').value.trim()) { sheetErr('Give the place a name.'); return; }
      var np = { id: p.id, name: $('#pName').value, kind: $('#pKind').value, phone: $('#pPhone').value, web: $('#pWeb').value, address: $('#pAddr').value, email: $('#pEmail').value, fee: $('#pFee').value, min: $('#pMin').value, notes: $('#pNotes').value };
      api('place', { place: np }).then(function (r) {
        S.d = r;
        var next = S.after;
        closeSheet();
        if (next) next(r.id); else render();
        toast(isNew ? 'Added' : 'Saved');
      }).catch(function (x) { sheetErr(x.message); });
    });
  }

  // --- a person
  function personSheet(p) {
    var isNew = !p;
    p = p || { id: null, name: '', phone: '', notes: '' };
    S.sheet = 'person';
    openSheet(head(isNew ? 'Someone you order for' : 'Change ' + p.name) +
      '<form id="personForm" class="body" autocomplete="off"><div class="grid">' +
      '<label class="f c3">Name<input id="hName" value="' + esc(p.name) + '" placeholder="Maya"></label>' +
      '<label class="f c3">Phone (optional)<input id="hPhone" value="' + esc(p.phone) + '"></label>' +
      '<label class="f c6">Notes<textarea id="hNotes" placeholder="No onions. Allergic to peanuts. Likes it extra spicy.">' + esc(p.notes) + '</textarea></label></div></form>' +
      '<footer><button class="go" type="submit" form="personForm">' + (isNew ? 'Add' : 'Save changes') + '</button><button class="btn" type="button" data-act="sheet-close">Cancel</button><span class="err"></span><span class="sp"></span>' + (isNew ? '' : '<button class="link" data-act="person-del" data-id="' + esc(p.id) + '">Delete</button>') + '</footer>', '#hName');
    $('#personForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!$('#hName').value.trim()) { sheetErr('What\'s their name?'); return; }
      api('person', { person: { id: p.id, name: $('#hName').value, phone: $('#hPhone').value, notes: $('#hNotes').value } }).then(function (r) { S.d = r; closeSheet(); render(); toast(isNew ? 'Added' : 'Saved'); }).catch(function (x) { sheetErr(x.message); });
    });
  }

  /* ---------- clicks ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var a = b.dataset.act, id = b.dataset.id;
    switch (a) {
      case 'tab': setTab(b.dataset.tab); break;
      case 'pick': S.sel = id; S.tab = 'usuals'; setTab('usuals'); break;
      case 'way': S.way = b.dataset.way; render(); break;
      case 'new-order': orderSheet(null); break;
      case 'edit-order': orderSheet(find(id)); break;
      case 'copy-order': api('order-copy', { id: id }).then(function (r) { S.d = r; S.sel = r.id; render(); toast('Copied: change the copy as you like'); orderSheet(find(r.id)); }).catch(function (e) { toast(e.message); }); break;
      case 'order-del':
        if (!confirm('Delete this usual? Your history keeps what you ordered.')) return;
        api('order-delete', { id: id }).then(function (r) { S.d = r; closeSheet(); render(); toast('Deleted'); }).catch(function (e) { sheetErr(e.message); });
        break;
      case 'new-place': placeSheet(null); break;
      case 'edit-place': placeSheet(place(id)); break;
      case 'place-del':
        if (!confirm('Delete this place?')) return;
        api('place-delete', { id: id }).then(function (r) { S.d = r; closeSheet(); render(); toast('Deleted'); }).catch(function (e) { sheetErr(e.message); });
        break;
      case 'new-person': personSheet(null); break;
      case 'edit-person': personSheet(person(id)); break;
      case 'person-del': api('person-delete', { id: id }).then(function (r) { S.d = r; closeSheet(); render(); toast('Deleted'); }).catch(function (e) { sheetErr(e.message); }); break;
      case 'sheet-close': closeSheet(); break;
      case 'sheet-cancel': { var c = S.cancel; closeSheet(); if (c) c(); break; }
      case 'mode': {
        S.edit.mode = b.dataset.mode;
        $$('#sheet [data-act="mode"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        $('#addrWrap').hidden = $('#tipWrap').hidden = S.edit.mode !== 'delivery';
        preview();
        break;
      }
      case 'item-add': readOrder(); S.edit.items.push({ name: '', qty: 1, price: 0, who: '', notes: '' }); drawItems(); var ins = $$('#items input[data-f="name"]'); ins[ins.length - 1].focus(); break;
      case 'item-del': readOrder(); S.edit.items.splice(Number(b.dataset.k), 1); if (!S.edit.items.length) S.edit.items.push({ name: '', qty: 1, price: 0, who: '', notes: '' }); drawItems(); preview(); break;
      case 'copy-field': copy(S.fields[Number(b.dataset.i)][1], b); break;
      case 'copy-text': { var o = find(S.sel); copy(b.dataset.what === 'phone' ? o.card.place.phone : o.card.text, b); break; }
      case 'ordered': {
        var paid = $('#paid') && $('#paid').value;
        b.disabled = true;
        api('ordered', { id: id, total: paid ? Number(paid) : undefined }).then(function (r) {
          S.d = r; render();
          var st = $('#stamp');
          if (st) { st.innerHTML = 'Ordered<small>' + esc(new Date().toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</small>'; void st.offsetWidth; st.classList.add('on'); }
          toast('Enjoy! It\'s in your history.');
        }).catch(function (e) { b.disabled = false; toast(e.message); });
        break;
      }
      case 'again': S.sel = id; setTab('usuals'); break;
      case 'hist-del': api('history-delete', { at: Number(b.dataset.at) }).then(function (r) { S.d = r; render(); }).catch(function (e) { toast(e.message); }); break;
      case 'addr-add': readMe(); S.d.me.addresses.push({ id: '', label: S.d.me.addresses.length ? 'Other' : 'Home', street: '', apt: '', city: '', state: '', zip: '', notes: '' }); render(); break;
      case 'addr-del': readMe(); S.d.me.addresses.splice(Number(b.dataset.i), 1); render(); break;
      case 'save-me':
        readMe();
        if (!S.d.me.name.trim()) { toast('Add your name first'); $('#meName').focus(); return; }
        api('me', { me: S.d.me }).then(function (r) { S.d = r; render(); var s = $('#savedMe'); if (s) s.hidden = false; toast('Saved'); }).catch(function (e) { toast(e.message); });
        break;
      case 'remind-add':
        S.d.settings.remind = (S.d.settings.remind || []).concat([{ id: '', days: [5], time: '18:00', order: S.d.orders[0] ? S.d.orders[0].id : '' }]);
        saveSettings({ remind: S.d.settings.remind });
        break;
      case 'remind-del': S.d.settings.remind.splice(Number(b.dataset.i), 1); saveSettings({ remind: S.d.settings.remind }); break;
      case 'filler': ev.preventDefault(); toast('Drag it to your bookmarks bar, then click it on a checkout page'); break;
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('#sheetWrap').hidden) { var c = S.cancel; closeSheet(); if (c) c(); }
    // Return in a "what" box adds the next thing, instead of saving
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('#items input[data-f="name"]')) {
      ev.preventDefault();
      readOrder();
      var k = Number(ev.target.closest('tr').dataset.k);
      if (k === S.edit.items.length - 1) S.edit.items.push({ name: '', qty: 1, price: 0, who: '', notes: '' });
      drawItems();
      $$('#items input[data-f="name"]')[k + 1].focus();
    }
  });

  /* ---------- Rocco and the street ---------- */
  function paintSprite(cv, rows, ink) {
    var g = cv.getContext('2d');
    cv.width = rows[0].length; cv.height = rows.length;
    g.clearRect(0, 0, cv.width, cv.height);
    PixelScene.sprite(g, rows, 0, 0, ink, false);
  }
  function faces() {
    var n = night(), ink = n ? Rocco.INK_NIGHT : Object.assign({ o: Rocco.EDGE }, Rocco.INK);
    paintSprite($('#face'), n ? Rocco.MINI : Rocco.outline(Rocco.MINI), ink);
    paintSprite($('#lockRocco'), n ? Rocco.BIG : Rocco.outline(Rocco.BIG), ink);
  }
  faces();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', faces);
  Street.start($('#street'), { night: night });

  load();
})();
