const {
  normalizeEntities,
  hasEntityUpdates,
  resolveMissingFields,
  resolveStep,
  resolveIntent,
  resolveReplyText,
  buildNextSessionState,
  REQUIRED_FIELDS
} = require('../src/services/state-machine');

describe('normalizeEntities', () => {
  test('returns empty object for null/undefined/array input', () => {
    expect(normalizeEntities(null)).toEqual({});
    expect(normalizeEntities(undefined)).toEqual({});
    expect(normalizeEntities([])).toEqual({});
  });

  test('strips fields with empty string, null, or undefined values', () => {
    expect(normalizeEntities({ name: 'Jane', phone: '', location: null, budget: undefined }))
      .toEqual({ name: 'Jane' });
  });

  test('keeps all truthy fields', () => {
    expect(normalizeEntities({ name: 'Jane', phone: '555' })).toEqual({ name: 'Jane', phone: '555' });
  });
});

describe('hasEntityUpdates', () => {
  test('returns true when incoming has a new key value', () => {
    expect(hasEntityUpdates({ name: 'Jane' }, { phone: '555' })).toBe(true);
  });

  test('returns false when incoming has no new or changed values', () => {
    expect(hasEntityUpdates({ name: 'Jane' }, { name: 'Jane' })).toBe(false);
  });

  test('returns true when a value changed', () => {
    expect(hasEntityUpdates({ name: 'Jane' }, { name: 'John' })).toBe(true);
  });

  test('returns false for empty incoming entities', () => {
    expect(hasEntityUpdates({ name: 'Jane' }, {})).toBe(false);
  });
});

describe('resolveMissingFields', () => {
  test('returns all REQUIRED_FIELDS when entities is empty', () => {
    expect(resolveMissingFields({})).toEqual(REQUIRED_FIELDS);
  });

  test('returns empty when all fields present', () => {
    const full = Object.fromEntries(REQUIRED_FIELDS.map((f) => [f, 'value']));
    expect(resolveMissingFields(full)).toEqual([]);
  });

  test('returns only the missing subset', () => {
    const partial = { name: 'Jane', phone: '555' };
    const missing = resolveMissingFields(partial);
    expect(missing).not.toContain('name');
    expect(missing).not.toContain('phone');
    expect(missing).toContain('budget');
    expect(missing).toContain('viewing_date');
  });
});

describe('resolveStep', () => {
  test('returns completed when no missing fields', () => {
    expect(resolveStep([])).toBe('completed');
  });

  test('returns collect_{first missing field}', () => {
    expect(resolveStep(['phone', 'budget'])).toBe('collect_phone');
    expect(resolveStep(['property_type'])).toBe('collect_property_type');
  });
});

describe('resolveIntent', () => {
  test('returns provided intent when given', () => {
    expect(resolveIntent('fallback', ['phone'])).toBe('fallback');
    expect(resolveIntent('schedule_viewing', [])).toBe('schedule_viewing');
  });

  test('infers collect_requirements when fields are missing and no intent provided', () => {
    expect(resolveIntent('', ['phone'])).toBe('collect_requirements');
    expect(resolveIntent(undefined, ['budget'])).toBe('collect_requirements');
  });

  test('infers schedule_viewing when all fields collected and no intent provided', () => {
    expect(resolveIntent('', [])).toBe('schedule_viewing');
  });
});

describe('resolveReplyText', () => {
  test('returns completion message when no missing fields', () => {
    expect(resolveReplyText({ missingFields: [], hasNewEntityData: true, intent: '' }))
      .toBe('Great, I have all required details. I can proceed to scheduling options.');
  });

  test('returns fallback repeat prompt for unknown/fallback intent with no new data', () => {
    const text = resolveReplyText({ missingFields: ['phone'], hasNewEntityData: false, intent: 'unknown' });
    expect(text).toBe('I did not catch that. Could you repeat your phone?');
  });

  test('humanizes underscores in fallback prompt', () => {
    const text = resolveReplyText({ missingFields: ['property_type'], hasNewEntityData: false, intent: 'fallback' });
    expect(text).toBe('I did not catch that. Could you repeat your property type?');
  });

  test('uses enhanced recovery prompt when feature flag is enabled', () => {
    const text = resolveReplyText({
      missingFields: ['phone'],
      hasNewEntityData: false,
      intent: 'unknown',
      recoveryPromptsEnabled: true
    });
    expect(text).toBe(
      'I did not catch that clearly. Please share your phone in a short sentence. For example: My phone number is +1 555 123 4567.'
    );
  });

  test('returns FIELD_PROMPT for normal slot-fill turn', () => {
    expect(resolveReplyText({ missingFields: ['budget'], hasNewEntityData: true, intent: 'collect_requirements' }))
      .toBe('What is your budget range for the property?');
  });

  test('returns FIELD_PROMPT on first turn even without new data when intent is not fallback/unknown', () => {
    expect(resolveReplyText({ missingFields: ['location'], hasNewEntityData: false, intent: '' }))
      .toBe('Which area are you interested in?');
  });
});

