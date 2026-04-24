export {};

type TableInfo = {
	name: string;
	rowCount: number;
	columns: string[];
};

type FileSummary = {
	filePath: string;
	fileName: string;
	tables: TableInfo[];
};

type ExportTableResult = {
	saved: boolean;
	outputPath?: string;
	rows?: number;
};

type ExportAllResult = {
	saved: boolean;
	outputDir?: string;
	files?: { table: string; file: string; rows: number }[];
};

type AppInfo = {
	name: string;
	version: string;
	electron: string;
	node: string;
	chrome: string;
	platform: string;
	arch: string;
	repository: string;
	author: string;
	sponsor: { name: string; url: string };
};

type RendererApi = {
	openMdb: () => Promise<FileSummary | null>;
	openMdbPath: (filePath: string) => Promise<FileSummary>;
	getTable: (
		filePath: string,
		tableName: string,
	) => Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;
	exportTable: (
		filePath: string,
		tableName: string,
		delimiter: string,
	) => Promise<ExportTableResult>;
	exportAll: (filePath: string, delimiter: string) => Promise<ExportAllResult>;
	showItem: (path: string) => Promise<void>;
	openExternal: (url: string) => Promise<void>;
	getAppInfo: () => Promise<AppInfo>;
	onMenuOpen: (cb: () => void) => () => void;
	onMenuAbout: (cb: () => void) => () => void;
};

declare global {
	interface Window {
		api: RendererApi;
	}
}

const PAGE_SIZE_DEFAULT = 100;
type PageSize = number | "all";

type TableSort =
	| "original"
	| "name-asc"
	| "name-desc"
	| "rows-asc"
	| "rows-desc";

type SortDir = "asc" | "desc";

const state = {
	summary: null as FileSummary | null,
	currentTable: null as string | null,
	currentColumns: [] as string[],
	currentRows: [] as Record<string, unknown>[],
	derivedRows: [] as Record<string, unknown>[],
	page: 0,
	pageSize: PAGE_SIZE_DEFAULT as PageSize,
	filter: "",
	tableSort: "original" as TableSort,
	rowFilter: "",
	sortColumn: null as string | null,
	sortDir: "asc" as SortDir,
};

const $ = <T extends HTMLElement>(sel: string): T => {
	const el = document.querySelector<T>(sel);
	if (!el) throw new Error(`Missing element: ${sel}`);
	return el;
};

const els = {
	openBtn: $<HTMLButtonElement>("#open-btn"),
	openBtn2: $<HTMLButtonElement>("#open-btn-2"),
	exportCurrent: $<HTMLButtonElement>("#export-current"),
	exportAll: $<HTMLButtonElement>("#export-all"),
	delimiter: $<HTMLSelectElement>("#delimiter"),
	fileName: $<HTMLSpanElement>("#file-name"),
	filePath: $<HTMLSpanElement>("#file-path"),
	tableCount: $<HTMLSpanElement>("#table-count"),
	tableList: $<HTMLUListElement>("#table-list"),
	tableFilter: $<HTMLInputElement>("#table-filter"),
	tableSort: $<HTMLSelectElement>("#table-sort"),
	rowFilter: $<HTMLInputElement>("#row-filter"),
	clearSort: $<HTMLButtonElement>("#clear-sort"),
	emptyState: $<HTMLDivElement>("#empty-state"),
	tableView: $<HTMLDivElement>("#table-view"),
	currentTableName: $<HTMLHeadingElement>("#current-table-name"),
	currentRowCount: $<HTMLSpanElement>("#current-row-count"),
	currentColCount: $<HTMLSpanElement>("#current-col-count"),
	currentRenderedCount: $<HTMLSpanElement>("#current-rendered-count"),
	gridHead: $<HTMLTableSectionElement>("#data-grid thead"),
	gridBody: $<HTMLTableSectionElement>("#data-grid tbody"),
	pager: $<HTMLDivElement>("#pager"),
	pageSize: $<HTMLSelectElement>("#page-size"),
	firstPage: $<HTMLButtonElement>("#first-page"),
	prevPage: $<HTMLButtonElement>("#prev-page"),
	nextPage: $<HTMLButtonElement>("#next-page"),
	lastPage: $<HTMLButtonElement>("#last-page"),
	pageInfo: $<HTMLSpanElement>("#page-info"),
	toast: $<HTMLDivElement>("#toast"),
	loading: $<HTMLDivElement>("#loading"),
	loadingText: $<HTMLDivElement>("#loading-text"),
};

