# E2E Cross-Service Integration Test Results

**Date:** April 8, 2026  
**Commit:** `eb7b3c7` — `test(e2e): cross-service integration test — telephony→NLP→CE→calendar→CRM`  
**Branch:** `phase2/conversation-engine-slot-filling`

---

## Final Test Results

| Metric | Value |
|---|---|
| Test Suites | 29 passed, 0 failed |
| Tests | 195 passed, 0 failed |
| Statements | 78.42% (1014 / 1293) |
| Branches | 66.56% (440 / 661) |
| Functions | 69.12% (150 / 217) |
| Lines | 78.79% (996 / 1264) |

All coverage metrics are above configured thresholds (branches: 50%, functions: 65%, lines/statements: 75%).

---

## New E2E Test File

**File:** `services/telephony-service/tests/e2e-cross-service.test.js`  
**17 new tests across 6 suites**

| Suite | Tests | What It Verifies |
|---|---|---|
| Complete call lifecycle | 5 | Each event in isolation: initiated → answered → speak.ended → gather.ended → hangup |
| Multi-turn call journey | 1 | All 5 events in sequence — CE advances per turn, CRM persisted on hangup |
| In-process health gates | 5 | Every service `/health` returns 200 with `status: ok` |
| CE session isolation | 1 | Concurrent calls get independent state machine sessions (no cross-contamination) |
| NLP standalone | 3 | Intent classification, entity extraction, 400 on empty input |
| Calendar service | 2 | Availability slots + booking creation with mock calendar client |

---

## Architecture of the E2E Test

All five service apps run **in-process** — no real network ports needed.  
Only true external APIs are mocked via `jest.spyOn(global, 'fetch')`:

| External API | Mock Response |
|---|---|
| `https://api.telnyx.com` | `{ ok: true, status: 200, json: {} }` |
| `https://api.openai.com/v1/audio/transcriptions` | `{ text: "I want an apartment in Austin budget 2000" }` |

Service-to-service calls (`http://localhost:30xx`) are intercepted and routed to real in-process Express apps via `routeToApp()` (supertest loopback TCP).

---

## Failures Encountered and Fixes Applied

### Failure 1 — Wrong async drain strategy

**Error:**  
Tests that relied on async side-effects (ASR → CE → CRM calls triggered inside `setImmediate` after the webhook response) were asserting fetch call counts **before** the async chain had resolved. The `routeToApp()` function uses supertest, which creates real loopback TCP connections — these resolve via I/O callbacks, not just `setImmediate` ticks alone.

**Symptom:**
```
expect(calledUrls.filter(u => u.startsWith('http://localhost:3002'))).length >= 1
// Received: 0  — CE not yet called when assertion ran
```

**Fix — `drainAsync()` function:**
```js
async function drainAsync() {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setImmediate(r));
  }
  await new Promise((r) => setTimeout(r, 200)); // TCP I/O window
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
  }
}
```

**Rule:** When async callbacks involve TCP loopback I/O (supertest), always use a real `setTimeout` window in addition to `setImmediate` ticks — `setImmediate` alone only drains the Node.js callback queue, not the I/O poll phase.

---

### Failure 2 — Mock restored before async op completed

**Error:**  
`afterEach(() => jest.restoreAllMocks())` was called while pending async operations from the previous test were still mid-flight. When they eventually resolved, they called the now-restored (real) `fetch`, which hit real network — or threw `Unexpected URL` errors that leaked into the next test.

**Symptom:**
```
Error: Unexpected URL in regression test: http://localhost:3002/api/session
// Appeared in the NEXT test, caused by the PREVIOUS test's async tail
```

**Fix:**  
Always drain async operations **before** restoring mocks in `afterEach`:
```js
afterEach(async () => {
  await drainAsync();          // drain first
  jest.restoreAllMocks();      // then restore
  mockSheetsClient.getLead.mockClear();
  mockSheetsClient.upsertLead.mockClear();
});
```

**Rule:** In `afterEach`, always flush/drain async operations before calling `jest.restoreAllMocks()` or `jest.clearAllMocks()` to prevent async bleed across tests.

---

### Failure 3 — Health check response path wrong

**Error:**
```
expect(res.body.status).toMatch(/^(ok|healthy)$/i)
// Received: undefined
```

**Cause:**  
The shared `ok()` helper wraps all responses in `{ data: { ... } }`:
```js
function ok(res, data = {}, status = 200) {
  return res.status(status).json({ data });
}
```
So `status` lives at `res.body.data.status`, not `res.body.status`.

**Fix:**
```js
expect(res.body.data.status).toMatch(/^(ok|healthy)$/i);
```

**Rule:** Always access fields through the shared response envelope (`res.body.data.*`), not directly on `res.body`.

---

### Failure 4 — Session ID mismatch prevented CE state verification

