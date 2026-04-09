# Telephony Cost Options and Decision Log

## Purpose
Track telephony provider options, tradeoffs, and the current project decision for cost control.

## Current Decision
Status: Approved for current phase
Selected option: Option B (Telnyx with US number)
Decision date: 2026-04-09

Reason:
- Lowest integration risk with current codebase (already built around Telnyx Call Control).
- Significant cost reduction compared to Bulgarian DID under Telnyx.
- Allows real call testing without reworking telephony architecture.

## Options Overview

### Option A: Bulgarian DID from local carrier (lowest BG PSTN cost)
Typical pricing (from current notes):
- DID monthly rental: 3-6 BGN
- Setup: 0-5 BGN
- Inbound: 0.02-0.05 BGN/min
- Outbound: 0.05-0.12 BGN/min

Pros:
- Lowest cost for Bulgarian real PSTN usage.

Cons:
- Loses native Telnyx Call Control flow.
- Requires SIP orchestration stack (Asterisk/FreeSWITCH/Kamailio or similar).
- Higher engineering effort and operational complexity.

### Option B: Telnyx with US number (current choice)
Typical pricing (from current notes):
- Number: about $1/month
- Inbound: about $0.0075/min
- Outbound: about $0.012/min

Pros:
- Very low cost for MVP testing.
- Keeps existing Telnyx integration intact.
- Fastest path to real call validation.

Cons:
- Not a local Bulgarian number for end users.

### Option C: SignalWire (managed call-control alternative)
Typical BG DID range from current notes:
- 3-5 EUR/month
- 1-3 EUR setup
- 0.02-0.04 EUR/min inbound

Pros:
- Lower EU pricing than some Telnyx scenarios.
- Managed call-control capabilities.

Cons:
- Requires provider migration work and retesting.

### Option D: Voximplant (EU-friendly managed option)
Typical BG DID range from current notes:
- 3-6 EUR/month
- 0.02-0.04 EUR/min inbound

Pros:
- Strong EU fit and call-control style features.

Cons:
- Provider migration effort and contract/test updates.

### Option E: Simulated calls (zero telecom cost)
Approach:
- WebRTC or SIP softphone simulation to backend
- No DID needed

Pros:
- Zero telephony spend.
- Great for CI and development flow testing.

Cons:
- Does not validate real PSTN behavior.

## Recommended Usage Strategy
1. Use Option B for real call MVP validation.
2. Use Option E for daily development and CI to control costs.
3. Re-evaluate Option A/C/D before Bulgarian pilot rollout.

## Immediate Next Actions for Option B
1. Buy/assign US Telnyx number.
2. Configure Telnyx Call Control app webhook to production HTTPS endpoint.
3. Set TELNYX_API_KEY and TELNYX_PUBLIC_KEY in deployed telephony-service.
4. Run readiness script: scripts/telnyx-readiness.ps1.
5. Execute first live call smoke test and log outcomes in E2E-Test-Results.md.

## Revisit Trigger
Re-evaluate this decision when any of the following happens:
1. Need for Bulgarian public pilot with local-number expectations.
2. Telecom monthly spend exceeds MVP budget target.
3. Call quality/routing issues appear in real traffic.
