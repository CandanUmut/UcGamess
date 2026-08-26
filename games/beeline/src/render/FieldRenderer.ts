import type Phaser from 'phaser';
import { COLORS, TUNING } from '../config/tuning.ts';
import type { Field } from '../sim/Field.ts';
import type { Patch } from '../sim/Patch.ts';
import {
  WORLD_HEIGHT as PLAYFIELD_HEIGHT,
  WORLD_WIDTH as PLAYFIELD_WIDTH,
} from '../sim/Field.ts';
import { FLOWER_TEX, TEX } from './textures.ts';

// Nunito first, system stack behind it — the same fallback chain the rest of
// the game uses, because the subset is small and a missing glyph (the trend
// arrows here) has to be drawn by the next family along.
const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Overrides for the two flowers that are not ordinary.
 *
 * A rich flower and a night bloom have to be identifiable *as* those before
 * anything else about them is read, so they keep a fixed colour rather than
 * drawing from the species palette. Ordinary flowers get a species.
 */
/**
 * How much taller the wall drawing is than the wall it depicts.
 *
 * Measured off the art, not chosen: the solid body is 45 of its 87 pixels.
 */
const WALL_ART_RATIO = 87 / 45;
/**
 * How far the drawn body sits off the centre of its own image, as a fraction
 * of the image height. Also measured — 6.5 of 87.
 */
const WALL_ART_OFFSET = 6.5 / 87;

const KIND_TINT: Record<string, number> = {
  normal: COLORS.patch,
  rich: 0xffb454,
  night: 0xb98cff,
};

