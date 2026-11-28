/**
 * Nika ST Runtime - Unified SillyTavern Host Compatibility Shim
 *
 * Mapped via <script type="importmap"> in chat.html to serve all standard
 * SillyTavern ESM module paths (/script.js, /lib.js, /scripts/*.js) from one
 * clean, self-contained, pure-frontend module with zero backend dependencies.
 */

import {
    ARGUMENT_TYPE,
    SlashCommand,
    SlashCommandAbortController,
    SlashCommandArgument,
    SlashCommandEnumValue,
    SlashCommandNamedArgument,
    SlashCommandParser,
    MacrosParser,
    commonEnumProviders,
    enumIcons,
    enumTypes,
    evaluateMacros,
    executeSlashCommandsWithOptions,
    getLastMessageId,
} from './slash.js';

// Re-export all slash & macro symbols so importmap can point any ST slash/macro path here
export {
    ARGUMENT_TYPE,
    SlashCommand,
    SlashCommandAbortController,
    SlashCommandArgument,
    SlashCommandEnumValue,
    SlashCommandNamedArgument,
    SlashCommandParser,
    MacrosParser,
    commonEnumProviders,
    enumIcons,
    enumTypes,
    executeSlashCommandsWithOptions,
    getLastMessageId,
};

// ============================================================
// 1. Vendor Library Exports (compatible with /lib.js)
// ============================================================

export const lodash = window._ || {};
export const yaml = window.__ST_YAML__ || window.YAML || {
    parse: (s) => JSON.parse(s),
    stringify: (o) => JSON.stringify(o, null, 2),
};
export const showdown = window.showdown || {};
export const DOMPurify = window.DOMPurify || { sanitize: (x) => x };
export const hljs = window.hljs || { highlightElement() { }, highlightAuto: (c) => ({ value: c }) };
export const Popper = window.Popper || {};

// Lightweight faker stub for ST-Prompt-Template (avoids 3.7MB bundle)
export const faker = new Proxy({}, {
    get(_, ns) {
        return new Proxy({}, {
            get(_, fn) {
                return () => `${String(ns)}_${String(fn)}_${Math.floor(Math.random() * 1000)}`;
            },
        });
    },
});
export const allFakers = { zh_CN: faker, en: faker };
export const fakerZH_CN = faker;
export const fakerEN = faker;

// Lightweight jsoneditor stub for JS-Slash-Runner (avoids 1.4MB bundle)
export const Mode = Object.freeze({ tree: 'tree', text: 'text', table: 'table' });
export const ValidationSeverity = Object.freeze({ error: 'error', warning: 'warning' });
export function createJSONEditor({ target, props = {} }) {
    let current = props.content || { json: {} };
    const ta = document.createElement('textarea');
    ta.style.cssText = 'width:100%;min-height:240px;font-family:monospace;font-size:12px;padding:8px;border-radius:6px;border:1px solid #666;background:#1e1e24;color:#eee;';
    const renderVal = () => {
        ta.value = current.text !== undefined ? current.text : JSON.stringify(current.json ?? {}, null, 2);
    };
    renderVal();
    ta.addEventListener('input', () => {
        const text = ta.value;
        let next = { text };
        try { next = { json: JSON.parse(text) }; } catch { }
        current = next;
        props.onChange?.(next, current, { contentErrors: null, patchResult: null });
    });
    if (target) target.appendChild(ta);
    return {
        get: () => current,
        set: (c) => { current = c || { json: {} }; renderVal(); },
        update: (c) => { current = c || { json: {} }; renderVal(); },
        updateProps: (p) => { Object.assign(props, p); if (p?.content) { current = p.content; renderVal(); } },
        destroy: () => { ta.remove(); },
    };
}

// ============================================================
// 2. EventEmitter & Official SillyTavern event_types
// ============================================================

export const event_types = {
    APP_INITIALIZED: 'app_initialized',
    APP_READY: 'app_ready',
    EXTRAS_CONNECTED: 'extras_connected',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_FILE_EMBEDDED: 'message_file_embedded',
    MESSAGE_REASONING_EDITED: 'message_reasoning_edited',
    MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',
    MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
    MORE_MESSAGES_LOADED: 'more_messages_loaded',
    IMPERSONATE_READY: 'impersonate_ready',
    CHAT_CHANGED: 'chat_id_changed',
    CHAT_LOADED: 'chatLoaded',
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    SD_PROMPT_PROCESSING: 'sd_prompt_processing',
    EXTENSIONS_FIRST_LOAD: 'extensions_first_load',
    EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',
    SETTINGS_LOADED: 'settings_loaded',
    SETTINGS_UPDATED: 'settings_updated',
    GROUP_UPDATED: 'group_updated',
    MOVABLE_PANELS_RESET: 'movable_panels_reset',
    SETTINGS_LOADED_BEFORE: 'settings_loaded_before',
    SETTINGS_LOADED_AFTER: 'settings_loaded_after',
    CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',
    CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
    OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',
    OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
    OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',
    OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',
    WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
    WORLDINFO_UPDATED: 'worldinfo_updated',
    CHARACTER_EDITOR_OPENED: 'character_editor_opened',
    CHARACTER_EDITED: 'character_edited',
    CHARACTER_PAGE_LOADED: 'character_page_loaded',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    FORCE_SET_BACKGROUND: 'force_set_background',
    CHAT_DELETED: 'chat_deleted',
    CHAT_CREATED: 'chat_created',
    CHAT_RENAMED: 'chat_renamed',
    GROUP_CHAT_DELETED: 'group_chat_deleted',
    GROUP_CHAT_CREATED: 'group_chat_created',
    GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
    GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
    GENERATE_AFTER_DATA: 'generate_after_data',
    WORLD_INFO_ACTIVATED: 'world_info_activated',
    TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',
    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
    CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
    CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
    CHARACTER_DELETED: 'characterDeleted',
    CHARACTER_DUPLICATED: 'character_duplicated',
    CHARACTER_RENAMED: 'character_renamed',
    SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',
    STREAM_TOKEN_RECEIVED: 'stream_token_received',
    STREAM_REASONING_DONE: 'stream_reasoning_done',
    WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
    ONLINE_STATUS_CHANGED: 'online_status_changed',
    PRESET_CHANGED: 'preset_changed',
    MAIN_API_CHANGED: 'main_api_changed',
    WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',
    WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',
    PERSONA_CHANGED: 'persona_changed',
};

class STEventEmitter {
    constructor(stickyEvents = []) {
        this.events = {};
        this.stickyEvents = new Set(stickyEvents);
        this.emittedSticky = new Map();
    }
    on(event, listener) {
        if (typeof listener !== 'function') return this;
        (this.events[event] ||= []).push(listener);
        if (this.emittedSticky.has(event)) {
            const args = this.emittedSticky.get(event);
            Promise.resolve().then(() => { try { listener(...args); } catch (e) { console.error('[ST-Event]', event, e); } });
        }
        return this;
    }
    addListener(event, listener) { return this.on(event, listener); }
    makeFirst(event, listener) {
        if (typeof listener !== 'function') return this;
        const list = (this.events[event] ||= []);
        const idx = list.indexOf(listener);
        if (idx >= 0) list.splice(idx, 1);
        list.unshift(listener);
        return this;
    }
    makeLast(event, listener) {
        if (typeof listener !== 'function') return this;
        const list = (this.events[event] ||= []);
        const idx = list.indexOf(listener);
        if (idx >= 0) list.splice(idx, 1);
        list.push(listener);
        return this;
    }
    once(event, listener) {
        if (typeof listener !== 'function') return this;
        const wrapper = (...args) => {
            this.removeListener(event, wrapper);
            return listener(...args);
        };
        wrapper._original = listener;
        return this.on(event, wrapper);
    }
    removeListener(event, listener) {
        const list = this.events[event];
        if (!list) return this;
        this.events[event] = list.filter(fn => fn !== listener && fn._original !== listener);
        return this;
    }
    off(event, listener) { return this.removeListener(event, listener); }
    removeAllListeners(event) {
        if (event) delete this.events[event];
        else this.events = {};
        return this;
    }
    async emit(event, ...args) {
        if (this.stickyEvents.has(event)) {
            this.emittedSticky.set(event, args);
        }
        const list = (this.events[event] || []).slice();
        for (const fn of list) {
            try {
                await fn(...args);
            } catch (err) {
                console.error(`[ST-Event] Error in listener for "${event}":`, err);
            }
        }
    }
    async emitAndWait(event, ...args) {
        return await this.emit(event, ...args);
    }
    emitBase(event, ...args) {
        return this.emit(event, ...args);
    }
}

