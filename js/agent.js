// ============================================================
// Nika Agent - 嵌入式智能体系统
// 渐进式上下文注入 · 命令系统 · 对话式角色卡编辑
// ============================================================

let agentMessages = [];
let agentStreamingAbort = null;
let _agentDb = null;

// ============================================================
// Agent 消息持久化（IndexedDB）
// ============================================================

async function openAgentDB() {
    if (_agentDb) return _agentDb;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('NikaAgentDB', 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('agent_chats')) {
                const store = db.createObjectStore('agent_chats', { keyPath: 'charId' });
                store.createIndex('charId', 'charId', { unique: true });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };
        req.onsuccess = e => { _agentDb = e.target.result; resolve(_agentDb); };
        req.onerror = e => { reject(e.target.error); };
    });
}

async function loadAgentMessages(charId) {
    if (!charId) {
        agentMessages = [];
        renderAgentMessages();
        return;
    }
    try {
        const db = await openAgentDB();
        return new Promise(resolve => {
            const tx = db.transaction(['agent_chats'], 'readonly');
            const store = tx.objectStore('agent_chats');
            const req = store.get(charId);
            req.onsuccess = e => {
                const data = e.target.result;
                if (data && data.messages && data.messages.length > 0) {
                    agentMessages = data.messages;
                } else {
                    agentMessages = [];
                }
                renderAgentMessages();
                resolve();
            };
            req.onerror = () => {
                agentMessages = [];
                renderAgentMessages();
                resolve();
            };
        });
    } catch (e) {
        console.error('加载agent消息失败:', e);
        agentMessages = [];
        renderAgentMessages();
    }
}

async function saveAgentMessages(charId) {
    if (!charId) return;
    try {
        const db = await openAgentDB();
        const tx = db.transaction(['agent_chats'], 'readwrite');
        const store = tx.objectStore('agent_chats');
        store.put({
            charId: charId,
            messages: agentMessages,
            updatedAt: Date.now(),
        });
    } catch (e) {
        console.error('保存agent消息失败:', e);
    }
}

function getCurrentCharId() {
    const el = document.getElementById('charId');
    return el ? String(el.value).trim() : null;
}

// 为未保存的新角色使用临时key，保存后迁移到真实ID
let _pendingCharId = null;

function resolveCharId() {
    const id = getCurrentCharId();
    if (id) return id;
    if (_pendingCharId) return _pendingCharId;
    _pendingCharId = 'temp_' + Date.now();
    return _pendingCharId;
}

async function migrateAgentMessages(oldId, newId) {
    const sOld = String(oldId);
    const sNew = String(newId);
    if (!sOld || !sNew || sOld === sNew) return;
    try {
        const db = await openAgentDB();
        const tx = db.transaction(['agent_chats'], 'readwrite');
        const store = tx.objectStore('agent_chats');
        const req = store.get(sOld);
        req.onsuccess = e => {
            const data = e.target.result;
            if (data && data.messages && data.messages.length > 0) {
                store.put({ charId: sNew, messages: data.messages, updatedAt: Date.now() });
                store.delete(sOld);
                mylog('[Agent] 聊天记录已迁移:', sOld, '→', sNew);
            }
        };
    } catch (e) {
        console.error('[Agent] 迁移聊天记录失败:', e);
    }
}

// ============================================================
// 上下文构建 - 渐进式暴露
// ============================================================

function buildAgentContext() {
    const card = buildCardObject ? buildCardObject() : {};
    const parts = [];

    parts.push(`## 当前角色卡\n名称: ${card.name || '(未命名)'} | 性别: ${card.gender || '未设'} | 版本: ${card.character_version || '1.0'}`);
    if (card.tags && card.tags.length) parts.push(`标签: ${card.tags.join(', ')}`);

    // 描述前300字
    if (card.description) {
        parts.push(`\n### 描述 (前300字)\n${truncateText(card.description, 300)}`);
    }
    // 个性前200字
    if (card.personality) {
        parts.push(`\n### 个性 (前200字)\n${truncateText(card.personality, 200)}`);
    }
    // 系统提示词前300字
    if (card.system_prompt) {
        parts.push(`\n### 系统提示词 (前300字)\n${truncateText(card.system_prompt, 300)}`);
    }
    // 额外要求前200字
    if (card.post_history_instructions) {
        parts.push(`\n### 额外要求 (前200字)\n${truncateText(card.post_history_instructions, 200)}`);
    }

    // 世界书条目清单（只列名称和触发词）
    const wb = card.worldbook || [];
    if (wb.length > 0) {
        parts.push(`\n### 世界书条目 (${wb.length}条) — 用 /peek worldbook <名称或索引> 查看全文`);
        wb.forEach((entry, i) => {
            const keys = (entry.keys || []).join(', ');
            parts.push(`  [${i}] ${entry.comment || '(未命名)'} | 触发: ${keys || '(无)'}`);
        });
    }

    // 正则脚本清单
    const regex = card.regex_scripts || [];
    if (regex.length > 0) {
        parts.push(`\n### 正则脚本 (${regex.length}个) — 用 /peek regex <名称或索引> 查看完整内容`);
        regex.forEach((s, i) => {
            parts.push(`  [${i}] ${s.scriptName || '(未命名)'} | 匹配: ${truncateText(s.findRegex || '', 60)}`);
        });
    }

    // 小白X任务清单
    const tasks = card.xiaobaix_tasks || [];
    if (tasks.length > 0) {
        parts.push(`\n### 小白X任务 (${tasks.length}个) — 用 /peek task <名称或索引> 查看完整代码`);
        tasks.forEach((t, i) => {
            parts.push(`  [${i}] ${t.name || '(未命名)'} | 触发: ${t.triggerTiming || '?'} | 间隔: ${t.interval || 0}s`);
        });
    }

    // 问候语清单 (不暴露内容)
    const greetings = card.alternate_greetings || [];
    if (card.first_mes) {
        parts.push(`\n### 开场白 — 用 /peek greeting 0 查看`);
    }
    if (greetings.length > 0) {
        parts.push(`备用问候语 ${greetings.length}条 — 用 /peek greeting <索引> 查看`);
    }

    // 可用命令清单
    parts.push(`
## 可用命令
| 命令 | 作用 |
|------|------|
| \`/peek field <字段名>\` | 查看指定字段完整内容 (description/personality/system_prompt/scenario/first_mes/post_history_instructions/mes_example/creator_notes) |
| \`/peek worldbook <名称或索引>\` | 查看世界书条目全文 |
| \`/peek regex <名称或索引>\` | 查看正则脚本完整内容 |
| \`/peek task <名称或索引>\` | 查看小白X任务完整代码 |
| \`/peek greeting <索引>\` | 查看指定问候语 |
| \`/list all\` | 列出所有字段及其长度概览 |
| \`/list worldbook\` | 列出世界书条目名称 |
| \`/list fields\` | 列出所有顶层字段 |

修改角色卡请输出 \`\`\`json:patch 代码块，格式如下：
\`\`\`json:patch
{
  "set": { "字段名": "新值" },
  "worldbook_add": { "keys": ["触发词"], "comment": "名称", "content": "内容" },
  "worldbook_update": { "index": 0, "content": "新内容" },
  "regex_add": { "scriptName": "名称", "findRegex": "正则", "replaceString": "替换" },
  "regex_update": { "index": 0, "replaceString": "新替换内容" },
  "task_add": { "name": "名称", "commands": "<<taskjs>>\\n代码\\n<</taskjs>>" },
  "task_update": { "index": 0, "commands": "新代码" },
  "greeting_add": "新开场白内容"
}
\`\`\`

如果要展示HTML/前端效果，请用 \`\`\`html 代码块包裹，我会自动在右侧预览区渲染。`);

    return parts.join('\n');
}

