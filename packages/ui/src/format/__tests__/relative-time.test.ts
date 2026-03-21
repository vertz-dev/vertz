import { describe, expect, it } from 'bun:test';
import { formatRelativeTime } from '../relative-time';

const now = new Date('2026-03-21T12:00:00Z');

describe('Feature: formatRelativeTime', () => {
  describe('Given a date that is less than 10 seconds ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "now" via Intl (locale-aware)', () => {
        expect(formatRelativeTime(now, { now })).toBe('now');
        expect(formatRelativeTime(new Date('2026-03-21T11:59:55Z'), { now })).toBe('now');
      });
    });
  });

  describe('Given a date that is 30 seconds ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "30 seconds ago"', () => {
        expect(formatRelativeTime(new Date('2026-03-21T11:59:30Z'), { now })).toBe(
          '30 seconds ago',
        );
      });
    });
  });

  describe('Given a date that is 5 minutes ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "5 minutes ago"', () => {
        expect(formatRelativeTime(new Date('2026-03-21T11:55:00Z'), { now })).toBe('5 minutes ago');
      });
    });
  });

  describe('Given a date that is 2 hours ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "2 hours ago"', () => {
        expect(formatRelativeTime(new Date('2026-03-21T10:00:00Z'), { now })).toBe('2 hours ago');
      });
    });
  });

  describe('Given a date that is 3 days ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "3 days ago"', () => {
        expect(formatRelativeTime(new Date('2026-03-18T12:00:00Z'), { now })).toBe('3 days ago');
      });
    });
  });

  describe('Given a date that is 2 weeks ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "2 weeks ago"', () => {
        expect(formatRelativeTime(new Date('2026-03-07T12:00:00Z'), { now })).toBe('2 weeks ago');
      });
    });
  });

  describe('Given a date that is 4 months ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "4 months ago"', () => {
        expect(formatRelativeTime(new Date('2025-11-21T12:00:00Z'), { now })).toBe('4 months ago');
      });
    });
  });

  describe('Given a date that is 2 years ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "2 years ago"', () => {
        expect(formatRelativeTime(new Date('2024-03-21T12:00:00Z'), { now })).toBe('2 years ago');
      });
    });
  });

  describe('Given a future date that is 2 hours from now', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "in 2 hours"', () => {
        expect(formatRelativeTime(new Date('2026-03-21T14:00:00Z'), { now })).toBe('in 2 hours');
      });
    });
  });

  describe('Given a string date input', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then parses and formats correctly', () => {
        expect(formatRelativeTime('2026-03-21T11:00:00Z', { now })).toBe('1 hour ago');
      });
    });
  });

  describe('Given a number (epoch ms) date input', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then parses and formats correctly', () => {
        expect(formatRelativeTime(now.getTime() - 3600000, { now })).toBe('1 hour ago');
      });
    });
  });

  describe('Given a locale option of "pt-BR"', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns localized output', () => {
        const result = formatRelativeTime(new Date('2026-03-21T10:00:00Z'), {
          now,
          locale: 'pt-BR',
        });
        expect(result).toBe('há 2 horas');
      });
    });
  });

  describe('Given numeric: "always"', () => {
    describe('When formatRelativeTime is called with a date 1 day ago', () => {
      it('Then returns "1 day ago" instead of "yesterday"', () => {
        const result = formatRelativeTime(new Date('2026-03-20T12:00:00Z'), {
          now,
          numeric: 'always',
        });
        expect(result).toBe('1 day ago');
      });
    });
  });

  describe('Given numeric: "auto" with a date 1 day ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "yesterday"', () => {
        const result = formatRelativeTime(new Date('2026-03-20T12:00:00Z'), { now });
        expect(result).toBe('yesterday');
      });
    });
  });

  describe('Given a custom "now" reference', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then calculates relative time from the provided reference', () => {
        const customNow = new Date('2026-06-15T00:00:00Z');
        expect(formatRelativeTime(new Date('2026-06-14T23:55:00Z'), { now: customNow })).toBe(
          '5 minutes ago',
        );
      });
    });
  });

  describe('Given an invalid date string', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then throws with a descriptive error message', () => {
        expect(() => formatRelativeTime('not-a-date', { now })).toThrow(
          'formatRelativeTime: invalid date input: not-a-date',
        );
      });
    });
  });

  describe('Given threshold boundary values', () => {
    it('exactly 10 seconds transitions from "now" to seconds', () => {
      // 10 seconds ago -> diffSec = 10, which is NOT < 10, so "10 seconds ago"
      expect(formatRelativeTime(new Date('2026-03-21T11:59:50Z'), { now })).toBe('10 seconds ago');
    });

    it('exactly 60 seconds transitions from seconds to minutes', () => {
      // 60 seconds ago -> diffSec = 60, NOT < 60, so minutes: floor(60/60)=1
      expect(formatRelativeTime(new Date('2026-03-21T11:59:00Z'), { now })).toBe('1 minute ago');
    });

    it('exactly 7 days transitions from days to weeks', () => {
      // 7 days ago -> diffDays = 7, NOT < 7, so weeks: floor(7/7)=1
      // numeric: 'auto' → "last week"
      expect(formatRelativeTime(new Date('2026-03-14T12:00:00Z'), { now })).toBe('last week');
      // numeric: 'always' → "1 week ago"
      expect(formatRelativeTime(new Date('2026-03-14T12:00:00Z'), { now, numeric: 'always' })).toBe(
        '1 week ago',
      );
    });

    it('exactly 30 days transitions from weeks to months', () => {
      // 30 days ago -> diffDays = 30, NOT < 30, so months: floor(30/30)=1
      // numeric: 'auto' → "last month"
      expect(formatRelativeTime(new Date('2026-02-19T12:00:00Z'), { now })).toBe('last month');
      // numeric: 'always' → "1 month ago"
      expect(formatRelativeTime(new Date('2026-02-19T12:00:00Z'), { now, numeric: 'always' })).toBe(
        '1 month ago',
      );
    });

    it('exactly 365 days transitions from months to years', () => {
      // 365 days -> diffDays = 365, NOT < 365, so years: floor(365/365)=1
      // numeric: 'auto' → "last year"
      expect(formatRelativeTime(new Date('2025-03-21T12:00:00Z'), { now })).toBe('last year');
      // numeric: 'always' → "1 year ago"
      expect(formatRelativeTime(new Date('2025-03-21T12:00:00Z'), { now, numeric: 'always' })).toBe(
        '1 year ago',
      );
    });
  });

  describe('Given the same locale and numeric are used multiple times', () => {
    it('Then caches the Intl.RelativeTimeFormat instance', () => {
      // Call twice with same options — should use cached formatter
      const result1 = formatRelativeTime(new Date('2026-03-21T10:00:00Z'), { now });
      const result2 = formatRelativeTime(new Date('2026-03-21T09:00:00Z'), { now });
      expect(result1).toBe('2 hours ago');
      expect(result2).toBe('3 hours ago');
    });
  });
});
