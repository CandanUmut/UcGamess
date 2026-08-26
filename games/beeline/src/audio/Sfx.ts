import type Phaser from 'phaser';

export type SfxKey =
  'collect' | 'deposit' | 'sell' | 'draw' | 'dayEnd' | 'upgrade' | 'wasp' | 'hum';

const SAMPLE_RATE = 22_050;

/**
 * Semitone offsets of a major pentatonic scale, spanning just over an octave.
 *
 * 0-2-4-7-9 is the pattern; no two of these are a semitone or a tritone
 * apart, which is what makes any sequence of them sound intentional.
 */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14] as const;

/** Phaser cache key for the shipped background loop. */
export const MUSIC_KEY = 'meadow-music';

/**
 * The music, in both formats a browser might want.
 *
 * Phaser takes the first one the browser reports it can play, so only one is
 * ever fetched. Opus in WebM is smaller and covers Chrome, Firefox and Edge;
 * the AAC in MP4 is there because Safari plays neither Opus nor Vorbis
 * reliably, and Safari is a documented portal rejection cause rather than an
 * edge case worth shrugging at.
 */
export const MUSIC_FILES = ['audio/meadow.webm', 'audio/meadow.m4a'];

/**
 * Sound synthesised at boot instead of shipped as files.
 *
 * Per ASSETS.md, audio is the most common way to blow the download budget — the
 * plan allocated 600 KB to it, of which an ambient loop was expected to be
 * 300 KB. Generating the buffers costs **zero bytes of download** and about two
 * kilobytes of generator code.
 *
 * Crucially the buffers are injected into Phaser's audio cache rather than
 * played through a private AudioContext. That means they route through Phaser's
 * sound manager, which `@ucgames/core`'s AudioManager already mutes — so ad
 * ducking and the player's mute setting work with no extra code, exactly as
 * they would for shipped files.
 *
 * If WebAudio is unavailable (Safari before a user gesture leaves the context
 * suspended; some embedded webviews report no audio at all) this degrades to
 * silence rather than throwing. A game with no sound is fine; a game that fails
 * to boot is not.
 */
export class Sfx {
  private readonly scene: Phaser.Scene;
  private available = false;
  private hum: Phaser.Sound.BaseSound | undefined;
  private music: Phaser.Sound.BaseSound | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.available = this.generateAll();
  }

  private get context(): AudioContext | undefined {
    return (
      this.scene.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext }
    ).context;
  }

  private generateAll(): boolean {
    const ctx = this.context;
    if (!ctx) {
      console.warn('[beeline] No WebAudio context — running silent.');
      return false;
    }

    try {
      this.addBuffer(ctx, 'collect', 0.38, collectBlip);
      this.addBuffer(ctx, 'deposit', 0.13, depositThunk);
      this.addBuffer(ctx, 'sell', 0.34, sellChink);
      this.addBuffer(ctx, 'draw', 0.22, drawWhoosh);
      this.addBuffer(ctx, 'dayEnd', 0.75, dayEndChime);
      this.addBuffer(ctx, 'upgrade', 0.42, upgradeArpeggio);
      this.addBuffer(ctx, 'wasp', 0.35, waspBuzz);
      this.addBuffer(ctx, 'hum', 2.0, hiveHum);
      return true;
    } catch (error) {
      console.warn('[beeline] Could not synthesise audio; running silent.', error);
      return false;
    }
  }

  private addBuffer(
    ctx: AudioContext,
    key: SfxKey,
    seconds: number,
    fill: (t: number, duration: number) => number,
  ): void {
    const frames = Math.floor(SAMPLE_RATE * seconds);
    const buffer = ctx.createBuffer(1, frames, SAMPLE_RATE);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frames; i += 1) {
      data[i] = fill(i / SAMPLE_RATE, seconds);
    }

    this.scene.cache.audio.add(key, buffer);
  }

  /**
   * Plays a one-shot.
   *
   * `detune` is the highest-leverage trick in the whole audio budget: the
   * collection blip fires hundreds of times a day, and randomising its pitch
   * turns one buffer into something that never sounds mechanical.
   */
  play(key: SfxKey, volume = 0.5, detuneCents = 0): void {
    if (!this.available) return;
    try {
      this.scene.sound.play(key, { volume, detune: detuneCents });
    } catch {
      // A sound failing to play must never interrupt gameplay.
    }
  }

  /** Pitch-varied one-shot, for sounds that repeat constantly. */
  playVaried(key: SfxKey, volume = 0.5, spreadCents = 250): void {
    this.play(key, volume, (Math.random() * 2 - 1) * spreadCents);
  }

  /**
   * Plays a one-shot on a note of the pentatonic scale rather than at a random
   * detune.
   *
   * `playVaried` scatters pitch continuously, which is right for a whoosh and
   * wrong for a tone: two collections a few milliseconds apart land a random
   * interval from each other, and most random intervals are dissonant. Across
   * hundreds of pickups a day that is the difference between a game that
   * chimes and a game that jangles.
   *
   * A major pentatonic has no semitones and no tritone in it, so **every pair
   * of notes in the set is consonant**. Whatever order the swarm happens to
   * collect in, the result is musical — the scale is doing the work that no
   * amount of tuning a single blip could.
   *
   * Weighted toward the lower notes, because the swarm delivers in clusters and
   * a cluster that keeps landing up high is the fatiguing case all over again.
   */
  playNote(key: SfxKey, volume = 0.5): void {
    const note = PENTATONIC[Math.floor(Math.random() ** 1.7 * PENTATONIC.length)] ?? 0;
    this.play(key, volume, note * 100);
  }

  startHum(): void {
    if (!this.available || this.hum) return;
    try {
      // Quieter than it was. The hum used to be the only thing under the game
      // and could carry it; with music behind it, it goes back to being what it
      // is — the hive, close by — rather than competing for the same space.
      this.hum = this.scene.sound.add('hum', { loop: true, volume: 0.08 });
      this.hum.play();
    } catch {
      this.hum = undefined;
    }
  }

  /**
   * Starts the background loop, if it arrived.
   *
   * Routed through Phaser's sound manager for the same reason the synthesised
   * buffers are: `@ucgames/core`'s AudioManager mutes that manager around ad
   * calls, so music ducks for a commercial break with no code here knowing ads
   * exist. A private Audio element would keep playing over the ad, which is a
   * portal rejection.
   *
   * Mixed well down. Background music that a player notices on the second loop
   * is background music they will mute, and a muted game sounds broken rather
   * than quiet.
   */
  startMusic(): void {
    if (this.music) return;
    if (!this.scene.cache.audio.exists(MUSIC_KEY)) return;
    try {
      this.music = this.scene.sound.add(MUSIC_KEY, { loop: true, volume: 0.3 });
      this.music.play();
    } catch (error) {
      console.warn('[beeline] Could not start music.', error);
      this.music = undefined;
    }
  }

  stopHum(): void {
    this.hum?.stop();
    this.hum?.destroy();
    this.hum = undefined;
    this.music?.stop();
    this.music?.destroy();
    this.music = undefined;
  }
}

