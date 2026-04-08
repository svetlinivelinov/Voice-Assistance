const { executeAction } = require('../src/services/execute-action');

describe('executeAction', () => {
  test('requests gather_using_speak on request_next_turn', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });

    const result = await executeAction({
      action: 'request_next_turn',
      session: { callControlId: 'call-next-1' },
      payload: {},
      callSessionStore: null,
      telnyxClient: { requestWithRetry },
      asrAdapter: null,
      ttsAdapter: null,
      conversationClient: null,
      crmClient: null,
      nlpClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-next'
    });

    expect(requestWithRetry).toHaveBeenCalledWith(
      '/calls/call-next-1/actions/gather_using_speak',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual({ status: 'awaiting_input', providerAction: 'gather_using_speak' });
  });

  test('processes gather result and routes to conversation-engine', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });
    const synthesizeText = jest.fn().mockResolvedValue({ status: 'ok', mimeType: 'audio/mpeg' });
    const planReply = jest.fn().mockResolvedValue({
      data: {
        reply_text: 'Thanks. What is your preferred viewing date?',
        session: { step: 'collect_viewing_date' }
      }
    });
    const storeUpsert = jest.fn().mockImplementation((_id, updater) => updater({ latestEntities: {} }));
    const classifyIntent = jest.fn().mockResolvedValue({ intent: 'provide_location', confidence: 0.86 });
    const extractEntities = jest.fn().mockResolvedValue({ location: 'Downtown', property_type: 'apartment' });

    const result = await executeAction({
      action: 'process_gather_result',
      session: {
        callControlId: 'call-gather-1',
        sessionId: 'session-gather-1'
      },
      payload: {
        data: {
          payload: {
            transcription_text: 'I am looking in downtown for an apartment'
          }
        }
      },
      callSessionStore: { upsert: storeUpsert },
      telnyxClient: { requestWithRetry },
      asrAdapter: null,
      ttsAdapter: { synthesizeText },
      conversationClient: { planReply },
      crmClient: null,
      nlpClient: { classifyIntent, extractEntities },
      conversationEngineEnabled: true,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-gather'
    });

    expect(classifyIntent).toHaveBeenCalledWith('I am looking in downtown for an apartment');
    expect(extractEntities).toHaveBeenCalledWith('I am looking in downtown for an apartment');
    expect(planReply).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-gather-1',
        intent: 'provide_location',
        entities: expect.objectContaining({ location: 'Downtown' })
      })
    );
    expect(requestWithRetry).toHaveBeenCalledWith(
      '/calls/call-gather-1/actions/speak',
      expect.objectContaining({ method: 'POST' })
    );
    const telnyxCallBody = JSON.parse(requestWithRetry.mock.calls[0][1].body);
    expect(telnyxCallBody.payload).toBe('Thanks. What is your preferred viewing date?');
    expect(result).toEqual(
      expect.objectContaining({
        status: 'processed',
        providerAction: 'speak',
        intent: expect.objectContaining({ name: 'provide_location' }),
        conversation: expect.objectContaining({ status: 'ok', step: 'collect_viewing_date' })
      })
    );
  });

  test('skips process_gather_result when transcript and digits are missing', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });

    const result = await executeAction({
      action: 'process_gather_result',
      session: { callControlId: 'call-gather-2', sessionId: 'session-gather-2' },
      payload: { data: { payload: {} } },
      callSessionStore: null,
      telnyxClient: { requestWithRetry },
      asrAdapter: null,
      ttsAdapter: null,
      conversationClient: null,
      crmClient: null,
      nlpClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-gather-missing'
    });

    expect(requestWithRetry).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'skipped', reason: 'missing_gather_input' });
  });

  test('answers inbound call with Telnyx actions/answer on answer_inbound_call', async () => {
    const requestWithRetry = jest.fn().mockResolvedValue({ ok: true });

    const result = await executeAction({
      action: 'answer_inbound_call',
      session: { callControlId: 'call-answer-1' },
      payload: {},
      callSessionStore: null,
      telnyxClient: { requestWithRetry },
      asrAdapter: null,
      ttsAdapter: null,
      conversationClient: null,
      crmClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-answer'
    });

    expect(requestWithRetry).toHaveBeenCalledWith(
      '/calls/call-answer-1/actions/answer',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual({ status: 'answered' });
  });

  test('skips answer when callControlId is unknown', async () => {
    const result = await executeAction({
      action: 'answer_inbound_call',
      session: { callControlId: 'unknown' },
      payload: {},
      callSessionStore: null,
      telnyxClient: { requestWithRetry: jest.fn() },
      asrAdapter: null,
      ttsAdapter: null,
      conversationClient: null,
      crmClient: null,
      conversationEngineEnabled: false,
      crmServiceEnabled: false,
      asrMinConfidence: 0.6,
      greetingMessage: 'hello',
      logger: { error: jest.fn() },
      requestId: 'r-skip'
    });

    expect(result).toEqual({ status: 'skipped', reason: 'missing_call_control_id' });
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