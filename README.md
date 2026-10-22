# Factory Relay team workspace

The three-member PBL team's document library, Scrum board, project links,
adjustable sprint roadmap and course-evidence dashboard. The planning baseline is
**21 October 2026: 22 stories, 83 tasks and 8 baseline records**. The document
library links to nine shared Google Drive files. Earlier proposals are labeled
with their historical scope. The report and manual include a 21 October preview
update and retain their original 13 October game documentation as an appendix.

The **22 October editor revision** adds sprint planning, independent task
assignments, status changes and drag-and-drop, backed by the private GitHub
repository. Production sign-in requires the owner's one-time GitHub App and
Vercel configuration described below. Until that setup is complete, the public
board, document previews and fit-to-screen layout remain available; editing
controls cannot save changes. Local tests do not establish a completed live
OAuth sign-in or production edit.

The configured GitHub Pages address is
**https://toecm.github.io/factoryrelay-team/**. Confirm a successful **Deploy
Factory Relay team portal** run and use its deployment URL before treating a
new installation as live.

## Two repositories, one team workspace

| Location | Visibility | Purpose |
| --- | --- | --- |
| [factoryrelay-team](https://github.com/toecm/factoryrelay-team) | Public | Static website, Google Drive document links and public board snapshot. |
| [factoryrelay](https://github.com/toecm/factoryrelay) | Private | Game source, portal source, publishing tools and shared Issues. |
| [Factory Relay game and editor API](https://factoryrelay.vercel.app/) | Public game; authenticated editor API | Game at the root; server-only GitHub authorization and board endpoints under `/api/portal/`. |

GitHub Pages serves the public repository's `main` branch through its deployment
workflow. This arrangement works with GitHub Free; it does not require Pages
hosting from the private repository. See
[GitHub Pages requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

The canonical local source is `FactoryRelay/team-portal/`, inside the private
Factory Relay project. The public repository contains a reviewed static copy at
its root, plus its static verifier and Pages workflow. The website package has
11 files, including the document-link manifest, board model and editor client.
Document binaries and server authentication code are not bundled.
Only the explicit website files
are uploaded as the Pages artifact; repository internals and deployment tools
are excluded.

## Use the workspace from home or the lab

Open the Pages URL in any browser with internet access. No local server,
installation or GitHub login is needed to browse the public website. Document
cards offer **Preview** in an embedded window and a Google Docs, Sheets, Slides
or Drive button for opening the file in a new tab. Each file's
Google Drive sharing settings control access; the owner must share it with the
intended teammates. The owner's computer does not need to remain running.

To update work after owner setup, select **Sign in with GitHub** and authorize
the Factory Relay GitHub App in its separate GitHub window. Use your own account
invited to the private `factoryrelay` repository and accept that invitation
first. GitHub credentials are entered only on GitHub. The **Open / update on
GitHub** links remain available for direct editing. A private link may show a
404 when you are signed out or lack access. The public website does not grant
private-repository or Hugging Face access; those permissions remain separate.

Everything in the public repository and deployed website is publicly readable,
including document titles and links, the planning snapshot, sprint titles,
goals and dates, assignees and task progress. Keep information entered in those
public board fields appropriate for public viewing. Linked documents retain
their own Google Drive permissions. The browser stores an encrypted, expiring
portal session, not a readable GitHub access token or client secret.

## Preview a document

1. Open **Document library** and select **Preview** on a card or search result.
2. Read or scroll the Google viewer inside the window. The portal remains on the
   same page with its search and category filters preserved.
3. Select **Close** to return. Escape closes the window when keyboard focus is
   outside Google's embedded viewer; the Close button remains available while
   focus is inside it. Closing removes the iframe and returns focus to Preview.
4. If the viewer is blank, unavailable or requests access, use **Open in Google
   Docs/Sheets/Slides/Drive** to sign in or request permission in a separate tab.

The iframe is created only after Preview is selected. Viewing requires internet
access and contacts Google directly; no document bytes or account credentials
are proxied through GitHub Pages. File sharing and browser cookie restrictions
can affect embedded viewing. A frame load event does not prove that its contents
are accessible. Preview does not change sharing permissions or enable offline
document viewing. The game's local LAN mode is a separate feature.

Viewer URLs are derived from the nine allowlisted file IDs, using Drive's
`/file/d/ID/preview` viewer for uploaded files and the Slides `/preview` endpoint
for the presentation. The page CSP permits frames only from `drive.google.com`
and `docs.google.com`. Editing uses the original Google button.

## Update the shared Scrum board

The portal saves authorized edits to GitHub Issues and milestones. All three
members use their own invited accounts. Members choose work after agreeing
capacity; the portal does not allocate work automatically.

1. Select **Sign in with GitHub**, finish authorization in GitHub, and return to
   the portal. If sign-in says owner setup is required, use the GitHub issue
   links until that setup is complete.
2. On **Scrum board**, choose **Stories** or **Tasks**, then open a ticket. Set
   its status, sprint and assignees, and select **Save to GitHub**. Task owners
   can differ from their story's owners. Agree a different reviewer in the
   issue discussion; the portal does not parse reviewer assignments from comments.
3. Move a ticket between status columns by dragging it onto the destination
   column. Keyboard and touch users can make the same change through the
   ticket's status selector. Wait for confirmation: a failed request does not
   count as a saved move.
4. Use **Create sprint** or open **Sprint roadmap → Edit dates and goal**. Set
   the sprint ID, title, goal and optional dates, then save. Move a ticket into
   that sprint using its detail window. Moving a task can give it a different
   sprint from its parent story.
5. Mark **Task complete** only when its evidence is ready. Completing a task
   updates its original GitHub checklist. It does not close the story. Setting
   a story to Done closes its issue; other statuses reopen it if necessary.
6. Enable **Fit all columns to screen** to remove horizontal board scrolling.
   Columns use the available width and wrap into readable rows on narrow
   screens. This does not eliminate vertical scrolling through all tickets.
7. The board's Google button and **Preview** open the shared Scrum workbook.
   The workbook is a separate planning document: edits there are not imported
   into GitHub automatically.

Open story statuses map to one controlled GitHub label:

| GitHub label | Portal column |
| --- | --- |
| `factory:backlog` | Backlog |
| `factory:ready` | Ready |
| `factory:in-progress` | In progress |
| `factory:review` | Review |
| `factory:blocked` | Blocked |
| `factory:deferred` | Deferred |

Close stories only after their acceptance criteria and review are complete.
Closing a story does not check unfinished tasks. Existing tasks inherit the
story's status, sprint and assignees until individual values are saved. A checked
task displays Done; an unchecked task without its own status displays Backlog
when its parent is closed. Priority and acceptance criteria still come from
the versioned plan.

The editor re-reads GitHub before saving and rejects a stale version. If a
conflict is reported, choose **Reload latest**, review the new values, and save
again. This is a best-effort conflict check, **not an atomic transaction**:
an external edit in the final read/write interval can still race with the save.

### How board fields are stored

| Portal data | GitHub backend |
| --- | --- |
| Story | Existing managed Issue with its story marker. |
| Story status and owners | Issue state, one `factory:*` label, native assignees. |
| Story sprint | Issue milestone; explicit Unscheduled state is recorded in managed metadata. |
| Sprint | Managed milestone; title and due date are native fields, start date and goal are in its marked description block. |
| Task completion | Original checkbox in the parent issue. |
| Independent task status, owners and sprint | Validated `factory-relay-board:v1` metadata in the parent issue body. These are task-level records, not separate GitHub issues or native task assignees. |

Preserve managed markers, metadata and task IDs such as `ENG0-T1` when editing
directly on GitHub. The editor preserves unrelated prose, labels and discussion.
Only milestones with the Factory Relay marker are included as managed sprints.
The six initial sprint forecasts become milestones when saved or first used by
an edited ticket. Creating a sprint does not create or assign new stories.

### Sign-in session and shared updates

GitHub authorization uses its web flow with PKCE. Vercel verifies repository
write access and keeps the GitHub token inside an AES-GCM encrypted bearer
session. The browser holds that sealed session in `sessionStorage` (or memory
if storage is unavailable), and sends it only to the editor API. Refresh tokens
are discarded. Sessions last at most 24 hours and never exceed the GitHub
token's lifetime, normally **eight hours**. Closing the tab usually ends its
session storage; browser tab restoration may restore it until expiry. Sign out
on shared devices. Sign-out clears the browser session and attempts GitHub
token revocation; if revocation fails, the token's expiry still applies.

The API checks current repository access on each read and write. Signing into
GitHub in another tab alone does not authenticate the portal. A revoked,
expired or unauthorized session must sign in again.

Signed-in editors read fresh board state after saves, on window focus, and
about every 30 seconds while the page is visible. Other members see that shared
GitHub state on their next refresh; this is polling, not live chat. Signed-out
visitors see the last published snapshot and must refresh after the private
sync and public Pages workflows finish. If a workflow fails, the last
successfully published snapshot remains visible.

## How the two-repository synchronization works

1. A change to a managed Issue or milestone triggers **Sync Factory Relay board to
   public portal** in the private repository. A maintainer can also run it
   manually from Actions.
2. The workflow uses its own short-lived `GITHUB_TOKEN`, with `contents: read`
   and `issues: read`, to generate an allowlisted snapshot.
3. A dedicated SSH deploy key pushes **only `data/github-board.json`** to
   `toecm/factoryrelay-team`. The publishing script checks this file boundary;
   the key itself has write access to that entire public repository, not a
   path-level restriction. It has no access to other repositories.
4. That push triggers **Deploy Factory Relay team portal** in the public
   repository. The workflow verifies and publishes the static website.

The exported fields include managed story IDs, status, GitHub login assignees,
task completion and independent task fields, sprint IDs, titles, goals and dates,
issue/milestone numbers and links, version digests and update timestamps.
Raw issue bodies, comments, evidence attachments, unrelated milestone content
and emails are not exported. The portal publishes the selected document links;
Google Drive serves the document contents.

Check Actions in both repositories before assuming an edit has appeared in the
public snapshot. Two conflicting
status labels, duplicate story markers or duplicate task IDs need correction in
the private Issue before synchronization can succeed.

## Maintainer setup and recovery

These are configuration and recovery steps for the repository owner. Teammates
need their own invited GitHub accounts to edit, but no app secrets, deployment
permissions or personal access tokens.

### Enable the authenticated editor once

This revision requires the following production setup before real portal edits
can be used. Publishing the frontend alone does not complete it.

1. Register a GitHub App under the project owner's account, using a distinctive
   Factory Relay name. Set the homepage to
   `https://toecm.github.io/factoryrelay-team/` and the exact callback URL to
   **`https://factoryrelay.vercel.app/api/portal/callback`**. Select public App
   visibility (**Any account**) so teammates outside the owner's personal
   account can authorize it. This makes the App registration public; it does
   not change the private repository's visibility or grant outsiders access.
2. Set repository permissions to **Issues: Read and write** and
   **Metadata: Read-only**. No Contents, Actions, administration, organization
   or account permissions are needed. Keep expiring user authorization tokens
   enabled. Do not enable device flow. Webhooks may remain inactive because the
   repository's existing Actions workflow publishes the snapshot.
3. Install the App on the owner's account for **Only select repositories →
   `factoryrelay`**. Members must separately accept their repository invitations
   and authorize the App when signing in; installation does not grant them
   access to other repositories.
4. Generate the App's client secret and configure the existing Factory Relay
   Vercel project with these server-only Production environment variables:

   | Environment variable | Value |
   | --- | --- |
   | `PORTAL_GITHUB_CLIENT_ID` | GitHub App client ID, not its numeric App ID. |
   | `PORTAL_GITHUB_CLIENT_SECRET` | App client secret. |
   | `PORTAL_SESSION_SECRET` | A cryptographically random secret generated from at least 32 random bytes; base64 encoding is suitable. The server requires at least 32 UTF-8 bytes and derives its encryption key with SHA-256. |

5. Keep those values out of Git, browser code, screenshots, terminal output and
   chat. Do not add a `VITE_` prefix or expose them as frontend variables. No
   App private key or shared personal access token is required for this user
   authorization flow. Use the owner's local setup helper or Vercel's
   environment-variable settings to enter secrets.
6. Redeploy the Vercel project from the updated private repository so it includes
   `/api/portal/` functions and the new environment settings. Confirm the
   `/api/portal/config` endpoint reports `configured: true`. Then sign in through
   the portal using an invited account, verify a deliberate team-approved
   edit on GitHub, and verify the public snapshot after its workflows finish.

The Vercel handler accepts the exact portal/API origins, restricts writes to
`toecm/factoryrelay`, checks repository access every time and disables response
caching. The callback sends only a sealed session to the matching popup origin;
the client verifies its source window and fresh nonce. GitHub login is a
separate window, not an embedded password form. Rotating the session secret
invalidates existing portal sessions. GitHub App authorization can also be
revoked in GitHub settings.

See [registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app),
[App visibility and authorization](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private),
[user authorization and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
and [expiring user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

### Public repository: `toecm/factoryrelay-team`

1. Keep `index.html`, `app.js`, `github-client.js`, `board-model.js`, `styles.css`,
   `README.md`, `.nojekyll`, `assets/`, and `data/` at the repository root. Keep the provided
   `scripts/verify-static.mjs` and Pages workflow in their respective folders.
2. In **Settings → Pages**, select **GitHub Actions** as the publishing source.
3. Under **Settings → Secrets and variables → Actions → Variables**, set
   `FACTORY_PORTAL_PUBLISH` to `true`.
4. Run **Deploy Factory Relay team portal** on `main`. After it succeeds, open
   the deployment URL and check the document links and board date.

The Pages workflow packages only the website files. The public repository does
not need a credential that can read the private repository.

### Private repository: `toecm/factoryrelay`

The synchronization workflow is `.github/workflows/team-portal-sync.yml`. It
requires these settings:

| Setting | Type | Purpose |
| --- | --- | --- |
| `FACTORY_PORTAL_SYNC` = `true` | Actions variable | Enables the board synchronization job. |
| `TEAM_PORTAL_DEPLOY_KEY` | Actions secret | Private half of a dedicated SSH key whose public half is registered as a write-enabled deploy key on `factoryrelay-team` only. |
| `TEAM_PORTAL_KNOWN_HOSTS` | Actions variable | Verified GitHub SSH host-key entries used with strict host-key checking. |

Keep the deploy key out of source files, browser code, screenshots and logs.
Use a distinct key for this repository; do not reuse a personal SSH key or a
broad personal access token. Deploy keys do not expire automatically. If the
key must be replaced, update the public repository's deploy key and the private
repository's secret together. See
[GitHub deploy-key documentation](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

To initialize or repair the managed story set:

1. Run **Seed Factory Relay story issues** with `apply=false` and review the
   missing-story preview.
2. Run it with `apply=true` to create missing stories and controlled status
   labels. The full set is 22 story issues with 83 task checkboxes. Existing
   managed issues and progress are preserved; no members are assigned.
3. Run **Sync Factory Relay board to public portal** manually after seeding.
   Events created by the seed workflow's `GITHUB_TOKEN` do not automatically
   trigger the synchronization workflow. Later human issue edits do.
4. Check the resulting public Pages run and refresh the website.

The synchronization job checks out trusted `main`, serializes updates and uses
a repository-scoped deploy key for the public push. SSH deploy-key pushes can
trigger the public deployment workflow. See
[GitHub workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
and [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Preview locally

With the complete private Factory Relay checkout and Node.js installed, run from
the `FactoryRelay` root:

```powershell
npm run portal:dev
```

Open **http://127.0.0.1:4175/**. This static preview needs no model or package
installation. The Windows `Open Team Portal.cmd` launcher opens the same preview.
Keep the local server running while using it; press Ctrl+C to stop.

With only the public repository downloaded, use Python from its root instead:

```powershell
python -m http.server 4175 --bind 127.0.0.1
```

Open the same local URL. These commands provide a preview on your own computer;
share the GitHub Pages URL for team access. Do not double-click `index.html`:
the browser needs HTTP to load the JSON files. Relative asset paths support the
`/factoryrelay-team/` project-site address.

This static server does not host the editor API. Production authentication
accepts the published portal origin; it does not authorize arbitrary localhost
pages. Automated editor tests use a mocked API and make no real GitHub changes.

## Maintain documents and website content

Update the canonical source under the private project's `team-portal/` folder.
`data/portal-data.json` contains the planning baseline. Automatic Issue
synchronization updates only the public `data/github-board.json`; it does not
publish changed page code, document links or new story definitions. Edits to a
Google Drive file are visible when opening that same link; changing its URL
requires a portal update.

The owner's workspace can refresh the document links and planning snapshot:

```powershell
npm run portal:prepare
npm run portal:verify
```

`research/` remains ignored by Git and retains the original local research files.
The prepare script reads the planning records and writes the nine explicit
Google Drive links in `scripts/prepare-team-portal.mjs`. Verification compares
each link, label and provider with `data/documents-manifest.json` (schema 2,
`external-links`). It does not fetch document contents or change Drive sharing.
No PDF, Office or CSV document copies are included in the website package.
The public verifier rejects a leftover `documents/` directory.

Review changes, commit the source in the private repository, then update the
corresponding website files in the public repository. Preserve its latest
`data/github-board.json` instead of replacing it with an older local snapshot.
Keep its verifier and Pages workflow in place. When story definitions change,
update `data/portal-data.json` in both repositories before running seeding and
synchronization. To change a document destination, update its entry in
`scripts/prepare-team-portal.mjs`, regenerate the JSON, and update the expected
link mapping in the browser checks and public static verifier. Review sharing
in Google Drive separately; publishing a link does not grant access to its file.

In the private project, validate with:

```powershell
npm run portal:verify
npm run test:portal
node --test scripts/publish-team-portal-snapshot.test.mjs
# With the local preview running in another terminal:
npm run test:portal:browser
```

In the public repository, run:

```powershell
node scripts/verify-static.mjs
```

Checks cover the board contract, authorized write mapping, stale revisions,
OAuth state integrity, session expiry, origin checks and request limits.
Browser checks cover desktop/mobile layouts, navigation, board filters,
story/task details, search, Google Drive link destinations, on-demand preview
loading, close/focus behavior and the project-site path. Local iframe tests use
a clearly labeled fixture and do not prove access to the real Google viewer. Local checks
alone do not establish that the remote website is live; inspect the successful
Pages deployment and its served files as well.

The game, Vercel deployment, Hugging Face Space and dataset remain separate
resources. Publishing the team portal adds no translation, training, research
results or machine-control capability to the game.

## License

The project owner has not yet selected a distribution license. This README does
not grant a software or document license. Public visibility is not a substitute
for an explicit license.
