const express = require('express');
const { error: errorResponse, ok, ERROR_CODES, Joi } = require('@voice-assistant/shared');
const {
  findAvailableSlots,
  hasConflict,
  rankAlternativeSlots,
  rankAlternativeSlotsWithReasons
} = require('../services/availability');

const router = express.Router();

const bookingRequestSchema = Joi.object({
  session_id: Joi.string().required(),
  summary: Joi.string().default('Property Viewing'),
  description: Joi.string().allow('').default(''),
  start_datetime: Joi.string().isoDate().required(),
  end_datetime: Joi.string().isoDate().required(),
  time_zone: Joi.string().default('UTC')
});

/**
 * GET /api/bookings/availability
 * Returns up to 3 free hourly slots in the configured calendar.
 */
router.get('/bookings/availability', async (req, res) => {
  const calendarClient = req.app.locals.calendarClient;
  const config = req.app.locals.config;

  if (!calendarClient) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'Calendar client not configured',
      { requestId: req.requestId },
      503
    );
  }

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000); // 8 days ahead

    const existingEvents = await calendarClient.listEvents({
      calendarId: config.googleCalendarId,
      timeMin: now.toISOString(),
      timeMax: windowEnd.toISOString()
    });

    const slots = findAvailableSlots({
      existingEvents,
      timeZone: config.calendarTimeZone,
      maxSlots: 3
    });

    return ok(res, {
      available_slots: slots,
      requestId: req.requestId
    });
  } catch (err) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to fetch calendar availability',
      { requestId: req.requestId, reason: err.message },
      500
    );
  }
});

/**
 * POST /api/bookings
 * Create a confirmed viewing booking linked to a session.
 */
router.post('/bookings', async (req, res) => {
  const calendarClient = req.app.locals.calendarClient;
  const config = req.app.locals.config;
  const bookingIdempotencyStore = req.app.locals.bookingIdempotencyStore;

  if (!calendarClient) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'Calendar client not configured',
      { requestId: req.requestId },
      503
    );
  }

  const { error: validationError, value } = bookingRequestSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (validationError) {
    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid booking request',
      {
        requestId: req.requestId,
        issues: validationError.details.map((d) => d.message)
      },
      400
    );
  }

  const bookingKey = `${value.session_id}|${value.start_datetime}|${value.end_datetime}`;
  const existingBooking = bookingIdempotencyStore?.get(bookingKey);
  if (existingBooking) {
    return ok(res, {
      booking: existingBooking,
      requestId: req.requestId,
      idempotent_replay: true
    });
  }

  try {
    const now = new Date();
    const windowEnd = new Date(new Date(value.end_datetime).getTime() + 60 * 1000);

    const existingEvents = await calendarClient.listEvents({
      calendarId: config.googleCalendarId,
      timeMin: now.toISOString(),
      timeMax: windowEnd.toISOString()
    });

    if (hasConflict(existingEvents, value.start_datetime, value.end_datetime)) {
      const generatedAlternatives = findAvailableSlots({
        existingEvents,
        timeZone: value.time_zone || config.calendarTimeZone,
        maxSlots: 3,
        from: new Date(value.start_datetime)
      });
      const alternativeSlots = config.calendarAlternativeRankingEnabled
        ? rankAlternativeSlotsWithReasons(
            rankAlternativeSlots(generatedAlternatives, value.start_datetime),
            value.start_datetime
          )
        : generatedAlternatives;

      return errorResponse(
        res,
        ERROR_CODES.BAD_REQUEST,
        'Requested time slot has a conflict',
        {
          requestId: req.requestId,
          start_datetime: value.start_datetime,
          end_datetime: value.end_datetime,
          alternative_slots: alternativeSlots
        },
        409
      );
    }

    const event = await calendarClient.createEvent({
      calendarId: config.googleCalendarId,
      summary: value.summary,
      description: value.description,
      startDateTime: value.start_datetime,
      endDateTime: value.end_datetime,
      timeZone: value.time_zone,
      sessionId: value.session_id
    });

    const booking = {
      event_id: event.id,
      html_link: event.htmlLink,
      summary: event.summary,
      start: event.start,
      end: event.end,
      session_id: value.session_id
    };

    bookingIdempotencyStore?.set(bookingKey, booking);

    return ok(res, {
      booking,
      requestId: req.requestId
    });
  } catch (err) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to create booking',
      { requestId: req.requestId, reason: err.message },
      500
    );
  }
});

module.exports = router;
