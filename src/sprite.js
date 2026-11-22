'use strict';
// Pixel art in the terminal.
//
// Every letter in a drawing is one pixel and '.' is see-through. Two rows of
// pixels share one line of text, so a 16x16 drawing takes 16 columns by 8 lines.
// Solid cells are drawn as coloured spaces (never block characters), which is
// what keeps them free of thin seams in terminals like macOS Terminal.

const A = require('./ansi');

const px = (grid, x, y) => {
  const row = grid[y];
  const c = row ? row[x] : undefined;
  return c && c !== '.' && c !== ' ' ? c : null;
};

/**
 * Draw a grid. `ink` maps letters to colours ('#rrggbb'). `bg` is the colour
 * behind the picture (the screen's background) - knowing it lets half-filled
 * cells be painted completely. Returns one string per line of text.
 */
function draw(grid, ink, { bg = null } = {}) {
  const h = grid.length;
  const w = Math.max(0, ...grid.map((r) => r.length));
  const lines = [];
  for (let y = 0; y < h; y += 2) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const t = px(grid, x, y);
      const b = px(grid, x, y + 1);
      line += cell(t ? ink[t] : null, b ? ink[b] : null, bg);
    }
    lines.push(line);
  }
  return lines;
}

function cell(top, bottom, bg) {
  if (A.getLevel() === 0) return top || bottom ? (top && bottom ? '█' : top ? '▀' : '▄') : ' ';
  if (!top && !bottom) return bg ? A.paint(' ', { bg }) : ' ';
  // Block characters don't quite fill their half of the line in terminals that
  // add line spacing (macOS Terminal leaves a sliver at the TOP of each line),
  // but a background colour always fills the whole cell. So anything touching
  // the top of a cell is drawn as background, with the lower-half block ▄ (which
  // does sit flush with the bottom) on top of it. Never ▀.
  if (top && bottom) return top === bottom ? A.paint(' ', { bg: top }) : A.paint('▄', { fg: bottom, bg: top });
  if (top) return bg ? A.paint('▄', { fg: bg, bg: top }) : A.paint('▀', { fg: top });
  return A.paint('▄', bg ? { fg: bottom, bg } : { fg: bottom });
}

// ── blocky pictures, for macOS Terminal ───────────────────────────────────────
// Even drawn as carefully as above, macOS Terminal shows thin stripes wherever
// two colours share one line of text. So there, pictures are drawn with whole
// cells only: every pixel is two spaces painted with a background colour.
// That's twice the size, so each mascot has a smaller picture made for it.

/** 'blocky' in macOS Terminal, 'smooth' elsewhere. TUI_PIXELS=blocky|smooth decides instead. */
function style() {
  const want = String(process.env.TUI_PIXELS || '').toLowerCase();
  if (want === 'blocky' || want === 'smooth') return want;
  return process.env.TERM_PROGRAM === 'Apple_Terminal' ? 'blocky' : 'smooth';
}

/** Whole cells only: one line of text per row of pixels, two columns per pixel. */
function drawBlocky(grid, ink, { bg = null } = {}) {
  const w = Math.max(0, ...grid.map((r) => r.length));
  return grid.map((row) => {
    let line = '';
    for (let x = 0; x < w; x++) {
      const c = row[x] && row[x] !== '.' && row[x] !== ' ' ? row[x] : null;
      if (A.getLevel() === 0) line += c ? '██' : '  ';
      else if (c) line += A.paint('  ', { bg: ink[c] });
      else line += bg ? A.paint('  ', { bg }) : '  ';
    }
    return line;
  });
}

/** The right picture for this terminal: the detailed one, or the small blocky one. */
function picture(big, small, ink, opts = {}) {
  return style() === 'blocky' && small ? drawBlocky(small, ink, opts) : draw(big, ink, opts);
}

/** How big picture() comes out: { w: columns, h: lines }. */
function size(big, small) {
  if (style() === 'blocky' && small) return { w: Math.max(...small.map((r) => r.length)) * 2, h: small.length };
  return { w: Math.max(...big.map((r) => r.length)), h: Math.ceil(big.length / 2) };
}

// ── small helpers for building animation frames ───────────────────────────────

/** Change some rows: edit(grid, { 3: '..XX..' }). */
const edit = (grid, rows) => grid.map((r, i) => (rows[i] !== undefined ? rows[i] : r));
/** Move everything above row `from` sideways by dx pixels (a lean or sway). */
const shift = (grid, dx, from = grid.length) => grid.map((r, i) => {
  if (i >= from || !dx) return r;
  return dx > 0 ? '.'.repeat(dx) + r.slice(0, r.length - dx) : r.slice(-dx) + '.'.repeat(-dx);
});
/** Swap one letter for another everywhere. */
const recolor = (grid, from, to) => grid.map((r) => r.split(from).join(to));
/** Mirror left to right. */
const flip = (grid) => grid.map((r) => r.split('').reverse().join(''));
/** Put single pixels on top: dots(grid, [[x, y, 'P'], ...]). */
const dots = (grid, list) => {
  const g = grid.map((r) => r.split(''));
  for (const [x, y, c] of list) if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c;
  return g.map((r) => r.join(''));
};

module.exports = { draw, drawBlocky, picture, size, style, cell, edit, shift, recolor, flip, dots };
