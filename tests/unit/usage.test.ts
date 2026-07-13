import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dayKey, normalizeRecord, formatMinutes, createUsageTracker } from '../../lib/usage';

// createUsageTracker は chrome.storage を触るので最小スタブを用意
const g = globalThis as unknown as { chrome?: unknown };
beforeEach(() => {
  g.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };
});
afterEach(() => {
  delete g.chrome;
});

describe('dayKey', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 6, 13))).toBe('2026-07-13');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('normalizeRecord', () => {
  const today = '2026-07-13';
  it('keeps same-day seconds and skips (floored)', () => {
    expect(normalizeRecord({ date: today, seconds: 90.9, skips: 4.7 }, today)).toEqual({
      date: today,
      seconds: 90,
      skips: 4,
    });
  });
  it('resets when the date differs', () => {
    expect(normalizeRecord({ date: '2026-07-12', seconds: 999, skips: 9 }, today)).toEqual({
      date: today,
      seconds: 0,
      skips: 0,
    });
  });
  it('resets on missing/invalid input', () => {
    expect(normalizeRecord(undefined, today)).toEqual({ date: today, seconds: 0, skips: 0 });
    expect(normalizeRecord({ date: today, seconds: -5 }, today)).toEqual({
      date: today,
      seconds: 0,
      skips: 0,
    });
  });
  it('defaults skips to 0 when missing on a valid record', () => {
    expect(normalizeRecord({ date: today, seconds: 30 }, today).skips).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('formats under an hour', () => {
    expect(formatMinutes(59)).toBe('0分');
    expect(formatMinutes(90)).toBe('1分');
    expect(formatMinutes(59 * 60)).toBe('59分');
  });
  it('formats an hour or more', () => {
    expect(formatMinutes(60 * 60)).toBe('1時間0分');
    expect(formatMinutes(61 * 60)).toBe('1時間1分');
  });
});

describe('createUsageTracker', () => {
  it('accumulates seconds and skips within a day', () => {
    const tracker = createUsageTracker(() => new Date(2026, 6, 13, 10, 0));
    tracker.add(30);
    tracker.add(15);
    tracker.addSkip();
    tracker.addSkip();
    tracker.addSkip();
    expect(tracker.seconds()).toBe(45);
    expect(tracker.skips()).toBe(3);
    tracker.destroy();
  });

  it('resets to 0 on day change even when read (not just on add) — 深夜0時の解除', () => {
    let now = new Date(2026, 6, 13, 23, 59);
    const tracker = createUsageTracker(() => now);
    tracker.add(9999);
    expect(tracker.seconds()).toBe(9999);
    // 日付が翌日に変わったら、add せず seconds() を読むだけで 0 に戻る
    now = new Date(2026, 6, 14, 0, 0);
    expect(tracker.seconds()).toBe(0);
    tracker.destroy();
  });
});
