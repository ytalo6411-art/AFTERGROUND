import { TILE_TYPES } from '../core/sprites.js';

export function hashSeed(seedStr) {
  const str = String(seedStr || 'AFTERGROUND-2241');
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function createPRNG(seedStr) {
  const seedFn = hashSeed(seedStr);
  let a = seedFn();
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoise2D(seedStr) {
  const rand = createPRNG(seedStr + '_noise');
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (hash, x, y) => {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
  };

  return (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return (lerp(x1, x2, v) + 1.5) / 3.0; // Normalized ~0..1
  };
}

export function generateProceduralWorld({ width = 200, height = 100, seed = 'AEGIS-2241' } = {}) {
  const tiles = new Uint8Array(width * height);
  const surfaceHeights = new Uint8Array(width);
  const rand = createPRNG(seed);
  const noiseA = createNoise2D(seed + '_A');
  const noiseB = createNoise2D(seed + '_B');
  const noiseC = createNoise2D(seed + '_C');

  const centerX = Math.floor(width / 2);
  const baseSurfaceY = 22;

  // 1. Compute surface elevation profile (mountains, valleys, flat central colony plateau)
  for (let x = 0; x < width; x++) {
    const distFromCenter = Math.abs(x - centerX);
    const n1 = (noiseA(x * 0.035, 1.5) - 0.5) * 10;
    const n2 = (noiseB(x * 0.09, 4.2) - 0.5) * 4;
    let h = Math.round(baseSurfaceY + n1 + n2);
    if (distFromCenter <= 12) {
      // Smooth plateau around starting bunker
      const blend = Math.max(0, (distFromCenter - 7) / 5);
      h = Math.round(baseSurfaceY * (1 - blend) + h * blend);
    }
    h = Math.max(14, Math.min(29, h));
    surfaceHeights[x] = h;
  }

  // 2. Populate vertical layers
  for (let x = 0; x < width; x++) {
    const surfY = surfaceHeights[x];
    const distFromCenter = Math.abs(x - centerX);

    for (let y = 0; y < height; y++) {
      const idx = y * width + x;

      if (y === height - 1) {
        tiles[idx] = TILE_TYPES.BEDROCK;
        continue;
      }

      if (y < surfY) {
        // Surface lake in low valleys away from spawn
        if (surfY >= 26 && y >= 25 && distFromCenter > 16) {
          tiles[idx] = TILE_TYPES.WATER;
        } else if (y === surfY - 1 && surfY < 26 && distFromCenter > 7 && rand() < 0.24) {
          tiles[idx] = TILE_TYPES.VEGETATION;
        } else {
          tiles[idx] = TILE_TYPES.AIR;
        }
        continue;
      }

      if (y === surfY) {
        tiles[idx] = surfY >= 26 && distFromCenter > 16 ? TILE_TYPES.SAND : TILE_TYPES.GRASS;
        continue;
      }

      const depth = y - surfY;
      const caveVal = noiseA(x * 0.085, y * 0.095) * 0.65 + noiseB(x * 0.17, y * 0.17) * 0.35;
      const oreVal = noiseC(x * 0.14, y * 0.14);

      // Shallow Subsoil (depth 1..24)
      if (y <= 48) {
        if (depth > 4 && distFromCenter > 8 && caveVal > 0.72) {
          tiles[idx] = TILE_TYPES.CAVE;
        } else if (oreVal > 0.74 && depth > 3) {
          tiles[idx] = TILE_TYPES.ORE_METAL;
        } else if (oreVal < 0.24 && depth > 5) {
          tiles[idx] = TILE_TYPES.SAND;
        } else if (depth > 10 && noiseB(x * 0.11, y * 0.11) > 0.56) {
          tiles[idx] = TILE_TYPES.STONE;
        } else {
          tiles[idx] = TILE_TYPES.DIRT;
        }
        continue;
      }

      // Mid Subsoil (y: 49..74)
      if (y <= 74) {
        if (caveVal > 0.71) {
          // Occasional underground aquifer or ruin inside mid caverns
          if (oreVal < 0.27) {
            tiles[idx] = TILE_TYPES.WATER;
          } else {
            tiles[idx] = TILE_TYPES.CAVE;
          }
        } else if (oreVal > 0.76) {
          tiles[idx] = TILE_TYPES.ORE_FUEL;
        } else if (oreVal < 0.24) {
          tiles[idx] = TILE_TYPES.ORE_METAL;
        } else if (noiseB(x * 0.18, y * 0.18) > 0.79) {
          tiles[idx] = TILE_TYPES.RUIN;
        } else {
          tiles[idx] = TILE_TYPES.STONE;
        }
        continue;
      }

      // Deep Subsoil (y: 75..98)
      if (caveVal > 0.72) {
        tiles[idx] = TILE_TYPES.CAVE;
      } else if (oreVal > 0.75) {
        tiles[idx] = TILE_TYPES.ORE_RARE;
      } else if (oreVal < 0.23) {
        tiles[idx] = TILE_TYPES.CONTAMINATED;
      } else if (noiseB(x * 0.16, y * 0.16) > 0.77) {
        tiles[idx] = TILE_TYPES.RUIN;
      } else if (noiseA(x * 0.12, y * 0.12) > 0.66) {
        tiles[idx] = TILE_TYPES.ORE_METAL;
      } else {
        tiles[idx] = TILE_TYPES.HARD_ROCK;
      }
    }
  }

  // 3. Carve initial underground starter gallery directly under spawn (y = baseSurfaceY + 4..5)
  const galleryY = baseSurfaceY + 4;
  for (let gx = centerX - 8; gx <= centerX + 8; gx++) {
    tiles[(galleryY - 1) * width + gx] = TILE_TYPES.TUNNEL;
    tiles[galleryY * width + gx] = TILE_TYPES.TUNNEL;
    tiles[(galleryY + 1) * width + (gx < centerX - 6 ? gx : centerX)] = TILE_TYPES.STONE;
    tiles[(galleryY + 1) * width + gx] = TILE_TYPES.STONE;
  }

  // Vertical shaft connecting surface (baseSurfaceY - 1) to underground gallery (galleryY)
  for (let sy = baseSurfaceY; sy <= galleryY; sy++) {
    tiles[sy * width + (centerX - 3)] = TILE_TYPES.TUNNEL;
  }

  // Place a guaranteed discoverable Ruin near the starter underground gallery for early exploration
  tiles[galleryY * width + (centerX + 11)] = TILE_TYPES.RUIN;
  tiles[(galleryY - 1) * width + (centerX + 11)] = TILE_TYPES.RUIN;
  tiles[galleryY * width + (centerX - 11)] = TILE_TYPES.ORE_METAL;
  tiles[(galleryY - 1) * width + (centerX - 11)] = TILE_TYPES.ORE_FUEL;

  return {
    width,
    height,
    seed,
    surfaceHeights,
    centerX,
    baseSurfaceY,
    galleryY,
    tiles
  };
}