export const eventSource = new STEventEmitter([event_types.APP_READY, event_types.APP_INITIALIZED]);

// ============================================================
// 3. Persistent Extension Settings & AccountStorage
// ============================================================

const EXT_SETTINGS_KEY = 'nika_st_extension_settings_v1';
const ACCOUNT_STORAGE_PREFIX = 'nika_st_acct_';

function loadExtensionSettings() {
    try {
        const raw = localStorage.getItem(EXT_SETTINGS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { }
    return {};
}

export const extension_settings = Object.assign({
    variables: { global: {} },
    regex: [],
    character_allowed_regex: [],
    disabledExtensions: [],
}, loadExtensionSettings());

extension_settings.variables ||= { global: {} };
extension_settings.variables.global ||= {};

export const extensionTypes = Object.freeze({
    SYSTEM: 'system',
    GLOBAL: 'global',
    USER: 'third-party',
});

let _saveSettingsTimer = null;
export function saveSettings() {
    try {
        localStorage.setItem(EXT_SETTINGS_KEY, JSON.stringify(extension_settings));
    } catch (e) {
        console.warn('[ST-Host] Failed to save extension_settings:', e);
    }
    return Promise.resolve();
}

export function saveSettingsDebounced() {
    clearTimeout(_saveSettingsTimer);
    _saveSettingsTimer = setTimeout(() => { saveSettings(); }, 250);
}

export const accountStorage = {
    getItem(key) {
        try { return localStorage.getItem(ACCOUNT_STORAGE_PREFIX + key); } catch { return null; }
    },
    setItem(key, val) {
        try { localStorage.setItem(ACCOUNT_STORAGE_PREFIX + key, String(val)); } catch { }
    },
    removeItem(key) {
        try { localStorage.removeItem(ACCOUNT_STORAGE_PREFIX + key); } catch { }
    },
    getState(key, defaultValue = {}) {
        try {
            const raw = localStorage.getItem(ACCOUNT_STORAGE_PREFIX + key);
            return raw === null ? defaultValue : JSON.parse(raw);
        } catch {
            return defaultValue;
        }
    },
    setState(key, val) {
        try { localStorage.setItem(ACCOUNT_STORAGE_PREFIX + key, JSON.stringify(val)); } catch { }
    },
};

// ============================================================
// 4. Core Mutable ST State (Live Bindings Synced with chat.html)
// ============================================================

export let chat = [];
export let characters = [];
export let this_chid = -1;
export let chat_metadata = { variables: {} };
export let name1 = 'User';
export let name2 = 'Character';
export let user_avatar = 'default-user.png';
export let default_avatar = 'https://placehold.co/64x64/5E5B9D/ffffff?text=AI';
export let default_user_avatar = 'https://placehold.co/64x64/E4E6EB/1A1A1D?text=U';
export let system_avatar = 'https://placehold.co/64x64/333333/ffffff?text=SYS';
export let main_api = 'openai';
export let online_status = 'connected';
export let is_send_press = false;
export let groups = [];
export let selected_group = null;
export let is_group_generating = false;

export const MAX_INJECTION_DEPTH = 9999;

export const extension_prompt_types = Object.freeze({
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
});

export const extension_prompt_roles = Object.freeze({
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
});

export const system_message_types = Object.freeze({
    HELP: 'help',
    WELCOME: 'welcome',
    EMPTY: 'empty',
    GENERIC: 'generic',
    NARRATOR: 'narrator',
    COMMENT: 'comment',
    SLASH_COMMANDS: 'slash_commands',
    FORMATTING: 'formatting',
    HOTKEYS: 'hotkeys',
    MACROS: 'macros',
});

export const extension_prompts = {};

export function setExtensionPrompt(key, value, position = extension_prompt_types.IN_CHAT, depth = 4, scan = false, role = extension_prompt_roles.SYSTEM, filter = null) {
    if (!key) return;
    if (!value) {
        delete extension_prompts[key];
    } else {
        extension_prompts[key] = {
            identifier: key,
            value: String(value),
            position,
            depth: Number(depth) || 0,
            scan: !!scan,
            role: Number(role) || 0,
            filter: typeof filter === 'function' ? filter : null,
        };
    }
}

export function getExtensionPromptRoleByName(roleName) {
    const m = { system: 0, user: 1, assistant: 2 };
    return m[String(roleName || 'system').toLowerCase()] ?? 0;
}

export const power_user = {
    persona_description: '',
    persona_description_position: 0,
    persona_description_depth: 2,
    persona_description_role: 0,
    personas: {},
    persona_descriptions: {},
    default_persona: '',
    render_formulas: false,
    allow_name1_display: false,
    allow_name2_display: false,
    markdown_escape_strings: '',
    trim_spaces: true,
    collapse_newlines: false,
    fast_ui_mode: false,
    send_on_enter: 1,
    max_context_unlocked: true,
    chat_display: 0,
    stscript: { parser: { flags: {} } },
    custom_stopping_strings: '',
    prefer_character_prompt: true,
};

export const persona_description_positions = Object.freeze({
    IN_PROMPT: 0,
    TOP_AN: 2,
    BOTTOM_AN: 3,
    AT_DEPTH: 4,
    NONE: 9,
});

export function flushEphemeralStoppingStrings() { }

export const chat_completion_sources = Object.freeze({
    OPENAI: 'openai',
    CLAUDE: 'claude',
    OPENROUTER: 'openrouter',
    AI21: 'ai21',
    MAKERSUITE: 'makersuite',
    VERTEXAI: 'vertexai',
    MISTRALAI: 'mistralai',
    CUSTOM: 'custom',
    COHERE: 'cohere',
    PERPLEXITY: 'perplexity',
    GROQ: 'groq',
    DEEPSEEK: 'deepseek',
});

export const oai_settings = {
    chat_completion_source: 'custom',
    openai_model: 'gpt-4o',
    custom_model: 'default',
    temp_openai: 1.0,
    temperature: 1.0,
    freq_pen_openai: 0,
    frequency_penalty: 0,
    pres_pen_openai: 0,
    presence_penalty: 0,
    repetition_penalty_openai: 1,
    repetition_penalty: 1,
    top_p_openai: 1,
    top_p: 1,
    min_p_openai: 0,
    min_p: 0,
    top_k_openai: 0,
    top_k: 0,
    top_a_openai: 0,
    top_a: 0,
    n: 1,
    seed: -1,
    squash_system_messages: false,
    max_context_unlocked: true,
    openai_max_context: 128000,
    openai_max_tokens: 4096,
    stream_openai: true,
    prompts: [],
    prompt_order: [{ character_id: 100001, order: [] }],
    impersonation_prompt: '',
    wi_format: '{0}',
    scenario_format: '{{scenario}}',
    personality_format: '{{personality}}',
    show_thoughts: true,
    reasoning_effort: 'auto',
    request_images: false,
    function_calling: false,
    enable_web_search: false,
    image_inlining: false,
    inline_image_quality: 'auto',
    video_inlining: false,
    names_behavior: 0,
    wrap_in_quotes: false,
    extensions: {
        tavern_helper: { scripts: [], variables: {} },
    },
};
export const openai_settings = [oai_settings];
export const openai_setting_names = { Default: 0 };
export const nai_settings = {};
export const proxies = [];

export const NOTE_MODULE_NAME = 'note';
export const metadata_keys = Object.freeze({
    prompt: 'note_prompt',
    interval: 'note_interval',
    position: 'note_position',
    depth: 'note_depth',
    role: 'note_role',
});
export function shouldWIAddPrompt() { return false; }

export const ReasoningType = Object.freeze({
    Model: 'model',
    Parsed: 'parsed',
    Edited: 'edited',
});

export function extractReasoningFromData(data) {
    if (!data) return '';
    return data?.choices?.[0]?.message?.reasoning_content
        || data?.choices?.[0]?.delta?.reasoning_content
        || data?.choices?.[0]?.message?.reasoning
        || '';
}

export function updateReasoningUI() { }

export const v1CharData = {
    name: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
};

export function isAdmin() { return true; }
export function isMobile() { return window.innerWidth <= 768; }
export function favsToHotswap() { }

// ============================================================
// 5. Bridge Sync Layer (connects host.js <-> chat.html)
// ============================================================

function getBridge() {
    return window.__NIKA_ST_BRIDGE__ || null;
}

export function syncStateFromBridge() {
    const b = getBridge();
    if (!b) return;
    const snap = b.getSnapshot?.();
    if (!snap) return;

    name1 = snap.name1 || 'User';
    name2 = snap.name2 || 'Character';
    user_avatar = snap.userAvatar || 'default-user.png';
    is_send_press = !!snap.isGenerating;
    power_user.persona_description = snap.personaDescription || '';

    // Keep characters array identity stable
    characters.splice(0, characters.length, ...(snap.characters || []));
    this_chid = snap.thisChid ?? -1;

    // Keep chat array identity stable while preserving any unsaved in-memory plugin mutations (e.g. MVU variables)
    const prevById = new Map();
    for (const oldMsg of chat) {
        if (oldMsg && oldMsg._nikaId) prevById.set(oldMsg._nikaId, oldMsg);
    }
    const mergedChat = (snap.chat || []).map((m) => {
        const prev = m?._nikaId ? prevById.get(m._nikaId) : null;
        if (prev) {
            const snapHasVars = Array.isArray(m.variables) && m.variables.some(v => v && Object.keys(v).length > 0);
            const prevHasVars = Array.isArray(prev.variables) && prev.variables.some(v => v && Object.keys(v).length > 0);
            if (!snapHasVars && prevHasVars) m.variables = prev.variables;
            if (!m.is_ejs_processed && prev.is_ejs_processed) m.is_ejs_processed = prev.is_ejs_processed;
            if (!m.variables_initialized && prev.variables_initialized) m.variables_initialized = prev.variables_initialized;
        }
        return m;
    });
    chat.splice(0, chat.length, ...mergedChat);

    // Keep chat_metadata identity stable while reflecting current chat's metadata
    const nextMeta = snap.chatMetadata || { variables: {} };
    nextMeta.variables ||= {};
    for (const k of Object.keys(chat_metadata)) {
        if (!(k in nextMeta)) delete chat_metadata[k];
    }
    Object.assign(chat_metadata, nextMeta);

    // Sync world names & model info
    const wNames = snap.worldNames || [];
    world_names.splice(0, world_names.length, ...wNames);
    if (snap.model) {
        oai_settings.openai_model = snap.model;
        oai_settings.custom_model = snap.model;
    }
    if (snap.activePreset) {
        Object.assign(oai_settings, snap.activePreset);
    } else {
        if (snap.maxContext) oai_settings.openai_max_context = snap.maxContext;
        if (snap.maxTokens) oai_settings.openai_max_tokens = snap.maxTokens;
        if (snap.prompts) oai_settings.prompts = snap.prompts;
    }
    syncPresetRegistryFromBridge();
}

export function getCurrentChatId() {
    return getBridge()?.getCurrentChatId?.() || 'default-chat';
}

export function saveChatConditional() {
    const b = getBridge();
    if (b?.syncChatFromST) b.syncChatFromST(chat, chat_metadata);
    return Promise.resolve();
}

export const saveChat = saveChatConditional;
export const saveChatDebounced = saveChatConditional;

export function saveMetadata() {
    const b = getBridge();
    if (b?.saveChatMetadata) b.saveChatMetadata(chat_metadata);
    return Promise.resolve();
}

let _saveMetaTimer = null;
export function saveMetadataDebounced() {
    // Sync in-memory reference immediately so syncStateFromBridge never overwrites fresh writes
    const b = getBridge();
    if (b?.saveChatMetadata) {
        clearTimeout(_saveMetaTimer);
        b.saveChatMetadata(chat_metadata);
    }
}

let _saveCharTimer = null;
export function saveCharacterDebounced() {
    clearTimeout(_saveCharTimer);
    _saveCharTimer = setTimeout(() => {
        const b = getBridge();
        if (b?.syncCharactersFromST) b.syncCharactersFromST(characters, this_chid);
    }, 250);
}

export async function writeExtensionField(characterId, key, value) {
    const ch = characters[characterId];
    if (!ch) return;
    ch.data ||= {};
    ch.data.extensions ||= {};
    ch.data.extensions[key] = value;
    const b = getBridge();
    if (b?.writeCharacterExtensionField) {
        await b.writeCharacterExtensionField(characterId, key, value);
    } else {
        saveCharacterDebounced();
    }
}

export function getCharacters() {
    syncStateFromBridge();
    return Promise.resolve(characters);
}

export function getOneCharacter(avatar) {
    return Promise.resolve(characters.find(c => c.avatar === avatar || c.name === avatar) || null);
}

export function unshallowCharacter(chid) {
    return Promise.resolve(characters[chid] || null);
}

export function selectCharacterById(chid) {
    const b = getBridge();
    if (b?.selectCharacterByIndex) return Promise.resolve(b.selectCharacterByIndex(chid));
    return Promise.resolve();
}

export function deleteCharacter() { return Promise.resolve(); }
export function printCharacters() { return Promise.resolve(); }
export function getPastCharacterChats() { return Promise.resolve([]); }

export function getCharacterCardFields({ chid = this_chid } = {}) {
    const ch = characters[chid] || {};
    const d = ch.data || ch;
    return {
        description: d.description || ch.description || '',
        personality: d.personality || ch.personality || '',
        scenario: d.scenario || ch.scenario || '',
        persona: power_user.persona_description || '',
        mesExamples: d.mes_example || ch.mes_example || '',
        system: d.system_prompt || '',
        jailbreak: d.post_history_instructions || '',
        version: d.character_version || '',
    };
}

// ============================================================
// 6. Variables API (scripts/variables.js)
// ============================================================

export function getLocalVariable(name, args = {}) {
    chat_metadata.variables ||= {};
    const val = chat_metadata.variables[name];
    if (args.index !== undefined && val !== undefined) {
        try {
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            return parsed?.[args.index];
        } catch { return undefined; }
    }
    return val;
}

export function setLocalVariable(name, value, args = {}) {
    chat_metadata.variables ||= {};
    if (args.index !== undefined) {
        let cur = chat_metadata.variables[name];
        try { cur = typeof cur === 'string' ? JSON.parse(cur) : (cur || {}); } catch { cur = {}; }
        if (cur && typeof cur === 'object') {
            cur[args.index] = value;
            chat_metadata.variables[name] = JSON.stringify(cur);
        }
    } else {
        chat_metadata.variables[name] = value;
    }
    saveMetadataDebounced();
    return chat_metadata.variables[name];
}

export function deleteLocalVariable(name) {
    if (chat_metadata.variables) {
        delete chat_metadata.variables[name];
        saveMetadataDebounced();
    }
}

export function addLocalVariable(name, increment) {
    const cur = getLocalVariable(name);
    const n1 = Number(cur);
    const n2 = Number(increment);
    const next = (!Number.isNaN(n1) && !Number.isNaN(n2) && cur !== '' && cur !== undefined)
        ? (n1 + n2)
        : (String(cur ?? '') + String(increment ?? ''));
    return setLocalVariable(name, next);
}

export function getGlobalVariable(name) {
    extension_settings.variables ||= { global: {} };
    extension_settings.variables.global ||= {};
    return extension_settings.variables.global[name];
}

export function setGlobalVariable(name, value) {
    extension_settings.variables ||= { global: {} };
    extension_settings.variables.global ||= {};
    extension_settings.variables.global[name] = value;
    saveSettingsDebounced();
    return value;
}

export function deleteGlobalVariable(name) {
    if (extension_settings.variables?.global) {
        delete extension_settings.variables.global[name];
        saveSettingsDebounced();
    }
}

export function addGlobalVariable(name, increment) {
    const cur = getGlobalVariable(name);
    const n1 = Number(cur);
    const n2 = Number(increment);
    const next = (!Number.isNaN(n1) && !Number.isNaN(n2) && cur !== '' && cur !== undefined)
        ? (n1 + n2)
        : (String(cur ?? '') + String(increment ?? ''));
    return setGlobalVariable(name, next);
}

// ============================================================
// 7. World Info Compatibility Layer (scripts/world-info.js)
// ============================================================

export const METADATA_KEY = 'world_info';
export const DEFAULT_DEPTH = 4;
export const DEFAULT_WEIGHT = 100;
export const world_info_case_sensitive = false;
export const world_info_match_whole_words = false;
export const world_info_max_recursion_steps = 5;
export const world_info_use_group_scoring = false;
export const world_info_include_names = true;

export const world_info_position = Object.freeze({
    before: 0,
    after: 1,
    ANTop: 2,
    ANBottom: 3,
    atDepth: 4,
    EMTop: 5,
    EMBottom: 6,
    outlet: 7,
});

export const wi_anchor_position = Object.freeze({
    before: 0,
    after: 1,
});

export const world_info_logic = Object.freeze({
    AND_ANY: 0,
    NOT_ALL: 1,
    NOT_ANY: 2,
    AND_ALL: 3,
});

export const world_names = [];
export const selected_world_info = [];
export const world_info = { globalSelect: selected_world_info };

export const newWorldInfoEntryTemplate = Object.freeze({
    uid: 0,
    key: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: 0,
    addMemo: true,
    order: 100,
    position: 0,
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: 0,
    sticky: 0,
    cooldown: 0,
    delay: 0,
});

export const originalWIDataKeyMap = Object.freeze({
    uid: 'uid',
    key: 'keys',
    keysecondary: 'secondary_keys',
    comment: 'comment',
    content: 'content',
    constant: 'constant',
    selective: 'selective',
    order: 'insertion_order',
    position: 'position',
    disable: 'enabled',
});

export function setWIOriginalDataValue(data, index, key, value) {
    if (data?.entries?.[index]) data.entries[index][key] = value;
}

export function parseRegexFromString(input) {
    if (typeof input !== 'string') return null;
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) return null;
    try { return new RegExp(match[1], match[2]); } catch { return null; }
}

export function convertCharacterBook(characterBook) {
    if (!characterBook) return { entries: {} };
    const entriesObj = {};
    const rawEntries = Array.isArray(characterBook.entries)
        ? characterBook.entries
        : Object.values(characterBook.entries || {});
    rawEntries.forEach((entry, idx) => {
        const uid = entry.uid ?? entry.id ?? idx;
        const ext = entry.extensions || {};
        entriesObj[String(uid)] = {
            ...newWorldInfoEntryTemplate,
            uid,
            key: Array.isArray(entry.keys) ? entry.keys : (Array.isArray(entry.key) ? entry.key : []),
            keysecondary: Array.isArray(entry.secondary_keys) ? entry.secondary_keys : (Array.isArray(entry.keysecondary) ? entry.keysecondary : []),
            comment: entry.comment || entry.name || '',
            content: entry.content || '',
            constant: !!(entry.constant),
            selective: entry.selective !== false,
            selectiveLogic: ext.selectiveLogic ?? entry.selectiveLogic ?? 0,
            order: entry.insertion_order ?? entry.order ?? 100,
            position: typeof ext.position === 'number' ? ext.position : (entry.position === 'after_char' ? 1 : (typeof entry.position === 'number' ? entry.position : 0)),
            disable: entry.disable !== undefined ? !!entry.disable : (entry.enabled === false),
            depth: ext.depth ?? entry.depth ?? 4,
            role: ext.role ?? entry.role ?? 0,
            excludeRecursion: !!(ext.exclude_recursion ?? entry.excludeRecursion),
            preventRecursion: !!(ext.prevent_recursion ?? entry.preventRecursion),
            probability: ext.probability ?? entry.probability ?? 100,
            useProbability: (ext.useProbability ?? entry.useProbability) !== false,
            group: ext.group ?? entry.group ?? '',
            extensions: ext,
        };
    });
    return { entries: entriesObj, name: characterBook.name || '' };
}

export async function loadWorldInfo(name) {
    const b = getBridge();
    if (b?.loadWorldInfo) {
        return await b.loadWorldInfo(name);
    }
    return { entries: {} };
}

export async function saveWorldInfo(name, data, immediately = false) {
    const b = getBridge();
    if (b?.saveWorldInfo) {
        await b.saveWorldInfo(name, data);
    }
    await eventSource.emit(event_types.WORLDINFO_UPDATED, name, data);
}

export async function createNewWorldInfo(name, { interactive = false } = {}) {
    const b = getBridge();
    if (b?.createWorldInfo) {
        const ok = await b.createWorldInfo(name);
        syncStateFromBridge();
        return ok;
    }
    return false;
}

export async function deleteWorldInfo(name) {
    const b = getBridge();
    if (b?.deleteWorldInfo) {
        const ok = await b.deleteWorldInfo(name);
        syncStateFromBridge();
        return ok;
    }
    return false;
}

export function createWorldInfoEntry(name, data) {
    data ||= { entries: {} };
    data.entries ||= {};
    const ids = Object.keys(data.entries).map(Number).filter(n => !Number.isNaN(n));
    const nextUid = ids.length ? Math.max(...ids) + 1 : 0;
    const entry = { ...structuredClone(newWorldInfoEntryTemplate), uid: nextUid };
    data.entries[String(nextUid)] = entry;
    return entry;
}

export function deleteWorldInfoEntry(data, uid) {
    if (data?.entries) {
        delete data.entries[String(uid)];
        return true;
    }
    return false;
}

const _worldInfoSettingsState = {
    world_info,
    world_info_depth: DEFAULT_DEPTH,
    world_info_budget: 25,
    world_info_budget_cap: 0,
    world_info_min_activations: 0,
    world_info_min_activations_depth_max: 0,
    world_info_max_recursion_steps,
    world_info_character_strategy: 0,
    world_info_include_names,
    world_info_recursive: true,
    world_info_case_sensitive,
    world_info_match_whole_words,
    world_info_use_group_scoring,
    world_info_overflow_alert: false,
};

export function getWorldInfoSettings() {
    return _worldInfoSettingsState;
}

export async function getWorldInfoPrompt(chatMessages, maxContext, isDryRun = false, globalScanData = {}) {
    const b = getBridge();
    if (b?.getWorldInfoPrompt) {
        return await b.getWorldInfoPrompt(chatMessages, maxContext, isDryRun, globalScanData);
    }
    return { worldInfoString: '', worldInfoBefore: '', worldInfoAfter: '', worldInfoExamples: [], worldInfoDepth: [], allActivatedEntries: new Set() };
}

export async function onWorldInfoChange() { }
export function reloadEditor() { }
export async function updateWorldInfoList() { syncStateFromBridge(); }
export function setWorldInfoButtonClass() { }

// ============================================================
// 8. Regex Engine Bridge (scripts/extensions/regex/engine.js)
// ============================================================

export const regex_placement = Object.freeze({
    MD_DISPLAY: 0,
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    WORLD_INFO: 5,
    REASONING: 6,
});

export function getRegexedString(rawString, placement, { characterOverride = null, isMarkdown = false, isPrompt = false, isEdit = false, depth = 0 } = {}) {
    if (typeof rawString !== 'string' || !rawString) return rawString ?? '';
    const b = getBridge();
    if (b?.applyRegexST) {
        return b.applyRegexST(rawString, placement, { characterOverride, isMarkdown, isPrompt, isEdit, depth });
    }
    return rawString;
}

// ============================================================
// 9. Formatting, Macros & Message Operations
// ============================================================

let _mdConverter = null;
function getMarkdownConverter() {
    if (!_mdConverter && window.showdown?.Converter) {
        _mdConverter = new window.showdown.Converter({
            tables: true,
            strikethrough: true,
            tasklists: true,
            simpleLineBreaks: true,
            openLinksInNewWindow: true,
            literalMidWordUnderscores: true,
        });
    }
    return _mdConverter;
}

export function reloadMarkdownProcessor() {
    _mdConverter = null;
    getMarkdownConverter();
}

export function substituteParams(content, _name1 = name1, _name2 = name2, original = '', group = '', replaceCharacterCard = true, additionalMacro = {}) {
    if (content === null || content === undefined) return '';
    return evaluateMacros(String(content), {
        name1: _name1 || name1,
        name2: _name2 || name2,
        original,
        ...additionalMacro,
    });
}

export function substituteParamsExtended(content, additionalMacro = {}, postProcessFn = null) {
    const out = substituteParams(content, name1, name2, '', '', true, additionalMacro);
    return typeof postProcessFn === 'function' ? postProcessFn(out) : out;
}

export function baseChatReplace(value, _name1 = name1, _name2 = name2) {
    return substituteParams(value, _name1, _name2);
}

export function messageFormatting(mes, ch_name = name2, isSystem = false, isUser = false, messageId = -1, { isMedia = false } = {}) {
    if (!mes) return '';
    let text = String(mes);
    const placement = isUser ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
    text = getRegexedString(text, placement, { isMarkdown: true, depth: Math.max(0, chat.length - 1 - messageId) });
    const conv = getMarkdownConverter();
    if (conv) {
        try {
            return conv.makeHtml(text);
        } catch { }
    }
    return text.replace(/\n/g, '<br>');
}

export function addOneMessage(mes, options = {}) {
    const b = getBridge();
    if (b?.addOneMessageFromST) return b.addOneMessageFromST(mes, options);
}

export function updateMessageBlock(messageId, message, { rerenderMessage = true } = {}) {
    const b = getBridge();
    if (b?.updateMessageFromST) {
        b.updateMessageFromST(messageId, message, { rerenderMessage });
    }
}

export function printMessages() {
    const b = getBridge();
    if (b?.rerenderAllMessages) return Promise.resolve(b.rerenderAllMessages());
    return Promise.resolve();
}

export function reloadCurrentChat() {
    const b = getBridge();
    if (b?.reloadCurrentChat) return Promise.resolve(b.reloadCurrentChat());
    return Promise.resolve();
}

export function clearChat() {
    const b = getBridge();
    if (b?.clearChat) return Promise.resolve(b.clearChat());
    return Promise.resolve();
}

export function cleanUpMessage(mes) { return typeof mes === 'string' ? mes.trim() : ''; }
export function scrollChatToBottom() {
    const el = document.getElementById('chat-messages') || document.getElementById('chat');
    if (el) el.scrollTop = el.scrollHeight;
}
export function showSwipeButtons() { }
export function activateSendButtons() { is_send_press = false; }
export function deactivateSendButtons() { is_send_press = true; }
export function setGenerationProgress() { }
export function addCopyToCodeBlocks() { }
export function appendMediaToMessage() { }
export function setUserName(newName) { name1 = newName || name1; }
export function getUserAvatar() { return user_avatar; }
export function getUserAvatars() { return Promise.resolve([user_avatar]); }
export function setUserAvatar(av) { user_avatar = av || user_avatar; }
export function getThumbnailUrl(type, file) {
    if (!file) return type === 'persona' ? default_user_avatar : default_avatar;
    if (/^(https?:|data:|blob:)/.test(file)) return file;
    const ch = characters.find(c => c.avatar === file);
    if (ch?._nikaAvatar && /^(https?:|data:|blob:)/.test(ch._nikaAvatar)) return ch._nikaAvatar;
    return default_avatar;
}

export function parseMesExamples(examplesStr = '') {
    if (!examplesStr) return [];
    return String(examplesStr).split(/<START>/i).map(s => s.trim()).filter(Boolean);
}

export function getBiasStrings() { return { messageBias: '', chatBias: '' }; }
export function getMaxContextSize() { return oai_settings.openai_max_context || 128000; }
export function getChatCompletionModel() { return oai_settings.openai_model || 'default'; }
export function isImageInliningSupported() { return true; }
export function getRequestHeaders({ omitContentType = false } = {}) {
    return omitContentType ? {} : { 'Content-Type': 'application/json' };
}

// ============================================================
// 10. Generation, OpenAI & PromptManager Compatibility
// ============================================================

export class GenerateOptions { }

export async function Generate(type = 'normal', options = {}, dryRun = false) {
    const b = getBridge();
    if (b?.triggerGenerate) {
        return await b.triggerGenerate(type, options, dryRun);
    }
    return '';
}

export function stopGeneration() {
    const b = getBridge();
    if (b?.stopGeneration) b.stopGeneration();
    is_send_press = false;
    eventSource.emit(event_types.GENERATION_STOPPED);
}

export async function generateRaw({ prompt = '', systemPrompt = '', prefill = '', responseLength = null, trimNames = false } = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: String(systemPrompt) });
    if (Array.isArray(prompt)) {
        for (const p of prompt) {
            if (typeof p === 'string') messages.push({ role: 'user', content: p });
            else if (p && typeof p === 'object') messages.push({ role: p.role || 'user', content: String(p.content ?? '') });
        }
    } else if (prompt) {
        messages.push({ role: 'user', content: String(prompt) });
    }
    if (prefill) messages.push({ role: 'assistant', content: String(prefill) });

    const b = getBridge();
    if (b?.callLLM) {
        return await b.callLLM(messages, { max_tokens: responseLength || undefined, stream: false });
    }
    return '';
}

