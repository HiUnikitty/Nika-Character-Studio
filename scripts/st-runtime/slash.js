/**
 * Nika ST Runtime - SlashCommand & Macro Engine
 * Compatible with SillyTavern SlashCommandParser, MacrosParser, and STscript pipes.
 */

export const ARGUMENT_TYPE = Object.freeze({
    STRING: 'string',
    NUMBER: 'number',
    RANGE: 'range',
    BOOLEAN: 'boolean',
    LIST: 'list',
    DICTIONARY: 'dictionary',
    CLOSURE: 'closure',
    SUBCOMMAND: 'subcommand',
    VARIABLE_NAME: 'variable_name',
});

export const enumTypes = Object.freeze({
    command: 'command',
    enum: 'enum',
    variable: 'variable',
    macro: 'macro',
    name: 'name',
    qr: 'qr',
    wi: 'wi',
    preset: 'preset',
});

export const enumIcons = Object.freeze({
    command: '⚡',
    enum: '•',
    variable: '𝑥',
    macro: '❖',
    name: '👤',
    qr: '▶',
    wi: '📖',
    preset: '⚙',
});

export class SlashCommandEnumValue {
    constructor(value, description = '', type = enumTypes.enum, icon = '') {
        this.value = String(value ?? '');
        this.description = description;
        this.type = type;
        this.icon = icon;
    }
}

export const commonEnumProviders = {
    boolean: (mode = 'trueFalse') => () => {
        if (mode === 'onOff') return [new SlashCommandEnumValue('on'), new SlashCommandEnumValue('off')];
        if (mode === 'onOffToggle') return [new SlashCommandEnumValue('on'), new SlashCommandEnumValue('off'), new SlashCommandEnumValue('toggle')];
        return [new SlashCommandEnumValue('true'), new SlashCommandEnumValue('false')];
    },
    booleans: (mode = 'trueFalse') => commonEnumProviders.boolean(mode),
    characters: () => () => {
        const ctx = window.SillyTavern?.getContext?.();
        return (ctx?.characters || []).map(c => new SlashCommandEnumValue(c.name || '', '', enumTypes.name));
    },
    groupMembers: () => () => [],
    personas: () => () => [],
    tags: () => () => [],
    tagsForChar: () => () => [],
    worldBooks: () => () => {
        const ctx = window.SillyTavern?.getContext?.();
        return (ctx?.worldNames || []).map(n => new SlashCommandEnumValue(n, '', enumTypes.wi));
    },
    localVariables: () => () => {
        const vars = window.SillyTavern?.getContext?.()?.chatMetadata?.variables || {};
        return Object.keys(vars).map(k => new SlashCommandEnumValue(k, '', enumTypes.variable));
    },
    globalVariables: () => () => {
        const vars = window.SillyTavern?.getContext?.()?.extensionSettings?.variables?.global || {};
        return Object.keys(vars).map(k => new SlashCommandEnumValue(k, '', enumTypes.variable));
    },
    variables: () => () => [
        ...commonEnumProviders.localVariables()(),
        ...commonEnumProviders.globalVariables()(),
    ],
    numbersAndVariables: () => () => commonEnumProviders.variables()(),
    messages: () => () => {
        const chat = window.SillyTavern?.getContext?.()?.chat || [];
        return chat.map((m, idx) => new SlashCommandEnumValue(String(idx), (m.mes || '').slice(0, 40)));
    },
    presets: () => () => {
        const ctx = window.SillyTavern?.getContext?.();
        const list = ctx?.getPresetManager?.()?.getPresetList?.()?.presets || [];
        return list.map(p => new SlashCommandEnumValue(p.name || '', '', enumTypes.preset));
    },
};

export class SlashCommandArgument {
    constructor(description = '', typeList = [ARGUMENT_TYPE.STRING], isRequired = false, acceptsMultiple = false, defaultValue = null, enumList = [], enumProvider = null, forceEnum = false) {
        this.description = description;
        this.typeList = Array.isArray(typeList) ? typeList : [typeList];
        this.isRequired = isRequired;
        this.acceptsMultiple = acceptsMultiple;
        this.defaultValue = defaultValue;
        this.enumList = enumList;
        this.enumProvider = enumProvider;
        this.forceEnum = forceEnum;
    }
    static fromProps(props = {}) {
        const a = new SlashCommandArgument();
        Object.assign(a, props);
        if (a.typeList && !Array.isArray(a.typeList)) a.typeList = [a.typeList];
        return a;
    }
}

