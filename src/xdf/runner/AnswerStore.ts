/**
 * 面板答案持久化
 *
 * 存放于 00.SYSTEM/xdf_base/panel/answers.json，
 * 结构：{ [scriptId]: { [fieldId]: value } }
 *
 * 独立于 QuickAdd 的 data.json，避免污染插件配置；
 * 意外退出后面板重新打开可恢复上次填写内容。
 */

import type { App } from "obsidian";

const ANSWERS_PATH = "00.SYSTEM/xdf_base/panel/answers.json";

export class AnswerStore {
	private data: Record<string, Record<string, string>> = {};
	private loaded = false;

	constructor(private readonly app: App) {}

	/** 首次调用时读取磁盘；失败则从空表开始（不阻塞面板） */
	async load(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		try {
			if (await this.app.vault.adapter.exists(ANSWERS_PATH)) {
				const raw = await this.app.vault.adapter.read(ANSWERS_PATH);
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object") {
					this.data = parsed as Record<string, Record<string, string>>;
				}
			}
		} catch (err) {
			console.error("[XDF-Base] 面板答案读取失败:", err);
			this.data = {};
		}
	}

	getAnswers(scriptId: string): Record<string, string> {
		return { ...(this.data[scriptId] || {}) };
	}

	setAnswers(scriptId: string, answers: Record<string, string>): void {
		this.data[scriptId] = { ...answers };
	}

	async save(): Promise<void> {
		try {
			const dir = ANSWERS_PATH.substring(0, ANSWERS_PATH.lastIndexOf("/"));
			if (!(await this.app.vault.adapter.exists(dir))) {
				await this.app.vault.adapter.mkdir(dir);
			}
			await this.app.vault.adapter.write(
				ANSWERS_PATH,
				JSON.stringify(this.data, null, 2),
			);
		} catch (err) {
			console.error("[XDF-Base] 面板答案写入失败:", err);
		}
	}
}
