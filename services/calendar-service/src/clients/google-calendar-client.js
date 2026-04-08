const { google } = require('googleapis');

/**
 * Build an authenticated Google Calendar API client using a service-account
 * JSON key supplied via environment variable, OR via OAuth2 access+refresh
 * tokens for user-delegated access.
 *
 * For MVP we accept either:
 *   - GOOGLE_SERVICE_ACCOUNT_JSON (stringified service-account key)
 *   - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
 */
function buildGoogleAuth(config) {
  if (config.googleServiceAccountJson) {
    const key = JSON.parse(config.googleServiceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });
    return auth;
  }

  const oauth2 = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  );
  oauth2.setCredentials({ refresh_token: config.googleRefreshToken });
  return oauth2;
}

function createGoogleCalendarClient(config) {
  const auth = buildGoogleAuth(config);
  const calendar = google.calendar({ version: 'v3', auth });

  /**
   * List events in a time window.
   * @param {string} calendarId
   * @param {string} timeMin  ISO 8601
   * @param {string} timeMax  ISO 8601
   * @returns {Promise<Array>}
   */
  async function listEvents({ calendarId, timeMin, timeMax }) {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    return response.data.items || [];
  }

  /**
   * Create a booking event.
   * @param {Object} params
   * @param {string} params.calendarId
   * @param {string} params.summary
   * @param {string} params.description
   * @param {string} params.startDateTime  ISO 8601
   * @param {string} params.endDateTime    ISO 8601
   * @param {string} params.timeZone
   * @param {string} params.sessionId      stored in extendedProperties
   * @returns {Promise<Object>}  created event
   */
  async function createEvent({ calendarId, summary, description, startDateTime, endDateTime, timeZone, sessionId }) {
    const response = await calendar.events.insert({
      calendarId,
      resource: {
        summary,
        description,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
        extendedProperties: {
          private: { sessionId: sessionId || '' }
        }
      }
    });
    return response.data;
  }

  return {
    listEvents,
    createEvent
  };
}

module.exports = {
  createGoogleCalendarClient
};
