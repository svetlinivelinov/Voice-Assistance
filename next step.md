# Next Steps (Execution Plan)

## Sprint Goal
Deliver a stable end-to-end MVP flow: inbound call -> qualification -> booking -> CRM sync, aligned with modular microservice architecture and Telnyx-first telephony plan.

## Priority 1: Align Configuration and Provider Baseline
1. Standardize telephony provider variables to Telnyx-first while keeping provider abstraction.
2. Keep fallback compatibility path for Twilio to reduce migration risk.
3. Add Joi env validation for all required keys at startup in each service.

Definition of done:
- All services boot with validated env.
- Missing env key returns clear startup error.
- Telephony provider can be selected by config flag.

## Priority 2: Close Phase 1 Reliability Gates
1. Verify inbound webhook signature validation for telephony events.
2. Add retry with exponential backoff for ASR (Whisper) and TTS (ElevenLabs).
3. Add correlation ID propagation (`X-Request-Id`) across service-to-service calls.
4. Validate `p95` voice-turn latency target (`<= 3.0s`) in smoke load test.

Definition of done:
- Signed webhook requests are accepted, invalid signatures are rejected.
- Retry policy is observable in logs and metrics.
- Correlation ID appears end-to-end in one call trace.

## Priority 3: Lock Data Contracts and Session Flow
1. Enforce shared schemas for client and session payloads in `data-standardization`.
2. Ensure `conversation-engine` fills and persists `missing_fields` correctly.
3. Return standardized error payloads from all APIs:
	`{ "error": { "code": "string", "message": "string", "details": {} } }`

Definition of done:
- Contract tests pass for all services consuming shared schemas.
- Session lifecycle works for at least one full qualification scenario.

## Priority 4: Run Parallel Track Integration (Calendar + CRM)
1. Calendar track: availability check + booking + conflict handling.
2. CRM track: upsert lead + dedupe by phone/client_id + status transitions.
3. Integrate both tracks into one call journey after Phase 2 gate.

Definition of done:
- Successful booking creates linked CRM update in same flow.
- Conflict case returns alternatives (no dead-end response).

## Priority 5: Testing and Observability Hardening
1. Reach and maintain `>= 80%` coverage on core services.
2. Ensure integration tests use Nock mocks for Telnyx/OpenAI/ElevenLabs/Google APIs.
3. Add baseline dashboards and alerts:
	- request rate
	- error rate
	- provider failures
	- p95 latency
4. Add PII masking verification tests for logging layer.

Definition of done:
- CI green on lint, unit, integration, API tests.
- Critical alerts fire in test mode and include request correlation ID.

## This Week Deliverables (Suggested)
1. Provider config refactor and env validation cleanup.
2. Telephony webhook signature verification + retry policies.
3. Contract enforcement for client/session schemas.
4. One integrated happy-path demo call with logs and metrics snapshot.

## Blockers to Watch
- Public HTTPS webhook reachability for telephony callbacks.
- Calendar OAuth token lifecycle issues.
- Cost spikes from ASR/TTS retries without caps.

## Immediate Command Checklist
1. Run lint and tests across workspace.
2. Run integration suite for telephony-service and conversation-engine.
3. Validate `/health` and `/ready` on all services.
4. Run one real or staged call smoke test and archive trace logs.
