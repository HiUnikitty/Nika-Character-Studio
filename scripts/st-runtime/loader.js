/**
 * Nika ST Runtime - Automatic Plugin Loader & Lifecycle Orchestrator
 * Reads manifest.json from built-in SillyTavern plugins, injects CSS/JS in
 * loading_order, mounts ST settings drawers, and coordinates prompt/render hooks.
 */

import {
    chat,
    characters,
    this_chid,
    chat_metadata,
    extension_prompts,
    extension_prompt_types,
    extension_prompt_roles,
    extension_settings,
    eventSource,
    event_types,
    oai_settings,
    syncStateFromBridge,
    getCurrentChatId,
    substituteParams,
    executeSlashCommandsWithOptions,
} from './host.js';
import { initQuickReply } from './quick-reply.js';

const BUILTIN_PLUGINS = [
    {
        id: 'ST-Prompt-Template',
        displayName: 'Prompt Template/提示词模板',
        version: '1.17.10.1',
        order: 1,
        js: 'scripts/st-plugins/prompt-template.js',
        css: '',
        generate_interceptor: '',
    },
    {
        id: 'LittleWhiteBox',
        displayName: 'LittleWhiteBox (角色卡核心版)',
        version: '3.2.7-cardcore',
        order: 10,
        js: 'scripts/st-plugins/littlewhitebox.js',
        css: 'scripts/st-plugins/littlewhitebox.css',
        generate_interceptor: 'xiaobaixGenerateInterceptor',
    },
    {
        id: 'JS-Slash-Runner',
        displayName: '酒馆助手',
        version: '4.12.2',
        order: 100,
        js: 'scripts/st-plugins/js-slash-runner.js',
        css: 'scripts/st-plugins/js-slash-runner.css',
        generate_interceptor: '',
    },
];

const pluginStates = new Map();
const generateInterceptors = [];
let initialized = false;

const PLUGIN_META = {
    'ST-Prompt-Template': {
        shortName: { zh: '提示词模板', en: 'Prompt Template' },
        sub: { zh: 'EJS / 宏编译', en: 'EJS / Macros' },
        icon: 'fa-code',
        drawerMatch: (el) => el.id === 'prompt_template_settings' || !!el.querySelector('#pt_enabled, #prompt_template_settings'),
    },
    'LittleWhiteBox': {
        shortName: { zh: '小白X 核心', en: 'LittleWhiteBox' },
        sub: { zh: 'State 2.0 / 任务', en: 'State 2.0 / Tasks' },
        icon: 'fa-cube',
        drawerMatch: (el) => !!el.querySelector('#xiaobaix_enabled, .littlewhitebox'),
    },
    'JS-Slash-Runner': {
        shortName: { zh: '酒馆助手', en: 'Tavern Helper' },
        sub: { zh: '前端渲染 / 脚本', en: 'Frontend / Scripts' },
        icon: 'fa-wand-magic-sparkles',
        drawerMatch: (el) => !!el.querySelector('[class*="TH-"], [id*="tavern_helper"]') || /酒馆助手|Tavern Helper/.test(el.textContent || ''),
    },
    'QuickReply': {
        shortName: { zh: '快速回复', en: 'Quick Reply' },
        sub: { zh: 'Quick Reply / 导入导出', en: 'Import / Export' },
        icon: 'fa-bolt',
        drawerMatch: (el) => el.id === 'qr--settings',
    },
};

function getUiLang() {
    try {
        return localStorage.getItem('language') === 'en' ? 'en' : 'zh';
    } catch {
        return 'zh';
    }
}

function getMetaText(val, lang = getUiLang()) {
    if (val && typeof val === 'object') return val[lang] || val.zh || val.en || '';
    return String(val ?? '');
}

let activePluginTab = 'JS-Slash-Runner';

