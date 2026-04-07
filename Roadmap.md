# Roadmap: Real Estate Voice Assistant MVP

## 1. Goal and Scope
Build a production-ready MVP for a real estate voice assistant using modular microservices, with reliable call handling, scheduling, and CRM logging.

Core principles from project instructions:
- Modular microservice architecture
- REST communication between services
- Environment-based configuration
- Docker-ready deployment
- Standardized data contracts
- Incremental delivery
- Automated testing and mocks
- Hooks for feedback and logging

## 2. Target Architecture (MVP)
Services:
- telephony-service
- conversation-engine
- calendar-service
- crm-service
- nlp-intent-service
- data-standardization
- logging-service

Shared assets:
- shared/contracts (client and session schemas)
- shared/http (common API response formats)
- shared/config (env validation)

## 3. Data Contracts (Must Be Stable Early)
### Client Data Contract
```json
{
  "client_id": "",
  "name": "",
  "phone": "",
  "budget": 0,
  "location": "",
  "property_type": "",
  "move_in_date": "",
  "viewing_date": "",
  "notes": "",
  "status": ""
}
```

### Session Data Contract
```json
{
  "session_id": "",
  "step": "",
  "intent": "",
  "entities": {},
  "missing_fields": [],
  "timestamp": ""
}
```

## 4. Delivery Phases (Optimized Timeline)

## Phase 0: Foundation and Skeleton (Week 1)
Outcomes:
- Monorepo/service folders created
- Shared contracts and env validation added
- Base Docker setup (Dockerfiles + docker-compose)
- Common logging, health endpoints, and baseline observability

Deliverables:
- Service skeletons with `/health` and `/ready`
- `.env.example` per service
- OpenAPI stubs for each service
- Baseline dashboards: request count, error rate, p95 latency, provider failures
- Alert rules for critical failures (telephony, ASR, TTS, calendar booking, CRM sync)

Exit criteria:
- All services start locally
- Health checks pass
- CI runs lint + unit tests
- Correlation IDs are visible end-to-end in logs

---

## Phase 1: Telephony -> ASR -> TTS Loop (Week 2-3)
Outcomes:
- Inbound call accepted (Telnyx)
- Speech-to-text using Whisper
- Response synthesis using ElevenLabs
- Basic spoken loop works end-to-end

Deliverables:
- telephony-service webhook endpoints
- ASR adapter + retry/error handling
- TTS adapter + audio streaming support

Testing:
- Unit tests for adapters
- Integration test with mocked Telnyx/OpenAI/ElevenLabs
- Load smoke test for 5-10 concurrent calls

Exit criteria:
- A caller can ask a simple question and receive spoken response
- Conversation ID/session ID is persisted in logs
- p95 voice-turn latency within budget (see guardrails)

---

## Phase 2: Conversation Engine (Week 3-4)
Outcomes:
- Dialogue state machine (step-by-step lead qualification)
- Slot filling for missing fields
- Guardrails for unsupported requests

Deliverables:
- conversation-engine state manager
- Prompting policy and fallback intents
- Session persistence contract integration

Testing:
- Unit tests for state transitions
- API tests for session update flow

Exit criteria:
- Engine can collect name, phone, budget, location, property type
- Missing fields are tracked in `missing_fields`
- Unsupported intents are handled by deterministic fallback path

---

## Phase 3A: Google Calendar Integration (Week 4-5, Parallel Track A)
Outcomes:
- Suggest and book available viewing slot
- Handle conflicts and suggest alternatives

Deliverables:
- calendar-service with create/list/check conflict APIs
- OAuth/refresh token handling
- Timezone-safe scheduling logic

Testing:
- Mocked Google Calendar integration tests
- Conflict resolution tests

Exit criteria:
- Confirmed booking event is created and linked to session

---

## Phase 3B: CRM Integration (Week 4-5, Parallel Track B)
Outcomes:
- Lead data stored to CRM (Google Sheets for MVP)
- Status lifecycle tracked (new/qualified/scheduled)

Deliverables:
- crm-service with upsert lead API
- Deduplication by phone/client_id
- Audit fields: created_at, updated_at

Testing:
- API tests for create/update/dedupe
- Mocked Sheets tests

Exit criteria:
- Completed call creates/updates CRM row automatically

---

## Phase 4: Alternative Suggestions and Recovery (Week 6)
Outcomes:
- If desired slot unavailable, propose top alternatives
- Better recovery for ASR ambiguity and interruptions

Deliverables:
- Alternative slot ranking logic
- Clarification prompts and retry policy
- User feedback hook (`thumbs_up/down`, short reason)

Testing:
- Scenario tests for no-availability and low-confidence ASR

Exit criteria:
- Assistant always provides next-best action (never dead end)

---

## Phase 5: ML/AI Readiness and Hardening (Week 7+)
Outcomes:
- NLP service interface stabilized for future ML model swap
- Better observability and reliability

Deliverables:
- nlp-intent-service interface:
  - `classifyIntent(text)`
  - `extractEntities(text)`
- Logging dashboards and alert thresholds
- Performance tuning and cost controls

Testing:
- Regression suite across full call journey
- Load test for concurrent calls

Exit criteria:
- Stable MVP operations with measurable SLA/SLO

## 4.1 Accelerated Milestones (Weekly Demos)
1. Week 1 demo: all services boot, health checks, shared contracts, baseline monitoring.
2. Week 2 demo: live inbound call with ASR/TTS loop and traceable session logging.
3. Week 3 demo: lead qualification flow with slot filling and fallback behavior.
4. Week 4 demo: parallel beta of calendar booking API and CRM upsert API.
5. Week 5 demo: integrated booking + CRM write in one call journey.
6. Week 6 demo: alternatives/recovery scenarios and failure-path validation.

