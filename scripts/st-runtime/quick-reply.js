/**
 * Nika ST Runtime - SillyTavern Quick Reply (v2) Implementation
 * 100% compatible with SillyTavern Quick Reply v2 JSON import/export,
 * QuickReplyApi, #qr--bar button bar, context menus, slash commands,
 * and auto-execution lifecycle hooks.
 */

import {
    chat,
    characters,
    this_chid,
    chat_metadata,
    extension_settings,
    eventSource,
    event_types,
    saveSettingsDebounced,
    saveMetadataDebounced,
    substituteParams,
    executeSlashCommandsWithOptions,
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    SlashCommandNamedArgument,
    ARGUMENT_TYPE,
    callGenericPopup,
    POPUP_TYPE,
    POPUP_RESULT,
} from './host.js';

export const QR_SETS_STORAGE_KEY = 'nika_st_quick_reply_sets_v2';

const QR_I18N = {
    zh: {
        invalidSingleQrJson: '内容不是有效的单条快速回复 JSON',
        invalidSetJson: '无效的 SillyTavern Quick Reply JSON 文件（缺少 version 或 name 字段）',
        setExistsErr: '快速回复集 "{name}" 已存在',
        unnamed: '(未命名)',
        noLabel: '(无标签)',
        chainedSuffix: ' (链式)',
        chainedBadge: '链式',
        deleted: '(已删除)',
        missingSuffix: ' (缺失)',
        openQrMenu: '打开快速回复菜单',
        quickReplies: '快速回复',
        openCtxMenu: '打开右键上下文菜单',
        exportedSet: '已导出快速回复集 "{name}.json"',
        invalidJsonFmt: 'JSON 格式不正确',
        singleQrNeedsSet: '这是单条快速回复文件，请先新建或导入一个快速回复集',
        overwriteConfirm: '已存在同名快速回复集「{name}」，是否覆盖？',
        overwriteBtn: '覆盖',
        cancelBtn: '取消',
        saveBtn: '保存',
        deleteBtn: '删除',
        importFailed: '导入 "{name}" 失败：{msg}',
        importSuccess: '成功导入 {count} 个快速回复配置',
        editQrTitle: '编辑快速回复：{set} / {label}',
        labelField: '按钮标签 (label)',
        titleField: '悬停提示 (title)',
        iconField: 'FontAwesome 图标 (如 fa-bolt)',
        iconPlaceholder: '留空不显示图标',
        automationIdField: '世界书联动 ID (automationId)',
        optional: '可选',
        messageField: '回复文本 / STscript 斜杠命令 (message)',
        showLabelFlag: '有图标时同时显示标签',
        isHiddenFlag: '隐藏按钮 (isHidden)',
        preventAutoExecFlag: '阻止递归自动执行',
        execStartupFlag: '启动时自动执行',
        execUserFlag: '用户发言后执行',
        execAiFlag: 'AI 回复后执行',
        execChatChangeFlag: '切换对话时执行',
        execNewChatFlag: '新建对话时执行',
        execBeforeGenFlag: '生成前执行',
        ctxMenuTitle: '右键上下文菜单 (contextList)',
        ctxSelectSet: '-- 选择要挂载的回复集 --',
        ctxChained: '链式执行 (isChained)',
        addBtn: '添加',
        testRunBtn: '测试执行',
        noCtxBindings: '暂无右键菜单绑定',
        selectSetToEnable: '选择要启用的回复集...',
        enableBtn: '启用',
        noEnabledSets: '未启用任何回复集',
        clickToEditSet: '点击编辑此回复集',
        visibleTip: '当前可见（点击隐藏按钮栏但保留自动执行）',
        hiddenTip: '当前隐藏（点击显示到按钮栏）',
        disableSetTip: '取消启用',
        panelTitle: '快速回复 (Quick Reply)',
        compatBadge: '兼容 ST v2 JSON',
        enableQr: '启用快速回复',
        combineDropdown: '合并为下拉菜单',
        autoActivateImport: '导入后自动全局启用',
        showInputShortcut: '输入框左侧显示闪电按钮',
        importStJson: '导入 ST JSON',
        newSetBtn: '新建回复集',
        newSetPrompt: '请输入新快速回复集的名称：',
        duplicateSetToast: '已存在名为 "{name}" 的快速回复集',
        createdSetToast: '已创建快速回复集 "{name}"',
        defaultContinueLabel: '继续',
        activeSetsTitle: '启用的快速回复集',
        globalSets: '全局回复集',
        charSets: '当前角色回复集',
        chatSets: '当前对话回复集',
        noCharSelected: '未选角色',
        selectCharFirst: '请先选择一个角色',
        noActiveChat: '当前无活动对话',
        editSetTitle: '编辑快速回复集',
        emptySetHtml: '当前还没有任何快速回复集。<br>点击上方 <b>「导入 ST JSON」</b> 可直接导入 SillyTavern 导出的 JSON（如 <code>Default.json</code>），或点击 <b>「新建回复集」</b> 从零创建。',
        itemCountSuffix: '条',
        exportBtn: '导出',
        renameBtn: '重命名',
        duplicateBtn: '复制',
        renamePrompt: '请输入新的回复集名称：',
        duplicatePrompt: '请输入复制后的名称：',
        deleteConfirm: '确定要删除快速回复集「{name}」吗？此操作无法撤销。',
        disableSendLabel: '禁止自动发送',
        disableSendTip: '点击按钮时只填入输入框，不立即发送',
        placeBeforeLabel: '插到用户输入前',
        placeBeforeTip: '当输入框已有文字时，将快速回复内容插入到用户输入之前',
        injectInputLabel: '注入用户输入',
        injectInputTip: '保留输入框中的已有文本并与快速回复拼接',
        onlyBorderColorLabel: '仅边框着色',
        buttonColorLabel: '按钮主题色',
        followTheme: '跟随主题',
        clearColorBtn: '清除颜色',
        moveUpTip: '上移',
        moveDownTip: '下移',
        labelPlaceholder: '按钮名称 (label)',
        runNowTip: '立即执行',
        detailConfigTip: '详细配置（图标、提示、隐藏、自动执行、右键菜单）',
        exportSingleTip: '导出单条 .qr.json',
        deleteItemTip: '删除条目',
        msgPlaceholder: '回复内容或 /斜杠命令',
        addItemBtn: '新增回复条目',
        pasteItemBtn: '从剪贴板粘贴条目',
        importSingleBtn: '导入单条 .qr.json',
        newReplyLabel: '新回复',
        clipboardErr: '无法读取剪贴板，请允许剪贴板权限或使用导入文件',
    },
    en: {
        invalidSingleQrJson: 'Content is not valid single Quick Reply JSON',
        invalidSetJson: 'Invalid SillyTavern Quick Reply JSON file (missing version or name)',
        setExistsErr: 'Quick Reply set "{name}" already exists',
        unnamed: '(Unnamed)',
        noLabel: '(No label)',
        chainedSuffix: ' (Chained)',
        chainedBadge: 'Chained',
        deleted: '(Deleted)',
        missingSuffix: ' (Missing)',
        openQrMenu: 'Open Quick Reply menu',
        quickReplies: 'Quick Replies',
        openCtxMenu: 'Open context menu',
        exportedSet: 'Exported Quick Reply set "{name}.json"',
        invalidJsonFmt: 'Invalid JSON format',
        singleQrNeedsSet: 'This is a single Quick Reply item; please create or import a set first',
        overwriteConfirm: 'Quick Reply set "{name}" already exists. Overwrite it?',
        overwriteBtn: 'Overwrite',
        cancelBtn: 'Cancel',
        saveBtn: 'Save',
        deleteBtn: 'Delete',
        importFailed: 'Failed to import "{name}": {msg}',
        importSuccess: 'Imported {count} Quick Reply config(s)',
        editQrTitle: 'Edit Quick Reply: {set} / {label}',
        labelField: 'Button Label (label)',
        titleField: 'Hover Tooltip (title)',
        iconField: 'FontAwesome Icon (e.g. fa-bolt)',
        iconPlaceholder: 'Leave blank for no icon',
        automationIdField: 'World Info Automation ID (automationId)',
        optional: 'Optional',
        messageField: 'Reply Text / STscript Slash Command (message)',
        showLabelFlag: 'Show label alongside icon',
        isHiddenFlag: 'Hide button (isHidden)',
        preventAutoExecFlag: 'Prevent recursive auto-execute',
        execStartupFlag: 'Execute on startup',
        execUserFlag: 'Execute on user message',
        execAiFlag: 'Execute on AI reply',
        execChatChangeFlag: 'Execute on chat change',
        execNewChatFlag: 'Execute on new chat',
        execBeforeGenFlag: 'Execute before generation',
        ctxMenuTitle: 'Context Menu (contextList)',
        ctxSelectSet: '-- Select set to attach --',
        ctxChained: 'Chained execution (isChained)',
        addBtn: 'Add',
        testRunBtn: 'Test Run',
        noCtxBindings: 'No context menu bindings yet',
        selectSetToEnable: 'Select a set to enable...',
        enableBtn: 'Enable',
        noEnabledSets: 'No active sets',
        clickToEditSet: 'Click to edit this set',
        visibleTip: 'Visible (click to hide from bar while keeping auto-execute)',
        hiddenTip: 'Hidden (click to show on Quick Reply bar)',
        disableSetTip: 'Disable set',
        panelTitle: 'Quick Reply',
        compatBadge: 'ST v2 JSON Compatible',
        enableQr: 'Enable Quick Replies',
        combineDropdown: 'Combine into Dropdown',
        autoActivateImport: 'Auto-enable Global on Import',
        showInputShortcut: 'Show Bolt Button by Input',
        importStJson: 'Import ST JSON',
        newSetBtn: 'New Set',
        newSetPrompt: 'Enter a name for the new Quick Reply set:',
        duplicateSetToast: 'A Quick Reply set named "{name}" already exists',
        createdSetToast: 'Created Quick Reply set "{name}"',
        defaultContinueLabel: 'Continue',
        activeSetsTitle: 'Active Quick Reply Sets',
        globalSets: 'Global Sets',
        charSets: 'Character Sets',
        chatSets: 'Chat Sets',
        noCharSelected: 'No Character',
        selectCharFirst: 'Please select a character first',
        noActiveChat: 'No active chat',
        editSetTitle: 'Edit Quick Reply Set',
        emptySetHtml: 'No Quick Reply sets yet.<br>Click <b>"Import ST JSON"</b> above to import SillyTavern JSON files (e.g. <code>Default.json</code>), or click <b>"New Set"</b> to create one from scratch.',
        itemCountSuffix: 'items',
        exportBtn: 'Export',
        renameBtn: 'Rename',
        duplicateBtn: 'Duplicate',
        renamePrompt: 'Enter new set name:',
        duplicatePrompt: 'Enter name for duplicated set:',
        deleteConfirm: 'Delete Quick Reply set "{name}"? This action cannot be undone.',
        disableSendLabel: 'Disable Auto-Send',
        disableSendTip: 'Fill chat input on click without sending immediately',
        placeBeforeLabel: 'Place Before Input',
        placeBeforeTip: 'Insert Quick Reply before existing text in the chat input',
        injectInputLabel: 'Inject User Input',
        injectInputTip: 'Keep existing input text and combine with Quick Reply',
        onlyBorderColorLabel: 'Border Color Only',
        buttonColorLabel: 'Button Color',
        followTheme: 'Theme Default',
        clearColorBtn: 'Clear Color',
        moveUpTip: 'Move Up',
        moveDownTip: 'Move Down',
        labelPlaceholder: 'Button label',
        runNowTip: 'Run Now',
        detailConfigTip: 'Detailed settings (icon, tooltip, visibility, auto-execute, context menu)',
        exportSingleTip: 'Export single .qr.json',
        deleteItemTip: 'Delete Item',
        msgPlaceholder: 'Reply text or /slash command',
        addItemBtn: 'Add Item',
        pasteItemBtn: 'Paste from Clipboard',
        importSingleBtn: 'Import .qr.json',
        newReplyLabel: 'New Reply',
        clipboardErr: 'Cannot read clipboard. Please allow clipboard permission or import from file.',
    },
};

function getQrLang() {
    try {
        return localStorage.getItem('language') === 'en' ? 'en' : 'zh';
    } catch {
        return 'zh';
    }
}

function qrT(key, vars = null) {
    const lang = getQrLang();
    let text = QR_I18N[lang]?.[key] ?? QR_I18N.zh[key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? ''));
        }
    }
    return text;
}

