const { extractEntitiesFromTranscript } = require('../utils/entity-extractor');

async function executeAction({
  action,
  session,
  payload,
  callSessionStore,
  telnyxClient,
  asrAdapter,
  ttsAdapter,
  conversationClient,
  crmClient,
  nlpClient,
  conversationEngineEnabled,
  crmServiceEnabled,
  asrMinConfidence = 0.6,
  greetingMessage,
  logger,
  requestId
}) {
  if (action === 'answer_inbound_call') {
    if (!session?.callControlId || session.callControlId === 'unknown') {
      return { status: 'skipped', reason: 'missing_call_control_id' };
    }
    if (!telnyxClient) {
      return { status: 'skipped', reason: 'telnyx_client_not_available' };
    }
    try {
      await telnyxClient.requestWithRetry(
        `/calls/${session.callControlId}/actions/answer`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      return { status: 'answered' };
    } catch (err) {
      logger.error({
        message: 'Failed to answer inbound call',
        action,
        requestId,
        reason: err.message
      });
      return { status: 'failed', reason: err.message };
    }
  }

  if (action === 'request_next_turn') {
    // call.speak.ended — TTS finished, ready for next utterance
    // TODO: start streaming STT or gatherUsingSpeak when audio collection is wired
    return { status: 'awaiting_input' };
  }

  if (action === 'process_gather_result') {
    // call.gather.ended — DTMF/speech gather completed; route via conversation-engine
    // TODO: extract digits/transcript from payload and route through conversation-engine
    return { status: 'processing' };
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

      const extractedEntities = asr.status === 'ok' && asr.transcript
        ? (nlpClient
            ? await nlpClient.extractEntities(asr.transcript).catch(() => extractEntitiesFromTranscript(asr.transcript))
            : extractEntitiesFromTranscript(asr.transcript))
        : {};

      const asrConfidence = typeof asr?.confidence === 'number' ? asr.confidence : null;
      const isLowConfidence = asr.status === 'ok' && asrConfidence !== null && asrConfidence < asrMinConfidence;

      if (callSessionStore && session?.callControlId && extractedEntities && Object.keys(extractedEntities).length) {
        callSessionStore.upsert(session.callControlId, (previous) => ({
          ...previous,
          latestTranscript: asr.transcript,
          latestEntities: {
            ...(previous?.latestEntities || {}),
            ...extractedEntities
          },
          updatedAt: new Date().toISOString()
        }));
      }

      let responseText = asr.status === 'ok' && asr.transcript
        ? `Thanks, I heard: ${asr.transcript}. How can I help further?`
        : greetingMessage;
      let conversation = {
        status: 'skipped',
        reason: 'conversation_engine_not_enabled'
      };

      if (isLowConfidence) {
        responseText = 'Sorry, I did not catch that clearly. Could you please repeat in a short sentence?';
        conversation = {
          status: 'skipped',
          reason: 'asr_low_confidence'
        };
      }

      if (!isLowConfidence && conversationEngineEnabled && conversationClient && session?.sessionId) {
        try {
          const conversationResponse = await conversationClient.planReply({
            sessionId: session.sessionId,
            intent: asr.status === 'ok' && asr.transcript ? 'collect_requirements' : 'unknown',
            entities: extractedEntities
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
    if (crmServiceEnabled && crmClient && session?.sessionId && !session?.crmPersistedAt) {
      try {
        const lead = {
          client_id: session.sessionId,
          phone: session?.latestEntities?.phone || payload?.data?.payload?.from,
          name: session?.latestEntities?.name,
          budget: session?.latestEntities?.budget,
          location: session?.latestEntities?.location,
          property_type: session?.latestEntities?.property_type,
          move_in_date: session?.latestEntities?.move_in_date,
          viewing_date: session?.latestEntities?.viewing_date,
          notes: session?.latestTranscript || 'Partial lead captured from interrupted call',
          status: 'new',
          session_id: session.sessionId
        };

        await crmClient.upsertLead(lead);

        if (callSessionStore && session?.callControlId) {
          callSessionStore.upsert(session.callControlId, (previous) => ({
            ...previous,
            crmPersistedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }));
        }

        return {
          status: 'closed',
          crm: {
            status: 'persisted_partial_lead'
          }
        };
      } catch (error) {
        logger.error({
          message: 'Failed to persist partial lead on call close',
          requestId,
          sessionId: session.sessionId,
          reason: error.message
        });

        return {
          status: 'closed',
          crm: {
            status: 'failed',
            reason: error.message
          }
        };
      }
    }

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