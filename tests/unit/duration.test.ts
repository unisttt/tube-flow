import { describe, it, expect } from 'vitest';
import { parseDurationText, passesDurationFilter } from '../../lib/duration';

describe('parseDurationText', () => {
  it('parses M:SS and H:MM:SS to seconds', () => {
    expect(parseDurationText('3:20')).toBe(200);
    expect(parseDurationText(' 12:00 ')).toBe(720);
    expect(parseDurationText('45:00')).toBe(2700);
    expect(parseDurationText('1:02:03')).toBe(3723);
  });
  it('returns null for non-duration text', () => {
    expect(parseDurationText('LIVE')).toBeNull();
    expect(parseDurationText('ライブ')).toBeNull();
    expect(parseDurationText('')).toBeNull();
    expect(parseDurationText(null)).toBeNull();
    expect(parseDurationText('10:99')).toBeNull(); // 秒が不正
  });
});

describe('passesDurationFilter', () => {
  it('null (時間不明) は常に除外', () => {
    expect(passesDurationFilter(null, 0, 10)).toBe(false);
  });
  it('max のみ（以内・境界含む）', () => {
    expect(passesDurationFilter(600, 0, 10)).toBe(true); // ちょうど10分
    expect(passesDurationFilter(601, 0, 10)).toBe(false);
    expect(passesDurationFilter(200, 0, 10)).toBe(true);
  });
  it('min のみ（以上・境界含む）', () => {
    expect(passesDurationFilter(1200, 20, 0)).toBe(true); // ちょうど20分
    expect(passesDurationFilter(1199, 20, 0)).toBe(false);
  });
  it('両方 0 は全通過', () => {
    expect(passesDurationFilter(5, 0, 0)).toBe(true);
  });
});
