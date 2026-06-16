# Auto-deploy: GitHub -> Google Apps Script

This wires the repo so that any change to `Macro - DARB Identification/Code.gs`
(or `appsscript.json`) on the **master** branch is pushed to the bound Google
Apps Script project automatically, using [`clasp`](https://github.com/google/clasp)
in GitHub Actions. You can also trigger it manually from the **Actions** tab.

Workflow file: `.github/workflows/deploy-apps-script.yml`.

## How it works

1. A push to `master` that touches the script (or a manual **Run workflow**)
   starts the job.
2. The job runs `node --check` on the script as a gate.
3. It writes your clasp credentials and a `.clasp.json` (built from the
   `SCRIPT_ID` secret), then runs `clasp push -f` from the
   `Macro - DARB Identification` folder.
4. A committed `.claspignore` ensures **only** `Code.gs` and `appsscript.json`
   are pushed - the docs in the folder are never sent to Apps Script.

> Apps Script stores `Code.gs` and `Code.js` identically (both are server-side
> JavaScript), so keeping the file as `Code.gs` is fine for clasp.

## One-time setup

You need two repository secrets. **Important:** the deploy target is identified
by the **Script ID**, which is *not* the spreadsheet ID in the sheet URL
(`.../spreadsheets/d/<SPREADSHEET_ID>/edit`). They are different IDs.

### 1. Get the Script ID

1. Open the workbook:
   <https://docs.google.com/spreadsheets/d/1GnzSm72BQAqF62XbcYM-7Xs_yYQZuw0Nk4qHv6zNjAE/edit>
2. **Extensions > Apps Script**.
3. In the script editor: **Project Settings** (the gear icon) > **IDs**.
4. Copy the **Script ID** (a long string, ~57 characters).

### 2. Enable the Apps Script API for the deploying account

Visit <https://script.google.com/home/usersettings> and turn the
**Google Apps Script API** ON. `clasp push` fails without this.

### 3. Generate clasp credentials

On your own machine, with the Google account that owns (or can edit) the
workbook:

```bash
npm install -g @google/clasp@2.4.2
clasp login          # opens a browser; authorize the workbook's account
cat ~/.clasprc.json  # copy the ENTIRE JSON output
```

`~/.clasprc.json` contains a long-lived refresh token. Treat it like a
password - it is only ever stored as a GitHub **secret**, never committed.

### 4. Add the two repository secrets

In GitHub: **Settings > Secrets and variables > Actions > New repository secret**.

| Secret name    | Value                                                        |
|----------------|-------------------------------------------------------------|
| `SCRIPT_ID`    | the Script ID from step 1                                    |
| `CLASPRC_JSON` | the full contents of `~/.clasprc.json` from step 3          |

That is all - the next push to `master` that changes the script deploys it. To
deploy immediately without a code change, use **Actions > Deploy Apps Script >
Run workflow**.

## Important: this deploys to the live workbook

This pipeline pushes straight to the bound (production) script. The engineering
handoff recommends auto-deploying to a **separate staging** workbook/Script ID
and only promoting to production deliberately. To do that, create a staging copy
of the workbook, use its Script ID as the secret, and keep the syntax gate in
place. Switching the target later is just changing the `SCRIPT_ID` secret.

## Deploying manually from your machine (optional)

```bash
cd "Macro - DARB Identification"
cp .clasp.json.example .clasp.json     # then paste your Script ID into it
clasp push                             # .claspignore limits this to Code.gs + appsscript.json
```

`.clasp.json` is git-ignored, so your local copy never lands in the repo.

## Troubleshooting

- **`User has not enabled the Apps Script API`** - do step 2.
- **`Could not read API credentials`** - `CLASPRC_JSON` is empty or malformed;
  re-copy the full file contents from step 3.
- **`Script ID ... not found` / 404** - wrong ID (you likely used the
  spreadsheet ID); re-copy from Project Settings > IDs.
- **Nothing happened on push** - confirm you pushed to `master` and that the
  change touched `Code.gs`, `appsscript.json`, or the workflow file, or use
  **Run workflow** to dispatch manually.
- **Token stopped working after a while** - the refresh token can be revoked by
  a Google password change or security review; re-run `clasp login` and update
  the `CLASPRC_JSON` secret.
