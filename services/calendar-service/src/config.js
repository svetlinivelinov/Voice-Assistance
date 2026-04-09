const { Joi, validateEnv } = require('@voice-assistant/shared');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  SERVICE_NAME: Joi.string().default('calendar-service'),
  PORT: Joi.number().integer().min(1).max(65535).default(3003),
  GOOGLE_CALENDAR_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  GOOGLE_CALENDAR_ID: Joi.string().default('primary'),
  CALENDAR_TIME_ZONE: Joi.string().default('UTC'),
  CALENDAR_ALTERNATIVE_RANKING_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  GOOGLE_SERVICE_ACCOUNT_JSON: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  GOOGLE_REFRESH_TOKEN: Joi.string().allow('').default('')
});

function getConfig(env = process.env) {
  const validated = validateEnv(envSchema, env);

  return {
    nodeEnv: validated.NODE_ENV,
    serviceName: validated.SERVICE_NAME,
    port: Number(validated.PORT),
    googleCalendarEnabled: validated.GOOGLE_CALENDAR_ENABLED,
    googleCalendarId: validated.GOOGLE_CALENDAR_ID,
    calendarTimeZone: validated.CALENDAR_TIME_ZONE,
    calendarAlternativeRankingEnabled: validated.CALENDAR_ALTERNATIVE_RANKING_ENABLED,
    googleServiceAccountJson: validated.GOOGLE_SERVICE_ACCOUNT_JSON,
    googleClientId: validated.GOOGLE_CLIENT_ID,
    googleClientSecret: validated.GOOGLE_CLIENT_SECRET,
    googleRefreshToken: validated.GOOGLE_REFRESH_TOKEN
  };
}

module.exports = {
  getConfig
};