function ensureStDomContainers() {
    let mountRoot = document.getElementById('st-plugins-settings-mount');
    if (!mountRoot) {
        mountRoot = document.createElement('div');
        mountRoot.id = 'st-plugins-settings-mount';
        mountRoot.style.display = 'none';
        document.body.appendChild(mountRoot);
    }
    if (!document.getElementById('extensions_settings')) {
        const d1 = document.createElement('div');
        d1.id = 'extensions_settings';
        d1.className = 'st-extensions-settings-column';
        mountRoot.appendChild(d1);
    }
    if (!document.getElementById('extensions_settings2')) {
        const d2 = document.createElement('div');
        d2.id = 'extensions_settings2';
        d2.className = 'st-extensions-settings-column';
        mountRoot.appendChild(d2);
    }

    // ST #send_form / #qr--bar anchor: mounted cleanly above Nika's chat footer so script buttons (e.g. MVU/章节管理器) are visible & clickable
    // Also bridges SillyTavern's #send_textarea & #send_but to Nika's #chat-input & #send-button so cards like 后日谈 can send user messages & trigger AI replies!
    if (!document.getElementById('send_form')) {
        const sf = document.createElement('div');
        sf.id = 'send_form';
        sf.className = 'nika-st-qr-host';
        const qrBar = document.createElement('div');
        qrBar.id = 'qr--bar';
        qrBar.className = 'flex-container';
        sf.appendChild(qrBar);

        const stTextarea = document.createElement('textarea');
        stTextarea.id = 'send_textarea';
        stTextarea.style.display = 'none';
        stTextarea.setAttribute('aria-hidden', 'true');
        sf.appendChild(stTextarea);

        const stSendBtn = document.createElement('div');
        stSendBtn.id = 'send_but';
        stSendBtn.style.display = 'none';
        stSendBtn.setAttribute('aria-hidden', 'true');
        sf.appendChild(stSendBtn);

        const syncToNikaInput = () => {
            const chatInput = document.getElementById('chat-input');
            if (chatInput && stTextarea.value) {
                chatInput.value = stTextarea.value;
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        stTextarea.addEventListener('input', syncToNikaInput);
        stTextarea.addEventListener('change', syncToNikaInput);

        const triggerNikaSend = () => {
            const chatInput = document.getElementById('chat-input');
            const sendBtn = document.getElementById('send-button');
            if (!chatInput || !sendBtn) return;
            if (stTextarea.value && stTextarea.value.trim()) {
                chatInput.value = stTextarea.value;
                stTextarea.value = '';
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (chatInput.value && chatInput.value.trim()) {
                sendBtn.click();
            } else {
                // If input is empty (e.g. /trigger style click), invoke bridge triggerGenerate
                window.__NIKA_ST_BRIDGE__?.triggerGenerate?.();
            }
        };
        stSendBtn.addEventListener('click', triggerNikaSend);

        const footer = document.querySelector('#chat-container footer, main footer, footer');
        if (footer && footer.parentNode) {
            footer.parentNode.insertBefore(sf, footer);
        } else {
            document.body.appendChild(sf);
        }
    }

    // Add an optional Quick Reply shortcut button beside #chat-input (HIDDEN by default; user can enable it in Quick Reply settings)
    if (!document.getElementById('nika-qr-open-btn')) {
        const chatInput = document.getElementById('chat-input');
        if (chatInput && chatInput.parentNode) {
            const qrBtn = document.createElement('button');
            qrBtn.id = 'nika-qr-open-btn';
            qrBtn.type = 'button';
            qrBtn.className = 'w-10 h-10 flex-shrink-0 rounded-lg items-center justify-center transition-colors';
            qrBtn.style.cssText = 'display:none;border:1px solid var(--border-color);background:var(--card-bg-color);color:var(--text-color);cursor:pointer;';
            qrBtn.title = getUiLang() === 'en' ? 'Quick Reply Settings / Import & Export' : '快速回复设置 / 导入导出 (Quick Reply)';
            qrBtn.innerHTML = '<i class="fas fa-bolt" style="color:var(--primary-color);"></i>';
            qrBtn.addEventListener('click', () => {
                const modal = document.getElementById('st-plugins-modal');
                if (modal) modal.classList.add('active');
                applyActivePluginTab('QuickReply');
            });
            chatInput.parentNode.insertBefore(qrBtn, chatInput);
        }
    }

    // Unified theme-adaptive CSS bridging SillyTavern --SmartTheme* variables to Nika-Chat CSS variables
    const oldStyle = document.getElementById('nika-st-compat-style');
    if (oldStyle) oldStyle.remove();
    const style = document.createElement('style');
    style.id = 'nika-st-compat-style';
    style.textContent = `
        /* Map SillyTavern SmartTheme variables directly onto Nika-Chat active theme */
        :root, #st-plugins-modal {
            --SmartThemeBodyColor: var(--text-color, #e5e7eb);
            --SmartThemeTextColor: var(--text-color, #e5e7eb);
            --SmartThemeEmColor: var(--text-secondary-color, #9ca3af);
            --SmartThemeBGColor: var(--card-bg-color, #1e1f24);
            --SmartThemeBlurTintColor: var(--bg-color, #16171b);
            --SmartThemeChatTintColor: var(--card-bg-color, #1e1f24);
            --SmartThemeBorderColor: var(--border-color, #32343d);
            --SmartThemeQuoteColor: var(--primary-color, #f59e0b);
            --SmartThemeUnderlineColor: var(--primary-color, #f59e0b);
            --SmartThemeShadowColor: rgba(0, 0, 0, 0.35);
            --black30a: rgba(0, 0, 0, 0.22);
            --black70a: rgba(0, 0, 0, 0.55);
            --white20a: rgba(255, 255, 255, 0.12);
        }

        /* Keep ST Plugins modal cleanly above any card-injected floating widgets (e.g. phone status ball) */
        #st-plugins-modal {
            z-index: 2147483644 !important;
        }
        .st-shim-popup-overlay,
        #st-generic-popup-overlay,
        .st-generic-popup-overlay {
            z-index: 2147483647 !important;
        }

        /* Top 4-plugin responsive tab buttons (2x2 on mobile, 4x1 on desktop) */
        .st-plugin-tab-btn {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            padding: 8px 10px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
            background: var(--card-bg-color);
            color: var(--text-color);
            cursor: pointer;
            transition: all 0.18s ease;
            text-align: left;
            min-width: 0;
        }
        @media (max-width: 639px) {
            .st-plugin-tab-btn {
                padding: 7px 9px;
            }
            .st-plugin-tab-btn .st-tab-title {
                font-size: 12.5px;
            }
            .st-plugin-tab-btn .st-tab-sub {
                font-size: 10.5px;
            }
        }
        .st-plugin-tab-btn:hover {
            border-color: color-mix(in srgb, var(--primary-color) 60%, var(--border-color));
            transform: translateY(-1px);
        }
        .st-plugin-tab-btn.active {
            border-color: var(--primary-color);
            background: color-mix(in srgb, var(--primary-color) 13%, var(--card-bg-color));
            box-shadow: 0 2px 10px color-mix(in srgb, var(--primary-color) 18%, transparent);
        }
        .st-plugin-tab-btn .st-tab-title {
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-color);
        }
        .st-plugin-tab-btn .st-tab-sub {
            font-size: 11px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-secondary-color);
        }
        .st-plugin-tab-btn .st-tab-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        /* Clean panel presentation: top tabs replace redundant outer accordions */
        #st-plugins-settings-mount .st-plugin-pane-hidden {
            display: none !important;
        }
        #st-plugins-settings-mount > .st-extensions-settings-column > .inline-drawer,
        #st-plugins-settings-mount #prompt_template_settings > .inline-drawer {
            border: none !important;
            background: transparent !important;
            margin: 0 !important;
            box-shadow: none !important;
        }
        #st-plugins-settings-mount > .st-extensions-settings-column > .inline-drawer > .inline-drawer-header,
        #st-plugins-settings-mount > .st-extensions-settings-column > div > .inline-drawer > .inline-drawer-header,
        #st-plugins-settings-mount #prompt_template_settings > .inline-drawer > .inline-drawer-header {
            display: none !important;
        }
        #st-plugins-settings-mount > .st-extensions-settings-column > .inline-drawer > .inline-drawer-content,
        #st-plugins-settings-mount > .st-extensions-settings-column > div > .inline-drawer > .inline-drawer-content,
        #st-plugins-settings-mount #prompt_template_settings > .inline-drawer > .inline-drawer-content {
            display: block !important;
            padding: 0 !important;
        }
        #st-plugins-settings-mount > .st-extensions-settings-column > div > .inline-drawer {
            border: none !important;
            background: transparent !important;
            margin: 0 !important;
        }

        /* Nested inline-drawers inside plugin panels stay clean and collapsible */
        #st-plugins-settings-mount .inline-drawer .inline-drawer {
            border: 1px solid var(--border-color);
            border-radius: 10px;
            margin: 8px 0;
            background: color-mix(in srgb, var(--bg-color) 50%, var(--card-bg-color));
            overflow: hidden;
        }
        #st-plugins-settings-mount .inline-drawer .inline-drawer > .inline-drawer-header {
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            padding: 9px 14px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            background: color-mix(in srgb, var(--primary-color) 8%, transparent);
        }
        #st-plugins-settings-mount .inline-drawer .inline-drawer > .inline-drawer-content {
            padding: 12px 14px;
        }

        /* Unified inputs, selects, textareas & buttons across all 3 plugins */
        #st-plugins-settings-mount input[type="text"],
        #st-plugins-settings-mount input[type="number"],
        #st-plugins-settings-mount input[type="search"],
        #st-plugins-settings-mount select,
        #st-plugins-settings-mount textarea,
        #st-plugins-settings-mount .text_pole {
            background-color: var(--input-bg-color) !important;
            color: var(--text-color) !important;
            border: 1px solid var(--border-color) !important;
            border-radius: 8px !important;
            padding: 5px 10px !important;
            font-size: 13px !important;
            outline: none;
            transition: border-color 0.15s ease;
        }
        #st-plugins-settings-mount input:focus,
        #st-plugins-settings-mount select:focus,
        #st-plugins-settings-mount textarea:focus {
            border-color: var(--primary-color) !important;
        }
        #st-plugins-settings-mount .menu_button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            background: var(--input-bg-color);
            color: var(--text-color);
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        #st-plugins-settings-mount .menu_button:hover {
            border-color: var(--primary-color);
            color: var(--primary-color);
        }

        /* Modern pill toggle checkboxes for Prompt Template & LittleWhiteBox (exclude JSR sr-only peers) */
        #st-plugins-settings-mount input[type="checkbox"]:not(.sr-only):not(.peer) {
            -webkit-appearance: none;
            appearance: none;
            position: relative;
            width: 36px;
            height: 20px;
            min-width: 36px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--text-secondary-color) 35%, transparent);
            border: 1px solid var(--border-color);
            cursor: pointer;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }
        #st-plugins-settings-mount input[type="checkbox"]:not(.sr-only):not(.peer)::before {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            transition: transform 0.2s ease;
        }
        #st-plugins-settings-mount input[type="checkbox"]:not(.sr-only):not(.peer):checked {
            background: var(--primary-color);
            border-color: var(--primary-color);
        }
        #st-plugins-settings-mount input[type="checkbox"]:not(.sr-only):not(.peer):checked::before {
            transform: translateX(16px);
        }

        /* FIX: JS-Slash-Runner Tailwind v4 Toggle.vue collapsed to 8x4px by Tailwind v3 CDN */
        #st-plugins-settings-mount div.relative.inline-block:has(> input.peer.sr-only[type="checkbox"]) {
            width: 38px !important;
            height: 22px !important;
            min-width: 38px !important;
            min-height: 22px !important;
            flex-shrink: 0;
        }
        #st-plugins-settings-mount div.relative.inline-block:has(> input.peer.sr-only) > label {
            position: absolute !important;
            inset: 0 !important;
            border-radius: 999px !important;
            background: color-mix(in srgb, var(--text-secondary-color) 38%, transparent) !important;
            border: 1px solid var(--border-color) !important;
            transition: background-color 0.2s ease !important;
        }
        #st-plugins-settings-mount div.relative.inline-block > input.peer.sr-only:checked + label {
            background: var(--primary-color) !important;
            border-color: var(--primary-color) !important;
        }
        #st-plugins-settings-mount div.relative.inline-block:has(> input.peer.sr-only) > label::after {
            content: '' !important;
            position: absolute !important;
            top: 2px !important;
            left: 2px !important;
            width: 16px !important;
            height: 16px !important;
            transform: none !important;
            translate: none !important;
            border-radius: 999px !important;
            background: #ffffff !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
            transition: transform 0.2s ease !important;
        }
        #st-plugins-settings-mount div.relative.inline-block > input.peer.sr-only:checked + label::after {
            transform: translateX(16px) !important;
            translate: none !important;
        }

        /* Polish JS-Slash-Runner cards, tabs & borders */
        #st-plugins-settings-mount [class*="border-"] {
            border-color: var(--border-color) !important;
        }
        #st-plugins-settings-mount .flex-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #st-plugins-settings-mount .flexFlowColumn {
            flex-direction: column;
            align-items: stretch;
        }

        /* Polish ST-Prompt-Template settings layout */
        #prompt_template_settings .inline-drawer-content {
            display: flex !important;
            flex-direction: column;
            gap: 6px;
        }
        #prompt_template_settings hr {
            border: none;
            border-top: 1px solid color-mix(in srgb, var(--border-color) 65%, transparent);
            margin: 6px 0;
        }
        #prompt_template_settings label.flex-container,
        #prompt_template_settings .flex-container {
            padding: 6px 10px;
            border-radius: 8px;
            font-size: 13px;
            color: var(--text-color);
            transition: background-color 0.15s ease;
        }
        #prompt_template_settings label.flex-container:hover {
            background: color-mix(in srgb, var(--input-bg-color) 55%, transparent);
        }
        #prompt_template_settings input[type="range"] {
            max-width: 180px;
            margin-right: 8px;
        }
        #prompt_template_settings input[type="number"] {
            width: 84px !important;
        }
        #prompt_template_settings select {
            min-width: 160px;
        }
        #prompt_template_settings .fa-circle-question,
        #prompt_template_settings .notes-link {
            color: var(--text-secondary-color);
            opacity: 0.75;
            font-size: 12px;
        }

        /* Polish LittleWhiteBox layout: convert cramped vertical tabs into sleek horizontal pills */
        #st-plugins-settings-mount .littlewhitebox.settings-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 12px !important;
        }
        #st-plugins-settings-mount .littlewhitebox .settings-menu-vertical {
            display: flex !important;
            flex-direction: row !important;
            gap: 6px !important;
            padding: 4px;
            border-radius: 10px;
            background: color-mix(in srgb, var(--bg-color) 75%, transparent);
            border: 1px solid var(--border-color);
            width: 100% !important;
        }
        #st-plugins-settings-mount .littlewhitebox .menu-tab {
            writing-mode: horizontal-tb !important;
            flex: 1 !important;
            padding: 7px 12px !important;
            border-radius: 7px !important;
            border: none !important;
            text-align: center !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            color: var(--text-secondary-color) !important;
            transition: all 0.18s ease !important;
        }
        #st-plugins-settings-mount .littlewhitebox .menu-tab.active {
            background: var(--primary-color) !important;
            color: #ffffff !important;
            font-weight: 600 !important;
        }
        #st-plugins-settings-mount .littlewhitebox .settings-content {
            width: 100% !important;
            margin: 0 !important;
        }
        #st-plugins-settings-mount .littlewhitebox .section-divider {
            font-size: 12px;
            font-weight: 600;
            color: var(--primary-color);
            margin: 12px 0 6px !important;
            padding-bottom: 4px;
            border-bottom: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
        }
        #st-plugins-settings-mount .littlewhitebox .section-divider:first-child {
            margin-top: 0 !important;
        }
        #st-plugins-settings-mount .littlewhitebox .littlewhitebox-setting-row {
            padding: 7px 10px;
            border-radius: 8px;
            background: color-mix(in srgb, var(--bg-color) 45%, transparent);
            margin-bottom: 6px;
            font-size: 13px;
        }
        #st-plugins-settings-mount .littlewhitebox .task-tab-bar {
            display: flex;
            gap: 6px;
            margin: 8px 0;
        }
        #st-plugins-settings-mount .littlewhitebox .task-tab {
            padding: 5px 12px;
            border-radius: 7px;
            font-size: 12px;
            border: 1px solid var(--border-color);
            color: var(--text-secondary-color);
            background: var(--bg-color);
        }
        #st-plugins-settings-mount .littlewhitebox .task-tab.active {
            border-color: var(--primary-color);
            color: var(--primary-color);
            background: color-mix(in srgb, var(--primary-color) 12%, transparent);
            font-weight: 600;
        }

        /* Frontend card iframe containers (safe containment + GPU smooth scroll in normal chat mode) */
        #chat {
            overscroll-behavior-y: contain;
            -webkit-overflow-scrolling: touch;
        }
        .mes .mes_text .TH-render,
        .mes .mes_text .xiaobaix-iframe-wrapper {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
        }
        .mes .mes_text .TH-render iframe,
        .mes .mes_text .xiaobaix-iframe-wrapper iframe {
            width: 100%;
            max-width: 100%;
            border: none;
            border-radius: 8px;
            display: block;
        }

        /* Universal Fullscreen Frontend Card Adapter (for immersive Galgame/RPG ST cards) */
        body.nika-st-fullscreen-card {
            overflow: hidden !important;
        }
        body.nika-st-fullscreen-card #app-wrapper {
            padding-left: 0 !important;
        }
        body.nika-st-fullscreen-card #app-wrapper main {
            max-width: 100vw !important;
            width: 100vw !important;
            margin: 0 !important;
        }
        body.nika-st-fullscreen-card #app-wrapper main > .card {
            border-radius: 0 !important;
            border: none !important;
            height: 100vh !important;
            height: 100dvh !important;
            background: transparent !important;
        }
        body.nika-st-fullscreen-card #app-wrapper main > .card > header,
        body.nika-st-fullscreen-card #app-wrapper main > .card > footer {
            display: none !important;
        }
        body.nika-st-fullscreen-card #chat {
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            height: 100vh !important;
            height: 100dvh !important;
        }
        body.nika-st-fullscreen-card #chat > .mes {
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
        }
        body.nika-st-fullscreen-card #chat > .mes > div:first-child {
            display: none !important;
        }
        body.nika-st-fullscreen-card #chat > .mes .chat-bubble {
            padding: 0 !important;
            margin: 0 !important;
            border-radius: 0 !important;
            border: none !important;
            background: transparent !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            opacity: 1 !important;
        }
        body.nika-st-fullscreen-card #chat > .mes .mes_text,
        body.nika-st-fullscreen-card #chat > .mes .TH-render {
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-width: 100vw !important;
        }
        body.nika-st-fullscreen-card #chat > .mes .TH-render iframe {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-width: 100vw !important;
            border-radius: 0 !important;
            z-index: 40 !important;
        }
        body.nika-st-fullscreen-card .sidebar {
            z-index: 2147483641 !important;
        }
        /* Sleek quick-reply / script button bar above chat input (hidden when empty) */
        #send_form.nika-st-qr-host {
            display: none;
            padding: 6px 14px 2px;
            background: transparent;
            flex-shrink: 0;
        }
        #send_form.nika-st-qr-host:has(button, .qr--button, .menu_button) {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
        }
        #send_form.nika-st-qr-host #qr--bar,
        #send_form.nika-st-qr-host .qr--buttons {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            width: 100%;
        }
        #send_form.nika-st-qr-host .qr--button,
        #send_form.nika-st-qr-host .menu_button {
            padding: 4px 10px !important;
            border-radius: 8px !important;
            border: 1px solid var(--border-color) !important;
            background: var(--card-bg-color) !important;
            color: var(--text-color) !important;
            font-size: 12px !important;
            cursor: pointer !important;
            transition: all 0.15s ease !important;
        }
        #send_form.nika-st-qr-host .qr--button:hover,
        #send_form.nika-st-qr-host .menu_button:hover {
            border-color: var(--primary-color) !important;
            color: var(--primary-color) !important;
        }
        body.nika-st-fullscreen-card #send_form.nika-st-qr-host {
            display: none !important;
        }
        /* Keep JS-Slash-Runner VueFinalModal popups visible above everything */
        .vfm {
            z-index: 2147483600 !important;
        }
        body.nika-st-fullscreen-card .modal-overlay {
            z-index: 2147483642 !important;
        }
        #nika-st-fullscreen-pill {
            position: fixed;
            top: 10px;
            right: 12px;
            z-index: 2147483640;
            display: none;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 999px;
            background: rgba(20, 20, 26, 0.72);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            color: #f4f4f5;
            font-size: 12px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
            opacity: 0.45;
            transition: opacity 0.2s ease;
        }
        #nika-st-fullscreen-pill:hover {
            opacity: 1;
        }
        body.nika-st-fullscreen-card #nika-st-fullscreen-pill {
            display: flex;
        }
        #nika-st-fullscreen-pill button {
            background: transparent;
            border: none;
            color: inherit;
            cursor: pointer;
            padding: 3px 8px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
        }
        #nika-st-fullscreen-pill button:hover {
            background: rgba(255, 255, 255, 0.14);
        }
    `;
    document.head.appendChild(style);

    // Bind ST standard inline-drawer toggle handler once (for nested drawers)
    if (!window.__NIKA_ST_DRAWER_BOUND__ && window.$) {
        window.__NIKA_ST_DRAWER_BOUND__ = true;
        window.$(document).on('click.nikaStDrawer', '.inline-drawer-toggle', function (e) {
            if (e.target.closest('input, button, select, a, .menu_button')) return;
            const $drawer = window.$(this).closest('.inline-drawer');
            const $content = $drawer.children('.inline-drawer-content');
            const $icon = window.$(this).find('.inline-drawer-icon').first();
            const isOpen = $content.is(':visible');
            $content.toggle(!isOpen);
            $drawer.toggleClass('open', !isOpen);
            $icon.toggleClass('down', isOpen).toggleClass('up', !isOpen);
        });
    }
}

let _ptZhDictCache = null;

// Non-destructive English translation map for Chinese-first ST community plugins (LittleWhiteBox & Tavern Helper)
const ST_PANEL_ZH_TO_EN = {
    '小白X (角色卡核心版)': 'LittleWhiteBox (Card Core)',
    '渲染交互': 'Rendering & UI',
    '循环任务': 'Scheduled Tasks',
    '变量控制': 'Variables',
    '总开关': 'Master Switch',
    '启用小白X': 'Enable LittleWhiteBox',
    '前端渲染': 'Frontend Rendering',
    'HTML/iframe 渲染': 'HTML / iframe Rendering',
    '最大楼层': 'Max Rendered Messages',
    '启用 Blob 渲染 (大型HTML适用)': 'Enable Blob Rendering (for large HTML)',
    '角色消息模板': 'Character Message Template',
    '启用沉浸式自定义模板': 'Enable Immersive Custom Template',
    '编辑模板': 'Edit Template',
    '请选择一个角色': 'Please select a character',
    '循环任务 (xbqte / 角色卡任务)': 'Scheduled Tasks (xbqte / Card Tasks)',
    '启用循环任务': 'Enable Scheduled Tasks',
    '显示/隐藏按钮栏': 'Show / Hide Button Bar',
    '按钮栏': 'Button Bar',
    '角色任务': 'Character Tasks',
    '全局任务': 'Global Tasks',
    '预设任务': 'Preset Tasks',
    '+角色': '+ Character',
    '+全局': '+ Global',
    '+预设': '+ Preset',
    '导入': 'Import',
    '变量控制 (State 2.0 / 1.0)': 'Variable Control (State 2.0 / 1.0)',
    '变量管理': 'Variable Management',
    '消息栏显示变量面板按钮': 'Show Variable Panel Button on Messages',
    '酒馆助手': 'Tavern Helper',
    '扩展信息': 'Extension Info',
    '渲染': 'Render',
    '脚本': 'Scripts',
    '工具': 'Tools',
    '优化': 'Optimize',
    '开发': 'Dev',
    '启用渲染器': 'Enable Renderer',
    '启用后，符合条件的代码块将被渲染': 'When enabled, matching code blocks will be rendered as frontend UI',
    '渲染优化': 'Render Optimization',
    '渲染深度': 'Render Depth',
    '设置需要渲染的楼层数，从最新楼层开始计数。为 0 时，将渲染所有楼层': 'Number of recent messages to render (0 renders all messages)',
    '忽略隐藏楼层': 'Ignore Hidden Messages',
    '不渲染已经被设置为AI不可见的楼层，且不计入渲染深度设定的楼层数': 'Skip messages hidden from AI and exclude them from render depth count',
    '启用代码折叠': 'Enable Code Folding',
    '折叠指定类型的代码块，当选择“仅前端”时，将只折叠可渲染成前端界面但没被渲染的代码块': 'Fold specified code blocks; "Frontend Only" folds only unrendered frontend blocks',
    '全部': 'All',
    '仅前端': 'Frontend Only',
    '禁用': 'Disabled',
    '启用 Blob URL 渲染': 'Enable Blob URL Rendering',
    '使用 Blob URL 渲染前端界面，更方便 f12 开发者工具调试；但某些浏览器可能不支持': 'Render iframes via Blob URL for easier DevTools debugging (may not work in all browsers)',
    '取消前端代码高亮': 'Disable Frontend Code Highlighting',
    '避免酒馆对可渲染成前端界面的代码块进行语法高亮，从而提升渲染性能': 'Skip syntax highlighting on renderable frontend blocks for better performance',
    '实验功能': 'Experimental',
    '启用兜底清理': 'Enable Fallback Cleanup',
    '对脚本附加的界面如悬浮球等进行兜底清理, 避免脚本关闭后界面残留；但遇到这种情况更建议提醒脚本作者修复': 'Clean up leftover floating UI elements attached by scripts after disabling',
    '允许流式渲染': 'Allow Streaming Render',
    '在AI流式输出时就渲染，某些前端界面可能无法这样渲染。此外，这可能与某些脚本、插件、酒馆美化不兼容': 'Render during AI streaming; some frontend UIs or extensions may not support this',
    '+ 脚本': '+ Script',
    '+ 文件夹': '+ Folder',
    '内置库': 'Built-in Libs',
    '搜索（支持普通和/正则/）': 'Search (plain text or /regex/)',
    '全局脚本': 'Global Scripts',
    '酒馆全局可用': 'Available globally across all chats',
    '暂无脚本': 'No scripts yet',
    '预设脚本': 'Preset Scripts',
    '绑定到当前预设': 'Bound to current preset',
    '角色脚本': 'Character Scripts',
    '绑定到当前角色': 'Bound to current character',
    '播放器': 'Audio Player',
    '全局音频播放器': 'Global Audio Player',
    '音乐': 'Music',
    '播放列表': 'Playlist',
    '重复播放所有曲目': 'Repeat all tracks',
    '音效': 'SFX',
    '播放当前曲目并停止': 'Play current track once',
    '提示词查看器': 'Prompt Viewer',
    '查看当前提示词发送情况，窗口开启时会监听新的发送及时更新显示': 'Inspect outgoing prompts live while the window is open',
    '打开': 'Open',
    '变量管理器': 'Variable Manager',
    '查看和管理全局、角色、聊天、消息楼层变量': 'Inspect and edit global, character, chat, and message variables',
    '日志查看器': 'Log Viewer',
    '查看脚本和渲染界面的控制台日志': 'View console logs from scripts and rendered iframes',
    '性能': 'Performance',
    '[要加载 # 条消息] → [要渲染 # 条消息]': '[Messages to Load] → [Messages to Render]',
    '角色卡': 'Character Card',
    '使用[替换/更新角色卡]功能时更新世界书': 'Update Worldbook on Replace/Update Character',
    '导出角色卡时始终携带最新世界书': 'Always include latest Worldbook on export',
    '世界书': 'World Info',
    '强制使用推荐的世界书全局设置': 'Enforce recommended World Info global settings',
    '预设': 'Preset',
    '最大化预设上下文长度': 'Maximize preset context length',
    '杂项': 'Misc',
    '禁用不兼容选项': 'Disable incompatible options',
    '禁用酒馆助手宏': 'Disable Tavern Helper Macros',
    '编写变量角色卡而非测试/游玩角色卡时，打开此开关，避免 {{get_message_variable::变量}} 等宏被替换': 'Enable while authoring variable cards so {{get_message_variable::...}} macros stay unexpanded',
    '实时监听': 'Live Reload',
    '连接编写模板，将代码修改实时同步到酒馆': 'Connect dev template to sync code edits live',
    '允许监听': 'Enable Listener',
    '启用弹窗报错': 'Show Error Popups',
    '使用方法': 'Usage Guide',
    '刷新间隔 (毫秒)': 'Refresh Interval (ms)',
    '编写参考': 'Developer Reference',
    '编写脚本的参考文档': 'Reference docs for authoring scripts',
    '查看教程及文档': 'View Docs & Guides',
    '下载参考文件': 'Download Reference',
    '电脑编写模板用': 'For desktop template authoring',
    '手机或 AI 官网用': 'For mobile or AI web chat',
    '酒馆STScript与宏': 'STScript & Macros',
    '查看手册': 'View Manual',
    '下载STScript参考文件': 'Download STScript Ref',
    '下载宏参考文件': 'Download Macros Ref',
};

const _origTextNodeMap = new WeakMap();

function applyThirdPartyPanelsLocale(lang = getUiLang()) {
    try {
        const mount = document.getElementById('st-plugins-settings-mount');
        if (!mount) return;
        const isEn = lang === 'en';
        const skipIds = new Set(['prompt_template_settings', 'qr--settings']);

        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 1) {
                if (skipIds.has(node.id) || (node.id && node.id.endsWith('_template'))) return;
                if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'TEXTAREA') return;
                // Translate title & placeholder attributes safely
                if (node.hasAttribute('title')) {
                    if (node.dataset.stOrigPanelTitle === undefined) {
                        node.dataset.stOrigPanelTitle = node.getAttribute('title') || '';
                    }
                    const orig = node.dataset.stOrigPanelTitle;
                    const trimmed = orig.trim();
                    if (isEn) {
                        if (ST_PANEL_ZH_TO_EN[trimmed]) {
                            node.setAttribute('title', ST_PANEL_ZH_TO_EN[trimmed]);
                        } else if (trimmed.startsWith('当前OpenAI预设：')) {
                            node.setAttribute('title', 'Current OpenAI Preset: ' + trimmed.slice('当前OpenAI预设：'.length));
                        }
                    } else {
                        node.setAttribute('title', orig);
                    }
                }
                if (node.hasAttribute('placeholder')) {
                    if (node.dataset.stOrigPanelPh === undefined) {
                        node.dataset.stOrigPanelPh = node.getAttribute('placeholder') || '';
                    }
                    const orig = node.dataset.stOrigPanelPh;
                    const trimmed = orig.trim();
                    node.setAttribute('placeholder', (isEn && ST_PANEL_ZH_TO_EN[trimmed]) ? ST_PANEL_ZH_TO_EN[trimmed] : orig);
                }
            } else if (node.nodeType === 3) {
                if (!_origTextNodeMap.has(node)) {
                    const cur = node.nodeValue || '';
                    const trimmed = cur.trim();
                    if (ST_PANEL_ZH_TO_EN[trimmed]) {
                        _origTextNodeMap.set(node, cur);
                    } else {
                        return;
                    }
                }
                const orig = _origTextNodeMap.get(node);
                const trimmed = orig.trim();
                if (isEn && ST_PANEL_ZH_TO_EN[trimmed]) {
                    const lead = orig.match(/^\s*/)?.[0] || '';
                    const trail = orig.match(/\s*$/)?.[0] || '';
                    const nextVal = lead + ST_PANEL_ZH_TO_EN[trimmed] + trail;
                    if (node.nodeValue !== nextVal) node.nodeValue = nextVal;
                } else if (!isEn && node.nodeValue !== orig) {
                    node.nodeValue = orig;
                }
                return;
            }
            for (const c of node.childNodes) walk(c);
        };
        walk(mount);
    } catch {}
}