export class SlashCommandNamedArgument extends SlashCommandArgument {
    constructor(name = '', description = '', typeList = [ARGUMENT_TYPE.STRING], isRequired = false, acceptsMultiple = false, defaultValue = null, enumList = [], enumProvider = null, forceEnum = false) {
        super(description, typeList, isRequired, acceptsMultiple, defaultValue, enumList, enumProvider, forceEnum);
        this.name = name;
    }
    static fromProps(props = {}) {
        const a = new SlashCommandNamedArgument();
        Object.assign(a, props);
        if (a.typeList && !Array.isArray(a.typeList)) a.typeList = [a.typeList];
        return a;
    }
}

export class SlashCommand {
    constructor() {
        this.name = '';
        this.aliases = [];
        this.callback = async () => '';
        this.returns = '';
        this.namedArgumentList = [];
        this.unnamedArgumentList = [];
        this.helpString = '';
        this.splitUnnamedArgument = false;
        this.splitUnnamedArgumentCount = null;
    }
    static fromProps(props = {}) {
        const cmd = new SlashCommand();
        Object.assign(cmd, props);
        cmd.aliases = Array.isArray(cmd.aliases) ? cmd.aliases : [];
        cmd.namedArgumentList = Array.isArray(cmd.namedArgumentList) ? cmd.namedArgumentList : [];
        cmd.unnamedArgumentList = Array.isArray(cmd.unnamedArgumentList) ? cmd.unnamedArgumentList : [];
        return cmd;
    }
}

export class SlashCommandAbortController {
    constructor() {
        this.signal = { aborted: false, reason: null, listeners: new Set() };
    }
    abort(reason = 'Aborted') {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        this.signal.reason = reason;
        for (const fn of this.signal.listeners) {
            try { fn(reason); } catch { }
        }
    }
    get isAborted() {
        return this.signal.aborted;
    }
}

// ============================================================
// Macro Engine (MacrosParser)
// ============================================================

const customMacros = new Map();

export const MacrosParser = {
    registerMacro(key, value, description = '') {
        if (!key) return;
        customMacros.set(String(key), { value, description });
    },
    unregisterMacro(key) {
        customMacros.delete(String(key));
    },
    has(key) {
        return customMacros.has(String(key));
    },
    get(key) {
        return customMacros.get(String(key));
    },
    list() {
        return [...customMacros.keys()];
    },
    populateEnv(env = {}) {
        for (const [k, entry] of customMacros.entries()) {
            if (!(k in env)) env[k] = entry.value;
        }
        return env;
    },
    sanitizeMacroValue(val) {
        return val === undefined || val === null ? '' : String(val);
    },
};

export function getLastMessageId() {
    const chat = window.SillyTavern?.getContext?.()?.chat || [];
    return chat.length > 0 ? chat.length - 1 : -1;
}

