import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  dayKey,
  normalizeRecord,
  formatMinutes,
  createUsageTracker,
  totalSkips,
  recentSkips,
  skipChartSvg,
} from '../../lib/usage';

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

  it('keeps same-day seconds (floored) and full skipHistory', () => {
    const rec = normalizeRecord(
      { date: today, seconds: 90.9, skipHistory: { '2026-07-12': 5, [today]: 3.7 } },
      today,
    );
    expect(rec.date).toBe(today);
    expect(rec.seconds).toBe(90);
    expect(rec.skipHistory).toEqual({ '2026-07-12': 5, [today]: 3 });
  });

  it('resets seconds when the date differs but KEEPS skipHistory (履歴は消さない)', () => {
    const rec = normalizeRecord(
      { date: '2026-07-12', seconds: 999, skipHistory: { '2026-07-12': 9 } },
      today,
    );
    expect(rec.seconds).toBe(0);
    expect(rec.date).toBe(today);
    // 依存度の履歴は日を跨いでも保持される
    expect(rec.skipHistory).toEqual({ '2026-07-12': 9 });
  });

  it('migrates the legacy single-day `skips` field into history', () => {
    const rec = normalizeRecord({ date: '2026-07-12', seconds: 10, skips: 7 }, today);
    expect(rec.skipHistory).toEqual({ '2026-07-12': 7 });
  });

  it('drops invalid history entries (bad keys / non-positive values)', () => {
    const rec = normalizeRecord(
      { date: today, seconds: 0, skipHistory: { bad: 3, '2026-07-10': -2, '2026-07-11': 4 } },
      today,
    );
    expect(rec.skipHistory).toEqual({ '2026-07-11': 4 });
  });

  it('resets on missing/invalid input', () => {
    expect(normalizeRecord(undefined, today)).toEqual({ date: today, seconds: 0, skipHistory: {} });
    expect(normalizeRecord({ date: today, seconds: -5 }, today)).toEqual({
      date: today,
      seconds: 0,
      skipHistory: {},
    });
  });
});

describe('totalSkips / recentSkips', () => {
  const today = '2026-07-13';
  const record = {
    date: today,
    seconds: 0,
    skipHistory: { '2026-07-10': 2, '2026-07-11': 5, [today]: 3 },
  };

  it('sums the whole history', () => {
    expect(totalSkips(record)).toBe(10);
  });

  it('returns days oldest→newest with 0-fill for missing days, ending today', () => {
    const series = recentSkips(record, today, 5);
    expect(series.map((d) => d.date)).toEqual([
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
    ]);
    expect(series.map((d) => d.count)).toEqual([0, 2, 5, 0, 3]);
  });
});

describe('skipChartSvg', () => {
  it('renders one bar per day and marks today', () => {
    const svg = skipChartSvg([
      { date: '2026-07-12', count: 2 },
      { date: '2026-07-13', count: 4 },
    ]);
    expect((svg.match(/<rect /g) ?? []).length).toBe(2);
    expect((svg.match(/tf-bar-today/g) ?? []).length).toBe(1);
    expect(svg).toContain('07-13: 4回');
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
    expect(tracker.totalSkips()).toBe(3);
    tracker.destroy();
  });

  it('resets seconds on day change but ACCUMULATES skips across days (依存度は累積)', () => {
    let now = new Date(2026, 6, 13, 23, 59);
    const tracker = createUsageTracker(() => now);
    tracker.add(9999);
    tracker.addSkip();
    tracker.addSkip();
    expect(tracker.seconds()).toBe(9999);
    expect(tracker.skips()).toBe(2);

    // 日付が翌日に変わる
    now = new Date(2026, 6, 14, 0, 0);
    // seconds は 0 に戻る（日次上限用）
    expect(tracker.seconds()).toBe(0);
    // 今日ぶんの skips は 0 だが、累計は前日ぶんを保持している
    expect(tracker.skips()).toBe(0);
    expect(tracker.totalSkips()).toBe(2);

    tracker.addSkip();
    expect(tracker.skips()).toBe(1);
    expect(tracker.totalSkips()).toBe(3);

    // 履歴は 2 日ぶん、末尾が今日
    const series = tracker.history(2);
    expect(series).toEqual([
      { date: '2026-07-13', count: 2 },
      { date: '2026-07-14', count: 1 },
    ]);
    tracker.destroy();
  });
});
