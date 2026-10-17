export const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aEmissive;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec4 uTint;      // rgb tint, a = tint mix
uniform float uEmissiveAdd;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
out float vEmissive;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = mix(aColor, uTint.rgb, uTint.a);
  vEmissive = clamp(aEmissive + uEmissiveAdd, 0.0, 1.0);
  gl_Position = uViewProj * w;
}`;

export const LIT_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
in float vEmissive;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
uniform float uFogDensity;
uniform float uGrid;
uniform float uAlpha;
uniform float uTime;
out vec4 o;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 amb = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  vec3 base = vColor;
  if (uGrid > 0.0) {
    // light procedural grid on world geometry (speed perception) — triplanar by dominant axis
    vec3 an = abs(n);
    vec2 uv = an.y > 0.6 ? vWorld.xz : (an.x > an.z ? vWorld.zy : vWorld.xy);
    vec2 g = abs(fract(uv / 128.0) - 0.5);
    float line = step(0.485, max(g.x, g.y));
    vec2 g2 = abs(fract(uv / 512.0) - 0.5);
    float line2 = step(0.494, max(g2.x, g2.y));
    base *= 1.0 - uGrid * (0.06 * line + 0.08 * line2);
  }
  vec3 lit = base * (amb + uSunColor * diff);
  // subtle rim to separate silhouettes
  vec3 V = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.18;
  lit += rim * uSkyColor;
  vec3 col = mix(lit, base * 1.35 + 0.08, vEmissive);
  float dist = length(vWorld - uCamPos);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 1.6));
  // height fog: thicker in the cloud layer below the arena
  float hf = clamp((-vWorld.y - 1200.0) / 2600.0, 0.0, 1.0) * 0.6;
  f = clamp(max(f, hf * clamp(dist / 4000.0, 0.0, 1.0)), 0.0, 1.0) * (1.0 - vEmissive * 0.45);
  col = mix(col, uFogColor, f);
  o = vec4(col, uAlpha);
}`;

export const SKY_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vNdc;
void main() { vNdc = P[gl_VertexID]; gl_Position = vec4(P[gl_VertexID], 0.9999, 1.0); }`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInvViewProj;
uniform vec3 uSunDir;
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uBelow;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec4 a = uInvViewProj * vec4(vNdc, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  float h = d.y;
  vec3 col;
  if (h > 0.0) {
    col = mix(uHorizon, uZenith, pow(h, 0.55));
    // stylized high clouds
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.01, 0.0);
    float c = smoothstep(0.52, 0.78, fbm(uv));
    col = mix(col, vec3(1.0), c * 0.75 * smoothstep(0.0, 0.25, h));
  } else {
    // sea of clouds below the arena
    vec2 uv = d.xz / (-h + 0.05) * 0.9 + vec2(uTime * 0.006, uTime * 0.004);
    float c = fbm(uv);
    float shade = 0.82 + 0.18 * smoothstep(0.35, 0.75, c);
    col = mix(uHorizon, uBelow * shade, smoothstep(0.0, 0.12, -h));
  }
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18);
  o = vec4(col, 1.0);
}`;

export const PARTICLE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
layout(location=2) in float aSize;
uniform mat4 uViewProj;
uniform float uScale;
out vec4 vColor;
void main() {
  vec4 p = uViewProj * vec4(aPos, 1.0);
  gl_Position = p;
  gl_PointSize = clamp(aSize * uScale / max(p.w, 1.0), 1.0, 256.0);
  vColor = aColor;
}`;

export const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d);
  o = vec4(vColor.rgb, vColor.a * a);
}`;

export const FLAT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
uniform mat4 uViewProj;
out vec4 vColor;
void main() { gl_Position = uViewProj * vec4(aPos, 1.0); vColor = aColor; }`;

export const FLAT_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 o;
void main() { o = vColor; }`;
