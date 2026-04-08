'use strict';

const { deriveStatus, upsertLead } = require('../src/services/lead-store');

// ─── deriveStatus unit tests ────────────────────────────────────────────────

describe('deriveStatus', () => {
  it('defaults to "new" for a brand-new lead', () => {
    expect(deriveStatus({}, {})).toBe('new');
  });

  it('advances to "qualified" when budget + location are provided', () => {
    expect(deriveStatus({}, { budget: 500000, location: 'Brooklyn' })).toBe('qualified');
  });

  it('advances to "scheduled" when viewing_date is set', () => {
    expect(deriveStatus({}, { viewing_date: '2025-08-15' })).toBe('scheduled');
  });

  it('skips "qualified" and goes straight to "scheduled" when viewing_date set on new lead', () => {
    expect(deriveStatus({}, { budget: 400000, location: 'Queens', viewing_date: '2025-08-15' })).toBe(
      'scheduled'
    );
  });

  it('does NOT regress from "scheduled" to "qualified"', () => {
    expect(deriveStatus({ status: 'scheduled' }, { budget: 300000, location: 'Bronx' })).toBe(
      'scheduled'
    );
  });

  it('honours an explicit incoming status without regression', () => {
    expect(deriveStatus({ status: 'new' }, { status: 'qualified' })).toBe('qualified');
  });

  it('does not regress an explicit status below current', () => {
    expect(deriveStatus({ status: 'scheduled' }, { status: 'new' })).toBe('scheduled');
  });

  it('preserves "closed" when nothing changes', () => {
    expect(deriveStatus({ status: 'closed' }, {})).toBe('closed');
  });
});

// ─── upsertLead integration shims ───────────────────────────────────────────

function makeMockSheetsClient(existingLead = null) {
  const rows = existingLead ? [{ ...existingLead }] : [];

  return {
    getLead: jest.fn().mockResolvedValue(existingLead),
    upsertLead: jest.fn().mockImplementation(async (lead) => {
      if (existingLead) {
        rows[0] = { ...rows[0], ...lead };
        return { action: 'updated', lead: rows[0] };
      }

      rows.push({ ...lead });
      return { action: 'created', lead: rows[0] };
    })
  };
}

describe('upsertLead', () => {
  it('creates a new lead and generates a client_id when absent', async () => {
    const sheetsClient = makeMockSheetsClient(null);
    const result = await upsertLead({
      lead: { name: 'Alice', phone: '+1-555-100-0001' },
      sheetsClient
    });

    expect(result.action).toBe('created');
    expect(result.lead.client_id).toBeTruthy();
  });

  it('sets status to "qualified" when budget + location provided', async () => {
    const sheetsClient = makeMockSheetsClient(null);
    const result = await upsertLead({
      lead: { name: 'Bob', phone: '+1-555-100-0002', budget: 450000, location: 'Brooklyn' },
      sheetsClient
    });

    expect(result.lead.status).toBe('qualified');
  });

  it('sets status to "scheduled" when viewing_date provided', async () => {
    const sheetsClient = makeMockSheetsClient(null);
    const result = await upsertLead({
      lead: { name: 'Carol', phone: '+1-555-100-0003', viewing_date: '2025-08-20' },
      sheetsClient
    });

    expect(result.lead.status).toBe('scheduled');
  });

  it('updates an existing lead without regression', async () => {
    const existing = {
      client_id: 'client-123',
      name: 'Dave',
      phone: '+1-555-200-0001',
      status: 'qualified',
      budget: '300000',
      location: 'Queens'
    };
    const sheetsClient = makeMockSheetsClient(existing);
    const result = await upsertLead({
      lead: { client_id: 'client-123', notes: 'Prefers top floor' },
      sheetsClient
    });

    expect(result.action).toBe('updated');
    expect(result.lead.status).toBe('qualified'); // no regression
  });

  it('tolerates a getLead failure and treats it as a new record', async () => {
    const sheetsClient = {
      getLead: jest.fn().mockRejectedValue(new Error('Sheets unavailable')),
      upsertLead: jest.fn().mockResolvedValue({ action: 'created', lead: { name: 'Eve', status: 'new' } })
    };

    const result = await upsertLead({
      lead: { name: 'Eve', phone: '+1-555-300-0001' },
      sheetsClient
    });

    expect(result.action).toBe('created');
  });
});
