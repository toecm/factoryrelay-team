import assert from 'node:assert/strict';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCUMENT_LINKS = Object.freeze({
  'implementation-plan': 'https://docs.google.com/document/d/1KwRlp7MBw390ATHdlGqkU0L454Nrg9ME/edit?usp=sharing&ouid=110221377619081609877&rtpof=true&sd=true',
  'scrum-workbook': 'https://docs.google.com/spreadsheets/d/1Aq7vdfQrljMN5djOaWuvP0G82mTyYGhX/edit?usp=sharing&ouid=110221377619081609877&rtpof=true&sd=true',
  'backlog-csv': 'https://drive.google.com/file/d/1KFUzt4Qjd6RabX3z2ZMUJ-Cek3ydfWZ9/view?usp=sharing',
  'tasks-csv': 'https://drive.google.com/file/d/12TvNuVaHL7pKnKosOFWgexfls0sLnFcs/view?usp=sharing',
  'status-csv': 'https://drive.google.com/file/d/1Ri-SIZiMs7aDuOwmDziDRtsfMPQbv7zf/view?usp=sharing',
  proposal: 'https://docs.google.com/document/d/1aJPB2wxe3SFyAleRqN7H5LlV0ds-lD6x/edit?usp=sharing&ouid=110221377619081609877&rtpof=true&sd=true',
  presentation: 'https://docs.google.com/presentation/d/16UotXSiFlptzerqvwhXhckyWHuJqB04CMS5qMHlZi1g/edit?usp=sharing',
  'technical-report': 'https://docs.google.com/document/d/1Oa0uHe8665uH8g95tJ9dXdCLFuepzDeH/edit?usp=sharing&ouid=110221377619081609877&rtpof=true&sd=true',
  'user-manual': 'https://docs.google.com/document/d/1sQNovE9HbFqJwqayxxJbug-Owsx_9v51/edit?usp=sharing&ouid=110221377619081609877&rtpof=true&sd=true',
});
export const WEBSITE_FILES = Object.freeze([
  '.nojekyll', 'README.md', 'index.html', 'app.js', 'styles.css', 'board-model.js', 'github-client.js', 'assets/logo.svg',
  'data/documents-manifest.json', 'data/portal-data.json', 'data/github-board.json',
]);

const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const isoDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
const reviewerLogin = value => value === null || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value));

function exactKeys(object, keys) {
  assert(object && typeof object === 'object' && !Array.isArray(object), 'Expected an object');
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), 'Unexpected public board fields');
}

