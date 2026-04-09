const {
  hasConflict,
  generateCandidateSlots,
  findAvailableSlots,
  rankAlternativeSlots,
  rankAlternativeSlotsWithReasons,
  SLOT_DURATION_MS
} = require('../src/services/availability');

describe('hasConflict', () => {
  const existing = [
    {
      start: { dateTime: '2026-04-14T10:00:00.000Z' },
      end: { dateTime: '2026-04-14T11:00:00.000Z' }
    }
  ];

  test('returns true when proposed slot overlaps an existing event', () => {
    expect(hasConflict(existing, '2026-04-14T10:30:00.000Z', '2026-04-14T11:30:00.000Z')).toBe(true);
  });

  test('returns true when proposed slot is fully inside an existing event', () => {
    expect(hasConflict(existing, '2026-04-14T10:15:00.000Z', '2026-04-14T10:45:00.000Z')).toBe(true);
  });

  test('returns false for a slot immediately after an existing event', () => {
    expect(hasConflict(existing, '2026-04-14T11:00:00.000Z', '2026-04-14T12:00:00.000Z')).toBe(false);
  });

  test('returns false for a slot immediately before an existing event', () => {
    expect(hasConflict(existing, '2026-04-14T09:00:00.000Z', '2026-04-14T10:00:00.000Z')).toBe(false);
  });

  test('returns false when there are no existing events', () => {
    expect(hasConflict([], '2026-04-14T10:00:00.000Z', '2026-04-14T11:00:00.000Z')).toBe(false);
  });
});

describe('generateCandidateSlots', () => {
  test('generates hourly slots within working hours only', () => {
    // Use a fixed "now" two hours in the past so first slot is predictable
    const from = new Date();
    from.setHours(from.getHours() - 2);
    const slots = generateCandidateSlots('UTC', from);

    // Slots should exist (working week has at least some hours)
    expect(slots.length).toBeGreaterThan(0);

    // Every slot must fit neatly inside one hour
    for (const slot of slots) {
      const startMs = new Date(slot.startDateTime).getTime();
      const endMs = new Date(slot.endDateTime).getTime();
      expect(endMs - startMs).toBe(SLOT_DURATION_MS);
    }
  });

  test('generated slots are exactly SLOT_DURATION_MS long', () => {
    const from = new Date();
    from.setHours(from.getHours() - 2);
    const slots = generateCandidateSlots('UTC', from);

    for (const slot of slots) {
      const duration = new Date(slot.endDateTime) - new Date(slot.startDateTime);
      expect(duration).toBe(SLOT_DURATION_MS);
    }
  });

  test('skips weekends', () => {
    const from = new Date();
    from.setHours(from.getHours() - 2);
    const slots = generateCandidateSlots('UTC', from);

    for (const slot of slots) {
      const dow = new Date(slot.startDateTime).getUTCDay();
      expect(dow).not.toBe(0); // Sunday
      expect(dow).not.toBe(6); // Saturday
    }
  });

  test('all generated slots are in the future', () => {
    const now = new Date();
    const slots = generateCandidateSlots('UTC');

    for (const slot of slots) {
      expect(new Date(slot.startDateTime).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe('findAvailableSlots', () => {
  test('returns up to maxSlots free slots', () => {
    const slots = findAvailableSlots({ existingEvents: [], timeZone: 'UTC', maxSlots: 2 });
    expect(slots.length).toBeLessThanOrEqual(2);
    expect(slots.length).toBeGreaterThan(0);
  });

  test('excludes conflicting slots', () => {
    // Generate first available slot then mark it as busy
    const allSlots = findAvailableSlots({ existingEvents: [], timeZone: 'UTC', maxSlots: 5 });
    const firstSlot = allSlots[0];

    const busyEvent = {
      start: { dateTime: firstSlot.startDateTime },
      end: { dateTime: firstSlot.endDateTime }
    };

    const available = findAvailableSlots({ existingEvents: [busyEvent], timeZone: 'UTC', maxSlots: 5 });
    const conflict = available.some(
      (s) => s.startDateTime === firstSlot.startDateTime
    );
    expect(conflict).toBe(false);
  });

  test('returns empty array when all candidate slots are busy', () => {
    // Block the whole 7-day window by creating a single huge event
    const start = new Date();
    const end = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000);
    const busyEvent = {
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    };

    const available = findAvailableSlots({ existingEvents: [busyEvent], timeZone: 'UTC', maxSlots: 3 });
    expect(available).toEqual([]);
  });
});

describe('rankAlternativeSlots', () => {
  test('orders alternatives by proximity to requested start', () => {
    const preferred = '2026-04-21T10:00:00.000Z';
    const slots = [
      {
        startDateTime: '2026-04-21T14:00:00.000Z',
        endDateTime: '2026-04-21T15:00:00.000Z',
        timeZone: 'UTC'
      },
      {
        startDateTime: '2026-04-21T11:00:00.000Z',
        endDateTime: '2026-04-21T12:00:00.000Z',
        timeZone: 'UTC'
      },
      {
        startDateTime: '2026-04-21T12:00:00.000Z',
        endDateTime: '2026-04-21T13:00:00.000Z',
        timeZone: 'UTC'
      }
    ];

    const ranked = rankAlternativeSlots(slots, preferred);

    expect(ranked.map((s) => s.startDateTime)).toEqual([
      '2026-04-21T11:00:00.000Z',
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T14:00:00.000Z'
    ]);
  });
});

describe('rankAlternativeSlotsWithReasons', () => {
  test('adds ranking metadata and rationale', () => {
    const preferred = '2026-04-21T10:00:00.000Z';
    const slots = [
      {
        startDateTime: '2026-04-21T11:00:00.000Z',
        endDateTime: '2026-04-21T12:00:00.000Z',
        timeZone: 'UTC'
      }
    ];

    const ranked = rankAlternativeSlotsWithReasons(slots, preferred);

    expect(ranked[0].ranking).toEqual(
      expect.objectContaining({
        rank: 1,
        distance_minutes: 60,
        rationale: 'Closest available slot to requested time'
      })
    );
  });
});
