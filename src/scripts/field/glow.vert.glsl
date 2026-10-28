#version 300 es
// A quad around the cone's apex, from gl_VertexID alone: no buffers.
uniform vec2 uC;    // apex, CSS px
uniform float uR;   // glow radius, CSS px
uniform vec2 uSize; // canvas, CSS px
out vec2 vP;

void main() {
  vP = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 s = uC + vP * uR;
  gl_Position = vec4(s.x / uSize.x * 2.0 - 1.0, 1.0 - s.y / uSize.y * 2.0, 0.0, 1.0);
}
