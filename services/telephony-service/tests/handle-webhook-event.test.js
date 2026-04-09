const { createCallSessionStore } = require('../src/services/call-session-store');
const { handleWebhookEvent } = require('../src/services/handle-webhook-event');

describe('handleWebhookEvent', () => {
  test('creates a ringing session and issues answer_inbound_call on call.initiated', () => {
    const store = createCallSessionStore();

    const result = handleWebhookEvent({
      payload: {
        data: {
          event_type: 'call.initiated',
          id: 'evt-init-1',
          payload: {
            call_control_id: 'call-1'
          }
        }
      },
      store
    });

    expect(result.action).toBe('answer_inbound_call');
    expect(result.session).toEqual(
      expect.objectContaining({
        callControlId: 'call-1',
        sessionId: expect.any(String),
        conversationId: expect.any(String),
        state: 'ringing',
        eventsCount: 1
      })
    );
  });

  test('updates existing session to in_progress on call.answered', () => {
    const store = createCallSessionStore();

    const first = handleWebhookEvent({
      payload: {
        data: {
          event_type: 'call.initiated',
          id: 'evt-init-2',
          payload: {
            call_control_id: 'call-2'
          }
        }
      },
      store
    });

    const result = handleWebhookEvent({
      payload: {
        data: {
          event_type: 'call.answered',
          id: 'evt-ans-2',
          payload: {
            call_control_id: 'call-2'
          }
        }
      },
      store
    });

    expect(result.action).toBe('start_voice_loop');
    expect(result.session).toEqual(
      expect.objectContaining({
        callControlId: 'call-2',
        sessionId: first.session.sessionId,
        conversationId: first.session.conversationId,
        state: 'in_progress',
        eventsCount: 2
      })
    );
  });

  test('call.speak.ended maps to request_next_turn and preserves in_progress state', () => {
    const store = createCallSessionStore();

    handleWebhookEvent({
      payload: {
        data: { event_type: 'call.initiated', id: 'evt-init-3', payload: { call_control_id: 'call-3' } }
      },
      store
    });
    handleWebhookEvent({
      payload: {
        data: { event_type: 'call.answered', id: 'evt-ans-3', payload: { call_control_id: 'call-3' } }
      },
      store
    });

    const result = handleWebhookEvent({
      payload: {
        data: { event_type: 'call.speak.ended', id: 'evt-speak-3', payload: { call_control_id: 'call-3' } }
      },
      store
    });

    expect(result.action).toBe('request_next_turn');
    expect(result.session.state).toBe('in_progress');
  });

  test('ignores duplicate events by event id', () => {
    const store = createCallSessionStore();

    handleWebhookEvent({
      payload: {
        data: { event_type: 'call.initiated', id: 'evt-dup-1', payload: { call_control_id: 'call-4' } }
      },
      store
    });

    // Same event ID sent again (Telnyx retry)
    const duplicate = handleWebhookEvent({
      payload: {
        data: { event_type: 'call.initiated', id: 'evt-dup-1', payload: { call_control_id: 'call-4' } }
      },
      store
    });

    expect(duplicate.action).toBe('ignore_duplicate_event');
  });
});