// ============================================================
// Agent Peek 命令实现
// ============================================================

function agentPeek(args) {
    const card = buildCardObject ? buildCardObject() : {};
    const arg = args.trim();

    // /peek field <name>
    if (arg.startsWith('field ')) {
        const fieldName = arg.slice(6).trim();
        const value = card[fieldName];
        if (value === undefined) return `❌ 字段 "${fieldName}" 不存在。可用 /list fields 查看所有字段。`;
        const preview = String(value).substring(0, 2000);
        return `**${fieldName}** (${String(value).length}字):\n\`\`\`\n${preview}\n\`\`\`${String(value).length > 2000 ? '\n...(截断，已显示前2000字)' : ''}`;
    }

    // /peek worldbook <name or index>
    if (arg.startsWith('worldbook ')) {
        const query = arg.slice(10).trim();
        const wb = card.worldbook || [];
        let entry;
        if (/^\d+$/.test(query)) {
            entry = wb[parseInt(query)];
        } else {
            entry = wb.find(e => (e.comment || '').includes(query) || (e.keys || []).some(k => k.includes(query)));
        }
        if (!entry) return `❌ 未找到世界书条目 "${query}"。用 /list worldbook 查看所有条目。`;
        const displayIndex = wb.indexOf(entry);
        return `**世界书 [${displayIndex}] ${entry.comment || '(未命名)'}**\n触发词: ${(entry.keys || []).join(', ')}\n\`\`\`\n${entry.content || '(空)'}\n\`\`\``;
    }

    // /peek regex <name or index>
    if (arg.startsWith('regex ')) {
        const query = arg.slice(6).trim();
        const regex = card.regex_scripts || [];
        let script;
        if (/^\d+$/.test(query)) {
            script = regex[parseInt(query)];
        } else {
            script = regex.find(s => (s.scriptName || '').includes(query) || (s.findRegex || '').includes(query));
        }
        if (!script) return `❌ 未找到正则脚本 "${query}"。`;
        const idx = regex.indexOf(script);
        return `**正则 [${idx}] ${script.scriptName || '(未命名)'}**\n匹配: \`${script.findRegex || ''}\`\n替换: \n\`\`\`\n${script.replaceString || ''}\n\`\`\``;
    }

    // /peek task <name or index>
    if (arg.startsWith('task ')) {
        const query = arg.slice(5).trim();
        const tasks = card.xiaobaix_tasks || [];
        let task;
        if (/^\d+$/.test(query)) {
            task = tasks[parseInt(query)];
        } else {
            task = tasks.find(t => (t.name || '').includes(query));
        }
        if (!task) return `❌ 未找到任务 "${query}"。`;
        const idx = tasks.indexOf(task);
        return `**任务 [${idx}] ${task.name || '(未命名)'}**\n触发: ${task.triggerTiming || '?'} | 间隔: ${task.interval || 0}s\n\`\`\`\n${task.commands || ''}\n\`\`\``;
    }

    // /peek greeting <index>
    if (arg.startsWith('greeting ')) {
        const query = arg.slice(9).trim();
        if (query === '0' && card.first_mes) {
            return `**开场白 (first_mes)** (${card.first_mes.length}字):\n\`\`\`\n${card.first_mes}\n\`\`\``;
        }
        const idx = parseInt(query);
        const greetings = card.alternate_greetings || [];
        if (isNaN(idx) || idx >= greetings.length) return `❌ 问候语索引 ${query} 无效。共 ${greetings.length}条备用问候语，开场白索引为0。`;
        const g = greetings[idx];
        return `**备用问候语 [${idx}]** (${g.length}字):\n\`\`\`\n${g}\n\`\`\``;
    }

    return '用法: /peek field <字段名> | /peek worldbook <名称/索引> | /peek regex <名称/索引> | /peek task <名称/索引> | /peek greeting <索引>';
}

function agentList(args) {
    const card = buildCardObject ? buildCardObject() : {};

    if (args.trim() === 'all' || args.trim() === 'fields') {
        const fieldNames = ['name', 'gender', 'description', 'personality', 'system_prompt', 'scenario',
            'first_mes', 'mes_example', 'post_history_instructions', 'creator_notes', 'character_version', 'tags'];
        const lines = fieldNames.map(f => {
            const val = card[f];
            const len = val ? (Array.isArray(val) ? val.length + '项' : String(val).length + '字') : '空';
            return `  ${f}: ${len}`;
        });
        return `**所有字段概览:**\n${lines.join('\n')}`;
    }

    if (args.trim() === 'worldbook') {
        const wb = card.worldbook || [];
        if (wb.length === 0) return '世界书为空。';
        return wb.map((e, i) => `  [${i}] ${e.comment || '(未命名)'} | 触发: ${(e.keys || []).join(', ') || '(无)'} | 内容${(e.content || '').length}字`).join('\n');
    }

    return '用法: /list all | /list fields | /list worldbook';
}

// ============================================================
// json:patch 命令解析和执行
// ============================================================

// 修复 AI 输出的 JSON 中，字符串值内部包含真实换行符（literal newline）的问题
// JSON 标准不允许字符串值中有未转义的换行，但 AI 经常这样做
function fixJsonNewlines(jsonStr) {
    let result = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < jsonStr.length; i++) {
        const ch = jsonStr[i];
        if (escape) { result += ch; escape = false; continue; }
        if (ch === '\\' && inString) { result += ch; escape = true; continue; }
        if (ch === '"') { inString = !inString; result += ch; continue; }
        if (inString) {
            if (ch === '\n') { result += '\\n'; continue; }
            if (ch === '\r') { continue; }
            if (ch === '\t') { result += '\\t'; continue; }
        }
        result += ch;
    }
    return result;
}

// 自动为含HTML或脚本的replaceString添加```包裹（SillyTavern渲染需要）
// 如果内容已经被```包裹则不重复添加
function autoWrapHtml(str) {
    if (!str) return str;
    const trimmed = str.trim();

    // 已经被包裹了（支持多种格式，包括带语言标识的）
    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
        return str;
    }

    // 逻辑调整：只要包含 HTML 标签、脚本、样式
    // 就应该包裹起来，确保渲染安全
    const hasHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);

    if (hasHtml) {
        return '```\n' + str + '\n```';
    }

    return str;
}

