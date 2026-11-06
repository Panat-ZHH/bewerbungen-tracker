// Tiny offline QR code generator (byte mode, error correction M, versions 1-10). Algorithm after the public-domain QR spec / Project Nayuki.
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function mul(x: number, y: number): number { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; }
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0); result[degree - 1] = 1; let root = 1;
  for (let i = 0; i < degree; i++) { for (let j = 0; j < result.length; j++) { result[j] = mul(result[j], root); if (j + 1 < result.length) result[j] ^= result[j + 1]; } root = mul(root, 2); }
  return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) { const factor = b ^ (result.shift() as number); result.push(0); divisor.forEach((c, i) => { result[i] ^= mul(c, factor); }); }
  return result;
}
function rawModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; result -= (25 * n - 10) * n - 55; if (ver >= 7) result -= 36; }
  return result;
}
function alignPositions(ver: number, size: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2; const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** Returns a square boolean matrix (true = dark) for the given text (UTF-8). Throws if the text is too long (> 213 bytes). */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= 10; ver++) {
    const capacity = Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
    const lenBits = ver < 10 ? 8 : 16;
    if (4 + lenBits + bytes.length * 8 <= capacity * 8) break;
  }
  if (ver > 10) throw new Error("QR_TOO_LONG");
  const size = ver * 4 + 17;
  const dataCap = Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  const bits: number[] = [];
  const push = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(0b0100, 4); push(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataCap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < dataCap * 8; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // ECC + interleave
  const nb = NUM_BLOCKS[ver]; const eccLen = ECC_PER_BLOCK[ver]; const raw = Math.floor(rawModules(ver) / 8);
  const numShort = nb - (raw % nb); const shortLen = Math.floor(raw / nb); const div = rsDivisor(eccLen);
  const blocks: number[][] = []; let k = 0;
  for (let i = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div); if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const all: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) all.push(b[i]); });

  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; isFn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx; const y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const pos = alignPositions(ver, size);
  pos.forEach((cx, i) => pos.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask: number) => {
    const d = (0 << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412; const bit = (i: number) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const dark = ((v >>> i) & 1) !== 0; const a = size - 11 + (i % 3); const b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); }
  }
  // data placement
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j; const upward = ((right + 1) & 2) === 0; const y = upward ? size - 1 - vert : vert;
      if (!isFn[y][x] && bi < all.length * 8) { modules[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
    }
  }
  const masks = [(x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0, (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0, (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const applyMask = (m: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && masks[m](x, y)) modules[y][x] = !modules[y][x]; };
  const penalty = () => {
    let p = 0;
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { const cur = pass ? modules[b][a] : modules[a][b]; const prev = pass ? modules[b - 1][a] : modules[a][b - 1]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = modules[y][x]; if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3; }
    const dark = modules.reduce((n, row) => n + row.filter(Boolean).length, 0); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0; let bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestPenalty) { best = m; bestPenalty = p; } applyMask(m); }
  applyMask(best); drawFormat(best);
  return modules;
}

/** SVG path data (one rect per dark module run) for the matrix with a 4-module quiet zone; viewBox is `0 0 size+8 size+8`. */
export function qrPath(matrix: boolean[][]): { path: string; size: number } {
  const parts: string[] = [];
  matrix.forEach((row, y) => { let x = 0; while (x < row.length) { if (!row[x]) { x++; continue; } let end = x; while (end < row.length && row[end]) end++; parts.push(`M${x + 4} ${y + 4}h${end - x}v1h-${end - x}z`); x = end; } });
  return { path: parts.join(""), size: matrix.length + 8 };
}
