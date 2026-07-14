import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DISMISSED_KEY,
  normalizeDismissed,
  createDismissedStore,
} from '../../lib/dismissed';

type ChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void;

const g = globalThis as unknown as { chrome?: unknown };
let listeners: ChangeListener[] = [];
let store: Record<string, unknown> = {};

beforeEach(() => {
  listeners = [];
  store = {};
  g.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
      },
      onChanged: {
        addListener: (cb: ChangeListener) => listeners.push(cb),
        removeListener: (cb: ChangeListener) => {
          listeners = listeners.filter((l) => l !== cb);
        },
      },
    },
  };
});
afterEach(() => {
  delete g.chrome;
});

describe('normalizeDismissed', () => {
  const today = '2026-07-14';
  it('keeps same-day unique ids', () => {
    expect(normalizeDismissed({ date: today, ids: ['a', 'a', 'b'] }, today)).toEqual({
      date: today,
      ids: ['a', 'b'],
    });
  });
  it('resets on different day or invalid', () => {
    expect(normalizeDismissed({ date: '2026-07-13', ids: ['a'] }, today)).toEqual({
      date: today,
      ids: [],
    });
    expect(normalizeDismissed(undefined, today)).toEqual({ date: today, ids: [] });
  });
});

describe('createDismissedStore', () => {
  it('add/has/count and daily roll clears', () => {
    let now = new Date(2026, 6, 14, 10, 0);
    const s = createDismissedStore(() => now);
    s.add(['a', 'b', 'a']);
    expect(s.has('a')).toBe(true);
    expect(s.count()).toBe(2);
    now = new Date(2026, 6, 15, 0, 0); // 翌日
    expect(s.count()).toBe(0);
    expect(s.has('a')).toBe(false);
    s.destroy();
  });

  it('reset clears ids', () => {
    const s = createDismissedStore(() => new Date(2026, 6, 14, 10, 0));
    s.add(['a']);
    s.reset();
    expect(s.count()).toBe(0);
    s.destroy();
  });

  it('onChanged: union merge same-day, and adopt on shrink (reset from other tab)', () => {
    const onExternal = vi.fn();
    const s = createDismissedStore(() => new Date(2026, 6, 14, 10, 0), onExternal);
    s.add(['a']);
    // 別タブが b を足した → union
    listeners.forEach((l) =>
      l({ [DISMISSED_KEY]: { newValue: { date: '2026-07-14', ids: ['b'] } } }, 'local'),
    );
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(true);
    // 別タブがリセット（空）→ 縮んだので採用
    listeners.forEach((l) =>
      l({ [DISMISSED_KEY]: { newValue: { date: '2026-07-14', ids: [] } } }, 'local'),
    );
    expect(s.count()).toBe(0);
    expect(onExternal).toHaveBeenCalled();
    s.destroy();
  });
});
