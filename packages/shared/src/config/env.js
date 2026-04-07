const Joi = require("joi");

function validateEnv(schema, env) {
  const { value, error } = schema.validate(env, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map((d) => d.message).join(", ");
    throw new Error(`Environment validation failed: ${details}`);
  }

  return value;
}

module.exports = {
  Joi,
  validateEnv
};
