'use strict';
// Small macOS helpers shared by the apps: starting at login (a LaunchAgent,
// never anything that needs an administrator), little .app shortcuts in
// ~/Applications, notifications, question boxes, and which app is in front.
//
//   const Mac = require('./macos')({ app: 'magpie', label: 'dev.dpatel7.magpie', home: () => '~/.magpie' });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAC = process.platform === 'darwin';
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function run(cmd, args, { timeout = 15000, input, env } = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, input, env: env ? { ...process.env, ...env } : process.env, maxBuffer: 32 * 1024 * 1024 });
    return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim(), status: r.status };
  } catch (e) {
    return { ok: false, out: '', err: e.message, status: -1 };
  }
}

/** JavaScript for Automation (macOS's own scripting): run `code` with arguments, get its printed result. */
function jxa(code, args = [], timeout = 15000) {
  return run('osascript', ['-l', 'JavaScript', '-e', code, ...args.map(String)], { timeout });
}

module.exports = function make({ app, label, home }) {
  const appsDir = () => path.join(os.homedir(), 'Applications');
  const plistPath = (l = label) => path.join(os.homedir(), 'Library', 'LaunchAgents', `${l}.plist`);
  const domain = () => `gui/${process.getuid ? process.getuid() : 0}`;

  function infoPlist({ name, id, version, background }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${x(name)}</string>
  <key>CFBundleDisplayName</key><string>${x(name)}</string>
  <key>CFBundleIdentifier</key><string>${x(id)}</string>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${x(version || '1.0')}</string>
  <key>LSUIElement</key><${background ? 'true' : 'false'}/>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
</dict>
</plist>
`;
  }

  /** A double-clickable app in ~/Applications that runs `<app> <args…>` (Spotlight and Launchpad find it). */
  function makeApp({ name, id, args, icon, node = process.execPath, script, version }) {
    if (!MAC) return null;
    const dir = path.join(appsDir(), `${name}.app`);
    const contents = path.join(dir, 'Contents');
    fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
    fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Info.plist'), infoPlist({ name, id, version, background: true }));
    const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
    fs.writeFileSync(path.join(contents, 'MacOS', 'run'), `#!/bin/sh\n# ${name}: made by ${app}. Remove it with: ${app} uninstall\nexport LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8\nexec ${q(node)} ${q(script)} ${args.map(q).join(' ')} >> "${home()}/app.log" 2>&1\n`, { mode: 0o755 });
    if (icon && fs.existsSync(icon)) fs.copyFileSync(icon, path.join(contents, 'Resources', 'icon.icns'));
    run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', dir]);
    return dir;
  }
  function removeApp(name) { fs.rmSync(path.join(appsDir(), `${name}.app`), { recursive: true, force: true }); }

  /**
   * Start something at login, and keep it going (a LaunchAgent: just for you,
   * no administrator). args: what to run. at: { Hour, Minute } runs it once a
   * day instead of keeping it going; every: seconds runs it that often.
   */
  function startAgent({ args = [], l = label, at = null, every = 0, keepAlive = !at && !every, node = process.execPath, script, env = {}, program = null, interactive = false }) {
    if (!MAC) return { ok: false, why: 'This part is for Macs.' };
    const file = plistPath(l);
    const log = path.join(typeof home === 'function' ? home() : home, `${l.split('.').pop()}.log`);
    const envXml = Object.entries({ LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', ...env }).map(([k, v]) => `<key>${x(k)}</key><string>${x(v)}</string>`).join('');
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${x(l)}</string>
  <key>ProgramArguments</key>
  <array>${(program || [node, script, ...args]).map((a) => `<string>${x(a)}</string>`).join('')}</array>
  <key>EnvironmentVariables</key><dict>${envXml}</dict>
  ${at ? `<key>StartCalendarInterval</key><dict>${Object.entries(at).map(([k, v]) => `<key>${x(k)}</key><integer>${Number(v)}</integer>`).join('')}</dict>` : every ? `<key>StartInterval</key><integer>${Math.round(every)}</integer>\n  <key>RunAtLoad</key><true/>` : '<key>RunAtLoad</key><true/>'}
  ${keepAlive ? '<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>\n  <key>ThrottleInterval</key><integer>10</integer>' : ''}
  <key>ProcessType</key><string>${keepAlive && !interactive ? 'Background' : 'Interactive'}</string>
  <key>StandardOutPath</key><string>${x(log)}</string>
  <key>StandardErrorPath</key><string>${x(log)}</string>
</dict>
</plist>
`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(home(), { recursive: true });
    fs.writeFileSync(file, plist);
    run('launchctl', ['bootout', `${domain()}/${l}`]);
    const r = run('launchctl', ['bootstrap', domain(), file]);
    if (!r.ok) {
      const r2 = run('launchctl', ['load', '-w', file]);
      if (!r2.ok) return { ok: false, why: (r.err || r2.err || 'launchctl said no').split('\n')[0] };
    }
    return { ok: true, log };
  }
  function stopAgent(l = label) {
    if (!MAC) return;
    run('launchctl', ['bootout', `${domain()}/${l}`]);
    const file = plistPath(l);
    if (fs.existsSync(file)) { run('launchctl', ['unload', '-w', file]); fs.rmSync(file, { force: true }); }
  }
  function agentState(l = label) {
    if (!MAC) return { installed: false, running: false };
    const r = run('launchctl', ['print', `${domain()}/${l}`]);
    return { installed: fs.existsSync(plistPath(l)), running: r.ok && /state = running/.test(r.out) };
  }

  /** A notification in the corner of the screen. */
  function notify(title, text, subtitle = '') {
    if (MAC) {
      const q = (s) => JSON.stringify(String(s).slice(0, 200));
      return run('osascript', ['-e', `display notification ${q(text)} with title ${q(title)}${subtitle ? ` subtitle ${q(subtitle)}` : ''}`], { timeout: 8000 }).ok;
    }
    if (process.platform === 'linux') return run('notify-send', [title, text], { timeout: 5000 }).ok;
    return false;
  }

  /** A small question box. Resolves to the button picked ('' if closed). */
  function dialog(message, buttons, title = app) {
    if (!MAC) return '';
    const lines = ['on run argv', 'set btns to {}', 'repeat with i from 3 to count of argv', 'set end of btns to item i of argv', 'end repeat',
      'display dialog (item 1 of argv) with title (item 2 of argv) buttons btns default button (count of btns)', 'return button returned of result', 'end run'];
    const a = [];
    for (const l of lines) a.push('-e', l);
    const r = run('osascript', [...a, message, title, ...buttons], { timeout: 600000 });
    return r.ok ? r.out : '';
  }

  /** The app in front right now: { name, bundle } (no permission needed). */
  function frontmost() {
    if (!MAC) return null;
    const r = jxa("ObjC.import('AppKit'); var a = $.NSWorkspace.sharedWorkspace.frontmostApplication; JSON.stringify({ name: ObjC.unwrap(a.localizedName), bundle: ObjC.unwrap(a.bundleIdentifier) })", [], 5000);
    try { return JSON.parse(r.out); } catch { return null; }
  }
  /** Bring an app back to the front. */
  function activate(bundle) {
    if (MAC && bundle) run('open', ['-b', bundle], { timeout: 5000 });
  }
  /** Open a page of System Settings (x-apple.systempreferences:…), a file, or a web address. */
  function open(target) {
    const cmd = MAC ? ['open', [target]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', target]] : ['xdg-open', [target]];
    return run(cmd[0], cmd[1], { timeout: 8000 }).ok;
  }

  return { MAC, run, jxa, makeApp, removeApp, appsDir, startAgent, stopAgent, agentState, plistPath, notify, dialog, frontmost, activate, open };
};
module.exports.run = run;
module.exports.jxa = jxa;
module.exports.MAC = MAC;
