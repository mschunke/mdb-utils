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

export type ExportTableResult = {
	saved: boolean;
	outputPath?: string;
	rows?: number;
};

export type ExportAllResult = {
	saved: boolean;
	outputDir?: string;
	files?: { table: string; file: string; rows: number }[];
};

export type RendererApi = {
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

const api: RendererApi = {
	openMdb: () => ipcRenderer.invoke("dialog:openMdb"),
	openMdbPath: (filePath) => ipcRenderer.invoke("mdb:open", filePath),
	getTable: (filePath, tableName) =>
		ipcRenderer.invoke("mdb:getTable", filePath, tableName),
	exportTable: (filePath, tableName, delimiter) =>
		ipcRenderer.invoke("mdb:exportTable", filePath, tableName, delimiter),
	exportAll: (filePath, delimiter) =>
		ipcRenderer.invoke("mdb:exportAll", filePath, delimiter),
	showItem: (p) => ipcRenderer.invoke("shell:showItem", p),
	onMenuOpen: (cb) => {
		const listener = () => cb();
		ipcRenderer.on("menu:open", listener);
		return () => ipcRenderer.removeListener("menu:open", listener);
	},
};

contextBridge.exposeInMainWorld("api", api);
