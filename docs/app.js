// Pulls the latest release info from the GitHub API and wires up
// download links + asset list. Falls back to the releases page on error.
(function () {
	const REPO = 'mschunke/mdb-utils';
	const RELEASES_URL = `https://github.com/${REPO}/releases`;
	const LATEST_URL = `${RELEASES_URL}/latest`;
	const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

	document.getElementById('year').textContent = new Date().getFullYear();

	const versionEl = document.getElementById('latest-version');
	const assetsEl = document.getElementById('assets');
	const macBtn = document.getElementById('download-mac');
	const winBtn = document.getElementById('download-win');
	const linuxBtn = document.getElementById('download-linux');

	function detectPlatform() {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes('mac')) return 'mac';
		if (ua.includes('win')) return 'win';
		if (ua.includes('linux')) return 'linux';
		return null;
	}

	function classify(name) {
		const n = name.toLowerCase();
		if (n.endsWith('.dmg') || n.endsWith('-mac.zip')) return 'mac';
		if (n.endsWith('.exe')) return 'win';
		if (n.endsWith('.appimage') || n.endsWith('.deb') || n.endsWith('.rpm'))
			return 'linux';
		return 'other';
	}

	function formatSize(bytes) {
		if (!bytes) return '';
		const mb = bytes / (1024 * 1024);
		return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
	}

	function pickPrimary(assets, platform) {
		const matches = assets.filter((a) => classify(a.name) === platform);
		if (!matches.length) return null;
		// Prefer dmg/exe/AppImage installers over zips/portables.
		const ranked = [...matches].sort((a, b) => {
			const score = (n) => {
				const x = n.toLowerCase();
				if (x.endsWith('.dmg')) return 0;
				if (x.endsWith('.exe')) return 0;
				if (x.endsWith('.appimage')) return 0;
				if (x.endsWith('.deb')) return 1;
				return 2;
			};
			return score(a.name) - score(b.name);
		});
		return ranked[0];
	}

	function setBtn(btn, asset) {
		if (!asset) return;
		btn.href = asset.browser_download_url;
	}

	function render(release) {
		versionEl.textContent = release.tag_name || release.name || 'unknown';

		const assets = (release.assets || []).filter(
			(a) => !a.name.endsWith('.blockmap') && !a.name.endsWith('.yml'),
		);

		setBtn(macBtn, pickPrimary(assets, 'mac'));
		setBtn(winBtn, pickPrimary(assets, 'win'));
		setBtn(linuxBtn, pickPrimary(assets, 'linux'));

		// Highlight the current platform's button.
		const platform = detectPlatform();
		[macBtn, winBtn, linuxBtn].forEach((b) => b.classList.remove('primary'));
		const primary =
			platform === 'mac' ? macBtn : platform === 'win' ? winBtn : platform === 'linux' ? linuxBtn : macBtn;
		primary.classList.add('primary');

		if (!assets.length) {
			assetsEl.innerHTML = `<p class="muted">No assets attached to the latest release. <a href="${RELEASES_URL}">See all releases</a>.</p>`;
			return;
		}

		const order = { mac: 0, win: 1, linux: 2, other: 3 };
		assets.sort((a, b) => order[classify(a.name)] - order[classify(b.name)]);

		assetsEl.innerHTML = assets
			.map((a) => {
				const platformLabel =
					{ mac: 'macOS', win: 'Windows', linux: 'Linux', other: 'Other' }[
						classify(a.name)
					] || 'Other';
				return `
					<a class="asset" href="${a.browser_download_url}">
						<span class="name">${a.name}</span>
						<span class="meta">${platformLabel} · ${formatSize(a.size)}</span>
					</a>
				`;
			})
			.join('');
	}

	function fallback() {
		versionEl.innerHTML = `<a href="${LATEST_URL}">see latest</a>`;
		[macBtn, winBtn, linuxBtn].forEach((b) => (b.href = LATEST_URL));
		assetsEl.innerHTML = `<p class="muted">Could not load releases automatically. <a href="${RELEASES_URL}">Browse releases on GitHub →</a></p>`;
	}

	fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } })
		.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
		.then(render)
		.catch(fallback);
})();
