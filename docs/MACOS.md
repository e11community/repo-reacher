# Local Terraform modules on macOS (`git::https://`)

In CI, `repo-reacher` injects a GitHub App token into git so
`git::https://github.com/<owner>/<repo>.git` module sources clone transparently.
On your laptop that step never runs — `terraform init` shells out to `git` over
HTTPS with no credential and fails. This guide gives `git` a credential on macOS
so local `terraform init` pulls private `git::https://` modules.

> Scope: only the `git::https://` module-source case. SSH (`git@github.com:` +
> `~/.ssh`) is a separate path and not covered here.

## 1. Install `gh`

```bash
brew install gh
gh --version
```

## 2. Give git a credential

Pick **one** of the two approaches. Both keep the token **out of plaintext** in
`~/.gitconfig` (in the GitHub keychain entry `gh` manages, or in the macOS
Keychain) — do **not** paste a PAT directly into `~/.gitconfig`.

### Option A — let `gh` configure git (recommended)

```bash
gh auth login        # GitHub.com → HTTPS → authenticate in browser (or paste a PAT)
gh auth setup-git    # registers gh as git's credential helper for github.com
```

This writes to `~/.gitconfig`:

```ini
[credential "https://github.com"]
	helper =
	helper = !/opt/homebrew/bin/gh auth git-credential
```

(The empty first `helper =` resets any inherited helpers so gh's is the only one
for github.com. Path is `/opt/homebrew/bin/gh` on Apple Silicon,
`/usr/local/bin/gh` on Intel.)

git now asks `gh` for the token on every `https://github.com/...` fetch, so
`terraform init` pulls private modules with no further prompts.

### Option B — macOS Keychain helper + PAT (manual)

```bash
git config --global credential.helper osxkeychain
```

`~/.gitconfig`:

```ini
[credential]
	helper = osxkeychain
```

Seed the keychain once with any private repo:

```bash
git clone https://github.com/<owner>/<repo>.git
# Username: <your-github-username>
# Password: <paste your PAT>
```

The PAT is stored in the macOS Keychain (not on disk in a config file) and
reused for all later `https://github.com/...` clones, including go-getter's.

## 3. PAT permissions

For cloning private module repos, the token only needs **read access to
repository contents** — nothing more.

- **Fine-grained PAT** (preferred): Resource owner = the org (e.g.
  `engineering11`); Repository access = the module repos (or _All repositories_);
  Permissions → Repository → **Contents: Read-only**.
- **Classic PAT**: the **`repo`** scope (it's coarse — grants full private-repo
  access; prefer fine-grained).

If you ran `gh auth login` via the browser, `gh` requests the scopes for you —
just ensure private-repo read is granted when prompted.

## 4. Verify

```bash
terraform -chdir=environments/dev/main init   # pulls git::https private modules
# or a direct check:
git clone https://github.com/<owner>/<repo>.git
```

A successful clone/init means git is authenticating over HTTPS correctly.
