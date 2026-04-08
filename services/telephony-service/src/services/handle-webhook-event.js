const { randomUUID } = require('crypto');

function resolveAction(eventType) {
  switch (eventType) {
    case 'call.initiated':
      return 'answer_inbound_call';
    case 'call.answered':
      return 'start_voice_loop';
    case 'call.speak.ended':
      return 'request_next_turn';
    case 'call.gather.ended':
      return 'process_gather_result';
    case 'call.hangup':
    case 'call.ended':
      return 'close_call_session';
    default:
      return 'ignore_unknown_event';
  }
}

function resolveState(eventType, previousState = 'new') {
  switch (eventType) {
    case 'call.initiated':
      return 'ringing';
    case 'call.answered':
      return 'in_progress';
    case 'call.speak.ended':
    case 'call.gather.ended':
      return previousState; // remain in current state
    case 'call.hangup':
    case 'call.ended':
      return 'ended';
    default:
      return previousState;
  }
}

function getCallControlId(payload) {
  return (
    payload?.data?.payload?.call_control_id ||
    payload?.data?.payload?.call_session_id ||
    payload?.data?.payload?.call_leg_id ||
    payload?.data?.id ||
    'unknown'
  );
}

function handleWebhookEvent({ payload, store }) {
  const eventType = payload?.data?.event_type || payload?.data?.record_type || 'unknown';
  const eventId = payload?.data?.id;
  const callControlId = getCallControlId(payload);

  // Idempotency — skip already-processed events to prevent double-firing
  if (eventId && store.hasProcessed && store.hasProcessed(eventId)) {
    const existingSession = store.get(callControlId) || { callControlId, sessionId: 'unknown', conversationId: 'unknown', state: 'unknown' };
    return {
      eventType,
      action: 'ignore_duplicate_event',
      session: existingSession
    };
  }

  const action = resolveAction(eventType);

  const session = store.upsert(callControlId, (previous) => {
    const now = new Date().toISOString();
    const providedSessionId = payload?.data?.payload?.call_session_id;
    const providedConversationId = payload?.data?.payload?.conversation_id;

    return {
      callControlId,
      sessionId: previous?.sessionId || providedSessionId || `session-${randomUUID()}`,
      conversationId: previous?.conversationId || providedConversationId || `conversation-${randomUUID()}`,
      state: resolveState(eventType, previous?.state),
      lastEventType: eventType,
      updatedAt: now,
      createdAt: previous?.createdAt || now,
      eventsCount: (previous?.eventsCount || 0) + 1
    };
  });

  if (eventId && store.markProcessed) {
    store.markProcessed(eventId);
  }

  return {
    eventType,
    action,
    session
  };
}

module.exports = {
  handleWebhookEvent,
  resolveAction,
  resolveState,
  getCallControlId
};