const { Joi, validateEnv } = require('@voice-assistant/shared');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  SERVICE_NAME: Joi.string().default('conversation-engine'),
  PORT: Joi.number().integer().min(1).max(65535).default(3002),
  CONVERSATION_STATE_MACHINE_ENABLED: Joi.boolean().default(true),
  CONVERSATION_RECOVERY_PROMPTS_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false)
});

function getConfig(env = process.env) {
  const validated = validateEnv(envSchema, env);

  return {
    nodeEnv: validated.NODE_ENV,
    serviceName: validated.SERVICE_NAME,
    port: Number(validated.PORT),
    conversationStateMachineEnabled: Boolean(validated.CONVERSATION_STATE_MACHINE_ENABLED),
    conversationRecoveryPromptsEnabled: Boolean(validated.CONVERSATION_RECOVERY_PROMPTS_ENABLED)
  };
}

module.exports = {
  getConfig
};
