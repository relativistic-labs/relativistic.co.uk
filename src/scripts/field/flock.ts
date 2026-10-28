/**
 * The murmuration, simulated in 3D (round 3 brief, "The field: a murmuration").
 *
 * Each bird steers by its seven nearest neighbours, whatever their distance (topological, after
 * Ballerini et al. 2008; seven after Young et al. 2013): separation, alignment and cohesion. It
 * returns towards a cruise speed, turns by banking (the sideways pull it acts on lags behind the
 * pull it wants, so it sweeps rather than snaps), keeps roughly level and is drawn back towards the
 * roost at the centre of the view, after Hemelrijk and Hildenbrandt's StarDisplay.
 *
 * Neighbours come from a uniform grid of hashed cells, rebuilt each frame; each bird refreshes its
 * list every third frame, staggered. All state is preallocated: nothing is allocated per frame. The
 * renderer uploads S, eight floats a bird, as it is.
 *
 * Now and then a weak pull eases each bird towards a point on a shape (shapes.ts), holds loosely and
 * lets go. Rarely a predator crosses: birds near it panic and flee, and the panic passes from
 * neighbour to neighbour as an escape wave (Hemelrijk et al. 2015), drawn darker, as banking birds
 * show more wing.
 */
import { SHAPES } from './shapes';

export const K = 7; // neighbours each bird tracks
export const KNOT = 6; // particles in the predator
export const PITCH = 0.8; // the camera looks up at the flock, radians
export const DISTANCE = 70; // camera to roost, world units