export function validateBoard(board, stories, forecastSprints = []) {
  const extended = Object.hasOwn(board || {}, 'sprints');
  exactKeys(board, ['enabled', 'syncedAt', 'repo', 'items', ...(extended ? ['sprints'] : [])]);
  assert.equal(typeof board.enabled, 'boolean');
  assert.equal(board.repo, 'toecm/factoryrelay');
  assert(Array.isArray(board.items));
  if (!board.enabled) {
    assert.equal(board.syncedAt, null);
    assert.equal(board.items.length, 0);
    if (extended) assert.deepEqual(board.sprints, []);
    return;
  }
  assert(isoDate(board.syncedAt), 'Invalid board timestamp');
  const knownStories = new Map(stories.map(story => [story.id, story]));
  const knownSprints = new Set(['Unscheduled', ...forecastSprints.map(sprint => sprint.id), ...stories.map(story => story.sprint).filter(Boolean)]);
  const statuses = ['Backlog', 'Ready', 'In progress', 'Review', 'Blocked', 'Deferred', 'Done'];
  const version = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const calendarDate = value => value === null || (typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
  if (extended) {
    assert(Array.isArray(board.sprints), 'Sprints must be an array');
    const ids = new Set(), numbers = new Set();
    for (const sprint of board.sprints) {
      exactKeys(sprint, ['id', 'title', 'goal', 'startDate', 'endDate', 'number', 'version', 'state']);
      assert(typeof sprint.id === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(sprint.id) && sprint.id !== 'Unscheduled');
      assert(typeof sprint.title === 'string' && sprint.title.trim() && sprint.title.length <= 120 && !/[\r\n\x00-\x1f]/.test(sprint.title));
      assert(typeof sprint.goal === 'string' && sprint.goal.length <= 2000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(sprint.goal));
      assert(calendarDate(sprint.startDate) && calendarDate(sprint.endDate));
      assert(!sprint.startDate || !sprint.endDate || sprint.startDate <= sprint.endDate);
      assert(Number.isSafeInteger(sprint.number) && sprint.number > 0 && version(sprint.version));
      assert(['open', 'closed'].includes(sprint.state) && !ids.has(sprint.id) && !numbers.has(sprint.number));
      ids.add(sprint.id); numbers.add(sprint.number); knownSprints.add(sprint.id);
    }
  }
  const seen = new Set();
  for (const item of board.items) {
    exactKeys(item, ['id', 'number', 'url', 'status', 'assignees', 'updatedAt', 'taskStatus', ...(extended ? ['version', 'sprint', 'milestoneNumber', 'tasks'] : []), ...(Object.hasOwn(item || {}, 'reviewer') ? ['reviewer'] : [])]);
    assert(knownStories.has(item.id) && !seen.has(item.id), 'Unknown or duplicate board story');
    assert(Number.isSafeInteger(item.number) && item.number > 0);
    assert.equal(item.url, `https://github.com/toecm/factoryrelay/issues/${item.number}`);
    assert(statuses.includes(item.status));
    assert(Array.isArray(item.assignees) && item.assignees.every(login => typeof login === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login)));
    assert.equal(new Set(item.assignees).size, item.assignees.length);
    // Reviewer fields are optional during rollout; only a login or null is public.
    if (Object.hasOwn(item, 'reviewer')) assert(reviewerLogin(item.reviewer), 'Invalid story reviewer');
    assert(item.updatedAt === null || isoDate(item.updatedAt));
    exactKeys(item.taskStatus, knownStories.get(item.id).taskIds);
    assert(Object.values(item.taskStatus).every(value => typeof value === 'boolean'));
    if (extended) {
      assert(version(item.version) && knownSprints.has(item.sprint));
      assert(item.milestoneNumber === null || (Number.isSafeInteger(item.milestoneNumber) && item.milestoneNumber > 0));
      exactKeys(item.tasks, knownStories.get(item.id).taskIds);
      for (const [id, task] of Object.entries(item.tasks)) {
        exactKeys(task, ['status', 'assignees', 'sprint', ...(Object.hasOwn(task || {}, 'reviewer') ? ['reviewer'] : [])]);
        if (Object.hasOwn(task, 'reviewer')) assert(reviewerLogin(task.reviewer), 'Invalid task reviewer');
        assert(statuses.includes(task.status) && knownSprints.has(task.sprint) && (task.status === 'Done') === item.taskStatus[id]);
        assert(Array.isArray(task.assignees) && task.assignees.length <= 10 && task.assignees.every(login => typeof login === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login)));
        assert.equal(new Set(task.assignees.map(login => login.toLowerCase())).size, task.assignees.length);
      }
    }
    seen.add(item.id);
  }
}

