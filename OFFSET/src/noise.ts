/**
 * Small deterministic noise toolkit shared by the terrain heights, the
 * ground texture and the grass scatter, so every part of the landscape
 * draws from the same family of shapes. Same technique as the sky shader
 * (layered value noise), just on the CPU.
 */

/** 2D integer hash → [0, 1). Deterministic across runs. */
export const hash2 = (x: number, y: number, seed = 0): number => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

/** 2D value noise in world space (non-tiling). Returns [0, 1]. */
export const valueNoise2 = (x: number, y: number, seed = 0): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed);
    const b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed);
    const d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** Fractal (layered) value noise, rotated and doubled per octave. [0, 1]. */
export const fbm2 = (x: number, y: number, octaves = 4, seed = 0): number => {
    let value = 0;
    let amplitude = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * valueNoise2(x, y, seed + i * 101);
        total += amplitude;
        amplitude *= 0.5;
        const nx = (0.8 * x - 0.6 * y) * 2.03;
        const ny = (0.6 * x + 0.8 * y) * 2.03;
        x = nx;
        y = ny;
    }
    return value / total;
};

/** Value noise whose lattice wraps at `period` — building block for
 *  seamlessly tileable textures. */
const tileNoise = (x: number, y: number, period: number, seed: number): number => {
    const wrap = (n: number): number => ((n % period) + period) % period;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x0 = wrap(ix);
    const x1 = wrap(ix + 1);
    const y0 = wrap(iy);
    const y1 = wrap(iy + 1);
    const a = hash2(x0, y0, seed);
    const b = hash2(x1, y0, seed);
    const c = hash2(x0, y1, seed);
    const d = hash2(x1, y1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** Tileable fractal noise over the unit square: u, v in [0, 1). Each octave
 *  doubles the (integer) frequency so the pattern repeats with no seams. */
export const fbmTile = (u: number, v: number, basePeriod: number, octaves: number, seed: number): number => {
    let value = 0;
    let amplitude = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
        const period = basePeriod * (1 << o);
        value += amplitude * tileNoise(u * period, v * period, period, seed + o * 131);
        total += amplitude;
        amplitude *= 0.5;
    }
    return value / total;
};

/** Tiny seeded PRNG (mulberry32) → floats in [0, 1). */
export const mulberry32 = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};