function getDelimiter(): string {
	const v = els.delimiter.value;
	return v === "\\t" ? "\t" : v;
}

function showLoading(text: string): void {
	els.loadingText.textContent = text;
	els.loading.hidden = false;
}

function hideLoading(): void {
	els.loading.hidden = true;
}

let toastTimer: number | undefined;
function showToast(
	message: string,
	kind: "info" | "success" | "error" = "info",
	action?: { label: string; onClick: () => void },
): void {
	els.toast.className = `toast ${kind}`;
	els.toast.textContent = message;
	if (action) {
		const a = document.createElement("a");
		a.textContent = action.label;
		a.addEventListener("click", action.onClick);
		els.toast.appendChild(a);
	}
	els.toast.hidden = false;
	if (toastTimer) window.clearTimeout(toastTimer);
	toastTimer = window.setTimeout(() => {
		els.toast.hidden = true;
	}, 5000);
}

function renderTableList(): void {
	const tables = state.summary?.tables ?? [];
	const filter = state.filter.toLowerCase();
	const filtered = filter
		? tables.filter((t) => t.name.toLowerCase().includes(filter))
		: tables.slice();

	switch (state.tableSort) {
		case "name-asc":
			filtered.sort((a, b) => a.name.localeCompare(b.name));
			break;
		case "name-desc":
			filtered.sort((a, b) => b.name.localeCompare(a.name));
			break;
		case "rows-asc":
			filtered.sort((a, b) => a.rowCount - b.rowCount);
			break;
		case "rows-desc":
			filtered.sort((a, b) => b.rowCount - a.rowCount);
			break;
	}

	els.tableCount.textContent = String(tables.length);
	els.tableList.innerHTML = "";
	for (const t of filtered) {
		const li = document.createElement("li");
		if (t.name === state.currentTable) li.classList.add("active");
		const name = document.createElement("span");
		name.textContent = t.name;
		name.title = t.name;
		const count = document.createElement("span");
		count.className = "row-count";
		count.textContent = `${t.rowCount.toLocaleString()} rows`;
		li.append(name, count);
		li.addEventListener("click", () => {
			void selectTable(t.name);
		});
		els.tableList.appendChild(li);
	}
}

function compareValues(a: unknown, b: unknown): number {
	const aNull = a === null || a === undefined;
	const bNull = b === null || b === undefined;
	if (aNull && bNull) return 0;
	if (aNull) return 1;
	if (bNull) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
	if (typeof a === "boolean" && typeof b === "boolean")
		return a === b ? 0 : a ? 1 : -1;
	const as = String(a);
	const bs = String(b);
	const an = Number(as);
	const bn = Number(bs);
	if (!Number.isNaN(an) && !Number.isNaN(bn) && as !== "" && bs !== "")
		return an - bn;
	return as.localeCompare(bs, undefined, { numeric: true });
}

function recomputeDerivedRows(): void {
	const filter = state.rowFilter.trim().toLowerCase();
	let rows = state.currentRows;
	if (filter) {
		rows = rows.filter((r) => {
			for (const c of state.currentColumns) {
				const v = r[c];
				if (v === null || v === undefined) continue;
				const s = typeof v === "object" ? JSON.stringify(v) : String(v);
				if (s.toLowerCase().includes(filter)) return true;
			}
			return false;
		});
	}
	if (state.sortColumn) {
		const col = state.sortColumn;
		const dir = state.sortDir === "asc" ? 1 : -1;
		rows = rows.slice().sort((a, b) => compareValues(a[col], b[col]) * dir);
	}
	state.derivedRows = rows;
	els.clearSort.disabled = state.sortColumn === null;
}

