'use strict';
// Opening an app's page: in a window of its own (no tabs or address bar) when
// Chrome, Edge or Brave is installed, so it feels like an app. Otherwise a
// normal browser tab. (APP_NO_WINDOW=1 opens nothing: for tests.)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function openBrowser(url) {
  if (process.env.APP_NO_WINDOW === '1') return false;
  let cmd;
  if (process.platform === 'darwin') cmd = ['open', [url]];
  else if (process.platform === 'win32') cmd = ['rundll32', ['url.dll,FileProtocolHandler', url]];
  else cmd = ['xdg-open', [url]];
  try {
    const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Is there a browser that can open a page as its own window? */
function canWindow() {
  if (process.platform !== 'darwin') return true;
  return ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium'].some((name) => fs.existsSync(`/Applications/${name}.app`) || fs.existsSync(path.join(os.homedir(), 'Applications', `${name}.app`)));
}

function openWindow(url, { width = 1400, height = 900, x, y } = {}) {
  if (process.env.APP_NO_WINDOW === '1') return false;
  const args = [`--app=${url}`, `--window-size=${width},${height}`];
  if (x !== undefined && y !== undefined) args.push(`--window-position=${Math.round(x)},${Math.round(y)}`);
  const tries = [];
  if (process.platform === 'darwin') {
    for (const name of ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium']) {
      if (fs.existsSync(`/Applications/${name}.app`) || fs.existsSync(path.join(os.homedir(), 'Applications', `${name}.app`))) tries.push(['open', ['-na', name, '--args', ...args]]);
    }
  } else if (process.platform === 'win32') {
    const base = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const rel of ['Microsoft\\Edge\\Application\\msedge.exe', 'Google\\Chrome\\Application\\chrome.exe', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe']) {
      for (const b of base) { const exe = path.join(b, rel); if (fs.existsSync(exe)) tries.push([exe, args]); }
    }
  } else {
    for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
      for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
        if (dir && fs.existsSync(path.join(dir, bin))) tries.push([path.join(dir, bin), args]);
      }
    }
  }
  const pick = tries[0];
  if (!pick) return openBrowser(url);
  try {
    const child = spawn(pick[0], pick[1], { stdio: 'ignore', detached: true, windowsHide: true });
    const started = Date.now();
    let fellBack = false;
    const fallBack = () => { if (!fellBack) { fellBack = true; openBrowser(url); } };
    child.on('error', fallBack);
    child.on('exit', (code) => { if (code && Date.now() - started < 5000) fallBack(); });
    child.unref();
    return true;
  } catch {
    return openBrowser(url);
  }
}

module.exports = { openBrowser, openWindow, canWindow };
