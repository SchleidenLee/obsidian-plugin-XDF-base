/**
 * XDF 脚本运行面板（ItemView）
 *
 * 常驻右侧栏：选脚本 → 自动解析两段式脚本的 collect 生成表单 → 填参 → 运行。
 *
 * 与运行层解耦：
 * - 本视图只负责「选脚本 / 渲染表单 / 触发运行 / 展示状态」
 * - 参数解析与执行全部委托给 ScriptRunner
 */

import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { AnswerStore } from "../runner/AnswerStore";
import { groupRank } from "../scripts";
import {
	isTwoStageModule,
	loadScriptModule,
} from "../runner/ScriptModuleLoader";
import { ScriptRunner } from "../runner/ScriptRunner";
import type { CollectSession, ScriptField, TwoStageModule } from "../runner/types";
import { PanelFormRenderer } from "./PanelFormRenderer";

export const XDF_SCRIPT_PANEL_VIEW = "xdf-script-panel";

/** 脚本释放目录（与源码 src/xdf/scripts/<分组>/ 一一对应，递归扫描） */
const SCRIPT_DIR = "00.SYSTEM/xdf_base/scripts";

interface LoadedScript {
	id: string;
	path: string;
	title: string;
	category: string;
	module: TwoStageModule;
}

export class XdfScriptPanelView extends ItemView {
	private runner!: ScriptRunner;
	private store!: AnswerStore;

	private scripts: LoadedScript[] = [];
	private activeId: string | null = null;
	private session: CollectSession | null = null;

	private formRenderer: PanelFormRenderer | null = null;
	private selectEl!: HTMLSelectElement;
	private targetEl!: HTMLElement;
	private formEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private runBtnEl!: HTMLButtonElement;