**Error:**
```
GET /api/session/e2e-cid-answered → 404 Not Found
// Session stored under a UUID, not the callControlId
```

**Cause:**  
`handle-webhook-event.js` sets `session.sessionId` from `payload.data.payload.call_session_id` if present, otherwise generates a random UUID. The CE stores sessions by `session_id`. Without controlling `call_session_id`, the CE session was unqueryable by `callControlId`.

**Fix — inject `call_session_id` in `buildEvent()`:**
```js
function buildEvent({ id, eventType, callControlId, payload = {} }) {
  return {
    data: {
      id,
      event_type: eventType,
      payload: {
        call_control_id: callControlId,
        call_session_id: callControlId,  // ← ensures session_id === callControlId
        ...payload
      }
    }
  };
}
```

**Rule:** In tests that need to query downstream service state by ID, make sure IDs are deterministic end-to-end. Inject `call_session_id` explicitly to control what the telephony service assigns as `session.sessionId`.

---

### Failure 5 — Calendar `POST /api/bookings` expected 201 but got 200

**Error:**
```
expect(res.status).toBe(201)
// Received: 200
```

**Cause:**  
The bookings route calls `ok(res, { booking: ... })` with no custom status argument. The `ok()` helper defaults to `200`. Only the CRM route passes `201` explicitly for new leads.

**Fix:**  
Updated the test assertion to match the actual API contract:
```js
expect(res.status).toBe(200); // ok() defaults to 200
```

**Rule:** Check the route's actual `ok(res, data, statusCode)` call before asserting a specific HTTP status. Do not assume `201` for POST routes — verify the route implementation.

---

### Failure 6 — NLP location entity not extracted for "in Austin" phrases

**Error:**
```
expect(entities.location).toMatch(/austin/i)
// Received: undefined
```

**Cause:**  
`LOCATION_PATTERNS` in `nlp-entity-extractor.js` required either a suffix (`area`, `district`, `neighbourhood`) or a prefix (`looking in`, `near`, `downtown`). The test input `"in Austin budget 2000"` matched none of those patterns.

**Fix — added fallback pattern to `nlp-entity-extractor.js`:**
```js
// Fallback: "in [Capitalized City]" — matches "in Austin", "in New York"
// Uses strict uppercase [A-Z] (not /i flag) so it won't match "in a", "in the", etc.
/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/
```

**Rule:** Add a broad fallback pattern last in any ordered pattern list. The strict uppercase anchor `[A-Z]` (without the `i` flag on the first character class) is sufficient to prevent false positives on common prepositions and articles, while still capturing city names.

---

## How the Full Pipeline Was Verified

The multi-turn 5-event journey test confirms the complete flow:

```
call.initiated  → Telnyx answer API called ✓
call.answered   → OpenAI Whisper ASR called → NLP entity extraction → CE slot-fill POST → Telnyx speak ✓
call.speak.ended → Telnyx gather_using_speak called ✓
call.gather.ended → NLP extract-entities → NLP classify-intent → CE session updated → Telnyx speak ✓
call.hangup     → CRM POST /api/leads → mock sheetsClient.upsertLead called ✓
```

CE session state after all 5 events:
- `session_id` matches callControlId
- `entities` contains NLP-extracted fields (location, budget, property_type)
- `step` is a valid slot-filling step or `completed`
- Lead persisted with correct `client_id` and a valid lifecycle `status`

---

## Prepared Next Steps (April 9, 2026)

### Baseline Readiness Check

- `npm test` is green: 29/29 suites, 195/195 tests.
- Coverage remains above thresholds:
  - Statements: 78.4%
  - Branches: 66.56%
  - Functions: 69.12%
  - Lines: 78.78%
- `npm run lint` is now green after removing unused variables/imports in:
  - `services/calendar-service/tests/availability.test.js`
  - `services/crm-service/src/clients/google-sheets-client.js`
  - `services/telephony-service/tests/handle-webhook-event.test.js`

### Next Sprint Priorities (P0 -> P2)

#### P0 - Stabilization and Contract Safety

1. Add `/ready` endpoint checks to cross-service E2E (not only `/health`).
2. Add negative-path E2E assertions for standard error envelope:
  - `{ "error": { "code", "message", "details" } }`
3. Add an E2E assertion that `X-Request-Id` is propagated on service-to-service calls.

Exit criteria:
- One test suite verifies readiness, one verifies error envelope shape, one verifies request-id propagation.

#### P1 - Booking and CRM Reliability Hardening

1. Add idempotency regression tests for duplicate webhook event delivery:
  - repeated `call.hangup` should not create duplicate CRM writes.
  - repeated booking requests should not create duplicate calendar events.
2. Add retry/degraded-path tests:
  - calendar unavailable -> alternative suggestion flow trigger.
  - CRM unavailable -> queued/pending persistence behavior (or explicit temporary failure contract).

Exit criteria:
- Duplicate events are safe and deterministic.
- External dependency outages return predictable behavior and logs.

