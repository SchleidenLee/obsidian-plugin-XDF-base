# PENDING — XDF Base

> 待办清单。分区：**⚪ 待定**（方案未定）/ **🟡 已定待做**（方案已定，等动手）/ **🟢 进行中**。
> 完成一项后：从本文件**删除**该条 → 在 [DEVLOG.md](./DEVLOG.md) 追加一行 → 现状变了就更新 [ARCHITECTURE.md](./ARCHITECTURE.md)。

> 注 1：本文件由旧的无扩展名 `PENDING` 与 `UI-REFACTOR.md` 合并迁移而来（2026-10-17）。
> 注 2：旧 `PENDING` 的「功能待做」四项经核对**均已在 v1.4.x 落地**，按「完成即出清」约定已移除，分别为：①课程链接相对路径（v1.4.0）；②文件结构管理 + 右键归档（v1.4.0/1.4.9）；③右键「授课布局」（v1.4.7/1.4.8）；④`shouldTrack` 对 `TFolder` 崩溃（v1.4.7）。变更史见 [DEVLOG.md](./DEVLOG.md)。
> 注 3：下方「代码审查整改」的行号基准为 **2026-10-04** 的源码快照，动手时以实际代码为准。

---

## 🟢 进行中

（暂无）

> 学员表 DB 镜像（Phase 1~3）已于 2026-11-04 完成：`.duowei` → `student_profile`（非空增量 upsert）+ `class_roster.final_exam_score`，`.duowei` 变更自动触发同步。表结构见 [ARCHITECTURE.md](./ARCHITECTURE.md) / [Schema.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Schema.ts)，变更史见 [DEVLOG.md](./DEVLOG.md)。

---

## 🟡 已定待做

#### 风险
- **duowei-table 嵌入渲染器是精简版**：嵌入视图不渲染 `colorRules`（整行条件色）、`cellStyles`（单格居中/背景）、`headerStyle`——只有全屏打开表格时生效；下拉选项的彩色 chip 在嵌入里正常显示。属插件源码限制，**后续给插件打补丁补齐**（见下方「duowei-table 嵌入渲染器补丁」条目，设计模板/样式时以彩 chip 表达关键信息）
- duowei 插件未安装时，嵌入块显示为普通文件链接（降级体验）
- duowei JSON schema 如果插件升级变了，需要适配

---

### duowei-table 嵌入渲染器补丁（后续必做）

背景：`![[xxx.duowei]]` 嵌入走的是 `DuoweiEmbedChild` 精简渲染器（main.js L24485 起），与全屏打开用的完整网格渲染器是两套独立代码路径，嵌入视图缺失以下格式（已源码定位）：

| 缺失格式 | 主视图实现位置 | 嵌入侧现状 |
|----------|----------------|-----------|
| 整行条件色 `colorRules` | L14285 `recordRuleColor` | 行循环 L24704-24713 未调用 |
| 单格样式 `cellStyles`（居中/背景/字色） | L14375-14383 | `renderEmbedCell` L25241 完全不读 |
| 表头样式 `headerStyle` | 完整网格 | 嵌入 thead 只渲染字段名 |

- [ ] **给嵌入渲染器补齐 cellStyles / colorRules / headerStyle**（L24704 行循环 + `renderEmbedCell` 各加对现有函数的复用，主视图逻辑可直接引用）
- [ ] 决定补丁载体：fork 维护 patched 版本（仓库已拉到 `references/duowei-table`）vs 就地 patch vault 内 main.js（插件更新后需重打）
- [ ] 补丁完成后：确认嵌入里 `cellStyles['align']` 生效的形式（class `is-align-center` 已有对应 CSS）
- 嵌入渲染器已支持且无需补：数据、排序、搜索、筛选、下拉选项彩色 chip、checkbox（嵌入里禁用编辑态）

---

### A. 代码审查整改（中）

