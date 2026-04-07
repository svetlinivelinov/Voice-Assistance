const { executeAction } = require('../src/services/execute-action');

describe('executeAction', () => {
  test('returns queued for queue_inbound_call', async () => {
    const result = await executeAction({
      action: 'queue_inbound_call',
      session: { callControlId: 'call-1' },
      payload: {},
      telnyxClient: null,
      asrAdapter: null,
      ttsAdapter: null,
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
      telnyxClient: { requestWithRetry: jest.fn() },
      asrAdapter: { transcribeAudio: jest.fn() },
      ttsAdapter: { synthesizeText: jest.fn() },
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
      telnyxClient: { requestWithRetry },
      asrAdapter: { transcribeAudio },
      ttsAdapter: { synthesizeText },
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
});