export async function generateQuietPrompt({ quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, responseLength = null } = {}) {
    return await generateRaw({ prompt: quietPrompt, responseLength });
}

export async function sendOpenAIRequest(type, messages, signal) {
    const b = getBridge();
    if (b?.callLLM) {
        const text = await b.callLLM(messages, { stream: false, signal });
        return { choices: [{ message: { role: 'assistant', content: text } }] };
    }
    return { choices: [{ message: { role: 'assistant', content: '' } }] };
}

export function getStreamingReply(data) {
    return data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
}

export function tryParseStreamingError() { return null; }

export class Message {
    constructor(role = 'user', content = '', identifier = '') {
        this.role = role;
        this.content = content;
        this.identifier = identifier;
    }
    static async fromPromptAsync(prompt) {
        return new Message(prompt?.role || 'system', prompt?.content || '', prompt?.identifier || '');
    }
}

export class MessageCollection {
    constructor(identifier = '') {
        this.identifier = identifier;
        this.collection = [];
    }
    add(item) { this.collection.push(item); }
    getChat() {
        return this.collection.flatMap(item => item instanceof MessageCollection ? item.getChat() : [{ role: item.role, content: item.content }]);
    }
}

export class ChatCompletion {
    constructor() { this.messages = new MessageCollection(); }
    setMessages(msgs) { this.messages = msgs; }
    getChat() { return this.messages?.getChat ? this.messages.getChat() : []; }
}