function notifyToast(type, msg, title = '') {
    try {
        if (window.toastr && typeof window.toastr[type] === 'function') {
            window.toastr[type](msg, title);
            return;
        }
    } catch {}
    console.log(`[QR:${type}]`, title, msg);
}

function isTrueBoolean(val) {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    const s = String(val ?? '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// Pure Frontend Set Persistence (shared with host.js /api/quick-replies/*)
// ============================================================

export function readStoredQrSetsRaw() {
    try {
        const raw = localStorage.getItem(QR_SETS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function writeStoredQrSetsRaw(setsArr) {
    try {
        localStorage.setItem(QR_SETS_STORAGE_KEY, JSON.stringify(setsArr || []));
    } catch (e) {
        console.warn('[QR2] Failed to persist QR sets:', e);
    }
}

function persistAllSetsFromMemory() {
    writeStoredQrSetsRaw(QuickReplySet.list.map(s => s.toJSON()));
}

// ============================================================
// Core Data Models (100% ST QuickReply v2 Schema)
// ============================================================

export class QuickReplyContextLink {
    constructor(setOrName = null, isChained = false) {
        this._setName = typeof setOrName === 'string' ? setOrName : (setOrName?.name || '');
        this._setObj = typeof setOrName === 'object' && setOrName ? setOrName : null;
        this.isChained = !!isChained;
    }

    static from(props = {}) {
        const setVal = props?.set ?? props?.preset ?? '';
        const chained = !!(props?.isChained ?? props?.chain ?? false);
        return new QuickReplyContextLink(setVal, chained);
    }

    get set() {
        if (this._setObj && !this._setObj.isDeleted) return this._setObj;
        if (this._setName) {
            const found = QuickReplySet.get(this._setName);
            if (found) {
                this._setObj = found;
                return found;
            }
        }
        return null;
    }

    set set(val) {
        if (typeof val === 'string') {
            this._setName = val;
            this._setObj = QuickReplySet.get(val) || null;
        } else if (val && typeof val === 'object') {
            this._setObj = val;
            this._setName = val.name || '';
        } else {
            this._setObj = null;
            this._setName = '';
        }
    }

    toJSON() {
        return {
            set: this.set?.name || this._setName || '',
            isChained: !!this.isChained,
        };
    }
}

export class QuickReply {
    static from(props = {}) {
        const qr = new QuickReply();
        qr.id = Number.isFinite(Number(props.id)) ? Number(props.id) : 1;
        if (props.icon !== undefined && props.icon !== null && props.icon !== '') {
            qr.icon = String(props.icon);
        }
        qr.showLabel = !!props.showLabel;
        qr.label = props.label !== undefined ? String(props.label) : '';
        qr.title = props.title !== undefined ? String(props.title) : '';
        qr.message = props.message !== undefined ? String(props.message) : '';
        qr.contextList = Array.isArray(props.contextList)
            ? props.contextList.map(it => QuickReplyContextLink.from(it))
            : [];
        qr.preventAutoExecute = props.preventAutoExecute !== undefined ? !!props.preventAutoExecute : true;
        qr.isHidden = !!props.isHidden;
        qr.executeOnStartup = !!props.executeOnStartup;
        qr.executeOnUser = !!props.executeOnUser;
        qr.executeOnAi = !!props.executeOnAi;
        qr.executeOnChatChange = !!props.executeOnChatChange;
        qr.executeOnGroupMemberDraft = !!props.executeOnGroupMemberDraft;
        qr.executeOnNewChat = !!props.executeOnNewChat;
        qr.executeBeforeGeneration = !!props.executeBeforeGeneration;
        qr.automationId = props.automationId !== undefined ? String(props.automationId) : '';
        return qr;
    }

    constructor() {
        this.id = 1;
        this.icon = undefined;
        this.showLabel = false;
        this.label = '';
        this.title = '';
        this.message = '';
        this.contextList = [];
        this.preventAutoExecute = true;
        this.isHidden = false;
        this.executeOnStartup = false;
        this.executeOnUser = false;
        this.executeOnAi = false;
        this.executeOnChatChange = false;
        this.executeOnGroupMemberDraft = false;
        this.executeOnNewChat = false;
        this.executeBeforeGeneration = false;
        this.automationId = '';

        this.onExecute = null;
        this.onDelete = null;
        this.onUpdate = null;
    }

    get hasContext() {
        return Array.isArray(this.contextList) && this.contextList.some(it => !!it.set);
    }

    updateIcon(val) {
        this.icon = val ? String(val).trim() : undefined;
        this.onUpdate?.(this);
    }
    updateShowLabel(val) {
        this.showLabel = !!val;
        this.onUpdate?.(this);
    }
    updateLabel(val) {
        this.label = String(val ?? '');
        this.onUpdate?.(this);
    }
    updateTitle(val) {
        this.title = String(val ?? '');
        this.onUpdate?.(this);
    }
    updateMessage(val) {
        this.message = String(val ?? '');
        this.onUpdate?.(this);
    }

    addContextLink(cl) {
        this.contextList.push(cl instanceof QuickReplyContextLink ? cl : QuickReplyContextLink.from(cl));
        this.onUpdate?.(this);
    }
    removeContextLink(setName) {
        const idx = this.contextList.findIndex(it => (it.set?.name || it._setName) === setName);
        if (idx > -1) {
            this.contextList.splice(idx, 1);
            this.onUpdate?.(this);
        }
    }
    clearContextLinks() {
        if (this.contextList.length) {
            this.contextList.splice(0, this.contextList.length);
            this.onUpdate?.(this);
        }
    }

    delete() {
        this.onDelete?.(this);
    }

    async execute(args = {}, isEditor = false, isRun = false, options = {}) {
        if (this.message?.length > 0 && this.onExecute) {
            const scope = {};
            for (const key of Object.keys(args || {})) {
                if (key[0] === '_' || key === 'isAutoExecute') continue;
                scope[`arg::${key}`] = args[key];
            }
            scope['arg::*'] = '';
            return await this.onExecute(this, {
                message: this.message,
                isAutoExecute: !!(args && args.isAutoExecute),
                isEditor,
                isRun,
                scope,
                executionOptions: options,
            });
        }
        return '';
    }

    toJSON() {
        const out = {
            id: this.id,
        };
        if (this.icon) out.icon = this.icon;
        out.showLabel = !!this.showLabel;
        out.label = this.label ?? '';
        out.title = this.title ?? '';
        out.message = this.message ?? '';
        out.contextList = (this.contextList || []).map(c => (c.toJSON ? c.toJSON() : c));
        out.preventAutoExecute = !!this.preventAutoExecute;
        out.isHidden = !!this.isHidden;
        out.executeOnStartup = !!this.executeOnStartup;
        out.executeOnUser = !!this.executeOnUser;
        out.executeOnAi = !!this.executeOnAi;
        out.executeOnChatChange = !!this.executeOnChatChange;
        out.executeOnGroupMemberDraft = !!this.executeOnGroupMemberDraft;
        out.executeOnNewChat = !!this.executeOnNewChat;
        out.executeBeforeGeneration = !!this.executeBeforeGeneration;
        out.automationId = this.automationId ?? '';
        return out;
    }
}

export class QuickReplySet {
    static list = [];

    static migrateV1ToV2(raw) {
        const slots = Array.isArray(raw.quickReplySlots) ? raw.quickReplySlots : [];
        const qrList = slots.map((slot, idx) => ({
            id: idx + 1,
            showLabel: false,
            label: slot.label ?? '',
            title: slot.title ?? '',
            message: slot.mes ?? '',
            contextList: (slot.contextMenu ?? []).map(it => ({
                set: it.preset ?? '',
                isChained: !!it.chain,
            })),
            preventAutoExecute: true,
            isHidden: !!slot.hidden,
            executeOnStartup: !!slot.autoExecute_appStartup,
            executeOnUser: !!slot.autoExecute_userMessage,
            executeOnAi: !!slot.autoExecute_botMessage,
            executeOnChatChange: !!slot.autoExecute_chatLoad,
            executeOnGroupMemberDraft: !!slot.autoExecute_groupMemberDraft,
            executeOnNewChat: !!slot.autoExecute_newChat,
            executeBeforeGeneration: !!slot.autoExecute_beforeGeneration,
            automationId: slot.automationId ?? '',
        }));
        return {
            version: 2,
            name: String(raw.name || 'Imported'),
            disableSend: !!raw.quickActionEnabled,
            placeBeforeInput: !!raw.placeBeforeInputEnabled,
            injectInput: !!raw.AutoInputInject,
            color: raw.color || 'rgba(0, 0, 0, 0)',
            onlyBorderColor: !!raw.onlyBorderColor,
            qrList,
            idIndex: qrList.length,
        };
    }

    static from(props = {}) {
        const normalized = props.version !== 2 && Array.isArray(props.quickReplySlots)
            ? QuickReplySet.migrateV1ToV2(props)
            : props;
        const set = new QuickReplySet();
        set.name = String(normalized.name ?? 'Unnamed');
        set.disableSend = !!normalized.disableSend;
        set.placeBeforeInput = !!normalized.placeBeforeInput;
        set.injectInput = !!normalized.injectInput;
        set.color = normalized.color !== undefined ? String(normalized.color) : 'rgba(0, 0, 0, 0)';
        set.onlyBorderColor = !!normalized.onlyBorderColor;
        set.qrList = Array.isArray(normalized.qrList) ? normalized.qrList.map(it => QuickReply.from(it)) : [];
        const maxId = set.qrList.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0);
        set.idIndex = Math.max(Number(normalized.idIndex) || 0, maxId);
        set.init();
        return set;
    }

    static get(name) {
        return this.list.find(it => it.name === name);
    }

    constructor() {
        this.name = '';
        this.scope = 'global';
        this.disableSend = false;
        this.placeBeforeInput = false;
        this.injectInput = false;
        this.color = 'rgba(0, 0, 0, 0)';
        this.onlyBorderColor = false;
        this.qrList = [];
        this.idIndex = 0;
        this.isDeleted = false;
    }

    init() {
        this.qrList.forEach(qr => this.hookQuickReply(qr));
    }

    hookQuickReply(qr) {
        qr.onExecute = (_, options) => this.executeWithOptions(qr, options);
        qr.onDelete = () => this.removeQuickReply(qr);
        qr.onUpdate = () => this.save();
    }

    addQuickReply(data = {}) {
        const nextId = Math.max(this.idIndex, this.qrList.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0)) + 1;
        this.idIndex = nextId;
        const qr = QuickReply.from({ ...data, id: nextId });
        this.qrList.push(qr);
        this.hookQuickReply(qr);
        this.save();
        return qr;
    }

    addQuickReplyFromText(qrJson) {
        let data = null;
        if (qrJson && String(qrJson).trim()) {
            try {
                const parsed = JSON.parse(qrJson);
                if (parsed && typeof parsed === 'object') {
                    delete parsed.id;
                    if (parsed.label === undefined && parsed.message === undefined) {
                        notifyToast('error', qrT('invalidSingleQrJson'));
                        return null;
                    }
                    data = parsed;
                }
            } catch {
                data = { label: String(qrJson).trim().slice(0, 16), message: String(qrJson) };
            }
        } else {
            data = {};
        }
        return this.addQuickReply(data);
    }

    removeQuickReply(qr) {
        const idx = this.qrList.indexOf(qr);
        if (idx > -1) {
            this.qrList.splice(idx, 1);
            this.save();
        }
    }

    async executeWithOptions(qr, options = {}) {
        const opts = Object.assign({
            message: null,
            isAutoExecute: false,
            isEditor: false,
            isRun: false,
            scope: null,
            executionOptions: {},
        }, options || {});

        const chatInput = document.getElementById('chat-input');
        const stTextarea = document.getElementById('send_textarea');
        const currentInput = chatInput ? chatInput.value : (stTextarea ? stTextarea.value : '');
        const finalMessage = opts.message ?? qr.message ?? '';

        let input;
        if (!opts.isAutoExecute && !opts.isEditor && !opts.isRun && this.injectInput && currentInput.length > 0) {
            input = this.placeBeforeInput
                ? `${finalMessage} ${currentInput}`
                : `${currentInput} ${finalMessage}`;
        } else {
            input = finalMessage;
        }

        const trimmedForCmd = input.trimStart();
        if (trimmedForCmd.startsWith('/') && !this.disableSend) {
            const result = await executeSlashCommandsWithOptions(trimmedForCmd, Object.assign({}, opts.executionOptions, {
                scope: opts.scope || {},
                source: `${this.name}.${qr.label}`,
            }));
            return typeof result === 'object' ? (result?.pipe ?? '') : String(result ?? '');
        }

        const substituted = substituteParams(input);
        if (chatInput) {
            chatInput.value = substituted;
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            chatInput.focus();
        }
        if (stTextarea) {
            stTextarea.value = substituted;
        }

        if (!this.disableSend) {
            const sendBtn = document.getElementById('send-button') || document.getElementById('send_but');
            if (sendBtn) sendBtn.click();
        }
        return substituted;
    }

    async execute(qr, message = null, isAutoExecute = false, scope = null) {
        return this.executeWithOptions(qr, { message, isAutoExecute, scope });
    }

    toJSON() {
        return {
            version: 2,
            name: this.name,
            disableSend: !!this.disableSend,
            placeBeforeInput: !!this.placeBeforeInput,
            injectInput: !!this.injectInput,
            color: this.color || 'rgba(0, 0, 0, 0)',
            onlyBorderColor: !!this.onlyBorderColor,
            qrList: this.qrList.map(q => q.toJSON()),
            idIndex: this.idIndex,
        };
    }

    async save() {
        persistAllSetsFromMemory();
        qrManager?.refreshAll?.();
    }

    async delete() {
        const idx = QuickReplySet.list.indexOf(this);
        if (idx > -1) {
            QuickReplySet.list.splice(idx, 1);
            this.isDeleted = true;
        }
        persistAllSetsFromMemory();
        qrManager?.refreshAll?.();
    }
}

export class QuickReplySetLink {
    static from(props = {}) {
        const link = new QuickReplySetLink();
        const rawSet = props?.set;
        link._setName = typeof rawSet === 'string' ? rawSet : (rawSet?.name || '');
        link._setObj = typeof rawSet === 'object' && rawSet ? rawSet : QuickReplySet.get(link._setName) || null;
        link.isVisible = props?.isVisible !== undefined ? !!props.isVisible : true;
        return link;
    }

    constructor(set = null, isVisible = true) {
        this._setName = typeof set === 'string' ? set : (set?.name || '');
        this._setObj = typeof set === 'object' && set ? set : null;
        this.isVisible = !!isVisible;
    }

    get set() {
        if (this._setObj && !this._setObj.isDeleted) return this._setObj;
        if (this._setName) {
            const found = QuickReplySet.get(this._setName);
            if (found) {
                this._setObj = found;
                return found;
            }
        }
        return null;
    }

    set set(val) {
        if (typeof val === 'string') {
            this._setName = val;
            this._setObj = QuickReplySet.get(val) || null;
        } else if (val && typeof val === 'object') {
            this._setObj = val;
            this._setName = val.name || '';
        } else {
            this._setObj = null;
            this._setName = '';
        }
    }

    toJSON() {
        return {
            set: this.set?.name || this._setName || '',
            isVisible: !!this.isVisible,
        };
    }
}

export class QuickReplyConfig {
    static from(props = {}) {
        const cfg = new QuickReplyConfig();
        cfg.setList = Array.isArray(props?.setList)
            ? props.setList.map(it => QuickReplySetLink.from(it)).filter(l => l._setName || l._setObj)
            : [];
        return cfg;
    }

    constructor() {
        this.scope = 'global';
        this.setList = [];
        this.onUpdate = null;
    }

    hasSet(set) {
        const name = typeof set === 'string' ? set : set?.name;
        return this.setList.some(l => (l.set?.name || l._setName) === name);
    }

    addSet(set, isVisible = true) {
        const name = typeof set === 'string' ? set : set?.name;
        if (!name) return;
        const existing = this.setList.find(l => (l.set?.name || l._setName) === name);
        if (existing) {
            existing.isVisible = !!isVisible;
        } else {
            this.setList.push(new QuickReplySetLink(set, isVisible));
        }
        this.onUpdate?.();
    }

    removeSet(set) {
        const name = typeof set === 'string' ? set : set?.name;
        const before = this.setList.length;
        this.setList = this.setList.filter(l => (l.set?.name || l._setName) !== name);
        if (this.setList.length !== before) this.onUpdate?.();
    }

    toggleVisible(set) {
        const name = typeof set === 'string' ? set : set?.name;
        const found = this.setList.find(l => (l.set?.name || l._setName) === name);
        if (found) {
            found.isVisible = !found.isVisible;
            this.onUpdate?.();
        }
    }

    toJSON() {
        return {
            setList: this.setList.map(l => l.toJSON()),
        };
    }
}

export class QuickReplySettings {
    static from(props = {}) {
        const inst = new QuickReplySettings();
        inst.isEnabled = props.isEnabled !== undefined ? !!props.isEnabled : true;
        inst.isCombined = !!props.isCombined;
        inst.isPopout = !!props.isPopout;
        inst.showPopoutButton = props.showPopoutButton !== undefined ? !!props.showPopoutButton : true;
        inst.showInputShortcut = !!props.showInputShortcut;
        inst.config = QuickReplyConfig.from(props.config || { setList: [] });
        inst.config.scope = 'global';
        inst.characterConfigs = {};
        for (const [k, v] of Object.entries(props.characterConfigs || {})) {
            const cc = QuickReplyConfig.from(v);
            cc.scope = 'character';
            inst.characterConfigs[k] = cc;
        }
        inst.init();
        return inst;
    }

    constructor() {
        this.isEnabled = true;
        this.isCombined = false;
        this.isPopout = false;
        this.showPopoutButton = true;
        this.showInputShortcut = false;
        this.config = new QuickReplyConfig();
        this.characterConfigs = {};
        this._chatConfig = null;
        this._charConfig = null;
        this.onSave = null;
    }

    get chatConfig() { return this._chatConfig; }
    set chatConfig(val) {
        if (this._chatConfig !== val) {
            if (this._chatConfig) this._chatConfig.onUpdate = null;
            this._chatConfig = val;
            if (this._chatConfig) this._chatConfig.onUpdate = () => this.save();
        }
    }

    get charConfig() { return this._charConfig; }
    set charConfig(val) {
        if (this._charConfig !== val) {
            if (this._charConfig) this._charConfig.onUpdate = null;
            this._charConfig = val;
            if (this._charConfig) this._charConfig.onUpdate = () => this.save();
        }
    }

    init() {
        if (this.config) this.config.onUpdate = () => this.save();
        if (this._chatConfig) this._chatConfig.onUpdate = () => this.save();
        if (this._charConfig) this._charConfig.onUpdate = () => this.save();
    }

    save() {
        extension_settings.quickReplyV2 = this.toJSON();
        saveSettingsDebounced();
        if (this.chatConfig) {
            chat_metadata.quickReply = this.chatConfig.toJSON();
            saveMetadataDebounced();
        }
        this.onSave?.();
    }

    toJSON() {
        const charCfgs = {};
        for (const [k, v] of Object.entries(this.characterConfigs || {})) {
            if (v?.setList?.length) charCfgs[k] = v.toJSON();
        }
        return {
            isEnabled: this.isEnabled,
            isCombined: this.isCombined,
            isPopout: this.isPopout,
            showPopoutButton: this.showPopoutButton,
            showInputShortcut: this.showInputShortcut,
            config: this.config.toJSON(),
            characterConfigs: charCfgs,
        };
    }
}

// ============================================================
// Auto-Execute Handler
// ============================================================

class AutoExecuteHandler {
    constructor(settings) {
        this.settings = settings;
        this.preventAutoExecuteStack = [];
    }

    checkExecute() {
        return this.settings.isEnabled && !this.preventAutoExecuteStack[this.preventAutoExecuteStack.length - 1];
    }

    getCommands(flagName) {
        const collect = (cfg) => (cfg?.setList || [])
            .map(l => (l.set ? l.set.qrList.filter(qr => !!qr[flagName]) : []))
            .flat();
        return [
            ...collect(this.settings.config),
            ...collect(this.settings.chatConfig),
            ...collect(this.settings.charConfig),
        ];
    }

    async performAutoExecute(qrList) {
        for (const qr of qrList) {
            this.preventAutoExecuteStack.push(!!qr.preventAutoExecute);
            try {
                await qr.execute({ isAutoExecute: true });
            } catch (ex) {
                console.warn('[QR2] Auto-execute error:', ex);
            } finally {
                this.preventAutoExecuteStack.pop();
            }
        }
    }

    async handleStartup() { if (this.checkExecute()) await this.performAutoExecute(this.getCommands('executeOnStartup')); }
    async handleUser() { if (this.checkExecute()) await this.performAutoExecute(this.getCommands('executeOnUser')); }
    async handleAi() { if (this.checkExecute()) await this.performAutoExecute(this.getCommands('executeOnAi')); }
    async handleChatChanged() { if (this.checkExecute()) await this.performAutoExecute(this.getCommands('executeOnChatChange')); }
    async handleNewChat() { if (this.checkExecute()) await this.performAutoExecute(this.getCommands('executeOnNewChat')); }
    async handleBeforeGeneration() { if (this.checkExecute()) await this.performAutoExecute(this.getCommands('executeBeforeGeneration')); }

    async handleWIActivation(entries) {
        if (!this.checkExecute() || !Array.isArray(entries) || entries.length === 0) return;
        const automationIds = entries.map(e => e?.automationId).filter(Boolean);
        if (!automationIds.length) return;
        const collect = (cfg) => (cfg?.setList || [])
            .map(l => (l.set ? l.set.qrList.filter(qr => qr.automationId && automationIds.includes(qr.automationId)) : []))
            .flat();
        await this.performAutoExecute([
            ...collect(this.settings.config),
            ...collect(this.settings.chatConfig),
            ...collect(this.settings.charConfig),
        ]);
    }
}

// ============================================================
// Public QuickReplyApi (100% ST QuickReplyApi compatible)
// ============================================================

export class QuickReplyApi {
    constructor(settings, manager) {
        this.settings = settings;
        this.manager = manager;
    }

    getSetByQr(qr) {
        return QuickReplySet.list.find(it => it.qrList.includes(qr));
    }

    getSetByName(name) {
        return QuickReplySet.get(name);
    }

    getQrByLabel(setName, label) {
        const set = this.getSetByName(setName);
        if (!set) return undefined;
        if (Number.isInteger(label)) return set.qrList.find(it => it.id === label);
        return set.qrList.find(it => it.label === label);
    }

    listSets(scope = 'all') {
        if (scope === 'global') return this.settings.config.setList.map(l => l.set?.name || l._setName).filter(Boolean);
        if (scope === 'chat') return (this.settings.chatConfig?.setList || []).map(l => l.set?.name || l._setName).filter(Boolean);
        if (scope === 'character') return (this.settings.charConfig?.setList || []).map(l => l.set?.name || l._setName).filter(Boolean);
        return QuickReplySet.list.map(s => s.name);
    }

    listQuickReplies(setName) {
        const set = this.getSetByName(setName);
        return set ? set.qrList.map(q => q.label) : [];
    }

    async executeQuickReplyByIndex(idx) {
        const all = [
            ...this.settings.config.setList,
            ...(this.settings.chatConfig?.setList || []),
            ...(this.settings.charConfig?.setList || []),
        ].map(l => l.set?.qrList || []).flat();
        const qr = all[idx];
        if (!qr) throw new Error(`No quick reply at index "${idx}"`);
        return await qr.execute();
    }

    async executeQuickReply(setName, label, args = {}, options = {}) {
        const qr = this.getQrByLabel(setName, label);
        if (!qr) throw new Error(`No quick reply with label "${label}" in set "${setName}" found.`);
        return await qr.execute(args, false, false, options);
    }

    toggleGlobalSet(name, isVisible = true) {
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        if (this.settings.config.hasSet(set)) this.settings.config.removeSet(set);
        else this.settings.config.addSet(set, isVisible);
    }
    addGlobalSet(name, isVisible = true) {
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        this.settings.config.addSet(set, isVisible);
    }
    removeGlobalSet(name) {
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        this.settings.config.removeSet(set);
    }

    toggleChatSet(name, isVisible = true) {
        if (!this.settings.chatConfig) return;
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        if (this.settings.chatConfig.hasSet(set)) this.settings.chatConfig.removeSet(set);
        else this.settings.chatConfig.addSet(set, isVisible);
    }
    addChatSet(name, isVisible = true) {
        if (!this.settings.chatConfig) return;
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        this.settings.chatConfig.addSet(set, isVisible);
    }
    removeChatSet(name) {
        if (!this.settings.chatConfig) return;
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        this.settings.chatConfig.removeSet(set);
    }

    createQuickReply(setName, label, props = {}) {
        const set = this.getSetByName(setName);
        if (!set) throw new Error(`No quick reply set named "${setName}" found.`);
        return set.addQuickReply({ ...props, label: label ?? '' });
    }

    updateQuickReply(setName, label, props = {}) {
        const qr = this.getQrByLabel(setName, label);
        if (!qr) throw new Error(`No quick reply with label "${label}" in set "${setName}" found.`);
        if (props.icon !== undefined) qr.icon = props.icon || undefined;
        if (props.showLabel !== undefined) qr.showLabel = !!props.showLabel;
        if (props.newLabel !== undefined) qr.label = String(props.newLabel);
        if (props.message !== undefined) qr.message = String(props.message);
        if (props.title !== undefined) qr.title = String(props.title);
        if (props.isHidden !== undefined) qr.isHidden = !!props.isHidden;
        if (props.preventAutoExecute !== undefined) qr.preventAutoExecute = !!props.preventAutoExecute;
        if (props.executeOnStartup !== undefined) qr.executeOnStartup = !!props.executeOnStartup;
        if (props.executeOnUser !== undefined) qr.executeOnUser = !!props.executeOnUser;
        if (props.executeOnAi !== undefined) qr.executeOnAi = !!props.executeOnAi;
        if (props.executeOnChatChange !== undefined) qr.executeOnChatChange = !!props.executeOnChatChange;
        if (props.executeOnGroupMemberDraft !== undefined) qr.executeOnGroupMemberDraft = !!props.executeOnGroupMemberDraft;
        if (props.executeOnNewChat !== undefined) qr.executeOnNewChat = !!props.executeOnNewChat;
        if (props.executeBeforeGeneration !== undefined) qr.executeBeforeGeneration = !!props.executeBeforeGeneration;
        if (props.automationId !== undefined) qr.automationId = String(props.automationId);
        qr.onUpdate?.(qr);
        return qr;
    }

    deleteQuickReply(setName, label) {
        const qr = this.getQrByLabel(setName, label);
        if (!qr) throw new Error(`No quick reply with label "${label}" in set "${setName}" found.`);
        qr.delete();
    }

    createContextItem(setName, label, contextSetName, isChained = false) {
        const qr = this.getQrByLabel(setName, label);
        const set = this.getSetByName(contextSetName);
        if (!qr) throw new Error(`No quick reply "${label}" in set "${setName}".`);
        if (!set) throw new Error(`No quick reply set "${contextSetName}".`);
        qr.addContextLink(new QuickReplyContextLink(set, isChained));
    }

    deleteContextItem(setName, label, contextSetName) {
        const qr = this.getQrByLabel(setName, label);
        if (!qr) throw new Error(`No quick reply "${label}" in set "${setName}".`);
        qr.removeContextLink(contextSetName);
    }

    clearContextMenu(setName, label) {
        const qr = this.getQrByLabel(setName, label);
        if (!qr) throw new Error(`No quick reply "${label}" in set "${setName}".`);
        qr.clearContextLinks();
    }

    async createSet(name, { disableSend = false, placeBeforeInput = false, injectInput = false, color = 'rgba(0, 0, 0, 0)', onlyBorderColor = false } = {}) {
        const set = new QuickReplySet();
        set.name = String(name);
        set.disableSend = !!disableSend;
        set.placeBeforeInput = !!placeBeforeInput;
        set.injectInput = !!injectInput;
        set.color = color;
        set.onlyBorderColor = !!onlyBorderColor;
        const old = this.getSetByName(set.name);
        if (old) {
            QuickReplySet.list.splice(QuickReplySet.list.indexOf(old), 1, set);
        } else {
            QuickReplySet.list.push(set);
            QuickReplySet.list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        }
        await set.save();
        return set;
    }

    async updateSet(name, props = {}) {
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        if (props.disableSend !== undefined) set.disableSend = !!props.disableSend;
        if (props.placeBeforeInput !== undefined) set.placeBeforeInput = !!props.placeBeforeInput;
        if (props.injectInput !== undefined) set.injectInput = !!props.injectInput;
        if (props.color !== undefined) set.color = String(props.color);
        if (props.onlyBorderColor !== undefined) set.onlyBorderColor = !!props.onlyBorderColor;
        await set.save();
        return set;
    }

    async deleteSet(name) {
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        await this.manager.doDeleteSet(set);
    }

    async importSetFromJson(jsonInput, { activateGlobal = true, overwrite = true } = {}) {
        const raw = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
        if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || (!Number.isInteger(raw.version) && !Array.isArray(raw.quickReplySlots))) {
            throw new Error(qrT('invalidSetJson'));
        }
        const imported = QuickReplySet.from(JSON.parse(JSON.stringify(raw)));
        const existing = this.getSetByName(imported.name);
        if (existing) {
            if (!overwrite) throw new Error(qrT('setExistsErr', { name: imported.name }));
            const idx = QuickReplySet.list.indexOf(existing);
            QuickReplySet.list.splice(idx, 1, imported);
            // Update references in configs
            for (const cfg of [this.settings.config, this.settings.chatConfig, ...Object.values(this.settings.characterConfigs)]) {
                cfg?.setList?.forEach(l => {
                    if (l._setName === imported.name || l._setObj === existing) l.set = imported;
                });
            }
        } else {
            QuickReplySet.list.push(imported);
            QuickReplySet.list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        }
        if (activateGlobal && !this.settings.config.hasSet(imported)) {
            this.settings.config.addSet(imported, true);
        }
        await imported.save();
        this.settings.save();
        this.manager.selectedSetName = imported.name;
        this.manager.refreshAll();
        return imported;
    }

    exportSetToJson(name) {
        const set = this.getSetByName(name);
        if (!set) throw new Error(`No quick reply set with name "${name}" found.`);
        return JSON.stringify(set.toJSON());
    }

    onLanguageChanged() {
        this.manager?.refreshAll?.();
    }
}

// ============================================================
// Floating Context Menu & Combined Menu Helper
// ============================================================

let activeContextMenuEl = null;

function closeContextMenu() {
    if (activeContextMenuEl) {
        activeContextMenuEl.remove();
        activeContextMenuEl = null;
    }
}

function showFloatingMenu(anchorEvt, items, headerText = '') {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'nika-qr-ctx-menu';
    if (headerText) {
        const h = document.createElement('div');
        h.className = 'nika-qr-ctx-header';
        h.textContent = headerText;
        menu.appendChild(h);
    }
    for (const item of items) {
        if (item.header) {
            const h = document.createElement('div');
            h.className = 'nika-qr-ctx-header';
            h.textContent = item.header;
            menu.appendChild(h);
            continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nika-qr-ctx-item';
        if (item.title) btn.title = item.title;
        if (item.icon) {
            const ic = document.createElement('i');
            ic.className = `fa-solid ${item.icon}`;
            btn.appendChild(ic);
        }
        const sp = document.createElement('span');
        sp.textContent = item.label || qrT('unnamed');
        btn.appendChild(sp);
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            closeContextMenu();
            await item.onClick?.();
        });
        menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    activeContextMenuEl = menu;

    // Position smartly inside viewport
    const rect = menu.getBoundingClientRect();
    const x = anchorEvt?.clientX ?? (anchorEvt?.currentTarget?.getBoundingClientRect?.().left || 40);
    const y = anchorEvt?.clientY ?? (anchorEvt?.currentTarget?.getBoundingClientRect?.().top || 200);
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 12));
    const top = Math.max(8, (y - rect.height - 8 > 8) ? (y - rect.height - 8) : Math.min(y + 8, window.innerHeight - rect.height - 12));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    setTimeout(() => {
        const onDocClick = (ev) => {
            if (!menu.contains(ev.target)) {
                closeContextMenu();
                document.removeEventListener('mousedown', onDocClick, true);
            }
        };
        document.addEventListener('mousedown', onDocClick, true);
    }, 0);
}

