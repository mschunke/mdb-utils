#!/usr/bin/env node
// Bumps the version in package.json, commits, tags, and pushes.
// The pushed tag triggers the release workflow on GitHub Actions.
//
// Usage:  node scripts/bump-version.mjs <patch|minor|major|x.y.z>

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VALID = new Set(['patch', 'minor', 'major']);
const arg = process.argv[2];

if (!arg) {
	console.error('Usage: bump-version.mjs <patch|minor|major|x.y.z>');
	process.exit(1);
}

if (!VALID.has(arg) && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(arg)) {
	console.error(`Invalid version argument: ${arg}`);
	process.exit(1);
}

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const shOut = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

// Refuse to run on a dirty tree — version bumps should be atomic.
const status = shOut('git status --porcelain');
if (status) {
	console.error('Working tree is not clean. Commit or stash changes first.');
	process.exit(1);
}

const branch = shOut('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
	console.error(`Refusing to bump version from branch "${branch}". Switch to main.`);
	process.exit(1);
}

sh('git pull --ff-only');

// `npm version` updates package.json + package-lock.json, commits with the
// message "vX.Y.Z" and creates a matching annotated tag.
sh(`npm version ${arg} -m "chore(release): v%s"`);

const pkgPath = resolve(process.cwd(), 'package.json');
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));

console.log(`\nPushing commit and tag v${version}…`);
sh('git push');
sh('git push --tags');

console.log(`\n✔ Released v${version}. The release workflow will now build and publish installers.`);
