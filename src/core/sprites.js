// Pixel-Art Sprite & Tile Atlas System for AFTERGROUND
// Pre-renders terrain tiles into an offscreen Canvas atlas for 60 FPS chunk rendering
// and renders detailed pixel-art buildings and animated citizens.

export const TILE_TYPES = {
  AIR: 0,
  TUNNEL: 1,
  GRASS: 2,
  DIRT: 3,
  SAND: 4,
  STONE: 5,
  HARD_ROCK: 6,
  ORE_METAL: 7,
  ORE_FUEL: 8,
  ORE_RARE: 9,
  WATER: 10,
  CAVE: 11,
  RUIN: 12,
  VEGETATION: 13,
  CONTAMINATED: 14,
  BEDROCK: 15
};

export const TILE_PALETTE = {
  [TILE_TYPES.AIR]: null,
  [TILE_TYPES.TUNNEL]: { base: '#181414', accent: '#262020', border: '#332926' },
  [TILE_TYPES.GRASS]: { base: '#3d2817', top: '#22c55e', topAlt: '#15803d', accent: '#52361f' },
  [TILE_TYPES.DIRT]: { base: '#5c3a21', accent: '#472c18', speck: '#734a2b' },
  [TILE_TYPES.SAND]: { base: '#b48a4e', accent: '#96703b', speck: '#cda468' },
  [TILE_TYPES.STONE]: { base: '#475569', accent: '#334155', speck: '#64748b' },
  [TILE_TYPES.HARD_ROCK]: { base: '#1e293b', accent: '#0f172a', speck: '#334155' },
  [TILE_TYPES.ORE_METAL]: { base: '#475569', accent: '#334155', speck: '#f59e0b', glow: '#fbbf24' },
  [TILE_TYPES.ORE_FUEL]: { base: '#292524', accent: '#1c1917', speck: '#f97316', glow: '#fb923c' },
  [TILE_TYPES.ORE_RARE]: { base: '#1e1b4b', accent: '#312e81', speck: '#38bdf8', glow: '#a855f7' },
  [TILE_TYPES.WATER]: { base: '#0284c7', accent: '#0369a1', speck: '#38bdf8' },
  [TILE_TYPES.CAVE]: { base: '#11131a', accent: '#1b1f2a', speck: '#242938' },
  [TILE_TYPES.RUIN]: { base: '#334155', accent: '#1e293b', speck: '#2dd4bf', glow: '#f59e0b' },
  [TILE_TYPES.VEGETATION]: { base: '#15803d', accent: '#166534', speck: '#4ade80' },
  [TILE_TYPES.CONTAMINATED]: { base: '#365314', accent: '#1a2e05', speck: '#a3e635', glow: '#84cc16' },
  [TILE_TYPES.BEDROCK]: { base: '#090d16', accent: '#020617', speck: '#1e293b' }
};

