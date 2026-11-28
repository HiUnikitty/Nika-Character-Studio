// ==========================================================================
// 🃏 小说转卡 (Novel to Character Card - LittleWhiteBox State V2) 核心引擎
// ==========================================================================
// 两步走流水线：
//   步骤 1：原著精炼提取 + Patch-Agent 实时维护（方案B：卷/章/动态阶段 + 自定义设定类）
//   步骤 2：注入小白X 2.0 预设框架（RP通用规则 + 动态字数章节管理器脚本 + 正则）→ 入库/导出 V3 卡
// ==========================================================================

(function () {
    'use strict';

    // ==================== 1. 默认设定分类模板（支持启用/禁用/添加/编辑/删除） ====================
    const NTC_DEFAULT_LORE_CATEGORIES = [
        {
            name: '角色详情',
            enabled: true,
            isBuiltin: true,
            triggerMode: 'keyword', // keyword=绿灯 | constant=蓝灯
            position: 1, // after_char
            order: 101,
            entryExample: '角色全名',
            keywordsExample: ['全名', '名', '称呼', '绰号'],
            contentGuide:
                '深度角色档案，必须包含：**名称**:、**性别与年龄**:、**身份**:（公开身份与隐藏真相）、**核心性格**:（core_description，含说话语气/第一人称/行为逻辑）、**背景故事**:、**能力与特长**:、**外貌与服装**:（具体发色瞳色穿搭，防止AI乱编）、**人际关系**:、**行为习惯**:、**角色弧光**:、**代表台词**:'
        },
        {
            name: '角色一览',
            enabled: true,
            isBuiltin: true,
            triggerMode: 'constant',
            position: 0, // before_char
            order: 203,
            entryExample: '主要人物一览',
            keywordsExample: ['角色一览', '人物表'],
            contentGuide:
                '整部作品主要登场人物的轻量速查汇总表（单条目汇总即可，不要每人建一条），每人简明记录：**人物名**: 本质性格、核心执念/底线、外貌服装辨识点、关键能力或身份。'
        },
        {
            name: '世界观与舞台背景',
            enabled: true,
            isBuiltin: true,
            triggerMode: 'constant',
            position: 0,
            order: 202,
            entryExample: '世界观设定 / 舞台背景',
            keywordsExample: ['世界观', '背景', '舞台'],
            contentGuide:
                '作品的核心世界观与舞台规则，包含：**核心主题**:、**时代与地理舞台**:、**世界底层法则**:（魔法/科技/社会制度/硬性规则）、**主要矛盾与禁忌**:、**日常作息或运行机制**:'
        },
        {
            name: '地点与场景',
            enabled: true,
            isBuiltin: true,
            triggerMode: 'keyword',
            position: 0,
            order: 205,
            entryExample: '具体地点名称',
            keywordsExample: ['地点名', '别称'],
            contentGuide:
                '重要舞台地点的空间与功能描写，包含：**名称**:、**所属区域**:、**环境与建筑特征**:、**规则或限制**:、**重要事件**:'
        },
        {
            name: '组织与势力',
            enabled: false,
            isBuiltin: false,
            triggerMode: 'keyword',
            position: 0,
            order: 206,
            entryExample: '组织或阵营名称',
            keywordsExample: ['组织名', '简称', '阵营'],
            contentGuide:
                '组织势力的结构与立场，包含：**名称**:、**性质与理念**:、**核心成员**:、**势力范围与资源**:、**对外关系与目标**:'
        },
        {
            name: '道具与能力体系',
            enabled: false,
            isBuiltin: false,
            triggerMode: 'keyword',
            position: 0,
            order: 207,
            entryExample: '关键道具/能力名称',
            keywordsExample: ['道具名', '能力名', '专有名词'],
            contentGuide:
                '关键物品、魔法、功法或核心机制，包含：**名称**:、**分类与来源**:、**效果与原理**:、**使用限制/代价**:、**当前持有者/相关角色**:'
        },
        {
            name: '特殊规则与伏笔',
            enabled: false,
            isBuiltin: false,
            triggerMode: 'constant',
            position: 4,
            depth: 1,
            order: 12,
            entryExample: '隐藏真相/防剧透规则',
            keywordsExample: ['伏笔', '真相', '特殊规则'],
            contentGuide:
                '需要AI牢记但不可提前泄露的核心机制或作品专属演绎规则，包含：**规则目标**:、**隐藏真相/反转要点**:、**演绎禁忌**:（如在揭晓前禁止剧透）'
        }
    ];

    // ==================== 2. 步骤2 默认框架规则模板（纯小白X 2.0，无 mvu 后缀） ====================
    function getDefaultFrameworkTemplates() {
        return {
            creationGuideline: {
                enabled: true,
                name: '创作准则',
                position: 4,
                depth: 0,
                order: 700,
                content: `以下是核心创作准则，必须严格遵守：
- 高度忠实于原著的世界观基调、人物性格与语言风格，禁止 OOC（角色崩坏）或擅自引入原著不存在的超自然/奇幻设定。
- 角色的外貌、服装、配饰、随身物品与能力表现必须严格依据设定条目，禁止凭空捏造设定之外的装扮或外挂。
- 注重细腻的叙事质感：通过神态、微动作、环境氛围与符合人设的对白推动剧情，避免干瘪的总结式流水账。
- 严格区分角色认知边界：每个角色只能说出和思考自己当前已知的信息，禁止上帝视角剧透未发生的剧情或他人的隐藏秘密。`
            },
            plotProgressionRule: {
                enabled: true,
                name: '1️⃣剧情推进规则',
                position: 4,
                depth: 0,
                order: 598,
                content: `剧情篇幅与推进规则：
- 优先以 \`剧情数据.章节.当前场景\` 定位当前剧情进度，严格按照当前启用的 <剧情大纲> 序号依次推进场景（01→02→03...），禁止跳跃或回溯。
- <剧情大纲> 仅作为剧情骨架参考：必须将其充分解读并扩写为符合人物性格、细节丰满的真实交互与场景描写，严禁照抄大纲流水账。
- 注意章节与场景切换时的时间、地点与人物动线衔接，保证时空合理与人物状态（存活/在场/伤势）一致。
- 自然流畅地将 <user> 融入 <剧情大纲>，引导 <user> 参与主线事件，但严禁强行剥夺 <user> 的自由意志；若 <user> 的主动干涉改变了事件细节或人物命运，必须在符合逻辑的前提下真实演化分支并顺滑衔接后续剧情。
- 在关键抉择、对话转折或冲突节点，必须将行动权交还 <user> 并适时停笔等待输入；为避免节奏过快，单次回复最多切换 1 个新场景（除非 <user> 主动要求快进）。`
            },
            outlinePerformanceRule: {
                enabled: true,
                name: '1️⃣⚙剧情大纲演绎规则',
                position: 4,
                depth: 0,
                order: 4,
                content: `<剧情大纲演绎规则>
核心任务：<剧情大纲> 为本作主线演出的核心蓝本，需按步骤严谨演绎。

执行流程：
1. 阅读 <本章大纲总览> 确认当前章节的核心信息、阶段推进顺序与场景列表。
2. 根据 \`剧情数据.章节.当前阶段\` 阅读对应的阶段细纲条目。
3. 在当前阶段内，按场景编号顺序（01→02→03...）逐个详尽演绎每个场景的 <场景复述> 核心要素、关键互动与名台词。
4. 当前阶段的全部场景演绎完毕后，按 <本章大纲总览> 的阶段顺序切换至下一阶段；本章全部阶段演绎完毕后，推进至下一章。

硬性限制：
- 严格按顺序推进，禁止跳过或回溯已完成的阶段与场景。
- 遵守各场景标注的地点与在场角色，未在场或已退场/死亡的角色禁止凭空出现。
- 总览中的元信息、核心伏笔与后续转折仅供导演参考，在剧情到达揭示节点前严禁提前剧透。
</剧情大纲演绎规则>`
            },
            extraThinkingChecklist: {
                enabled: true,
                name: '1️⃣⚙额外思考',
                position: 4,
                depth: 0,
                order: 1,
                content: `<创作最高优先级命令>
# 在输出正文之前，务必逐项检查以下 6 条创作清单：

story_creation_checklist:
  # 1、剧情连贯性与状态一致
  continuity:
    - 回顾上文与当前变量：当前处于第几卷第几章、哪个阶段、哪个场景？哪些场景已经发生、哪些尚未发生？
    - 确认在场角色名单与存活/退场状态，已退场或不在场角色禁止突然开口。
    - 场景过渡时核对人物同一性，避免同一角色分裂或时空瞬移。

  # 2、角色塑造防 OOC
  characterization:
    - 核对 <原设角色详情> 与 <角色一览> 中的核心性格、口癖、习惯与服装细节。
    - 角色仅表达自己认知范围内的情报，绝不提前剧透大纲元信息。

  # 3、叙事节奏与主动推进
  pacing:
    - 大纲只是骨架，保持细腻画面感的同时务必让每回合都有实质性事件、对话或转场推进，拒绝流水账，也严禁在原地重复描写或反复试探水字数。
    - 若 <user> 输入“继续”、简短应答或观望不语，立刻由在场原著角色主动推动下一事件或顺滑切入下一场景，绝不陷入原地等待死循环。
    - 单次回复最多切入 1 个新场景，到达明确抉择节点再停笔等待 <user>。

  # 4、<user> 行为边界
  user_agency:
    - 严禁代替 <user> 做出思考、发言、关键决定、推理结论或主动行动。
    - <user> 的所有言行必须以玩家输入为准。

  # 5、世界观边界
  world_rule:
    - 严格遵守原著世界观与力量体系上限，禁止自行引入违和设定。

  # 6、状态同步核对
  state_sync:
    - 对照本回合正文实际发生的进度变化，精准更新章节/阶段/场景、时间地点及登场角色状态；未发生变化的字段保持不动。
</创作最高优先级命令>`
            },
            freeRoamGuideline: {
                enabled: true,
                name: '1️⃣自由演绎指引',
                position: 4,
                depth: 0,
                order: 598,
                content: `自由演绎模式指引：
- 原著主线大纲限制已完全解除，当前进入自由续写与日常探索阶段。
- 严格承接上文已经发生的剧情、结局走向与人物关系变化，一切以 <user> 亲身经历的结果为准，不强行倒回原著既定轨道。
- 完全尊重并响应 <user> 的行动意图，顺应世界观逻辑自然演化新的日常、羁绊、冲突或冒险。
- 在关键抉择或对话转折处将行动权交还 <user>；严禁代替 <user> 做出思考、发言或决定。`
            },
            freeRoamThinkingChecklist: {
                enabled: true,
                name: '1️⃣⚙额外思考（自由模式）',
                position: 4,
                depth: 0,
                order: 1,
                content: `<创作最高优先级命令>
# 在输出正文之前，务必逐项检查以下 5 条自由演绎清单：

free_roam_checklist:
  # 1、剧情连贯与状态一致
  continuity:
    - 回顾上文与当前变量（时间、地点、在场角色与好感/近况），保持时空与人物状态前后一致。
    - 已死亡或永久退场的角色禁止凭空复生或突然开口。

  # 2、角色塑造防 OOC
  characterization:
    - 核对 <原设角色详情> 与 <角色一览> 中的核心性格、口癖、习惯与外貌服装。
    - 角色仅表达自己认知范围内的情报。

  # 3、叙事节奏与自然推进
  pacing:
    - 注重细腻的神态、微动作、环境氛围与贴合人设的对白；若 <user> 简短应答或输入“继续”，由在场角色自然推动新对话或生活事件，避免原地踏步。

  # 4、<user> 行为边界
  user_agency:
    - 严禁代替 <user> 做出思考、发言、关键决定或主动行动。

  # 5、世界观与状态同步
  state_sync:
    - 严格遵守原著世界观上限；对照本回合正文实际变化，同步更新世界时间地点、角色状态与关键线索。
</创作最高优先级命令>`
            },
            userSetting: {
                enabled: true,
                name: '1️⃣User设定',
                position: 4,
                depth: 2,
                order: 25,
                roleMode: 'companion', // companion | protagonist | custom
                content: `玩家设定（<user>）：
- 身份定位：与原著核心人物一同卷入故事的同行者与关键变量。
- 融入方式：自然地存在于当前场景与主线事件中，各角色会依据自身原设性格对 <user> 产生真实反应（好奇、警惕、信任或依赖）。
- 主导权：<user> 并非旁观者，其发言、选择与干涉能够真实影响事件细节与人物关系走向。`
            }
        };
    }

    // ==================== 3. IndexedDB 持久化存储（仅用于制卡端进度/历史/配置保存） ====================
    const NovelToCardDB = {
        dbName: 'NikaNovelToCardDB',
        version: 1,
        db: null,

        async open() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, this.version);
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    this.db = req.result;
                    resolve(this.db);
                };
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('state')) {
                        db.createObjectStore('state', { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains('history')) {
                        const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
                        store.createIndex('chunkIndex', 'chunkIndex', { unique: false });
                    }
                };
            });
        },

        async putState(key, value) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['state'], 'readwrite');
                const req = tx.objectStore('state').put({ key, value, updatedAt: Date.now() });
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            });
        },

        async getState(key) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['state'], 'readonly');
                const req = tx.objectStore('state').get(key);
                req.onsuccess = () => resolve(req.result ? req.result.value : null);
                req.onerror = () => reject(req.error);
            });
        },

        async addHistory(snapshot) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['history'], 'readwrite');
                const req = tx.objectStore('history').add({
                    ...snapshot,
                    timestamp: Date.now()
                });
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        },

        async getAllHistory() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['history'], 'readonly');
                const req = tx.objectStore('history').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        },

        async clearHistory() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['history'], 'readwrite');
                const req = tx.objectStore('history').clear();
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            });
        }
    };

    // ==================== 4. 运行时状态 ====================
    const NTCState = {
        activeStep: 1, // 1=提取与维护, 2=框架注入与打包
        fileName: '',
        rawText: '',
        epubChapters: [],
        chunks: [], // { id, title, content, status: 'pending'|'processing'|'done'|'failed', error?: string }
        currentIndex: 0,
        isProcessing: false,
        isPaused: false,
        strictCategories: false,
        loreCategories: JSON.parse(JSON.stringify(NTC_DEFAULT_LORE_CATEGORIES)),
        extracted: {
            bookTitle: '',
            plot: { chapters: [] },
            lore: {} // { categoryName: { entryName: { keywords: [], content: '' } } }
        },
        framework: {
            cardName: '',
            creator: 'Nika Studio User',
            version: '1.0',
            firstMes: '',
            maxActiveChars: 12000, // 动态字数窗口预算
            varUpdateChannel: 'inline_state', // 'inline_state' | 'plugin_updater'
            includeStatusHint: true,
            includeManualButtons: true,
            userIncludeOverview: true, // 生成 User 设定时默认参考全书章节总览
            userCustomHint: '',        // 可选自定义身份偏好
            greetings: [
                {
                    id: 'g_1',
                    label: '主开场白',
                    refChapterIds: [],
                    startChapterId: '',
                    customHint: '',
                    content: ''
                }
            ],
            activeGreetingIdx: 0,
            templates: getDefaultFrameworkTemplates()
        }
    };

    // ==================== 5. 工具函数 ====================
    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function getBookBaseName() {
        if (NTCState.framework.cardName && NTCState.framework.cardName.trim()) {
            return NTCState.framework.cardName.trim();
        }
        if (NTCState.extracted.bookTitle && NTCState.extracted.bookTitle.trim()) {
            return NTCState.extracted.bookTitle.trim();
        }
        if (NTCState.fileName) {
            return NTCState.fileName.replace(/\.[^/.]+$/, '');
        }
        return '未命名小说卡';
    }

    function isContextLimitError(errMsg) {
        const s = String(errMsg || '').toLowerCase();
        return (
            s.includes('context length') ||
            s.includes('token limit') ||
            s.includes('maximum context') ||
            s.includes('too many tokens') ||
            s.includes('max_tokens') ||
            s.includes('request too large') ||
            s.includes('payload too large') ||
            s.includes('exceeds the maximum')
        );
    }

    function cleanAndParseJson(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            throw new Error('AI 返回内容为空');
        }
        let text = rawText.trim();
        // 剥离 <think>...</think> 推理块
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // 剥离 Markdown 代码块
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced && fenced[1]) {
            text = fenced[1].trim();
        }
        // 截取最外层 JSON 对象
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            text = text.slice(firstBrace, lastBrace + 1);
        }

        try {
            return JSON.parse(text);
        } catch (e1) {
            // 复用 part2.js 中的 fixJsonFormat（若存在）
            if (typeof fixJsonFormat === 'function') {
                try {
                    return JSON.parse(fixJsonFormat(text));
                } catch (e2) { /* fallthrough */ }
            }
            // 尝试补全未闭合括号（应对轻度截断）
            const repaired = tryCloseTruncatedJson(text);
            if (repaired) {
                return JSON.parse(repaired);
            }
            throw e1;
        }
    }

    function tryCloseTruncatedJson(str) {
        let s = str.trim();
        // 移除尾部悬空逗号
        s = s.replace(/,\s*$/, '');
        let inString = false;
        let escape = false;
        const stack = [];
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') stack.push('}');
            else if (ch === '[') stack.push(']');
            else if (ch === '}' || ch === ']') {
                if (stack.length && stack[stack.length - 1] === ch) stack.pop();
            }
        }
        if (inString) s += '"';
        while (stack.length) s += stack.pop();
        try {
            JSON.parse(s);
            return s;
        } catch {
            return null;
        }
    }

    // ==================== 6. 章节 YAML 渲染器（卷幕-章节-阶段-场景细纲格式） ====================
    function indentBlock(text, spaces) {
        const pad = ' '.repeat(spaces);
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map(line => pad + line)
            .join('\n');
    }

    function renderChapterOverviewContent(ch, isLastChapter = false) {
        const ov = ch.overview || {};
        const meta = ov.meta || {};
        const phases = Array.isArray(ch.phases) ? ch.phases : [];
        const phaseNames = phases.map(p => p.name).filter(Boolean);
        const phaseOrder = (Array.isArray(ov.phaseOrder) && ov.phaseOrder.length) ? ov.phaseOrder : phaseNames;

        const lines = [];
        lines.push('<本章大纲总览>');
        lines.push(`# 第${ch.act || 1}幕 第${ch.chapter || 1}章元信息${isLastChapter ? '（原著最终章）' : ''}`);
        lines.push('chapter_info:');
        lines.push(`  id: "${ch.id}"`);
        lines.push(`  title: ${JSON.stringify(ch.title || `第${ch.chapter || 1}章`)}`);
        Object.entries(meta).forEach(([k, v]) => {
            if (Array.isArray(v)) {
                lines.push(`  ${k}: ${JSON.stringify(v.join('、'))}`);
            } else if (v !== undefined && v !== null && String(v).trim() !== '') {
                lines.push(`  ${k}: ${JSON.stringify(String(v))}`);
            }
        });

        lines.push('');
        lines.push('# 本章阶段列表');
        lines.push('阶段推进:');
        lines.push(`  顺序: ${phaseOrder.length ? phaseOrder.join(' → ') : '剧情推进'}`);
        lines.push('  说明: |');
        lines.push('    1. 必须严格按上述顺序依次推进阶段');
        lines.push('    2. 完成当前阶段所有场景后，才能切换至下一阶段');
        lines.push('    3. 禁止跳过阶段、禁止回溯已完成的阶段');

        lines.push('');
        lines.push('# 各阶段场景索引');
        lines.push('阶段场景:');
        phases.forEach(ph => {
            const scList = (ph.scenes || []).map(s => s.sceneName).filter(Boolean);
            lines.push(`  ${ph.name}:`);
            lines.push(`    总数: ${scList.length}`);
            lines.push(`    顺序: ${scList.length ? scList.join(' → ') : '按细纲顺序演绎'}`);
        });

        if (ov.summary) {
            lines.push('');
            lines.push('大纲梗概: |');
            lines.push(indentBlock(ov.summary, 2));
        }

        let transitionText = ov.transitionCondition || '';
        if (isLastChapter && (!transitionText || /进入下一章|切换至下一章/.test(transitionText))) {
            transitionText = '完成本最终章所有阶段、原著主线正式收束后，将 剧情数据.章节.启用 设为 false，系统将自动卸载大纲限制并切入自由续写模式';
        }
        if (transitionText) {
            lines.push('');
            lines.push('章节过渡条件: |');
            lines.push(indentBlock(transitionText, 2));
        }

        lines.push('</本章大纲总览>');
        return lines.join('\n');
    }

    function renderChapterPhaseContent(ch, phase, phaseIdx, isLastChapter = false) {
        const phases = Array.isArray(ch.phases) ? ch.phases : [];
        const nextPhase = phases[phaseIdx + 1];
        const scenes = Array.isArray(phase.scenes) ? phase.scenes : [];
        const sceneNames = scenes.map(s => s.sceneName).filter(Boolean);

        const lines = [];
        lines.push(`${phase.name}:`);
        lines.push(`  所属章节: "${ch.id} ${ch.title || ''}"`);
        lines.push('  阶段说明: |');
        if (phase.summary) {
            lines.push(indentBlock(phase.summary, 4));
            lines.push('');
        }
        lines.push('    【场景列表】');
        lines.push(`    ${sceneNames.length ? sceneNames.join(' → ') : '按顺序演绎'}`);
        lines.push('');
        lines.push('    【阶段切换】');
        if (nextPhase) {
            lines.push(`    本阶段全部场景演绎完毕 → 结束【${phase.name}】阶段 → 进入【${nextPhase.name}】阶段`);
        } else if (isLastChapter) {
            lines.push(`    本阶段为原著最终结局。当本阶段全部场景演绎完毕、原著主线正式收束后，请将 剧情数据.章节.启用 设为 false，系统将自动卸载所有大纲与主线规则限制，无缝切入自由续写模式`);
        } else {
            lines.push(`    本阶段全部场景演绎完毕 → 结束本章（${ch.id}）→ 进入下一章节`);
        }

        lines.push('');
        lines.push('  剧情:');
        scenes.forEach((sc, idx) => {
            const sName = sc.sceneName || `${String(idx + 1).padStart(2, '0')}-场景${idx + 1}`;
            lines.push(`    - 场景名: ${JSON.stringify(sName)}`);
            if (sc.location) lines.push(`      地点: ${JSON.stringify(sc.location)}`);
            if (Array.isArray(sc.characters) && sc.characters.length) {
                lines.push('      在场角色:');
                sc.characters.forEach(c => {
                    lines.push(`        - ${JSON.stringify(String(c))}`);
                });
            }
            lines.push('      场景复述: |');
            lines.push(indentBlock(sc.recap || '', 8));
            lines.push('');
        });

        return lines.join('\n').trim();
    }

    // ==================== 7. Patch-Agent 提示词构建与补丁应用 ====================
    function getEnabledLoreCategories() {
        return NTCState.loreCategories.filter(c => c.enabled);
    }

    function buildLoreCategoriesSpecText(enabledCats) {
        if (!enabledCats.length) {
            return '（当前未启用额外设定分类，本次只需专注提取和更新剧情章节。）';
        }
        return enabledCats
            .map((cat, idx) => {
                return `#### ${idx + 1}. 【${cat.name}】
- 条目命名规范：如“${cat.entryExample}”
- 关键词建议：[${(cat.keywordsExample || []).join(', ')}]
- 内容提取规范（必须使用 Markdown 双星号标题 \`**字段名**:\` 分段）：${cat.contentGuide}`;
            })
            .join('\n\n');
    }

    function buildPlotIndexForPrompt() {
        const chapters = NTCState.extracted.plot.chapters || [];
        if (!chapters.length) return '（尚无已提取章节）';
        return chapters
            .map(ch => {
                const phSummary = (ch.phases || [])
                    .map(p => {
                        const scs = (p.scenes || []).map(s => s.sceneName);
                        return `阶段[${p.name}](${scs.length}场景: ${scs.slice(-3).join(' → ') || '空'})`;
                    })
                    .join(' | ');
                return `- ${ch.id} 《${ch.title || '未命名'}》: ${phSummary || '无阶段'} | 梗概前80字: ${(ch.overview?.summary || '').slice(0, 80)}`;
            })
            .join('\n');
    }

    function buildLoreCompactForPrompt() {
        const lore = NTCState.extracted.lore || {};
        const out = {};
        Object.entries(lore).forEach(([cat, entries]) => {
            out[cat] = {};
            Object.entries(entries || {}).forEach(([name, item]) => {
                out[cat][name] = {
                    keywords: item.keywords || [],
                    content: item.content || ''
                };
            });
        });
        const str = JSON.stringify(out, null, 2);
        // 百万上下文模型不截断；仅极端超长(>50万字)时做保护
        if (str.length > 500000) {
            const slim = {};
            Object.entries(lore).forEach(([cat, entries]) => {
                slim[cat] = {};
                Object.entries(entries || {}).forEach(([name, item]) => {
                    const content = String(item.content || '');
                    slim[cat][name] = {
                        keywords: item.keywords || [],
                        content: content.length > 4000 ? content.slice(0, 4000) + '\n...(前文已保留，可继续用 append_lore_field 追加)' : content
                    };
                });
            });
            return JSON.stringify(slim, null, 2);
        }
        return str;
    }

    function buildInitialExtractionPrompt(chunk) {
        const langPrefix = typeof getLanguagePrefix === 'function' ? getLanguagePrefix() : '【重要】请用中文回答。\n\n';
        const enabledCats = getEnabledLoreCategories();
        const catNames = enabledCats.map(c => c.name);
        const catRule = NTCState.strictCategories
            ? `⚠️ 【严格分类约束】：lore 字段中仅允许出现以下分类名：[${catNames.join('、')}]，严禁自创其他分类！`
            : `🏷️ 【分类规则】：优先按上述启用分类提取 lore，也可根据小说题材补充贴切分类。`;

        const loreCategoriesSpec = buildLoreCategoriesSpecText(enabledCats);
        if (typeof PromptManager !== 'undefined') {
            return langPrefix + PromptManager.render('ntc_initial_extract', {
                loreCategoriesSpec,
                catRule,
                chunkTitle: chunk.title || '',
                chunkContent: chunk.content || ''
            });
        }
        return `${langPrefix}你是顶尖的“小说转 SillyTavern 高还原剧情游戏卡”架构师，正在处理原著的【第 1 块内容（开篇）】。
你的目标是把原著精细化转化为**严格符合下方四层结构（卷幕 → 章节 → 动态阶段 → 场景细纲）的标准 JSON 数据**，让后续在 SillyTavern 中能够像游玩互动视觉小说/剧本一样完整还原原著剧情、场景细节与人物神韵。

========================================
【一、剧情章节提取规范（★ 必选、最高优先级 ★）】
========================================
1. 采用**卷幕 → 章节 → 动态阶段 → 场景细纲**四层结构：
   - 章节编号格式：\`A{卷幕号}_C{章号}\`（开篇为 \`A1_C1\`；若本块跨越原著多个章节，可在 chapters 数组中依次列出 \`A1_C1\`, \`A1_C2\`...）。
   - **动态阶段（phases）**：根据本章剧情节奏，由你灵活划分 1~4 个贴合原文的阶段名称（如“日常铺垫”“风波初起”“冲突爆发”“真相揭晓”“尾声转折”等，完全切合本作品题材即可，不必生搬硬套）。
   - **场景（scenes）**：每个阶段下按时间顺序拆分为若干细粒度场景，\`sceneName\` 必须带两位递增编号（如 \`01-初遇与对话\`、\`02-冲突与转折\`）。⚠️ **避免把纯静态背景介绍或抽象心理旁白单独拆成无地点、无互动的 \`01\` 场景**——此类背景旁白应融入 \`overview.summary\` 或合并进首个包含真实时间、地点与人物行动的事件场景中。
   - **过滤非正篇杂质**：严禁把作者后记、创作感言、致谢、版权页、出版商或作者本人作为正式剧情章节或角色详情提取。
   - **场景复述（recap）**：**必须详尽还原！** 完整保留原著的事件经过、动作细节、心理转折、伏笔线索，并**原汁原味摘录关键名台词**（用双引号括出），严禁写成一两句话的敷衍概括！
   - **总览（overview）**：包含 \`meta\`（核心事件/主要矛盾/核心伏笔等键值对）、\`phaseOrder\`（阶段推进顺序数组）、\`summary\`（本章完整梗概）、\`transitionCondition\`（本章结束过渡到下一章的条件）。

========================================
【二、设定世界书提取规范（lore）】
========================================
${buildLoreCategoriesSpecText(enabledCats)}

${catRule}

⚠️ **格式硬性规定**：
- lore 中每个条目的 \`content\` 必须严格使用 Markdown 双星号标题（\`**字段名**:\`）分段，便于后续 Patch-Agent 精准局部追加而不覆写失忆。
- 严禁凭空编造原文未出现的人物或剧情。

========================================
【三、输出标准 JSON 结构（严禁输出 Markdown 代码块标记或多余解释）】
========================================
{
  "bookTitle": "根据原文识别的作品名称（若无法识别可留空）",
  "chapters": [
    {
      "id": "A1_C1",
      "act": 1,
      "chapter": 1,
      "title": "第一章标题",
      "overview": {
        "meta": {
          "核心事件": "...",
          "主要矛盾": "...",
          "核心伏笔": "..."
        },
        "phaseOrder": ["阶段1名称", "阶段2名称"],
        "summary": "本章完整剧情梗概...",
        "transitionCondition": "完成本章节所有阶段后切换至下一章"
      },
      "phases": [
        {
          "name": "阶段1名称",
          "summary": "本阶段概述...",
          "scenes": [
            {
              "sceneName": "01-场景标题",
              "location": "具体地点",
              "characters": ["角色A", "角色B"],
              "recap": "详尽的场景复述与关键原著台词..."
            }
          ]
        }
      ]
    }
  ],
  "lore": {
    "角色详情": {
      "角色全名": {
        "keywords": ["全名", "别名"],
        "content": "**名称**: 角色全名\\n**核心性格**: ...\\n**外貌与服装**: ..."
      }
    }
  }
}

【本次阅读的原著开篇内容（${chunk.title}）】：
---
${chunk.content}
---

请直接输出严格合法的 JSON 对象：`;
    }

    function buildPatchAgentPrompt(chunk, chunkIndex, lastEnding) {
        const langPrefix = typeof getLanguagePrefix === 'function' ? getLanguagePrefix() : '【重要】请用中文回答。\n\n';
        const enabledCats = getEnabledLoreCategories();
        const catNames = enabledCats.map(c => c.name);
        const catRule = NTCState.strictCategories
            ? `⚠️ 【严格分类约束】：所有设定类 action 的 category 必须限定在 [${catNames.join('、')}] 内！`
            : `🏷️ 【分类规则】：沿用已有分类或按需提炼贴切设定分类。`;

        if (typeof PromptManager !== 'undefined') {
            return langPrefix + PromptManager.render('ntc_patch_agent', {
                chunkNumber: String(chunkIndex + 1),
                chunkTitle: chunk.title || '',
                catRule,
                loreCategoriesSpec: buildLoreCategoriesSpecText(enabledCats),
                lastEnding: lastEnding || '（无）',
                plotIndex: buildPlotIndexForPrompt(),
                loreCompact: buildLoreCompactForPrompt(),
                chunkContent: chunk.content || ''
            });
        }
        return `${langPrefix}你是专业的小说转卡 **Patch-Agent 实时增量维护专家**，正在处理原著第 ${chunkIndex + 1} 块内容（${chunk.title}）。
请仔细阅读新文本，向系统发出**精准、非覆盖式的增量补丁指令集（actions）**！

========================================
【核心铁律】
========================================
1. ★ **每次 Chunk 必须更新剧情（强制）** ★：
   - 你的 \`actions\` 数组中**必须包含至少一条剧情类指令**（\`add_chapter\` / \`add_phase\` / \`append_scene\` / \`update_chapter_overview\`）！
   - 判断衔接关系：
     * 如果本块内容是**上一章的延续**（例如一章被切成了多块，或仍属于同一章剧情），请对已有章节使用 \`append_scene\`（向当前阶段追加新场景，编号紧接上一场景递增）或 \`add_phase\`（开启本章新的动态阶段），并用 \`update_chapter_overview\` 补充更新本章总览梗概与阶段顺序。
     * 如果本块内容**进入了原著的新章节/新卷幕**，请使用 \`add_chapter\` 创建新章（编号顺延，如 \`A1_C2\` 或进入新卷 \`A2_C1\`），并在其中给出完整的 \`overview\` 和动态 \`phases\` + 详尽 \`scenes\`。
     * 若单块内跨越多个原著章节，可连续发出多条 \`add_chapter\` 指令。
   - **场景复述（recap）与原话保留（硬性要求）**：每个场景的 \`recap\` 必须详尽还原剧情细节、核心情绪转折与伏笔，绝不简略敷衍；**凡包含人物对话的场景，必须保留原著关键原话**（用「」或双引号原样摘录标志性口癖、质问/威胁/反驳/转折名台词及重要路人反应，严禁全部压缩为第三人称转述）
   - ⚠️ **过滤非正篇杂质**：若本块内容仅为作者后记、创作感言、致谢、版权/出版信息等非故事正文，**不要**将其建为正式剧情章或将作者本人提取为角色，直接输出 \`{"actions": []}\` 即可。
2. **设定世界书严禁覆写失忆**：
   - 已有设定条目是前文积累的历史全貌，绝对禁止整篇覆盖重写！
   - 追加角色新经历/新能力/新关系变化：使用 \`append_lore_field\`（在对应 \`**字段名**:\` 后追加）。
   - 具体事实状态变迁（如换装、位置改变、真相揭露）：使用 \`replace_lore_text\` 局部替换。
   - 仅当本块新登场前文未记录的新实体时，使用 \`add_lore\`（内容必须严格使用 \`**字段名**:\` 分段）。
   - 出现新称呼/别名时，使用 \`add_lore_keywords\`。
   - ${catRule}

========================================
【已启用设定分类规范参考】
========================================
${buildLoreCategoriesSpecText(enabledCats)}

========================================
【当前上下文】
========================================
【1. 上一块结尾片段（衔接用）】：
---
${lastEnding || '（无）'}
---

【2. 当前已提取的剧情章节索引（实时目录）】：
${buildPlotIndexForPrompt()}

【3. 当前已有的设定世界书（严禁覆写抹除）】：
${buildLoreCompactForPrompt()}

【4. 本次阅读的新原著内容（${chunk.title}）】：
---
${chunk.content}
---

========================================
【输出 Patch Actions JSON 格式规范（严禁代码块标记或多余文字）】
========================================
{
  "actions": [
    {
      "type": "append_scene",
      "chapterId": "A1_C1",
      "phaseName": "当前阶段名",
      "scene": {
        "sceneName": "04-新场景名",
        "location": "地点",
        "characters": ["角色A"],
        "recap": "详尽的场景复述与关键对话..."
      }
    },
    {
      "type": "add_phase",
      "chapterId": "A1_C1",
      "phase": {
        "name": "冲突爆发",
        "summary": "本阶段概述...",
        "scenes": [
          { "sceneName": "01-冲突起点", "location": "地点", "characters": ["角色A"], "recap": "详尽复述..." }
        ]
      }
    },
    {
      "type": "update_chapter_overview",
      "chapterId": "A1_C1",
      "appendSummary": "本块新增剧情的梗概补充...",
      "metaPatch": { "新伏笔": "..." },
      "transitionCondition": "更新后的过渡条件（可选）"
    },
    {
      "type": "add_chapter",
      "chapter": {
        "id": "A1_C2",
        "act": 1,
        "chapter": 2,
        "title": "第二章标题",
        "overview": {
          "meta": { "核心事件": "...", "主要矛盾": "..." },
          "phaseOrder": ["阶段1", "阶段2"],
          "summary": "本章梗概...",
          "transitionCondition": "过渡条件..."
        },
        "phases": [
          {
            "name": "阶段1",
            "summary": "阶段概述...",
            "scenes": [
              { "sceneName": "01-开场", "location": "地点", "characters": ["角色A"], "recap": "详尽复述..." }
            ]
          }
        ]
      }
    },
    {
      "type": "append_lore_field",
      "category": "角色详情",
      "entryName": "角色全名",
      "fieldName": "重要事件",
      "text": "本章发生的新经历..."
    },
    {
      "type": "replace_lore_text",
      "category": "角色详情",
      "entryName": "角色全名",
      "fieldName": "外貌与服装",
      "searchText": "旧描述",
      "replaceText": "新描述"
    },
    {
      "type": "add_lore",
      "category": "角色详情",
      "entryName": "新角色名",
      "keywords": ["新角色名", "别名"],
      "content": "**名称**: 新角色名\\n**核心性格**: ..."
    },
    {
      "type": "add_lore_keywords",
      "category": "角色详情",
      "entryName": "角色全名",
      "keywords": ["新绰号"]
    }
  ]
}

请直接输出包含 "actions" 数组的合法 JSON：`;
    }

    // 别名/模糊查找设定条目名
    function findLoreEntryKey(catObj, entryName) {
        if (!catObj || !entryName) return null;
        if (catObj[entryName]) return entryName;
        const clean = s => String(s).replace(/[\(（][^)）]*[\)）]/g, '').trim().toLowerCase();
        const target = clean(entryName);
        for (const key of Object.keys(catObj)) {
            if (clean(key) === target) return key;
            const kws = catObj[key]?.keywords || [];
            if (kws.some(k => clean(k) === target)) return key;
        }
        return null;
    }

    function normalizeChapterObj(raw, fallbackIndex) {
        const act = Number(raw.act) || 1;
        const chapter = Number(raw.chapter) || fallbackIndex;
        const id = raw.id || `A${act}_C${chapter}`;
        const phases = Array.isArray(raw.phases)
            ? raw.phases.map((p, idx) => ({
                name: String(p.name || `阶段${idx + 1}`).trim(),
                summary: String(p.summary || '').trim(),
                scenes: Array.isArray(p.scenes)
                    ? p.scenes.map((sc, sIdx) => ({
                        sceneName: String(sc.sceneName || sc.name || `${String(sIdx + 1).padStart(2, '0')}-场景${sIdx + 1}`).trim(),
                        location: String(sc.location || '').trim(),
                        characters: Array.isArray(sc.characters) ? sc.characters.map(String) : [],
                        recap: String(sc.recap || sc.content || '').trim()
                    }))
                    : []
            }))
            : [];
        const ov = raw.overview || {};
        return {
            id,
            act,
            chapter,
            title: String(raw.title || `第${chapter}章`).trim(),
            overview: {
                meta: (ov.meta && typeof ov.meta === 'object') ? ov.meta : {},
                phaseOrder: Array.isArray(ov.phaseOrder) && ov.phaseOrder.length
                    ? ov.phaseOrder.map(String)
                    : phases.map(p => p.name),
                summary: String(ov.summary || '').trim(),
                transitionCondition: String(ov.transitionCondition || '本章节全部阶段演绎完毕后进入下一章').trim()
            },
            phases
        };
    }

    function applyInitialExtractionResult(parsed) {
        if (parsed.bookTitle && !NTCState.extracted.bookTitle) {
            NTCState.extracted.bookTitle = String(parsed.bookTitle).trim();
        }
        const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : (parsed.plot?.chapters || []);
        chapters.forEach((rawCh, idx) => {
            const norm = normalizeChapterObj(rawCh, NTCState.extracted.plot.chapters.length + 1 + idx);
            const exists = NTCState.extracted.plot.chapters.find(c => c.id === norm.id);
            if (!exists) {
                NTCState.extracted.plot.chapters.push(norm);
            }
        });

        const allowedCats = NTCState.strictCategories ? new Set(getEnabledLoreCategories().map(c => c.name)) : null;
        const loreSrc = parsed.lore || {};
        Object.entries(loreSrc).forEach(([cat, entries]) => {
            if (allowedCats && !allowedCats.has(cat)) return;
            if (!entries || typeof entries !== 'object') return;
            if (!NTCState.extracted.lore[cat]) NTCState.extracted.lore[cat] = {};
            Object.entries(entries).forEach(([entryName, val]) => {
                if (!val || typeof val !== 'object') return;
                const kws = Array.isArray(val.keywords) ? val.keywords : (Array.isArray(val['关键词']) ? val['关键词'] : [entryName]);
                const content = String(val.content ?? val['内容'] ?? '');
                NTCState.extracted.lore[cat][entryName] = {
                    keywords: Array.from(new Set(kws.map(String).filter(Boolean))),
                    content
                };
            });
        });
    }

    function applyPatchActions(parsed) {
        const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        // 容错：若 AI 偶发直接返回 { chapters, lore }，自动走初始化安全合并
        if (!actions.length && (parsed.chapters || parsed.lore)) {
            applyInitialExtractionResult(parsed);
            return { plotUpdated: Boolean(parsed.chapters?.length), count: 1 };
        }

        const allowedCats = NTCState.strictCategories ? new Set(getEnabledLoreCategories().map(c => c.name)) : null;
        let plotUpdated = false;
        let appliedCount = 0;

        for (const act of actions) {
            if (!act || !act.type) continue;
            const type = act.type;

            // --- 剧情类 Patch ---
            if (type === 'add_chapter' && act.chapter) {
                const norm = normalizeChapterObj(act.chapter, NTCState.extracted.plot.chapters.length + 1);
                const existing = NTCState.extracted.plot.chapters.find(c => c.id === norm.id);
                if (existing) {
                    // 若同 ID 已存在，安全合并阶段与场景，绝不覆写丢失
                    norm.phases.forEach(np => {
                        const ep = existing.phases.find(p => p.name === np.name);
                        if (ep) {
                            np.scenes.forEach(ns => {
                                if (!ep.scenes.some(s => s.sceneName === ns.sceneName)) ep.scenes.push(ns);
                            });
                        } else {
                            existing.phases.push(np);
                            if (!existing.overview.phaseOrder.includes(np.name)) {
                                existing.overview.phaseOrder.push(np.name);
                            }
                        }
                    });
                    if (norm.overview.summary && !existing.overview.summary.includes(norm.overview.summary)) {
                        existing.overview.summary = (existing.overview.summary ? existing.overview.summary + '\n' : '') + norm.overview.summary;
                    }
                } else {
                    NTCState.extracted.plot.chapters.push(norm);
                }
                plotUpdated = true;
                appliedCount++;
                continue;
            }

            if (type === 'add_phase' && act.phase) {
                let targetCh = NTCState.extracted.plot.chapters.find(c => c.id === act.chapterId)
                    || NTCState.extracted.plot.chapters[NTCState.extracted.plot.chapters.length - 1];
                if (!targetCh) {
                    targetCh = normalizeChapterObj({ id: act.chapterId || 'A1_C1', act: 1, chapter: 1, title: '第1章' }, 1);
                    NTCState.extracted.plot.chapters.push(targetCh);
                }
                const np = {
                    name: String(act.phase.name || `阶段${targetCh.phases.length + 1}`).trim(),
                    summary: String(act.phase.summary || '').trim(),
                    scenes: Array.isArray(act.phase.scenes)
                        ? act.phase.scenes.map((sc, i) => ({
                            sceneName: String(sc.sceneName || `${String(i + 1).padStart(2, '0')}-场景${i + 1}`).trim(),
                            location: String(sc.location || '').trim(),
                            characters: Array.isArray(sc.characters) ? sc.characters.map(String) : [],
                            recap: String(sc.recap || '').trim()
                        }))
                        : []
                };
                const existingPh = targetCh.phases.find(p => p.name === np.name);
                if (existingPh) {
                    np.scenes.forEach(s => existingPh.scenes.push(s));
                    if (np.summary && !existingPh.summary.includes(np.summary)) {
                        existingPh.summary = (existingPh.summary ? existingPh.summary + '\n' : '') + np.summary;
                    }
                } else {
                    targetCh.phases.push(np);
                    if (!targetCh.overview.phaseOrder.includes(np.name)) {
                        targetCh.overview.phaseOrder.push(np.name);
                    }
                }
                plotUpdated = true;
                appliedCount++;
                continue;
            }

            if (type === 'append_scene' && act.scene) {
                let targetCh = NTCState.extracted.plot.chapters.find(c => c.id === act.chapterId)
                    || NTCState.extracted.plot.chapters[NTCState.extracted.plot.chapters.length - 1];
                if (!targetCh) {
                    targetCh = normalizeChapterObj({ id: act.chapterId || 'A1_C1', act: 1, chapter: 1, title: '第1章' }, 1);
                    NTCState.extracted.plot.chapters.push(targetCh);
                }
                let targetPh = targetCh.phases.find(p => p.name === act.phaseName)
                    || targetCh.phases[targetCh.phases.length - 1];
                if (!targetPh) {
                    targetPh = { name: act.phaseName || '剧情推进', summary: '', scenes: [] };
                    targetCh.phases.push(targetPh);
                    if (!targetCh.overview.phaseOrder.includes(targetPh.name)) {
                        targetCh.overview.phaseOrder.push(targetPh.name);
                    }
                }
                const nextNum = String(targetPh.scenes.length + 1).padStart(2, '0');
                let sName = String(act.scene.sceneName || `${nextNum}-新场景`).trim();
                if (!/^\d{2}-/.test(sName)) sName = `${nextNum}-${sName}`;
                targetPh.scenes.push({
                    sceneName: sName,
                    location: String(act.scene.location || '').trim(),
                    characters: Array.isArray(act.scene.characters) ? act.scene.characters.map(String) : [],
                    recap: String(act.scene.recap || act.scene.content || '').trim()
                });
                plotUpdated = true;
                appliedCount++;
                continue;
            }

            if (type === 'update_scene' && act.sceneName) {
                const targetCh = NTCState.extracted.plot.chapters.find(c => c.id === act.chapterId)
                    || NTCState.extracted.plot.chapters[NTCState.extracted.plot.chapters.length - 1];
                if (targetCh) {
                    for (const ph of targetCh.phases) {
                        const sc = ph.scenes.find(s => s.sceneName === act.sceneName);
                        if (sc) {
                            if (act.appendRecap) sc.recap = (sc.recap ? sc.recap + '\n' : '') + String(act.appendRecap);
                            if (Array.isArray(act.addCharacters)) {
                                sc.characters = Array.from(new Set([...sc.characters, ...act.addCharacters.map(String)]));
                            }
                            plotUpdated = true;
                            appliedCount++;
                            break;
                        }
                    }
                }
                continue;
            }

            if (type === 'update_chapter_overview') {
                const targetCh = NTCState.extracted.plot.chapters.find(c => c.id === act.chapterId)
                    || NTCState.extracted.plot.chapters[NTCState.extracted.plot.chapters.length - 1];
                if (targetCh) {
                    if (act.title) targetCh.title = String(act.title).trim();
                    if (act.appendSummary) {
                        targetCh.overview.summary = (targetCh.overview.summary ? targetCh.overview.summary + '\n' : '') + String(act.appendSummary).trim();
                    }
                    if (act.metaPatch && typeof act.metaPatch === 'object') {
                        Object.assign(targetCh.overview.meta, act.metaPatch);
                    }
                    if (act.transitionCondition) {
                        targetCh.overview.transitionCondition = String(act.transitionCondition).trim();
                    }
                    if (Array.isArray(act.phaseOrder) && act.phaseOrder.length) {
                        targetCh.overview.phaseOrder = act.phaseOrder.map(String);
                    }
                    plotUpdated = true;
                    appliedCount++;
                }
                continue;
            }

            // --- 设定世界书类 Patch ---
            const cat = act.category;
            if (!cat) continue;
            if (allowedCats && !allowedCats.has(cat)) continue;
            if (!NTCState.extracted.lore[cat]) NTCState.extracted.lore[cat] = {};
            const catObj = NTCState.extracted.lore[cat];

            if (type === 'add_lore' || type === 'add_entry') {
                const name = String(act.entryName || '').trim();
                if (!name) continue;
                const existingKey = findLoreEntryKey(catObj, name);
                const kws = Array.isArray(act.keywords) ? act.keywords.map(String) : [name];
                const content = String(act.content || '');
                if (existingKey) {
                    // 安全追加不覆写
                    catObj[existingKey].keywords = Array.from(new Set([...(catObj[existingKey].keywords || []), ...kws]));
                    if (content && !catObj[existingKey].content.includes(content.slice(0, 40))) {
                        catObj[existingKey].content += '\n' + content;
                    }
                } else {
                    catObj[name] = { keywords: Array.from(new Set(kws.filter(Boolean))), content };
                }
                appliedCount++;
            } else if (type === 'append_lore_field' || type === 'append_field') {
                const key = findLoreEntryKey(catObj, act.entryName);
                const fieldName = String(act.fieldName || '补充').trim();
                const text = String(act.text || '').trim();
                if (!text) continue;
                if (!key) {
                    catObj[act.entryName] = {
                        keywords: [act.entryName],
                        content: `**${fieldName}**: ${text}`
                    };
                } else {
                    const content = catObj[key].content || '';
                    const fieldRe = new RegExp(`(\\*\\*${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*[:：][^\\n]*)`);
                    if (fieldRe.test(content)) {
                        catObj[key].content = content.replace(fieldRe, `$1；${text}`);
                    } else {
                        catObj[key].content = (content ? content + '\n' : '') + `**${fieldName}**: ${text}`;
                    }
                }
                appliedCount++;
            } else if (type === 'replace_lore_text' || type === 'replace') {
                const key = findLoreEntryKey(catObj, act.entryName);
                if (key && act.searchText) {
                    const oldContent = catObj[key].content || '';
                    if (oldContent.includes(act.searchText)) {
                        catObj[key].content = oldContent.replace(act.searchText, String(act.replaceText ?? ''));
                    } else if (act.fieldName && act.replaceText) {
                        catObj[key].content = oldContent + `\n**${act.fieldName}更新**: ${act.replaceText}`;
                    }
                    appliedCount++;
                }
            } else if (type === 'add_lore_keywords' || type === 'add_keywords') {
                const key = findLoreEntryKey(catObj, act.entryName);
                if (key && Array.isArray(act.keywords)) {
                    catObj[key].keywords = Array.from(new Set([...(catObj[key].keywords || []), ...act.keywords.map(String).filter(Boolean)]));
                    appliedCount++;
                }
            } else if (type === 'delete_lore_field' || type === 'delete_field') {
                const key = findLoreEntryKey(catObj, act.entryName);
                if (key && act.fieldName) {
                    const fieldRe = new RegExp(`^\\*\\*${String(act.fieldName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*[:：][^\\n]*\\n?`, 'gm');
                    catObj[key].content = (catObj[key].content || '').replace(fieldRe, '').trim();
                    appliedCount++;
                }
            }
        }

        return { plotUpdated, count: appliedCount };
    }

    // ==================== 8. 步骤2：小白X 2.0 角色卡框架组装引擎 ====================
    function buildChapterManifest() {
        const chapters = NTCState.extracted.plot.chapters || [];
        return chapters.map((ch, idx) => {
            const isLastChapter = idx === chapters.length - 1;
            const ovContent = renderChapterOverviewContent(ch, isLastChapter);
            const phases = (ch.phases || []).map((ph, pIdx) => {
                const phContent = renderChapterPhaseContent(ch, ph, pIdx, isLastChapter);
                const firstScene = ph.scenes && ph.scenes[0] ? ph.scenes[0].sceneName : '01-开场';
                return {
                    name: ph.name,
                    entry: `${ch.id}_${ph.name}`,
                    chars: phContent.length,
                    firstScene,
                    content: phContent
                };
            });
            return {
                index: idx,
                id: ch.id,
                act: ch.act || 1,
                chapter: ch.chapter || (idx + 1),
                title: ch.title || `第${idx + 1}章`,
                overviewEntry: `${ch.id}_总览`,
                overviewChars: ovContent.length,
                overviewContent: ovContent,
                phases
            };
        });
    }

    // 计算某状态下的初始激活条目（与运行期动态字数窗口算法完全一致）
    function computeActivePlotEntries(manifest, act, chapter, phaseName, maxChars) {
        const active = new Set();
        if (!manifest.length) return active;

        let curIdx = manifest.findIndex(c => c.act === act && c.chapter === chapter);
        if (curIdx === -1) curIdx = 0;
        const cur = manifest[curIdx];
        const phases = cur.phases || [];
        let phIdx = phases.findIndex(p => p.name === phaseName);
        if (phIdx === -1) phIdx = 0;

        let usedChars = 0;
        // 1. 必开：当前章总览 + 当前阶段
        active.add(cur.overviewEntry);
        usedChars += cur.overviewChars || 0;
        if (phases[phIdx]) {
            active.add(phases[phIdx].entry);
            usedChars += phases[phIdx].chars || 0;
        }

        const budget = Math.max(2000, Number(maxChars) || 12000);
        // 2. 按字数预算自动顺延开启本章后续阶段
        for (let i = phIdx + 1; i < phases.length; i++) {
            if (usedChars + phases[i].chars <= budget) {
                active.add(phases[i].entry);
                usedChars += phases[i].chars;
            } else {
                break;
            }
        }
        // 3. 若本章已全部开启且仍低于预算 80%，预载下一章总览（及预算内首阶段），解决短章切换生硬问题
        const next = manifest[curIdx + 1];
        if (next && usedChars < budget * 0.8) {
            if (usedChars + next.overviewChars <= budget) {
                active.add(next.overviewEntry);
                usedChars += next.overviewChars;
                if (next.phases[0] && usedChars + next.phases[0].chars <= budget) {
                    active.add(next.phases[0].entry);
                    usedChars += next.phases[0].chars;
                }
            }
        }
        return active;
    }

    // 辅助：确保多开场白状态结构完整（向后兼容旧版 firstMes 存档）
    function ensureGreetingsState() {
        const fw = NTCState.framework;
        const chapters = NTCState.extracted.plot.chapters || [];
        const defaultChId = chapters[0]?.id || '';
        if (!Array.isArray(fw.greetings) || fw.greetings.length === 0) {
            fw.greetings = [{
                id: 'g_1',
                label: '主开场白',
                refChapterIds: defaultChId ? [defaultChId] : [],
                startChapterId: defaultChId,
                customHint: '',
                content: fw.firstMes || ''
            }];
        } else {
            fw.greetings.forEach((g, idx) => {
                if (!g.id) g.id = 'g_' + (idx + 1);
                if (!g.label) g.label = idx === 0 ? '主开场白' : `备选开场 #${idx + 1}`;
                if (!Array.isArray(g.refChapterIds)) g.refChapterIds = defaultChId ? [defaultChId] : [];
                if (g.refChapterIds.length === 0 && defaultChId) g.refChapterIds = [defaultChId];
                if (!g.startChapterId && defaultChId) g.startChapterId = g.refChapterIds[0] || defaultChId;
                if (g.customHint === undefined) g.customHint = '';
                if (g.content === undefined) g.content = '';
            });
        }
        if (fw.activeGreetingIdx === undefined || fw.activeGreetingIdx < 0 || fw.activeGreetingIdx >= fw.greetings.length) {
            fw.activeGreetingIdx = 0;
        }
        return fw.greetings;
    }

    function buildSingleInitStateText(manifest, chapterId) {
        const fallbackCh = manifest[0] || {
            id: 'A1_C1', act: 1, chapter: 1, title: '第一章',
            overviewEntry: 'A1_C1_总览', overviewChars: 500,
            phases: [{ name: '剧情推进', entry: 'A1_C1_剧情推进', chars: 1000, firstScene: '01-开场' }]
        };
        const targetCh = (chapterId ? manifest.find(c => c.id === chapterId) : null) || fallbackCh;
        const targetPh = targetCh.phases?.[0] || { name: '剧情推进', firstScene: '01-开场' };
        const rawCh = (NTCState.extracted.plot.chapters || []).find(c => c.id === targetCh.id)
            || NTCState.extracted.plot.chapters[0];
        const initLocation = rawCh?.phases?.[0]?.scenes?.[0]?.location || '初始场景';

        const stateSchemaAndInit = [
            '$schema 剧情数据',
            '  章节:',
            '    启用: true',
            '    卷幕: 0',
            '    章号: 0',
            '    阶段: ""',
            '    当前场景: ""',
            '  世界:',
            '    天数: 0',
            '    时间: ""',
            '    时段: ""',
            '    地点: ""',
            '    氛围: ""',
            '  角色状态:',
            '    "*":',
            '      状态: ""',
            '      位置: ""',
            '      好感: 0',
            '      备注: ""',
            '  关键线索: []',
            '',
            '$range=[-100,100] 剧情数据.角色状态.*.好感',
            '$step=20 剧情数据.角色状态.*.好感',
            '',
            '剧情数据:',
            '  章节:',
            '    启用: true',
            `    卷幕: ${targetCh.act}`,
            `    章号: ${targetCh.chapter}`,
            `    阶段: ${JSON.stringify(targetPh.name)}`,
            `    当前场景: ${JSON.stringify(targetPh.firstScene)}`,
            '  世界:',
            '    天数: 1',
            '    时间: "08:00"',
            '    时段: "上午"',
            `    地点: ${JSON.stringify(initLocation)}`,
            '    氛围: "平静"',
            '  角色状态: {}',
            '  关键线索: []'
        ].join('\n');
        return `<state>\n${stateSchemaAndInit}\n</state>`;
    }

    // 生成小白X 2.0 章节管理器 + 多开场白自动初始化 + 终章自由续写自动卸载脚本（严格遵循 LittleWhiteBox tasks.md & variables-v2.md）
    function generateXiaobaixManagerTaskCode(manifest, maxChars, greetingConfigs = [], modeEntryGroups = {}) {
        const compactManifest = manifest.map(c => ({
            id: c.id,
            act: c.act,
            chapter: c.chapter,
            title: c.title,
            overviewEntry: c.overviewEntry,
            overviewChars: c.overviewChars,
            phases: c.phases.map(p => ({
                name: p.name,
                entry: p.entry,
                chars: p.chars,
                firstScene: p.firstScene
            }))
        }));

        const list = (Array.isArray(greetingConfigs) && greetingConfigs.length)
            ? greetingConfigs
            : [{ startChapterId: compactManifest[0]?.id || '' }];
        const initByGreeting = list.map(g => buildSingleInitStateText(compactManifest, g.startChapterId));
        const mainlineRuleEntries = Array.isArray(modeEntryGroups.mainlineRuleEntries) ? modeEntryGroups.mainlineRuleEntries : [];
        const freeRoamEntries = Array.isArray(modeEntryGroups.freeRoamEntries) ? modeEntryGroups.freeRoamEntries : [];

        return `<<taskjs>>
// ============================================================
// 小白X 2.0 剧情卡 · 多开场白、动态字数章节与自由续写自动切换管理器（由妮卡角色工作室生成）
// 触发时机：chat_changed + interval: 1（支持终章自动卸载大纲限制 & 删楼回滚自动恢复）
// ============================================================
const MAX_ACTIVE_CHARS = ${Math.max(2000, Number(maxChars) || 12000)};
const CHAPTER_MANIFEST = ${JSON.stringify(compactManifest, null, 2)};
const ALL_PLOT_ENTRIES = [];
for (const c of CHAPTER_MANIFEST) {
  ALL_PLOT_ENTRIES.push(c.overviewEntry);
  for (const p of (c.phases || [])) ALL_PLOT_ENTRIES.push(p.entry);
}
// 主线期启用、进入自由模式（剧情数据.章节.启用 === false）时自动全部关闭的条目
const MAINLINE_RULE_ENTRIES = ${JSON.stringify(mainlineRuleEntries, null, 2)};
// 仅在自由模式下自动开启的条目（极简自由思考 + 自由演绎指引 + 自由模式变量更新规则）
const FREE_ROAM_ENTRIES = ${JSON.stringify(freeRoamEntries, null, 2)};

// 下标 0 对应主开场白（first_mes），下标 1+ 依次对应备选开场白（alternate_greetings）
const INIT_BY_GREETING = ${JSON.stringify(initByGreeting, null, 2)};

const tavern = SillyTavern.getContext();
const uidCache = new Map();
let cachedBookName = '';
let lastAppliedKey = '';
let syncTimer = null;

async function readPlotState() {
  try {
    const st = SillyTavern.getContext();
    let raw = st?.variables?.local?.get?.('剧情数据');
    if (raw === undefined || raw === null || raw === '') {
      raw = st?.chatMetadata?.variables?.['剧情数据'];
    }
    if (raw === undefined || raw === null || raw === '') {
      raw = await STscript('/getvar 剧情数据');
    }
    if (raw === '' || raw === undefined || raw === null) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    taskContext?.warn?.('读取 剧情数据 失败', e);
    return null;
  }
}

function isPastFinalChapter(act, chapter) {
  if (!CHAPTER_MANIFEST.length) return true;
  const matched = CHAPTER_MANIFEST.some(c => Number(c.act) === Number(act) && Number(c.chapter) === Number(chapter));
  if (matched) return false;
  const last = CHAPTER_MANIFEST[CHAPTER_MANIFEST.length - 1];
  const a = Number(act);
  const ch = Number(chapter);
  return a > Number(last.act) || (a === Number(last.act) && ch > Number(last.chapter));
}

async function markChapterDisabled() {
  const stateV2 = globalThis.LWB_StateV2 || window.LWB_StateV2;
  if (!stateV2) return;
  try {
    if (typeof stateV2.apply === 'function') {
      stateV2.apply({ ops: [{ op: 'set', path: '剧情数据.章节.启用', value: false }] });
    } else if (typeof stateV2.applyText === 'function') {
      await stateV2.applyText('<state>\\n剧情数据.章节.启用: false\\n</state>');
    }
  } catch (e) {
    taskContext?.warn?.('自动切换自由模式状态写入失败', e);
  }
}

function computeActiveSet(act, chapter, phaseName) {
  const active = new Set();
  if (!CHAPTER_MANIFEST.length) return active;
  let curIdx = CHAPTER_MANIFEST.findIndex(c => Number(c.act) === Number(act) && Number(c.chapter) === Number(chapter));
  if (curIdx === -1) curIdx = 0;
  const cur = CHAPTER_MANIFEST[curIdx];
  const phases = cur.phases || [];
  let phIdx = phases.findIndex(p => p.name === phaseName);
  if (phIdx === -1) phIdx = 0;

  let usedChars = 0;
  active.add(cur.overviewEntry);
  usedChars += cur.overviewChars || 0;
  if (phases[phIdx]) {
    active.add(phases[phIdx].entry);
    usedChars += phases[phIdx].chars || 0;
  }
  for (let i = phIdx + 1; i < phases.length; i++) {
    if (usedChars + (phases[i].chars || 0) <= MAX_ACTIVE_CHARS) {
      active.add(phases[i].entry);
      usedChars += phases[i].chars || 0;
    } else break;
  }
  const next = CHAPTER_MANIFEST[curIdx + 1];
  if (next && usedChars < MAX_ACTIVE_CHARS * 0.8) {
    if (usedChars + (next.overviewChars || 0) <= MAX_ACTIVE_CHARS) {
      active.add(next.overviewEntry);
      usedChars += next.overviewChars || 0;
      if (next.phases?.[0] && usedChars + (next.phases[0].chars || 0) <= MAX_ACTIVE_CHARS) {
        active.add(next.phases[0].entry);
      }
    }
  }
  return active;
}

async function resolveCharBook() {
  if (cachedBookName) return cachedBookName;
  const book = await STscript('/getcharbook type=primary');
  cachedBookName = String(book || '').trim();
  return cachedBookName;
}

async function findUidByComment(bookName, comment) {
  const cacheKey = bookName + '::' + comment;
  if (uidCache.has(cacheKey)) return uidCache.get(cacheKey);
  const safeBook = bookName.replace(/"/g, '\\\\"');
  const safeComment = comment.replace(/"/g, '\\\\"');
  const uid = await STscript(\`/findentry file="\${safeBook}" field=comment \${safeComment}\`);
  const cleanUid = String(uid ?? '').trim();
  if (cleanUid !== '') uidCache.set(cacheKey, cleanUid);
  return cleanUid;
}

async function setEntryDisabled(safeBook, bookName, entryName, shouldDisable) {
  if (abortSignal?.aborted) return;
  const uid = await findUidByComment(bookName, entryName);
  if (!uid) return;
  const curDisabled = String(await STscript(\`/getentryfield file="\${safeBook}" field=disable \${uid}\`)).trim().toLowerCase() === 'true';
  if (curDisabled !== shouldDisable) {
    await STscript(\`/setentryfield file="\${safeBook}" uid=\${uid} field=disable \${shouldDisable}\`);
  }
}

async function syncPlotWorldbooks(force = false) {
  if (abortSignal?.aborted) return;
  const state = await readPlotState();
  const ch = state?.章节;
  if (!ch) return;

  const act = Number(ch.卷幕) || 1;
  const chap = Number(ch.章号) || 1;
  const phase = String(ch.阶段 || '');

  // 判断是否进入自由续写模式：显式 启用===false，或章号超界兜底（不再倒回第一章）
  let isFreeRoam = ch.启用 === false;
  if (!isFreeRoam && isPastFinalChapter(act, chap)) {
    isFreeRoam = true;
    await markChapterDisabled();
  }

  const stateKey = isFreeRoam ? 'FREE_ROAM' : \`MAIN_\${act}_\${chap}_\${phase}\`;
  if (!force && stateKey === lastAppliedKey) return;

  const bookName = await resolveCharBook();
  if (!bookName) {
    taskContext?.warn?.('当前角色未绑定主世界书，跳过章节同步');
    return;
  }
  const safeBook = bookName.replace(/"/g, '\\\\"');

  if (isFreeRoam) {
    // 自由模式：彻底卸载全部章节大纲与主线限制条目，仅开启轻量自由演绎条目
    for (const entryName of ALL_PLOT_ENTRIES) {
      await setEntryDisabled(safeBook, bookName, entryName, true);
    }
    for (const entryName of MAINLINE_RULE_ENTRIES) {
      await setEntryDisabled(safeBook, bookName, entryName, true);
    }
    for (const entryName of FREE_ROAM_ENTRIES) {
      await setEntryDisabled(safeBook, bookName, entryName, false);
    }
    lastAppliedKey = stateKey;
    taskContext?.log?.('已切入【自由续写模式】：全部主线大纲与推进限制已卸载，自由模式指引已启用');
    return;
  }

  // 主线模式：按动态字数窗口开关章节大纲，启用主线规则，关闭自由模式条目
  const activeSet = computeActiveSet(act, chap, phase);
  for (const entryName of ALL_PLOT_ENTRIES) {
    await setEntryDisabled(safeBook, bookName, entryName, !activeSet.has(entryName));
  }
  for (const entryName of MAINLINE_RULE_ENTRIES) {
    await setEntryDisabled(safeBook, bookName, entryName, false);
  }
  for (const entryName of FREE_ROAM_ENTRIES) {
    await setEntryDisabled(safeBook, bookName, entryName, true);
  }
  lastAppliedKey = stateKey;
  taskContext?.log?.(\`已同步世界书至 A\${act}_C\${chap} [\${phase}]，当前激活 \${activeSet.size} 条（预算 \${MAX_ACTIVE_CHARS} 字）\`);
}

function scheduleSync(force = false) {
  if (syncTimer) clearTimeoutSafe(syncTimer);
  syncTimer = setTimeoutSafe(() => { syncPlotWorldbooks(force); }, 180);
}

async function initGreetingIfNeeded(allowWhenMissing = false) {
  const { chat } = SillyTavern.getContext();
  if (!chat || chat.length === 0) return;
  const swipeIdx = Number(chat[0]?.swipe_id ?? 0);
  const initText = INIT_BY_GREETING[swipeIdx] || INIT_BY_GREETING[0];
  if (!initText) return;
  if (chat.length > 1) {
    const existing = await readPlotState();
    if (existing?.章节 || !allowWhenMissing) return;
  }
  const stateV2 = globalThis.LWB_StateV2 || window.LWB_StateV2;
  if (typeof stateV2?.applyText !== 'function') {
    window.toastr?.warning?.('未检测到 LWB_StateV2：请打开 扩展设置 → 小白X → 数据互动 → 勾选【变量管理】并选择【2.0 (state)】');
    return;
  }
  const res = await stateV2.applyText(initText, { floor: 0 });
  if (res?.errors?.length) {
    taskContext?.warn?.('初始变量写入存在提示', res.errors);
  }
}

// 1. 监听小白X 2.0 官方变量更新完成事件（正文<state>、独立更新、切swipe重算均触发）
const jqNs = 'xiaobaix:variables:stateAtomsGenerated.nikaNovelCard';
if (window.jQuery) {
  window.jQuery(document).off(jqNs).on(jqNs, () => scheduleSync(false));
}

// 2. 监听切开场白 & 删楼回滚
const onSwiped = (id) => {
  if (Number(id) === 0) initGreetingIfNeeded(false).then(() => scheduleSync(true));
  else scheduleSync(true);
};
const onDeleted = () => scheduleSync(true);
tavern.eventSource.on(tavern.eventTypes.MESSAGE_SWIPED, onSwiped);
tavern.eventSource.on(tavern.eventTypes.MESSAGE_DELETED, onDeleted);

onCleanup(() => {
  if (window.jQuery) window.jQuery(document).off(jqNs);
  tavern.eventSource.removeListener(tavern.eventTypes.MESSAGE_SWIPED, onSwiped);
  tavern.eventSource.removeListener(tavern.eventTypes.MESSAGE_DELETED, onDeleted);
});

// 3. 进入聊天时初始化并同步一次世界书
await initGreetingIfNeeded(true);
await syncPlotWorldbooks(true);
<</taskjs>>`;
    }

    function generateProgressButtonTaskCode(manifest) {
        const compactManifest = manifest.map(c => ({
            id: c.id, act: c.act, chapter: c.chapter, title: c.title,
            phases: c.phases.map(p => ({ name: p.name, chars: p.chars }))
        }));
        return `<<taskjs>>
const MANIFEST = ${JSON.stringify(compactManifest)};
async function readState() {
  const st = SillyTavern.getContext();
  let raw = st?.variables?.local?.get?.('剧情数据');
  if (raw === undefined || raw === null || raw === '') raw = st?.chatMetadata?.variables?.['剧情数据'];
  if (raw === undefined || raw === null || raw === '') raw = await STscript('/getvar 剧情数据');
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
let data = await readState();
if (!data?.章节) {
  const stateV2 = globalThis.LWB_StateV2 || window.LWB_StateV2;
  if (typeof stateV2?.applyText !== 'function') {
    window.toastr?.warning?.('未检测到小白X 变量2.0（LWB_StateV2）。请前往：扩展设置 → 小白X → 数据互动 → 勾选【变量管理】并选【2.0 (state)】');
    return;
  }
  if (typeof window.xbqte === 'function') {
    await window.xbqte('章节管理器与状态初始化');
    data = await readState();
  }
}
if (!data?.章节) {
  window.toastr?.warning?.('尚未初始化剧情数据，请确认已启用小白X 变量2.0 与循环任务，并重新打开或新建聊天');
  return;
}
const ch = data.章节;
if (ch.启用 === false) {
  const lines = [
    '🕊️ 当前模式：自由续写模式（主线大纲与推进限制已全部卸载）',
    \`世界时间：第\${data.世界?.天数 || 1}天 \${data.世界?.时间 || ''}（\${data.世界?.地点 || ''}）\`,
    '提示：可随时点击【🕊️ 切换自由/主线】恢复主线章节'
  ];
  window.toastr?.info?.(lines.join('\\n'), '当前剧情进度');
  return;
}
const cur = MANIFEST.find(c => Number(c.act) === Number(ch.卷幕) && Number(c.chapter) === Number(ch.章号));
const lines = [
  '▶️ 主线剧情模式运行中',
  \`卷幕/章节：A\${ch.卷幕}_C\${ch.章号} \${cur ? '《' + cur.title + '》' : ''}\`,
  \`当前阶段：\${ch.阶段 || '未设定'}\`,
  \`当前场景：\${ch.当前场景 || '未设定'}\`,
  \`世界时间：第\${data.世界?.天数 || 1}天 \${data.世界?.时间 || ''}（\${data.世界?.地点 || ''}）\`
];
window.toastr?.info?.(lines.join('\\n'), '当前剧情进度');
<</taskjs>>`;
    }

    function generateNextStageButtonTaskCode(manifest) {
        const compactManifest = manifest.map(c => ({
            id: c.id, act: c.act, chapter: c.chapter, title: c.title,
            phases: c.phases.map(p => ({ name: p.name, firstScene: p.firstScene }))
        }));
        return `<<taskjs>>
const MANIFEST = ${JSON.stringify(compactManifest)};
const stateV2 = globalThis.LWB_StateV2 || window.LWB_StateV2;
if (typeof stateV2?.apply !== 'function' && typeof stateV2?.applyText !== 'function') {
  window.toastr?.warning?.('未检测到小白X 变量2.0（LWB_StateV2）。请前往：扩展设置 → 小白X → 数据互动 → 勾选【变量管理】并选【2.0 (state)】');
  return;
}
async function readState() {
  const st = SillyTavern.getContext();
  let raw = st?.variables?.local?.get?.('剧情数据');
  if (raw === undefined || raw === null || raw === '') raw = st?.chatMetadata?.variables?.['剧情数据'];
  if (raw === undefined || raw === null || raw === '') raw = await STscript('/getvar 剧情数据');
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
let data = await readState();
if (!data?.章节 && typeof window.xbqte === 'function') {
  await window.xbqte('章节管理器与状态初始化');
  data = await readState();
}
if (!data?.章节) { window.toastr?.warning?.('尚未初始化剧情数据，请先新建聊天或手动执行一次【章节管理器与状态初始化】'); return; }
if (data.章节.启用 === false) {
  window.toastr?.info?.('当前已处于自由续写模式，如需回归主线请点击【🕊️ 切换自由/主线】');
  return;
}

const curIdx = MANIFEST.findIndex(c => Number(c.act) === Number(data.章节.卷幕) && Number(c.chapter) === Number(data.章节.章号));
if (curIdx === -1) { window.toastr?.warning?.('未匹配到当前章节'); return; }
const cur = MANIFEST[curIdx];
const phIdx = (cur.phases || []).findIndex(p => p.name === data.章节.阶段);

let ops = [];
let stateLines = [];
let tip = '';
if (phIdx >= 0 && phIdx < cur.phases.length - 1) {
  const nextPh = cur.phases[phIdx + 1];
  const nextScene = nextPh.firstScene || '01-开场';
  ops = [
    { op: 'set', path: '剧情数据.章节.阶段', value: nextPh.name },
    { op: 'set', path: '剧情数据.章节.当前场景', value: nextScene }
  ];
  stateLines = [
    \`剧情数据.章节.阶段: \${JSON.stringify(nextPh.name)}\`,
    \`剧情数据.章节.当前场景: \${JSON.stringify(nextScene)}\`
  ];
  tip = \`已切换至 \${cur.id} 阶段【\${nextPh.name}】\`;
} else if (curIdx < MANIFEST.length - 1) {
  const nextCh = MANIFEST[curIdx + 1];
  const firstPh = nextCh.phases?.[0] || { name: '剧情推进', firstScene: '01-开场' };
  const nextScene = firstPh.firstScene || '01-开场';
  ops = [
    { op: 'set', path: '剧情数据.章节.卷幕', value: nextCh.act },
    { op: 'set', path: '剧情数据.章节.章号', value: nextCh.chapter },
    { op: 'set', path: '剧情数据.章节.阶段', value: firstPh.name },
    { op: 'set', path: '剧情数据.章节.当前场景', value: nextScene }
  ];
  stateLines = [
    \`剧情数据.章节.卷幕: \${nextCh.act}\`,
    \`剧情数据.章节.章号: \${nextCh.chapter}\`,
    \`剧情数据.章节.阶段: \${JSON.stringify(firstPh.name)}\`,
    \`剧情数据.章节.当前场景: \${JSON.stringify(nextScene)}\`
  ];
  tip = \`已切换至下一章 \${nextCh.id} 《\${nextCh.title}》\`;
} else {
  // 最终章最终阶段完毕：自动完结主线并卸载全部大纲与主线限制，进入自由续写模式
  ops = [{ op: 'set', path: '剧情数据.章节.启用', value: false }];
  stateLines = ['剧情数据.章节.启用: false'];
  tip = '🎉 已完结最终章！所有大纲与主线限制已卸载，现已切入自由续写模式';
}

if (typeof stateV2.apply === 'function') {
  const res = stateV2.apply({ ops });
  if (res?.status === 'failed') {
    window.toastr?.error?.('切换失败：' + (res.errors || []).map(e => e.message).join('；'));
    return;
  }
} else {
  const res = await stateV2.applyText(\`<state>\\n\${stateLines.join('\\n')}\\n</state>\`);
  if (res?.errors?.length) {
    window.toastr?.error?.('切换提示：' + res.errors.join('；'));
    return;
  }
}
if (typeof window.xbqte === 'function') {
  await window.xbqte('章节管理器与状态初始化');
}
window.toastr?.success?.(tip);
<</taskjs>>`;
    }

    function generateToggleFreeRoamButtonTaskCode(manifest) {
        const compactManifest = manifest.map(c => ({
            id: c.id, act: c.act, chapter: c.chapter, title: c.title,
            phases: c.phases.map(p => ({ name: p.name, firstScene: p.firstScene }))
        }));
        return `<<taskjs>>
const MANIFEST = ${JSON.stringify(compactManifest)};
const stateV2 = globalThis.LWB_StateV2 || window.LWB_StateV2;
if (typeof stateV2?.apply !== 'function' && typeof stateV2?.applyText !== 'function') {
  window.toastr?.warning?.('未检测到小白X 变量2.0（LWB_StateV2）。请前往：扩展设置 → 小白X → 数据互动 → 勾选【变量管理】并选【2.0 (state)】');
  return;
}
async function readState() {
  const st = SillyTavern.getContext();
  let raw = st?.variables?.local?.get?.('剧情数据');
  if (raw === undefined || raw === null || raw === '') raw = st?.chatMetadata?.variables?.['剧情数据'];
  if (raw === undefined || raw === null || raw === '') raw = await STscript('/getvar 剧情数据');
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
let data = await readState();
if (!data?.章节 && typeof window.xbqte === 'function') {
  await window.xbqte('章节管理器与状态初始化');
  data = await readState();
}
if (!data?.章节) { window.toastr?.warning?.('尚未初始化剧情数据，请先新建聊天'); return; }

const currentlyFree = data.章节.启用 === false;
let ops = [];
let stateLines = [];
let tip = '';

if (!currentlyFree) {
  ops = [{ op: 'set', path: '剧情数据.章节.启用', value: false }];
  stateLines = ['剧情数据.章节.启用: false'];
  tip = '🕊️ 已切换至【自由续写模式】：所有主线大纲与推进限制已全部卸载！';
} else {
  const matched = MANIFEST.find(c => Number(c.act) === Number(data.章节.卷幕) && Number(c.chapter) === Number(data.章节.章号));
  if (matched) {
    ops = [{ op: 'set', path: '剧情数据.章节.启用', value: true }];
    stateLines = ['剧情数据.章节.启用: true'];
    tip = \`▶️ 已恢复主线章节模式：\${matched.id} 《\${matched.title}》\`;
  } else if (MANIFEST.length) {
    const last = MANIFEST[MANIFEST.length - 1];
    const lastPh = last.phases?.[last.phases.length - 1] || { name: '剧情推进', firstScene: '01-开场' };
    ops = [
      { op: 'set', path: '剧情数据.章节.启用', value: true },
      { op: 'set', path: '剧情数据.章节.卷幕', value: last.act },
      { op: 'set', path: '剧情数据.章节.章号', value: last.chapter },
      { op: 'set', path: '剧情数据.章节.阶段', value: lastPh.name },
      { op: 'set', path: '剧情数据.章节.当前场景', value: lastPh.firstScene || '01-开场' }
    ];
    stateLines = [
      '剧情数据.章节.启用: true',
      \`剧情数据.章节.卷幕: \${last.act}\`,
      \`剧情数据.章节.章号: \${last.chapter}\`,
      \`剧情数据.章节.阶段: \${JSON.stringify(lastPh.name)}\`,
      \`剧情数据.章节.当前场景: \${JSON.stringify(lastPh.firstScene || '01-开场')}\`
    ];
    tip = \`▶️ 已恢复主线章节模式（锚定至 \${last.id} 《\${last.title}》）\`;
  }
}

if (typeof stateV2.apply === 'function') {
  const res = stateV2.apply({ ops });
  if (res?.status === 'failed') {
    window.toastr?.error?.('切换失败：' + (res.errors || []).map(e => e.message).join('；'));
    return;
  }
} else {
  const res = await stateV2.applyText(\`<state>\\n\${stateLines.join('\\n')}\\n</state>\`);
  if (res?.errors?.length) {
    window.toastr?.error?.('切换提示：' + res.errors.join('；'));
    return;
  }
}
if (typeof window.xbqte === 'function') {
  await window.xbqte('章节管理器与状态初始化');
}
window.toastr?.success?.(tip);
<</taskjs>>`;
    }

    // 组装完整的 Nika 内部 cardData 对象（可直接入库或调用 buildV3Card 导出）
    function assembleCharacterCard() {
        const fw = NTCState.framework;
        const tpls = fw.templates;
        const manifest = buildChapterManifest();
        const cardName = getBookBaseName();
        const isInlineChannel = fw.varUpdateChannel !== 'plugin_updater';

        const worldbook = [];
        let nextId = 0;
        const pushEntry = (cfg) => {
            worldbook.push({
                id: nextId++,
                keys: cfg.keys || [],
                secondary_keys: cfg.secondary_keys || [],
                comment: cfg.comment || '',
                content: cfg.content || '',
                priority: cfg.order !== undefined ? cfg.order : 100,
                enabled: cfg.enabled !== undefined ? cfg.enabled : true,
                position: cfg.position !== undefined ? cfg.position : 0,
                depth: cfg.depth !== undefined ? cfg.depth : 4,
                role: cfg.role !== undefined ? cfg.role : 0,
                constant: cfg.constant !== undefined ? cfg.constant : false,
                selective: cfg.selective !== undefined ? cfg.selective : true,
                use_regex: true,
                prevent_recursion: true,
                exclude_recursion: true,
                probability: 100
            });
        };

        // 1. 剧情大纲开始/结束包裹 + 全部章节总览与动态阶段条目（按主开场白起始章节 + 字数窗口决定初始启停）
        const greetings = ensureGreetingsState();
        const primaryStartCh = (greetings[0]?.startChapterId
            ? manifest.find(c => c.id === greetings[0].startChapterId)
            : null) || manifest[0];
        const initActiveSet = primaryStartCh
            ? computeActivePlotEntries(manifest, primaryStartCh.act, primaryStartCh.chapter, primaryStartCh.phases[0]?.name || '', fw.maxActiveChars)
            : new Set();

        pushEntry({
            comment: '1️⃣_剧情大纲开始',
            content: '<剧情大纲>',
            position: 0, order: 80, constant: true, selective: false, enabled: true
        });

        manifest.forEach((ch, idx) => {
            const ord = 81 + Math.min(idx, 14);
            pushEntry({
                comment: ch.overviewEntry,
                content: ch.overviewContent,
                position: 0, order: ord, constant: true, selective: false,
                enabled: initActiveSet.has(ch.overviewEntry)
            });
            ch.phases.forEach(ph => {
                pushEntry({
                    comment: ph.entry,
                    content: ph.content,
                    position: 0, order: ord, constant: true, selective: false,
                    enabled: initActiveSet.has(ph.entry)
                });
            });
        });

        pushEntry({
            comment: '1️⃣_剧情大纲结束',
            content: '</剧情大纲>',
            position: 0, order: 96, constant: true, selective: false, enabled: true
        });

        // 2. 提取出的设定类世界书条目（角色详情包裹 + 其余分类）
        const catMetaMap = new Map(NTCState.loreCategories.map(c => [c.name, c]));
        const charDetailEntries = NTCState.extracted.lore['角色详情'] || {};
        const charNames = Object.keys(charDetailEntries);
        if (charNames.length) {
            pushEntry({
                comment: '_角色详情开始',
                content: '<原设角色详情>',
                position: 1, order: 97, constant: true, selective: false, enabled: true
            });
            charNames.forEach((name, idx) => {
                const item = charDetailEntries[name];
                pushEntry({
                    comment: `1️⃣角色详情 - ${name}`,
                    keys: (item.keywords && item.keywords.length) ? item.keywords : [name],
                    content: item.content || '',
                    position: 1, order: 101 + idx, constant: false, selective: true, enabled: true
                });
            });
            pushEntry({
                comment: '_角色详情结束',
                content: '</原设角色详情>',
                position: 1, order: 199, constant: true, selective: false, enabled: true
            });
        }

        Object.entries(NTCState.extracted.lore || {}).forEach(([cat, entries]) => {
            if (cat === '角色详情') return;
            const meta = catMetaMap.get(cat) || { triggerMode: 'keyword', position: 0, order: 210, depth: 4 };
            const isConst = meta.triggerMode === 'constant';
            Object.entries(entries || {}).forEach(([name, item], idx) => {
                pushEntry({
                    comment: `1️⃣${cat} - ${name}`,
                    keys: isConst ? [] : ((item.keywords && item.keywords.length) ? item.keywords : [name]),
                    content: item.content || '',
                    position: meta.position ?? 0,
                    depth: meta.depth ?? 4,
                    order: (meta.order ?? 210) + idx,
                    constant: isConst,
                    selective: !isConst,
                    enabled: true
                });
            });
        });

        // 3. 通用 RP 稳定运行规则条目（区分全程常驻 / 主线期专属 / 自由模式接管）
        const mainlineRuleEntries = ['1️⃣_剧情大纲开始', '1️⃣_剧情大纲结束'];
        const freeRoamEntries = [];

        if (tpls.creationGuideline?.enabled) {
            pushEntry({
                comment: tpls.creationGuideline.name,
                content: tpls.creationGuideline.content,
                position: 4, depth: 0, order: 700, constant: true, selective: false, enabled: true
            });
        }
        if (tpls.plotProgressionRule?.enabled) {
            pushEntry({
                comment: tpls.plotProgressionRule.name,
                content: tpls.plotProgressionRule.content,
                position: 4, depth: 0, order: 598, constant: true, selective: false, enabled: true
            });
            mainlineRuleEntries.push(tpls.plotProgressionRule.name);
        }
        if (tpls.outlinePerformanceRule?.enabled) {
            pushEntry({
                comment: tpls.outlinePerformanceRule.name,
                content: tpls.outlinePerformanceRule.content,
                position: 4, depth: 0, order: 4, constant: true, selective: false, enabled: true
            });
            mainlineRuleEntries.push(tpls.outlinePerformanceRule.name);
        }
        if (tpls.extraThinkingChecklist?.enabled) {
            pushEntry({
                comment: tpls.extraThinkingChecklist.name,
                content: tpls.extraThinkingChecklist.content,
                position: 4, depth: 0, order: 1, constant: true, selective: false, enabled: true
            });
            mainlineRuleEntries.push(tpls.extraThinkingChecklist.name);
        }
        if (tpls.freeRoamGuideline?.enabled) {
            pushEntry({
                comment: tpls.freeRoamGuideline.name,
                content: tpls.freeRoamGuideline.content,
                position: 4, depth: 0, order: 598, constant: true, selective: false, enabled: false
            });
            freeRoamEntries.push(tpls.freeRoamGuideline.name);
        }
        if (tpls.freeRoamThinkingChecklist?.enabled) {
            pushEntry({
                comment: tpls.freeRoamThinkingChecklist.name,
                content: tpls.freeRoamThinkingChecklist.content,
                position: 4, depth: 0, order: 1, constant: true, selective: false, enabled: false
            });
            freeRoamEntries.push(tpls.freeRoamThinkingChecklist.name);
        }
        if (tpls.userSetting?.enabled) {
            pushEntry({
                comment: tpls.userSetting.name,
                content: tpls.userSetting.content,
                position: 4, depth: 2, order: 25, constant: true, selective: false, enabled: true
            });
        }

        // 4. 小白X 2.0 变量展示条目 + 主线/自由模式变量更新规则条目
        const currentVarMacro = isInlineChannel
            ? '{{xbgetvar_yaml_idx::剧情数据}}'
            : '{{xbgetvar::剧情数据}}';

        const currentVarContent = `# 当前剧情与世界状态
\`\`\`yaml
${currentVarMacro}
\`\`\`
<varevent>
[event.showStateErrors]
condition: var(\`LWB_STATE_ERRORS\`) != val(\`\`)
display: "
【上回合状态更新反馈】
{{getvar::LWB_STATE_ERRORS}}
⚠️ 上回合状态更新存在格式或模板问题，请严格对照路径修正。
"
</varevent>`;

        pushEntry({
            comment: '1️⃣⚙当前变量',
            content: currentVarContent,
            position: 4, depth: 1, order: 8, constant: true, selective: false, enabled: true
        });

        const chapterRulesBody = `【最高优先级规则】
- 若 \`剧情数据.章节.启用\` 为 false，表示已切入自由续写模式，禁止修改 \`剧情数据.章节\` 下的任何字段，仅正常维护世界、角色状态与关键线索。

【字段更新规范】
1. 剧情数据.章节.当前场景：严格按当前 <剧情大纲> 内的场景编号顺序（01→02→03...）推进；仅在剧情进入下一场景时更新，禁止跳跃或回溯。
2. 剧情数据.章节.阶段：仅在当前阶段的全部场景演绎完毕后，按 <本章大纲总览> 的「阶段推进顺序」切换至下一阶段，并同步将 \`剧情数据.章节.当前场景\` 重置为新阶段的首个场景名。
3. 剧情数据.章节.章号 / 剧情数据.章节.卷幕 / 终章收束：仅在本章全部阶段演绎完毕时推进至下一章（跨卷时卷幕 +1、章号重置为 1），系统会自动开启下一章对应的世界书大纲；若当前已处于全书最终章的最终阶段且原著主线正式收束，请将 \`剧情数据.章节.启用\` 设为 \`false\`，系统将自动卸载全部大纲与主线限制并切入自由续写模式。
4. 剧情数据.世界：随剧情自然推进更新 \`天数\`、\`时间\`（HH:MM）、\`时段\`、\`地点\`、\`氛围\`。
5. 剧情数据.角色状态.<角色全名>：首次与重要角色正式互动时按模板整体写入 \`{"状态":"在场","位置":"地点","好感":0,"备注":"简要近况"}\`，之后每回合仅修改变动字段（好感用 +N / -N 增减，范围 -100~100，单次最多变动 20；角色死亡或永久退场时将状态改为 "已死亡" 或 "已退场"）。
6. 剧情数据.关键线索：获得核心线索或关键物品时追加，失效或用完时移除。`;

        const stateSyntaxGuide = isInlineChannel
            ? `\n\n【小白X 2.0 更新语法（正文末尾输出）】
每次回复结束时，在末尾输出 \`<state>...</state>\` 块仅提交本回合实际发生的变化（无变化可省略）：
- 设置值：\`路径: 值\`（注意冒号后必须有空格）
- 数字加减：\`剧情数据.角色状态.角色名.好感: +5\`
- 设负数：\`路径: (-10)\`
- 数组追加：\`剧情数据.关键线索: +"新线索"\`
- 数组按索引删除：\`剧情数据.关键线索[0]: null\`（参考上方 # [n]）
- 新增角色状态对象（必须写全 4 个字段）：
\`\`\`
<state>
剧情数据.章节.当前场景: "02-下一个场景"
剧情数据.世界.时间: "09:30"
剧情数据.角色状态.角色全名:
  状态: "在场"
  位置: "当前地点"
  好感: 10
  备注: "初次交谈"
</state>
\`\`\``
            : `\n\n【小白X 2.0 独立变量更新器说明】
请仅依据本回合正文实际发生的事实提交 JSON ops 变化；未变化字段不要提交；每条操作附带简短 reason 说明。当 \`剧情数据.章节.启用\` 为 false 时，仅更新世界、角色状态与关键线索。`;

        const mainlineVarRuleComment = isInlineChannel ? '1️⃣⚙章节与变量更新规则' : '【小白X变量更新】章节与变量更新规则';
        pushEntry({
            comment: mainlineVarRuleComment,
            content: chapterRulesBody + stateSyntaxGuide,
            position: 4, depth: 0, order: 6, constant: true, selective: false,
            enabled: isInlineChannel // 独立更新模式按官方规范保持关闭，由小白X更新器临时读取
        });

        if (isInlineChannel) {
            mainlineRuleEntries.push(mainlineVarRuleComment);

            const freeRoamVarRuleComment = '1️⃣⚙自由模式变量更新规则';
            const freeRoamVarRuleContent = `【字段更新规范】
1. 剧情数据.世界：随互动自然推进更新 \`天数\`、\`时间\`（HH:MM）、\`时段\`、\`地点\`、\`氛围\`。
2. 剧情数据.角色状态.<角色全名>：首次与重要角色正式互动时按模板整体写入 \`{"状态":"在场","位置":"地点","好感":0,"备注":"简要近况"}\`，之后每回合仅修改变动字段（好感用 +N / -N 增减，范围 -100~100，单次最多变动 20；角色死亡或永久退场时将状态改为 "已死亡" 或 "已退场"）。
3. 剧情数据.关键线索：获得新线索或关键物品时追加，失效或用完时移除。

【小白X 2.0 更新语法（正文末尾输出）】
每次回复结束时，在末尾输出 \`<state>...</state>\` 块仅提交本回合实际发生的变化（无变化可省略）：
- 设置值：\`路径: 值\`（注意冒号后必须有空格）
- 数字加减：\`剧情数据.角色状态.角色名.好感: +5\`
- 设负数：\`路径: (-10)\`
- 数组追加：\`剧情数据.关键线索: +"新线索"\`
- 数组按索引删除：\`剧情数据.关键线索[0]: null\`（参考上方 # [n]）
- 新增角色状态对象（必须写全 4 个字段）：
\`\`\`
<state>
剧情数据.世界.时间: "15:20"
剧情数据.世界.地点: "新地点"
剧情数据.角色状态.角色全名:
  状态: "在场"
  位置: "新地点"
  好感: 10
  备注: "近况记录"
</state>
\`\`\``;
            pushEntry({
                comment: freeRoamVarRuleComment,
                content: freeRoamVarRuleContent,
                position: 4, depth: 0, order: 6, constant: true, selective: false,
                enabled: false // 主线期关闭，自由模式自动开启
            });
            freeRoamEntries.push(freeRoamVarRuleComment);
        }

        // 5. 小白X 循环任务（extensions['xiaobaix-tasks'].tasks）
        const xiaobaixTasks = [
            {
                id: 'ntc_chapter_mgr_' + Date.now(),
                name: '章节管理器与状态初始化',
                commands: generateXiaobaixManagerTaskCode(manifest, fw.maxActiveChars, greetings, {
                    mainlineRuleEntries,
                    freeRoamEntries
                }),
                interval: 1,
                floorType: 'all',
                triggerTiming: 'chat_changed',
                disabled: false,
                buttonActivated: false,
                createdAt: new Date().toISOString()
            }
        ];

        if (fw.includeManualButtons) {
            xiaobaixTasks.push(
                {
                    id: 'ntc_show_progress_' + (Date.now() + 1),
                    name: '📖 查看剧情进度',
                    commands: generateProgressButtonTaskCode(manifest),
                    interval: 0,
                    floorType: 'all',
                    triggerTiming: 'after_ai',
                    disabled: false,
                    buttonActivated: true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'ntc_next_stage_' + (Date.now() + 2),
                    name: '⏭️ 手动推进阶段/章',
                    commands: generateNextStageButtonTaskCode(manifest),
                    interval: 0,
                    floorType: 'all',
                    triggerTiming: 'after_ai',
                    disabled: false,
                    buttonActivated: true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'ntc_toggle_freeroam_' + (Date.now() + 3),
                    name: '🕊️ 切换自由/主线',
                    commands: generateToggleFreeRoamButtonTaskCode(manifest),
                    interval: 0,
                    floorType: 'all',
                    triggerTiming: 'after_ai',
                    disabled: false,
                    buttonActivated: true,
                    createdAt: new Date().toISOString()
                }
            );
        }

        // 6. 正则脚本（正文 <state> 通道必备隐藏正则）
        const regexScripts = [];
        if (isInlineChannel) {
            regexScripts.push({
                id: 'ntc_hide_state_' + Date.now(),
                scriptName: '隐藏小白X状态块',
                findRegex: '/<state>[\\s\\S]*?<\\/state>/g',
                replaceString: '',
                trimStrings: [],
                placement: [1, 2],
                disabled: false,
                markdownOnly: true,
                promptOnly: true,
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
                runOnEdit: true
            });
        }

        // 7. 主开场白（first_mes）与备选开场白（alternate_greetings）
        const buildFallbackGreeting = (chId) => {
            const targetRaw = (chId ? NTCState.extracted.plot.chapters.find(c => c.id === chId) : null)
                || NTCState.extracted.plot.chapters[0];
            const sc0 = targetRaw?.phases?.[0]?.scenes?.[0];
            return sc0
                ? `【${cardName} · ${targetRaw.id} ${targetRaw.title || ''}】\n\n地点：${sc0.location || '未知'}\n\n${sc0.recap || '故事由此拉开序幕……'}`
                : `【${cardName}】\n\n故事的帷幕缓缓拉开……`;
        };
        const firstMes = (greetings[0]?.content || '').trim() || buildFallbackGreeting(greetings[0]?.startChapterId);
        const alternateGreetings = greetings.slice(1)
            .map(g => (g.content || '').trim() || buildFallbackGreeting(g.startChapterId))
            .filter(Boolean);

        return {
            name: cardName,
            description: `《${cardName}》互动剧情角色卡（由妮卡角色工作室「小说转剧情卡」生成，基于小白X 2.0 动态章节与终章自由续写引擎，共 ${manifest.length} 章、${worldbook.length} 条世界书、${1 + alternateGreetings.length} 个开场）。`,
            first_mes: firstMes,
            alternate_greetings: alternateGreetings,
            avatar: null,
            personality: '',
            scenario: `《${cardName}》原著世界舞台。`,
            tags: ['小说转剧情卡', '小白X2.0', '动态章节', '自由续写'],
            internalTags: [],
            worldbook,
            regex_scripts: regexScripts,
            xiaobaix_tasks: xiaobaixTasks,
            character_version: fw.version || '1.0',
            lastUsed: Date.now(),
            mes_example: '',
            creator_notes: `由妮卡角色工作室「小说转剧情卡」自动生成（小白X 2.0 适配）。\n使用说明：\n1. 在 SillyTavern 中安装并启用 LittleWhiteBox（小白X）扩展；\n2. 扩展设置 → 小白X → 数据互动 → 变量管理选择「2.0 (state)」；\n3. 扩展设置 → 小白X → 循环任务 → 勾选「启用循环任务」；\n4. 新建聊天即可自动初始化并动态切换章节世界书；主线终章完结后自动卸载全部大纲限制切入自由续写模式，亦可随时点击「🕊️ 切换自由/主线」手动切换！`,
            system_prompt: '',
            post_history_instructions: '',
            gender: '',
            isFavorite: false
        };
    }

    // ==================== 9. 持久化与恢复 ====================
    async function saveProgressToDB() {
        try {
            await NovelToCardDB.putState('workspace', {
                fileName: NTCState.fileName,
                chunks: NTCState.chunks,
                currentIndex: NTCState.currentIndex,
                strictCategories: NTCState.strictCategories,
                extracted: NTCState.extracted,
                framework: NTCState.framework
            });
            await NovelToCardDB.putState('loreCategories', NTCState.loreCategories);
        } catch (e) {
            console.error('[小说转卡] 保存进度失败:', e);
        }
    }

    async function loadProgressFromDB() {
        try {
            const savedCats = await NovelToCardDB.getState('loreCategories');
            if (Array.isArray(savedCats) && savedCats.length) {
                NTCState.loreCategories = savedCats;
            }
            const ws = await NovelToCardDB.getState('workspace');
            if (ws && (ws.chunks?.length || ws.extracted?.plot?.chapters?.length)) {
                NTCState.fileName = ws.fileName || '';
                NTCState.chunks = ws.chunks || [];
                NTCState.currentIndex = ws.currentIndex || 0;
                NTCState.strictCategories = Boolean(ws.strictCategories);
                if (ws.extracted) NTCState.extracted = ws.extracted;
                if (ws.framework) {
                    NTCState.framework = {
                        ...NTCState.framework,
                        ...ws.framework,
                        templates: {
                            ...getDefaultFrameworkTemplates(),
                            ...(ws.framework.templates || {})
                        }
                    };
                    ensureGreetingsState();
                }
            }
        } catch (e) {
            console.error('[小说转卡] 加载进度失败:', e);
        }
    }

    // ==================== 10. 主提取处理循环（含断点、超限分裂、历史快照） ====================
    async function runExtractionLoop() {
        if (NTCState.isProcessing) return;

        // 若队列为空，但用户已导入 EPUB 或 TXT，自动一键归并载入队列后再开始，彻底杜绝“点了没反应”
        if (!NTCState.chunks.length) {
            if (NTCState.epubChapters.length > 0) {
                const ok = prepareEpubChunks(true);
                if (!ok) return;
            } else if (NTCState.rawText && NTCState.rawText.trim()) {
                const ok = splitByRegexAndPrepare(true);
                if (!ok) {
                    splitBySizeAndPrepare();
                }
            } else {
                alert('请先在上方导入 TXT 或 EPUB 小说文件！');
                return;
            }
        }

        if (!NTCState.chunks.length) {
            alert('当前队列为空，请先导入小说文件或勾选有效章节！');
            return;
        }
        if (NTCState.chunks.every(c => c.status === 'done')) {
            if (!confirm('当前队列中的全部章节均已提取完成，是否直接前往「第二步：注入小白X框架」？')) return;
            switchStep(2);
            return;
        }
        NTCState.isProcessing = true;
        NTCState.isPaused = false;
        renderProcessingUI();

        try {
            for (let i = 0; i < NTCState.chunks.length; i++) {
                if (NTCState.isPaused) {
                    updateProgressStatus(`⏸️ 已暂停于第 ${i + 1}/${NTCState.chunks.length} 块，进度已自动保存。`);
                    break;
                }
                const chunk = NTCState.chunks[i];
                if (chunk.status === 'done') continue;

                NTCState.currentIndex = i;
                chunk.status = 'processing';
                chunk.error = '';
                renderProcessingUI();
                updateProgressStatus(`🧠 Patch-Agent 正在精细提取第 ${i + 1}/${NTCState.chunks.length} 块：${chunk.title} ...`);

                const isFirst = i === 0 && NTCState.extracted.plot.chapters.length === 0;
                const lastEnding = i > 0 ? String(NTCState.chunks[i - 1].content || '').slice(-500) : '';
                const prompt = isFirst
                    ? buildInitialExtractionPrompt(chunk)
                    : buildPatchAgentPrompt(chunk, i, lastEnding);

                try {
                    const response = await callSimpleAPI(prompt);
                    const parsed = cleanAndParseJson(response);

                    if (isFirst) {
                        applyInitialExtractionResult(parsed);
                    } else {
                        const res = applyPatchActions(parsed);
                        if (!res.plotUpdated) {
                            // 兜底：若模型忘记输出剧情补丁，记录提示但不中断
                            console.warn(`[小说转卡] 第 ${i + 1} 块未检测到剧情 action，尝试追加摘要保护`);
                        }
                    }

                    chunk.status = 'done';
                    await NovelToCardDB.addHistory({
                        chunkIndex: i,
                        chunkTitle: chunk.title,
                        extracted: deepClone(NTCState.extracted)
                    });
                    await saveProgressToDB();
                    renderExtractionPreview();
                    renderProcessingUI();
                } catch (err) {
                    const msg = err?.message || String(err);
                    console.error(`[小说转卡] 第 ${i + 1} 块处理失败:`, err);

                    if (isContextLimitError(msg) && chunk.content.length > 2000) {
                        // 上下文超限自动对半分裂当前块并立即重试
                        const mid = Math.floor(chunk.content.length / 2);
                        const partA = {
                            id: chunk.id + '_a',
                            title: chunk.title + ' (上)',
                            content: chunk.content.slice(0, mid),
                            status: 'pending'
                        };
                        const partB = {
                            id: chunk.id + '_b',
                            title: chunk.title + ' (下)',
                            content: chunk.content.slice(mid),
                            status: 'pending'
                        };
                        NTCState.chunks.splice(i, 1, partA, partB);
                        await saveProgressToDB();
                        updateProgressStatus(`🔀 检测到上下文超限，已将「${chunk.title}」自动拆分为两块重试...`);
                        i--; // 重新处理当前索引（partA）
                        continue;
                    }

                    chunk.status = 'failed';
                    chunk.error = msg;
                    await saveProgressToDB();
                    renderProcessingUI();
                }
            }

            if (!NTCState.isPaused) {
                const failedCount = NTCState.chunks.filter(c => c.status === 'failed').length;
                if (failedCount > 0) {
                    updateProgressStatus(`⚠️ 提取结束，有 ${failedCount} 个分块失败，可点击「🔧 重试失败块」单独修复。`);
                } else {
                    updateProgressStatus(`✅ 全部 ${NTCState.chunks.length} 块提取完成！共生成 ${NTCState.extracted.plot.chapters.length} 个剧情章节，可进入「步骤 2」注入小白X框架。`);
                }
            }
        } finally {
            NTCState.isProcessing = false;
            renderProcessingUI();
        }
    }

    // ==================== 11. UI 渲染与交互事件 ====================
    function switchStep(step) {
        NTCState.activeStep = step;
        const p1 = document.getElementById('ntc-step1-panel');
        const p2 = document.getElementById('ntc-step2-panel');
        const t1 = document.getElementById('ntc-tab-step1');
        const t2 = document.getElementById('ntc-tab-step2');
        if (p1) p1.style.display = step === 1 ? 'block' : 'none';
        if (p2) p2.style.display = step === 2 ? 'block' : 'none';
        if (t1) t1.classList.toggle('active', step === 1);
        if (t2) t2.classList.toggle('active', step === 2);

        if (step === 2) {
            syncStep2FormFromState();
            renderStep2Preview();
        }
    }

    const ntcIsEn = () => (typeof currentLanguage !== 'undefined' ? currentLanguage : localStorage.getItem('language')) === 'en';

    function renderLoreCategoriesUI() {
        const container = document.getElementById('ntc-categories-list');
        if (!container) return;
        const en = ntcIsEn();
        const strictCb = document.getElementById('ntc-strict-categories');
        if (strictCb) strictCb.checked = NTCState.strictCategories;

        const builtinCatEnMap = {
            '角色详情': 'Characters',
            '角色一览': 'Character Cast',
            '世界观与舞台背景': 'Worldview & Setting',
            '地点与场景': 'Locations & Scenes',
            '组织与势力': 'Organizations & Factions',
            '道具与能力体系': 'Items & Abilities',
            '特殊规则与伏笔': 'Special Rules & Foreshadowing',
        };

        container.innerHTML = NTCState.loreCategories.map((cat, idx) => {
            const displayName = (en && builtinCatEnMap[cat.name]) ? builtinCatEnMap[cat.name] : cat.name;
            return `
            <div class="ntc-cat-chip ${cat.enabled ? 'enabled' : 'disabled'}">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" ${cat.enabled ? 'checked' : ''} onchange="NTC.toggleCategory(${idx}, this.checked)">
                    <strong>${escHtml(displayName)}</strong>
                    <span class="ntc-badge">${cat.triggerMode === 'constant' ? (en ? 'Blue Constant' : '蓝灯常驻') : (en ? 'Keyword Trigger' : '绿灯触发')}</span>
                </label>
                <div style="display:flex;gap:4px;">
                    <button type="button" class="ntc-mini-btn" onclick="NTC.openCategoryModal(${idx})">${en ? 'Edit' : '编辑'}</button>
                    ${cat.isBuiltin ? '' : `<button type="button" class="ntc-mini-btn danger" onclick="NTC.deleteCategory(${idx})">${en ? 'Del' : '删'}</button>`}
                </div>
            </div>
        `;
        }).join('');
    }

    function updateProgressStatus(text) {
        const el = document.getElementById('ntc-progress-text');
        if (el) el.textContent = text;
    }

    function renderProcessingUI() {
        const en = ntcIsEn();
        const total = NTCState.chunks.length;
        const done = NTCState.chunks.filter(c => c.status === 'done').length;
        const failed = NTCState.chunks.filter(c => c.status === 'failed').length;
        const pct = total ? Math.round((done / total) * 100) : 0;

        const fill = document.getElementById('ntc-progress-fill');
        if (fill) fill.style.width = pct + '%';

        const statsEl = document.getElementById('ntc-queue-stats');
        if (statsEl) {
            statsEl.textContent = en
                ? `Chunks: ${total} | Done: ${done} | Failed: ${failed} | Chapters: ${NTCState.extracted.plot.chapters.length}`
                : `总块数: ${total} | 已完成: ${done} | 失败: ${failed} | 已提取章节: ${NTCState.extracted.plot.chapters.length}`;
        }

        const startBtn = document.getElementById('ntc-start-btn');
        const pauseBtn = document.getElementById('ntc-pause-btn');
        const retryBtn = document.getElementById('ntc-retry-failed-btn');
        const step2Btn = document.getElementById('ntc-go-step2-btn');
        if (startBtn) {
            startBtn.disabled = NTCState.isProcessing;
            startBtn.textContent = NTCState.isProcessing
                ? (en ? '⏳ Patch-Agent Extracting...' : '⏳ Patch-Agent 提取中...')
                : (done > 0 && done < total ? (en ? '▶️ Resume Extraction' : '▶️ 继续提取') : (en ? '🚀 Start Extraction' : '🚀 开始提取'));
        }
        if (pauseBtn) pauseBtn.style.display = NTCState.isProcessing ? 'inline-block' : 'none';
        if (retryBtn) retryBtn.style.display = (!NTCState.isProcessing && failed > 0) ? 'inline-block' : 'none';
        if (step2Btn) {
            const hasChapters = (NTCState.extracted.plot.chapters || []).length > 0;
            step2Btn.classList.toggle('ready', hasChapters);
        }

        const queueEl = document.getElementById('ntc-chunk-queue');
        if (queueEl) {
            if (!total) {
                queueEl.innerHTML = `<p style="color:#888;font-size:13px;">${en ? 'No text chunks queued yet. Import a TXT / EPUB file above and choose a splitting method.' : '尚未切分文本队列，请先在上方导入 TXT / EPUB 并选择切分方式。'}</p>`;
            } else {
                queueEl.innerHTML = NTCState.chunks.map((c, idx) => {
                    const icon = c.status === 'done' ? '✅' : c.status === 'processing' ? '⚡' : c.status === 'failed' ? '❌' : '⏳';
                    return `<div class="ntc-queue-item status-${c.status}" title="${escHtml(c.error || '')}">
                        <span>${icon} #${idx + 1} ${escHtml(c.title)}</span>
                        <span style="color:#aaa;font-size:12px;">${c.content.length}${en ? ' chars' : '字'}</span>
                    </div>`;
                }).join('');
            }
        }
    }

    function renderExtractionPreview() {
        const container = document.getElementById('ntc-extraction-preview');
        if (!container) return;
        const en = ntcIsEn();
        const chapters = NTCState.extracted.plot.chapters || [];
        const lore = NTCState.extracted.lore || {};
        const loreCount = Object.values(lore).reduce((sum, obj) => sum + Object.keys(obj || {}).length, 0);

        if (!chapters.length && !loreCount) {
            container.innerHTML = `<p style="color:#888;font-size:13px;">${en ? 'No extracted data yet. Once extraction starts, chapter outlines and lore entries maintained by Patch-Agent will refresh here live.' : '暂无提取数据。开始提取后，Patch-Agent 实时维护的每章大纲与设定将在此处实时刷新。'}</p>`;
            return;
        }

        let html = '';

        if (chapters.length) {
            html += chapters.map((ch, cIdx) => {
                const isLastCh = cIdx === chapters.length - 1;
                const ovChars = renderChapterOverviewContent(ch, isLastCh).length;
                const phHtml = (ch.phases || []).map((ph, pIdx) => {
                    const phChars = renderChapterPhaseContent(ch, ph, pIdx, isLastCh).length;
                    const scList = (ph.scenes || []).map(s => `<div class="ntc-scene-card">
                        <div class="ntc-scene-head"><b>${escHtml(s.sceneName)}</b> <span>📍 ${escHtml(s.location || (en ? 'Unspecified' : '未注明'))} | 👥 ${escHtml((s.characters || []).join(en ? ', ' : '、') || (en ? 'None' : '无'))}</span></div>
                        <div class="ntc-scene-recap">${escHtml(s.recap || '')}</div>
                    </div>`).join('');
                    return `<details class="ntc-phase-details">
                        <summary>🏷️ ${escHtml(ch.id)}_${escHtml(ph.name)} (${en ? `${(ph.scenes || []).length} scenes · ${phChars} chars` : `${(ph.scenes || []).length} 个场景 · ${phChars} 字`})</summary>
                        <div style="padding:8px 0;">${scList || `<em style="color:#888;">${en ? 'No scenes' : '暂无场景'}</em>`}</div>
                    </details>`;
                }).join('');

                return `<details class="ntc-chapter-details" ${cIdx === chapters.length - 1 ? 'open' : ''}>
                    <summary>
                        <span>📘 <b>${escHtml(ch.id)}</b> ${en ? `"${escHtml(ch.title)}" — Overview ${ovChars} chars · ${(ch.phases || []).length} phases` : `《${escHtml(ch.title)}》 — 总览 ${ovChars} 字 · ${(ch.phases || []).length} 个动态阶段`}</span>
                        <button type="button" class="ntc-mini-btn" onclick="event.stopPropagation();NTC.openChapterModal(${cIdx})">${en ? 'Edit' : '编辑'}</button>
                    </summary>
                    <div class="ntc-chapter-body">
                        <div class="ntc-overview-box">
                            <div><b>${en ? 'Phase Order: ' : '阶段推进：'}</b>${escHtml((ch.overview?.phaseOrder || []).join(' → '))}</div>
                            <div style="margin-top:4px;white-space:pre-wrap;"><b>${en ? 'Summary: ' : '本章梗概：'}</b>${escHtml(ch.overview?.summary || (en ? '(Pending)' : '（待补充）'))}</div>
                        </div>
                        ${phHtml}
                    </div>
                </details>`;
            }).join('');
        }

        if (loreCount) {
            html += `<h4 style="color:var(--primary-color);margin:16px 0 8px;">${en ? '📚 Extracted Worldbook Lore Entries' : '📚 设定世界书条目'}</h4>`;
            Object.entries(lore).forEach(([cat, entries]) => {
                const names = Object.keys(entries || {});
                if (!names.length) return;
                html += `<details class="ntc-chapter-details">
                    <summary>📂 ${escHtml(cat)} (${en ? `${names.length} entries` : `${names.length} 条`})</summary>
                    <div class="ntc-chapter-body">
                        ${names.map(name => {
                    const item = entries[name];
                    return `<div class="ntc-lore-item">
                                <div class="ntc-scene-head"><b>${escHtml(name)}</b> <span>🔑 ${escHtml((item.keywords || []).join(', '))}</span></div>
                                <div class="ntc-scene-recap">${escHtml(item.content || '')}</div>
                            </div>`;
                }).join('')}
                    </div>
                </details>`;
            });
        }

        container.innerHTML = html;
    }

    function renderGreetingsUI() {
        const en = ntcIsEn();
        const greetings = ensureGreetingsState();
        const fw = NTCState.framework;
        const activeIdx = fw.activeGreetingIdx;
        const active = greetings[activeIdx];
        const chapters = NTCState.extracted.plot.chapters || [];

        const defaultGLabel = (idx) => idx === 0
            ? (en ? 'Main Greeting' : '主开场白')
            : (en ? `Alt Greeting #${idx + 1}` : `备选开场 #${idx + 1}`);

        // 1. 顶部多开场白标签栏
        const tabsEl = document.getElementById('ntc-greeting-tabs');
        if (tabsEl) {
            tabsEl.innerHTML = greetings.map((g, idx) => {
                const startTag = g.startChapterId ? ` (${g.startChapterId})` : '';
                const hasText = (g.content || '').trim().length > 0 ? '✓' : '·';
                const lbl = (en && g.label === '主开场白') ? 'Main Greeting' : (g.label || defaultGLabel(idx));
                return `<button type="button" class="ntc-greeting-tab ${idx === activeIdx ? 'active' : ''}" onclick="NTC.selectGreeting(${idx})">${hasText} ${escHtml(lbl)}${escHtml(startTag)}</button>`;
            }).join('') + `
                <button type="button" class="ntc-mini-btn" onclick="NTC.addGreeting()">${en ? '+ Add Alt Greeting' : '+ 新增备选开场'}</button>
                ${greetings.length > 1 ? `<button type="button" class="ntc-mini-btn danger" onclick="NTC.deleteActiveGreeting()">${en ? 'Delete Greeting' : '删除当前开场'}</button>` : ''}
            `;
        }

        // 2. 当前开场白名称 & 可选指引 & 正文
        const labelInput = document.getElementById('ntc-greeting-label');
        if (labelInput) labelInput.value = (en && active.label === '主开场白') ? 'Main Greeting' : (active.label || defaultGLabel(activeIdx));
        const hintInput = document.getElementById('ntc-greeting-hint');
        if (hintInput) hintInput.value = active.customHint || '';
        const textArea = document.getElementById('ntc-first-mes');
        if (textArea) textArea.value = active.content || '';

        // 3. 起始章节下拉框（同步小白X 2.0 对应开场白的初始变量与世界书）
        const startSel = document.getElementById('ntc-greeting-start-chapter');
        if (startSel) {
            if (!chapters.length) {
                startSel.innerHTML = `<option value="">${en ? '(No chapters extracted yet)' : '（尚未提取章节）'}</option>`;
            } else {
                if (!active.startChapterId || !chapters.some(c => c.id === active.startChapterId)) {
                    active.startChapterId = active.refChapterIds[0] || chapters[0].id;
                }
                startSel.innerHTML = chapters.map(ch =>
                    `<option value="${escHtml(ch.id)}" ${ch.id === active.startChapterId ? 'selected' : ''}>${escHtml(ch.id)} ${en ? `"${escHtml(ch.title || 'Untitled')}" (First phase: ${escHtml(ch.phases?.[0]?.name || 'Default')})` : `《${escHtml(ch.title || '未命名')}》（首阶段：${escHtml(ch.phases?.[0]?.name || '默认')}）`}</option>`
                ).join('');
            }
        }

        // 4. 章节勾选列表（勾选本条开场白要参考哪些章节）
        const refListEl = document.getElementById('ntc-greeting-ref-chapters');
        if (refListEl) {
            if (!chapters.length) {
                refListEl.innerHTML = `<div style="color:#888;font-size:12px;">${en ? 'Extract at least 1 chapter in Step 1 first; all chapters will appear here for selection.' : '请先在第一步提取至少 1 个章节，此处将列出全部章节供勾选参考。'}</div>`;
            } else {
                const selectedSet = new Set(active.refChapterIds || []);
                refListEl.innerHTML = chapters.map(ch => {
                    const checked = selectedSet.has(ch.id);
                    const phaseTags = (ch.phases || []).map(p => p.name).join(' / ');
                    return `<label class="ntc-ref-ch-item ${checked ? 'checked' : ''}">
                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="NTC.toggleGreetingRefChapter('${escHtml(ch.id)}', this.checked)">
                        <div>
                            <div style="font-weight:bold;color:${checked ? '#fff' : '#ccc'};">${escHtml(ch.id)} ${en ? `"${escHtml(ch.title || 'Untitled')}"` : `《${escHtml(ch.title || '未命名')}》`}</div>
                            <div style="font-size:11px;color:#aaa;margin-top:2px;">${en ? 'Phases: ' : '阶段：'}${escHtml(phaseTags || (en ? 'None' : '无'))}</div>
                        </div>
                    </label>`;
                }).join('');
            }
        }
    }

    function syncStep2FormFromState() {
        const fw = NTCState.framework;
        ensureGreetingsState();
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
        const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

        setVal('ntc-card-name', fw.cardName || NTCState.extracted.bookTitle || (NTCState.fileName ? NTCState.fileName.replace(/\.[^/.]+$/, '') : ''));
        setVal('ntc-max-active-chars', fw.maxActiveChars || 12000);
        setVal('ntc-var-channel', fw.varUpdateChannel || 'inline_state');
        setVal('ntc-user-role-mode', fw.templates.userSetting.roleMode || 'companion');
        setChk('ntc-user-include-overview', fw.userIncludeOverview !== false);
        setVal('ntc-user-custom-hint', fw.userCustomHint || '');
        setChk('ntc-include-buttons', fw.includeManualButtons);

        const tplKeys = ['creationGuideline', 'plotProgressionRule', 'outlinePerformanceRule', 'extraThinkingChecklist', 'freeRoamGuideline', 'freeRoamThinkingChecklist', 'userSetting'];
        const defaultTpls = getDefaultFrameworkTemplates();
        tplKeys.forEach(k => {
            if (!fw.templates[k]) fw.templates[k] = defaultTpls[k];
            const tpl = fw.templates[k];
            setChk(`ntc-tpl-en-${k}`, tpl.enabled);
            setVal(`ntc-tpl-txt-${k}`, tpl.content);
        });

        renderGreetingsUI();
    }

    function readStep2FormIntoState() {
        const fw = NTCState.framework;
        const greetings = ensureGreetingsState();
        const getVal = (id, def = '') => document.getElementById(id)?.value ?? def;
        const getChk = (id, def = true) => document.getElementById(id)?.checked ?? def;

        fw.cardName = getVal('ntc-card-name').trim();
        fw.maxActiveChars = Math.max(2000, parseInt(getVal('ntc-max-active-chars', '12000'), 10) || 12000);
        fw.varUpdateChannel = getVal('ntc-var-channel', 'inline_state');
        fw.userIncludeOverview = getChk('ntc-user-include-overview', true);
        fw.userCustomHint = getVal('ntc-user-custom-hint', '');
        fw.includeManualButtons = getChk('ntc-include-buttons', true);

        const active = greetings[fw.activeGreetingIdx];
        if (active) {
            const labelEl = document.getElementById('ntc-greeting-label');
            if (labelEl) active.label = labelEl.value.trim() || (fw.activeGreetingIdx === 0 ? '主开场白' : `备选开场 #${fw.activeGreetingIdx + 1}`);
            const hintEl = document.getElementById('ntc-greeting-hint');
            if (hintEl) active.customHint = hintEl.value;
            const textEl = document.getElementById('ntc-first-mes');
            if (textEl) active.content = textEl.value;
            const startEl = document.getElementById('ntc-greeting-start-chapter');
            if (startEl && startEl.value) active.startChapterId = startEl.value;
        }
        fw.firstMes = greetings[0]?.content || '';

        const tplKeys = ['creationGuideline', 'plotProgressionRule', 'outlinePerformanceRule', 'extraThinkingChecklist', 'freeRoamGuideline', 'freeRoamThinkingChecklist', 'userSetting'];
        const defaultTpls = getDefaultFrameworkTemplates();
        tplKeys.forEach(k => {
            if (!fw.templates[k]) fw.templates[k] = defaultTpls[k];
            fw.templates[k].enabled = getChk(`ntc-tpl-en-${k}`, fw.templates[k].enabled);
            fw.templates[k].content = getVal(`ntc-tpl-txt-${k}`, fw.templates[k].content);
        });
        saveProgressToDB();
    }

    function renderStep2Preview() {
        readStep2FormIntoState();
    }

    // ==================== 12. 文件导入、切分、保存、导出与公共接口 ====================
    async function handleFileSelect(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        NTCState.fileName = file.name;
        const nameDisplay = document.getElementById('ntc-file-info');

        if (/\.epub$/i.test(file.name)) {
            if (typeof parseEpubFile !== 'function') {
                alert('EPUB 解析器未就绪，请刷新页面后重试');
                return;
            }
            if (nameDisplay) nameDisplay.textContent = `⏳ 正在解析 EPUB：${file.name}...`;
            try {
                const chapters = await parseEpubFile(file);
                NTCState.epubChapters = chapters.map((ch, idx) => ({ ...ch, checked: true, _idx: idx }));
                NTCState.rawText = '';
                renderEpubList();
                document.getElementById('ntc-epub-panel').style.display = 'block';
                document.getElementById('ntc-txt-split-grid').style.display = 'none';
                if (nameDisplay) nameDisplay.textContent = `📖 已加载 EPUB：${file.name}（共 ${chapters.length} 章）`;
            } catch (err) {
                alert('解析 EPUB 失败：' + err.message);
            }
        } else {
            document.getElementById('ntc-epub-panel').style.display = 'none';
            document.getElementById('ntc-txt-split-grid').style.display = 'grid';
            const enc = document.getElementById('ntc-encoding')?.value || 'auto';
            if (enc === 'auto' && typeof detectBestEncoding === 'function') {
                const res = await detectBestEncoding(file);
                NTCState.rawText = res.content || '';
                if (nameDisplay) nameDisplay.textContent = `📄 已加载 TXT：${file.name}（编码 ${res.encoding}，共 ${NTCState.rawText.length} 字）`;
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    NTCState.rawText = e.target.result || '';
                    if (nameDisplay) nameDisplay.textContent = `📄 已加载 TXT：${file.name}（编码 ${enc}，共 ${NTCState.rawText.length} 字）`;
                };
                reader.readAsText(file, enc === 'auto' ? 'UTF-8' : enc);
            }
        }
    }

    function renderEpubList() {
        const listEl = document.getElementById('ntc-epub-list');
        if (!listEl) return;
        const checked = NTCState.epubChapters.filter(c => c.checked);
        let effectiveCount = checked.length;
        if (typeof mergeShortChapters === 'function' && checked.length > 0) {
            const preview = mergeShortChapters(checked.map((c, idx) => ({
                title: (c.name || c.title || `章节 ${idx + 1}`).trim(),
                body: c.content || '',
                content: c.content || ''
            })), 500);
            effectiveCount = preview.merged.length;
        }
        const statsEl = document.getElementById('ntc-epub-stats');
        if (statsEl) {
            const mergeHint = effectiveCount !== checked.length ? ` → 自动归并短/空章后 ${effectiveCount} 块` : '';
            statsEl.textContent = `共 ${NTCState.epubChapters.length} 章，已选 ${checked.length} 章${mergeHint}`;
        }

        listEl.innerHTML = NTCState.epubChapters.map((ch, idx) => {
            const chTitle = (ch.name || ch.title || `章节 ${idx + 1}`).trim();
            const len = (ch.content || '').trim().length;
            const shortBadge = len < 500 ? `<span style="color:#f39c12;font-size:11px;margin-left:4px;">(自动归并)</span>` : '';
            return `
            <label class="ntc-epub-item">
                <input type="checkbox" ${ch.checked ? 'checked' : ''} onchange="NTC.toggleEpubChapter(${idx}, this.checked)">
                <span>${escHtml(chTitle)}</span>
                <span style="color:#aaa;font-size:12px;margin-left:auto;">${len.toLocaleString()}字${shortBadge}</span>
            </label>`;
        }).join('');
    }

    function splitByRegexAndPrepare(silentIfNoMatch = false) {
        if (!NTCState.rawText) { if (!silentIfNoMatch) alert('请先导入 TXT 文件！'); return false; }
        const regexStr = document.getElementById('ntc-chapter-regex')?.value || '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]';
        let regex;
        try {
            regex = new RegExp(`(^|\\n)\\s*(${regexStr}[^\\n]*)`, 'g');
        } catch (e) {
            if (!silentIfNoMatch) alert('正则表达式无效：' + e.message);
            return false;
        }
        const matches = [...NTCState.rawText.matchAll(regex)];
        const rawItems = [];
        if (!matches.length) {
            if (!silentIfNoMatch) alert('未匹配到任何章节标题，请调整正则或改用「按字数切分」。');
            return false;
        }
        if (matches[0].index > 20) {
            const pre = NTCState.rawText.slice(0, matches[0].index).trim();
            if (pre) {
                rawItems.push({ title: '楔子/序章', body: pre, content: pre });
            }
        }
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = i + 1 < matches.length ? matches[i + 1].index : NTCState.rawText.length;
            const title = (matches[i][2] || `第${i + 1}章`).trim();
            const content = NTCState.rawText.slice(start, end).trim();
            rawItems.push({ title, body: content, content });
        }

        const { merged, mergedShortCount, droppedEmptyCount } = typeof mergeShortChapters === 'function'
            ? mergeShortChapters(rawItems, 500)
            : { merged: rawItems, mergedShortCount: 0, droppedEmptyCount: 0 };

        NTCState.chunks = merged.map((ch, idx) => ({
            id: `ch_${idx + 1}`,
            title: ch.title || `第${idx + 1}章`,
            content: ch.content,
            status: 'pending'
        }));
        NTCState.currentIndex = 0;
        saveProgressToDB();
        renderProcessingUI();
        const mergeNote = (mergedShortCount + droppedEmptyCount) > 0
            ? `（已自动将 ${mergedShortCount + droppedEmptyCount} 个少于 500 字的短/空章归纳至相邻章）`
            : '';
        updateProgressStatus(`✅ 已按章节切分为 ${NTCState.chunks.length} 块${mergeNote}，点击「🚀 开始提取」启动 Patch-Agent！`);
        return true;
    }

    function splitBySizeAndPrepare() {
        if (!NTCState.rawText) { alert('请先导入 TXT 文件！'); return; }
        const sizeVal = document.getElementById('ntc-split-size')?.value || '10000';
        const chunkSize = sizeVal === 'custom'
            ? Math.max(1000, parseInt(document.getElementById('ntc-split-size-custom')?.value || '10000', 10))
            : parseInt(sizeVal, 10);

        const chunks = [];
        const text = NTCState.rawText;
        let pos = 0;
        let idx = 1;
        while (pos < text.length) {
            let end = Math.min(pos + chunkSize, text.length);
            if (end < text.length) {
                const nl = text.lastIndexOf('\n', end);
                if (nl > pos + chunkSize * 0.6) end = nl;
            }
            const part = text.slice(pos, end).trim();
            if (part) {
                chunks.push({ id: `sz_${idx}`, title: `分段 ${idx}`, content: part, status: 'pending' });
                idx++;
            }
            pos = end;
        }
        NTCState.chunks = chunks;
        NTCState.currentIndex = 0;
        saveProgressToDB();
        renderProcessingUI();
        updateProgressStatus(`✅ 已按每块约 ${chunkSize} 字切分为 ${chunks.length} 块，点击「🚀 开始 / 继续提取」启动 Patch-Agent！`);
    }

    function prepareEpubChunks(silent = false) {
        const selected = NTCState.epubChapters.filter(c => c.checked);
        if (!selected.length) { alert('请至少勾选一个 EPUB 章节！'); return false; }
        const rawItems = selected.map((c, idx) => {
            const title = (c.name || c.title || `第${idx + 1}章`).trim();
            const body = c.content || '';
            const combined = title && body.trim() ? `${title}\n\n${body}` : body;
            return { title, body, content: combined };
        });
        const { merged, mergedShortCount, droppedEmptyCount } = typeof mergeShortChapters === 'function'
            ? mergeShortChapters(rawItems, 500)
            : { merged: rawItems, mergedShortCount: 0, droppedEmptyCount: 0 };

        if (!merged.length) { alert('所选章节均无实质文本内容，请重新勾选！'); return false; }

        NTCState.chunks = merged.map((c, idx) => ({
            id: `epub_${idx + 1}`,
            title: c.title || `第${idx + 1}章`,
            content: c.content || '',
            status: 'pending'
        }));
        NTCState.currentIndex = 0;
        saveProgressToDB();
        renderProcessingUI();
        const mergeNote = (mergedShortCount + droppedEmptyCount) > 0
            ? `（已自动将 ${mergedShortCount + droppedEmptyCount} 个少于 500 字的短/空章归纳至相邻章）`
            : '';
        updateProgressStatus(`✅ 已导入 ${NTCState.chunks.length} 个 EPUB 章节块${mergeNote}，点击「🚀 开始提取」启动 Patch-Agent！`);
        if (!silent) {
            document.getElementById('ntc-start-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return true;
    }

    // 导出/导入步骤 1 提取中间数据（方便二次微调或跨设备继续打包）
    function exportExtractedData() {
        const name = getBookBaseName().replace(/[/\\?%*:|"<>]/g, '_');
        const blob = new Blob([JSON.stringify(NTCState.extracted, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}-小说转卡提取数据.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importExtractedData(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed.plot?.chapters && !parsed.lore) {
                    throw new Error('JSON 缺少 plot.chapters 或 lore 字段');
                }
                NTCState.extracted = {
                    bookTitle: parsed.bookTitle || file.name.replace(/\.json$/i, ''),
                    plot: { chapters: (parsed.plot?.chapters || []).map((c, i) => normalizeChapterObj(c, i + 1)) },
                    lore: parsed.lore || {}
                };
                await saveProgressToDB();
                renderExtractionPreview();
                renderProcessingUI();
                alert(`✅ 已导入 ${NTCState.extracted.plot.chapters.length} 个剧情章节数据，可直接进入步骤 2 注入框架！`);
            } catch (err) {
                alert('导入提取数据失败：' + err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
        event.target.value = '';
    }

    // 构建全书设定世界书摘要（供 AI 定制 <user> 身份设定）
    function buildFullLoreSummaryForUserDesign() {
        const lore = NTCState.extracted.lore || {};
        const blocks = [];
        let totalLen = 0;
        const MAX_LORE_CHARS = 300000;
        // 优先放：世界观、角色一览、地点/组织，再放角色详情
        const orderedCats = Object.keys(lore).sort((a, b) => {
            const rank = (k) => k.includes('世界观') ? 1 : k.includes('角色一览') ? 2 : k.includes('角色详情') ? 4 : 3;
            return rank(a) - rank(b);
        });
        for (const cat of orderedCats) {
            const entries = lore[cat] || {};
            const names = Object.keys(entries);
            if (!names.length) continue;
            blocks.push(`### 【${cat}】`);
            for (const name of names) {
                const raw = String(entries[name]?.content || '').trim();
                const clip = raw;
                if (totalLen + clip.length > MAX_LORE_CHARS) break;
                blocks.push(`- **${name}**：\n${clip}`);
                totalLen += clip.length;
            }
            if (totalLen >= MAX_LORE_CHARS) break;
        }
        return blocks.join('\n') || '（暂无额外设定世界书）';
    }

    // 构建全书章节总览摘要（只取 overview，不塞冗长细纲，供编剧全局视角设计贯穿全篇的 <user> 身份）
    function buildAllOverviewsSummary() {
        const chapters = NTCState.extracted.plot.chapters || [];
        if (!chapters.length) return '（暂无剧情章节）';
        return chapters.map(ch => {
            const meta = ch.overview?.meta || {};
            const metaText = Object.entries(meta).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('、') : v}`).join(' | ');
            const stages = (ch.phases || []).map(p => p.name).join(' → ');
            return `- **${ch.id} 《${ch.title || '未命名'}》**（阶段：${stages || '无'}）\n  元信息：${metaText || '无'}\n  梗概：${ch.overview?.summary || '无'}`;
        }).join('\n\n');
    }

    // AI 参考全书设定（及可选各章总览）生成具体的 1️⃣User设定
    async function aiGenerateUserSetting() {
        const chapters = NTCState.extracted.plot.chapters || [];
        const loreCount = Object.values(NTCState.extracted.lore || {}).reduce((s, o) => s + Object.keys(o || {}).length, 0);
        if (!chapters.length && !loreCount) {
            alert('请先完成步骤 1 的原著提取，再生成 <user> 身份设定。');
            return;
        }
        readStep2FormIntoState();
        const fw = NTCState.framework;
        const mode = fw.templates.userSetting.roleMode || 'companion';
        const modeDesc = {
            companion: '作为新增的同行者/关键变量自然融入原著核心人物圈子与主线舞台（不是空气旁观者，也不是凭空出现的陌生人）',
            protagonist: '直接扮演/接管原著的核心主角视角，亲自经历全书主线事件',
            observer: '作为掌握部分内情或特殊立场的入局者/关键知情者介入原著',
            custom: '严格遵循下方用户自定义偏好定位'
        }[mode] || '自然融入原著核心舞台与主线';

        const btn = document.getElementById('ntc-ai-userset-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在结合全书设定定制 <user> 身份...'; }
        try {
            const includeOv = fw.userIncludeOverview !== false;
            const prompt = (typeof PromptManager !== 'undefined')
                ? PromptManager.render('ntc_user_setting', {
                    modeDesc,
                    userCustomHintBlock: fw.userCustomHint ? `【用户额外偏好】：${fw.userCustomHint}\n` : '',
                    bookTitle: getBookBaseName(),
                    fullLoreSummary: buildFullLoreSummaryForUserDesign(),
                    overviewsBlock: includeOv ? `\n【二、全书各章总览（仅供编剧全局把握舞台与主线脉络）】：\n${buildAllOverviewsSummary()}` : ''
                })
                : `你是顶尖的互动剧情游戏卡架构师。请充分阅读以下原著的全部设定世界书${includeOv ? '与全书各章总览' : ''}，为玩家角色 \`<user>\` 设计一份**具体、立体、能无缝融入并贯穿整部作品多个舞台**的 \`User设定\`。

========================================
【核心设计目标（极其重要，杜绝“陌生人尬聊”和“换章掉线”）】
========================================
1. **必须给出具体落地的身份与物理锚点**：明确说明 \`<user>\` 在这个世界里的合理社会/日常身份、常规活动地点，绝不能写“一个神秘的同行者”这种空话！
2. **必须建立与核心角色的既有关系锚点**：明确至少 1～3 位原著核心人物开局就认识 \`<user>\`（或有直接顺理成章的相识契机与初始态度），确保一开场就能自然对话推进剧情，绝对避免“门外陌生人尬聊”！
3. **贯穿全书舞台的合理性**：${includeOv ? '结合全书各章的舞台迁移与核心矛盾，确保这个身份能自然跟进后续多章剧情，不会演完序章或第一章就掉线。' : '确保这个身份能自然融入核心世界观与主要舞台。'}
4. **防剧透边界**：如果设计了与原著主线暗线挂钩的隐藏定位，必须标注“前期仅作为暗线背景，严禁提前剧透”。
5. **严禁替 <user> 写死外貌性别姓名**（统一用 \`<user>\` 指代，留给玩家扮演空间），且严禁凭空捏造破坏原著世界观上限的外挂。

【定位模式】：${modeDesc}
${fw.userCustomHint ? `【用户额外偏好】：${fw.userCustomHint}\n` : ''}
【作品名称】：${getBookBaseName()}

【一、全书设定世界书】：
${buildFullLoreSummaryForUserDesign()}
${includeOv ? `\n【二、全书各章总览（仅供编剧全局把握舞台与主线脉络）】：\n${buildAllOverviewsSummary()}` : ''}

请直接输出结构清晰的 YAML/分层文本格式 \`User设定\`（包含：基本档案/身份与常驻位置、与核心角色的既有关系锚点、主线融入与互动定位、可选隐藏暗线与防剧透说明），不要输出代码块标记或多余解释：`;

            const res = await callSimpleAPI(prompt);
            const clean = String(res || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').trim();
            fw.templates.userSetting.content = clean;
            const ta = document.getElementById('ntc-tpl-txt-userSetting');
            if (ta) ta.value = clean;
            await saveProgressToDB();
            renderStep2Preview();
        } catch (err) {
            alert('生成 <user> 身份设定失败：' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ AI 参考全书定制 <user> 身份'; }
        }
    }

    // AI 基于「当前开场白勾选的参考章节 + 起始章节 + 已定制的 User设定」生成开场白
    async function aiGenerateFirstMes() {
        const chapters = NTCState.extracted.plot.chapters || [];
        if (!chapters.length) {
            alert('请先完成步骤 1 的章节提取。');
            return;
        }
        readStep2FormIntoState();
        const greetings = ensureGreetingsState();
        const active = greetings[NTCState.framework.activeGreetingIdx];
        const refIds = (active.refChapterIds && active.refChapterIds.length)
            ? active.refChapterIds
            : [active.startChapterId || chapters[0].id];

        const refChapters = refIds.map(id => chapters.find(c => c.id === id)).filter(Boolean);
        if (!refChapters.length) {
            alert('请至少勾选一个参考章节！');
            return;
        }
        const startCh = chapters.find(c => c.id === active.startChapterId) || refChapters[0];

        // 组装勾选章节的完整总览 + 阶段场景细纲（控制字数防爆）
        const lastChapterId = chapters[chapters.length - 1]?.id;
        const refPlotText = refChapters.map(ch => {
            const isLastCh = ch.id === lastChapterId;
            const ov = renderChapterOverviewContent(ch, isLastCh);
            const phs = (ch.phases || []).map((p, idx) => renderChapterPhaseContent(ch, p, idx, isLastCh)).join('\n\n');
            return `${ov}\n\n${phs}`;
        }).join('\n\n====================\n\n');

        // 提取勾选章节中出场的主要角色详情（让开场白人设与外貌服装高度还原）
        const charLore = NTCState.extracted.lore['角色详情'] || {};
        const appearedNames = new Set();
        refChapters.forEach(ch => (ch.phases || []).forEach(p => (p.scenes || []).forEach(s => (s.characters || []).forEach(n => appearedNames.add(n)))));
        const charRefs = Object.entries(charLore)
            .filter(([name]) => appearedNames.size === 0 || [...appearedNames].some(a => name.includes(a) || a.includes(name)))
            .map(([name, item]) => `### ${name}\n${String(item.content || '')}`)
            .join('\n\n');

        const btn = document.getElementById('ntc-ai-firstmes-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在结合所选章节与 User 设定生成开场白...'; }
        try {
            const prompt = (typeof PromptManager !== 'undefined')
                ? PromptManager.render('ntc_first_mes', {
                    bookTitle: getBookBaseName(),
                    greetingLabel: active.label || '',
                    startChapterInfo: `${startCh.id} 《${startCh.title}》`,
                    customHintBlock: active.customHint ? `【本开场额外指引】：${active.customHint}\n` : '',
                    userSetting: NTCState.framework.templates.userSetting.content || '',
                    charRefs: charRefs || '（参考章节内描述）',
                    refPlotText
                })
                : `你是顶尖的互动视觉小说与 SillyTavern 角色卡编剧。请根据【已定制的 <user> 身份设定】与【用户勾选的参考章节】，为本作撰写一段极具沉浸感、节奏流畅、**绝不卡死在原地**的开场白（700～1300字，中文）。

========================================
【开场白核心铁律（必须严格遵守）】
========================================
1. **严格锚定起始章节的真实时空与行动现场**：
   - 本开场白对应的**开局起始章节**为：【${startCh.id} 《${startCh.title}》】。
   - 如果参考章节里包含了纯背景介绍/静态回忆（如序章心理独白），只需用 1～2 段简短氛围带过，**必须立刻落脚到起始章节中第一个有具体地点、在场人物与实质事件推动的行动场景**！
   - **严禁自作聪明编造大纲里根本不存在且与后续时空脱节的原创桥段**（例如原著在下午五点放学路上，绝不可私自改成下午三点在家等陌生人按门铃！）。
2. **明确交代 <user> 的具体身份、物理位置与人际自然连接**：
   - 严格依照下方【<user> 身份设定】，在开场白里自然点明 \`<user>\` 当下身在何处、与在场角色是什么关系，确保角色对 \`<user>\` 的反应合情合理，绝不把 \`<user>\` 写成来历不明的哑巴陌生人。
3. **动态流动的收尾节点（防拖沓防卡死）**：
   - 结尾必须停在一个**正在向前流动的真实事件/对话节点**上——既给 \`<user>\` 留出清晰的回应与介入空间，也保证即使玩家只回复“继续”，在场原著角色也能顺着事件流直接往下推，绝不陷入“互相干瞪眼等对方先开口”的死胡同！
4. **严禁代替 <user> 发言、做决定或抢夺主动权**。
5. 直接输出开场白正文，不要输出任何标题包装或多余解释。

【作品名称】：${getBookBaseName()}
【开场白标签】：${active.label}
【指定开局起始章节】：${startCh.id} 《${startCh.title}》
${active.customHint ? `【本开场额外指引】：${active.customHint}\n` : ''}
【已定制的 <user> 身份设定】：
${NTCState.framework.templates.userSetting.content}

【登场角色人设参考】：
${charRefs || '（参考章节内描述）'}

【用户勾选的参考章节内容】：
${refPlotText}`;

            const res = await callSimpleAPI(prompt);
            const clean = String(res || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            active.content = clean;
            if (NTCState.framework.activeGreetingIdx === 0) {
                NTCState.framework.firstMes = clean;
            }
            const ta = document.getElementById('ntc-first-mes');
            if (ta) ta.value = clean;
            await saveProgressToDB();
            renderGreetingsUI();
            renderStep2Preview();
        } catch (err) {
            alert('生成开场白失败：' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ 基于已选章节 + User设定 生成开场白'; }
        }
    }

    async function saveCardToLibrary() {
        if (typeof checkDbReady === 'function' && !(await checkDbReady())) return;
        readStep2FormIntoState();
        if (!NTCState.extracted.plot.chapters.length) {
            if (!confirm('当前还没有提取任何剧情章节，确定要保存空框架角色卡到库吗？')) return;
        }
        const card = assembleCharacterCard();
        try {
            const tx = db.transaction(['characters'], 'readwrite');
            const req = tx.objectStore('characters').add(card);
            req.onsuccess = (e) => {
                const newId = e.target.result;
                if (confirm(`✅ 小说角色卡《${card.name}》已成功保存到角色库！\n包含 ${card.worldbook.length} 条世界书、${card.xiaobaix_tasks.length} 个小白X任务、${card.regex_scripts.length} 条正则。\n\n是否立即在角色编辑器中打开查看与微调？`)) {
                    if (typeof showEditorView === 'function') showEditorView(newId);
                }
            };
            req.onerror = (err) => alert('保存到角色库失败：' + err.target.error.message);
        } catch (err) {
            alert('保存失败：' + err.message);
        }
    }

    function exportCardV3Json() {
        readStep2FormIntoState();
        if (!NTCState.extracted.plot.chapters.length) {
            if (!confirm('当前还没有提取任何剧情章节，确定要导出空框架角色卡 JSON 吗？')) return;
        }
        const card = assembleCharacterCard();
        const v3Obj = typeof buildV3Card === 'function' ? buildV3Card(card) : card;
        const safeName = card.name.replace(/[/\\?%*:|"<>]/g, '_');
        const blob = new Blob([JSON.stringify(v3Obj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}-小白X剧情卡.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`📦 已导出 SillyTavern V3 角色卡：${safeName}-小白X剧情卡.json\n\n导入酒馆后请确认：\n1. 小白X → 变量管理选择【2.0 (state)】\n2. 小白X → 循环任务已启用\n3. 新建聊天即可自动初始化并动态切换章节世界书！`);
    }

    // 历史快照回退弹窗
    async function openHistoryModal() {
        const list = await NovelToCardDB.getAllHistory();
        if (!list.length) { alert('暂无历史快照记录。'); return; }
        const modal = document.getElementById('ntc-history-modal');
        const body = document.getElementById('ntc-history-list');
        if (!modal || !body) return;
        body.innerHTML = list.slice().reverse().map(item => `
            <div class="ntc-preview-row" style="padding:8px;">
                <div>
                    <b>#${item.chunkIndex + 1} ${escHtml(item.chunkTitle || '')}</b>
                    <div style="font-size:12px;color:#aaa;">${new Date(item.timestamp).toLocaleString()} · 共 ${item.extracted?.plot?.chapters?.length || 0} 章</div>
                </div>
                <button type="button" class="ntc-mini-btn" onclick="NTC.restoreHistory(${item.id})">回退至此</button>
            </div>
        `).join('');
        modal.style.display = 'flex';
    }

    async function restoreHistory(historyId) {
        const list = await NovelToCardDB.getAllHistory();
        const item = list.find(h => h.id === historyId);
        if (!item) return;
        if (!confirm(`确定回退到「#${item.chunkIndex + 1} ${item.chunkTitle}」处理完成时的状态吗？`)) return;
        NTCState.extracted = deepClone(item.extracted);
        NTCState.chunks.forEach((c, idx) => {
            if (idx > item.chunkIndex) c.status = 'pending';
        });
        await saveProgressToDB();
        renderExtractionPreview();
        renderProcessingUI();
        document.getElementById('ntc-history-modal').style.display = 'none';
    }

    // 自定义分类新增/编辑弹窗
    let editingCatIndex = -1;
    function openCategoryModal(idx = -1) {
        editingCatIndex = idx;
        const cat = idx >= 0 ? NTCState.loreCategories[idx] : {
            name: '', enabled: true, isBuiltin: false, triggerMode: 'keyword',
            position: 0, order: 215, entryExample: '', keywordsExample: [], contentGuide: ''
        };
        document.getElementById('ntc-cat-modal-title').textContent = idx >= 0 ? `编辑设定分类：${cat.name}` : '新增设定分类';
        document.getElementById('ntc-cat-name').value = cat.name;
        document.getElementById('ntc-cat-name').disabled = Boolean(cat.isBuiltin);
        document.getElementById('ntc-cat-trigger').value = cat.triggerMode || 'keyword';
        document.getElementById('ntc-cat-example').value = cat.entryExample || '';
        document.getElementById('ntc-cat-keywords').value = (cat.keywordsExample || []).join(', ');
        document.getElementById('ntc-cat-guide').value = cat.contentGuide || '';
        document.getElementById('ntc-category-modal').style.display = 'flex';
    }

    async function saveCategoryFromModal() {
        const name = document.getElementById('ntc-cat-name').value.trim();
        if (!name) { alert('分类名称不能为空！'); return; }
        const catData = {
            name,
            enabled: editingCatIndex >= 0 ? NTCState.loreCategories[editingCatIndex].enabled : true,
            isBuiltin: editingCatIndex >= 0 ? NTCState.loreCategories[editingCatIndex].isBuiltin : false,
            triggerMode: document.getElementById('ntc-cat-trigger').value || 'keyword',
            position: editingCatIndex >= 0 ? NTCState.loreCategories[editingCatIndex].position : 0,
            order: editingCatIndex >= 0 ? NTCState.loreCategories[editingCatIndex].order : 215,
            entryExample: document.getElementById('ntc-cat-example').value.trim() || `${name}名称`,
            keywordsExample: document.getElementById('ntc-cat-keywords').value.split(/[,，、]+/).map(s => s.trim()).filter(Boolean),
            contentGuide: document.getElementById('ntc-cat-guide').value.trim() || `基于原文描述，使用 **字段名**: 分段提取。`
        };
        if (editingCatIndex >= 0) {
            NTCState.loreCategories[editingCatIndex] = catData;
        } else {
            if (NTCState.loreCategories.some(c => c.name === name)) {
                alert('该分类名称已存在！');
                return;
            }
            NTCState.loreCategories.push(catData);
        }
        await saveProgressToDB();
        renderLoreCategoriesUI();
        document.getElementById('ntc-category-modal').style.display = 'none';
    }

    // ==================== 12.5 章节编辑弹窗 ====================
    let editingChapterIdx = -1;
    let editingChapterDraft = null;

    function openChapterModal(idx) {
        const ch = NTCState.extracted.plot.chapters[idx];
        if (!ch) return;
        editingChapterIdx = idx;
        editingChapterDraft = deepClone(ch);
        if (!editingChapterDraft.overview) editingChapterDraft.overview = { meta: {}, phaseOrder: [], summary: '', transitionCondition: '' };
        if (!Array.isArray(editingChapterDraft.phases)) editingChapterDraft.phases = [];

        const titleEl = document.getElementById('ntc-ch-modal-title');
        if (titleEl) titleEl.textContent = `编辑章节：${ch.id} 《${ch.title || '未命名'}》`;
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
        setVal('ntc-ch-id', editingChapterDraft.id || '');
        setVal('ntc-ch-title', editingChapterDraft.title || '');
        setVal('ntc-ch-summary', editingChapterDraft.overview.summary || '');
        setVal('ntc-ch-transition', editingChapterDraft.overview.transitionCondition || '');

        renderChapterModalPhases();
        const modal = document.getElementById('ntc-chapter-modal');
        if (modal) modal.style.display = 'flex';
    }

    function syncChapterModalDraftFromDom() {
        if (!editingChapterDraft) return;
        const container = document.getElementById('ntc-ch-phases-editor');
        if (!container) return;
        const phaseEls = container.querySelectorAll('.ntc-ch-phase-edit');
        const phases = [];
        phaseEls.forEach(pEl => {
            const pName = pEl.querySelector('.ntc-pe-name')?.value.trim() || '';
            const pSummary = pEl.querySelector('.ntc-pe-summary')?.value.trim() || '';
            const scenes = [];
            pEl.querySelectorAll('.ntc-ch-scene-edit').forEach(sEl => {
                const charsRaw = sEl.querySelector('.ntc-se-chars')?.value || '';
                scenes.push({
                    sceneName: sEl.querySelector('.ntc-se-name')?.value.trim() || '',
                    location: sEl.querySelector('.ntc-se-loc')?.value.trim() || '',
                    characters: charsRaw.split(/[,，、]+/).map(s => s.trim()).filter(Boolean),
                    recap: sEl.querySelector('.ntc-se-recap')?.value.trim() || ''
                });
            });
            phases.push({ name: pName, summary: pSummary, scenes });
        });
        editingChapterDraft.phases = phases;
    }

    function renderChapterModalPhases() {
        const container = document.getElementById('ntc-ch-phases-editor');
        if (!container || !editingChapterDraft) return;
        const phases = editingChapterDraft.phases || [];
        if (!phases.length) {
            container.innerHTML = '<div style="color:#888;font-size:12px;padding:8px 0;">暂无动态阶段，点击右上角「+ 新增阶段」添加。</div>';
            return;
        }
        container.innerHTML = phases.map((ph, pIdx) => {
            const scenes = ph.scenes || [];
            const scenesHtml = scenes.map((sc, sIdx) => `
                <div class="ntc-ch-scene-edit" style="background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px;margin-top:6px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px;">
                        <input type="text" class="ntc-se-name" value="${escHtml(sc.sceneName || '')}" placeholder="场景名（如 01-初遇）" style="padding:5px 7px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;color:#fff;font-size:12px;">
                        <input type="text" class="ntc-se-loc" value="${escHtml(sc.location || '')}" placeholder="地点" style="padding:5px 7px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;color:#fff;font-size:12px;">
                        <input type="text" class="ntc-se-chars" value="${escHtml((sc.characters || []).join('、'))}" placeholder="在场角色（顿号分隔）" style="padding:5px 7px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;color:#fff;font-size:12px;">
                        <button type="button" class="ntc-mini-btn danger" onclick="NTC.removeChapterModalScene(${pIdx}, ${sIdx})">删</button>
                    </div>
                    <textarea class="ntc-se-recap" rows="3" placeholder="场景复述" style="width:100%;box-sizing:border-box;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;color:#fff;font-size:12px;resize:vertical;">${escHtml(sc.recap || '')}</textarea>
                </div>
            `).join('');
            return `
                <details class="ntc-chapter-details ntc-ch-phase-edit" open>
                    <summary>
                        <span>阶段 ${pIdx + 1}：<b>${escHtml(ph.name || '未命名阶段')}</b>（${scenes.length} 个场景）</span>
                        <span style="display:flex;gap:6px;" onclick="event.stopPropagation()">
                            <button type="button" class="ntc-mini-btn" onclick="NTC.addChapterModalScene(${pIdx})">+ 场景</button>
                            <button type="button" class="ntc-mini-btn danger" onclick="NTC.removeChapterModalPhase(${pIdx})">删阶段</button>
                        </span>
                    </summary>
                    <div style="padding:8px 10px;">
                        <div style="display:grid;grid-template-columns:200px 1fr;gap:8px;margin-bottom:6px;">
                            <input type="text" class="ntc-pe-name" value="${escHtml(ph.name || '')}" placeholder="阶段名称" style="padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;color:#fff;font-size:12px;">
                            <input type="text" class="ntc-pe-summary" value="${escHtml(ph.summary || '')}" placeholder="阶段概述（可选）" style="padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;color:#fff;font-size:12px;">
                        </div>
                        ${scenesHtml || '<div style="color:#777;font-size:12px;margin-top:4px;">暂无场景，可点击右上角「+ 场景」添加。</div>'}
                    </div>
                </details>
            `;
        }).join('');
    }

    function addChapterModalPhase() {
        if (!editingChapterDraft) return;
        syncChapterModalDraftFromDom();
        editingChapterDraft.phases.push({
            name: `阶段${editingChapterDraft.phases.length + 1}`,
            summary: '',
            scenes: []
        });
        renderChapterModalPhases();
    }

    function removeChapterModalPhase(pIdx) {
        if (!editingChapterDraft) return;
        syncChapterModalDraftFromDom();
        editingChapterDraft.phases.splice(pIdx, 1);
        renderChapterModalPhases();
    }

    function addChapterModalScene(pIdx) {
        if (!editingChapterDraft) return;
        syncChapterModalDraftFromDom();
        const ph = editingChapterDraft.phases[pIdx];
        if (!ph) return;
        if (!Array.isArray(ph.scenes)) ph.scenes = [];
        const nextNum = String(ph.scenes.length + 1).padStart(2, '0');
        ph.scenes.push({ sceneName: `${nextNum}-新场景`, location: '', characters: [], recap: '' });
        renderChapterModalPhases();
    }

    function removeChapterModalScene(pIdx, sIdx) {
        if (!editingChapterDraft) return;
        syncChapterModalDraftFromDom();
        const ph = editingChapterDraft.phases[pIdx];
        if (!ph || !Array.isArray(ph.scenes)) return;
        ph.scenes.splice(sIdx, 1);
        renderChapterModalPhases();
    }

    async function saveChapterFromModal() {
        if (editingChapterIdx < 0 || !editingChapterDraft) return;
        const origCh = NTCState.extracted.plot.chapters[editingChapterIdx];
        if (!origCh) return;

        syncChapterModalDraftFromDom();

        const newId = (document.getElementById('ntc-ch-id')?.value || '').trim();
        const newTitle = (document.getElementById('ntc-ch-title')?.value || '').trim();
        const newSummary = (document.getElementById('ntc-ch-summary')?.value || '').trim();
        const newTransition = (document.getElementById('ntc-ch-transition')?.value || '').trim();

        if (!newId) { alert('章节编号不能为空！'); return; }
        const duplicate = NTCState.extracted.plot.chapters.some((c, i) => i !== editingChapterIdx && c.id === newId);
        if (duplicate) { alert(`章节编号「${newId}」已存在，请更换。`); return; }

        const oldId = origCh.id;
        const m = newId.match(/^A(\d+)_C(\d+)$/i);
        const updatedPhases = (editingChapterDraft.phases || []).map((ph, idx) => ({
            name: ph.name || `阶段${idx + 1}`,
            summary: ph.summary || '',
            scenes: (ph.scenes || []).map((sc, sIdx) => ({
                sceneName: sc.sceneName || `${String(sIdx + 1).padStart(2, '0')}-场景${sIdx + 1}`,
                location: sc.location || '',
                characters: Array.isArray(sc.characters) ? sc.characters : [],
                recap: sc.recap || ''
            }))
        }));

        origCh.id = newId;
        if (m) {
            origCh.act = parseInt(m[1], 10);
            origCh.chapter = parseInt(m[2], 10);
        }
        origCh.title = newTitle || origCh.title;
        if (!origCh.overview) origCh.overview = { meta: {}, phaseOrder: [], summary: '', transitionCondition: '' };
        origCh.overview.summary = newSummary;
        origCh.overview.transitionCondition = newTransition || '本章节全部阶段演绎完毕后进入下一章';
        origCh.overview.phaseOrder = updatedPhases.map(p => p.name);
        origCh.phases = updatedPhases;

        if (oldId && oldId !== newId && Array.isArray(NTCState.framework.greetings)) {
            NTCState.framework.greetings.forEach(g => {
                if (g.startChapterId === oldId) g.startChapterId = newId;
                if (Array.isArray(g.refChapterIds)) {
                    g.refChapterIds = g.refChapterIds.map(id => (id === oldId ? newId : id));
                }
            });
        }

        await saveProgressToDB();
        renderExtractionPreview();
        renderGreetingsUI();
        if (NTCState.activeStep === 2) renderStep2Preview();
        document.getElementById('ntc-chapter-modal').style.display = 'none';
        editingChapterIdx = -1;
        editingChapterDraft = null;
    }

    async function deleteChapterFromModal() {
        if (editingChapterIdx < 0) return;
        const ch = NTCState.extracted.plot.chapters[editingChapterIdx];
        if (!ch) return;
        if (!confirm(`确定删除章节 ${ch.id} 《${ch.title || ''}》吗？`)) return;
        NTCState.extracted.plot.chapters.splice(editingChapterIdx, 1);
        await saveProgressToDB();
        renderExtractionPreview();
        renderGreetingsUI();
        if (NTCState.activeStep === 2) renderStep2Preview();
        document.getElementById('ntc-chapter-modal').style.display = 'none';
        editingChapterIdx = -1;
        editingChapterDraft = null;
    }

    function applyUserRolePreset(mode) {
        const presets = {
            companion: `玩家设定（<user>）：
- 身份定位：与原著核心人物一同卷入故事的同行者与关键变量。
- 融入方式：自然地存在于当前场景与主线事件中，各角色会依据自身原设性格对 <user> 产生真实反应（好奇、警惕、信任或依赖）。
- 主导权：<user> 并非旁观者，其发言、选择与干涉能够真实影响事件细节与人物关系走向。`,
            protagonist: `玩家设定（<user>）：
- 身份定位：<user> 直接扮演原著的核心第一视角主角，亲自经历故事中的全部关键事件。
- 融入方式：所有原著主角的遭遇、对话对象与核心矛盾均直接面向 <user> 展开；其余角色按原著中对主角的态度与 <user> 互动。
- 主导权：严禁代替 <user> 说话或做决定，允许 <user> 做出不同于原著的选择并真实推演后果。`,
            observer: `玩家设定（<user>）：
- 身份定位：掌握部分内情或带有特殊立场的入局知情者，与原著核心人物共享主要舞台。
- 融入方式：在关键事件节点自然登场，既可顺势引导人物走向，也可在暗中观察与介入。
- 主导权：严禁代替 <user> 决策，亦不可在 <user> 主动透露前剧透隐藏真相。`,
            custom: NTCState.framework.templates.userSetting.content
        };
        NTCState.framework.templates.userSetting.roleMode = mode;
        if (mode !== 'custom') {
            NTCState.framework.templates.userSetting.content = presets[mode];
            const ta = document.getElementById('ntc-tpl-txt-userSetting');
            if (ta) ta.value = presets[mode];
        }
        renderStep2Preview();
    }

    // ==================== 13. 视图入口与全局暴露 ====================
    let initialized = false;
    window.showNovelToCardView = async function () {
        if (typeof checkDbReady === 'function' && !(await checkDbReady())) return;
        const idsToHide = ['library-view', 'editor-view', 'novel-to-worldbook-view'];
        idsToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const view = document.getElementById('novel-to-card-view');
        if (view) view.style.display = 'flex';
        const loading = document.getElementById('loading-overlay');
        if (loading) loading.style.display = 'none';

        if (!initialized) {
            initialized = true;
            await loadProgressFromDB();
            // 绑定拖拽上传
            const drop = document.getElementById('ntc-drop-zone');
            if (drop) {
                drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
                drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
                drop.addEventListener('drop', e => {
                    e.preventDefault();
                    drop.classList.remove('dragover');
                    if (e.dataTransfer.files?.length) handleFileSelect({ target: { files: e.dataTransfer.files } });
                });
            }
            const splitSizeSel = document.getElementById('ntc-split-size');
            if (splitSizeSel) {
                splitSizeSel.addEventListener('change', () => {
                    const customInput = document.getElementById('ntc-split-size-custom');
                    if (customInput) customInput.style.display = splitSizeSel.value === 'custom' ? 'block' : 'none';
                });
            }
        }
        renderLoreCategoriesUI();
        renderProcessingUI();
        renderExtractionPreview();
        switchStep(NTCState.activeStep);
    };

    window.NTC = {
        onLanguageChanged: () => {
            try {
                renderLoreCategoriesUI();
                renderProcessingUI();
                renderExtractionPreview();
                renderGreetingsUI();
                if (NTCState.epubChapters.length) renderEpubList();
            } catch (e) {}
        },
        switchStep,
        goStep2: () => switchStep(2),
        handleFileSelect,
        splitByRegexAndPrepare,
        splitBySizeAndPrepare,
        prepareEpubChunks,
        startExtraction: runExtractionLoop,
        pauseExtraction: () => { NTCState.isPaused = true; },
        retryFailed: () => {
            NTCState.chunks.forEach(c => { if (c.status === 'failed') c.status = 'pending'; });
            runExtractionLoop();
        },
        resetWorkspace: async () => {
            if (!confirm('确定清空当前「小说转剧情卡」的队列与已提取数据吗？（自定义分类配置会保留）')) return;
            NTCState.fileName = '';
            NTCState.rawText = '';
            NTCState.epubChapters = [];
            NTCState.chunks = [];
            NTCState.currentIndex = 0;
            NTCState.extracted = { bookTitle: '', plot: { chapters: [] }, lore: {} };
            NTCState.framework.cardName = '';
            NTCState.framework.firstMes = '';
            NTCState.framework.greetings = [{ id: 'g_1', label: '主开场白', refChapterIds: [], startChapterId: '', customHint: '', content: '' }];
            NTCState.framework.activeGreetingIdx = 0;
            await NovelToCardDB.clearHistory();
            await saveProgressToDB();
            const info = document.getElementById('ntc-file-info');
            if (info) info.textContent = '支持格式：txt、epub（自动编码检测与章节识别）';
            renderProcessingUI();
            renderExtractionPreview();
        },
        toggleCategory: async (idx, checked) => {
            if (NTCState.loreCategories[idx]) {
                NTCState.loreCategories[idx].enabled = checked;
                await saveProgressToDB();
                renderLoreCategoriesUI();
            }
        },
        toggleStrictCategories: async (checked) => {
            NTCState.strictCategories = checked;
            await saveProgressToDB();
        },
        openCategoryModal,
        saveCategoryFromModal,
        deleteCategory: async (idx) => {
            if (confirm(`确定删除分类「${NTCState.loreCategories[idx]?.name}」吗？`)) {
                NTCState.loreCategories.splice(idx, 1);
                await saveProgressToDB();
                renderLoreCategoriesUI();
            }
        },
        resetDefaultCategories: async () => {
            if (!confirm('确定重置设定分类为默认模板吗？')) return;
            NTCState.loreCategories = deepClone(NTC_DEFAULT_LORE_CATEGORIES);
            await saveProgressToDB();
            renderLoreCategoriesUI();
        },
        toggleEpubChapter: (idx, checked) => {
            if (NTCState.epubChapters[idx]) NTCState.epubChapters[idx].checked = checked;
            renderEpubList();
        },
        selectAllEpub: (flag) => {
            NTCState.epubChapters.forEach(c => { c.checked = flag; });
            renderEpubList();
        },
        openChapterModal,
        addChapterModalPhase,
        removeChapterModalPhase,
        addChapterModalScene,
        removeChapterModalScene,
        saveChapterFromModal,
        deleteChapterFromModal,
        deleteChapter: async (idx) => {
            if (!confirm(`确定删除章节 ${NTCState.extracted.plot.chapters[idx]?.id} 吗？`)) return;
            NTCState.extracted.plot.chapters.splice(idx, 1);
            await saveProgressToDB();
            renderExtractionPreview();
        },
        exportExtractedData,
        importExtractedData,
        openHistoryModal,
        restoreHistory,
        applyUserRolePreset,
        aiGenerateUserSetting,
        aiGenerateFirstMes,
        selectGreeting: (idx) => {
            readStep2FormIntoState();
            const list = ensureGreetingsState();
            if (idx >= 0 && idx < list.length) {
                NTCState.framework.activeGreetingIdx = idx;
                renderGreetingsUI();
                renderStep2Preview();
            }
        },
        addGreeting: () => {
            readStep2FormIntoState();
            const list = ensureGreetingsState();
            const chapters = NTCState.extracted.plot.chapters || [];
            const nextCh = chapters[Math.min(list.length, Math.max(0, chapters.length - 1))]?.id || chapters[0]?.id || '';
            list.push({
                id: 'g_' + Date.now(),
                label: `备选开场 #${list.length + 1}`,
                refChapterIds: nextCh ? [nextCh] : [],
                startChapterId: nextCh,
                customHint: '',
                content: ''
            });
            NTCState.framework.activeGreetingIdx = list.length - 1;
            saveProgressToDB();
            renderGreetingsUI();
            renderStep2Preview();
        },
        deleteActiveGreeting: () => {
            const list = ensureGreetingsState();
            if (list.length <= 1) { alert('至少保留 1 条主开场白！'); return; }
            const idx = NTCState.framework.activeGreetingIdx;
            if (!confirm(`确定删除「${list[idx].label}」吗？`)) return;
            list.splice(idx, 1);
            if (idx === 0 && list[0]) list[0].label = '主开场白';
            NTCState.framework.activeGreetingIdx = Math.max(0, idx - 1);
            saveProgressToDB();
            renderGreetingsUI();
            renderStep2Preview();
        },
        toggleGreetingRefChapter: (chId, checked) => {
            const list = ensureGreetingsState();
            const active = list[NTCState.framework.activeGreetingIdx];
            if (!active) return;
            const set = new Set(active.refChapterIds || []);
            if (checked) set.add(chId);
            else set.delete(chId);
            // 保持按原著章节顺序排列
            const orderIds = (NTCState.extracted.plot.chapters || []).map(c => c.id);
            active.refChapterIds = orderIds.filter(id => set.has(id));
            // 若当前起始章不在勾选列表内，自动跟随所选首章（用户仍可在下拉框里手动切换）
            if (active.refChapterIds.length && !active.refChapterIds.includes(active.startChapterId)) {
                active.startChapterId = active.refChapterIds[0];
            }
            saveProgressToDB();
            renderGreetingsUI();
            renderStep2Preview();
        },
        selectAllGreetingRefChapters: (flag) => {
            const list = ensureGreetingsState();
            const active = list[NTCState.framework.activeGreetingIdx];
            if (!active) return;
            const orderIds = (NTCState.extracted.plot.chapters || []).map(c => c.id);
            active.refChapterIds = flag ? orderIds.slice() : [];
            if (flag && !active.startChapterId && orderIds[0]) active.startChapterId = orderIds[0];
            saveProgressToDB();
            renderGreetingsUI();
            renderStep2Preview();
        },
        changeGreetingStartChapter: (chId) => {
            const list = ensureGreetingsState();
            const active = list[NTCState.framework.activeGreetingIdx];
            if (!active) return;
            active.startChapterId = chId;
            // 确保起始章节在参考勾选里
            if (chId && !active.refChapterIds.includes(chId)) {
                active.refChapterIds.push(chId);
            }
            saveProgressToDB();
            renderGreetingsUI();
            renderStep2Preview();
        },
        refreshPreview: renderStep2Preview,
        saveCardToLibrary,
        exportCardV3Json
    };
})();

