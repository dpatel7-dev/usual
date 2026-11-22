'use strict';
// Terminal text helpers (shared with gossip, tree of thought, pigeon and pca): colours that degrade gracefully (24-bit -> 256 -> none)
// and text measuring that understands emoji, CJK and combining characters.
//
// A colour is either a standard ANSI name ('cyan', 'brightBlue', ...), which
// follows whatever palette your terminal uses, or an exact '#rrggbb' / [r,g,b].

const RESET = '\x1b[0m';
const env = process.env;

const ANSI = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  gray: 90, brightRed: 91, brightGreen: 92, brightYellow: 93, brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97,
};

// 0 = no colour, 2 = 256 colours, 3 = 24-bit
function detectLevel() {
  const force = String((env.TUI_COLOR || env.FORCE_TERM_COLOR) || '').toLowerCase();
  if (['0', 'off', 'none', 'never'].includes(force)) return 0;
  if (force === '256') return 2;
  if (['truecolor', '24bit'].includes(force)) return 3;
  const forced = ['1', 'on', 'always'].includes(force);
  if (!forced && (env.NO_COLOR || env.TERM === 'dumb' || !process.stdout.isTTY)) return 0;
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM || '')) return 3;
  if (process.platform === 'win32' || env.WT_SESSION) return 3;
  if (/^(iTerm\.app|vscode|WezTerm|ghostty|Hyper|Tabby|rio)$/i.test(env.TERM_PROGRAM || '')) return 3;
  if (/kitty|alacritty|ghostty|foot|wezterm|-direct/i.test(env.TERM || '')) return 3;
  return 2; // safe on Apple Terminal, tmux and almost everything else
}

