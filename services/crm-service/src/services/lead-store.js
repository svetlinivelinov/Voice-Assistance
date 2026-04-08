const { v4: uuidv4 } = require('uuid');

const STATUS_LIFECYCLE = ['new', 'qualified', 'scheduled', 'closed'];

/**
 * Derive the next status given the current status and incoming data.
 * Rules:
 *  - Default to 'new' on creation.
 *  - Advance to 'qualified' when budget + location are both present.
 *  - Advance to 'scheduled' when viewing_date is set.
 *  - Caller may always pass an explicit status.
 */
function deriveStatus(existing, incoming) {
  if (incoming.status && STATUS_LIFECYCLE.includes(incoming.status)) {
    // Never regress status
    const currentIdx = STATUS_LIFECYCLE.indexOf(existing.status || 'new');
    const incomingIdx = STATUS_LIFECYCLE.indexOf(incoming.status);
    return STATUS_LIFECYCLE[Math.max(currentIdx, incomingIdx)];
  }

  let status = existing.status || 'new';

  const budget = incoming.budget ?? existing.budget;
  const location = incoming.location ?? existing.location;
  const viewingDate = incoming.viewing_date ?? existing.viewing_date;

  if (viewingDate && status !== 'scheduled' && status !== 'closed') {
    status = 'scheduled';
  } else if (budget && location && status === 'new') {
    status = 'qualified';
  }

  return status;
}

/**
 * Upsert a lead via the sheets client.
 *
 * @param {Object} params
 * @param {Object} params.lead   — validated client data fields
 * @param {Object} params.sheetsClient — google-sheets-client instance
 * @returns {Promise<{ lead: Object, action: 'created'|'updated' }>}
 */
async function upsertLead({ lead, sheetsClient }) {
  // Ensure client_id is always set.
  if (!lead.client_id) {
    lead = { ...lead, client_id: uuidv4() };
  }

  // Attempt to fetch the existing row so we can merge status.
  let existingRaw = null;
  try {
    existingRaw = await sheetsClient.getLead({
      clientId: lead.client_id,
      phone: lead.phone
    });
  } catch (_e) {
    // If getLead fails, treat as new record.
  }

  const existing = existingRaw || {};
  const derivedStatus = deriveStatus(existing, lead);

  const merged = {
    ...lead,
    status: derivedStatus
  };

  const result = await sheetsClient.upsertLead(merged);
  return result;
}

module.exports = { upsertLead, deriveStatus };
