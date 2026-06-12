# repo-reacher

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

## Setup (one-time)

However you set it up, the action only ever needs three things to exist:

1. an **App ID** (a number, not secret),
2. the App's **private key** (one `.pem`, the only secret), and
3. an **installation** of that App on each owner in your `friends` list.

One App → one ID → one key → **many per-org installations**. Pick the path that
matches your GitHub plan.

### Golden Path — enterprise-owned App (GitHub Enterprise Cloud)

Best when every owner you'll reach lives inside one GitHub Enterprise. The App
is owned by the **enterprise itself**, so it's centrally originated and
auto-scoped to the enterprise's organizations (it physically **cannot** be
installed on an external org — a tighter blast radius for free).

1. **Register it at the enterprise:** Enterprise account → **Settings → GitHub
   Apps** → **New GitHub App**. (Enterprise-owned apps skip the "Developer
   settings" step that org-owned apps use.)
2. Permissions → Repository → **Contents: Read-only**. Webhook → **uncheck
   Active**.
3. **Generate a private key** (`.pem`) and note the **App ID**. Both originate
   and live here, at the enterprise.
4. **Install it on each org** whose repos you need — manually, via the App's
   install link → choose **Only select repositories** (the real blast-radius
   cap). Repeat per org; no installer/automation required.
5. Store the credentials (see [below](#store-the-credentials)).

> **Constraint:** an enterprise-owned App can only be installed on that
> enterprise and its member organizations. If a `friends` owner is an org
> _outside_ this enterprise, use the One-Org path below for it (or a second App).

### One-Org-To-Rule-Them-All — org-owned App (no Enterprise)

Best when you don't have GitHub Enterprise, or need to reach orgs that aren't all
in one enterprise. One designated **shared-services org** owns the App; it's made
publicly installable so it can be added to any other org.

1. **Register it under the shared-services org:** that org → **Settings →
   Developer settings → GitHub Apps** → **New GitHub App**.
2. Permissions → Repository → **Contents: Read-only**. Webhook → **uncheck
   Active**.
3. **"Where can this app be installed?"** → **Any account** (this is what lets it
   install on _other_ orgs).
4. **Generate a private key** (`.pem`) and note the **App ID**.
5. **Install it on each owner** whose repos you need, scoped to **selected
   repositories** (recommended).
6. Store the credentials (see [below](#store-the-credentials)).

> The App is owned by one org but installable anywhere, so its blast radius is
> wider than the enterprise-owned App. Prefer the Golden Path if you have
> Enterprise.

### Store the credentials

In **each org that runs workflows** using this action (the consumer side), make
the App ID and key available to those repos. Org-level is cleanest:

- **Variable** `REPO_REACHER_APP_ID` → the App ID (not a secret)
- **Secret** `REPO_REACHER_KEY` → the `.pem` contents (raw or base64), scoped to
  the repos that need it

The same App ID and key are shared across every owner and every consuming org —
one App, many installations. The credential lives wherever the _workflow runs_,
not on the `friends` orgs being reached.

## Usage

```yaml
jobs:
  plan:
    runs-on: ubuntu-latest
    env:
      # An action cannot read secrets/vars by name — map them here once.
      REPO_REACHER_APP_ID: ${{ vars.REPO_REACHER_APP_ID }}
      REPO_REACHER_KEY: ${{ secrets.REPO_REACHER_KEY }}
    steps:
      - uses: e11community/repo-reacher@v1
        with:
          friends: |
            org2
            org3/yo
            org3/papa

      - uses: actions/checkout@v4
      - run: terraform -chdir=environments/dev/main init
```

After the `repo-reacher` step, git is configured so any clone of
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

| Input             | Required | Default               | Description                                                                          |
| ----------------- | -------- | --------------------- | ------------------------------------------------------------------------------------ |
| `friends`         | yes      | —                     | Newline-delimited `owner` / `owner/repo` lines (see above).                          |
| `app_id_env`      | no       | `REPO_REACHER_APP_ID` | Name of the env var holding the App ID. Override only on name clashes.               |
| `private_key_env` | no       | `REPO_REACHER_KEY`    | Name of the env var holding the App private key (PEM, raw or base64).                |
| `permissions`     | no       | `contents:read`       | Narrow the minted token to a subset of the App's grant (see below). `inherit` = all. |

## Limiting token permissions

The minted token defaults to **`contents:read`** — the least privilege needed
to clone. This is a deliberate safety floor: even if an org admin grants the App
broader access (say `contents:write`), a token produced by this action stays
read-only, so other steps in the same job can't accidentally push.

```yaml
with:
  friends: org2
  permissions: contents:read # default — explicit here for clarity
```

Request more (still bounded by what the App was granted — you **cannot**
escalate beyond it):

```yaml
with:
  friends: org2
  permissions: |
    contents: read
    pull_requests: read
```

Use the App installation's full grant (no narrowing):

```yaml
with:
  friends: org2
  permissions: inherit
```

Rules:

- Format is comma- or newline-delimited `name:level`; level is `read`, `write`,
  or `admin`.
- Narrowing only ever **reduces** scope. If you request a permission the App was
  never granted, GitHub rejects the token mint — the step fails rather than
  silently downgrading.
- The same `permissions` apply to every owner in `friends`.

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
