import type Phaser from 'phaser';
import {
  AudioManager,
  BaseScene,
  DESIGN_WIDTH,
  centerPlayfield,
  viewRect,
} from '@ucgames/core';
import { Button } from '../ui/Button.ts';

const FONT = 'Nunito, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface PauseData {
  /** e.g. "1-4  Clover Corner" or "Day 6". */
  title: string;
  onResume: () => void;
  /** Absent in endless, where a restart would throw away a whole run. */
  onRetry?: () => void;
  onQuit: () => void;
  /** "Map" in the campaign, "Menu" in endless. */
  quitLabel: string;
}

/**
 * The pause card, over a paused Game scene.
 *
 * Opened by the HUD button, the P key, or the window losing focus. Escape is
 * deliberately not bound: CrazyGames reserves it for leaving fullscreen.
 * Resume is the biggest button and P or Space also resume, so a pause is never
 * more than one input away from play.
 */
export class PauseScene extends BaseScene {
  private card!: PauseData;
  private closing = false;

  constructor() {
    super({ key: 'Pause' });
  }

  init(data: PauseData): void {
    this.card = data;
    this.closing = false;
  }

  protected build(): void {
    centerPlayfield(this);
    const view = viewRect(this);
    this.add
      .rectangle(view.centerX, view.centerY, view.width, view.height, 0x1d160c, 0.78)
      .setInteractive();

    const cx = DESIGN_WIDTH / 2;
    this.text('Paused', cx, 150, 56, '#ffe38a', true);
    this.text(this.card.title, cx, 212, 22, '#e9dcc0');

    new Button(this, {
      x: cx,
      y: 310,
      width: 340,
      label: '▶  Resume',
      tint: 0x3aa860,
      big: true,
      onClick: () => this.close(this.card.onResume),
    });

    const retry = this.card.onRetry;
    if (retry) {
      new Button(this, {
        x: cx - 90,
        y: 400,
        width: 160,
        label: '↻  Retry',
        tint: 0x2f8fb8,
        onClick: () => this.close(retry),
      });
    }
    new Button(this, {
      x: retry ? cx + 90 : cx,
      y: 400,
      width: 160,
      label: this.card.quitLabel,
      tint: 0x8a6a3a,
      onClick: () => this.close(this.card.onQuit),
    });

    const audio = this.context.audio;
    const sound = new Button(this, {
      x: cx,
      y: 490,
      width: 200,
      label: soundLabel(audio.isMuted),
      tint: 0x6b5a3a,
      onClick: () => {
        const muted = audio.toggleMute();
        this.context.save.set(AudioManager.saveKey, muted);
        void this.context.save.flush();
        sound.setLabel(soundLabel(muted));
      },
    });

    this.text('P to resume', cx, 570, 16, '#a8997a');
    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-P', () => this.close(this.card.onResume));
    keyboard?.on('keydown-SPACE', () => this.close(this.card.onResume));
  }

  private close(then: () => void): void {
    if (this.closing) return;
    this.closing = true;
    then();
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    colour: string,
    bold = false,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color: colour,
        align: 'center',
        stroke: '#1d160c',
        strokeThickness: bold ? 8 : 0,
      })
      .setOrigin(0.5);
  }
}

function soundLabel(muted: boolean): string {
  return muted ? '🔇  Sound off' : '🔊  Sound on';
}
