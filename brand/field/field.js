/*
 * Relativistic field: reference implementation (Canvas 2D, no dependencies).
 *
 * This is the readable master copy of the particle field described in the
 * design brief. The site's WebGL2 field is ported from it: everything in
 * `position()` is a closed-form function of (particle, time), so it moves
 * into a vertex shader unchanged. Per-particle constants become vertex
 * attributes; time, blend, pointer and colours become uniforms.
 *
 * Coordinates
 *   Model space is right-handed and unit-sized: x to the right, y UP, z
 *   towards the viewer. One unit is `scale` CSS pixels on screen. The light
 *   cone's sides are exactly 45 degrees in model space, so the silhouette on
 *   screen is exactly 45 degrees too (perspective is 1 at z = 0).
 *
 * Formations (each holds for FORMATION_SECONDS, then blends into the next)
 *   001 UNBOUND  scattered, drifting
 *   002 GRANTED  streaming upward inside a light cone, bright at the apex
 *   003 SHARED   three linked orbits
 *   004 RUNNING  a calm sphere, slowly turning
 *
 * Usage
 *   const field = RelativisticField.create(canvas, { theme: 'auto' });
 *   field.start();                         // animate (respects reduced motion)
 *   field.still('granted', 4.0);           // draw one frame and stop
 *   field.destroy();
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var FORMATIONS = [
    { id: 'unbound', number: '001', label: 'UNBOUND' },
    { id: 'granted', number: '002', label: 'GRANTED' },
    { id: 'shared', number: '003', label: 'SHARED' },
    { id: 'running', number: '004', label: 'RUNNING' }
  ];

  var FORMATION_SECONDS = 9;   // brief: each formation lasts 8 to 10 seconds
  var BLEND_START = 0.62;      // the last 38% of each period (about 3.4 s) is the blend
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 2.39996...: even spread, no clumps
  var SIGNAL_SHARE = 0.01;     // brief: about 1% of particles are signal-coloured

  // The light cone (GRANTED). Height in model units; c = 1, so radius = height.
  var CONE_APEX_Y = -0.82;
  var CONE_HEIGHT = 1.5;

  // Pointer: particles within POINTER_RADIUS px are pushed up to POINTER_PUSH px.
  var POINTER_RADIUS = 120;
  var POINTER_PUSH = 28;

  // Theme palettes (hex equivalents of the oklch tokens in brand/tokens.css).
  // Used for stills, and as the fallback when CSS custom properties are absent.
  var PALETTES = {
    ink: { bg: '#0b0f14', particle: '#f2f0ec', accent: '#59d4cd', signal: '#f28c5c', glow: true },
    paper: { bg: '#ffffff', particle: '#151a21', accent: '#0c6c68', signal: '#bb4717', glow: false }
  };

  // ---------------------------------------------------------------------------
  // Small maths helpers
  // ---------------------------------------------------------------------------

  // mulberry32: a tiny seeded PRNG, so stills are identical on every render.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fract(x) { return x - Math.floor(x); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  // smootherstep: zero first and second derivatives at both ends, for slow, calm blends.
  function smootherstep(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }

  // Rotate a point about the x axis, then the y axis (used to tilt rings and the sphere).
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }

  // ---------------------------------------------------------------------------
  // Particles: fixed attributes, created once
  // ---------------------------------------------------------------------------

  function createParticles(count, seed) {
    var rand = prng(seed);
    var list = new Array(count);
    for (var i = 0; i < count; i++) {
      list[i] = {
        u: (i + 0.5) / count,          // even fraction: sphere latitude, cone phase
        angle: i * GOLDEN_ANGLE,       // even angular spread
        seed: rand(),                  // per-particle variation, 0..1
        seed2: rand(),
        seed3: rand(),
        size: 0.45 + rand() * 1.1,     // radius in CSS px before perspective
        signal: false,
        ring: i % 3                    // which orbit it belongs to in SHARED
      };
    }
    // Signal particles: an evenly spaced 1%, so they never cluster by accident.
    var step = Math.round(1 / SIGNAL_SHARE);
    for (var j = Math.floor(step / 2); j < count; j += step) list[j].signal = true;
    return list;
  }

  // ---------------------------------------------------------------------------
  // Formations: position(particle, time) -> [x, y, z] in model space
  // ---------------------------------------------------------------------------

  // 001 UNBOUND: scattered and drifting. Each particle wanders on two slow
  // incommensurate sine waves around a random home in a wide box. Nothing
  // holds it; that is the point.
  function unbound(p, t) {
    var hx = (p.seed * 2 - 1) * 1.7;
    var hy = (p.seed2 * 2 - 1) * 1.25;
    var hz = (p.seed3 * 2 - 1);
    var w1 = 0.11 + p.seed3 * 0.12, w2 = 0.09 + p.seed * 0.13;
    return [
      hx + 0.16 * Math.sin(t * w1 + p.angle),
      hy + 0.14 * Math.cos(t * w2 + p.angle * 0.7),
      hz + 0.10 * Math.sin(t * 0.07 + p.seed2 * 6.283)
    ];
  }

  // 002 GRANTED: a future light cone with its apex at the bottom. Particles
  // are emitted at the apex and stream upward. At height s above the apex the
  // cone's radius is s (45 degrees), so a particle at radial fraction rho sits
  // at radius rho * s and can never be outside it.
  //   h    : 0..1 progress up the cone, looping. Raised to a power so particles
  //          linger near the apex, which makes the apex the brightest, densest part.
  //   rho  : most particles sit near the surface so the 45-degree edges read
  //          clearly; the rest fill the interior.
  //   Signal particles sit on the surface (rho = 1) at the left and right edges
  //   of the silhouette: they are the ones that tried to leave and stopped.
  function granted(p, t) {
    var speed = 0.055 + p.seed * 0.03;
    var hLinear = fract(p.u * 7.0 + p.seed2 + t * speed);
    var h = Math.pow(hLinear, 1.35);
    var s = h * CONE_HEIGHT;
    var rho, theta;
    if (p.signal) {
      rho = 1;
      theta = (p.seed < 0.5 ? 0 : Math.PI) + (p.seed2 - 0.5) * 0.12;
    } else {
      rho = p.seed3 < 0.62 ? 0.9 + 0.1 * p.seed2 : Math.sqrt(p.seed2) * 0.9;
      theta = p.angle + t * 0.12;
    }
    return [rho * s * Math.cos(theta), CONE_APEX_Y + s, rho * s * Math.sin(theta)];
  }
  // Fade particles in at the apex and out near the top, so the stream has no hard lid.
  function grantedAlpha(p, t) {
    var speed = 0.055 + p.seed * 0.03;
    var hLinear = fract(p.u * 7.0 + p.seed2 + t * speed);
    return smoothstep(0.0, 0.03, hLinear) * (1 - smoothstep(0.72, 1.0, hLinear));
  }

  // 003 SHARED: three linked orbits, like links in a chain. Each ring passes
  // through its neighbour's centre, so the rings interlock rather than touch.
  var RING_R = 0.62;
  var RINGS = [
    { cx: -RING_R, tiltX: 0.0, tiltY: 0.0, dir: 1 },        // in the view plane
    { cx: 0.0, tiltX: Math.PI / 2, tiltY: 0.0, dir: -1 },   // perpendicular, links both others
    { cx: RING_R, tiltX: 0.0, tiltY: 0.0, dir: 1 }
  ];
  function shared(p, t) {
    var ring = RINGS[p.ring];
    var r = RING_R + (p.seed - 0.5) * 0.07;
    var a = p.angle + ring.dir * t * (0.16 + p.seed2 * 0.03);
    var q = [r * Math.cos(a), r * Math.sin(a), (p.seed3 - 0.5) * 0.05];
    q = rotX(q, ring.tiltX);
    q = rotY(q, ring.tiltY);
    q[0] += ring.cx;
    // Tilt the whole chain so the middle ring reads as an ellipse, not a line.
    q = rotX(q, -0.72);
    q = rotY(q, 0.42);
    return q;
  }

  // 004 RUNNING: a calm sphere, slowly turning. Points on a Fibonacci sphere
  // (even coverage), spun about a slightly tilted vertical axis.
  function running(p, t) {
    var y = clamp(1 - 2 * p.u + (p.seed - 0.5) * 0.012, -1, 1);   // tiny jitter breaks the spiral moire
    var r = Math.sqrt(1 - y * y);
    var a = p.angle + (p.seed2 - 0.5) * 0.05 + t * 0.1;
    var k = 0.98 + (p.seed3 - 0.5) * 0.02;
    var q = [r * Math.cos(a) * k, y * k, r * Math.sin(a) * k];
    return rotX(q, 0.32);
  }

  var POSITION = [unbound, granted, shared, running];

  // Formation weight helpers: which two formations are on screen, and how far blended.
  function timeline(t) {
    var phase = t / FORMATION_SECONDS;
    var index = Math.floor(phase) % FORMATIONS.length;
    var local = phase - Math.floor(phase);
    var blend = smootherstep((local - BLEND_START) / (1 - BLEND_START));
    return { from: index, to: (index + 1) % FORMATIONS.length, blend: blend };
  }

  // ---------------------------------------------------------------------------
  // The field
  // ---------------------------------------------------------------------------

  function create(canvas, options) {
    options = options || {};
    var ctx = canvas.getContext('2d');
    var count = options.count || 2200;
    var particles = createParticles(count, options.seed || 20261028);
    var themeOption = options.theme || 'auto';      // 'auto' | 'ink' | 'paper'
    var interactive = options.interactive !== false;
    var sizeScale = options.sizeScale || 1;          // shrink particles for small renders
    var onFormation = options.onFormation || null;
    var reduced = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var width = 0, height = 0, dpr = 1;
    var time = options.time || 0;
    var last = 0, raf = 0, running = false;
    var pointer = { x: -1e4, y: -1e4 };
    var colours = PALETTES.ink;
    var currentFormation = -1;
    var pinned = null;   // { index, t } while showing a still, so redraws keep it

    // Colours come from the page's CSS custom properties when present, so the
    // field follows the theme. A probe element resolves light-dark() for us.
    function readColours() {
      if (themeOption === 'ink' || themeOption === 'paper') { colours = PALETTES[themeOption]; return; }
      var dark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
      var base = dark ? PALETTES.ink : PALETTES.paper;
      var probe = document.createElement('span');
      probe.style.display = 'none';
      canvas.parentNode.appendChild(probe);
      function read(name, fallback) {
        probe.style.color = 'var(' + name + ', ' + fallback + ')';
        return getComputedStyle(probe).color || fallback;
      }
      colours = {
        bg: read('--color-bg', base.bg),
        particle: read('--color-text', base.particle),
        accent: read('--color-accent', base.accent),
        signal: read('--color-signal', base.signal),
        glow: dark
      };
      probe.remove();
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Draw one frame at time t. `fixed` pins a formation (used for stills).
    function draw(t, fixed) {
      var tl = fixed == null ? timeline(t) : { from: fixed, to: fixed, blend: 0 };
      var scale = Math.min(width, height) * (options.scale || 0.3);
      var cx = width * (options.originX || 0.5);
      var cy = height * (options.originY || 0.5);
      // How "GRANTED" this frame is: drives the glow and the cone clamp.
      var wGranted = (tl.from === 1 ? 1 - tl.blend : 0) + (tl.to === 1 && tl.from !== 1 ? tl.blend : 0);

      ctx.clearRect(0, 0, width, height);

      // The field's own glow: the only gradient in the system. Ink theme only,
      // at the cone's apex. On paper, density at the apex does the same job.
      if (colours.glow && wGranted > 0.001) {
        var ax = cx, ay = cy - CONE_APEX_Y * scale;
        var g = ctx.createRadialGradient(ax, ay, 0, ax, ay, scale * 1.1);
        g.addColorStop(0, withAlpha(colours.accent, 0.30 * wGranted));
        g.addColorStop(0.35, withAlpha(colours.accent, 0.08 * wGranted));
        g.addColorStop(1, withAlpha(colours.accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      var usePointer = interactive && running && !reduced.matches;

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var a = POSITION[tl.from](p, t), b = POSITION[tl.to](p, t);
        var x = mix(a[0], b[0], tl.blend), y = mix(a[1], b[1], tl.blend), z = mix(a[2], b[2], tl.blend);

        // Fade at the cone's lid only while GRANTED is on screen.
        var alphaGranted = grantedAlpha(p, t);
        var fade = mix(1, alphaGranted, wGranted);

        // Perspective: 1 at z = 0, smaller further away.
        var persp = 3 / (3 - z * 0.6);
        var sx = cx + x * scale * persp;
        var sy = cy - y * scale * persp;

        // Pointer: push particles away from the cursor in screen space...
        if (usePointer) {
          var dx = sx - pointer.x, dy = sy - pointer.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0 && d < POINTER_RADIUS) {
            var f = (1 - d / POINTER_RADIUS) * POINTER_PUSH;
            sx += dx / d * f; sy += dy / d * f;
            // ...but in GRANTED nothing leaves the cone. Map back to model
            // space, clamp the radius to the height above the apex, reproject.
            if (wGranted > 0.5) {
              var mx = (sx - cx) / (scale * persp), my = (cy - sy) / (scale * persp);
              var s = clamp(my - CONE_APEX_Y, 0, CONE_HEIGHT);
              var rr = Math.sqrt(mx * mx + z * z);
              if (rr > s) { var k = s / rr; mx *= k; }
              sx = cx + mx * scale * persp;
              sy = cy - (CONE_APEX_Y + s) * scale * persp;
            }
          }
        }

        // Depth shading: nearer particles are more opaque.
        var depth = clamp((z + 1.2) / 2.4, 0, 1);
        var alpha = (0.28 + depth * 0.62) * fade;
        if (alpha < 0.01) continue;

        var colour = colours.particle;
        var radius = p.size * persp * sizeScale;
        if (p.signal) {
          colour = colours.signal;
          radius *= 1.35;
          alpha = Math.min(1, alpha * 1.25 + 0.15);
        } else if (colours.glow && wGranted > 0) {
          // Near the apex on ink, some particles pick up the accent: Cherenkov blue.
          // The share falls from about 70% at the apex to none a fifth of the way up,
          // which keeps accent well under the brief's 5% of the view.
          var nearApex = 1 - smoothstep(0.0, 0.2, (y - CONE_APEX_Y) / CONE_HEIGHT);
          if (p.seed2 < nearApex * 0.7 * wGranted) colour = colours.accent;
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, 6.283185307);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      var shown = tl.blend < 0.5 ? tl.from : tl.to;
      if (shown !== currentFormation) {
        currentFormation = shown;
        if (onFormation) onFormation(FORMATIONS[shown]);
      }
    }

    function frame(stamp) {
      var dt = last ? Math.min((stamp - last) / 1000, 0.05) : 0;
      last = stamp;
      time += dt;
      draw(time);
      if (running) raf = global.requestAnimationFrame(frame);
    }

    function start() {
      resize(); readColours();
      if (reduced.matches) { still('granted', 5); return; }  // brief: reduced motion shows GRANTED
      if (running) return;
      running = true; last = 0; pinned = null;
      raf = global.requestAnimationFrame(frame);
    }
    function stop() { running = false; global.cancelAnimationFrame(raf); }

    // One still frame of a formation at time t (seconds into that formation's motion).
    function still(id, t) {
      stop(); resize(); readColours();
      var index = typeof id === 'number' ? id : FORMATIONS.findIndex(function (f) { return f.id === id; });
      pinned = { index: index < 0 ? 1 : index, t: t == null ? 5 : t };
      draw(pinned.t, pinned.index);
    }
    // Redraw whatever is showing when not animating (after a resize or a theme change).
    function redraw() { if (pinned) draw(pinned.t, pinned.index); else draw(time); }

    function onPointerMove(e) { var r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }
    function onPointerLeave() { pointer.x = pointer.y = -1e4; }
    function onResize() { resize(); if (!running) redraw(); }
    function onScheme() { readColours(); if (!running) redraw(); }
    function onReduced() { if (reduced.matches) { still('granted', 5); } else { start(); } }
    function onVisibility() { if (document.hidden) stop(); else if (!reduced.matches && options.autoResume !== false) start(); }

    var schemeQuery = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
    if (interactive) {
      global.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerleave', onPointerLeave);
    }
    global.addEventListener('resize', onResize);
    if (schemeQuery && schemeQuery.addEventListener) schemeQuery.addEventListener('change', onScheme);
    if (reduced.addEventListener) reduced.addEventListener('change', onReduced);
    document.addEventListener('visibilitychange', onVisibility);

    function destroy() {
      stop();
      global.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      global.removeEventListener('resize', onResize);
      if (schemeQuery && schemeQuery.removeEventListener) schemeQuery.removeEventListener('change', onScheme);
      if (reduced.removeEventListener) reduced.removeEventListener('change', onReduced);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    resize(); readColours();
    return {
      start: start, stop: stop, still: still, destroy: destroy,
      isRunning: function () { return running; },
      setTheme: function (theme) { themeOption = theme; readColours(); if (!running) redraw(); }
    };
  }

  // Canvas colour strings with an alpha, for the glow gradient.
  function withAlpha(colour, alpha) {
    if (colour.charAt(0) === '#' && colour.length === 7) {
      var a = Math.round(clamp(alpha, 0, 1) * 255).toString(16);
      return colour + (a.length === 1 ? '0' + a : a);
    }
    var m = colour.match(/^rgba?\(([^)]+)\)/);
    if (m) { var parts = m[1].split(/[ ,/]+/).slice(0, 3); return 'rgba(' + parts.join(',') + ',' + alpha + ')'; }
    var o = colour.match(/^oklch\(([^)/]+)/);
    if (o) return 'oklch(' + o[1].trim() + ' / ' + alpha + ')';
    return colour;
  }

  global.RelativisticField = {
    create: create,
    FORMATIONS: FORMATIONS,
    FORMATION_SECONDS: FORMATION_SECONDS,
    PALETTES: PALETTES,
    // Exposed for tests and for porting to the shader.
    _position: { unbound: unbound, granted: granted, shared: shared, running: running, timeline: timeline }
  };
})(typeof window !== 'undefined' ? window : this);
