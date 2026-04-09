# Telnyx Go-Live Runbook (MVP)

## Purpose
Use this runbook after Telnyx registration to move from mocked tests to a real inbound call safely.

## Prerequisites
1. Public HTTPS URL for telephony-service.
2. Telnyx account with Voice/Call Control enabled.
3. At least one phone number (DID) assigned to your Telnyx app.

## Step 1: Configure Environment
Set these values in deployed telephony-service:

- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY`
- `ASR_ENABLED=true`
- `TTS_ENABLED=true`
- `CONVERSATION_ENGINE_ENABLED=true`
- `NLP_SERVICE_ENABLED=true`
- `CRM_SERVICE_ENABLED=true`

Optional recovery controls:
- `CRM_RECOVERY_QUEUE_ENABLED=true`
- `CRM_RECOVERY_QUEUE_PERSIST_ENABLED=true`
- `CRM_RECOVERY_QUEUE_FILE_PATH=./data/telephony-pending-leads.json`
- `CRM_RECOVERY_QUEUE_TTL_HOURS=168`

Optional metrics emission:
- `CRM_RECOVERY_METRICS_LOG_ENABLED=true`
- `CRM_RECOVERY_METRICS_LOG_INTERVAL_MS=60000`

## Step 2: Telnyx Mission Control Setup
1. Create or open a Call Control application.
2. Set webhook URL to: `https://<your-domain>/api/webhooks`
3. Enable signed webhooks and copy the public signing key.
4. Put that key in `TELNYX_PUBLIC_KEY`.
5. Attach your purchased number to this Call Control app.

## Step 3: Deployment Readiness Checks
Use the script:

```powershell
./scripts/telnyx-readiness.ps1 -BaseUrl "https://<your-domain>"
```

Expected:
1. `/health` -> 200
2. `/ready` -> 200
3. Unsigned webhook probe -> 401 (proves reachability and signature gate)

## Step 4: Controlled First Live Call
1. Call your Telnyx number from a real phone.
2. Check logs for sequence:
- `call.initiated` -> `answer_inbound_call`
- `call.answered` -> `start_voice_loop`
- `call.speak.ended` and `call.gather.ended`
3. Confirm no signature errors and request IDs present.

## Step 5: Post-Call Validation
1. Verify conversation-engine session updated.
2. Verify CRM write success.
3. If CRM outage happened, verify recovery queue:
- `GET /api/recovery/pending-leads`
- `GET /api/recovery/metrics`

## No-Go Conditions
Do not continue to wider pilot if any of these fail:
1. Webhook endpoint not publicly reachable.
2. Signature verification failing for valid Telnyx webhooks.
3. Telnyx answer action failing.
4. Call flow stalls without fallback response.

## Rollback Path
1. Keep feature flags for new behavior disabled.
2. Keep queue persistence enabled for degraded CRM protection.
3. Return to mocked integration mode until failing gate is fixed.
