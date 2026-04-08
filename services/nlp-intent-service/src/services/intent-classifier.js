'use strict';

/**
 * Keyword-based intent classifier for real-estate voice assistant.
 * Computes a confidence score by summing matched keyword weights.
 * Returns the best intent, its confidence (0–1), and runner-up alternatives.
 */

const INTENT_DEFINITIONS = [
  {
    intent: 'book_viewing',
    keywords: [
      { pattern: /\bbook\b/i, weight: 2 },
      { pattern: /\bschedule\b/i, weight: 2 },
      { pattern: /\bviewing\b/i, weight: 3 },
      { pattern: /\bvisit\b/i, weight: 2 },
      { pattern: /\bappointment\b/i, weight: 2 },
      { pattern: /\bsee\s+the\b/i, weight: 1 },
      { pattern: /\bview\b/i, weight: 1 },
      { pattern: /\btour\b/i, weight: 2 }
    ],
    maxScore: 15
  },
  {
    intent: 'check_availability',
    keywords: [
      { pattern: /\bavailable\b/i, weight: 3 },
      { pattern: /\bavailability\b/i, weight: 3 },
      { pattern: /\bwhen\b/i, weight: 1 },
      { pattern: /\bwhat\s+times?\b/i, weight: 2 },
      { pattern: /\bwhat\s+slots?\b/i, weight: 2 },
      { pattern: /\bfree\b/i, weight: 1 },
      { pattern: /\bopen\s+slot\b/i, weight: 2 }
    ],
    maxScore: 14
  },
  {
    intent: 'provide_budget',
    keywords: [
      { pattern: /\bbudget\b/i, weight: 3 },
      { pattern: /\bafford\b/i, weight: 3 },
      { pattern: /\bspend\b/i, weight: 2 },
      { pattern: /\bprice\b/i, weight: 2 },
      { pattern: /\bpay\b/i, weight: 1 },
      { pattern: /\bcost\b/i, weight: 1 },
      { pattern: /\brange\b/i, weight: 1 },
      { pattern: /\$[\d,]+/i, weight: 3 },
      { pattern: /\b\d{3,}(?:,\d{3})*\b/i, weight: 2 }
    ],
    maxScore: 18
  },
  {
    intent: 'provide_location',
    keywords: [
      { pattern: /\blooking\s+in\b/i, weight: 3 },
      { pattern: /\barea\b/i, weight: 2 },
      { pattern: /\bneighbourhood\b|\bneighborhood\b/i, weight: 3 },
      { pattern: /\bdistrict\b/i, weight: 3 },
      { pattern: /\bcity\b/i, weight: 2 },
      { pattern: /\bnear\b/i, weight: 1 },
      { pattern: /\bdowntown\b/i, weight: 2 },
      { pattern: /\bsuburb\b/i, weight: 2 },
      { pattern: /\blocated\b/i, weight: 1 }
    ],
    maxScore: 19
  },
  {
    intent: 'provide_property_type',
    keywords: [
      { pattern: /\bapartment\b/i, weight: 3 },
      { pattern: /\bflat\b/i, weight: 3 },
      { pattern: /\bhouse\b/i, weight: 3 },
      { pattern: /\bvilla\b/i, weight: 3 },
      { pattern: /\bstudio\b/i, weight: 3 },
      { pattern: /\bcondo\b/i, weight: 3 },
      { pattern: /\btownhouse\b/i, weight: 3 },
      { pattern: /\bproperty\s+type\b/i, weight: 2 },
      { pattern: /\blooking\s+for\s+a\b/i, weight: 1 }
    ],
    maxScore: 21
  },
  {
    intent: 'provide_date',
    keywords: [
      { pattern: /\bmove\s+in\b/i, weight: 3 },
      { pattern: /\bmoving\b/i, weight: 2 },
      { pattern: /\bavailable\s+from\b/i, weight: 3 },
      { pattern: /\bneed\s+by\b/i, weight: 2 },
      { pattern: /\bstarting\b/i, weight: 1 },
      { pattern: /\bjanuary|february|march|april|may|june|july|august|september|october|november|december\b/i, weight: 2 },
      { pattern: /\bnext\s+month\b/i, weight: 2 },
      { pattern: /\bthis\s+month\b/i, weight: 2 }
    ],
    maxScore: 17
  },
  {
    intent: 'provide_name',
    keywords: [
      { pattern: /\bmy\s+name\s+is\b/i, weight: 5 },
      { pattern: /\bi(?:'m| am)\b/i, weight: 2 },
      { pattern: /\bthis\s+is\b/i, weight: 2 },
      { pattern: /\bcall\s+me\b/i, weight: 3 },
      { pattern: /\bname\b/i, weight: 1 }
    ],
    maxScore: 13
  },
  {
    intent: 'provide_phone',
    keywords: [
      { pattern: /\bmy\s+number\b/i, weight: 4 },
      { pattern: /\bphone\b/i, weight: 3 },
      { pattern: /\bcontact\b/i, weight: 2 },
      { pattern: /\breach\s+me\b/i, weight: 3 },
      { pattern: /\bcall\s+me\s+back\b/i, weight: 3 },
      { pattern: /\bnumber\s+is\b/i, weight: 3 },
      { pattern: /\+?\d[\d\s\-().]{7,}\d/i, weight: 4 }
    ],
    maxScore: 22
  },
  {
    intent: 'confirm',
    keywords: [
      { pattern: /\byes\b/i, weight: 4 },
      { pattern: /\byep\b|\byeah\b/i, weight: 3 },
      { pattern: /\bcorrect\b/i, weight: 4 },
      { pattern: /\bright\b/i, weight: 3 },
      { pattern: /\bexactly\b/i, weight: 3 },
      { pattern: /\bsure\b/i, weight: 2 },
      { pattern: /\bok\b|\bokay\b/i, weight: 2 },
      { pattern: /\bperfect\b/i, weight: 3 },
      { pattern: /\bagree\b/i, weight: 3 },
      { pattern: /\bthat'?s\s+right\b/i, weight: 4 }
    ],
    maxScore: 31
  },
  {
    intent: 'deny',
    keywords: [
      { pattern: /\bno\b/i, weight: 4 },
      { pattern: /\bnope\b/i, weight: 3 },
      { pattern: /\bwrong\b/i, weight: 3 },
      { pattern: /\bcancel\b/i, weight: 4 },
      { pattern: /\bstop\b/i, weight: 2 },
      { pattern: /\bnevermind\b|\bnever\s+mind\b/i, weight: 4 },
      { pattern: /\bincorrect\b/i, weight: 4 },
      { pattern: /\bnot\s+right\b/i, weight: 4 }
    ],
    maxScore: 28
  },
  {
    intent: 'repeat',
    keywords: [
      { pattern: /\brepeat\b/i, weight: 4 },
      { pattern: /\bagain\b/i, weight: 3 },
      { pattern: /\bpardon\b/i, weight: 4 },
      { pattern: /\bsorry\b.{0,20}\bwhat\b/i, weight: 3 },
      { pattern: /\bdidn'?t\s+(?:hear|catch|understand)\b/i, weight: 4 },
      { pattern: /\bexcuse\s+me\b/i, weight: 2 },
      { pattern: /\bcome\s+again\b/i, weight: 4 }
    ],
    maxScore: 24
  },
  {
    intent: 'goodbye',
    keywords: [
      { pattern: /\bgoodbye\b/i, weight: 5 },
      { pattern: /\bbye\b/i, weight: 4 },
      { pattern: /\bthank(?:s|\s+you)\b/i, weight: 2 },
      { pattern: /\bthat'?s\s+all\b/i, weight: 4 },
      { pattern: /\bdone\b/i, weight: 2 },
      { pattern: /\bfinished\b|\bfinish\b/i, weight: 3 },
      { pattern: /\bhave\s+a\s+good\b/i, weight: 3 }
    ],
    maxScore: 23
  }
];

const UNKNOWN_INTENT = 'unknown';
const MIN_CONFIDENCE_THRESHOLD = 0.1;

/**
 * Classify the intent of the given text.
 * @param {string} text
 * @returns {{ intent: string, confidence: number, alternatives: Array<{intent: string, confidence: number}> }}
 */
function classifyIntent(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { intent: UNKNOWN_INTENT, confidence: 0, alternatives: [] };
  }

  const scores = INTENT_DEFINITIONS.map(({ intent, keywords, maxScore }) => {
    let raw = 0;
    for (const { pattern, weight } of keywords) {
      if (pattern.test(text)) {
        raw += weight;
      }
    }
    const confidence = Math.min(raw / maxScore, 1);
    return { intent, confidence };
  });

  scores.sort((a, b) => b.confidence - a.confidence);

  const best = scores[0];

  if (best.confidence < MIN_CONFIDENCE_THRESHOLD) {
    return { intent: UNKNOWN_INTENT, confidence: 0, alternatives: [] };
  }

  const alternatives = scores
    .slice(1)
    .filter((s) => s.confidence >= MIN_CONFIDENCE_THRESHOLD)
    .slice(0, 3);

  return {
    intent: best.intent,
    confidence: parseFloat(best.confidence.toFixed(4)),
    alternatives: alternatives.map((s) => ({
      intent: s.intent,
      confidence: parseFloat(s.confidence.toFixed(4))
    }))
  };
}

module.exports = { classifyIntent };