export class Prompt {
    constructor(data = {}) {
        Object.assign(this, { identifier: '', name: '', role: 'system', content: '', enabled: true, marker: false, system_prompt: false }, data);
    }
}

export class PromptCollection {
    constructor() { this.collection = []; }
    add(p) { this.collection.push(p); }
    get(id) { return this.collection.find(p => p.identifier === id); }
}

let _pmRenderTimer = null;
export const promptManager = {
    serviceSettings: oai_settings,
    activeCharacter: null,
    getPromptById(id) { return (oai_settings.prompts || []).find(p => p.identifier === id); },
    getPromptOrderEntry(character, id) {
        const ord = oai_settings.prompt_order?.[0]?.order || [];
        return ord.find(o => o.identifier === id) || { identifier: id, enabled: true };
    },
    getPromptOrderForCharacter() {
        const ord = oai_settings.prompt_order?.[0]?.order;
        if (Array.isArray(ord) && ord.length) return ord;
        return (oai_settings.prompts || []).map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
    },
    render() {
        const b = getBridge();
        if (b?.syncInUsePresetFromST) b.syncInUsePresetFromST(oai_settings);
    },
    renderDebounced() {
        clearTimeout(_pmRenderTimer);
        _pmRenderTimer = setTimeout(() => { this.render(); }, 150);
    },
};