let level = detectLevel();
function setLevel(n) { level = n; }
function getLevel() { return level; }
// (kept for older callers) on/off switch
function setColor(on) { level = on ? Math.max(level, 2) || 3 : 0; }
function colorOn() { return level > 0; }

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function to256(r, g, b) {
  // Greyish colours go to the grey ramp: the colour cube only has a few greys,
  // and its nearest "tinted" entries turn blue-greys into lavender.
  if (Math.max(r, g, b) - Math.min(r, g, b) < 32) {
    const gray = Math.round((r + g + b) / 3);
    if (gray < 8) return 16;
    if (gray > 248) return 231;
    return 232 + Math.min(23, Math.round(((gray - 8) / 247) * 24));
  }
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function colorCode(c, isBg) {
  if (!c) return null;
  if (typeof c === 'string' && c[0] !== '#') {
    const n = ANSI[c];
    return n ? String(isBg ? n + 10 : n) : null;
  }
  const rgb = typeof c === 'string' ? parseHex(c) : c;
  if (!rgb) return null;
  const base = isBg ? 48 : 38;
  if (level === 3) return `${base};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  return `${base};5;${to256(rgb[0], rgb[1], rgb[2])}`;
}

/** style: { fg, bg, bold, dim, italic, underline, inverse } */
function sgr(style) {
  if (!style || level === 0) return '';
  const codes = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.italic) codes.push(3);
  if (style.underline) codes.push(4);
  if (style.inverse) codes.push(7);
  const fg = colorCode(style.fg, false);
  const bg = colorCode(style.bg, true);
  if (fg) codes.push(fg);
  if (bg) codes.push(bg);
  return codes.length ? `\x1b[${codes.join(';')}m` : '';
}

function paint(text, style) {
  const open = sgr(style);
  return open ? open + text + RESET : text;
}

const dim = (s) => paint(s, { dim: true });
const bold = (s) => paint(s, { bold: true });

// ── paper: painting every cell in the theme's own background ────────────────
// Normally a program draws on whatever background your terminal has. With paper
// on, every line it draws carries its own background and
// text colour, so it looks the same in any terminal.

let paper = null;

/** Paint with this background and text colour from now on ({ bg, fg }), or stop (null). */
function setPaper(p) {
  if (!p || level === 0) { paper = null; return; }
  const bg = colorCode(p.bg, true);
  const fg = colorCode(p.fg, false);
  paper = bg && fg ? { bg: p.bg, fg: p.fg, on: `\x1b[${fg};${bg}m`, fgOn: `\x1b[${fg}m`, bgOn: `\x1b[${bg}m` } : null;
}
function getPaper() { return paper; }

/**
 * A line ready to write: starts on the paper colours and goes back to them
 * after every reset, so nothing falls through to the terminal's own background.
 */
function paperize(s) {
  if (!paper) return s;
  return paper.on + String(s).replace(/\x1b\[(0?|39|49)m/g, (all, c) => (c === '39' ? paper.fgOn : c === '49' ? paper.bgOn : RESET + paper.on));
}

// ── measuring ───────────────────────────────────────────────────────────────

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const ASCII_RE = /^[\x20-\x7e]*$/;
const ZERO_RE = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]/u;
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\u{FE0F}|[\u{1F1E6}-\u{1F1FF}]{2}/u;

function graphemes(s) {
  if (ASCII_RE.test(s)) return s.split('');
  if (!segmenter) return Array.from(s);
  const out = [];
  for (const seg of segmenter.segment(s)) out.push(seg.segment);
  return out;
}

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function gWidth(g) {
  const cp = g.codePointAt(0);
  if (cp < 0x7f) return cp < 32 ? 0 : 1;
  if (ZERO_RE.test(g)) return 0;
  if (isWide(cp) || EMOJI_RE.test(g)) return 2;
  return 1;
}

/** Width of plain text in terminal columns. */
function width(s) {
  if (ASCII_RE.test(s)) return s.length;
  let w = 0;
  for (const g of graphemes(s)) w += gWidth(g);
  return w;
}

const ANSI_ALL = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const ANSI_AT = /\x1b\[[0-9;?]*[ -/]*[@-~]/y;

function strip(s) {
  return s.indexOf('\x1b') < 0 ? s : s.replace(ANSI_ALL, '');
}

/** Width of text that may contain colour codes. */
function vwidth(s) {
  return width(strip(s));
}

// Cut a (possibly coloured) string to at most `max` columns. Returns [text, width].
function clipW(str, max) {
  if (max <= 0) return ['', 0];
  let out = '';
  let w = 0;
  let i = 0;
  let cut = false;
  let styled = false;
  while (i < str.length && !cut) {
    if (str.charCodeAt(i) === 27) {
      ANSI_AT.lastIndex = i;
      const m = ANSI_AT.exec(str);
      if (m) { out += m[0]; i += m[0].length; styled = true; continue; }
      i++; // a lone ESC is never printed
      continue;
    }
    let j = str.indexOf('\x1b', i);
    if (j < 0) j = str.length;
    const run = str.slice(i, j);
    if (ASCII_RE.test(run)) {
      if (w + run.length <= max) { out += run; w += run.length; } else { out += run.slice(0, max - w); w = max; cut = true; }
    } else {
      for (const g of graphemes(run)) {
        const gw = gWidth(g);
        if (w + gw > max) { cut = true; break; }
        out += g;
        w += gw;
      }
    }
    i = j;
  }
  if (styled) out += RESET;
  return [out, w];
}

function clip(str, max) {
  return clipW(str, max)[0];
}

/** Plain text clipped with an ellipsis. */
function ellipsis(s, max) {
  if (width(s) <= max) return s;
  if (max <= 1) return clip(s, max);
  return clip(s, max - 1) + '…';
}

/**
 * Word-wrap plain text. `w` is a number, or a function (lineIndex) => width so
 * the first line can be shorter than the rest. Long words (links) are broken.
 */
function wrap(text, w) {
  const at = typeof w === 'function' ? (i) => Math.max(1, w(i)) : () => Math.max(1, w);
  const out = [];
  for (const para of String(text).split('\n')) {
    if (width(para) <= at(out.length)) { out.push(para); continue; }
    let line = '';
    let lw = 0;
    const flush = () => { out.push(line.replace(/\s+$/, '')); line = ''; lw = 0; };
    for (const tok of para.match(/\s+|\S+/g) || []) {
      const tw = width(tok);
      const room = at(out.length);
      if (lw + tw <= room) { line += tok; lw += tw; continue; }
      if (/^\s/.test(tok)) { flush(); continue; }
      if (lw > 0) flush();
      if (tw <= at(out.length)) { line = tok; lw = tw; continue; }
      for (const g of graphemes(tok)) {
        const gw = gWidth(g);
        if (lw + gw > at(out.length) && lw > 0) flush();
        line += g;
        lw += gw;
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}

module.exports = {
  RESET, ANSI, setColor, colorOn, setLevel, getLevel, detectLevel, parseHex, to256, sgr, paint, dim, bold, setPaper, getPaper, paperize,
  graphemes, gWidth, width, strip, vwidth, clip, clipW, ellipsis, wrap,
};