export function evaluateMacros(text, env = {}) {
    if (text === null || text === undefined) return '';
    let result = String(text);
    if (!result.includes('{{')) return result;

    const ctx = window.SillyTavern?.getContext?.() || {};
    const chat = ctx.chat || [];
    const name1 = env.name1 ?? ctx.name1 ?? 'User';
    const name2 = env.name2 ?? ctx.name2 ?? 'Character';

    // 1. Basic simple macros (case-insensitive)
    result = result.replace(/\{\{user\}\}/gi, () => String(name1));
    result = result.replace(/\{\{char\}\}/gi, () => String(name2));
    if (env.pipe !== undefined) {
        result = result.replace(/\{\{pipe\}\}/gi, () => String(env.pipe));
    }

    // 2. Last message macros
    result = result.replace(/\{\{lastMessageId\}\}/gi, () => String(Math.max(0, chat.length - 1)));
    result = result.replace(/\{\{lastMessage\}\}/gi, () => (chat.length ? (chat[chat.length - 1]?.mes || '') : ''));
    result = result.replace(/\{\{lastUserMessage\}\}/gi, () => {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i]?.is_user) return chat[i].mes || '';
        }
        return '';
    });
    result = result.replace(/\{\{lastCharMessage\}\}/gi, () => {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i] && !chat[i].is_user && !chat[i].is_system) return chat[i].mes || '';
        }
        return '';
    });

    // 3. Variable macros: {{getvar::name}}, {{getglobalvar::name}}, {{setvar::name::val}}, {{addvar::name::val}}
    result = result.replace(/\{\{getvar::([^}]+)\}\}/gi, (_, k) => {
        const v = ctx.variables?.local?.get?.(k.trim());
        return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    result = result.replace(/\{\{getglobalvar::([^}]+)\}\}/gi, (_, k) => {
        const v = ctx.variables?.global?.get?.(k.trim());
        return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    result = result.replace(/\{\{setvar::([^:}]+)::([^}]*)\}\}/gi, (_, k, val) => {
        ctx.variables?.local?.set?.(k.trim(), val);
        return '';
    });
    result = result.replace(/\{\{setglobalvar::([^:}]+)::([^}]*)\}\}/gi, (_, k, val) => {
        ctx.variables?.global?.set?.(k.trim(), val);
        return '';
    });
    result = result.replace(/\{\{addvar::([^:}]+)::([^}]*)\}\}/gi, (_, k, val) => {
        ctx.variables?.local?.add?.(k.trim(), val);
        return '';
    });

    // 4. Utility macros: {{random::a::b}}, {{roll:1d20}}, {{time}}, {{date}}, {{newline}}, {{trim}}
    result = result.replace(/\{\{random::([^}]+)\}\}/gi, (_, list) => {
        const items = list.split('::');
        return items[Math.floor(Math.random() * items.length)] ?? '';
    });
    result = result.replace(/\{\{roll[:：]+(\d*)d(\d+)([+-]\d+)?\}\}/gi, (_, countStr, sidesStr, modStr) => {
        const count = Math.max(1, parseInt(countStr || '1', 10) || 1);
        const sides = Math.max(1, parseInt(sidesStr || '6', 10) || 6);
        const mod = parseInt(modStr || '0', 10) || 0;
        let sum = mod;
        for (let i = 0; i < count; i++) sum += Math.floor(Math.random() * sides) + 1;
        return String(sum);
    });
    result = result.replace(/\{\{newline\}\}/gi, '\n');
    result = result.replace(/\{\{time\}\}/gi, () => new Date().toLocaleTimeString());
    result = result.replace(/\{\{date\}\}/gi, () => new Date().toLocaleDateString());

    // 5. Registered custom macros (e.g. from JS-Slash-Runner / LittleWhiteBox / ST-Prompt-Template)
    if (customMacros.size > 0 && result.includes('{{')) {
        for (const [key, entry] of customMacros.entries()) {
            const val = entry.value;
            // Support both exact {{key}} and parameterized {{key::...}}
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const exactRe = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'gi');
            if (exactRe.test(result)) {
                result = result.replace(exactRe, (match) => {
                    try {
                        const out = typeof val === 'function' ? val(match) : val;
                        return out === undefined || out === null ? '' : String(out);
                    } catch { return ''; }
                });
            }
        }
    }

    // Also support env custom keys
    for (const [k, v] of Object.entries(env)) {
        if (k === 'name1' || k === 'name2' || k === 'pipe' || k === 'original') continue;
        if (!result.includes('{{')) break;
        const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'gi');
        if (re.test(result)) {
            result = result.replace(re, () => {
                try {
                    const out = typeof v === 'function' ? v() : v;
                    return out === undefined || out === null ? '' : String(out);
                } catch { return ''; }
            });
        }
    }

    return result;
}

// ============================================================
// SlashCommandParser & STscript Executor
// ============================================================