	private lastSchemaKey: string | null = null;
	private recomputeTimer: number | null = null;
	private running = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return XDF_SCRIPT_PANEL_VIEW;
	}

	getDisplayText(): string {
		return "XDF 脚本面板";
	}

	getIcon(): string {
		return "play-circle";
	}

	async onOpen(): Promise<void> {
		this.runner = new ScriptRunner(this.app);
		this.store = new AnswerStore(this.app);

		const root = this.contentEl;
		root.empty();
		root.addClass("xdf-panel-root");

		root.createEl("h4", { text: "XDF 脚本运行面板", cls: "xdf-panel-title" });

		const head = root.createEl("div", { cls: "xdf-panel-head" });
		this.selectEl = head.createEl("select", { cls: "xdf-panel-select" });
		this.selectEl.addEventListener("change", () => {
			void this.selectScript(this.selectEl.value);
		});
		const refreshBtn = head.createEl("button", {
			text: "刷新",
			cls: "xdf-panel-refresh",
		});
		refreshBtn.addEventListener("click", () => void this.reloadScripts());

		this.targetEl = root.createEl("div", { cls: "xdf-panel-target" });
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				this.updateActiveFile(),
			),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.updateActiveFile()),
		);
		this.updateActiveFile();

		this.formEl = root.createEl("div", { cls: "xdf-panel-form" });

		const actions = root.createEl("div", { cls: "xdf-panel-actions" });
		this.runBtnEl = actions.createEl("button", {
			text: "运行",
			cls: "mod-cta xdf-panel-run",
		});
		this.runBtnEl.addEventListener("click", () => void this.runActive());

		this.statusEl = root.createEl("div", { cls: "xdf-panel-status" });

		this.formRenderer = new PanelFormRenderer(this.formEl, {
			onChange: () => this.scheduleRecompute(),
		});

		await this.store.load();
		await this.reloadScripts();
	}

	async onClose(): Promise<void> {
		if (this.recomputeTimer !== null) {
			window.clearTimeout(this.recomputeTimer);
			this.recomputeTimer = null;
		}
		this.contentEl.empty();
	}

	// ========== 活跃文件状态 ==========

	/** 显示脚本将要操作的目标文件（getActiveFile 即前台编辑器文件），完整路径 */
	private updateActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		this.targetEl.empty();
		if (file) {
			this.targetEl.createSpan({ text: "📄" });
			this.targetEl.createSpan({
				text: file.path,
				cls: "xdf-panel-target-path",
			});
			this.targetEl.setAttribute("title", file.path);
		} else {
			this.targetEl.setText("（无活跃笔记）");
			this.targetEl.setAttribute("title", "");
		}
	}

	// ========== 脚本列表 ==========

	private async reloadScripts(): Promise<void> {
		const loaded: LoadedScript[] = [];
		try {
			const files = (await this.listScriptFiles(SCRIPT_DIR)).sort();
			for (const file of files) {
				try {
					const module = await loadScriptModule(this.app, file);
					if (!isTwoStageModule(module)) continue;
					const id = this.idFromPath(file);
					loaded.push({
						id,
						path: file,
						title: module.meta?.title || id,
						category: this.categoryFromPath(file),
						module,
					});
				} catch (err) {
					this.log(`❌ 载入失败 ${file}：${String(err)}`);
				}
			}
		} catch (err) {
			console.error("[XDF-Base] 面板脚本目录读取失败:", err);
		}

		// 分组顺序由 GROUP_ORDER 决定，组内按标题
		loaded.sort(
			(a, b) =>
				groupRank(a.category) - groupRank(b.category) ||
				a.category.localeCompare(b.category, "zh-CN") ||
				a.title.localeCompare(b.title, "zh-CN"),
		);

		this.scripts = loaded;
		this.renderScriptOptions();
	}

	/** 递归列出目录下所有 .js 文件 */
	private async listScriptFiles(dir: string): Promise<string[]> {
		const result: string[] = [];
		let listing: { files: string[]; folders: string[] };
		try {
			listing = await this.app.vault.adapter.list(dir);
		} catch {
			return result;
		}

		for (const file of listing.files || []) {
			if (file.toLowerCase().endsWith(".js")) result.push(file);
		}
		for (const folder of listing.folders || []) {
			result.push(...(await this.listScriptFiles(folder)));
		}

		return result;
	}

	private renderScriptOptions(): void {
		this.selectEl.empty();

		if (this.scripts.length === 0) {
			const opt = this.selectEl.createEl("option", {
				text: "（未发现面板脚本）",
			});
			opt.value = "";
			this.selectEl.disabled = true;
			this.selectEl.value = "";
			this.activeId = null;
			this.session = null;
			this.lastSchemaKey = null;
			this.formRenderer?.render([], {});
			this.setRunEnabled(false);
			return;
		}

		this.selectEl.disabled = false;
		for (const s of this.scripts) {
			const opt = this.selectEl.createEl("option", {
				text: `[${s.category}] ${s.title}`,
			});
			opt.value = s.id;
		}

		const keep =
			this.activeId && this.scripts.some((s) => s.id === this.activeId)
				? this.activeId
				: this.scripts[0].id;
		this.selectEl.value = keep;
		void this.selectScript(keep);
	}

	private idFromPath(path: string): string {
		const base = path.split("/").pop() || path;
		return base.replace(/\.js$/i, "");
	}

	/** 分组 = scripts/ 下的第一层文件夹名 */
	private categoryFromPath(path: string): string {
		const rel = path.startsWith(SCRIPT_DIR + "/")
			? path.slice(SCRIPT_DIR.length + 1)
			: path;
		const parts = rel.split("/");
		return parts.length > 1 ? parts[0] : "其他";
	}

	// ========== 选择与联动 ==========

	private async selectScript(id: string): Promise<void> {
		const script = this.scripts.find((s) => s.id === id);
		if (!script) return;
		this.activeId = id;
		this.statusEl.empty();
		this.lastSchemaKey = null;
		await this.recompute(script, this.store.getAnswers(id));
	}

	private scheduleRecompute(): void {
		if (this.recomputeTimer !== null) window.clearTimeout(this.recomputeTimer);
		this.recomputeTimer = window.setTimeout(() => {
			this.recomputeTimer = null;
			void this.recomputeActive();
		}, 350);
	}

	private async recomputeActive(): Promise<void> {
		const script = this.scripts.find((s) => s.id === this.activeId);
		if (!script || !this.formRenderer) return;
		const values = this.formRenderer.getValues();
		const answers = { ...this.store.getAnswers(script.id), ...values };
		await this.recompute(script, answers);
	}

	/**
	 * 跑一轮 collect。
	 * 仅当字段结构（id/type/options）变化时才重渲染，避免打字时丢失焦点。
	 */
	private async recompute(
		script: LoadedScript,
		answers: Record<string, string>,
	): Promise<void> {
		try {
			const session = await this.runner.collect(
				script.module,
				script.id,
				answers,
			);
			this.session = session;

			const key = this.schemaKey(session.fields);
			if (key !== this.lastSchemaKey) {
				this.lastSchemaKey = key;
				this.formRenderer?.render(session.fields, answers);
			}
			this.setRunEnabled(true);
		} catch (err) {
			this.session = null;
			this.lastSchemaKey = null;
			this.formRenderer?.render([], {});
			this.setRunEnabled(false);
			this.log(`❌ 解析参数失败：${String(err)}`);
		}
	}

	private schemaKey(fields: ScriptField[]): string {
		return fields
			.map(
				(f) =>
					`${f.id}:${f.type}:${(f.options || []).join("|")}:${(
						f.displayOptions || []
					).join("|")}:${f.defaultValue ?? ""}`,
			)
			.join(";");
	}

	// ========== 运行 ==========

	private async runActive(): Promise<void> {
		if (this.running || !this.activeId || !this.formRenderer) return;
		const script = this.scripts.find((s) => s.id === this.activeId);
		if (!script) return;

		const answers = this.formRenderer.getValues();
		this.store.setAnswers(script.id, answers);
		await this.store.save();

		this.running = true;
		this.setRunEnabled(false);
		this.runBtnEl.setText("运行中…");
		this.log(`▶ 开始运行：${script.title}`);

		try {
			// 运行前用最终答案再解析一次，确保 params 与表单一致
			const fresh = await this.runner.collect(
				script.module,
				script.id,
				answers,
			);
			await this.runner.execute(script.module, script.id, fresh.params, (m) =>
				this.log(m),
			);
			this.log("✅ 运行完成");
		} catch (err) {
			const message = (err as Error)?.message || String(err);
			console.error("[XDF-Base] 面板脚本运行失败:", err);
			this.log(`❌ 运行失败：${message}`);
			new Notice("❌ 脚本运行失败：" + message);
		} finally {
			this.running = false;
			this.setRunEnabled(true);
			this.runBtnEl.setText("运行");
		}
	}

	private setRunEnabled(enabled: boolean): void {
		this.runBtnEl.disabled = !enabled;
		this.runBtnEl.toggleClass("is-disabled", !enabled);
	}

	private log(message: string): void {
		const line = this.statusEl.createEl("div", {
			cls: "xdf-panel-status-line",
		});
		const t = new Date().toLocaleTimeString();
		line.setText(`[${t}] ${message}`);
		this.statusEl.scrollTop = this.statusEl.scrollHeight;
	}
}
