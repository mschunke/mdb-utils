import { mkdirSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import {
	getTable,
	openReader,
	rowsToCsv,
	writeCsvFile,
	type Row,
} from "../shared/mdb.js";

const rendererDir = path.join(__dirname, "..", "renderer");

function resolveIconPath(): string | undefined {
	const iconName =
		process.platform === "win32"
			? "icon.ico"
			: process.platform === "darwin"
				? "icon.icns"
				: "icon.png";
	const candidates = [
		path.join(process.resourcesPath ?? "", "build", iconName),
		path.join(__dirname, "..", "..", "build", iconName),
		path.join(__dirname, "..", "..", "..", "build", iconName),
	];
	for (const candidate of candidates) {
		try {
			require("node:fs").accessSync(candidate);
			return candidate;
		} catch {}
	}
	return undefined;
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
	const iconPath = resolveIconPath();
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		title: "MDB Utils",
		backgroundColor: "#1e1e1e",
		...(iconPath ? { icon: iconPath } : {}),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			sandbox: false,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow.loadFile(path.join(rendererDir, "index.html"));

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

function buildMenu(): void {
	const isMac = process.platform === "darwin";
	const template: Electron.MenuItemConstructorOptions[] = [
		...(isMac
			? [
					{
						label: app.name,
						submenu: [
							{ role: "about" as const },
							{ type: "separator" as const },
							{ role: "services" as const },
							{ type: "separator" as const },
							{ role: "hide" as const },
							{ role: "hideOthers" as const },
							{ role: "unhide" as const },
							{ type: "separator" as const },
							{ role: "quit" as const },
						],
					},
				]
			: []),
		{
			label: "File",
			submenu: [
				{
					label: "Open .mdb…",
					accelerator: "CmdOrCtrl+O",
					click: () => mainWindow?.webContents.send("menu:open"),
				},
				{ type: "separator" },
				isMac ? { role: "close" } : { role: "quit" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{ role: "windowMenu" },
		{
			role: "help",
			submenu: [
				{
					label: "About MDB Utils",
					click: () => mainWindow?.webContents.send("menu:about"),
				},
				{
					label: "GitHub Repository",
					click: () =>
						void shell.openExternal("https://github.com/mschunke/mdb-utils"),
				},
			],
		},
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

type FileSummary = {
	filePath: string;
	fileName: string;
	tables: { name: string; rowCount: number; columns: string[] }[];
};

ipcMain.handle("dialog:openMdb", async (): Promise<FileSummary | null> => {
	if (!mainWindow) return null;
	const result = await dialog.showOpenDialog(mainWindow, {
		title: "Open Microsoft Access database",
		properties: ["openFile"],
		filters: [
			{ name: "Access Database", extensions: ["mdb", "accdb"] },
			{ name: "All Files", extensions: ["*"] },
		],
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	return readSummary(result.filePaths[0]);
});

ipcMain.handle(
	"mdb:open",
	async (_evt, filePath: string): Promise<FileSummary> => {
		return readSummary(filePath);
	},
);

ipcMain.handle(
	"mdb:getTable",
	async (
		_evt,
		filePath: string,
		tableName: string,
	): Promise<{ columns: string[]; rows: Row[] }> => {
		const reader = await openReader(filePath);
		const table = getTable(reader, tableName);
		const columns = table.getColumnNames();
		const rows = serializeRows(table.getData() as Row[]);
		return { columns, rows };
	},
);

ipcMain.handle(
	"mdb:exportTable",
	async (
		_evt,
		filePath: string,
		tableName: string,
		delimiter: string,
	): Promise<{ saved: boolean; outputPath?: string; rows?: number }> => {
		if (!mainWindow) return { saved: false };
		const safe = tableName.replace(/[^A-Za-z0-9._-]+/g, "_");
		const result = await dialog.showSaveDialog(mainWindow, {
			title: `Export "${tableName}" to CSV`,
			defaultPath: `${safe}.csv`,
			filters: [{ name: "CSV", extensions: ["csv"] }],
		});
		if (result.canceled || !result.filePath) return { saved: false };

		const reader = await openReader(filePath);
		const table = getTable(reader, tableName);
		const columns = table.getColumnNames();
		const rows = table.getData() as Row[];
		const csv = rowsToCsv(columns, rows, delimiter || ",");
		writeCsvFile(result.filePath, csv);
		return { saved: true, outputPath: result.filePath, rows: rows.length };
	},
);

ipcMain.handle(
	"mdb:exportAll",
	async (
		_evt,
		filePath: string,
		delimiter: string,
	): Promise<{
		saved: boolean;
		outputDir?: string;
		files?: { table: string; file: string; rows: number }[];
	}> => {
		if (!mainWindow) return { saved: false };
		const result = await dialog.showOpenDialog(mainWindow, {
			title: "Choose folder for CSV exports",
			properties: ["openDirectory", "createDirectory"],
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { saved: false };
		}
		const outDir = result.filePaths[0];
		mkdirSync(outDir, { recursive: true });

		const reader = await openReader(filePath);
		const tableNames = reader.getTableNames();
		const files: { table: string; file: string; rows: number }[] = [];
		for (const name of tableNames) {
			const table = reader.getTable(name);
			const columns = table.getColumnNames();
			const rows = table.getData() as Row[];
			const csv = rowsToCsv(columns, rows, delimiter || ",");
			const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_");
			const file = path.join(outDir, `${safe}.csv`);
			writeCsvFile(file, csv);
			files.push({ table: name, file, rows: rows.length });
		}
		return { saved: true, outputDir: outDir, files };
	},
);

ipcMain.handle("shell:showItem", async (_evt, fullPath: string) => {
	shell.showItemInFolder(fullPath);
});

ipcMain.handle("shell:openExternal", async (_evt, url: string) => {
	if (/^https?:\/\//i.test(url)) {
		await shell.openExternal(url);
	}
});

ipcMain.handle("app:getInfo", async () => {
	return {
		name: "MDB Utils",
		version: app.getVersion(),
		electron: process.versions.electron,
		node: process.versions.node,
		chrome: process.versions.chrome,
		platform: process.platform,
		arch: process.arch,
		repository: "https://github.com/mschunke/mdb-utils",
		author: "Murilo Schünke",
		sponsor: { name: "Intercode", url: "https://intercode.dev" },
	};
});

function readSummary(filePath: string): Promise<FileSummary> {
	return openReader(filePath).then((reader) => {
		const tables = reader.getTableNames().map((name) => {
			const table = reader.getTable(name);
			return {
				name,
				rowCount: table.rowCount,
				columns: table.getColumnNames(),
			};
		});
		return {
			filePath,
			fileName: path.basename(filePath),
			tables,
		};
	});
}

function serializeRows(rows: Row[]): Row[] {
	return rows.map((r) => {
		const out: Row = {};
		for (const [k, v] of Object.entries(r)) {
			if (v instanceof Date) out[k] = v.toISOString();
			else if (Buffer.isBuffer(v)) out[k] = `<binary ${v.length} bytes>`;
			else out[k] = v as unknown;
		}
		return out;
	});
}

app.whenReady().then(() => {
	if (process.platform === "darwin" && app.dock) {
		const iconPath = resolveIconPath();
		if (iconPath) {
			try {
				app.dock.setIcon(iconPath);
			} catch {}
		}
	}
	buildMenu();
	createWindow();
});

app.on("window-all-closed", () => {
	app.quit();
});
