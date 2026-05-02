'use strict';

const config = require('../config');

function adminAuth(req, res, next) {
  if (!config.adminApiKey) {
    return res.status(500).json({ error: 'ADMIN_API_KEY not configured' });
  }
  const provided = req.get('x-admin-api-key');
  if (!provided || provided !== config.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

module.exports = { adminAuth };