async function applyPromptTemplateLocale(lang = getUiLang()) {
    try {
        const root = document.getElementById('prompt_template_settings');
        if (!root) return;
        const isEn = lang === 'en';
        let dict = _ptZhDictCache;
        if (!isEn && !dict) {
            const res = await fetch('scripts/st-plugins/prompt-template-zh-cn.json');
            if (res.ok) {
                dict = await res.json();
                _ptZhDictCache = dict;
            }
        }
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            const raw = el.getAttribute('data-i18n') || '';
            if (!raw) return;
            if (raw.startsWith('[title]')) {
                const key = raw.slice(7);
                if (el.dataset.stOrigTitle === undefined) {
                    el.dataset.stOrigTitle = el.getAttribute('title') || key;
                }
                el.setAttribute('title', (!isEn && dict && dict[key]) ? dict[key] : el.dataset.stOrigTitle);
            } else {
                // Never overwrite textContent of elements wrapping form controls
                if (el.querySelector('input, select, textarea')) return;
                if (el.dataset.stOrigText === undefined) {
                    el.dataset.stOrigText = el.textContent;
                }
                el.textContent = (!isEn && dict && dict[raw]) ? dict[raw] : el.dataset.stOrigText;
            }
        });
    } catch {}
}

function applyActivePluginTab(tabId) {
    if (tabId) activePluginTab = tabId;
    const mount = document.getElementById('st-plugins-settings-mount');
    if (!mount) return;

    const topChildren = [
        ...Array.from(document.getElementById('extensions_settings')?.children || []),
        ...Array.from(document.getElementById('extensions_settings2')?.children || []),
    ];

    for (const child of topChildren) {
        // Keep hidden <div id="task_*_template"> elements untouched
        if (child.id && child.id.endsWith('_template')) continue;
        let owner = null;
        for (const [id, meta] of Object.entries(PLUGIN_META)) {
            if (meta.drawerMatch(child)) {
                owner = id;
                break;
            }
        }
        if (owner) {
            child.classList.toggle('st-plugin-pane-hidden', owner !== activePluginTab);
        }
    }

    document.querySelectorAll('#st-plugins-status-list .st-plugin-tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.pluginId === activePluginTab);
    });

    // Show clear inline diagnostic card whenever the selected plugin failed to load (especially helpful on mobile)
    let errBox = document.getElementById('st-plugin-active-error-box');
    const st = pluginStates.get(activePluginTab);
    if (st && st.status === 'error') {
        if (!errBox) {
            errBox = document.createElement('div');
            errBox.id = 'st-plugin-active-error-box';
            errBox.style.cssText = 'padding:12px 14px;border-radius:10px;border:1px solid rgba(239,68,68,0.45);background:rgba(239,68,68,0.1);color:var(--text-color);font-size:12.5px;line-height:1.6;margin-bottom:10px;word-break:break-word;';
            mount.prepend(errBox);
        }
        const isEn = getUiLang() === 'en';
        const pluginLabel = getMetaText(PLUGIN_META[activePluginTab]?.shortName) || st.displayName || activePluginTab;
        errBox.style.display = 'block';
        errBox.innerHTML = isEn
            ? `<div style="font-weight:700;color:#f87171;margin-bottom:4px;"><i class="fas fa-circle-exclamation" style="margin-right:6px;"></i>Plugin failed to load: ${pluginLabel}</div><div style="font-family:monospace;font-size:12px;opacity:0.9;">${String(st.error || 'Unknown error').replace(/</g, '&lt;')}</div><div style="font-size:11.5px;opacity:0.75;margin-top:6px;">Tip: If deployed on Netlify/GitHub, make sure the <code>scripts/st-plugins/</code> folder is fully uploaded, then hard-refresh the browser.</div>`
            : `<div style="font-weight:700;color:#f87171;margin-bottom:4px;"><i class="fas fa-circle-exclamation" style="margin-right:6px;"></i>插件加载失败：${pluginLabel}</div><div style="font-family:monospace;font-size:12px;opacity:0.9;">${String(st.error || '未知错误').replace(/</g, '&lt;')}</div><div style="font-size:11.5px;opacity:0.75;margin-top:6px;">提示：若部署在 Netlify/GitHub，请确认 <code>scripts/st-plugins/</code> 文件夹已完整上传，并强制刷新浏览器。</div>`;
    } else if (errBox) {
        errBox.style.display = 'none';
    }
}

