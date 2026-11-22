'use strict';
// The `usual` command.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const A = require('./ansi');
const Sprite = require('./sprite');
const Rocco = require('./raccoon');
const Store = require('./store');
const pkg = require('../package.json');

const out = (s = '') => process.stdout.write(s + '\n');
const tomato = (s) => A.paint(s, { fg: '#ff7a5c', bold: true });
const mustard = (s) => A.paint(s, { fg: '#f3b23c' });
const basil = (s) => A.paint(s, { fg: '#7cc08f' });
const dim = (s) => A.paint(s, { fg: '#8a909c' });
const bad = (s) => A.paint(s, { fg: '#ff9a8a' });
const bold = (s) => A.paint(s, { bold: true });
const MAC = process.platform === 'darwin';

const HELP = `
  usual: order the usual, without typing your details every time.

  usual                   open the usual window
  usual order [name]      a usual, ready to order: what to say on the phone, the order to paste
  usual list              your usuals              usual history     what you've ordered (and spent)
  usual on                set it up: ready at login (for reminders), and "usual" in Spotlight
  usual lock on|off       ask for Touch ID (or your Mac's password) before showing anything
  usual doctor            check every part, if something doesn't work
  usual off · update · uninstall · help · --version
`;

function intro(lines) {
  const art = Sprite.picture(Rocco.BIG, Rocco.MINI, Rocco.INK_NIGHT);
  const w = A.vwidth(art[0] || '');
  out('');
  for (let i = 0; i < Math.max(art.length, lines.length); i++) out('  ' + (art[i] || ' '.repeat(w)) + '   ' + (lines[i] || ''));
  out('');
}

async function running() {
  const Server = require('./server');
  const port = Server.runningPort();
  if (port && (await require('./local').alive(port))) return { port, secret: Server.secret() };
  return null;
}

/** Open the window. If usual isn't running in the background, it runs from here while the window is open. */
async function openWindow({ quiet = false } = {}) {
  const r = await running();
  if (r) { require('./open').openWindow(`http://127.0.0.1:${r.port}/${r.secret}/`, { width: 1180, height: 820 }); return null; }
  const s = await require('./server').start({ log: () => {} });
  require('./open').openWindow(s.url, { width: 1180, height: 820 });
  if (!quiet) out(`  ${basil('✓')} usual is open in its own window. ${dim('Keep this Terminal window open while you use it (Ctrl+C closes usual).')}${MAC ? dim('\n    To open it from Spotlight instead, run once: usual on') : ''}`);
  return s;
}

/** The lock: when it's on, the terminal asks too. */
async function mustUnlock(d, why = 'show your food orders') {
  if (!d.settings.lock) return;
  const r = await require('./unlock').check(why);
  if (r.ok) return;
  if (r.why === 'not a Mac' || r.why === 'unavailable') return; // the lock is a Mac thing
  throw new Error(r.why === 'cancelled' ? 'usual is locked (you cancelled).' : `usual is locked (${r.why}).`);
}

/** A usual as a receipt, right here in Terminal. */
function receipt(d, o) {
  const c = Store.card(d, o);
  const t = c.totals;
  const cur = d.settings.currency || '$';
  const W = 40;
  const row = (l, r = '') => `  ${l}${' '.repeat(Math.max(1, W - A.vwidth(l) - A.vwidth(r)))}${r}`;
  const rule = dim('  ' + '- '.repeat(W / 2));
  const people = d.people;
  out('');
  out(`  ${bold(o.name)}  ${dim(`${c.place.name} · ${o.mode === 'delivery' ? 'delivery' : 'pickup'}`)}`);
  out(rule);
  for (const i of o.items) {
    const who = i.who ? (people.find((p) => p.id === i.who) || {}).name : '';
    out(row(`${i.qty} × ${i.name.slice(0, 26)}`, i.price ? Store.money(i.qty * i.price, cur) : ''));
    if (i.notes || who) out(dim(`      ${[who && `for ${who}`, i.notes].filter(Boolean).join(' · ')}`));
  }
  out(rule);
  if (t.sub) {
    out(row('Food', Store.money(t.sub, cur)));
    if (t.tax) out(row(`Tax (${d.settings.tax}%)`, Store.money(t.tax, cur)));
    if (t.fee) out(row('Delivery fee', Store.money(t.fee, cur)));
    if (t.tip) out(row(`Tip (${o.tip}%)`, Store.money(t.tip, cur)));
    out(row(bold('About'), bold(Store.money(t.total, cur))));
    if (t.people.length > 1) { out(rule); for (const p of t.people) out(row(dim(`${p.name} pays`), dim(Store.money(p.share, cur)))); }
    if (t.belowMin) out(mustard(`  ${Store.money(t.belowMin, cur)} short of ${c.place.name}'s minimum.`));
  }
  return c;
}

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); res(a.trim()); });
});

