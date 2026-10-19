/**
 * XDF 共享脚本运行时（双入口）
 * 释放到 00.SYSTEM/xdf_base/utils/XdfRuntime.js
 *
 * QuickAdd 侧：脚本的 MOD.entry 用 new Function 载入本文件，调 run(MOD)，
 * 以 native ctx（逐项弹窗）顺序跑 collect → execute。
 * 面板侧不加载本文件：由 ScriptRunner 直接驱动 collect / execute。
 */

export const XDF_RUNTIME_SCRIPT = String.raw`/**
 * XDF 脚本运行时 · QuickAdd 原生入口
 *
 * 让同一份 { collect, execute } 脚本在 QuickAdd 里顺序跑完：
 *   collect（逐项弹窗）→ execute（只写盘）
 *
 * 只依赖 Obsidian 全局 app / Notice，与 QuickAdd 的求值方式一致。
 */

function getApi(hostApp) {
    const plugins = hostApp.plugins.plugins;
    const p = plugins["xdf-base"] || plugins.quickadd;
    if (!p || !p.api) throw new Error("XDF Base / QuickAdd 未加载");
    return p.api;
}

function showNotice(message) {
    new Notice(String(message));
}

async function ask(api, field) {
    const label = field.label || field.id;
    const options = field.options || [];

    switch (field.type) {
        case "dropdown":
        case "suggester":
        case "file-picker":
        case "field-suggest": {
            if (!options.length) {
                return await api.inputPrompt(label, field.placeholder, field.defaultValue);
            }
            const display = field.displayOptions || options;
            return await api.suggester(display, options, field.placeholder || label, false);
        }
        case "textarea":
            return await api.wideInputPrompt(label, field.placeholder, field.defaultValue);
        case "date":
            return await api.datePrompt(label, {
                placeholder: field.placeholder,
                defaultValue: field.defaultValue,
                dateFormat: field.dateFormat || "YYYY-MM-DD"
            });
        case "text":
        case "number":
        case "slider":
        default:
            return await api.inputPrompt(label, field.placeholder, field.defaultValue);
    }
}

function createContext(hostApp, scriptId, asker) {
    return {
        app: hostApp,
        mode: "native",
        scriptId: scriptId,
        ask: asker,
        notice: showNotice
    };
}

async function run(mod) {
    const hostApp = app;
    const api = getApi(hostApp);
    const scriptId = (mod.meta && mod.meta.title) || "script";

    const collectCtx = createContext(hostApp, scriptId, function (field) {
        return ask(api, field);
    });
    const params = (await mod.collect(collectCtx)) || {};

    const executeCtx = createContext(hostApp, scriptId, function (field) {
        throw new Error("execute 阶段禁止调用 ctx.ask()（字段：" + field.id + "）—— 输入必须在 collect 阶段收集");
    });
    await mod.execute(params, executeCtx);
}

module.exports = {
    run: run,
    createContext: createContext
};
`;