export function prepareOpenAIMessages() { return []; }
export function setOpenAIMessages() { }
export function setOpenAIMessageExamples() { }
export function setupChatCompletionPromptManager() { }

export const ChatCompletionService = {
    createRequestData(params = {}) { return { ...params }; },
    async sendRequest(data = {}, extractData = true, signal = null) {
        const b = getBridge();
        const messages = data.messages || [];
        const text = b?.callLLM ? await b.callLLM(messages, {
            stream: false,
            max_tokens: data.max_tokens,
            temperature: data.temperature,
            signal,
        }) : '';
        if (extractData) return { content: text, reasoning: '' };
        return { choices: [{ message: { role: 'assistant', content: text } }] };
    },
};

let _presetSelectEl = null;
function getHiddenPresetSelect() {
    if (!_presetSelectEl && typeof document !== 'undefined' && window.$) {
        const el = document.createElement('select');
        el.id = 'st_hidden_preset_select';
        el.style.display = 'none';
        document.body?.appendChild(el);
        _presetSelectEl = window.$(el);
    }
    return _presetSelectEl || { append() { }, val() { return ''; }, find() { return { text() { return ''; } }; } };
}

function syncPresetRegistryFromBridge() {
    const b = getBridge();
    const map = b?.getAllPresetsMap?.();
    if (!map) return;
    const names = Object.keys(map);
    openai_settings.splice(0, openai_settings.length);
    for (const k of Object.keys(openai_setting_names)) delete openai_setting_names[k];
    names.forEach((n, idx) => {
        openai_settings.push(map[n]);
        openai_setting_names[n] = idx;
    });
}

