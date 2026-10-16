# ARCHITECTURE — XDF Base

> 现状架构说明。定位与使用见 [README.md](./README.md)；待办见 [PENDING.md](./PENDING.md)；变更史见 [DEVLOG.md](./DEVLOG.md)。

## 1. 定位

Obsidian 桌面端插件，基于上游 [QuickAdd](https://github.com/chhoumann/quickadd) 的**深度定制分支**（`package.json` 的 `name` 仍为 `quickadd`，`manifest.json` 的 id/名称是 `xdf-base` / `XDF Base`）。主线保留 QuickAdd 的引擎、模板格式化、GUI、AI 等能力；XDF 自研能力**全部收敛在 `src/xdf/`**，对上游主代码的唯一侵入点是 onload 末尾对 `XdfBaseExtension` 的装配（[main.ts:387-390](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/main.ts#L387-L390)）。

启用后为老师端提供：预设脚本自动释放、预设 Choice 自动同步、课次包建档/记录脚本、SQLite 查询镜像、Feedback 内联 checkbox 组渲染，以及右键「归档/恢复」「授课布局」。

## 2. 目录结构

```
src/
├── main.ts                    插件生命周期入口（Plugin 子类），onload 末尾装配 XdfBaseExtension
├── settings.ts                设置模型 + 默认值（含 folderStructure 三文件夹、AI provider）
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
    ├── XdfBaseExtension.ts    装配器：脚本释放 → Choice 同步 → DB → 事件监听 → InlineGroup → 右键菜单
    ├── choiceManager.ts       预设 Choice 文件夹同步（Multi，原位覆盖）
    ├── InlineGroup.ts         单行 checkbox 组的 CM6 + PostProcessor 双模式渲染
    ├── db/                    SQLite 同步层
    │   ├── Connection.ts       sql.js 连接（initialize / exec / query / save / clear / getStatus）
    │   ├── Schema.ts           7 表 DDL（「数据库模板.sql」内嵌副本）+ 版本 / 外键
    │   ├── Builder.ts          文件快照 → 实体 / 内容入库（rebuildDatabase、DBWriter）
    │   ├── Parser.ts           frontmatter / 章节 / 内联 checkbox 解析
    │   ├── Sync.ts             vault 事件监听 + 500ms debounce + 2s 节流增量同步
    │   ├── DbLog.ts            同步 / 重建错误日志（写回 vault）
    │   └── index.ts            createDBApi（暴露给脚本的 exec / query / rebuild / status）
    ├── scripts/               预设脚本（源码字符串，打包进 main.js）
    │   ├── ScriptReleaser.ts    释放到 00.SYSTEM/xdf_base/（无条件覆盖）
    │   ├── index.ts             PRESET_SCRIPTS 清单
    │   ├── archive-utils.ts     ★ 建档 / 课次包核心工具库（nav、链接、反馈块生成）
    │   ├── archive-1on1-create.ts / archive-class-create.ts              建档脚本
    │   ├── lesson-1on1-record.ts / lesson-class-record.ts                每课记录脚本
    │   ├── wordlist-ai.ts / homework-ai.ts                               AI 脚本
    │   └── meeting-setup.ts / meeting-record.ts / meeting-add-page.ts    行政（周例会）
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
| [choiceManager.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/choiceManager.ts) | 把「档案管理 / 文件生成 / 行政工作」三个预设文件夹（Multi Choice）写入 `settings.choices` | id 前缀 `xdf-base-`；原位覆盖保留折叠态；散落旧 Choice 清理、退役文件夹移除；用户自建 Choice 不动 |
| [InlineGroup.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/InlineGroup.ts) | 把单行 `出勤：[ ] 正常 \| [ ] 迟到 …` 渲染为内联 checkbox 组 | Live Preview 用 CM6 ViewPlugin + WidgetType；阅读模式用 MarkdownPostProcessor；点击回写文本，随插件生命周期自动清理 |
| [db/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/index.ts) | `createDBApi` 暴露 `exec / query / rebuild / status / setSyncEnabled / isSyncEnabled` | 挂载点：`plugin.api.db`（`main.ts get api()` 懒 getter，2026-10-17 接上）；另有 `plugin._xdfBase.getDBApi()` 与全局单例 `getXdfBaseInstance()` |
| [db/Connection.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts) | sql.js（WASM）连接管理，库文件 `.xdf/xdf.db` | WASM 经 esbuild binary loader 内联进 main.js；`save()` 直接 writeBinary 非原子；`clear()` 失败态不一致（技术债） |
| [db/Schema.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Schema.ts) | 7 表 DDL + `PRAGMA user_version` 版本 + 外键开启 | 实体层 `students/archives/lessons/class_roster`，内容层 `sections/files/checkboxes`；DDL 以仓库外「数据库模板.sql」为权威，此处为同步副本 |
| [db/Builder.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Builder.ts) | 文件快照解析入库：`rebuildDatabase`（全量）、`DBWriter`（增量 upsert/remove） | 写入顺序按归属链依赖：档案 → nav → 其余 |
| [db/Parser.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Parser.ts) | frontmatter 块解析、`detectKind`、章节切块、内联 checkbox 组解析 | 与 InlineGroup 共用同一「单行 checkbox 组」契约 |
| [db/Sync.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Sync.ts) | vault create/modify/delete/rename 事件 → 500ms debounce + 2s 节流 → 分桶增量写库 | 最终一致 ≈2.5s；`shouldTrack` 已加 `instanceof TFile` 守卫；handleEvent 不区分 create/modify（技术债） |
| [scripts/ScriptReleaser.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/ScriptReleaser.ts) | 把 `PRESET_SCRIPTS` 无条件覆盖释放到 `00.SYSTEM/xdf_base/` | 只动清单内文件，用户自建脚本不动；删了会自愈补回 |
| [scripts/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/index.ts) | `PRESET_SCRIPTS` 清单（id / displayName / path / content / category，10 项） | 含工具库 archive-utils、建档 ×2、每课记录 ×2、AI ×2（含半成品 homework-ai）、行政 ×3 |
| [scripts/archive-utils.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/archive-utils.ts) | 建档 / 课次包核心工具库：nav 生成、相对路径链接（`./`、`../`）、7 文件课次包、反馈块 | 被其他脚本加载，不作为可运行 Choice |
| ai/ / engine/ / formatters/ / gui/ / cli/ | 上游 QuickAdd 能力域（见上「目录结构」），XDF 未改其内部实现 | 仅通过 `XdfBaseExtension` 调用其中少量 API（`openPopoutLeaf` 等） |

## 4. 数据流

**启动装配流**（[XdfBaseExtension.initialize()](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L49-L180)）：

```
main.onload
  └─ new XdfBaseExtension(app, plugin).initialize()
       ① ScriptReleaser.releaseAll()      预设脚本 → 00.SYSTEM/xdf_base/（无条件覆盖）
       ② syncPresetChoices(settings.choices)  预设文件夹 Multi 原位覆盖
       ③ db.initialize() → Schema.apply() → registerDBApi() → reconcileOnStartup()
       ④ sync.attach()                    监听 vault 事件
       ⑤ registerInlineGroupRendering()   CM6 + PostProcessor
       ⑥ workspace.on('file-menu')        归档/恢复 + 授课布局
```

**脚本释放流**：`PRESET_SCRIPTS`（源码字符串，[scripts/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/index.ts)）→ esbuild 打包进 main.js → 启动时 `ScriptReleaser` 写入 `00.SYSTEM/xdf_base/`（非点目录，QuickAdd 的 `getUserScript` 需走 vault 索引）。同一步经 [choiceManager.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/choiceManager.ts) 把脚本登记为 Macro Choice（内含 UserScript 命令）。

**Choice 同步流**：`PRESET_FOLDERS`（档案管理 / 文件生成 / 行政工作）→ id 精确或同名接管 → 原位重建 children（保留 collapsed）→ 散落/退役项清理 → 用户自建 Choice 保留。

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

## 5. 技术决策

- **fork 而非插件外挂**：XDF 能力直接改在 QuickAdd 分支内，而非独立插件。好处是可复用 QuickAdd 的引擎 / 脚本执行 / AI；代价是需跟随上游演进。为降低耦合，所有自研代码集中于 `src/xdf/`，唯一侵入点 `XdfBaseExtension`（[文件头注释](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L1-L12) 明确此意图，便于升级时 cherry-pick）。
- **脚本以源码字符串打包**：预设脚本不是独立文件，而是 TS 模块导出的字符串，esbuild 打进 main.js，运行时释放到 vault。目的：内置脚本随插件升级自动送达老师端，零外部依赖。
- **无条件覆盖 + 清单隔离**：启动全量覆盖 `PRESET_SCRIPTS` / `PRESET_FOLDERS` 内的文件与 Choice，只动清单内对象，用户自建内容不受影响。产品方定性为「设计如此」（见 PENDING）。
- **sql.js（WASM）+ 镜像库**：不引入原生 SQLite 依赖；WASM 经 binary loader 内联。库是 md 的只读查询镜像，md 仍是唯一数据源，事件驱动增量同步 + 启动对账保证最终一致。
- **单行源 + 双模式渲染**：Feedback 的 checkbox 组源文件保持单行（多行横排 CSS 已证伪），渲染交给 CM6 Widget + 阅读模式 PostProcessor，点击回写文本。
- **相对路径链接**：nav / 课次包内链接用 `./`（同级）与 `../`（父级）前缀，避免同名文件串扰与移动失效。

## 6. 构建与发布

- **包管理**：pnpm（`packageManager: pnpm@10.32.1`），Node `^20.19.0 || >=22.12.0`。
- **构建**：`pnpm run build` = `tsc -noEmit -skipLibCheck` + `node esbuild.config.mjs production`（[esbuild.config.mjs](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/esbuild.config.mjs)）。entry `src/main.ts` + `src/styles.css`，`loader: { ".wasm": "binary" }` 内联 WASM，产物落到 `dist/`（main.js + styles.css），末尾 `copyFileSync` 复制 manifest.json。
- **开发**：`pnpm run dev`（watch）。**校验**：`pnpm run lint`（eslint）、`pnpm run check`（svelte-check）。**测试**：`pnpm test`（vitest）、`pnpm run test:e2e`（vitest e2e）。
- **发布**：[.github/workflows/release.yml](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/.github/workflows/release.yml) 由 tag `v*` 触发：Setup pnpm → 校验 `package.json` / `manifest.json` / tag **三者版本一致** → Build → 校验产物（main.js / manifest.json / styles.css）→ 创建 Release（自动生成 release notes）。

## 7. 约定

- **XDF 自研代码一律放 `src/xdf/`**，对上游主代码的修改只允许集中在 `XdfBaseExtension` 装配点；不要散落改动 `ai/`、`engine/`、`formatters/`、`gui/`。
- **md 是唯一数据源**，数据库只是查询镜像；任何写库逻辑不得反向覆盖 md。
- 预设脚本 / Choice 必须登记进 `PRESET_SCRIPTS`（[scripts/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/index.ts)）/ `PRESET_FOLDERS`（[choiceManager.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/choiceManager.ts)）才会被释放与同步；脚本 id 全局唯一。
- 表结构以仓库外「数据库模板.sql」为权威，改结构需同步 [Schema.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Schema.ts) 的 DDL 副本并递增 `SCHEMA_VERSION`。
- 脚本经 `app.plugins.plugins["xdf-base"].api` 取 QuickAdd API，经 `.settings.folderStructure` 取三文件夹路径。
- 版本号三处需一致：`package.json` / `manifest.json` / release tag。
- 变更流程：完成一项待办 → 从 [PENDING.md](./PENDING.md) 删除 → 在 [DEVLOG.md](./DEVLOG.md) 追加 → 现状变了就更新本文件。

## 8. 已知技术债

取自 [PENDING.md](./PENDING.md)「代码审查整改计划（2026-10-04）」，此处只列架构层面的记录点：

- **AI 产物无条件覆盖当前笔记**（[wordlist-ai.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/wordlist-ai.ts)、[homework-ai.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/homework-ai.ts)），无备份 / 预览 / 确认。
- **homework-ai 半成品脚本仍在 `PRESET_SCRIPTS`**（[scripts/index.ts:75-81](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/index.ts#L75-L81)），每次启动随插件释放。
- **词表工具手写 JSON 清洗脆弱**（围栏剥离 / 括号夹取 / 静默兜底），应改结构化输出。
- **`XdfBaseExtension` 承担过多实现细节**：`reconcileOnStartup` 是 63 行上帝函数；归档/恢复与授课布局耦合在同一 `file-menu` 回调；`relocateArchive` 内联了归档业务逻辑，应下沉。计划拆出 `Reconciler` / `menus/archiveMenu.ts` / `menus/teachingLayoutMenu.ts`（暂缓）。
- **DB 层**：`Connection.save()` 直接 writeBinary 非原子（[127-144](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts#L127-L144)）；`clear()` 失败后内存/磁盘状态分裂（[161-173](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts#L161-L173)）。
- **frontmatter `status` 无边界正则替换**（[XdfBaseExtension.ts:220-223](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L220-L223)）。
- **`Sync.handleEvent` 不区分 create/modify**（[Sync.ts:101-104](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Sync.ts#L101-L104)），语义丢失。
- **对 `TFile[]` 调 `sort()` 未传比较器**（[meeting-record.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/meeting-record.ts)、[meeting-add-page.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/scripts/meeting-add-page.ts)）。
- **授课布局重复点击累积 popout 窗口**（[XdfBaseExtension.ts:237-279](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts#L237-L279)）。
