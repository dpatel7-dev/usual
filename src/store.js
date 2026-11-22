'use strict';
// What usual keeps: you (name, phone, email, addresses), the people you order
// for, the places you order from, your usual orders, and what you've ordered.
// One file, ~/.usual/data.json, readable by you only. No card numbers: the
// place takes payment itself.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const home = () => process.env.USUAL_HOME || path.join(os.homedir(), '.usual');
const file = () => path.join(home(), 'data.json');
const id = () => crypto.randomBytes(5).toString('hex');
const DEFAULTS = { tax: 0, lock: false, remind: null, currency: '$' };
const KINDS = ['Pizza', 'Chinese', 'Indian', 'Mexican', 'Japanese', 'Thai', 'Burgers', 'Sandwiches', 'Breakfast', 'Chicken', 'Middle Eastern', 'Italian', 'Coffee', 'Dessert', 'Other'];

function load() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { /* new */ }
  return {
    me: { name: '', phone: '', email: '', addresses: [], ...(d.me || {}) },
    people: Array.isArray(d.people) ? d.people : [],
    places: Array.isArray(d.places) ? d.places : [],
    orders: Array.isArray(d.orders) ? d.orders : [],
    history: Array.isArray(d.history) ? d.history : [],
    settings: { ...DEFAULTS, ...(d.settings || {}) },
  };
}
function save(d) {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file());
  return d;
}

const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, d = 0) => { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : d; };
const money = (n, c = '$') => `${n < 0 ? '-' : ''}${c}${Math.abs(n).toFixed(2)}`;

function cleanMe(m = {}) {
  return {
    name: str(m.name, 100), phone: str(m.phone, 40), email: str(m.email, 120),
    addresses: (Array.isArray(m.addresses) ? m.addresses : []).slice(0, 20).map((a) => ({ id: a.id || id(), label: str(a.label, 40) || 'Home', street: str(a.street), apt: str(a.apt, 40), city: str(a.city, 80), state: str(a.state, 40), zip: str(a.zip, 20), notes: str(a.notes, 300) })).filter((a) => a.street || a.city || a.zip),
  };
}
function cleanPerson(p = {}) { return { id: p.id || id(), name: str(p.name, 60) || 'Someone', phone: str(p.phone, 40), notes: str(p.notes, 500) }; }
function cleanPlace(p = {}) {
  let web = str(p.web, 500);
  if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;
  return { id: p.id || id(), name: str(p.name, 80) || 'A place', kind: KINDS.includes(p.kind) ? p.kind : 'Other', phone: str(p.phone, 40), web, address: str(p.address, 200), fee: Math.max(0, num(p.fee)), min: Math.max(0, num(p.min)), notes: str(p.notes, 500), email: str(p.email, 120) };
}
function cleanOrder(o = {}) {
  return {
    id: o.id || id(), name: str(o.name, 80), place: str(o.place, 20),
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 60).map((i) => ({ name: str(i.name, 120), qty: Math.max(1, Math.round(num(i.qty, 1))), price: Math.max(0, num(i.price)), who: str(i.who, 20), notes: str(i.notes, 200) })).filter((i) => i.name),
    address: str(o.address, 20), mode: o.mode === 'pickup' ? 'pickup' : 'delivery', tip: Math.max(0, Math.min(100, num(o.tip, 15))), notes: str(o.notes, 500),
    made: o.made || Date.now(), used: o.used || 0, count: o.count || 0,
  };
}

/** Money for an order: subtotal, tax, delivery fee, tip, total, and what each person's part comes to. */
function totals(d, o) {
  const place = d.places.find((p) => p.id === o.place) || {};
  const sub = o.items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = sub * (num(d.settings.tax) / 100);
  const fee = o.mode === 'delivery' ? num(place.fee) : 0;
  const tip = o.mode === 'delivery' ? sub * (num(o.tip) / 100) : 0;
  const total = sub + tax + fee + tip;
  // each person: their items, plus their share of tax, fee and tip (by how much their food costs)
  const per = {};
  for (const i of o.items) { const k = i.who || 'me'; per[k] = (per[k] || 0) + i.qty * i.price; }
  const extra = tax + fee + tip;
  const people = Object.entries(per).map(([who, s]) => ({ who, name: who === 'me' ? 'You' : (d.people.find((p) => p.id === who) || {}).name || 'Someone', food: s, share: sub ? s + (extra * s) / sub : 0 }));
  return { sub, tax, fee, tip, total, people, belowMin: place.min && sub < place.min ? place.min - sub : 0 };
}