function openQrContextMenu(qr, evt) {
    const items = [];
    for (const link of (qr.contextList || [])) {
        const ctxSet = link.set;
        if (!ctxSet) continue;
        items.push({ header: ctxSet.name + (link.isChained ? qrT('chainedSuffix') : '') });
        for (const subQr of ctxSet.qrList.filter(q => !q.isHidden)) {
            items.push({
                label: subQr.label || qrT('noLabel'),
                icon: subQr.icon,
                title: subQr.title || subQr.message,
                onClick: async () => {
                    if (link.isChained) {
                        const pipe = await qr.execute();
                        await subQr.execute({ pipe });
                    } else {
                        await subQr.execute();
                    }
                },
            });
        }
    }
    if (!items.length) return;
    showFloatingMenu(evt, items);
}

// ============================================================
// UI Manager: #qr--bar Button Bar + ST Plugins Modal Settings Tab
// ============================================================

class QuickReplyManager {
    constructor(settings) {
        this.settings = settings;
        this.selectedSetName = QuickReplySet.list[0]?.name || '';
        this.autoActivateOnImport = true;
        this.settingsRoot = null;
        this.barContainer = null;
    }

    injectStyles() {
        if (document.getElementById('nika-qr-style')) return;
        const style = document.createElement('style');
        style.id = 'nika-qr-style';
        style.textContent = `
            #qr--bar .nika-qr-user-sets {
                display: contents;
            }
            #qr--bar .nika-qr-set-group {
                display: inline-flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 6px;
            }
            #qr--bar .qr--button {
                display: inline-flex !important;
                align-items: center;
                gap: 5px;
                user-select: none;
                line-height: 1.3;
                white-space: nowrap;
            }
            #qr--bar .nika-qr-set-group.qr--color .qr--button {
                background: var(--qr--color) !important;
                border-color: var(--qr--color) !important;
            }
            #qr--bar .nika-qr-set-group.qr--color.qr--borderColor .qr--button {
                background: var(--card-bg-color) !important;
                border-color: var(--qr--color) !important;
                border-width: 1.5px !important;
            }
            #qr--bar .qr--button .qr--button-expander {
                margin-left: 2px;
                padding: 0 3px;
                opacity: 0.7;
                font-weight: 700;
            }
            #qr--bar .qr--button .qr--button-expander:hover {
                opacity: 1;
            }
            #qr--bar .qr--hidden {
                display: none !important;
            }
            .nika-qr-ctx-menu {
                position: fixed;
                z-index: 2147483645;
                min-width: 170px;
                max-width: 280px;
                max-height: 360px;
                overflow-y: auto;
                background: var(--card-bg-color, #1e1f24);
                color: var(--text-color, #e5e7eb);
                border: 1px solid var(--border-color, #32343d);
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
                padding: 5px;
            }
            .nika-qr-ctx-header {
                font-size: 11px;
                font-weight: 600;
                opacity: 0.65;
                padding: 4px 8px 2px;
                border-bottom: 1px solid var(--border-color, #32343d);
                margin-bottom: 3px;
            }
            .nika-qr-ctx-item {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 7px;
                padding: 6px 9px;
                border: none;
                border-radius: 7px;
                background: transparent;
                color: inherit;
                font-size: 12.5px;
                text-align: left;
                cursor: pointer;
            }
            .nika-qr-ctx-item:hover {
                background: color-mix(in srgb, var(--primary-color, #f59e0b) 16%, transparent);
                color: var(--primary-color, #f59e0b);
            }

            /* Quick Reply Settings Panel */
            #qr--settings {
                display: flex;
                flex-direction: column;
                gap: 12px;
                color: var(--text-color);
                font-size: 13px;
            }
            .nika-qr-card {
                border: 1px solid var(--border-color);
                border-radius: 12px;
                background: var(--card-bg-color);
                padding: 12px 14px;
            }
            .nika-qr-card-title {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                font-size: 13.5px;
                font-weight: 700;
                margin-bottom: 10px;
                color: var(--text-color);
            }
            .nika-qr-row {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 8px;
            }
            .nika-qr-btn {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 5px 10px;
                border-radius: 8px;
                border: 1px solid var(--border-color);
                background: var(--bg-color);
                color: var(--text-color);
                font-size: 12px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .nika-qr-btn:hover {
                border-color: var(--primary-color);
                color: var(--primary-color);
            }
            .nika-qr-btn-primary {
                background: var(--primary-color);
                border-color: var(--primary-color);
                color: #fff;
            }
            .nika-qr-btn-primary:hover {
                opacity: 0.9;
                color: #fff;
            }
            .nika-qr-btn-danger:hover {
                border-color: #ef4444;
                color: #ef4444;
            }
            .nika-qr-input, .nika-qr-select, .nika-qr-textarea {
                background: var(--bg-color);
                color: var(--text-color);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 5px 9px;
                font-size: 12.5px;
                outline: none;
            }
            .nika-qr-input:focus, .nika-qr-select:focus, .nika-qr-textarea:focus {
                border-color: var(--primary-color);
            }
            .nika-qr-scope-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 10px;
            }
            .nika-qr-scope-box {
                border: 1px solid var(--border-color);
                border-radius: 10px;
                padding: 9px 10px;
                background: var(--bg-color);
            }
            .nika-qr-scope-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
                padding: 4px 7px;
                border-radius: 7px;
                background: var(--card-bg-color);
                border: 1px solid var(--border-color);
                margin-top: 6px;
                font-size: 12px;
            }
            .nika-qr-item-card {
                display: flex;
                flex-direction: column;
                gap: 7px;
                padding: 9px 10px;
                border: 1px solid var(--border-color);
                border-radius: 10px;
                background: var(--bg-color);
                transition: border-color 0.15s ease;
            }
            .nika-qr-item-card:focus-within {
                border-color: color-mix(in srgb, var(--primary-color) 65%, var(--border-color));
            }
            .nika-qr-item-head {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }
            .nika-qr-item-order {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                flex-shrink: 0;
            }
            .nika-qr-icon-btn {
                width: 28px;
                height: 28px;
                padding: 0 !important;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 7px;
                border: 1px solid var(--border-color);
                background: var(--card-bg-color);
                color: var(--text-color);
                font-size: 11.5px;
                cursor: pointer;
                flex-shrink: 0;
                transition: all 0.15s ease;
            }
            .nika-qr-icon-btn:hover:not(:disabled) {
                border-color: var(--primary-color);
                color: var(--primary-color);
            }
            .nika-qr-icon-btn:disabled {
                opacity: 0.35;
                cursor: not-allowed;
            }
            .nika-qr-icon-btn.danger:hover {
                border-color: #ef4444;
                color: #ef4444;
            }
            .nika-qr-item-label {
                flex: 1;
                min-width: 0;
                height: 28px;
                padding: 3px 8px !important;
                font-weight: 600;
            }
            .nika-qr-item-acts {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
            }
            .nika-qr-item-card textarea {
                width: 100%;
                min-height: 44px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 12px;
                line-height: 1.45;
                box-sizing: border-box;
            }
            .nika-qr-switches-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px 12px;
            }
            @media (min-width: 640px) {
                .nika-qr-switches-grid {
                    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
                }
            }
            .nika-qr-toolbar-actions {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 6px;
                width: 100%;
            }
            .nika-qr-toolbar-actions .nika-qr-btn {
                justify-content: center;
                padding: 6px 6px;
                white-space: nowrap;
            }
            .nika-qr-opts-box {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 10px 12px;
                border-radius: 10px;
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                margin-bottom: 10px;
            }
            .nika-qr-color-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding-top: 6px;
                border-top: 1px dashed var(--border-color);
                flex-wrap: wrap;
            }
            .nika-qr-badge {
                display: inline-flex;
                align-items: center;
                padding: 2px 7px;
                border-radius: 999px;
                font-size: 11px;
                background: color-mix(in srgb, var(--primary-color) 16%, transparent);
                color: var(--primary-color);
                white-space: nowrap;
            }
            .nika-qr-editor-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 8px;
                margin-top: 8px;
            }
            .nika-qr-check {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 12.5px;
                cursor: pointer;
                user-select: none;
                min-width: 0;
            }
        `;
        document.head.appendChild(style);
    }

