/* street.js: a street of food places along the top of usual's window.
 *
 * Little shops with striped awnings and a picture of their food on the sign.
 * By day: painted fronts and white signs. By night: the windows are lit, the
 * signs turn to neon (one of them flickers), the street lamps come on. Now
 * and then a delivery rider goes by. Rocco the raccoon waits by the bins.
 * The page's own background shows through (white by day, black at night).
 *
 *   Street.start(canvas, { night: () => bool })
 */
(function (root) {
  'use strict';
  var PS = root.PixelScene;

  var ROCCO = {
    BIG: [
      '..........................',
      '...................g....g.',
      '..................gGg..gGg',
      '..................GGGGGGGG',
      '.................WGGGGGGGW',
      '.................WKKKgKKKW',
      '.................KKeKgKeKK',
      '.................WWWWgWWWN',
      '..TT..............WWWWWWW.',
      '.TttT...........GGGGGGG...',
      '.TTTT.........GGGGGGGGGG..',
      '..tttt......GGGGGGGGGGGG..',
      '...TTTT...GGGGGgggGGGGGG..',
      '....tttGGGGGGgggggGGGG....',
      '......TGGGGGGgggggGGGG....',
      '........GGGGGGGGGGGGG.....',
      '.........KK..KK...KK......',
    ],
    MINI: [
      '..g......g..',
      '.gGg....gGg.',
      '.GGGGGGGGGG.',
      'WGGGGggGGGGW',
      'WKKKKggKKKKW',
      'KKeKKggKKeKK',
      '.KKWWWWWWKK.',
      '..WWWNNWWW..',
      '....WWWW....',
    ],
    INK: { G: '#8a8f99', g: '#c3c7ce', W: '#f4f4f2', K: '#25282e', e: '#ffffff', N: '#25282e', T: '#3d4149', t: '#c3c7ce' },
  };
  ROCCO.INK_NIGHT = Object.assign({}, ROCCO.INK, { K: '#3d4149', N: '#4a4f58', T: '#5a5f69' });
  /** The same picture with a thin dark edge around it ('o'), so his white face shows on a white page. */
  ROCCO.outline = function (rows) {
    var w = rows[0].length + 2, h = rows.length + 2;
    var at = function (x, y) { var r = rows[y - 1]; return r && r[x - 1] && r[x - 1] !== '.'; };
    var out = [];
    for (var y = 0; y < h; y++) {
      var line = '';
      for (var x = 0; x < w; x++) line += at(x, y) ? rows[y - 1][x - 1] : (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ? 'o' : '.';
      out.push(line);
    }
    return out;
  };
  ROCCO.EDGE = '#3a3d44';
  root.Rocco = ROCCO;

  // the food on the signs
  var ICONS = {
    pizza: { rows: ['ccccccc', 'cyyryyc', '.yryyy.', '.yyyry.', '..yry..', '..yyy..', '...y...'], ink: { c: '#c98a3a', y: '#f6cf55', r: '#d9442b' } },
    bowl: { rows: ['.....k.', '....k..', '.nnnkn.', 'bbbbbbb', '.bbbbb.', '..bbb..'], ink: { k: '#5b4636', n: '#e8b84a', b: '#e0502c' } },
    burger: { rows: ['..bbb..', '.bbbbb.', 'bbbbbbb', 'lllllll', 'mmmmmmm', 'yyyyyyy', '.bbbbb.'], ink: { b: '#d99a4a', l: '#6dbb5a', m: '#6b3b25', y: '#f6cf55' } },
    taco: { rows: ['..lll..', '.lrlrl.', 'yyyyyyy', 'yyyyyyy', '.yyyyy.'], ink: { l: '#6dbb5a', r: '#e0502c', y: '#f0b84a' } },
    cup: { rows: ['.s.s...', '..s.s..', 'wwwwww.', 'wwwwwhh', 'wwwwww.', '.wwww..'], ink: { s: '#9aa0a8', w: '#b8714a', h: '#b8714a' } },
  };
  var NEON = { pizza: '#ff8a3d', bowl: '#ff4f7b', burger: '#ffd84a', taco: '#8dff7a', cup: '#5ff2ff' };
  var DAY = {
    walls: [['#d9785a', '#c86a4e'], ['#efd7a2', '#e2c88c'], ['#9cc4a9', '#89b396'], ['#c8d2df', '#b5c0cf'], ['#ecb8a3', '#dea48e'], ['#f2e8d6', '#e5d8c0']],
    trim: '#3b3f47', glass: '#d6e7f0', glassDark: '#a9c3d1', door: '#6a5240', sign: '#ffffff', signEdge: '#3b3f47',
    awn: [['#e0502c', '#ffffff'], ['#2f8a51', '#ffffff'], ['#f0ad2e', '#ffffff'], ['#3d6fa3', '#ffffff'], ['#8a5bbf', '#ffffff']],
    walk: '#dcd8cf', curb: '#b9b4aa', post: '#4a4f58', lamp: '#ebe5d6', can: '#7d8794', canLid: '#5f6874',
  };
  var NIGHT = {
    walls: [['#4a2a22', '#3f231c'], ['#4a3f2c', '#3e3425'], ['#233a2b', '#1d3124'], ['#2a303a', '#232833'], ['#46302a', '#3b2823'], ['#3b362e', '#322d26']],
    trim: '#121317', glass: '#ffcf6b', glassDark: '#1f232b', door: '#2a211b', sign: '#141519', signEdge: '#2b2e35',
    awn: [['#9c3a22', '#2c2c2c'], ['#1f5c37', '#2c2c2c'], ['#a3761f', '#2c2c2c'], ['#264a70', '#2c2c2c'], ['#5b3d80', '#2c2c2c']],
    walk: '#262522', curb: '#34322e', post: '#3a3e46', lamp: '#ffe7a3', can: '#3f4650', canLid: '#2f353e',
  };
  // a rider with a box, facing left
  var RIDER = [
    ['....hhh.......', '...hhhhv......', '....sss..BBBB.', '...jjjj..BBBB.', '..jjjjjjjBBBB.', '.k.jjj...BBBB.', '.kkkkkkkkkkkk.', 'kkkkkkkkkkkkkk', '.oo.......oo..', '.oo.......oo..'],
    ['....hhh.......', '...hhhhv......', '....sss..BBBB.', '...jjjj..BBBB.', '..jjjjjjjBBBB.', '.k.jjj...BBBB.', '.kkkkkkkkkkkk.', 'kkkkkkkkkkkkkk', '.OO.......OO..', '.oo.......oo..'],
  ];
  var RIDER_INK = { h: '#e0502c', v: '#2b2f36', s: '#e9b48f', j: '#3d6fa3', B: '#f0ad2e', k: '#4a4f58', o: '#25282e', O: '#6a707a' };

  function start(cv, opts) {
    opts = opts || {};
    function build(o) {
      var W = o.W, H = o.H, rnd = o.rnd, P = o.night ? NIGHT : DAY;
      var ground = H - 4; // the sidewalk starts here
      var back = PS.canvas(W, H), g = back.getContext('2d');
      var shops = [], lamps = [];
      var kinds = ['pizza', 'bowl', 'burger', 'taco', 'cup'];
      var x = 2 + Math.floor(rnd() * 6), k = Math.floor(rnd() * 5), right = W - 40;
      while (x < right - 30) {
        var w = 30 + Math.floor(rnd() * 22);
        if (x + w > right) w = right - x;
        if (w < 28) break;
        var h = 22 + Math.floor(rnd() * Math.max(1, Math.min(13, ground - 26)));
        shops.push({ x: x, w: w, h: h, wall: P.walls[(k + Math.floor(rnd() * 2)) % P.walls.length], awn: P.awn[k % P.awn.length], icon: kinds[k % kinds.length], lit: [] });
        k++;
        x += w;
        var gap = 3 + Math.floor(rnd() * 8);
        if (gap >= 6) lamps.push(x + Math.floor(gap / 2));
        x += gap;
      }
      shops.forEach(function (s, si) {
        var top = ground - s.h;
        // the wall, with a little texture
        g.fillStyle = s.wall[0]; g.fillRect(s.x, top, s.w, s.h);
        g.fillStyle = s.wall[1];
        for (var yy = top + 3; yy < ground; yy += 4) for (var xx = s.x + ((yy / 4) % 2 ? 1 : 3); xx < s.x + s.w - 1; xx += 6) g.fillRect(xx, yy, 2, 1);
        // the roof edge
        g.fillStyle = P.trim; g.fillRect(s.x - 1, top, s.w + 2, 2);
        // upstairs windows
        var shopTop = ground - 15;
        var upH = shopTop - top - 9;
        if (upH >= 4) {
          var n = Math.max(1, Math.floor((s.w - 4) / 9));
          var gapW = (s.w - n * 5) / (n + 1);
          for (var i = 0; i < n; i++) {
            var wx = Math.round(s.x + gapW + i * (5 + gapW)), wy = top + 4, wh = Math.min(6, upH);
            var lit = o.night && rnd() < 0.55;
            s.lit.push({ x: wx, y: wy, w: 5, h: wh, on: lit, ph: rnd() * 40 });
            g.fillStyle = P.trim; g.fillRect(wx - 1, wy - 1, 7, wh + 2);
            g.fillStyle = lit ? P.glass : P.glassDark; g.fillRect(wx, wy, 5, wh);
            if (!o.night) { g.fillStyle = P.glass; g.fillRect(wx, wy, 2, wh); }
          }
        }
        // the sign board (its picture is drawn each frame, for the neon)
        s.sign = { x: s.x + Math.floor(s.w / 2) - 7, y: shopTop - 9, w: 15, h: 9 };
        g.fillStyle = P.signEdge; g.fillRect(s.sign.x - 1, s.sign.y - 1, s.sign.w + 2, s.sign.h + 2);
        g.fillStyle = P.sign; g.fillRect(s.sign.x, s.sign.y, s.sign.w, s.sign.h);
        // the shop window and the door
        var doorW = 6, doorX = s.x + s.w - doorW - 3;
        g.fillStyle = P.trim; g.fillRect(s.x + 2, shopTop + 4, doorX - s.x - 4, ground - shopTop - 4);
        g.fillStyle = P.glass; g.fillRect(s.x + 3, shopTop + 5, doorX - s.x - 6, ground - shopTop - 7);
        if (!o.night) { g.fillStyle = P.glassDark; g.fillRect(s.x + 3, ground - 4, doorX - s.x - 6, 2); }
        else { g.fillStyle = 'rgba(255, 207, 107, .25)'; g.fillRect(s.x + 1, ground, doorX - s.x - 2, 2); }
        g.fillStyle = P.trim; g.fillRect(doorX - 1, shopTop + 4, doorW + 2, ground - shopTop - 4);
        g.fillStyle = P.door; g.fillRect(doorX, shopTop + 5, doorW, ground - shopTop - 5);
        g.fillStyle = o.night ? '#ffcf6b' : '#c9a24a'; g.fillRect(doorX + doorW - 2, ground - 6, 1, 1);
        // the striped awning, with a scalloped edge
        for (var ax = s.x + 1; ax < doorX - 1; ax++) {
          var stripe = Math.floor((ax - s.x) / 3) % 2;
          g.fillStyle = s.awn[stripe]; g.fillRect(ax, shopTop, 1, 4);
          if ((ax - s.x) % 3 !== 2) g.fillRect(ax, shopTop + 4, 1, 1);
        }
        void si;
      });
      // the sidewalk and the curb
      g.fillStyle = P.walk; g.fillRect(0, ground, W, 3);
      g.fillStyle = P.curb; g.fillRect(0, ground + 3, W, 1);
      for (var cx = 5; cx < W; cx += 12) g.fillRect(cx, ground + 1, 1, 1);
      // street lamps
      lamps.forEach(function (lx) { g.fillStyle = P.post; g.fillRect(lx, ground - 18, 1, 18); g.fillRect(lx - 1, ground - 1, 3, 1); g.fillRect(lx - 2, ground - 19, 5, 1); g.fillStyle = P.lamp; g.fillRect(lx - 1, ground - 18, 3, 1); });
      // Rocco's bins
      var binX = W - 15;
      g.fillStyle = P.canLid; g.fillRect(binX - 1, ground - 11, 10, 2); g.fillRect(binX + 3, ground - 12, 2, 1);
      g.fillStyle = P.can; g.fillRect(binX, ground - 9, 8, 9);
      g.fillStyle = P.canLid; for (var bx = binX + 1; bx < binX + 8; bx += 2) g.fillRect(bx, ground - 8, 1, 7);
      var flick = shops.length ? Math.floor(rnd() * shops.length) : -1;
      return { P: P, back: back, shops: shops, lamps: lamps, ground: ground, flick: flick, rider: { x: W + 20, wait: 3 + rnd() * 6 }, rocco: { x: W - 44, blink: 2 + rnd() * 3 }, rnd: rnd };
    }

    function draw(g, S, t, dt) {
      var P = S.P;
      // lamp light at night, under everything
      if (S.night) S.lamps.forEach(function (lx) {
        for (var r = 0; r < 18; r++) { g.globalAlpha = 0.11 * (1 - r / 18); g.fillStyle = P.lamp; g.fillRect(lx - 1 - Math.floor(r / 2.2), S.ground - 17 + r, 3 + 2 * Math.floor(r / 2.2), 1); }
        g.globalAlpha = 1;
      });
      g.drawImage(S.back, 0, 0);
      if (S.night) S.lamps.forEach(function (lx) { g.globalAlpha = 0.5; g.fillStyle = P.lamp; g.fillRect(lx - 2, S.ground - 18, 5, 2); g.globalAlpha = 1; });
      // signs: the food, painted by day, neon by night
      S.shops.forEach(function (s, i) {
        var ic = ICONS[s.icon], ix = s.sign.x + Math.floor((s.sign.w - ic.rows[0].length) / 2), iy = s.sign.y + Math.floor((s.sign.h - ic.rows.length) / 2);
        if (!S.night) { PS.sprite(g, ic.rows, ix, iy, ic.ink, false); return; }
        var on = i !== S.flick || Math.sin(t * 13) + Math.sin(t * 3.1) > -0.6;
        if (!on) return;
        var c = NEON[s.icon], ink = {};
        Object.keys(ic.ink).forEach(function (k) { ink[k] = c; });
        g.globalAlpha = 0.22; g.fillStyle = c; g.fillRect(s.sign.x - 1, s.sign.y - 1, s.sign.w + 2, s.sign.h + 2); g.globalAlpha = 1;
        // just the outline of the picture, like bent glass tubes
        var rows = ic.rows, out = rows.map(function (row, y) {
          return row.split('').map(function (ch, x) {
            if (ch === '.') return '.';
            var edge = y === 0 || y === rows.length - 1 || x === 0 || x === row.length - 1 || rows[y - 1][x] === '.' || rows[y + 1][x] === '.' || row[x - 1] === '.' || row[x + 1] === '.';
            return edge ? ch : '.';
          }).join('');
        });
        PS.sprite(g, out, ix, iy, ink, false);
      });
      // a window upstairs goes on or off now and then
      if (S.night) S.shops.forEach(function (s) { s.lit.forEach(function (w) { if (w.on && Math.sin(t / 9 + w.ph) > 0.97) { g.fillStyle = P.glassDark; g.fillRect(w.x, w.y, w.w, w.h); } }); });
      // Rocco, waiting by the bins (and blinking)
      var R = S.rocco;
      R.blink -= dt;
      var rows = ROCCO.BIG;
      if (R.blink < 0) { rows = rows.map(function (r) { return r.replace(/e/g, 'K'); }); if (R.blink < -0.14) R.blink = 2.5 + S.rnd() * 4; }
      if (S.night) PS.sprite(g, rows, R.x, S.ground - 16, ROCCO.INK_NIGHT, false);
      else PS.sprite(g, ROCCO.outline(rows), R.x - 1, S.ground - 17, Object.assign({ o: ROCCO.EDGE }, ROCCO.INK), false);
      // the delivery rider
      var D = S.rider;
      if (D.wait > 0) D.wait -= dt;
      else {
        D.x -= 34 * dt;
        if (D.x < -20) { D.x = S.W + 20; D.wait = 9 + S.rnd() * 14; }
      }
      if (D.wait <= 0) PS.sprite(g, RIDER[Math.floor(t * 8) % 2], D.x, S.ground - 8, RIDER_INK, false);
    }

    return PS.start(cv, { night: opts.night, build: build, draw: draw, fps: 20, px: function () { return 3; } });
  }

  root.Street = { start: start };
})(window);
