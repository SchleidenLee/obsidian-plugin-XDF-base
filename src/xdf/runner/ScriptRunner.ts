/**
 * 两段式脚本驱动器
 *
 * 职责：为脚本构造 ScriptContext，并按形态驱动 collect / execute。
 * 不依赖任何 UI：面板与原生弹窗只是两种「答案提供器」。
 *
 * - collect(module, scriptId, answers)：非阻塞跑一轮，返回字段清单 + params
 * - execute(module, scriptId, params)：只干活（此阶段 ctx.ask 会抛错）
 */

import type { App } from "obsidian";
import type {
	CollectSession,
	RunMode,
	ScriptContext,
	ScriptField,
	TwoStageModule,
} from "./types";

/** 字段登记器：collect 每轮新建，去重保序 */
class FieldRegistry {
	readonly fields: ScriptField[] = [];
	private readonly seen = new Set<string>();

	register(field: ScriptField): void {
		if (!field || !field.id || this.seen.has(field.id)) return;
		this.seen.add(field.id);
		this.fields.push(field);
	}
}

/** 同步/异步的答案提供器 */
export type AnswerProvider = (
	field: ScriptField,
) => Promise<string | null> | string | null;
/** 提示出口 */
export type NoticeSink = (message: string) => void;

export class ScriptRunner {
	constructor(private readonly app: App) {}

	/**
	 * 面板：给定当前答案跑一轮 collect。
	 * 不弹窗、不阻塞，可反复重跑（联动 / 值变化时）。
	 */
	async collect(
		module: TwoStageModule,
		scriptId: string,
		answers: Record<string, string>,
		onNotice?: NoticeSink,
	): Promise<CollectSession> {
		if (typeof module.collect !== "function") {
			throw new Error("脚本未实现 collect 段");
		}
		const registry = new FieldRegistry();
		const ctx = this.createCollectContext(
			scriptId,
			registry,
			(field) => {
				const v = answers[field.id];
				if (v !== undefined && v !== null && v !== "") return v;
				return field.defaultValue ?? "";
			},
			onNotice,
			"panel",
		);
		const params = await module.collect(ctx);
		return { fields: registry.fields.slice(), params: { ...(params || {}) } };
	}

	/** 用最终 params 执行（execute 阶段禁止再取输入） */
	async execute(
		module: TwoStageModule,
		scriptId: string,
		params: Record<string, any>,
		onNotice: NoticeSink,
	): Promise<void> {
		if (typeof module.execute !== "function") {
			throw new Error("脚本未实现 execute 段");
		}
		await module.execute(params, this.createExecuteContext(scriptId, onNotice));
	}

	private createCollectContext(
		scriptId: string,
		registry: FieldRegistry,
		provider: AnswerProvider,
		onNotice: NoticeSink | undefined,
		mode: RunMode,
	): ScriptContext {
		return {
			app: this.app,
			mode,
			scriptId,
			ask: async (field: ScriptField) => {
				registry.register(field);
				return await provider(field);
			},
			notice: onNotice ?? (() => undefined),
		};
	}

	private createExecuteContext(
		scriptId: string,
		onNotice: NoticeSink | undefined,
	): ScriptContext {
		return {
			app: this.app,
			mode: "panel",
			scriptId,
			ask: async (field: ScriptField) => {
				throw new Error(
					`execute 阶段禁止调用 ctx.ask()（字段：${field.id}）—— 输入必须在 collect 阶段收集`,
				);
			},
			notice: onNotice ?? (() => undefined),
		};
	}
}
