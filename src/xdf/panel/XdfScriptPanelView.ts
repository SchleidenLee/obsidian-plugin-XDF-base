/**
 * XDF 脚本运行面板（ItemView）
 *
 * 常驻右侧栏：折叠分组菜单选脚本 → 自动解析两段式脚本的 collect 生成表单 → 填参 → 运行。
 * 扫描根 = 内置 presets（写死）+ 设置页自定义来源；根名不作分组，分组 = 根内第一层子目录名。
 *
 * 与运行层解耦：
 * - 本视图只负责「选脚本 / 渲染表单 / 触发运行 / 展示状态」
 * - 参数解析与执行全部委托给 ScriptRunner
 */

import { ItemView, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import { AnswerStore } from "../runner/AnswerStore";
import { groupRank } from "../scripts/scriptRegistry";
import {
	isTwoStageModule,
	loadScriptModule,
} from "../runner/ScriptModuleLoader";
import { ScriptRunner } from "../runner/ScriptRunner";
import type { CollectSession, ScriptField, TwoStageModule } from "../runner/types";
import { PanelFormRenderer } from "./PanelFormRenderer";

export const XDF_SCRIPT_PANEL_VIEW = "xdf-script-panel";

/** 内置扫描根（写死不可关）：对应源码 src/xdf/scripts/presets/<分组>/；根名本身不作分组 */
const PRESET_ROOT = "00.SYSTEM/xdf_base/scripts/presets";

/** QuickAdd（本插件本体）运行时设置的最小结构：xdf 与宿主同插件，但不 import 宿主模块，避免循环依赖 */
interface QuickAddHostLike {
	settings?: { xdfPanelScriptSources?: unknown };
}

/** 宿主插件 id（manifest.json） */
const HOST_PLUGIN_ID = "xdf-base";

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
	private listEl!: HTMLElement;
	/** 全量选择界面内各组的收起状态（打开选择器时默认全展开，点组头收起） */
	private collapsedGroups = new Set<string>();
	/** 两段式开关：false=收起（只显示选中脚本的触发条），true=全量选择界面 */
	private pickerOpen = false;
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
		const refreshBtn = head.createEl("button", {
			text: "刷新",
			cls: "xdf-panel-refresh",
		});
		refreshBtn.addEventListener("click", () => void this.reloadScripts());

		this.listEl = root.createEl("div", { cls: "xdf-panel-tree" });

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

	/** 扫描根：内置 presets（写死、最先扫 = 同名优先）+ 设置页自定义来源 */
	private getScanRoots(): string[] {
		const settings = (
			this.app as unknown as {
				plugins?: {
					plugins?: Record<string, QuickAddHostLike>;
				};
			}
		).plugins?.plugins?.[HOST_PLUGIN_ID]?.settings;
		const custom = Array.isArray(settings?.xdfPanelScriptSources)
			? (settings!.xdfPanelScriptSources as unknown[])
					.map((v) => (typeof v === "string" ? v.trim() : ""))
					.filter((v) => v.length > 0)
			: [];
		return [PRESET_ROOT, ...custom];
	}

	/**
	 * 分组 = 相对扫描根的第一层子目录名；根级散装 .js 归「其他」。
	 * 扫描根名（presets / 自定义目录名）本身永不显示。
	 */
	private categoryFromPath(root: string, path: string): string {
		const rel = path.startsWith(root + "/")
			? path.slice(root.length + 1)
			: path;
		const parts = rel.split("/");
		return parts.length > 1 ? parts[0] : "其他";
	}

	private async reloadScripts(): Promise<void> {
		const loaded: LoadedScript[] = [];
		const seenIds = new Set<string>();

		for (const root of this.getScanRoots()) {
			const files = (await this.listScriptFiles(root)).sort();
			for (const file of files) {
				const id = this.idFromPath(file);
				if (seenIds.has(id)) continue; // presets（先扫）优先，重名跳过
				try {
					const module = await loadScriptModule(this.app, file);
					if (!isTwoStageModule(module)) continue;
					seenIds.add(id);
					loaded.push({
						id,
						path: file,
						title: module.meta?.title || id,
						category: this.categoryFromPath(root, file),
						module,
					});
				} catch (err) {
					this.log(`❌ 载入失败 ${file}：${String(err)}`);
				}
			}
		}

		// 分组顺序由 GROUP_ORDER 决定，组内按标题
		loaded.sort(
			(a, b) =>
				groupRank(a.category) - groupRank(b.category) ||
				a.category.localeCompare(b.category, "zh-CN") ||
				a.title.localeCompare(b.title, "zh-CN"),
		);

		this.scripts = loaded;
		if (!this.activeId || !loaded.some((s) => s.id === this.activeId)) {
			this.activeId = loaded.length > 0 ? loaded[0].id : null;
		}
		this.renderScriptTree();
		if (this.activeId) void this.selectScript(this.activeId);
	}

	/** 递归列出目录下所有 .js 文件（目录不存在/不可读 → 静默空列表） */
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

	/** 两段式：收起态只显示选中脚本触发条；点开为全量分组选择界面，选完自动收回 */
	private renderScriptTree(): void {
		this.listEl.empty();

		if (this.scripts.length === 0) {
			this.listEl.addClass("is-collapsed");
			this.listEl.createEl("div", {
				text: "（未发现面板脚本）",
				cls: "xdf-panel-empty",
			});
			this.activeId = null;
			this.session = null;
			this.lastSchemaKey = null;
			this.formRenderer?.render([], {});
			this.setRunEnabled(false);
			return;
		}

		if (!this.pickerOpen) {
			this.listEl.addClass("is-collapsed");
			this.renderTrigger();
			return;
		}

		this.listEl.removeClass("is-collapsed");
		this.renderPicker();
	}

	/** 收起态：一行触发条，显示当前选中脚本名（不带组名），点击打开全量选择界面 */
	private renderTrigger(): void {
		const active = this.scripts.find((s) => s.id === this.activeId);
		const triggerEl = this.listEl.createDiv({ cls: "xdf-panel-trigger" });
		triggerEl.createSpan({
			text: active ? active.title : "选择脚本",
			cls: "xdf-panel-trigger-label",
		});
		const caretEl = triggerEl.createSpan({ cls: "xdf-panel-group-caret" });
		setIcon(caretEl, "right-triangle");
		if (active) triggerEl.setAttribute("title", active.path);
		triggerEl.addEventListener("click", () => {
			this.pickerOpen = true;
			this.renderScriptTree();
		});
	}

	/** 全量选择界面：所有分组（默认展开，组头可收起），点条目选中并自动收回 */
	private renderPicker(): void {
		const groups: { category: string; items: LoadedScript[] }[] = [];
		for (const s of this.scripts) {
			const last = groups[groups.length - 1];
			if (last && last.category === s.category) last.items.push(s);
			else groups.push({ category: s.category, items: [s] });
		}

		for (const group of groups) {
			const collapsed = this.collapsedGroups.has(group.category);
			const groupEl = this.listEl.createEl("div", {
				cls: "xdf-panel-group",
			});

			const headerEl = groupEl.createDiv({ cls: "xdf-panel-group-header" });
			const chevronEl = headerEl.createSpan({ cls: "xdf-panel-group-caret" });
			setIcon(chevronEl, collapsed ? "right-triangle" : "down-triangle");
			headerEl.createSpan({ text: group.category, cls: "xdf-panel-group-name" });
			headerEl.createSpan({
				text: String(group.items.length),
				cls: "xdf-panel-group-count",
			});
			headerEl.addEventListener("click", () => {
				if (collapsed) this.collapsedGroups.delete(group.category);
				else this.collapsedGroups.add(group.category);
				this.renderPickerOnly();
			});

			if (!collapsed) {
				const itemsEl = groupEl.createDiv({ cls: "xdf-panel-group-items" });
				for (const s of group.items) {
					const itemEl = itemsEl.createDiv({
						text: s.title,
						cls: "xdf-panel-item",
					});
					if (s.id === this.activeId) itemEl.addClass("is-active");
					itemEl.setAttribute("title", s.path);
					itemEl.addEventListener("click", () => {
						this.pickerOpen = false;
						void this.selectScript(s.id).then(() =>
							this.renderScriptTree(),
						);
					});
				}
			}
		}
	}

	/** 选择界面内仅重绘分组（组头折叠用，不触发选中逻辑） */
	private renderPickerOnly(): void {
		this.listEl.empty();
		this.renderPicker();
	}

	private idFromPath(path: string): string {
		const base = path.split("/").pop() || path;
		return base.replace(/\.js$/i, "");
	}

	// ========== 选择与联动 ==========

	private async selectScript(id: string): Promise<void> {
		const script = this.scripts.find((s) => s.id === id);
		if (!script) return;
		this.activeId = id;
		this.statusEl.empty();
		this.lastSchemaKey = null;
		await this.recompute(script, this.store.getAnswers(id));
		this.updateActiveScriptHighlight();
	}

	/** 选中项高亮（按 activeId 重刷所有条目） */
	private updateActiveScriptHighlight(): void {
		const items = this.listEl.querySelectorAll(".xdf-panel-item");
		items.forEach((el) => {
			const s = this.scripts.find(
				(sc) => sc.path === el.getAttribute("title"),
			);
			el.toggleClass("is-active", s?.id === this.activeId);
		});
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