- [ ] **对 `TFile[]` 调用 `sort()` 未传比较器** — [周例会记录.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/scripts/presets/行政工作/周例会记录.ts)、[例会添加页面.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/scripts/presets/行政工作/例会添加页面.ts)
  - 现象：两处对 `.getMarkdownFiles()` 过滤后的数组直接 `.sort().reverse()`，`sort()` 走默认字符串（UTF-16 码元）排序。
  - 影响：中文与序号在字典序下未必符合预期（尤其多位数字序号），影响默认选中项与展示顺序。
  - 修复方向：显式传比较器（按路径 `localeCompare` 或按解析出的序号数值），并明确升降序意图。

- [ ] **sql.js 数据库写盘非原子** — [Connection.ts:127-144](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/db/Connection.ts#L127-L144)
  - 现象：`save()` 直接 `adapter.writeBinary(this.dbPath, data)` 整体覆盖 `.xdf/xdf.db`，未先写临时文件再原子替换。
  - 影响：写盘中断可能留下半截损坏的库文件，下次启动 `initialize()` 可能抛错或读到不一致状态。
  - 修复方向：改为「先写临时路径 → 成功后 rename 覆盖」；或写前备份上一版本，失败可回滚。

- [ ] **frontmatter `status` 用无边界正则替换** — [XdfBaseExtension.ts:220-223](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/XdfBaseExtension.ts#L220-L223)
  - 现象：`relocateArchive` 用 `new RegExp("status:\\s*[\"']?" + fromStatus + "[\"']?")` 就地替换 `status`，正则无行首 / 行尾边界。
  - 影响：正文或其他 frontmatter 字段中若出现同样的 `status: active` / `status: archived` 片段，可能被误替换（替换第一处匹配）。
  - 修复方向：限定匹配到 frontmatter 块内并加边界（`^status:` + 行尾锚定、`m` 多行标志），或改用 YAML 解析 / 写回。

- [ ] **数据库 `clear()` 失败后状态不一致** — [Connection.ts:161-173](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/db/Connection.ts#L161-L173)
  - 现象：`clear()` 先关旧连接、再建新空库并置 `dirty = true`、然后 `save()`；若 `save()` 抛错，内存已是空库但磁盘仍是旧库，且旧连接已关闭。
  - 影响：清库中途失败会进入内存 / 磁盘状态分裂，后续读写基于空库、旧数据未真正清掉。
  - 修复方向：`save()` 失败时回滚内存状态（重新加载磁盘库）或明确进入错误态并提示。

### A. 代码审查整改（低）

- [ ] **启动同步 Choice 绕过防抖保存** — [XdfBaseExtension.ts:68-70](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/XdfBaseExtension.ts#L68-L70) → 复查启动时序，必要时与统一保存通道对齐或串行化，避免并发写 `data.json`。
- [ ] **模板缺失时 `SingleTemplateEngine` 返回空串不报错** — [SingleTemplateEngine.ts:38-40](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/engine/SingleTemplateEngine.ts#L38-L40) → 按「模板缺失」抛出可识别错误，让调用方决定是否中止写入。
- [ ] **`AIAssistant` Notice 定时器未清理** — [AIAssistant.ts:342,347](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/ai/AIAssistant.ts#L342) → 保存 `setTimeout` 句柄，结束 / 销毁时 `clearTimeout`。
- [ ] **`Sync.ts` 中 create/modify 事件语义混淆** — [Sync.ts:101-104](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/db/Sync.ts#L101-L104) → 分别注册两个处理函数或在 `handleEvent` 透传真实事件类型，保留 create/modify 语义。
- [ ] **授课布局重复点击累积 popout 窗口** — [XdfBaseExtension.ts:237-279](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/XdfBaseExtension.ts#L237-L279) → 复用已有 popout（查 `getLeavesOfType` / 已存在的 popout leaf），或明确其为「另开窗口」的一次性操作。

### A. 代码审查整改（设计如此 / 非问题，不整改）

以下两项经产品方确认属故意设计，记录风险但本期不整改：

- **每次启动无条件覆盖预设脚本与 Choice — 设计如此，非问题。** 产品方说明：启动时对 `SCRIPTS` / 按目录生成的 QuickAdd 分组清单内文件做全量覆盖，目的是让内置脚本 / 菜单随插件升级自动送达老师端；用户自建脚本不在清单内不会被触碰（见 [ScriptReleaser.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/scripts/ScriptReleaser.ts)、[choiceManager.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/choiceManager.ts)）。记录风险：老师若直接改预设脚本文件，改动会在下次启动被覆盖，此风险已被接受。
- **用 `new Function` 执行 vault 内 JS — 设计如此，非问题。** 产品方说明：脚本以字符串形式存于 vault、由 QuickAdd 执行时求值运行，配套代码阅读器插件阅读，脚本目录为 `.xdf` / `00.SYSTEM` 等不入库路径，属既定可扩展机制。记录风险：执行 vault 内可写 JS 存在安全边界，产品方已知悉并接受。**代码位置 [待确认]**：本次在 `src/` 内未定位到直接调用点（求值发生在 QuickAdd 主流程 / 运行时）。

### B. 结构化输出改造（重点）

背景：目标模型（v4.1 flash）支持结构化输出，把词表脚本现有的「手写解析 LLM 输出」改为「模型结构化输出 + 显式校验」。

- **现状** — [词表工具.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/scripts/presets/文件生成/词表工具.ts)
  - 脚本用自然语言要求模型「只输出 JSON 数组，不要 markdown 代码块标记」，再调 `quickAddApi.ai.prompt(prompt, undefined, { systemPrompt, modelOptions: { temperature: 0.2 } })`。
  - 经核实，`ai.prompt` 的 `settings.modelOptions` 类型为 `Partial<OpenAIModelParameters>`（[quickAddApi.ts:510](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/quickAddApi.ts#L510)；类型定义 [OpenAIModelParameters.ts:6-23](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/ai/OpenAIModelParameters.ts#L6-L23) 仅有 `temperature` / `top_p` / `frequency_penalty` / `presence_penalty`），**无法透传 `response_format`**。整条链路（`quickAddApi` → `Prompt()` → `OpenAIRequest`）都没有 `responseFormat` 入口，故脚本只能靠提示词约束格式、被迫手写清洗。

- **底层能力已存在（可直接复用）**
  - [providerToolMapping.ts:151-166](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/ai/tools/providerToolMapping.ts#L151-L166)：`buildOpenAIBody` 已支持 `req.responseFormat`——有 schema 时构造 `response_format: { type: "json_schema", json_schema: { name, strict, schema } }` 并对 schema 走 `injectStrictObjectSchema`，无 schema 时退化为 `{ type: "json_object" }`。
  - [Agent.ts:555-573](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/ai/tools/Agent.ts#L555-L573)：已有 `parseStructured(text, schema)`（先 `stripCodeFences` 再 `JSON.parse`，再 `validateValue`）、`stripCodeFences`、`validateValue`，并配有一次「更严格重问」的修复回路。
  - 即：请求构造、围栏剥离、schema 校验、失败修复都已在 `ai/tools` 内实现，缺的是「脚本侧调用 `ai.prompt` 也能带 schema」这条通道。

- **改造路线（建议，按依赖排序）**
  1. (a) 打通透传：扩展 `ai.prompt` 的 settings → `Prompt` 的 `PromptParams` → `OpenAIRequest` → `buildChatBody` 增加可选 `responseFormat` 透传；保持旧调用方行为不变（新增字段可选）。
  2. (b) 脚本侧声明词条 schema（顶层 object，`strict: true` + `additionalProperties: false`），用 `parseStructured` / `validateValue` 校验；**校验失败显式报错、不落盘、不覆盖笔记**。
  3. (c) 保留文本兜底：上游不支持 `response_format` 时退化为「去围栏 + `JSON.parse` + 长度 / 元素结构校验」，即把现有手写清洗收敛为最小兜底路径，失败同样显式报错。

- **兼容性**：需实测目标模型（v4.1 flash）是否支持 `json_schema` 与 `strict`；不支持时退化为 `json_object` 或纯文本兜底（路线 c）。

### C. 设置页 UI 改造

来源：旧 `UI-REFACTOR.md`（`src/quickAddSettingsTab.ts`）。现状问题：无 Banner、无版本 / 作者信息、设置线性排列（已有分组概念：选项 / 打包 / AI / 数据库 / 高级）。

- [ ] **添加 Banner**：`⚡ XDF Base` + 副标题「QuickAdd 脚本引擎 + AI 调用」。
- [ ] **设置分区**：首页放高频项（选项列表）；「高级设置」折叠区放 AI 助手 / 数据库 / 打包。
- [ ] **添加 Footer**：版本号 + 作者（Schleiden）。
- 改动文件：[quickAddSettingsTab.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/quickAddSettingsTab.ts)（添加 Banner / Footer，调整分组返回结构）；样式可加在 `src/styles.css`。

---

## ⚪ 待定

### E. 周例会模板与路径占位符方案（待定）

背景：模板层已把正文外置到 `src/xdf/templates/**/*.md`，但**目录路径仍由脚本硬拼**（`ROOT + "/" + fy + "/" + seasonFolder + "/" + date + " 第" + n + "次例会"`）。半成品的 `renderPath` 已在本次收口时删除，避免「看起来支持、实际只认 2 个占位符」的误导。

- [ ] **例会目录命名格式**是否调整（当前 `2026-10-29 第3次例会`），确定后模板目录与脚本路径需同步。
- [ ] **路径是否也走占位符**（`{fy}` / `{seasonFolderName}` / `{date}` / `{n}`），由模板树位置推导目标路径。若采纳，需同时定下模板目录结构与脚本契约；不采纳则维持脚本拼串。
- [ ] **与 verbatim（会议录音转写）插件的模板共用方式**：依赖 base 的 `00.SYSTEM/xdf_base/templates`，还是各自独立释放目录。

等会议模板格式敲定后一起定方案，暂不动手。

### D. 架构优化（暂缓）

现状评估：整体模块划分清晰（scripts / db 独立），但 `XdfBaseExtension.ts` 承担了过多实现细节：应只负责「什么时候调谁」，而非「怎么做」。不是烂代码，但加新功能时不抽离会持续膨胀。

- [ ] **拆分 `reconcileOnStartup` 上帝函数（63 行）** — 扫描 vault、过滤、查 DB、对比 mtime、空库重建、增量补写、错误日志全塞在一起 → 新建 `src/xdf/db/Reconciler.ts`，Extension 只调 `await new Reconciler(app, db).run()`。当前实现见 [XdfBaseExtension.ts:287-349](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/XdfBaseExtension.ts#L287-L349)。
- [ ] **拆离右键菜单耦合** — 归档 / 恢复与授课布局写在同一个 `file-menu` 回调中，控制流互相牵制；应各自注册监听器，或抽成 `registerArchiveMenu()` / `registerTeachingLayoutMenu()`（分别独立判断、独立 return）。建议新建 `src/xdf/menus/archiveMenu.ts`、`src/xdf/menus/teachingLayoutMenu.ts`。当前实现见 [XdfBaseExtension.ts:111-179](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/XdfBaseExtension.ts#L111-L179)。
- [ ] **`relocateArchive` 下沉到脚本工具库** — 读 settings、拼路径、`vault.rename`、改 frontmatter 都属归档业务逻辑，应移到 `archive-utils.ts`，Extension 只调 `await archiveTo(folder, page, 'archived', settings)`。
