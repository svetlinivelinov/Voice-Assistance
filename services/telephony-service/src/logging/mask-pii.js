const SENSITIVE_KEYS = new Set([
  'phone',
  'from',
  'to',
  'caller_id_number',
  'destination_number',
  'email',
  'name'
]);

function maskString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 7) {
    const lastFour = digits.slice(-4);
    return `***${lastFour}`;
  }

  if (trimmed.includes('@')) {
    const [user, domain] = trimmed.split('@');
    if (!domain) {
      return '***';
    }
    return `${user.slice(0, 1) || '*'}***@${domain}`;
  }

  if (trimmed.length <= 4) {
    return '***';
  }

  return `${'*'.repeat(Math.max(trimmed.length - 4, 3))}${trimmed.slice(-4)}`;
}

function maskPII(value, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => maskPII(item, parentKey));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => {
      acc[key] = maskPII(val, key);
      return acc;
    }, {});
  }

  if (SENSITIVE_KEYS.has(parentKey)) {
    return maskString(value);
  }

  return value;
}

module.exports = {
  maskPII
};