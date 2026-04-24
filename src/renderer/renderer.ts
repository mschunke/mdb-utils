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
	onMenuOpen: (cb: () => void) => () => void;
};

declare global {
	interface Window {
		api: RendererApi;
	}
}

const PAGE_SIZE = 500;

const state = {
	summary: null as FileSummary | null,
	currentTable: null as string | null,
	currentColumns: [] as string[],
	currentRows: [] as Record<string, unknown>[],
	page: 0,
	filter: "",
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
	emptyState: $<HTMLDivElement>("#empty-state"),
	tableView: $<HTMLDivElement>("#table-view"),
	currentTableName: $<HTMLHeadingElement>("#current-table-name"),
	currentRowCount: $<HTMLSpanElement>("#current-row-count"),
	currentColCount: $<HTMLSpanElement>("#current-col-count"),
	currentRenderedCount: $<HTMLSpanElement>("#current-rendered-count"),
	gridHead: $<HTMLTableSectionElement>("#data-grid thead"),
	gridBody: $<HTMLTableSectionElement>("#data-grid tbody"),
	pager: $<HTMLDivElement>("#pager"),
	prevPage: $<HTMLButtonElement>("#prev-page"),
	nextPage: $<HTMLButtonElement>("#next-page"),
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
		: tables;
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
		th.textContent = c;
		th.title = c;
		headRow.appendChild(th);
	}
	els.gridHead.appendChild(headRow);

	const total = state.currentRows.length;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	if (state.page >= totalPages) state.page = totalPages - 1;
	const start = state.page * PAGE_SIZE;
	const end = Math.min(start + PAGE_SIZE, total);
	const slice = state.currentRows.slice(start, end);

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

	els.currentRenderedCount.textContent =
		total > PAGE_SIZE
			? `showing ${start + 1}–${end} of ${total.toLocaleString()}`
			: `showing all ${total.toLocaleString()}`;

	if (total > PAGE_SIZE) {
		els.pager.hidden = false;
		els.pageInfo.textContent = `Page ${state.page + 1} of ${totalPages}`;
		els.prevPage.disabled = state.page === 0;
		els.nextPage.disabled = state.page >= totalPages - 1;
	} else {
		els.pager.hidden = true;
	}
}

async function selectTable(name: string): Promise<void> {
	if (!state.summary) return;
	state.currentTable = name;
	state.page = 0;
	renderTableList();
	showLoading(`Loading ${name}…`);
	try {
		const res = await window.api.getTable(state.summary.filePath, name);
		state.currentColumns = res.columns;
		state.currentRows = res.rows;
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
els.prevPage.addEventListener("click", () => {
	if (state.page > 0) {
		state.page--;
		renderGrid();
	}
});
els.nextPage.addEventListener("click", () => {
	state.page++;
	renderGrid();
});

window.api.onMenuOpen(() => void openFile());
