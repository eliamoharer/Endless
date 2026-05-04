import type { ClumpParticle, Enemy, Food, GameState, Vec2, Viewport } from "../game/types";

const serifStack = '"Bodoni 72", Didot, "Bodoni MT", "Times New Roman", serif';
const massFontSize = 52;

type GridInfluence = {
  screen: Vec2;
  radius: number;
  weight: number;
};

type GridNode = {
  base: Vec2;
  bent: Vec2;
  tension: number;
};

const VIGNETTE_WARMUP_FRAMES = 56;
/** Frames longer than this (ms) count toward disabling the vignette on weak devices. */
const VIGNETTE_SLOW_FRAME_MS = 48;
/** Recover the streak when the device is comfortably keeping pace. */
const VIGNETTE_FAST_FRAME_MS = 22;
const VIGNETTE_SLOW_STREAK_DISABLE = 10;

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly prefersReducedMotion: MediaQueryList;
  private vignetteLayer: HTMLCanvasElement | null = null;
  /** Cached radial fill; rebuilt on resize only (cheap each frame: one drawImage). */
  private vignetteDrawEnabled = true;
  private vignettePerfStreak = 0;
  private vignetteWarmupFrames = VIGNETTE_WARMUP_FRAMES;
  private lastRenderTimestamp = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context is not available.");
    }

    this.context = context;
    this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (this.prefersReducedMotion.matches) {
      this.vignetteDrawEnabled = false;
    }
  }

  resize(): Viewport {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = Math.floor(width * pixelRatio);
    this.canvas.height = Math.floor(height * pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const viewport: Viewport = { width, height, pixelRatio };

    if (!this.prefersReducedMotion.matches) {
      this.vignetteDrawEnabled = true;
      this.vignettePerfStreak = 0;
      this.vignetteWarmupFrames = VIGNETTE_WARMUP_FRAMES;
      this.lastRenderTimestamp = 0;
      this.rebuildVignetteLayer(viewport);
    } else {
      this.vignetteDrawEnabled = false;
      this.vignetteLayer = null;
    }

    return viewport;
  }

  render(state: GameState, viewport: Viewport): void {
    this.updateVignetteFromFrameTiming();

    const ctx = this.context;
    const influences = this.collectGridInfluences(state, viewport);

    ctx.clearRect(0, 0, viewport.width, viewport.height);
    this.drawWorldPlane(ctx, state, viewport, influences);
    this.drawShockwaves(ctx, state, viewport);

    for (const food of state.foods) {
      this.drawFood(ctx, food, state, viewport);
    }

    for (const enemy of state.enemies) {
      this.drawEnemy(ctx, enemy, state, viewport);
    }

    this.drawPlayerMass(ctx, state, viewport);
  }

  private updateVignetteFromFrameTiming(): void {
    const now = performance.now();

    if (this.vignetteDrawEnabled && !this.prefersReducedMotion.matches) {
      if (this.lastRenderTimestamp > 0) {
        const frameMs = now - this.lastRenderTimestamp;

        if (this.vignetteWarmupFrames > 0) {
          this.vignetteWarmupFrames -= 1;
        } else if (frameMs > VIGNETTE_SLOW_FRAME_MS) {
          this.vignettePerfStreak += frameMs > VIGNETTE_SLOW_FRAME_MS * 1.35 ? 2 : 1;
        } else if (frameMs < VIGNETTE_FAST_FRAME_MS) {
          this.vignettePerfStreak = Math.max(0, this.vignettePerfStreak - 3);
        }

        if (this.vignettePerfStreak >= VIGNETTE_SLOW_STREAK_DISABLE) {
          this.vignetteDrawEnabled = false;
          this.vignetteLayer = null;
        }
      }
    }

    this.lastRenderTimestamp = now;
  }

  private rebuildVignetteLayer(viewport: Viewport): void {
    const w = viewport.width;
    const h = viewport.height;

    if (w <= 0 || h <= 0) {
      this.vignetteLayer = null;
      return;
    }

    let layer = this.vignetteLayer;

    if (!layer || layer.width !== w || layer.height !== h) {
      layer = document.createElement("canvas");
      layer.width = w;
      layer.height = h;
      this.vignetteLayer = layer;
    }

    const vctx = layer.getContext("2d");

    if (!vctx) {
      this.vignetteLayer = null;
      return;
    }

    const gradient = vctx.createRadialGradient(
      w * 0.5,
      h * 0.54,
      0,
      w * 0.5,
      h * 0.54,
      Math.max(w, h) * 0.86,
    );
    gradient.addColorStop(0, "rgba(216, 230, 229, 0.035)");
    gradient.addColorStop(0.62, "rgba(216, 230, 229, 0.016)");
    gradient.addColorStop(1, "rgba(216, 230, 229, 0)");
    vctx.fillStyle = gradient;
    vctx.fillRect(0, 0, w, h);
  }

  private worldToScreen(position: Vec2, state: GameState, viewport: Viewport): Vec2 {
    const dx = position.x - state.camera.x;
    const dy = position.y - state.camera.y;

    return {
      x: viewport.width / 2 + dx + dy * 0.28,
      y: viewport.height * 0.55 + dy * 0.54,
    };
  }

  private drawWorldPlane(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    viewport: Viewport,
    influences: GridInfluence[],
  ): void {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    if (this.vignetteDrawEnabled && this.vignetteLayer) {
      ctx.drawImage(this.vignetteLayer, 0, 0, viewport.width, viewport.height);
    }

    const spacing = 66;
    const worldLeft = state.camera.x - viewport.width * 1.2;
    const worldRight = state.camera.x + viewport.width * 1.2;
    const worldTop = state.camera.y - viewport.height * 1.75;
    const worldBottom = state.camera.y + viewport.height * 1.85;
    const firstX = Math.floor(worldLeft / spacing) * spacing;
    const firstY = Math.floor(worldTop / spacing) * spacing;
    const columns = Math.ceil((worldRight - firstX) / spacing) + 1;
    const rows = Math.ceil((worldBottom - firstY) / spacing) + 1;
    const nodes: GridNode[][] = [];

    for (let row = 0; row < rows; row += 1) {
      const nodeRow: GridNode[] = [];

      for (let column = 0; column < columns; column += 1) {
        const world = {
          x: firstX + column * spacing,
          y: firstY + row * spacing,
        };
        const base = this.worldToScreen(world, state, viewport);
        const bent = this.applyGridBend(base, influences);

        nodeRow.push({
          base,
          bent,
          tension: Math.hypot(bent.x - base.x, bent.y - base.y),
        });
      }

      nodes.push(nodeRow);
    }

    ctx.save();
    ctx.lineWidth = 1;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const node = nodes[row][column];

        if (column > 0) {
          this.drawTensionLine(ctx, nodes[row][column - 1], node);
        }

        if (row > 0) {
          this.drawTensionLine(ctx, nodes[row - 1][column], node);
        }
      }
    }

    for (const row of nodes) {
      for (const node of row) {
        const alpha = Math.min(0.08 + node.tension / 180, 0.34);

        ctx.fillStyle = `rgba(216, 230, 229, ${alpha})`;
        ctx.beginPath();
        ctx.arc(node.bent.x, node.bent.y, 1.15 + Math.min(node.tension / 60, 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawTensionLine(ctx: CanvasRenderingContext2D, a: GridNode, b: GridNode): void {
    const alpha = Math.min((a.tension + b.tension) / 112, 0.28);

    if (alpha < 0.012) {
      return;
    }

    ctx.strokeStyle = `rgba(216, 230, 229, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.bent.x, a.bent.y);
    ctx.lineTo(b.bent.x, b.bent.y);
    ctx.stroke();
  }

  private applyGridBend(screen: Vec2, influences: GridInfluence[]): Vec2 {
    let x = screen.x;
    let y = screen.y;

    for (const influence of influences) {
      const dx = screen.x - influence.screen.x;
      const dy = screen.y - influence.screen.y;
      const falloff = Math.exp(-(dx * dx + dy * dy) / (influence.radius * influence.radius));

      y += influence.weight * falloff;
      x += dx * falloff * 0.018;
    }

    return { x, y };
  }

  private collectGridInfluences(state: GameState, viewport: Viewport): GridInfluence[] {
    const playerScreen = this.worldToScreen(state.player.position, state, viewport);
    const totalMass = state.player.clump.reduce((mass, particle) => mass + particle.value, 0);
    const maxSpread = state.player.clump.reduce(
      (spread, particle) => Math.max(spread, Math.hypot(particle.localPosition.x, particle.localPosition.y)),
      0,
    );
    const normalizedMass = Math.max(0, Math.min(totalMass / 100, 1));
    const playerWeight = normalizedMass * 34;
    const playerRadius = 68 + maxSpread * 0.28 + normalizedMass * 110;

    return [
      {
        screen: playerScreen,
        radius: playerRadius,
        weight: playerWeight,
      },
    ];
  }

  private drawShockwaves(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    viewport: Viewport,
  ): void {
    for (const shockwave of state.shockwaves) {
      const progress = Math.min(shockwave.age / shockwave.duration, 1);
      const screen = this.worldToScreen(shockwave.origin, state, viewport);
      const radius = shockwave.maxRadius * easeOutCubic(progress);
      const alpha = (1 - progress) * 0.44;

      ctx.save();
      ctx.strokeStyle = `rgba(224, 222, 214, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y + radius * 0.08, radius, radius * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawFood(
    ctx: CanvasRenderingContext2D,
    food: Food,
    state: GameState,
    viewport: Viewport,
  ): void {
    const screen = this.worldToScreen(food.position, state, viewport);
    const label = String(food.value);

    drawSlenderText(ctx, label, screen, sizeForValue(food.value), colorForValue(food.value));
  }

  private drawEnemy(
    ctx: CanvasRenderingContext2D,
    enemy: Enemy,
    state: GameState,
    viewport: Viewport,
  ): void {
    const screen = this.worldToScreen(enemy.position, state, viewport);
    const label = `-${enemy.value}`;
    const size = sizeForValue(enemy.value);
    const progress =
      enemy.mode === "chase" ? Math.max(enemy.interestRemaining / enemy.interestDuration, 0) : 1;

    drawSlenderText(ctx, label, screen, size, colorForValue(enemy.value));
    drawTracingOutline(
      ctx,
      label,
      screen,
      size,
      state.time * 22 + enemy.phase * 12,
    );

    ctx.save();
    ctx.translate(screen.x, screen.y - size * 0.86);
    ctx.fillStyle = "rgba(216, 230, 229, 0.12)";
    ctx.fillRect(-24, 0, 48, 2);

    if (enemy.mode === "chase") {
      ctx.fillStyle = "#8C001A";
      ctx.fillRect(-24, 0, 48 * progress, 2);
    }

    ctx.restore();
  }

  private drawPlayerMass(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    viewport: Viewport,
  ): void {
    const glyphs = this.getPlayerGlyphs(state, viewport);

    if (glyphs.length === 0) {
      drawSlenderText(ctx, "0", this.worldToScreen(state.player.position, state, viewport), 34, "#d8e6e5");
      return;
    }

    for (const glyph of glyphs) {
      drawSlenderText(
        ctx,
        glyph.label,
        glyph.screen,
        sizeForValue(glyph.value),
        colorForValue(glyph.value),
        glyph.rotation,
      );
    }
  }

  private getPlayerGlyphs(state: GameState, viewport: Viewport): Array<{
    label: string;
    value: number;
    screen: Vec2;
    rotation: number;
  }> {
    const glyphs = [];

    for (const particle of state.player.clump) {
      glyphs.push(this.clumpParticleToGlyph(particle, state, viewport));
    }

    glyphs.sort((a, b) => a.screen.y - b.screen.y);
    return glyphs;
  }

  private clumpParticleToGlyph(
    particle: ClumpParticle,
    state: GameState,
    viewport: Viewport,
  ): {
    label: string;
    value: number;
    screen: Vec2;
    rotation: number;
  } {
    const worldPosition = {
      x: state.player.position.x + particle.localPosition.x,
      y: state.player.position.y + particle.localPosition.y,
    };
    const wobble = Math.sin(state.time * 1.45 + particle.angleSeed) * 0.018;

    return {
      label: String(particle.value),
      value: particle.value,
      screen: this.worldToScreen(worldPosition, state, viewport),
      rotation: wobble,
    };
  }
}

function drawSlenderText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Vec2,
  size: number,
  fill: string,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(rotation);
  ctx.scale(0.68, 1.22);
  ctx.font = `400 ${size}px ${serifStack}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawTracingOutline(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Vec2,
  size: number,
  phase: number,
): void {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.scale(0.68, 1.22);
  ctx.font = `400 ${size}px ${serifStack}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(216, 230, 229, 0.16)";
  ctx.lineWidth = 0.95;
  ctx.strokeText(text, 0, 0);

  // The base stroke keeps the whole perimeter visible; these offset strokes create
  // a traveling brightness wave without leaving gaps in the outline.
  const waveCount = 5;

  for (let i = 0; i < waveCount; i += 1) {
    const brightness = (Math.sin(phase * 0.08 + i * 1.18) + 1) * 0.5;

    ctx.strokeStyle = `rgba(216, 230, 229, ${0.025 + brightness * 0.12})`;
    ctx.lineWidth = 0.72 + brightness * 0.35;
    ctx.setLineDash([10, 44]);
    ctx.lineDashOffset = -(phase + i * 17);
    ctx.strokeText(text, 0, 0);
  }

  ctx.restore();
}

function colorForValue(value: number): string {
  const clamped = Math.max(0, Math.min((value - 1) / 9, 1));
  const start = { r: 16, g: 56, b: 148 };
  const end = { r: 140, g: 0, b: 26 };
  const r = Math.round(start.r + (end.r - start.r) * clamped);
  const g = Math.round(start.g + (end.g - start.g) * clamped);
  const b = Math.round(start.b + (end.b - start.b) * clamped);

  return `rgb(${r}, ${g}, ${b})`;
}

function sizeForValue(value: number): number {
  return massFontSize + (value - 1) * 5;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