const addressLine = (a) => (a ? [a.street, a.apt, [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ') : '');

/** Everything for actually ordering: the words to say on the phone, the text to paste or email, and your details. */
function card(d, o) {
  const place = d.places.find((p) => p.id === o.place) || { name: 'the place' };
  const addr = d.me.addresses.find((a) => a.id === o.address) || d.me.addresses[0] || null;
  const t = totals(d, o);
  const c = d.settings.currency || '$';
  const who = (i) => (i.who && i.who !== 'me' ? (d.people.find((p) => p.id === i.who) || {}).name : '');
  const lines = o.items.map((i) => `${i.qty} × ${i.name}${i.notes ? ` (${i.notes})` : ''}`);
  const delivery = o.mode === 'delivery';
  const say = [
    `Hi! I'd like to place an order for ${delivery ? 'delivery' : 'pickup'}, please.`,
    ...o.items.map((i) => `${i.qty === 1 ? 'One' : i.qty} ${i.name}${i.notes ? `, ${i.notes}` : ''}.`),
    o.notes ? `And: ${o.notes}.` : '',
    delivery && addr ? `It's going to ${addressLine(addr)}.${addr.notes ? ` ${addr.notes}.` : ''}` : '',
    d.me.name ? `The name is ${d.me.name}${d.me.phone ? `, and my number is ${d.me.phone}` : ''}.` : d.me.phone ? `My number is ${d.me.phone}.` : '',
    t.sub ? `That should be about ${money(t.sub + t.tax, c)}${delivery && t.fee ? ` plus the delivery fee` : ''}. How long will it be?` : 'How long will it be?',
  ].filter(Boolean);
  const textOrder = [
    `Order for ${delivery ? 'delivery' : 'pickup'} from ${place.name}`,
    '',
    ...lines,
    o.notes ? `\nNotes: ${o.notes}` : '',
    '',
    d.me.name ? `Name: ${d.me.name}` : '',
    d.me.phone ? `Phone: ${d.me.phone}` : '',
    d.me.email ? `Email: ${d.me.email}` : '',
    delivery && addr ? `Address: ${addressLine(addr)}${addr.notes ? ` (${addr.notes})` : ''}` : '',
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i < a.length - 1)).join('\n').trim();
  const fields = [
    ['Name', d.me.name], ['Phone', d.me.phone], ['Email', d.me.email],
    ...(addr ? [['Street', addr.street], ['Apt', addr.apt], ['City', addr.city], ['State', addr.state], ['ZIP', addr.zip], ['Delivery notes', addr.notes]] : []),
    ['The order', lines.join('\n')],
  ].filter((f) => f[1]);
  return { place, address: addr, totals: t, say, text: textOrder, fields, forWho: [...new Set(o.items.map(who).filter(Boolean))], bookmarklet: bookmarklet(d.me, addr) };
}

/**
 * A bookmarklet: drag it to the bookmarks bar, then click it on a checkout
 * page to fill in your name, phone, email and address. Your details are
 * inside it (it's made here, on your computer).
 */
function bookmarklet(me, addr) {
  const data = { name: me.name, phone: me.phone, email: me.email, street: addr ? addr.street : '', apt: addr ? addr.apt : '', city: addr ? addr.city : '', state: addr ? addr.state : '', zip: addr ? addr.zip : '', notes: addr ? addr.notes : '' };
  const first = (me.name || '').split(' ')[0], last = (me.name || '').split(' ').slice(1).join(' ');
  data.first = first; data.last = last;
  const code = `(function(){var D=${JSON.stringify(data)};var R=[['email',/e-?mail/i],['phone',/phone|tel|mobile/i],['first',/first.?name|given/i],['last',/last.?name|family|surname/i],['name',/^(full.?)?name$|your.?name|recipient/i],['apt',/apt|suite|unit|address.?(line)?.?2|address2/i],['street',/street|address.?(line)?.?1|address1|^address$/i],['city',/city|town|locality|address-level2/i],['state',/state|province|region|address-level1/i],['zip',/zip|postal|postcode/i],['notes',/instruction|delivery.?note|driver|comment/i]];var A={'email':'email','tel':'phone','given-name':'first','family-name':'last','name':'name','address-line1':'street','street-address':'street','address-line2':'apt','address-level2':'city','address-level1':'state','postal-code':'zip'};var n=0;document.querySelectorAll('input,textarea').forEach(function(el){if(el.type==='hidden'||el.type==='password'||el.disabled||el.value)return;var k=A[(el.getAttribute('autocomplete')||'').split(' ').pop()];var h=[el.name,el.id,el.placeholder,el.getAttribute('aria-label')].join(' ');if(!k)for(var i=0;i<R.length;i++){if(R[i][1].test(h)){k=R[i][0];break;}}if(!k||!D[k])return;var s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');if(s&&s.set)s.set.call(el,D[k]);else el.value=D[k];el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));n++;});alert(n?'usual filled in '+n+' box'+(n===1?'':'es')+'. Check them before you order.':'usual didn\\'t find boxes it knows on this page.');})()`;
  return 'javascript:' + encodeURIComponent(code);
}

/** "It's Friday evening: you usually order from Sal's around now." Looks at what you ordered at this time before. */
function suggest(d, now = new Date()) {
  const recent = d.history.filter((h) => now - h.at < 120 * 86400000);
  if (recent.length < 3) return null;
  const day = now.getDay(), hour = now.getHours();
  const near = recent.filter((h) => { const t = new Date(h.at); return t.getDay() === day && Math.abs(t.getHours() - hour) <= 2; });
  const pool = near.length >= 2 ? near : recent.filter((h) => Math.abs(new Date(h.at).getHours() - hour) <= 1);
  if (pool.length < 2) return null;
  const counts = {};
  for (const h of pool) if (h.order) counts[h.order] = (counts[h.order] || 0) + 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const o = d.orders.find((x) => x.id === best[0]);
  if (!o) return null;
  const place = d.places.find((p) => p.id === o.place) || {};
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const part = hour < 11 ? 'morning' : hour < 16 ? 'afternoon' : 'evening';
  return { order: o.id, say: near.length >= 2 ? `It's ${DAYS[day]} ${part}: you often get ${o.name || 'your usual'} from ${place.name || 'here'} around now.` : `Around this time you often get ${o.name || 'your usual'} from ${place.name || 'here'}.` };
}

/** Money spent: this month, last month, and where it goes. */
function spending(d, now = new Date()) {
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const sum = (a) => a.reduce((s, h) => s + (h.total || 0), 0);
  const thisMonth = d.history.filter((h) => h.at >= startThis);
  const lastMonth = d.history.filter((h) => h.at >= startLast && h.at < startThis);
  const byPlace = {};
  for (const h of d.history) { const k = h.placeName || 'Somewhere'; byPlace[k] = byPlace[k] || { name: k, n: 0, total: 0 }; byPlace[k].n++; byPlace[k].total += h.total || 0; }
  return { thisMonth: sum(thisMonth), nThis: thisMonth.length, lastMonth: sum(lastMonth), nLast: lastMonth.length, places: Object.values(byPlace).sort((a, b) => b.n - a.n).slice(0, 6) };
}

module.exports = { home, load, save, id, cleanMe, cleanPerson, cleanPlace, cleanOrder, totals, card, bookmarklet, suggest, spending, addressLine, money, KINDS, DEFAULTS };