export function getPresetManager(apiId = 'openai') {
    const readPresetObj = (name) => {
        syncPresetRegistryFromBridge();
        if (name && name in openai_setting_names) {
            return openai_settings[openai_setting_names[name]];
        }
        return getBridge()?.getPresetByName?.(name) || oai_settings;
    };
    return {
        apiId,
        get select() { return getHiddenPresetSelect(); },
        getSelectedPresetName() { return getBridge()?.getActivePresetName?.() || 'Default'; },
        getSelectedPreset() { return readPresetObj(this.getSelectedPresetName()); },
        getAllPresets() {
            syncPresetRegistryFromBridge();
            const names = Object.keys(openai_setting_names);
            return names.length ? names : (getBridge()?.getPresetNames?.() || ['Default']);
        },
        getPresetList() {
            syncPresetRegistryFromBridge();
            return { presets: openai_settings, preset_names: openai_setting_names };
        },
        findPreset(name) {
            syncPresetRegistryFromBridge();
            if (name in openai_setting_names) return String(openai_setting_names[name]);
            return null;
        },
        getCompletionPresetByName(name) { return readPresetObj(name); },
        getPresetSettings(name) { return readPresetObj(name); },
        readPresetExtensionField({ path: fieldPath, name } = {}) {
            const preset = readPresetObj(name || this.getSelectedPresetName());
            return fieldPath ? preset?.extensions?.[fieldPath] : preset?.extensions;
        },
        async writePresetExtensionField({ path: fieldPath, value, name } = {}) {
            const targetName = name || this.getSelectedPresetName();
            const preset = readPresetObj(targetName);
            if (preset && fieldPath) {
                preset.extensions ||= {};
                preset.extensions[fieldPath] = value;
                await this.savePreset(targetName, preset);
            }
        },
        async selectPreset(val) {
            syncPresetRegistryFromBridge();
            let targetName = val;
            const idx = Number(val);
            if (!Number.isNaN(idx)) {
                const entry = Object.entries(openai_setting_names).find(([, v]) => v === idx);
                if (entry) targetName = entry[0];
            }
            if (targetName) await getBridge()?.selectPresetByName?.(targetName);
            syncStateFromBridge();
        },
        async savePreset(name, data) {
            const targetName = name || this.getSelectedPresetName();
            const payload = data || readPresetObj(targetName);
            await getBridge()?.savePresetByName?.(targetName, payload);
            syncPresetRegistryFromBridge();
            if (targetName === this.getSelectedPresetName()) {
                Object.assign(oai_settings, payload);
            }
            await eventSource.emit(event_types.PRESET_CHANGED, { apiId, name: targetName });
        },
        async deletePreset(name) {
            const ok = await getBridge()?.deletePresetByName?.(name);
            syncPresetRegistryFromBridge();
            return !!ok;
        },
    };
}

export async function getEventSourceStream() {
    return new TransformStream({
        transform(chunk, controller) {
            controller.enqueue({ data: typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk) });
        },
    });
}

// ============================================================
// 11. Popup UI Compatibility (scripts/popup.js)
// ============================================================

export const POPUP_TYPE = Object.freeze({
    TEXT: 1,
    CONFIRM: 2,
    INPUT: 3,
    DISPLAY: 4,
});

export const POPUP_RESULT = Object.freeze({
    AFFIRMATIVE: 1,
    NEGATIVE: 0,
    CANCELLED: null,
    CUSTOM1: 2,
    CUSTOM2: 3,
});

