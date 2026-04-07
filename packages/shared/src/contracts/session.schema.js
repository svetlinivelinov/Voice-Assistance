const Joi = require("joi");

const sessionSchema = Joi.object({
  session_id: Joi.string().required(),
  step: Joi.string().allow(""),
  intent: Joi.string().allow(""),
  entities: Joi.object().default({}),
  missing_fields: Joi.array().items(Joi.string()).default([]),
  timestamp: Joi.string().allow("")
});

module.exports = {
  sessionSchema
};