function agentApplyPatch(jsonStr) {
    try {
        const patch = JSON.parse(fixJsonNewlines(jsonStr));
        const results = [];
        const errors = [];

        // set - 直接设置字段
        if (patch.set && typeof patch.set === 'object') {
            for (const [key, value] of Object.entries(patch.set)) {
                const el = document.getElementById(key);
                if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                    el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    results.push(`✅ 已设置 ${key}`);
                } else if (key === 'tags' && document.getElementById('tags')) {
                    const tagsEl = document.getElementById('tags');
                    tagsEl.value = Array.isArray(value) ? value.join(', ') : value;
                    results.push(`✅ 已设置 tags`);
                } else if (key === 'gender' && document.getElementById('gender')) {
                    document.getElementById('gender').value = value;
                    results.push(`✅ 已设置 gender`);
                } else if (['name', 'description', 'personality', 'system_prompt', 'scenario', 'first_mes',
                    'mes_example', 'post_history_instructions', 'creator_notes', 'character_version'
                ].includes(key)) {
                    // 尝试直接设置 textarea
                    const textarea = document.getElementById(key);
                    if (textarea) {
                        textarea.value = value;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        results.push(`✅ 已设置 ${key}`);
                    } else {
                        errors.push(`❌ 未找到字段: ${key}`);
                    }
                } else {
                    errors.push(`❌ 不支持的字段: ${key} (支持的字段: name, gender, description, personality, system_prompt, scenario, first_mes, mes_example, post_history_instructions, creator_notes, character_version, tags)`);
                }
            }
        }

        // worldbook_add
        if (patch.worldbook_add) {
            const entry = patch.worldbook_add;
            const newEntry = {
                id: Date.now(),
                keys: entry.keys || [],
                secondary_keys: entry.secondary_keys || [],
                comment: entry.comment || entry.name || '',
                content: entry.content || '',
                priority: entry.priority !== undefined ? entry.priority : 100,
                enabled: entry.enabled !== undefined ? entry.enabled : true,
                position: entry.position !== undefined ? entry.position : 0,
                role: entry.role !== undefined ? entry.role : 0,
                constant: entry.constant !== undefined ? entry.constant : false,
                selective: entry.selective !== undefined ? entry.selective : true,
                use_regex: entry.use_regex !== undefined ? entry.use_regex : false,
                prevent_recursion: entry.prevent_recursion !== undefined ? entry.prevent_recursion : true,
                depth: entry.depth !== undefined ? entry.depth : 4,
                probability: entry.probability !== undefined ? entry.probability : 100,
                children: [],
            };
            if (!window.worldbookEntries) window.worldbookEntries = [];
            window.worldbookEntries.push(newEntry);
            if (typeof renderWorldbookFromData === 'function') {
                renderWorldbookFromData(window.worldbookEntries);
            }
            results.push(`✅ 已添加世界书条目: ${newEntry.comment}`);
        }

        // worldbook_update
        if (patch.worldbook_update) {
            const upd = patch.worldbook_update;
            const idx = upd.index;
            const entries = window.worldbookEntries || [];
            if (idx >= 0 && idx < entries.length) {
                for (const [k, v] of Object.entries(upd)) {
                    if (k !== 'index' && entries[idx].hasOwnProperty(k)) {
                        entries[idx][k] = v;
                        results.push(`✅ 世界书 [${idx}].${k} 已更新`);
                    }
                }
                if (typeof renderWorldbookFromData === 'function') {
                    renderWorldbookFromData(entries);
                }
            } else {
                errors.push(`❌ 世界书索引 ${idx} 无效 (共${entries.length}条)`);
            }
        }

        // regex_add
        if (patch.regex_add) {
            if (typeof addRegexScript === 'function') {
                const r = patch.regex_add;
                const newScript = {
                    scriptName: r.scriptName || r.name || '',
                    findRegex: r.findRegex || '',
                    replaceString: autoWrapHtml(r.replaceString || ''),
                    trimStrings: [],
                    placement: Array.isArray(r.placement) ? r.placement : (r.placement !== undefined ? [r.placement] : [2]),
                    disabled: r.disabled !== undefined ? r.disabled : false,
                    markdownOnly: r.markdownOnly !== undefined ? r.markdownOnly : true,
                    promptOnly: r.promptOnly !== undefined ? r.promptOnly : false,
                    runOnEdit: r.runOnEdit !== undefined ? r.runOnEdit : true,
                    substituteRegex: r.substituteRegex !== undefined ? r.substituteRegex : false,
                };
                regexScriptsData.push(newScript);
                renderRegexScripts();
                results.push(`✅ 已添加正则脚本: ${newScript.scriptName}`);
            } else {
                errors.push('❌ 正则脚本添加功能不可用');
            }
        }

        // regex_update
        if (patch.regex_update) {
            const upd = patch.regex_update;
            if (upd.index >= 0 && upd.index < regexScriptsData.length) {
                for (const [k, v] of Object.entries(upd)) {
                    if (k !== 'index' && typeof updateRegexScript === 'function') {
                        updateRegexScript(upd.index, k, k === 'replaceString' ? autoWrapHtml(v) : v);
                        results.push(`✅ 正则 [${upd.index}].${k} 已更新`);
                    }
                }
                if (typeof renderRegexScripts === 'function') renderRegexScripts();
            } else {
                errors.push(`❌ 正则索引 ${upd.index} 无效`);
            }
        }

        // task_add
        if (patch.task_add) {
            const t = patch.task_add;
            const newTask = {
                id: 'task_' + Date.now(),
                name: t.name || '',
                commands: t.commands || '<<taskjs>>\n\n<</taskjs>>',
                interval: t.interval || 3,
                floorType: t.floorType || 'all',
                triggerTiming: t.triggerTiming || 'initialization',
                disabled: t.disabled || false,
                buttonActivated: t.buttonActivated || false,
                createdAt: new Date().toISOString(),
            };
            xiaobaixTasksData.push(newTask);
            if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
            results.push(`✅ 已添加任务: ${newTask.name}`);
        }

        // task_update
        if (patch.task_update) {
            const upd = patch.task_update;
            if (upd.index >= 0 && upd.index < xiaobaixTasksData.length) {
                for (const [k, v] of Object.entries(upd)) {
                    if (k !== 'index' && typeof updateXiaobaixTask === 'function') {
                        updateXiaobaixTask(upd.index, k, v);
                        results.push(`✅ 任务 [${upd.index}].${k} 已更新`);
                    }
                }
                if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
            } else {
                errors.push(`❌ 任务索引 ${upd.index} 无效`);
            }
        }

        // greeting_add
        if (patch.greeting_add) {
            if (typeof addAlternateGreeting === 'function') {
                addAlternateGreeting(patch.greeting_add);
                results.push('✅ 已添加问候语');
            } else {
                errors.push('❌ 问候语添加功能不可用');
            }
        }

        // regex_delete
        if (patch.regex_delete !== undefined) {
            const idx = typeof patch.regex_delete === 'object' ? patch.regex_delete.index : patch.regex_delete;
            if (idx >= 0 && idx < regexScriptsData.length) {
                const name = regexScriptsData[idx].scriptName || idx;
                regexScriptsData.splice(idx, 1);
                if (typeof renderRegexScripts === 'function') renderRegexScripts();
                results.push(`✅ 已删除正则脚本 [${idx}]: ${name}`);
            } else {
                errors.push(`❌ 正则索引 ${idx} 无效 (共${regexScriptsData.length}条)`);
            }
        }

        // task_delete
        if (patch.task_delete !== undefined) {
            const idx = typeof patch.task_delete === 'object' ? patch.task_delete.index : patch.task_delete;
            if (idx >= 0 && idx < xiaobaixTasksData.length) {
                const name = xiaobaixTasksData[idx].name || idx;
                xiaobaixTasksData.splice(idx, 1);
                if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
                results.push(`✅ 已删除任务 [${idx}]: ${name}`);
            } else {
                errors.push(`❌ 任务索引 ${idx} 无效 (共${xiaobaixTasksData.length}条)`);
            }
        }

        // worldbook_delete
        if (patch.worldbook_delete !== undefined) {
            const idx = typeof patch.worldbook_delete === 'object' ? patch.worldbook_delete.index : patch.worldbook_delete;
            const entries = window.worldbookEntries || [];
            if (idx >= 0 && idx < entries.length) {
                const name = entries[idx].comment || idx;
                entries.splice(idx, 1);
                if (typeof renderWorldbookFromData === 'function') renderWorldbookFromData(entries);
                results.push(`✅ 已删除世界书条目 [${idx}]: ${name}`);
            } else {
                errors.push(`❌ 世界书索引 ${idx} 无效 (共${entries.length}条)`);
            }
        }

        return { results, errors };
    } catch (e) {
        return { results: [], errors: [`❌ JSON解析失败: ${e.message}`] };
    }
}

