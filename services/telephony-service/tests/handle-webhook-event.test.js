const { createCallSessionStore } = require('../src/services/call-session-store');
const { handleWebhookEvent } = require('../src/services/handle-webhook-event');

describe('handleWebhookEvent', () => {
  test('creates a ringing session on call.initiated', () => {
    const store = createCallSessionStore();

    const result = handleWebhookEvent({
      payload: {
        data: {
          event_type: 'call.initiated',
          payload: {
            call_control_id: 'call-1'
          }
        }
      },
      store
    });

    expect(result.action).toBe('queue_inbound_call');
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
});