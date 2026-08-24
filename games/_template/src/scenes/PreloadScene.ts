import { BasePreloadScene } from '@ucgames/core';

/**
 * The template deliberately ships almost no assets — it draws with Phaser
 * primitives so the scaffold itself costs near-zero bytes and a new game starts
 * with the whole size budget available.
 *
 * When you add real assets: put them in `assets/`, add an entry to
 * `assets/LICENSES.md` (CI fails without one), and load them here.
 */
export class PreloadScene extends BasePreloadScene {
  constructor() {
    super({ key: 'Preload' });
  }

  protected loadAssets(): void {
    this.load.image('logo', 'logo.png');
  }

  protected nextScene(): string {
    return 'Menu';
  }
}
