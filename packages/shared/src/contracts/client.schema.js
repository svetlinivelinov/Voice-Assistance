const Joi = require("joi");

const clientSchema = Joi.object({
  client_id: Joi.string().required(),
  name: Joi.string().allow(""),
  phone: Joi.string().allow(""),
  budget: Joi.number().min(0).default(0),
  location: Joi.string().allow(""),
  property_type: Joi.string().allow(""),
  move_in_date: Joi.string().allow(""),
  viewing_date: Joi.string().allow(""),
  notes: Joi.string().allow(""),
  status: Joi.string().allow("")
});

module.exports = {
  clientSchema
};
