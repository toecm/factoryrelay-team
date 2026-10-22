// Shared, dependency-free board contract. Never evaluate JSON from an issue body.
export const BOARD_STATUSES = Object.freeze(['Backlog', 'Ready', 'In progress', 'Review', 'Blocked', 'Deferred', 'Done']);
export const SPRINT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/;
export const LOGIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const TASK_START = '<!-- factory-relay-board:v1';
const TASK_END = 'factory-relay-board:end -->';
const SPRINT_START = '<!-- factory-relay-sprint:v1';
const SPRINT_END = 'factory-relay-sprint:end -->';

export function boardError(message, code = 'invalid', status = 400) {
  return Object.assign(new Error(message), { code, status });
}
export function isSprintId(value) { return typeof value === 'string' && value !== 'Unscheduled' && SPRINT_ID_PATTERN.test(value); }
export function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function keys(value, allowed) {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) throw boardError('Unsupported board metadata field.');
}
export function validateAssignees(value) {
  if (!Array.isArray(value) || value.length > 10 || value.some(login => typeof login !== 'string' || !LOGIN_PATTERN.test(login)) || new Set(value.map(login => login.toLowerCase())).size !== value.length) {
    throw boardError('Assignees must be a unique list of up to ten GitHub logins.');
  }
  return value;
}
export function validateReviewer(value) {
  if (value !== null && (typeof value !== 'string' || !LOGIN_PATTERN.test(value))) throw boardError('Reviewer must be one GitHub login or null.');
  return value;
}
export function validateSprintFields(value) {
  if (!isSprintId(value.id) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || /[\r\n\x00-\x1f]/.test(value.title) ||
      typeof value.goal !== 'string' || value.goal.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.goal)) throw boardError('A sprint needs a safe ID, a title (120 characters maximum), and a goal (2,000 characters maximum).');
  for (const date of [value.startDate, value.endDate]) if (date !== null && !isDateOnly(date)) throw boardError('Sprint dates must be valid YYYY-MM-DD dates or null.');
  if (value.startDate && value.endDate && value.startDate > value.endDate) throw boardError('Sprint end date cannot precede its start date.');
  return value;
}
function extractBlock(body, start, end) {
  if (typeof body !== 'string' || body.length > 1000000) throw boardError('Unsupported issue or milestone text.');
  const first = body.indexOf(start);
  const endPosition = body.indexOf(end);
  if (first < 0 && endPosition < 0) return null;
  if (first < 0 || endPosition < first || body.indexOf(start, first + start.length) >= 0 || body.indexOf(end, endPosition + end.length) >= 0) throw boardError('Managed board metadata is malformed or duplicated.');
  const raw = body.slice(first + start.length, endPosition).trim();
  if (raw.length > 32768) throw boardError('Managed board metadata exceeds its size limit.');
  let value;
  try { value = JSON.parse(raw); } catch { throw boardError('Managed board metadata is not valid JSON.'); }
  return { value, start: first, end: endPosition + end.length };
}
function replaceBlock(body, start, end, value) {
  const found = extractBlock(body, start, end);
  const json = JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const block = `${start}\n${json}\n${end}`;
  return found ? body.slice(0, found.start) + block + body.slice(found.end) : `${body}${body.endsWith('\n') ? '\n' : '\n\n'}${block}`;
}
export function validateTaskOverrides(story, value) {
  keys(value, ['tasks', 'sprintUnscheduled', 'reviewer']);
  if (!record(value.tasks)) throw boardError('Managed task metadata must contain a task map.');
  if (Object.hasOwn(value, 'sprintUnscheduled') && value.sprintUnscheduled !== true) throw boardError('Unsupported story sprint override.');
  if (Object.hasOwn(value, 'reviewer')) validateReviewer(value.reviewer);
  for (const [id, entry] of Object.entries(value.tasks)) {
    if (!story.taskIds.includes(id)) throw boardError('Managed metadata contains an unknown task.');
    keys(entry, ['status', 'assignees', 'sprint', 'reviewer']);
    if (Object.hasOwn(entry, 'status') && !BOARD_STATUSES.includes(entry.status)) throw boardError('Unsupported task status.');
    if (Object.hasOwn(entry, 'assignees')) validateAssignees(entry.assignees);
    if (Object.hasOwn(entry, 'sprint') && entry.sprint !== 'Unscheduled' && !isSprintId(entry.sprint)) throw boardError('Unsupported task sprint.');
    if (Object.hasOwn(entry, 'reviewer')) validateReviewer(entry.reviewer);
  }
  return value;
}
export function parseTaskOverrides(story, body = '') {
  const block = extractBlock(body, TASK_START, TASK_END);
  return block ? validateTaskOverrides(story, block.value) : { tasks: {} };
}
export function writeTaskOverrides(story, body, value) {
  validateTaskOverrides(story, value);
  return replaceBlock(body, TASK_START, TASK_END, value);
}
export function resolveTaskState(storyState, taskId, overrides, completed) {
  const own = overrides.tasks[taskId] || {};
  const inheritedStatus = storyState.status === 'Done' ? 'Backlog' : storyState.status;
  return {
    status: completed ? 'Done' : (own.status && own.status !== 'Done' ? own.status : inheritedStatus),
    assignees: [...(own.assignees ?? storyState.assignees ?? [])],
    sprint: own.sprint ?? storyState.sprint ?? 'Unscheduled',
    // Review responsibility is independent: a task never inherits its story's reviewer.
    reviewer: own.reviewer ?? null,
  };
}
export function parseSprintMarker(description = '') {
  const block = extractBlock(description || '', SPRINT_START, SPRINT_END);
  if (!block) return null;
  keys(block.value, ['id', 'startDate', 'goal']);
  const { id, startDate, goal } = block.value;
  validateSprintFields({ id, startDate, goal, title: 'Managed sprint', endDate: null });
  return { id, startDate, goal };
}
export function writeSprintDescription(description, fields) {
  validateSprintFields(fields);
  return replaceBlock(description || '', SPRINT_START, SPRINT_END, { id: fields.id, startDate: fields.startDate, goal: fields.goal });
}
// Forecasts remain until a managed milestone replaces them. Raw GitHub descriptions
// and non-managed milestones are never included in this public UI contract.
export function mergeSprints(data, snapshot = {}) {
  const result = new Map((data.sprints || []).map(sprint => [sprint.id, { ...sprint, startDate: null, endDate: null, number: null, version: null, state: 'open' }]));
  for (const sprint of snapshot.sprints || []) result.set(sprint.id, { ...(result.get(sprint.id) || {}), ...sprint });
  return [...result.values()];
}
