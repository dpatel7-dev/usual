'use strict';
// Light or dark, for every app at once. pca sets it (press L in pca); every
// app reads it: "auto" follows your Mac (light by day, dark at night if your
// Mac does that), "light" and "dark" stay put.
//
// The choice lives in one small file all the apps share: ~/.djp7/look

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOOKS = ['auto', 'light', 'dark'];
const file = () => process.env.DJP7_LOOK_FILE || path.join(os.homedir(), '.djp7', 'look');

let cached = null, cachedAt = 0; // terminal apps ask on every redraw: look at the file at most every second or so

/** 'auto', 'light' or 'dark' */
function read() {
  const env = String(process.env.DJP7_LOOK || '').trim().toLowerCase();
  if (LOOKS.includes(env)) return env;
  if (cached && Date.now() - cachedAt < 1200) return cached;
  let v = 'auto';
  try { const x = fs.readFileSync(file(), 'utf8').trim().toLowerCase(); if (LOOKS.includes(x)) v = x; } catch { /* not set: auto */ }
  cached = v; cachedAt = Date.now();
  return v;
}
function write(v) {
  if (!LOOKS.includes(v)) throw new Error(`The look is auto, light or dark (not "${v}").`);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), v + '\n');
  cached = v; cachedAt = Date.now();
  return v;
}

/** Is the Mac itself in dark mode right now? (Elsewhere: assume dark, like most terminals.) */
function macDark() {
  if (process.platform !== 'darwin') return true;
  try { return /dark/i.test(require('child_process').execFileSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })); } catch { return false; }
}
/** light or dark, after "auto" is worked out */
const resolved = () => { const v = read(); return v === 'auto' ? (macDark() ? 'dark' : 'light') : v; };

/**
 * For apps with named themes: the theme to use, given the one you picked.
 *   pick('walnut', { light: 'linen', dark: 'walnut', isLight: (n) => n === 'linen' })
 */
function pick(name, { light, dark, isLight }) {
  const v = read();
  if (v === 'light' && !isLight(name)) return light;
  if (v === 'dark' && isLight(name)) return dark;
  return name;
}

/**
 * The few lines that go at the top of every app page: they make the page's
 * own light and dark styles follow the setting (and keep following it while
 * the page is open, if it can ask its app).
 */
function body(look = read(), url = '') {
  return `(function(){var L=${JSON.stringify(look)},U=${JSON.stringify(url)},mm=window.matchMedia.bind(window),real=mm('(prefers-color-scheme: dark)'),fns=[],rules=[];
function dark(){return L==='dark'||(L!=='light'&&real.matches)}
function cs(q){return /prefers-color-scheme/.test(q)}
window.__LOOK__=L;
window.matchMedia=function(q){if(!cs(q))return mm(q);var d=/dark/.test(q);var o={media:q,onchange:null,addListener:function(f){fns.push([o,f])},removeListener:function(f){fns=fns.filter(function(x){return x[1]!==f})},addEventListener:function(t,f){if(t==='change')fns.push([o,f])},removeEventListener:function(t,f){fns=fns.filter(function(x){return x[1]!==f})},dispatchEvent:function(){return false}};Object.defineProperty(o,'matches',{get:function(){return d?dark():!dark()}});return o};
function fix(list){for(var i=0;i<list.length;i++){var r=list[i];if(r.media&&r.media.mediaText&&cs(r.media.mediaText)){if(r.__look==null)r.__look=r.media.mediaText;rules.indexOf(r)<0&&rules.push(r)}if(r.cssRules)fix(r.cssRules)}}
function scan(){for(var i=0;i<document.styleSheets.length;i++){try{fix(document.styleSheets[i].cssRules)}catch(e){}}apply()}
function apply(){var d=dark();document.documentElement.style.colorScheme=L==='auto'?'':(d?'dark':'light');rules.forEach(function(r){var t=r.__look;r.media.mediaText=L==='auto'?t:t.replace(/\\(\\s*prefers-color-scheme\\s*:\\s*(dark|light)\\s*\\)/g,function(m,w){return (w==='dark')===d?'(min-width: 0px)':'(max-width: 0px)'})})}
function changed(){apply();fns.forEach(function(x){try{var e={matches:x[0].matches,media:x[0].media};typeof x[1]==='function'?x[1].call(x[0],e):x[1].handleEvent(e)}catch(e){}})}
real.addEventListener('change',function(){if(L==='auto')changed()});
document.addEventListener('load',function(e){if(e.target&&e.target.tagName==='LINK')scan()},true);
document.addEventListener('DOMContentLoaded',scan);window.addEventListener('load',scan);
if(U)setInterval(function(){if(document.hidden)return;fetch(U).then(function(r){return r.json()}).then(function(j){if(j&&j.look&&j.look!==L){L=j.look;window.__LOOK__=L;changed();window.dispatchEvent(new Event('lookchange'))}}).catch(function(){})},4000)})();`;
}
const script = (look, url) => `<script>${body(look, url)}</script>`;

/** Put the script at the top of a page. (src: for pages that only allow script files, serve body() there.) */
function inject(html, look = read(), url = '', src = '') {
  const s = src ? `<script src="${src}"></script>` : script(look, url);
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + s) : s + html;
}

module.exports = { read, write, resolved, macDark, pick, body, script, inject, LOOKS, file };