class SpriteAtlas {
  constructor(tileSize = 24) {
    this.tileSize = tileSize;
    this.variants = 4;
    this.atlasCanvas = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized || typeof document === 'undefined') return;
    const totalTypes = 16;
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = totalTypes * this.tileSize;
    this.atlasCanvas.height = this.variants * this.tileSize;
    const ctx = this.atlasCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let type = 1; type < totalTypes; type++) {
      for (let v = 0; v < this.variants; v++) {
        this.bakeTile(ctx, type, v, type * this.tileSize, v * this.tileSize);
      }
    }
    this.initialized = true;
  }

  bakeTile(ctx, type, variant, ox, oy) {
    const s = this.tileSize;
    const pal = TILE_PALETTE[type];
    if (!pal) return;

    if (type === TILE_TYPES.VEGETATION) {
      // Surface tree / mutant flora pixel art
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(ox + 10, oy + 11, 4, 13);
      ctx.fillStyle = pal.base;
      ctx.fillRect(ox + 4, oy + 4, 16, 9);
      ctx.fillStyle = pal.speck;
      ctx.fillRect(ox + 6, oy + 2, 12, 5);
      ctx.fillRect(ox + 5 + (variant % 3), oy + 6, 3, 3);
      return;
    }

    // Fill base block
    ctx.fillStyle = pal.base;
    ctx.fillRect(ox, oy, s, s);

    if (type === TILE_TYPES.TUNNEL || type === TILE_TYPES.CAVE) {
      // Subtle brick/rock background texture + support beam lines
      ctx.fillStyle = pal.accent;
      ctx.fillRect(ox + 2, oy + 4, s - 4, 2);
      ctx.fillRect(ox + 4, oy + 14, s - 8, 2);
      if (type === TILE_TYPES.TUNNEL) {
        ctx.fillStyle = '#3e2c1c';
        ctx.fillRect(ox, oy, s, 2);
      }
      return;
    }

    if (type === TILE_TYPES.GRASS) {
      ctx.fillStyle = pal.accent;
      ctx.fillRect(ox + 3, oy + 10, 4, 4);
      ctx.fillRect(ox + 14, oy + 15, 5, 4);
      ctx.fillStyle = pal.top;
      ctx.fillRect(ox, oy, s, 5);
      ctx.fillStyle = pal.topAlt;
      for (let i = 0; i < s; i += 4) {
        const h = 4 + ((i + variant * 3) % 4);
        ctx.fillRect(ox + i, oy + 3, 2, h);
      }
      return;
    }

    if (type === TILE_TYPES.WATER) {
      ctx.fillStyle = pal.accent;
      ctx.fillRect(ox, oy + 8, s, s - 8);
      ctx.fillStyle = pal.speck;
      ctx.fillRect(ox + 2 + variant * 2, oy + 3, 8, 2);
      ctx.fillRect(ox + 10 - variant, oy + 12, 7, 2);
      return;
    }

    // Textured pixel speckles for solid blocks
    const step = 3;
    for (let py = 0; py < s; py += step) {
      for (let px = 0; px < s; px += step) {
        const hash = ((px * 19 + py * 37 + variant * 53 + type * 11) & 0xff);
        if (hash < 48) {
          ctx.fillStyle = pal.accent;
          ctx.fillRect(ox + px, oy + py, step, step);
        } else if (hash > 215 && pal.speck) {
          ctx.fillStyle = pal.speck;
          ctx.fillRect(ox + px, oy + py, step, step);
        }
      }
    }

    // Ore veins & ruins special details
    if (pal.glow) {
      ctx.fillStyle = pal.glow;
      ctx.fillRect(ox + 5 + variant, oy + 5, 4, 4);
      ctx.fillRect(ox + 13 - variant, oy + 13, 5, 4);
      ctx.fillRect(ox + 7, oy + 16, 3, 3);
    }

    if (type === TILE_TYPES.RUIN) {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 2.5, oy + 2.5, s - 5, s - 5);
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(ox + 9, oy + 9, 6, 6);
    }

    // Subtle tile bevel
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(ox, oy + s - 2, s, 2);
    ctx.fillRect(ox + s - 2, oy, 2, s);
  }

  drawTile(ctx, type, x, y, px, py) {
    if (type === TILE_TYPES.AIR) return;
    if (this.initialized && this.atlasCanvas) {
      const variant = (x * 7 + y * 13) & 3;
      ctx.drawImage(
        this.atlasCanvas,
        type * this.tileSize,
        variant * this.tileSize,
        this.tileSize,
        this.tileSize,
        px,
        py,
        this.tileSize,
        this.tileSize
      );
    } else {
      const pal = TILE_PALETTE[type];
      if (!pal) return;
      ctx.fillStyle = pal.base;
      ctx.fillRect(px, py, this.tileSize, this.tileSize);
    }
  }

  drawBuilding(ctx, b, def, px, py, w, h, animTime, isPowered = true) {
    const active = b.completed && b.active !== false && isPowered && (def.workers === 0 || b.assignedWorkers > 0);

    // 1. Infrastructure special single-tile structures
    if (def.id === 'access_ladder') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(px + 5, py, 3, h);
      ctx.fillRect(px + w - 8, py, 3, h);
      ctx.fillStyle = '#d97706';
      for (let ry = py + 3; ry < py + h; ry += 6) {
        ctx.fillRect(px + 6, ry, w - 12, 2);
      }
      return;
    }

    if (def.id === 'structural_bridge') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(px, py, w, 6);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px, py, w, 2);
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + 3, py + 6, 3, h - 6);
      ctx.fillRect(px + w - 6, py + 6, 3, h - 6);
      return;
    }

    if (def.id === 'utility_conduit') {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(px + 8, py, w - 16, h);
      ctx.fillRect(px, py + 8, w, h - 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(px + 10, py + 2, 2, h - 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px + 2, py + 10, w - 4, 2);
      return;
    }

    if (def.id === 'elevator_shaft') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px + 2, py, w - 4, h);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 2.5, py + 0.5, w - 5, h - 1);
      const carY = py + 4 + ((Math.sin(animTime * 3 + b.x) * 0.5 + 0.5) * (h - 14));
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px + 5, carY, w - 10, 8);
      return;
    }

    // 2. Under-construction scaffolding
    if (!b.completed) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(px + 2, py + 2, w - 4, h - 4);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(px + 2, py + 2, w - 4, h - 4);
      ctx.setLineDash([]);

      // Progress bar
      const pct = Math.max(0, Math.min(1, b.buildProgress / (def.buildTime || 5)));
      ctx.fillStyle = '#090d16';
      ctx.fillRect(px + 4, py + h - 8, w - 8, 5);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px + 5, py + h - 7, (w - 10) * pct, 3);
      return;
    }

    // 3. Completed Building Chassis (Distinct pixel-art silhouettes per category)
    const accent = def.accentColor || '#f59e0b';

    // Foundation slab
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 1, py + h - 5, w - 2, 5);

    if (def.id.includes('dome')) {
      // Dome Silhouette
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(px + 3, py + h * 0.45, w - 6, h * 0.55 - 3);
      ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.28)' : 'rgba(51, 65, 85, 0.35)';
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h * 0.55, w * 0.44, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h * 0.55, w * 0.44, Math.PI, 0);
      ctx.stroke();
    } else if (def.id === 'solar_array') {
      // Angled Solar Panels
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + 6, py + h - 12, w - 12, 8);
      ctx.fillStyle = active ? '#0284c7' : '#1e293b';
      ctx.fillRect(px + 3, py + 8, w - 6, h - 20);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 3.5, py + 8.5, w - 7, h - 21);
    } else {
      // Standard Industrial / Subterranean Module
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(px + 2, py + 4, w - 4, h - 7);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 2.5, py + 4.5, w - 5, h - 8);

      // Roof Accent Bar
      ctx.fillStyle = accent;
      ctx.fillRect(px + 2, py + 4, w - 4, 4);
    }

    // Category-specific pixel art details & animations
    if (def.category === 'agriculture') {
      // Growing crops inside
      const cropGrowth = active ? ((Math.sin(animTime * 2 + b.id) * 0.5 + 0.5) * 5 + 5) : 4;
      ctx.fillStyle = '#14532d';
      ctx.fillRect(px + 6, py + h - 10, w - 12, 4);
      ctx.fillStyle = active ? '#4ade80' : '#65a30d';
      for (let cx = px + 8; cx < px + w - 10; cx += 7) {
        ctx.fillRect(cx, py + h - 10 - cropGrowth, 4, cropGrowth);
      }
    } else if (def.category === 'energy' || def.category === 'industry') {
      // Rotating turbine / furnace glow
      const glowColor = active ? accent : '#334155';
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 7, py + 14, 10, h - 22);
      if (active) {
        const pulse = Math.floor(animTime * 6) % 2 === 0;
        ctx.fillStyle = pulse ? '#fde047' : '#f97316';
        ctx.fillRect(px + 9, py + 16, 6, h - 26);
        // Smoke / steam pixels
        const smokeOffset = Math.floor((animTime * 14) % 10);
        ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.fillRect(px + w - 14, py + 2 - smokeOffset, 5, 4);
      }
    } else {
      // Illuminated windows
      const winColor = active ? (def.category === 'research' ? '#c084fc' : '#fbbf24') : '#0f172a';
      ctx.fillStyle = winColor;
      for (let wx = px + 7; wx < px + w - 11; wx += 11) {
        ctx.fillRect(wx, py + 13, 6, 7);
        if (h > 48) {
          ctx.fillRect(wx, py + 26, 6, 7);
        }
      }
    }

    // Level stars badge
    if (b.level > 1) {
      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < b.level; i++) {
        ctx.fillRect(px + 5 + i * 5, py + 1, 3, 3);
      }
    }

    // Warning badge if unpowered or paused
    if (b.active === false || !isPowered) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
      ctx.fillRect(px + w - 12, py + 6, 8, 8);
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + w - 9, py + 8, 2, 4);
    }
  }

  drawCitizen(ctx, c, tileSize, animTime, isSelected = false) {
    const px = c.x * tileSize;
    const py = c.y * tileSize;
    const bob = c.state === 'walking' ? Math.sin(animTime * 12 + c.id) * 1.6 : 0;

    const suitColors = {
      worker: '#60a5fa',
      builder: '#f59e0b',
      miner: '#fb923c',
      farmer: '#4ade80',
      engineer: '#38bdf8',
      scientist: '#c084fc',
      medic: '#f43f5e',
      guard: '#ef4444'
    };

    const suit = suitColors[c.profession] || '#60a5fa';

    if (isSelected) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 4);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px + 7, py + tileSize - 3, 10, 2);

    // Legs (animated step)
    const step = c.state === 'walking' ? Math.round(Math.sin(animTime * 14 + c.id) * 2) : 0;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 8, py + 17 + step, 3, 5);
    ctx.fillRect(px + 13, py + 17 - step, 3, 5);

    // Torso / Suit
    ctx.fillStyle = suit;
    ctx.fillRect(px + 7, py + 11 + bob, 10, 7);

    // Head + Helmet
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(px + 8, py + 6 + bob, 8, 5);
    ctx.fillStyle = suit;
    ctx.fillRect(px + 7, py + 4 + bob, 10, 3);

    // Work / Excavate tool spark
    if (c.state === 'excavating' || c.state === 'building' || c.state === 'working') {
      if (Math.floor(animTime * 8 + c.id) % 2 === 0) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(px + 17, py + 11, 3, 3);
      }
    }
  }
}

export const spriteAtlas = new SpriteAtlas(24);