/** Draws the hive, the flower patches and the wasps. */
export class FieldRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly hiveGlow: Phaser.GameObjects.Image;
  private readonly waspGfx: Phaser.GameObjects.Graphics;
  /**
   * The maze gets its own layer beneath the routes.
   *
   * A route drawn *over* a hedge would look like it passes through, which is
   * exactly the thing that cannot be true. Under the route layer, a line that
   * ends at a wall reads as stopped by it.
   */
  private readonly wallGfx: Phaser.GameObjects.Graphics;
  /**
   * The area outside the 1280x720 playfield, on devices whose canvas is a
   * different shape.
   *
   * Painted a shade off the field with a hairline at the boundary, so the edge
   * of the board is legible rather than the field appearing to run off into
   * darkness. Without it the extra space reads as more unexplored ground, which
   * is exactly the wrong signal on a game about exploring.
   */
  private readonly surroundGfx: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  /** One label per patch, reused. Pollen left is a number worth reading now. */
  private labels: Phaser.GameObjects.Text[] = [];
  /**
   * One flower head per patch, reused.
   *
   * Pooled exactly like the labels rather than created per frame: patches come
   * and go through a day, and rebuilding a GameObject every time a flower
   * blooms is the kind of churn that shows up as a hitch on a phone.
   */
  private flowers: Phaser.GameObjects.Image[] = [];
  /**
   * The ground, as one tiled sprite under everything.
   *
   * A flat fill read as a menu background; real grass under the board is what
   * makes it a *field*. A TileSprite rather than a stretched image so the tile
   * keeps its own scale however large the canvas is — stretching a 512px photo
   * across 1280 would soften it into a smear, and the fine detail is the part
   * that says grass.
   *
   * Null when the file did not arrive; the camera's background colour is
   * already the same meadow green, so the board simply looks plainer.
   */
  private readonly ground: Phaser.GameObjects.TileSprite | null;
  /** The hive itself, drawn over its glow. Null if the file never arrived. */
  private readonly hiveSprite: Phaser.GameObjects.Image | null;
  /** One per wasp, reused. There are never more than a couple. */
  private wasps: Phaser.GameObjects.Image[] = [];
  private buyerLabels: Phaser.GameObjects.Text[] = [];
  private warningPhase = 0;
  /**
   * One per visible wall bar, reused.
   *
   * The maze tops out at (cols+1)*rows + cols*(rows+1) edges, so the pool has
   * a hard ceiling and settles within the first day rather than growing.
   */
  private wallBars: Phaser.GameObjects.Image[] = [];
  /** How many pooled bars are in use this frame. */
  private wallBarCount = 0;

  constructor(scene: Phaser.Scene, field: Field, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.gfx = scene.add.graphics().setDepth(depth);
    this.hiveGlow = scene.add
      .image(field.hiveX, field.hiveY, TEX.glow)
      .setDepth(depth + 1)
      .setTint(COLORS.hive)
      .setScale(1.6);
    this.ground = scene.textures.exists(TEX.meadow)
      ? scene.add
          .tileSprite(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT, TEX.meadow)
          .setOrigin(0, 0)
          .setDepth(depth - 5)
      : null;
    this.hiveSprite = scene.textures.exists(TEX.hive)
      ? scene.add
          .image(field.hiveX, field.hiveY, TEX.hive)
          .setOrigin(0.5, 0.62)
          .setDepth(depth + 2)
      : null;
    this.waspGfx = scene.add.graphics().setDepth(depth + 3);
    this.wallGfx = scene.add.graphics().setDepth(depth + 4);
    this.surroundGfx = scene.add.graphics().setDepth(depth + 60);
  }

  /**
   * Paints the surround for a canvas larger than the playfield.
   *
   * Redrawn only on layout rather than per frame — the canvas shape changes on
   * a rotate and at no other time.
   */
  setViewRect(view: Phaser.Geom.Rectangle): void {
    const g = this.surroundGfx;
    g.clear();

    const left = view.x;
    const top = view.y;
    const right = view.right;
    const bottom = view.bottom;

    // Four bands around the playfield. Drawn as bands rather than as one big
    // rectangle with a hole because Graphics has no even-odd fill, and a mask
    // would cost a render texture for something this simple.
    // A *paler* band than the field, not a darker one. On the old near-black
    // board the surround was dimmed to push it back; on a lit board the same
    // trick reads as scorched earth, and washing it out is what puts it behind
    // the playfield instead.
    g.fillStyle(COLORS.surround, 1);
    if (left < 0) g.fillRect(left, top, -left, bottom - top);
    if (right > PLAYFIELD_WIDTH) {
      g.fillRect(PLAYFIELD_WIDTH, top, right - PLAYFIELD_WIDTH, bottom - top);
    }
    if (top < 0) g.fillRect(0, top, PLAYFIELD_WIDTH, -top);
    if (bottom > PLAYFIELD_HEIGHT) {
      g.fillRect(0, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, bottom - PLAYFIELD_HEIGHT);
    }

    if (left < 0 || top < 0 || right > PLAYFIELD_WIDTH || bottom > PLAYFIELD_HEIGHT) {
      g.lineStyle(2, COLORS.hive, 0.16);
      g.strokeRect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    }
  }

  draw(field: Field, alpha: number, drawingFromHive: boolean): void {
    const g = this.gfx;
    g.clear();

    for (const patch of field.patches) {
      if (!patch.discovered) continue;
      this.drawPatch(g, patch, field.time);
    }
    this.drawFlowers(field);
    this.drawLabels(field);
    this.drawWalls(field);

    // The area a new route can start from. Brightening it while the player is
    // mid-drag is the only chrome the playfield has.
    g.lineStyle(2, COLORS.hive, drawingFromHive ? 0.5 : 0.16);
    g.strokeCircle(field.hiveX, field.hiveY, TUNING.hive.drawRadius);

    const pulse = 1 + Math.sin(field.time * 2) * 0.04;
    this.hiveGlow.setScale(1.6 * pulse);
    // The skep breathes with the same pulse as its glow, but far less of it —
    // a building that visibly inflates reads as a balloon.
    this.hiveSprite?.setScale(0.86 + (pulse - 1) * 0.35);

    this.drawBuyers(field);
    this.drawWasps(field, alpha);
  }

  /**
   * The two buyers, as coloured depots with their price over the door.
   *
   * Drawn on the board rather than only in the HUD because the choice between
   * them is half geography and half arithmetic — how far the line has to run
   * matters as much as what the number says, and the two only compare properly
   * when they are in the same place on screen.
   *
   * Never hidden by fog: they are landmarks, not discoveries. A player who
   * cannot see where to sell cannot play the loop at all.
   */
  private drawBuyers(field: Field): void {
    const g = this.gfx;

    let best = field.buyers[0];
    for (const buyer of field.buyers) if (best && buyer.price > best.price) best = buyer;

    while (this.buyerLabels.length < field.buyers.length) {
      this.buyerLabels.push(
        this.scene.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontSize: '19px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#171208',
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(this.depth + 4),
      );
    }

    field.buyers.forEach((buyer, index) => {
      const tint = buyer.tuning.tint;
      const isBest = buyer === best;

      // A ring the size of the reach, so "how close does my line have to get"
      // is a thing you can see rather than a number you have to know.
      g.fillStyle(tint, 0.12);
      g.fillCircle(buyer.x, buyer.y, TUNING.honey.reachRadius);
      g.lineStyle(isBest ? 4 : 2, tint, isBest ? 0.9 : 0.5);
      g.strokeCircle(buyer.x, buyer.y, TUNING.honey.reachRadius);

      // The depot itself: a squat building with a roof, drawn rather than
      // shipped for the same reason everything else here is.
      g.fillStyle(tint, 0.9);
      g.fillRect(buyer.x - 26, buyer.y - 12, 52, 34);
      g.fillStyle(tint, 0.6);
      g.beginPath();
      g.moveTo(buyer.x - 34, buyer.y - 12);
      g.lineTo(buyer.x, buyer.y - 34);
      g.lineTo(buyer.x + 34, buyer.y - 12);
      g.closePath();
      g.fillPath();

      const label = this.buyerLabels[index];
      const arrow = buyer.trend > 0 ? '▲' : buyer.trend < 0 ? '▼' : '';
      label
        ?.setText(`${buyer.price.toFixed(2)} ${arrow}`)
        .setPosition(buyer.x, buyer.y + 40)
        .setVisible(true);
    });
  }

  private drawPatch(g: Phaser.GameObjects.Graphics, patch: Patch, time: number): void {
    const scale = patch.bloomT;
    if (scale <= 0.01) return;

    const tint = patch.alive ? this.patchTint(patch) : COLORS.patchDry;
    const halo = patch.alive ? this.haloTint(patch) : COLORS.patchDry;
    // Richer flowers are physically bigger, so "worth the distance" is legible
    // from across the board before the number is read.
    const radius = 26 * scale * (0.85 + 0.2 * patch.yieldPerTrip);

    // The ring marks where a route has to reach. It is the target the player
    // aims at, so it stays visible rather than being decorative.
    g.lineStyle(2, halo, patch.alive ? 0.55 : 0.2);
    g.strokeCircle(patch.x, patch.y, TUNING.patch.reachRadius * scale);

    g.fillStyle(halo, 0.14);
    g.fillCircle(patch.x, patch.y, radius * 1.7);

    // The flower head itself is a sprite, placed in drawFlowers(). Only the
    // rings and washes are drawn here — they change every frame with bloom and
    // pool, where the sprite only moves and scales.

    if (patch.kind === 'rich' && patch.alive) {
      // A second ring, so "worth the distance" is visible at a glance.
      g.lineStyle(2, tint, 0.35 + 0.25 * Math.sin(time * 3));
      g.strokeCircle(patch.x, patch.y, radius * 1.35);
    }

    if (patch.kind === 'night' && patch.alive) {
      // A closing arc: the window is the whole point of a night bloom, so it
      // gets the only countdown in the game.
      const sweep = Math.PI * 2 * patch.windowFraction;
      g.lineStyle(4, tint, 0.9);
      g.beginPath();
      g.arc(patch.x, patch.y, radius * 1.5, -Math.PI / 2, -Math.PI / 2 + sweep, false);
      g.strokePath();
    }
  }

  /**
   * Remaining pollen, drawn on each flower.
   *
   * Only worth showing now that pollen actually runs out. The shrinking disc
   * conveys roughly-how-much; the number answers "is it worth redrawing to
   * this one", which is the decision the player is actually making once a
   * flower can die for the day.
   */
  /**
   * Warmer with distance.
   *
   * A far flower pays up to three times a near one, and the player should be
   * able to feel that from the colour before they read the number — the number
   * confirms the decision, it should not be what triggers it.
   */
  private patchTint(patch: Patch): number {
    return (
      KIND_TINT[patch.kind] ??
      COLORS.species[patch.species % COLORS.species.length] ??
      COLORS.patch
    );
  }

  /**
   * The halo colour, which carries what the flower is worth.
   *
   * Distance-worth used to be painted onto the flower itself, which meant hue
   * was spoken for and every flower on the board was a shade of one
   * green-to-amber ramp. Moving it out here frees the flower to have a species
   * and keeps the signal: the ring and the outer wash warm toward `COLORS.halo`
   * as the payout climbs, so a far flower still announces itself from across the
   * field without the number being read.
   */
  private haloTint(patch: Patch): number {
    if (patch.kind !== 'normal') return this.patchTint(patch);
    const t = Math.min(1, Math.max(0, (patch.distanceMultiplier - 1) / 2));
    return blend(this.patchTint(patch), COLORS.halo, t);
  }

  /**
   * Places the flower heads.
   *
   * Scale still carries the same two readings the drawn disc did — bloom-in and
   * remaining pool — so nothing about how the board is read changed when the
   * shape became a real flower. A patch that has run dry is greyed rather than
   * hidden, because the player needs to see that the flower they routed to is
   * the one that is finished.
   */
  private drawFlowers(field: Field): void {
    while (this.flowers.length < field.patches.length) {
      const flower = this.scene.add
        .image(0, 0, FLOWER_TEX[0] ?? TEX.glow)
        .setOrigin(0.5)
        .setDepth(this.depth + 1);
      this.flowers.push(flower);
    }

    for (let i = 0; i < this.flowers.length; i += 1) {
      const flower = this.flowers[i];
      const patch = field.patches[i];
      if (!flower) continue;

      if (!patch || patch.bloomT <= 0.01 || !patch.discovered) {
        flower.setVisible(false);
        continue;
      }

      const key = FLOWER_TEX[patch.species % FLOWER_TEX.length] ?? FLOWER_TEX[0];
      if (key && flower.texture.key !== key && this.scene.textures.exists(key)) {
        flower.setTexture(key);
      }

      const radius = 26 * patch.bloomT * (0.85 + 0.2 * patch.yieldPerTrip);
      const head = radius * (0.55 + 0.45 * patch.fullness);

      flower.setVisible(true);
      flower.setPosition(patch.x, patch.y);
      // The art is 96px square with a little margin, so a flower of `head`
      // radius wants a touch more than 2*head of sprite.
      flower.setDisplaySize(head * 2.4, head * 2.4);
      flower.setAlpha(patch.alive ? 1 : 0.4);
      flower.setTint(patch.alive ? 0xffffff : COLORS.patchDry);
    }
  }

  private drawLabels(field: Field): void {
    while (this.labels.length < field.patches.length) {
      const label = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: '19px',
          color: '#2f2a1c',
          stroke: '#f7f8ee',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 2);
      this.labels.push(label);
    }

    for (let i = 0; i < this.labels.length; i += 1) {
      const label = this.labels[i];
      const patch = field.patches[i];
      if (!label) continue;

      if (!patch || !patch.alive || !patch.discovered || patch.bloomT < 0.5) {
        label.setVisible(false);
        continue;
      }

      label.setVisible(true);
      // Clear of the route's tip handle, which lands near the flower's edge and
      // was clipping the number.
      label.setPosition(patch.x, patch.y - 62);
      // Honey left, not pollen left. Once flowers pay different rates by
      // distance, two reading "180" can be worth 180 and 540, and asking the
      // player to multiply two figures mid-drag is arithmetic, not a decision.
      label.setText(String(Math.ceil(patch.honeyLeft)));
      // Warns before it runs dry, so retargeting is a decision rather than a
      // surprise.
      label.setColor(patch.fullness < 0.25 ? '#ff8a65' : '#f4f4f8');
    }
  }

  /**
   * The bramble walls, drawn only where the player has been.
   *
   * A wall is drawn as a rounded bar centred on the cell edge it closes, which
   * is exactly where the collision test puts it — so a line that stops against
   * a hedge stops where the hedge looks like it is.
   *
   * Fog gates it per wall rather than per board: an unexplored corridor stays
   * black, and learning the layout by flying it is the point. A wall is shown
   * once either of the cells it divides has been seen, because a hedge you have
   * stood next to is a hedge you know about.
   */
  private drawWalls(field: Field): void {
    const g = this.wallGfx;
    g.clear();
    this.wallBarCount = 0;

    const { maze } = field;
    const thickness = TUNING.maze.wallThickness;
    const half = thickness / 2;

    const seen = (col: number, row: number): boolean =>
      maze.inside(col, row) &&
      field.fog.isDiscovered(maze.centreOf(col, row).x, maze.centreOf(col, row).y);

    // Vertical edges: the wall to the left of each cell.
    for (let row = 0; row < maze.rows; row += 1) {
      for (let col = 0; col <= maze.cols; col += 1) {
        if (!maze.wallLeft(col, row)) continue;
        if (!seen(col, row) && !seen(col - 1, row)) continue;

        const x = maze.originX + col * maze.cellWidth;
        const y = maze.originY + row * maze.cellHeight;
        this.drawWallBar(g, x - half, y, thickness, maze.cellHeight);
      }
    }

    // Horizontal edges: the wall above each cell.
    for (let row = 0; row <= maze.rows; row += 1) {
      for (let col = 0; col < maze.cols; col += 1) {
        if (!maze.wallAbove(col, row)) continue;
        if (!seen(col, row) && !seen(col, row - 1)) continue;

        const x = maze.originX + col * maze.cellWidth;
        const y = maze.originY + row * maze.cellHeight;
        this.drawWallBar(g, x, y - half, maze.cellWidth, thickness);
      }
    }

    this.hideUnusedWallBars();
  }

  /**
   * One length of bramble wall.
   *
   * The drawing is a horizontal bar whose thorns stick out well past the part
   * that actually blocks: the solid body is 45 of its 87 pixels, so the sprite
   * is drawn `WALL_ART_RATIO` taller than the wall's real thickness and the
   * spikes overhang into the corridor. That overhang is the point — thorns
   * reaching over the edge say "do not touch" far better than a flat bar, and
   * they cost nothing, because what a route actually collides with is the maze
   * grid and not this picture.
   *
   * The body is not centred in the source either, so the sprite is nudged back
   * by `WALL_ART_OFFSET` of its height; without that the thorns are visibly
   * lopsided, heavier on one side of every wall in the maze.
   */
  private drawWallBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const sprite = this.takeWallBar();

    if (!sprite) {
      // No art: the primitive bar, exactly as it was.
      g.fillStyle(COLORS.wallThorn, 0.3);
      g.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 8);
      g.fillStyle(COLORS.wall, 0.97);
      g.fillRoundedRect(x, y, width, height, 6);
      g.lineStyle(1.5, COLORS.wallThorn, 0.5);
      g.strokeRoundedRect(x, y, width, height, 6);
      return;
    }

    const vertical = height > width;
    const span = vertical ? height : width;
    const thick = vertical ? width : height;
    const art = thick * WALL_ART_RATIO;
    const nudge = art * WALL_ART_OFFSET;

    sprite.setVisible(true);
    // Display size is applied before rotation, so a vertical bar is the same
    // horizontal picture turned a quarter turn.
    sprite.setDisplaySize(span, art);
    sprite.setRotation(vertical ? Math.PI / 2 : 0);
    sprite.setPosition(
      x + width / 2 + (vertical ? nudge : 0),
      y + height / 2 - (vertical ? 0 : nudge),
    );
  }

  /** Next free pooled wall image, or null when there is no wall art. */
  private takeWallBar(): Phaser.GameObjects.Image | null {
    if (!this.scene.textures.exists(TEX.wall)) return null;

    if (this.wallBarCount >= this.wallBars.length) {
      this.wallBars.push(
        this.scene.add
          .image(0, 0, TEX.wall)
          .setOrigin(0.5)
          .setDepth(this.depth + 4),
      );
    }
    const sprite = this.wallBars[this.wallBarCount];
    this.wallBarCount += 1;
    return sprite ?? null;
  }

  /** Hides pooled bars left over from a frame with more walls on screen. */
  private hideUnusedWallBars(): void {
    for (let i = this.wallBarCount; i < this.wallBars.length; i += 1) {
      this.wallBars[i]?.setVisible(false);
    }
  }

  private drawWasps(field: Field, alpha: number): void {
    const g = this.waspGfx;
    g.clear();

    this.drawRaidWarning(field, g);

    while (this.wasps.length < field.wasps.length) {
      const sprite = this.scene.add
        .image(0, 0, this.scene.textures.exists(TEX.wasp) ? TEX.wasp : TEX.glow)
        .setOrigin(0.5)
        .setDepth(this.depth + 3);
      this.wasps.push(sprite);
    }
    for (let i = field.wasps.length; i < this.wasps.length; i += 1) {
      this.wasps[i]?.setVisible(false);
    }

    for (let i = 0; i < field.wasps.length; i += 1) {
      const wasp = field.wasps[i];
      const sprite = this.wasps[i];
      if (!wasp || !sprite) continue;

      const x = wasp.prevX + (wasp.x - wasp.prevX) * alpha;
      const y = wasp.prevY + (wasp.y - wasp.prevY) * alpha;

      // Threat radius drawn faintly — the player needs to judge whether a route
      // passes through danger, and guessing at an invisible radius is unfair.
      // Only while it is crossing the field: at the hive it is a target, not a
      // no-go zone, and the ring would sit over the thing you must drag onto.
      if (wasp.state === 'approaching') {
        g.fillStyle(0xd23b2a, 0.09);
        g.fillCircle(x, y, TUNING.wasp.interceptRadius * 1.6);
      }

      // The ring that says "draw at me": where a route's tip has to land for
      // its bees to reach, and how much fight is left in the wasp. Damage is
      // shown as an arc of the same ring rather than a bar, so it reads at a
      // glance without adding a second piece of furniture to the board.
      if (wasp.state !== 'fleeing') {
        g.lineStyle(2, 0xffd25e, 0.28);
        g.strokeCircle(x, y, TUNING.wasp.reachRadius);

        const spent = 1 - wasp.vitality;
        if (spent > 0) {
          g.lineStyle(4, 0xffd25e, 0.85);
          g.beginPath();
          g.arc(
            x,
            y,
            TUNING.wasp.reachRadius,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * spent,
          );
          g.strokePath();
        }
      }

      sprite.setVisible(true);
      sprite.setPosition(x, y);
      // Size and tint per kind, so a wave can be read at a glance: a hornet is
      // plainly the big orange one worth avoiding and a drone is the small pale
      // one that will be at the door first.
      const scale = wasp.tuning.scale;
      sprite.setDisplaySize(46 * scale, 46 * (43 / 72) * scale);
      sprite.setTint(wasp.tuning.tint);

      // Mirrored rather than spun, for the same reason the bees are: the wasp
      // is drawn in profile and rotating it by heading would fly it upside
      // down half the time.
      const dx = wasp.x - wasp.prevX;
      const dy = wasp.y - wasp.prevY;
      if (dx * dx + dy * dy > 0.01) {
        const facingLeft = dx < 0;
        sprite.setFlipX(facingLeft);
        const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(dy, Math.abs(dx))));
        sprite.setRotation(facingLeft ? -tilt : tilt);
      }
    }
  }

  /**
   * The marker that says where the announced raid is about to come in.
   *
   * Random timing only stays fair if the warning is specific, and a warning
   * that says "somewhere" is not specific. This is drawn on the board rather
   * than in the HUD for the same reason the wind arrow is: the player is
   * looking at the field, and information about the field belongs on it.
   */
  private drawRaidWarning(field: Field, g: Phaser.GameObjects.Graphics): void {
    const at = field.raidWarningAt;
    if (!at) return;

    this.warningPhase += 0.09;
    const pulse = 0.5 + 0.5 * Math.sin(this.warningPhase);

    g.fillStyle(0xd23b2a, 0.1 + 0.1 * pulse);
    g.fillCircle(at.x, at.y, 54 + 22 * pulse);
    g.lineStyle(3, 0xff7a5e, 0.55 + 0.35 * pulse);
    g.strokeCircle(at.x, at.y, 54 + 22 * pulse);

    // A stub pointing at the hive, so the marker reads as "coming from here"
    // rather than "something is at this spot".
    const dx = field.hiveX - at.x;
    const dy = field.hiveY - at.y;
    const len = Math.hypot(dx, dy) || 1;
    g.lineStyle(4, 0xff7a5e, 0.4 + 0.3 * pulse);
    g.beginPath();
    g.moveTo(at.x + (dx / len) * 60, at.y + (dy / len) * 60);
    g.lineTo(at.x + (dx / len) * 130, at.y + (dy / len) * 130);
    g.strokePath();
  }

  destroy(): void {
    this.gfx.destroy();
    this.hiveGlow.destroy();
    this.waspGfx.destroy();
    this.wallGfx.destroy();
    this.surroundGfx.destroy();
    for (const label of this.labels) label.destroy();
    this.labels = [];
    for (const flower of this.flowers) flower.destroy();
    this.flowers = [];
    this.ground?.destroy();
    this.hiveSprite?.destroy();
    for (const wasp of this.wasps) wasp.destroy();
    this.wasps = [];
    for (const label of this.buyerLabels) label.destroy();
    this.buyerLabels = [];
    for (const bar of this.wallBars) bar.destroy();
    this.wallBars = [];
  }
}

/** Linear blend between two packed RGB colours. */
function blend(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}
