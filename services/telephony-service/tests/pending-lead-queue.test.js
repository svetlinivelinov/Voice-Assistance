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

  test('pruneExpired removes stale entries older than configured max age', () => {
    const queue = createPendingLeadQueue({ persistEnabled: false });

    queue.enqueue({
      lead: {
        client_id: 'fresh-1',
        session_id: 'fresh-1',
        status: 'new'
      },
      reason: 'CRM timeout',
      requestId: 'rid-fresh'
    });

    queue.enqueue({
      lead: {
        client_id: 'stale-1',
        session_id: 'stale-1',
        status: 'new'
      },
      reason: 'CRM timeout',
      requestId: 'rid-stale'
    });

    const staleItem = queue.list().find((item) => item.lead.client_id === 'stale-1');
    staleItem.updatedAt = '2020-01-01T00:00:00.000Z';

    const cleanup = queue.pruneExpired({
      maxAgeHours: 1,
      now: new Date('2020-01-01T03:00:00.000Z')
    });

    expect(cleanup.removed_count).toBe(1);
    expect(cleanup.remaining_count).toBe(1);
    expect(queue.list().map((i) => i.lead.client_id)).toEqual(['fresh-1']);
  });

  test('getMetrics returns queue and counter snapshot', async () => {
    const queue = createPendingLeadQueue({ persistEnabled: false });

    queue.enqueue({
      lead: {
        client_id: 'metrics-1',
        session_id: 'metrics-1',
        status: 'new'
      },
      reason: 'CRM timeout',
      requestId: 'rid-metrics-1'
    });

    await queue.replay({
      replayFn: async () => {
        throw new Error('CRM still down');
      },
      requestId: 'rid-metrics-replay',
      maxItems: 10
    });

    const metrics = queue.getMetrics({ maxAgeHours: 168 });

    expect(metrics.queue_size).toBe(1);
    expect(metrics.stale_count).toBe(0);
    expect(metrics.counters).toEqual(
      expect.objectContaining({
        total_enqueued: 1,
        total_replayed: 0,
        total_replay_failures: 1,
        total_pruned: 0
      })
    );
  });
});
