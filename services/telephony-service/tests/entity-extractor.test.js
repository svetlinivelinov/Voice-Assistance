const {
  extractEntitiesFromTranscript,
  extractPropertyType,
  extractBudget,
  extractPhone
} = require('../src/utils/entity-extractor');

describe('extractPropertyType', () => {
  test.each([
    ['I need an apartment', 'apartment'],
    ['looking for a flat downtown', 'apartment'],
    ['want a house in the suburbs', 'house'],
    ['villa by the sea', 'house'],
    ['a studio is fine', 'studio'],
    ['interested in a condo', 'condo'],
    ['townhouse preferred', 'house']
  ])('extracts from "%s"', (transcript, expected) => {
    expect(extractPropertyType(transcript)).toBe(expected);
  });

  test('returns null when no property type found', () => {
    expect(extractPropertyType('I want to schedule a viewing')).toBeNull();
  });
});

describe('extractBudget', () => {
  test.each([
    ['my budget is 1500', '1500'],
    ['around 2000 BGN per month', '2000'],
    ['somewhere between 1500-2000', '1500-2000'],
    ['$1,500 is my limit', '1500'],
    ['budget of 500000', '500000']
  ])('extracts from "%s"', (transcript, expected) => {
    expect(extractBudget(transcript)).toBe(expected);
  });

  test('returns null for transcript with no numbers', () => {
    expect(extractBudget('I want a nice place to live')).toBeNull();
  });
});

describe('extractPhone', () => {
  test.each([
    ['call me at +1-555-123-4567', '+1-555-123-4567'],
    ['my number is 0888 123 456', '0888123456'],
    ['reach me on (555) 123-4567', '(555)123-4567']
  ])('extracts from "%s"', (transcript, expected) => {
    expect(extractPhone(transcript)).toBe(expected);
  });

  test('returns null when no phone pattern found', () => {
    expect(extractPhone('I am Jane Doe')).toBeNull();
  });

  test('returns null for too-short digit sequences', () => {
    expect(extractPhone('call 123')).toBeNull();
  });
});

describe('extractEntitiesFromTranscript', () => {
  test('returns empty object for null/non-string input', () => {
    expect(extractEntitiesFromTranscript(null)).toEqual({});
    expect(extractEntitiesFromTranscript(42)).toEqual({});
  });

  test('extracts multiple entities from a single transcript', () => {
    const result = extractEntitiesFromTranscript(
      'I need a two-bedroom apartment, budget around 1500, call me at +1-555-000-1234'
    );
    expect(result.property_type).toBe('apartment');
    expect(result.budget).toBe('1500');
    expect(result.phone).toBe('+1-555-000-1234');
  });

  test('returns only the fields that matched', () => {
    const result = extractEntitiesFromTranscript('I want a house');
    expect(result.property_type).toBe('house');
    expect(result.budget).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  test('returns empty object for unrecognised transcript', () => {
    expect(extractEntitiesFromTranscript('yes please that sounds good')).toEqual({});
  });
});
