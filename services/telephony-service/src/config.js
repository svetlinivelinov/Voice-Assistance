const { Joi, validateEnv } = require('@voice-assistant/shared');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  SERVICE_NAME: Joi.string().default('telephony-service'),
  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  TELNYX_PUBLIC_KEY: Joi.string().allow('').default(''),
  TELNYX_API_KEY: Joi.string().allow('').default(''),
  TELNYX_API_BASE_URL: Joi.string().uri().default('https://api.telnyx.com/v2'),
  TELNYX_API_TIMEOUT_MS: Joi.number().integer().min(100).default(8000),
  MAX_RETRIES: Joi.number().integer().min(0).default(3),
  VOICE_LOOP_GREETING: Joi.string().default('Hello. Thanks for calling. How can I help you with your property search today?'),
  ASR_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(true),
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  OPENAI_WHISPER_MODEL: Joi.string().default('whisper-1'),
  ASR_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),
  ASR_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.6),
  TTS_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(true),
  ELEVENLABS_API_KEY: Joi.string().allow('').default(''),
  ELEVENLABS_VOICE_ID: Joi.string().allow('').default(''),
  ELEVENLABS_MODEL: Joi.string().default('eleven_multilingual_v2'),
  TTS_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),
  CONVERSATION_ENGINE_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  CONVERSATION_ENGINE_BASE_URL: Joi.string().uri().default('http://localhost:3002'),
  CONVERSATION_ENGINE_TIMEOUT_MS: Joi.number().integer().min(100).default(2500),
  CRM_SERVICE_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  CRM_SERVICE_BASE_URL: Joi.string().uri().default('http://localhost:3004'),
  CRM_SERVICE_TIMEOUT_MS: Joi.number().integer().min(100).default(2500),
  CRM_RECOVERY_QUEUE_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(true),
  CRM_RECOVERY_QUEUE_PERSIST_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  CRM_RECOVERY_QUEUE_FILE_PATH: Joi.string().default('./data/telephony-pending-leads.json'),
  CRM_RECOVERY_QUEUE_TTL_HOURS: Joi.number().integer().min(1).max(24 * 365).default(168),
  CRM_RECOVERY_METRICS_LOG_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  CRM_RECOVERY_METRICS_LOG_INTERVAL_MS: Joi.number().integer().min(1000).default(60000),
  NLP_SERVICE_ENABLED: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  NLP_SERVICE_BASE_URL: Joi.string().uri().default('http://localhost:3005'),
  NLP_SERVICE_TIMEOUT_MS: Joi.number().integer().min(100).default(2500)
});

function getConfig(env = process.env) {
  const validated = validateEnv(envSchema, env);

  return {
    nodeEnv: validated.NODE_ENV,
    serviceName: validated.SERVICE_NAME,
    port: Number(validated.PORT),
    telnyxPublicKey: validated.TELNYX_PUBLIC_KEY,
    telnyxApiKey: validated.TELNYX_API_KEY,
    telnyxApiBaseUrl: validated.TELNYX_API_BASE_URL,
    telnyxApiTimeoutMs: Number(validated.TELNYX_API_TIMEOUT_MS),
    maxRetries: Number(validated.MAX_RETRIES),
    voiceLoopGreeting: validated.VOICE_LOOP_GREETING,
    asrEnabled: validated.ASR_ENABLED,
    openaiApiKey: validated.OPENAI_API_KEY,
    openaiWhisperModel: validated.OPENAI_WHISPER_MODEL,
    asrTimeoutMs: Number(validated.ASR_TIMEOUT_MS),
    asrMinConfidence: Number(validated.ASR_MIN_CONFIDENCE),
    ttsEnabled: validated.TTS_ENABLED,
    elevenlabsApiKey: validated.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: validated.ELEVENLABS_VOICE_ID,
    elevenlabsModel: validated.ELEVENLABS_MODEL,
    ttsTimeoutMs: Number(validated.TTS_TIMEOUT_MS),
    conversationEngineEnabled: validated.CONVERSATION_ENGINE_ENABLED,
    conversationEngineBaseUrl: validated.CONVERSATION_ENGINE_BASE_URL,
    conversationEngineTimeoutMs: Number(validated.CONVERSATION_ENGINE_TIMEOUT_MS),
    crmServiceEnabled: validated.CRM_SERVICE_ENABLED,
    crmServiceBaseUrl: validated.CRM_SERVICE_BASE_URL,
    crmServiceTimeoutMs: Number(validated.CRM_SERVICE_TIMEOUT_MS),
    crmRecoveryQueueEnabled: validated.CRM_RECOVERY_QUEUE_ENABLED,
    crmRecoveryQueuePersistEnabled: validated.CRM_RECOVERY_QUEUE_PERSIST_ENABLED,
    crmRecoveryQueueFilePath: validated.CRM_RECOVERY_QUEUE_FILE_PATH,
    crmRecoveryQueueTtlHours: Number(validated.CRM_RECOVERY_QUEUE_TTL_HOURS),
    crmRecoveryMetricsLogEnabled: validated.CRM_RECOVERY_METRICS_LOG_ENABLED,
    crmRecoveryMetricsLogIntervalMs: Number(validated.CRM_RECOVERY_METRICS_LOG_INTERVAL_MS),
    nlpServiceEnabled: validated.NLP_SERVICE_ENABLED,
    nlpServiceBaseUrl: validated.NLP_SERVICE_BASE_URL,
    nlpServiceTimeoutMs: Number(validated.NLP_SERVICE_TIMEOUT_MS)
  };
}

module.exports = {
  getConfig
};
