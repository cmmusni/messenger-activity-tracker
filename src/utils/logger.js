'use strict';

const SENSITIVE_KEYS = ['page_access_token', 'pageaccesstoken', 'app_secret', 'appsecret', 'access_token', 'admin_api_key', 'authorization'];

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    let out = value;
    SENSITIVE_KEYS.forEach((k) => {
      const re = new RegExp(`(${k}["'\\s:=]+)([A-Za-z0-9._\\-]+)`, 'gi');
      out = out.replace(re, '$1[REDACTED]');
    });
    return out;
  }
  if (typeof value === 'object') {
    try {
      const clone = Array.isArray(value) ? [...value] : { ...value };
      for (const key of Object.keys(clone)) {
        if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
          clone[key] = '[REDACTED]';
        } else {
          clone[key] = redact(clone[key]);
        }
      }
      return clone;
    } catch {
      return value;
    }
  }
  return value;
}

function fmt(level, args) {
  const ts = new Date().toISOString();
  const safe = args.map((a) => redact(a));
  return [`[${ts}]`, `[${level}]`, ...safe];
}

module.exports = {
  info: (...args) => console.log(...fmt('INFO', args)),
  warn: (...args) => console.warn(...fmt('WARN', args)),
  error: (...args) => console.error(...fmt('ERROR', args)),
  debug: (...args) => {
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      console.log(...fmt('DEBUG', args));
    }
  },
};
