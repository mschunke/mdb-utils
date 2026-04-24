#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import MDBReader from "mdb-reader";

type Row = Record<string, unknown>;

function openReader(mdbPath: string): MDBReader {
	const buffer = readFileSync(path.resolve(mdbPath));
	return new MDBReader(buffer);
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return value.toString("base64");
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function escapeCsv(value: string, delimiter: string): string {
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

function rowsToCsv(columns: string[], rows: Row[], delimiter = ","): string {
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

function getTable(reader: MDBReader, name: string) {
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

const program = new Command();

program
	.name("mdb-utils")
	.description("Utilities for working with Microsoft Access (.mdb) files")
	.version("1.0.0");

program
	.command("list-tables")
	.description("List all table names in the .mdb file")
	.argument("<mdb>", "Path to .mdb file")
	.action((mdb: string) => {
		const reader = openReader(mdb);
		for (const name of reader.getTableNames()) {
			console.log(name);
		}
	});

program
	.command("show")
	.description("Print rows of a table to stdout")
	.argument("<mdb>", "Path to .mdb file")
	.argument("<table>", "Table name")
	.option("-l, --limit <n>", "Limit number of rows", (v) => parseInt(v, 10))
	.option("--json", "Output as JSON instead of table")
	.action(
		(
			mdb: string,
			tableName: string,
			opts: { limit?: number; json?: boolean },
		) => {
			const reader = openReader(mdb);
			const table = getTable(reader, tableName);
			let rows = table.getData() as Row[];
			if (opts.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);
			if (opts.json) {
				console.log(JSON.stringify(rows, null, 2));
			} else {
				console.table(rows);
			}
		},
	);

program
	.command("export")
	.description("Export a single table to a CSV file")
	.argument("<mdb>", "Path to .mdb file")
	.argument("<table>", "Table name")
	.argument("<output>", "Output CSV file path")
	.option("-d, --delimiter <char>", "CSV delimiter", ",")
	.action(
		(
			mdb: string,
			tableName: string,
			output: string,
			opts: { delimiter: string },
		) => {
			const reader = openReader(mdb);
			const table = getTable(reader, tableName);
			const columns = table.getColumnNames();
			const rows = table.getData() as Row[];
			const csv = rowsToCsv(columns, rows, opts.delimiter);
			writeFileSync(path.resolve(output), csv, "utf8");
			console.log(
				`Exported ${rows.length} rows from "${tableName}" to ${output}`,
			);
		},
	);

program
	.command("export-all")
	.description(
		"Export all tables to a single CSV file (with a __table__ column)",
	)
	.argument("<mdb>", "Path to .mdb file")
	.argument("<output>", "Output CSV file path")
	.option("-d, --delimiter <char>", "CSV delimiter", ",")
	.action((mdb: string, output: string, opts: { delimiter: string }) => {
		const reader = openReader(mdb);
		const tableNames = reader.getTableNames();
		const allColumns = new Set<string>();
		const collected: { table: string; row: Row }[] = [];

		for (const name of tableNames) {
			const table = reader.getTable(name);
			for (const col of table.getColumnNames()) allColumns.add(col);
			for (const row of table.getData() as Row[]) {
				collected.push({ table: name, row });
			}
		}

		const columns = ["__table__", ...allColumns];
		const rows: Row[] = collected.map(({ table, row }) => ({
			__table__: table,
			...row,
		}));
		const csv = rowsToCsv(columns, rows, opts.delimiter);
		writeFileSync(path.resolve(output), csv, "utf8");
		console.log(
			`Exported ${rows.length} rows from ${tableNames.length} tables to ${output}`,
		);
	});

program.parseAsync(process.argv).catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
