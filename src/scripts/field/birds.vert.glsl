#version 300 es
// One instance per bird: a round dot, from four corners made from gl_VertexID (no vertex buffer).
// The CPU uploads each bird's position and velocity in 3D; this projects them with perspective, so
// nearer birds are larger and darker on paper (brighter on ink).
precision highp float;

layout(location = 0) in vec4 aP; // x, y, z, shade (banking, or on a picture)
layout(location = 1) in vec4 aV; // vx, vy, vz, unused

uniform vec4 uCam;  // cos and sin of the camera's pitch, its distance, CSS px per world unit
uniform vec2 uSize; // canvas, CSS px
uniform float uDpr;
uniform float uAlpha; // overall quietness
uniform float uGlow;  // ink only: a soft halo
uniform vec3 uInk;
uniform vec3 uAccent;

out vec4 vColour;
out vec2 vL; // position in the dot, device px
out float vR; // its radius, device px

vec3 cam(vec3 p) { return vec3(p.x, p.y * uCam.x - p.z * uCam.y, p.y * uCam.y + p.z * uCam.x); }

void main() {
  vec3 c = cam(aP.xyz);
  float k = uCam.z / (uCam.z - c.z);
  float near = smoothstep(0.82, 1.25, k);

  float r = (0.85 + 0.25 * aP.w) * k * uDpr;
  vR = r;
  vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vL = corner * (r + 1.0 + uGlow * r * 1.5);
  vec2 s = (uSize * 0.5 + vec2(c.x, -c.y) * uCam.w * k) * uDpr + vL;

  // A starling's sheen: a bird heading into the light glints teal for a moment.
  float glint = pow(max(dot(aV.xyz / max(length(aV.xyz), 1e-4), vec3(0.62, 0.3, 0.72)), 0.0), 14.0) * 0.6;
  vec3 colour = mix(uInk, uAccent, glint);
  float a = min(1.0, uAlpha * mix(0.42, 1.0, near) * (1.0 + 0.9 * aP.w));
  vColour = vec4(colour * a, a);
  gl_Position = vec4(s / (uSize * uDpr) * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
