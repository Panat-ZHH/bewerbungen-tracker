/**
 * Minimal QR code encoder (byte mode, error correction L, versions 1-6 = up to 134 bytes) so the invite link can be
 * shown as a QR code without an extra dependency and without sending the link to a third-party service.
 * Returns a square boolean matrix (true = dark module) or null if the text is too long.
 */
const VERSIONS = [
  // [data codewords, ec codewords per block, blocks, alignment centre (0 = none)]
  [19, 7, 1, 0], [34, 10, 1, 18], [55, 15, 1, 22], [80, 20, 1, 26], [108, 26, 1, 30], [136, 18, 2, 34],
] as const;

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function reedSolomon(data: number[], ecLen: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((coef, j) => { next[j] ^= coef; next[j + 1] ^= mul(coef, EXP[i]); });
    gen = next;
  }
  const rem = new Array<number>(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

function bch(value: number, poly: number, polyBits: number, shift: number) {
  let v = value << shift;
  for (let i = polyBits + shift - 1; i >= shift; i--) if ((v >> i) & 1) v ^= poly << (i - shift);
  return (value << shift) | v;
}

const maskFns: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

export function qrMatrix(text: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(text));
  const vIndex = VERSIONS.findIndex(([data]) => bytes.length + 2 <= data);
  if (vIndex < 0) return null;
  const [dataLen, ecLen, blocks, align] = VERSIONS[vIndex];
  const version = vIndex + 1;
  const size = 17 + 4 * version;

  // bit stream: mode 0100, 8-bit length, data, terminator, padding
  const bits: number[] = [];
  const push = (value: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(4, 4); push(bytes.length, 8); bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; codewords.length < dataLen; pad = pad === 0xec ? 0x11 : 0xec) codewords.push(pad);

  // split into blocks, add EC, interleave
  const per = dataLen / blocks;
  const dataBlocks = Array.from({ length: blocks }, (_, i) => codewords.slice(i * per, (i + 1) * per));
  const ecBlocks = dataBlocks.map((block) => reedSolomon(block, ecLen));
  const final: number[] = [];
  for (let i = 0; i < per; i++) dataBlocks.forEach((block) => final.push(block[i]));
  for (let i = 0; i < ecLen; i++) ecBlocks.forEach((block) => final.push(block[i]));
  const stream: number[] = [];
  final.forEach((b) => { for (let i = 7; i >= 0; i--) stream.push((b >> i) & 1); });

  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (r: number, c: number, dark: boolean) => { if (r >= 0 && c >= 0 && r < size && c < size) { modules[r][c] = dark; reserved[r][c] = true; } };

  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      set(r0 + r, c0 + c, inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  if (align) for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(align + r, align + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  set(size - 8, 8, true); // dark module
  for (let i = 0; i < 9; i++) { reserved[8][i] = true; reserved[i][8] = true; }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }

  // place data (zig-zag, right to left, skipping column 6)
  const placed: [number, number][] = [];
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const r = up ? size - 1 - i : i;
      for (const c of [col, col - 1]) if (!reserved[r][c]) placed.push([r, c]);
    }
    up = !up;
  }

  const build = (mask: number) => {
    const grid = modules.map((row) => row.slice());
    placed.forEach(([r, c], i) => { grid[r][c] = (stream[i] === 1) !== maskFns[mask](r, c); });
    const format = bch((1 << 3) | mask, 0x537, 10, 10) ^ 0x5412; // ECC level L = 01
    const fbit = (i: number) => ((format >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) grid[i][8] = fbit(i);
    grid[7][8] = fbit(6); grid[8][8] = fbit(7); grid[8][7] = fbit(8);
    for (let i = 9; i < 15; i++) grid[8][14 - i] = fbit(i);
    for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = fbit(i);
    for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = fbit(i);
    return grid;
  };

  const penalty = (g: boolean[][]) => {
    let score = 0;
    for (let a = 0; a < size; a++) for (const horizontal of [true, false]) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const same = (horizontal ? g[a][b] === g[a][b - 1] : g[b][a] === g[b - 1][a]);
        if (same) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
      }
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) score += 3;
    const dark = g.flat().filter(Boolean).length;
    return score + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  };

  let best = build(0); let bestScore = penalty(best);
  for (let m = 1; m < 8; m++) { const g = build(m); const p = penalty(g); if (p < bestScore) { best = g; bestScore = p; } }
  return best;
}