export function callGenericPopup(content, type = POPUP_TYPE.TEXT, inputValue = '', options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'st-shim-popup-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.58);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;';

        const dialog = document.createElement('div');
        dialog.className = 'popup st-shim-popup';
        dialog.style.cssText = `background:var(--card-bg-color,#1f2128);color:var(--text-color,#eee);border:1px solid var(--border-color,#444);border-radius:12px;max-width:${options.wider || options.large ? '860px' : (options.wide ? '680px' : '540px')};width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 36px rgba(0,0,0,0.45);overflow:hidden;`;

        const body = document.createElement('div');
        body.className = 'popup-body';
        body.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';

        if (typeof content === 'string') {
            body.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            body.appendChild(content);
        } else if (content && content.jquery && content[0]) {
            body.appendChild(content[0]);
        } else if (content) {
            body.textContent = String(content);
        }

        let inputEl = null;
        if (type === POPUP_TYPE.INPUT) {
            inputEl = options.rows > 1 ? document.createElement('textarea') : document.createElement('input');
            if (options.rows > 1) inputEl.rows = options.rows;
            inputEl.className = 'text_pole';
            inputEl.style.cssText = 'width:100%;margin-top:10px;padding:8px 10px;border-radius:6px;border:1px solid var(--border-color,#555);background:var(--input-bg-color,#2a2d36);color:var(--text-color,#eee);';
            inputEl.value = inputValue ?? '';
            body.appendChild(inputEl);
        }

        const footer = document.createElement('div');
        footer.className = 'popup-controls';
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border-color,#444);';

        const closeWith = async (res) => {
            if (typeof options.onClosing === 'function') {
                const allow = await options.onClosing({ result: res, value: inputEl ? inputEl.value : res });
                if (allow === false) return;
            }
            overlay.remove();
            if (typeof options.onClose === 'function') {
                try { await options.onClose({ result: res, value: inputEl ? inputEl.value : res }); } catch { }
            }
            resolve(res);
        };

        const makeBtn = (label, primary, onClick) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.className = primary ? 'btn-primary px-4 py-1.5 rounded-lg text-sm' : 'btn-secondary px-4 py-1.5 rounded-lg text-sm';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', onClick);
            return btn;
        };

        if (Array.isArray(options.customButtons)) {
            for (const cb of options.customButtons) {
                footer.appendChild(makeBtn(cb.text || 'Action', false, () => {
                    cb.action?.();
                    if (cb.result !== undefined) closeWith(cb.result);
                }));
            }
        }

        if (type === POPUP_TYPE.CONFIRM || type === POPUP_TYPE.INPUT || options.cancelButton) {
            const cancelText = typeof options.cancelButton === 'string' ? options.cancelButton : '取消';
            footer.appendChild(makeBtn(cancelText, false, () => closeWith(type === POPUP_TYPE.INPUT ? false : POPUP_RESULT.NEGATIVE)));
        }

        const okText = typeof options.okButton === 'string' ? options.okButton : '确定';
        footer.appendChild(makeBtn(okText, true, () => {
            closeWith(type === POPUP_TYPE.INPUT ? (inputEl ? inputEl.value : '') : POPUP_RESULT.AFFIRMATIVE);
        }));

        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && options.allowVerticalScrolling !== false) {
                closeWith(type === POPUP_TYPE.INPUT ? false : POPUP_RESULT.CANCELLED);
            }
        });
        document.body.appendChild(overlay);
        if (inputEl) setTimeout(() => inputEl.focus(), 30);
    });
}

// ============================================================
// 12. Utility Functions, i18n, Tokenizers, Group Chats
// ============================================================

export function uuidv4() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function debounce(fn, wait = 200) {
    let timer = null;
    const debounced = function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
}

export function download(content, fileName, contentType = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName || 'download.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function getStringHash(str) {
    let h = 5381;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return h >>> 0;
}

export function getSanitizedFilename(name) {
    return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

export function getCharaFilename(chid = this_chid) {
    const ch = characters[chid];
    if (!ch) return '';
    return String(ch.avatar || ch.name || '').replace(/\.[^.]+$/, '');
}

export function findChar({ name, avatar } = {}) {
    return characters.find(c => (avatar && c.avatar === avatar) || (name && c.name === name)) || null;
}

export function getFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

export function getBase64Async(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function isDataURL(s) { return typeof s === 'string' && /^data:/i.test(s); }
export async function ensureImageFormatSupported(file) { return file; }
export function getImageSizeFromDataURL(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
    });
}
export function showFontAwesomePicker() { return Promise.resolve(''); }
export function getSortableDelay() { return isMobile() ? 200 : 50; }
export async function copyText(text) {
    try { await navigator.clipboard.writeText(String(text ?? '')); return true; } catch { return false; }
}
export function isOdd(n) { return Math.abs(Number(n)) % 2 === 1; }
export function countOccurrences(str, sub) {
    if (!str || !sub) return 0;
    return String(str).split(String(sub)).length - 1;
}

export class Stopwatch {
    constructor() { this.startTime = performance.now(); }
    start() { this.startTime = performance.now(); }
    elapsed() { return performance.now() - this.startTime; }
    stop() { return this.elapsed(); }
}

// i18n
export function getCurrentLocale() {
    try {
        return localStorage.getItem('language') === 'en' ? 'en' : 'zh-cn';
    } catch {
        return 'zh-cn';
    }
}
export function t(strings, ...values) {
    if (typeof strings === 'string') return strings;
    if (Array.isArray(strings)) {
        return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
    }
    return String(strings ?? '');
}

// Tokenizers
export async function getTokenCountAsync(text) {
    if (!text) return 0;
    const s = String(text);
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = s.length - cjk;
    return Math.ceil(cjk * 1.5 + other / 3.8);
}

// Group chats stubs (single-char mode)
export function getGroupMembers() { return []; }
export async function editGroup() { }
export async function saveGroupChat() { }

// renderExtensionTemplateAsync (for ST-Prompt-Template & others)
export async function renderExtensionTemplateAsync(extensionName, templateName, templateData = {}) {
    const cleanName = String(extensionName || '').replace(/^third-party\//, '').toLowerCase();
    const tpl = String(templateName || '').replace(/\.html$/i, '').toLowerCase();
    const candidates = [];
    if (cleanName === 'st-prompt-template') {
        candidates.push(`scripts/st-plugins/prompt-template-${tpl}.html`);
    }
    candidates.push(`scripts/st-plugins/${cleanName}-${tpl}.html`);
    candidates.push(`scripts/st-plugins/${tpl}.html`);
    for (const url of candidates) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.text();
        } catch { }
    }
    return '';
}

// ============================================================
// 13. SillyTavern.getContext() Global Object
// ============================================================

export function getContext() {
    syncStateFromBridge();
    return {
        chat,
        characters,
        characterId: this_chid,
        groupId: selected_group,
        groups,
        chatId: getCurrentChatId(),
        name1,
        name2,
        userAvatar: user_avatar,
        chatMetadata: chat_metadata,
        extensionSettings: extension_settings,
        extensionPrompts: extension_prompts,
        eventSource,
        eventTypes: event_types,
        event_types,
        powerUserSettings: power_user,
        chatCompletionSettings: oai_settings,
        onlineStatus: online_status,
        mainApi: main_api,
        maxContext: getMaxContextSize(),
        worldNames: world_names,
        SlashCommandParser,
        SlashCommand,
        SlashCommandArgument,
        SlashCommandNamedArgument,
        ARGUMENT_TYPE,
        executeSlashCommandsWithOptions,
        executeSlashCommands: executeSlashCommandsWithOptions,
        MacrosParser,
        registerMacro: (k, v, d) => MacrosParser.registerMacro(k, v, d),
        unregisterMacro: (k) => MacrosParser.unregisterMacro(k),
        substituteParams,
        substituteParamsExtended,
        setExtensionPrompt,
        saveSettingsDebounced,
        saveSettings,
        saveChat: saveChatConditional,
        saveChatConditional,
        saveMetadata,
        saveMetadataDebounced,
        reloadCurrentChat,
        updateMessageBlock,
        addOneMessage,
        messageFormatting,
        getRequestHeaders,
        getCurrentChatId,
        getCharacterCardFields,
        writeExtensionField,
        callGenericPopup,
        POPUP_TYPE,
        POPUP_RESULT,
        generateRaw,
        generateQuietPrompt,
        stopGeneration,
        getPresetManager,
        getTokenCountAsync,
        loadWorldInfo,
        saveWorldInfo,
        variables: {
            local: {
                get: getLocalVariable,
                set: setLocalVariable,
                del: deleteLocalVariable,
                add: addLocalVariable,
            },
            global: {
                get: getGlobalVariable,
                set: setGlobalVariable,
                del: deleteGlobalVariable,
                add: addGlobalVariable,
            },
        },
        libs: { lodash, yaml, showdown, DOMPurify, hljs, Popper },
        t,
        getCurrentLocale,
        renderExtensionTemplateAsync,
        accountStorage,
        get quickReplyApi() { return window.quickReplyApi || null; },
    };
}

