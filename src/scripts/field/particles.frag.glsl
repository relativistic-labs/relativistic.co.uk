#version 300 es
// Round, soft-edged points: one pixel of anti-aliasing at the rim.
precision mediump float;

in vec4 vColour;
in float vRadius;
out vec4 colour;

void main() {
  float d = length(gl_PointCoord - 0.5) * (vRadius * 2.0 + 1.0);
  float a = clamp(vRadius + 0.5 - d, 0.0, 1.0);
  if (a <= 0.0) discard;
  colour = vColour * a;
}
