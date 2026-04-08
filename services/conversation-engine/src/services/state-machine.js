const REQUIRED_FIELDS = [
  'name',
  'phone',
  'budget',
  'location',
  'property_type',
  'move_in_date',
  'viewing_date'
];

const FIELD_PROMPTS = {
  name: 'Could you share your full name?',
  phone: 'What is the best phone number to reach you?',
  budget: 'What is your budget range for the property?',
  location: 'Which area are you interested in?',
  property_type: 'Are you looking for an apartment, house, or another property type?',
  move_in_date: 'When are you planning to move in?',
  viewing_date: 'What date works best for a property viewing?'
};

function normalizeEntities(entities) {
  if (!entities || typeof entities !== 'object' || Array.isArray(entities)) {
    return {};
  }

  return Object.entries(entities).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function hasEntityUpdates(previousEntities, incomingEntities) {
  return Object.entries(incomingEntities).some(([key, value]) => previousEntities[key] !== value);
}

function resolveMissingFields(entities) {
  return REQUIRED_FIELDS.filter((field) => !entities[field]);
}

function resolveStep(missingFields) {
  if (!missingFields.length) {
    return 'completed';
  }

  return `collect_${missingFields[0]}`;
}

function resolveIntent(providedIntent, missingFields) {
  if (providedIntent) {
    return providedIntent;
  }

  return missingFields.length ? 'collect_requirements' : 'schedule_viewing';
}

function resolveReplyText({ missingFields, hasNewEntityData, intent }) {
  if (!missingFields.length) {
    return 'Great, I have all required details. I can proceed to scheduling options.';
  }

  if (!hasNewEntityData && (intent === 'fallback' || intent === 'unknown')) {
    return `I did not catch that. Could you repeat your ${missingFields[0]}?`;
  }

  return FIELD_PROMPTS[missingFields[0]];
}

function buildNextSessionState({ previousSession, incomingSession }) {
  const normalizedIncomingEntities = normalizeEntities(incomingSession.entities);
  const mergedEntities = {
    ...(previousSession?.entities || {}),
    ...normalizedIncomingEntities
  };

  const missingFields = resolveMissingFields(mergedEntities);
  const timestamp = new Date().toISOString();
  const hasNewEntityData = hasEntityUpdates(previousSession?.entities || {}, normalizedIncomingEntities);

  const nextSession = {
    session_id: incomingSession.session_id,
    step: resolveStep(missingFields),
    intent: resolveIntent(incomingSession.intent, missingFields),
    entities: mergedEntities,
    missing_fields: missingFields,
    timestamp
  };

  return {
    session: nextSession,
    replyText: resolveReplyText({
      missingFields,
      hasNewEntityData,
      intent: incomingSession.intent
    })
  };
}

module.exports = {
  buildNextSessionState,
  resolveReplyText,
  REQUIRED_FIELDS
};