if (typeof window !== 'undefined') {
    window.SillyTavern = Object.assign(window.SillyTavern || {}, {
        version: '1.13.4',
        getContext,
        libs: { lodash, yaml, showdown, DOMPurify, hljs, Popper },
    });
    window.saveSettingsDebounced = saveSettingsDebounced;

    // Lightweight jQuery UI .sortable() shim (used by LittleWhiteBox scheduled-tasks & ST plugins)
    if (window.$ && window.$.fn && !window.$.fn.sortable) {
        window.$.fn.sortable = function (arg) {
            if (arg === 'toArray') return [];
            if (arg === 'instance') return { destroy() { } };
            return this;
        };
    }
}

// ============================================================
// 14. Virtual Frontend /api/* Fetch Router (Zero-Backend Netlify)
// ============================================================

const VIRTUAL_FILES = new Map();

export function installVirtualApiFetch() {
    if (window.__NIKA_ST_FETCH_PATCHED__) return;
    window.__NIKA_ST_FETCH_PATCHED__ = true;
    const nativeFetch = window.fetch.bind(window);

    function jsonResp(obj, status = 200) {
        return new Response(JSON.stringify(obj), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    window.fetch = async function (input, init = {}) {
        try {
            const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.href : input?.url || '');
            let pathname = '';
            if (urlStr.startsWith('/')) {
                pathname = urlStr.split('?')[0];
            } else if (urlStr.startsWith(window.location.origin + '/')) {
                pathname = urlStr.slice(window.location.origin.length).split('?')[0];
            }

            if (pathname === '/version') {
                return jsonResp({
                    pkgVersion: '1.13.4',
                    gitBranch: 'release',
                    commitHash: 'static-netlify',
                    isLatest: true,
                });
            }

            if (pathname.startsWith('/api/')) {
                let body = {};
                if (init?.body && typeof init.body === 'string') {
                    try { body = JSON.parse(init.body); } catch { }
                }

                // 0. Presets API
                if (pathname === '/api/presets/save') {
                    const pm = getPresetManager('openai');
                    await pm.savePreset(body.name, body.preset);
                    return jsonResp({ name: body.name, ok: true });
                }
                if (pathname === '/api/presets/delete') {
                    const pm = getPresetManager('openai');
                    await pm.deletePreset(body.name);
                    return jsonResp({ ok: true });
                }

                // 1. Chat Completion Generation -> forward to chat.html's direct LLM client
                if (pathname === '/api/backends/chat-completions/generate') {
                    const b = getBridge();
                    const messages = body.messages || [];
                    const wantStream = !!body.stream;
                    const text = b?.callLLM ? await b.callLLM(messages, {
                        stream: false,
                        max_tokens: body.max_tokens,
                        temperature: body.temperature,
                        signal: init.signal,
                    }) : '';

                    if (wantStream) {
                        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] })}\n\ndata: [DONE]\n\n`;
                        return new Response(sse, {
                            status: 200,
                            headers: { 'Content-Type': 'text/event-stream' },
                        });
                    }
                    return jsonResp({
                        id: 'chatcmpl-' + uuidv4(),
                        object: 'chat.completion',
                        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
                    });
                }

                if (pathname === '/api/backends/chat-completions/status') {
                    return jsonResp({ result: 'ok', data: [] });
                }

                // 2. Settings & Quick Reply presets
                if (pathname === '/api/settings/get') {
                    let quickReplyPresets = [];
                    try {
                        const rawQr = localStorage.getItem('nika_st_quick_reply_sets_v2');
                        if (rawQr) quickReplyPresets = JSON.parse(rawQr);
                    } catch { }
                    return jsonResp({
                        settings: JSON.stringify({ extension_settings, power_user, oai_settings }),
                        world_names,
                        extension_settings,
                        quickReplyPresets,
                    });
                }
                if (pathname === '/api/quick-replies/save') {
                    try {
                        const rawQr = localStorage.getItem('nika_st_quick_reply_sets_v2');
                        const list = rawQr ? JSON.parse(rawQr) : [];
                        const idx = list.findIndex(s => s && s.name === body.name);
                        if (idx >= 0) list[idx] = body;
                        else list.push(body);
                        localStorage.setItem('nika_st_quick_reply_sets_v2', JSON.stringify(list));
                    } catch { }
                    return jsonResp({ ok: true });
                }
                if (pathname === '/api/quick-replies/delete') {
                    try {
                        const rawQr = localStorage.getItem('nika_st_quick_reply_sets_v2');
                        const list = rawQr ? JSON.parse(rawQr) : [];
                        const filtered = list.filter(s => s && s.name !== body.name);
                        localStorage.setItem('nika_st_quick_reply_sets_v2', JSON.stringify(filtered));
                    } catch { }
                    return jsonResp({ ok: true });
                }
                if (pathname === '/api/settings/save') {
                    saveSettings();
                    return jsonResp({ result: 'ok' });
                }

                // 3. World Info
                if (pathname === '/api/worldinfo/get') {
                    const data = await loadWorldInfo(body.name);
                    return jsonResp(data || { entries: {} });
                }
                if (pathname === '/api/worldinfo/edit') {
                    await saveWorldInfo(body.name, body.data);
                    return jsonResp({ ok: true });
                }
                if (pathname === '/api/worldinfo/delete') {
                    await deleteWorldInfo(body.name);
                    return jsonResp({ ok: true });
                }

                // 4. Chats
                if (pathname === '/api/chats/get') {
                    syncStateFromBridge();
                    return jsonResp([{ user_name: name1, character_name: name2, chat_metadata }, ...chat]);
                }
                if (pathname === '/api/chats/save') {
                    await saveChatConditional();
                    return jsonResp({ result: 'ok' });
                }
                if (pathname === '/api/chats/export') {
                    syncStateFromBridge();
                    return jsonResp({ result: JSON.stringify(chat) });
                }

                // 5. Virtual files & images (IndexedDB/Memory)
                if (pathname === '/api/files/upload') {
                    const fileName = body.name || ('file_' + Date.now());
                    VIRTUAL_FILES.set(fileName, body.data || '');
                    return jsonResp({ path: `/user/files/${fileName}`, ok: true });
                }
                if (pathname === '/api/files/delete') {
                    VIRTUAL_FILES.delete(body.path || body.name);
                    return jsonResp({ ok: true });
                }
                if (pathname === '/api/images/list') return jsonResp([]);
                if (pathname === '/api/groups/all') return jsonResp([]);

                // 6. Extensions metadata/version
                if (pathname === '/api/extensions/version') {
                    return jsonResp({ currentBranchName: 'static', currentCommitHash: 'netlify', isUpToDate: true });
                }
                if (pathname.startsWith('/api/extensions/')) {
                    return jsonResp({ ok: true, message: 'Static frontend mode' });
                }

                // Default harmless stub for any other /api/* endpoint
                return jsonResp({ ok: true });
            }

            // Intercept JS-Slash-Runner's optional GitLab remote version/changelog checks so users without proxy never see ERR_CONNECTION_CLOSED
            if (urlStr.includes('gitlab.com') && urlStr.includes('JS-Slash-Runner')) {
                if (urlStr.includes('manifest.json')) {
                    return jsonResp({ version: '4.12.2', display_name: '酒馆助手' });
                }
                return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        } catch (err) {
            console.warn('[ST-VirtualAPI] Intercept error:', err);
        }

        return nativeFetch(input, init);
    };
}

installVirtualApiFetch();

export default {
    lodash,
    yaml,
    showdown,
    DOMPurify,
    hljs,
    Popper,
    getContext,
    eventSource,
    event_types,
    extension_settings,
    syncStateFromBridge,
};
