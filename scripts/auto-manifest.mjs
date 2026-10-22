/**
 * prebuild 自动清单生成器
 *
 * 扫描源码目录并生成 src/xdf/scripts/manifest.generated.ts：
 *   - src/xdf/scripts/presets/<分组>/<名>.ts → GENERATED_SCRIPTS（释放到 scripts/presets/<分组>/<名>.js）
 *   - src/xdf/scripts/assets/<名>.ts         → GENERATED_ASSETS（释放到 scripts/assets/<名>.js）
 *
 * 统一释放映射（唯一规则）：src/xdf/scripts/<相对路径>/<名>.ts → 00.SYSTEM/xdf_base/scripts/<相对路径>/<名>.js
 *
 * 约定（fail-fast，违例即报错）：
 *   - presets/ 的子目录即分组；预设根级散装 .ts 报错
 *   - assets/ 扁平，出现子目录报错
 *   - 每个文件必须且只能导出一个 `export const XXX_SCRIPT = String.raw\``，缺失或多个报错、导出名跨文件重复报错
 *
 * 生成文件提交进仓库（IDE 可读），每次 build/dev 前重新生成，请勿手改。
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url)); // <仓库根>/scripts
const repoRoot = join(scriptDir, "..");
const scriptsRoot = join(repoRoot, "src", "xdf", "scripts");
const presetsDir = join(scriptsRoot, "presets");
const assetsDir = join(scriptsRoot, "assets");
const outFile = join(scriptsRoot, "manifest.generated.ts");

const EXPORT_RE = /export const ([A-Z][A-Z0-9_]*_SCRIPT) = String\.raw`/g;

/** 从单个 .ts 源码提取唯一的 *_SCRIPT 导出名；缺失/重复即抛错 */
function extractExportName(fileBase, source) {
	const names = [...source.matchAll(EXPORT_RE)].map((m) => m[1]);
	if (names.length === 0) {
		throw new Error(
			`${fileBase}.ts 未找到 "export const XXX_SCRIPT = String.raw\`" 导出（每个脚本/资产文件必须且只能导出一个）`
		);
	}
	if (new Set(names).size !== 1) {
		throw new Error(
			`${fileBase}.ts 导出了多个 XXX_SCRIPT（${names.join("、")}），一个文件只允许一个脚本`
		);
	}
	return names[0];
}

/** 扫描 presets/：子目录即分组，分组根级散装文件报错 */
function scanPresets() {
	const result = [];
	for (const entry of readdirSync(presetsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			throw new Error(
				`presets/ 根级不允许出现散装文件 "${entry.name}"：业务脚本必须放进分组子目录`
			);
		}
		const group = entry.name;
		const groupDir = join(presetsDir, group);
		const files = readdirSync(groupDir, { withFileTypes: true }).filter(
			(f) => f.isFile() && f.name.endsWith(".ts")
		);
		if (files.length === 0) {
			throw new Error(`presets/${group}/ 是空分组目录：要么放脚本，要么删掉目录`);
		}
		for (const f of files) {
			const name = f.name.replace(/\.ts$/, "");
			const source = readFileSync(join(groupDir, f.name), "utf8");
			result.push({
				group,
				name,
				exportName: extractExportName(name, source),
				relImport: `./presets/${group}/${name}`
			});
		}
	}
	return result;
}

/** 扫描 assets/：扁平 .ts，出现子目录报错 */
function scanAssets() {
	const result = [];
	for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
		if (!entry.isFile()) {
			throw new Error(`assets/ 不允许子目录 "${entry.name}"：共享资产一律扁平放置`);
		}
		if (!entry.name.endsWith(".ts")) continue;
		const name = entry.name.replace(/\.ts$/, "");
		const source = readFileSync(join(assetsDir, entry.name), "utf8");
		result.push({
			name,
			exportName: extractExportName(name, source),
			relImport: `./assets/${name}`
		});
	}
	return result;
}

// ---- 扫描 + 查重 ----

const scripts = scanPresets();
const assets = scanAssets();

const dupScript = scripts.find(
	(s, i) => scripts.findIndex((x) => x.exportName === s.exportName) !== i
);
if (dupScript) throw new Error(`脚本导出名重复：${dupScript.exportName}`);
const dupAsset = assets.find(
	(s, i) => assets.findIndex((x) => x.exportName === s.exportName) !== i
);
if (dupAsset) throw new Error(`资产导出名重复：${dupAsset.exportName}`);
if (scripts.length === 0) throw new Error("presets/ 没扫到任何脚本文件");

// ---- 生成 manifest.generated.ts ----

const scriptImports = scripts
	.map((s) => `import { ${s.exportName} } from "${s.relImport}";`)
	.join("\n");
const assetImports = assets
	.map((a) => `import { ${a.exportName} } from "${a.relImport}";`)
	.join("\n");
const scriptEntries = scripts
	.map(
		(s) =>
			`\t{ group: ${JSON.stringify(s.group)}, name: ${JSON.stringify(s.name)}, exportName: ${JSON.stringify(s.exportName)}, content: ${s.exportName} },`
	)
	.join("\n");
const assetEntries = assets
	.map(
		(a) =>
			`\t{ name: ${JSON.stringify(a.name)}, exportName: ${JSON.stringify(a.exportName)}, content: ${a.exportName} },`
	)
	.join("\n");

const header = `/**
 * ⚠️ 由 scripts/auto-manifest.mjs 构建期生成，请勿手改（手改会被下次构建覆盖）。
 *
 * 生成规则（统一释放映射：src/xdf/scripts/<相对路径>/<名>.ts → 00.SYSTEM/xdf_base/scripts/<相对路径>/<名>.js）：
 *   src/xdf/scripts/presets/<分组>/<名>.ts → GENERATED_SCRIPTS（释放 scripts/presets/<分组>/<名>.js）
 *   src/xdf/scripts/assets/<名>.ts         → GENERATED_ASSETS（释放 scripts/assets/<名>.js）
 * 加/删/改脚本：对 presets/、assets/ 里的源文件做增删挪，重新构建即可，无需登记。
 */
`;

const content = `${header}
import type { GeneratedScript, GeneratedAsset } from "./scriptRegistry";

${scriptImports}
${assetImports}

export const GENERATED_SCRIPTS: GeneratedScript[] = [
${scriptEntries}
];

export const GENERATED_ASSETS: GeneratedAsset[] = [
${assetEntries}
];
`;

writeFileSync(outFile, content, "utf8");
console.log(
	`[auto-manifest] 生成 ${scripts.length} 个脚本（${new Set(scripts.map((s) => s.group)).size} 个分组）+ ${assets.length} 个资产 → src/xdf/scripts/manifest.generated.ts`
);
