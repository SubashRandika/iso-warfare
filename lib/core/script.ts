// Demo clock: timed steps and condition waits that can all be cancelled at once.
// Conditions are polled because transitions advance per frame, so slow frames stretch them.

export interface Script {
  readonly active: boolean;
  /** cancel anything pending and mark the demo as running */
  start(): void;
  /** cancel everything */
  stop(): void;
  /** mark the demo finished (pending steps keep their own course) */
  end(): void;
  later(ms: number, f: () => void): void;
  /** run f once cond() holds; give up (and end the demo) after giveUp ms */
  when(cond: () => boolean, f: () => void, giveUp?: number): void;
}

export function createScript(): Script {
  let ids: number[] = [], active = false;
  const stop = () => { ids.forEach(id => { clearTimeout(id); clearInterval(id); }); ids = []; active = false; };
  return {
    get active() { return active; },
    start() { stop(); active = true; },
    stop,
    end() { active = false; },
    later(ms, f) { ids.push(window.setTimeout(f, ms)); },
    when(cond, f, giveUp = 10000) {
      const t0 = performance.now();
      const id = window.setInterval(() => {
        if (cond()) { clearInterval(id); f(); }
        else if (performance.now() - t0 > giveUp) { clearInterval(id); active = false; }
      }, 120);
      ids.push(id);
    },
  };
}
