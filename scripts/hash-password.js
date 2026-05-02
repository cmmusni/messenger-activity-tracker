#!/usr/bin/env node
/**
 * Hash a password with bcrypt for the admin UI.
 * Usage: node scripts/hash-password.js '<your password>'
 */
'use strict';

const bcrypt = require('bcryptjs');

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}
const hash = bcrypt.hashSync(pw, 12);
console.log(hash);