// ============================================================
// Agent UI
// ============================================================

function initAgentPanel() {
    const panel = document.getElementById('agent-panel');
    if (!panel) return;
    // 尝试从DB加载当前角色的聊天记录
    const charId = getCurrentCharId();
    if (charId) {
        loadAgentMessages(charId);
    } else {
        agentMessages = [];
        renderAgentMessages();
    }
}

function renderAgentMessages() {
    const container = document.getElementById('agent-messages');
    if (!container) return;

    container.innerHTML = '';
    agentMessages.forEach((msg, i) => {
        const div = document.createElement('div');
        div.className = 'agent-msg ' + (msg.role === 'user' ? 'agent-msg-user' : 'agent-msg-ai');
        if (msg.role === 'ai') {
            div.innerHTML = renderAgentContent(msg.content);
        } else {
            div.textContent = msg.content;
        }
        container.appendChild(div);
    });

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

function renderAgentContent(content) {
    // 1. 先提取代码块保护起来，再转义剩余文字
    const blocks = [];
    let text = content;

    // 所有代码块类型
    const codeBlockRegexes = [
        { type: 'json-patch', regex: /```json:patch\n?([\s\S]*?)```/g },
        { type: 'html', regex: /```html\n?([\s\S]*?)```/g },
        { type: 'stscript', regex: /```(stscript|state)\n?([\s\S]*?)```/g },
        { type: 'code', regex: /```(\w*)\n?([\s\S]*?)```/g },
    ];

    // 把所有代码块替换为占位符
    for (const { type, regex } of codeBlockRegexes) {
        text = text.replace(regex, function (match, ...groups) {
            const idx = blocks.length;
            let lang = type;
            let code = groups[groups.length - 3]; // 最后一个捕获组才是代码内容（groups包含捕获组+offset+原字符串）
            if (type === 'stscript') {
                lang = groups[0];
                code = groups[1];
            } else if (type === 'code') {
                lang = groups[0] || 'code';
                code = groups[1];
            }
            blocks.push({ type: lang, code: code.trim() });
            return `%%CODEBLOCK_${idx}%%`;
        });
    }

    // 2. 转义剩余文字
    let html = escapeHtml(text);

    // 3. 恢复代码块
    html = html.replace(/%%CODEBLOCK_(\d+)%%/g, function (match, idx) {
        const block = blocks[parseInt(idx)];
        if (!block) return match;

        const code = escapeHtml(block.code);

        if (block.type === 'json-patch') {
            const forClick = block.code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
            return `<div class="agent-code-block agent-patch-block">
                <div class="agent-code-header">
                    <span>json:patch（已自动执行）</span>
                </div>
                <pre><code>${code}</code></pre>
            </div>`;
        }

        if (block.type === 'html') {
            const safeCode = encodeURIComponent(block.code).replace(/'/g, '%27');
            return `<div class="agent-code-block agent-html-block">
                <div class="agent-code-header">
                    <span>HTML 预览</span>
                    <button class="agent-preview-btn" onclick="agentRenderHTML(decodeURIComponent('${safeCode}'))">渲染预览</button>
                </div>
                <pre><code>${code.substring(0, 500)}${block.code.length > 500 ? '...' : ''}</code></pre>
            </div>`;
        }

        if (block.type === 'stscript' || block.type === 'state') {
            return `<div class="agent-code-block">
                <div class="agent-code-header"><span>${escapeHtml(block.type)}</span></div>
                <pre><code>${code}</code></pre>
            </div>`;
        }

        return `<div class="agent-code-block">
            <div class="agent-code-header"><span>${escapeHtml(block.type)}</span></div>
            <pre><code>${code}</code></pre>
        </div>`;
    });

    // 4. 粗体和行内代码
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code class="agent-inline-code">$1</code>');

    // 5. 换行
    html = html.replace(/\n/g, '<br>');

    return html;
}

function escapeAttr(str) {
    return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// ============================================================
// Agent 预览和应用
// ============================================================

let _lastPatchSnapshot = null;

function agentPreviewPatch(jsonStr) {
    // 保存当前卡状态快照，用于撤销
    _lastPatchSnapshot = buildCardObject ? JSON.parse(JSON.stringify(buildCardObject())) : null;

    const patchResult = agentApplyPatch(jsonStr);
    const container = document.getElementById('agent-preview-area');
    if (!container) return;

    let html = '<div style="font-size:12px;color:#aaa;margin-bottom:6px;">点击"应用"执行修改，"撤销"恢复到修改前状态</div>';
    if (patchResult.results.length > 0) {
        html += '<div class="patch-success">' + patchResult.results.map(r => escapeHtml(r)).join('<br>') + '</div>';
    }
    if (patchResult.errors.length > 0) {
        html += '<div class="patch-error">' + patchResult.errors.map(r => escapeHtml(r)).join('<br>') + '</div>';
    }
    if (patchResult.results.length === 0 && patchResult.errors.length === 0) {
        html += '<div style="color:#f39c12;">⚠️ 没有检测到任何变更操作</div>';
    }
    html += '<div class="patch-actions">';
    html += '<button class="patch-accept" onclick="agentAcceptPatch()">应用</button>';
    html += '<button class="patch-reject" onclick="agentRejectPatch()">撤销</button>';
    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';
}

function agentAcceptPatch() {
    const container = document.getElementById('agent-preview-area');
    if (container) container.style.display = 'none';
    _lastPatchSnapshot = null;
    addAgentSystemMessage('✅ 变更已应用。你可以继续修改或保存角色卡。');
}

function agentRejectPatch() {
    const container = document.getElementById('agent-preview-area');
    if (container) container.style.display = 'none';

    // 用快照恢复到修改前状态
    if (_lastPatchSnapshot) {
        const snap = _lastPatchSnapshot;
        // 重新填充编辑器表单
        const charId = document.getElementById('charId')?.value;
        if (charId) {
            // 有ID说明是编辑已有角色，用 populateEditorForm 恢复
            showEditorView(parseInt(charId));
        } else {
            // 无ID是新建角色，手动恢复字段
            for (const [key, val] of Object.entries(snap)) {
                const el = document.getElementById(key);
                if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                    el.value = val ?? '';
                }
            }
            if (snap.regex_scripts) {
                regexScriptsData = JSON.parse(JSON.stringify(snap.regex_scripts));
                renderRegexScripts();
            }
            if (snap.xiaobaix_tasks) {
                xiaobaixTasksData = JSON.parse(JSON.stringify(snap.xiaobaix_tasks));
                renderXiaobaixTasks();
            }
        }
        _lastPatchSnapshot = null;
        addAgentSystemMessage('🔄 已撤销，恢复到修改前的状态。');
    } else {
        addAgentSystemMessage('🔄 已撤销（无快照，表单可能未完全恢复）。');
    }
}

function agentRenderHTML(htmlCode) {
    const previewFrame = document.getElementById('agent-html-preview');
    if (!previewFrame) return;

    // 显示预览面板
    const previewPanel = document.getElementById('agent-html-preview-panel');
    if (previewPanel) previewPanel.style.display = 'block';

    let fullHTML = htmlCode;
    // 如果不包含完整HTML结构，包装之
    if (!/<!DOCTYPE|<html/i.test(fullHTML)) {
        fullHTML = '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:12px;color:#d4d4d4;background:#1e1e1e;margin:0;}</style></head>\n<body>\n' + fullHTML + '\n</body>\n</html>';
    }

    setTimeout(() => {
        try {
            previewFrame.srcdoc = fullHTML;
        } catch (e) {
            previewFrame.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(fullHTML);
        }
    }, 50);
}

// ============================================================
// Agent 消息管理
// ============================================================

function addAgentSystemMessage(text) {
    agentMessages.push({ role: 'system', content: text });
    renderAgentMessages();
    saveAgentMessages(resolveCharId());
}

function addAgentUserMessage(text) {
    agentMessages.push({ role: 'user', content: text });
    renderAgentMessages();
    saveAgentMessages(resolveCharId());
}

function addAgentAIMessage(text) {
    agentMessages.push({ role: 'ai', content: text });
    renderAgentMessages();
    saveAgentMessages(resolveCharId());
}

async function flushAgentMessages() {
    await saveAgentMessages(resolveCharId());
}

// ============================================================
// Agent API 调用
// ============================================================

let _agentAbortController = null;

function stopAgentGeneration() {
    if (_agentAbortController) {
        _agentAbortController.abort();
        _agentAbortController = null;
    }

    // 强制清理最后的“思考中”状态
    if (agentMessages.length > 0) {
        const last = agentMessages[agentMessages.length - 1];
        if (last && last.role === 'ai' && (last.content === '思考中...' || !last.content)) {
            agentMessages.pop();
            renderAgentMessages();
        }
    }
}

async function _agentStreamFetch(url, headers, body, signal, onToken, onReasoning) {
    const res = await fetch(url, { method: 'POST', headers, body, signal });
    if (!res.ok) throw new Error('API ' + res.status);
    if (!res.body) throw new Error('浏览器不支持流式读取');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data: ')) continue;
            const d = t.slice(6).trim();
            if (d === '[DONE]') continue;
            try {
                const p = JSON.parse(d);
                const delta = p.choices?.[0]?.delta;
                if (delta?.content) onToken(delta.content);
                if (delta?.reasoning_content) onReasoning?.(delta.reasoning_content);
            } catch (e) { }
        }
    }
}

