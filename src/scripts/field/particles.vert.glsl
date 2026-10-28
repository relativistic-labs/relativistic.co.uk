#version 300 es
// The four formations, ported from brand/field/field.js. Each is a closed-form function of a
// particle's fixed attributes and time, so the CPU only sends uniforms each frame.
precision highp float;

layout(location = 0) in vec4 a0; // u, angle (mod 2pi), seed, seed2
layout(location = 1) in vec4 a1; // seed3, size, 0.7 * angle (mod 2pi), ring + 4 * signal

uniform float uT;       // seconds
uniform int uFrom;      // formation on screen
uniform int uTo;        // formation blending in
uniform float uBlend;   // 0..1
uniform float uGranted; // how GRANTED this frame is: drives the lid fade, the clamp and the accent
uniform float uScale;   // CSS px per model unit
uniform vec2 uCenter;   // CSS px
uniform vec2 uSize;     // canvas, CSS px
uniform vec2 uPointer;  // CSS px
uniform float uPointerOn;
uniform float uDpr;
uniform float uGlow;    // 1 on ink: accent near the apex
uniform vec3 uParticle;
uniform vec3 uAccent;
uniform vec3 uSignal;

out vec4 vColour; // premultiplied
out float vRadius; // device px

const float APEX = -0.82;  // the light cone's apex, model units
const float HEIGHT = 1.5;  // c = 1, so the radius at height s is s: 45 degrees
const float RING = 0.62;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

// Progress up the cone, looping.
float climb() { return fract(a0.x * 7.0 + a0.w + uT * (0.055 + a0.z * 0.03)); }

vec3 formation(int f, bool signal, float ring) {
  float u = a0.x, angle = a0.y, s1 = a0.z, s2 = a0.w, s3 = a1.x, t = uT;
  // 001 UNBOUND: scattered and drifting around a random home.
  if (f == 0) return vec3(
    (s1 * 2.0 - 1.0) * 1.7 + 0.16 * sin(t * (0.11 + s3 * 0.12) + angle),
    (s2 * 2.0 - 1.0) * 1.25 + 0.14 * cos(t * (0.09 + s1 * 0.13) + a1.z),
    (s3 * 2.0 - 1.0) + 0.10 * sin(t * 0.07 + s2 * 6.283));
  // 002 GRANTED: streaming up a light cone. Signal particles sit on the boundary.
  if (f == 1) {
    float s = pow(climb(), 1.35) * HEIGHT, rho, th;
    if (signal) { rho = 1.0; th = (s1 < 0.5 ? 0.0 : 3.1415927) + (s2 - 0.5) * 0.12; }
    else { rho = s3 < 0.62 ? 0.9 + 0.1 * s2 : sqrt(s2) * 0.9; th = angle + t * 0.12; }
    return vec3(rho * s * cos(th), APEX + s, rho * s * sin(th));
  }
  // 003 SHARED: three linked orbits; the middle one is perpendicular and links the others.
  if (f == 2) {
    float r = RING + (s1 - 0.5) * 0.07;
    float a = angle + (ring == 1.0 ? -1.0 : 1.0) * t * (0.16 + s2 * 0.03);
    vec3 q = vec3(r * cos(a), r * sin(a), (s3 - 0.5) * 0.05);
    if (ring == 1.0) q = rotX(q, 1.5707963);
    q.x += (ring - 1.0) * RING;
    return rotY(rotX(q, -0.72), 0.42);
  }
  // 004 RUNNING: a calm Fibonacci sphere, slowly turning.
  float y = clamp(1.0 - 2.0 * u + (s1 - 0.5) * 0.012, -1.0, 1.0);
  float r = sqrt(1.0 - y * y);
  float a = angle + (s2 - 0.5) * 0.05 + t * 0.1;
  float k = 0.98 + (s3 - 0.5) * 0.02;
  return rotX(vec3(r * cos(a) * k, y * k, r * sin(a) * k), 0.32);
}

void main() {
  bool signal = a1.w > 3.5;
  float ring = signal ? a1.w - 4.0 : a1.w;
  vec3 p = mix(formation(uFrom, signal, ring), formation(uTo, signal, ring), uBlend);

  // Fade in at the apex and out near the top, so the stream has no hard lid.
  float h = climb();
  float fade = mix(1.0, smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.72, 1.0, h)), uGranted);

  float persp = 3.0 / (3.0 - p.z * 0.6);
  vec2 sp = uCenter + vec2(p.x, -p.y) * uScale * persp;

  // Particles part around the pointer, but in GRANTED nothing leaves the cone.
  if (uPointerOn > 0.5) {
    vec2 d = sp - uPointer;
    float l = length(d);
    if (l > 0.0 && l < 120.0) {
      sp += d / l * (1.0 - l / 120.0) * 28.0;
      if (uGranted > 0.5) {
        float m = uScale * persp;
        float mx = (sp.x - uCenter.x) / m, my = (uCenter.y - sp.y) / m;
        float s = clamp(my - APEX, 0.0, HEIGHT);
        float rr = sqrt(mx * mx + p.z * p.z);
        if (rr > s) mx *= s / rr;
        sp = uCenter + vec2(mx, -(APEX + s)) * m;
      }
    }
  }

  float alpha = (0.28 + clamp((p.z + 1.2) / 2.4, 0.0, 1.0) * 0.62) * fade;
  float radius = a1.y * persp;
  vec3 c = uParticle;
  if (signal) {
    c = uSignal;
    radius *= 1.35;
    alpha = min(1.0, alpha * 1.25 + 0.15);
  } else if (uGlow > 0.5 && uGranted > 0.0) {
    // Cherenkov blue near the apex, gone a fifth of the way up.
    if (a0.w < (1.0 - smoothstep(0.0, 0.2, (p.y - APEX) / HEIGHT)) * 0.7 * uGranted) c = uAccent;
  }

  vRadius = radius * uDpr;
  vColour = vec4(c * alpha, alpha);
  gl_PointSize = alpha < 0.01 ? 0.0 : vRadius * 2.0 + 1.0;
  gl_Position = vec4(sp.x / uSize.x * 2.0 - 1.0, 1.0 - sp.y / uSize.y * 2.0, 0.0, 1.0);
}
