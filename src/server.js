'use strict';
// usual's window is a page served on this computer only (127.0.0.1, behind a
// secret address). `usual on` keeps this running at login, so reminders can
// pop up; otherwise it runs while the window is open.
//
// The Touch ID lock: when it's on, nothing comes out of here until macOS says
// it's you (Touch ID, or your Mac's password), and it locks again after 15
// quiet minutes. It keeps people who borrow your Mac out of the window. Your
// details file itself is readable by your Mac account only.

const fs = require('fs');
const path = require('path');
const Store = require('./store');
const Local = require('./local');
const Unlock = require('./unlock');
const pkg = require('../package.json');

const WEB = path.join(__dirname, '..', 'web');
const IDLE = 15 * 60 * 1000;
const secret = () => Local.secretIn(path.join(Store.home(), 'secret'));
const portFile = () => path.join(Store.home(), 'port');
const runningPort = () => { try { return Number(fs.readFileSync(portFile(), 'utf8')) || 0; } catch { return 0; } };
const oops = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** What the page needs: everything, plus each usual's totals and ordering card. */
function view(d) {
  return {
    me: d.me, people: d.people, places: d.places, settings: d.settings,
    orders: d.orders.slice().sort((a, b) => (b.used || b.made) - (a.used || a.made)).map((o) => ({ ...o, card: Store.card(d, o) })),
    history: d.history.slice(-200).reverse(),
    suggest: Store.suggest(d), spending: Store.spending(d), kinds: Store.KINDS,
    fillers: d.me.name ? (d.me.addresses.length ? d.me.addresses : [null]).map((a) => ({ label: a ? a.label : '', href: Store.bookmarklet(d.me, a) })) : [],
  };
}

