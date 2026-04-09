const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPendingLeadQueue } = require('../src/services/pending-lead-queue');

describe('pending-lead-queue persistence', () => {
  function buildTempFilePath() {
    return path.join(
      os.tmpdir(),
      `telephony-pending-leads-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
  }

  test('restores queued leads from persisted file on startup', () => {
    const filePath = buildTempFilePath();

    const queueA = createPendingLeadQueue({
      persistEnabled: true,
      persistFilePath: filePath
    });

    queueA.enqueue({
      lead: {
        client_id: 'persist-1',
        session_id: 'persist-1',
        status: 'new'
      },
      reason: 'CRM down',
      requestId: 'rid-persist-1'
    });

    const queueB = createPendingLeadQueue({
      persistEnabled: true,
      persistFilePath: filePath
    });

    expect(queueB.size()).toBe(1);
    expect(queueB.list()[0].lead.client_id).toBe('persist-1');

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  test('replay success updates persisted file and removes replayed lead', async () => {
    const filePath = buildTempFilePath();

    const queue = createPendingLeadQueue({
      persistEnabled: true,
      persistFilePath: filePath
    });

    queue.enqueue({
      lead: {
        client_id: 'persist-2',
        session_id: 'persist-2',
        status: 'new'
      },
      reason: 'CRM timeout',
      requestId: 'rid-persist-2'
    });

    const replayResult = await queue.replay({
      replayFn: async () => ({ ok: true }),
      requestId: 'rid-replay-1',
      maxItems: 10
    });

    expect(replayResult.replayed_count).toBe(1);
    expect(replayResult.remaining_count).toBe(0);

    const queueAfterReplay = createPendingLeadQueue({
      persistEnabled: true,
      persistFilePath: filePath
    });
    expect(queueAfterReplay.size()).toBe(0);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
});
