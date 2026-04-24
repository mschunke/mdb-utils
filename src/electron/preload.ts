import { contextBridge, ipcRenderer } from "electron";

export type TableInfo = {
	name: string;
	rowCount: number;
	columns: string[];
};

export type FileSummary = {
	filePath: string;
	fileName: string;
	tables: TableInfo[];
};

export type ExportOptions = {
	filePath: string;
	format: "csv" | "json";
	scope: "current" | "all";
	structure: "single" | "multiple";
	tableName?: string;
	delimiter?: string;
	pretty?: boolean;
};

export type ExportResult = {
	saved: boolean;
	outputPath?: string;
	outputDir?: string;
	files?: { table: string; file: string; rows: number }[];
	rows?: number;
};

export type AppInfo = {
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

export type RendererApi = {
	openMdb: () => Promise<FileSummary | null>;
	openMdbPath: (filePath: string) => Promise<FileSummary>;
	getTable: (
		filePath: string,
		tableName: string,
	) => Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;
	exportData: (opts: ExportOptions) => Promise<ExportResult>;
	showItem: (path: string) => Promise<void>;
	openExternal: (url: string) => Promise<void>;
	getAppInfo: () => Promise<AppInfo>;
	onMenuOpen: (cb: () => void) => () => void;
	onMenuAbout: (cb: () => void) => () => void;
};

const api: RendererApi = {
	openMdb: () => ipcRenderer.invoke("dialog:openMdb"),
	openMdbPath: (filePath) => ipcRenderer.invoke("mdb:open", filePath),
	getTable: (filePath, tableName) =>
		ipcRenderer.invoke("mdb:getTable", filePath, tableName),
	exportData: (opts) => ipcRenderer.invoke("mdb:export", opts),
	showItem: (p) => ipcRenderer.invoke("shell:showItem", p),
	openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
	getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
	onMenuOpen: (cb) => {
		const listener = () => cb();
		ipcRenderer.on("menu:open", listener);
		return () => ipcRenderer.removeListener("menu:open", listener);
	},
	onMenuAbout: (cb) => {
		const listener = () => cb();
		ipcRenderer.on("menu:about", listener);
		return () => ipcRenderer.removeListener("menu:about", listener);
	},
};

contextBridge.exposeInMainWorld("api", api);
