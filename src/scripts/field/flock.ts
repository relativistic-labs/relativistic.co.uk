/**
 * The murmuration, simulated in 3D, building pictures as it flies.
 *
 * Each bird steers by its seven nearest neighbours, whatever their distance (topological, after
 * Ballerini et al. 2008; seven after Young et al. 2013): separation, alignment and cohesion. It
 * returns towards a cruise speed, turns by banking (the sideways pull it acts on lags behind the
 * pull it wants, so it sweeps rather than snaps), keeps roughly level and is drawn back towards the
 * roost at the centre of the view, after Hemelrijk and Hildenbrandt's StarDisplay.
 *
 * Every few seconds the flock builds a picture (shapes.ts). Each bird is given a point on it and
 * flies there, curving in, then holds it loosely while a ripple runs across the picture; a few
 * birds stay in the flock for each picture. Every bird keeps its own time, so most fly together
 * while a few lead the way into the next picture and a few are still leaving the last: the flock
 * streams from one picture to the next, and round again.
 *
 * Neighbours come from a uniform grid of hashed cells, rebuilt each frame; each bird refreshes its
 * list every third frame, staggered. All state is preallocated: nothing is allocated per frame. The
 * renderer uploads S, eight floats a bird, as it is.
 */
import { SHAPES } from './shapes';

export const K = 7; // neighbours each bird tracks
export const PITCH = 0.8; // the camera looks up at the flock, radians
export const DISTANCE = 70; // camera to roost, world units