function pickOrder(d, words) {
  if (!d.orders.length) throw new Error('No usuals yet. Open the window to make one: usual');
  const sorted = d.orders.slice().sort((a, b) => (b.used || b.made) - (a.used || a.made));
  if (!words) return sorted[0];
  const w = words.toLowerCase();
  const place = (o) => (d.places.find((p) => p.id === o.place) || {}).name || '';
  const hit = sorted.find((o) => o.name.toLowerCase() === w) || sorted.find((o) => o.name.toLowerCase().includes(w)) || sorted.find((o) => place(o).toLowerCase().includes(w));
  if (!hit) throw new Error(`No usual called "${words}". See them: usual list`);
  return hit;
}

/** After an update: restart the background part with the new code. */
function ensureCurrent() {
  if (!MAC || process.env.USUAL_NO_SETUP) return;
  const stamp = path.join(Store.home(), 'set-up-version');
  let was = '';
  try { was = fs.readFileSync(stamp, 'utf8').trim(); } catch { /* never */ }
  if (was === pkg.version) return;
  try {
    const Mac = require('./mac');
    if (!Mac.agentState().installed) return;
    Mac.setUp(pkg.version);
    fs.writeFileSync(stamp, pkg.version);
  } catch { /* next time */ }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!['serve', 'uninstall', 'off', '--version', '-v', 'version', 'help', '--help', '-h'].includes(cmd)) ensureCurrent();
  switch (cmd) {
    case undefined: case 'open': {
      const d = Store.load();
      intro(['', `${tomato('usual')} ${dim('v' + pkg.version)}`, '', 'Order the usual, without typing', 'your details every time.', '', dim(d.me.name ? `${d.orders.length} usual${d.orders.length === 1 ? '' : 's'} · ${d.places.length} place${d.places.length === 1 ? '' : 's'}` : 'Start by telling it who you are.')]);
      const s = await openWindow();
      if (s) await new Promise(() => {});
      out(`  ${basil('✓')} usual is open in its own window.`);
      return;
    }
    case 'app': case 'window': {
      // from Spotlight: run until the window has been closed a while
      const s = await openWindow({ quiet: true });
      if (!s) return;
      setInterval(() => { if (s.quietFor() > 10 * 60 * 1000) s.close().then(() => process.exit(0)); }, 60000);
      await new Promise(() => {});
      return;
    }
    case 'serve': { await require('./server').start({}); await new Promise(() => {}); return; }
    case 'on': case 'setup': case 'start': {
      if (!MAC) { out('  On this computer, open usual with: usual'); return; }
      const r = require('./mac').setUp(pkg.version);
      if (!r.ok) throw new Error(`macOS didn't start usual (${r.why}). You can still use it: usual`);
      fs.writeFileSync(path.join(Store.home(), 'set-up-version'), pkg.version);
      out(`\n  ${basil('✓')} usual is ready every time you log in (so reminders can pop up).`);
      out(`  ${basil('✓')} Open it from Spotlight: press ${bold('⌘ space')}, type ${bold('usual')}, press Return.\n`);
      return;
    }
    case 'off': case 'stop': { if (MAC) require('./mac').tearDown(); out('  usual is off (your details and usuals stay). usual on starts it again.'); return; }
    case 'order': case 'go': {
      const d = Store.load();
      await mustUnlock(d);
      const o = pickOrder(d, rest.join(' '));
      const c = receipt(d, o);
      out('');
      if (c.place.web) out(`  ${tomato('Order online')}  ${c.place.web}`);
      if (c.place.phone) {
        out(`  ${tomato('Or call')}  ${bold(c.place.phone)}  ${dim('and say:')}`);
        c.say.forEach((l) => out(`    ${dim('“')}${l}${dim('”')}`));
      }
      out(dim('\n  The order, to paste anywhere:'));
      c.text.split('\n').forEach((l) => out('    ' + l));
      out('');
      if (process.stdin.isTTY) {
        const a = await ask(`  Did you order it? ${dim('(y = yes, it goes in your history; Return = not yet)')} `);
        if (/^y/i.test(a)) {
          const r = await running();
          if (r) await require('./local').ask(r.port, r.secret, 'ordered', { id: o.id }, 'x-usual');
          else { const S = await require('./server').start({ port: 0, log: () => {} }); await S.api('ordered', { id: o.id }); await S.close(); }
          out(`  ${basil('✓')} Enjoy! It's in your history.\n`);
        }
      }
      return;
    }
    case 'list': case 'ls': {
      const d = Store.load();
      await mustUnlock(d);
      out('');
      if (!d.orders.length) out(dim('  No usuals yet. Open the window to make one: usual'));
      for (const o of d.orders.slice().sort((a, b) => (b.used || b.made) - (a.used || a.made))) {
        const t = Store.totals(d, o);
        const place = (d.places.find((p) => p.id === o.place) || {}).name || '?';
        out(`  ${tomato('•')} ${bold(o.name)}  ${dim(`${place} · ${o.items.length} thing${o.items.length === 1 ? '' : 's'}${t.total ? ' · about ' + Store.money(t.total, d.settings.currency) : ''}${o.count ? ` · ordered ${o.count}×` : ''}`)}`);
      }
      out(dim('\n  Order one: usual order <name>\n'));
      return;
    }
    case 'history': {
      const d = Store.load();
      await mustUnlock(d);
      const s = Store.spending(d);
      const cur = d.settings.currency;
      out(`\n  This month: ${bold(Store.money(s.thisMonth, cur))} ${dim(`(${s.nThis} order${s.nThis === 1 ? '' : 's'})`)}   Last month: ${Store.money(s.lastMonth, cur)} ${dim(`(${s.nLast})`)}\n`);
      const h = d.history.slice(-20).reverse();
      if (!h.length) out(dim('  Nothing yet. When you order a usual, press "I ordered it" and it shows up here.'));
      for (const x of h) out(`  ${dim(new Date(x.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).padEnd(14))} ${x.name.slice(0, 30).padEnd(30)} ${dim(x.placeName.slice(0, 18).padEnd(18))} ${Store.money(x.total, cur)}`);
      out('');
      return;
    }
    case 'lock': {
      const want = rest[0] === 'on' ? true : rest[0] === 'off' ? false : null;
      const d = Store.load();
      if (want === null) { out(`  The Touch ID lock is ${d.settings.lock ? basil('on') : dim('off')}. ${dim('Change it: usual lock on   or   usual lock off')}`); return; }
      if (want === d.settings.lock) { out(`  It's already ${want ? 'on' : 'off'}.`); return; }
      if (!MAC && want) throw new Error('The Touch ID lock is for Macs.');
      if (MAC) {
        const r = await require('./unlock').check(want ? 'turn on the Touch ID lock' : 'turn off the Touch ID lock');
        if (!r.ok) throw new Error(r.why === 'cancelled' ? 'Nothing changed (you cancelled).' : `Nothing changed (${r.why}).`);
      }
      d.settings.lock = want;
      Store.save(d);
      out(`  ${basil('✓')} The Touch ID lock is ${want ? 'on: usual asks it\'s you before showing anything' : 'off'}.`);
      return;
    }
    case 'doctor': case 'check': return doctor();
    case '--version': case '-v': case 'version': out(`usual ${pkg.version}`); return;
    case 'help': case '--help': case '-h': out(HELP); return;
    case 'update': return update();
    case 'uninstall': return uninstall();
    default: throw new Error(`"${cmd}" isn't a usual command. Try: usual help`);
  }
}

