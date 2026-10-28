#version 300 es
// One instance per bird: a short stroke along its heading as seen, from four corners made from
// gl_VertexID (no vertex buffer). The CPU uploads each bird's position and velocity in 3D; this
// projects them with perspective, so nearer birds are larger and darker on paper (brighter on ink),
// and a bird flying towards or away from the viewer is foreshortened to a dot.
precision highp float;

layout(location = 0) in vec4 aP; // x, y, z, shade (banking or panic: more wing on show)
layout(location = 1) in vec4 aV; // vx, vy, vz, kind (1: the predator)

uniform vec4 uCam;  // cos and sin of the camera's pitch, its distance, CSS px per world unit
uniform vec2 uSize; // canvas, CSS px
uniform float uDpr;
uniform float uAlpha; // overall quietness
uniform float uGlow;  // ink only: a soft halo
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec3 uSignal;

out vec4 vColour;
out vec2 vL; // position in the stroke, device px
out vec2 vR; // half the stroke's straight part, and its radius, device px

vec3 cam(vec3 p) { return vec3(p.x, p.y * uCam.x - p.z * uCam.y, p.y * uCam.y + p.z * uCam.x); }

void main() {
  vec3 c = cam(aP.xyz);
  float k = uCam.z / (uCam.z - c.z);
  vec3 d = cam(aV.xyz);
  vec2 h = vec2(d.x, -d.y) / max(length(d), 1e-4);
  float f = length(h);
  vec2 u = f > 1e-3 ? h / f : vec2(1.0, 0.0);
  float pred = aV.w;
  float near = smoothstep(0.82, 1.25, k);

  float r = (0.6 + 0.25 * aP.w + 0.3 * pred) * k * uDpr;
  float l = (0.45 + f + pred) * k * uDpr;
  vR = vec2(l, r);
  vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vL = corner * (vec2(l, 0.0) + r + 1.0 + uGlow * r * 1.5);
  vec2 s = (uSize * 0.5 + vec2(c.x, -c.y) * uCam.w * k) * uDpr + u * vL.x + vec2(-u.y, u.x) * vL.y;

  // A starling's sheen: a bird heading into the light glints teal for a moment.
  float glint = pow(max(dot(aV.xyz / max(length(aV.xyz), 1e-4), vec3(0.62, 0.3, 0.72)), 0.0), 14.0) * 0.6;
  vec3 colour = mix(mix(uInk, uAccent, glint), uSignal, pred);
  float a = uAlpha * mix(0.42, 1.0, near) * (1.0 + 0.9 * aP.w);
  a = min(1.0, mix(a, 0.9, pred));
  vColour = vec4(colour * a, a);
  gl_Position = vec4(s / (uSize * uDpr) * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
