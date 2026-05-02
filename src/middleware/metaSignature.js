'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

function verifyMetaSignature(req, res, next) {
  const header = req.get('x-hub-signature-256');

  if (!config.appSecret) {
    if (config.isProduction) {
      logger.error('APP_SECRET not configured in production. Rejecting webhook.');
      return res.status(500).send('Server misconfigured');
    }
    logger.warn('APP_SECRET not set — skipping signature verification (dev only).');
    return next();
  }

  if (!header) {
    if (config.isProduction) {
      logger.warn('Missing x-hub-signature-256 in production. Rejecting.');
      return res.sendStatus(403);
    }
    logger.warn('Missing x-hub-signature-256 — allowed only in non-production.');
    return next();
  }

  if (!req.rawBody) {
    logger.error('Raw body not captured; cannot verify signature.');
    return res.sendStatus(403);
  }

  const [algo, sig] = header.split('=');
  if (algo !== 'sha256' || !sig) {
    return res.sendStatus(403);
  }

  const expected = crypto
    .createHmac('sha256', config.appSecret)
    .update(req.rawBody)
    .digest('hex');

  let valid = false;
  try {
    valid =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    valid = false;
  }

  if (!valid) {
    logger.warn('Invalid webhook signature.');
    return res.sendStatus(403);
  }

  return next();
}

module.exports = { verifyMetaSignature };
