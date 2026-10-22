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

test('optional story/task reviewers accept null or a bounded login without inheriting assignments', () => {
  for (const make of [legacy, current]) {
    const old = make(); validateBoard(old, stories);
    assert.equal(Object.hasOwn(old.items[0], 'reviewer'), false);
    for (const reviewer of [null, 'reviewer-2', 'A', 'a'.repeat(39)]) {
      const value = make(); value.items[0].reviewer = reviewer;
      validateBoard(value, stories);
      assert.equal(value.items[0].reviewer, reviewer);
    }
  }
  const value = current(); value.items[0].reviewer = 'story-reviewer';
  const task = value.items[0].tasks['ENG0-T1'];
  validateBoard(value, stories);
  assert.equal(Object.hasOwn(task, 'reviewer'), false);
  for (const reviewer of [null, 'task-reviewer']) {
    task.reviewer = reviewer;
    validateBoard(value, stories);
    assert.equal(task.reviewer, reviewer);
    assert.equal(value.items[0].reviewer, 'story-reviewer');
  }
});

test('reviewer metadata rejects profile objects, arbitrary text, bad logins and extra private fields', () => {
  for (const reviewer of [undefined, '', ' name', 'name ', 'line\nbreak', 'user_name', 'user.name', '-name',
    'a'.repeat(40), 'user@example.com', 'https://github.com/user', '<script>alert(1)</script>', '한글',
    1, true, [], ['reviewer'], { login: 'reviewer', email: 'PRIVATE' }]) {
    for (const location of ['story', 'task']) {
      const value = current();
      (location === 'story' ? value.items[0] : value.items[0].tasks['ENG0-T1']).reviewer = reviewer;
      assert.throws(() => validateBoard(value, stories), undefined, `${location} reviewer must reject ${JSON.stringify(reviewer)}`);
    }
  }
  for (const mutate of [value => { value.reviewer = 'valid-user'; },
    value => { value.items[0].reviewerProfile = { email: 'PRIVATE' }; },
    value => { value.items[0].tasks['ENG0-T1'].reviewNotes = 'PRIVATE'; },
    value => { value.sprints[0].reviewer = 'valid-user'; }]) {
    const value = current(); mutate(value);
    assert.throws(() => validateBoard(value, stories), /Unexpected public board fields/);
  }
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
