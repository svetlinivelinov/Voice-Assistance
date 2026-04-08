const { Joi, validateEnv } = require('@voice-assistant/shared');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  SERVICE_NAME: Joi.string().default('nlp-intent-service'),
  PORT: Joi.number().integer().min(1).max(65535).default(3005),
  NLP_PROVIDER: Joi.string().valid('regex', 'openai').default('regex')
});

function getConfig(env = process.env) {
  const validated = validateEnv(envSchema, env);

  return {
    nodeEnv: validated.NODE_ENV,
    serviceName: validated.SERVICE_NAME,
    port: Number(validated.PORT),
    nlpProvider: validated.NLP_PROVIDER
  };
}

module.exports = {
  getConfig
};
