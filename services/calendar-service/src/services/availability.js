const SLOT_DURATION_MS = 60 * 60 * 1000; // 1 hour per viewing slot
const WORKING_HOUR_START = 9;             // 09:00
const WORKING_HOUR_END = 17;             // 17:00
const DAYS_AHEAD = 7;                    // look 7 days forward

/**
 * Check whether a proposed time window overlaps any existing events.
 * @param {Array}  events             from calendar.listEvents
 * @param {string} startDateTime      ISO 8601
 * @param {string} endDateTime        ISO 8601
 * @returns {boolean}
 */
function hasConflict(events, startDateTime, endDateTime) {
  const start = new Date(startDateTime).getTime();
  const end = new Date(endDateTime).getTime();

  return events.some((event) => {
    const evStart = new Date(event.start?.dateTime || event.start?.date).getTime();
    const evEnd = new Date(event.end?.dateTime || event.end?.date).getTime();
    // Overlap when: start < evEnd AND end > evStart
    return start < evEnd && end > evStart;
  });
}

/**
 * Generate candidate hourly slots inside working hours for the next DAYS_AHEAD days.
 * @param {string} timeZone   IANA tz (e.g. "Europe/Sofia")
 * @param {Date}   [from]     start search from this date (default: now)
 * @returns {Array<{startDateTime: string, endDateTime: string}>}
 */
function generateCandidateSlots(timeZone, from) {
  const slots = [];
  const baseDate = from ? new Date(from) : new Date();

  // Snap forward to the next whole hour
  baseDate.setMinutes(0, 0, 0);
  baseDate.setHours(baseDate.getHours() + 1);

  for (let day = 0; day < DAYS_AHEAD; day++) {
    const cursor = new Date(baseDate);
    cursor.setDate(cursor.getDate() + day);

    // Skip weekends (0 = Sunday, 6 = Saturday)
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    for (let hour = WORKING_HOUR_START; hour < WORKING_HOUR_END; hour++) {
      const slotStart = new Date(cursor);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);

      // Discard slots in the past
      if (slotStart <= new Date()) {
        continue;
      }

      slots.push({
        startDateTime: slotStart.toISOString(),
        endDateTime: slotEnd.toISOString(),
        timeZone
      });
    }
  }

  return slots;
}

/**
 * Find available (non-conflicting) slots.
 * @param {Object} params
 * @param {Array}  params.existingEvents
 * @param {string} params.timeZone
 * @param {number} [params.maxSlots=3]
 * @param {Date}   [params.from]
 * @returns {Array<{startDateTime, endDateTime, timeZone}>}
 */
function findAvailableSlots({ existingEvents, timeZone, maxSlots = 3, from }) {
  const candidates = generateCandidateSlots(timeZone, from);
  const available = [];

  for (const slot of candidates) {
    if (!hasConflict(existingEvents, slot.startDateTime, slot.endDateTime)) {
      available.push(slot);
      if (available.length >= maxSlots) {
        break;
      }
    }
  }

  return available;
}

module.exports = {
  hasConflict,
  generateCandidateSlots,
  findAvailableSlots,
  SLOT_DURATION_MS,
  WORKING_HOUR_START,
  WORKING_HOUR_END
};
