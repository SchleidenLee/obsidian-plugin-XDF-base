/**
 * 两段式脚本运行层 · 类型定义
 *
 * 目的：把「脚本要什么输入」与「谁来提供输入」彻底解耦。
 * - 面板模式（panel）：输入来自表单 —— 非阻塞、可反复重跑、可回退改参数
 * - 原生模式（native）：输入来自弹窗 —— 阻塞，保留脚本单独运行的能力
 *
 * 契约见 PENDING.md「脚本运行面板 + 两段式脚本规范」。
 */

import type { App } from "obsidian";
import type { FieldRequirement } from "src/preflight/RequirementCollector";

/** 面板字段：复用 QuickAdd 已有的输入需求描述，避免另造一套字段类型 */
export type ScriptField = FieldRequirement;

/** 运行形态 */
export type RunMode = "panel" | "native";

/** 脚本元信息（可选，供面板显示/分组） */
export interface ScriptMeta {
	title?: string;
	category?: string;
	description?: string;
}

/**
 * 运行上下文：脚本与宿主之间的唯一通道。
 *
 * - app：Obsidian App —— 脚本不得再依赖全局 app
 * - ask：唯一输入入口。collect 阶段调用；execute 阶段禁止调用
 * - notice：唯一反馈出口
 */
export interface ScriptContext {
	app: App;
	mode: RunMode;
	scriptId: string;
	ask(field: ScriptField): Promise<string | null>;
	notice(message: string): void;
}

/** 两段式脚本的导出形状 */
export interface TwoStageModule {
	meta?: ScriptMeta;
	/** 第一阶段：只读、只经 ctx.ask 取输入，返回 params */
	collect?: (ctx: ScriptContext) => Promise<Record<string, any> | void>;
	/** 第二阶段：只从 params 取输入，唯一写盘处 */
	execute?: (
		params: Record<string, any>,
		ctx: ScriptContext,
	) => Promise<void>;
	/** 兼容 QuickAdd 原生 UserScript 入口（可选，非两段式） */
	entry?: (...args: any[]) => Promise<void> | void;
	[key: string]: any;
}

/** collect 一轮的产出 */
export interface CollectSession {
	/** collect 过程中登记到的字段（去重、保序） */
	fields: ScriptField[];
	/** collect 返回的 params（键值来自 ctx.ask 的返回值） */
	params: Record<string, any>;
}

/** 答案表：scriptId → fieldId → 值 */
export type AnswerMap = Record<string, string>;
