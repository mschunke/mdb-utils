# Releasing MDB Utils

This document describes how to ship a new version of MDB Utils. The pipeline
is fully automated: bumping the version locally pushes a tag, which triggers
GitHub Actions to build installers for macOS, Windows and Linux, publish them
to a GitHub Release, and refresh the download links shown on the GitHub Pages
site.

---

## TL;DR

```bash
# from a clean main branch
npm run release:patch    # or release:minor / release:major
```

Then watch the **Actions** tab on GitHub. When the `Release` workflow turns
green, the new installers are live on both the
[Releases page](https://github.com/mschunke/mdb-utils/releases/latest) and
the [GitHub Pages site](https://mschunke.github.io/mdb-utils/).

---

## One-time GitHub setup

These only need to be done once per repository. Skip if already configured.

1. **Settings → Actions → General → Workflow permissions**
   → set to **Read and write permissions**. This lets the release workflow
   create releases and upload assets using the built-in `GITHUB_TOKEN`.
2. **Settings → Pages → Build and deployment → Source**
   → set to **GitHub Actions**. The first push to `main` that touches
   `docs/` will then deploy the site.
3. (Optional) Code-signing secrets. Without them, builds run unsigned —
   macOS users see a Gatekeeper prompt the first time they open the app and
   Windows shows a SmartScreen warning. To enable signing later, add:
   - macOS: `CSC_LINK` (base64 `.p12`) and `CSC_KEY_PASSWORD`
   - Windows: `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`

   Then remove the `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` env var from
   `.github/workflows/release.yml`.

---

## Pre-flight checklist

Before bumping a version:

- [ ] You are on the `main` branch.
- [ ] `git status` is clean (no uncommitted or untracked files).
- [ ] `git pull` shows no incoming changes.
- [ ] All PRs intended for this release have been merged.
- [ ] `npm run build` succeeds locally.
- [ ] You have launched the app at least once (`npm run dev`) and smoke-tested
      the change you're releasing.

The bump script will refuse to proceed if the working tree is dirty or you're
not on `main`, but it's faster to catch issues yourself.

---

## Choosing the version number

MDB Utils follows [semver](https://semver.org/):

| Bump      | When to use it                                             | Command                  |
| --------- | ---------------------------------------------------------- | ------------------------ |
| **patch** | Bug fixes, internal refactors, doc changes only            | `npm run release:patch`  |
| **minor** | New backward-compatible features (new export option, etc.) | `npm run release:minor`  |
| **major** | Breaking changes (CLI flag removed, file format changes)   | `npm run release:major`  |

Need an explicit version (e.g. `1.4.0-beta.1`)?
Run the script directly:

```bash
node scripts/bump-version.mjs 1.4.0-beta.1
```

---

## What the bump script does

`scripts/bump-version.mjs` performs the following steps in order:

1. Verifies the working tree is clean and the branch is `main`.
2. Runs `git pull --ff-only` to make sure you're up to date.
3. Runs `npm version <bump>` which:
   - Updates `version` in `package.json` and `package-lock.json`.
   - Creates a commit with message `chore(release): vX.Y.Z`.
   - Creates an annotated git tag `vX.Y.Z`.
4. Pushes both the commit and the tag to `origin`.

If anything fails after step 3 (e.g. push rejected), undo with:

```bash
git tag -d vX.Y.Z
git reset --hard HEAD~1
```

---

## What happens on GitHub

Pushing the `vX.Y.Z` tag triggers `.github/workflows/release.yml`:

1. A matrix job runs on `macos-latest`, `windows-latest` and `ubuntu-latest`.
2. Each runner installs deps with `npm ci` and runs the platform-specific
   `electron-builder` command with `--publish always`.
3. `electron-builder` creates a draft GitHub Release named after the tag
   (the first runner) or appends assets to the existing draft (subsequent
   runners), then publishes it once all assets are uploaded.

Assets produced per platform:

| Platform | Files                                                |
| -------- | ---------------------------------------------------- |
| macOS    | `MDB Utils-X.Y.Z-arm64.dmg`, `…-arm64-mac.zip`, x64 variants |
| Windows  | `MDB Utils Setup X.Y.Z.exe` (NSIS), `MDB Utils X.Y.Z.exe` (portable) |
| Linux    | `MDB Utils-X.Y.Z.AppImage`, `mdb-utils_X.Y.Z_amd64.deb` |

Meanwhile, `.github/workflows/build.yml` runs on every push to `main` (i.e.
on every PR merge) and produces the same installers as **workflow artifacts**
that live for 14 days. Those are useful for testing changes between releases
without cutting a tag.

---

## How GitHub Pages picks up the new version

The Pages site is **not** rebuilt for each release. Instead,
`docs/app.js` calls the GitHub Releases API at runtime:

```
GET https://api.github.com/repos/mschunke/mdb-utils/releases/latest
```

It then:

- Fills in the latest version label in the hero.
- Wires the macOS / Windows / Linux buttons to the most appropriate installer
  for each platform (preferring `.dmg` / `.exe` / `.AppImage`).
- Renders every asset (excluding `.blockmap` and `.yml` metadata) as a
  download card.
- Highlights the button matching the visitor's detected OS.

This means **no Pages redeploy is needed for a new release** — the page picks
up the new release automatically as soon as the Release workflow finishes
publishing.

The Pages site itself only redeploys when files in `docs/` change, via
`.github/workflows/pages.yml`.

> Note on caching: GitHub's API responses can be cached by the user's browser
> for a few minutes. A hard refresh (Cmd/Ctrl-Shift-R) shows the new release
> immediately.

---

## Verifying the release

After the workflow turns green:

1. Open <https://github.com/mschunke/mdb-utils/releases/latest>
   - Check the tag name matches, and that all expected assets are attached.
2. Open <https://mschunke.github.io/mdb-utils/>
   - Confirm the version label shows the new version.
   - Confirm the "Download" buttons point at the new assets.
   - Click the asset for your OS and verify the download starts.
3. (Recommended) On a clean machine or VM, install the artifact and confirm
   the app launches and opens an `.mdb` file.

---

## Hotfix flow

If a release is broken in the wild:

1. Branch off `main`, fix the bug, open a PR, merge.
2. Run `npm run release:patch` to ship the fix.
3. Optionally edit the broken release on GitHub and check **"Set as
   pre-release"** so the Pages site (which queries `/releases/latest`)
   advertises the patched version instead.

---

## Manual / emergency release

If the bump script can't run (e.g. you're releasing from a fork or CI is
down for the script's git operations), you can do it by hand:

```bash
npm version patch -m "chore(release): v%s"
git push && git push --tags
```

Or trigger the release workflow manually from the **Actions** tab using the
**workflow_dispatch** button — useful for re-running a failed release without
bumping the version again.

---

## Rolling back

To remove a bad release:

1. **Actions** → cancel any in-flight runs of the `Release` workflow.
2. **Releases** → edit the release → **Delete**.
3. Delete the tag locally and remotely:
   ```bash
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```
4. (Optional) Revert the version-bump commit on `main` and ship a new patch.