// World units are about one bird spacing. Rates are per second.
const V0 = 4.6; // cruise speed
const RS = 1.6; // separation radius
const WS = 10; // separation
const WA = 8; // alignment
const WC = 0.8; // cohesion
const WR = 7; // roost
const WV = 1.4; // level flight: vertical speed damping
const WN = 0.3; // wander
const TAU = 0.2; // banking lag
const AMAX = 9; // most sideways pull a bank can give
const KS = 1.1; // return to cruise speed
const ROOSTX = 0.45; // the roost, an ellipsoid, as a share of the flock's half-length
const ROOSTY = 0.25;
const ROOSTZ = 0.55;
const VIEW = 1.45; // half the view's height, as a share of the flock's half-length
const H = 1.4; // grid cell
const HB = 4096; // grid buckets
const REACH = 5; // the predator: how near it alarms a bird, how hard birds part around it, how hard they flee
const PART = 12;
const FLEE = 2.5;
const KP = 3; // pattern: pull towards the point, and towards its velocity
const CP = 1.6;
const SWAY = 1.2; // how far each point circles, and how fast
const WAVE = 1.6;
const IN = 3.6; // pattern: ease in, hold, ease out
const HOLD = 3.2;
const OUT = 2.8;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFlock(max: number, demo: boolean) {
  const S = new Float32Array((max + KNOT) * 8); // x y z shade | vx vy vz kind
  const B = new Float32Array(max * 3); // the sideways pull a bank gives
  const NB = new Int32Array(max * K);
  const NC = new Uint8Array(max);
  const ND = new Float32Array(K);
  const LAST = new Int32Array(K);
  const T = new Float32Array(max * 3); // pattern targets, camera space
  const PULL = new Float32Array(max);
  const PH = new Float32Array(max);
  const PANIC = new Float32Array(max);
  const ALARM = new Float32Array(max); // when an alarmed bird panics
  const CALM = new Float32Array(max); // until when a bird that panicked won't again
  const CELL = new Int32Array(max);
  const ORDER = new Int32Array(max);
  const START = new Int32Array(HB + 1);
  const FILL = new Int32Array(HB);
  const IB = new Int32Array(max);
  const IT = new Int32Array(max);
  const KX = new Float32Array(max * 2);
  const TT = new Float32Array(max * 3);
  const rand = prng(20261028);
  const cos = Math.cos(PITCH);
  const sin = Math.sin(PITCH);
  const hash = (x: number, y: number, z: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (HB - 1);

  const f = {
    S,
    n: max,
    t: 0,
    /** Half the view's height and width in world units at the roost, set by aspect(). */
    halfH: 1,
    halfW: 1,
    /** Birds plus, while it flies, the predator. */
    drawn: max,
    step,
    aspect,
    reset,
    show,
    /** Halve the birds, when frames are slow. */
    shed() {
      f.n = Math.max(200, f.n >> 1);
      all = true;
    },
  };
  const size = 1.45 * Math.cbrt(max); // the flock's half-length
  let RX = 1;
  let RY = 1;
  let RZ = 1;
  let frame = 0;
  let all = true; // refresh every neighbour list on the next step
  let pw = 0; // pattern weight
  let pStart = -1;
  let shape = 0;
  let spin = 0;
  let nextPattern = 0;
  let pred = false;
  let predAt = 0;
  let bend = 0;
  let nextPred = 0;
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let ux = 0;
  let uy = 0;
  let uz = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;

  function aspect(a: number) {
    f.halfH = (size * VIEW) / Math.max(1, a) ** 0.35; // a wide band frames the flock a little closer
    f.halfW = f.halfH * a;
    RX = Math.max(size * ROOSTX, f.halfW - size * 0.85);
    RY = size * ROOSTY;
    RZ = size * ROOSTZ;
  }

  /** The flock as it starts: a loose, flattened cloud wheeling one way, which folds within seconds. */
  function reset() {
    const n = f.n;
    for (let i = 0; i < n; i++) {
      let x, y, z;
      do (x = rand() * 2 - 1), (y = rand() * 2 - 1), (z = rand() * 2 - 1);
      while (x * x + y * y + z * z > 1);
      const o = i * 8;
      const a = 2.4 + x * 1.1 + z * 0.6;
      S[o] = x * size;
      S[o + 1] = y * size * 0.3;
      S[o + 2] = z * size * 0.6;
      S[o + 4] = Math.cos(a) * V0;
      S[o + 5] = y * 0.4;
      S[o + 6] = Math.sin(a) * V0;
      PULL[i] = 0.35 + rand() * 0.65;
      PH[i] = rand() * 6.283;
      PANIC[i] = CALM[i] = 0;
      ALARM[i] = Infinity;
      B[i * 3] = B[i * 3 + 1] = B[i * 3 + 2] = 0;
    }
    f.t = frame = pw = 0;
    pStart = -1;
    pred = false;
    all = true;
    nextPattern = nextPred = Infinity; // no shape and no predator until the flock is shown
  }

  /** The flock is on screen: centre it in the view, and schedule the first shape and predator. */
  function show() {
    let x = 0;
    let z = 0;
    for (let i = 0; i < f.n; i++) (x += S[i * 8]!), (z += S[i * 8 + 2]!);
    for (let i = 0; i < f.n; i++) (S[i * 8]! -= x / f.n), (S[i * 8 + 2]! -= z / f.n);
    nextPattern = f.t + (demo ? 2 : 12 + rand() * 6);
    nextPred = f.t + (demo ? 13 : 40 + rand() * 20);
  }

  /** Camera space from world space, as the vertex shader does it. */
  const camY = (y: number, z: number) => y * cos - z * sin;
  const camZ = (y: number, z: number) => y * sin + z * cos;

  function startPattern() {
    const n = f.n;
    const s = SHAPES[shape++ % SHAPES.length]!;
    s.fill(rand, T, n);
    spin = s.spin;
    // Fit the shape to the view, then give each bird the target in the same place in a rough grid
    // order (by x in columns, then by y), so the flock flows into the shape without crossing over.
    const k = Math.min(f.halfH * 1.45, (f.halfW * 1.7) / s.w);
    for (let i = 0; i < n * 3; i++) T[i]! *= k;
    const col = Math.ceil(Math.sqrt(n));
    const order = (idx: Int32Array, x: (i: number) => number, y: (i: number) => number) => {
      for (let i = 0; i < n; i++) (idx[i] = i), (KX[i * 2] = x(i)), (KX[i * 2 + 1] = y(i));
      idx.subarray(0, n).sort((a, b) => KX[a * 2]! - KX[b * 2]!);
      for (let c = 0; c < n; c += col) idx.subarray(c, Math.min(n, c + col)).sort((a, b) => KX[a * 2 + 1]! - KX[b * 2 + 1]!);
    };
    const persp = (i: number) => DISTANCE / (DISTANCE - camZ(S[i * 8 + 1]!, S[i * 8 + 2]!));
    order(IT, (i) => T[i * 3]!, (i) => T[i * 3 + 1]!);
    order(IB, (i) => S[i * 8]! * persp(i), (i) => camY(S[i * 8 + 1]!, S[i * 8 + 2]!) * persp(i));
    TT.set(T);
    for (let k = 0; k < n; k++) {
      const b = IB[k]! * 3;
      const t = IT[k]! * 3;
      T[b] = TT[t]!;
      T[b + 1] = TT[t + 1]!;
      T[b + 2] = TT[t + 2]!;
    }
    pStart = f.t;
  }

  function startPredator() {
    // From the side of the view the flock is nearest, at its height, aimed at its middle, so the
    // flock flees towards the middle of the view rather than out of it.
    const side = mx < 0 ? -1 : 1;
    qx = side * (f.halfW + 8);
    qy = my + (rand() - 0.5) * 4;
    qz = mz + (rand() - 0.5) * 6;
    const dx = mx - qx;
    const dy = my - qy;
    const dz = mz - qz;
    const d = Math.hypot(dx, dy, dz) || 1;
    ux = (dx / d) * V0 * 2.6;
    uy = (dy / d) * V0 * 2.6;
    uz = (dz / d) * V0 * 2.6;
    bend = (rand() - 0.5) * 0.4;
    pred = true;
    predAt = f.t;
  }

  function direct(dt: number) {
    const t = f.t;
    if (pStart < 0 && t >= nextPattern && !pred) startPattern();
    if (pStart >= 0) {
      const u = t - pStart;
      pw = u < IN ? ease(u / IN) : u < IN + HOLD ? 1 : 1 - ease((u - IN - HOLD) / OUT);
      if (u > IN + HOLD + OUT) {
        pStart = -1;
        pw = 0;
        nextPattern = t + (demo ? 11 : 15 + rand() * 10);
      }
    }
    if (!pred && t >= nextPred) {
      if (pStart >= 0 || nextPattern - t < 7) nextPred = t + 9;
      else startPredator();
    }
    if (pred) {
      // It cuts straight through on a gentle curve, aimed once, and never lingers.
      const c = Math.cos(bend * dt);
      const s = Math.sin(bend * dt);
      const x = ux;
      ux = x * c - uz * s;
      uz = x * s + uz * c;
      qx += ux * dt;
      qy += uy * dt;
      qz += uz * dt;
      const age = t - predAt;
      if (age > 12 || (age > 3 && (Math.abs(qx) > f.halfW + 10 || Math.abs(qz) > size * 3))) {
        pred = false;
        nextPred = t + (demo ? 40 : 50 + rand() * 20);
      }
      // The knot: a few particles jostling around the predator's line.
      for (let m = 0; m < KNOT; m++) {
        const o = (f.n + m) * 8;
        const a = m * 1.7 + t * (2 + m * 0.3);
        S[o] = qx + Math.cos(a) * 0.5 - ux * m * 0.05;
        S[o + 1] = qy + Math.sin(a * 1.3) * 0.35 - uy * m * 0.05;
        S[o + 2] = qz + Math.sin(a) * 0.5 - uz * m * 0.05;
        S[o + 3] = 1;
        S[o + 4] = ux;
        S[o + 5] = uy;
        S[o + 6] = uz;
        S[o + 7] = 1;
      }
    }
    f.drawn = f.n + (pred ? KNOT : 0);
  }

  // The neighbour search's state, kept out here so the search allocates nothing.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let nBase = 0;
  let found = 0;
  let worst = 0;

  /** Offer bird j as one of the current bird's seven nearest. */
  function offer(j: number) {
    const q = j * 8;
    const ex = S[q]! - nx;
    const ey = S[q + 1]! - ny;
    const ez = S[q + 2]! - nz;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 >= worst) return;
    let m = 0;
    while (m < found && NB[nBase + m] !== j) m++;
    if (m < found) return; // already listed (two cells can share a bucket)
    m = found < K ? found++ : K - 1;
    while (m > 0 && ND[m - 1]! > d2) {
      ND[m] = ND[m - 1]!;
      NB[nBase + m] = NB[nBase + m - 1]!;
      m--;
    }
    ND[m] = d2;
    NB[nBase + m] = j;
    if (found === K) worst = ND[K - 1]!;
  }

  /** How far, squared, a point at l within its cell is from the cell d steps along. */
  const gap = (d: number, l: number) => {
    const g = d < 0 ? l - (d + 1) * H : d > 0 ? d * H - l : 0;
    return g * g;
  };

  /**
   * Bird i's seven nearest, from the cells around it. Its last seven, at their distances now, set
   * the bar first, so most cells can be skipped as too far to hold anyone nearer.
   */
  function neighbours(i: number, n: number) {
    const o = i * 8;
    nx = S[o]!;
    ny = S[o + 1]!;
    nz = S[o + 2]!;
    nBase = i * K;
    for (let k = 0, c = NC[i]!; k < c; k++) LAST[k] = NB[nBase + k]!;
    const c = NC[i]!;
    found = 0;
    worst = Infinity;
    for (let k = 0; k < c; k++) if (LAST[k]! < n) offer(LAST[k]!);
    const cx = Math.floor(nx / H);
    const cy = Math.floor(ny / H);
    const cz = Math.floor(nz / H);
    const lx = nx - cx * H;
    const ly = ny - cy * H;
    const lz = nz - cz * H;
    for (let r = 1; r === 1 || (r === 2 && found < K); r++)
      for (let dz = -r; dz <= r; dz++) {
        const gz = gap(dz, lz);
        if (gz >= worst) continue;
        for (let dy = -r; dy <= r; dy++) {
          const gy = gz + gap(dy, ly);
          if (gy >= worst) continue;
          for (let dx = -r; dx <= r; dx++) {
            if (r > 1 && dx * dx < 4 && dy * dy < 4 && dz * dz < 4) continue; // the inner block is done
            if (gy + gap(dx, lx) >= worst) continue;
            const b = hash(cx + dx, cy + dy, cz + dz);
            for (let k = START[b]!, e = START[b + 1]!; k < e; k++) if (ORDER[k] !== i) offer(ORDER[k]!);
          }
        }
      }
    NC[i] = found;
  }

  function step(dt: number) {
    const n = f.n;
    const t = (f.t += dt);
    direct(dt);

    // The grid: bucket every bird by its cell (a counting sort).
    START.fill(0);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      const b = hash(Math.floor(S[o]! / H), Math.floor(S[o + 1]! / H), Math.floor(S[o + 2]! / H));
      CELL[i] = b;
      START[b + 1]!++;
    }
    for (let b = 0; b < HB; b++) {
      START[b + 1]! += START[b]!;
      FILL[b] = START[b]!;
    }
    for (let i = 0; i < n; i++) ORDER[FILL[CELL[i]!]!++] = i;
    for (let i = all ? 0 : frame % 3; i < n; i += all ? 1 : 3) neighbours(i, n);
    all = false;
    frame++;

    const decay = Math.exp(-dt / 0.45);
    const bank = Math.min(1, dt / TAU);
    const tc = Math.cos(spin * (t - pStart));
    const ts = Math.sin(spin * (t - pStart));
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      let px = S[o]!;
      let py = S[o + 1]!;
      let pz = S[o + 2]!;
      let vx = S[o + 4]!;
      let vy = S[o + 5]!;
      let vz = S[o + 6]!;
      sx += px;
      sy += py;
      sz += pz;

      // The seven neighbours.
      let ex = 0, ey = 0, ez = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, alarm = 0, m = 0;
      for (let k = 0, base = i * K, c = NC[i]!; k < c; k++) {
        const j = NB[base + k]!;
        if (j >= n) continue;
        const q = j * 8;
        const dx = S[q]! - px;
        const dy = S[q + 1]! - py;
        const dz = S[q + 2]! - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < RS * RS) {
          const d = Math.sqrt(d2) + 1e-3;
          const w = (RS - d) / (RS * d);
          ex -= dx * w;
          ey -= dy * w;
          ez -= dz * w;
        }
        ax += S[q + 4]!;
        ay += S[q + 5]!;
        az += S[q + 6]!;
        cx += dx;
        cy += dy;
        cz += dz;
        if (PANIC[j]! > alarm) alarm = PANIC[j]!;
        m++;
      }
      let fx = 0, fy = 0, fz = 0;
      if (m) {
        fx = WS * ex + WA * (ax / m - vx) + (WC * cx) / m;
        fy = WS * ey + WA * (ay / m - vy) + (WC * cy) / m;
        fz = WS * ez + WA * (az / m - vz) + (WC * cz) / m;
      }
      // A little wander of its own, the roost, and level flight.
      const ph = PH[i]! + t * 0.37;
      fx += WN * Math.sin(ph);
      fy += WN * 0.3 * Math.sin(ph * 1.7);
      fz += WN * Math.cos(ph * 1.3);
      const rx = px / RX;
      const ry = py / RY;
      const rz = pz / RZ;
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (r > 1) {
        const g = (WR * (r - 1)) / r;
        fx -= g * rx;
        fy -= g * ry;
        fz -= g * rz;
      }
      fy -= WV * vy;

      // The escape wave: a bird panics when the predator is close, or a beat after a neighbour did;
      // then it can't be alarmed again for a while, so the wave travels on rather than echoing.
      let p = PANIC[i]! * decay;
      if (t >= ALARM[i]!) {
        p = 1;
        ALARM[i] = Infinity;
        CALM[i] = t + 3;
      } else if (alarm > 0.5 && t > CALM[i]! && ALARM[i] === Infinity) ALARM[i] = t + 0.05 + rand() * 0.07;
      const dx = px - qx;
      const dy = py - qy;
      const dz = pz - qz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-3;
      if (pred && d < REACH) {
        if (t > CALM[i]!) (p = 1), (CALM[i] = t + 3);
        const g = (PART * (REACH - d)) / (REACH * d); // the flock parts around it
        fx += dx * g;
        fy += dy * g * 0.5;
        fz += dz * g;
      }
      if (p > 0.02) {
        const g = (FLEE * p) / d;
        fx += dx * g;
        fz += dz * g;
      }
      PANIC[i] = p;

      // A weak pull towards this bird's point on the shape, while its flock forces fade.
      const w = pw * PULL[i]!;
      if (w > 0) {
        const s = 1 - 0.7 * w;
        fx *= s;
        fy *= s;
        fz *= s;
        // Each point circles slowly, in step with its neighbours on the shape: a ripple runs
        // across it, so the birds holding it keep flying together rather than milling.
        const j = i * 3;
        const gx = T[j]!;
        const wave = WAVE * t - 0.35 * gx;
        const ox = Math.cos(wave) * SWAY;
        const oy = Math.sin(wave) * SWAY * 0.3; // mostly sideways, so level lines stay level
        const lz = gx * ts + T[j + 2]! * tc;
        const ly = T[j + 1]! + oy;
        const tx = gx * tc - T[j + 2]! * ts + ox;
        const ty = ly * cos + lz * sin;
        const tz = -ly * sin + lz * cos;
        const wx = -Math.sin(wave) * SWAY * WAVE; // the point's own velocity
        const wy = ox * 0.3 * WAVE;
        // The pull never exceeds what seven units away would give, so a far bird flies, not darts.
        const kx = tx - px;
        const ky = ty - py;
        const kz = tz - pz;
        const reach = Math.min(1, 7 / (Math.sqrt(kx * kx + ky * ky + kz * kz) + 1e-3)) * KP;
        fx += w * (reach * kx + CP * (wx - vx));
        fy += w * (reach * ky + CP * (wy * cos - vy));
        fz += w * (reach * kz + CP * (-wy * sin - vz));
      }

      // Bank into the sideways part of the pull, slowly; speed comes back to cruise.
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
      const hx = vx / sp;
      const hy = vy / sp;
      const hz = vz / sp;
      const ff = fx * hx + fy * hy + fz * hz;
      const b = i * 3;
      let bx = B[b]! + (fx - ff * hx - B[b]!) * bank;
      let by = B[b + 1]! + (fy - ff * hy - B[b + 1]!) * bank;
      let bz = B[b + 2]! + (fz - ff * hz - B[b + 2]!) * bank;
      const bh = bx * hx + by * hy + bz * hz;
      bx -= bh * hx;
      by -= bh * hy;
      bz -= bh * hz;
      let bm = Math.sqrt(bx * bx + by * by + bz * bz);
      if (bm > AMAX) {
        const k = AMAX / bm;
        bx *= k;
        by *= k;
        bz *= k;
        bm = AMAX;
      }
      B[b] = bx;
      B[b + 1] = by;
      B[b + 2] = bz;
      const acc = (V0 * (1 - 0.55 * w) * (1 + 0.5 * p) - sp) * KS + ff * (0.25 + 0.75 * w);
      vx += (bx + hx * acc) * dt;
      vy += (by + hy * acc) * dt;
      vz += (bz + hz * acc) * dt;
      S[o] = px + vx * dt;
      S[o + 1] = py + vy * dt;
      S[o + 2] = pz + vz * dt;
      // Shade: a banking or panicking bird shows more wing, so reads darker.
      S[o + 3] = Math.min(1, (bm / AMAX) * 0.7 + p);
      S[o + 4] = vx;
      S[o + 5] = vy;
      S[o + 6] = vz;
      S[o + 7] = 0;
    }
    mx = sx / n;
    my = sy / n;
    mz = sz / n;
  }

  return f;
}

export type Flock = ReturnType<typeof createFlock>;
