# Factory Relay team workspace

The three-member PBL team's document library, Scrum board, project links,
six-sprint forecast and course-evidence dashboard. The planning baseline is
**21 October 2026: 22 stories, 83 tasks and 8 baseline records**. The document
library links to nine shared Google Drive files. Earlier proposals, reports and manuals are labeled with their
historical scope.

The configured GitHub Pages address is
**https://toecm.github.io/factoryrelay-team/**. Confirm a successful **Deploy
Factory Relay team portal** run and use its deployment URL before treating a
new installation as live.

## Two repositories, one team workspace

| Location | Visibility | Purpose |
| --- | --- | --- |
| [factoryrelay-team](https://github.com/toecm/factoryrelay-team) | Public | Static website, Google Drive document links and public board snapshot. |
| [factoryrelay](https://github.com/toecm/factoryrelay) | Private | Game source, portal source, publishing tools and shared Issues. |
| [Factory Relay game](https://factoryrelay.vercel.app/) | Public | Play the separately deployed game. |

GitHub Pages serves the public repository's `main` branch through its deployment
workflow. This arrangement works with GitHub Free; it does not require Pages
hosting from the private repository. See
[GitHub Pages requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

The canonical local source is `FactoryRelay/team-portal/`, inside the private
Factory Relay project. The public repository contains a reviewed static copy at
its root, plus its static verifier and Pages workflow. The website package has
9 files, including the document-link manifest. Document binaries are not bundled.
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

To update work, open a story's **Open / update on GitHub** link and sign in with
your own account invited to the private `factoryrelay` repository. Accept that
invitation first. A private link may show a 404 when you are signed out or lack
access. The public website does not grant private-repository or Hugging Face
Space access; those permissions remain separate.

Everything in the public repository and deployed website is publicly readable,
including document titles and links, the planning snapshot and exported board
fields. Linked documents retain their own Google Drive permissions. The browser
never requests or stores a GitHub token.

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

GitHub Issues in the private repository is the editing surface. The website is a
searchable snapshot of those stories, updated after the publishing workflows
finish.

1. Find a story in the portal and open its GitHub issue.
2. Self-assign after agreeing the sprint's capacity. In the issue discussion,
   record who takes each task and who reviews it. The reviewer should be a
   different member; the portal displays story assignees, not individual task
   owners or reviewers from comments.
3. Tick task checkboxes when their evidence is complete. Preserve task IDs such
   as `ENG0-T1` and the managed story marker in the issue body.
4. Keep exactly one controlled status label on each open story:

   | GitHub label | Portal column |
   | --- | --- |
   | `factory:backlog` | Backlog |
   | `factory:ready` | Ready |
   | `factory:in-progress` | In progress |
   | `factory:review` | Review |
   | `factory:blocked` | Blocked |
   | `factory:deferred` | Deferred |

5. Close a story only after its acceptance criteria and review are complete.
   Closed stories display Done. Closing does not check unfinished tasks.
6. Allow the private synchronization and public Pages workflows to finish, then
   refresh the portal. Check the board snapshot date in the page footer.

An unchecked task follows its open parent story's status; a checked task displays
Done. If its parent is closed while that task remains unchecked, the task stays
Backlog. Sprint, priority, reviewer and acceptance text come from the versioned
plan. Editing a linked Google Drive file or workbook does not update GitHub or
the portal's versioned planning snapshot.

## How the two-repository synchronization works

1. A human change to a managed Issue triggers **Sync Factory Relay board to
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

The exported fields are managed story IDs, status, GitHub login assignees, task
checkbox states, issue numbers/links and update timestamps. Issue bodies,
comments, evidence attachments and emails are not exported. The portal publishes
the selected document links; Google Drive serves the document contents.

This is not instant editing or live chat. If either workflow fails, the last
successfully published snapshot remains visible. Check Actions in both
repositories before assuming an issue edit has appeared online. Two conflicting
status labels, duplicate story markers or duplicate task IDs need correction in
the private Issue before synchronization can succeed.

## Maintainer setup and recovery

These are configuration and recovery steps for the repository owner; teammates
do not need credentials or deployment permissions to use the board.

### Public repository: `toecm/factoryrelay-team`

1. Keep `index.html`, `app.js`, `styles.css`, `README.md`, `.nojekyll`, `assets/`,
   and `data/` at the repository root. Keep the provided
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
