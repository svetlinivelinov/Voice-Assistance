const { Joi, validateEnv } = require('@voice-assistant/shared');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  SERVICE_NAME: Joi.string().default('crm-service'),
  PORT: Joi.number().integer().min(1).max(65535).default(3004),
  GOOGLE_SHEETS_ENABLED: Joi.boolean().default(false),
  GOOGLE_SHEET_ID: Joi.string().when('GOOGLE_SHEETS_ENABLED', {
    is: true,
    then: Joi.required()
  }),
  GOOGLE_SERVICE_ACCOUNT_JSON: Joi.string().optional(),
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_REFRESH_TOKEN: Joi.string().optional()
});

function getConfig(env = process.env) {
  const validated = validateEnv(envSchema, env);

  return {
    nodeEnv: validated.NODE_ENV,
    serviceName: validated.SERVICE_NAME,
    port: Number(validated.PORT),
    googleSheetsEnabled: validated.GOOGLE_SHEETS_ENABLED,
    googleSheetId: validated.GOOGLE_SHEET_ID,
    googleServiceAccountJson: validated.GOOGLE_SERVICE_ACCOUNT_JSON,
    googleClientId: validated.GOOGLE_CLIENT_ID,
    googleClientSecret: validated.GOOGLE_CLIENT_SECRET,
    googleRefreshToken: validated.GOOGLE_REFRESH_TOKEN
  };
}

module.exports = {
  getConfig
};
