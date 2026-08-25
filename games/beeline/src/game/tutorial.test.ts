import { describe, expect, it } from 'vitest';
import { Tutorial } from './Tutorial.ts';

const nothing = { routesDrawn: 0, honey: 0, anyRouteRetreating: false };

describe('tutorial', () => {
  it('does not exist for a returning player', () => {
    const tutorial = new Tutorial(false);
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(true);
    expect(tutorial.wantsHintLine).toBe(false);
  });

  it('opens by asking for the one thing the game is about', () => {
    const tutorial = new Tutorial(true);
    expect(tutorial.current?.id).toBe('draw');
    expect(tutorial.wantsHintLine).toBe(true);
  });

  it('waits for the player to do the thing, not for a timer', () => {
    // Advancing on a timer teaches the confident player nothing and abandons
    // the hesitant one.
    const tutorial = new Tutorial(true);
    for (let i = 0; i < 1000; i += 1) tutorial.update(nothing);
    expect(tutorial.current?.id).toBe('draw');

    tutorial.update({ ...nothing, routesDrawn: 1 });
    expect(tutorial.current?.id).toBe('watch');
  });

  it('walks through drawing, earning and refreshing, then gets out of the way', () => {
    const tutorial = new Tutorial(true);

    tutorial.update({ routesDrawn: 1, honey: 0, anyRouteRetreating: false });
    expect(tutorial.current?.id).toBe('watch');

    tutorial.update({ routesDrawn: 1, honey: 12, anyRouteRetreating: false });
    expect(tutorial.current?.id).toBe('refresh');

    // Decay starting is not enough on its own — the step is asking the player
    // to draw again, so it must not clear itself before they have.
    tutorial.update({ routesDrawn: 1, honey: 40, anyRouteRetreating: true });
    expect(tutorial.current?.id).toBe('refresh');

    tutorial.update({ routesDrawn: 2, honey: 40, anyRouteRetreating: true });
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(true);
  });

  it('stops asking for the hint line once the first route exists', () => {
    const tutorial = new Tutorial(true);
    tutorial.update({ ...nothing, routesDrawn: 1 });
    expect(tutorial.wantsHintLine).toBe(false);
  });

  it('can be dismissed outright', () => {
    const tutorial = new Tutorial(true);
    tutorial.dismiss();
    expect(tutorial.current).toBeNull();
    expect(tutorial.finished).toBe(true);
  });
});
