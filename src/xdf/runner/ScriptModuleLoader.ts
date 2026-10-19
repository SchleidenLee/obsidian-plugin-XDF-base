/**
 * 两段式脚本模块载入器
 *
 * 与 QuickAdd 的 getUserScript 保持一致：源码用 new Function 求值。
 * 区别：不注入 app —— 脚本经 ctx.app 访问 Obsidian，避免与全局耦合。
 */

import type { App } from "obsidian";
import type { TwoStageModule } from "./types";

/** 从 vault 读取脚本源码并求值 */
export async function loadScriptModule(
	app: App,
	path: string,
): Promise<TwoStageModule> {
	const code = await app.vault.adapter.read(path);
	return evaluateScriptSource(code, path);
}

/** 求值一段脚本源码，返回其导出对象 */
export function evaluateScriptSource(
	code: string,
	label = "<script>",
): TwoStageModule {
	const moduleObject: { exports: any } = { exports: {} };
	const factory = new Function("require", "module", "exports", code);
	factory(undefined, moduleObject, moduleObject.exports);

	const exported = moduleObject.exports;
	if (!exported || typeof exported !== "object") {
		throw new Error(
			`脚本未导出对象（两段式脚本需导出 { collect, execute }）：${label}`,
		);
	}
	return exported as TwoStageModule;
}

/** 是否为可被面板驱动的两段式脚本（至少有 collect） */
export function isTwoStageModule(mod: any): mod is TwoStageModule {
	return !!mod && typeof mod === "object" && typeof mod.collect === "function";
}
