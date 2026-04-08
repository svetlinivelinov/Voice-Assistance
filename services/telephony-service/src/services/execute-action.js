async function executeAction({
  action,
  session,
  payload,
  telnyxClient,
  asrAdapter,
  ttsAdapter,
  conversationClient,
  conversationEngineEnabled,
  greetingMessage,
  logger,
  requestId
}) {
  if (action === 'queue_inbound_call') {
    return {
      status: 'queued'
    };
  }

  if (action === 'start_voice_loop') {
    const startedAt = Date.now();

    if (!session?.callControlId || session.callControlId === 'unknown') {
      return {
        status: 'skipped',
        reason: 'missing_call_control_id'
      };
    }

    if (!telnyxClient) {
      return {
        status: 'skipped',
        reason: 'telnyx_client_not_available'
      };
    }

    try {
      const asr = asrAdapter
        ? await asrAdapter.transcribeAudio({
          audioBase64: payload?.data?.payload?.audio_base64,
          mimeType: payload?.data?.payload?.audio_mime_type || 'audio/wav'
        })
        : { status: 'skipped', reason: 'asr_adapter_not_available' };

      let responseText = asr.status === 'ok' && asr.transcript
        ? `Thanks, I heard: ${asr.transcript}. How can I help further?`
        : greetingMessage;
      let conversation = {
        status: 'skipped',
        reason: 'conversation_engine_not_enabled'
      };

      if (conversationEngineEnabled && conversationClient && session?.sessionId) {
        try {
          const conversationResponse = await conversationClient.planReply({
            sessionId: session.sessionId,
            intent: asr.status === 'ok' && asr.transcript ? 'collect_requirements' : 'unknown',
            entities: {}
          });

          const plannedReply = conversationResponse?.data?.reply_text;
          if (plannedReply) {
            responseText = plannedReply;
          }

          conversation = {
            status: 'ok',
            step: conversationResponse?.data?.session?.step || 'unknown'
          };
        } catch (error) {
          logger.error({
            message: 'Failed to plan response with conversation-engine',
            requestId,
            reason: error.message
          });
          conversation = {
            status: 'failed',
            reason: error.message
          };
        }
      }

      const tts = ttsAdapter
        ? await ttsAdapter.synthesizeText({ text: responseText })
        : { status: 'skipped', reason: 'tts_adapter_not_available' };

      // TODO: Stream synthesized audio bytes to Telnyx media endpoint when full audio path is enabled.
      await telnyxClient.requestWithRetry(
        `/calls/${session.callControlId}/actions/speak`,
        {
          method: 'POST',
          body: JSON.stringify({
            payload: responseText,
            voice: 'female',
            language: 'en-US'
          })
        }
      );

      return {
        status: 'invoked',
        providerAction: 'speak',
        asr,
        tts,
        conversation,
        metrics: {
          voiceTurnLatencyMs: Date.now() - startedAt
        }
      };
    } catch (error) {
      logger.error({
        message: 'Failed to execute Telnyx action',
        action,
        requestId,
        reason: error.message
      });

      return {
        status: 'failed',
        reason: error.message
      };
    }
  }

  if (action === 'close_call_session') {
    return {
      status: 'closed'
    };
  }

  return {
    status: 'ignored'
  };
}

module.exports = {
  executeAction
};