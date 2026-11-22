'use strict';
// "Is it really you?" with Touch ID, the way Apple's own apps ask: the Mac's
// fingerprint reader, or the Mac's login password on Macs without one. This
// is Apple's LocalAuthentication, the same check that unlocks the Mac, so a
// photo, a video or a mask can't fool it, and the fingerprint never leaves
// the Mac's secure chip (no app ever sees it).
//
// It runs as a small JavaScript-for-Automation program: nothing to install,
// no administrator, no permissions to grant.
//
//   const r = await require('./unlock').check('open your passwords')
//   r.ok: it's you.  r.why: why not ('cancelled', 'not a Mac', ...).  r.how: 'touch-id' | 'password'

const { spawn, spawnSync } = require('child_process');

const MAC = process.platform === 'darwin';

const SCRIPT = String.raw`
ObjC.import('Foundation');
ObjC.import('LocalAuthentication');
function run(argv) {
  var reason = argv[0] || 'check it is you';
  var policy = argv[1] === 'bio' ? 1 : 2; // 1: Touch ID only · 2: Touch ID, or the Mac's password
  var ctx = $.LAContext.alloc.init;
  var err = Ref();
  if (!ctx.canEvaluatePolicyError(policy, err)) return JSON.stringify({ ok: false, why: 'unavailable', how: 'none' });
  var bio = ctx.canEvaluatePolicyError(1, Ref());
  var done = false, ok = false, why = '';
  ctx.evaluatePolicyLocalizedReasonReply(policy, $(reason), function (success, error) {
    ok = !!success;
    if (!success) { try { why = ObjC.unwrap(error.localizedDescription) || 'no'; } catch (e) { why = 'no'; } }
    done = true;
  });
  var until = Date.now() + 120000;
  while (!done && Date.now() < until) $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.1));
  if (!done) return JSON.stringify({ ok: false, why: 'timed out', how: bio ? 'touch-id' : 'password' });
  return JSON.stringify({ ok: ok, why: why, how: bio ? 'touch-id' : 'password' });
}
`;

function parse(out) {
  try { const o = JSON.parse(String(out).trim().split('\n').pop()); return o && typeof o === 'object' ? o : null; } catch { return null; }
}

/** What this Mac can do: { touchId, password } (quick, no prompt). */
function available() {
  if (process.env.UNLOCK_FAKE) return { touchId: process.env.UNLOCK_FAKE === 'yes', password: true };
  if (!MAC) return { touchId: false, password: false };
  const code = "ObjC.import('LocalAuthentication'); var c = $.LAContext.alloc.init; JSON.stringify({ touchId: !!c.canEvaluatePolicyError(1, Ref()), password: !!c.canEvaluatePolicyError(2, Ref()) })";
  const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', code], { encoding: 'utf8', timeout: 8000 });
  return parse(r.stdout) || { touchId: false, password: false };
}

/**
 * Ask. Resolves { ok, why, how }. The reason shows in Apple's box:
 * "<app> wants to <reason>" (keep it short, starting with a verb).
 */
function check(reason, { biometricOnly = false } = {}) {
  if (process.env.UNLOCK_FAKE) return Promise.resolve({ ok: process.env.UNLOCK_FAKE === 'yes', why: process.env.UNLOCK_FAKE === 'yes' ? '' : 'cancelled', how: 'fake' });
  if (!MAC) return Promise.resolve({ ok: false, why: 'not a Mac', how: 'none' });
  return new Promise((resolve) => {
    let out = '', err = '';
    const child = spawn('osascript', ['-l', 'JavaScript', '-e', SCRIPT, String(reason || 'check it is you').slice(0, 120), biometricOnly ? 'bio' : 'any'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', () => resolve({ ok: false, why: 'could not ask macOS', how: 'none' }));
    child.on('exit', () => {
      const o = parse(out);
      if (o) return resolve({ ok: !!o.ok, why: o.ok ? '' : /cancel/i.test(o.why) ? 'cancelled' : o.why || 'no', how: o.how || 'none' });
      resolve({ ok: false, why: `macOS didn't answer${err ? ' (' + err.trim().split('\n').pop().slice(0, 120) + ')' : ''}`, how: 'none' });
    });
  });
}

module.exports = { check, available, SCRIPT };
