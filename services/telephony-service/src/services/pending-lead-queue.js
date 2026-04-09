const fs = require('fs');
const path = require('path');

function createPendingLeadQueue(options = {}) {
  const persistEnabled = Boolean(options.persistEnabled);
  const persistFilePath = options.persistFilePath || path.resolve(process.cwd(), 'data', 'telephony-pending-leads.json');

  const itemsByClientId = new Map();
  const counters = {
    totalEnqueued: 0,
    totalReplayed: 0,
    totalReplayFailures: 0,
    totalPruned: 0
  };

  function persistToDisk() {
    if (!persistEnabled) {
      return;
    }

    const data = JSON.stringify(Array.from(itemsByClientId.values()), null, 2);
    fs.mkdirSync(path.dirname(persistFilePath), { recursive: true });
    fs.writeFileSync(persistFilePath, data, 'utf8');
  }

  function loadFromDisk() {
    if (!persistEnabled || !fs.existsSync(persistFilePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(persistFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      for (const item of parsed) {
        const clientId = item?.lead?.client_id;
        if (!clientId) {
          continue;
        }
        itemsByClientId.set(clientId, item);
      }
    } catch (_error) {
      // Ignore malformed persisted files and continue with an empty queue.
    }
  }

  loadFromDisk();

  function enqueue({ lead, reason, requestId }) {
    if (!lead?.client_id) {
      return null;
    }

    const existing = itemsByClientId.get(lead.client_id);
    const now = new Date().toISOString();

    if (existing) {
      const updated = {
        ...existing,
        lead: {
          ...existing.lead,
          ...lead
        },
        lastError: reason,
        lastRequestId: requestId,
        attempts: (existing.attempts || 0) + 1,
        updatedAt: now
      };
      itemsByClientId.set(lead.client_id, updated);
      counters.totalEnqueued += 1;
      persistToDisk();
      return updated;
    }

    const created = {
      lead,
      lastError: reason,
      lastRequestId: requestId,
      attempts: 1,
      createdAt: now,
      updatedAt: now
    };
    itemsByClientId.set(lead.client_id, created);
    counters.totalEnqueued += 1;
    persistToDisk();
    return created;
  }

  function list() {
    return Array.from(itemsByClientId.values());
  }

  function size() {
    return itemsByClientId.size;
  }

  function pruneExpired({ maxAgeHours = 168, now = new Date() } = {}) {
    const maxAgeMs = Math.max(1, Number(maxAgeHours)) * 60 * 60 * 1000;
    const nowMs = now.getTime();

    let removedCount = 0;

    for (const [clientId, item] of itemsByClientId.entries()) {
      const referenceTs = item.updatedAt || item.createdAt;
      if (!referenceTs) {
        continue;
      }

      const ageMs = nowMs - new Date(referenceTs).getTime();
      if (ageMs > maxAgeMs) {
        itemsByClientId.delete(clientId);
        removedCount += 1;
      }
    }

    if (removedCount > 0) {
      counters.totalPruned += removedCount;
      persistToDisk();
    }

    return {
      removed_count: removedCount,
      remaining_count: itemsByClientId.size,
      max_age_hours: Math.max(1, Number(maxAgeHours))
    };
  }

  async function replay({ replayFn, requestId, maxItems = 20 }) {
    const queued = Array.from(itemsByClientId.entries()).slice(0, Math.max(1, maxItems));

    let replayedCount = 0;
    let failedCount = 0;

    for (const [clientId, item] of queued) {
      try {
        await replayFn(item.lead, requestId);
        itemsByClientId.delete(clientId);
        counters.totalReplayed += 1;
        persistToDisk();
        replayedCount += 1;
      } catch (error) {
        counters.totalReplayFailures += 1;
        failedCount += 1;
        const now = new Date().toISOString();
        itemsByClientId.set(clientId, {
          ...item,
          lastError: error.message,
          lastRequestId: requestId,
          attempts: (item.attempts || 0) + 1,
          updatedAt: now
        });
        persistToDisk();
      }
    }

    return {
      replayed_count: replayedCount,
      failed_count: failedCount,
      remaining_count: itemsByClientId.size
    };
  }

  function countStale({ maxAgeHours = 168, now = new Date() } = {}) {
    const maxAgeMs = Math.max(1, Number(maxAgeHours)) * 60 * 60 * 1000;
    const nowMs = now.getTime();

    let staleCount = 0;
    for (const item of itemsByClientId.values()) {
      const referenceTs = item.updatedAt || item.createdAt;
      if (!referenceTs) {
        continue;
      }
      const ageMs = nowMs - new Date(referenceTs).getTime();
      if (ageMs > maxAgeMs) {
        staleCount += 1;
      }
    }

    return staleCount;
  }

  function getMetrics({ maxAgeHours = 168, now = new Date() } = {}) {
    return {
      queue_size: itemsByClientId.size,
      stale_count: countStale({ maxAgeHours, now }),
      counters: {
        total_enqueued: counters.totalEnqueued,
        total_replayed: counters.totalReplayed,
        total_replay_failures: counters.totalReplayFailures,
        total_pruned: counters.totalPruned
      },
      max_age_hours: Math.max(1, Number(maxAgeHours))
    };
  }

  return {
    enqueue,
    list,
    size,
    pruneExpired,
    replay,
    getMetrics
  };
}

module.exports = {
  createPendingLeadQueue
};
