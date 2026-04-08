# Telnyx GitHub Findings — Phase 1 Reference

> Sourced from [github.com/team-telnyx](https://github.com/team-telnyx) — April 2026  
> Relevant repos: [`telnyx-node`](https://github.com/team-telnyx/telnyx-node) · [`ai`](https://github.com/team-telnyx/ai)

---

## 1. Node SDK (`telnyx-node`)

**Install:**
```bash
npm install telnyx
```

Current version: **v6.35.0** (actively maintained, auto-generated via Stainless).

### SDK Client Setup
```js
import Telnyx from 'telnyx';

const client = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY,
  maxRetries: 2,           // default — covers 429, 408, 409, >=500
  timeout: 20 * 1000,      // 20 seconds
  logLevel: 'warn',        // 'debug' | 'info' | 'warn' | 'error' | 'off'
  logger: winstonLogger,   // drop-in support for Winston, pino, bunyan
});
```

> Use the SDK client in `telephony-service/src/clients/telnyx-api-client.js` rather than raw HTTP calls. Built-in retry and timeout policies align with the project's exponential backoff requirement.

### Outbound Call / Answer
```js
// Dial outbound
const response = await client.calls.dial({
  connection_id: process.env.TELNYX_CONNECTION_ID,
  from: '+15557654321',
  to: '+15551234567',
  webhook_url: 'https://your-service/webhooks/voice',
});

// Answer inbound (from webhook handler on call.initiated)
await client.calls.actions.answer(callControlId);
```

---

## 2. Webhook Signature Verification

### Key requirement
The webhook route **must** use `express.raw()` (not `express.json()`) to preserve the raw body for signature verification.

```js
import Telnyx from 'telnyx';

const client = new Telnyx({ apiKey: process.env.TELNYX_API_KEY });

app.post('/webhooks/voice', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['telnyx-signature-ed25519'];
  const timestamp  = req.headers['telnyx-timestamp'];

  let event;
  try {
    event = client.webhooks.unwrap(
      req.body,
      { 'telnyx-signature-ed25519': signature, 'telnyx-timestamp': timestamp },
      process.env.TELNYX_PUBLIC_KEY,
    );
  } catch (err) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // process event.data.event_type ...
  res.json({ status: 'ok' });
});
```

**Public key location:** Telnyx Mission Control → Settings → Public Keys (base64 format).

### Security properties
- **ED25519** cryptography — modern, fast, resistant to timing attacks
- **Replay protection** — rejects webhooks older than 5 minutes
- **Tamper detection** — any payload modification invalidates the signature

---

## 3. Call Control Webhook Event Flow (Phase 1)

| Event | Action to take |
|---|---|
| `call.initiated` | `POST /v2/calls/{id}/actions/answer` |
| `call.answered` | `POST /v2/calls/{id}/actions/speak` (TTS greeting) |
| `call.speak.ended` | Issue gather or next speak |
| `call.gather.ended` | Process input, route conversation |
| `call.hangup` | Finalize session, write to CRM |

**Webhook payload shape:**
```json
{
  "data": {
    "event_type": "call.answered",
    "id": "uuid",
    "occurred_at": "2026-04-08T12:00:00Z",
    "payload": {
      "call_control_id": "v3:abc123",
      "call_leg_id": "uuid",
      "from": "+15551234567",
      "to": "+15559876543"
    }
  }
}
```

### TTS Speak Action
```js
await client.calls.actions.speak(callControlId, {
  payload: 'Hello! How can I help you today?',
  voice: 'female',
  language: 'en-US',
});
```

### Gather (IVR / digit input)
```js
await client.calls.actions.gatherUsingSpeak(callControlId, {
  payload: 'Press 1 for viewing, 2 to speak with an agent.',
  voice: 'female',
  language: 'en-US',
  valid_digits: '12',
  max_digits: 1,
});
```

---

## 4. Real-Time Speech-to-Text (Native WebSocket)

Telnyx offers a native streaming ASR that may complement or replace the Whisper adapter for lower latency:

```js
import { SpeechToTextWS } from 'telnyx/resources/speech-to-text';

const stt = new SpeechToTextWS(client, {
  transcription_engine: 'Telnyx', // or 'Azure' | 'Deepgram' | 'Google'
  language: 'en-US',
  interim_results: true,
});

await stt.waitForOpen();

stt.on('transcript', (event) => {
  if (event.is_final) {
    // pass event.transcript to conversation-engine
  }
});

stt.on('error', (event) => {
  logger.error('STT error', { error: event.error });
});

stt.send(audioBuffer); // stream audio chunks from the call
stt.close();
```

> **Decision point:** Evaluate Telnyx native STT vs. OpenAI Whisper for the Bulgarian (+359) use case. Keep the adapter abstraction so both can be swapped via feature flag.

---

## 5. AI Assistants API — Phase 2 Accelerator Option

Telnyx provides a managed voice AI API (`POST /v2/ai/assistants`) that could significantly compress Phase 2 scope:

```js
// Create an assistant
const assistant = await client.ai.assistants.create({
  name: 'Real Estate Assistant',
  instructions: 'You are a real estate assistant. Qualify leads by collecting name, phone, budget, location, property type, and preferred move-in date. Be concise and friendly.',
  model: 'meta-llama/Llama-3.3-70B-Instruct',  // see GET /v2/ai/models
  voice: {
    provider: 'telnyx',           // or 'elevenlabs' (supply your API key)
    settings: { voice_id: 'en-US-Neural2-F' },
  },
  greeting: 'Hello! I can help you find your next property. May I start with your name?',
  tools: [{
    type: 'function',
    function: {
      name: 'book_viewing',
      description: 'Book a property viewing slot in the calendar',
      parameters: {
        type: 'object',
        properties: {
          client_name:  { type: 'string' },
          phone:        { type: 'string' },
          date_time:    { type: 'string', description: 'ISO 8601 datetime' },
        },
        required: ['client_name', 'phone', 'date_time'],
      },
    },
  }],
});
```

**Wire to a phone number:**
```bash
# Set connection webhook to the assistant's answer URL
curl -X PATCH https://api.telnyx.com/v2/connections/{connection_id} \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -d '{"webhook_api_url": "https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer"}'
```

When the assistant calls a tool, **your webhook** receives a `function_call` event — this is where `calendar-service` and `crm-service` plug in.

> **Trade-off:** Managed assistant reduces conversation-engine build effort but limits state machine control. Recommended: prototype with Assistant API in parallel while building the custom conversation-engine, then choose after Week 2 demo.

---

## 6. Agent CLI for Local Setup

```bash
npx telnyx-agent setup-voice   # creates SIP connection + buys number + assigns — one command
npx telnyx-agent status        # account health overview
```

Useful for spinning up the dev environment without manual portal clicks.

---

## 7. Webhook Reliability Rules

| Concern | Detail |
|---|---|
| Response timeout | Must return HTTP 200 within **10 seconds** — process async |
| Retry schedule | Immediate → 1 min → 5 min → 15 min → 1 hr (5 attempts max) |
| Duplicates | Same event may arrive twice — use `id` field for idempotency |
| Debug tool | `GET /v2/webhook_deliveries` — filter by `event_type`, `status` |

---

## 8. Local Development Setup

```bash
# Expose local port to the internet
ngrok http 3000

# Point your Telnyx voice connection at the ngrok URL
curl -X PATCH https://api.telnyx.com/v2/connections/{id} \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -d '{"webhook_api_url": "https://abc123.ngrok.io/webhooks/voice"}'
```

Environment variables needed:
```env
TELNYX_API_KEY=KEY_...
TELNYX_PUBLIC_KEY=<base64 key from Mission Control → Settings → Public Keys>
TELNYX_CONNECTION_ID=<your Call Control connection ID>
```

---

## 9. Impact on Phase 1 Implementation

| Area | Decision |
|---|---|
| SDK | Use `telnyx` npm package — replaces manual HTTP client for Telnyx calls |
| Webhook verification | Use `client.webhooks.unwrap()` — already satisfies the project's signature validation requirement |
| ASR | Keep Whisper adapter; evaluate Telnyx native STT WebSocket as alternative via feature flag |
| TTS | Keep ElevenLabs adapter; note AI Assistants API supports ElevenLabs natively |
| Winston integration | Pass Winston logger directly to SDK: `new Telnyx({ logger: winstonLogger })` |
| Retry policy | SDK handles retries natively; keep custom `retry-with-backoff` for ElevenLabs/OpenAI calls |

---

## 10. References

- [`team-telnyx/telnyx-node`](https://github.com/team-telnyx/telnyx-node) — Node SDK (v6.35.0)
- [`team-telnyx/ai`](https://github.com/team-telnyx/ai) — AI agents, guides, toolkits
- [Voice Call Control Guide](https://github.com/team-telnyx/ai/blob/main/guides/voice-call-control.md)
- [AI Assistants Guide](https://github.com/team-telnyx/ai/blob/main/guides/ai-assistants.md)
- [Webhooks Guide](https://github.com/team-telnyx/ai/blob/main/guides/webhooks.md)
- [Webhook Verification Example](https://github.com/team-telnyx/telnyx-node/tree/master/examples/webhook-verification)
- [Call Control API Docs](https://developers.telnyx.com/docs/voice/call-control)