// ---------------------------------------------------------------------------
// Waveform generators. Each returns a sample in [-1, 1] for time `t`.
// Kept deliberately simple — these are shapes, not sound design.
// ---------------------------------------------------------------------------

/** Exponential decay envelope. */
function decay(t: number, rate: number): number {
  return Math.exp(-t * rate);
}

/** Short attack so nothing starts with a click. */
function attack(t: number, ms = 0.004): number {
  return Math.min(1, t / ms);
}

function collectBlip(t: number): number {
  // A soft wooden note, like a kalimba tine.
  //
  // This is the most-played sound in the game by a wide margin — hundreds of
  // times in a ninety-second day — and the first version was built like a
  // one-shot reward: a ping rising from 880Hz to 1300Hz with a hard attack and
  // a fast decay. Three separate things made that tiring:
  //
  //  - **The band.** 1-4kHz is where hearing is most sensitive and where ear
  //    fatigue sets in fastest. The fundamental is now 440Hz, an octave and a
  //    half down, which is present without being sharp.
  //  - **The attack.** A 4ms attack is a click, and a click repeated is a
  //    rattle. 18ms keeps the note distinct while removing the edge.
  //  - **The partials.** The old "shimmer" sat at 2.02x the fundamental — a
  //    deliberately detuned octave, which beats against the tone. Beating is
  //    what makes a sound feel *urgent*; exactly wrong here. The partials below
  //    are a clean octave and a twelfth, at low amplitude, which is roughly how
  //    a struck wooden bar behaves.
  //
  // The pitch no longer rises, either. A rising blip is a "collected!" cue and
  // insists on being noticed; a struck note simply happens and lets the ear
  // move on, which is what a sound repeated this often has to do.
  const f = 440;
  const body = Math.sin(2 * Math.PI * f * t);
  const octave = 0.28 * Math.sin(2 * Math.PI * f * 2 * t);
  const twelfth = 0.1 * Math.sin(2 * Math.PI * f * 3 * t);
  // The upper partials fade faster than the fundamental, which is what makes a
  // note read as struck wood rather than as a synth tone held flat.
  const timbre = body + octave * decay(t, 26) + twelfth * decay(t, 44);
  return timbre * decay(t, 11) * attack(t, 0.018) * 0.5;
}