function renderGrid(): void {
	els.gridHead.innerHTML = "";
	els.gridBody.innerHTML = "";
	const cols = state.currentColumns;
	if (cols.length === 0) return;

	const headRow = document.createElement("tr");
	const numTh = document.createElement("th");
	numTh.className = "row-num";
	numTh.textContent = "#";
	headRow.appendChild(numTh);
	for (const c of cols) {
		const th = document.createElement("th");
		th.classList.add("sortable");
		th.title = `${c} — click to sort`;
		const label = document.createElement("span");
		label.textContent = c;
		const indicator = document.createElement("span");
		indicator.className = "sort-indicator";
		if (state.sortColumn === c) {
			th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
			indicator.textContent = state.sortDir === "asc" ? "▲" : "▼";
		}
		th.append(label, indicator);
		th.addEventListener("click", () => {
			cycleSort(c);
		});
		headRow.appendChild(th);
	}
	els.gridHead.appendChild(headRow);

	const rows = state.derivedRows;
	const total = rows.length;
	const pageSize =
		state.pageSize === "all" ? Math.max(total, 1) : state.pageSize;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	if (state.page >= totalPages) state.page = totalPages - 1;
	if (state.page < 0) state.page = 0;
	const start = state.page * pageSize;
	const end = Math.min(start + pageSize, total);
	const slice = rows.slice(start, end);

	const frag = document.createDocumentFragment();
	for (let i = 0; i < slice.length; i++) {
		const tr = document.createElement("tr");
		const numTd = document.createElement("td");
		numTd.className = "row-num";
		numTd.textContent = String(start + i + 1);
		tr.appendChild(numTd);
		const row = slice[i];
		for (const c of cols) {
			const td = document.createElement("td");
			const v = row[c];
			if (v === null || v === undefined) {
				td.textContent = "NULL";
				td.classList.add("null");
			} else if (typeof v === "object") {
				td.textContent = JSON.stringify(v);
			} else {
				td.textContent = String(v);
			}
			td.title = td.textContent;
			tr.appendChild(td);
		}
		frag.appendChild(tr);
	}
	els.gridBody.appendChild(frag);

	const totalSource = state.currentRows.length;
	const suffix =
		total === totalSource
			? `${total.toLocaleString()}`
			: `${total.toLocaleString()} of ${totalSource.toLocaleString()}`;
	els.currentRenderedCount.textContent =
		total === 0
			? `no rows (${totalSource.toLocaleString()} total)`
			: end - start < total
				? `showing ${start + 1}–${end} of ${suffix}`
				: `showing all ${suffix}`;

	els.pager.hidden = false;
	els.pageInfo.textContent = `Page ${state.page + 1} of ${totalPages}`;
	els.firstPage.disabled = state.page === 0;
	els.prevPage.disabled = state.page === 0;
	els.nextPage.disabled = state.page >= totalPages - 1;
	els.lastPage.disabled = state.page >= totalPages - 1;
}

function lastPageIndex(): number {
	const total = state.derivedRows.length;
	const pageSize =
		state.pageSize === "all" ? Math.max(total, 1) : state.pageSize;
	return Math.max(0, Math.ceil(total / pageSize) - 1);
}

function cycleSort(column: string): void {
	if (state.sortColumn !== column) {
		state.sortColumn = column;
		state.sortDir = "asc";
	} else if (state.sortDir === "asc") {
		state.sortDir = "desc";
	} else {
		state.sortColumn = null;
		state.sortDir = "asc";
	}
	state.page = 0;
	recomputeDerivedRows();
	renderGrid();
}

