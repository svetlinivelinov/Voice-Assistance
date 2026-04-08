const { executeAction } = require('../src/services/execute-action');

describe('executeAction', () => {
  test('returns queued for queue_inbound_call', async () => {
    const result = await executeAction({
      action: 'queue_inbound_call',
      session: { callControlId: 'call-1' },
      payload: {},
      callSessionStore: null,
      telnyxClient: null,
      asrAdapter: null,
      ttsAdapter: null,
      conversationClient: null,
      crmClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r1'
    });

    expect(result).toEqual({ status: 'queued' });
  });

  test('skips voice loop when callControlId is missing', async () => {
    const result = await executeAction({
      action: 'start_voice_loop',
      session: { callControlId: 'unknown' },
      payload: {},
      callSessionStore: null,
      telnyxClient: { requestWithRetry: jest.fn() },
      asrAdapter: { transcribeAudio: jest.fn() },
      ttsAdapter: { synthesizeText: jest.fn() },
      conversationClient: null,
      crmClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r2'
    });

    expect(result).toEqual({ status: 'skipped', reason: 'missing_call_control_id' });
  });

  test('invokes telnyx speak action', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });
    const transcribeAudio = jest.fn().mockResolvedValue({ status: 'skipped', reason: 'missing_audio_payload' });
    const synthesizeText = jest.fn().mockResolvedValue({ status: 'skipped', reason: 'missing_tts_text' });

    const result = await executeAction({
      action: 'start_voice_loop',
      session: { callControlId: 'call-3' },
      payload: {},
      callSessionStore: {
        upsert: jest.fn()
      },
      telnyxClient: { requestWithRetry },
      asrAdapter: { transcribeAudio },
      ttsAdapter: { synthesizeText },
      conversationClient: null,
      crmClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r3'
    });

    expect(requestWithRetry).toHaveBeenCalledTimes(1);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    expect(synthesizeText).toHaveBeenCalledTimes(1);
    expect(requestWithRetry).toHaveBeenCalledWith(
      '/calls/call-3/actions/speak',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'invoked',
        providerAction: 'speak',
        asr: expect.objectContaining({ status: 'skipped' }),
        tts: expect.objectContaining({ status: 'skipped' }),
        metrics: expect.objectContaining({
          voiceTurnLatencyMs: expect.any(Number)
        })
      })
    );
    expect(result.metrics.voiceTurnLatencyMs).toBeGreaterThanOrEqual(0);
  });

  test('uses conversation-engine reply when enabled', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });
    const transcribeAudio = jest.fn().mockResolvedValue({ status: 'ok', transcript: 'Need a 2-bed in downtown' });
    const synthesizeText = jest.fn().mockResolvedValue({ status: 'ok', mimeType: 'audio/mpeg' });
    const planReply = jest.fn().mockResolvedValue({
      data: {
        reply_text: 'Could you share your budget range for the property?',
        session: {
          step: 'collect_budget'
        }
      }
    });

    const result = await executeAction({
      action: 'start_voice_loop',
      session: {
        callControlId: 'call-4',
        sessionId: 'session-4'
      },
      payload: {},
      callSessionStore: {
        upsert: jest.fn()
      },
      telnyxClient: { requestWithRetry },
      asrAdapter: { transcribeAudio },
      ttsAdapter: { synthesizeText },
      conversationClient: { planReply },
      crmClient: null,
      conversationEngineEnabled: true,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r4'
    });

    expect(planReply).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-4',
        intent: 'collect_requirements'
      })
    );
    const telnyxCallBody = JSON.parse(requestWithRetry.mock.calls[0][1].body);
    expect(telnyxCallBody.payload).toBe('Could you share your budget range for the property?');
    expect(result).toEqual(
      expect.objectContaining({
        status: 'invoked',
        conversation: expect.objectContaining({
          status: 'ok',
          step: 'collect_budget'
        })
      })
    );
  });

  test('uses clarification prompt when ASR confidence is below threshold', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });
    const transcribeAudio = jest
      .fn()
      .mockResolvedValue({ status: 'ok', transcript: 'maybe near center', confidence: 0.31 });
    const synthesizeText = jest.fn().mockResolvedValue({ status: 'ok', mimeType: 'audio/mpeg' });
    const planReply = jest.fn();

    const result = await executeAction({
      action: 'start_voice_loop',
      session: {
        callControlId: 'call-low-conf',
        sessionId: 'session-low-conf'
      },
      payload: {},
      callSessionStore: {
        upsert: jest.fn()
      },
      telnyxClient: { requestWithRetry },
      asrAdapter: { transcribeAudio },
      ttsAdapter: { synthesizeText },
      conversationClient: { planReply },
      crmClient: null,
      conversationEngineEnabled: true,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-low'
    });

    expect(planReply).not.toHaveBeenCalled();
    const telnyxSpeakPayload = JSON.parse(requestWithRetry.mock.calls[0][1].body);
    expect(telnyxSpeakPayload.payload).toBe(
      'Sorry, I did not catch that clearly. Could you please repeat in a short sentence?'
    );
    expect(result.conversation).toEqual(
      expect.objectContaining({
        status: 'skipped',
        reason: 'asr_low_confidence'
      })
    );
  });

  test('persists partial lead to CRM on close_call_session', async () => {
    const crmUpsert = jest.fn().mockResolvedValue({ data: { action: 'created' } });
    const storeUpsert = jest.fn().mockImplementation((_id, updater) => updater({}));

    const result = await executeAction({
      action: 'close_call_session',
      session: {
        callControlId: 'call-close-1',
        sessionId: 'session-close-1',
        latestTranscript: 'I need a 2 bedroom in downtown',
        latestEntities: {
          phone: '+15551234567',
          property_type: 'apartment',
          budget: '1800',
          location: 'Downtown'
        }
      },
      payload: {},
      callSessionStore: {
        upsert: storeUpsert
      },
      telnyxClient: null,
      asrAdapter: null,
      ttsAdapter: null,
      conversationClient: null,
      crmClient: { upsertLead: crmUpsert },
      conversationEngineEnabled: false,
      crmServiceEnabled: true,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-close'
    });

    expect(crmUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'session-close-1',
        phone: '+15551234567',
        status: 'new',
        session_id: 'session-close-1'
      })
    );
    expect(storeUpsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'closed',
        crm: expect.objectContaining({ status: 'persisted_partial_lead' })
      })
    );
  });
});