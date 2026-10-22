'use strict';

import { createPortalClient } from './github-client.js';

// Public snapshots remain readable; authenticated edits are saved to GitHub.
const REPO = 'https://github.com/toecm/factoryrelay';
const PORTAL_REPO = 'https://github.com/toecm/factoryrelay-team';
const STATUSES = ['Backlog', 'Ready', 'In progress', 'Review', 'Done', 'Blocked', 'Deferred'];
const NAV = [
  ['overview', 'Overview', 'grid'], ['board', 'Scrum board', 'board'],
  ['documents', 'Document library', 'document'], ['resources', 'Project resources', 'link'],
  ['sprints', 'Sprint roadmap', 'route'], ['research', 'Course & evidence', 'check'],
  ['status', 'Current status', 'pulse'],
];
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M6 7v4M12 7v8M18 7v3"/>',
  document: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6"/>',
  link: '<path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0M16 9l2-2a4 4 0 0 0-5-5l-5 5" transform="translate(2 2)"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h10a4 4 0 0 1 0 8H7a3 3 0 0 0 0 6h10"/>',
  check: '<path d="m6 12 4 4 8-9"/><rect x="3" y="3" width="18" height="18" rx="4"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external: '<path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1-.5-2-1-2 4-.5 7-2 7-6 0-2-1-3-2-4 0-1 0-3-1-3-2 0-3 1-4 1H10C9 3 8 2 6 2c-1 1-1 3-1 4-1 1-2 2-2 4 0 4 3 5.5 7 6-.5 0-1 1-1 2v4"/>',
  play: '<path d="m9 5 11 7-11 7z"/><path d="M4 4v16"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  cloud: '<path d="M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12z"/>',
};
const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.document}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag = (text, color='neutral') => `<span class="badge ${color}">${esc(text)}</span>`;
const statusColor = status => ({Ready:'teal',Done:'green',Review:'blue','In progress':'blue',Blocked:'red',Deferred:'amber'}[status] || 'neutral');
const prettyDate = value => value ? new Intl.DateTimeFormat('en', {day:'numeric',month:'short',year:'numeric'}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : 'Not connected';
const external = (url, text, cls='') => `<a class="${cls}" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
function safeUrl(value) {
  const url = new URL(value || '#', document.baseURI);
  return ['http:', 'https:'].includes(url.protocol) ? esc(url.href) : '#';
}
let data, snapshot = {enabled:false, items:[]};
let client = null, boardFit = true, saving = false, loginPending = false, draggedItem = null, editorContext = null;
let boardMessage = '', boardError = false, loginFailure = '', boardNeedsRefresh = false;
const reviewResults = new Map();
let route = 'overview', boardKind = 'stories', boardSearch = '', sprintFilter = '', priorityFilter = '', statusFilter = '', docCategory = '', docSearch = '', globalQuery = '';
const main = document.getElementById('main-content');
const dialog = document.getElementById('detail-dialog');
const previewDialog = document.getElementById('document-preview-dialog');
let previewTrigger = null;

function githubRecord(id) { return snapshot.items.find(item => item.id === id); }
function storyState(story) {
  const live = githubRecord(story.id);
  return {...story, status:live?.status || story.status, sprint:live?.sprint ?? story.sprint, owner:live ? (live.assignees || []).join(', ') : story.owner || '', reviewer:live?.reviewer ?? null, workBranch:live?.workBranch ?? null, reviewRequest:live?.reviewRequest ?? null, github:live};
}
function taskState(task) {
  const parent = storyState(data.stories.find(s => s.id === task.storyId));
  const live = parent.github?.tasks?.[task.id];
  const checked = parent.github?.taskStatus?.[task.id];
  // A closed parent does not fabricate completion for an unchecked task.
  const status = live?.status || (checked === true ? 'Done' : checked === false ? (parent.status === 'Done' ? 'Backlog' : parent.status) : task.status);
  return {...task, status, owner:live ? (live.assignees || []).join(', ') : parent.github ? parent.owner : task.owner, reviewer:live?.reviewer ?? null, workBranch:live?.workBranch ?? null, reviewRequest:live?.reviewRequest ?? null, parent, sprint:live?.sprint ?? parent.sprint, priority:parent.priority, completed:status === 'Done', live};
}
function allSprints() {
  const merged = new Map((data.sprints || []).map(sprint => [sprint.id, {...sprint}]));
  for (const sprint of snapshot.sprints || []) merged.set(sprint.id, {...merged.get(sprint.id), ...sprint});
  return [...merged.values()];
}
function sprintNames() { return [...new Set([...allSprints().map(s => s.id), ...data.stories.map(s => storyState(s).sprint), ...data.tasks.map(t => taskState(t).sprint), 'Unscheduled'])].filter(Boolean); }
function canEdit() { return Boolean(client?.session); }
function heading(eyebrow, title, text, action='') {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>${action}</div>`;
}
function boardNotice() {
  const connected = snapshot.enabled && snapshot.items.length > 0;
  const note = canEdit() ? `Signed in as ${client.session.login}. Changes save to GitHub. The team view refreshes automatically while signed in.` : connected ? `Public snapshot updated ${prettyDate(snapshot.syncedAt)}. Sign in with your invited GitHub account to plan sprints and update work here.` : 'The planning baseline is available. Sign in with your invited GitHub account to load shared work.';
  return `<div class="notice board-notice">${icon(canEdit() ? 'check' : 'github')}<div><strong>${canEdit() ? 'Shared work, saved to GitHub' : 'Plan together. Keep GitHub in sync.'}</strong><span>${esc(note)}</span>${client?.configured === false ? '<span class="configuration-note">Portal editing needs the project owner’s one-time GitHub connection setup. You can still read the board and use the GitHub links.</span>' : ''}</div><div class="board-auth-actions">${canEdit() ? `<button class="btn secondary small" data-action="refresh" ${saving ? 'disabled' : ''}>Refresh</button><button class="btn secondary small" data-action="logout" ${saving ? 'disabled' : ''}>Sign out</button>` : `<button class="btn primary small" data-action="login" ${loginPending ? 'disabled' : ''}>${icon('github')} ${loginPending ? 'Signing in…' : 'Sign in with GitHub'}</button>`}${loginFailure ? '<button class="btn secondary small" data-action="view-login-error">View sign-in error</button>' : ''}<button class="btn ghost small" data-action="guide">How it works ${icon('arrow')}</button></div></div><p class="board-message ${boardError ? 'form-error' : ''}" role="status" aria-live="polite">${esc(boardMessage || (saving ? 'Saving to GitHub…' : ''))}</p>`;
}
function resourceCard(resource) {
  const key = /dataset/i.test(resource.id + resource.title) ? 'database' : /space/i.test(resource.id + resource.title) ? 'cloud' : /guide/i.test(resource.id + resource.title) ? 'document' : /github|repo|issues|actions/i.test(resource.id + resource.title) ? 'github' : 'play';
  return external(resource.url, `<div class="resource-top"><span class="resource-icon ${key}">${icon(key)}</span>${icon('external')}</div><h3>${esc(resource.title)}</h3><p>${esc(resource.note || resource.description || '')}</p><div class="card-meta">${tag(resource.visibility || 'Resource', resource.visibility?.toLowerCase() === 'public' ? 'green' : 'neutral')}<span>${esc(new URL(resource.url).hostname)}</span></div>`, 'resource-card');
}
function reviewerLabel(login) { return login ? `<span class="card-reviewer">Reviewer: ${esc(login)}</span>` : ''; }
function storyCard(raw, compact=false) {
  const story = storyState(raw);
  const taskTotal = story.taskIds.length;
  const taskDone = story.taskIds.filter(id => story.github?.tasks?.[id] ? story.github.tasks[id].status === 'Done' : story.github?.taskStatus?.[id] === true).length;
  return `<button class="${compact ? 'ready-card' : 'story-card'}" data-story="${esc(story.id)}" data-card-kind="story" data-card-id="${esc(story.id)}" draggable="${canEdit() && !compact && !saving}" aria-label="${esc(story.id)}: ${esc(story.title)}. Open details${canEdit() ? ' to edit or move' : ''}."><div class="card-tags"><span class="item-id">${esc(story.id)}</span>${tag(story.priority, story.priority === 'Core' ? 'teal' : story.priority === 'Stretch' ? 'amber' : 'neutral')}</div><h3>${esc(story.title)}</h3>${compact ? `<p>${esc(story.deliverable.split('\n')[0])}</p>` : ''}<div class="card-meta"><span>${esc(story.sprint)} · ${taskDone}/${taskTotal} tasks</span><span>${esc(story.points)} pts</span></div><div class="card-owner"><span class="avatar-small">${story.owner ? esc(story.owner.slice(0,1).toUpperCase()) : '+'}</span><span>${esc(story.owner || 'Choose this work')}</span>${compact ? icon('arrow') : ''}</div>${reviewerLabel(story.reviewer)}</button>`;
}
function renderOverview() {
  const ready = data.stories.filter(s => storyState(s).status === 'Ready').slice(0,3);
  const done = data.stories.filter(s => storyState(s).status === 'Done').length;
  const doneTasks = data.tasks.filter(t => taskState(t).status === 'Done').length;
  main.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">FACTORY RELAY / TEAM WORKSPACE</span><h1>From working prototype<br>to research evidence.</h1><p>Your documents, decisions and next steps, in one place. Build on the game. Focus the study. Make progress together.</p><div class="hero-actions"><a class="btn primary" href="#board">Find your next task ${icon('arrow')}</a><a class="btn secondary" href="#documents">Open the documents</a></div></div><div class="hero-art" aria-label="Factory Relay communication loop"><div class="diagram-label">THE COMMUNICATION LOOP</div><div class="relay-node"><span class="node-number">01</span><div><strong>Send the message</strong><small>Keep the speaker’s meaning</small></div></div><div class="relay-connector">↓</div><div class="relay-node highlighted"><span class="node-number">02</span><div><strong>Check understanding</strong><small>Clarify before acting</small></div>${icon('check')}</div><div class="relay-connector">↓</div><div class="relay-node"><span class="node-number">03</span><div><strong>Choose the action</strong><small>Measure what happens</small></div></div></div></section>
    <div class="stats-grid"><div class="stat-card"><span class="stat-label">Existing baseline</span><strong class="stat-value">${data.baseline.length}<small> records</small></strong><span class="stat-note">Implemented work & boundaries</span></div><div class="stat-card"><span class="stat-label">Research stories</span><strong class="stat-value">${done}<small> / ${data.stories.length} done</small></strong><span class="stat-note">Separate from the game baseline</span></div><div class="stat-card"><span class="stat-label">Team tasks</span><strong class="stat-value">${doneTasks}<small> / ${data.tasks.length} done</small></strong><span class="stat-note">Choose work, then cross-review</span></div><div class="stat-card"><span class="stat-label">Course milestone</span><strong class="stat-value">01<small> / 05</small></strong><span class="stat-note">Problem establishment complete</span></div></div>
    <section><div class="section-head"><div><span class="eyebrow">START HERE</span><h2>Ready to pick up</h2></div><a class="text-link" href="#board">View the board ${icon('arrow')}</a></div><div class="grid-3">${ready.length ? ready.map(s => storyCard(s,true)).join('') : '<div class="empty-state">No stories marked Ready. Review the backlog with your team.</div>'}</div></section>
    <section><div class="section-head"><div><span class="eyebrow">YOUR PROJECT, CONNECTED</span><h2>One workspace. All the essentials.</h2></div><a class="text-link" href="#resources">All resources ${icon('arrow')}</a></div><div class="resource-grid">${data.resources.slice(0,4).map(resourceCard).join('')}</div></section>
    <div class="grid-2"><section class="panel"><div class="section-head"><h2>The next sprint</h2>${tag('S1 · Planning','teal')}</div><p class="lead-text">Confirm team access, language and device feasibility, and physical offline play.</p><ol class="next-steps"><li>Confirm all three members can run the game.</li><li>Review the first eight relevant primary studies.</li><li>Test one local translation path and two real devices.</li></ol><a class="text-link" href="#sprints">See the six-sprint forecast ${icon('arrow')}</a></section><section class="panel"><div class="section-head"><h2>Course progress</h2><span class="muted">Evidence comes first</span></div><div class="course-list">${courseItems(true)}</div><a class="text-link" href="#research">Explore course deliverables ${icon('arrow')}</a></section></div>
    ${boardNotice()}`;
}
function courseItems(compact=false) {
  return data.courseCriteria.map((item,i) => `<div class="course-item"><span class="step-dot ${i === 0 ? 'complete' : ''}">${i === 0 ? '✓' : String(i+1).padStart(2,'0')}</span><div><strong>${esc(item.title)}</strong>${!compact ? `<p>${esc(item.status)}</p>` : ''}</div>${compact ? tag(i === 0 ? 'Complete' : 'Next work', i === 0 ? 'green' : 'neutral') : ''}</div>`).join('');
}
function options(values, selected, allLabel) { return `<option value="">${esc(allLabel)}</option>${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}`; }
function boardDocumentActions() {
  const doc = data.documents.find(item => item.id === 'implementation-plan') || data.documents.find(item => item.link?.href?.includes('1KwRlp7MBw390ATHdlGqkU0L454Nrg9ME'));
  return doc ? `<div class="board-document-actions">${documentLink({...doc.link, label:'Open in Google Docs'})}<button class="btn secondary small" data-preview="${esc(doc.id)}" aria-label="Preview Team implementation plan" aria-haspopup="dialog">Preview ${icon('document')}</button></div>` : '';
}
function taskCard(item) {
  return `<button class="task-card" data-task="${esc(item.id)}" data-card-kind="task" data-card-id="${esc(item.id)}" draggable="${canEdit() && !saving}" aria-label="${esc(item.id)}: ${esc(item.title)}. Open task details."><div class="card-tags"><span class="item-id">${esc(item.id)}</span>${tag(item.priority,'neutral')}</div><h3>${esc(item.title)}</h3><div class="card-meta"><span>${esc(item.sprint)} · ${esc(item.storyId)}</span></div><div class="card-owner"><span class="avatar-small">${item.owner ? esc(item.owner[0].toUpperCase()) : '+'}</span><span>${esc(item.owner || 'Unassigned')}</span></div>${reviewerLabel(item.reviewer)}</button>`;
}
function renderBoard() {
  const items = boardKind === 'stories' ? data.stories.map(storyState) : data.tasks.map(taskState);
  const q = boardSearch.toLowerCase().trim();
  const filtered = items.filter(item => (!q || `${item.id} ${item.title} ${item.owner} ${item.reviewer || ''} ${item.story || ''}`.toLowerCase().includes(q)) && (!sprintFilter || item.sprint === sprintFilter) && (!priorityFilter || item.priority === priorityFilter) && (!statusFilter || item.status === statusFilter));
  main.innerHTML = heading('THE SHARED PLAN', 'Make the next move.', 'Pick work that supports the Sprint Goal. Keep ownership visible and ask another member to review.', boardDocumentActions()) + boardNotice() +
    `<div class="toolbar"><div class="tabs" role="group" aria-label="Board item type"><button class="tab ${boardKind === 'stories' ? 'active' : ''}" data-kind="stories" aria-pressed="${boardKind === 'stories'}">Stories <span>${data.stories.length}</span></button><button class="tab ${boardKind === 'tasks' ? 'active' : ''}" data-kind="tasks" aria-pressed="${boardKind === 'tasks'}">Tasks <span>${data.tasks.length}</span></button></div><div class="filter-group"><label class="sr-only" for="board-search">Search board</label><input id="board-search" type="search" placeholder="Find a task or story..." value="${esc(boardSearch)}"><label class="sr-only" for="sprint-filter">Sprint</label><select id="sprint-filter">${options(sprintNames(),sprintFilter,'All sprints')}</select><label class="sr-only" for="priority-filter">Priority</label><select id="priority-filter">${options(['Core','Conditional','Stretch'],priorityFilter,'All priorities')}</select><label class="sr-only" for="status-filter">Status</label><select id="status-filter">${options(STATUSES,statusFilter,'All statuses')}</select></div></div>
    <div class="board-controls"><label class="fit-board-control"><input id="fit-columns" type="checkbox" ${boardFit ? 'checked' : ''}>Fit all columns to screen</label><span class="muted">Narrow screens wrap columns into readable rows.</span><a class="btn secondary small" href="#sprints">Plan sprints ${icon('route')}</a><button class="btn secondary small" data-action="new-sprint" ${canEdit() ? '' : 'disabled'}>Create sprint</button></div>
    <div class="board-summary"><span>${filtered.length} ${boardKind} shown</span><span>${canEdit() ? 'Drag a ticket to a status column, or open it to change status, sprint and assignments.' : 'Sign in to edit. Open any ticket to inspect its details.'}</span></div>
    <div class="board-scroll ${boardFit ? 'fit-columns' : ''}" tabindex="0" aria-label="${boardFit ? 'Scrum board with columns fitted to screen' : 'Scrum board, scroll horizontally for more columns'}"><div class="kanban-board ${statusFilter ? 'single-column' : ''}">${(statusFilter ? [statusFilter] : STATUSES).map(status => {
      const group = filtered.filter(item => item.status === status);
      return `<section class="board-column" data-drop-status="${esc(status)}" aria-label="${esc(status)}"><div class="column-head"><h2><span class="column-dot ${statusColor(status)}"></span>${esc(status)}</h2><span class="column-count">${group.length}</span></div>${group.map(item => boardKind === 'stories' ? storyCard(item) : taskCard(item)).join('') || '<div class="column-empty">No work here yet.</div>'}</section>`;
    }).join('')}</div></div>${boardKind==='tasks' ? '<p class="muted">Tasks can have their own status, sprint and assignees. Completing tasks does not automatically close the story. Legacy tasks follow their story until individually updated.</p>' : ''}`;
  bindTextFilter('board-search', value => {boardSearch=value; renderBoard();});
  for (const [id, setter] of [['sprint-filter',v=>sprintFilter=v],['priority-filter',v=>priorityFilter=v],['status-filter',v=>statusFilter=v]]) document.getElementById(id).addEventListener('change', event=>{setter(event.target.value);renderBoard();});
  document.getElementById('fit-columns').addEventListener('change', event => {boardFit=event.target.checked;renderBoard();document.getElementById('fit-columns').focus();});
}
function documentLink(link) {
  return `<a class="btn secondary small" href="${safeUrl(link.href)}" target="_blank" rel="noopener">${esc(link.label)}${icon('external')}</a>`;
}
function documentPreviewUrl(link) {
  // Build a viewer URL from an allowed Google file path, never an arbitrary embed URL.
  try {
    const url = new URL(link.href);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    const pattern = url.hostname === 'drive.google.com' ? /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/ : url.hostname === 'docs.google.com' ? /^\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]+)(?:\/|$)/ : null;
    const match = pattern && url.pathname.match(pattern);
    if (!match) return null;
    const id = url.hostname === 'drive.google.com' ? match[1] : match[2];
    return match[1] === 'presentation' && url.hostname === 'docs.google.com'
      ? `https://docs.google.com/presentation/d/${id}/preview`
      : `https://drive.google.com/file/d/${id}/preview`;
  } catch { return null; }
}
function showDocumentPreview(id, trigger) {
  const doc = data.documents.find(item => item.id === id);
  const url = doc && documentPreviewUrl(doc.link);
  if (!url) return toast('A preview is not available. Use the document’s Google Drive button.');
  previewTrigger = trigger;
  document.getElementById('document-preview-title').textContent = doc.title;
  const openLink = document.getElementById('document-preview-open');
  openLink.href = doc.link.href;
  openLink.textContent = doc.link.label;
  const frame = document.createElement('iframe');
  frame.title = `Google document preview: ${doc.title}`;
  frame.referrerPolicy = 'no-referrer';
  frame.loading = 'lazy';
  frame.src = url;
  // The iframe is created only after an explicit click and removed when closed.
  // Cross-origin load events cannot establish whether a file is readable.
  document.getElementById('document-preview-frame').replaceChildren(frame);
  document.documentElement.classList.add('has-document-preview');
  previewDialog.showModal();
}
function documentCard(doc) {
  const historical = /historical|archive|earlier/i.test(doc.status);
  return `<article class="document-card"><div class="document-top"><span class="document-icon">${icon('document')}</span>${tag(historical ? 'Earlier baseline' : doc.status || 'Current', historical ? 'amber' : 'teal')}</div><span class="eyebrow">${esc(doc.category)}</span><h2>${esc(doc.title)}</h2><p>${esc(doc.description)}</p><div class="card-meta"><span>${esc(doc.date ? prettyDate(doc.date) : doc.dateLabel || 'Date not verified')}</span><span>${esc(doc.link.provider)}</span></div><div class="document-actions">${documentPreviewUrl(doc.link) ? `<button class="btn secondary small" data-preview="${esc(doc.id)}" aria-label="Preview ${esc(doc.title)}" aria-haspopup="dialog">Preview ${icon('document')}</button>` : ''}${documentLink(doc.link)}</div></article>`;
}
function renderDocuments() {
  const categories = [...new Set(data.documents.map(d=>d.category))];
  const q = docSearch.toLowerCase();
  const docs = data.documents.filter(d=>(!docCategory || d.category === docCategory) && `${d.title} ${d.description} ${d.category}`.toLowerCase().includes(q));
  main.innerHTML = heading('THE DOCUMENT LIBRARY', 'Find it. Read it. Use it.', 'Preview a document here or open its shared Google Drive file in a new tab. Access follows each file’s sharing settings.') +
    `<div class="toolbar"><div class="filter-group"><label class="sr-only" for="doc-search">Search documents</label><input type="search" id="doc-search" value="${esc(docSearch)}" placeholder="Search the library…"><label class="sr-only" for="doc-category">Document category</label><select id="doc-category">${options(categories,docCategory,'All documents')}</select></div><span class="muted">${docs.length} document groups</span></div><div class="document-grid">${docs.map(documentCard).join('') || '<div class="empty-state">No documents match. Try a different title or category.</div>'}</div><div class="notice">${icon('document')}<div><strong>Use the current team plan for delivery status.</strong><span>Earlier proposals describe intended features. Check each document’s date and scope against the current standalone release. Translation and local learning remain planned work.</span></div></div>`;
  bindTextFilter('doc-search',value=>{docSearch=value;renderDocuments();});
  document.getElementById('doc-category').addEventListener('change',e=>{docCategory=e.target.value;renderDocuments();});
}
function renderResources() {
  main.innerHTML = heading('PROJECT RESOURCES', 'Everything has a home.', 'Go directly to the game, source code, Space, dataset and the team’s shared work.') + `<div class="resource-grid">${data.resources.map(resourceCard).join('')}</div><section class="panel"><div class="section-head"><h2>Access follows the resource</h2>${tag('Individual accounts','teal')}</div><p>Use your own GitHub account for the private repository and its Issues. Hugging Face Space access is separate. The game and fictional scenario dataset are public.</p><p class="muted">The dataset contains six authored fictional English scenarios with answer keys. It is a teaching fixture, not a dialect corpus or an independent evaluation benchmark.</p></section>`;
}
function renderSprints() {
  main.innerHTML = heading('SPRINT ROADMAP', 'Plan the next shared goal.', 'Set sprint dates and goals, then move stories and tasks into the sprint from their detail windows.', `<button class="btn primary" data-action="new-sprint" ${canEdit() ? '' : 'disabled'}>Create sprint ${icon('route')}</button>`) + boardNotice() +
    `<div class="notice">${icon('route')}<div><strong>Start with feasibility and evidence.</strong><span>All three members choose work. Forecast sprints become shared GitHub milestones when saved. Agree capacity together before taking on work.</span></div><a class="btn secondary small" href="#board">Open the board</a></div><div class="timeline">${allSprints().map((sprint,i)=>{
      const stories = data.stories.filter(story=>storyState(story).sprint===sprint.id);
      return `<section class="sprint-card ${i===0 ? 'current' : ''}"><div class="sprint-marker">${esc(sprint.id)}</div><div class="sprint-body"><div class="card-tags">${tag(sprint.number ? 'GitHub milestone' : 'Forecast',sprint.number?'teal':'neutral')}${sprint.state === 'closed' ? tag('Closed','green') : ''}</div><h2>${esc(sprint.title || sprint.goal)}</h2><p>${esc(sprint.goal || 'Set a goal at Sprint Planning.')}</p><p class="sprint-dates">${sprint.startDate ? esc(prettyDate(sprint.startDate)) : 'Start date not set'} · ${sprint.endDate ? esc(prettyDate(sprint.endDate)) : 'End date not set'}</p><div class="sprint-stories">${stories.map(story=>`<button class="story-chip" data-story="${esc(story.id)}">${esc(story.id)} ${icon('arrow')}</button>`).join('') || '<span class="muted">No stories assigned yet.</span>'}</div>${sprint.demo ? `<p class="muted"><strong>Review evidence:</strong> ${esc(sprint.demo)}</p>` : ''}<button class="btn secondary small sprint-edit" data-edit-sprint="${esc(sprint.id)}" ${canEdit() ? '' : 'disabled'}>Edit dates and goal</button></div></section>`;
    }).join('')}</div>`;
}
function renderResearch() {
  main.innerHTML = heading('COURSE & EVIDENCE', 'Turn the rubric into evidence.', 'Problem establishment is complete. The remaining course work connects the literature, contribution and evaluation.') +
    `<div class="research-list">${data.courseCriteria.map((item,i)=>`<section class="panel research-panel"><div class="research-number">${String(i+1).padStart(2,'0')}</div><div class="research-body"><div class="card-tags">${tag(i===0?'Complete · team reported':'Research work remaining',i===0?'green':'neutral')}</div><h2>${esc(item.title)}</h2><p>${esc(item.status)}</p><ul>${(Array.isArray(item.deliverables)?item.deliverables:[item.deliverables]).filter(Boolean).map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="sprint-stories">${(item.storyIds||[]).map(id=>`<button class="story-chip" data-story="${esc(id)}">${esc(id)} ${icon('arrow')}</button>`).join('')}</div></div></section>`).join('')}</div><div class="grid-2"><section class="panel"><span class="eyebrow">A TESTABLE QUESTION</span><h2>Preserve operational meaning.</h2><p>Does speaker-approved local correction memory reduce critical operational-meaning errors compared with the same model alone and with a fixed glossary?</p><p class="muted">This is a research hypothesis, not a measured result.</p></section><section class="panel"><span class="eyebrow">DEFINE BEFORE TESTING</span><h2>Keep the comparison fair.</h2><p>Separate adaptation, development and final-test cases. Measure critical errors, task success and device cost. Keep public answer keys out of evaluation prompts.</p><button class="text-link" data-story="R03">Read the evaluation story ${icon('arrow')}</button></section></div>`;
  main.innerHTML += `<div class="section-head"><div><span class="eyebrow">TEAM WORKING AGREEMENT</span><h2>Use the same finishing line.</h2></div></div><div class="team-checklists">${data.checklists.map(checklist=>`<details class="panel"><summary>${esc(checklist.title)}</summary><ul>${checklist.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`).join('')}</div><section class="panel"><div class="section-head"><h2>Starting references</h2>${tag('Survey still to complete','amber')}</div><p class="muted">These sources support the current plan. They are a starting point for the literature survey, not a completed review.</p><ol class="reference-list">${data.references.map(ref=>`<li>${external(ref.url,esc(ref.title)+' '+icon('external'))}</li>`).join('')}</ol></section>`;
}
function renderStatus() {
  main.innerHTML = heading('CURRENT STATUS', 'A clear view of what exists.', `Recorded baseline: ${esc(prettyDate(data.asOf))}. Existing software evidence is separate from unfinished research.`) +
    `<div class="status-grid">${data.baseline.map(item=>`<section class="panel status-panel"><div class="card-tags"><span class="item-id">${esc(item.id)}</span>${tag(item.status,/pending/i.test(item.status)?'amber':'teal')}</div><h2>${esc(item.item)}</h2><p>${esc(item.evidence)}</p><div class="status-boundary"><span class="eyebrow">BOUNDARY / NEXT CHECK</span><p>${esc(item.limit)}</p></div></section>`).join('')}</div><div class="notice">${icon('pulse')}<div><strong>41 unit/integration checks · 114 hosted browser checks</strong><span>These checks establish software behavior. Physical two-device offline acceptance, translation quality and participant effectiveness still need their own evidence.</span></div></div>`;
}
function renderSearch() {
  const q = globalQuery.trim().toLowerCase();
  const stories = data.stories.filter(s=>`${s.id} ${s.title} ${s.story}`.toLowerCase().includes(q));
  const docs = data.documents.filter(d=>`${d.title} ${d.description}`.toLowerCase().includes(q));
  const tasks = data.tasks.filter(t=>`${t.id} ${t.title}`.toLowerCase().includes(q));
  const resources = data.resources.filter(r=>`${r.title} ${r.note||''} ${r.url}`.toLowerCase().includes(q));
  main.innerHTML = heading('WORKSPACE SEARCH', `Results for “${esc(globalQuery)}”`, `${stories.length} stories · ${tasks.length} tasks · ${docs.length} document groups · ${resources.length} resources`) +
    `${docs.length ? `<div class="section-head"><h2>Documents</h2></div><div class="document-grid">${docs.map(documentCard).join('')}</div>` : ''}
    ${stories.length ? `<div class="section-head"><h2>Stories</h2></div><div class="grid-3">${stories.map(s=>storyCard(s,true)).join('')}</div>` : ''}
    ${tasks.length ? `<div class="section-head"><h2>Tasks</h2></div><div class="panel">${tasks.map(t=>`<button class="search-result" data-task="${esc(t.id)}"><span class="item-id">${esc(t.id)}</span><span>${esc(t.title)}</span>${icon('arrow')}</button>`).join('')}</div>` : ''}
    ${resources.length ? `<div class="section-head"><h2>Resources</h2></div><div class="resource-grid">${resources.map(resourceCard).join('')}</div>` : ''}
    ${!stories.length&&!tasks.length&&!docs.length&&!resources.length ? '<div class="empty-state">No matches yet. Try “offline”, “literature”, “ENG1” or “plan”.</div>' : ''}`;
}
function githubAction(story) {
  const live = githubRecord(story.id);
  return live?.url ? external(live.url,`${icon('github')} Open / update on GitHub ${icon('external')}`,'btn primary') : '<button class="btn primary" data-action="guide">Connect the shared board '+icon('arrow')+'</button>';
}
function assigneeFields(selected) {
  const names = [...new Set([...(client?.assignees || []).map(member=>typeof member === 'string' ? member : member.login), ...selected])].filter(Boolean).sort();
  return `<fieldset class="assignee-field"><legend>Assignees</legend><p class="field-help">Leave all names unchecked to unassign.</p><div class="assignee-options">${names.map(login=>`<label><input type="checkbox" name="assignees" value="${esc(login)}" ${selected.includes(login) ? 'checked' : ''}>${esc(login)}</label>`).join('') || '<span class="muted">No assignable members were returned. Refresh the board to try again.</span>'}</div></fieldset>`;
}
function reviewerField(selected) {
  const names=[...new Set([...(client?.assignees || []).map(member=>typeof member==='string' ? member : member.login),selected])].filter(Boolean).sort();
  return `<label class="form-field reviewer-field" for="edit-reviewer"><span>Reviewer</span><select id="edit-reviewer" name="reviewer" aria-describedby="reviewer-help"><option value="">None / unassigned</option>${names.map(login=>`<option value="${esc(login)}" ${login===selected?'selected':''}>${esc(login)}</option>`).join('')}</select><small id="reviewer-help">Choose a teammate to check the work, ideally someone other than its assignees. Task reviewers are chosen separately from the story reviewer.</small></label>`;
}
function workBranchField(item) {
  return `<label class="form-field" for="edit-work-branch"><span>Work branch (optional)</span><input id="edit-work-branch" name="workBranch" value="${esc(item.workBranch || '')}" placeholder="e.g. eng0-t3-workflow" maxlength="200" autocomplete="off" spellcheck="false" aria-describedby="work-branch-help"><small id="work-branch-help">Use a branch in toecm/factoryrelay with your pushed changes. When an assignee moves this ticket to Review, the portal creates or reuses a pull request and notifies teammates. Without a branch, it requests review on the issue instead. Each task has its own branch.</small></label>`;
}
function ticketFor(kind, id) {
  const raw=(kind==='task' ? data.tasks : data.stories).find(item=>item.id===id);
  return raw ? (kind==='task' ? taskState(raw) : storyState(raw)) : null;
}
function ticketVersion(item) { return item.github?.version || item.parent?.github?.version || item.github?.updatedAt || item.parent?.github?.updatedAt; }
function canRequestReview(item, kind) {
  const assigned=kind==='task' ? item.live?.assignees ?? item.parent?.github?.assignees ?? [] : item.github?.assignees ?? [];
  return canEdit() && item.status==='Review' && assigned.some(login=>login.toLowerCase()===client.session.login.toLowerCase());
}
function reviewLink(value) {
  try {
    const url=new URL(value);
    return url.origin==='https://github.com' && !url.username && !url.password && /^\/toecm\/factoryrelay\/pull\/[1-9][0-9]*$/.test(url.pathname) && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
function handoffContent(item, kind, result) {
  const link=reviewLink(result?.prUrl);
  return `${result ? `<p id="review-handoff-message" role="status">${esc(result.message || 'Review handoff returned no details. Open the issue to check its status.')}</p>${link ? external(link,`Open pull request${result.prNumber ? ' #'+esc(result.prNumber) : ''} ${icon('external')}`,'btn secondary small') : ''}` : '<p>Moving to Review as an assignee requests review from your teammates. A work branch with pushed changes enables a pull request; otherwise the request is posted on the issue.</p>'}${canRequestReview(item,kind) ? `<p class="field-help">Retry uses the saved branch and reviewer, without saving any edits in this form. Existing requests are reused.</p><button type="button" class="btn secondary small" data-action="retry-review" data-review-kind="${kind}" data-review-id="${esc(item.id)}" >Retry review handoff</button>` : item.status==='Review' && canEdit() ? '<p class="field-help">An assigned teammate can request or retry this handoff. Assign yourself and save first if you are responsible for this work.</p>' : ''}<p class="review-retry-feedback" role="status" aria-live="polite"></p>`;
}
function reviewSection(item, kind) {
  if(!canEdit())return '';
  const saved=reviewResults.get(`${kind}:${item.id}`);
  const result=item.status==='Review' && saved?.requestId===item.reviewRequest?.id && saved?.workBranch===item.workBranch && saved?.reviewer===item.reviewer ? saved.result : null;
  return `<section class="review-handoff" id="ticket-review-handoff" aria-label="Review handoff"><h3>Review handoff</h3><p><strong>Saved work branch:</strong> <span class="branch-value">${esc(item.workBranch || 'None / issue review')}</span></p>${handoffContent(item,kind,result)}</section>`;
}
function showReviewResult(context, result) {
  const item=ticketFor(context.kind,context.id);
  if(!item)return;
  reviewResults.set(`${context.kind}:${context.id}`,{result,requestId:item.reviewRequest?.id,workBranch:item.workBranch,reviewer:item.reviewer});
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">${esc(item.id)} / REVIEW HANDOFF</span><h2 id="dialog-title">${result.status==='complete' ? 'Ticket saved. Review requested.' : result.status==='pending' ? 'Ticket saved. Review handoff pending.' : 'Ticket saved. Review handoff skipped.'}</h2></div><button class="icon-button" data-action="close" aria-label="Close review result">&times;</button></div><div class="dialog-body"><section class="review-handoff" id="review-result" data-result-status="${esc(result.status)}">${handoffContent(item,context.kind,result)}</section><p class="field-help">This result stays open until you close it. The ticket change is saved to GitHub even if the handoff needs another attempt.</p></div><div class="dialog-actions"><button class="btn secondary" ${context.kind==='task' ? 'data-task' : 'data-story'}="${esc(item.id)}">Open ticket</button><button class="btn primary" data-action="close">Close</button></div>`);
}
async function retryReview(button) {
  if(saving)return;
  const kind=button.dataset.reviewKind,id=button.dataset.reviewId,item=ticketFor(kind,id);
  if(!item || !canRequestReview(item,kind))return toast('An assigned teammate must request review while the ticket is in Review.');
  const section=button.closest('.review-handoff'),feedback=section.querySelector('.review-retry-feedback');
  if(boardNeedsRefresh || editorContext?.requiresReload){feedback.textContent='Saved on GitHub, but the latest state has not loaded. Refresh the board or use Reload latest before retrying.';return;}
  const openEditor=editorContext && editorContext.kind===kind && editorContext.id===id;
  const version=openEditor ? editorContext.version : ticketVersion(item);
  saving=true;button.disabled=true;feedback.textContent='Retrying the saved review handoff...';
  try {
    await client.retryReview(kind==='task' ? item.storyId : id,kind==='task' ? id : null,version);
    const result=client.reviewResult || {status:'pending',message:'The service returned no handoff details. Open the issue to check the request before retrying.'};
    boardMessage=`${id}: ${result.message}`;boardError=false;
    const latest=ticketFor(kind,id);
    reviewResults.set(`${kind}:${id}`,{result,requestId:latest.reviewRequest?.id,workBranch:latest.workBranch,reviewer:latest.reviewer});
    if(openEditor){editorContext.version=ticketVersion(latest);section.outerHTML=reviewSection(latest,kind);}
    else showReviewResult({kind,id},result);
  } catch(error) {
    feedback.classList.add('form-error');
    if(error.code==='saved_refresh_failed'){
      boardNeedsRefresh=true;if(openEditor)editorContext.requiresReload=true;
      feedback.textContent='Saved on GitHub, but the latest state could not load. Close this result and refresh the board, or use Reload latest, before further edits or retries.';
      boardMessage=feedback.textContent;boardError=true;
    }else feedback.textContent=`Review handoff could not finish. ${error.message} The ticket's saved status has not been undone.`;
  } finally {saving=false;dialog.querySelectorAll('[data-action="retry-review"]').forEach(control=>{control.disabled=false;});render();}
}
function editFields(item, kind) {
  if(!canEdit()) return '<div class="notice"><div><strong>Sign in to edit this work.</strong><span>Your invited GitHub account is required to change assignments, status or sprint.</span></div><button class="btn primary small" data-action="login">Sign in with GitHub</button></div>';
  const selected = kind==='task' ? item.live?.assignees ?? item.parent.github?.assignees ?? [] : item.github?.assignees ?? [];
  return `<form id="ticket-edit-form" data-edit-kind="${kind}" data-edit-id="${esc(item.id)}" class="ticket-edit-form"><h3>Move and assign ${kind}</h3><fieldset class="edit-fieldset"><div class="edit-grid"><label class="form-field" for="edit-status"><span>Status</span><select name="status" id="edit-status">${STATUSES.map(value=>`<option ${item.status===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label><label class="form-field" for="edit-sprint"><span>Sprint</span><select name="sprint" id="edit-sprint">${sprintNames().map(value=>`<option ${item.sprint===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label></div>${assigneeFields(selected)}${reviewerField(item.reviewer)}${workBranchField(item)}${kind==='task' ? `<label class="completion-control"><input type="checkbox" id="edit-completed" name="completed" ${item.status==='Done'?'checked':''}>Task complete</label><p class="field-help">Checking complete sets Done. Unchecking a completed task returns it to Backlog.</p>` : '<p class="field-help">Done closes the GitHub story. Other statuses reopen it if needed.</p>'}<div class="save-feedback" role="status" aria-live="polite"></div><div class="edit-actions"><button type="submit" class="btn primary" id="save-ticket">Save to GitHub</button><button type="button" class="btn secondary" data-action="reload-editor">Reload latest</button></div></fieldset></form>`;
}
function showTask(id) {
  const raw = data.tasks.find(task=>task.id===id);
  if(!raw) return toast('That task is not part of this plan.');
  const task = taskState(raw);
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">TASK ${esc(task.id)} · ${esc(task.sprint)}</span><h2 id="dialog-title">${esc(task.title)}</h2></div><button class="icon-button" data-action="close" aria-label="Close task">&times;</button></div><div class="dialog-body"><div class="card-tags">${tag(task.status,statusColor(task.status))}${tag(task.priority)}</div><p class="lead-text">Part of <button class="story-chip" data-story="${esc(task.storyId)}">${esc(task.storyId)}: ${esc(task.parent.title)}</button></p><div class="detail-grid"><div><span class="detail-label">Assignees</span><span class="detail-value">${esc(task.owner || 'Unassigned')}</span></div><div><span class="detail-label">Sprint</span><span class="detail-value">${esc(task.sprint)}</span></div><div><span class="detail-label">Reviewer</span><span class="detail-value">${esc(task.reviewer || 'Unassigned')}</span></div></div>${editFields(task,'task')}${reviewSection(task,'task')}</div><div class="dialog-actions">${githubAction(task.parent)}</div>`);
  editorContext={kind:'task',id,version:task.parent.github?.version || task.parent.github?.updatedAt};
}
function showSprintEditor(id=null) {
  if(!canEdit()) return beginLogin();
  const current = id ? allSprints().find(sprint=>sprint.id===id) : null;
  const next = Math.max(0,...allSprints().map(sprint=>Number(sprint.id.match(/^S(\d+)$/)?.[1])||0))+1;
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">SPRINT PLANNING</span><h2 id="dialog-title">${current ? 'Edit sprint' : 'Create sprint'}</h2></div><button class="icon-button" data-action="close" aria-label="Close sprint editor">&times;</button></div><div class="dialog-body"><form id="sprint-edit-form"><fieldset class="edit-fieldset"><div class="edit-grid"><label class="form-field" for="sprint-id"><span>Sprint ID</span><input id="sprint-id" name="id" value="${esc(current?.id || `S${next}`)}" pattern="S[1-9][0-9]*" required maxlength="12" ${current ? 'readonly' : ''}><small>For example, S1 or S7.</small></label><label class="form-field" for="sprint-title"><span>Title</span><input id="sprint-title" name="title" value="${esc(current?.title || '')}" required maxlength="120"></label></div><label class="form-field" for="sprint-goal"><span>Sprint goal</span><textarea id="sprint-goal" name="goal" rows="4" maxlength="2000" required>${esc(current?.goal || '')}</textarea></label><div class="edit-grid"><label class="form-field" for="sprint-start"><span>Start date</span><input type="date" id="sprint-start" name="startDate" value="${esc(current?.startDate || '')}"></label><label class="form-field" for="sprint-end"><span>End date</span><input type="date" id="sprint-end" name="endDate" value="${esc(current?.endDate || '')}"></label></div><p class="field-help">Dates are optional. Saving creates or updates a shared GitHub milestone. Move work into it from the story or task editor.</p><div class="save-feedback" role="status" aria-live="polite"></div><div class="edit-actions"><button type="submit" class="btn primary" id="save-sprint">Save sprint to GitHub</button>${current ? '<button type="button" class="btn secondary" data-action="reload-editor">Reload latest</button>' : ''}</div></fieldset></form></div>`);
  editorContext={kind:'sprint',id:current?.id || null,number:current?.number,version:current?.version};
}
async function saveEditor(form) {
  if(saving) return;
  if(!canEdit()){const feedback=form.querySelector('.save-feedback');feedback.className='save-feedback form-error';feedback.textContent='Your sign-in has expired. Copy any unsaved edits, then sign in with GitHub again.';return;}
  const context={...editorContext}, fields=new FormData(form), feedback=form.querySelector('.save-feedback');
  if(boardNeedsRefresh || context.requiresReload){feedback.className='save-feedback form-error';feedback.textContent='Saved on GitHub, but the latest state has not loaded. Use Reload latest before saving again.';return;}
  const fieldset=form.querySelector('.edit-fieldset');
  const patch=context.kind==='sprint' ? {id:fields.get('id').trim(),title:fields.get('title').trim(),goal:fields.get('goal').trim(),startDate:fields.get('startDate') || null,endDate:fields.get('endDate') || null,...(context.number ? {number:context.number} : {}),...(context.version ? {version:context.version} : {})} : {status:fields.get('status'),sprint:fields.get('sprint'),assignees:fields.getAll('assignees'),reviewer:fields.get('reviewer') || null,workBranch:fields.get('workBranch').trim() || null};
  if(context.kind==='sprint' && patch.startDate && patch.endDate && patch.endDate < patch.startDate) {feedback.className='save-feedback form-error';feedback.textContent='End date must be on or after the start date.';return;}
  if(context.kind==='task') patch.completed=fields.has('completed');
  saving=true;fieldset.disabled=true;feedback.className='save-feedback';feedback.textContent='Saving to GitHub...';boardMessage='Saving to GitHub...';boardError=false;
  try {
    if(context.kind==='sprint') await client.saveSprint(patch);
    else if(context.kind==='story') await client.saveStory(context.id,patch,context.version);
    else await client.saveTask(data.tasks.find(task=>task.id===context.id).storyId,context.id,patch,context.version);
    boardMessage=`${context.kind==='sprint' ? patch.id : context.id} saved to GitHub.`;
    if(context.kind!=='sprint' && client.reviewResult){
      boardMessage+=` ${client.reviewResult.message}`;
      showReviewResult(context,client.reviewResult);
    } else {dialog.close();toast(boardMessage);}
  } catch(error) {
    feedback.className='save-feedback form-error';
    if(error.code==='saved_refresh_failed'){
      boardNeedsRefresh=true;editorContext.requiresReload=true;
      feedback.textContent='Saved on GitHub, but the latest state could not load. Your form is still here; use Reload latest before making more changes. Do not submit it again.';
      boardMessage='Saved on GitHub. Reload the latest state before making further changes.';
    }else{
      feedback.textContent=`Not saved. ${error.message || 'Please try again.'} Your edits are still here. Use Reload latest to review newer changes before retrying.`;
      boardMessage='The update was not saved. Review the message in the editor.';
    }
    boardError=true;
  } finally {saving=false;fieldset.disabled=false;render();}
}
async function beginLogin() {
  if(loginPending || saving) return;
  loginPending=true;loginFailure='';boardMessage='Complete sign-in in the GitHub window. Return here when finished.';boardError=false;
  try {
    const signingIn=client.startLogin(); // Open the secure popup during the click gesture.
    render();
    if(dialog.open) dialog.close();
    await signingIn;
    boardMessage=`Connected as ${client.session?.login || 'your GitHub account'}. You can now edit shared work.`;toast(boardMessage);
  } catch(error) {loginFailure=error.message || 'Sign-in did not finish. Please try again.';boardMessage=loginFailure;boardError=true;}
  finally {loginPending=false;render();}
  if(loginFailure)showLoginError();
}
async function reloadEditor() {
  if(saving || !editorContext) return;
  const previous={...editorContext};
  try {await client.refresh();if(previous.kind==='story')showStory(previous.id);else if(previous.kind==='task')showTask(previous.id);else showSprintEditor(previous.id);}
  catch(error){const feedback=dialog.querySelector('.save-feedback');if(feedback){feedback.textContent=`Could not refresh. ${error.message}`;feedback.classList.add('form-error');}}
}
function showStory(id, focusTask=null) {
  const raw = data.stories.find(s=>s.id===id);
  if (!raw) return toast('That story is not part of this plan.');
  const s = storyState(raw);
  const tasks = data.tasks.filter(t=>t.storyId===id).map(taskState);
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">STORY ${esc(s.id)} · ${esc(s.sprint)}</span><h2 id="dialog-title">${esc(s.title)}</h2></div><button class="icon-button" data-action="close" aria-label="Close story">×</button></div><div class="dialog-body"><div class="card-tags">${tag(s.status,statusColor(s.status))}${tag(s.priority)}${tag(`${s.points} draft points`)}</div><p class="lead-text">${esc(s.story)}</p>${editFields(s,'story')}${reviewSection(s,'story')}<div class="detail-grid"><div><span class="detail-label">Owner</span><span class="detail-value">${esc(s.owner||'Unassigned · volunteer at planning')}</span></div><div><span class="detail-label">Reviewer</span><span class="detail-value">${esc(s.reviewer || 'Unassigned')}</span></div><div><span class="detail-label">Dependencies</span><span class="detail-value">${s.dependencies.length ? s.dependencies.map(dep=>`<button class="story-chip" data-story="${esc(dep)}">${esc(dep)}</button>`).join(' ') : 'None'}</span></div><div><span class="detail-label">Course criteria</span><span class="detail-value">${esc(s.criteria.join(' · '))}</span></div></div><h3>Acceptance criteria</h3><ol class="checklist">${s.acceptance.map(text=>`<li>${esc(text)}</li>`).join('')}</ol><h3>Tasks <span class="muted">${tasks.filter(t=>t.status==='Done').length}/${tasks.length}</span></h3><p class="muted">Open a task to update its own assignees, status and sprint. Review evidence with another team member before marking work complete.</p><div class="task-list">${tasks.map(t=>`<div class="task-row ${focusTask===t.id?'task-highlight':''}" id="task-${esc(t.id)}"><span class="task-check ${t.status==='Done'?'checked':''}" aria-label="${t.status==='Done'?'Completed':'Not complete'}">${t.status==='Done'?'✓':'○'}</span><div><span class="item-id">${esc(t.id)}</span><p>${esc(t.title)}</p><span class="muted">${esc(t.owner || 'Unassigned')} · ${esc(t.sprint)}</span>${reviewerLabel(t.reviewer)}</div><button class="btn secondary small" data-edit-task="${esc(t.id)}">${canEdit() ? 'Edit task' : 'View task'}</button></div>`).join('')}</div><h3>Deliverable</h3><p class="pre-line">${esc(s.deliverable)}</p><h3>Ready when</h3><p>${esc(s.gate)}</p><h3>Risk / boundary</h3><p>${esc(s.risk)}</p></div><div class="dialog-actions"><button class="btn secondary" data-copy="${esc(s.id)}">Copy story link</button>${githubAction(s)}</div>`);
  editorContext={kind:'story',id,version:s.github?.version || s.github?.updatedAt};
  if (focusTask) setTimeout(()=>document.getElementById(`task-${focusTask}`)?.scrollIntoView({block:'center'}),50);
}
function showDialog(html) {
  editorContext=null;
  const wasOpen=dialog.open;
  document.getElementById('dialog-content').innerHTML=html;
  if (!dialog.open) dialog.showModal();
  if(wasOpen)dialog.querySelector('[data-action="close"]')?.focus();
  dialog.querySelector('.dialog-body')?.scrollTo(0,0);
}
function showLoginError() {
  if(!loginFailure)return;
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">GITHUB SIGN-IN</span><h2 id="dialog-title">Sign-in could not finish</h2></div><button class="icon-button" data-action="close" aria-label="Close sign-in error">&times;</button></div><div class="dialog-body"><p>This message stays here until you close it. You can reopen it with <strong>View sign-in error</strong> on the board.</p><label class="form-field" for="login-error-text"><span>Error details</span><textarea id="login-error-text" rows="5" readonly spellcheck="false">${esc(loginFailure)}</textarea></label><p>Use <strong>Copy error</strong> to share these details, including any bracketed reference. The callback address is not needed.</p><p id="login-error-feedback" role="status" aria-live="polite"></p></div><div class="dialog-actions"><button class="btn secondary" data-action="close">Close</button><button class="btn primary" data-action="copy-login-error">Copy error</button></div>`);
}
async function copyLoginError() {
  if(!loginFailure)return;
  const feedback=document.getElementById('login-error-feedback');
  try {
    await navigator.clipboard.writeText(loginFailure);
    if(feedback)feedback.textContent='Error copied. You can paste it into your support conversation.';
  } catch {
    const field=document.getElementById('login-error-text');
    field?.focus();field?.select();
    if(feedback)feedback.textContent='Select Copy from your device’s menu, or press Ctrl+C (Command+C on Mac), to copy the selected error.';
  }
}
function showGuide() {
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">WORKSPACE GUIDE</span><h2 id="dialog-title">One plan. Shared through GitHub.</h2></div><button class="icon-button" data-action="close" aria-label="Close guide">&times;</button></div><div class="dialog-body"><h3>Plan, assign and move work</h3><ol class="checklist"><li>Use <strong>Sign in with GitHub</strong> and complete sign-in in GitHub's separate window. Use your account invited to the private Factory Relay repository.</li><li>Open <strong>Sprint roadmap</strong> to create a sprint or edit its dates and goal. Sprints save as GitHub milestones.</li><li>Open a story or task to choose assignees, a reviewer, a sprint and a status. Clear the assignee choices to unassign; choose None / unassigned to clear its reviewer. Use <strong>Save to GitHub</strong> and wait for confirmation.</li><li>On the board, drag a ticket into a status column, or use its editor to move it with a keyboard or touch screen. Task completion and assignment can be managed independently of the parent story.</li><li>Use <strong>Fit all columns to screen</strong> to remove horizontal board scrolling. Smaller screens wrap columns into rows.</li></ol><h3>Choose a reviewer</h3><p>A reviewer checks the work and its evidence before completion. Choose another teammate where practical. Each story and task has its own reviewer; assigning the story reviewer does not assign task reviewers. When an assigned teammate moves a ticket to Review, the portal posts a review request mentioning the other teammates. Add an optional work branch with pushed changes to create or reuse a pull request; the chosen reviewer receives a GitHub review request when eligible. Without a work branch, the review request stays on the issue. Review results remain visible after saving, with a retry action if GitHub cannot finish. Notification delivery follows each teammate's GitHub settings.</p><h3>Shared saving and access</h3><p>Signed-in views refresh periodically. Signed-out visitors see the published snapshot, which updates after GitHub synchronization and deployment. Private issue comments and attachments remain in GitHub.</p><p>The browser retains a protected portal session for up to a day, limited by GitHub's authorization expiry. Your GitHub password and GitHub access token are not stored by this page. Sign out on a shared device. Editing requires the owner's one-time GitHub application setup and repository access.</p><p>If someone changes a record while you edit, the save is rejected instead of overwriting their work. Your form stays open; use <strong>Reload latest</strong> to inspect the current record before applying your change again.</p><h3>Documents</h3><p>The board's <strong>Open in Google Docs</strong> and <strong>Preview</strong> buttons open the shared team implementation plan. The Document library also includes the Scrum workbook. Google previews load only when selected and follow each file's sharing settings.</p><p>More setup and maintenance details are in <a href="./README.md" target="_blank" rel="noopener">the portal README</a>.</p></div><div class="dialog-actions">${external(`${REPO}/issues`,'Open team Issues '+icon('external'),'btn secondary')}${external(`${PORTAL_REPO}/actions`,'Public deployments '+icon('external'),'btn secondary')}<button class="btn primary" data-action="close">Got it</button></div>`);
}
function bindTextFilter(id, onChange) {
  const input=document.getElementById(id);
  input.addEventListener('input',()=>{const pos=input.selectionStart;onChange(input.value);const next=document.getElementById(id);next.focus();try {next.setSelectionRange(pos,pos);} catch { /* search selection is browser-dependent */ }});
}
function toast(message) {
  const box=document.getElementById('toast');box.textContent=message;box.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.hidden=true,3500);
}
function updateRoute() {
  if(previewDialog.open)previewDialog.close();
  const [requested, id] = location.hash.slice(1).split('/');
  route=NAV.some(n=>n[0]===requested)?requested:'overview';
  globalQuery='';document.getElementById('global-search').value='';
  render();
  if(requested==='story'&&id) showStory(decodeURIComponent(id));
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
  window.scrollTo(0,0);
}
function render() {
  document.getElementById('page-name').textContent=globalQuery?'Search':NAV.find(n=>n[0]===route)[1];
  document.querySelectorAll('.nav-link').forEach(link=>{const active=link.hash===`#${route}`&&!globalQuery;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  if(globalQuery) return renderSearch();
  ({overview:renderOverview,board:renderBoard,documents:renderDocuments,resources:renderResources,sprints:renderSprints,research:renderResearch,status:renderStatus}[route])();
}
function renderSharedUpdate() {
  // Keep the open Google viewer, draft editor and filter position intact during polling.
  if(previewDialog.open)return;
  const active=document.activeElement;
  const focusId=main.contains(active) ? active.id : '';
  const selection=focusId && /INPUT|TEXTAREA/.test(active.tagName) ? [active.selectionStart,active.selectionEnd] : null;
  const scrollLeft=main.querySelector('.board-scroll')?.scrollLeft || 0;
  const columns=[...main.querySelectorAll('[data-drop-status]')].map(column=>[column.dataset.dropStatus,column.scrollTop]);
  render();
  if(main.querySelector('.board-scroll'))main.querySelector('.board-scroll').scrollLeft=scrollLeft;
  for(const [status,scrollTop] of columns){const column=[...main.querySelectorAll('[data-drop-status]')].find(item=>item.dataset.dropStatus===status);if(column)column.scrollTop=scrollTop;}
  if(focusId){const next=document.getElementById(focusId);next?.focus({preventScroll:true});if(next&&selection)try{next.setSelectionRange(...selection);}catch{/* Select inputs have no text caret. */}}
}
document.addEventListener('click', async event=>{
  const sidebar=document.getElementById('sidebar');
  if(sidebar.classList.contains('open')&&!event.target.closest('#sidebar')&&!event.target.closest('#menu-toggle')){
    sidebar.classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');event.preventDefault();return;
  }
  if(saving && event.target.closest('[data-story], [data-task], [data-edit-task], [data-edit-sprint], [data-action="guide"]'))return toast('Please wait for the save to finish.');
  const story=event.target.closest('[data-story]');if(story) return showStory(story.dataset.story);
  const preview=event.target.closest('[data-preview]');if(preview) return showDocumentPreview(preview.dataset.preview,preview);
  const task=event.target.closest('[data-task], [data-edit-task]');if(task)return showTask(task.dataset.task || task.dataset.editTask);
  const sprint=event.target.closest('[data-edit-sprint]');if(sprint)return showSprintEditor(sprint.dataset.editSprint);
  const kind=event.target.closest('[data-kind]');if(kind){boardKind=kind.dataset.kind;return renderBoard();}
  const copy=event.target.closest('[data-copy]');if(copy){const url=new URL(location.href);url.hash=`story/${copy.dataset.copy}`;try{await navigator.clipboard.writeText(url.href);toast('Story link copied.');}catch{toast('Copy the story ID: '+copy.dataset.copy);}return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='guide')showGuide();
  if(action==='close'){if(saving)toast('Please wait for the save to finish.');else dialog.close();}
  if(action==='close-preview')previewDialog.close();
  if(action==='login')return beginLogin();
  if(action==='view-login-error')return showLoginError();
  if(action==='copy-login-error')return copyLoginError();
  if(action==='new-sprint')return showSprintEditor();
  if(action==='reload-editor')return reloadEditor();
  if(action==='retry-review')return retryReview(event.target.closest('[data-action="retry-review"]'));
  if(action==='logout'){try{await client.logout();reviewResults.clear();boardMessage='Signed out. The board is read-only.';boardError=false;}catch(error){boardMessage=`Signed out in this browser. ${error.message}`;boardError=true;}render();if(dialog.open)dialog.close();}
  if(action==='refresh'){try{await client.refresh();boardMessage='Latest GitHub changes loaded.';boardError=false;}catch(error){boardMessage=error.message;boardError=true;}render();}
});
document.addEventListener('submit',event=>{if(event.target.matches('#ticket-edit-form, #sprint-edit-form')){event.preventDefault();saveEditor(event.target);}});
document.addEventListener('change',event=>{
  if(event.target.id==='edit-completed'){const select=document.getElementById('edit-status');if(event.target.checked)select.value='Done';else if(select.value==='Done')select.value='Backlog';}
  if(event.target.id==='edit-status'){const complete=document.getElementById('edit-completed');if(complete)complete.checked=event.target.value==='Done';}
});
document.addEventListener('dragstart',event=>{
  const card=event.target.closest('[data-card-id]');
  if(!card || !canEdit() || saving || boardNeedsRefresh){event.preventDefault();return;}
  const item=card.dataset.cardKind==='story' ? storyState(data.stories.find(item=>item.id===card.dataset.cardId)) : taskState(data.tasks.find(item=>item.id===card.dataset.cardId));
  draggedItem={kind:card.dataset.cardKind,id:item.id,status:item.status,storyId:item.storyId,version:item.github?.version || item.parent?.github?.version || item.github?.updatedAt || item.parent?.github?.updatedAt};
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);card.classList.add('dragging');
});
document.addEventListener('dragover',event=>{const column=event.target.closest('[data-drop-status]');if(column && draggedItem && canEdit() && !saving){event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));column.classList.add('drop-target');}});
document.addEventListener('dragleave',event=>{const column=event.target.closest('[data-drop-status]');if(column && !column.contains(event.relatedTarget))column.classList.remove('drop-target');});
document.addEventListener('dragend',()=>{draggedItem=null;document.querySelectorAll('.drop-target, .dragging').forEach(item=>item.classList.remove('drop-target','dragging'));});
document.addEventListener('drop',async event=>{
  const column=event.target.closest('[data-drop-status]');
  if(!column || !draggedItem || !canEdit() || saving || boardNeedsRefresh)return;
  event.preventDefault();
  const move={...draggedItem},status=column.dataset.dropStatus;draggedItem=null;
  document.querySelectorAll('.drop-target, .dragging').forEach(item=>item.classList.remove('drop-target','dragging'));
  if(status===move.status)return;
  saving=true;boardMessage=`Moving ${move.id} to ${status}…`;boardError=false;renderBoard();
  try{
    if(move.kind==='story')await client.saveStory(move.id,{status},move.version);else await client.saveTask(move.storyId,move.id,{status,completed:status==='Done'},move.version);
    boardMessage=`${move.id} moved to ${status} and saved to GitHub.`;
    if(client.reviewResult){boardMessage+=` ${client.reviewResult.message}`;showReviewResult(move,client.reviewResult);}else toast(boardMessage);
  }
  catch(error){
    if(error.code==='saved_refresh_failed'){boardNeedsRefresh=true;boardMessage=`${move.id} was saved on GitHub, but the latest state could not load. Refresh the board before moving more tickets.`;}
    else boardMessage=`Move not saved. ${error.message} Refresh the board to review the latest changes.`;
    boardError=true;
  }
  finally{saving=false;render();}
});
dialog.addEventListener('cancel',event=>{if(saving){event.preventDefault();toast('Please wait for the save to finish.');}});
dialog.addEventListener('close',()=>{editorContext=null;});
dialog.addEventListener('click',e=>{if(e.target===dialog&&!saving){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
previewDialog.addEventListener('click',event=>{if(event.target===previewDialog){const bounds=previewDialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)previewDialog.close();}});
previewDialog.addEventListener('close',()=>{
  document.getElementById('document-preview-frame').replaceChildren();
  document.getElementById('document-preview-open').removeAttribute('href');
  document.documentElement.classList.remove('has-document-preview');
  if(previewTrigger?.isConnected)previewTrigger.focus({preventScroll:true});
  previewTrigger=null;
});
document.getElementById('menu-toggle').addEventListener('click',()=>{const open=document.getElementById('sidebar').classList.toggle('open');document.getElementById('menu-toggle').setAttribute('aria-expanded',String(open));});
document.getElementById('global-search').addEventListener('input',e=>{if(!data)return;globalQuery=e.target.value;render();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('sidebar').classList.contains('open')){document.getElementById('sidebar').classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');document.getElementById('menu-toggle').focus();}
  if(e.key==='/'&&!dialog.open&&!previewDialog.open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();document.getElementById('global-search').focus();}
});
window.addEventListener('hashchange',()=>{if(data)updateRoute();});
async function start(){
  document.getElementById('navigation').innerHTML=NAV.map(([id,label,name])=>`<a class="nav-link" href="#${id}"><span class="nav-icon">${icon(name)}</span>${label}${id==='board'?'<span class="nav-count">22</span>':''}</a>`).join('');
  try{
    const [content,board]=await Promise.all([fetch('./data/portal-data.json'),fetch('./data/github-board.json')]);
    if(!content.ok)throw new Error('The portal data file could not be loaded.');
    data=await content.json();
    if(board.ok)snapshot=await board.json();
    document.getElementById('snapshot-label').textContent=`Baseline · ${prettyDate(data.asOf)}${snapshot.syncedAt?' / board · '+prettyDate(snapshot.syncedAt):''}`;
    updateRoute();
    client=createPortalClient({data,onChange(next){snapshot=next;boardNeedsRefresh=false;renderSharedUpdate();},onAuthChange(session){if(!session){reviewResults.clear();boardNeedsRefresh=false;}renderSharedUpdate();},onError(error){boardMessage=`Could not refresh shared work. ${error.message}`;boardError=true;renderSharedUpdate();}});
    await client.initialize();
    if(client.snapshot?.items)snapshot=client.snapshot;
    if(client.authError){boardMessage=client.authError;boardError=true;}
    render();
  }catch(error){main.innerHTML=`<div class="empty-state"><h1>The workspace could not load.</h1><p>${esc(error.message)}</p><p>Serve this folder over HTTP using <code>npm run portal:dev</code>, or deploy the complete static folder. Opening index.html directly from disk does not support the data requests.</p><button class="btn primary" id="retry-load">Try again</button></div>`;document.getElementById('retry-load').addEventListener('click',start);}
}
start();
