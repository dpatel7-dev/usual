'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'usual-'));

test('totals, the split, and the ordering card', () => {
  process.env.USUAL_HOME = tmp();
  const Store = require('../src/store');
  const d = Store.load();
  d.me = Store.cleanMe({ name: 'Ann Lee', phone: '555-0100', email: 'ann@example.com', addresses: [{ label: 'Home', street: '1 Elm St', city: 'Town', state: 'NJ', zip: '07000', notes: 'Ring twice' }, { label: '', street: '', city: '' }] });
  assert.strictEqual(d.me.addresses.length, 1, 'empty addresses are dropped');
  const bo = Store.cleanPerson({ name: 'Bo' });
  d.people.push(bo);
  const p = Store.cleanPlace({ name: "Sal's", web: 'sals.example/order', fee: '$3.00', min: 30 });
  assert.strictEqual(p.web, 'https://sals.example/order');
  assert.strictEqual(p.fee, 3);
  d.places.push(p);
  d.settings.tax = 10;
  const o = Store.cleanOrder({ name: 'Pizza', place: p.id, mode: 'delivery', tip: 20, address: d.me.addresses[0].id, items: [{ name: 'Pie', qty: 1, price: 20 }, { name: 'Wings', qty: 1, price: 5, who: bo.id }, { name: '' }] });
  assert.strictEqual(o.items.length, 2, 'blank lines are dropped');
  const t = Store.totals(d, o);
  assert.strictEqual(t.sub, 25);
  assert.strictEqual(t.tax, 2.5);
  assert.strictEqual(t.fee, 3);
  assert.strictEqual(t.tip, 5);
  assert.strictEqual(t.total, 35.5);
  assert.strictEqual(t.belowMin, 5);
  const you = t.people.find((x) => x.who === 'me'), b = t.people.find((x) => x.who === bo.id);
  assert.ok(Math.abs(you.share + b.share - 35.5) < 1e-9, 'the shares add up to the total');
  assert.ok(Math.abs(you.share - 28.4) < 1e-9);
  const c = Store.card(d, o);
  assert.match(c.say[0], /delivery/);
  assert.ok(c.say.some((l) => l.includes('1 Elm St') && l.includes('Ring twice')));
  assert.ok(c.say.some((l) => l.includes('Ann Lee') && l.includes('555-0100')));
  assert.match(c.text, /1 × Pie/);
  assert.match(c.text, /Email: ann@example.com/);
  assert.deepStrictEqual(c.forWho, ['Bo']);
  assert.ok(c.fields.some((f) => f[0] === 'ZIP' && f[1] === '07000'));
  // pickup: no fee or tip, no address
  const pick = { ...o, mode: 'pickup' };
  assert.strictEqual(Store.totals(d, pick).total, 27.5);
  assert.ok(!Store.card(d, pick).text.includes('Address'));
});

test('the checkout filler is a bookmarklet with your details, and nothing else', () => {
  const Store = require('../src/store');
  const href = Store.bookmarklet({ name: 'Ann Lee', phone: '555', email: 'a@b.c' }, { street: '1 Elm', apt: '', city: 'Town', state: 'NJ', zip: '07000', notes: '' });
  assert.ok(href.startsWith('javascript:'));
  const code = decodeURIComponent(href.slice(11));
  assert.ok(code.includes('"first":"Ann"') && code.includes('"last":"Lee"'));
  assert.ok(!/fetch|XMLHttpRequest|sendBeacon|location\s*=/.test(code), 'it never sends anything anywhere');
  assert.ok(code.includes("el.type==='password'"), 'it skips password boxes');
  new Function(code); // it's valid JavaScript
});

test('suggestions come from what you order at this time', () => {
  const Store = require('../src/store');
  const d = Store.load();
  d.places = [{ id: 'p1', name: "Sal's" }];
  d.orders = [{ id: 'o1', name: 'Friday pizza', place: 'p1', items: [] }];
  const fri = new Date(2026, 10, 20, 19, 0); // a Friday, 7 pm
  d.history = [7, 14, 21].map((k) => ({ at: fri.getTime() - k * 86400000, order: 'o1', total: 30, placeName: "Sal's" }));
  const s = Store.suggest(d, fri);
  assert.ok(s && s.order === 'o1');
  assert.match(s.say, /Friday evening/);
  assert.strictEqual(Store.suggest({ ...d, history: d.history.slice(0, 1) }, fri), null, 'not from one order');
  const sp = Store.spending(d, fri);
  assert.strictEqual(sp.places[0].n, 3);
});