async function selectTable(name: string): Promise<void> {
	if (!state.summary) return;
	state.currentTable = name;
	state.page = 0;
	state.sortColumn = null;
	state.sortDir = "asc";
	state.rowFilter = "";
	els.rowFilter.value = "";
	renderTableList();
	showLoading(`Loading ${name}…`);
	try {
		const res = await window.api.getTable(state.summary.filePath, name);
		state.currentColumns = res.columns;
		state.currentRows = res.rows;
		recomputeDerivedRows();
		const info = state.summary.tables.find((t) => t.name === name);
		els.currentTableName.textContent = name;
		els.currentRowCount.textContent = `${(info?.rowCount ?? res.rows.length).toLocaleString()} rows`;
		els.currentColCount.textContent = `${res.columns.length} cols`;
		els.emptyState.hidden = true;
		els.tableView.hidden = false;
		els.exportCurrent.disabled = false;
		renderGrid();
	} catch (err) {
		showToast(
			`Failed to load table: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	} finally {
		hideLoading();
	}
}

async function openFile(): Promise<void> {
	showLoading("Reading database…");
	try {
		const summary = await window.api.openMdb();
		if (!summary) return;
		state.summary = summary;
		state.currentTable = null;
		state.currentColumns = [];
		state.currentRows = [];
		els.fileName.textContent = summary.fileName;
		els.filePath.textContent = summary.filePath;
		els.exportAll.disabled = summary.tables.length === 0;
		els.exportCurrent.disabled = true;
		els.emptyState.hidden = false;
		els.tableView.hidden = true;
		renderTableList();
		if (summary.tables.length > 0) {
			await selectTable(summary.tables[0].name);
		}
	} catch (err) {
		showToast(
			`Failed to open file: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	} finally {
		hideLoading();
	}
}

async function exportCurrent(): Promise<void> {
	if (!state.summary || !state.currentTable) return;
	showLoading("Exporting CSV…");
	try {
		const res = await window.api.exportTable(
			state.summary.filePath,
			state.currentTable,
			getDelimiter(),
		);
		if (res.saved && res.outputPath) {
			showToast(
				`Exported ${res.rows?.toLocaleString() ?? 0} rows to ${res.outputPath}`,
				"success",
				{
					label: "Reveal",
					onClick: () => void window.api.showItem(res.outputPath ?? ""),
				},
			);
		}
	} catch (err) {
		showToast(
			`Export failed: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	} finally {
		hideLoading();
	}
}

async function exportAll(): Promise<void> {
	if (!state.summary) return;
	showLoading("Exporting all tables…");
	try {
		const res = await window.api.exportAll(
			state.summary.filePath,
			getDelimiter(),
		);
		if (res.saved && res.outputDir && res.files) {
			showToast(
				`Exported ${res.files.length} tables to ${res.outputDir}`,
				"success",
				{
					label: "Open folder",
					onClick: () =>
						void window.api.showItem(
							res.files?.[0]?.file ?? res.outputDir ?? "",
						),
				},
			);
		}
	} catch (err) {
		showToast(
			`Export failed: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	} finally {
		hideLoading();
	}
}

els.openBtn.addEventListener("click", () => void openFile());
els.openBtn2.addEventListener("click", () => void openFile());
els.exportCurrent.addEventListener("click", () => void exportCurrent());
els.exportAll.addEventListener("click", () => void exportAll());
els.tableFilter.addEventListener("input", () => {
	state.filter = els.tableFilter.value;
	renderTableList();
});
els.tableSort.addEventListener("change", () => {
	state.tableSort = els.tableSort.value as TableSort;
	renderTableList();
});
els.rowFilter.addEventListener("input", () => {
	state.rowFilter = els.rowFilter.value;
	state.page = 0;
	recomputeDerivedRows();
	renderGrid();
});
els.clearSort.addEventListener("click", () => {
	state.sortColumn = null;
	state.sortDir = "asc";
	state.page = 0;
	recomputeDerivedRows();
	renderGrid();
});
els.prevPage.addEventListener("click", () => {
	if (state.page > 0) {
		state.page--;
		renderGrid();
	}
});
els.nextPage.addEventListener("click", () => {
	if (state.page < lastPageIndex()) {
		state.page++;
		renderGrid();
	}
});
els.firstPage.addEventListener("click", () => {
	if (state.page !== 0) {
		state.page = 0;
		renderGrid();
	}
});
els.lastPage.addEventListener("click", () => {
	const last = lastPageIndex();
	if (state.page !== last) {
		state.page = last;
		renderGrid();
	}
});
els.pageSize.addEventListener("change", () => {
	const v = els.pageSize.value;
	state.pageSize = v === "all" ? "all" : Number.parseInt(v, 10);
	state.page = 0;
	renderGrid();
});

window.api.onMenuOpen(() => void openFile());

const aboutModal = $<HTMLDivElement>("#about-modal");
const aboutVersion = $<HTMLSpanElement>("#about-version");
const aboutRuntime = $<HTMLDivElement>("#about-runtime");
const aboutClose = $<HTMLButtonElement>("#about-close");
const aboutBtn = $<HTMLButtonElement>("#about-btn");

let aboutInfoLoaded = false;
async function openAbout(): Promise<void> {
	if (!aboutInfoLoaded) {
		try {
			const info = await window.api.getAppInfo();
			aboutVersion.textContent = info.version;
			aboutRuntime.textContent = `Electron ${info.electron} · Node ${info.node} · ${info.platform}/${info.arch}`;
			aboutInfoLoaded = true;
		} catch {
			aboutVersion.textContent = "unknown";
		}
	}
	aboutModal.hidden = false;
}

function closeAbout(): void {
	aboutModal.hidden = true;
}

aboutBtn.addEventListener("click", () => void openAbout());
aboutClose.addEventListener("click", closeAbout);
aboutModal.addEventListener("click", (e) => {
	if (e.target === aboutModal) closeAbout();
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && !aboutModal.hidden) closeAbout();
});
document.addEventListener("click", (e) => {
	const target = e.target as HTMLElement | null;
	if (!target) return;
	const link = target.closest<HTMLElement>("[data-href]");
	if (!link) return;
	const href = link.getAttribute("data-href");
	if (href) {
		e.preventDefault();
		void window.api.openExternal(href);
	}
});

window.api.onMenuAbout(() => void openAbout());
