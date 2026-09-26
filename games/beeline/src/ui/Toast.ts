import type Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@ucgames/core';
import type { AchievementDef } from '../game/Achievements.ts';
import { star } from './Hud.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Achievement cards that rise from the bottom of whatever scene is showing,
 * one after another. Never blocking: they slide in, hold, and leave.
 */
export function showAchievements(
  scene: Phaser.Scene,
  unlocked: readonly AchievementDef[],
  delayMs = 600,
  onEach?: () => void,
): void {
  unlocked.forEach((a, i) => {
    scene.time.delayedCall(delayMs + i * 2600, () => {
      onEach?.();
      toast(scene, a);
    });
  });
}

function toast(scene: Phaser.Scene, a: AchievementDef): void {
  const width = 460;
  const height = 86;
  // From the bottom edge, so it never sits on a scene's title.
  const x = DESIGN_WIDTH / 2;
  const rest = DESIGN_HEIGHT - 64;
  const box = scene.add.container(x, DESIGN_HEIGHT + height).setDepth(1000);

  const g = scene.add.graphics();
  g.fillStyle(0x2a2114, 0.95);
  g.fillRoundedRect(-width / 2, -height / 2, width, height, 18);
  g.lineStyle(3, 0xffc93c, 1);
  g.strokeRoundedRect(-width / 2, -height / 2, width, height, 18);
  star(g, -width / 2 + 46, 0, 26, 0xffd84a);
  box.add(g);

  const head = scene.add
    .text(-width / 2 + 88, -16, `Achievement: ${a.name}`, {
      fontFamily: FONT,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffe38a',
    })
    .setOrigin(0, 0.5);
  const body = scene.add
    .text(-width / 2 + 88, 16, a.goal, {
      fontFamily: FONT,
      fontSize: '18px',
      color: '#e9dcc0',
    })
    .setOrigin(0, 0.5);
  box.add([head, body]);

  scene.tweens.add({
    targets: box,
    y: rest,
    duration: 380,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: box,
        y: DESIGN_HEIGHT + height,
        delay: 1900,
        duration: 320,
        ease: 'Quad.easeIn',
        onComplete: () => box.destroy(),
      });
    },
  });
}