function depositThunk(t: number): number {
  // Low, soft, rounded. Fires as often as the blip so it must not fatigue.
  const tone = Math.sin(2 * Math.PI * 196 * t);
  const body = 0.4 * Math.sin(2 * Math.PI * 98 * t);
  return (tone + body) * decay(t, 22) * attack(t, 0.006) * 0.45;
}

function sellChink(t: number): number {
  // Money landing: a small coin, not a cash register.
  //
  // The brief was "a satisfying sell sound, not annoying, not too loud", and
  // the trap in it is that the obvious reference — a till, a jackpot, a coin
  // pile — is *built* to be annoying, because a casino wants the room to hear
  // it. This has to work at the other extreme: it fires several times a sale,
  // many sales a day, over the music, and its job is only to confirm.
  //
  // What makes it read as metal rather than as another wooden chime is
  // **inharmonicity**. A struck bar's partials sit at irrational-looking
  // multiples of the fundamental (2.76 and 5.4 here, roughly a real bell's
  // first two), and it is those non-integer ratios the ear hears as *metal*.
  // The collect blip goes out of its way to avoid exactly this, for exactly the
  // same reason in reverse — but that one plays hundreds of times a day and
  // this plays a handful, so it can afford a little edge.
  //
  // The edge is kept in check three ways: the partials are quiet and decay far
  // faster than the fundamental, so the metal is an *onset* rather than a tone;
  // there is a low body underneath giving the coin weight instead of leaving it
  // thin and glassy; and the whole thing is well under a third of a second.
  const f = 784;
  const strike = Math.sin(2 * Math.PI * f * t) * decay(t, 9);
  const bell =
    0.3 * Math.sin(2 * Math.PI * f * 2.76 * t) * decay(t, 30) +
    0.14 * Math.sin(2 * Math.PI * f * 5.4 * t) * decay(t, 52);
  // A fifth below, under everything. Weight, not pitch — it is 12dB down and
  // gone before the strike is, so it lands as heft rather than as a second
  // note fighting the first.
  const body = 0.25 * Math.sin(2 * Math.PI * 261.6 * t) * decay(t, 14);
  // Long enough not to click, short enough that the coin still sounds struck.
  return (strike + bell + body) * attack(t, 0.007) * 0.3;
}

function drawWhoosh(t: number, duration: number): number {
  // Filtered noise sweeping upward, faked with a decaying random walk.
  const progress = t / duration;
  const noise = Math.random() * 2 - 1;
  const envelope = Math.sin(Math.PI * progress);
  const tone = Math.sin(2 * Math.PI * (220 + 500 * progress) * t);
  return (noise * 0.25 + tone * 0.5) * envelope * 0.35;
}

function dayEndChime(t: number): number {
  // A major third — unambiguous "that's the end of something".
  const a = Math.sin(2 * Math.PI * 523.25 * t) * decay(t, 3.2);
  const b = Math.sin(2 * Math.PI * 659.25 * t) * decay(t, 2.6) * 0.8;
  const c = Math.sin(2 * Math.PI * 783.99 * t) * decay(Math.max(0, t - 0.12), 3) * 0.6;
  return (a + b + c) * attack(t, 0.008) * 0.28;
}

function upgradeArpeggio(t: number): number {
  // Three rising notes inside one buffer.
  const notes = [440, 554.37, 659.25];
  const step = 0.12;
  const index = Math.min(notes.length - 1, Math.floor(t / step));
  const local = t - index * step;
  const freq = notes[index] ?? 440;
  return (
    Math.sin(2 * Math.PI * freq * t) * decay(local, 11) * attack(local, 0.005) * 0.34
  );
}

function waspBuzz(t: number, duration: number): number {
  // Harsh, detuned, amplitude-wobbled — deliberately unpleasant.
  const wobble = 1 + 0.35 * Math.sin(2 * Math.PI * 27 * t);
  const a = Math.sin(2 * Math.PI * 132 * t * wobble);
  const b = Math.sin(2 * Math.PI * 139 * t * wobble);
  const envelope = Math.sin(Math.PI * (t / duration));
  return (a + b) * 0.5 * envelope * 0.32;
}

function hiveHum(t: number, duration: number): number {
  /**
   * Seamless loop: every partial completes a whole number of cycles across the
   * buffer, so the end joins the start with no click. That constraint is why
   * the frequencies are computed from the duration rather than chosen.
   */
  const base = Math.round(110 * duration) / duration;
  let sample = 0;
  for (const [harmonic, gain] of [
    [1, 1],
    [2, 0.42],
    [3, 0.18],
    [5, 0.08],
  ] as const) {
    sample += Math.sin(2 * Math.PI * base * harmonic * t) * gain;
  }
  // Slow breathing, also loop-aligned.
  const breath = 1 + 0.12 * Math.sin((2 * Math.PI * t) / duration);
  return sample * 0.16 * breath;
}
