import { describe, it, expect } from 'vitest';
import { parseVideoId } from '../../lib/video-id';

describe('parseVideoId', () => {
  it('extracts v from relative and absolute /watch URLs', () => {
    expect(parseVideoId('/watch?v=abc123')).toBe('abc123');
    expect(parseVideoId('https://www.youtube.com/watch?v=abc123&t=10s')).toBe('abc123');
    expect(parseVideoId('/watch?list=PL1&v=xyz')).toBe('xyz');
  });
  it('extracts id from /shorts URLs', () => {
    expect(parseVideoId('/shorts/short99')).toBe('short99');
  });
  it('returns null when there is no video id', () => {
    expect(parseVideoId('/feed/subscriptions')).toBeNull();
    expect(parseVideoId('')).toBeNull();
    expect(parseVideoId(null)).toBeNull();
  });
});
