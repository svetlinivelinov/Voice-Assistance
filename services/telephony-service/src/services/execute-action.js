const { extractEntitiesFromTranscript } = require('../utils/entity-extractor');

function extractGatherInput(payload) {
  const data = payload?.data?.payload || {};
  const transcript = [
    data.transcription_text,
    data.transcript,
    data.text,
    data?.speech?.text
  ].find((value) => typeof value === 'string' && value.trim());

  const digitsValue = [data.digits, data.dtmf, data.dtmf_digits]
    .find((value) => value !== undefined && value !== null);

  const digits = typeof digitsValue === 'string' || typeof digitsValue === 'number'
    ? String(digitsValue).trim()
    : '';

  return {
    transcript: transcript ? transcript.trim() : '',
    digits
  };
}

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
  pendingLeadQueue,
  nlpClient,
  conversationEngineEnabled,
  crmServiceEnabled,
  crmRecoveryQueueEnabled = false,
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
    if (!session?.callControlId || session.callControlId === 'unknown') {
      return { status: 'skipped', reason: 'missing_call_control_id' };
    }

    if (!telnyxClient) {
      return { status: 'skipped', reason: 'telnyx_client_not_available' };
    }

    try {
      await telnyxClient.requestWithRetry(
        `/calls/${session.callControlId}/actions/gather_using_speak`,
        {
          method: 'POST',
          body: JSON.stringify({
            payload: 'Please tell me your property requirements after the beep.',
            voice: 'female',
            language: 'en-US',
            input: ['speech', 'dtmf'],
            maximum_digits: 8,
            timeout_secs: 5,
            inter_digit_timeout_secs: 2
          })
        }
      );

      return { status: 'awaiting_input', providerAction: 'gather_using_speak' };
    } catch (err) {
      logger.error({
        message: 'Failed to request next turn gather',
        action,
        requestId,
        reason: err.message
      });
      return { status: 'failed', reason: err.message };
    }
  }

  if (action === 'process_gather_result') {
    if (!session?.callControlId || session.callControlId === 'unknown') {
      return { status: 'skipped', reason: 'missing_call_control_id' };
    }

    if (!telnyxClient) {
      return { status: 'skipped', reason: 'telnyx_client_not_available' };
    }

    const { transcript, digits } = extractGatherInput(payload);
    if (!transcript && !digits) {
      return { status: 'skipped', reason: 'missing_gather_input' };
    }

    let extractedEntities = {};
    let intent = digits ? 'provide_phone' : 'collect_requirements';
    let intentConfidence = digits ? 0.6 : 0.5;

    if (transcript) {
      extractedEntities = nlpClient
        ? await nlpClient.extractEntities(transcript, requestId).catch(() => extractEntitiesFromTranscript(transcript))
        : extractEntitiesFromTranscript(transcript);

      if (nlpClient?.classifyIntent) {
        const classified = await nlpClient.classifyIntent(transcript, requestId).catch(() => null);
        if (classified?.intent) {
          intent = classified.intent;
          intentConfidence = typeof classified.confidence === 'number'
            ? classified.confidence
            : intentConfidence;
        }
      }
    }

    if (callSessionStore && session?.callControlId) {
      callSessionStore.upsert(session.callControlId, (previous) => ({
        ...previous,
        latestTranscript: transcript || previous?.latestTranscript,
        latestEntities: {
          ...(previous?.latestEntities || {}),
          ...extractedEntities,
          ...(digits ? { phone: digits } : {})
        },
        updatedAt: new Date().toISOString()
      }));
    }

    let responseText = transcript
      ? `Thanks, I heard: ${transcript}.`
      : `Thanks, I captured the digits ${digits}.`;
    let conversation = {
      status: 'skipped',
      reason: 'conversation_engine_not_enabled'
    };

    if (conversationEngineEnabled && conversationClient && session?.sessionId) {
      try {
        const conversationResponse = await conversationClient.planReply({
          sessionId: session.sessionId,
          intent,
          entities: extractedEntities,
          requestId
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
          message: 'Failed to plan reply for gather result',
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
      status: 'processed',
      providerAction: 'speak',
      gather: {
        transcript,
        digits
      },
      intent: {
        name: intent,
        confidence: intentConfidence
      },
      entities: extractedEntities,
      tts,
      conversation
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

      const extractedEntities = asr.status === 'ok' && asr.transcript
        ? (nlpClient
            ? await nlpClient.extractEntities(asr.transcript, requestId).catch(() => extractEntitiesFromTranscript(asr.transcript))
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
            entities: extractedEntities,
            requestId
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

      // Current MVP path uses Telnyx speak with plain text; synthesized audio is retained for future media streaming.
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

      try {
        await crmClient.upsertLead(lead, requestId);

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
        if (crmRecoveryQueueEnabled && pendingLeadQueue?.enqueue) {
          pendingLeadQueue.enqueue({
            lead,
            reason: error.message,
            requestId
          });

          if (callSessionStore && session?.callControlId) {
            callSessionStore.upsert(session.callControlId, (previous) => ({
              ...previous,
              crmQueuedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }));
          }
        }

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
            reason: error.message,
            queued_for_replay: Boolean(crmRecoveryQueueEnabled && pendingLeadQueue?.enqueue)
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