async function agentStreamCall(systemPrompt, historyMessages, userMessage, signal, onToken, onReasoning) {
    const apiSettings = _readAgentApiSettings();
    if (!apiSettings || !apiSettings.provider) {
        if (typeof loadApiSettings !== 'function') throw new Error('missing');
        const merged = loadApiSettings();
        if (!merged || !merged.provider) throw new Error('missing');
        const result = await agentCallAPI(userMessage);
        if (!result) throw new Error('missing');
        if (result.reasoning) onReasoning(result.reasoning);
        onToken(result.content);
        return;
    }

    const provider = apiSettings.provider;

    // 构建messages数组
    const messages = [
        { role: 'system', content: systemPrompt },
        ...historyMessages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.content
        })),
        { role: 'user', content: userMessage }
    ];

    if (provider === 'deepseek' || provider === 'tavern') {
        let url, headers, bodyObj;

        if (provider === 'deepseek') {
            const key = apiSettings.deepseek?.apiKey;
            if (!key) throw new Error('missing');
            url = 'https://api.deepseek.com/chat/completions';
            headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
            bodyObj = {
                model: apiSettings.deepseek?.model || 'deepseek-v4-flash',
                messages, max_tokens: 8192, temperature: 0.7, stream: true,
            };
        } else {
            const cfg = apiSettings.tavern || {};
            const ct = cfg.connectionType || 'direct';
            if (ct === 'reverse-proxy') {
                if (!cfg.proxyUrl || !cfg.proxyPassword) throw new Error('missing');
            } else {
                if (!cfg.apiKey || !cfg.endpoint) throw new Error('missing');
            }
            const auth = ct === 'reverse-proxy' ? cfg.proxyPassword : cfg.apiKey;
            let base = ct === 'reverse-proxy' ? cfg.proxyUrl : cfg.endpoint;
            if (!base.startsWith('http')) base = 'https://' + base;
            base = base.replace(/\/+$/, '');
            url = base + (base.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions');
            headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth };
            bodyObj = { model: cfg.model || '', messages, max_tokens: 8192, stream: true };
        }

        await _agentStreamFetch(url, headers, JSON.stringify(bodyObj), signal, onToken, onReasoning);
        return;
    }

    // 非流式回退
    const result = await agentCallAPI(userMessage);
    if (!result) throw new Error('missing');
    if (result.reasoning) onReasoning(result.reasoning);
    onToken(result.content);
}