export async function verify(rootPath = ROOT) {
  const root = await realpath(rootPath);
  const documentsPath = await lstat(path.join(root, 'documents')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  assert.equal(documentsPath, null, 'Remove documents/ before publishing; the library uses external Google Drive links');
  // Reject symlinks at every website path component, including its directories.
  for (const name of WEBSITE_FILES) {
    let current = root;
    for (const [index, component] of name.split('/').entries()) {
      current = path.join(current, component);
      const info = await lstat(current);
      assert(!info.isSymbolicLink(), `Symlink is not a website asset: ${name}`);
      assert(index === name.split('/').length - 1 ? info.isFile() : info.isDirectory(), `Wrong asset type: ${name}`);
    }
    assert.equal(await realpath(current), current, `Asset escapes website root: ${name}`);
  }
  // Website subdirectories must contain only the allowlisted files.
  for (const directory of ['assets', 'data']) {
    const expected = WEBSITE_FILES.filter(name => name.startsWith(`${directory}/`)).map(name => name.slice(directory.length + 1)).sort();
    assert.deepEqual((await readdir(path.join(root, directory))).sort(), expected, `Unexpected files in ${directory}/`);
  }
  const data = await readJson(path.join(root, 'data/portal-data.json'));
  const manifest = await readJson(path.join(root, 'data/documents-manifest.json'));
  const board = await readJson(path.join(root, 'data/github-board.json'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.project, 'Factory Relay');
  assert.equal(data.stories.length, 22);
  assert.equal(data.tasks.length, 83);
  assert.equal(data.baseline.length, 8);
  assert.equal(data.sprints.length, 6);
  assert.equal(data.courseCriteria.length, 5);
  assert.equal(new Set(data.baseline.map(item => item.id)).size, 8);
  const ids = new Set(data.stories.map(story => story.id));
  assert.equal(ids.size, 22);
  const taskIds = new Set(data.tasks.map(task => task.id));
  assert.equal(taskIds.size, 83);
  for (const story of data.stories) {
    assert(/^(ENG\d+|R\d+)$/.test(story.id));
    assert(story.acceptance.length > 0 && story.tasks.length > 0);
    assert(story.dependencies.every(id => ids.has(id)));
    const tasks = data.tasks.filter(task => task.storyId === story.id);
    assert.deepEqual(tasks.map(task => task.id), story.taskIds);
    assert.deepEqual(tasks.map(task => task.title), story.tasks);
  }
  for (const task of data.tasks) assert(ids.has(task.storyId) && new RegExp(`^${task.storyId}-T[1-9]\\d*$`).test(task.id));
  for (const group of [...data.sprints, ...data.courseCriteria]) assert(group.storyIds.every(id => ids.has(id)));
  for (const resource of data.resources) assert.equal(new URL(resource.url).protocol, 'https:');
  assert(!/\b[A-Z]:[\\/]|\.release[\\/]/i.test(JSON.stringify(data)), 'Local/private evidence path in public data');
  validateBoard(board, data.stories, data.sprints);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.mode, 'external-links');
  assert.equal(Object.hasOwn(manifest, 'files'), false, 'Manifest retains downloadable files');
  assert.equal(manifest.documents.length, 9);
  assert.equal(data.documents.length, 9);
  assert.deepEqual(data.documents.map(document => document.id).sort(), Object.keys(DOCUMENT_LINKS).sort());
  const declared = [];
  for (const document of data.documents) {
    assert.equal(Object.hasOwn(document, 'files'), false, `${document.id} retains downloadable files`);
    exactKeys(document.link, ['href', 'label', 'provider']);
    assert.equal(document.link.href, DOCUMENT_LINKS[document.id], `Incorrect Google Drive destination: ${document.id}`);
    const url = new URL(document.link.href);
    assert.equal(url.protocol, 'https:');
    assert(['docs.google.com', 'drive.google.com'].includes(url.hostname));
    const provider = url.hostname === 'drive.google.com' ? 'Google Drive'
      : url.pathname.startsWith('/spreadsheets/') ? 'Google Sheets'
      : url.pathname.startsWith('/presentation/') ? 'Google Slides' : 'Google Docs';
    assert.equal(document.link.provider, provider);
    assert.equal(document.link.label, `Open in ${provider}`);
    declared.push({ id: document.id, ...document.link });
  }
  for (const document of manifest.documents) exactKeys(document, ['id', 'href', 'label', 'provider']);
  assert.deepEqual(manifest.documents, declared, 'Document manifest differs from portal links');
  return { root, files: WEBSITE_FILES.length, documents: manifest.documents.length, stories: data.stories.length, tasks: data.tasks.length, boardItems: board.items.length };
}

export async function stage(rootPath = ROOT) {
  const result = await verify(rootPath);
  const destination = path.resolve(result.root, '.site');
  assert.equal(path.dirname(destination), result.root);
  const previous = await lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (previous) {
    assert(previous.isDirectory() && !previous.isSymbolicLink(), 'Staging path must be an ordinary directory');
    assert.equal(await realpath(destination), destination);
    await rm(destination, { recursive: true, force: true });
  }
  for (const name of WEBSITE_FILES) {
    const target = path.join(destination, name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(result.root, name), target);
  }
  return { ...result, staged: '.site' };
}

async function main() {
  let root = ROOT, shouldStage = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage' && !shouldStage) shouldStage = true;
    else if (args[i] === '--root' && args[i + 1] && !args[i + 1].startsWith('--')) root = path.resolve(args[++i]);
    else throw new Error('Usage: node scripts/verify-static.mjs [--root PATH] [--stage]');
  }
  const result = await (shouldStage ? stage(root) : verify(root));
  console.log(JSON.stringify({ ...result, root: undefined }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Static portal verification failed: ${error.message}`); process.exitCode = 1; });
}
