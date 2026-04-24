# MDB Utils

Desktop & CLI utilities for working with Microsoft Access (`.mdb` / `.accdb`) files.

- Browse tables and rows in a native desktop UI (Electron).
- Export individual tables or all tables to CSV.
- Use the same engine from the command line.

## Downloads

Pre-built installers for macOS, Windows and Linux are published on the
[Releases page](https://github.com/mschunke/mdb-utils/releases/latest), and
can also be downloaded from the project's
[GitHub Pages site](https://mschunke.github.io/mdb-utils/).

## Development

```bash
npm install
npm run dev          # build + launch Electron
npm run cli -- --help
```

### Building installers locally

```bash
npm run dist:mac     # macOS (.dmg + .zip, x64 + arm64)
npm run dist:win     # Windows (NSIS + portable)
npm run dist:linux   # Linux (AppImage + deb)
```

## Releasing

Version bumps are handled via npm scripts. They update `package.json`,
commit, create a `vX.Y.Z` tag and push everything — which triggers the
release workflow that builds and uploads installers to a GitHub Release.

```bash
npm run release:patch   # 1.0.0 -> 1.0.1
npm run release:minor   # 1.0.0 -> 1.1.0
npm run release:major   # 1.0.0 -> 2.0.0
```

## CI

- Every push to `main` (e.g. after a PR merge) builds the app on macOS,
  Windows and Linux and uploads the installers as workflow artifacts.
- Every `v*` tag push creates a GitHub Release with installers attached.
- The `docs/` folder is published to GitHub Pages on every push to `main`.

## License

ISC
