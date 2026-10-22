import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBoard, WEBSITE_FILES } from './verify-static.mjs';

const stories = [{ id: 'ENG0', taskIds: ['ENG0-T1'], sprint: 'S1' }];
function legacy() {
  return { enabled: true, syncedAt: '2026-10-22T00:00:00Z', repo: 'toecm/factoryrelay', items: [{ id: 'ENG0', number: 1,
    url: 'https://github.com/toecm/factoryrelay/issues/1', status: 'Ready', assignees: [], updatedAt: null, taskStatus: { 'ENG0-T1': false } }] };
}
function current() {
  const result = legacy();
  result.sprints = [{ id: 'S7', title: 'Evaluation', goal: 'Review results.', startDate: '2026-11-01', endDate: '2026-11-14', number: 7, version: 'a'.repeat(64), state: 'open' }];
  Object.assign(result.items[0], { version: 'b'.repeat(64), sprint: 'S7', milestoneNumber: 7, tasks: { 'ENG0-T1': { status: 'Review', assignees: ['teammate'], sprint: 'S7' } } });
  return result;
}
test('legacy and extended board contracts remain accepted during gradual deployment', () => {
  validateBoard(legacy(), stories);
  validateBoard(current(), stories);
  validateBoard({ enabled: false, syncedAt: null, repo: 'toecm/factoryrelay', items: [] }, stories);
  assert.equal(WEBSITE_FILES.length, 11);
  assert(WEBSITE_FILES.includes('board-model.js') && WEBSITE_FILES.includes('github-client.js'));
});
test('public board rejects private fields, unsupported task fields and inconsistent completion', () => {
  for (const mutate of [s => { s.token = 'secret'; }, s => { s.items[0].body = 'PRIVATE'; }, s => { s.items[0].tasks['ENG0-T1'].notes = 'PRIVATE'; }, s => { s.items[0].tasks['ENG0-T1'].status = 'Done'; }, s => { s.items[0].tasks['ENG0-T1'].sprint = 'S99'; }, s => { s.items[0].version = 'private'; }, s => { s.items[0].tasks['ENG0-T1'].assignees = ['a', 'A']; }]) {
    const value = current(); mutate(value); assert.throws(() => validateBoard(value, stories));
  }
});
test('managed sprint snapshots reject invalid calendars, duplicate identifiers and unexpected fields', () => {
  for (const mutate of [s => { s.sprints[0].startDate = '2026-02-30'; }, s => { s.sprints[0].endDate = '2026-10-31'; }, s => { s.sprints[0].body = 'PRIVATE'; }, s => { s.sprints.push(s.sprints[0]); }, s => { s.sprints[0].id = '../S7'; }]) {
    const value = current(); mutate(value); assert.throws(() => validateBoard(value, stories));
  }
});