async function agentSendMessage() {
    const input = document.getElementById('agent-input');
    if (!input) return;
    const userText = input.value.trim();
    if (!userText) return;

    input.value = '';
    addAgentUserMessage(userText);

    const sendBtn = document.getElementById('agent-send-btn');

    const context = buildAgentContext();
    const systemPrompt = `你是妮卡角色工作室的智能助手，帮助用户创建和修改SillyTavern角色卡（chara_card_v3格式）。

## 核心架构——必须理解才能正确工作

### 1. 前端/HTML是怎么工作的
SillyTavern中HTML效果（如状态栏）不是写在description里的，而是通过**正则脚本(regex_scripts)**实现的：
- 正则脚本的 replaceString 字段包含要渲染的HTML+JS代码
- 当聊天消息中出现匹配 findRegex 的文本时，它会被 replaceString 替换
- 所以HTML效果本质上是"字符串替换"，不是直接嵌入角色描述
- 正则脚本还可以设置 placement 来控制作用于AI输出还是用户输入

### 2. 角色变量管理（小白X + STscript）
角色卡使用两种方式管理变量：

#### 方式A: 小白X任务初始化（用setvar设初始值）
在小白X循环任务中，用 <<taskjs>> 包裹的JS代码，通过 await STscript('/setvar key=变量名 值') 来初始化变量。

典型初始化任务示例：
<<taskjs>>
await STscript('/setvar key=hp 100');
await STscript('/setvar key=max_hp 100');
await STscript('/setvar key=mp 50');
await STscript('/setvar key=exp 0');
await STscript('/setvar key=level 1');
<</taskjs>>

STscript核心命令参考：
- /setvar key=变量名 值 — 设置变量
- /getvar key=变量名 — 获取变量值
- /addvar key=变量名 值 — 给数字变量累加，或追加字符串
- /incvar 变量名 — 变量+1
- /decvar 变量名 — 变量-1
- /flushvar 变量名 — 删除变量
- /listvar — 列出所有变量
- /echo 内容 — 输出内容

#### 方式B: 变量管理2.0（AI在回复中用<state>块更新）
SillyTavern的LittleWhiteBox插件支持在AI回复中嵌入<state>块来实时更新变量。

<state>语法：
- 设置值: 路径: 值  例：数据.角色.生命值: 80
- 数字加减: 路径: +N / 路径: -N  例：数据.角色.生命值: -20
- 负数: 路径: (-N)  例：数据.温度: (-10)
- 数组添加: 路径: +"项" 或 路径: +["a","b"]  例：数据.技能: +"火球术"
- 数组删除(按值): 路径: -"项"  例：数据.技能: -"火球术"
- 数组删除(按索引): 路径[索引]: null  例：数据.技能[0]: null
- 删除属性: 路径: null  例：数据.临时状态: null

$schema（结构模板）：
<state>
  角色:
    姓名: ""
    生命值: 0
    技能: []
  背包:
    "*": 0
数据:
  角色:
    姓名: "苏晚"
    生命值: 100
    技能: []
</state>
$schema只定义允许的字段结构（类型白名单），不写入数据。

约束规则：
- $ro 路径 — 只读
- $range=[min,max] 路径 — 范围限制
- $step=N 路径 — 单次最大变化量
- $enum={值1;值2} 路径 — 枚举

### 3. 正则触发机制：AI必须被告知输出触发词 (CRITICAL)
正则脚本的触发原理是**文本匹配**——聊天消息中出现匹配 findRegex 的文字时才会替换。这意味着：

**AI不会自发输出触发词！** 你必须在角色卡中明确指示AI输出触发词，否则正则永远不会触发。

常见的做法是在 system_prompt 或 description 中加入类似指令：
- "每次回复结束时，必须输出【状态栏】"
- "你拥有状态管理系统，每次行动后输出【状态栏】更新显示"
- "使用 <state> 标签同步数据，并在回复末尾添加【状态栏】"

**因此，创建一个带触发词的正则脚本时，必须同时做两件事：**
1. regex_add：创建正则脚本，设置 findRegex 为触发词
2. set system_prompt 或 edit description：在角色指令中要求AI输出触发词

缺少第二步，正则就是"死"的，永远不会被触发。

### 5. 正则脚本和变量系统配合（关键）
在SillyTavern聊天环境中，STscript() 是一个全局可用的异步函数——不仅能在小白X任务里用，在**正则脚本的HTML代码里**和**开场白/备用问候语的HTML代码里**都能用（都渲染在聊天页面中）。

典型的状态栏系统工作流程：
- 小白X任务初始化：用 setvar 设置 hp/mp/level 等初始值
- AI回复用 <state> 块更新变量值（hp: -20, exp: +10）
- 正则脚本匹配 "【状态栏】" 将其替换为内置JS的HTML代码
- HTML中的JS通过 await STscript('/getvar key=hp') 实时获取变量值并渲染DOM
- 还可用 setInterval 定时刷新，确保状态栏始终显示最新数值

### 6. 必须的辅助正则：隐藏 <state> 标签 (CRITICAL)
AI 回复中的 <state> 块是为了给插件同步变量数据，不应该被用户直接看到。
**规则**：当你为角色配置变量系统时，必须添加一个专门用来隐藏 <state> 标签的正则脚本：
- scriptName: "隐藏数据标签"
- findRegex: "/<state>[\\s\\S]*?<\\/state>/"
- replaceString: "" (替换为空字符串)
- placement: [2] (作用于 AI 输出)

### 7. 正则脚本 replaceString 中可用的STscript调用示例：
\`\`\`javascript
// 读取变量
const hp = await STscript('/getvar key=hp');
const maxHp = await STscript('/getvar key=max_hp');

// 设置变量
await STscript('/setvar key=hp 100');

// 修改变量
await STscript('/addvar key=hp -20');
\`\`\`

**⚠️ 重要**：这些STscript调用直接写在正则脚本HTML的<script>标签里即可，不需要再包一层 <<taskjs>>。正则HTML中的JS运行在SillyTavern的聊天页面上下文中，STscript() 直接可用。

### 8. 开场白（first_mes）和备用问候语（alternate_greetings）
开场白是角色的第一句话，**非常重要**——它决定了用户对角色第一印象。备用问候语让角色可以有多种开场方式。

开场白和备用问候语也支持HTML渲染：
- HTML+CSS+JS可以直接写在开场白/问候语内容中，SillyTavern会渲染为聊天消息
- JS中同样可以用 await STscript() 读写变量
- **区别**：开场白的HTML是直接渲染的（不需要正则匹配触发），而正则脚本的HTML需要匹配到文字后再替换
- 开场白适合放初始化欢迎界面、角色动态立绘、状态介绍面板等
- 典型例子：开场白里直接嵌入 &lt;div&gt; 制作的欢迎面板，里面包含角色名、欢迎词、简短说明

## 你的能力
1. **查看完整内容**: /peek field <字段名>；/peek worldbook/regex/task/greeting <索引或名称>
2. **修改角色卡**: 通过 \`\`\`json:patch 代码块（见下方格式）
3. **展示HTML效果**: 用 \`\`\`html 代码块

## json:patch 修改格式

\`\`\`json:patch
{
  "set": { "description": "新描述", "system_prompt": "新系统提示词" },
  "regex_add": { "scriptName": "状态栏", "findRegex": "【状态栏】", "replaceString": "<div>HTML代码...</div>" },
  "regex_update": { "index": 0, "replaceString": "修改后的HTML" },
  "regex_delete": { "index": 0 },
  "task_add": { "name": "初始化变量", "triggerTiming": "initialization", "commands": "<<taskjs>>\\nawait STscript('/setvar key=hp 100');\\nawait STscript('/setvar key=max_hp 100');\\n<</taskjs>>" },
  "task_update": { "index": 0, "commands": "新代码" },
  "task_delete": { "index": 0 },
  "worldbook_add": { "keys": ["hp"], "comment": "生命值", "content": "角色生命值系统" },
  "worldbook_delete": { "index": 0 }
}
\`\`\`

可用字段: name, gender, description, personality, system_prompt, scenario, first_mes, mes_example, post_history_instructions, creator_notes, character_version

## 🚨 极其重要：json:patch 中的 HTML 规则 (CRITICAL)
- 在 json:patch 的字段值中直接写入原始 HTML 即可，**不要在 JSON 字符串值中添加反引号(\`\`\`)包裹**！系统会自动处理 HTML 的渲染包裹。
- ❌ 错误（加了反引号）：\`"replaceString": "\`\`\`<div>...</div>\`\`\`"\`
- ✅ 正确（直接写HTML）：\`"replaceString": "<div>...</div>"\`
- 原因：反引号会破坏 json:patch 代码块的解析边界，导致 JSON 被截断而失败。

## 🚨 json:patch 长度限制规则 (CRITICAL)
- 你的输出有 token 上限。如果 replaceString 中的 HTML+CSS+JS 超过约 2000 字符，极可能被截断导致 JSON 损坏！
- **拆分原则**：如果单个 replaceString 超过1500字符，必须拆分为多个独立的 regex_add，每个用不同的触发词。例如：把【状态栏】、【背包】、【地图】拆分成 3 个独立的正则脚本，而不是合并成一个巨大的。
- **CSS 最小化**：压缩 CSS，去掉换行和多余空格
- **JS 最小化**：压缩 JS，使用短变量名
- **HTML 属性用单引号**：用 ' 代替 "，避免 JSON 内部双引号转义导致混乱
- **每个 json:patch 代码块只做一件事**：不要在同一个代码块中同时 set + regex_add + task_add，拆分成多个独立的 json:patch 代码块

## 重要规则

- 🚫 **绝对不要把HTML代码写到 description / creator_notes 里**——HTML是通过正则脚本的 replaceString 字段嵌入的
- ⚠️ **创建正则脚本时，必须同时在 system_prompt / description 中指示AI输出触发词！** 否则AI不知道要输出什么文字来触发正则，正则永远不执行
- ✅ 需要HTML效果 → 用 regex_add 或 regex_update 创建/修改正则脚本
- ✅ 需要初始化变量 → 用 task_add 创建小白X任务，triggerTiming用"initialization"，commands里写 <<taskjs>>\\nawait STscript('/setvar key=变量名 值');\\n<</taskjs>>
- ✅ 使用 <state> 变量系统时 → **必须** 同时添加一个 regex_add 用来隐藏 "/<state>[\\s\\S]*?<\\/state>/"
- ✅ 需要AI回复中用<state>更新变量 → 在系统提示词或世界书中说明<state>语法给AI用
- ✅ 需要展示前端预览 → 用 \`\`\`html 代码块，我会在右侧iframe中渲染
- 先用 /peek 或 /list 了解当前状态再动手改
- 每次请求只做必要的修改，不要自创不存在的逻辑

## 🚨 变量名一致性规则 (CRITICAL)
- task_add 中初始化的变量名、regex_add 的 replaceString 中用 STscript('/getvar key=xxx') 读取的变量名、以及 system_prompt 中写给AI的 <state> 语法里的变量名——这三处 **必须使用完全相同的英文 key**！
- ❌ 错误示例：task_add 用 /setvar key=inventory，但 system_prompt 里的 <state> 示例写成"背包: +治疗药水"——中文名和英文key不匹配，<state>更新将失效！
- ✅ 正确示例：三处都统一用英文key。task_add 用 /setvar key=inventory，正则中用 /getvar key=inventory，system_prompt 中 <state> 写 inventory: +xxx
- 如果需要中文显示名，仅在 UI 渲染的 HTML 标签文本中使用中文，变量 key 本身必须保持英文一致

${context}

### json:patch 进阶字段说明

#### regex_add / regex_update:
- \`placement\`: 数组或数字。[1]代表用户输入，[2]代表AI输出，[1,2]代表两者都选
- \`markdownOnly\`: 布尔值。为true时表示"仅改变显示"（不影响发送给AI的内容）
- \`promptOnly\`: 布尔值。为true时表示"仅改变发送"（不影响显示）
- \`runOnEdit\`: 布尔值。是否在编辑消息时运行
- \`disabled\`: 布尔值。是否禁用该脚本

#### worldbook_add / worldbook_update:
- \`constant\`: 布尔值。是否恒定注入（即常驻，不需要关键词触发）
- \`selective\`: 布尔值。是否选择性注入（需要关键词触发，通常默认为true）
- \`enabled\`: 布尔值。是否启用该条目
- \`priority\`: 数字。注入优先级，默认100
- \`depth\`: 数字。扫描深度，默认4
- \`keys\`: 字符串数组。触发关键词

请根据以上上下文和用户需求，帮助用户完善角色卡。如有必要，先确认你对需求的理解再动手。`;

    if (_agentAbortController) _agentAbortController.abort();
    _agentAbortController = new AbortController();

    const historyMessages = agentMessages.filter(m => m.role !== 'system');
    let currentUserText = userText;
    const container = document.getElementById('agent-messages');
    const MAX_ROUNDS = 8;

    if (sendBtn) { sendBtn.textContent = '停止'; sendBtn.onclick = stopAgentGeneration; }

    try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
            if (_agentAbortController.signal.aborted) break;

            // 本轮占位消息
            const msgIdx = agentMessages.length;
            agentMessages.push({ role: 'ai', content: '思考中...' });
            renderAgentMessages();
            const msgDiv = container?.lastElementChild;
            container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

            let roundContent = '';
            let roundReasoning = '';

            try {
                mylog('[Agent] 第' + (round + 1) + '轮');

                await agentStreamCall(systemPrompt, historyMessages, currentUserText,
                    _agentAbortController.signal,
                    (t) => { roundContent += t; if (msgDiv) msgDiv.textContent = roundContent || '思考中...'; container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }); },
                    (t) => { roundReasoning += t; }
                );
            } catch (err) {
                if (err.name === 'AbortError') {
                    if (roundContent) {
                        agentMessages[msgIdx] = { role: 'ai', content: roundContent + '\n\n---\n⚠️ 已停止' };
                    } else {
                        agentMessages.splice(msgIdx, 1);
                    }
                    renderAgentMessages();
                    break;
                }
                const m = err.message || '';
                if (['API设置', 'API Key', '未设置', 'missing'].some(k => m.includes(k))) {
                    agentMessages[msgIdx] = { role: 'ai', content: '❌ 请先在 API 设置中配置 AI 服务商。' };
                } else if (roundContent) {
                    agentMessages[msgIdx] = { role: 'ai', content: roundContent + '\n\n---\n⚠️ 中断' };
                } else {
                    agentMessages[msgIdx] = { role: 'ai', content: '❌ 失败: ' + m };
                }
                renderAgentMessages();
                break;
            }

            // 渲染本轮
            let display = roundContent;
            if (roundReasoning) {
                display = '<details class="agent-reasoning" open><summary>\U0001f4ad 思考</summary>\n' + roundReasoning + '\n</details>\n\n---\n\n' + roundContent;
            }
            agentMessages[msgIdx] = { role: 'ai', content: display };
            renderAgentMessages();
            historyMessages.push({ role: 'ai', content: roundContent });

            // 提取并执行 json:patch 和 扫描命令
            const patchMatches = [...roundContent.matchAll(/```json:patch\n?([\s\S]*?)```/g)];
            const peekRegex = /^\/peek\s+(.+)$/gm;
            const listRegex = /^\/list\s+(.+)$/gm;

            let hasCommand = false;
            const commandResults = [];
            const displayResults = [];

            let match;
            while ((match = peekRegex.exec(roundContent)) !== null) {
                hasCommand = true;
                const result = agentPeek(match[1]);
                if (result) {
                    displayResults.push('🔍 ' + result);
                    commandResults.push('🔍 ' + result);
                }
            }
            while ((match = listRegex.exec(roundContent)) !== null) {
                hasCommand = true;
                const result = agentList(match[1]);
                if (result) {
                    displayResults.push('📋 ' + result);
                    commandResults.push('📋 ' + result);
                }
            }

            if (patchMatches.length > 0) {
                hasCommand = true;
                const results = [];
                const errors = [];
                for (const m of patchMatches) {
                    const fixedJson = fixJsonNewlines(m[1]);
                    // 截断检测：如果 JSON 文本不以 } 结尾，说明被输出 token 限制截断了
                    const trimmed = fixedJson.trim();
                    if (!trimmed.endsWith('}')) {
                        errors.push('✈️ 输出被截断！你的 json:patch 代码块在输出到一半时就被 token 上限切断了。解决方法：1) 拆分成多个小的 json:patch 代码块，每个只做一件事；2) 压缩 CSS/JS 代码；3) HTML 属性用单引号代替双引号。截断位置末尾：...' + trimmed.slice(-80));
                        continue;
                    }
                    try {
                        JSON.parse(fixedJson);
                    } catch (e) {
                        let errorSnippet = '';
                        const posMatch = e.message.match(/position (\d+)/);
                        if (posMatch) {
                            const pos = parseInt(posMatch[1], 10);
                            const start = Math.max(0, pos - 40);
                            const end = Math.min(fixedJson.length, pos + 40);
                            errorSnippet = '\n出错位置附近的文本：\n>>>>' + fixedJson.substring(start, pos) + '【⚠️错误点】' + fixedJson.substring(pos, end) + '<<<<';
                        }
                        errors.push('JSON解析失败: ' + e.message + '。请输出合法的JSON！' + errorSnippet);
                        continue;
                    }
                    const r = agentApplyPatch(m[1]);
                    results.push(...(r.results || []));
                    errors.push(...(r.errors || []));
                }
                const parts = [];
                if (results.length) parts.push('✅ ' + results.join('; '));
                if (errors.length) parts.push('⚠️ ' + errors.join('; '));
                if (parts.length) {
                    displayResults.push('⚡ 第' + (round + 1) + '轮: ' + parts.join(' | '));
                    commandResults.push('json:patch 执行结果: ' + parts.join(' | '));
                }
            }

            if (hasCommand) {
                if (displayResults.length > 0) {
                    addAgentSystemMessage(displayResults.join('\n\n'));
                }
                currentUserText = '前面的命令已执行，结果如下：\n\n' + commandResults.join('\n\n') + '\n\n如果需要更多修改或回答，请继续输出，否则给出最终总结。';
                continue;
            }

            // 没有 patch 和命令，结束
            break;
        }
    } finally {
        _agentAbortController = null;
        saveAgentMessages(resolveCharId());
        renderAgentMessages();
        if (sendBtn) {
            sendBtn.textContent = '发送';
            sendBtn.onclick = agentSendMessage;
            sendBtn.disabled = false;
        }
    }
}


