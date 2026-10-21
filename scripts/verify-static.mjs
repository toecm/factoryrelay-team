import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCUMENTS = Object.freeze([
  'Factory_Relay_Adaptive_Edge_Presentation.pdf', 'Factory_Relay_Adaptive_Edge_Presentation.pptx',
  'Factory_Relay_Backlog.csv', 'Factory_Relay_Current_Status.csv',
  'Factory_Relay_Proposal_Two_Device_Offline.docx', 'Factory_Relay_Proposal_Two_Device_Offline.pdf',
  'Factory_Relay_Scrum_Backlog.xlsx', 'Factory_Relay_Tasks.csv',
  'Factory_Relay_Team_Implementation_Plan.docx', 'Factory_Relay_Team_Implementation_Plan.pdf',
  'Factory_Relay_Technical_Report.docx', 'Factory_Relay_Technical_Report.pdf',
  'Factory_Relay_User_Manual.docx', 'Factory_Relay_User_Manual.pdf',
].map(name => `documents/${name}`));
export const WEBSITE_FILES = Object.freeze([
  '.nojekyll', 'README.md', 'index.html', 'app.js', 'styles.css', 'assets/logo.svg',
  'data/documents-manifest.json', 'data/portal-data.json', 'data/github-board.json', ...DOCUMENTS,
]);

const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isoDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));

function exactKeys(object, keys) {
  assert(object && typeof object === 'object' && !Array.isArray(object), 'Expected an object');
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), 'Unexpected public board fields');
}

function validateBoard(board, stories) {
  exactKeys(board, ['enabled', 'syncedAt', 'repo', 'items']);
  assert.equal(typeof board.enabled, 'boolean');
  assert.equal(board.repo, 'toecm/factoryrelay');
  assert(Array.isArray(board.items));
  if (!board.enabled) {
    assert.equal(board.syncedAt, null);
    assert.equal(board.items.length, 0);
    return;
  }
  assert(isoDate(board.syncedAt), 'Invalid board timestamp');
  const knownStories = new Map(stories.map(story => [story.id, story]));
  const seen = new Set();
  for (const item of board.items) {
    exactKeys(item, ['id', 'number', 'url', 'status', 'assignees', 'updatedAt', 'taskStatus']);
    assert(knownStories.has(item.id) && !seen.has(item.id), 'Unknown or duplicate board story');
    assert(Number.isSafeInteger(item.number) && item.number > 0);
    assert.equal(item.url, `https://github.com/toecm/factoryrelay/issues/${item.number}`);
    assert(['Backlog', 'Ready', 'In progress', 'Review', 'Blocked', 'Deferred', 'Done'].includes(item.status));
    assert(Array.isArray(item.assignees) && item.assignees.every(login => typeof login === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login)));
    assert.equal(new Set(item.assignees).size, item.assignees.length);
    assert(item.updatedAt === null || isoDate(item.updatedAt));
    exactKeys(item.taskStatus, knownStories.get(item.id).taskIds);
    assert(Object.values(item.taskStatus).every(value => typeof value === 'boolean'));
    seen.add(item.id);
  }
}

export async function verify(rootPath = ROOT) {
  const root = await realpath(rootPath);
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
  for (const directory of ['assets', 'data', 'documents']) {
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
  validateBoard(board, data.stories);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.files.length, 14);
  const declared = data.documents.flatMap(document => document.files);
  assert.deepEqual(declared.map(file => file.href).sort(), [...DOCUMENTS].sort());
  assert.deepEqual(manifest.files.map(file => file.href).sort(), [...DOCUMENTS].sort());
  for (const file of manifest.files) {
    assert(/^[a-f0-9]{64}$/.test(file.sha256));
    const bytes = await readFile(path.join(root, file.href));
    assert.equal(bytes.length, file.bytes, `Document size differs: ${file.href}`);
    assert.equal(sha256(bytes), file.sha256, `Document hash differs: ${file.href}`);
    const declaration = declared.find(item => item.href === file.href);
    assert.equal(declaration.sha256, file.sha256);
    assert.equal(declaration.bytes, file.bytes);
  }
  return { root, files: WEBSITE_FILES.length, documents: manifest.files.length, stories: data.stories.length, tasks: data.tasks.length, boardItems: board.items.length };
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
