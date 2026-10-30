/*
 * Relativistic portrait glitch: a Doppler shift. Reference implementation, no dependencies.
 *
 * Founder cards show a polished, AI-edited portrait first ("RENDERED / AI"), which then
 * shifts once to reveal the real photograph ("AS OBSERVED"). The real photo is the point,
 * and it is always the default:
 *   - the HTML only ever contains the real photo (<img>), so no-JS readers, crawlers,
 *     social cards and screen readers get the real person;
 *   - the rendered version is added by this script, and only when motion is allowed;
 *   - with prefers-reduced-motion, nothing is added: the real photo shows, still.
 *
 * The shift
 *   The frame is cut into diagonal bands on the 45-degree grid. Each band slides along its
 *   own 45-degree direction (out and back, once) and swaps from the rendered image to the
 *   observed one at a staggered moment. While a band moves, its image splits into an accent
 *   copy displaced forward (blueshift) and a signal copy displaced backward (redshift),
 *   added together so overall brightness holds: no full-frame luminance flash.
 *   It plays once per card, about 600 ms, never loops, and has no flicker (each band moves
 *   once), so it stays well under three flashes per second.
 *
 * Markup
 *   <figure class="portrait" data-rendered="ai.jpg">
 *     <div class="portrait-frame">
 *       <img src="real.jpg" alt="Name" width="480" height="600">
 *       <span class="portrait-state" aria-hidden="true">As observed</span>
 *     </div>
 *   </figure>
 *   RelativisticGlitch.init(document);
 */
