/**
 * 脚本面板注册
 *
 * 唯一对外入口：registerScriptPanel(app, plugin)。
 * 由 XdfBaseExtension 在 onload 期间调用（必须同步完成 registerView）。
 */

import type { App, Plugin } from "obsidian";
import { XDF_SCRIPT_PANEL_VIEW, XdfScriptPanelView } from "./XdfScriptPanelView";

export { XDF_SCRIPT_PANEL_VIEW } from "./XdfScriptPanelView";

export function registerScriptPanel(app: App, plugin: Plugin): void {
	plugin.registerView(
		XDF_SCRIPT_PANEL_VIEW,
		(leaf) => new XdfScriptPanelView(leaf),
	);

	plugin.addRibbonIcon("play-circle", "XDF 脚本面板", () => {
		void activateScriptPanel(app);
	});

	plugin.addCommand({
		id: "open-xdf-script-panel",
		name: "打开 XDF 脚本运行面板",
		callback: () => void activateScriptPanel(app),
	});
}

/** 打开（或聚焦）面板；无则新建到右侧栏 */
export async function activateScriptPanel(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(XDF_SCRIPT_PANEL_VIEW);
	if (existing.length > 0) {
		await app.workspace.revealLeaf(existing[0]);
		return;
	}
	const leaf = app.workspace.getRightLeaf(false);
	if (!leaf) return;
	await leaf.setViewState({ type: XDF_SCRIPT_PANEL_VIEW, active: true });
	await app.workspace.revealLeaf(leaf);
}