function splitTopLevelPipes(script) {
    const parts = [];
    let current = '';
    let inQuote = null;
    let braceDepth = 0;
    for (let i = 0; i < script.length; i++) {
        const ch = script[i];
        const prev = i > 0 ? script[i - 1] : '';
        if (inQuote) {
            current += ch;
            if (ch === inQuote && prev !== '\\') inQuote = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inQuote = ch;
            current += ch;
            continue;
        }
        if (ch === '{' && script[i + 1] === ':') {
            braceDepth++;
            current += '{:';
            i++;
            continue;
        }
        if (ch === ':' && script[i + 1] === '}' && braceDepth > 0) {
            braceDepth--;
            current += ':}';
            i++;
            continue;
        }
        if (ch === '|' && braceDepth === 0) {
            if (script[i + 1] === '|') {
                // Escaped ||
                current += '|';
                i++;
                continue;
            }
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

function parseCommandArgs(rawArgs) {
    const named = {};
    const unnamedParts = [];
    let i = 0;
    const len = rawArgs.length;

    while (i < len) {
        while (i < len && /\s/.test(rawArgs[i])) i++;
        if (i >= len) break;

        // Check if named argument key=value
        const rest = rawArgs.slice(i);
        const namedMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=/);
        if (namedMatch) {
            const key = namedMatch[1];
            i += namedMatch[0].length;
            let val = '';
            if (i < len && (rawArgs[i] === '"' || rawArgs[i] === "'")) {
                const q = rawArgs[i++];
                while (i < len && !(rawArgs[i] === q && rawArgs[i - 1] !== '\\')) {
                    if (rawArgs[i] === '\\' && i + 1 < len && rawArgs[i + 1] === q) {
                        val += q;
                        i += 2;
                    } else {
                        val += rawArgs[i++];
                    }
                }
                if (i < len && rawArgs[i] === q) i++;
            } else {
                while (i < len && !/\s/.test(rawArgs[i])) {
                    val += rawArgs[i++];
                }
            }
            named[key] = val;
        } else {
            // Everything remaining from first unnamed arg can preserve spaces cleanly
            unnamedParts.push(rawArgs.slice(i).trim());
            break;
        }
    }

    const unnamed = unnamedParts.join(' ');
    return { named, unnamed };
}

class SlashCommandParserClass {
    constructor() {
        this.commands = {};
        this._installBuiltinCommands();
    }

    addCommandObject(cmd) {
        if (!cmd || !cmd.name) return;
        const primary = String(cmd.name).toLowerCase();
        this.commands[primary] = cmd;
        if (Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) {
                if (alias) this.commands[String(alias).toLowerCase()] = cmd;
            }
        }
    }

    getCommand(name) {
        if (!name) return null;
        return this.commands[String(name).toLowerCase()] || null;
    }

    async parse(text, validate = false, scope = null, abortController = null) {
        const script = String(text || '').trim();
        if (!script) return { pipe: '' };
        const segments = splitTopLevelPipes(script);
        let pipe = '';
        const localScope = scope || {};

        for (const seg of segments) {
            if (abortController?.isAborted) break;
            const trimmed = seg.trim();
            if (!trimmed) continue;

            // Plain text segment (not starting with /)
            if (!trimmed.startsWith('/')) {
                pipe = evaluateMacros(trimmed, { pipe });
                continue;
            }

            let cmdName, rawArgStr;
            if (trimmed.startsWith('/:') && trimmed.length > 2 && !/\s/.test(trimmed[2])) {
                // Shorthand /:Set.Label or /:Label
                cmdName = ':';
                rawArgStr = trimmed.slice(2);
            } else {
                const spaceIdx = trimmed.search(/\s/);
                cmdName = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).trim().toLowerCase();
                rawArgStr = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
            }

            const cmd = this.getCommand(cmdName);
            if (!cmd) {
                console.warn(`[ST-Slash] Unknown slash command: /${cmdName}`);
                continue;
            }

            const expandedArgStr = evaluateMacros(rawArgStr, { pipe, ...localScope });
            const { named, unnamed } = parseCommandArgs(expandedArgStr);

            // Inject default named arguments
            for (const argDef of (cmd.namedArgumentList || [])) {
                if (argDef.name && !(argDef.name in named) && argDef.defaultValue !== null && argDef.defaultValue !== undefined) {
                    named[argDef.name] = argDef.defaultValue;
                }
            }

            // Provide _scope and _abortController as ST does
            named._scope = localScope;
            named._abortController = abortController;

            let unnamedValue = unnamed;
            if (!unnamedValue && pipe && (!cmd.unnamedArgumentList || cmd.unnamedArgumentList.length > 0)) {
                // ST passes pipe to unnamed arg when unnamed is omitted for many commands
                unnamedValue = pipe;
            }

            if (cmd.splitUnnamedArgument && typeof unnamedValue === 'string') {
                const tokens = unnamedValue.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
                unnamedValue = tokens.map(t => t.replace(/^["']|["']$/g, ''));
            }

            try {
                const res = await cmd.callback(named, unnamedValue);
                if (res !== undefined && res !== null) {
                    pipe = typeof res === 'object' ? JSON.stringify(res) : String(res);
                }
            } catch (err) {
                console.error(`[ST-Slash] Error executing /${cmdName}:`, err);
            }
        }

        return { pipe };
    }

    _installBuiltinCommands() {
        const add = (name, callback, aliases = [], extra = {}) => {
            this.addCommandObject(SlashCommand.fromProps({ name, aliases, callback, ...extra }));
        };

        add('echo', (args, val) => {
            const msg = String(val ?? '');
            const sev = args.severity || 'info';
            if (window.toastr && typeof window.toastr[sev] === 'function') {
                window.toastr[sev](msg, args.title || '');
            } else {
                console.log('[echo]', msg);
            }
            return msg;
        });

        add('pass', (_, val) => String(val ?? ''));
        add('return', (_, val) => String(val ?? ''));

        add('delay', async (_, val) => {
            const ms = Math.max(0, parseInt(val, 10) || 0);
            await new Promise(r => setTimeout(r, ms));
            return '';
        });

        add('getvar', (args, val) => {
            const key = (args.key || val || '').trim();
            const ctx = window.SillyTavern?.getContext?.();
            const v = ctx?.variables?.local?.get?.(key);
            return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        });

        add('setvar', (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            let key = args.key;
            let value = val;
            if (!key && typeof val === 'string') {
                const idx = val.search(/\s/);
                if (idx > 0) { key = val.slice(0, idx); value = val.slice(idx + 1); }
                else { key = val; value = ''; }
            }
            if (key) ctx?.variables?.local?.set?.(key.trim(), value);
            return String(value ?? '');
        });

        add('addvar', (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            let key = args.key;
            let value = val;
            if (!key && typeof val === 'string') {
                const idx = val.search(/\s/);
                if (idx > 0) { key = val.slice(0, idx); value = val.slice(idx + 1); }
            }
            if (key) return ctx?.variables?.local?.add?.(key.trim(), value) ?? '';
            return '';
        });

        add('flushvar', (args, val) => {
            const key = (args.key || val || '').trim();
            const ctx = window.SillyTavern?.getContext?.();
            if (key) ctx?.variables?.local?.del?.(key);
            return '';
        });

        add('getglobalvar', (args, val) => {
            const key = (args.key || val || '').trim();
            const ctx = window.SillyTavern?.getContext?.();
            const v = ctx?.variables?.global?.get?.(key);
            return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        });

        add('setglobalvar', (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            let key = args.key;
            let value = val;
            if (!key && typeof val === 'string') {
                const idx = val.search(/\s/);
                if (idx > 0) { key = val.slice(0, idx); value = val.slice(idx + 1); }
                else { key = val; value = ''; }
            }
            if (key) ctx?.variables?.global?.set?.(key.trim(), value);
            return String(value ?? '');
        });

        add('flushglobalvar', (args, val) => {
            const key = (args.key || val || '').trim();
            const ctx = window.SillyTavern?.getContext?.();
            if (key) ctx?.variables?.global?.del?.(key);
            return '';
        });

        add('setinput', (_, val) => {
            const input = document.getElementById('chat-input') || document.getElementById('user-input') || document.getElementById('send_textarea');
            if (input) {
                input.value = String(val ?? '');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return String(val ?? '');
        });

        add('send', async (args, val) => {
            const text = String(val ?? '').trim();
            if (!text) return '';
            const bridge = window.__NIKA_ST_BRIDGE__;
            if (bridge?.addMessage) {
                await bridge.addMessage({ role: 'user', content: text, name: args.name });
            }
            return text;
        });

        add('sendas', async (args, val) => {
            const text = String(val ?? '').trim();
            if (!text) return '';
            const bridge = window.__NIKA_ST_BRIDGE__;
            if (bridge?.addMessage) {
                await bridge.addMessage({ role: 'assistant', content: text, name: args.name });
            }
            return text;
        });

        add('trigger', async () => {
            const bridge = window.__NIKA_ST_BRIDGE__;
            if (bridge?.triggerGenerate) {
                await bridge.triggerGenerate();
            }
            return '';
        });

        add('inject', (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            const id = args.id || 'slash_inject';
            const posMap = { before: 2, after: 0, chat: 1, in_chat: 1, none: -1 };
            const pos = posMap[String(args.position || 'chat').toLowerCase()] ?? 1;
            const depth = parseInt(args.depth ?? '4', 10) || 4;
            const roleMap = { system: 0, user: 1, assistant: 2 };
            const role = roleMap[String(args.role || 'system').toLowerCase()] ?? 0;
            ctx?.setExtensionPrompt?.(id, String(val ?? ''), pos, depth, !!args.scan, role);
            return '';
        });

        add('flushinject', (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            const id = (args.id || val || 'slash_inject').trim();
            ctx?.setExtensionPrompt?.(id, '', 1, 4, false, 0);
            return '';
        });

        add('gen', async (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.generateQuietPrompt) {
                return await ctx.generateQuietPrompt({ quietPrompt: String(val ?? '') });
            }
            return '';
        });

        add('genraw', async (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.generateRaw) {
                return await ctx.generateRaw({ prompt: String(val ?? ''), systemPrompt: args.system || '' });
            }
            return '';
        });

        add('popup', async (args, val) => {
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.callGenericPopup) {
                const res = await ctx.callGenericPopup(String(val ?? ''), ctx.POPUP_TYPE?.TEXT ?? 1);
                return res ? String(res) : '';
            }
            return '';
        });

        add('hide', async (_, val) => {
            const bridge = window.__NIKA_ST_BRIDGE__;
            const idx = parseInt(val, 10);
            if (!Number.isNaN(idx) && bridge?.setMessageHidden) {
                await bridge.setMessageHidden(idx, true);
            }
            return '';
        });

        add('unhide', async (_, val) => {
            const bridge = window.__NIKA_ST_BRIDGE__;
            const idx = parseInt(val, 10);
            if (!Number.isNaN(idx) && bridge?.setMessageHidden) {
                await bridge.setMessageHidden(idx, false);
            }
            return '';
        });

        add('?', async (_, filter) => {
            const ctx = window.SillyTavern?.getContext?.();
            const q = String(filter || '').trim().toLowerCase();
            const seen = new Set();
            const entries = [];
            for (const cmd of Object.values(this.commands)) {
                if (!cmd || !cmd.name || seen.has(cmd.name)) continue;
                seen.add(cmd.name);
                if (q && !cmd.name.toLowerCase().includes(q) && !String(cmd.helpString || '').toLowerCase().includes(q)) continue;
                entries.push(cmd);
            }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            const html = `<div style="text-align:left;max-height:60vh;overflow:auto;font-size:13px;">
                <div style="font-weight:700;font-size:15px;margin-bottom:8px;">可用斜杠命令 (${entries.length})</div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                    ${entries.map(c => `<div style="padding:5px 8px;border:1px solid var(--border-color,#32343d);border-radius:6px;">
                        <code style="color:var(--primary-color,#f59e0b);font-weight:700;">/${c.name}</code>${c.aliases?.length ? ` <span style="opacity:.65;font-size:11px;">(${c.aliases.map(a => '/' + a).join(', ')})</span>` : ''}
                        ${c.helpString ? `<div style="opacity:.85;margin-top:2px;font-size:12px;">${c.helpString}</div>` : ''}
                    </div>`).join('')}
                </div>
            </div>`;
            if (ctx?.callGenericPopup) {
                await ctx.callGenericPopup(html, ctx.POPUP_TYPE?.TEXT ?? 1, '', { wide: true });
            } else if (window.toastr) {
                window.toastr.info(entries.map(c => '/' + c.name).join(' '), '可用斜杠命令');
            }
            return entries.map(c => '/' + c.name).join(', ');
        }, ['help'], { helpString: '显示所有可用的斜杠命令帮助列表' });

        add('newchat', async () => {
            const bridge = window.__NIKA_ST_BRIDGE__;
            if (bridge?.startNewChat) {
                await bridge.startNewChat();
            } else if (bridge?.clearChat) {
                await bridge.clearChat();
            }
            return '';
        }, ['startnewchat'], { helpString: '开始当前角色的新对话' });

        add('bgcol', () => {
            if (window.toastr) {
                window.toastr.info('当前界面已自动匹配 Nika 主题配色', 'Match UI to Background');
            }
            return '';
        }, [], { helpString: '匹配界面与背景配色（兼容 ST Default.json）' });
    }
}

export const SlashCommandParser = new SlashCommandParserClass();

export async function executeSlashCommandsWithOptions(text, options = {}) {
    if (!text) return { pipe: '' };
    const parser = SlashCommandParser;
    const scope = options.scope || {};
    const abortController = options.abortController || null;
    return await parser.parse(text, false, scope, abortController);
}
