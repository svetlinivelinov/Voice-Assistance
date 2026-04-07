const { randomUUID } = require('crypto');

function resolveAction(eventType) {
  switch (eventType) {
    case 'call.initiated':
      return 'queue_inbound_call';
    case 'call.answered':
      return 'start_voice_loop';
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
  const action = resolveAction(eventType);
  const callControlId = getCallControlId(payload);

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