describe('buildNextSessionState', () => {
  const BASE_SESSION = {
    session_id: 'sess-1',
    intent: '',
    entities: {}
  };

  test('starts collecting name on fresh session', () => {
    const { session, replyText } = buildNextSessionState({
      previousSession: null,
      incomingSession: BASE_SESSION
    });
    expect(session.step).toBe('collect_name');
    expect(session.missing_fields).toEqual(REQUIRED_FIELDS);
    expect(replyText).toBe('Could you share your full name?');
  });

  test('merges entities from previous and incoming sessions', () => {
    const prev = {
      session_id: 'sess-1',
      step: 'collect_phone',
      intent: 'collect_requirements',
      entities: { name: 'Jane' },
      missing_fields: REQUIRED_FIELDS.slice(1),
      timestamp: new Date().toISOString()
    };

    const { session } = buildNextSessionState({
      previousSession: prev,
      incomingSession: { session_id: 'sess-1', intent: '', entities: { phone: '555' } }
    });

    expect(session.entities).toMatchObject({ name: 'Jane', phone: '555' });
    expect(session.step).toBe('collect_budget');
    expect(session.missing_fields).not.toContain('name');
    expect(session.missing_fields).not.toContain('phone');
  });

  test('returns fallback reply when unknown intent with no new entity data', () => {
    const prev = {
      session_id: 'sess-1',
      entities: { name: 'Jane' },
      missing_fields: ['phone'],
      timestamp: new Date().toISOString()
    };

    const { session, replyText } = buildNextSessionState({
      previousSession: prev,
      incomingSession: { session_id: 'sess-1', intent: 'unknown', entities: {} }
    });

    expect(session.step).toBe('collect_phone');
    expect(replyText).toBe('I did not catch that. Could you repeat your phone?');
  });

  test('returns enhanced fallback reply when recovery prompt feature flag is enabled', () => {
    const prev = {
      session_id: 'sess-1',
      entities: { name: 'Jane' },
      missing_fields: ['phone'],
      timestamp: new Date().toISOString()
    };

    const { replyText } = buildNextSessionState({
      previousSession: prev,
      incomingSession: { session_id: 'sess-1', intent: 'unknown', entities: {} },
      options: { recoveryPromptsEnabled: true }
    });

    expect(replyText).toBe(
      'I did not catch that clearly. Please share your phone in a short sentence. For example: My phone number is +1 555 123 4567.'
    );
  });

  test('reaches completed state when all entities provided', () => {
    const full = Object.fromEntries(REQUIRED_FIELDS.map((f) => [f, 'value']));

    const { session, replyText } = buildNextSessionState({
      previousSession: null,
      incomingSession: { session_id: 'sess-2', intent: '', entities: full }
    });

    expect(session.step).toBe('completed');
    expect(session.missing_fields).toEqual([]);
    expect(session.intent).toBe('schedule_viewing');
    expect(replyText).toBe('Great, I have all required details. I can proceed to scheduling options.');
  });

  test('session output includes required schema fields', () => {
    const { session } = buildNextSessionState({
      previousSession: null,
      incomingSession: BASE_SESSION
    });

    expect(session).toHaveProperty('session_id');
    expect(session).toHaveProperty('step');
    expect(session).toHaveProperty('intent');
    expect(session).toHaveProperty('entities');
    expect(session).toHaveProperty('missing_fields');
    expect(session).toHaveProperty('timestamp');
    expect(typeof session.timestamp).toBe('string');
  });
});
