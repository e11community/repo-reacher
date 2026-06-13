# Admin setup

One-time, org-admin tasks for this repository: creating it in the org and protecting the
default branch. Everything here uses the [`gh`](https://cli.github.com/) CLI.

## Prerequisites

- `gh auth status` shows you authenticated, with **org-admin / repo-admin** rights (creating
  repos and writing rulesets both require admin).
- `gh` talks to GitHub over its own token — it does **not** use the `e11.github.com` SSH host
  alias from local git config (see [MACOS.md](MACOS.md)). Those are independent.

## 1. Create the repo in the org

```bash
ORG=e11community
REPO=repo-reacher
DESC="Authorize git to clone private repositories across one or more orgs using a GitHub App."

gh repo create "$ORG/$REPO" --private --description "$DESC"
```

(Already done for this repo — kept here so re-creating an equivalent action is one command.)

## 2. Protect the default branch (block deletion + force-push)

This is the **lightweight** protection we want: it prevents accidental deletion of `main` and
prevents history rewrites (force-push), but does **not** require pull requests or status checks
— so the [`release`](../.github/workflows/release.yml) workflow can still push its
`chore(release)` commit directly with the built-in `GITHUB_TOKEN`, no PAT needed.

We use a **ruleset** (the modern API) rather than classic branch protection: it maps exactly to
these two rules, and it can be created even before the branch exists.

```bash
ORG=e11community
REPO=repo-reacher

gh api -X POST "repos/$ORG/$REPO/rulesets" --input - <<'JSON'
{
  "name": "default-branch-guard",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
```

- `deletion` → cannot delete `main`.
- `non_fast_forward` → cannot force-push `main`.

Verify:

```bash
gh api "repos/$ORG/$REPO/rulesets" --jq '.[].name'
```

### Why this does NOT break releases or the `v1` tag move

- **Release commit:** the workflow pushes a normal **fast-forward** commit to `main` — not a
  force-push — so `non_fast_forward` never trips.
- **Major-tag move (`v1`):** `vMAJOR` is a **tag**, not a branch. Branch rules
  (`target: branch`) never apply to `refs/tags/*`, so force-moving `v1` keeps working. The only
  thing that would block it is an explicit **tag** ruleset (`target: tag`) matching `v*` — which
  we deliberately do not create.

### If you later want stricter protection

Adding **Require a pull request before merging** (or required status checks / signed commits)
will block the workflow's direct push. To keep auto-release working you'd then either:

1. add the `github-actions` bot to the ruleset's **bypass list**, or
2. push the release commit with a **GitHub App token** (or fine-grained PAT) that has bypass, or
3. switch to a release-PR model.