// World units are about one bird spacing. Rates are per second.
const V0 = 5; // cruise speed
const RS = 1.6; // separation radius
const WS = 10; // separation
const WA = 8; // alignment
const WC = 0.8; // cohesion
const WR = 7; // roost
const WV = 1.4; // level flight: vertical speed damping
const WN = 0.3; // wander
const WD = 0.25; // a shared, slowly turning heading
const TAU = 0.2; // banking lag
const AMAX = 9; // most sideways pull a bank can give
const KS = 1.1; // return to cruise speed
const ROOSTX = 0.45; // the roost, an ellipsoid, as a share of the flock's half-length
const ROOSTY = 0.25;
const ROOSTZ = 0.55;
const VIEW = 1.45; // half the view's height, as a share of the flock's half-length
const H = 1.4; // grid cell
const HB = 4096; // grid buckets
const SLOT = 4.4; // seconds a picture lasts, flight included
const FREE = 8; // per cent of birds that stay in the flock for each picture
const AHEAD = 0.09; // share of birds that lead, and the share that lag
const VMAX = 30; // flying between pictures
const ARRIVE = 7; // within this distance of its point a bird slows as it nears it
const KV = 12; // how quickly a bird takes the velocity it wants
const ACC = 140; // the most it accelerates towards its point
const SWIRL = 0.7; // how far birds curve on the way, turning with the flock
const TURN = 0.12; // how far round the flock wheels between pictures, as a share of a turn
const SWAY = 0.8; // the ripple across a picture: how far each point circles, and how fast
const WAVE = 1.6;
const DARK = 0.8; // birds on a picture are drawn darker

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
  const S = new Float32Array(max * 8); // x y z shade | vx vy vz (unused)
  const B = new Float32Array(max * 3); // the sideways pull a bank gives
  const NB = new Int32Array(max * K);
  const NC = new Uint8Array(max);
  const ND = new Float32Array(K);
  const LAST = new Int32Array(K);
  const T = new Float32Array(max * 9); // each bird's point on three pictures (last, this, next), camera space
  const TT = new Float32Array(max * 3);
  const O = new Float32Array(max); // how far ahead of the flock's time a bird keeps, seconds
  const W = new Float32Array(max); // how bound a bird is to its picture, 0 to 1
  const PH = new Float32Array(max);
  const VAR = new Float32Array(max);
  const CELL = new Int32Array(max);
  const ORDER = new Int32Array(max);
  const START = new Int32Array(HB + 1);
  const FILL = new Int32Array(HB);
  const IB = new Int32Array(max);
  const IT = new Int32Array(max);
  const KX = new Float32Array(max * 2);
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
    step,
    aspect,
    reset,
    show,
    /** Halve the birds, when frames are slow. */
    shed() {
      f.n = Math.max(300, f.n >> 1);
      all = true;
    },
  };
  const size = 1.45 * Math.cbrt(max); // the flock's half-length
  let RX = 1;
  let RY = 1;
  let RZ = 1;
  let frame = 0;
  let all = true; // refresh every neighbour list on the next step
  let t0 = Infinity; // when the first picture starts
  let assigned = -1; // the last picture whose points have been given out
  let wd = 0; // the shared heading's weight: none while warming up, so the still is a fold

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
      // Most birds keep the flock's time, within a quarter of a second; a few lead, a few lag.
      const r = rand();
      O[i] = r < AHEAD ? 0.6 + rand() * 0.8 : r < 2 * AHEAD ? -0.6 - rand() * 0.8 : (rand() - 0.5) * 0.5;
      W[i] = 0;
      PH[i] = rand() * 6.283;
      VAR[i] = 0.6 + rand() * 0.8;
      B[i * 3] = B[i * 3 + 1] = B[i * 3 + 2] = 0;
    }
    f.t = frame = 0;
    t0 = Infinity; // no pictures until the flock is shown
    assigned = -1;
    all = true;
    wd = 0;
  }

  /** The flock is on screen: centre it in the view, and start the pictures shortly. */
  function show() {
    let x = 0;
    let z = 0;
    for (let i = 0; i < f.n; i++) (x += S[i * 8]!), (z += S[i * 8 + 2]!);
    for (let i = 0; i < f.n; i++) (S[i * 8]! -= x / f.n), (S[i * 8 + 2]! -= z / f.n);
    wd = WD;
    t0 = f.t + (demo ? 0.8 : 2);
    give(0);
  }

  /** Camera space from world space, as the vertex shader does it. */
  const camY = (y: number, z: number) => y * cos - z * sin;
  const camZ = (y: number, z: number) => y * sin + z * cos;

  /**
   * Give every bird its point on picture k. The picture is fitted to the view, then birds and points
   * are put in the same order, by angle around the centre of the view in sectors, then by distance
   * from it, and each bird is given the point a little further round, one way or the other in turn.
   * So the whole flock wheels from one picture into the next, without crossing over.
   */
  function give(k: number) {
    assigned = k;
    const s = SHAPES[k % SHAPES.length]!;
    const n = f.n;
    s.fill(rand, TT, n);
    const scale = Math.min(f.halfH * 1.45, (f.halfW * 1.55) / s.w); // clear of the soft edges
    const col = Math.ceil(Math.sqrt(n));
    const order = (idx: Int32Array, x: (i: number) => number, y: (i: number) => number) => {
      for (let i = 0; i < n; i++) (idx[i] = i), (KX[i * 2] = Math.atan2(y(i), x(i))), (KX[i * 2 + 1] = Math.hypot(x(i), y(i)));
      idx.subarray(0, n).sort((a, b) => KX[a * 2]! - KX[b * 2]!);
      for (let c = 0; c < n; c += col) idx.subarray(c, Math.min(n, c + col)).sort((a, b) => KX[a * 2 + 1]! - KX[b * 2 + 1]!);
    };
    const persp = (i: number) => DISTANCE / (DISTANCE - camZ(S[i * 8 + 1]!, S[i * 8 + 2]!));
    order(IT, (i) => TT[i * 3]!, (i) => TT[i * 3 + 1]!);
    order(IB, (i) => S[i * 8]! * persp(i), (i) => camY(S[i * 8 + 1]!, S[i * 8 + 2]!) * persp(i));
    const base = (k % 3) * max * 3;
    const turn = Math.round(n * TURN) * (k & 1 ? 1 : -1) + n;
    for (let r = 0; r < n; r++) {
      const b = base + IB[r]! * 3;
      const p = IT[(r + turn) % n]! * 3;
      T[b] = TT[p]! * scale;
      T[b + 1] = TT[p + 1]! * scale;
      T[b + 2] = TT[p + 2]! * scale;
    }
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
    const u = t - t0;
    // Half way through each picture, every bird is on it: give out the points on the next.
    if (u - Math.floor(u / SLOT) * SLOT >= SLOT / 2 && Math.floor(u / SLOT) + 1 > assigned) give(Math.floor(u / SLOT) + 1);

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

    const dcos = Math.cos(t * 0.13) * V0;
    const dsin = Math.sin(t * 0.13) * V0;
    const ease = Math.min(1, dt * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      const px = S[o]!;
      const py = S[o + 1]!;
      const pz = S[o + 2]!;
      let vx = S[o + 4]!;
      let vy = S[o + 5]!;
      let vz = S[o + 6]!;

      // The seven neighbours. A bird on a picture barely counts towards the others' alignment and
      // cohesion, so the birds that stay in the flock keep flying rather than stalling among them.
      let ex = 0, ey = 0, ez = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, m = 0, seen = 0;
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
        const wj = 1 - 0.9 * W[j]!;
        ax += S[q + 4]! * wj;
        ay += S[q + 5]! * wj;
        az += S[q + 6]! * wj;
        cx += dx * wj;
        cy += dy * wj;
        cz += dz * wj;
        m += wj;
        seen++;
      }
      let fx = 0, fy = 0, fz = 0;
      if (seen) {
        fx = WS * ex + (WA * (ax - m * vx) + WC * cx) / seen;
        fy = WS * ey + (WA * (ay - m * vy) + WC * cy) / seen;
        fz = WS * ez + (WA * (az - m * vz) + WC * cz) / seen;
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
      // A faint shared heading that turns slowly, as a whole flock heads somewhere: enough to break a
      // mill (birds circling the roost as a ring) without straightening the flock's own turns.
      fx += wd * (dcos - vx);
      fz += wd * (dsin - vz);

      // Which picture this bird is on, by its own time, and whether it stays in the flock for it.
      const tau = u + O[i]!;
      const k = Math.floor(tau / SLOT);
      const on = tau >= 0 && ((Math.imul(i, 40503) ^ Math.imul(k, 2654435761)) >>> 0) % 100 >= FREE;
      const w = (W[i]! += ((on ? 1 : 0) - W[i]!) * ease);
      if (w > 0) {
        const s = 1 - 0.85 * w;
        fx *= s;
        fy *= s;
        fz *= s;
      }
      if (on) {
        // Its point, circling slowly in step with its neighbours on the picture, so a ripple runs
        // across it, plus a small circle of the bird's own.
        const j = (k % 3) * max * 3 + i * 3;
        const gx = T[j]!;
        const wave = WAVE * t - 0.3 * gx;
        const qx = gx + Math.cos(wave) * SWAY + Math.cos(PH[i]! + t * 2.1) * 0.15;
        const qy = T[j + 1]! + Math.sin(wave) * SWAY * 0.3 + Math.sin(PH[i]! * 1.3 + t * 1.7) * 0.15;
        const qz = T[j + 2]!;
        const wy = Math.cos(wave) * SWAY * 0.3 * WAVE; // the point's own velocity, camera space
        // The velocity it wants: towards its point, slowing within reach of it, and curving on the way
        // (turned in the picture's plane) until it is close, so it settles rather than circling, plus
        // the point's own.
        const kx = qx - px;
        const ky = qy * cos + qz * sin - py;
        const kz = -qy * sin + qz * cos - pz;
        const d = Math.sqrt(kx * kx + ky * ky + kz * kz) + 1e-3;
        const sd = (VMAX * Math.min(1, d / ARRIVE)) / d;
        // Outwards, so the path bows round the centre.
        const sw = -SWIRL * VAR[i]! * (k & 1 ? 1 : -1) * Math.min(1, Math.max(0, d / ARRIVE - 1));
        let sx = KV * (sd * (kx + sw * (sin * kz - cos * ky)) - Math.sin(wave) * SWAY * WAVE - vx);
        let sy = KV * (sd * (ky + sw * cos * kx) + wy * cos - vy);
        let sz = KV * (sd * (kz - sw * sin * kx) - wy * sin - vz);
        const g = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (g > ACC) (sx *= ACC / g), (sy *= ACC / g), (sz *= ACC / g);
        fx += w * sx;
        fy += w * sy;
        fz += w * sz;
      }

      // Bank into the sideways part of the pull, slowly; speed comes back to cruise. A bird on a
      // picture banks harder and quicker, and its speed is the one it wants, not the cruise.
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
      const hx = vx / sp;
      const hy = vy / sp;
      const hz = vz / sp;
      const ff = fx * hx + fy * hy + fz * hz;
      const b = i * 3;
      const bank = Math.min(1, dt / (TAU * (1 - 0.7 * w)));
      let bx = B[b]! + (fx - ff * hx - B[b]!) * bank;
      let by = B[b + 1]! + (fy - ff * hy - B[b + 1]!) * bank;
      let bz = B[b + 2]! + (fz - ff * hz - B[b + 2]!) * bank;
      const bh = bx * hx + by * hy + bz * hz;
      bx -= bh * hx;
      by -= bh * hy;
      bz -= bh * hz;
      const most = AMAX * (1 + 15 * w);
      let bm = Math.sqrt(bx * bx + by * by + bz * bz);
      if (bm > most) {
        const k = most / bm;
        bx *= k;
        by *= k;
        bz *= k;
        bm = most;
      }
      B[b] = bx;
      B[b + 1] = by;
      B[b + 2] = bz;
      const acc = (V0 - sp) * KS * (1 - w) + ff * (0.25 + 0.75 * w);
      vx += (bx + hx * acc) * dt;
      vy += (by + hy * acc) * dt;
      vz += (bz + hz * acc) * dt;
      S[o] = px + vx * dt;
      S[o + 1] = py + vy * dt;
      S[o + 2] = pz + vz * dt;
      // Shade: a banking bird shows more wing, so reads darker; so does a bird on a picture.
      S[o + 3] = Math.min(1, (bm / most) * 0.7 * (1 - w) + DARK * w);
      S[o + 4] = vx;
      S[o + 5] = vy;
      S[o + 6] = vz;
    }
  }

  return f;
}

export type Flock = ReturnType<typeof createFlock>;
