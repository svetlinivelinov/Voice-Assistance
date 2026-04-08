// TODO: Replace with NLP service intent/entity extraction when nlp-intent-service is implemented.
// This module provides deterministic regex-based extraction as an MVP placeholder.

const PROPERTY_TYPE_PATTERNS = [
  { pattern: /\bapartment\b/i, value: 'apartment' },
  { pattern: /\bflat\b/i, value: 'apartment' },
  { pattern: /\bhouse\b/i, value: 'house' },
  { pattern: /\bvilla\b/i, value: 'house' },
  { pattern: /\btownhouse\b/i, value: 'house' },
  { pattern: /\bstudio\b/i, value: 'studio' },
  { pattern: /\bcondo\b/i, value: 'condo' }
];

// Matches: 1500, 500000, 2,000, 1500-2000, "around 1500", "$1,500"
// First alternative: 3+ consecutive digits (handles 1500, 500000, 1500-2000).
// Second alternative: comma-formatted numbers like 1,500 or 1,500-2,000.
const BUDGET_PATTERN = /(?:around\s+|about\s+|\$)?(\d{3,}(?:,\d{3})*(?:\s*[-–]\s*\d{3,}(?:,\d{3})*)?|\d{1,3}(?:,\d{3})+(?:\s*[-–]\s*\d{1,3}(?:,\d{3})+)?)\s*(?:BGN|USD|EUR|dollars?|lev[ai]?)?/i;

// Loose international phone: +1-555-123-4567, 0888 123 456, (555) 123-4567 etc.
// Optional leading open-paren to handle formats like (555) 123-4567.
const PHONE_PATTERN = /(?:\+?[(]?\d[\d\s\-().]{7,}\d)/;

function extractPropertyType(transcript) {
  for (const { pattern, value } of PROPERTY_TYPE_PATTERNS) {
    if (pattern.test(transcript)) {
      return value;
    }
  }

  return null;
}

function extractBudget(transcript) {
  const match = BUDGET_PATTERN.exec(transcript);
  if (match) {
    return match[1].replace(/,/g, '').replace(/\s+/g, '-');
  }

  return null;
}

function extractPhone(transcript) {
  const match = PHONE_PATTERN.exec(transcript);
  if (match) {
    const cleaned = match[0].replace(/\s+/g, '').trim();
    // Require at least 7 digits to avoid false positives
    const digits = cleaned.replace(/\D/g, '');
    return digits.length >= 7 ? cleaned : null;
  }

  return null;
}

/**
 * Extract entities from an ASR transcript.
 * Returns only fields that could be confidently identified.
 * @param {string} transcript
 * @returns {Record<string, string>}
 */
function extractEntitiesFromTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string') {
    return {};
  }

  const entities = {};

  const propertyType = extractPropertyType(transcript);
  if (propertyType) {
    entities.property_type = propertyType;
  }

  const budget = extractBudget(transcript);
  if (budget) {
    entities.budget = budget;
  }

  const phone = extractPhone(transcript);
  if (phone) {
    entities.phone = phone;
  }

  return entities;
}

module.exports = {
  extractEntitiesFromTranscript,
  extractPropertyType,
  extractBudget,
  extractPhone
};
