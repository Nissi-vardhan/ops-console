// Quick check of lib/kb-select.ts (pure). Run: node scripts/kb-select.test.mjs
// (Node >= 22.6 with type stripping; on Node 24 it is on by default.)
import assert from 'node:assert/strict';
import { kbBaseTitle, kbSupersedes, selectKbDocs } from '../lib/kb-select.ts';

assert.equal(kbBaseTitle('Pricing FAQ (v2, 27 Sep 2026)'), 'Pricing FAQ');
assert.equal(kbBaseTitle('Pricing FAQ (v3)'), 'Pricing FAQ');
assert.equal(kbBaseTitle('Pricing FAQ'), 'Pricing FAQ');
assert.equal(kbBaseTitle('Plans (India) '), 'Plans (India)');
assert.equal(kbSupersedes('Supersedes: Old name (v1)\nbody'), 'Old name (v1)');
assert.equal(kbSupersedes('intro\nSupersedes: X'), null);

const d = (id, title, body, day) => ({ id, title, body, updated_at: `2026-09-${day}T10:00:00Z` });
const out = selectKbDocs([
   d('a1', 'Pricing FAQ (v1, 20 Sep)', 'old', '20'),
   d('a2', 'Pricing FAQ (v2, 25 Sep)', 'new', '25'),
   d('b1', 'Refund policy', 'r1', '10'),
   d('b2', 'Refunds & cancellations', 'Supersedes: Refund policy\nr2', '26'),
   d('c1', 'Coach bios (v1)', 'c1', '21'),
   d('c2', 'Coach profiles', 'Supersedes: Coach bios (v1)\nc2', '22'),
   d('c3', 'Coach roster (v1)', 'Supersedes: Coach profiles\nc3', '23'),
   d('e1', 'Batch timings', 'solo', '05'),
]);
assert.deepEqual(
   out.map((x) => [x.id, x.base_title]),
   [
      ['e1', 'Batch timings'],
      ['c3', 'Coach roster'],
      ['a2', 'Pricing FAQ'],
      ['b2', 'Refunds & cancellations'],
   ]
);
// Order of input must not matter.
assert.deepEqual(
   selectKbDocs([d('x2', 'T (v2)', '', '02'), d('x1', 'T (v1)', '', '01')]).map((x) => x.id),
   ['x2']
);
console.log('kb-select: all tests passed');
