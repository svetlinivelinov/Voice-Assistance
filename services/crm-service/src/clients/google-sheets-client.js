const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleAuth } = require('google-auth-library');

// Column header order matches the client data contract.
const SHEET_HEADERS = [
  'client_id',
  'name',
  'phone',
  'budget',
  'location',
  'property_type',
  'move_in_date',
  'viewing_date',
  'notes',
  'status',
  'session_id',
  'created_at',
  'updated_at'
];

function buildGoogleAuth(config) {
  if (config.googleServiceAccountJson) {
    const key = JSON.parse(config.googleServiceAccountJson);
    return new GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }

  const { GoogleAuth: GA, OAuth2Client } = require('google-auth-library');
  const oauth2 = new OAuth2Client(config.googleClientId, config.googleClientSecret);
  oauth2.setCredentials({ refresh_token: config.googleRefreshToken });
  return oauth2;
}

async function getOrInitSheet(doc) {
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle['Leads'];

  if (!sheet) {
    sheet = await doc.addSheet({ title: 'Leads', headerValues: SHEET_HEADERS });
  } else {
    await sheet.loadHeaderRow();
  }

  return sheet;
}

function createGoogleSheetsClient(config) {
  async function getDoc() {
    const auth = buildGoogleAuth(config);
    const doc = new GoogleSpreadsheet(config.googleSheetId, auth);
    return doc;
  }

  /**
   * Find a row by dedup key (phone or client_id).
   * Returns { row, rowIndex } or null if not found.
   * @param {import('google-spreadsheet').GoogleSpreadsheetWorksheet} sheet
   * @param {string} phone
   * @param {string} clientId
   */
  async function findRow(sheet, phone, clientId) {
    const rows = await sheet.getRows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowPhone = row.get('phone');
      const rowClientId = row.get('client_id');
      if ((phone && rowPhone === phone) || (clientId && rowClientId === clientId)) {
        return { row, rowIndex: i };
      }
    }

    return null;
  }

  /**
   * Upsert a lead row. Deduplicates by phone then client_id.
   * @param {Object} lead  — fields matching client data contract + session_id
   * @returns {{ action: 'created'|'updated', lead: Object }}
   */
  async function upsertLead(lead) {
    const doc = await getDoc();
    const sheet = await getOrInitSheet(doc);

    const now = new Date().toISOString();
    const existing = await findRow(sheet, lead.phone, lead.client_id);

    if (existing) {
      const { row } = existing;
      // Merge: only overwrite non-empty incoming fields
      for (const header of SHEET_HEADERS) {
        if (header === 'created_at') continue;
        if (lead[header] !== undefined && lead[header] !== null && lead[header] !== '') {
          row.set(header, String(lead[header]));
        }
      }

      row.set('updated_at', now);
      await row.save();

      return {
        action: 'updated',
        lead: Object.fromEntries(SHEET_HEADERS.map((h) => [h, row.get(h)]))
      };
    }

    const newRow = Object.fromEntries(
      SHEET_HEADERS.map((h) => [
        h,
        h === 'created_at' || h === 'updated_at' ? now : (lead[h] !== undefined ? String(lead[h]) : '')
      ])
    );

    await sheet.addRow(newRow);

    return { action: 'created', lead: newRow };
  }

  /**
   * Get a lead by client_id or phone.
   * @returns {Object|null}
   */
  async function getLead({ clientId, phone }) {
    const doc = await getDoc();
    const sheet = await getOrInitSheet(doc);

    const existing = await findRow(sheet, phone, clientId);
    if (!existing) {
      return null;
    }

    return Object.fromEntries(SHEET_HEADERS.map((h) => [h, existing.row.get(h)]));
  }

  return {
    upsertLead,
    getLead
  };
}

module.exports = {
  createGoogleSheetsClient,
  SHEET_HEADERS
};
