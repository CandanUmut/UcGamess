import { describe, expect, it } from 'vitest';
import { Tutorial } from './Tutorial.ts';

const nothing = { routesDrawn: 0, honey: 0, money: 0, missed: 0 };

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

  it('walks the whole loop — draw, gather, sell, and losing one — then gets out of the way', () => {
    const tutorial = new Tutorial(true);

    tutorial.update({ ...nothing, routesDrawn: 1 });
    expect(tutorial.current?.id).toBe('watch');

    tutorial.update({ ...nothing, routesDrawn: 1, honey: 12 });
    expect(tutorial.current?.id).toBe('sell');

    // Honey in the combs is not the lesson: money is. The step waits for a
    // sale, because a player who never sells never sees the loop close.
    tutorial.update({ ...nothing, routesDrawn: 2, honey: 40 });
    expect(tutorial.current?.id).toBe('sell');

    tutorial.update({ ...nothing, routesDrawn: 2, honey: 20, money: 18 });
    expect(tutorial.current?.id).toBe('wilt');

    // The last step clears once a bloom has actually been lost — the lesson is
    // "you cannot hold them all", and it only lands once one gets away.
    tutorial.update({ ...nothing, routesDrawn: 2, money: 18, missed: 1 });
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
