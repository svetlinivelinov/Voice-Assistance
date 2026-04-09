const { createApp } = require('../src/app');
const { logger } = require('../src/logging/logger');

describe('telephony-service recovery metrics reporter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('emits periodic recovery queue metrics logs when feature flag enabled', () => {
    jest.useFakeTimers();
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      crmRecoveryMetricsLogEnabled: true,
      crmRecoveryMetricsLogIntervalMs: 1000,
      crmRecoveryQueueTtlHours: 168
    });

    jest.advanceTimersByTime(1000);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Recovery queue metrics snapshot',
        service: 'telephony-service',
        recovery_queue: expect.objectContaining({
          queue_size: expect.any(Number),
          stale_count: expect.any(Number),
          counters: expect.objectContaining({
            total_enqueued: expect.any(Number)
          })
        })
      })
    );
  });
});
