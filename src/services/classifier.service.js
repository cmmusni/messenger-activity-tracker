'use strict';

const CATEGORY_RULES = [
  { name: 'DONE', prefix: /^done\s*:/i, hashtag: /#done\b/i },
  { name: 'BLOCKER', prefix: /^blocker\s*:/i, hashtag: /#blocker\b/i },
  { name: 'FYI', prefix: /^fyi\s*:/i, hashtag: /#fyi\b/i },
  { name: 'MEETING', prefix: /^meeting\s*:/i, hashtag: /#meeting\b/i },
  { name: 'INCIDENT', prefix: /^incident\s*:/i, hashtag: /#incident\b/i },
  { name: 'REQUEST', prefix: /^request\s*:/i, hashtag: /#request\b/i },
];

const STRUCTURED_RE = /#(team|project|priority)\s*:\s*([A-Za-z0-9_\-./]+)/gi;
const TICKET_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g;
// Match plain hashtags but skip ones immediately followed by ":" (structured tags).
const HASHTAG_RE = /#([A-Za-z0-9_\-]+)(?![A-Za-z0-9_\-:])/g;

function classify(text) {
  const result = {
    category: 'UNKNOWN',
    tags: [],
    team: null,
    project: null,
    priority: null,
    ticketRef: null,
  };

  if (!text || typeof text !== 'string') return result;

  for (const rule of CATEGORY_RULES) {
    if (rule.prefix.test(text) || rule.hashtag.test(text)) {
      result.category = rule.name;
      break;
    }
  }

  // Structured fields
  let m;
  const structuredRe = new RegExp(STRUCTURED_RE.source, 'gi');
  while ((m = structuredRe.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === 'team') result.team = val;
    else if (key === 'project') result.project = val;
    else if (key === 'priority') result.priority = val.toLowerCase();
  }

  // Plain hashtags (excluding structured `#key:value`)
  const tags = new Set();
  const hashtagRe = new RegExp(HASHTAG_RE.source, 'gi');
  while ((m = hashtagRe.exec(text)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  result.tags = Array.from(tags);

  // Ticket references
  const tickets = [];
  const ticketRe = new RegExp(TICKET_RE.source, 'g');
  while ((m = ticketRe.exec(text)) !== null) {
    tickets.push(`${m[1]}-${m[2]}`);
  }
  if (tickets.length) result.ticketRef = tickets.join(',');

  return result;
}

module.exports = { classify };