    getActiveVisibleLinks() {
        if (!this.settings.isEnabled) return [];
        const links = [
            ...(this.settings.config?.setList || []),
            ...(this.settings.charConfig?.setList || []),
            ...(this.settings.chatConfig?.setList || []),
        ];
        const seen = new Set();
        const out = [];
        for (const l of links) {
            if (!l.isVisible) continue;
            const s = l.set;
            if (!s || seen.has(s.name)) continue;
            seen.add(s.name);
            out.push(s);
        }
        return out;
    }

    syncInputShortcutButton() {
        const btn = document.getElementById('nika-qr-open-btn');
        if (btn) {
            btn.style.display = this.settings.showInputShortcut ? 'inline-flex' : 'none';
        }
    }

    renderBar() {
        this.syncInputShortcutButton();
        const qrBar = document.getElementById('qr--bar');
        if (!qrBar) return;
        let container = document.getElementById('nika-qr-user-sets');
        if (!container) {
            container = document.createElement('div');
            container.id = 'nika-qr-user-sets';
            container.className = 'nika-qr-user-sets';
            qrBar.prepend(container);
        }
        this.barContainer = container;
        container.innerHTML = '';

        const activeSets = this.getActiveVisibleLinks();
        if (!activeSets.length) return;

        if (this.settings.isCombined) {
            const btn = document.createElement('div');
            btn.className = 'qr--button menu_button';
            btn.title = qrT('openQrMenu');
            btn.innerHTML = `<i class="fa-solid fa-bolt"></i><span>${escapeHtml(qrT('quickReplies'))}</span>`;
            btn.addEventListener('click', (evt) => {
                evt.stopPropagation();
                const items = [];
                for (const set of activeSets) {
                    const visibleQrs = set.qrList.filter(q => !q.isHidden);
                    if (!visibleQrs.length) continue;
                    items.push({ header: set.name });
                    for (const qr of visibleQrs) {
                        items.push({
                            label: qr.label || qrT('noLabel'),
                            icon: qr.icon,
                            title: qr.title || qr.message,
                            onClick: () => qr.execute(),
                        });
                    }
                }
                showFloatingMenu(evt, items);
            });
            container.appendChild(btn);
            return;
        }

        for (const set of activeSets) {
            const visibleQrs = set.qrList.filter(q => !q.isHidden);
            if (!visibleQrs.length) continue;
            const group = document.createElement('div');
            group.className = 'qr--buttons nika-qr-set-group';
            group.dataset.qrSet = set.name;
            if (set.color && set.color !== 'transparent' && set.color !== 'rgba(0, 0, 0, 0)') {
                group.style.setProperty('--qr--color', set.color);
                group.classList.add('qr--color');
                if (set.onlyBorderColor) group.classList.add('qr--borderColor');
            }
            for (const qr of visibleQrs) {
                const btn = document.createElement('div');
                btn.className = 'qr--button menu_button';
                btn.dataset.qrId = String(qr.id);
                btn.dataset.qrLabel = qr.label;
                if (qr.hasContext) btn.classList.add('qr--hasCtx');
                btn.title = qr.title || qr.message || qr.label;

                if (qr.icon) {
                    const ic = document.createElement('i');
                    ic.className = `qr--button-icon fa-solid ${qr.icon}`;
                    btn.appendChild(ic);
                }
                const lbl = document.createElement('span');
                lbl.className = 'qr--button-label';
                if (qr.icon && !qr.showLabel) lbl.classList.add('qr--hidden');
                lbl.textContent = qr.label || qrT('noLabel');
                btn.appendChild(lbl);

                if (qr.hasContext) {
                    const exp = document.createElement('span');
                    exp.className = 'qr--button-expander';
                    exp.textContent = '⋮';
                    exp.title = qrT('openCtxMenu');
                    exp.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        evt.preventDefault();
                        openQrContextMenu(qr, evt);
                    });
                    btn.appendChild(exp);
                }

                btn.addEventListener('contextmenu', (evt) => {
                    if (qr.hasContext) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        openQrContextMenu(qr, evt);
                    }
                });

