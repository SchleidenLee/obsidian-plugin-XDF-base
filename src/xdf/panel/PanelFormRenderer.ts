/**
 * 面板表单渲染器
 *
 * 把 ScriptField[] 渲染成表单，并负责读写值。
 * 与运行层解耦：只认 ScriptField，不关心脚本是谁、怎么跑。
 */

import { Setting } from "obsidian";
import type { ScriptField } from "../runner/types";

export interface FormRendererOptions {
	/** 任一字段值变化时回调（面板据此触发联动重算） */
	onChange: (fieldId: string, value: string) => void;
}

export class PanelFormRenderer {
	private fields: ScriptField[] = [];
	private values: Record<string, string> = {};

	constructor(
		private readonly container: HTMLElement,
		private readonly options: FormRendererOptions,
	) {}

	/** 用最新字段清单渲染；values 为已填答案（用于回显） */
	render(fields: ScriptField[], values: Record<string, string>): void {
		this.fields = fields ?? [];
		this.values = { ...values };
		this.container.empty();

		if (this.fields.length === 0) {
			this.container.createEl("div", {
				cls: "xdf-panel-empty",
				text: "该脚本无需填写参数",
			});
			return;
		}

		for (const field of this.fields) {
			this.renderField(field);
		}
	}

	/** 收集当前表单值 */
	getValues(): Record<string, string> {
		return { ...this.values };
	}

	private renderField(field: ScriptField): void {
		const setting = new Setting(this.container)
			.setName(field.label || field.id)
			.setClass("xdf-panel-field");
		if (field.description) setting.setDesc(field.description);

		switch (field.type) {
			case "textarea":
				setting.addTextArea((ta) => {
					ta.setValue(this.currentValue(field));
					if (field.placeholder) ta.setPlaceholder(field.placeholder);
					ta.inputEl.rows = 3;
					ta.onChange((v) => this.set(field.id, v));
				});
				break;
			case "number":
				this.addText(setting, field, "number");
				break;
			case "date":
				this.addText(setting, field, "date");
				break;
			case "dropdown":
			case "suggester":
				this.addChoice(setting, field);
				break;
			case "slider":
				this.addSlider(setting, field);
				break;
			default:
				this.addText(setting, field);
		}
	}

	private addText(
		setting: Setting,
		field: ScriptField,
		inputType?: string,
	): void {
		setting.addText((t) => {
			if (inputType) t.inputEl.type = inputType;
			if (field.placeholder) t.setPlaceholder(field.placeholder);
			t.setValue(this.currentValue(field));
			t.onChange((v) => this.set(field.id, v));
		});
	}

	private addChoice(setting: Setting, field: ScriptField): void {
		const options = field.options || [];
		if (options.length === 0) {
			// 没有候选就没有可选项 —— 退化为自由输入
			this.addText(setting, field);
			return;
		}
		setting.addDropdown((d) => {
			options.forEach((opt, i) => {
				const label = field.displayOptions?.[i] ?? opt;
				d.addOption(opt, label);
			});
			// 旧答案可能已不在候选内（如切换了联动字段）→ 回落到首项
			const raw = this.currentValue(field);
			const current = options.indexOf(raw) !== -1 ? raw : options[0];
			d.setValue(current);
			this.set(field.id, current);
			d.onChange((v) => this.set(field.id, v));
		});
	}

	private addSlider(setting: Setting, field: ScriptField): void {
		const cfg = field.sliderConfig ?? { min: 0, max: 100, step: 1 };
		setting.addSlider((s) => {
			s.setLimits(cfg.min, cfg.max, cfg.step);
			const num = Number(this.currentValue(field));
			s.setValue(Number.isFinite(num) ? num : cfg.min);
			s.onChange((v) => this.set(field.id, String(v)));
		});
	}

	private currentValue(field: ScriptField): string {
		const v = this.values[field.id];
		if (v !== undefined && v !== null && v !== "") return v;
		return field.defaultValue ?? "";
	}

	private set(id: string, value: string): void {
		this.values[id] = value;
		this.options.onChange(id, value);
	}
}