function _readAgentApiSettings() {
    // 从localStorage读取API设置，不触发任何DOM操作
    try {
        const raw = localStorage.getItem('apiSettings');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

async function agentCallAPI(prompt) {
    const apiSettings = _readAgentApiSettings();
    if (!apiSettings) {
        // fallback: 用loadApiSettings（含deepMerge补缺）
        if (typeof loadApiSettings !== 'function') return null;
        try {
            const merged = loadApiSettings();
            if (!merged) return null;
            const p = merged.provider;
            if (!p || !merged[p]) return null;
            // 复制到apiSettings
            apiSettings[p] = merged[p];
            apiSettings.provider = p;
            apiSettings.tavern = merged.tavern;
        } catch (e) {
            return null;
        }
    }
    const provider = apiSettings.provider;
    if (!provider) return null;

    switch (provider) {
        case 'deepseek': {
            const key = apiSettings.deepseek?.apiKey;
            if (!key) return null;
            const model = apiSettings.deepseek?.model || 'deepseek-v4-flash';
            const res = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 8192, temperature: 0.7 }),
            });
            if (!res.ok) throw new Error('DeepSeek ' + res.status);
            const data = await res.json();
            const m = data.choices?.[0]?.message || {};
            return { content: m.content || '', reasoning: m.reasoning_content || null };
        }
        case 'tavern': {
            const cfg = apiSettings.tavern || {};
            const ct = cfg.connectionType || 'direct';
            if (ct === 'reverse-proxy') {
                if (!cfg.proxyUrl || !cfg.proxyPassword) return null;
            } else {
                if (!cfg.apiKey || !cfg.endpoint) return null;
            }
            const auth = ct === 'reverse-proxy' ? cfg.proxyPassword : cfg.apiKey;
            let base = ct === 'reverse-proxy' ? cfg.proxyUrl : cfg.endpoint;
            if (!base.startsWith('http')) base = 'https://' + base;
            base = base.replace(/\/+$/, '');
            const url = base + (base.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions');
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth }, body: JSON.stringify({ model: cfg.model || '', messages: [{ role: 'user', content: prompt }], max_tokens: 8192 }) });
            if (!res.ok) throw new Error('Tavern ' + res.status);
            const d = await res.json();
            const m2 = d.choices?.[0]?.message || {};
            return { content: m2.content || '', reasoning: m2.reasoning_content || null };
        }
        case 'gemini': {
            const key = apiSettings.gemini?.apiKey;
            if (!key) return null;
            const gm = apiSettings.gemini?.model || 'gemini-2.5-flash';
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 65536 } }) });
            if (!res.ok) throw new Error('Gemini ' + res.status);
            const d = await res.json();
            return { content: d.candidates?.[0]?.content?.parts?.[0]?.text || '', reasoning: null };
        }
        case 'gemini-proxy': {
            const cfg = apiSettings['gemini-proxy'] || {};
            if (!cfg.apiKey || !cfg.endpoint) return null;
            let ep = cfg.endpoint;
            if (!ep.startsWith('http')) ep = 'https://' + ep;
            ep = ep.replace(/\/+$/, '');
            const useOpenAI = ep.endsWith('/v1');
            if (!useOpenAI) {
                const model = cfg.model || 'gemini-2.5-flash';
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 65536 } }) });
                if (!res.ok) throw new Error('GeminiProxy ' + res.status);
                const d = await res.json();
                return { content: d.candidates?.[0]?.content?.parts?.[0]?.text || '', reasoning: null };
            } else {
                const url = ep + '/chat/completions';
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey }, body: JSON.stringify({ model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 65536 }) });
                if (!res.ok) throw new Error('GeminiProxy ' + res.status);
                const d = await res.json();
                return { content: d.choices?.[0]?.message?.content || '', reasoning: null };
            }
        }
        case 'ollama': {
            const cfg = apiSettings.ollama || {};
            if (!cfg.endpoint || !cfg.model) return null;
            let ep = cfg.endpoint;
            if (!ep.startsWith('http')) ep = 'http://' + ep;
            ep = ep.replace(/\/+$/, '');
            const res = await fetch(ep + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: cfg.model, prompt, stream: false }) });
            if (!res.ok) throw new Error('Ollama ' + res.status);
            const d = await res.json();
            return { content: d.response || '', reasoning: null };
        }
        case 'local': {
            const cfg = apiSettings.local || {};
            const ep = cfg.endpoint || 'http://127.0.0.1:5000/v1/chat/completions';
            const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'local-model', messages: [{ role: 'user', content: prompt }], max_tokens: 65536 }) });
            if (!res.ok) throw new Error('Local ' + res.status);
            const d = await res.json();
            return { content: d.choices?.[0]?.message?.content || '', reasoning: null };
        }
        default:
            return null;
    }
}


