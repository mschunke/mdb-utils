import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "src", "renderer");
const outDir = join(__dirname, "..", "dist", "renderer");

const exts = new Set([".html", ".css", ".svg", ".png", ".ico"]);

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			walk(full);
			continue;
		}
		const dot = entry.lastIndexOf(".");
		const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : "";
		if (!exts.has(ext)) continue;
		const rel = relative(srcDir, full);
		const dest = join(outDir, rel);
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(full, dest);
		console.log(`copied ${rel}`);
	}
}

mkdirSync(outDir, { recursive: true });
walk(srcDir);
