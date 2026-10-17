// Minimal WebGL2 renderer built for this game: flat-shaded low-poly meshes, stylized sky,
// fog, point-sprite particles and unlit "flat" geometry (tracers, beams, shadows).
import { LIT_VS, LIT_FS, SKY_VS, SKY_FS, PARTICLE_VS, PARTICLE_FS, FLAT_VS, FLAT_FS } from './shaders';
import { Mat4, mat4, perspective, lookDir, multiply, invert, identity } from './glm';
import { STRIDE, hexToRgb } from './mesh';

export interface GpuMesh { vao: WebGLVertexArrayObject; buf: WebGLBuffer; count: number; }

interface Program { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null>; }

export interface Camera { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; fovY: number; }

const MAX_PARTICLES = 6000;
const MAX_FLAT_VERTS = 30000;

export class Renderer {
  gl: WebGL2RenderingContext;
  lit: Program; sky: Program; part: Program; flat: Program;
  proj = mat4(); view = mat4(); viewProj = mat4(); invViewProj = mat4();
  cam: Camera = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fovY: 1.2 };
  width = 1; height = 1;
  resolutionScale = 1;
  time = 0;
  readonly sunDir = norm([0.35, 0.8, 0.45]);
  fogDensity = 1 / 16000;

  private partData = new Float32Array(MAX_PARTICLES * 8);
  private partCount = 0;
  private partAddData = new Float32Array(MAX_PARTICLES * 8);
  private partAddCount = 0;
  private partVao: WebGLVertexArrayObject; private partBuf: WebGLBuffer;
  private flatData = new Float32Array(MAX_FLAT_VERTS * 7);
  private flatCount = 0;
  private flatAddData = new Float32Array(MAX_FLAT_VERTS * 7);
  private flatAddCount = 0;
  private flatVao: WebGLVertexArrayObject; private flatBuf: WebGLBuffer;
  private skyVao: WebGLVertexArrayObject;
  private identity = identity(new Float32Array(16));

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 não está disponível neste navegador.');
    this.gl = gl;
    this.lit = this.program(LIT_VS, LIT_FS, ['uViewProj', 'uModel', 'uTint', 'uEmissiveAdd', 'uSunDir', 'uSunColor', 'uSkyColor', 'uGroundColor', 'uFogColor', 'uCamPos', 'uFogDensity', 'uGrid', 'uAlpha', 'uTime']);
    this.sky = this.program(SKY_VS, SKY_FS, ['uInvViewProj', 'uSunDir', 'uTime', 'uZenith', 'uHorizon', 'uBelow']);
    this.part = this.program(PARTICLE_VS, PARTICLE_FS, ['uViewProj', 'uScale']);
    this.flat = this.program(FLAT_VS, FLAT_FS, ['uViewProj']);

    this.skyVao = gl.createVertexArray()!;
    // particles
    this.partVao = gl.createVertexArray()!;
    this.partBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
    // flat
    this.flatVao = gl.createVertexArray()!;
    this.flatBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.flatVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flatBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.flatData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
  }

  private program(vs: string, fs: string, uniforms: string[]): Program {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
    return { prog, u };
  }

  createMesh(data: Float32Array): GpuMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const buf = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const s = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, s, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, s, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, s, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, s, 36);
    gl.bindVertexArray(null);
    return { vao, buf, count: data.length / STRIDE };
  }

  deleteMesh(m: GpuMesh) { this.gl.deleteBuffer(m.buf); this.gl.deleteVertexArray(m.vao); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.resolutionScale;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.width = w; this.height = h;
  }

  /** Sets up camera matrices, clears and draws the sky. */
  beginFrame(cam: Camera, time: number) {
    const gl = this.gl;
    this.time = time;
    this.cam = cam;
    this.resize();
    gl.viewport(0, 0, this.width, this.height);
    perspective(this.proj, cam.fovY, this.width / this.height, 4, 90000);
    const cp = Math.cos(cam.pitch);
    lookDir(this.view, cam.x, cam.y, cam.z, -Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    if (cam.roll) {
      const c = Math.cos(cam.roll), s = Math.sin(cam.roll);
      const r = identity(new Float32Array(16)); r[0] = c; r[1] = s; r[4] = -s; r[5] = c;
      multiply(this.view, r, this.view);
    }
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);

    gl.clearColor(0.7, 0.85, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.sky.prog);
    gl.uniformMatrix4fv(this.sky.u.uInvViewProj, false, this.invViewProj);
    gl.uniform3fv(this.sky.u.uSunDir, this.sunDir);
    gl.uniform1f(this.sky.u.uTime, time);
    gl.uniform3fv(this.sky.u.uZenith, [0.17, 0.4, 0.86]);
    gl.uniform3fv(this.sky.u.uHorizon, [0.72, 0.87, 1.0]);
    gl.uniform3fv(this.sky.u.uBelow, [0.96, 0.97, 1.0]);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    this.useLit(this.viewProj);
  }

  useLit(viewProj: Mat4, camPos: [number, number, number] = [this.cam.x, this.cam.y, this.cam.z]) {
    const gl = this.gl, u = this.lit.u;
    gl.useProgram(this.lit.prog);
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform3fv(u.uSunDir, this.sunDir);
    gl.uniform3fv(u.uSunColor, [0.6, 0.56, 0.5]);
    gl.uniform3fv(u.uSkyColor, [0.5, 0.58, 0.74]);
    gl.uniform3fv(u.uGroundColor, [0.3, 0.29, 0.35]);
    gl.uniform3fv(u.uFogColor, [0.72, 0.87, 1.0]);
    gl.uniform3fv(u.uCamPos, camPos);
    gl.uniform1f(u.uFogDensity, this.fogDensity);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uAlpha, 1);
    gl.uniform1f(u.uGrid, 0);
    gl.uniform4f(u.uTint, 0, 0, 0, 0);
    gl.uniform1f(u.uEmissiveAdd, 0);
  }

  drawMesh(m: GpuMesh, model: Mat4 | null, opts?: { tint?: number; tintMix?: number; emissive?: number; alpha?: number; grid?: number; xray?: boolean }) {
    const gl = this.gl, u = this.lit.u;
    gl.uniformMatrix4fv(u.uModel, false, model ?? this.identity);
    if (opts?.tint !== undefined) { const c = hexToRgb(opts.tint); gl.uniform4f(u.uTint, c[0], c[1], c[2], opts.tintMix ?? 1); }
    else gl.uniform4f(u.uTint, 0, 0, 0, 0);
    gl.uniform1f(u.uEmissiveAdd, opts?.emissive ?? 0);
    const alpha = opts?.alpha ?? 1;
    gl.uniform1f(u.uAlpha, alpha);
    gl.uniform1f(u.uGrid, opts?.grid ?? 0);
    if (alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    if (opts?.xray) gl.depthFunc(gl.ALWAYS);
    gl.bindVertexArray(m.vao);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    if (opts?.xray) gl.depthFunc(gl.LEQUAL);
    if (alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
  }

  // ---------------- particles ----------------
  particle(x: number, y: number, z: number, color: number, alpha: number, size: number, additive = false) {
    const [r, g, b] = hexToRgb(color);
    if (additive) {
      if (this.partAddCount >= MAX_PARTICLES) return;
      const i = this.partAddCount++ * 8, d = this.partAddData;
      d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = r; d[i + 4] = g; d[i + 5] = b; d[i + 6] = alpha; d[i + 7] = size;
    } else {
      if (this.partCount >= MAX_PARTICLES) return;
      const i = this.partCount++ * 8, d = this.partData;
      d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = r; d[i + 4] = g; d[i + 5] = b; d[i + 6] = alpha; d[i + 7] = size;
    }
  }

  // ---------------- flat (unlit) triangles ----------------
  flatTri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, color: number, alpha: number, additive = false) {
    const [r, g, b] = hexToRgb(color);
    const d = additive ? this.flatAddData : this.flatData;
    let n = additive ? this.flatAddCount : this.flatCount;
    if (n + 3 > MAX_FLAT_VERTS) return;
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      const i = n++ * 7;
      d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = r; d[i + 4] = g; d[i + 5] = b; d[i + 6] = alpha;
    }
    if (additive) this.flatAddCount = n; else this.flatCount = n;
  }

  flatQuad(p: number[][], color: number, alpha: number, additive = false) {
    this.flatTri(p[0][0], p[0][1], p[0][2], p[1][0], p[1][1], p[1][2], p[2][0], p[2][1], p[2][2], color, alpha, additive);
    this.flatTri(p[0][0], p[0][1], p[0][2], p[2][0], p[2][1], p[2][2], p[3][0], p[3][1], p[3][2], color, alpha, additive);
  }

  /** Camera-facing ribbon between two points (tracers, beams). */
  ribbon(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, color: number, alpha: number, additive = true) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const mx = (ax + bx) / 2 - this.cam.x, my = (ay + by) / 2 - this.cam.y, mz = (az + bz) / 2 - this.cam.z;
    // side = dir × toCam
    let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
    const l = Math.hypot(sx, sy, sz) || 1;
    sx = sx / l * width / 2; sy = sy / l * width / 2; sz = sz / l * width / 2;
    this.flatQuad([[ax - sx, ay - sy, az - sz], [ax + sx, ay + sy, az + sz], [bx + sx, by + sy, bz + sz], [bx - sx, by - sy, bz - sz]], color, alpha, additive);
  }

  /** Draw buffered particles + flat geometry (call after opaque geometry). */
  flushEffects() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    // flat alpha
    gl.useProgram(this.flat.prog);
    gl.uniformMatrix4fv(this.flat.u.uViewProj, false, this.viewProj);
    gl.bindVertexArray(this.flatVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flatBuf);
    if (this.flatCount) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flatData, 0, this.flatCount * 7);
      gl.drawArrays(gl.TRIANGLES, 0, this.flatCount);
    }
    if (this.flatAddCount) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flatAddData, 0, this.flatAddCount * 7);
      gl.drawArrays(gl.TRIANGLES, 0, this.flatAddCount);
    }
    // particles
    gl.useProgram(this.part.prog);
    gl.uniformMatrix4fv(this.part.u.uViewProj, false, this.viewProj);
    gl.uniform1f(this.part.u.uScale, this.height * 0.9);
    gl.bindVertexArray(this.partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    if (this.partCount) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.partData, 0, this.partCount * 8);
      gl.drawArrays(gl.POINTS, 0, this.partCount);
    }
    if (this.partAddCount) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.partAddData, 0, this.partAddCount * 8);
      gl.drawArrays(gl.POINTS, 0, this.partAddCount);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    this.partCount = 0; this.partAddCount = 0; this.flatCount = 0; this.flatAddCount = 0;
  }

  /** Viewmodel pass: clear depth and use a camera-space projection. */
  beginViewmodel(fovY: number): Mat4 {
    const gl = this.gl;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const p = perspective(mat4(), fovY, this.width / this.height, 0.5, 400);
    this.useLit(p, [0, 0, 0]);
    gl.uniform1f(this.lit.u.uFogDensity, 0);
    // light direction in camera space so the gun is lit consistently with the world
    const v = this.view;
    const s = this.sunDir;
    const cs = [v[0] * s[0] + v[4] * s[1] + v[8] * s[2], v[1] * s[0] + v[5] * s[1] + v[9] * s[2], v[2] * s[0] + v[6] * s[1] + v[10] * s[2]];
    gl.uniform3fv(this.lit.u.uSunDir, cs);
    return p;
  }

  /** Project world point to screen pixels (CSS). Returns null if behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; depth: number } | null {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.1) return null;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h, depth: cw };
  }
}

function norm(v: number[]) { const l = Math.hypot(v[0], v[1], v[2]); return new Float32Array([v[0] / l, v[1] / l, v[2] / l]); }
