#version 300 es
// Blends between two formations. Scatter, cone and sphere are closed-form functions of time
// (ported from brand/field/field.js); the shapes (wordmark, padlock, charts, document) are target
// positions sampled once in the worker and bound as aA and aB. The CPU sends only uniforms per frame.
precision highp float;

layout(location = 0) in vec4 a0; // u, angle (mod 2pi), seed, seed2
layout(location = 1) in vec4 a1; // seed3, size, 0.7 * angle (mod 2pi), signal
layout(location = 2) in vec4 aA; // shape on screen: x, y, z, tag
layout(location = 3) in vec4 aB; // shape blending in

uniform float uT;
uniform int uFrom;    // 0 scatter, 1 cone, 2 sphere, 3 shape A, 4 shape B
uniform int uTo;
uniform float uBlend;
uniform float uCone;  // how much of the cone is on screen: the lid fade and the glow
uniform int uDocSlot; // which shape slot holds the document: 3, 4 or 0 for neither
uniform float uDoc;   // how much of the document is on screen
uniform float uTyped; // characters typed so far, fractional
uniform vec2 uCaret;  // caret position, model units
uniform float uCaretOn;
uniform float uScale;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uDpr;
uniform float uGlow;
uniform float uAlpha; // overall quietness
uniform vec3 uParticle;
uniform vec3 uAccent;
uniform vec3 uSignal;

out vec4 vColour;
out float vRadius;

const float APEX = -0.82;
const float HEIGHT = 1.5;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }

float climb() { return fract(a0.x * 7.0 + a0.w + uT * (0.055 + a0.z * 0.03)); }

// A sampled shape breathes very slightly, so it never looks frozen. The caret follows uCaret.
vec3 shape(vec4 s, bool doc) {
  vec3 p = s.xyz;
  if (doc && s.w < -0.5) p.x = uCaret.x;
  return p + vec3(sin(uT * 0.6 + a0.y), cos(uT * 0.5 + a0.z * 6.283), 0.0) * 0.004;
}

vec3 formation(int f, bool signal) {
  float u = a0.x, angle = a0.y, s1 = a0.z, s2 = a0.w, s3 = a1.x, t = uT;
  // Scatter: drifting around a random home.
  if (f == 0) return vec3(
    (s1 * 2.0 - 1.0) * 1.7 + 0.16 * sin(t * (0.11 + s3 * 0.12) + angle),
    (s2 * 2.0 - 1.0) * 1.25 + 0.14 * cos(t * (0.09 + s1 * 0.13) + a1.z),
    (s3 * 2.0 - 1.0) + 0.10 * sin(t * 0.07 + s2 * 6.283));
  // The cone: streaming upward inside 45-degree sides. Signal particles sit on the boundary.
  if (f == 1) {
    float s = pow(climb(), 1.35) * HEIGHT, rho, th;
    if (signal) { rho = 1.0; th = (s1 < 0.5 ? 0.0 : 3.1415927) + (s2 - 0.5) * 0.12; }
    else { rho = s3 < 0.62 ? 0.9 + 0.1 * s2 : sqrt(s2) * 0.9; th = angle + t * 0.12; }
    return vec3(rho * s * cos(th), APEX + s, rho * s * sin(th));
  }
  // A calm Fibonacci sphere, slowly turning.
  if (f == 2) {
    float y = clamp(1.0 - 2.0 * u + (s1 - 0.5) * 0.012, -1.0, 1.0);
    float r = sqrt(1.0 - y * y);
    float a = angle + (s2 - 0.5) * 0.05 + t * 0.1;
    float k = 0.98 + (s3 - 0.5) * 0.02;
    return rotX(vec3(r * cos(a) * k, y * k, r * sin(a) * k), 0.32);
  }
  if (f == 3) return shape(aA, uDocSlot == 3);
  return shape(aB, uDocSlot == 4);
}

void main() {
  bool signal = a1.w > 0.5;
  vec3 p = mix(formation(uFrom, signal), formation(uTo, signal), uBlend);

  // The cone has no hard lid: particles fade in at the apex and out near the top.
  float h = climb();
  float fade = mix(1.0, smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.72, 1.0, h)), uCone);

  // The document: each glyph's particles appear as it is typed; the caret blinks.
  float tag = uDocSlot == 3 ? aA.w : (uDocSlot == 4 ? aB.w : 0.0);
  float shown = tag > 0.5 ? clamp(uTyped - tag + 1.0, 0.0, 1.0) : (tag < -0.5 ? uCaretOn : 1.0);
  fade *= mix(1.0, shown * (tag > 0.5 ? 1.5 : 1.0), uDoc); // the typed line reads a little brighter

  float persp = 3.0 / (3.0 - p.z * 0.6);
  vec2 sp = uCenter + vec2(p.x, -p.y) * uScale * persp;

  float alpha = (0.3 + clamp((p.z + 1.2) / 2.4, 0.0, 1.0) * 0.5) * fade * uAlpha;
  float radius = a1.y * persp;
  vec3 c = uParticle;
  if (signal) {
    c = uSignal;
    radius *= 1.3;
    alpha = min(1.0, alpha * 1.3);
  } else if (uGlow > 0.5 && uCone > 0.0) {
    // A whisper of Cherenkov blue near the apex.
    if (a0.w < (1.0 - smoothstep(0.0, 0.2, (p.y - APEX) / HEIGHT)) * 0.35 * uCone) c = uAccent;
  }

  vRadius = radius * uDpr;
  vColour = vec4(c * alpha, alpha);
  gl_PointSize = alpha < 0.01 ? 0.0 : vRadius * 2.0 + 1.0;
  gl_Position = vec4(sp.x / uSize.x * 2.0 - 1.0, 1.0 - sp.y / uSize.y * 2.0, 0.0, 1.0);
}