                btn.addEventListener('click', (evt) => {
                    if (evt.ctrlKey) {
                        this.openQrDetailModal(set, qr);
                        return;
                    }
                    qr.execute();
                });

                group.appendChild(btn);
            }
            container.appendChild(group);
        }
    }

    ensureSelectedSet() {
        if (this.selectedSetName && QuickReplySet.get(this.selectedSetName)) {
            return QuickReplySet.get(this.selectedSetName);
        }
        const first = QuickReplySet.list[0] || null;
        this.selectedSetName = first?.name || '';
        return first;
    }

    async doDeleteSet(qrs) {
        if (!qrs) return;
        await qrs.delete();
        for (const cfg of [this.settings.config, this.settings.chatConfig, ...Object.values(this.settings.characterConfigs)]) {
            cfg?.removeSet?.(qrs.name);
        }
        if (this.selectedSetName === qrs.name) {
            this.selectedSetName = QuickReplySet.list[0]?.name || '';
        }
        this.settings.save();
        this.refreshAll();
    }

    exportSetDownload(qrs) {
        if (!qrs) return;
        const jsonStr = JSON.stringify(qrs.toJSON());
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${qrs.name}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notifyToast('success', qrT('exportedSet', { name: qrs.name }));
    }

    async handleImportFiles(fileList) {
        if (!fileList || !fileList.length) return;
        let okCount = 0;
        for (const file of Array.from(fileList)) {
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (!parsed || typeof parsed !== 'object') throw new Error(qrT('invalidJsonFmt'));

                // Support importing single QR file if current set exists and no version/name
                if (!Number.isInteger(parsed.version) && !Array.isArray(parsed.quickReplySlots) && (parsed.label !== undefined || parsed.message !== undefined)) {
                    const cur = this.ensureSelectedSet();
                    if (!cur) throw new Error(qrT('singleQrNeedsSet'));
                    cur.addQuickReplyFromText(text);
                    okCount++;
                    continue;
                }

                const existing = QuickReplySet.get(parsed.name);
                let overwrite = true;
                if (existing) {
                    const res = await callGenericPopup(
                        qrT('overwriteConfirm', { name: escapeHtml(parsed.name) }),
                        POPUP_TYPE.CONFIRM,
                        '',
                        { okButton: qrT('overwriteBtn'), cancelButton: qrT('cancelBtn') }
                    );
                    if (res !== POPUP_RESULT.AFFIRMATIVE) continue;
                }
                await quickReplyApi.importSetFromJson(parsed, {
                    activateGlobal: this.autoActivateOnImport,
                    overwrite,
                });
                okCount++;
            } catch (ex) {
                notifyToast('error', qrT('importFailed', { name: file.name, msg: ex.message }));
            }
        }
        if (okCount > 0) {
            notifyToast('success', qrT('importSuccess', { count: okCount }));
        }
    }

    async openQrDetailModal(set, qr) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;text-align:left;font-size:13px;';
        wrap.innerHTML = `
            <div style="font-weight:700;font-size:15px;">${escapeHtml(qrT('editQrTitle', { set: set.name, label: qr.label || qrT('unnamed') }))}</div>
            <div class="nika-qr-editor-grid">
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span>${escapeHtml(qrT('labelField'))}</span>
                    <input type="text" class="nika-qr-input" data-f="label" value="${escapeHtml(qr.label)}">
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span>${escapeHtml(qrT('titleField'))}</span>
                    <input type="text" class="nika-qr-input" data-f="title" value="${escapeHtml(qr.title)}">
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span>${escapeHtml(qrT('iconField'))}</span>
                    <input type="text" class="nika-qr-input" data-f="icon" value="${escapeHtml(qr.icon || '')}" placeholder="${escapeHtml(qrT('iconPlaceholder'))}">
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span>${escapeHtml(qrT('automationIdField'))}</span>
                    <input type="text" class="nika-qr-input" data-f="automationId" value="${escapeHtml(qr.automationId || '')}" placeholder="${escapeHtml(qrT('optional'))}">
                </label>
            </div>
            <label style="display:flex;flex-direction:column;gap:4px;">
                <span>${escapeHtml(qrT('messageField'))}</span>
                <textarea class="nika-qr-textarea" data-f="message" rows="5" style="width:100%;font-family:monospace;">${escapeHtml(qr.message)}</textarea>
            </label>
            <div class="nika-qr-editor-grid">
                <label class="nika-qr-check"><input type="checkbox" data-f="showLabel" ${qr.showLabel ? 'checked' : ''}> ${escapeHtml(qrT('showLabelFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="isHidden" ${qr.isHidden ? 'checked' : ''}> ${escapeHtml(qrT('isHiddenFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="preventAutoExecute" ${qr.preventAutoExecute ? 'checked' : ''}> ${escapeHtml(qrT('preventAutoExecFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="executeOnStartup" ${qr.executeOnStartup ? 'checked' : ''}> ${escapeHtml(qrT('execStartupFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="executeOnUser" ${qr.executeOnUser ? 'checked' : ''}> ${escapeHtml(qrT('execUserFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="executeOnAi" ${qr.executeOnAi ? 'checked' : ''}> ${escapeHtml(qrT('execAiFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="executeOnChatChange" ${qr.executeOnChatChange ? 'checked' : ''}> ${escapeHtml(qrT('execChatChangeFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="executeOnNewChat" ${qr.executeOnNewChat ? 'checked' : ''}> ${escapeHtml(qrT('execNewChatFlag'))}</label>
                <label class="nika-qr-check"><input type="checkbox" data-f="executeBeforeGeneration" ${qr.executeBeforeGeneration ? 'checked' : ''}> ${escapeHtml(qrT('execBeforeGenFlag'))}</label>
            </div>
            <div style="border-top:1px solid var(--border-color);padding-top:8px;">
                <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(qrT('ctxMenuTitle'))}</div>
                <div class="nika-qr-row" style="margin-bottom:6px;">
                    <select class="nika-qr-select" data-ctx-sel>
                        <option value="">${escapeHtml(qrT('ctxSelectSet'))}</option>
                        ${QuickReplySet.list.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <label class="nika-qr-check"><input type="checkbox" data-ctx-chain> ${escapeHtml(qrT('ctxChained'))}</label>
                    <button type="button" class="nika-qr-btn" data-ctx-add><i class="fa-solid fa-plus"></i> ${escapeHtml(qrT('addBtn'))}</button>
                </div>
                <div data-ctx-list style="display:flex;flex-direction:column;gap:4px;"></div>
            </div>
            <div class="nika-qr-row" style="justify-content:flex-end;margin-top:4px;">
                <button type="button" class="nika-qr-btn" data-test-run><i class="fa-solid fa-play"></i> ${escapeHtml(qrT('testRunBtn'))}</button>
            </div>
        `;

        const renderCtxList = () => {
            const box = wrap.querySelector('[data-ctx-list]');
            box.innerHTML = '';
            if (!qr.contextList.length) {
                box.innerHTML = `<div style="font-size:12px;opacity:0.6;">${escapeHtml(qrT('noCtxBindings'))}</div>`;
                return;
            }
            qr.contextList.forEach((cl, idx) => {
                const row = document.createElement('div');
                row.className = 'nika-qr-scope-item';
                const sName = cl.set?.name || cl._setName || qrT('deleted');
                row.innerHTML = `<span>${escapeHtml(sName)} ${cl.isChained ? `<span class="nika-qr-badge">${escapeHtml(qrT('chainedBadge'))}</span>` : ''}</span>`;
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'nika-qr-btn nika-qr-btn-danger';
                del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                del.addEventListener('click', () => {
                    qr.contextList.splice(idx, 1);
                    qr.onUpdate?.(qr);
                    renderCtxList();
                });
                row.appendChild(del);
                box.appendChild(row);
            });
        };
        renderCtxList();

        wrap.querySelector('[data-ctx-add]').addEventListener('click', () => {
            const name = wrap.querySelector('[data-ctx-sel]').value;
            const chained = wrap.querySelector('[data-ctx-chain]').checked;
            if (!name) return;
            const target = QuickReplySet.get(name);
            if (!target) return;
            qr.addContextLink(new QuickReplyContextLink(target, chained));
            renderCtxList();
        });

        const applyFields = () => {
            qr.label = wrap.querySelector('[data-f="label"]').value;
            qr.title = wrap.querySelector('[data-f="title"]').value;
            const icVal = wrap.querySelector('[data-f="icon"]').value.trim();
            qr.icon = icVal || undefined;
            qr.automationId = wrap.querySelector('[data-f="automationId"]').value.trim();
            qr.message = wrap.querySelector('[data-f="message"]').value;
            qr.showLabel = wrap.querySelector('[data-f="showLabel"]').checked;
            qr.isHidden = wrap.querySelector('[data-f="isHidden"]').checked;
            qr.preventAutoExecute = wrap.querySelector('[data-f="preventAutoExecute"]').checked;
            qr.executeOnStartup = wrap.querySelector('[data-f="executeOnStartup"]').checked;
            qr.executeOnUser = wrap.querySelector('[data-f="executeOnUser"]').checked;
            qr.executeOnAi = wrap.querySelector('[data-f="executeOnAi"]').checked;
            qr.executeOnChatChange = wrap.querySelector('[data-f="executeOnChatChange"]').checked;
            qr.executeOnNewChat = wrap.querySelector('[data-f="executeOnNewChat"]').checked;
            qr.executeBeforeGeneration = wrap.querySelector('[data-f="executeBeforeGeneration"]').checked;
            qr.onUpdate?.(qr);
        };

        wrap.querySelector('[data-test-run]').addEventListener('click', async () => {
            applyFields();
            await qr.execute({}, true, false);
        });

        const res = await callGenericPopup(wrap, POPUP_TYPE.CONFIRM, '', { okButton: qrT('saveBtn'), cancelButton: qrT('cancelBtn'), wide: true });
        if (res === POPUP_RESULT.AFFIRMATIVE) {
            applyFields();
            this.refreshAll();
        }
    }

    renderScopeBox(title, badge, config, emptyMsg) {
        const box = document.createElement('div');
        box.className = 'nika-qr-scope-box';
        box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:600;font-size:12.5px;"><span>${escapeHtml(title)}</span><span class="nika-qr-badge">${escapeHtml(badge)}</span></div>`;

        if (!config) {
            const p = document.createElement('div');
            p.style.cssText = 'font-size:12px;opacity:0.65;';
            p.textContent = emptyMsg;
            box.appendChild(p);
            return box;
        }

        const addRow = document.createElement('div');
        addRow.className = 'nika-qr-row';
        const sel = document.createElement('select');
        sel.className = 'nika-qr-select';
        sel.style.flex = '1';
        sel.style.minWidth = '110px';
        sel.innerHTML = `<option value="">${escapeHtml(qrT('selectSetToEnable'))}</option>` + QuickReplySet.list
            .filter(s => !config.hasSet(s))
            .map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
            .join('');
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'nika-qr-btn';
        addBtn.innerHTML = `<i class="fa-solid fa-plus"></i> ${escapeHtml(qrT('enableBtn'))}`;
        addBtn.addEventListener('click', () => {
            const target = QuickReplySet.get(sel.value);
            if (!target) return;
            config.addSet(target, true);
            this.refreshAll();
        });
        addRow.append(sel, addBtn);
        box.appendChild(addRow);

        if (!config.setList.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:11.5px;opacity:0.6;margin-top:6px;';
            empty.textContent = qrT('noEnabledSets');
            box.appendChild(empty);
        } else {
            for (const link of config.setList) {
                const sName = link.set?.name || link._setName;
                const row = document.createElement('div');
                row.className = 'nika-qr-scope-item';
                const nameSpan = document.createElement('span');
                nameSpan.textContent = sName + (link.set ? ` (${link.set.qrList.length})` : qrT('missingSuffix'));
                nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;';
                nameSpan.title = qrT('clickToEditSet');
                nameSpan.addEventListener('click', () => {
                    if (link.set) {
                        this.selectedSetName = link.set.name;
                        this.renderSettings();
                    }
                });

                const acts = document.createElement('div');
                acts.className = 'nika-qr-row';
                acts.style.gap = '4px';

                const visBtn = document.createElement('button');
                visBtn.type = 'button';
                visBtn.className = 'nika-qr-btn';
                visBtn.style.padding = '3px 6px';
                visBtn.title = link.isVisible ? qrT('visibleTip') : qrT('hiddenTip');
                visBtn.innerHTML = `<i class="fa-solid ${link.isVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
                visBtn.addEventListener('click', () => {
                    config.toggleVisible(sName);
                    this.refreshAll();
                });

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'nika-qr-btn nika-qr-btn-danger';
                delBtn.style.padding = '3px 6px';
                delBtn.title = qrT('disableSetTip');
                delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                delBtn.addEventListener('click', () => {
                    config.removeSet(sName);
                    this.refreshAll();
                });

                acts.append(visBtn, delBtn);
                row.append(nameSpan, acts);
                box.appendChild(row);
            }
        }
        return box;
    }

    renderSettings() {
        const host = document.getElementById('extensions_settings');
        if (!host) return;
        let root = document.getElementById('qr--settings');
        if (!root) {
            root = document.createElement('div');
            root.id = 'qr--settings';
            host.appendChild(root);
        }
        this.settingsRoot = root;
        root.innerHTML = '';

        // 1. General switches + Import/Export quick header
        const generalCard = document.createElement('div');
        generalCard.className = 'nika-qr-card';
        generalCard.innerHTML = `
            <div class="nika-qr-card-title">
                <span><i class="fa-solid fa-bolt" style="color:var(--primary-color);margin-right:6px;"></i>${escapeHtml(qrT('panelTitle'))}</span>
                <span class="nika-qr-badge">${escapeHtml(qrT('compatBadge'))}</span>
            </div>
            <div class="nika-qr-switches-grid" style="margin-bottom:10px;">
                <label class="nika-qr-check"><input type="checkbox" id="qr--isEnabled" ${this.settings.isEnabled ? 'checked' : ''}> ${escapeHtml(qrT('enableQr'))}</label>
                <label class="nika-qr-check"><input type="checkbox" id="qr--isCombined" ${this.settings.isCombined ? 'checked' : ''}> ${escapeHtml(qrT('combineDropdown'))}</label>
                <label class="nika-qr-check"><input type="checkbox" id="qr--autoActivateImport" ${this.autoActivateOnImport ? 'checked' : ''}> ${escapeHtml(qrT('autoActivateImport'))}</label>
                <label class="nika-qr-check"><input type="checkbox" id="qr--showInputShortcut" ${this.settings.showInputShortcut ? 'checked' : ''}> ${escapeHtml(qrT('showInputShortcut'))}</label>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
                <input type="file" id="qr--set-importFile" accept=".json" multiple style="display:none;">
                <button type="button" id="qr--set-import" class="nika-qr-btn nika-qr-btn-primary" style="justify-content:center;padding:7px 10px;"><i class="fa-solid fa-file-import"></i> ${escapeHtml(qrT('importStJson'))}</button>
                <button type="button" id="qr--set-new" class="nika-qr-btn" style="justify-content:center;padding:7px 10px;"><i class="fa-solid fa-plus"></i> ${escapeHtml(qrT('newSetBtn'))}</button>
            </div>
        `;
        root.appendChild(generalCard);

        generalCard.querySelector('#qr--isEnabled').addEventListener('change', (e) => {
            this.settings.isEnabled = e.target.checked;
            this.settings.save();
            this.renderBar();
        });
        generalCard.querySelector('#qr--isCombined').addEventListener('change', (e) => {
            this.settings.isCombined = e.target.checked;
            this.settings.save();
            this.renderBar();
        });
        generalCard.querySelector('#qr--autoActivateImport').addEventListener('change', (e) => {
            this.autoActivateOnImport = e.target.checked;
        });
        generalCard.querySelector('#qr--showInputShortcut').addEventListener('change', (e) => {
            this.settings.showInputShortcut = e.target.checked;
            this.settings.save();
            this.syncInputShortcutButton();
        });

        const importInput = generalCard.querySelector('#qr--set-importFile');
        generalCard.querySelector('#qr--set-import').addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', async () => {
            await this.handleImportFiles(importInput.files);
            importInput.value = '';
        });

        generalCard.querySelector('#qr--set-new').addEventListener('click', async () => {
            const name = await callGenericPopup(qrT('newSetPrompt'), POPUP_TYPE.INPUT, 'MyQuickReplies');
            if (!name || !String(name).trim()) return;
            const trimmed = String(name).trim();
            if (QuickReplySet.get(trimmed)) {
                notifyToast('error', qrT('duplicateSetToast', { name: trimmed }));
                return;
            }
            const created = await quickReplyApi.createSet(trimmed);
            created.addQuickReply({ label: qrT('defaultContinueLabel'), message: 'Continue.' });
            if (this.autoActivateOnImport) {
                this.settings.config.addSet(created, true);
            }
            this.selectedSetName = created.name;
            this.refreshAll();
            notifyToast('success', qrT('createdSetToast', { name: trimmed }));
        });

        // 2. Active set bindings (Global / Character / Chat)
        const scopesCard = document.createElement('div');
        scopesCard.className = 'nika-qr-card';
        scopesCard.innerHTML = `<div class="nika-qr-card-title"><span>${escapeHtml(qrT('activeSetsTitle'))}</span></div>`;
        const grid = document.createElement('div');
        grid.className = 'nika-qr-scope-grid';
        const curCharName = characters[this_chid]?.name || '';
        grid.append(
            this.renderScopeBox(qrT('globalSets'), 'Global', this.settings.config, ''),
            this.renderScopeBox(qrT('charSets'), curCharName || qrT('noCharSelected'), this.settings.charConfig, qrT('selectCharFirst')),
            this.renderScopeBox(qrT('chatSets'), 'Chat', this.settings.chatConfig, qrT('noActiveChat')),
        );
        scopesCard.appendChild(grid);
        root.appendChild(scopesCard);

        // 3. Set Editor
        const editorCard = document.createElement('div');
        editorCard.className = 'nika-qr-card';
        const currentSet = this.ensureSelectedSet();

        const header = document.createElement('div');
        header.className = 'nika-qr-card-title';
        header.innerHTML = `<span>${escapeHtml(qrT('editSetTitle'))}</span>`;
        editorCard.appendChild(header);

        if (!currentSet) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:18px 10px;text-align:center;opacity:0.75;line-height:1.8;';
            empty.innerHTML = qrT('emptySetHtml');
            editorCard.appendChild(empty);
            root.appendChild(editorCard);
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;';
        toolbar.innerHTML = `
            <select id="qr--set" class="nika-qr-select" style="width:100%;">
                ${QuickReplySet.list.map(s => `<option value="${escapeHtml(s.name)}" ${s.name === currentSet.name ? 'selected' : ''}>${escapeHtml(s.name)} (${s.qrList.length} ${escapeHtml(qrT('itemCountSuffix'))})</option>`).join('')}
            </select>
            <div class="nika-qr-toolbar-actions">
                <button type="button" id="qr--set-export" class="nika-qr-btn" style="border-color:color-mix(in srgb,var(--primary-color) 55%,var(--border-color));color:var(--primary-color);"><i class="fa-solid fa-file-export"></i> ${escapeHtml(qrT('exportBtn'))}</button>
                <button type="button" id="qr--set-rename" class="nika-qr-btn"><i class="fa-solid fa-pen"></i> ${escapeHtml(qrT('renameBtn'))}</button>
                <button type="button" id="qr--set-duplicate" class="nika-qr-btn"><i class="fa-solid fa-clone"></i> ${escapeHtml(qrT('duplicateBtn'))}</button>
                <button type="button" id="qr--set-delete" class="nika-qr-btn nika-qr-btn-danger"><i class="fa-solid fa-trash"></i> ${escapeHtml(qrT('deleteBtn'))}</button>
            </div>
        `;
        editorCard.appendChild(toolbar);

        toolbar.querySelector('#qr--set').addEventListener('change', (e) => {
            this.selectedSetName = e.target.value;
            this.renderSettings();
        });
        toolbar.querySelector('#qr--set-export').addEventListener('click', () => this.exportSetDownload(currentSet));
        toolbar.querySelector('#qr--set-rename').addEventListener('click', async () => {
            const newName = await callGenericPopup(qrT('renamePrompt'), POPUP_TYPE.INPUT, currentSet.name);
            if (!newName || !String(newName).trim() || String(newName).trim() === currentSet.name) return;
            const trimmed = String(newName).trim();
            if (QuickReplySet.get(trimmed)) {
                notifyToast('error', qrT('duplicateSetToast', { name: trimmed }));
                return;
            }
            const oldName = currentSet.name;
            currentSet.name = trimmed;
            for (const cfg of [this.settings.config, this.settings.chatConfig, ...Object.values(this.settings.characterConfigs)]) {
                cfg?.setList?.forEach(l => {
                    if (l._setName === oldName || l._setObj === currentSet) l._setName = trimmed;
                });
            }
            this.selectedSetName = trimmed;
            await currentSet.save();
            this.settings.save();
            this.refreshAll();
        });
        toolbar.querySelector('#qr--set-duplicate').addEventListener('click', async () => {
            const newName = await callGenericPopup(qrT('duplicatePrompt'), POPUP_TYPE.INPUT, `${currentSet.name} (Copy)`);
            if (!newName || !String(newName).trim()) return;
            const trimmed = String(newName).trim();
            if (QuickReplySet.get(trimmed)) {
                notifyToast('error', qrT('duplicateSetToast', { name: trimmed }));
                return;
            }
            const cloned = QuickReplySet.from({ ...currentSet.toJSON(), name: trimmed });
            QuickReplySet.list.push(cloned);
            QuickReplySet.list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
            this.selectedSetName = trimmed;
            await cloned.save();
            this.refreshAll();
        });
        toolbar.querySelector('#qr--set-delete').addEventListener('click', async () => {
            const ok = await callGenericPopup(qrT('deleteConfirm', { name: escapeHtml(currentSet.name) }), POPUP_TYPE.CONFIRM, '', { okButton: qrT('deleteBtn'), cancelButton: qrT('cancelBtn') });
            if (ok === POPUP_RESULT.AFFIRMATIVE) {
                await this.doDeleteSet(currentSet);
            }
        });

        // Set-level flags
        const hasColor = currentSet.color && currentSet.color !== 'transparent' && currentSet.color !== 'rgba(0, 0, 0, 0)';
        const optsRow = document.createElement('div');
        optsRow.className = 'nika-qr-opts-box';
        optsRow.innerHTML = `
            <div class="nika-qr-switches-grid">
                <label class="nika-qr-check" title="${escapeHtml(qrT('disableSendTip'))}"><input type="checkbox" id="qr--disableSend" ${currentSet.disableSend ? 'checked' : ''}> ${escapeHtml(qrT('disableSendLabel'))}</label>
                <label class="nika-qr-check" title="${escapeHtml(qrT('placeBeforeTip'))}"><input type="checkbox" id="qr--placeBeforeInput" ${currentSet.placeBeforeInput ? 'checked' : ''}> ${escapeHtml(qrT('placeBeforeLabel'))}</label>
                <label class="nika-qr-check" title="${escapeHtml(qrT('injectInputTip'))}"><input type="checkbox" id="qr--injectInput" ${currentSet.injectInput ? 'checked' : ''}> ${escapeHtml(qrT('injectInputLabel'))}</label>
                <label class="nika-qr-check"><input type="checkbox" id="qr--onlyBorderColor" ${currentSet.onlyBorderColor ? 'checked' : ''}> ${escapeHtml(qrT('onlyBorderColorLabel'))}</label>
            </div>
            <div class="nika-qr-color-row">
                <label class="nika-qr-check" style="gap:8px;">
                    <span>${escapeHtml(qrT('buttonColorLabel'))}</span>
                    <input type="color" id="qr--color" value="${hasColor && /^#[0-9a-f]{6}$/i.test(currentSet.color) ? currentSet.color : '#3b82f6'}" style="width:28px;height:22px;border:1px solid var(--border-color);border-radius:4px;background:transparent;cursor:pointer;padding:0;">
                    <span style="font-size:11px;opacity:0.65;">${hasColor ? escapeHtml(currentSet.color) : escapeHtml(qrT('followTheme'))}</span>
                </label>
                <button type="button" id="qr--colorClear" class="nika-qr-btn" style="padding:3px 9px;font-size:11.5px;">${escapeHtml(qrT('clearColorBtn'))}</button>
            </div>
        `;
        editorCard.appendChild(optsRow);

        optsRow.querySelector('#qr--disableSend').addEventListener('change', (e) => { currentSet.disableSend = e.target.checked; currentSet.save(); });
        optsRow.querySelector('#qr--placeBeforeInput').addEventListener('change', (e) => { currentSet.placeBeforeInput = e.target.checked; currentSet.save(); });
        optsRow.querySelector('#qr--injectInput').addEventListener('change', (e) => { currentSet.injectInput = e.target.checked; currentSet.save(); });
        optsRow.querySelector('#qr--color').addEventListener('input', (e) => { currentSet.color = e.target.value; currentSet.save(); });
        optsRow.querySelector('#qr--colorClear').addEventListener('click', () => { currentSet.color = 'rgba(0, 0, 0, 0)'; currentSet.save(); });
        optsRow.querySelector('#qr--onlyBorderColor').addEventListener('change', (e) => { currentSet.onlyBorderColor = e.target.checked; currentSet.save(); });

        // QR Items list (compact 2-row cards — clean on both mobile and desktop)
        const listEl = document.createElement('div');
        listEl.id = 'qr--set-qrList';
        listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;';

        currentSet.qrList.forEach((qr, idx) => {
            const card = document.createElement('div');
            card.className = 'nika-qr-item-card';
            card.dataset.id = String(qr.id);

            const head = document.createElement('div');
            head.className = 'nika-qr-item-head';

            // Compact inline order controls
            const orderCol = document.createElement('div');
            orderCol.className = 'nika-qr-item-order';
            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'nika-qr-icon-btn';
            upBtn.disabled = idx === 0;
            upBtn.title = qrT('moveUpTip');
            upBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
            upBtn.addEventListener('click', () => {
                if (idx === 0) return;
                [currentSet.qrList[idx - 1], currentSet.qrList[idx]] = [currentSet.qrList[idx], currentSet.qrList[idx - 1]];
                currentSet.save();
            });
            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'nika-qr-icon-btn';
            downBtn.disabled = idx === currentSet.qrList.length - 1;
            downBtn.title = qrT('moveDownTip');
            downBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
            downBtn.addEventListener('click', () => {
                if (idx >= currentSet.qrList.length - 1) return;
                [currentSet.qrList[idx], currentSet.qrList[idx + 1]] = [currentSet.qrList[idx + 1], currentSet.qrList[idx]];
                currentSet.save();
            });
            orderCol.append(upBtn, downBtn);

            // Label input
            const labelInp = document.createElement('input');
            labelInp.type = 'text';
            labelInp.className = 'nika-qr-input nika-qr-item-label';
            labelInp.placeholder = qrT('labelPlaceholder');
            labelInp.value = qr.label;
            labelInp.addEventListener('input', () => {
                qr.label = labelInp.value;
                persistAllSetsFromMemory();
                this.renderBar();
            });

            // Compact icon actions
            const actCol = document.createElement('div');
            actCol.className = 'nika-qr-item-acts';

            const runBtn = document.createElement('button');
            runBtn.type = 'button';
            runBtn.className = 'nika-qr-icon-btn';
            runBtn.title = qrT('runNowTip');
            runBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            runBtn.addEventListener('click', () => qr.execute());

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'nika-qr-icon-btn';
            editBtn.title = qrT('detailConfigTip');
            editBtn.innerHTML = '<i class="fa-solid fa-sliders"></i>';
            editBtn.addEventListener('click', () => this.openQrDetailModal(currentSet, qr));

            const expBtn = document.createElement('button');
            expBtn.type = 'button';
            expBtn.className = 'nika-qr-icon-btn';
            expBtn.title = qrT('exportSingleTip');
            expBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
            expBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(qr.toJSON())], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${qr.label || 'quick-reply'}.qr.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'nika-qr-icon-btn danger';
            delBtn.title = qrT('deleteItemTip');
            delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            delBtn.addEventListener('click', () => {
                qr.delete();
            });

            actCol.append(runBtn, editBtn, expBtn, delBtn);
            head.append(orderCol, labelInp, actCol);

            // Full-width message textarea
            const msgTa = document.createElement('textarea');
            msgTa.className = 'nika-qr-textarea';
            msgTa.rows = 2;
            msgTa.placeholder = qrT('msgPlaceholder');
            msgTa.value = qr.message;
            msgTa.addEventListener('input', () => {
                qr.message = msgTa.value;
                persistAllSetsFromMemory();
                this.renderBar();
            });

            card.append(head, msgTa);
            listEl.appendChild(card);
        });
        editorCard.appendChild(listEl);

        // Footer add buttons
        const footer = document.createElement('div');
        footer.className = 'nika-qr-row';
        footer.innerHTML = `
            <button type="button" id="qr--set-add" class="nika-qr-btn nika-qr-btn-primary"><i class="fa-solid fa-plus"></i> ${escapeHtml(qrT('addItemBtn'))}</button>
            <button type="button" id="qr--set-paste" class="nika-qr-btn"><i class="fa-solid fa-paste"></i> ${escapeHtml(qrT('pasteItemBtn'))}</button>
            <button type="button" id="qr--set-importQr" class="nika-qr-btn"><i class="fa-solid fa-file-arrow-up"></i> ${escapeHtml(qrT('importSingleBtn'))}</button>
        `;
        editorCard.appendChild(footer);

        footer.querySelector('#qr--set-add').addEventListener('click', () => {
            currentSet.addQuickReply({ label: qrT('newReplyLabel'), message: '' });
        });
        footer.querySelector('#qr--set-paste').addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                currentSet.addQuickReplyFromText(text);
            } catch {
                notifyToast('warning', qrT('clipboardErr'));
            }
        });
        footer.querySelector('#qr--set-importQr').addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json';
            inp.multiple = true;
            inp.addEventListener('change', async () => {
                for (const file of Array.from(inp.files || [])) {
                    try {
                        const text = await file.text();
                        currentSet.addQuickReplyFromText(text);
                    } catch (ex) {
                        notifyToast('error', qrT('importFailed', { name: file.name, msg: ex.message }));
                    }
                }
            });
            inp.click();
        });

        root.appendChild(editorCard);
    }

    refreshAll() {
        this.renderBar();
        this.renderSettings();
    }
}

// ============================================================
// Slash Commands Registration (ST Quick Reply Slash Commands)
// ============================================================

function registerQuickReplySlashCommands(api, settings) {
    const add = (name, callback, aliases = [], extra = {}) => {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name, aliases, callback, ...extra }));
    };

    add('qr', async (_, val) => {
        const idx = Number(val);
        if (Number.isNaN(idx)) return '';
        return await api.executeQuickReplyByIndex(idx);
    }, [], { helpString: '按序号执行快速回复 (0 起始)' });

    add('run', async (args, val) => {
        const name = String(val ?? '').trim();
        if (!name) return '';
        return await window.executeQuickReplyByName(name, args);
    }, [':'], { helpString: '按名称或 Set.Label 执行快速回复，如 /run Default.继续' });

    add('qr-set', (args, val) => {
        if (val) api.toggleGlobalSet(String(val).trim(), args.visible !== undefined ? isTrueBoolean(args.visible) : true);
        return '';
    }, [], { helpString: '切换全局快速回复集' });

    add('qr-set-on', (args, val) => {
        if (val) api.addGlobalSet(String(val).trim(), args.visible !== undefined ? isTrueBoolean(args.visible) : true);
        return '';
    }, [], { helpString: '启用全局快速回复集' });

    add('qr-set-off', (_, val) => {
        if (val) api.removeGlobalSet(String(val).trim());
        return '';
    }, [], { helpString: '停用全局快速回复集' });

    add('qr-chat-set', (args, val) => {
        if (val) api.toggleChatSet(String(val).trim(), args.visible !== undefined ? isTrueBoolean(args.visible) : true);
        return '';
    }, [], { helpString: '切换当前对话快速回复集' });

    add('qr-chat-set-on', (args, val) => {
        if (val) api.addChatSet(String(val).trim(), args.visible !== undefined ? isTrueBoolean(args.visible) : true);
        return '';
    }, [], { helpString: '启用当前对话快速回复集' });

    add('qr-chat-set-off', (_, val) => {
        if (val) api.removeChatSet(String(val).trim());
        return '';
    }, [], { helpString: '停用当前对话快速回复集' });

    add('qr-set-list', (_, val) => JSON.stringify(api.listSets(String(val || 'all').trim())), [], {
        helpString: '列出快速回复集名称 (all/global/chat/character)',
    });

    add('qr-list', (_, val) => JSON.stringify(api.listQuickReplies(String(val || '').trim())), [], {
        helpString: '列出指定回复集中的所有快速回复名称',
    });

    add('qr-create', (args, msg) => {
        if (!args.set) return '';
        api.createQuickReply(args.set, args.label || '', {
            message: String(msg ?? ''),
            icon: args.icon,
            showLabel: args.showlabel !== undefined ? isTrueBoolean(args.showlabel) : false,
            title: args.title || '',
            isHidden: args.hidden !== undefined ? isTrueBoolean(args.hidden) : false,
            executeOnStartup: args.startup !== undefined ? isTrueBoolean(args.startup) : false,
            executeOnUser: args.user !== undefined ? isTrueBoolean(args.user) : false,
            executeOnAi: args.bot !== undefined ? isTrueBoolean(args.bot) : false,
            executeOnChatChange: args.load !== undefined ? isTrueBoolean(args.load) : false,
            executeOnNewChat: args.new !== undefined ? isTrueBoolean(args.new) : false,
            executeBeforeGeneration: args.generation !== undefined ? isTrueBoolean(args.generation) : false,
        });
        return '';
    }, [], { helpString: '创建一条新的快速回复' });

    add('qr-get', (args) => {
        const key = args.id !== undefined ? Number(args.id) : args.label;
        const qr = api.getQrByLabel(args.set, key);
        return qr ? JSON.stringify(qr.toJSON()) : '';
    }, [], { helpString: '获取指定快速回复的 JSON 属性' });

    add('qr-update', (args, msg) => {
        const key = args.id !== undefined ? Number(args.id) : args.label;
        const props = {};
        if (msg) props.message = String(msg);
        if (args.newlabel !== undefined) props.newLabel = args.newlabel;
        if (args.icon !== undefined) props.icon = args.icon;
        if (args.showlabel !== undefined) props.showLabel = isTrueBoolean(args.showlabel);
        if (args.title !== undefined) props.title = args.title;
        if (args.hidden !== undefined) props.isHidden = isTrueBoolean(args.hidden);
        if (args.startup !== undefined) props.executeOnStartup = isTrueBoolean(args.startup);
        if (args.user !== undefined) props.executeOnUser = isTrueBoolean(args.user);
        if (args.bot !== undefined) props.executeOnAi = isTrueBoolean(args.bot);
        if (args.load !== undefined) props.executeOnChatChange = isTrueBoolean(args.load);
        if (args.new !== undefined) props.executeOnNewChat = isTrueBoolean(args.new);
        if (args.generation !== undefined) props.executeBeforeGeneration = isTrueBoolean(args.generation);
        api.updateQuickReply(args.set, key, props);
        return '';
    }, [], { helpString: '更新指定快速回复' });

    add('qr-delete', (args, val) => {
        const key = args.id !== undefined ? Number(args.id) : (args.label || val);
        if (args.set && key !== undefined) api.deleteQuickReply(args.set, key);
        return '';
    }, [], { helpString: '删除指定快速回复' });

    add('qr-set-create', async (args, val) => {
        const name = String(val || args.name || '').trim();
        if (!name) return '';
        await api.createSet(name, {
            disableSend: args.nosend !== undefined ? isTrueBoolean(args.nosend) : false,
            placeBeforeInput: args.before !== undefined ? isTrueBoolean(args.before) : false,
            injectInput: args.inject !== undefined ? isTrueBoolean(args.inject) : false,
            color: args.color || 'rgba(0, 0, 0, 0)',
            onlyBorderColor: args.onlybordercolor !== undefined ? isTrueBoolean(args.onlybordercolor) : false,
        });
        return '';
    }, [], { helpString: '创建新的快速回复集' });

    add('qr-set-update', async (args, val) => {
        const name = String(val || args.name || '').trim();
        if (!name) return '';
        const props = {};
        if (args.nosend !== undefined) props.disableSend = isTrueBoolean(args.nosend);
        if (args.before !== undefined) props.placeBeforeInput = isTrueBoolean(args.before);
        if (args.inject !== undefined) props.injectInput = isTrueBoolean(args.inject);
        if (args.color !== undefined) props.color = args.color;
        if (args.onlybordercolor !== undefined) props.onlyBorderColor = isTrueBoolean(args.onlybordercolor);
        await api.updateSet(name, props);
        return '';
    }, [], { helpString: '更新快速回复集配置' });

    add('qr-set-delete', async (_, val) => {
        if (val) await api.deleteSet(String(val).trim());
        return '';
    }, [], { helpString: '删除快速回复集' });

    add('qr-contextadd', (args, val) => {
        const targetSet = String(val || args.context || '').trim();
        const key = args.id !== undefined ? Number(args.id) : args.label;
        if (args.set && key !== undefined && targetSet) {
            api.createContextItem(args.set, key, targetSet, isTrueBoolean(args.chain));
        }
        return '';
    }, [], { helpString: '为快速回复添加右键菜单集' });

    add('qr-contextdel', (args, val) => {
        const targetSet = String(val || args.context || '').trim();
        const key = args.id !== undefined ? Number(args.id) : args.label;
        if (args.set && key !== undefined && targetSet) {
            api.deleteContextItem(args.set, key, targetSet);
        }
        return '';
    }, [], { helpString: '移除快速回复的右键菜单集' });

    add('qr-contextclear', (args) => {
        const key = args.id !== undefined ? Number(args.id) : args.label;
        if (args.set && key !== undefined) api.clearContextMenu(args.set, key);
        return '';
    }, [], { helpString: '清空快速回复的右键菜单' });
}

// ============================================================
// Singleton Initialization & Lifecycle Binding
// ============================================================

let qrInitialized = false;
let qrSettings = null;
let qrManager = null;
let qrAutoExec = null;
export let quickReplyApi = null;

function refreshCharacterAndChatConfigs() {
    if (!qrSettings) return;
    // Character config
    const activeChar = characters[this_chid];
    if (activeChar?.avatar) {
        if (!qrSettings.characterConfigs[activeChar.avatar]) {
            const cc = QuickReplyConfig.from({ setList: [] });
            cc.scope = 'character';
            qrSettings.characterConfigs[activeChar.avatar] = cc;
        }
        qrSettings.charConfig = qrSettings.characterConfigs[activeChar.avatar];
    } else {
        qrSettings.charConfig = null;
    }

    // Chat config
    const chatCfg = QuickReplyConfig.from(chat_metadata?.quickReply || { setList: [] });
    chatCfg.scope = 'chat';
    qrSettings.chatConfig = chatCfg;
}

export async function initQuickReply() {
    if (qrInitialized) return quickReplyApi;
    qrInitialized = true;

    // 1. Load stored sets
    const rawSets = readStoredQrSetsRaw();
    QuickReplySet.list = rawSets.map(raw => QuickReplySet.from(raw));
    // Second pass: re-resolve context links now that all sets are loaded
    QuickReplySet.list.forEach(s => s.init());

    // 2. Load settings
    const saved = extension_settings.quickReplyV2 || {
        isEnabled: true,
        isCombined: false,
        isPopout: false,
        showPopoutButton: true,
        config: { setList: [] },
        characterConfigs: {},
    };
    qrSettings = QuickReplySettings.from(saved);
    extension_settings.quickReplyV2 = qrSettings.toJSON();

    // 3. Init UI & API
    qrManager = new QuickReplyManager(qrSettings);
    qrManager.injectStyles();
    qrSettings.onSave = () => qrManager.renderBar();

    quickReplyApi = new QuickReplyApi(qrSettings, qrManager);
    qrAutoExec = new AutoExecuteHandler(qrSettings);

    refreshCharacterAndChatConfigs();
    qrManager.refreshAll();

    // 4. Global executeQuickReplyByName & quickReplyApi (matching SillyTavern globals)
    window.quickReplyApi = quickReplyApi;
    window.executeQuickReplyByName = async (name, args = {}, options = {}) => {
        const activeLists = [
            ...(qrSettings.config?.setList || []),
            ...(qrSettings.chatConfig?.setList || []),
            ...(qrSettings.charConfig?.setList || []),
        ];
        let qr = activeLists
            .map(l => l.set?.qrList || [])
            .flat()
            .find(q => q.label === name);

        if (!qr && String(name).includes('.')) {
            const parts = String(name).split('.');
            const setName = parts.shift();
            const qrLabel = parts.join('.');
            const set = QuickReplySet.get(setName);
            if (set) qr = set.qrList.find(q => q.label === qrLabel);
        }
        if (!qr) {
            for (const s of QuickReplySet.list) {
                const found = s.qrList.find(q => q.label === name);
                if (found) { qr = found; break; }
            }
        }
        if (qr && qr.onExecute) {
            return await qr.execute(args, false, true, options);
        }
        throw new Error(`No Quick Reply found for "${name}".`);
    };

    // 5. Register all /qr* and /run slash commands
    registerQuickReplySlashCommands(quickReplyApi, qrSettings);

    // 6. Lifecycle hooks
    eventSource.on(event_types.APP_READY, async () => {
        refreshCharacterAndChatConfigs();
        qrManager.refreshAll();
        await qrAutoExec.handleStartup();
    });
    eventSource.on(event_types.CHAT_CHANGED, async () => {
        refreshCharacterAndChatConfigs();
        qrManager.refreshAll();
        await qrAutoExec.handleChatChanged();
    });
    eventSource.on(event_types.USER_MESSAGE_RENDERED, async () => {
        await qrAutoExec.handleUser();
    });
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (mesId) => {
        if (chat[mesId]?.mes === '...') return;
        await qrAutoExec.handleAi();
    });
    eventSource.on(event_types.CHAT_CREATED, async () => {
        await qrAutoExec.handleNewChat();
    });
    eventSource.on(event_types.GENERATION_STARTED, async (_type, _opts, isDryRun) => {
        if (isDryRun) return;
        await qrAutoExec.handleBeforeGeneration();
    });
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, async (entries) => {
        await qrAutoExec.handleWIActivation(entries);
    });

    console.log(`[ST-Loader] Loaded QuickReply (v2, ${QuickReplySet.list.length} sets)`);
    return quickReplyApi;
}

