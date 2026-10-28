#version 300 es
// The field's own glow, the only gradient in the system: accent at the cone's apex, ink theme only.
// A whisper: a third of the reference's strength (0.10 at the centre, 0.03 at 35%, 0 at the edge).
precision mediump float;

in vec2 vP;
uniform vec3 uAccent;
uniform float uW; // how GRANTED this frame is
out vec4 colour;

void main() {
  float d = length(vP);
  float a = (d < 0.35 ? mix(0.10, 0.03, d / 0.35) : mix(0.03, 0.0, (d - 0.35) / 0.65)) * uW * step(d, 1.0);
  colour = vec4(uAccent * a, a);
}
