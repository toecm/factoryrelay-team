'use strict';

// A static, credential-free view. GitHub is the shared editing surface.
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
let route = 'overview', boardKind = 'stories', boardSearch = '', sprintFilter = '', priorityFilter = '', statusFilter = '', docCategory = '', docSearch = '', globalQuery = '';
const main = document.getElementById('main-content');
const dialog = document.getElementById('detail-dialog');
const previewDialog = document.getElementById('document-preview-dialog');
let previewTrigger = null;

function githubRecord(id) { return snapshot.items.find(item => item.id === id); }
function storyState(story) {
  const live = githubRecord(story.id);
  return {...story, status:live?.status || story.status, owner:live?.assignees?.join(', ') || story.owner || '', github:live};
}
function taskState(task) {
  const parent = storyState(data.stories.find(s => s.id === task.storyId));
  const checked = parent.github?.taskStatus?.[task.id];
  // A closed parent does not fabricate completion for an unchecked task.
  const status = checked === true ? 'Done' : checked === false ? (parent.status === 'Done' ? 'Backlog' : parent.status) : task.status;
  return {...task, status, owner:parent.github ? parent.owner : task.owner, parent, sprint:parent.sprint, priority:parent.priority};
}
function heading(eyebrow, title, text, action='') {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>${action}</div>`;
}
function boardNotice() {
  const connected = snapshot.enabled && snapshot.items.length > 0;
  return `<div class="notice board-notice">${icon(connected ? 'check' : 'link')}<div><strong>${connected ? 'Shared work, updated through GitHub' : 'The plan is ready. GitHub linking is next.'}</strong><span>${connected ? `Snapshot updated ${esc(prettyDate(snapshot.syncedAt))}. Open a story on GitHub to assign it, update its status or check off tasks. Changes appear after the next deployment.` : 'These are the existing 22 stories and 83 tasks. They are not yet linked to shared GitHub Issues. Setup creates one issue per story with its task checklist.'}</span></div><button class="btn ghost small" data-action="guide">How it works ${icon('arrow')}</button></div>`;
}
function resourceCard(resource) {
  const key = /dataset/i.test(resource.id + resource.title) ? 'database' : /space/i.test(resource.id + resource.title) ? 'cloud' : /guide/i.test(resource.id + resource.title) ? 'document' : /github|repo|issues|actions/i.test(resource.id + resource.title) ? 'github' : 'play';
  return external(resource.url, `<div class="resource-top"><span class="resource-icon ${key}">${icon(key)}</span>${icon('external')}</div><h3>${esc(resource.title)}</h3><p>${esc(resource.note || resource.description || '')}</p><div class="card-meta">${tag(resource.visibility || 'Resource', resource.visibility?.toLowerCase() === 'public' ? 'green' : 'neutral')}<span>${esc(new URL(resource.url).hostname)}</span></div>`, 'resource-card');
}
function storyCard(raw, compact=false) {
  const story = storyState(raw);
  const taskTotal = story.taskIds.length;
  const taskDone = story.taskIds.filter(id => story.github?.taskStatus?.[id] === true).length;
  return `<button class="${compact ? 'ready-card' : 'story-card'}" data-story="${esc(story.id)}"><div class="card-tags"><span class="item-id">${esc(story.id)}</span>${tag(story.priority, story.priority === 'Core' ? 'teal' : story.priority === 'Stretch' ? 'amber' : 'neutral')}</div><h3>${esc(story.title)}</h3>${compact ? `<p>${esc(story.deliverable.split('\n')[0])}</p>` : ''}<div class="card-meta"><span>${esc(story.sprint)} · ${taskDone}/${taskTotal} tasks</span><span>${esc(story.points)} pts</span></div><div class="card-owner"><span class="avatar-small">${story.owner ? esc(story.owner.slice(0,1).toUpperCase()) : '+'}</span><span>${esc(story.owner || 'Choose this work')}</span>${compact ? icon('arrow') : ''}</div></button>`;
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
function renderBoard() {
  const items = boardKind === 'stories' ? data.stories.map(storyState) : data.tasks.map(taskState);
  const q = boardSearch.toLowerCase().trim();
  const filtered = items.filter(item => (!q || `${item.id} ${item.title} ${item.owner} ${item.story || ''}`.toLowerCase().includes(q)) && (!sprintFilter || item.sprint === sprintFilter) && (!priorityFilter || item.priority === priorityFilter) && (!statusFilter || item.status === statusFilter));
  main.innerHTML = heading('THE SHARED PLAN', 'Make the next move.', 'Pick work that supports the Sprint Goal. Keep ownership visible and ask another member to review.', `<button class="btn secondary" data-action="export">Export board CSV ${icon('document')}</button>`) + boardNotice() +
    `<div class="toolbar"><div class="tabs" role="group" aria-label="Board item type"><button class="tab ${boardKind === 'stories' ? 'active' : ''}" data-kind="stories" aria-pressed="${boardKind === 'stories'}">Stories <span>${data.stories.length}</span></button><button class="tab ${boardKind === 'tasks' ? 'active' : ''}" data-kind="tasks" aria-pressed="${boardKind === 'tasks'}">Tasks <span>${data.tasks.length}</span></button></div><div class="filter-group"><label class="sr-only" for="board-search">Search board</label><input id="board-search" type="search" placeholder="Find a task or story…" value="${esc(boardSearch)}"><label class="sr-only" for="sprint-filter">Sprint</label><select id="sprint-filter">${options(['S1','S2','S3','S4','S5','S6','Stretch'],sprintFilter,'All sprints')}</select><label class="sr-only" for="priority-filter">Priority</label><select id="priority-filter">${options(['Core','Conditional','Stretch'],priorityFilter,'All priorities')}</select><label class="sr-only" for="status-filter">Status</label><select id="status-filter">${options(STATUSES,statusFilter,'All statuses')}</select></div></div><div class="board-summary"><span>${filtered.length} ${boardKind} shown</span><span>Forecast sprints are adjustable · task completion does not automatically close a story</span></div>
    <div class="board-scroll" tabindex="0" aria-label="Scrum board, scroll horizontally for more columns"><div class="kanban-board">${(statusFilter ? [statusFilter] : STATUSES).map(status => {
      const group = filtered.filter(item => item.status === status);
      return `<section class="board-column" aria-label="${esc(status)}"><div class="column-head"><h2><span class="column-dot ${statusColor(status)}"></span>${esc(status)}</h2><span class="column-count">${group.length}</span></div>${group.map(item => boardKind === 'stories' ? storyCard(item) : `<button class="task-card" data-task="${esc(item.id)}"><div class="card-tags"><span class="item-id">${esc(item.id)}</span>${tag(item.priority,'neutral')}</div><h3>${esc(item.title)}</h3><div class="card-meta"><span>${esc(item.sprint)} · ${esc(item.storyId)}</span></div><div class="card-owner"><span class="avatar-small">${item.owner ? esc(item.owner[0].toUpperCase()) : '+'}</span><span>${esc(item.owner || 'Unassigned story')}</span></div></button>`).join('') || '<div class="column-empty">No work here yet.</div>'}</section>`;
    }).join('')}</div></div>${boardKind==='tasks' ? '<p class="muted">Task lanes follow their parent story until a task is checked off in GitHub. Names shown are story assignees; individual task owners and reviewers are agreed in the issue discussion.</p>' : ''}`;
  bindTextFilter('board-search', value => {boardSearch=value; renderBoard();});
  for (const [id, setter] of [['sprint-filter',v=>sprintFilter=v],['priority-filter',v=>priorityFilter=v],['status-filter',v=>statusFilter=v]]) document.getElementById(id).addEventListener('change', event=>{setter(event.target.value);renderBoard();});
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
  main.innerHTML = heading('SPRINT ROADMAP', 'A direction, not a fixed contract.', 'Six proposed two-week sprints. Agree actual dates, capacity and scope at Sprint Planning.') +
    `<div class="notice">${icon('route')}<div><strong>Start with feasibility and evidence.</strong><span>All three members choose work. The draft capacity is about 28 team delivery hours per sprint; replace it with your actual availability in the workbook.</span></div><a class="btn secondary small" href="#documents">Open the plan</a></div><div class="timeline">${data.sprints.map((sprint,i)=>`<section class="sprint-card ${i===0 ? 'current' : ''}"><div class="sprint-marker">${esc(sprint.id)}</div><div class="sprint-body"><div class="card-tags">${tag(`Weeks ${i*2+1}–${i*2+2}`,i===0?'teal':'neutral')}${i===0 ? tag('Next planning meeting','green') : ''}</div><h2>${esc(sprint.title || sprint.goal)}</h2><p>${esc(sprint.goal)}</p><div class="sprint-stories">${(sprint.storyIds||[]).map(id=>`<button class="story-chip" data-story="${esc(id)}">${esc(id)} ${icon('arrow')}</button>`).join('')}</div>${sprint.demo ? `<p class="muted"><strong>Review evidence:</strong> ${esc(sprint.demo)}</p>` : ''}</div></section>`).join('')}</div>`;
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
function showStory(id, focusTask=null) {
  const raw = data.stories.find(s=>s.id===id);
  if (!raw) return toast('That story is not part of this plan.');
  const s = storyState(raw);
  const tasks = data.tasks.filter(t=>t.storyId===id).map(taskState);
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">STORY ${esc(s.id)} · ${esc(s.sprint)}</span><h2 id="dialog-title">${esc(s.title)}</h2></div><button class="icon-button" data-action="close" aria-label="Close story">×</button></div><div class="dialog-body"><div class="card-tags">${tag(s.status,statusColor(s.status))}${tag(s.priority)}${tag(`${s.points} draft points`)}</div><p class="lead-text">${esc(s.story)}</p><div class="detail-grid"><div><span class="detail-label">Owner</span><span class="detail-value">${esc(s.owner||'Unassigned · volunteer at planning')}</span></div><div><span class="detail-label">Reviewer</span><span class="detail-value">${esc(s.reviewer||'Choose a different teammate')}</span></div><div><span class="detail-label">Dependencies</span><span class="detail-value">${s.dependencies.length ? s.dependencies.map(dep=>`<button class="story-chip" data-story="${esc(dep)}">${esc(dep)}</button>`).join(' ') : 'None'}</span></div><div><span class="detail-label">Course criteria</span><span class="detail-value">${esc(s.criteria.join(' · '))}</span></div></div><h3>Acceptance criteria</h3><ol class="checklist">${s.acceptance.map(text=>`<li>${esc(text)}</li>`).join('')}</ol><h3>Tasks <span class="muted">${tasks.filter(t=>t.status==='Done').length}/${tasks.length}</span></h3><p class="muted">Update the task checkboxes in the linked GitHub story. Agree who takes each task and who reviews it there.</p><div class="task-list">${tasks.map(t=>`<div class="task-row ${focusTask===t.id?'task-highlight':''}" id="task-${esc(t.id)}"><span class="task-check ${t.status==='Done'?'checked':''}" aria-label="${t.status==='Done'?'Completed':'Not complete'}">${t.status==='Done'?'✓':'○'}</span><div><span class="item-id">${esc(t.id)}</span><p>${esc(t.title)}</p></div></div>`).join('')}</div><h3>Deliverable</h3><p class="pre-line">${esc(s.deliverable)}</p><h3>Ready when</h3><p>${esc(s.gate)}</p><h3>Risk / boundary</h3><p>${esc(s.risk)}</p></div><div class="dialog-actions"><button class="btn secondary" data-copy="${esc(s.id)}">Copy story link</button>${githubAction(s)}</div>`);
  if (focusTask) setTimeout(()=>document.getElementById(`task-${focusTask}`)?.scrollIntoView({block:'center'}),50);
}
function showDialog(html) {
  const wasOpen=dialog.open;
  document.getElementById('dialog-content').innerHTML=html;
  if (!dialog.open) dialog.showModal();
  if(wasOpen)dialog.querySelector('[data-action="close"]')?.focus();
  dialog.querySelector('.dialog-body')?.scrollTo(0,0);
}
function showGuide() {
  showDialog(`<div class="dialog-head">
    <div><span class="eyebrow">WORKSPACE GUIDE</span><h2 id="dialog-title">One plan. Shared through GitHub.</h2></div>
    <button class="icon-button" data-action="close" aria-label="Close guide">×</button>
  </div><div class="dialog-body">
    <h3>Choose work and keep it moving</h3>
    <ol class="checklist">
      <li>Filter the Scrum board by sprint, priority or Ready status, then open a story.</li>
      <li>Choose <strong>Open / update on GitHub</strong>. Sign in with your own account invited to the private <strong>factoryrelay</strong> repository, then assign yourself after agreeing capacity.</li>
      <li>Record each task’s owner and a different reviewer in the issue discussion. Tick task checkboxes when the evidence is complete; keep the task IDs.</li>
      <li>Keep one status label: Backlog, Ready, In progress, Review, Blocked or Deferred. Close the story after its acceptance criteria and review are complete.</li>
      <li>Refresh the portal after synchronization and deployment finish. The board is a published snapshot, so changes are not instant.</li>
    </ol>
    <p>The portal is public. Use <strong>Preview</strong> to read a document in an embedded Google viewer, or open it in Google Drive. Previews load only when selected and follow the file’s sharing settings; use the Google button if sign-in or browser restrictions prevent the preview. Updating private Issues requires your team invitation; a private link may show 404 if you are signed out or lack access. Individual task owners and reviewers stay in the issue discussion.</p>
    <h3>For the project owner</h3>
    <p>The shared board has <strong>22 story issues and 83 task checkboxes</strong>. Members choose their work; creating the board did not assign anyone.</p>
    <p>Issue changes run <strong>Sync Factory Relay board to public portal</strong> in the ${external(`${REPO}/actions`, 'private repository')}. The resulting board snapshot triggers <strong>Deploy Factory Relay team portal</strong> in the public <strong>factoryrelay-team</strong> repository. If updates stop appearing, check both workflow runs.</p>
    <p>Only story status, assignee logins, task completion, issue links and timestamps synchronize. Private discussions and evidence attachments stay in GitHub. Document and plan changes are published separately.</p>
    <div class="notice"><div><strong>Current connection</strong><span>${snapshot.enabled&&snapshot.items.length ? `${snapshot.items.length} linked stories; last snapshot ${esc(prettyDate(snapshot.syncedAt))}.` : 'This copy is showing the planning baseline. Open the private Issues for current progress and check the latest synchronization run.'}</span></div></div>
    <p>Setup and maintenance details are in <a href="./README.md" target="_blank" rel="noopener">the portal README</a>. No GitHub token is requested or stored in this browser.</p>
  </div><div class="dialog-actions">
    ${external(`${REPO}/issues`, 'Open team Issues '+icon('external'),'btn secondary')}
    ${external(`${PORTAL_REPO}/actions`, 'Public deployments '+icon('external'),'btn secondary')}
    <button class="btn primary" data-action="close">Got it</button>
  </div>`);
}
function bindTextFilter(id, onChange) {
  const input=document.getElementById(id);
  input.addEventListener('input',()=>{const pos=input.selectionStart;onChange(input.value);const next=document.getElementById(id);next.focus();try {next.setSelectionRange(pos,pos);} catch { /* search selection is browser-dependent */ }});
}
function toast(message) {
  const box=document.getElementById('toast');box.textContent=message;box.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.hidden=true,3500);
}
function exportBoard() {
  const rows=[['ID','Type','Title','Status','Sprint','Priority','Story owner','GitHub URL']];
  data.stories.map(storyState).forEach(s=>rows.push([s.id,'Story',s.title,s.status,s.sprint,s.priority,s.owner,s.github?.url||'']));
  data.tasks.map(taskState).forEach(t=>rows.push([t.id,'Task',t.title,t.status,t.sprint,t.priority,t.owner,t.parent.github?.url||'']));
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Factory_Relay_Portal_Board.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Board snapshot exported. Shared updates stay in GitHub.');
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
document.addEventListener('click', async event=>{
  const sidebar=document.getElementById('sidebar');
  if(sidebar.classList.contains('open')&&!event.target.closest('#sidebar')&&!event.target.closest('#menu-toggle')){
    sidebar.classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');event.preventDefault();return;
  }
  const story=event.target.closest('[data-story]');if(story) return showStory(story.dataset.story);
  const preview=event.target.closest('[data-preview]');if(preview) return showDocumentPreview(preview.dataset.preview,preview);
  const task=event.target.closest('[data-task]');if(task){const t=data.tasks.find(t=>t.id===task.dataset.task);return showStory(t.storyId,t.id);}
  const kind=event.target.closest('[data-kind]');if(kind){boardKind=kind.dataset.kind;return renderBoard();}
  const copy=event.target.closest('[data-copy]');if(copy){const url=new URL(location.href);url.hash=`story/${copy.dataset.copy}`;try{await navigator.clipboard.writeText(url.href);toast('Story link copied.');}catch{toast('Copy the story ID: '+copy.dataset.copy);}return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='guide')showGuide();if(action==='close')dialog.close();if(action==='close-preview')previewDialog.close();if(action==='export')exportBoard();
});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
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
  }catch(error){main.innerHTML=`<div class="empty-state"><h1>The workspace could not load.</h1><p>${esc(error.message)}</p><p>Serve this folder over HTTP using <code>npm run portal:dev</code>, or deploy the complete static folder. Opening index.html directly from disk does not support the data requests.</p><button class="btn primary" id="retry-load">Try again</button></div>`;document.getElementById('retry-load').addEventListener('click',start);}
}
start();