#### P2 - Phase 4 Kickoff (Alternative Suggestions and Recovery)

1. Implement ranked alternative slots in `calendar-service` for conflict cases.
2. Add conversation-engine recovery prompts for low-confidence/ambiguous input.
3. Add feature flag(s) for phased rollout of alternatives/recovery behavior.

Exit criteria:
- No-dead-end flow: every failure path proposes a clear next action.

### Suggested Execution Order (1-Week Plan)

Day 1-2:
- P0 test additions (`/ready`, error envelope, request-id propagation)

Day 3-4:
- P1 idempotency + outage/retry behavior tests

Day 5:
- P2 minimal alternative-suggestion path behind feature flag

### Commands for Daily Gate

```bash
npm run lint
npm test
```

### Risks to Watch

1. Async timing flakiness in in-process integration tests (keep `drainAsync()` discipline).
2. Hidden contract drift in wrapped response payloads (`res.body.data.*` vs `res.body.*`).
3. Duplicate-event regressions when webhook retries occur under load.

---

## P0 Implementation Status (Completed on April 9, 2026)

Completed against the P0 checklist above:

1. `/ready` endpoint checks added in cross-service E2E health suite (all core services).
2. Negative-path error envelope checks added (`error.code`, `error.message`, `error.details`).
3. `X-Request-Id` propagation implemented and verified end-to-end from telephony-service to NLP, conversation-engine, and CRM service calls.

### Files Updated for P0

- `services/telephony-service/tests/e2e-cross-service.test.js`
- `services/telephony-service/src/clients/conversation-engine-client.js`
- `services/telephony-service/src/clients/nlp-service-client.js`
- `services/telephony-service/src/clients/crm-service-client.js`
- `services/telephony-service/src/services/execute-action.js`
- `services/telephony-service/tests/execute-action.test.js`

### Validation After P0

- Lint: pass (`npm run lint`)
- Tests: 29/29 suites pass, 202/202 tests pass (`npm test`)
- Coverage:
  - Statements: 78.63%
  - Branches: 66.56%
  - Functions: 69.12%
  - Lines: 79.00%

---

## P1 Implementation Status (Completed on April 9, 2026)

Completed from the P1 checklist:

1. Duplicate webhook idempotency regression added and verified:
  - Repeated `call.hangup` with same event ID does not duplicate CRM writes.
2. Duplicate booking idempotency implemented and verified:
  - Repeated `POST /api/bookings` for same `session_id + start_datetime + end_datetime` returns cached booking and does not create another calendar event.
3. Degraded-path failure contracts validated:
  - Calendar availability outage returns predictable standard error envelope.
  - CRM persistence failure on call close returns deterministic `{ status: 'closed', crm: { status: 'failed', reason } }` contract in telephony action flow.

### Files Updated for P1

- `services/calendar-service/src/app.js`
- `services/calendar-service/src/routes/bookings.js`
- `services/calendar-service/tests/bookings.test.js`
- `services/telephony-service/tests/e2e-cross-service.test.js`
- `services/telephony-service/tests/execute-action.test.js`

### Validation After P1

- Lint: pass (`npm run lint`)
- Tests: 29/29 suites pass, 207/207 tests pass (`npm test`)
- Coverage:
  - Statements: 78.91%
  - Branches: 66.66%
  - Functions: 69.12%
  - Lines: 79.29%

---

## P2 Implementation Status (Completed on April 9, 2026)

Completed from the P2 kickoff checklist with feature flags (default-off):

1. Ranked alternative slots (calendar-service)
  - Added optional ranking by temporal proximity to requested slot.
  - Enabled only when `CALENDAR_ALTERNATIVE_RANKING_ENABLED=true`.
2. Enhanced recovery prompts (conversation-engine)
  - Added clearer recovery wording with short guided examples for missing fields.
  - Enabled only when `CONVERSATION_RECOVERY_PROMPTS_ENABLED=true`.
3. Regression and integration tests
  - Added ranking utility tests.
  - Added state-machine and route tests for enhanced recovery behavior under feature flag.

### Files Updated for P2

- `services/calendar-service/src/config.js`
- `services/calendar-service/src/services/availability.js`
- `services/calendar-service/src/routes/bookings.js`
- `services/calendar-service/tests/availability.test.js`
- `services/conversation-engine/src/config.js`
- `services/conversation-engine/src/services/state-machine.js`
- `services/conversation-engine/src/routes/session.js`
- `services/conversation-engine/tests/state-machine.test.js`
- `services/conversation-engine/tests/session.test.js`

### Validation After P2

- Lint: pass (`npm run lint`)
- Tests: 29/29 suites pass, 211/211 tests pass (`npm test`)
- Coverage:
  - Statements: 79.03%
  - Branches: 66.66%
  - Functions: 69.68%
  - Lines: 79.41%