## 4.2 Parallelization Rules
- Calendar and CRM tracks start only after Phase 2 exit criteria are met.
- Both tracks must consume the same shared contracts package version.
- Integration gate opens when Track A + Track B pass API and integration tests.
- No release to pilot if either booking confirmation or CRM sync is below target KPI.

## 4.3 Service-Level Definition of Done (DoD)
| Service | Required API/Behavior | Quality Gates | Operational Gates |
|---|---|---|---|
| telephony-service | inbound webhook, call control, provider signature validation | unit >= 80%, integration with Telnyx mock | error rate < 2%, retry policy enabled |
| conversation-engine | session state machine, slot filling, fallback intents | transition tests for all states, API tests | deterministic fallback, prompt versioning |
| calendar-service | availability check, create booking, conflict detection | integration tests with calendar mock | timezone safety, idempotent booking key |
| crm-service | lead upsert, dedupe, status update | API tests for create/update/dedupe | sync success >= 99%, audit fields present |
| nlp-intent-service | `classifyIntent(text)`, `extractEntities(text)` | contract tests, regression set | confidence threshold + low-confidence fallback |
| data-standardization | schema validation for client/session payloads | schema tests, backward compatibility check | reject invalid payloads with clear error codes |
| logging-service | structured logs, trace IDs, feedback events | log contract tests | PII masking, alert integration |

## 4.4 Fallback and Degraded Modes
- ASR degraded mode: ask caller for short rephrase after low confidence.
- TTS degraded mode: switch to backup voice or text prompt path.
- Calendar degraded mode: collect preferred slots and enqueue callback workflow.
- CRM degraded mode: persist lead to local durable queue and replay when restored.

## 5. Cross-Cutting Workstreams
- Security: secret management, webhook signature validation, PII masking in logs
- Observability: request tracing, call/session correlation IDs
- DevOps: CI/CD, environment promotion, rollback strategy
- Cost control: token/audio usage caps and alerting
- Feature flags: controlled rollout for new behaviors

## 6. Done Criteria for MVP
MVP is done when:
- End-to-end flow works: call -> qualification -> slot booking -> CRM write
- All external integrations have mock-backed tests
- Incident-critical logs and error alerts are in place
- Data contracts are enforced across all services
- Basic reliability targets are met for pilot usage

## 7. Suggested Initial KPI Targets (Pilot)
- Call completion rate: >= 75%
- Booking success rate (qualified leads): >= 60%
- Avg. call latency (turn response): <= 2.5 sec after ASR
- CRM sync success: >= 99%
- Calendar booking error rate: < 2%

## 7.1 Performance and Cost Guardrails by Phase
- Phase 1: p95 voice-turn latency <= 3.0s, ASR+TTS cost alert at 80% of monthly budget.
- Phase 2: p95 state transition processing <= 400ms, fallback trigger rate tracked daily.
- Phase 3A/3B: booking+CRM combined flow p95 <= 4.0s (excluding user speech time).
- Phase 4: retry loops capped to avoid runaway token/audio spend.
- Phase 5: load target of 20 concurrent calls without critical SLA breach.

## 7.2 Telephony Provider Decision Matrix
Scoring model:
- Score per criterion: 1 (weak) to 5 (excellent)
- Weighted score formula: $\sum(score \times weight)$

| Criterion | Weight | Twilio | Telnyx | Vonage | Plivo |
|---|---:|---:|---:|---:|---:|
| BG number coverage (+359) | 20% | 4 | 4 | 4 | 3 |
| Voice quality and reliability | 20% | 5 | 4 | 5 | 4 |
| Real-time media/SIP flexibility | 15% | 4 | 5 | 4 | 4 |
| API and developer experience | 15% | 5 | 4 | 4 | 4 |
| Unit economics (MVP scale) | 20% | 3 | 5 | 3 | 4 |
| Support and operational maturity | 10% | 5 | 4 | 5 | 4 |
| Weighted total (max 5.00) | 100% | 4.20 | 4.35 | 4.05 | 3.85 |

Interpretation:
- Telnyx leads on cost and SIP/media flexibility.
- Twilio remains strongest for developer velocity and ecosystem maturity.
- Vonage is strong for enterprise reliability.
- Plivo is a good budget option, but validate local number support and routing.

Decision for this MVP:
1. Telnyx is selected as the default telephony provider.
2. Keep the provider adapter abstraction so Twilio or others can be re-enabled later if needed.
3. Re-run this matrix after a 1-week pilot with real call logs and failure metrics.

## 8. Immediate Next 10 Tasks
1. Create service folder skeleton and shared contracts package.
2. Add env validation and `.env.example` per service.
3. Implement telephony webhook endpoints.
4. Add Whisper ASR adapter abstraction.
5. Add ElevenLabs TTS adapter abstraction.
6. Implement minimal conversation state machine.
7. Add session persistence + standardized schema validation.
8. Implement Google Calendar availability + booking API.
9. Implement CRM upsert with dedupe logic.
10. Add integration tests with provider mocks.

## 9. Budget Guidance (from current notes)
Expected monthly MVP operating budget:
- Approx. 70-180 BGN/month depending on call volume and model usage.

## 10. Risks and Mitigations
- ASR quality in noisy calls:
  - Mitigation: confidence threshold + clarification prompts.
- Third-party API downtime:
  - Mitigation: retries, circuit breaker, fallback responses.
- Scheduling conflicts:
  - Mitigation: pre-book availability check + alternatives.
- Cost spikes:
  - Mitigation: quotas, alerts, request throttling.
