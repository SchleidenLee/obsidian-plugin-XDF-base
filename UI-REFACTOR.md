# XDF Base (QuickAdd) UI 改造方案

## 状态：📋 待改造

## 现状问题

- ❌ 没有 Banner
- ❌ 用声明式 `getSettingDefinitions()` 返回分组
- ❌ 没有版本/作者信息
- ✅ 已经有分组概念（选项/打包/AI/数据库/高级）

## 改造方案

### 1. 添加 Banner

```html
<div class="xdf-banner">
  <div class="xdf-banner-icon">⚡</div>
  <div>
    <h1 class="xdf-banner-title">XDF Base</h1>
    <p class="xdf-banner-desc">QuickAdd 脚本引擎 + AI 调用</p>
  </div>
</div>
```

### 2. 调整设置分区

**首页（高频设置）：**
- 选项（QuickAdd 的选项列表 Svelte 组件）

**高级设置（折叠区）：**
- AI 助手
- 数据库
- 打包

### 3. 添加 Footer

```html
<div class="xdf-footer">
  <span class="xdf-version">v1.3.1</span>
  <span class="xdf-author">· Schleiden</span>
</div>
```

## 改动文件

- `src/quickAddSettingsTab.ts` — 添加 Banner/Footer，调整 `getSettingDefinitions()` 返回结构

## 预估工作量

- Banner/Footer：~20 行 HTML
- 设置分区调整：~30 行（把 AI/数据库/打包分组移到高级设置）