async function doctor() {
  const yes = (s) => out(`  ${basil('✓')} ${s}`);
  const no = (s, fix) => out(`  ${bad('!')} ${s}${fix ? `\n      ${dim(fix)}` : ''}`);
  const d = Store.load();
  out(`\n  ${tomato('usual')} ${dim('v' + pkg.version)}: checking every part\n`);
  yes(`${d.orders.length} usuals, ${d.places.length} places, ${d.people.length} people, ${d.history.length} orders in your history.`);
  if (!d.me.name || !(d.me.phone || d.me.email)) no('Your details are missing.', 'Open usual and fill in "You" (name, phone, email, address).');
  try { fs.accessSync(path.join(Store.home(), 'data.json'), fs.constants.R_OK | fs.constants.W_OK); yes('Your details file can be read and saved.'); } catch { if (fs.existsSync(path.join(Store.home(), 'data.json'))) no("usual can't save to its file.", path.join(Store.home(), 'data.json')); }
  const r = await running();
  if (r) yes(`usual is running (port ${r.port}).`); else out(`  ${dim('·')} usual isn't running right now. ${dim('That\'s fine: it starts when you open it.')}`);
  if (MAC) {
    const st = require('./mac').agentState();
    if (st.installed) yes('It starts at login (for reminders).'); else out(`  ${dim('·')} It doesn't start at login, so reminders only pop up while it's open. ${dim('Change that: usual on')}`);
    const t = require('./unlock').available();
    if (d.settings.lock) { if (t.touchId || t.password) yes(`The lock is on, and macOS can check it's you (${t.touchId ? 'Touch ID' : 'your Mac\'s password'}).`); else no("The lock is on, but macOS can't check it's you here.", 'Turn it off: usual lock off'); }
    else out(`  ${dim('·')} The Touch ID lock is off. ${dim(t.touchId ? 'This Mac has Touch ID: usual lock on' : '')}`);
    if (!require('./open').canWindow()) out(`  ${dim('·')} No Chrome, Edge or Brave, so usual opens in a normal browser tab.`);
  }
  out('');
}

