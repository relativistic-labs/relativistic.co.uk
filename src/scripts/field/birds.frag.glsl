#version 300 es
// A capsule with one device pixel of anti-aliasing and, on ink, a faint halo that falls off fast
// enough that dense folds glow while the field as a whole stays quiet.
precision mediump float;

in vec4 vColour;
in vec2 vL;
in vec2 vR;
uniform highp float uGlow; // shared with the vertex shader, so the same precision
out vec4 colour;

void main() {
  float d = length(vec2(max(abs(vL.x) - vR.x, 0.0), vL.y)) - vR.y;
  float a = min(1.0, clamp(0.5 - d, 0.0, 1.0) + uGlow * 0.16 * exp(-max(d, 0.0) / max(vR.y, 0.5)));
  if (a <= 0.004) discard;
  colour = vColour * a;
}