test('the server: saving, ordering, history, and the Touch ID lock', async () => {
  process.env.USUAL_HOME = tmp();
  process.env.UNLOCK_FAKE = 'yes';
  const Server = require('../src/server');
  const notes = [];
  const s = await Server.start({ port: 0, log: () => {}, notify: (t, x) => notes.push([t, x]) });
  try {
    let d = await s.api('me', { me: { name: 'Ann', phone: '555', addresses: [{ label: 'Home', street: '1 Elm' }] } });
    assert.strictEqual(d.me.addresses.length, 1);
    assert.strictEqual(d.fillers.length, 1);
    const pid = (await s.api('place', { place: { name: "Sal's", phone: '555-1' } })).id;
    await assert.rejects(s.api('order', { order: { name: 'x', place: pid, items: [] } }), /at least one/);
    await assert.rejects(s.api('order', { order: { name: 'x', place: 'nope', items: [{ name: 'Pie' }] } }), /place/);
    const r = await s.api('order', { order: { place: pid, items: [{ name: 'Pie', qty: 2, price: 10 }] } });
    assert.strictEqual(r.orders[0].name, "Sal's usual", 'a usual gets a name if you leave it blank');
    assert.ok(r.orders[0].card.say.length > 2);
    d = await s.api('ordered', { id: r.id, total: 23.5 });
    assert.strictEqual(d.history.length, 1);
    assert.strictEqual(d.history[0].total, 23.5);
    assert.strictEqual(d.orders[0].count, 1);
    await assert.rejects(s.api('place-delete', { id: pid }), /from there/);
    const copy = await s.api('order-copy', { id: r.id });
    assert.strictEqual(copy.orders.length, 2);
    // a reminder pops up at its time, once
    const now = new Date();
    await s.api('settings', { remind: [{ days: [now.getDay()], time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, order: r.id }] });
    s.tick(); s.tick();
    assert.strictEqual(notes.length, 1);
    assert.match(notes[0][0], /usual\?$/);
    // the lock
    await s.api('settings', { lock: true });
    assert.strictEqual((await s.api('status')).locked, false, 'just unlocked by turning it on');
    await s.api('lock');
    assert.strictEqual((await s.api('status')).locked, true);
    await assert.rejects(s.api('state'), (e) => e.status === 423);
    process.env.UNLOCK_FAKE = 'no';
    assert.strictEqual((await s.api('unlock')).ok, false);
    await assert.rejects(s.api('state'), (e) => e.status === 423);
    process.env.UNLOCK_FAKE = 'yes';
    assert.strictEqual((await s.api('unlock')).ok, true);
    assert.ok((await s.api('state')).orders.length);
    // the file is yours only
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(path.join(process.env.USUAL_HOME, 'data.json')).mode & 0o077, 0);
    // and the web page is served behind the secret
    const page = await fetch(s.url).then((x) => x.text());
    assert.match(page, /usual/);
    assert.strictEqual((await fetch(`http://127.0.0.1:${s.port}/`)).status, 404);
  } finally { await s.close(); }
});

test('the terminal receipt and help', async () => {
  process.env.USUAL_HOME = tmp();
  const Store = require('../src/store');
  const { receipt, pickOrder, HELP } = require('../src/cli');
  assert.match(HELP, /usual order/);
  const d = Store.load();
  d.places.push({ id: 'p', name: 'Jade', fee: 0, min: 0 });
  d.orders.push(Store.cleanOrder({ id: 'o', name: 'Lo mein night', place: 'p', mode: 'pickup', items: [{ name: 'Lo mein', price: 12 }] }));
  assert.strictEqual(pickOrder(d, 'lo mein').id, 'o');
  assert.strictEqual(pickOrder(d, 'jade').id, 'o');
  assert.throws(() => pickOrder(d, 'sushi'), /No usual/);
  const lines = [];
  const w = process.stdout.write;
  process.stdout.write = (s) => { lines.push(String(s)); return true; };
  try { receipt(d, d.orders[0]); } finally { process.stdout.write = w; }
  assert.ok(lines.join('').includes('Lo mein'));
  assert.ok(lines.join('').includes('$12.00'));
});
