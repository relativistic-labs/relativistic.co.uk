#version 300 es
// The field's own glow, the only gradient in the system: accent at the apex, ink theme only.
// Same stops as the reference's radial gradient: 0.30 at the centre, 0.08 at 35%, 0 at the edge.
precision mediump float;

in vec2 vP;
uniform vec3 uAccent;
uniform float uW; // how GRANTED this frame is
out vec4 colour;

void main() {
  float d = length(vP);
  float a = (d < 0.35 ? mix(0.30, 0.08, d / 0.35) : mix(0.08, 0.0, (d - 0.35) / 0.65)) * uW * step(d, 1.0);
  colour = vec4(uAccent * a, a);
}