function loadCss(href, id) {
    if (!href || document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function renderStatusBadges() {
    const container = document.getElementById('st-plugins-status-list');
    if (!container) return;
    container.innerHTML = '';
    const lang = getUiLang();
    const isEn = lang === 'en';
    const orderedIds = ['JS-Slash-Runner', 'LittleWhiteBox', 'ST-Prompt-Template', 'QuickReply'];
    for (const id of orderedIds) {
        const st = pluginStates.get(id) || { id, status: 'loading' };
        const meta = PLUGIN_META[id] || { shortName: id, sub: '', icon: 'fa-puzzle-piece' };
        const shortName = getMetaText(meta.shortName, lang);
        const sub = getMetaText(meta.sub, lang);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.pluginId = id;
        btn.className = `st-plugin-tab-btn${activePluginTab === id ? ' active' : ''}`;
        const dotColor = st.status === 'loaded' ? '#10b981' : (st.status === 'error' ? '#ef4444' : '#f59e0b');
        const statusTitle = st.status === 'loaded'
            ? (isEn ? 'Ready' : '已就绪')
            : (st.status === 'error'
                ? ((isEn ? 'Error: ' : '错误: ') + (st.error || ''))
                : (isEn ? 'Loading...' : '加载中...'));
        btn.title = `${shortName} ${st.version ? 'v' + st.version : ''} (${statusTitle})`;
        btn.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
                <i class="fas ${meta.icon} text-sm flex-shrink-0" style="color:var(--primary-color);"></i>
                <div class="min-w-0">
                    <div class="st-tab-title">${shortName}</div>
                    <div class="st-tab-sub">${sub}</div>
                </div>
            </div>
            <span class="st-tab-dot" style="background:${dotColor};" title="${statusTitle}"></span>
        `;
        btn.addEventListener('click', () => applyActivePluginTab(id));
        container.appendChild(btn);
    }
    applyActivePluginTab(activePluginTab);
}

async function loadAllPlugins() {
    if (initialized) return;
    initialized = true;

    ensureStDomContainers();
    syncStateFromBridge();

    // Ensure sensible pure-frontend defaults before plugins read extension_settings
    // Default renderEnabled to false for LittleWhiteBox so JS-Slash-Runner owns HTML iframe rendering cleanly (avoiding duplicate iframes); users can switch anytime in UI.
    extension_settings.LittleWhiteBox = Object.assign({
        enabled: true,
        renderEnabled: false,
        maxRenderedMessages: 8,
        useBlob: false,
        wrapperIframe: true,
        variablesCore: { enabled: true },
        variablesMode: '2.0',
        variablesPanel: { enabled: false },
        tasks: { enabled: true, globalTasks: [], processedMessages: [] },
        templateEditor: { enabled: false },
    }, extension_settings.LittleWhiteBox || {});

    const resolved = [...BUILTIN_PLUGINS].sort((a, b) => a.order - b.order);
    for (const p of resolved) {
        pluginStates.set(p.id, { id: p.id, displayName: p.displayName, version: p.version, status: 'loading' });
    }
    renderStatusBadges();

    // Pre-enable embedded character scripts BEFORE JS-Slash-Runner mounts its Pinia store
    syncStateFromBridge();
    ensureCharacterScriptsAutoEnabled();

    // Load CSS and ES module entry sequentially in loading_order from flat scripts/st-plugins/
    for (const item of resolved) {
        const { id, displayName, version, js, css, generate_interceptor } = item;
        try {
            if (css) {
                loadCss(css, `st-ext-css-${id}`);
            }
            if (js) {
                const entryUrl = new URL(js, window.location.href).href;
                await import(entryUrl);
            }
            if (generate_interceptor) {
                generateInterceptors.push(generate_interceptor);
            }
            pluginStates.set(id, {
                id,
                displayName: displayName || id,
                version: version || '',
                status: 'loaded',
            });
            console.log(`[ST-Loader] Loaded ${id} (${version || ''})`);
        } catch (err) {
            pluginStates.set(id, {
                id,
                displayName: displayName || id,
                version: version || '',
                status: 'error',
                error: err?.message || String(err),
            });
            console.error(`[ST-Loader] Error loading ${id}:`, err);
        }
        renderStatusBadges();
    }

    // Initialize built-in SillyTavern Quick Reply v2
    try {
        await initQuickReply();
        pluginStates.set('QuickReply', {
            id: 'QuickReply',
            displayName: '快速回复',
            version: '2.0',
            status: 'loaded',
        });
    } catch (err) {
        pluginStates.set('QuickReply', {
            id: 'QuickReply',
            displayName: '快速回复',
            version: '2.0',
            status: 'error',
            error: err?.message || String(err),
        });
        console.error('[ST-Loader] Error loading QuickReply:', err);
    }
    renderStatusBadges();

    // Fire standard ST boot lifecycle events (including SETTINGS_UPDATED & chatLoaded required by JS-Slash-Runner script runners!)
    syncStateFromBridge();
    ensureCharacterScriptsAutoEnabled();
    await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED);
    await eventSource.emit(event_types.EXTENSIONS_FIRST_LOAD);
    await eventSource.emit(event_types.SETTINGS_UPDATED);
    await eventSource.emit(event_types.APP_INITIALIZED);
    await eventSource.emit(event_types.APP_READY);
    await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
    await eventSource.emit('chatLoaded');
    setTimeout(autoAcceptJsrScriptModalIfNeeded, 150);
    await applyPromptTemplateLocale();
    applyThirdPartyPanelsLocale();
    renderStatusBadges();

    // Snapshot baseline <style> nodes after core page & ST plugins boot so any card-injected
    // global styles (e.g. __wide_anti_clip_for_TH-message--0--0, immersive #top-bar styles, etc.)
    // are cleanly purged when switching to another character!
    if (!window.__NIKA_ST_BASELINE_STYLES__) {
        window.__NIKA_ST_BASELINE_STYLES__ = new WeakSet();
        document.querySelectorAll('head style, body > style').forEach((s) => {
            const txt = s.textContent || '';
            const id = s.id || '';
            const isCardStyle =
                id.startsWith('__wide_anti_clip_') ||
                id === 'mobile-phone-styles' ||
                (/#top-bar|#top-settings-holder/i.test(txt) && /body:has\(#/i.test(txt)) ||
                /#TH-message--\d+--\d+/i.test(txt);
            if (!isCardStyle) {
                window.__NIKA_ST_BASELINE_STYLES__.add(s);
            }
        });
    }
    if (this_chid >= 0 && characters[this_chid]?.avatar) {
        _lastActiveCharAvatar = characters[this_chid].avatar;
    }

    // Watch #st-plugins-settings-mount so asynchronously mounted panels (Vue / fetch HTML) auto-localize & obey active tab
    const mount = document.getElementById('st-plugins-settings-mount');
    if (mount && !window.__NIKA_ST_MOUNT_OBS__) {
        let timer = null;
        const obs = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                applyPromptTemplateLocale();
                applyThirdPartyPanelsLocale();
                applyActivePluginTab(activePluginTab);
            }, 60);
        });
        obs.observe(mount, { childList: true, subtree: true });
        window.__NIKA_ST_MOUNT_OBS__ = obs;
    }
    setTimeout(async () => {
        applyPromptTemplateLocale();
        applyThirdPartyPanelsLocale();
        applyActivePluginTab(activePluginTab);
        installFullscreenCardAdapter();
        // Re-notify already rendered messages on initial boot so JS-Slash-Runner / LittleWhiteBox mount iframes on restored chats
        syncStateFromBridge();
        const mesNodes = Array.from(document.querySelectorAll('#chat > .mes'));
        for (const el of mesNodes) {
            const mesId = Number(el.getAttribute('mesid'));
            if (Number.isNaN(mesId)) continue;
            const isUser = el.getAttribute('is_user') === 'true';
            if (!el.querySelector('.TH-render iframe, .xiaobaix-iframe-wrapper iframe')) {
                await eventSource.emit(isUser ? event_types.USER_MESSAGE_RENDERED : event_types.CHARACTER_MESSAGE_RENDERED, mesId);
            }
        }
    }, 600);
}

let userExitedFullscreen = false;
function installFullscreenCardAdapter() {
    if (window.__NIKA_ST_FS_ADAPTER__) return;
    window.__NIKA_ST_FS_ADAPTER__ = true;

    // Create floating unobtrusive control pill for fullscreen cards
    if (!document.getElementById('nika-st-fullscreen-pill')) {
        const pill = document.createElement('div');
        pill.id = 'nika-st-fullscreen-pill';
        const isEn = getUiLang() === 'en';
        pill.innerHTML = `
            <button type="button" id="nika-fs-menu-btn" title="${isEn ? 'Toggle sidebar menu' : '呼出侧边栏菜单'}"><i class="fas fa-bars"></i> ${isEn ? 'Menu' : '菜单'}</button>
            <span style="opacity:0.3;">|</span>
            <button type="button" id="nika-fs-exit-btn" title="${isEn ? 'Exit fullscreen to view chat' : '退出全屏查看聊天框'}"><i class="fas fa-compress"></i> ${isEn ? 'Exit Fullscreen' : '退出全屏'}</button>
        `;
        document.body.appendChild(pill);
        pill.querySelector('#nika-fs-menu-btn')?.addEventListener('click', () => {
            const sb = document.querySelector('.sidebar');
            if (sb) sb.classList.toggle('collapsed');
        });
        pill.querySelector('#nika-fs-exit-btn')?.addEventListener('click', () => {
            userExitedFullscreen = true;
            document.body.classList.remove('nika-st-fullscreen-card');
        });
    }

    const detectFullscreen = () => {
        const hasImmersiveStyle = Array.from(document.querySelectorAll('head style, body > style')).some((s) => {
            if (s.id === 'nika-st-compat-style' || s.id === 'st-toastr-css' || s.id === 'xiaobaix-skeleton-style') return false;
            const txt = s.textContent || '';
            return /#top-bar|#top-settings-holder/i.test(txt) && /body:has\(#/i.test(txt);
        });
        const hasVisibleThIframe = !!document.querySelector('#chat .mes .TH-render iframe');
        if (hasImmersiveStyle && hasVisibleThIframe) {
            if (!userExitedFullscreen && !document.body.classList.contains('nika-st-fullscreen-card')) {
                document.body.classList.add('nika-st-fullscreen-card');
                const sb = document.querySelector('.sidebar');
                if (sb && !sb.classList.contains('collapsed')) sb.classList.add('collapsed');
            }
        } else {
            userExitedFullscreen = false;
            document.body.classList.remove('nika-st-fullscreen-card');
        }
    };

    const obs = new MutationObserver(() => detectFullscreen());
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    const chatEl = document.getElementById('chat');
    if (chatEl) obs.observe(chatEl, { childList: true });
    detectFullscreen();
    installIframeWheelPassthrough();
}

/**
 * Host-side native auto-height sync for ST frontend iframes (zero CDN dependency).
 * Does NOT attach JS wheel listeners inside iframes so Chrome uses full native
 * GPU compositor-thread scroll chaining (60/120fps butter-smooth scrolling).
 */
function installIframeWheelPassthrough() {
    if (window.__NIKA_ST_WHEEL_PASSTHROUGH__) return;
    window.__NIKA_ST_WHEEL_PASSTHROUGH__ = true;

    const syncSingleIframe = (iframe) => {
        if (!iframe || !iframe.isConnected) return;
        if (document.body.classList.contains('nika-st-fullscreen-card')) return;
        try {
            if (iframe.loading === 'lazy') iframe.loading = 'eager';
            if (iframe.getAttribute('loading') === 'lazy') iframe.removeAttribute('loading');
        } catch {}

        try {
            const win = iframe.contentWindow;
            const doc = iframe.contentDocument;
            if (!win || !doc || !doc.body) return;
            if (doc.URL === 'about:blank' && doc.body.childElementCount === 0 && iframe.hasAttribute('srcdoc')) return;

            // Attach ResizeObserver & load listener once per contentDocument (handles srcdoc reloads on reused iframe!)
            if (!doc.__nikaHeightSynced) {
                doc.__nikaHeightSynced = true;
                let rafId = 0;
                const scheduleSync = () => {
                    if (rafId) return;
                    rafId = requestAnimationFrame(() => {
                        rafId = 0;
                        syncSingleIframe(iframe);
                    });
                };
                if (typeof win.ResizeObserver === 'function') {
                    const ro = new win.ResizeObserver(scheduleSync);
                    ro.observe(doc.body);
                    if (doc.documentElement) ro.observe(doc.documentElement);
                }
                doc.addEventListener('load', scheduleSync, true);
                [120, 450, 1200, 2500].forEach(ms => setTimeout(scheduleSync, ms));
            }

            // Compute true content height (ignore 100vh inflation from current iframe height when shrinking is not needed)
            const body = doc.body;
            const docEl = doc.documentElement;
            let h = Math.max(body.scrollHeight || 0, docEl?.scrollHeight || 0);
            // Also check bottom-most visible child in case body has overflow:hidden or flex constraints
            if (body.lastElementChild) {
                try {
                    const r = body.lastElementChild.getBoundingClientRect();
                    const childBottom = Math.ceil(r.bottom + (parseFloat(win.getComputedStyle(body).paddingBottom) || 0));
                    if (Number.isFinite(childBottom) && childBottom > h) h = childBottom;
                } catch {}
            }
            if (Number.isFinite(h) && h > 40) {
                const cur = parseInt(iframe.style.height, 10) || Math.round(iframe.getBoundingClientRect().height) || 0;
                if (Math.abs(h - cur) > 3) {
                    iframe.style.height = `${h}px`;
                }
            }
        } catch {}
    };

    const attachToIframe = (iframe) => {
        if (!iframe) return;
        if (!iframe.__nikaHeightBound) {
            iframe.__nikaHeightBound = true;
            iframe.addEventListener('load', () => syncSingleIframe(iframe));
            // Re-sync whenever Vue / JSR mutates srcdoc or resets style.height on the same <iframe> node
            const attrObs = new MutationObserver(() => syncSingleIframe(iframe));
            attrObs.observe(iframe, { attributes: true, attributeFilter: ['srcdoc', 'src', 'style', 'loading'] });
        }
        syncSingleIframe(iframe);
    };

    // Let mouse wheel on outer side margins scroll #chat smoothly when no modal is open
    window.addEventListener('wheel', (ev) => {
        if (ev.ctrlKey || !ev.deltaY) return;
        if (document.body.classList.contains('nika-st-fullscreen-card')) return;
        if (document.querySelector('.modal-overlay.active, .st-shim-popup-overlay')) return;
        const chatEl = document.getElementById('chat');
        if (!chatEl || chatEl.contains(ev.target)) return;
        if (ev.target?.closest?.('.sidebar, footer, header, textarea, select')) return;
        if (chatEl.scrollHeight > chatEl.clientHeight) {
            const mult = ev.deltaMode === 1 ? 32 : (ev.deltaMode === 2 ? chatEl.clientHeight : 1);
            chatEl.scrollBy({ top: ev.deltaY * mult, behavior: 'auto' });
        }
    }, { passive: true });

    const scanIframes = () => {
        document.querySelectorAll('#chat iframe').forEach(attachToIframe);
    };
    const chatEl = document.getElementById('chat');
    if (chatEl) {
        const mo = new MutationObserver(scanIframes);
        mo.observe(chatEl, { childList: true, subtree: true });
    }
    eventSource.on('message_iframe_render_ended', () => setTimeout(scanIframes, 50));
    eventSource.on(event_types.CHAT_CHANGED, () => {
        [100, 400, 1000, 2200].forEach(ms => setTimeout(scanIframes, ms));
    });
    // Also re-sync whenever any modal closes (returning from Character Manager / Greeting Selector to chat)
    document.addEventListener('click', (ev) => {
        if (ev.target?.closest?.('.close-modal-btn, .modal-overlay, #greeting-list')) {
            setTimeout(scanIframes, 80);
            setTimeout(scanIframes, 400);
        }
    }, true);
    // Lightweight watchdog: catches slow CDN/font loads even if load event stalls for >10s
    setInterval(() => {
        if (document.hidden || document.body.classList.contains('nika-st-fullscreen-card')) return;
        const iframes = document.querySelectorAll('#chat iframe');
        if (iframes.length > 0) iframes.forEach(attachToIframe);
    }, 500);
    scanIframes();
}

/**
 * Run ST pre-generation prompt pipeline:
 * 1. GENERATION_AFTER_COMMANDS
 * 2. Plugin generate_interceptor hooks (e.g. xiaobaixGenerateInterceptor)
 * 3. Inject extension_prompts (from JS-Slash-Runner / STscript /inject / etc.)
 * 4. Emit CHAT_COMPLETION_PROMPT_READY (for ST-Prompt-Template EJS rendering!)
 */
async function runPromptPipeline(messages, { dryRun = false, type = 'normal' } = {}) {
    syncStateFromBridge();
    const cloned = Array.isArray(messages) ? messages.map(m => ({ ...m })) : [];

    // 0. GENERATION_STARTED (for Quick Reply executeBeforeGeneration hooks)
    if (!dryRun) {
        await eventSource.emit(event_types.GENERATION_STARTED, type, {}, dryRun);
    }

    // 1. GENERATION_AFTER_COMMANDS (ST-Prompt-Template installs filters here)
    await eventSource.emit(event_types.GENERATION_AFTER_COMMANDS, type, {}, dryRun);

    // 2. Registered manifest generate_interceptor hooks
    let aborted = false;
    const abort = () => { aborted = true; };
    for (const fnName of generateInterceptors) {
        const fn = window[fnName];
        if (typeof fn === 'function') {
            try {
                await fn(chat, oai_settings.openai_max_context || 128000, abort, type);
            } catch (e) {
                console.warn(`[ST-Loader] generate_interceptor "${fnName}" error:`, e);
            }
            if (aborted) break;
        }
    }
    if (aborted) return { messages: cloned, aborted: true };

    // 3. Inject extension_prompts
    const roleNames = { [extension_prompt_roles.SYSTEM]: 'system', [extension_prompt_roles.USER]: 'user', [extension_prompt_roles.ASSISTANT]: 'assistant' };
    for (const entry of Object.values(extension_prompts)) {
        if (!entry || !entry.value) continue;
        if (typeof entry.filter === 'function') {
            try { if (!(await entry.filter())) continue; } catch { continue; }
        }
        const role = roleNames[entry.role] || 'system';
        const content = substituteParams(entry.value);
        if (entry.position === extension_prompt_types.BEFORE_PROMPT) {
            cloned.unshift({ role, content });
        } else if (entry.position === extension_prompt_types.IN_PROMPT) {
            cloned.splice(Math.min(1, cloned.length), 0, { role, content });
        } else if (entry.position === extension_prompt_types.IN_CHAT) {
            const idx = Math.max(0, cloned.length - (entry.depth || 0));
            cloned.splice(idx, 0, { role, content });
        }
    }

    // 4. CHAT_COMPLETION_PROMPT_READY & CHAT_COMPLETION_SETTINGS_READY (ST-Prompt-Template compiles EJS on SETTINGS_READY!)
    const eventData = { chat: cloned, dryRun };
    await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);

    const settingsReadyData = {
        messages: eventData.chat || cloned,
        model: oai_settings.openai_model || 'default',
        stream: false,
        dryRun,
    };
    await eventSource.emit(event_types.CHAT_COMPLETION_SETTINGS_READY, settingsReadyData);
    await eventSource.emit(event_types.GENERATE_AFTER_DATA, { prompt: settingsReadyData.messages, dryRun, type });

    // Also run basic macro substitution on any remaining {{xbgetvar...}} / {{getvar...}}
    const finalMessages = (settingsReadyData.messages || eventData.chat || cloned).map(m => ({
        ...m,
        content: typeof m.content === 'string' ? substituteParams(m.content) : m.content,
    }));

    return { messages: finalMessages, aborted: false };
}

async function notifyMessageRendered(mesId, isUser) {
    syncStateFromBridge();
    const evt = isUser ? event_types.USER_MESSAGE_RENDERED : event_types.CHARACTER_MESSAGE_RENDERED;
    await eventSource.emit(evt, mesId);
}

function ensureCharacterScriptsAutoEnabled() {
    try {
        extension_settings.tavern_helper ||= {};
        const th = extension_settings.tavern_helper;
        th.script ||= {};
        th.script.enabled ||= { global: true, presets: [], characters: [] };
        th.script.popuped ||= { presets: [], characters: [] };
        th.script.enabled.characters ||= [];
        th.script.popuped.characters ||= [];

        let changed = false;
        const userDisabled = Array.isArray(th.script._userDisabledChars) ? th.script._userDisabledChars : [];
        for (const ch of characters) {
            const avatar = ch?.avatar;
            const scripts = ch?.data?.extensions?.tavern_helper?.scripts;
            if (!avatar || !Array.isArray(scripts) || scripts.length === 0) continue;
            if (userDisabled.includes(avatar)) continue;
            if (!th.script.popuped.characters.includes(avatar)) {
                th.script.popuped.characters.push(avatar);
                changed = true;
            }
            if (!th.script.enabled.characters.includes(avatar)) {
                th.script.enabled.characters.push(avatar);
                changed = true;
            }
        }
        if (changed) {
            try { localStorage.setItem('nika_st_extension_settings', JSON.stringify(extension_settings)); } catch {}
        }
    } catch (e) {
        console.warn('[ST-Loader] ensureCharacterScriptsAutoEnabled failed:', e);
    }
}

function autoAcceptJsrScriptModalIfNeeded() {
    try {
        // When a newly imported character is selected after JSR has already booted, JSR's VueFinalModal
        // may render inside the hidden #st-plugins-modal; automatically confirm embedded character scripts
        // so MVU / 章节管理器 / 外置状态栏 work seamlessly without invisible blocked popups.
        const modals = document.querySelectorAll('.vfm');
        for (const modal of modals) {
            const txt = modal.textContent || '';
            if (txt.includes('嵌入式脚本') && txt.includes('是否现在就启用')) {
                const confirmBtn = Array.from(modal.querySelectorAll('button, .menu_button'))
                    .find(b => /确认/.test(b.textContent || ''));
                if (confirmBtn) {
                    confirmBtn.click();
                }
            }
        }
    } catch {}
}

let _lastActiveCharAvatar = '';

function cleanupPreviousCharacterInjections(nextAvatar) {
    if (!nextAvatar || nextAvatar === _lastActiveCharAvatar) {
        if (nextAvatar) _lastActiveCharAvatar = nextAvatar;
        return;
    }
    const prevAvatar = _lastActiveCharAvatar;
    _lastActiveCharAvatar = nextAvatar;
    if (!prevAvatar) return;

    const baseline = window.__NIKA_ST_BASELINE_STYLES__;
    const keepIds = new Set(['nika-st-compat-style', 'st-toastr-css', 'xiaobaix-skeleton-style']);
    document.querySelectorAll('head style, body > style').forEach((s) => {
        if (baseline && baseline.has(s)) return;
        const id = s.id || '';
        const txt = s.textContent || '';
        if (keepIds.has(id) || id.startsWith('st-ext-css-')) return;
        if (txt.includes('tailwindcss') || txt.includes('--tw-')) return;
        // Remove card-injected styles (e.g. __wide_anti_clip_for_TH-message--0--0, immersive full-screen overrides, phone styles)
        s.remove();
    });

    // Remove leftover floating card widgets injected directly into document.body by previous character
    ['mobile-trigger-btn', 'mobile-phone-overlay', 'wallpaper-fullscreen-viewer'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    // Reset fullscreen state for the new character
    userExitedFullscreen = false;
    document.body.classList.remove('nika-st-fullscreen-card');
}

async function notifyChatChanged() {
    syncStateFromBridge();
    const curAvatar = (this_chid >= 0 && characters[this_chid]?.avatar) ? characters[this_chid].avatar : '';
    cleanupPreviousCharacterInjections(curAvatar);
    ensureCharacterScriptsAutoEnabled();
    await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
    await eventSource.emit('chatLoaded');
    setTimeout(autoAcceptJsrScriptModalIfNeeded, 120);
    setTimeout(autoAcceptJsrScriptModalIfNeeded, 450);
}

async function notifyMessageSent(mesId) {
    syncStateFromBridge();
    await eventSource.emit(event_types.MESSAGE_SENT, mesId);
}

async function notifyMessageReceived(mesId) {
    syncStateFromBridge();
    await eventSource.emit(event_types.MESSAGE_RECEIVED, mesId);
}

async function notifyMessageEdited(mesId) {
    syncStateFromBridge();
    await eventSource.emit(event_types.MESSAGE_EDITED, mesId);
    await eventSource.emit(event_types.MESSAGE_UPDATED, mesId);
}

async function notifyMessageDeleted(remainingCount) {
    syncStateFromBridge();
    await eventSource.emit(event_types.MESSAGE_DELETED, remainingCount);
}

async function notifyMessageSwiped(mesId) {
    syncStateFromBridge();
    await eventSource.emit(event_types.MESSAGE_SWIPED, mesId);
}

async function notifyGenerationEnded(count) {
    syncStateFromBridge();
    await eventSource.emit(event_types.GENERATION_ENDED, count);
}

window.__NIKA_ST_RUNTIME__ = {
    init: loadAllPlugins,
    sync: () => {
        syncStateFromBridge();
        const curAvatar = (this_chid >= 0 && characters[this_chid]?.avatar) ? characters[this_chid].avatar : '';
        cleanupPreviousCharacterInjections(curAvatar);
    },
    emit: (name, ...args) => eventSource.emit(name, ...args),
    event_types,
    runPromptPipeline,
    notifyMessageRendered,
    notifyChatChanged,
    notifyMessageSent,
    notifyMessageReceived,
    notifyMessageEdited,
    notifyMessageDeleted,
    notifyMessageSwiped,
    notifyGenerationEnded,
    executeSlash: executeSlashCommandsWithOptions,
    substituteParams,
    getStatus: () => Object.fromEntries(pluginStates.entries()),
    renderStatusBadges,
    onLanguageChanged: async (lang) => {
        const targetLang = lang === 'en' ? 'en' : 'zh';
        const isEn = targetLang === 'en';
        renderStatusBadges();
        await applyPromptTemplateLocale(targetLang);
        applyThirdPartyPanelsLocale(targetLang);
        try { window.quickReplyApi?.onLanguageChanged?.(targetLang); } catch {}
        const qrBtn = document.getElementById('nika-qr-open-btn');
        if (qrBtn) {
            qrBtn.title = isEn ? 'Quick Reply Settings / Import & Export' : '快速回复设置 / 导入导出 (Quick Reply)';
        }
        const fsMenu = document.getElementById('nika-fs-menu-btn');
        if (fsMenu) {
            fsMenu.title = isEn ? 'Toggle sidebar menu' : '呼出侧边栏菜单';
            fsMenu.innerHTML = `<i class="fas fa-bars"></i> ${isEn ? 'Menu' : '菜单'}`;
        }
        const fsExit = document.getElementById('nika-fs-exit-btn');
        if (fsExit) {
            fsExit.title = isEn ? 'Exit fullscreen to view chat' : '退出全屏查看聊天框';
            fsExit.innerHTML = `<i class="fas fa-compress"></i> ${isEn ? 'Exit Fullscreen' : '退出全屏'}`;
        }
    },
    openPluginTab: (tabId) => {
        const modal = document.getElementById('st-plugins-modal');
        if (modal) modal.classList.add('active');
        applyActivePluginTab(tabId || 'QuickReply');
    },
};
