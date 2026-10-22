// Browser keeps only an encrypted, expiring portal session. GitHub tokens stay server-side.
export const API_BASE = 'https://factoryrelay.vercel.app/api/portal';
const API_ORIGIN = new URL(API_BASE).origin;
const SESSION_KEY = 'factory-relay-editor-session-v1';
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

export function createPortalClient({data, onChange = () => {}, onAuthChange = () => {}, onError = () => {}, fetchImpl = fetch} = {}) {
  let sealed = '', session = null, popup = null, failedPopup = null, cancelPending = null, timer = null, refreshing = null;
  let configured = false, authError = '', snapshot = null, assignees = [], generation = 0, mutation = null;
  const storage = () => { try { return window.sessionStorage; } catch { return null; } };
  function clear() {
    generation++;
    sealed = ''; session = null; assignees = [];
    try { storage()?.removeItem(SESSION_KEY); } catch { /* Memory-only remains usable. */ }
    onAuthChange(null);
  }
  function keep(value) {
    const expires = Date.parse(value.session?.expiresAt);
    if (typeof value.sessionToken !== 'string' || !value.sessionToken || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + MAX_SESSION_MS + 60000 || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.session?.login || '')) throw new Error('Invalid sign-in response.');
    generation++;
    sealed = value.sessionToken;
    session = {login:value.session.login, expiresAt:value.session.expiresAt};
    try { storage()?.setItem(SESSION_KEY, JSON.stringify({sessionToken:sealed, session})); } catch { /* Keep this session in memory if storage is blocked. */ }
    onAuthChange(session);
  }
  async function request(action, body, authenticated = true) {
    if (authenticated && (!session || Date.parse(session.expiresAt) <= Date.now())) { clear(); throw Object.assign(new Error('Your sign-in expired. Sign in with GitHub again.'), {code:'sign_in_required'}); }
    const response = await fetchImpl(`${API_BASE}/${action}`, {method:body === undefined ? 'GET' : 'POST', cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer',
      headers:{...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...(authenticated ? {Authorization:`Bearer ${sealed}`} : {})},
      ...(body !== undefined ? {body:JSON.stringify(body)} : {})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 && result.code === 'access_denied') clear();
      throw Object.assign(new Error(result.error || `The team service is unavailable (${response.status}).`), {status:response.status, code:result.code});
    }
    return result;
  }
  function accept(result) {
    if (result.session && (session?.login !== result.session.login || session?.expiresAt !== result.session.expiresAt)) keep({sessionToken:sealed, session:result.session});
    if (Array.isArray(result.assignees)) assignees = result.assignees;
    if (result.snapshot) { snapshot = result.snapshot; onChange(snapshot); }
    return snapshot;
  }
  async function refresh() {
    if (!session) return snapshot;
    if (mutation) return mutation;
    if (refreshing) return refreshing;
    const before = generation;
    refreshing = request('board').then(result => before === generation && session ? accept(result) : snapshot).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function save(body) {
    if (mutation) throw new Error('Wait for the current change to finish saving.');
    generation++;
    const before = generation;
    mutation = request('mutate', body).then(result => before === generation && session ? accept(result) : snapshot).finally(() => {mutation = null;});
    return mutation;
  }
  function cancelLogin() {
    cancelPending?.();
    if (failedPopup && !failedPopup.closed) failedPopup.close();
    failedPopup = null;
  }
  function startLogin() {
    cancelLogin();
    // Open synchronously from the click so ordinary popup blockers allow it.
    popup = window.open('about:blank', 'factory-relay-github-sign-in', 'popup,width=640,height=740');
    if (!popup) return Promise.reject(new Error('Allow the GitHub sign-in window, then try again.'));
    popup.document.title = 'Factory Relay sign-in';
    popup.document.body.textContent = 'Opening GitHub sign-in…';
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
    const targetWindow = popup;
    return new Promise((resolve, reject) => {
      let finished = false;
      function cleanup() { window.removeEventListener('message', receive); clearInterval(closedTimer); clearTimeout(timeout); cancelPending = null; popup = null; }
      function end(error, closeWindow = true) {
        if (finished) return;
        finished = true; cleanup();
        if (closeWindow) targetWindow.close();
        else failedPopup = targetWindow;
        if (error) reject(error);
      }
      async function receive(event) {
        if (event.origin !== API_ORIGIN || event.source !== targetWindow || event.data?.type !== 'factory-relay-auth' || event.data?.nonce !== nonce || finished) return;
        // Keep the trusted callback's explanation visible until the user closes it or retries.
        if (event.data.error) return end(new Error(event.data.error), false);
        try {
          keep(event.data);
          finished = true; cleanup(); targetWindow.close();
          await refresh(); resolve(session);
        } catch (error) { clear(); if (!finished) end(error); else reject(error); }
      }
      const closedTimer = setInterval(() => { if (targetWindow.closed) end(new Error('GitHub sign-in was cancelled.')); }, 500);
      const timeout = setTimeout(() => end(new Error('GitHub sign-in timed out. Please try again.')), 10 * 60 * 1000);
      cancelPending = () => end(new Error('GitHub sign-in was cancelled.'));
      window.addEventListener('message', receive);
      request('start', {nonce}, false).then(result => {
        if (finished) return;
        const url = new URL(result.authorizationUrl);
        if (url.origin !== 'https://github.com' || url.pathname !== '/login/oauth/authorize') throw new Error('The sign-in destination is invalid.');
        targetWindow.location.replace(url.href);
      }).catch(error => end(error));
    });
  }
  async function initialize() {
    try {
      const config = await request('config', undefined, false);
      configured = config.configured === true && config.repo === 'toecm/factoryrelay';
      if (!configured) authError = 'The owner needs to finish the one-time GitHub App setup to enable shared editing.';
      if (configured) {
        try { const saved = JSON.parse(storage()?.getItem(SESSION_KEY) || 'null'); if (saved) keep(saved); } catch { clear(); }
        if (session) await refresh();
      }
    } catch (error) { authError = error.message; if (session && error.status === 401) clear(); }
    clearInterval(timer);
    timer = setInterval(() => { if (session && !document.hidden) refresh().catch(error => onError(error)); }, 30000);
    window.addEventListener('focus', focusRefresh);
    return {configured, session};
  }
  function focusRefresh() { if (session) refresh().catch(error => onError(error)); }
  return {
    initialize, startLogin, cancelLogin, refresh,
    async logout() { cancelLogin(); try { if (session) await request('logout', {}); } finally { clear(); } },
    saveStory:(id, changes, version) => save({type:'story', id, changes, version}),
    saveTask:(storyId, id, changes, version) => save({type:'task', storyId, id, changes, version}),
    saveSprint:sprint => save({type:'sprint', sprint}),
    dispose() { cancelLogin(); clearInterval(timer); window.removeEventListener('focus', focusRefresh); },
    get session() { return session; }, get snapshot() { return snapshot; }, get assignees() { return assignees; },
    get configured() { return configured; }, get authError() { return authError; },
  };
}