function scanAndExecuteCommands(text) {
    // 扫描 /peek 和 /list 命令并自动执行
    const peekRegex = /^\/peek\s+.+$/gm;
    const listRegex = /^\/list\s+.+$/gm;

    let match;
    while ((match = peekRegex.exec(text)) !== null) {
        const result = agentPeek(match[0].replace(/^\/peek\s+/, ''));
        if (result && !result.startsWith('❌')) {
            addAgentSystemMessage('🔍 ' + result);
        }
    }
    while ((match = listRegex.exec(text)) !== null) {
        const result = agentList(match[0].replace(/^\/list\s+/, ''));
        if (result) {
            addAgentSystemMessage('📋 ' + result);
        }
    }
}


function extractJsonPatchFromText(text) {
    const matches = [...text.matchAll(/```json:patch\n?([\s\S]*?)```/g)];
    return matches.map(m => m[1]).filter(code => { try { JSON.parse(code); return true; } catch (e) { return false; } });
}


// ============================================================
// Agent 输入处理
// ============================================================

function handleAgentKeypress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        agentSendMessage();
    }
}

function agentClearChat() {
    if (confirm('确定要清空对话历史吗？')) {
        agentMessages = [];
        renderAgentMessages();
        const previewPanel = document.getElementById('agent-html-preview-panel');
        if (previewPanel) previewPanel.style.display = 'none';
        // 从DB中删除
        saveAgentMessages(resolveCharId());
    }
}

function agentQuickAction(action) {
    const input = document.getElementById('agent-input');
    if (!input) return;

    const prompts = {
        'review': '请审查当前角色卡的完整内容，指出问题和改进建议。先用 /peek 和 /list 了解所有内容。',
        'statusbar': '请为这个角色设计一个精美的状态栏（包含角色名、生命值、魔法值等游戏化元素）。',
        'worldbook': '请分析当前角色的设定，建议需要补充的世界书条目，并用/json:patch添加。',
        'variables': '请为这个角色设计一套变量管理系统。',
    };
    input.value = prompts[action] || '';
    agentSendMessage();
}

// ============================================================
// 工具函数
// ============================================================

function truncateText(text, maxLen) {
    if (!text) return '';
    const str = String(text);
    return str.length <= maxLen ? str : str.substring(0, maxLen) + '...(截断)';
}

// ============================================================
// Agent 面板开关（滑入/滑出）
// ============================================================

function toggleAgentPanel() {
    const panel = document.getElementById('agent-panel');
    if (!panel) return;
    panel.classList.toggle('open');
}
