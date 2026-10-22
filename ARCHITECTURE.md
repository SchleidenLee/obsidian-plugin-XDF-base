# ARCHITECTURE — XDF Base

> 现状架构说明。定位与使用见 [README.md](./README.md)；待办见 [PENDING.md](./PENDING.md)；变更史见 [DEVLOG.md](./DEVLOG.md)。

## 1. 定位

Obsidian 桌面端插件，基于上游 [QuickAdd](https://github.com/chhoumann/quickadd) 的**深度定制分支**（`package.json` 的 `name` 仍为 `quickadd`，`manifest.json` 的 id/名称是 `xdf-base` / `XDF Base`）。主线保留 QuickAdd 的引擎、模板格式化、GUI、AI 等能力；XDF 自研能力**全部收敛在 `src/xdf/`**，对上游主代码的唯一侵入点是 onload 末尾对 `XdfBaseExtension` 的装配（[main.ts:387-390](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/main.ts#L387-L390)）。

启用后为老师端提供：预设脚本自动释放、预设 Choice 自动同步、课次包建档/记录脚本、SQLite 查询镜像、Feedback 内联 checkbox 组渲染、**常驻脚本运行面板**，以及右键「归档/恢复」「授课布局」。

## 2. 目录结构

```
src/
├── main.ts                    插件生命周期入口（Plugin 子类），onload 末尾装配 XdfBaseExtension
├── settings.ts                设置模型 + 默认值（含 folderStructure 三文件夹、AI provider、xdfPanelScriptSources 面板扫描来源）
├── quickAddSettingsTab.ts     设置页（Banner / 分组待改造，见 PENDING）
├── quickAddApi.ts             暴露给脚本的 API（api.ai / api.suggester 等）
├── choiceExecutor.ts          Choice 执行入口
├── ai/                        LLM 层：AIAssistant / OpenAIRequest / Provider / tools（Agent + 工具调用）
├── engine/                    Choice 引擎：Template / Capture / Macro / Multi
├── formatters/                模板语法格式化器（{{VALUE}} 等）
├── gui/                       ChoiceBuilder 与各类 Prompt / Suggester / Modal（Svelte + TS）
├── cli/ uri/ interactive/     命令注册 / obsidian:// URI / 交互组件
├── migrations/ preflight/     数据迁移 / 执行前校验
├── services/ template/ types/ utils/ errors/ logger/ parsers/   各类支撑模块
└── xdf/                       ★ XDF 自研层（唯一侵入面）
    ├── XdfBaseExtension.ts    装配器：脚本释放 → Choice 同步 → DB → 事件监听 → InlineGroup → 脚本面板 → 右键菜单
    ├── choiceManager.ts       预设 Choice 文件夹同步（Multi，原位覆盖）
    ├── InlineGroup.ts         单行 checkbox 组的 CM6 + PostProcessor 双模式渲染
    ├── runner/                两段式脚本运行层（无 UI 依赖）
    │   ├── types.ts             ScriptContext / TwoStageModule / ScriptField 契约
    │   ├── ScriptModuleLoader.ts 载入并求值面板脚本（new Function → module.exports）
    │   ├── ScriptRunner.ts       collect / execute 驱动（execute 阶段禁用弹窗）
    │   └── AnswerStore.ts        填答持久化（panel/answers.json）
    ├── panel/                 脚本运行面板（ItemView + 表单，只认 ScriptField）
    │   ├── index.ts             registerScriptPanel：registerView + ribbon + command
    │   ├── XdfScriptPanelView.ts 选脚本 → collect 出表单 → 运行 execute
    │   └── PanelFormRenderer.ts  按 FieldRequirement 渲染控件并回填值
    ├── db/                    SQLite 同步层
    │   ├── Connection.ts       sql.js 连接（initialize / exec / query / save / clear / getStatus）
    │   ├── Schema.ts           7 表 DDL（「数据库模板.sql」内嵌副本）+ 版本 / 外键
    │   ├── Builder.ts          文件快照 → 实体 / 内容入库（rebuildDatabase、DBWriter）
    │   ├── Parser.ts           frontmatter / 章节 / 内联 checkbox 解析
    │   ├── Sync.ts             vault 事件监听 + 500ms debounce + 2s 节流增量同步
    │   ├── DbLog.ts            同步 / 重建错误日志（写回 vault）
    │   └── index.ts            createDBApi（暴露给脚本的 exec / query / rebuild / status）
    ├── scripts/               内置脚本（源码字符串，打包进 main.js；**presets 目录即分组**）
    │   ├── scriptRegistry.ts    从 manifest.generated 装配 SCRIPTS + ASSETS + GROUP_ORDER
    │   ├── ScriptReleaser.ts    释放到 00.SYSTEM/xdf_base/scripts/（源码目录即释放路径）
    │   ├── manifest.generated.ts auto-manifest.mjs 构建期生成并提交入库（勿手改）
    │   ├── presets/<分组>/       业务脚本：档案管理×4 / 文件生成×2 / 行政工作×3 / 通用×2
    │   └── assets/              共享资产（扁平）：ArchiveUtils.ts / XdfRuntime.ts
    └── types/
        └── sql.js.d.ts
```

配套资源：`esbuild.config.mjs`（构建）、`manifest.json`、`.github/workflows/release.yml`（发布）、`docs/`。

## 3. 模块职责

| 模块 | 职责 | 关键点 |
|------|------|--------|
| [main.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/main.ts) | 插件生命周期；`onload` 末尾 `new XdfBaseExtension(...).initialize()`，`onunload` 调 `cleanup()`；暴露 `plugin.api`（QuickAddApi） | XDF 唯一侵入点；`get api()` 返回 `QuickAddApi.GetApi(...)` |
| [XdfBaseExtension.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L30-L180) | XDF 装配器。`initialize()` 六步：①脚本释放 ②Choice 同步 ③DB 初始化 + 建表 + `reconcileOnStartup` ④`sync.attach` ⑤InlineGroup 渲染 ⑥注册 `file-menu`（归档/恢复 + 授课布局） | 每步独立 try/catch，一步失败不拖垮其他；注册全局单例供设置页访问 |
| [relocateArchive()](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L187-L232) | 整夹 `vault.rename` 到 `settings.folderStructure` 的 active/archived 目录，并改 frontmatter `status` | 目标已存在则中止；status 用无边界正则替换（技术债） |
| [openTeachingLayout()](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L237-L279) | 主窗口开 Feedback，popout 开 Wordlist，再垂直 split 开 Note | 触发条件：`#课程记录` 标签 + `lesson_number > 0`；重复点击会累积 popout |
| [reconcileOnStartup()](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L287-L349) | 启动对账：空库全量重建；vault 有库无 / mtime 变 → 补 upsert；库有 vault 无 → 按路径删 | 上帝函数（63 行，待拆分，见 PENDING） |
| [choiceManager.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/choiceManager.ts) | 按 `src/xdf/scripts/presets/<分组>/` 动态构建分组文件夹（Multi Choice）写入 `settings.choices` | id 前缀 `xdf-group-` / `xdf-script-`；原位覆盖保留折叠态；`xdf-base-*` / `xdf-panel-*` 与消失分组的旧文件夹清理；用户自建 Choice 不动 |
| [InlineGroup.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/InlineGroup.ts) | 把单行 `出勤：[ ] 正常 \| [ ] 迟到 …` 渲染为内联 checkbox 组 | Live Preview 用 CM6 ViewPlugin + WidgetType；阅读模式用 MarkdownPostProcessor；点击回写文本，随插件生命周期自动清理 |
| [db/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/index.ts) | `createDBApi` 暴露 `exec / query / rebuild / status / setSyncEnabled / isSyncEnabled` | 挂载点：`plugin.api.db`（`main.ts get api()` 懒 getter，2026-10-17 接上）；另有 `plugin._xdfBase.getDBApi()` 与全局单例 `getXdfBaseInstance()` |
| [db/Connection.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts) | sql.js（WASM）连接管理，库文件 `.xdf/xdf.db` | WASM 经 esbuild binary loader 内联进 main.js；`save()` 直接 writeBinary 非原子；`clear()` 失败态不一致（技术债） |
| [db/Schema.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Schema.ts) | 7 表 DDL + `PRAGMA user_version` 版本 + 外键开启 | 实体层 `students/archives/lessons/class_roster`，内容层 `sections/files/checkboxes`；DDL 以仓库外「数据库模板.sql」为权威，此处为同步副本 |
| [db/Builder.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Builder.ts) | 文件快照解析入库：`rebuildDatabase`（全量）、`DBWriter`（增量 upsert/remove） | 写入顺序按归属链依赖：档案 → nav → 其余 |
| [db/Parser.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Parser.ts) | frontmatter 块解析、`detectKind`、章节切块、内联 checkbox 组解析 | 与 InlineGroup 共用同一「单行 checkbox 组」契约 |
| [db/Sync.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Sync.ts) | vault create/modify/delete/rename 事件 → 500ms debounce + 2s 节流 → 分桶增量写库 | 最终一致 ≈2.5s；`shouldTrack` 已加 `instanceof TFile` 守卫；handleEvent 不区分 create/modify（技术债） |
| [scripts/ScriptReleaser.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/ScriptReleaser.ts) | 把 `SCRIPTS` + `ASSETS` 释放到 `00.SYSTEM/xdf_base/scripts/`（源码目录即释放路径） | 逐级建目录；无条件覆盖；旧释放文件不自动迁移，由用户手动清理；用户自建脚本不动 |
| [scripts/manifest.generated.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/manifest.generated.ts) | 构建期由 [auto-manifest.mjs](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/scripts/auto-manifest.mjs) 扫 `presets/` / `assets/` 生成的脚本清单（`GENERATED_SCRIPTS` 11 项 + `GENERATED_ASSETS` 2 项），提交入库 | 勿手改；fail-fast：presets 根级散装文件、空分组、assets 子目录、缺失 / 重复 `*_SCRIPT` 导出即构建报错 |
| [scripts/scriptRegistry.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/scriptRegistry.ts) | 从自动清单装配 `SCRIPTS`（path = `scripts/presets/<分组>/<名>.js`）+ `ASSETS`（path = `scripts/assets/<名>.js`）+ `GROUP_ORDER` + `groupScripts()` | id / QuickAdd 菜单名 / 释放文件名 = 中文文件名；分组 = presets 分组目录；加脚本只需落文件，构建自动入清单 |
| [scripts/assets/XdfRuntime.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/assets/XdfRuntime.ts) | 共享运行时源码（释放为 `scripts/assets/XdfRuntime.js`）：`run(mod)` 造 native ctx（`ask` 经 `api.suggester / inputPrompt / wideInputPrompt / datePrompt`）顺序跑 `collect → execute` | QuickAdd 侧双入口唯一支点；面板侧不加载它 |
| [scripts/assets/ArchiveUtils.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/assets/ArchiveUtils.ts) | 建档 / 课次包核心工具库（释放为 `scripts/assets/ArchiveUtils.js`）：nav 生成、相对路径链接（`./`、`../`）、7 文件课次包、反馈块 | 被其他脚本经 `loadUtils(ctx)` 加载，不作为可运行 Choice |
| [runner/types.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/runner/types.ts) | 两段式脚本契约：`ScriptContext`（`app`/`mode`/`scriptId`/`ask`/`notice`）、`TwoStageModule`（`collect`/`execute`）、`ScriptField = FieldRequirement` | runner 层不依赖 UI；脚本与宿主唯一通道是 `ctx` |
| [runner/ScriptRunner.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/runner/ScriptRunner.ts) | 驱动两段式脚本：`collect` 登记字段 + 解析动态选项、`execute` 注入 params 与 ctx | 字段去重保序；`execute` 的 `ctx.ask` 直接抛错、唯一写盘 |
| [runner/ScriptModuleLoader.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/runner/ScriptModuleLoader.ts) | 载入面板脚本源码并求值：`new Function("require","module","exports", code)` → `isTwoStageModule` 校验 | 与 QuickAdd 对象导出求值同构 |
| [runner/AnswerStore.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/runner/AnswerStore.ts) | 面板填答持久化：`00.SYSTEM/xdf_base/panel/answers.json`，key = `scriptId:fieldId` | 与 QuickAdd `data.json` 隔离，退出不重填 |
| [panel/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/panel/index.ts) | `registerScriptPanel`：`registerView` + ribbon + command；`activateScriptPanel` 聚焦已有 leaf 或右侧栏新建 | `registerView` 必须在 `onload` 内同步完成 |
| [panel/XdfScriptPanelView.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/panel/XdfScriptPanelView.ts) | 面板 ItemView：两段式脚本选择器——收起态只显示选中脚本触发条（不带组名），点开为全量分组选择界面（组可折叠），选完自动收回；扫描 = 内置 presets + 设置页自定义来源 → 跑 `collect` 出表单 → 值变化防抖重算 → 点运行跑 `execute` | 仅 `schemaKey` 变化才重渲染，避免丢焦点；开合状态仅内存保持 |
| [panel/PanelFormRenderer.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/panel/PanelFormRenderer.ts) | 按 `FieldRequirement` 渲染表单控件、回填 / 取值 | 选项越界回落首项 |
| ai/ / engine/ / formatters/ / gui/ / cli/ | 上游 QuickAdd 能力域（见上「目录结构」），XDF 未改其内部实现 | 仅通过 `XdfBaseExtension` 调用其中少量 API（`openPopoutLeaf` 等） |

## 4. 数据流

**启动装配流**（[XdfBaseExtension.initialize()](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L49-L180)）：

```
main.onload
  └─ new XdfBaseExtension(app, plugin).initialize()
       ① ScriptReleaser.releaseAll()      内置脚本 → 00.SYSTEM/xdf_base/scripts/presets/<分组>/ + scripts/assets/（覆盖）
       ② syncPresetChoices(settings.choices)  按目录分组重建 Multi 文件夹（原位覆盖）
       ③ db.initialize() → Schema.apply() → registerDBApi() → reconcileOnStartup()
       ④ sync.attach()                    监听 vault 事件
       ⑤ registerInlineGroupRendering()   CM6 + PostProcessor
       ⑥ workspace.on('file-menu')        归档/恢复 + 授课布局
```

**脚本释放流**：`SCRIPTS` / `ASSETS`（源码字符串，[scriptRegistry.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/scriptRegistry.ts) 装配自 [manifest.generated.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/manifest.generated.ts)）→ esbuild 打包进 main.js → 启动时 `ScriptReleaser` 按「源码目录即释放路径」写入 `00.SYSTEM/xdf_base/scripts/presets/<分组>/<中文名>.js` 与 `scripts/assets/<英文名>.js`（非点目录，QuickAdd 的 `getUserScript` 需走 vault 索引）。旧释放文件不做兼容迁移，由用户手动清理。同一步经 [choiceManager.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/choiceManager.ts) 把脚本登记为 Macro Choice（内含 UserScript 命令）。

**Choice 同步流**：`groupScripts()`（按 `src/xdf/scripts/presets/<分组>/` 归并）→ `xdf-group-<分组>` 文件夹 → id 精确或同名接管 → 原位重建 children（保留 collapsed）→ `xdf-base-*` / `xdf-panel-*` 与已消失分组的旧文件夹清理 → 用户自建 Choice 保留。

**DB 同步流**（[db/Sync.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Sync.ts#L148-L273)）：

```
vault create/modify/delete/rename
  → enqueue（500ms debounce）
  → scheduleFlush（2s 节流）
  → 按路径分桶（rename = 旧删 + 新写）
  → 快照 + detectKind 分组（archive / lesson_nav / 其它）
  → DBWriter.upsertFile（归档 → nav → 其余）
  → db.save() 写 .xdf/xdf.db
```

一致性模型：**md 是唯一数据源，数据库是查询镜像**；数据库落后 md 至多约 2.5s（500ms debounce + 2s 节流），最终一致。启动时 `reconcileOnStartup` 兜底（空库全量重建 / 逐文件补 mtime 差异 / 删除已消失文件）。

**查询流**：`createDBApi` 产出的 `XdfDBApi`（`query` / `exec` / `rebuild / `status`）供脚本 / 设置页读取 `vault/.xdf/xdf.db`。挂载点：`app.plugins.plugins["xdf-base"].api.db`（脚本侧官方入口，`main.ts get api()` 懒 getter 委托 `_xdfBase.getDBApi()`）；插件内部模块 import 全局单例 `getXdfBaseInstance()`。

**内联 checkbox 流**（[InlineGroup.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/InlineGroup.ts)）：源文件保持单行 `标签：[ ] x | [ ] y` → 渲染层把 `[ ]`/`[x]` 与 `|` 渲染为内联 widget → 点击 dispatch 精确 offset 文本替换（空格 ↔ x）/ `vault.modify` 回写 → 触发 DB 增量同步，Parser 以 `source='inline'` 入库。

**脚本面板运行流**（[XdfScriptPanelView.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/panel/XdfScriptPanelView.ts)）：

```
ribbon / 命令 → activateScriptPanel → XdfScriptPanelView.onOpen
  → 扫描根 = 内置 00.SYSTEM/xdf_base/scripts/presets/（写死）+ 设置页自定义来源（xdfPanelScriptSources）
     逐根递归 .js + isTwoStageModule；根名不作分组，组 = 根内第一层子目录名，散装归「其他」；重名内置优先
  → 折叠分组菜单选脚本 → ScriptRunner.collect（登记字段 + 扫 vault 出动态选项）→ PanelFormRenderer 渲染
  → 值变化（350ms 防抖）→ 重跑 collect → 仅 schemaKey 变化才重渲染
  → 点运行 → 再 collect 取最终 params → ScriptRunner.execute（唯一写盘）→ 答案落 answers.json
```

两段式把「收集」与「执行」解耦：`collect` 纯只读（可随便重跑 / 回退 / 中断），`execute` 只从 params 取输入、禁弹窗。面板只认 `FieldRequirement`，不认脚本内容；脚本只经 `ctx` 访问宿主，不感知谁在驱动（面板或原生弹窗）。

**双入口运行流**（QuickAdd 侧，[assets/XdfRuntime.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/assets/XdfRuntime.ts)）：

```
QuickAdd UserScript → MOD.entry
  → 读取 00.SYSTEM/xdf_base/scripts/assets/XdfRuntime.js（new Function 求值）→ runtime.run(MOD)
  → 造 native ctx（ask 逐项弹窗：suggester / inputPrompt / wideInputPrompt / datePrompt）
  → 顺序跑 collect → execute
```

同一份 `collect` / `execute` 由此可两条路跑：QuickAdd 走 `entry`（native asker，逐项弹窗顺跑），面板走 `ScriptRunner`（声明式 asker，一张表单）。收集内容（字段定义）与业务逻辑都只写一份，差异仅在 asker 实现。

## 5. 技术决策

- **fork 而非插件外挂**：XDF 能力直接改在 QuickAdd 分支内，而非独立插件。好处是可复用 QuickAdd 的引擎 / 脚本执行 / AI；代价是需跟随上游演进。为降低耦合，所有自研代码集中于 `src/xdf/`，唯一侵入点 `XdfBaseExtension`（[文件头注释](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L1-L12) 明确此意图，便于升级时 cherry-pick）。
- **脚本以源码字符串打包**：预设脚本不是独立文件，而是 TS 模块导出的字符串，esbuild 打进 main.js，运行时释放到 vault。目的：内置脚本随插件升级自动送达老师端，零外部依赖。
- **清单自动生成（prebuild）**：esbuild 不支持 `import.meta.glob`，由 [scripts/auto-manifest.mjs](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/scripts/auto-manifest.mjs) 在构建期扫描 `presets/` / `assets/` 生成 `manifest.generated.ts`（提交入库），`dev` / `build` / `build-with-lint` 前置运行。目录即清单，加脚本只需落文件；manifest.generated ⇄ scriptRegistry 的类型互引用 `import type`，运行时无环。
- **无条件覆盖 + 清单隔离**：启动全量覆盖 `SCRIPTS` / `ASSETS` 内的文件与按目录生成的分组 Choice，只动清单内对象，用户自建内容不受影响。产品方定性为「设计如此」（见 PENDING）。
- **sql.js（WASM）+ 镜像库**：不引入原生 SQLite 依赖；WASM 经 binary loader 内联。库是 md 的只读查询镜像，md 仍是唯一数据源，事件驱动增量同步 + 启动对账保证最终一致。
- **单行源 + 双模式渲染**：Feedback 的 checkbox 组源文件保持单行（多行横排 CSS 已证伪），渲染交给 CM6 Widget + 阅读模式 PostProcessor，点击回写文本。
- **相对路径链接**：nav / 课次包内链接用 `./`（同级）与 `../`（父级）前缀，避免同名文件串扰与移动失效。

## 6. 构建与发布

- **包管理**：pnpm（`packageManager: pnpm@10.32.1`），Node `^20.19.0 || >=22.12.0`。
- **构建**：`pnpm run build` = `node scripts/auto-manifest.mjs`（生成 manifest.generated.ts）+ `tsc -noEmit -skipLibCheck` + `node esbuild.config.mjs production`（[esbuild.config.mjs](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/esbuild.config.mjs)）。entry `src/main.ts` + `src/styles.css`，`loader: { ".wasm": "binary" }` 内联 WASM，产物落到 `dist/`（main.js + styles.css），末尾 `copyFileSync` 复制 manifest.json。
- **开发**：`pnpm run dev`（watch）。**校验**：`pnpm run lint`（eslint）、`pnpm run check`（svelte-check）。**测试**：`pnpm test`（vitest）、`pnpm run test:e2e`（vitest e2e）。
- **发布**：[.github/workflows/release.yml](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/.github/workflows/release.yml) 由 tag `v*` 触发：Setup pnpm → 校验 `package.json` / `manifest.json` / tag **三者版本一致** → Build → 校验产物（main.js / manifest.json / styles.css）→ 创建 Release（自动生成 release notes）。

## 7. 约定

- **XDF 自研代码一律放 `src/xdf/`**，对上游主代码的修改只允许集中在 `XdfBaseExtension` 装配点；不要散落改动 `ai/`、`engine/`、`formatters/`、`gui/`。
- **md 是唯一数据源**，数据库只是查询镜像；任何写库逻辑不得反向覆盖 md。
- 内置脚本落进 `src/xdf/scripts/presets/<分组>/` 即自动入清单（构建期 [auto-manifest.mjs](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/scripts/auto-manifest.mjs) 扫描生成）才会被释放与同步；**分组由 presets 下的目录决定**，不单独登记成员；脚本 id（= 文件名）全局唯一。
- **两段式脚本契约（强制）**：脚本导出 `module.exports = { meta?, collect, execute }`。`collect(ctx)` 只**读** vault + 经 `ctx.ask(field)` 取输入、**禁止**写盘（`create`/`modify`/`rename`/`delete`）；`execute(params, ctx)` 只从 `params` 取全部输入、**禁止弹窗 / 禁止 `ctx.ask`**、是**唯一**允许写盘之处。
- **双入口（可选）**：额外挂 `MOD.entry`（`const MOD = {...}; MOD.entry = ...; module.exports = MOD;`），`entry` 载入 `scripts/assets/XdfRuntime.js` 调 `run(MOD)`，即可在 QuickAdd 里顺跑同一份 `collect` / `execute`；不挂 `entry` 则仅面板可跑。字段定义与业务逻辑都只写一份，两条路只差 asker 实现。
- 取输入唯一入口是 `ctx.ask(field)`（字段复用 `FieldRequirement`，`type ∈ text|number|textarea|dropdown|slider|date|field-suggest|file-picker|suggester`）；**禁止**脚本直接调 `qa().inputPrompt / suggester / datePrompt` 等。
- 清单只有两份：业务脚本入 `SCRIPTS`（释放到 `scripts/presets/<分组>/<中文名>.js`，并按目录自动注册进 QuickAdd 分组文件夹），共享资产入 `ASSETS`（释放到 `scripts/assets/<英文名>.js`，非可运行脚本，不进菜单、不进面板）。
- 表结构以仓库外「数据库模板.sql」为权威，改结构需同步 [Schema.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Schema.ts) 的 DDL 副本并递增 `SCHEMA_VERSION`。
- 脚本经 `app.plugins.plugins["xdf-base"].api` 取 QuickAdd API，经 `.settings.folderStructure` 取三文件夹路径。
- 版本号三处需一致：`package.json` / `manifest.json` / release tag。
- 变更流程：完成一项待办 → 从 [PENDING.md](./PENDING.md) 删除 → 在 [DEVLOG.md](./DEVLOG.md) 追加 → 现状变了就更新本文件。

### 两段式脚本规范（细则）

**双入口模型**：同一份 `collect` / `execute`，两种 `ctx` 实现 —— 面板由 `XdfScriptPanelView` → `ScriptRunner` 驱动（递归扫 `scripts/**/*.js`，`ctx.ask` 为**声明式**：登记字段 → 回填 → 整表渲染）；QuickAdd 由 `MOD.entry` 载入 `scripts/assets/XdfRuntime.js` 后 `R.run(MOD)` 驱动（`ctx.ask` 为**命令式**：立即弹窗）。QuickAdd 用 `new Function("require","module","exports", src)` 求值，只注入这三者，故脚本里 `app` 只能来自 Obsidian 全局。

**文件与命名**（源码文件名 = 释放文件名 = 面板 id = QuickAdd 菜单名，四者统一为同一中文）：

- 源码 `src/xdf/scripts/presets/<分组>/<中文名>.ts`，导出唯一 `export const PANEL_<UPPER_SNAKE>_SCRIPT = String.raw\`...\``（导出名沿用英文符号，文件名用中文）。
- 释放到 `scripts/presets/<分组>/<中文名>.js`；构建期自动入清单（auto-manifest 扫 `presets/` / `assets/`），分组与 id 都由路径推导，**无需手工登记**。
- QuickAdd 分组文件夹按 `presets/` 下的文件夹自动生成（id `xdf-group-<分组>`），单条 choice id 为 `xdf-script-<中文名>`；分组顺序由 `GROUP_ORDER` 指定，未列出的分组按名称排在后面。
- 面板 `id` = 释放文件名去 `.js`；面板分组 = 相对扫描根（内置为 `presets/`）的第一段目录名，扫描根名本身永不显示。

**骨架（逐字遵守）**：

```js
/**
 * XDF 脚本 · <中文名>
 * collect：只读扫描 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/scripts/assets/XdfRuntime.js";

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

const MOD = {
    meta: { title: "<中文名>" },
    collect: async (ctx) => { /* 只收集，不写盘 */ return { /* 纯用户输入 */ }; },
    execute: async (params, ctx) => { /* 校验 → 计算 → 写盘 → ctx.notice */ }
};

MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
```

用 `MOD` 常量再 `module.exports = MOD`，**禁止** `module.exports.collect = ...`（自引用 TDZ）。

**ctx 契约**：`ctx.app` / `ctx.mode`（`"panel"` | `"native"`）/ `ctx.scriptId` / `ctx.notice(message)` / `ctx.ask(field)`。`field` 至少含 `id`（必填）/ `label` / `type`，可选 `placeholder` / `defaultValue` / `options` / `displayOptions` / `dateFormat` / `sliderConfig`。

| type | 面板渲染 | native 弹窗 |
|------|----------|-------------|
| `text`（默认） | 单行输入 | `inputPrompt` |
| `textarea` | 多行输入 | `wideInputPrompt` |
| `number` | 数字输入 | `inputPrompt` |
| `date` | 日期输入 | `datePrompt`（默认 `YYYY-MM-DD`） |
| `slider` | 滑块 | `inputPrompt` |
| `dropdown` / `suggester` | 下拉 / 建议列表 | `suggester`（`options` 为空则退化 `inputPrompt`） |

`options` 与 `displayOptions` 必须等长且为字符串数组（文件对象先转 `path` / `basename`，execute 里再用 `ctx.app.vault.getAbstractFileByPath(path)` 取回）。

**复刻既有脚本的十条原则**：

1. **逐行等价**：读取、校验、提示文案、写盘顺序、异常分支一律保留；不新增功能、不顺手重构。
2. **所有输入搬进 collect**：原脚本的 `inputPrompt` / `wideInputPrompt` / `datePrompt` / `suggester` / `confirm` 全改成 `ctx.ask` 字段，顺序与原提问顺序一致。
3. **`confirm` 改成字段**：collect 里只读判断条件，命中则问 `dropdown`（`["yes","no"]` / `["继续","取消"]`），execute 按答案走原分支；**execute 不得再弹 confirm**。
4. **派生值在 execute 重算**：`params` 只放用户输入（+ 上述 yes/no 控制位）；课程号、路径、解析结果、ISO 时间等在 execute 里按原逻辑重算。
5. **写盘只在 execute**：collect 只允许读 vault / 读文件 / 扫候选。
6. **不用全局 `app` / `Notice`**：一律 `ctx.app` / `ctx.notice`（工具库 `ArchiveUtils` 内部的 `Notice` 不动）。
7. **关键提示放 execute**：面板 collect 阶段的 `ctx.notice` 不会显示，仅作 best-effort。
8. **保持原异常文案**：collect 取到空值时 native 直接 `throw`（复刻「立即中止」）；面板把原值交给 execute 校验并 `ctx.notice` 同一文案。
9. **复用工具库**：需要 `ArchiveUtils` 时照抄 [一对一建档.ts:21](./src/xdf/scripts/presets/档案管理/一对一建档.ts#L21) 的 `loadUtils(ctx)`（`UTILS_PATH` 指向 `00.SYSTEM/xdf_base/scripts/assets/ArchiveUtils.js`，`ctx.app.vault.adapter.read` + `new Function("module","exports","app", code)(mod, mod.exports, ctx.app)`），只改文件名。
10. **不新建旧式预设脚本**：内置脚本一律采用本规范的两段式，放进 `src/xdf/scripts/presets/<分组>/<中文名>.ts`；不再写只给 QuickAdd 用的扁平 `String.raw` 预设。

**验证**：编译用 wsl 路径 `pnpm build`（前置自动清单生成 + tsc + esbuild，构建通过即新脚本已入清单）；面板需重启插件触发 `scripts/presets/<分组>/<中文名>.js` 释放；QuickAdd 在对应分组文件夹下自动出现同名命令（`entry` → 直接顺跑，不弹成员选择器）。

## 8. 已知技术债

取自 [PENDING.md](./PENDING.md)「代码审查整改计划（2026-10-04）」，此处只列架构层面的记录点：

- **AI 产物无条件覆盖当前笔记**（[词表工具.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/presets/文件生成/词表工具.ts)、[AI出作业.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/presets/文件生成/AI出作业.ts)），无备份 / 预览 / 确认。
- **homework-ai 半成品逻辑仍随「AI 出作业」发布**（[AI出作业.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/presets/文件生成/AI出作业.ts)），每次启动随插件释放。
- **词表工具手写 JSON 清洗脆弱**（围栏剥离 / 括号夹取 / 静默兜底），应改结构化输出。
- **`XdfBaseExtension` 承担过多实现细节**：`reconcileOnStartup` 是 63 行上帝函数；归档/恢复与授课布局耦合在同一 `file-menu` 回调；`relocateArchive` 内联了归档业务逻辑，应下沉。计划拆出 `Reconciler` / `menus/archiveMenu.ts` / `menus/teachingLayoutMenu.ts`（暂缓）。
- **DB 层**：`Connection.save()` 直接 writeBinary 非原子（[127-144](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts#L127-L144)）；`clear()` 失败后内存/磁盘状态分裂（[161-173](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts#L161-L173)）。
- **frontmatter `status` 无边界正则替换**（[XdfBaseExtension.ts:220-223](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L220-L223)）。
- **`Sync.handleEvent` 不区分 create/modify**（[Sync.ts:101-104](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Sync.ts#L101-L104)），语义丢失。
- **对 `TFile[]` 调 `sort()` 未传比较器**（[周例会记录.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/presets/行政工作/周例会记录.ts)、[例会添加页面.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/presets/行政工作/例会添加页面.ts)）。
- **授课布局重复点击累积 popout 窗口**（[XdfBaseExtension.ts:237-279](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L237-L279)）。
