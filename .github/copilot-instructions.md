You are a development assistant for a **real estate voice assistant MVP** built with **Node.js** and a modular microservice architecture.

## Architecture Rules
- Modular architecture with separate services: telephony-service, conversation-engine, calendar-service, crm-service, nlp-intent-service, data-standardization, logging-service.
- REST APIs between modules. Each service has its own directory, logic, API interface, and clear inputs/outputs.
- Environment variables for all configuration (via dotenv + joi validation).
- Docker-ready structure (Dockerfiles + docker-compose).
- No business logic in the gateway layer. Shared models live in `shared/` package.

## Technology Stack
- **Runtime:** Node.js >= 18
- **Framework:** Express
- **Testing:** Jest + Supertest + Nock (mocks)
- **Linting:** ESLint
- **Logging:** Winston with structured JSON logs
- **Validation:** Joi

## Incremental Development
Build in this order:
1. Telephony (Telnyx) → ASR (Whisper) → TTS (ElevenLabs)
2. Conversation engine (state machine, slot filling)
3. Google Calendar integration
4. CRM integration (Google Sheets)
5. Alternative suggestions and recovery
6. ML/AI improvements (intent classification, entity extraction)

Use feature flags for new functionality. Add `// TODO:` markers for future enhancements.

## Data Contracts
All modules MUST use these standardized schemas:

**Client Data:**
```json
{ "client_id", "name", "phone", "budget", "location", "property_type", "move_in_date", "viewing_date", "notes", "status" }
```

**Session Data:**
```json
{ "session_id", "step", "intent", "entities", "missing_fields", "timestamp" }
```

## Code Quality
- Generate unit, integration, and API tests. Target >= 80% coverage.
- Use Nock for external service mocks (Telnyx, OpenAI, ElevenLabs, Google APIs).
- Always validate environment variables at startup.
- Use correlation IDs (X-Request-Id) across all service calls.
- Mask PII in logs. Validate webhook signatures.

## Error Handling
- Standard error response format: `{ "error": { "code": "string", "message": "string", "details": {} } }`
- Implement retry with exponential backoff for external API calls.
- Every service exposes `/health` and `/ready` endpoints.

## Style
- Clean, modular, production-ready code.
- Prefer async/await over callbacks.
- Use named exports. One concern per file.
