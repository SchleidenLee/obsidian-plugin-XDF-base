# XDF Base

XDF 教学系统核心 Obsidian 插件：在 [QuickAdd](https://github.com/chhoumann/quickadd) 引擎之上扩展了新东方教学业务所需的脚本释放、Choice 同步、AI 调用与 SQLite 数据库能力。

> 本插件是 QuickAdd 的深度定制分支。QuickAdd 的模板（Template）/ 捕获（Capture）/ 宏（Macro）/ 组合（Multi）Choice 引擎完整保留，XDF 自研代码位于 `src/xdf/`，与上游源码物理隔离。

## 功能

### 1. 预设脚本自动释放

每次插件启动时，把内置脚本（建档、每课记录、词表、行政等）**全量释放**到 vault 的 `00.SYSTEM/xdf_base/scripts/` 目录：

- 脚本升级随插件更新自动送达，无需手动同步
- 缺失自动补回（自愈）
- 只覆盖预设清单内的文件，用户新建的脚本不受影响

### 2. Choice 自动同步

- 现行分组文件夹 id 为 `xdf-group-<分组>`，单条脚本 id 为 `xdf-script-<中文名>`；已存在的分组按 id **原位重建** children，并保留折叠状态
- 缺失的预设分组自动追加
- `xdf-base-*` 与 `xdf-panel-*` 是已退役前缀，启动时连同已消失的旧 `xdf-group-*` 文件夹一并清理
- 用户自建的 Choice 与其他设置完全不动

### 3. 教学记录脚本（QuickAdd UserScript）

当前释放 **8 个业务脚本 + 2 个共享资产**。业务脚本按源码目录分组：

| 分组 | 脚本 |
|------|------|
| 档案管理 | 一对一建档、班课建档、一对一每课记录、班课每课记录 |
| 文件生成 | 词表工具 |
| 行政工作 | 周例会建档、周例会记录、例会添加页面 |

共享资产（不进菜单、不进面板）：`ArchiveUtils.js`、`XdfRuntime.js`。「AI 出作业」已从清单移除，不再释放。

内置 7 文件课次包体系：每节课生成 `nav / Note / Wordlist / Grammar / Homework / Quiz / Feedback`，统一 frontmatter 契约：

- 档案页：`#档案` + `#vip`（一对一）/ `#class`（班课）
- 课次页：`#课程记录` + `#vip` / `#class`，frontmatter `links` 维护 上一课 → 档案首页 → 下一课 链接链
- 公共工具函数集中在 `00.SYSTEM/xdf_base/utils/ArchiveUtils.js`，业务脚本只做编排

### 4. AI 能力

内置 AI（LLM）调用能力，供脚本以函数形式调用。当前业务脚本里实际使用它的是「词表工具」；设置页不需要用户填写 prompt。「AI 出作业」脚本已删除，不再随插件释放。

### 5. SQLite 数据库同步

基于 sql.js (WASM) 的 vault 数据同步层，数据落地到 `vault/.xdf/xdf.db`（隐藏目录），供 MCP 工具与 AI 查询：

- **Schema v3，10 张表**：实体层 `students` / `archives` / `lessons` / `class_roster` / `student_profile`，内容层 `sections` / `files` / `checkboxes`，语义层 `attendance` / `homework`
- **契约文件全量细粒度入库**：档案页、课次 nav、课次包 7 文件、反馈页——frontmatter 实体化、正文按 heading 切块（`👤 张三/原始记录/出勤` 级路径）、checkbox 三来源解析（HTML / markdown task / 单行内联组）
- **脏数据只登记路径**：契约外的 md 与非 md 附件（pdf/ppt 等）在 files 表登记路径与归属，不读内容
- **增量同步**：文件变更 500ms debounce + 2s 节流，只重写受影响文件的行；上课连续记笔记不打扰
- **启动自愈**：空库自动全量重建；旧库按 mtime 对账补漏（外部改动文件不丢）
- **最终一致**：md 是唯一数据源，数据库落后最多约 2.5 秒；同步失败写入 `00.SYSTEM/Logs/ai-log.md`
- **查询入口**：公开门面只有 `query` / `status` / `isSyncEnabled`，挂在 `app.plugins.plugins["xdf-base"].api.db`。`query` 运行在 `PRAGMA query_only=ON` 下，不提供 `exec` / `rebuild`。插件内部模块亦可 `import { getXdfBaseInstance }`

### 6. Feedback 内联 checkbox 组

出勤/作业等勾选项采用**单行组格式**，一行既是源码也是数据：

```
9月1日出勤情况：[x] 正常 | [ ] 迟到 | [ ] 早退 | [ ] 线上课 | [ ] 请假
第8次作业：[ ] 已完成 | [ ] 未完成
```

- **实时预览**：CodeMirror 6 ViewPlugin + WidgetType 渲染为真实 checkbox，点击直接改写源码 `[ ]`/`[x]`，不破坏编辑器几何（无光标漂移）；纯源码模式不过滤、显示原文
- **阅读模式**：MarkdownPostProcessor 渲染同样的交互组件
- **自动入库**：勾选状态经增量同步写入 `checkboxes` 表（`source='inline'`），可按 `section_path` 聚合查询出勤/作业结论；组行下手写的评语文字随 `sections.body` 一并入库
- **模板内置**：新生成的课次包 Feedback 自动使用该格式，旧格式（`出勤：…` 独立行）完全兼容

## 构建

```bash
pnpm install
pnpm run build     # 产物输出到 dist/（main.js + styles.css + manifest.json）
```

将 `dist/` 下的三件套拷贝到 `vault/.obsidian/plugins/xdf-base/` 即可安装。

开发模式：

```bash
pnpm run dev       # watch 增量构建
```

## 使用

1. 启用插件后，脚本自动释放到 `00.SYSTEM/xdf_base/`
2. QuickAdd 菜单中出现预设 Choice（一对一建档 / 班课建档 / 每课记录等）
3. 设置页提供脚本重新释放、数据库状态等管理入口

## 致谢

- 上游项目：[QuickAdd by chhoumann](https://github.com/chhoumann/quickadd)（MIT License）
- 本插件延续上游 MIT 协议开源
