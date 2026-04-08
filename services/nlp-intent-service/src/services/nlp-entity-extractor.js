'use strict';

/**
 * Regex-based entity extractor for real-estate voice assistant.
 * Mirrors and extends the patterns in telephony-service's entity-extractor.js
 * with additional support for location, name, and move_in_date extraction.
 */

const PROPERTY_TYPE_PATTERNS = [
  { pattern: /\bstudio\b/i, value: 'studio' },
  { pattern: /\bcondo\b/i, value: 'condo' },
  { pattern: /\bapartment\b/i, value: 'apartment' },
  { pattern: /\bflat\b/i, value: 'apartment' },
  { pattern: /\bhouse\b/i, value: 'house' },
  { pattern: /\bvilla\b/i, value: 'house' },
  { pattern: /\btownhouse\b/i, value: 'house' }
];

// Matches: 1500, 500000, 2,000, 1500-2000, "around 1500", "$1,500"
const BUDGET_PATTERN =
  /(?:around\s+|about\s+|\$)?(\d{3,}(?:,\d{3})*(?:\s*[-–]\s*\d{3,}(?:,\d{3})*)?|\d{1,3}(?:,\d{3})+(?:\s*[-–]\s*\d{1,3}(?:,\d{3})+)?)\s*(?:BGN|USD|EUR|dollars?|lev[ai]?)?/i;

// Loose international phone: +1-555-123-4567, 0888 123 456, (555) 123-4567 etc.
const PHONE_PATTERN = /(?:\+?[(]?\d[\d\s\-().]{7,}\d)/;

// "my name is John Smith", "I'm Maria", "this is Alex", "call me Bob"
const NAME_PATTERNS = [
  /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  /\bI(?:'m| am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  /\bthis\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  /\bcall\s+me\s+([A-Z][a-z]+)\b/i
];

// Month names + optional year, or "next month", "this month", "in [Month]"
const DATE_PATTERNS = [
  /\b(?:in\s+)?(?:early\s+|late\s+|mid[-\s]?)?(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i,
  /\bnext\s+month\b/i,
  /\bthis\s+month\b/i,
  /\bin\s+(\d{1,2})\s+months?\b/i,
  /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}|\d{2}))?\b/
];

// Location: "in [City/Area]", "near [Place]", "[Place] area", "[Place] district"
// Capture what follows "in", "near", or precedes "area"/"district"/"neighbourhood"
const LOCATION_PATTERNS = [
  /\blooking\s+in\s+([A-Z][a-zA-Z\s]{2,30?}?)(?:\s+area|\s+district|\s+neighbourhood|\s+neighborhood|[,.]|$)/i,
  /\bin\s+([A-Z][a-zA-Z\s]{2,25?})(?:\s+area|\s+district|\s+neighbourhood|\s+neighborhood)\b/i,
  /\bnear\s+([A-Z][a-zA-Z\s]{2,25?})(?:[,.]|$)/i,
  /\b([A-Z][a-zA-Z\s]{2,25?})\s+(?:area|district|neighbourhood|neighborhood)\b/i,
  /\bdowntown\s+([A-Z][a-zA-Z\s]{2,25?})(?:[,.]|$)/i,
  // Fallback: "in [Capitalized City]" — matches "in Austin", "in New York", "in San Francisco"
  // Uses strict uppercase [A-Z] (no /i flag) so it won't match "in a", "in the", "in 2", etc.
  /\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/
];

function extractPropertyType(text) {
  for (const { pattern, value } of PROPERTY_TYPE_PATTERNS) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function extractBudget(text) {
  const match = BUDGET_PATTERN.exec(text);
  if (match) {
    return match[1].replace(/,/g, '').replace(/\s+/g, '-');
  }
  return null;
}

function extractPhone(text) {
  const match = PHONE_PATTERN.exec(text);
  if (match) {
    const cleaned = match[0].replace(/\s+/g, '').trim();
    const digits = cleaned.replace(/\D/g, '');
    return digits.length >= 7 ? cleaned : null;
  }
  return null;
}

function extractName(text) {
  for (const pattern of NAME_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Avoid matching single common words that are likely not names
      const stopWords = /^(the|a|an|my|your|our|this|that|it|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall)$/i;
      if (!stopWords.test(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function extractMoveInDate(text) {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

function extractLocation(text) {
  for (const pattern of LOCATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract structured entities from free-form text.
 * Returns only fields that could be confidently identified.
 * @param {string} text
 * @returns {Record<string, string>}
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {};
  }

  const entities = {};

  const propertyType = extractPropertyType(text);
  if (propertyType) entities.property_type = propertyType;

  const budget = extractBudget(text);
  if (budget) entities.budget = budget;

  const phone = extractPhone(text);
  if (phone) entities.phone = phone;

  const name = extractName(text);
  if (name) entities.name = name;

  const moveInDate = extractMoveInDate(text);
  if (moveInDate) entities.move_in_date = moveInDate;

  const location = extractLocation(text);
  if (location) entities.location = location;

  return entities;
}

module.exports = {
  extractEntities,
  extractPropertyType,
  extractBudget,
  extractPhone,
  extractName,
  extractMoveInDate,
  extractLocation
};