async function start({ port, log = (s) => process.stdout.write(`${new Date().toLocaleTimeString()}  ${s}\n`), notify = null } = {}) {
  const sec = secret();
  let until = 0; // unlocked until (when the lock is on)
  let touch = null;
  const canTouch = () => { if (!touch) touch = Unlock.available(); return touch; };
  let server;
  for (const p of port != null ? [port] : [8731, 8741, 8751, 0]) {
    try {
      server = await Local.serve({
        port: p, secret: sec, web: WEB, header: 'x-usual',
        config: () => ({ version: pkg.version, mac: process.platform === 'darwin' }),
        api: (what, body) => api(what, body || {}),
      });
      break;
    } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  if (!server) throw new Error("usual couldn't find a free port.");
  fs.writeFileSync(portFile(), String(server.port));

  const locked = (d) => d.settings.lock && Date.now() > until;
  const need = (list, id, what) => { const x = list.find((i) => i.id === id); if (!x) throw oops(`That ${what} isn't there any more.`, 404); return x; };
  const upsert = (list, item) => { const i = list.findIndex((x) => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); return item; };

  let seen = Date.now();
  async function api(what, b) {
    seen = Date.now();
    const d = Store.load();
    if (what === 'status') return { locked: locked(d), lock: d.settings.lock, version: pkg.version, touch: d.settings.lock ? canTouch() : null };
    if (what === 'unlock') {
      if (!locked(d)) return { ok: true };
      const r = await Unlock.check('open your food orders');
      if (r.ok) until = Date.now() + IDLE;
      return { ok: r.ok, why: r.why, how: r.how };
    }
    if (locked(d)) throw oops('usual is locked.', 423);
    until = Date.now() + IDLE;
    const done = () => view(Store.save(d));
    switch (what) {
      case 'state': return view(d);
      case 'lock': until = 0; return { locked: d.settings.lock };
      case 'me': d.me = Store.cleanMe(b.me); return done();
      case 'person': { const p = upsert(d.people, Store.cleanPerson(b.person)); return { id: p.id, ...done() }; }
      case 'person-delete': {
        need(d.people, b.id, 'person');
        d.people = d.people.filter((p) => p.id !== b.id);
        for (const o of d.orders) for (const i of o.items) if (i.who === b.id) i.who = '';
        return done();
      }
      case 'place': { const p = upsert(d.places, Store.cleanPlace(b.place)); return { id: p.id, ...done() }; }
      case 'place-delete': {
        need(d.places, b.id, 'place');
        const using = d.orders.filter((o) => o.place === b.id);
        if (using.length && !b.sure) throw oops(`${using.length === 1 ? `"${using[0].name || 'A usual'}" is` : `${using.length} usuals are`} from there. Delete ${using.length === 1 ? 'it' : 'them'} first, or pick another place for ${using.length === 1 ? 'it' : 'them'}.`, 409);
        d.places = d.places.filter((p) => p.id !== b.id);
        return done();
      }
      case 'order': {
        const was = d.orders.find((o) => o.id === (b.order || {}).id);
        const o = Store.cleanOrder({ ...b.order, made: was ? was.made : Date.now(), used: was ? was.used : 0, count: was ? was.count : 0 });
        if (!o.place || !d.places.some((p) => p.id === o.place)) throw oops('Pick the place this is from.');
        if (!o.items.length) throw oops('Add at least one thing to the order.');
        if (!o.name) o.name = `${(d.places.find((p) => p.id === o.place) || {}).name || 'My'} usual`;
        upsert(d.orders, o);
        return { id: o.id, ...done() };
      }
      case 'order-copy': {
        const o = need(d.orders, b.id, 'usual');
        const c = Store.cleanOrder({ ...JSON.parse(JSON.stringify(o)), id: null, name: `${o.name} (copy)`, made: Date.now(), used: 0, count: 0 });
        d.orders.push(c);
        return { id: c.id, ...done() };
      }
      case 'order-delete': need(d.orders, b.id, 'usual'); d.orders = d.orders.filter((o) => o.id !== b.id); return done();
      case 'ordered': {
        const o = need(d.orders, b.id, 'usual');
        const t = Store.totals(d, o);
        const place = d.places.find((p) => p.id === o.place) || {};
        const paid = Number(b.total);
        o.used = Date.now();
        o.count = (o.count || 0) + 1;
        d.history.push({ at: Date.now(), order: o.id, name: o.name, place: o.place, placeName: place.name || '', total: Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) / 100 : Math.round(t.total * 100) / 100, items: o.items.reduce((s, i) => s + i.qty, 0), mode: o.mode, for: Store.card(d, o).forWho });
        if (d.history.length > 2000) d.history = d.history.slice(-2000);
        return done();
      }
      case 'history-delete': d.history = d.history.filter((h) => h.at !== b.at); return done();
      case 'settings': {
        const s = d.settings;
        if (b.tax != null) s.tax = Math.max(0, Math.min(30, Number(b.tax) || 0));
        if (typeof b.currency === 'string') s.currency = b.currency.trim().slice(0, 3) || '$';
        if (Array.isArray(b.remind)) s.remind = b.remind.slice(0, 10).map((r) => ({ id: r.id || Store.id(), days: (Array.isArray(r.days) ? r.days : []).map(Number).filter((x) => x >= 0 && x <= 6), time: /^\d{1,2}:\d{2}$/.test(r.time) ? r.time : '18:00', order: String(r.order || '') })).filter((r) => r.days.length);
        if (typeof b.lock === 'boolean' && b.lock !== s.lock) {
          // turning the lock on or off: check it's you first (so the lock can't lock you out, or be switched off by someone else)
          const r = await Unlock.check(b.lock ? 'turn on the Touch ID lock' : 'turn off the Touch ID lock');
          if (!r.ok) throw oops(r.why === 'cancelled' ? 'Nothing changed (you cancelled).' : r.why === 'unavailable' || r.why === 'not a Mac' ? "This Mac can't check Touch ID or a password here, so the lock can't be used." : `macOS said no (${r.why}).`);
          s.lock = b.lock;
          until = Date.now() + IDLE;
        }
        return done();
      }
      default: throw oops(`usual doesn't know "${what}".`, 404);
    }
  }

  // reminders: "Friday 6:30 pm: order the pizza?" (only while this is running; `usual on` keeps it running)
  const fired = new Set();
  const tick = () => {
    let d;
    try { d = Store.load(); } catch { return; }
    const now = new Date();
    const hm = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const r of d.settings.remind || []) {
      const key = `${r.id}@${now.toDateString()}`;
      const [h, m] = r.time.split(':').map(Number);
      if (!r.days.includes(now.getDay()) || fired.has(key) || `${h}:${String(m).padStart(2, '0')}` !== hm) continue;
      fired.add(key);
      const o = d.orders.find((x) => x.id === r.order);
      const place = o ? (d.places.find((p) => p.id === o.place) || {}).name : '';
      const text = o ? `Your usual from ${place || 'there'} is ready to order: open usual.` : 'Time to order: open usual.';
      (notify || ((t, x) => require('./mac').notify(t, x)))(o ? `${o.name}?` : 'usual', text);
      log(`reminder: ${o ? o.name : r.id}`);
    }
  };
  const timer = setInterval(tick, 20000);
  timer.unref();

  log(`usual ${pkg.version} is ready: ${server.url}`);
  return {
    url: server.url, port: server.port, secret: sec, api, tick, quietFor: () => Date.now() - seen,
    close: async () => { clearInterval(timer); await server.close(); try { if (runningPort() === server.port) fs.rmSync(portFile()); } catch { /* fine */ } },
  };
}

module.exports = { start, runningPort, secret, view };
