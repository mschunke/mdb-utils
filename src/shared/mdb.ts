import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type MDBReaderType from "mdb-reader";

export type Row = Record<string, unknown>;
export type MDBReader = MDBReaderType;

let MDBReaderCtor: typeof MDBReaderType | null = null;

async function loadMdbReader(): Promise<typeof MDBReaderType> {
	if (MDBReaderCtor) return MDBReaderCtor;
	const mod = (await import("mdb-reader")) as
		| { default: typeof MDBReaderType }
		| typeof MDBReaderType;
	MDBReaderCtor =
		(mod as { default?: typeof MDBReaderType }).default ??
		(mod as typeof MDBReaderType);
	return MDBReaderCtor;
}

export async function openReader(mdbPath: string): Promise<MDBReaderType> {
	const Ctor = await loadMdbReader();
	const buffer = readFileSync(path.resolve(mdbPath));
	return new Ctor(buffer);
}

export function formatValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return value.toString("base64");
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function escapeCsv(value: string, delimiter: string): string {
	if (
		value.includes(delimiter) ||
		value.includes('"') ||
		value.includes("\n") ||
		value.includes("\r")
	) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function rowsToCsv(
	columns: string[],
	rows: Row[],
	delimiter = ",",
): string {
	const lines: string[] = [];
	lines.push(columns.map((c) => escapeCsv(c, delimiter)).join(delimiter));
	for (const row of rows) {
		lines.push(
			columns
				.map((c) => escapeCsv(formatValue(row[c]), delimiter))
				.join(delimiter),
		);
	}
	return lines.join("\n");
}

export function getTable(reader: MDBReaderType, name: string) {
	const tables = reader.getTableNames();
	const match =
		tables.find((t) => t === name) ??
		tables.find((t) => t.toLowerCase() === name.toLowerCase());
	if (!match) {
		throw new Error(
			`Table "${name}" not found. Available: ${tables.join(", ")}`,
		);
	}
	return reader.getTable(match);
}

export function writeCsvFile(filePath: string, csv: string): void {
	writeFileSync(path.resolve(filePath), csv, "utf8");
}