(function (global) {
  'use strict';

  var DURATION = 600;          // ms (brief: 500 to 700)
  var BANDS = 9;               // diagonal bands across the frame
  var DELAY = 900;             // ms after the card is mostly in view
  var LABEL_RENDERED = 'Rendered / AI';
  var LABEL_OBSERVED = 'As observed';
  // Blueshift and redshift. The blue is the accent (#42a3fd) at 75%; the orange is white
  // minus that blue, which lands on the signal hue. The two add up to exactly white, so a
  // band split into both copies keeps its colour and brightness where they overlap.
  var BLUE = 'rgb(50, 122, 190)', ORANGE = 'rgb(205, 133, 65)';

  var reduced = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function prng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6d2b79f5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  // A single smooth excursion: 0 at a, peak at the middle, 0 at b.
  function bump(p, a, b) { var t = clamp((p - a) / (b - a), 0, 1); return Math.sin(Math.PI * t) * Math.sin(Math.PI * t); }

  function loadImage(src) {
    return new Promise(function (resolve, reject) { var i = new Image(); i.onload = function () { resolve(i); }; i.onerror = reject; i.src = src; });
  }

  // Draw an image to cover w x h (like object-fit: cover) into a new canvas.
  function cover(img, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c;
  }
  // Pad a canvas with mirrored copies of itself, so a displaced band never exposes an
  // empty edge (which would read as a dark flash). Returns a (w + 2m) x (h + 2m) canvas.
  function padded(src, m) {
    var w = src.width, h = src.height;
    var c = document.createElement('canvas'); c.width = w + 2 * m; c.height = h + 2 * m;
    var g = c.getContext('2d');
    for (var i = -1; i <= 1; i++) {
      for (var j = -1; j <= 1; j++) {
        g.save();
        g.translate(i === 1 ? m + 2 * w : m, j === 1 ? m + 2 * h : m);
        g.scale(i === 0 ? 1 : -1, j === 0 ? 1 : -1);
        g.drawImage(src, 0, 0);
        g.restore();
      }
    }
    return c;
  }
  // The image multiplied by a colour: one "channel" of the chromatic split.
  function tint(src, colour) {
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0);
    return c;
  }

  function enhance(card, index) {
    var frame = card.querySelector('.portrait-frame') || card;
    var real = frame.querySelector('img');
    var state = frame.querySelector('.portrait-state');
    var renderedSrc = card.getAttribute('data-rendered');
    if (!real || !renderedSrc || reduced.matches) return;

    Promise.all([loadImage(renderedSrc), real.complete ? Promise.resolve(real) : loadImage(real.currentSrc || real.src)]).then(function (imgs) {
      if (reduced.matches) return;
      var rect = real.getBoundingClientRect();
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
      var M = Math.round(Math.max(W, H) * 0.16);                 // margin for displacement
      var A = padded(cover(imgs[0], W, H), M), B = padded(cover(imgs[1], W, H), M);   // A rendered, B observed
      var tints = { A: [tint(A, BLUE), tint(A, ORANGE)], B: [tint(B, BLUE), tint(B, ORANGE)] };

      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      canvas.className = 'portrait-glitch';
      canvas.setAttribute('aria-hidden', 'true');
      frame.insertBefore(canvas, state || null);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(A, -M, -M);
      card.classList.add('is-rendered');
      if (state) state.textContent = LABEL_RENDERED;

      // Per-band constants: displacement amplitude and direction, timing, swap moment.
      var rand = prng(20261028 + index * 7919);
      var bands = [];
      for (var k = 0; k < BANDS; k++) {
        var start = 0.05 + rand() * 0.25;
        bands.push({
          amp: (0.035 + rand() * 0.06) * W * (rand() < 0.5 ? -1 : 1),
          start: start, end: start + 0.45 + rand() * 0.2,
          swap: 0.3 + rand() * 0.35
        });
      }
      // Unit vector along the 45-degree "light-like" direction, rising to the right.
      var dx = Math.SQRT1_2, dy = -Math.SQRT1_2;
      var span = W + H;                 // bands are cut along x + y = c, c in [0, W + H]
      var bw = span / BANDS;

      function drawFrame(p) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        for (var k = 0; k < BANDS; k++) {
          var b = bands[k];
          var e = bump(p, b.start, b.end);
          var s = b.amp * e;                       // displacement along the 45-degree direction
          var split = Math.abs(s) * 0.45;          // chromatic separation grows with speed
          var src = p < b.swap ? 'A' : 'B';
          var img = src === 'A' ? A : B;
          var c0 = k * bw, c1 = (k + 1) * bw;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(c0, 0); ctx.lineTo(c1, 0); ctx.lineTo(c1 - H, H); ctx.lineTo(c0 - H, H); ctx.closePath();
          ctx.clip();
          // Every band is added onto black, so anti-aliased band edges sum to a clean join.
          ctx.globalCompositeOperation = 'lighter';
          if (split < 0.5) {
            ctx.drawImage(img, s * dx - M, s * dy - M);
          } else {
            // Blueshift leads in the direction of travel, redshift trails.
            var dir = s > 0 ? 1 : -1;
            ctx.drawImage(tints[src][0], (s + dir * split) * dx - M, (s + dir * split) * dy - M);
            ctx.drawImage(tints[src][1], (s - dir * split) * dx - M, (s - dir * split) * dy - M);
          }
          ctx.restore();
        }
      }

      function play() {
        if (card.classList.contains('is-observed')) return;
        var t0 = 0;
        function step(now) {
          if (!t0) t0 = now;
          var p = reduced.matches ? 1 : clamp((now - t0) / DURATION, 0, 1);
          drawFrame(p);
          if (state && p >= 0.5) state.textContent = LABEL_OBSERVED;
          if (p < 1) { global.requestAnimationFrame(step); return; }
          canvas.remove();
          card.classList.remove('is-rendered');
          card.classList.add('is-observed');
          if (state) state.textContent = LABEL_OBSERVED;
        }
        global.requestAnimationFrame(step);
      }
      card._relGlitch = { play: play, reset: function () {
        card.classList.remove('is-observed'); card.classList.add('is-rendered');
        frame.insertBefore(canvas, state || null); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(A, -M, -M);
        if (state) state.textContent = LABEL_RENDERED;
      } };

      // Review aid: data-frame="0.4" pins one frame of the shift and never plays.
      var pinned = card.getAttribute('data-frame');
      if (pinned !== null) {
        var fp = parseFloat(pinned);
        drawFrame(fp);
        if (state) state.textContent = fp >= 0.5 ? LABEL_OBSERVED : LABEL_RENDERED;
        return;
      }

      // Play once, when the card is mostly in view.
      if ('IntersectionObserver' in global) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { io.disconnect(); global.setTimeout(play, DELAY); }
          });
        }, { threshold: 0.6 });
        io.observe(card);
      } else {
        global.setTimeout(play, DELAY);
      }
    }).catch(function () { /* keep the real photo */ });
  }

  function init(root) {
    var cards = (root || document).querySelectorAll('.portrait[data-rendered]');
    Array.prototype.forEach.call(cards, enhance);
  }

  global.RelativisticGlitch = { init: init, DURATION: DURATION };
})(window);
