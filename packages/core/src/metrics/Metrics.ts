const STORAGE_KEY = 'ucgames:metrics';
const MAX_SESSIONS = 50;

export interface SessionRecord {
  startedAt: number;
  /** Seconds from page load until the player first started gameplay. */
  timeToFirstPlaySeconds: number | null;
  /** Total seconds spent in active gameplay this session. */
  playSeconds: number;
  /** How many times gameplay started (i.e. rounds played). */
  rounds: number;
  /** Whether the player ever reached gameplay at all. */
  converted: boolean;
}

export interface MetricsSummary {
  sessions: number;
  /** Share of sessions that reached gameplay. Poki: >70% solid, >80% exceptional. */
  conversionToPlay: number;
  /** Mean seconds of gameplay per session. Poki Player Fit Test wants >180. */
  averagePlaySeconds: number;
  /** Share of sessions over three minutes. Poki wants at least 25%. */
  sessionsOverThreeMinutes: number;
  /** Seconds from load to interactive, averaged. Target under 5. */
  averageTimeToFirstPlaySeconds: number;
}

/**
 * Local-only session logging so we can self-check against portal thresholds
 * before submitting.
 *
 * This is explicitly **not** analytics. Nothing leaves the device; there is no
 * network call and no identifier. It exists because the Poki Player Fit Test
 * gates on numbers we can measure ourselves — average playtime over 3 minutes,
 * at least 25% of sessions over 3 minutes, conversion-to-play over 70% — and
 * finding out we miss them from a rejection email costs weeks. Playtest with
 * five friends, read `summary()` off their console, and know before submitting.
 *
 * See docs/design-rules.md for what these numbers need to be and why.
 */
export class Metrics {
  private readonly pageLoadedAt = performance.now();

  private session: SessionRecord = {
    startedAt: Date.now(),
    timeToFirstPlaySeconds: null,
    playSeconds: 0,
    rounds: 0,
    converted: false,
  };

  private gameplayStartedAt: number | null = null;

  /** Call from the same place that calls portal.gameplayStart(). */
  markGameplayStart(): void {
    if (this.gameplayStartedAt !== null) return;

    this.gameplayStartedAt = performance.now();
    this.session.rounds += 1;

    if (!this.session.converted) {
      this.session.converted = true;
      this.session.timeToFirstPlaySeconds =
        (this.gameplayStartedAt - this.pageLoadedAt) / 1000;
    }
  }

  /** Call from the same place that calls portal.gameplayStop(). */
  markGameplayStop(): void {
    if (this.gameplayStartedAt === null) return;
    this.session.playSeconds += (performance.now() - this.gameplayStartedAt) / 1000;
    this.gameplayStartedAt = null;
    this.persist();
  }

  /** Current session so far, including any in-progress round. */
  currentSession(): SessionRecord {
    const inProgress =
      this.gameplayStartedAt === null
        ? 0
        : (performance.now() - this.gameplayStartedAt) / 1000;
    return { ...this.session, playSeconds: this.session.playSeconds + inProgress };
  }

  /**
   * Aggregate across stored sessions, in the same shape as the portal
   * thresholds so the comparison is direct.
   */
  summary(): MetricsSummary {
    const history = [...this.readHistory(), this.currentSession()];
    const count = history.length;

    if (count === 0) {
      return {
        sessions: 0,
        conversionToPlay: 0,
        averagePlaySeconds: 0,
        sessionsOverThreeMinutes: 0,
        averageTimeToFirstPlaySeconds: 0,
      };
    }

    const converted = history.filter((s) => s.converted);
    const ttfp = history
      .map((s) => s.timeToFirstPlaySeconds)
      .filter((n): n is number => n !== null);

    return {
      sessions: count,
      conversionToPlay: converted.length / count,
      averagePlaySeconds: history.reduce((sum, s) => sum + s.playSeconds, 0) / count,
      sessionsOverThreeMinutes: history.filter((s) => s.playSeconds > 180).length / count,
      averageTimeToFirstPlaySeconds:
        ttfp.length === 0 ? 0 : ttfp.reduce((a, b) => a + b, 0) / ttfp.length,
    };
  }

  /** Prints the summary next to the thresholds it has to beat. */
  logSummary(): void {
    const s = this.summary();
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    console.warn(
      [
        `[metrics] ${s.sessions} session(s) on this device`,
        `  conversion to play      ${pct(s.conversionToPlay)}  (target >70%, exceptional >80%)`,
        `  average play time       ${s.averagePlaySeconds.toFixed(1)}s  (target >180s)`,
        `  sessions over 3 min     ${pct(s.sessionsOverThreeMinutes)}  (target >25%)`,
        `  time to first play      ${s.averageTimeToFirstPlaySeconds.toFixed(1)}s  (target <5s)`,
      ].join('\n'),
    );
  }

  private readHistory(): SessionRecord[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SessionRecord[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      const history = this.readHistory().filter(
        (s) => s.startedAt !== this.session.startedAt,
      );
      history.push(this.session);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(history.slice(-MAX_SESSIONS)),
      );
    } catch {
      // Storage blocked. Metrics are a development aid; never break the game
      // for them.
    }
  }
}