function installUrl(kind) {
  let hub = '';
  try { hub = fs.readFileSync(path.join(Store.home(), 'hub'), 'utf8').trim(); } catch { /* from GitHub */ }
  if (/^https?:\/\//.test(hub)) return `${hub.replace(/\/+$/, '')}/install.${kind}`;
  return `https://raw.githubusercontent.com/dpatel7-dev/usual/main/install.${kind}`;
}
function update() {
  const { spawnSync } = require('child_process');
  const win = process.platform === 'win32';
  const url = installUrl(win ? 'ps1' : 'sh');
  out(`  Updating from ${url}`);
  const r = win ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${url} | iex`], { stdio: 'inherit' }) : spawnSync('sh', ['-c', `curl -fsSL "${url}" | sh`], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('The update did not finish. Your current version still works.');
}
async function uninstall() {
  if (MAC) require('./mac').tearDown();
  const root = Store.home();
  let launcher = '';
  try { launcher = fs.readFileSync(path.join(root, 'launcher'), 'utf8').trim(); } catch { /* not from the installer */ }
  fs.rmSync(path.join(root, 'app'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'node'), { recursive: true, force: true });
  if (launcher && /usual(\.cmd)?$/.test(launcher)) fs.rmSync(launcher, { force: true });
  out(`  usual is uninstalled. ${dim(`Your details and usuals are still in ${root} (delete that folder to remove them too).`)}`);
}

module.exports = { main, HELP, receipt, pickOrder };
