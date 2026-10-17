// Tiny column-major mat4 helpers (Float32Array).
export type Mat4 = Float32Array;

export const mat4 = () => identity(new Float32Array(16));

export function identity(o: Mat4): Mat4 {
  o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o;
}

export function perspective(o: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  return o;
}

export function multiply(o: Mat4, a: Mat4, b: Mat4): Mat4 {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    r[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  }
  o.set(r); return o;
}

export function lookDir(o: Mat4, ex: number, ey: number, ez: number, fx: number, fy: number, fz: number): Mat4 {
  // view matrix from eye and forward (up = +Y)
  let zx = -fx, zy = -fy, zz = -fz;
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = 0 * zz - 1 * zy, xy = 1 * zx - 0 * zz, xz = 0 * zy - 0 * zx;
  // x = up × z
  xx = 1 * zz - 0 * zy; xy = 0 * zx - 0 * zz; xz = 0 * zy - 1 * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xy * ey + xz * ez);
  o[13] = -(yx * ex + yy * ey + yz * ez);
  o[14] = -(zx * ex + zy * ey + zz * ez);
  o[15] = 1;
  return o;
}

export function invert(o: Mat4, m: Mat4): Mat4 | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

/** Model matrix: translation * rotY(yaw) * rotX(pitch) * rotZ(roll) * scale */
export function trs(o: Mat4, tx: number, ty: number, tz: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): Mat4 {
  const cy = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry * Rx * Rz
  const r00 = cy * cr + sy_ * sp * sr, r01 = -cy * sr + sy_ * sp * cr, r02 = sy_ * cp;
  const r10 = cp * sr, r11 = cp * cr, r12 = -sp;
  const r20 = -sy_ * cr + cy * sp * sr, r21 = sy_ * sr + cy * sp * cr, r22 = cy * cp;
  o[0] = r00 * sx; o[1] = r10 * sx; o[2] = r20 * sx; o[3] = 0;
  o[4] = r01 * sy; o[5] = r11 * sy; o[6] = r21 * sy; o[7] = 0;
  o[8] = r02 * sz; o[9] = r12 * sz; o[10] = r22 * sz; o[11] = 0;
  o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
  return o;
}

/** o = a * trs(...) (child transform) */
export function child(o: Mat4, parent: Mat4, tx: number, ty: number, tz: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): Mat4 {
  const local = trs(new Float32Array(16), tx, ty, tz, yaw, pitch, roll, sx, sy, sz);
  return multiply(o, parent, local);
}
