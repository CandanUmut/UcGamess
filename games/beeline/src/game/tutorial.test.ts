import { describe, expect, it } from 'vitest';
import { Tutorial } from './Tutorial.ts';

const nothing = { routesDrawn: 0, honey: 0, lines: 0 };

describe('tutorial', () => {
  it('does not exist for a returning player', () => {
    const tutorial = new Tutorial(false);
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(true);
    expect(tutorial.wantsHintLine).toBe(false);
  });

  it('opens by asking for the one thing the game is about', () => {
    const tutorial = new Tutorial(true);
    expect(tutorial.current?.id).toBe('drag');
    expect(tutorial.wantsHintLine).toBe(true);
  });

  it('waits for the player to do the thing, not for a timer', () => {
    // Advancing on a timer teaches the confident player nothing and abandons
    // the hesitant one.
    const tutorial = new Tutorial(true);
    for (let i = 0; i < 1000; i += 1) tutorial.update(nothing);
    expect(tutorial.current?.id).toBe('drag');

    tutorial.update({ ...nothing, routesDrawn: 1 });
    expect(tutorial.current?.id).toBe('watch');
  });

  it('walks the whole loop — drag, gather, more lines — then gets out of the way', () => {
    const tutorial = new Tutorial(true);

    tutorial.update({ ...nothing, routesDrawn: 1, lines: 1 });
    expect(tutorial.current?.id).toBe('watch');

    tutorial.update({ ...nothing, routesDrawn: 1, lines: 1, honey: 12 });
    expect(tutorial.current?.id).toBe('more');

    // One line is not the lesson: the crew cap is. The step waits for a second
    // line standing at once.
    tutorial.update({ ...nothing, routesDrawn: 3, lines: 1, honey: 40 });
    expect(tutorial.current?.id).toBe('more');

    tutorial.update({ ...nothing, routesDrawn: 3, lines: 2, honey: 50 });
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(true);
  });

  it('stops asking for the hint line once the first route exists', () => {
    const tutorial = new Tutorial(true);
    tutorial.update({ ...nothing, routesDrawn: 1 });
    expect(tutorial.wantsHintLine).toBe(false);
  });

  it('teaches branching on its own board, and waits for a real branch', () => {
    const tutorial = new Tutorial(true, 'branch');
    expect(tutorial.current?.id).toBe('reach');
    tutorial.update({ ...nothing, routesDrawn: 1, lines: 1 });
    expect(tutorial.current?.id).toBe('branch');
    // A second line from the hive is not a branch.
    tutorial.update({ ...nothing, routesDrawn: 2, lines: 2, branches: 0 });
    expect(tutorial.current?.id).toBe('branch');
    tutorial.update({ ...nothing, routesDrawn: 3, lines: 3, branches: 1 });
    expect(tutorial.finished).toBe(true);
  });

  it('holds a dry-line lesson back until a line has actually run dry', () => {
    const tutorial = new Tutorial(true, 'extend');
    tutorial.update({ ...nothing, routesDrawn: 2, lines: 2 });
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(false);
    tutorial.update({ ...nothing, routesDrawn: 2, lines: 2, dryLine: true });
    expect(tutorial.current?.id).toBe('extend');
    tutorial.update({ ...nothing, dryLine: true, extensions: 1 });
    expect(tutorial.finished).toBe(true);
  });

  it('can be dismissed outright', () => {
    const tutorial = new Tutorial(true);
    tutorial.dismiss();
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(true);
  });
});
