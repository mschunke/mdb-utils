#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import {
	getTable,
	openReader,
	rowsToCsv,
	writeCsvFile,
	type Row,
} from "../shared/mdb.js";

const program = new Command();

program
	.name("mdb-utils")
	.description("Utilities for working with Microsoft Access (.mdb) files")
	.version("1.0.0");

program
	.command("list-tables")
	.description("List all table names in the .mdb file")
	.argument("<mdb>", "Path to .mdb file")
	.action(async (mdb: string) => {
		const reader = await openReader(mdb);
		for (const name of reader.getTableNames()) {
			console.log(name);
		}
	});

program
	.command("show")
	.description("Print rows of a table to stdout")
	.argument("<mdb>", "Path to .mdb file")
	.argument("<table>", "Table name")
	.option("-l, --limit <n>", "Limit number of rows", (v) =>
		Number.parseInt(v, 10),
	)
	.option("--json", "Output as JSON instead of table")
	.action(
		async (
			mdb: string,
			tableName: string,
			opts: { limit?: number; json?: boolean },
		) => {
			const reader = await openReader(mdb);
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
		async (
			mdb: string,
			tableName: string,
			output: string,
			opts: { delimiter: string },
		) => {
			const reader = await openReader(mdb);
			const table = getTable(reader, tableName);
			const columns = table.getColumnNames();
			const rows = table.getData() as Row[];
			const csv = rowsToCsv(columns, rows, opts.delimiter);
			writeCsvFile(output, csv);
			console.log(
				`Exported ${rows.length} rows from "${tableName}" to ${output}`,
			);
		},
	);

program
	.command("export-all")
	.description("Export every table to its own CSV file inside a directory")
	.argument("<mdb>", "Path to .mdb file")
	.argument("<outdir>", "Output directory")
	.option("-d, --delimiter <char>", "CSV delimiter", ",")
	.action(async (mdb: string, outdir: string, opts: { delimiter: string }) => {
		const reader = await openReader(mdb);
		const tableNames = reader.getTableNames();
		for (const name of tableNames) {
			const table = reader.getTable(name);
			const columns = table.getColumnNames();
			const rows = table.getData() as Row[];
			const csv = rowsToCsv(columns, rows, opts.delimiter);
			const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_");
			const file = path.join(outdir, `${safe}.csv`);
			writeCsvFile(file, csv);
			console.log(`Exported ${rows.length} rows from "${name}" to ${file}`);
		}
	});

program.parseAsync(process.argv).catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
