/* scene.js: a tiny engine for living pixel scenes behind an app's window.
 *
 * The page's own background shows through (plain white by day, black at
 * night: no painted sky). A scene is drawn small and scaled up, so it's crisp
 * pixel art and cheap to draw. It pauses when the tab is hidden, and holds
 * still for people who ask for less motion.
 *
 *   PixelScene.start(canvas, {
 *     night: () => true,                         // night (dark mode) or day
 *     build: ({ W, H, night, rnd, px }) => state, // lay the scene out, once per size and time of day
 *     draw: (g, state, t, dt) => {},              // one frame (t: seconds since start)
 *     fps: 24,
 *   });
 */
(function (root) {
  'use strict';

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  /** Draw a picture made of letters ('.' is see-through) with colours from `ink`. */
  function sprite(g, rows, x, y, ink, flip) {
    x = Math.round(x); y = Math.round(y);
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var ch = row[flip ? row.length - 1 - i : i];
        if (ch !== '.' && ink[ch]) { g.fillStyle = ink[ch]; g.fillRect(x + i, y + r, 1, 1); }
      }
    }
  }
  function dot(g, x, y, c, w, h) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w || 1, h || 1); }

  function start(cv, o) {
    var fps = o.fps || 24;
    var calm = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var S = null, raf = 0, last = 0, t0 = performance.now(), hushUntil = 0;
    function build() {
      var px = o.px ? o.px() : (innerWidth > 1700 ? 4 : 3);
      var W = Math.ceil(cv.clientWidth / px), H = Math.ceil(cv.clientHeight / px);
      if (!W || !H) { S = null; return; }
      cv.width = W; cv.height = H;
      var night = !!o.night();
      S = o.build({ W: W, H: H, night: night, px: px, rnd: rng(W * 7919 + H * 31 + (night ? 1 : 2)) }) || {};
      S.W = W; S.H = H; S.night = night;
      if (calm) paint(performance.now());
    }
    function paint(now) {
      if (!S) build();
      if (!S) return;
      var g = cv.getContext('2d');
      g.clearRect(0, 0, S.W, S.H);
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      o.draw(g, S, calm ? 0 : Math.max(0, (now - t0) / 1000), calm || now < hushUntil ? 0 : dt);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 1000 / fps - 2) return;
      paint(now);
    }
    var queued = 0;
    addEventListener('resize', function () { clearTimeout(queued); queued = setTimeout(build, 120); });
    if (root.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { build(); });
    build();
    if (!calm) raf = requestAnimationFrame(frame); else paint(performance.now());
    return {
      redraw: build,
      hush: function (ms) { hushUntil = performance.now() + (ms || 1500); },
      stop: function () { cancelAnimationFrame(raf); },
      state: function () { return S; },
    };
  }

  root.PixelScene = { start: start, rng: rng, canvas: canvas, sprite: sprite, dot: dot };
})(typeof window !== 'undefined' ? window : this);
