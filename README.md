# repo-reader

A GitHub Action that authorizes `git` to clone **private repositories across one
or more orgs** using a single GitHub App, then rewrites global git config so
every subsequent step in the job (`terraform init`, `go mod download`, plain
`git clone`, …) authenticates transparently — no per-repo tokens, no secrets
stored in consuming repos.

## Why

Terraform module sources like
`git::https://github.com/org/repo.git//mod?ref=v1` are just `git clone`s run on
the runner. The default `GITHUB_TOKEN` can only read the workflow's own repo, so
pulling private modules from sibling/other orgs needs a real cross-repo
credential. This action wraps a GitHub App (the same mechanism as
[`actions/create-github-app-token`](https://github.com/actions/create-github-app-token))
and applies the resulting token(s) to git for you, once, for every owner you
list.

## Prerequisites (one-time, per org)

1. **Register one GitHub App** (org-owned), Repository permission **Contents:
   Read-only**, "Where can this app be installed?" → **Any account**. Generate a
   private key (`.pem`) and note the **App ID**.
2. **Install the App** on each owner whose repos you need, scoped to **selected
   repositories** (recommended) — this is the real blast-radius cap.
3. Store the credentials so workflows can map them. Org-level is cleanest:
   - **Variable** `REPO_READER_APP_ID` → the App ID (not a secret)
   - **Secret** `REPO_READER_KEY` → the `.pem` contents (raw or base64)

The App ID and key are shared across every owner — one App, many installations.

## Usage

```yaml
jobs:
  plan:
    runs-on: ubuntu-latest
    env:
      # An action cannot read secrets/vars by name — map them here once.
      REPO_READER_APP_ID: ${{ vars.REPO_READER_APP_ID }}
      REPO_READER_KEY: ${{ secrets.REPO_READER_KEY }}
    steps:
      - uses: e11community/repo-reader@v1
        with:
          friends: |
            org2
            org3/yo
            org3/papa

      - uses: actions/checkout@v4
      - run: terraform -chdir=environments/dev/main init
```

After the `repo-reader` step, git is configured so any clone of
`github.com/org2/*`, `github.com/org3/yo`, or `github.com/org3/papa` succeeds.

## The `friends` microformat

Newline-delimited owners. Each line:

| Line                    | Effect                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `org2`                  | Token for `org2`, scoped to **every repo the App is installed on** there |
| `org3/yo`               | Token for `org3`, scoped to `yo`                                         |
| `org3/yo` + `org3/papa` | **One** `org3` token scoped to `[yo, papa]`, **one** git rewrite         |
| `org3` + `org3/yo`      | Bare owner wins → full `org3` installation scope                         |

Notes:

- **One token and one git rewrite per owner**, regardless of how many repo lines
  it has. Lines under the same owner are merged.
- A bare `owner` does **not** mean "every repo in the org" — it means "the full
  grant of that App _installation_." If the App is installed on selected repos,
  that is the ceiling.
- The git rewrite matches the whole `github.com/<owner>/` prefix, so a clone of a
  repo you did **not** list (or the App was not installed on) will attempt the
  owner's token and **fail auth**. That is correct least-privilege behavior — it
  surfaces as an auth error, not "forbidden."

## Inputs

| Input             | Required | Default              | Description                                                            |
| ----------------- | -------- | -------------------- | ---------------------------------------------------------------------- |
| `friends`         | yes      | —                    | Newline-delimited `owner` / `owner/repo` lines (see above).            |
| `app_id_env`      | no       | `REPO_READER_APP_ID` | Name of the env var holding the App ID. Override only on name clashes. |
| `private_key_env` | no       | `REPO_READER_KEY`    | Name of the env var holding the App private key (PEM, raw or base64).  |

## How it works

For each owner:

1. Sign a JWT as the App using the private key (**the key never leaves the
   runner** — only a signature is sent to GitHub).
2. Look up the App's installation for that owner (org, then user).
3. Exchange for a short-lived (~1h) installation token, scoped to the listed
   repos or the full grant.
4. `git config --global url."https://x-access-token:<token>@github.com/<owner>/".insteadOf "https://github.com/<owner>/"`.

Tokens are masked in logs via `setSecret`. Runners are ephemeral, so the global
git config evaporates with the job.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # esbuild → dist/action.js (commit the result)
npm run format
```

`dist/action.js` is the committed, bundled artifact the runner executes.
**Rebuild and commit it after any change under `src/`.**

## License

MIT.
