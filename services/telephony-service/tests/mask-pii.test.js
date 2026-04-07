const { maskPII } = require('../src/logging/mask-pii');

describe('maskPII', () => {
  test('masks phone-like values and keeps last 4 digits', () => {
    const masked = maskPII({
      from: '+359888123456',
      to: '+359877654321'
    });

    expect(masked.from).toBe('***3456');
    expect(masked.to).toBe('***4321');
  });

  test('masks nested sensitive fields', () => {
    const masked = maskPII({
      data: {
        payload: {
          caller_id_number: '+359888111222',
          destination_number: '+359899222333',
          name: 'Ivan Petrov',
          email: 'ivan@example.com'
        }
      }
    });

    expect(masked.data.payload.caller_id_number).toBe('***1222');
    expect(masked.data.payload.destination_number).toBe('***2333');
    expect(masked.data.payload.name.endsWith('trov')).toBe(true);
    expect(masked.data.payload.email).toBe('i***@example.com');
  });
});