// 生成动态破限提示词
async function generateLimitlessPrompt(type = 'system') {
    const dynamicSuffix = Date.now().toString(36).slice(-4);
    
    // 尝试从IndexedDB加载自定义破限提示词
    let customPrompt = null;
    try {
        customPrompt = await MemoryHistoryDB.getCustomLimitlessPrompt();
    } catch (error) {
        console.error('加载自定义破限提示词失败:', error);
    }
    
    // 使用自定义提示词或默认提示词（DEFAULT_LIMITLESS_PROMPT在part1.js中定义）
    const basePrompt = customPrompt || DEFAULT_LIMITLESS_PROMPT;
    
    return `${dynamicSuffix}
${basePrompt}

${type === 'prefix' ? '\n---\n以下是用户的具体要求：\n' : ''}`;
}

// 增量输出模式开关状态（默认启用）
let incrementalOutputMode = true;

// ========== 自定义JSON模板系统 ==========
// 默认的世界书分类模板配置
const DEFAULT_WORLDBOOK_CATEGORIES = [
    {
        name: "角色",
        enabled: true,
        isBuiltin: true,
        entryExample: "角色真实姓名",
        keywordsExample: ["真实姓名", "称呼1", "称呼2", "绰号"],
        contentGuide: "基于原文的角色描述，包含但不限于**名称**:（必须要）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）"
    },
    {
        name: "地点",
        enabled: true,
        isBuiltin: true,
        entryExample: "地点真实名称",
        keywordsExample: ["地点名", "别称", "俗称"],
        contentGuide: "基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）"
    },
    {
        name: "组织",
        enabled: true,
        isBuiltin: true,
        entryExample: "组织真实名称",
        keywordsExample: ["组织名", "简称", "代号"],
        contentGuide: "基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）"
    },
    {
        name: "道具",
        enabled: false,
        isBuiltin: false,
        entryExample: "道具名称",
        keywordsExample: ["道具名", "别名"],
        contentGuide: "基于原文的道具描述，包含但不限于**名称**:、**类型**:、**功能**:、**来源**:、**持有者**:等"
    },
    {
        name: "玩法",
        enabled: false,
        isBuiltin: false,
        entryExample: "玩法名称",
        keywordsExample: ["玩法名", "规则名"],
        contentGuide: "基于原文的玩法/规则描述，包含但不限于**名称**:、**规则说明**:、**参与条件**:、**奖惩机制**:等"
    },
    {
        name: "章节剧情",
        enabled: false,
        isBuiltin: false,
        entryExample: "第X章",
        keywordsExample: ["章节名", "章节号"],
        contentGuide: "该章节的剧情概要，包含但不限于**章节标题**:、**主要事件**:、**出场角色**:、**关键转折**:、**伏笔线索**:等"
    },
    {
        name: "角色内心",
        enabled: false,
        isBuiltin: false,
        entryExample: "角色名-内心世界",
        keywordsExample: ["角色名", "内心", "心理"],
        contentGuide: "角色的内心想法和心理活动，包含但不限于**（角色名）的（某个时期）的内心世界**：、****原文内容**:、**内心独白**:、**情感变化**:、**动机分析**:、**心理矛盾**:等"
    }
];

// 当前使用的世界书分类配置（从IndexedDB加载或使用默认值）
let customWorldbookCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));

// 保存自定义分类配置到IndexedDB
async function saveCustomCategories() {
    try {
        await MemoryHistoryDB.saveCustomCategories(customWorldbookCategories);
        mylog('自定义分类配置已保存到IndexedDB');
    } catch (error) {
        console.error('保存自定义分类配置失败:', error);
    }
}

// 从IndexedDB加载自定义分类配置
async function loadCustomCategories() {
    try {
        const saved = await MemoryHistoryDB.getCustomCategories();
        if (saved && Array.isArray(saved) && saved.length > 0) {
            customWorldbookCategories = saved;
        } else {
            // 尝试从localStorage迁移（兼容旧版本）
            const localStorageData = localStorage.getItem('customWorldbookCategories');
            if (localStorageData) {
                try {
                    const parsed = JSON.parse(localStorageData);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        customWorldbookCategories = parsed;
                        await saveCustomCategories(); // 迁移到IndexedDB
                        localStorage.removeItem('customWorldbookCategories'); // 清理localStorage
                        mylog('已从localStorage迁移到IndexedDB');
                    }
                } catch (e) {
                    console.error('迁移localStorage数据失败:', e);
                }
            }
        }
    } catch (error) {
        console.error('加载自定义分类配置失败:', error);
    }
}

// 重置为默认分类配置
async function resetToDefaultCategories() {
    customWorldbookCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));
    await saveCustomCategories();
    mylog('已重置为默认分类配置');
}

// 获取启用的分类列表
function getEnabledCategories() {
    return customWorldbookCategories.filter(cat => cat.enabled);
}

// 生成主提示词的JSON模板部分
function generateMainPromptJsonTemplate() {
    const enabledCategories = getEnabledCategories();
    const enablePlotOutline = document.getElementById('enable-plot-outline')?.checked ?? true;
    const enableLiteraryStyle = document.getElementById('enable-literary-style')?.checked ?? false;

    let template = '{\n';
    const parts = [];

    for (const cat of enabledCategories) {
        parts.push(`"${cat.name}": {
"${cat.entryExample}": {
"关键词": ${JSON.stringify(cat.keywordsExample)},
"内容": "${cat.contentGuide}"
}
}`);
    }

    // 添加剧情大纲（如果启用）
    if (enablePlotOutline) {
        parts.push(`"剧情大纲": {
"主线剧情": {
"关键词": ["主线", "核心剧情", "故事线"],
"内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响\\n3. **转折点3**: 描述和影响\\n\\n## 伏笔与暗线\\n**已揭示的伏笔**: 已经揭晓的铺垫\\n**未解之谜**: 尚未解答的疑问\\n**暗线推测**: 可能的隐藏剧情线"
},
"支线剧情": {
"关键词": ["支线", "副线", "分支剧情"],
"内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n**支线3标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
}
}`);
    }

    // 添加文风配置（如果启用）
    if (enableLiteraryStyle) {
        parts.push(`"文风配置": {
"作品文风": {
"关键词": ["文风", "写作风格", "叙事特点"],
"内容": "基于原文分析的文风配置（YAML格式），包含以下三大系统：\\n\\n**叙事系统(narrative_system)**:\\n- **结构(structure)**: 故事组织方式、推进模式、结局处理\\n- **视角(perspective)**: 人称选择、聚焦类型、叙述距离\\n- **时间管理(time_management)**: 时序、时距、频率\\n- **节奏(rhythm)**: 句长模式、速度控制、标点节奏\\n\\n**表达系统(expression_system)**:\\n- **话语与描写(discourse_and_description)**: 话语风格、描写原则、具体技法\\n- **对话(dialogue)**: 对话功能、对话风格\\n- **人物塑造(characterization)**: 塑造方法、心理策略\\n- **感官编织(sensory_weaving)**: 感官优先级、通感技法\\n\\n**美学系统(aesthetics_system)**:\\n- **核心概念(core_concepts)**: 核心美学立场和关键词\\n- **意象与象征(imagery_and_symbolism)**: 季节意象、自然元素、色彩系统\\n- **语言与修辞(language_and_rhetoric)**: 句法特征、词汇偏好、修辞手法\\n- **整体效果(overall_effect)**: 阅读体验目标、美学哲学\\n\\n每个维度都应包含具体的原文示例和可操作的描述。"
}
}`);
    }

    template += parts.join(',\n');
    template += '\n}';

    return template;
}

// 生成简化版JSON模板（用于记忆修复提示词）
function generateSimpleJsonTemplate() {
    const enabledCategories = getEnabledCategories();
    const enablePlotOutline = document.getElementById('enable-plot-outline')?.checked ?? true;
    const enableLiteraryStyle = document.getElementById('enable-literary-style')?.checked ?? false;

    const parts = [];

    for (const cat of enabledCategories) {
        parts.push(`"${cat.name}": { "${cat.entryExample}": { "关键词": ["..."], "内容": "..." } }`);
    }

    if (enablePlotOutline) {
        parts.push(`"剧情大纲": { "主线剧情": { "关键词": ["主线"], "内容": "..." } }`);
    }

    if (enableLiteraryStyle) {
        parts.push(`"文风配置": { "作品文风": { "关键词": ["文风"], "内容": "..." } }`);
    }

    return '{\n' + parts.join(',\n') + '\n}';
}

// 生成格式修复提示词的JSON结构说明
function generateFixPromptJsonStructure() {
    const enabledCategories = getEnabledCategories();
    const enableLiteraryStyle = document.getElementById('enable-literary-style')?.checked ?? false;

    let structure = '{\n';
    const parts = [];

    for (const cat of enabledCategories) {
        parts.push(`  "${cat.name}": {\n    "条目名": { "关键词": ["..."], "内容": "..." }\n  }`);
    }

    // 剧情大纲和知识书始终包含在格式修复中
    parts.push(`  "剧情大纲": {\n    "主线剧情": { "关键词": ["..."], "内容": "..." },\n    "支线剧情": { "关键词": ["..."], "内容": "..." }\n  }`);
    parts.push(`  "知识书": {\n    "条目名": { "关键词": ["..."], "内容": "..." }\n  }`);

    if (enableLiteraryStyle) {
        parts.push(`  "文风配置": {\n    "作品文风": { "关键词": ["文风", "写作风格", "叙事特点"], "内容": "..." }\n  }`);
    }

    structure += parts.join(',\n');
    structure += '\n}';

    return structure;
}

// 获取分类名称列表（用于提示词中的说明）
function getCategoryNamesList() {
    const enabledCategories = getEnabledCategories();
    const enableLiteraryStyle = document.getElementById('enable-literary-style')?.checked ?? false;

    const names = enabledCategories.map(cat => cat.name);
    names.push('剧情大纲', '知识书');
    if (enableLiteraryStyle) {
        names.push('文风配置');
    }

    return names.join('/');
}

// 获取启用分类的提取说明
function getEnabledCategoriesDescription() {
    const enabledCategories = getEnabledCategories();
    return enabledCategories.map(cat => cat.name).join('、');
}

// 初始化增量输出模式开关（在高级设置中动态添加）
function initIncrementalOutputModeToggle() {
    const advancedSettings = document.getElementById('advanced-novel-settings');
    if (!advancedSettings) return;

    // 检查是否已存在
    if (document.getElementById('incremental-output-mode-container')) return;

    // 创建增量输出模式开关容器
    const container = document.createElement('div');
    container.id = 'incremental-output-mode-container';
    container.style.cssText = 'padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; border: 1px solid RGB(52,52,52); margin-bottom: 10px;';
    container.innerHTML = `
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" id="incremental-output-mode" style="width: 18px; height: 18px;" checked>
            <span style="color: var(--label-color); font-weight: bold;">📝 增量输出模式</span>
        </label>
        <p style="margin: 5px 0 0 28px; font-size: 12px; color: var(--text-secondary-color);">每次只输出变更的条目，避免上下文字数限制，降低消耗并提升生成速度</p>
    `;

    // 插入到高级设置的最前面
    advancedSettings.insertBefore(container, advancedSettings.firstChild);

    // 绑定事件
    document.getElementById('incremental-output-mode').addEventListener('change', function () {
        incrementalOutputMode = this.checked;
        mylog('增量输出模式:', incrementalOutputMode ? '开启' : '关闭');
    });
}

// 初始化自定义分类模板UI（在高级设置中动态添加）
function initCustomCategoriesUI() {
    const advancedSettings = document.getElementById('advanced-novel-settings');
    if (!advancedSettings) return;

    // 检查是否已存在
    if (document.getElementById('custom-categories-container')) return;

    // 创建自定义分类容器
    const container = document.createElement('div');
    container.id = 'custom-categories-container';
    container.style.cssText = 'padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; border: 1px solid RGB(52,52,52); margin-bottom: 10px;';

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="color: var(--label-color); font-weight: bold;">🏷️ 自定义提取分类</span>
            <div>
                <button id="add-custom-category-btn" style="background: #e67e22; color: white; padding: 4px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 5px;">➕ 添加分类</button>
                <button id="reset-categories-btn" style="background: #6c757d; color: white; padding: 4px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">🔄 重置默认</button>
            </div>
        </div>
        <p style="margin: 0 0 10px 0; font-size: 12px; color: var(--text-secondary-color);">勾选要提取的分类，可自定义添加道具、玩法、章节剧情等</p>
        <div id="categories-list" style="max-height: 300px; overflow-y: auto;"></div>
    `;

    // 插入到高级设置中（在增量输出模式之后）
    const incrementalContainer = document.getElementById('incremental-output-mode-container');
    if (incrementalContainer && incrementalContainer.nextSibling) {
        advancedSettings.insertBefore(container, incrementalContainer.nextSibling);
    } else {
        advancedSettings.appendChild(container);
    }

    // 渲染分类列表
    renderCategoriesList();

    // 绑定添加分类按钮事件
    document.getElementById('add-custom-category-btn').addEventListener('click', showAddCategoryModal);

    // 绑定重置按钮事件
    document.getElementById('reset-categories-btn').addEventListener('click', function () {
        if (confirm('确定要重置为默认分类配置吗？这将清除所有自定义分类。')) {
            resetToDefaultCategories();
            renderCategoriesList();
        }
    });
}

// 渲染分类列表
function renderCategoriesList() {
    const listContainer = document.getElementById('categories-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    customWorldbookCategories.forEach((cat, index) => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 5px;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = cat.enabled;
        checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        checkbox.addEventListener('change', function () {
            customWorldbookCategories[index].enabled = this.checked;
            saveCustomCategories();
        });

        const label = document.createElement('span');
        label.style.cssText = 'flex: 1; color: var(--text-color); font-size: 13px;';
        label.textContent = cat.name;
        if (cat.isBuiltin) {
            label.innerHTML += ' <span style="color: #888; font-size: 11px;">(内置)</span>';
        }

        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.title = '编辑';
        editBtn.style.cssText = 'background: #3498db; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
        editBtn.addEventListener('click', () => showEditCategoryModal(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = '删除';
        deleteBtn.style.cssText = 'background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;';
        deleteBtn.disabled = cat.isBuiltin;
        if (cat.isBuiltin) {
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.cursor = 'not-allowed';
        }
        deleteBtn.addEventListener('click', () => {
            if (!cat.isBuiltin && confirm(`确定要删除分类"${cat.name}"吗？`)) {
                customWorldbookCategories.splice(index, 1);
                saveCustomCategories();
                renderCategoriesList();
            }
        });

        item.appendChild(checkbox);
        item.appendChild(label);
        item.appendChild(editBtn);
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
    });
}

// 显示添加分类弹窗
function showAddCategoryModal() {
    showCategoryModal(null, '添加新分类');
}

// 显示编辑分类弹窗
function showEditCategoryModal(index) {
    showCategoryModal(index, '编辑分类');
}

// 通用的分类编辑弹窗
function showCategoryModal(editIndex, title) {
    const isEdit = editIndex !== null;
    const cat = isEdit ? customWorldbookCategories[editIndex] : {
        name: '',
        enabled: true,
        isBuiltin: false,
        entryExample: '',
        keywordsExample: [],
        contentGuide: ''
    };

    // 移除已存在的弹窗
    const existingModal = document.getElementById('category-edit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'category-edit-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10001; display: flex; justify-content: center; align-items: center;';

    modal.innerHTML = `
        <div style="background: #2d2d2d; border-radius: 10px; padding: 20px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <h3 style="color: #e67e22; margin: 0 0 15px 0;">${title}</h3>
            
            <div style="margin-bottom: 12px;">
                <label style="display: block; color: var(--label-color); margin-bottom: 5px; font-size: 13px;">分类名称 *</label>
                <input type="text" id="cat-name" value="${cat.name}" placeholder="如：道具、玩法、章节剧情" 
                    style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #1c1c1c; color: white; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="display: block; color: var(--label-color); margin-bottom: 5px; font-size: 13px;">条目名称示例</label>
                <input type="text" id="cat-entry-example" value="${cat.entryExample}" placeholder="如：道具名称、第X章" 
                    style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #1c1c1c; color: white; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="display: block; color: var(--label-color); margin-bottom: 5px; font-size: 13px;">关键词示例（逗号分隔）</label>
                <input type="text" id="cat-keywords" value="${cat.keywordsExample.join(', ')}" placeholder="如：道具名, 别名, 俗称" 
                    style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #1c1c1c; color: white; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; color: var(--label-color); margin-bottom: 5px; font-size: 13px;">内容提取指南</label>
                <textarea id="cat-content-guide" placeholder="描述AI应该提取哪些信息，如：包含**名称**:、**类型**:、**功能**:等" 
                    style="width: 100%; height: 100px; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #1c1c1c; color: white; resize: vertical; box-sizing: border-box;">${cat.contentGuide}</textarea>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="cat-cancel-btn" style="background: #6c757d; color: white; padding: 8px 20px; border: none; border-radius: 5px; cursor: pointer;">取消</button>
                <button id="cat-save-btn" style="background: #e67e22; color: white; padding: 8px 20px; border: none; border-radius: 5px; cursor: pointer;">保存</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 绑定事件
    document.getElementById('cat-cancel-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('cat-save-btn').addEventListener('click', () => {
        const name = document.getElementById('cat-name').value.trim();
        const entryExample = document.getElementById('cat-entry-example').value.trim();
        const keywordsStr = document.getElementById('cat-keywords').value.trim();
        const contentGuide = document.getElementById('cat-content-guide').value.trim();

        if (!name) {
            alert('请输入分类名称');
            return;
        }

        // 检查名称是否重复
        const duplicateIndex = customWorldbookCategories.findIndex((c, i) => c.name === name && i !== editIndex);
        if (duplicateIndex !== -1) {
            alert('该分类名称已存在');
            return;
        }

        const keywordsExample = keywordsStr ? keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k) : [];

        const newCat = {
            name,
            enabled: isEdit ? cat.enabled : true,
            isBuiltin: isEdit ? cat.isBuiltin : false,
            entryExample: entryExample || name + '名称',
            keywordsExample: keywordsExample.length > 0 ? keywordsExample : [name + '名'],
            contentGuide: contentGuide || `基于原文的${name}描述`
        };

        if (isEdit) {
            customWorldbookCategories[editIndex] = newCat;
        } else {
            customWorldbookCategories.push(newCat);
        }

        saveCustomCategories();
        renderCategoriesList();
        modal.remove();
    });
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 延迟执行以确保DOM完全加载
    setTimeout(async () => {
        // 加载其他设置（包括调试模式）
        loadOtherSettings();

        // 先加载自定义分类配置
        await loadCustomCategories();
        // 然后初始化UI
        initIncrementalOutputModeToggle();
        initCustomCategoriesUI();
    }, 500);
});

// 记忆历史数据库
const MemoryHistoryDB = {
    dbName: 'MemoryHistoryDB',
    storeName: 'history',
    metaStoreName: 'meta',
    db: null,

    async openDB() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // 历史记录存储
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                }
                // 元数据存储（用于存储文件hash等）
                if (!db.objectStoreNames.contains(this.metaStoreName)) {
                    db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    },

    // 保存一条历史记录
    async saveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries) {
        const db = await this.openDB();

        // 先检查并删除重复命名的旧记录（除了"记忆-优化"和"记忆-演变总结"）
        const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
        if (!allowedDuplicates.includes(memoryTitle)) {
            try {
                const allHistory = await this.getAllHistory();
                const duplicates = allHistory.filter(h => h.memoryTitle === memoryTitle);

                if (duplicates.length > 0) {
                    mylog(`🗑️ 检测到重复命名的历史记录: "${memoryTitle}", 删除 ${duplicates.length} 条旧记录`);
                    const deleteTransaction = db.transaction([this.storeName], 'readwrite');
                    const deleteStore = deleteTransaction.objectStore(this.storeName);

                    for (const dup of duplicates) {
                        deleteStore.delete(dup.id);
                    }

                    // 等待删除完成
                    await new Promise((resolve, reject) => {
                        deleteTransaction.oncomplete = () => resolve();
                        deleteTransaction.onerror = () => reject(deleteTransaction.error);
                    });
                }
            } catch (error) {
                console.error('删除重复历史记录失败:', error);
            }
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const record = {
                timestamp: Date.now(),
                memoryIndex: memoryIndex,
                memoryTitle: memoryTitle,
                previousWorldbook: JSON.parse(JSON.stringify(previousWorldbook || {})),
                newWorldbook: JSON.parse(JSON.stringify(newWorldbook || {})),
                changedEntries: changedEntries || [],
                fileHash: currentFileHash || null
            };

            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // 获取所有历史记录
    async getAllHistory() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    // 获取指定ID的历史记录
    async getHistoryById(id) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // 清除所有历史记录
    async clearAllHistory() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                mylog('📚 记忆历史已清除');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    },

    // 保存文件hash
    async saveFileHash(hash) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put({ key: 'currentFileHash', value: hash });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // 获取保存的文件hash
    async getSavedFileHash() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readonly');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.get('currentFileHash');

            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    },

    // 保存自定义优化prompt
    async saveCustomOptimizationPrompt(prompt) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put({ key: 'customOptimizationPrompt', value: prompt });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // 获取保存的自定义优化prompt
    async getCustomOptimizationPrompt() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readonly');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.get('customOptimizationPrompt');

            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    },

    // 保存自定义分类配置
    async saveCustomCategories(categories) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put({ key: 'customWorldbookCategories', value: categories });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // 获取保存的自定义分类配置
    async getCustomCategories() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readonly');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.get('customWorldbookCategories');

            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    },

    // 保存自定义破限提示词
    async saveCustomLimitlessPrompt(prompt) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put({ key: 'customLimitlessPrompt', value: prompt });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // 获取保存的自定义破限提示词
    async getCustomLimitlessPrompt() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.metaStoreName], 'readonly');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.get('customLimitlessPrompt');

            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    },

    // 回退到指定历史记录
    async rollbackToHistory(historyId) {
        const history = await this.getHistoryById(historyId);
        if (!history) {
            throw new Error('找不到指定的历史记录');
        }

        // 恢复世界书状态
        generatedWorldbook = JSON.parse(JSON.stringify(history.previousWorldbook));

        // 删除该记录之后的所有历史
        const db = await this.openDB();
        const allHistory = await this.getAllHistory();
        const toDelete = allHistory.filter(h => h.id >= historyId);

        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        for (const h of toDelete) {
            store.delete(h.id);
        }

        return history;
    },

    // 清理重复的历史记录（保留最新的）
    async cleanDuplicateHistory() {
        const db = await this.openDB();
        const allHistory = await this.getAllHistory();
        const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];

        // 按标题分组
        const groupedByTitle = {};
        for (const record of allHistory) {
            const title = record.memoryTitle;
            if (!groupedByTitle[title]) {
                groupedByTitle[title] = [];
            }
            groupedByTitle[title].push(record);
        }

        // 找出需要删除的重复记录
        const toDelete = [];
        for (const title in groupedByTitle) {
            if (allowedDuplicates.includes(title)) continue; // 跳过允许重复的

            const records = groupedByTitle[title];
            if (records.length > 1) {
                // 按时间戳排序，保留最新的
                records.sort((a, b) => b.timestamp - a.timestamp);
                // 删除除了第一个（最新）之外的所有记录
                toDelete.push(...records.slice(1));
            }
        }

        if (toDelete.length > 0) {
            mylog(`🗑️ 清理重复历史记录: 共 ${toDelete.length} 条`);
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            for (const record of toDelete) {
                store.delete(record.id);
                mylog(`  - 删除: ${record.memoryTitle} (ID: ${record.id})`);
            }

            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });

            return toDelete.length;
        }

        return 0;
    }
};

// 当前文件的hash值（用于检测文件是否变化）
let currentFileHash = null;

// 计算文件内容的hash
async function calculateFileHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 比较两个世界书对象，找出变化的条目
function findChangedEntries(oldWorldbook, newWorldbook) {
    const changes = [];

    // 遍历新世界书的所有分类和条目
    for (const category in newWorldbook) {
        const oldCategory = oldWorldbook[category] || {};
        const newCategory = newWorldbook[category];

        for (const entryName in newCategory) {
            const oldEntry = oldCategory[entryName];
            const newEntry = newCategory[entryName];

            if (!oldEntry) {
                // 新增条目
                changes.push({
                    type: 'add',
                    category: category,
                    entryName: entryName,
                    oldValue: null,
                    newValue: newEntry
                });
            } else if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
                // 修改条目
                changes.push({
                    type: 'modify',
                    category: category,
                    entryName: entryName,
                    oldValue: oldEntry,
                    newValue: newEntry
                });
            }
        }
    }

    // 检查删除的条目
    for (const category in oldWorldbook) {
        const oldCategory = oldWorldbook[category];
        const newCategory = newWorldbook[category] || {};

        for (const entryName in oldCategory) {
            if (!newCategory[entryName]) {
                changes.push({
                    type: 'delete',
                    category: category,
                    entryName: entryName,
                    oldValue: oldCategory[entryName],
                    newValue: null
                });
            }
        }
    }

    return changes;
}

// 带历史记录的世界书合并函数
async function mergeWorldbookDataWithHistory(target, source, memoryIndex, memoryTitle) {
    // 保存合并前的状态
    const previousWorldbook = JSON.parse(JSON.stringify(target));

    // 根据增量输出模式选择不同的合并策略
    if (incrementalOutputMode) {
        // 增量模式：点对点覆盖合并
        mergeWorldbookDataIncremental(target, source);
    } else {
        // 普通模式：递归合并
        mergeWorldbookData(target, source);
    }

    // 找出变化的条目
    const changedEntries = findChangedEntries(previousWorldbook, target);

    // 如果有变化，保存历史记录
    if (changedEntries.length > 0) {
        await MemoryHistoryDB.saveHistory(
            memoryIndex,
            memoryTitle,
            previousWorldbook,
            target,
            changedEntries
        );
        mylog(`📚 已保存历史记录: 第${memoryIndex + 1}个记忆块, ${changedEntries.length}个变更`);
    }

    return changedEntries;
}

// 增量模式：点对点覆盖合并
// 只处理source中存在的条目，覆盖内容但合并关键词
function mergeWorldbookDataIncremental(target, source) {
    // 先标准化源数据
    normalizeWorldbookData(source);

    // 统计变更
    const stats = { updated: [], added: [] };

    for (const category in source) {
        if (typeof source[category] !== 'object' || source[category] === null) continue;

        // 确保目标分类存在
        if (!target[category]) {
            target[category] = {};
        }

        // 遍历分类下的条目
        for (const entryName in source[category]) {
            const sourceEntry = source[category][entryName];

            if (typeof sourceEntry !== 'object' || sourceEntry === null) continue;

            // 检查目标是否已有此条目
            if (target[category][entryName]) {
                // 已有条目：覆盖内容，合并关键词
                const targetEntry = target[category][entryName];

                // 合并关键词（去重）
                if (Array.isArray(sourceEntry['关键词']) && Array.isArray(targetEntry['关键词'])) {
                    const mergedKeywords = [...new Set([...targetEntry['关键词'], ...sourceEntry['关键词']])];
                    targetEntry['关键词'] = mergedKeywords;
                } else if (Array.isArray(sourceEntry['关键词'])) {
                    targetEntry['关键词'] = sourceEntry['关键词'];
                }

                // 覆盖内容
                if (sourceEntry['内容']) {
                    targetEntry['内容'] = sourceEntry['内容'];
                }

                stats.updated.push(`[${category}] ${entryName}`);
            } else {
                // 新条目：直接添加
                target[category][entryName] = sourceEntry;
                stats.added.push(`[${category}] ${entryName}`);
            }
        }
    }

    // 合并输出日志
    if (stats.updated.length > 0) {
        mylog(`📝 增量更新 ${stats.updated.length} 个条目: ${stats.updated.join(', ')}`);
    }
    if (stats.added.length > 0) {
        mylog(`➕ 增量新增 ${stats.added.length} 个条目: ${stats.added.join(', ')}`);
    }
}

// ========== 正则回退解析函数 ==========
// 当JSON.parse失败时，使用正则表达式提取世界书数据
function extractWorldbookDataByRegex(jsonString) {
    mylog('🔧 开始正则提取世界书数据...');
    const result = {};

    // 定义要提取的分类
    const categories = ['角色', '地点', '组织', '剧情大纲', '知识书', '文风配置'];

    for (const category of categories) {
        // 匹配分类块: "分类名": { ... }
        // 使用非贪婪匹配找到分类的开始位置
        const categoryPattern = new RegExp(`"${category}"\\s*:\\s*\\{`, 'g');
        const categoryMatch = categoryPattern.exec(jsonString);

        if (!categoryMatch) continue;

        const startPos = categoryMatch.index + categoryMatch[0].length;

        // 找到这个分类块的结束位置（匹配括号）
        let braceCount = 1;
        let endPos = startPos;
        while (braceCount > 0 && endPos < jsonString.length) {
            if (jsonString[endPos] === '{') braceCount++;
            if (jsonString[endPos] === '}') braceCount--;
            endPos++;
        }

        if (braceCount !== 0) {
            mylog(`⚠️ 分类 "${category}" 括号不匹配，跳过`);
            continue;
        }

        const categoryContent = jsonString.substring(startPos, endPos - 1);
        result[category] = {};

        // 在分类内容中提取条目
        // 匹配条目: "条目名": { "关键词": [...], "内容": "..." }
        const entryPattern = /"([^"]+)"\s*:\s*\{/g;
        let entryMatch;

        while ((entryMatch = entryPattern.exec(categoryContent)) !== null) {
            const entryName = entryMatch[1];
            const entryStartPos = entryMatch.index + entryMatch[0].length;

            // 找到条目块的结束位置
            let entryBraceCount = 1;
            let entryEndPos = entryStartPos;
            while (entryBraceCount > 0 && entryEndPos < categoryContent.length) {
                if (categoryContent[entryEndPos] === '{') entryBraceCount++;
                if (categoryContent[entryEndPos] === '}') entryBraceCount--;
                entryEndPos++;
            }

            if (entryBraceCount !== 0) continue;

            const entryContent = categoryContent.substring(entryStartPos, entryEndPos - 1);

            // 提取关键词数组
            let keywords = [];
            const keywordsMatch = entryContent.match(/"关键词"\s*:\s*\[([\s\S]*?)\]/);
            if (keywordsMatch) {
                // 提取数组中的字符串
                const keywordStrings = keywordsMatch[1].match(/"([^"]+)"/g);
                if (keywordStrings) {
                    keywords = keywordStrings.map(s => s.replace(/"/g, ''));
                }
            }

            // 提取内容字段 - 这是最复杂的部分，因为内容可能包含转义字符
            let content = '';
            const contentMatch = entryContent.match(/"内容"\s*:\s*"/);
            if (contentMatch) {
                const contentStartPos = contentMatch.index + contentMatch[0].length;
                // 找到内容字符串的结束位置（未转义的引号）
                let contentEndPos = contentStartPos;
                let escaped = false;
                while (contentEndPos < entryContent.length) {
                    const char = entryContent[contentEndPos];
                    if (escaped) {
                        escaped = false;
                    } else if (char === '\\') {
                        escaped = true;
                    } else if (char === '"') {
                        break;
                    }
                    contentEndPos++;
                }
                content = entryContent.substring(contentStartPos, contentEndPos);
                // 处理转义字符
                try {
                    content = JSON.parse(`"${content}"`);
                } catch (e) {
                    // 如果解析失败，保持原样但做基本处理
                    content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                }
            }

            // 只有当有有效内容时才添加条目
            if (content || keywords.length > 0) {
                result[category][entryName] = {
                    '关键词': keywords,
                    '内容': content
                };
                mylog(`  ✓ 提取条目: ${category} -> ${entryName} (关键词: ${keywords.length}个, 内容: ${content.length}字)`);
            }
        }

        // 如果分类下没有提取到任何条目，删除该分类
        if (Object.keys(result[category]).length === 0) {
            delete result[category];
        }
    }

    const extractedCategories = Object.keys(result);
    const totalEntries = extractedCategories.reduce((sum, cat) => sum + Object.keys(result[cat]).length, 0);
    mylog(`🔧 正则提取完成: ${extractedCategories.length}个分类, ${totalEntries}个条目`);

    return result;
}

// 按章节切分文本
function splitByChapters(content, regex) {
    const chapters = [];
    const matches = [...content.matchAll(regex)];

    for (let i = 0; i < matches.length; i++) {
        const startIndex = matches[i].index;
        const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
        chapters.push(content.slice(startIndex, endIndex));
    }

    return chapters;
}

// 更新记忆队列UI
function updateMemoryQueueUI() {
    const queueContainer = document.getElementById('memory-queue');
    queueContainer.innerHTML = '';

    memoryQueue.forEach((memory, index) => {
        const memoryItem = document.createElement('div');
        memoryItem.className = 'memory-item';
        memoryItem.style.opacity = memory.processed ? '0.6' : '1';

        // 检查是否是失败的记忆
        const isFailed = memory.failed === true;
        let statusIcon = memory.processed ? '✅' : '⏳';
        if (isFailed) {
            statusIcon = '❗';
            memoryItem.style.cursor = 'pointer';
            memoryItem.style.border = '1px solid #ff6b6b';
            memoryItem.style.borderRadius = '4px';
            memoryItem.style.padding = '4px 8px';
            memoryItem.title = '点击一键修复此记忆';
            memoryItem.onclick = () => showRepairMemoryConfirm();
        }

        memoryItem.innerHTML = `
    ${statusIcon} ${memory.title}
    <small>(${memory.content.length.toLocaleString()}字)</small>
    `;
        queueContainer.appendChild(memoryItem);
    });

    // 如果有失败的记忆，显示一键修复按钮
    updateRepairButton();
}

// 更新一键修复按钮
function updateRepairButton() {
    const failedCount = memoryQueue.filter(m => m.failed === true).length;
    const existingBtn = document.getElementById('repair-memory-btn');
    const existingHint = document.getElementById('repair-memory-hint');

    if (failedCount > 0) {
        // 确保进度区域可见
        const progressSection = document.getElementById('progress-section');
        if (progressSection) {
            progressSection.style.display = 'block';
        }

        if (!existingBtn) {
            const repairBtn = document.createElement('button');
            repairBtn.id = 'repair-memory-btn';
            repairBtn.textContent = `🔧 一键修复记忆 (${failedCount}个)`;
            repairBtn.style.cssText = 'background: #ff6b35; color: white; padding: 8px 16px; border: none; border-radius: 5px; margin-top: 10px; margin-left: 10px; cursor: pointer; font-size: 14px;';
            repairBtn.onclick = () => startRepairFailedMemories();
            progressSection.appendChild(repairBtn);

            // 添加提示文字
            if (!existingHint) {
                const hintText = document.createElement('p');
                hintText.id = 'repair-memory-hint';
                hintText.textContent = '💡 请转化完毕或刷新网页再使用修复功能';
                hintText.style.cssText = 'color: #aaa; font-size: 12px; margin-top: 8px; margin-left: 10px;';
                progressSection.appendChild(hintText);
            }
        } else {
            existingBtn.textContent = `🔧 一键修复记忆 (${failedCount}个)`;
        }
    } else {
        if (existingBtn) {
            existingBtn.remove();
        }
        if (existingHint) {
            existingHint.remove();
        }
    }
}

// 显示修复确认
function showRepairMemoryConfirm() {
    const failedCount = memoryQueue.filter(m => m.failed === true).length;
    if (failedCount === 0) {
        alert('没有需要修复的记忆');
        return;
    }
    if (confirm(`检测到 ${failedCount} 个失败的记忆块，是否开始一键修复？`)) {
        startRepairFailedMemories();
    }
}

// 开始AI处理
async function startAIProcessing() {
    document.getElementById('progress-section').style.display = 'block';

    // 重置停止标志
    isProcessingStopped = false;

    generatedWorldbook = {
        地图环境: {},
        剧情节点: {},
        角色: {},
        知识书: {}
    };

    // 添加停止按钮
    addStopButton();

    // 保存初始状态
    await NovelState.saveState(0);

    try {
        for (let i = 0; i < memoryQueue.length; i++) {
            // 检查是否用户要求停止
            if (isProcessingStopped) {
                mylog('处理被用户停止');
                document.getElementById('progress-text').textContent = `⏸️ 已暂停处理 (${i}/${memoryQueue.length})`;

                // 转换为继续按钮
                convertToResumeButton(i);

                alert(`处理已暂停！\n当前进度: ${i}/${memoryQueue.length}\n\n进度已保存，点击"继续处理"按钮可以继续。`);
                break;
            }

            // 检查是否正在修复记忆
            if (isRepairingMemories) {
                mylog(`检测到修复模式，暂停当前处理于索引 ${i}`);
                currentProcessingIndex = i; // 记录当前索引
                document.getElementById('progress-text').textContent = `⏸️ 修复记忆中，已暂停处理 (${i}/${memoryQueue.length})`;

                // 等待修复完成
                while (isRepairingMemories) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                mylog(`修复完成，从索引 ${i} 继续处理`);
                document.getElementById('progress-text').textContent = `继续处理: ${memoryQueue[i].title} (${i + 1}/${memoryQueue.length})`;
            }

            await processMemoryChunk(i);

            // 每处理完一个记忆块就保存状态
            await NovelState.saveState(i + 1);
        }

        // 完成处理
        const failedCount = memoryQueue.filter(m => m.failed === true).length;

        if (failedCount > 0) {
            document.getElementById('progress-text').textContent = `⚠️ 处理完成，但有 ${failedCount} 个记忆块失败，请点击修复`;
        } else {
            document.getElementById('progress-text').textContent = '✅ 所有记忆块处理完成！';
        }
        document.getElementById('progress-fill').style.width = '100%';

        // 显示结果
        document.getElementById('result-section').style.display = 'block';
        document.getElementById('worldbook-preview').textContent = JSON.stringify(generatedWorldbook, null, 2);

        mylog('AI记忆大师处理完成，共生成条目:', Object.keys(generatedWorldbook).length);

        // 完成后保存最终状态（不清除，以便刷新后能恢复结果）
        if (!isProcessingStopped) {
            await NovelState.saveState(memoryQueue.length);
            mylog('✅ 转换完成，状态已保存，刷新页面后可恢复结果');
        }

        // 添加操作按钮（查看世界书、查看JSON、保存）
        const container = document.querySelector('.conversion-controls') || document.querySelector('.worldbook-body');

        // 添加查看世界书按钮
        let viewWorldbookBtn = document.getElementById('view-worldbook-result-btn');
        if (!viewWorldbookBtn) {
            viewWorldbookBtn = document.createElement('button');
            viewWorldbookBtn.id = 'view-worldbook-result-btn';
            viewWorldbookBtn.textContent = '📖 查看世界书';
            viewWorldbookBtn.className = 'uniform-btn';
            viewWorldbookBtn.style.cssText = 'margin: 10px 5px; background: #e67e22;';
            viewWorldbookBtn.onclick = () => showViewWorldbookModal();
            container.appendChild(viewWorldbookBtn);
        }

        // 添加查看JSON按钮
        let viewJsonBtn = document.getElementById('view-json-btn');
        if (!viewJsonBtn) {
            viewJsonBtn = document.createElement('button');
            viewJsonBtn.id = 'view-json-btn';
            viewJsonBtn.textContent = '查看生成的JSON';
            viewJsonBtn.className = 'uniform-btn';
            viewJsonBtn.style.cssText = 'margin: 10px 5px;';
            viewJsonBtn.onclick = () => viewGeneratedWorldbook();
            container.appendChild(viewJsonBtn);
        }

        // 添加保存按钮
        let saveBtn = document.getElementById('save-worldbook-btn');
        if (!saveBtn) {
            saveBtn = document.createElement('button');
            saveBtn.id = 'save-worldbook-btn';
            saveBtn.textContent = '保存到角色库';
            saveBtn.className = 'uniform-btn';
            saveBtn.style.cssText = 'margin: 10px 5px;';
            saveBtn.onclick = () => saveWorldbookToLibrary();
            container.appendChild(saveBtn);
        }

    } catch (error) {
        console.error('AI处理过程中发生错误:', error);
        document.getElementById('progress-text').textContent = `❌ 处理过程出错: ${error.message}`;
        alert(`处理失败: ${error.message}\n\n进度已保存，可以稍后继续。`);
    } finally {
        const hasFailedMemories = memoryQueue.some(m => m.failed === true);

        // 只有在完成且没有失败记忆时才移除停止按钮，暂停时或有失败记忆时不移除
        if (!isProcessingStopped && !hasFailedMemories) {
            removeStopButton();
        }

        // 确保进度条在3秒后隐藏（除非被停止或有失败记忆）
        if (!isProcessingStopped && !hasFailedMemories) {
            setTimeout(() => {
                document.getElementById('progress-section').style.display = 'none';
            }, 3000);
        }

        // 如果有失败记忆，确保修复按钮显示
        if (hasFailedMemories) {
            updateRepairButton();
            updateMemoryQueueUI();
        }
    }
}

// 添加停止按钮
function addStopButton() {
    // 避免重复添加
    if (document.getElementById('stop-processing-btn')) return;

    const progressSection = document.getElementById('progress-section');
    const stopBtn = document.createElement('button');
    stopBtn.id = 'stop-processing-btn';
    stopBtn.textContent = '⏸️ 保存并暂停（刷新网页）';
    stopBtn.style.cssText = 'background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 5px; margin-top: 10px; cursor: pointer; font-size: 14px;';
    stopBtn.onclick = stopProcessing;

    // 插入到进度条下方
    progressSection.appendChild(stopBtn);

    // 同时添加查看世界书按钮
    addViewWorldbookButton();
}

// 移除停止按钮
function removeStopButton() {
    const stopBtn = document.getElementById('stop-processing-btn');
    if (stopBtn) {
        stopBtn.remove();
    }
}

// 将停止按钮转换为继续按钮
function convertToResumeButton(currentIndex) {
    const stopBtn = document.getElementById('stop-processing-btn');
    if (stopBtn) {
        stopBtn.textContent = '▶️ 继续处理';
        stopBtn.style.cssText = 'background: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 5px; margin-top: 10px; cursor: pointer; font-size: 14px;';
        stopBtn.onclick = () => {
            stopBtn.remove();
            continueProcessing(currentIndex);
        };
    }
}

// 停止处理并刷新页面
function stopProcessing() {
    // 保存当前进度状态
    mylog('用户请求暂停处理并刷新页面');
    // 直接刷新页面
    location.reload();
}

// 处理单个记忆块（带重试机制）
async function processMemoryChunk(index, retryCount = 0) {
    const memory = memoryQueue[index];
    const progress = ((index + 1) / memoryQueue.length) * 100;
    const maxRetries = 5; // 最大重试次数

    // 更新进度，显示重试信息
    document.getElementById('progress-fill').style.width = progress + '%';
    const retryText = retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : '';
    document.getElementById('progress-text').textContent = `正在处理: ${memory.title} (${index + 1}/${memoryQueue.length})${retryText}`;

    // 检查是否启用文风配置和剧情大纲
    const enableLiteraryStyle = document.getElementById('enable-literary-style')?.checked ?? false;
    const enablePlotOutline = document.getElementById('enable-plot-outline')?.checked ?? true;

    // 使用动态生成的JSON模板
    const jsonTemplate = generateMainPromptJsonTemplate();
    const enabledCategoriesDesc = getEnabledCategoriesDescription();

    // 精简版提示词 - 不再在这里添加破限内容，由 callSimpleAPI 通过 system 角色处理
    let prompt = getLanguagePrefix();

    prompt += `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **只提取文中明确出现的${enabledCategoriesDesc}等信息**
3. **关键词必须是文中实际出现的名称**，用逗号分隔
4. **内容必须基于原文描述**，不要添加原文没有的信息
5. **内容使用markdown格式**，可以层层嵌套或使用序号标题

## 📤 输出格式
请生成标准JSON格式，确保能被JavaScript正确解析：

\`\`\`json
${jsonTemplate}
\`\`\`

## 重要提醒
- 直接输出JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁${enablePlotOutline ? '\n- 剧情大纲是必需项，必须生成' : ''}${enableLiteraryStyle ? '\n- 文风配置字段为可选项，如果能够分析出明确的文风特征则生成，否则可以省略' : ''}

`;

    if (index > 0) {
        prompt += `这是你上一次阅读的结尾部分：
---
${memoryQueue[index - 1].content.slice(-500)}
---

`;
        prompt += `这是当前你对该作品的记忆：
${JSON.stringify(generatedWorldbook, null, 2)}

`;
    }

    prompt += `这是你现在阅读的部分：
---
${memory.content}
---

`;

    if (index === 0) {
        prompt += `现在开始分析小说内容，请专注于提取文中实际出现的信息：

`;
    } else {
        // 根据增量输出模式选择不同的提示词
        if (incrementalOutputMode) {
            prompt += `请基于新内容**增量更新**世界书，采用**点对点覆盖**模式：

**增量输出规则**：
1. **只输出本次需要变更的条目**，不要输出完整的世界书
2. **新增条目**：直接输出新条目的完整内容
3. **修改条目**：输出该条目的完整新内容（会覆盖原有内容）
4. **未变更的条目不要输出**，系统会自动保留
5. **关键词合并**：新关键词会自动与原有关键词合并，无需重复原有关键词

**示例**：如果只有"张三"角色有新信息，只需输出：
{"角色": {"张三": {"关键词": ["新称呼"], "内容": "更新后的完整描述..."}}}

`;
        } else {
            prompt += `请基于新内容**累积补充**世界书，注意以下要点：

**重要规则**：
1. **已有角色**：如果角色已存在，请在原有内容基础上**追加新信息**，不要删除或覆盖已有描述
2. **新角色**：如果是新出现的角色，添加为新条目
3. **剧情大纲**：持续追踪主线发展，**追加新的剧情进展**而不是重写
4. **关键词**：为已有条目补充新的关键词（如新称呼、新关系等）
5. **保持完整性**：确保之前章节提取的重要信息不会丢失

`;
        }
    }

    prompt += `请直接输出JSON格式的结果，不要添加任何代码块标记或解释文字。`;

    // 添加prompt查看功能
    mylog(`=== 第${index + 1}步 Prompt ===`);
    mylog(prompt);
    mylog('=====================');

    try {
        mylog(`开始调用API处理第${index + 1}个记忆块...`);
        document.getElementById('progress-text').textContent = `正在调用API: ${memory.title} (${index + 1}/${memoryQueue.length})`;

        // 调用AI API（使用现有的API系统）
        const response = await callSimpleAPI(prompt);

        mylog(`API调用完成，返回内容长度: ${response.length}`);
        mylog(response);

        // ========== 检查返回内容是否包含token超限错误（上下文超限的表现） ==========
        if (isContextOverflowError(response)) {
            mylog(`⚠️ 返回内容包含token超限错误，判定为上下文超限`);
            document.getElementById('progress-text').textContent = `🔀 返回内容包含token超限错误，判定为上下文超限，分裂所有后续记忆...`;

            // 分裂所有后续记忆
            splitAllRemainingMemories(index);
            updateMemoryQueueUI();
            mylog(`💾 分裂后保存状态，队列长度: ${memoryQueue.length}，队列标题: ${memoryQueue.map(m => m.title).join(', ')}`);
            await NovelState.saveState(memoryQueue.filter(m => m.processed).length);

            throw new Error(`返回内容包含token超限错误，判定为上下文超限，已分裂所有后续记忆`);
        }

        // 清理和解析返回的JSON
        let memoryUpdate;
        try {
            // 直接尝试解析
            memoryUpdate = JSON.parse(response);
            mylog('✅ JSON直接解析成功');
        } catch (jsonError) {
            mylog('直接JSON解析失败，原因:', jsonError.message);
            mylog('开始清理内容，原始长度:', response.length);
            let cleanResponse = response.trim();

            // 移除可能的代码块标记
            cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

            // 移除可能的前导解释文字
            if (cleanResponse.startsWith('{')) {
                // 已经是JSON开头，不需要处理
            } else {
                // 尝试找到第一个 { 到最后一个 } 的内容
                const firstBrace = cleanResponse.indexOf('{');
                const lastBrace = cleanResponse.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
                    mylog('提取JSON部分，新长度:', cleanResponse.length);
                }
            }

            // 不要过度处理！AI返回的JSON中的换行符应该已经被正确转义了
            // 只做最基本的清理
            // 注意：不要随意替换\n，因为JSON字符串中的\n是正确的转义序列

            try {
                memoryUpdate = JSON.parse(cleanResponse);
                mylog('✅ JSON清理后解析成功');
            } catch (secondError) {
                console.error('❌ JSON解析仍然失败');
                console.error('错误信息:', secondError.message);
                console.error('错误位置:', secondError.stack);
                console.error('清理后响应长度:', cleanResponse.length);
                console.error('🔍 完整AI响应内容（点击展开）:', cleanResponse);

                // 尝试找到具体的错误位置
                try {
                    const errorMatch = secondError.message.match(/position (\d+)/);
                    if (errorMatch) {
                        const pos = parseInt(errorMatch[1]);
                        console.error('错误位置附近内容:', cleanResponse.substring(Math.max(0, pos - 100), Math.min(cleanResponse.length, pos + 100)));
                    }
                } catch (e) {
                    // 忽略
                }

                // ========== 新增：正则回退解析机制 ==========
                mylog('🔄 尝试使用正则表达式提取内容...');
                document.getElementById('progress-text').textContent = `JSON解析失败，尝试正则提取: ${memory.title} (${index + 1}/${memoryQueue.length})`;

                // 检查内容完整性：是否有正确的闭合符
                const openBraces = (cleanResponse.match(/{/g) || []).length;
                const closeBraces = (cleanResponse.match(/}/g) || []).length;
                const missingBraces = openBraces - closeBraces;

                if (missingBraces > 0) {
                    mylog(`⚠️ 检测到内容不完整：开括号${openBraces}个，闭括号${closeBraces}个，缺少${missingBraces}个`);

                    // 尝试自动添加缺少的闭合括号
                    mylog(`🔧 尝试自动添加${missingBraces}个闭合括号...`);
                    try {
                        memoryUpdate = JSON.parse(cleanResponse + '}'.repeat(missingBraces));
                        mylog(`✅ 自动添加${missingBraces}个闭合括号后解析成功`);
                        // 成功解析，不需要继续后续处理
                    } catch (autoFixError) {
                        mylog('❌ 自动添加闭合括号后仍然失败');
                        mylog(`⚠️ JSON内容不完整（缺少${missingBraces}个闭合括号），标记为失败`);
                        throw new Error(`JSON内容不完整（缺少${missingBraces}个闭合括号），自动修复失败`);
                    }
                } else {
                    // 尝试使用正则提取世界书条目
                    const regexExtractedData = extractWorldbookDataByRegex(cleanResponse);

                    if (regexExtractedData && Object.keys(regexExtractedData).length > 0) {
                        // 正则提取成功
                        mylog('✅ 正则提取成功！提取到的分类:', Object.keys(regexExtractedData));
                        memoryUpdate = regexExtractedData;
                        document.getElementById('progress-text').textContent = `正则提取成功: ${memory.title} (${index + 1}/${memoryQueue.length})`;
                    } else {
                        // 正则提取失败，继续使用API纠正
                        mylog('⚠️ 正则提取未能获取有效数据，尝试API纠正...');

                        // 调用API纠正格式错误的JSON
                        mylog('🔧 尝试调用API纠正JSON格式...');
                        document.getElementById('progress-text').textContent = `JSON格式错误，正在调用AI纠正: ${memory.title} (${index + 1}/${memoryQueue.length})`;

                        try {
                            // 构建纠正提示词（严格输出控制，参考世界书输出格式风格）
                            const fixPrompt = getLanguagePrefix() + `你是专业的JSON修复专家。请将下面“格式错误的JSON文本”修复为严格有效、可被 JavaScript 的 JSON.parse() 直接解析的JSON。

## 📋 核心要求
1. **只修复格式**：保持原有数据语义与内容不变，不要总结、不要改写字段名、不要增删字段。
2. **输出必须是单个JSON对象**：返回内容必须从第一个字符“{”开始，到最后一个字符“}”结束。
3. **禁止任何额外输出**：不要包含解释文字、不要包含Markdown、不要包含代码块标记、不要包含前后缀、不要输出多段内容。
4. **严格JSON语法**：
   - 所有key必须用双引号包裹
   - 字符串必须使用双引号
   - 不允许尾随逗号
   - 不允许注释
5. **字符串换行与特殊字符必须正确转义**：字符串中的换行必须使用 \\n，反斜杠与引号必须正确转义。

## 🧩 世界书JSON基本嵌套结构（必须遵循）
修复后的JSON应尽量保持/恢复为以下结构（允许只包含其中一部分分类，但结构层级必须一致）：

${generateFixPromptJsonStructure()}

要求：
- 顶层的每个分类（例如"${getCategoryNamesList()}"）的值必须是对象。
- 分类下每个条目的值必须是对象，且包含 "关键词"(数组) 与 "内容"(字符串) 两个字段。
- 如果原文中某条目值不是对象（比如直接是字符串），请在不改变语义的前提下包装成 {"关键词":[], "内容":"原内容"}。

## 📤 输出格式
直接输出修复后的JSON（不要包含任何其他字符）。

## 错误信息（用于定位，不需要复述）
${secondError.message}

## 需要修复的JSON文本
${cleanResponse}
`;

                            // 调用API进行格式纠正
                            const fixedResponse = await callSimpleAPI(fixPrompt);
                            mylog('API返回的纠正结果长度:', fixedResponse.length);

                            // 清理纠正后的响应
                            let cleanedFixedResponse = fixedResponse.trim();
                            cleanedFixedResponse = cleanedFixedResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

                            // 提取JSON主体（避免模型输出前后夹带内容）
                            const firstBrace = cleanedFixedResponse.indexOf('{');
                            const lastBrace = cleanedFixedResponse.lastIndexOf('}');
                            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                cleanedFixedResponse = cleanedFixedResponse.substring(firstBrace, lastBrace + 1);
                            }

                            // 解析纠正后的JSON
                            memoryUpdate = JSON.parse(cleanedFixedResponse);
                            mylog('✅ JSON格式纠正成功！');
                            document.getElementById('progress-text').textContent = `JSON格式已纠正: ${memory.title} (${index + 1}/${memoryQueue.length})`;

                        } catch (fixError) {
                            console.error('❌ JSON格式纠正也失败:', fixError.message);

                            // 如果纠正也失败，创建一个简单的默认结构
                            mylog('⚠️ 无法解析JSON，使用默认结构保存原始响应');
                            memoryUpdate = {
                                '知识书': {
                                    [`第${index + 1}个记忆块_解析失败`]: {
                                        '关键词': ['解析失败', '格式错误'],
                                        '内容': `**解析失败原因**: ${secondError.message}\n\n**纠正尝试失败**: ${fixError.message}\n\n**原始响应预览**:\n${cleanResponse.substring(0, 2000)}${cleanResponse.length > 2000 ? '...[' + (cleanResponse.length - 2000) + ' bytes truncated]' : ''}`
                                    }
                                }
                            };
                        } // 关闭 try-catch (fixError) 块
                    } // 关闭 else 块（正则提取失败时的API纠正分支）
                } // 关闭 if-else (missingBraces > 0)
            } // 关闭 catch (secondError) 块
        }

        // 合并到主世界书（带历史记录）
        const changedEntries = await mergeWorldbookDataWithHistory(generatedWorldbook, memoryUpdate, index, memory.title);

        // 如果启用了增量输出模式，显示本次变更的条目（合并输出）
        if (incrementalOutputMode && changedEntries.length > 0) {
            const added = changedEntries.filter(c => c.type === 'add').map(c => `[${c.category}] ${c.entryName}`);
            const modified = changedEntries.filter(c => c.type === 'modify').map(c => `[${c.category}] ${c.entryName}`);
            const deleted = changedEntries.filter(c => c.type === 'delete').map(c => `[${c.category}] ${c.entryName}`);

            let summary = `📝 第${index + 1}个记忆块变更 ${changedEntries.length} 个条目:`;
            if (added.length > 0) summary += ` ➕新增${added.length}个(${added.join(', ')})`;
            if (modified.length > 0) summary += ` ✏️修改${modified.length}个(${modified.join(', ')})`;
            if (deleted.length > 0) summary += ` ❌删除${deleted.length}个(${deleted.join(', ')})`;
            mylog(summary);
        }

        // 标记为已处理
        memory.processed = true;
        updateMemoryQueueUI();
        mylog(`记忆块 ${index + 1} 处理完成`);

    } catch (error) {
        console.error(`处理记忆块 ${index + 1} 时出错 (第${retryCount + 1}次尝试):`, error);

        // ========== 检查是否是上下文超限错误 ==========
        const errorMsg = error.message || '';

        // 使用统一的检测函数，或者检查特殊标记
        const isTokenLimitError = errorMsg.startsWith('CONTEXT_OVERFLOW:') || isContextOverflowError(errorMsg);

        if (isTokenLimitError) {
            mylog(`⚠️ 检测到token超限错误，直接分裂记忆: ${memory.title}`);
            document.getElementById('progress-text').textContent = `🔀 字数超限，正在分裂记忆: ${memory.title}`;

            // 直接分裂记忆
            const splitResult = splitMemoryIntoTwo(index);
            if (splitResult) {
                mylog(`✅ 记忆分裂成功: ${splitResult.part1.title} 和 ${splitResult.part2.title}`);
                updateMemoryQueueUI();
                // 分裂后立即保存状态，确保刷新后能恢复
                await NovelState.saveState(memoryQueue.filter(m => m.processed).length);
                await new Promise(resolve => setTimeout(resolve, 500));

                // 递归处理第一个分裂记忆
                const part1Index = memoryQueue.indexOf(splitResult.part1);
                await processMemoryChunk(part1Index, 0);

                // 第一个完全处理完后，再处理第二个
                const part2Index = memoryQueue.indexOf(splitResult.part2);
                await processMemoryChunk(part2Index, 0);

                return; // 分裂处理完成，直接返回
            } else {
                console.error(`❌ 记忆分裂失败: ${memory.title}`);
                // 分裂失败，标记为失败
                memory.processed = true;
                memory.failed = true;
                memory.failedError = error.message;
                if (!failedMemoryQueue.find(m => m.index === index)) {
                    failedMemoryQueue.push({ index, memory, error: error.message });
                }
                updateMemoryQueueUI();
                return;
            }
        }

        // 非token超限错误，使用原有的重试机制
        if (retryCount < maxRetries) {
            mylog(`准备重试，当前重试次数: ${retryCount + 1}/${maxRetries}`);
            const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // 指数退避，最大10秒
            document.getElementById('progress-text').textContent = `处理失败，${retryDelay / 1000}秒后重试: ${memory.title} (${retryCount + 1}/${maxRetries})`;

            await new Promise(resolve => setTimeout(resolve, retryDelay));

            // 递归重试
            return await processMemoryChunk(index, retryCount + 1);
        } else {
            // 达到最大重试次数后才放弃
            console.error(`记忆块 ${index + 1} 重试${maxRetries}次后仍然失败`);
            document.getElementById('progress-text').textContent = `处理失败 (已重试${maxRetries}次): ${memory.title}`;

            // 标记为失败并加入失败队列
            memory.processed = true;
            memory.failed = true;
            memory.failedError = error.message;

            // 添加到失败队列
            if (!failedMemoryQueue.find(m => m.index === index)) {
                failedMemoryQueue.push({ index, memory, error: error.message });
            }

            updateMemoryQueueUI();

            // 显示错误详情
            mylog(`记忆块 ${index + 1} 处理失败，已加入修复队列，可点击❗一键修复`);
        }
    }

    // 等待一段时间再处理下一个（只在成功或最终失败时等待）
    if (memory.processed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// ========== 统一的上下文超限检测函数 ==========
function isContextOverflowError(text) {
    // 将错误响应转为字符串（无论是JSON对象还是纯文本）
    let errorString = text;
    try {
        // 尝试解析为JSON，然后转回字符串（这样可以检测深层嵌套的内容）
        const errorObj = JSON.parse(text);
        errorString = JSON.stringify(errorObj);
    } catch (e) {
        // 如果不是JSON，直接使用原文本
        errorString = text;
    }

    // 使用正则表达式检测超限关键词（不区分大小写）
    return /max|long|exceed|limit|token|context|reduce|length/i.test(errorString);
}

// 简化的API调用函数（不依赖按钮）
async function callSimpleAPI(prompt, retryCount = 0) {
    const apiSettings = loadApiSettings();
    const provider = apiSettings.provider;
    const maxRetries = 3;

    mylog('API设置:', { provider, settings: apiSettings[provider] });

    // 检查API配置
    if (!apiSettings[provider]) {
        throw new Error(`请先配置API设置（${provider}）`);
    }

    // 统一检查全局破限开关（使用gemini-use-system-prompt作为全局开关）
    const useJailbreak = apiSettings.gemini?.useSystemPrompt || false;

    // 生成破限系统消息
    let systemMessage = '';
    if (useJailbreak && typeof generateLimitlessPrompt === 'function') {
        try {
            systemMessage = await generateLimitlessPrompt('system');
        } catch (error) {
            console.error('破限提示词生成失败:', error);
        }
    }

    let requestUrl, requestOptions;

    switch (provider) {
        case 'deepseek':
            if (!apiSettings.deepseek.apiKey) throw new Error('DeepSeek API Key is missing.');
            requestUrl = 'https://api.deepseek.com/chat/completions';

            const deepseekMessages = systemMessage
                ? [{ role: 'system', content: systemMessage }, { role: 'user', content: prompt }]
                : [{ role: 'user', content: prompt }];

            requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiSettings.deepseek.apiKey}` },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: deepseekMessages,
                    temperature: 0,
                    max_tokens: 8192  // DeepSeek的最大输出限制
                }),
            };
            mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
            break;

        case 'gemini':
            if (!apiSettings.gemini.apiKey) throw new Error('Gemini API Key is missing.');
            const geminiModel = apiSettings.gemini.model || 'gemini-1.5-flash';
            requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiSettings.gemini.apiKey}`;
            requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 65536, temperature: 0 }
                }),
            };
            mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
            break;

        case 'gemini-proxy':
            if (!apiSettings['gemini-proxy'].endpoint) throw new Error('Gemini Proxy Endpoint 未设置');
            if (!apiSettings['gemini-proxy'].apiKey) throw new Error('Gemini Proxy API Key 未设置');

            let proxyBaseUrl = apiSettings['gemini-proxy'].endpoint;
            if (!proxyBaseUrl.startsWith('http')) proxyBaseUrl = 'https://' + proxyBaseUrl;
            if (proxyBaseUrl.endsWith('/')) proxyBaseUrl = proxyBaseUrl.slice(0, -1);

            const geminiProxyModel = apiSettings['gemini-proxy'].model || 'gemini-2.5-flash';
            const useOpenAIFormat = proxyBaseUrl.endsWith('/v1');

            if (useOpenAIFormat) {
                // OpenAI兼容格式
                requestUrl = proxyBaseUrl + '/chat/completions';

                const geminiProxyMessages = systemMessage
                    ? [{ role: 'system', content: systemMessage }, { role: 'user', content: prompt }]
                    : [{ role: 'user', content: prompt }];

                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings['gemini-proxy'].apiKey}`
                    },
                    body: JSON.stringify({
                        model: geminiProxyModel,
                        messages: geminiProxyMessages,
                        temperature: 0,
                        max_tokens: 65536
                    }),
                };
            } else {
                // Gemini原生格式
                const finalProxyUrl = `${proxyBaseUrl}/${geminiProxyModel}:generateContent`;
                requestUrl = finalProxyUrl.includes('?')
                    ? `${finalProxyUrl}&key=${apiSettings['gemini-proxy'].apiKey}`
                    : `${finalProxyUrl}?key=${apiSettings['gemini-proxy'].apiKey}`;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 65536, temperature: 0 }
                    }),
                };
            }
            mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
            break;

        case 'local':
            const localEndpoint = apiSettings.local?.endpoint || 'http://127.0.0.1:5000/v1/chat/completions';
            const localModel = apiSettings.local?.model || 'local-model';

            const localMessages = systemMessage
                ? [{ role: 'system', content: systemMessage }, { role: 'user', content: prompt }]
                : [{ role: 'user', content: prompt }];

            requestUrl = localEndpoint;
            requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: localModel,
                    messages: localMessages,
                    temperature: 0,
                    max_tokens: 65536
                }),
            };
            mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
            break;

        case 'tavern':
            const providerSettings = apiSettings.tavern;
            const isReverseProxy = providerSettings.connectionType === 'reverse-proxy';

            let endpoint, apiKey, model;

            if (isReverseProxy) {
                // 使用反向代理设置
                endpoint = providerSettings.proxyUrl;
                apiKey = providerSettings.proxyPassword;
                model = providerSettings.proxyModel || 'gpt-3.5-turbo';

                if (!endpoint) throw new Error('代理服务器 URL 未设置');
            } else {
                // 使用直连设置
                endpoint = providerSettings.endpoint;
                apiKey = providerSettings.apiKey;
                model = providerSettings.model || 'gpt-3.5-turbo';

                if (!endpoint) throw new Error('Tavern API Endpoint 未设置');
            }

            // 处理endpoint格式
            let finalEndpoint = endpoint;
            if (isReverseProxy) {
                if (!finalEndpoint.includes('/chat/completions')) {
                    if (finalEndpoint.endsWith('/v1')) {
                        finalEndpoint += '/chat/completions';
                    } else if (finalEndpoint.endsWith('/')) {
                        finalEndpoint += 'chat/completions';
                    } else {
                        finalEndpoint += '/chat/completions';
                    }
                }
            } else {
                if (finalEndpoint.endsWith('/v1')) {
                    finalEndpoint += '/chat/completions';
                }
            }

            if (!finalEndpoint.startsWith('http')) {
                finalEndpoint = 'https://' + finalEndpoint;
            }

            requestUrl = finalEndpoint;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const tavernMessages = systemMessage
                ? [{ role: 'system', content: systemMessage }, { role: 'user', content: prompt }]
                : [{ role: 'user', content: prompt }];

            requestOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    messages: tavernMessages,
                    temperature: 0,
                    max_tokens: 65536
                }),
            };
            mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
            break;

        case 'ollama':
            if (!apiSettings.ollama.endpoint) throw new Error('Ollama API Endpoint 未设置');
            if (!apiSettings.ollama.model) throw new Error('Ollama Model 未设置');

            let ollamaEndpoint = apiSettings.ollama.endpoint;
            if (!ollamaEndpoint.startsWith('http')) {
                ollamaEndpoint = 'http://' + ollamaEndpoint;
            }
            if (ollamaEndpoint.endsWith('/')) {
                ollamaEndpoint = ollamaEndpoint.slice(0, -1);
            }

            requestUrl = ollamaEndpoint + '/api/generate';
            requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: apiSettings.ollama.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0,
                    }
                }),
            };
            mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
            break;

        default:
            throw new Error(`不支持的提供商: ${provider}`);
    }

    try {
        const response = await fetch(requestUrl, requestOptions);

        if (!response.ok) {
            const errorText = await response.text();
            mylog('API错误响应:', errorText);

            // ========== 优先检查是否是上下文超限错误 ==========
            if (isContextOverflowError(errorText)) {
                mylog('⚠️ 检测到上下文超限错误，立即抛出特殊错误');
                mylog('匹配的错误内容:', errorText.substring(0, 200));
                // 抛出特殊的超限错误，包含完整的错误信息
                throw new Error(`CONTEXT_OVERFLOW: ${errorText}`);
            }

            // 检查是否是限流错误
            if (response.status === 429 || errorText.includes('resource_exhausted') || errorText.includes('rate limit')) {
                if (retryCount < maxRetries) {
                    const delay = Math.pow(2, retryCount) * 1000; // 指数退避：1s, 2s, 4s
                    mylog(`遇到限流，${delay}ms后重试 (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return callSimpleAPI(prompt, retryCount + 1);
                } else {
                    throw new Error(`API限流：已达到最大重试次数。请等待几分钟后再试，或考虑升级到付费版本。`);
                }
            }

            throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // 解析响应
        if (provider === 'deepseek' || provider === 'tavern' || provider === 'local') {
            return data.choices[0].message.content;
        } else if (provider === 'gemini') {
            return data.candidates[0].content.parts[0].text;
        } else if (provider === 'gemini-proxy') {
            // gemini-proxy 可能返回两种格式
            if (data.candidates) {
                // Gemini原生格式
                return data.candidates[0].content.parts[0].text;
            } else if (data.choices) {
                // OpenAI兼容格式
                return data.choices[0].message.content;
            } else {
                throw new Error('Gemini Proxy 返回了未知的响应格式');
            }
        } else if (provider === 'ollama') {
            return data.response;
        }

        throw new Error('未知的API响应格式');

    } catch (networkError) {
        if (networkError.message.includes('fetch')) {
            throw new Error('网络连接失败，请检查网络设置');
        }
        throw networkError;
    }
}

// 标准化世界书条目字段（将content转为内容）
function normalizeWorldbookEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;

    // 如果同时存在 content 和 内容，取字数最多的
    if (entry.content !== undefined && entry['内容'] !== undefined) {
        const contentLen = String(entry.content || '').length;
        const neirongLen = String(entry['内容'] || '').length;
        if (contentLen > neirongLen) {
            entry['内容'] = entry.content;
        }
        delete entry.content;
    } else if (entry.content !== undefined) {
        // 只有 content，转为 内容
        entry['内容'] = entry.content;
        delete entry.content;
    }

    return entry;
}

// 递归标准化整个世界书数据
function normalizeWorldbookData(data) {
    if (!data || typeof data !== 'object') return data;

    for (const category in data) {
        if (typeof data[category] === 'object' && data[category] !== null && !Array.isArray(data[category])) {
            // 检查是否是条目（有关键词或内容/content字段）
            if (data[category]['关键词'] || data[category]['内容'] || data[category].content) {
                normalizeWorldbookEntry(data[category]);
            } else {
                // 递归处理子分类
                for (const entryName in data[category]) {
                    if (typeof data[category][entryName] === 'object') {
                        normalizeWorldbookEntry(data[category][entryName]);
                    }
                }
            }
        }
    }
    return data;
}

// 合并世界书数据
function mergeWorldbookData(target, source) {
    // 先标准化源数据
    normalizeWorldbookData(source);

    for (const key in source) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            mergeWorldbookData(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
}

// 查看生成的世界书JSON
function viewGeneratedWorldbook() {
    if (!generatedWorldbook || Object.keys(generatedWorldbook).length === 0) {
        alert('没有生成的世界书数据可以查看！');
        return;
    }

    // 创建模态窗口显示JSON内容
    const modal = document.createElement('div');
    modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
`;

    const content = document.createElement('div');
    content.style.cssText = `
    background: #2d2d2d;
    width: 90%;
    height: 80%;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
`;

    const header = document.createElement('div');
    header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #555;
`;

    const title = document.createElement('h3');
    title.textContent = '生成的世界书JSON预览';
    title.style.cssText = 'margin: 0; color: #fff;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
    color: #ccc;
`;
    closeBtn.onclick = () => document.body.removeChild(modal);

    const textarea = document.createElement('textarea');
    textarea.style.cssText = `
    flex: 1;
    width: 100%;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 10px;
    font-family: monospace;
    font-size: 12px;
    resize: none;
    background: #FFF8DC;
`;
    textarea.value = JSON.stringify(generatedWorldbook, null, 2);
    textarea.readOnly = true;

    header.appendChild(title);
    header.appendChild(closeBtn);
    content.appendChild(header);
    content.appendChild(textarea);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // // 点击模态窗口外部关闭
    // modal.onclick = (e) => {
    //     if (e.target === modal) {
    //     document.body.removeChild(modal);
    //     }
    // };
}

// 导出数据
function exportWorldbook() {
    // 生成文件名安全的日期时间后缀
    const timeString = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/[:/\s]/g, '').replace(/,/g, '-');

    // 使用原txt文件名生成下载文件名
    let fileName = '转换数据';
    if (currentFile && currentFile.name) {
        const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
        fileName = `${baseName}-世界书生成数据-${timeString}`;
    } else {
        fileName = `转换数据-${timeString}`;
    }

    const blob = new Blob([JSON.stringify(generatedWorldbook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

// 导入到SillyTavern
async function importToSillyTavern() {
    // 生成文件名安全的日期时间后缀
    const timeString = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/[:/\s]/g, '').replace(/,/g, '-');

    try {
        // 转换为SillyTavern世界书格式
        const sillyTavernWorldbook = convertToSillyTavernFormat(generatedWorldbook);

        // 使用原txt文件名生成下载文件名
        let fileName = '酒馆书';
        if (currentFile && currentFile.name) {
            const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
            fileName = `${baseName}-世界书参考-${timeString}`;
        } else {
            fileName = `酒馆书-${timeString}`;
        }

        // 创建下载文件
        const blob = new Blob([JSON.stringify(sillyTavernWorldbook, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName + '.json';
        a.click();
        URL.revokeObjectURL(url);

        alert('世界书已转换为SillyTavern格式并下载，请在SillyTavern中手动导入该文件。');
    } catch (error) {
        console.error('转换为SillyTavern格式失败:', error);
        alert('转换失败：' + error.message);
    }
}

// 保存世界书到角色库
async function saveWorldbookToLibrary() {
    // 生成可读的日期时间格式用于显示
    const readableTimeString = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    if (!(await checkDbReady())) return;

    if (!generatedWorldbook || Object.keys(generatedWorldbook).length === 0) {
        alert('没有世界书数据可以保存！');
        return;
    }

    // 生成世界书名称
    let worldbookName = '世界书';
    if (currentFile && currentFile.name) {
        const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
        worldbookName = `${baseName}-世界书-${readableTimeString}`;
        mylog('使用文件名:', baseName, '完整名称:', worldbookName);
    } else {
        worldbookName = `世界书-${readableTimeString}`;
        mylog('未找到文件名，使用默认名称:', worldbookName);
        mylog('currentFile状态:', currentFile);
    }

    // 创建角色卡对象，将世界书作为主要内容
    // 注意：不设置id字段，让IndexedDB的autoIncrement自动分配
    const worldbookCard = {
        name: worldbookName,
        description: '',
        first_mes: '',
        avatar: null,
        personality: '',
        scenario: '',
        tags: [],
        internalTags: [],
        worldbook: convertGeneratedWorldbookToStandard(generatedWorldbook),
        character_version: '1.0',
        lastUsed: Date.now(),
        mes_example: '',
        creator_notes: '由妮卡角色工作室从小说文本自动生成',
        system_prompt: '',
        post_history_instructions: '',
        gender: '',
        isFavorite: false
    };

    try {
        const transaction = db.transaction(['characters'], 'readwrite');
        const store = transaction.objectStore('characters');

        const addRequest = store.add(worldbookCard);
        addRequest.onsuccess = () => {
            alert(`世界书已成功保存到角色库！\n名称：${worldbookName}\n\n你可以在角色库中找到并使用它。`);
            mylog('世界书已保存到角色库:', worldbookName);
        };

        addRequest.onerror = (error) => {
            console.error('保存世界书失败:', error);
            alert('保存失败：' + error.target.error.message);
        };

    } catch (error) {
        console.error('保存世界书到库时出错:', error);
        alert('保存失败：' + error.message);
    }
}

// 将生成的世界书转换为标准世界书数组格式
function convertGeneratedWorldbookToStandard(generatedWb) {
    const standardWorldbook = [];
    let entryId = 0;

    const triggerCategories = new Set(['地点', '剧情大纲']);

    // 遍历所有分类
    Object.keys(generatedWb).forEach(category => {
        const categoryData = generatedWb[category];

        const isTriggerCategory = triggerCategories.has(category);
        const constant = !isTriggerCategory;
        const selective = isTriggerCategory;

        if (typeof categoryData === 'object' && categoryData !== null) {
            Object.keys(categoryData).forEach(itemName => {
                const itemData = categoryData[itemName];

                if (typeof itemData === 'object' && itemData.关键词 && itemData.内容) {
                    // 创建标准世界书条目（数组格式）
                    standardWorldbook.push({
                        id: entryId++,
                        keys: Array.isArray(itemData.关键词) ? itemData.关键词 : [itemName],
                        secondary_keys: [],
                        comment: `[${category}] ${itemName}`,
                        content: itemData.内容,
                        priority: 100,
                        enabled: true,
                        position: 'before_char',
                        constant,
                        selective,
                        secondary_keys_logic: 'any',
                        use_regex: false,
                        prevent_recursion: false,
                        group: category,
                        scope: 'chat',
                        probability: 100,
                        wb_depth: 4,
                        match_whole_words: false,
                        case_sensitive: false,
                        children: []
                    });
                } else if (typeof itemData === 'string') {
                    // 简单字符串内容
                    standardWorldbook.push({
                        id: entryId++,
                        keys: [itemName],
                        secondary_keys: [],
                        comment: `[${category}] ${itemName}`,
                        content: itemData,
                        priority: 100,
                        enabled: true,
                        position: 'before_char',
                        constant,
                        selective,
                        secondary_keys_logic: 'any',
                        use_regex: false,
                        prevent_recursion: false,
                        group: category,
                        scope: 'chat',
                        probability: 100,
                        wb_depth: 4,
                        match_whole_words: false,
                        case_sensitive: false,
                        children: []
                    });
                }
            });
        }
    });

    mylog(`✅ 转换了 ${standardWorldbook.length} 个世界书条目`);
    return standardWorldbook;
}

// 转换为SillyTavern世界书格式
function convertToSillyTavernFormat(worldbook) {
    const entries = [];
    let entryId = 0;

    const triggerCategories = new Set(['地点', '剧情大纲']);

    // 处理新的世界书格式
    function processWorldbook(obj) {
        for (const [category, categoryData] of Object.entries(obj)) {
            if (typeof categoryData === 'object' && categoryData !== null) {
                const isTriggerCategory = triggerCategories.has(category);
                const constant = !isTriggerCategory;
                const selective = isTriggerCategory;

                // 处理每个分类下的条目
                for (const [itemName, itemData] of Object.entries(categoryData)) {
                    if (typeof itemData === 'object' && itemData !== null) {
                        // 新格式：包含关键词和内容的对象
                        if (itemData.关键词 && itemData.内容) {
                            const keywords = Array.isArray(itemData.关键词) ? itemData.关键词 : [itemData.关键词];

                            // 确保关键词不包含连字符，但保留有意义的词汇
                            const cleanKeywords = keywords.map(keyword => {
                                const keywordStr = String(keyword).trim();
                                // 只移除明显的连字符分隔，保留中文名字
                                return keywordStr.replace(/[-_\s]+/g, '');
                            }).filter(keyword =>
                                keyword.length > 0 &&
                                keyword.length <= 20 && // 避免过长的关键词
                                !['的', '了', '在', '是', '有', '和', '与', '或', '但'].includes(keyword) // 避免常用停词
                            );

                            // 确保至少有一个关键词
                            if (cleanKeywords.length === 0) {
                                cleanKeywords.push(itemName);
                            }

                            // 去重并保持顺序
                            const uniqueKeywords = [...new Set(cleanKeywords)];

                            // 确保内容是完整的叙述
                            let content = String(itemData.内容).trim();
                            if (!content.includes(itemName) && !content.match(/^[A-Za-z\u4e00-\u9fa5]/)) {
                                // 如果内容没有明确的主语，添加主语
                                content = `${itemName}${content}`;
                            }

                            entries.push({
                                uid: entryId++,
                                key: uniqueKeywords,
                                keysecondary: [],
                                comment: `${category} - ${itemName}`,
                                content: content,
                                constant,
                                selective,
                                selectiveLogic: 0, // AND_ANY
                                addMemo: true,
                                order: entryId * 100,
                                position: 0, // before_char
                                disable: false,
                                excludeRecursion: true,  // 默认开启不可被递归
                                preventRecursion: true,  // 默认开启防止进一步递归
                                delayUntilRecursion: false,
                                probability: 100,
                                depth: 4,
                                group: category,
                                groupOverride: false,
                                groupWeight: 100,
                                scanDepth: null,
                                caseSensitive: false, // 不区分大小写
                                matchWholeWords: true, // 匹配整词
                                useGroupScoring: null,
                                automationId: '',
                                role: 0,
                                vectorized: false,
                                sticky: null,
                                cooldown: null,
                                delay: null
                            });
                        }
                        // 旧格式兼容：直接的字符串值
                        else if (typeof itemData === 'string' && itemData.trim()) {
                            let content = itemData.trim();
                            // 确保内容有主语
                            if (!content.includes(itemName) && !content.match(/^[A-Za-z\u4e00-\u9fa5]/)) {
                                content = `${itemName}${content}`;
                            }

                            entries.push({
                                uid: entryId++,
                                key: [itemName],
                                keysecondary: [],
                                comment: `${category} - ${itemName}`,
                                content: content,
                                constant,
                                selective,
                                selectiveLogic: 0,
                                addMemo: true,
                                order: entryId * 100,
                                position: 0,
                                disable: false,
                                excludeRecursion: true,  // 默认开启不可被递归
                                preventRecursion: true,  // 默认开启防止进一步递归
                                delayUntilRecursion: false,
                                probability: 100,
                                depth: 4,
                                group: category,
                                groupOverride: false,
                                groupWeight: 100,
                                scanDepth: null,
                                caseSensitive: false,
                                matchWholeWords: true,
                                useGroupScoring: null,
                                automationId: '',
                                role: 0,
                                vectorized: false,
                                sticky: null,
                                cooldown: null,
                                delay: null
                            });
                        }
                    }
                    // 处理嵌套对象（递归处理）
                    else if (typeof itemData === 'object' && itemData !== null) {
                        processNestedObject(itemData, `${category}_${itemName}`);
                    }
                }
            }
        }
    }

    // 处理嵌套对象（旧格式兼容）
    function processNestedObject(obj, prefix) {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.trim()) {
                let content = value.trim();
                const entryName = `${prefix}_${key}`;

                // 确保内容有主语
                if (!content.includes(key) && !content.match(/^[A-Za-z\u4e00-\u9fa5]/)) {
                    content = `${key}${content}`;
                }

                entries.push({
                    uid: entryId++,
                    key: [key],
                    keysecondary: [],
                    comment: `从小说生成: ${entryName}`,
                    content: content,
                    constant: false,
                    selective: true,
                    selectiveLogic: 0,
                    addMemo: true,
                    order: entryId * 100,
                    position: 0,
                    disable: false,
                    excludeRecursion: true,  // 默认开启不可被递归
                    preventRecursion: true,  // 默认开启防止进一步递归
                    delayUntilRecursion: false,
                    probability: 100,
                    depth: 4,
                    group: prefix,
                    groupOverride: false,
                    groupWeight: 100,
                    scanDepth: null,
                    caseSensitive: false,
                    matchWholeWords: true,
                    useGroupScoring: null,
                    automationId: '',
                    role: 0,
                    vectorized: false,
                    sticky: null,
                    cooldown: null,
                    delay: null
                });
            } else if (typeof value === 'object' && value !== null) {
                processNestedObject(value, `${prefix}_${key}`);
            }
        }
    }

    processWorldbook(worldbook);

    // 如果没有生成任何条目，生成一个默认条目
    if (entries.length === 0) {
        entries.push({
            uid: 0,
            key: ['默认条目'],
            keysecondary: [],
            comment: '世界书转换时生成的默认条目',
            content: '这是一个从小说自动生成的世界书条目。',
            constant: false,
            selective: true,
            selectiveLogic: 0,
            addMemo: true,
            order: 100,
            position: 0,
            disable: false,
            excludeRecursion: true,  // 默认开启不可被递归
            preventRecursion: true,  // 默认开启防止进一步递归
            delayUntilRecursion: false,
            probability: 100,
            depth: 4,
            group: '默认',
            groupOverride: false,
            groupWeight: 100,
            scanDepth: null,
            caseSensitive: false,
            matchWholeWords: true,
            useGroupScoring: null,
            automationId: '',
            role: 0,
            vectorized: false,
            sticky: null,
            cooldown: null,
            delay: null
        });
    }

    mylog(`转换完成，生成了 ${entries.length} 个世界书条目`);

    return {
        entries: entries,
        originalData: {
            name: '小说转换的世界书',
            description: '由长文本转WorldBook功能生成，已优化关键词触发机制',
            version: 1,
            author: '妮卡角色工作室Pro',
            tags: ['小说', 'AI生成', '世界书', 'SillyTavern优化'],
            source: 'NovelToWorldbook'
        }
    };
}

// ====================================================================================
// --- AI HELPER FUNCTIONS ---
// ====================================================================================

function initializePlusSwitch() {
    const PlusSwitch = document.getElementById('Plus-switch');
    if (PlusSwitch) {
        // 从localStorage加载状态
        try {
            const settings = JSON.parse(localStorage.getItem('otherSettings')) || { formatEnhancement: false };
            PlusSwitch.checked = settings.formatEnhancement || false;
            toggleAiButtonText(PlusSwitch.checked);
        } catch (error) {
            console.error('加载格式增强设置失败:', error);
        }

        // 监听变化并保存到localStorage
        PlusSwitch.addEventListener('change', event => {
            toggleAiButtonText(event.target.checked);
            try {
                const settings = JSON.parse(localStorage.getItem('otherSettings')) || {};
                settings.formatEnhancement = event.target.checked;
                localStorage.setItem('otherSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('保存格式增强设置失败:', error);
            }
        });
    }
}

function toggleAiButtonText(isPlus) {
    const aiButtons = document.querySelectorAll('.ai-button');
    const newText = isPlus ? t('generate-style') : t('ai-help-write');
    aiButtons.forEach(button => {
        // 跳过批量生成按钮
        if (!button.classList.contains('batch-generate-btn')) {
            button.textContent = newText;
        }
    });
}

function getStylePromptPrefix() {
    return `

# 格式增强要求
- 请使用Markdown格式来结构化输出内容，提升可读性和维护性
- 如果任务是生成详细的"注入内容"，则{先严格参考**现有世界书条目参考:**下可以参考的数字序列的内容格式，再按M格式输出比原词条更细节的嵌套内容，可以更完全的了解这个人，比如MBTI，弱点，看起来的年龄......,不管你加什么，细节字数必须超过你模仿的条目的字数300字}
# M 格式：
- 使用 **粗体** 标记重要概念和关键词
- 使用 *斜体* 表示强调
- 使用 - 或 * 创建清晰的列表结构
- 使用适当的标题层级组织内容
- 在描述复杂情况时使用嵌套列表

## 内容组织建议：
- **身份特征**：职业、地位、背景等关键信息用粗体标记
- **外貌描述**：重要特征用粗体，细节描述保持自然
- **性格分析**：核心性格特质用粗体，具体表现用列表
- **关系网络**：重要人物关系用结构化列表展示
- **背景设定**：关键事件、转折点用粗体标记
`;
}

// 新增: 撤销AI补全的功能
function undoAiCompletion(undoButton) {
    const container = undoButton.closest('.field-group, .entry-grid');
    if (!container) return;

    const targetElement = container.querySelector('textarea, input:not([type=file]):not([type=checkbox])');
    if (targetElement && targetElement.dataset.aiBackup !== undefined) {
        targetElement.value = targetElement.dataset.aiBackup;
        delete targetElement.dataset.aiBackup; // 清除备份
        undoButton.style.display = 'none'; // 隐藏自己
    }
}

// AI响应内容过滤器 - 删除空值条目
function filterEmptyEntries(content) {
    if (!content || typeof content !== 'string') return content;

    try {
        // 尝试解析JSON格式的响应
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
            content.match(/\{[\s\S]*\}/) ||
            content.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
            let jsonContent = jsonMatch[1] || jsonMatch[0];
            let parsedData = JSON.parse(jsonContent);

            // 递归过滤空值
            function removeEmptyValues(obj) {
                if (Array.isArray(obj)) {
                    return obj.filter(item => {
                        const filtered = removeEmptyValues(item);
                        // 如果是对象，检查是否所有值都为空
                        if (typeof filtered === 'object' && filtered !== null) {
                            const values = Object.values(filtered);
                            return values.some(val =>
                                val !== null &&
                                val !== undefined &&
                                val !== '' &&
                                (Array.isArray(val) ? val.length > 0 : true)
                            );
                        }
                        return filtered !== null && filtered !== undefined && filtered !== '';
                    }).map(removeEmptyValues);
                } else if (typeof obj === 'object' && obj !== null) {
                    const filtered = {};
                    for (const [key, value] of Object.entries(obj)) {
                        const filteredValue = removeEmptyValues(value);
                        if (filteredValue !== null &&
                            filteredValue !== undefined &&
                            filteredValue !== '' &&
                            filteredValue !== 'null' &&
                            filteredValue !== 'undefined' &&
                            !/^[\s]*$/.test(String(filteredValue)) &&
                            (Array.isArray(filteredValue) ? filteredValue.length > 0 : true)) {
                            filtered[key] = filteredValue;
                        }
                    }
                    return filtered;
                }
                return obj;
            }

            const filteredData = removeEmptyValues(parsedData);

            // 如果原内容包含markdown格式，保持格式
            if (content.includes('```json')) {
                return content.replace(jsonMatch[0], '```json\n' + JSON.stringify(filteredData, null, 2) + '\n```');
            } else {
                return JSON.stringify(filteredData, null, 2);
            }
        }

        // 处理非JSON格式的文本内容
        // 删除空行和只包含特殊字符的行
        return content
            .split('\n')
            .filter(line => {
                const trimmed = line.trim();
                return trimmed !== '' &&
                    trimmed !== '""' &&
                    trimmed !== "''" &&
                    trimmed !== 'null' &&
                    trimmed !== 'undefined' &&
                    trimmed !== '无' &&
                    trimmed !== 'N/A' &&
                    trimmed !== 'n/a' &&
                    !/^[,\s\-\*\+\.]*$/.test(trimmed) &&
                    !/^[\s]*[\-\*\+\.][\s]*$/.test(trimmed);
            })
            .join('\n')
            .replace(/\n{3,}/g, '\n\n') // 合并多余的空行
            .replace(/^[\s\n]+|[\s\n]+$/g, ''); // 删除首尾空白

    } catch (error) {
        console.warn('内容过滤失败，返回原始内容:', error);
        return content;
    }
}

// 基于SillyTavern实现的高级Gemini API处理
async function buildGeminiRequest(prompt, settings, provider) {
    const isSystemPromptEnabled = settings[provider]?.useSystemPrompt || false;
    const model = settings[provider]?.model || 'gemini-2.5-flash';

    // 构建基础请求体
    const requestBody = {
        contents: [],
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' }
        ],
        generationConfig: {
            candidateCount: 1,
            maxOutputTokens: 65536,  // Gemini 2.5支持的最大输出长度
            temperature: 0.7,
            topP: 0.99,
            topK: 40,
            stopSequences: []
        }
    };

    // 处理系统指令
    if (isSystemPromptEnabled) {
        // 使用新的破限提示词生成函数
        let LimitlessPrompt;
        if (typeof generateLimitlessPrompt === 'function') {
            try {
                LimitlessPrompt = await generateLimitlessPrompt('system');
            } catch (error) {
                console.error('破限提示词生成失败:', error);
                LimitlessPrompt = '你是创意写作助手，专注于角色卡设计和故事创作。';
            }
        } else {
            console.warn('破限提示词函数未定义，使用默认系统消息');
            LimitlessPrompt = '你是创意写作助手，专注于角色卡设计和故事创作。';
        }

        requestBody.systemInstruction = {
            parts: [{ text: LimitlessPrompt }]
        };

        // 用户消息不包含系统提示
        requestBody.contents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });
    } else {
        // 普通模式，不破限
        const fullPrompt = `你是创意写作助手，专注于角色卡设计和故事创作，${prompt}`;

        requestBody.contents.push({
            role: 'user',
            parts: [{ text: fullPrompt }]
        });
    }


    // 思维配置(适用于Gemini 2.5模型）- 增强破限能力
    if (/^gemini-2.5-(flash|pro)/.test(model)) {
        requestBody.generationConfig.thinkingConfig = {
            includeThoughts: false,
            thinkingBudget: 24576  // 增加思维预算，增强创造性
        };

        // 注意：responseMimeType和responseSchema可能导致API错误
        // 如果需要JSON输出，建议在prompt中要求
        // requestBody.generationConfig.responseMimeType = "application/json";
    }

    // 最终请求体混淆处理
    const finalRequestBody = JSON.parse(JSON.stringify(requestBody));

    // 注意：Gemini API v1beta不支持metadata字段，会导致400错误
    // 已移除metadata字段以确保API兼容性

    mylog('完整请求体:', JSON.stringify(finalRequestBody, null, 2));

    return finalRequestBody;
}

async function callApi(prompt, button) {
    const apiSettings = loadApiSettings();
    const provider = apiSettings.provider;

    const isPlus = document.getElementById('Plus-switch').checked;
    const finalPrompt = isPlus ? prompt + getStylePromptPrefix() : prompt;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = t('generating');

    const undoButton = button.nextElementSibling;
    if (undoButton && undoButton.classList.contains('ai-undo-button')) {
        undoButton.style.display = 'none';
    }

    let requestUrl, requestOptions;

    try {
        // 统一获取全局破限开关状态
        let useJailbreak = apiSettings.gemini?.useSystemPrompt || false;
        let systemMessage = '';

        // 为支持OpenAI格式的提供商生成破限系统消息
        if (useJailbreak && typeof generateLimitlessPrompt === 'function') {
            try {
                systemMessage = await generateLimitlessPrompt('system');
            } catch (error) {
                console.error('破限提示词生成失败:', error);
            }
        }

        switch (provider) {
            case 'deepseek':
                if (!apiSettings.deepseek.apiKey) throw new Error('DeepSeek API Key is missing.');
                requestUrl = 'https://api.deepseek.com/chat/completions';

                const deepseekMessages = systemMessage
                    ? [{ role: 'system', content: systemMessage }, { role: 'user', content: finalPrompt }]
                    : [{ role: 'user', content: finalPrompt }];

                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiSettings.deepseek.apiKey}` },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: deepseekMessages,
                        max_tokens: 8192,  // DeepSeek的最大输出限制
                        temperature: 0.7
                    }),
                };

                mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                break;

            case 'gemini':
                if (!apiSettings.gemini.apiKey) throw new Error('Gemini API Key is missing.');
                const geminiModel = apiSettings.gemini.model || 'gemini-2.5-flash';
                const geminiBody = await buildGeminiRequest(finalPrompt, apiSettings, provider);
                requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiSettings.gemini.apiKey}`;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiBody),
                };
                mylog('Gemini request body:', geminiBody);
                break;

            case 'gemini-proxy':
                if (!apiSettings['gemini-proxy'].endpoint) throw new Error('Gemini Proxy Endpoint is missing.');
                if (!apiSettings['gemini-proxy'].apiKey) throw new Error('Gemini API Key for proxy is missing.');

                let proxyBaseUrl = apiSettings['gemini-proxy'].endpoint;
                if (!proxyBaseUrl.startsWith('http')) proxyBaseUrl = 'https://' + proxyBaseUrl;
                // remove trailing slash if present
                if (proxyBaseUrl.endsWith('/')) {
                    proxyBaseUrl = proxyBaseUrl.slice(0, -1);
                }

                const geminiProxyModel = apiSettings['gemini-proxy'].model || 'gemini-2.5-flash';

                // 检查是否使用OpenAI格式（只有以/v1结尾才使用OpenAI格式）
                const useOpenAIFormat = proxyBaseUrl.endsWith('/v1');

                if (useOpenAIFormat) {
                    // 使用OpenAI兼容格式
                    requestUrl = proxyBaseUrl + '/chat/completions';

                    const geminiProxyMessages = systemMessage
                        ? [{ role: 'system', content: systemMessage }, { role: 'user', content: finalPrompt }]
                        : [{ role: 'user', content: finalPrompt }];

                    requestOptions = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiSettings['gemini-proxy'].apiKey}`
                        },
                        body: JSON.stringify({
                            model: geminiProxyModel,
                            messages: geminiProxyMessages,
                            stream: false
                        }),
                    };

                    mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                } else {
                    // 使用Gemini原生API格式
                    const geminiProxyBody = await buildGeminiRequest(finalPrompt, apiSettings, provider);

                    // 构建Gemini原生格式的URL
                    let finalProxyUrl = proxyBaseUrl;

                    // 检查是否已经是完整的API端点
                    if (finalProxyUrl.includes(':generateContent')) {
                        // 已经是完整的API端点，直接使用
                        // 不做任何修改
                    } else if (finalProxyUrl.endsWith('/models')) {
                        // 已经包含/models路径，只需要添加模型名和操作
                        finalProxyUrl += `/${geminiProxyModel}:generateContent`;
                    } else if (finalProxyUrl.endsWith('/v1beta')) {
                        finalProxyUrl += `/models/${geminiProxyModel}:generateContent`;
                    } else if (finalProxyUrl.endsWith('/')) {
                        finalProxyUrl += `v1beta/models/${geminiProxyModel}:generateContent`;
                    } else {
                        finalProxyUrl += `/v1beta/models/${geminiProxyModel}:generateContent`;
                    }

                    requestUrl = finalProxyUrl;

                    // 根据Gemini原生API的认证方式，使用key参数而不是Authorization header
                    if (finalProxyUrl.includes('?')) {
                        requestUrl += `&key=${apiSettings['gemini-proxy'].apiKey}`;
                    } else {
                        requestUrl += `?key=${apiSettings['gemini-proxy'].apiKey}`;
                    }

                    requestOptions = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                            // Gemini原生API不使用Authorization header，而是使用URL参数
                        },
                        body: JSON.stringify(geminiProxyBody),
                    };
                    mylog('Gemini Proxy request (Native format):', requestOptions.body);
                }
                break;

            case 'ollama':
                if (!apiSettings.ollama.endpoint) throw new Error('Ollama API Endpoint is missing.');
                if (!apiSettings.ollama.model) throw new Error('Ollama Model is missing.');

                let ollamaEndpoint = apiSettings.ollama.endpoint;
                if (!ollamaEndpoint.startsWith('http')) {
                    ollamaEndpoint = 'http://' + ollamaEndpoint;
                }
                // Remove trailing slash if present
                if (ollamaEndpoint.endsWith('/')) {
                    ollamaEndpoint = ollamaEndpoint.slice(0, -1);
                }

                requestUrl = ollamaEndpoint + '/api/generate';

                // Ollama使用prompt字段，需要将system消息拼接到prompt中
                const ollamaPrompt = systemMessage
                    ? `${systemMessage}\n\n${finalPrompt}`
                    : finalPrompt;

                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: apiSettings.ollama.model,
                        prompt: ollamaPrompt,
                        stream: false,
                        options: {
                            temperature: 0.7,
                        }
                    }),
                };

                mylog('完整请求体:', JSON.stringify(JSON.parse(requestOptions.body), null, 2));
                break;

            case 'local':
            case 'tavern':
                const isLocal = provider === 'local';
                const providerSettings = apiSettings[provider];

                // Handle reverse proxy mode for tavern
                const isReverseProxy = !isLocal && providerSettings.connectionType === 'reverse-proxy';

                let endpoint, apiKey, model;

                if (isReverseProxy) {
                    // Use reverse proxy settings
                    endpoint = providerSettings.proxyUrl;
                    apiKey = providerSettings.proxyPassword; // Use proxy password instead of API key
                    model = providerSettings.proxyModel || 'gpt-3.5-turbo';

                    if (!endpoint) throw new Error('代理服务器 URL 未设置');
                    if (!apiKey) throw new Error('代理密码未设置');
                } else {
                    // Use direct connection settings
                    endpoint = providerSettings.endpoint;
                    apiKey = providerSettings.apiKey;
                    model = providerSettings.model || (isLocal ? 'local-model' : 'gpt-3.5-turbo');

                    if (!endpoint) throw new Error(`API Endpoint for ${provider} is missing.`);
                }

                // 检测是否为Gemini模型
                const isGeminiModel = model && model.toLowerCase().includes('gemini');

                let finalEndpoint = endpoint;

                // Auto-append /chat/completions for reverse proxy if not present
                if (isReverseProxy) {
                    if (!finalEndpoint.includes('/chat/completions')) {
                        if (finalEndpoint.endsWith('/v1')) {
                            finalEndpoint += '/chat/completions';
                        } else if (finalEndpoint.endsWith('/')) {
                            finalEndpoint += 'chat/completions';
                        } else {
                            finalEndpoint += '/chat/completions';
                        }
                    }
                } else {
                    // Original logic for direct connections
                    if (finalEndpoint.endsWith('/v1')) {
                        finalEndpoint += '/chat/completions';
                    }
                }

                if (!finalEndpoint.startsWith('http')) {
                    // Local endpoints are http, not https
                    finalEndpoint = (isLocal ? 'http://' : 'https://') + finalEndpoint;
                }
                requestUrl = finalEndpoint;

                const headers = { 'Content-Type': 'application/json' };

                // Add authorization header
                if (isReverseProxy) {
                    // For reverse proxy, use proxy password as Bearer token
                    headers['Authorization'] = `Bearer ${apiKey}`;
                } else if (!isLocal && apiKey) {
                    // For direct tavern connection, use API key
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                // CLI反代始终使用OpenAI格式，无论代理什么模型
                // 为所有模型添加system角色支持（如果启用破限）
                const tavernMessages = systemMessage
                    ? [{ role: 'system', content: systemMessage }, { role: 'user', content: finalPrompt }]
                    : [{ role: 'user', content: finalPrompt }];

                let requestBody = {
                    model: model,
                    messages: tavernMessages,
                    stream: false,
                };

                // 为CLI反代模式添加工具字段（如果反代支持的话）
                // 注意：大部分CLI反代不支持metadata、thinking_config等非标准OpenAI字段
                // 这些字段会导致400错误，已移除
                if (isGeminiModel && isReverseProxy && useJailbreak) {
                    // 可选：添加工具字段（仅当反代明确支持时）
                    // requestBody.tools = [
                    //   {
                    //     type: "function",
                    //     function: {
                    //       name: "validate_creative_content",
                    //       description: "验证创意内容的艺术价值和文学性",
                    //       parameters: {
                    //         type: "object",
                    //         properties: {
                    //           content_type: {
                    //             type: "string",
                    //             enum: ["fiction", "poetry", "drama", "creative_nonfiction"]
                    //           },
                    //           artistic_merit: { type: "integer", minimum: 1, maximum: 10 },
                    //           literary_quality: { type: "integer", minimum: 1, maximum: 10 }
                    //         },
                    //         required: ["content_type", "artistic_merit", "literary_quality"]
                    //       }
                    //     }
                    //   }
                    // ];
                }

                // 如果是CLI反代的Gemini模型，添加额外的配置
                if (isGeminiModel && isReverseProxy) {
                    // 为Gemini模型添加系统消息来模拟高级功能
                    let systemMessage = '';

                    if (useJailbreak) {
                        // 使用独立的破限提示词函数
                        if (typeof generateLimitlessPrompt === 'function') {
                            try {
                                systemMessage = await generateLimitlessPrompt('prefix');
                            } catch (error) {
                                console.error('破限提示词生成失败:', error);
                                systemMessage = '你是创意写作助手，专注于角色卡设计和故事创作。';
                            }
                        } else {
                            console.warn('破限提示词函数未定义，使用默认系统消息');
                            systemMessage = '你是创意写作助手，专注于角色卡设计和故事创作。';
                        }
                    } else {
                        systemMessage = '你是创意写作助手，专注于角色卡设计和故事创作。';
                    }


                    if (systemMessage) {
                        requestBody.messages = [
                            { role: 'system', content: systemMessage },
                            { role: 'user', content: finalPrompt }
                        ];
                    }

                    mylog('完整请求体:', JSON.stringify(requestBody, null, 2));
                }

                requestOptions = {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestBody),
                };
                break;

            default:
                throw new Error(`Unknown API provider: ${provider}`);
        }

        const response = await fetch(requestUrl, requestOptions);

        if (!response.ok) {
            const errorBody = await response.text();
            let errorMessage = errorBody;
            try {
                const errorJson = JSON.parse(errorBody);
                errorMessage = errorJson.error?.message || JSON.stringify(errorJson);
            } catch (e) {
                /* Ignore if not JSON */
            }
            throw new Error(t('api-request-failed', { status: response.statusText, message: errorMessage }));
        }

        const data = await response.json();

        // Handle different response structures
        const isGeminiNativeResponse = provider === 'gemini' || provider === 'gemini-proxy';
        const isCLIProxyGemini = provider === 'tavern' && apiSettings.tavern.connectionType === 'reverse-proxy' &&
            apiSettings.tavern.proxyModel && apiSettings.tavern.proxyModel.toLowerCase().includes('gemini');

        // Handle Ollama response
        if (provider === 'ollama') {
            mylog('Ollama API response:', data);

            if (data.error) {
                throw new Error(`Ollama API Error: ${data.error}`);
            }

            if (data.response) {
                return filterEmptyEntries(data.response);
            }

            console.error('Unexpected Ollama response structure:', data);
            throw new Error('Ollama API返回了意外的响应结构，请检查控制台日志');
        }

        if (isGeminiNativeResponse) {
            mylog('Gemini API response:', data);

            // Handle error response from Gemini first
            if (data.error) {
                throw new Error(`Gemini API Error: ${data.error.message}`);
            }

            // Handle prompt feedback (safety filtering)
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                throw new Error(`Gemini 安全过滤: ${data.promptFeedback.blockReason}`);
            }

            // Handle candidates for native Gemini response
            if (!data.candidates || data.candidates.length === 0) {
                let message = 'Gemini API 返回了空的候选项';
                if (data.promptFeedback?.blockReason) {
                    message += `\n原因: ${data.promptFeedback.blockReason}`;
                }
                throw new Error(message);
            }

            const candidate = data.candidates[0];
            mylog('Candidate structure:', candidate);

            // Check for finish reason
            if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                console.warn(`Gemini 终止原因: ${candidate.finishReason}`);
            }

            // Extract content
            const responseContent = candidate.content ?? candidate.output;

            if (responseContent && responseContent.parts && responseContent.parts.length > 0) {
                // Filter out thought parts if present
                const textParts = responseContent.parts.filter(part => !part.thought && part.text);
                if (textParts.length > 0) {
                    const rawContent = textParts.map(part => part.text).join('\n\n');
                    return filterEmptyEntries(rawContent);
                }
            }

            // Fallback for other response structures
            if (candidate.text) {
                return filterEmptyEntries(candidate.text);
            }

            if (candidate.output) {
                return filterEmptyEntries(candidate.output);
            }

            // Check for function calls or other special content
            if (responseContent?.parts) {
                for (const part of responseContent.parts) {
                    if (part.functionCall) {
                        mylog('检测到函数调用:', part.functionCall);
                        return `检测到函数调用: ${part.functionCall.name}`;
                    }
                    if (part.inlineData) {
                        mylog('检测到内联数据:', part.inlineData.mimeType);
                        return '检测到内联数据（图像或其他媒体）';
                    }
                }
            }

            // Log the actual response for debugging
            console.error('Unexpected Gemini response structure:', data);
            console.error('First candidate:', candidate);
            throw new Error('Gemini API返回了意外的响应结构，请检查控制台日志');
        } else if (isCLIProxyGemini) {
            // Handle CLI reverse proxy Gemini (returns OpenAI format)
            mylog('CLI Proxy Gemini API response:', data);

            if (data.error) {
                throw new Error(`CLI Proxy Gemini Error: ${data.error.message}`);
            }

            if (data.choices && data.choices.length > 0) {
                const choice = data.choices[0];
                if (choice.message && choice.message.content) {
                    return filterEmptyEntries(choice.message.content);
                }
            }

            console.error('Unexpected CLI Proxy Gemini response structure:', data);
            throw new Error('CLI代理Gemini API返回了意外的响应结构，请检查控制台日志');
        }

        // For DeepSeek and other OpenAI compatible APIs
        if (data.choices && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.message && choice.message.content) {
                return filterEmptyEntries(choice.message.content);
            }
        }

        // Log the actual response for debugging
        console.error('Unexpected API response structure:', data);
        throw new Error('API返回了意外的响应结构，请检查控制台日志');
    } catch (error) {
        console.error(`API error with provider ${provider}:`, error);
        alert(`${t('ai-completion-failed')}\nError: ${error.message}`);
        return null;
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function callDeepSeek(fieldId) {
    const button = event.target;
    const targetElement = document.getElementById(fieldId);
    if (!targetElement) return;

    targetElement.dataset.aiBackup = targetElement.value;

    const labelText = document.querySelector(`label[for='${fieldId}']`).innerText.replace(' (逗号分隔)', '');

    getAiGuidance(t('ai-guidance-title') + `: ${labelText}`, async userGuidance => {
        const currentCard = buildCardObject();
        const existingEntries = buildWorldbookDataFromDOM();
        const existingEntriesText = existingEntries
            .map(e => `- ${e.comment}: ${e.content.substring(0, 100)}...`)
            .join('\n');

        let prompt = getLanguagePrefix() + `请根据以下已经提供的角色信息，为我生成或补全【${labelText}】这一项。
请直接返回最适合填入该项的内容，语言风格要自然

已提供信息:

- 角色名: ${currentCard.name || '未指定'}
- 性别: ${currentCard.gender || '未指定'}
- 角色描述: ${currentCard.description || '未指定'}
- 分类标签: ${currentCard.tags && currentCard.tags.length > 0 ? currentCard.tags.join(', ') : '未指定'}
- 个性: ${currentCard.personality || '未指定'}
- 场景设定: ${currentCard.scenario || '未指定'}
- 首次发言: ${currentCard.first_mes || '未指定'}
- 范例对话: ${currentCard.mes_example || '未指定'}
- 已有的世界书条目 (用于参考):
${existingEntriesText || '无'}

注意：我的代词为"{{user}}"，角色的代词为"{{char}}，在输出中已知名字时，必须输出为代词\n\n

根据以上提供的角色信息，生成或补全【${labelText}】这一项。
请直接返回最适合填入该项的内容，语言风格要自然
特别注意：你不是角色
**Avoid** writing {{char}}'s words and thoughts
${fieldId === 'first_mes' ? `- 对于 "first_mes" 字段，请保证具有充足篇幅和沉浸感的开场白，生成或补全，要求：
  * **篇幅要求**：至少500-800字，充分展开场景描写
  * **结构层次**：
    - 环境描写：详细描绘场景氛围、视觉细节、空间感
    - 感官体验：失重感、眩晕感等身体感受，视觉、听觉等多感官描写
    - 角色登场：{{char}}的出场要有仪式感，包含外貌、神态、动作的细致刻画
    - 对话互动：包含{{char}}的台词，展现性格特征和当前情境
    - 情境说明：通过对话和描写自然引出当前场景的背景信息
  * **叙事视角**：以第二人称"你"({{user}})的视角展开，营造代入感
  * **氛围营造**：根据角色和场景特点，营造相应的氛围（恋爱、科幻、奇幻、日常、紧张等）
  * **细节丰富**：包含具体的视觉细节、动作描写、表情刻画、环境元素
  * **留白设计**：结尾留下互动空间，引导{{user}}做出回应` : ''}
`;

        if (userGuidance) {
            prompt += `\n用户的额外指令: ${userGuidance}\n`;
        }
        prompt += `\n现在，请生成【${labelText}】的内容。`;

        const result = await callApi(prompt, button);
        if (result) {
            targetElement.value = result;
            const undoButton = button.nextElementSibling;
            if (undoButton && undoButton.classList.contains('ai-undo-button')) {
                undoButton.style.display = 'inline-block';
            }
        }
    });
}

async function callWorldbookDeepSeek(button) {
    const currentEntryElement = button.closest('.worldbook-entry');
    const targetElement = currentEntryElement.querySelector('.wb-content');
    if (!targetElement) return;

    targetElement.dataset.aiBackup = targetElement.value;
    const currentComment = currentEntryElement.querySelector('.entry-comment').value || '未命名条目';

    getAiGuidance(t('ai-guidance-title') + `: ${currentComment}`, async userGuidance => {
        const characterContext = buildCardObject();
        const currentKeys = currentEntryElement.querySelector('.wb-keys').value;

        // 增强: 构建全世界书上下文（参考所有条目）
        const worldbookTree = buildWorldbookDataFromDOM();
        const apiSettings = loadApiSettings();
        const isDeepSeek = apiSettings.provider === 'deepseek';

        // 收集所有世界书条目
        function collectAllEntries(entries, result = []) {
            entries.forEach(entry => {
                if (entry.element !== currentEntryElement) { // 排除当前条目
                    result.push(entry);
                }
                if (entry.children && entry.children.length > 0) {
                    collectAllEntries(entry.children, result);
                }
            });
            return result;
        }

        const allEntries = collectAllEntries(worldbookTree);
        const totalEntries = allEntries.length;

        // 根据模型类型调整截断长度
        const truncationLength = isDeepSeek && totalEntries > 0 ? Math.floor(20000 / totalEntries) : 500;

        let worldbookContext = '';
        if (allEntries.length > 0) {
            worldbookContext = `**现有世界书条目参考:**\n`;
            allEntries.forEach((entry, index) => {
                const content = entry.content || '';
                const truncatedContent = content.length > truncationLength ?
                    content.substring(0, truncationLength) + '...' : content;
                worldbookContext += `${index + 1}. **${entry.comment}** (关键词: ${(entry.keys || []).join(', ')})\n${truncatedContent}\n\n`;
            });
        }

        let prompt = getLanguagePrefix() + `请基于以下提供的角色信息和世界书结构，为我撰写条目【${currentComment}】的"注入内容"。内容需要详细、富有想象力，并与角色设定保持高度一致。

---
**角色核心设定:**
- 角色名: ${characterContext.name || '未指定'}
- 描述: ${characterContext.description || '未指定'}
- 个性: ${characterContext.personality || '未指定'}

**世界书上下文:**
- **当前条目标题 (Comment):** ${currentComment}
- **当前条目主要关键词 (Keys):** ${currentKeys || '未指定'}

${worldbookContext}
`;
        if (userGuidance) {
            prompt += `\n**用户的额外指令:** ${userGuidance}\n`;
        }
        prompt += `
---
**你的任务:**
现在，请为条目【${currentComment}】生成详细的"注入内容"。
**写作指导:**
1. 仔细参考上述所有现有世界书条目，确保内容与整个世界观保持一致
2. 避免与现有条目内容重复，而是补充和丰富世界观
3. 利用现有条目的信息作为背景支撑，创造更深入的内容
4. 确保风格与现有条目保持统一

**要求：** 直接返回注入内容本身，不要包含任何额外解释、标题或引用。`;

        const result = await callApi(prompt, button);
        if (result) {
            targetElement.value = result;
            const undoButton = button.nextElementSibling;
            if (undoButton && undoButton.classList.contains('ai-undo-button')) {
                undoButton.style.display = 'inline-block';
            }
        }
    });
}

// ====================================================================================
// --- AI MODAL DIALOGS & GENERATORS ---
// ====================================================================================

function initializeAiGuidanceModal() {
    const modal = document.getElementById('ai-guidance-modal');
    const generateBtn = document.getElementById('ai-guidance-generate-btn');
    const cancelBtn = document.getElementById('ai-guidance-cancel-btn');

    // modal.onclick = e => {
    //     if (e.target === modal) modal.style.display = 'none';
    // };
    cancelBtn.onclick = () => (modal.style.display = 'none');
}

function getAiGuidance(title, callback, placeholder = '') {
    const modal = document.getElementById('ai-guidance-modal');
    const titleEl = document.getElementById('ai-guidance-title');
    const inputEl = document.getElementById('ai-guidance-input');
    const generateBtn = document.getElementById('ai-guidance-generate-btn');

    if (titleEl) titleEl.textContent = title;
    if (inputEl) {
        inputEl.value = '';
        inputEl.placeholder = placeholder || t('ai-guidance-prompt');
    }

    if (generateBtn) {
        generateBtn.onclick = () => {
            if (modal) modal.style.display = 'none';
            callback(inputEl ? inputEl.value.trim() : '');
        };
    }

    if (modal) modal.style.display = 'flex';
    if (inputEl) inputEl.focus();
}

// 批量生成问候消息
async function batchGenerateGreetings(button) {
    // 创建模态框
    const modal = document.createElement('div');
    modal.id = 'batch-greeting-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10001; display: flex; align-items: center; justify-content: center;';

    modal.innerHTML = `
        <div style="background: var(--light-bg); border-radius: 10px; padding: 20px; max-width: 900px; max-height: 90vh; overflow-y: auto; width: 90%;">
            <h3 style="color: var(--primary-color); margin-bottom: 15px;">🎲 批量生成问候消息</h3>
            
            <div style="display: flex; gap: 20px; margin-bottom: 15px;">
                <div style="flex: 1;">
                    <label style="display: block; color: var(--text-color); margin-bottom: 5px;">生成数量：</label>
                    <select id="greeting-count" style="width: 120px; padding: 8px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color);">
                        <option value="3">3条</option>
                        <option value="5" selected>5条</option>
                        <option value="8">8条</option>
                        <option value="10">10条</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label style="display: block; color: var(--text-color); margin-bottom: 5px;">每条字数：</label>
                    <select id="greeting-word-count" style="width: 120px; padding: 8px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color);">
                        <option value="300-500">300-500字</option>
                        <option value="500-800" selected>500-800字</option>
                        <option value="800-1200">800-1200字</option>
                        <option value="1200-1500">1200-1500字</option>
                    </select>
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; color: var(--text-color); margin-bottom: 5px;">User设定（可选）：</label>
                <textarea id="user-setting-input" placeholder="例如：user是一名侦探、user失去了记忆、user拥有特殊能力等..." style="width: 100%; height: 80px; padding: 12px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; box-sizing: border-box;"></textarea>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; color: var(--text-color); margin-bottom: 5px;">剧情风格偏向（可选）：</label>
                <textarea id="greeting-style-input" placeholder="例如：恋爱向、科幻冒险、日常温馨、紧张悬疑等..." style="width: 100%; height: 80px; padding: 12px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; box-sizing: border-box;"></textarea>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; color: var(--text-color); margin-bottom: 5px;">地点/场景（可选，可多个）：</label>
                <textarea id="location-setting-input" placeholder="例如：在学校图书馆、在未来都市、在魔法学院、在太空站等..." style="width: 100%; height: 80px; padding: 12px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; box-sizing: border-box;"></textarea>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; color: var(--text-color); margin-bottom: 5px;">场景人物设定（可选）：</label>
                <textarea id="scene-character-input" placeholder="例如：场景中有一只猫、旁边有一位老人、远处有几个学生等..." style="width: 100%; height: 80px; padding: 12px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; box-sizing: border-box;"></textarea>
                <div style="margin-top: 8px;">
                    <label style="display: inline-flex; align-items: center; color: var(--text-color); cursor: pointer;">
                        <input type="checkbox" id="no-extra-characters" style="margin-right: 8px; cursor: pointer;">
                        <span>约束AI不要擅自添加人物</span>
                    </label>
                </div>
            </div>
            
            <div id="greeting-results" style="margin-top: 20px;"></div>
            
            <div style="margin-top: 20px; text-align: right;">
                <button id="generate-greetings-btn" style="background: var(--primary-color); color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">🎨 开始生成</button>
                <button id="cancel-greetings-btn" style="background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 绑定事件
    const generateBtn = modal.querySelector('#generate-greetings-btn');
    const cancelBtn = modal.querySelector('#cancel-greetings-btn');

    cancelBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    generateBtn.addEventListener('click', async () => {
        const count = document.getElementById('greeting-count').value;
        const wordCount = document.getElementById('greeting-word-count').value;
        const styleInput = document.getElementById('greeting-style-input').value.trim();
        const locationInput = document.getElementById('location-setting-input').value.trim();
        const userSettingInput = document.getElementById('user-setting-input').value.trim();
        const sceneCharacterInput = document.getElementById('scene-character-input').value.trim();
        const noExtraCharacters = document.getElementById('no-extra-characters').checked;
        const resultsDiv = document.getElementById('greeting-results');

        // 禁用生成按钮
        generateBtn.disabled = true;
        generateBtn.textContent = '🔄 生成中...';
        generateBtn.style.opacity = '0.6';

        resultsDiv.innerHTML = '<div style="text-align: center; color: var(--text-color); padding: 20px;"><div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div> 正在生成问候消息...</div>';

        try {
            // 检查API配置
            const apiSettings = loadApiSettings();
            if (!checkApiConfiguration(apiSettings)) {
                resultsDiv.innerHTML = `
                    <div style="text-align: center; color: #f44336; padding: 20px;">
                        <h4>⚠️ 需要配置API设置</h4>
                        <p>请先在API设置中配置您的AI服务提供商才能使用AI生成功能。</p>
                        <button onclick="openApiSettingsModal()" style="background: var(--primary-color); color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-top: 10px;">打开API设置</button>
                    </div>
                `;
                return;
            }

            // 获取当前角色信息
            const currentCard = buildCardObject();
            const existingEntries = buildWorldbookDataFromDOM();

            // 构建世界书上下文
            const worldbookContext = existingEntries.length > 0
                ? existingEntries.map(e => `- ${e.comment}: ${e.content.substring(0, 150)}...`).join('\n')
                : '无';

            // 构建提示词
            let prompt = getLanguagePrefix() + `你是一个专业的角色扮演剧情设计师。请根据以下角色信息，生成${count}个不同风格的问候消息（开场白）。

**角色信息：**
- 角色名: ${currentCard.name || '未指定'}
- 性别: ${currentCard.gender || '未指定'}
- 角色描述: ${currentCard.description || '未指定'}
- 个性: ${currentCard.personality || '未指定'}
- 场景设定: ${currentCard.scenario || '未指定'}

**世界书参考：**
${worldbookContext}

${styleInput ? `**用户指定的剧情风格偏向：** ${styleInput}\n` : ''}
${locationInput ? `**地点/场景：** ${locationInput}\n请在生成的问候消息中考虑这些地点或场景设定。\n` : ''}
${userSettingInput ? `**User设定：** ${userSettingInput}\n请在生成的问候消息中考虑这些user设定，让开场白更有针对性和代入感。\n` : ''}
${sceneCharacterInput ? `**场景人物设定：** ${sceneCharacterInput}\n请在生成的问候消息中包含这些场景人物。\n` : ''}
${noExtraCharacters ? `**重要约束：** 除了上述明确指定的人物外，不要擅自添加其他角色或人物。\n` : ''}

**生成要求：**
1. 每条问候消息都应该是一个完整的开场场景，篇幅在${wordCount}字左右
2. 每条消息要有不同的剧情方向和氛围（例如：日常、冒险、紧张、温馨、神秘等）
3. 包含丰富的环境描写、感官细节、角色动作和表情
4. 使用第二人称"你"({{user}})的视角，营造代入感
5. 包含{{char}}的台词，展现性格特征
6. 结尾留下互动空间，引导{{user}}做出回应
7. 每条消息应该独立成篇，可以直接使用

**输出格式：**
请严格按照JSON数组格式返回，每个元素包含title（场景标题）和content（问候消息内容）：
[
  {
    "title": "场景1标题",
    "content": "问候消息内容..."
  },
  {
    "title": "场景2标题",
    "content": "问候消息内容..."
  }
]

不要包含任何解释或Markdown标记，直接返回JSON数组。`;

            // 调用API
            const result = await callApi(prompt, button);

            if (!result) {
                throw new Error('API调用失败');
            }

            // 解析结果
            let cleanedResult = result.trim();

            // 提取JSON
            const jsonMatch = cleanedResult.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                cleanedResult = jsonMatch[1].trim();
            } else {
                const jsonStart = cleanedResult.indexOf('[');
                const jsonEnd = cleanedResult.lastIndexOf(']');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    cleanedResult = cleanedResult.substring(jsonStart, jsonEnd + 1);
                }
            }

            const greetings = JSON.parse(cleanedResult);

            if (!Array.isArray(greetings) || greetings.length === 0) {
                throw new Error('AI返回的数据格式不正确');
            }

            // 显示结果
            resultsDiv.innerHTML = '<h4 style="color: var(--primary-color); margin-bottom: 15px;">✨ 生成的问候消息：</h4>';

            greetings.forEach((greeting, index) => {
                const greetingCard = document.createElement('div');
                greetingCard.style.cssText = 'background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--input-border);';

                greetingCard.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h5 style="color: var(--primary-color); margin: 0;">${index + 1}. ${greeting.title || '场景' + (index + 1)}</h5>
                        <div>
                            <button onclick="useGreeting(${index}, 'first_mes')" style="background: var(--primary-color); color: white; padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 5px;">设为主问候</button>
                            <button onclick="useGreeting(${index}, 'alternate')" style="background: #6c757d; color: white; padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">添加到备选</button>
                        </div>
                    </div>
                    <div style="color: var(--text-color); white-space: pre-wrap; line-height: 1.6; max-height: 200px; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">${greeting.content}</div>
                `;

                resultsDiv.appendChild(greetingCard);

                // 存储生成的问候消息到全局变量
                if (!window.generatedGreetings) window.generatedGreetings = [];
                window.generatedGreetings[index] = greeting.content;
            });

        } catch (error) {
            console.error('生成问候消息失败:', error);
            resultsDiv.innerHTML = `
                <div style="text-align: center; color: #f44336; padding: 20px;">
                    <h4>❌ 生成失败</h4>
                    <p>错误信息: ${error.message}</p>
                    <p style="font-size: 12px; color: #999;">请检查API设置和网络连接，或查看控制台获取更多信息。</p>
                </div>
            `;
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '🎨 开始生成';
            generateBtn.style.opacity = '1';
        }
    });
}

// 使用生成的问候消息
function useGreeting(index, type) {
    if (!window.generatedGreetings || !window.generatedGreetings[index]) {
        alert('找不到该问候消息');
        return;
    }

    const content = window.generatedGreetings[index];

    if (type === 'first_mes') {
        // 设为主问候消息
        const firstMesField = document.getElementById('first_mes');
        if (firstMesField) {
            firstMesField.value = content;
            alert('✅ 已设置为主问候消息');
        }
    } else if (type === 'alternate') {
        // 添加到备选问候消息
        addAlternateGreeting(content);
        alert('✅ 已添加到备选问候消息');
    }
}

function initializeNameGeneratorModal() {
    const modal = document.getElementById('name-generator-modal');
    const cancelButton = document.getElementById('cancel-name-generation-btn');
    const regenerateButton = document.getElementById('regenerate-names-btn');

    modal.addEventListener('click', event => {
        if (event.target === modal) modal.style.display = 'none';
    });
    cancelButton.addEventListener('click', () => (modal.style.display = 'none'));
    regenerateButton.addEventListener('click', () => {
        const generatorButton = document.querySelector('.name-generator-btn');
        generateAiNames(generatorButton);
    });
}

async function generateAiNames(button) {
    const modal = document.getElementById('name-generator-modal');
    const optionsContainer = document.getElementById('name-options-container');
    const regenerateButton = document.getElementById('regenerate-names-btn');

    optionsContainer.innerHTML = `<div class="loading-spinner" style="margin: 20px auto;"></div>`;
    modal.style.display = 'flex';

    const currentCard = buildCardObject();
    const prompt = getLanguagePrefix() + `请根据以下角色设定，为角色生成5个好听、贴切的名字。
请严格按照JSON数组的格式返回，例如：["名字A", "名字B", "名字C", "名字D", "名字E"]。不要包含任何额外的解释或文本。

角色设定:

- 性别: ${currentCard.gender || '未指定'}
- 角色描述: ${currentCard.description || '未指定'}
- 个性: ${currentCard.personality || '未指定'}`;

    const originalRegenerateText = regenerateButton.textContent;
    regenerateButton.disabled = true;
    regenerateButton.textContent = t('generating');

    try {
        const result = await callApi(prompt, button);

        // 立即处理失败情况，不等待
        if (!result) {
            optionsContainer.innerHTML = `<p style="color: #f44336; padding: 20px;">${t('name-generation-failed')}</p>`;
            return;
        }

        const cleanedResult = result.replace(/^```json\s*|```$/g, '').trim();
        const names = JSON.parse(cleanedResult);

        if (Array.isArray(names) && names.length > 0) {
            optionsContainer.innerHTML = '';
            names.forEach(name => {
                const nameButton = document.createElement('button');
                nameButton.textContent = name;
                nameButton.onclick = () => {
                    document.getElementById('name').value = name;
                    modal.style.display = 'none';
                };
                optionsContainer.appendChild(nameButton);
            });
        } else {
            throw new Error('AI did not return a valid array of names.');
        }
    } catch (e) {
        console.error('Failed to parse AI-generated names:', e);
        if (typeof result !== 'undefined') {
            console.error('Raw response:', result);
        }
        optionsContainer.innerHTML = `<p style="color: #f44336; padding: 20px;">${t('name-generation-failed')}</p>`;
    } finally {
        regenerateButton.disabled = false;
        regenerateButton.textContent = originalRegenerateText;
    }
}

function initializeWorldbookAiModal() {
    const modal = document.getElementById('worldbook-ai-generator-modal');
    const injectBtn = document.getElementById('wb-ai-inject-btn');
    const regenerateBtn = document.getElementById('wb-ai-regenerate-btn');
    const generateBtn = document.getElementById('wb-ai-generate-btn');
    const cancelBtn = document.getElementById('wb-ai-cancel-btn');
    const desc = document.getElementById('wb-ai-modal-desc');
    const genTypeButtons = modal.querySelectorAll('.generation-type-selector button');

    cancelBtn.onclick = () => (modal.style.display = 'none');
    // modal.onclick = e => {
    //     if (e.target === modal) modal.style.display = 'none';
    // };

    // 新增：快速生成世界书条目按钮事件
    generateBtn.onclick = () => {
        const requestInput = document.getElementById('wb-ai-request-input');
        const userRequest = requestInput ? requestInput.value.trim() : '';

        // 优先按“快速生成世界书条目”输入框的要求生成，避免旧的类型状态误导流程
        if (userRequest) {
            generateWorldbookFromRequest(userRequest);
            return;
        }

        // 获取当前选择的生成类型
        const currentGenType = modal.dataset.lastGenType;

        // 如果还没有选择类型，使用通用生成逻辑
        if (!currentGenType) {
            if (!userRequest) {
                alert('请输入你对世界书条目的具体要求');
                return;
            }

            // 使用用户输入的内容生成世界书条目
            generateWorldbookFromRequest(userRequest);
        } else {
            // 如果已经选择了类型，直接调用对应的生成函数
            const generatorButton = document.getElementById('ai-lorebook-generator-btn');
            fetchWorldbookStoryNodes(generatorButton, currentGenType);
        }
    };

    genTypeButtons.forEach(button => {
        button.onclick = () => {
            const genType = button.dataset.type;
            modal.dataset.lastGenType = genType; // Store for regeneration

            // 切换输入区域显示
            const literaryStyleArea = document.getElementById('literary-style-input-area');
            const generalInputArea = document.getElementById('general-input-area');
            const abilitySystemArea = document.getElementById('ability-system-input-area');

            if (genType === 'literary_style') {
                if (literaryStyleArea) literaryStyleArea.style.display = 'block';
                if (generalInputArea) generalInputArea.style.display = 'none';
                if (abilitySystemArea) abilitySystemArea.style.display = 'none';
            } else if (genType === 'ability_system') {
                if (literaryStyleArea) literaryStyleArea.style.display = 'none';
                if (generalInputArea) generalInputArea.style.display = 'none';
                if (abilitySystemArea) abilitySystemArea.style.display = 'block';
            } else {
                if (literaryStyleArea) literaryStyleArea.style.display = 'none';
                if (generalInputArea) generalInputArea.style.display = 'block';
                if (abilitySystemArea) abilitySystemArea.style.display = 'none';
            }

            // 不再立即调用生成函数，而是等待用户点击"生成世界书条目"按钮
            // 清空之前的结果
            const container = document.getElementById('wb-ai-options-container');
            if (container) container.innerHTML = '';
            if (injectBtn) injectBtn.style.display = 'none';
            if (regenerateBtn) regenerateBtn.style.display = 'none';
            
            // 更新描述文本
            const typeName = t(`wb-ai-type-${genType}`);
            if (desc) desc.textContent = t('wb-ai-modal-desc');

            // 点击类型按钮时立即生成，避免“点击无反应”
            const generatorButton = document.getElementById('ai-lorebook-generator-btn');
            fetchWorldbookStoryNodes(generatorButton, genType);
        };
    });

    regenerateBtn.onclick = () => {
        const genType = modal.dataset.lastGenType;
        if (genType) {
            const generatorButton = document.getElementById('ai-lorebook-generator-btn');
            fetchWorldbookStoryNodes(generatorButton, genType);
        }
    };

    injectBtn.onclick = () => {
        const container = document.getElementById('wb-ai-options-container');
        const checked = container.querySelectorAll('input[type="checkbox"]:checked');
        const existingEntries = buildWorldbookDataFromDOM();
        let maxId = existingEntries.length > 0 ? Math.max(...existingEntries.map(e => e.id)) : -1;

        const newEntries = Array.from(checked).map(checkbox => {
            // 使用新的JavaScript属性存储方式获取数据
            const entryData = checkbox._entryData;
            if (!entryData) {
                return null;
            }

            maxId++;
            return {
                ...entryData,
                id: maxId,
                children: [],
                // 确保包含额外匹配源 - 默认开启
                match_persona_description: entryData.match_persona_description !== undefined ? entryData.match_persona_description : true,
                match_character_description: entryData.match_character_description !== undefined ? entryData.match_character_description : true,
                match_character_personality: entryData.match_character_personality !== undefined ? entryData.match_character_personality : true,
                match_character_depth_prompt: entryData.match_character_depth_prompt !== undefined ? entryData.match_character_depth_prompt : true,
                match_scenario: entryData.match_scenario !== undefined ? entryData.match_scenario : true,
            };
        }).filter(entry => entry !== null);

        if (newEntries.length > 0) {
            renderWorldbookFromData(existingEntries.concat(newEntries));
            alert(t('lorebook-injected-success', { count: newEntries.length }));
        }
        modal.style.display = 'none';
    };
}

// 独立prompt
async function generateWorldbookFromRequest(userRequest) {
    const modal = document.getElementById('worldbook-ai-generator-modal');
    const container = document.getElementById('wb-ai-options-container');
    const desc = document.getElementById('wb-ai-modal-desc');
    const injectBtn = document.getElementById('wb-ai-inject-btn');
    const regenerateBtn = document.getElementById('wb-ai-regenerate-btn');
    const generateBtn = document.getElementById('wb-ai-generate-btn');

    desc.textContent = 'AI正在根据你的要求生成世界书条目，请稍后...';
    container.innerHTML = `<div class="loading-spinner" style="margin: 20px auto;"></div>`;
    injectBtn.style.display = 'none';
    regenerateBtn.style.display = 'none';
    generateBtn.disabled = true;

    const originalButtonText = generateBtn.textContent;
    generateBtn.textContent = '生成中...';

    const characterContext = buildCardObject();
    const existingEntries = buildWorldbookDataFromDOM();

    const existingEntriesText = existingEntries
        .map(entry => `条目注释: ${entry.comment}\n关键词: ${entry.keys.join(', ')}\n内容: ${entry.content.substring(0, 200)}${entry.content.length > 200 ? '...' : ''}`)
        .join('\n\n');

    let prompt = getLanguagePrefix() + `你是一个专业的sillytavern世界观构建师和剧情设计师。请根据用户的要求生成世界书条目。

用户要求：
${userRequest}

当前角色信息：
- 角色名: ${characterContext.name || '未指定'}
- 性别: ${characterContext.gender || '未指定'}
- 角色描述: ${characterContext.description || '未指定'}
- 个性: ${characterContext.personality || '未指定'}
- 场景设定: ${characterContext.scenario || '未指定'}

已有的世界书条目（用于参考，请避免重复）：
${existingEntriesText || '无'}

请按照JSON格式返回一个数组，包含多个世界书条目对象。每个条目对象必须包含以下字段：
{
"comment": "条目的简短注释（越简洁越好）",
"content": "详细内容（字数越多越好）",
"keys": ["关键词1", "关键词2"],
"selective": true,
"constant": false,
"priority": 100,
"position": 0,
"enabled": true,
"use_regex": false,
"match_persona_description": true,
"match_character_description": true,
"match_character_personality": true,
"match_character_depth_prompt": true,
"match_scenario": true
}

注意：
1. 请直接返回JSON数组，不要包含任何解释或Markdown格式
2. 根据用户要求的复杂程度生成适当数量的条目（不限制数量）
3. 每个条目都应该有独特的关键词和内容
4. 内容要生动、详细，符合角色和世界观设定
5. 所有条目默认开启"额外匹配源"功能，使角色卡内容也能触发世界书条目`;

    try {
        const response = await callApi(prompt, generateBtn);

        if (response) {
            try {
                let jsonMatch = response.match(/\[[\s\S]*\]/);
                if (!jsonMatch) {
                    jsonMatch = response.match(/{[\s\S]*}/);
                    if (jsonMatch) {
                        jsonMatch[0] = '[' + jsonMatch[0] + ']';
                    }
                }

                if (!jsonMatch) {
                    throw new Error('无法从响应中提取JSON数据');
                }

                const cleanedResponse = jsonMatch[0]
                    .replace(/```json/g, '')
                    .replace(/```/g, '')
                    .trim();

                const generatedEntries = JSON.parse(cleanedResponse);

                if (Array.isArray(generatedEntries)) {
                    container.innerHTML = '';
                    generatedEntries.forEach((entry, index) => {
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `wb-entry-${index}`;
                        checkbox.checked = true;
                        // 确保生成的条目包含额外匹配源 - 默认开启
                        checkbox._entryData = {
                            ...entry,
                            match_persona_description: entry.match_persona_description !== undefined ? entry.match_persona_description : true,
                            match_character_description: entry.match_character_description !== undefined ? entry.match_character_description : true,
                            match_character_personality: entry.match_character_personality !== undefined ? entry.match_character_personality : true,
                            match_character_depth_prompt: entry.match_character_depth_prompt !== undefined ? entry.match_character_depth_prompt : true,
                            match_scenario: entry.match_scenario !== undefined ? entry.match_scenario : true,
                        };

                        const label = document.createElement('label');
                        label.setAttribute('for', checkbox.id);
                        label.style.display = 'block';
                        label.style.marginBottom = '15px';
                        label.style.padding = '10px';
                        label.style.border = '1px solid var(--input-border)';
                        label.style.borderRadius = '5px';
                        label.style.cursor = 'pointer';

                        // 创建内容容器
                        const contentDiv = document.createElement('div');
                        contentDiv.style.display = 'flex';
                        contentDiv.style.alignItems = 'flex-start';
                        contentDiv.style.gap = '10px';

                        // 创建文本容器
                        const textDiv = document.createElement('div');
                        textDiv.style.flex = '1';
                        textDiv.innerHTML = `
            <strong>标题:</strong> ${entry.comment || '无注释'}<br>
            <strong>关键词:</strong> ${(entry.keys || []).join(', ')}<br>
            <strong>内容:</strong> ${(entry.content || '').substring(0, 150)}${entry.content && entry.content.length > 150 ? '...' : ''}
            `;

                        // 组装元素
                        contentDiv.appendChild(checkbox);
                        contentDiv.appendChild(textDiv);
                        label.appendChild(contentDiv);
                        if (container) container.appendChild(label);
                    });

                    if (desc) desc.textContent = `AI已根据你的要求生成了 ${generatedEntries.length} 个世界书条目，请选择需要注入的条目。`;
                    if (injectBtn) injectBtn.style.display = 'inline-block';
                    if (regenerateBtn) regenerateBtn.style.display = 'inline-block';

                    // 生成完成后自动缩小引导词输入框
                    const requestInput = document.getElementById('wb-ai-request-input');
                    if (requestInput) {
                        requestInput.style.height = '100px'; // 设置为默认高度
                    }
                } else {
                    throw new Error('生成的数据格式不正确');
                }
            } catch (parseError) {
                console.error('JSON解析错误:', parseError);
                console.error('原始响应:', response);
                if (container) container.innerHTML = `<p style="color: red;">${t('parse-error', { error: parseError.message })}</p>`;
            }
        } else {
            if (container) container.innerHTML = `<p style="color: red;">${t('generation-failed')}</p>`;
        }
    } catch (error) {
        console.error('AI生成错误:', error);
        if (container) container.innerHTML = `<p style="color: red;">${t('generation-error', { error: error.message })}</p>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = originalButtonText;
    }
}

function openWorldbookAiModal(button) {
    const modal = document.getElementById('worldbook-ai-generator-modal');
    const desc = document.getElementById('wb-ai-modal-desc');
    const optionsContainer = document.getElementById('wb-ai-options-container');
    const injectBtn = document.getElementById('wb-ai-inject-btn');
    const regenerateBtn = document.getElementById('wb-ai-regenerate-btn');
    const requestInput = document.getElementById('wb-ai-request-input');

    // Reset modal state
    if (desc) desc.textContent = t('wb-ai-modal-desc');
    if (optionsContainer) optionsContainer.innerHTML = '';
    if (injectBtn) injectBtn.style.display = 'none';
    if (regenerateBtn) regenerateBtn.style.display = 'none';
    if (requestInput) requestInput.value = '';
    if (modal) {
        delete modal.dataset.lastGenType;
    }

    // 重置输入区显示状态，确保每次打开都从“通用输入”开始
    const literaryStyleArea = document.getElementById('literary-style-input-area');
    const generalInputArea = document.getElementById('general-input-area');
    const abilitySystemArea = document.getElementById('ability-system-input-area');
    if (literaryStyleArea) literaryStyleArea.style.display = 'none';
    if (generalInputArea) generalInputArea.style.display = 'block';
    if (abilitySystemArea) abilitySystemArea.style.display = 'none';

    if (modal) modal.style.display = 'flex';
}

async function fetchWorldbookStoryNodes(button, generationType) {
    const modal = document.getElementById('worldbook-ai-generator-modal');
    const container = document.getElementById('wb-ai-options-container');
    const desc = document.getElementById('wb-ai-modal-desc');
    const injectBtn = document.getElementById('wb-ai-inject-btn');
    const regenerateBtn = document.getElementById('wb-ai-regenerate-btn');

    const typeName = t(`wb-ai-type-${generationType}`);
    if (desc) desc.textContent = t('wb-ai-modal-desc-generating', { type: typeName });
    if (container) container.innerHTML = `<div class="loading-spinner" style="margin: 20px auto;"></div>`;
    if (injectBtn) injectBtn.style.display = 'none';
    if (regenerateBtn) regenerateBtn.style.display = 'none';

    const characterContext = buildCardObject();
    const existingEntries = buildWorldbookDataFromDOM(); // 获取现有条目

    // DeepSeek 限制逻辑
    const apiSettings = loadApiSettings();
    const isDeepSeek = apiSettings.provider === 'deepseek';
    const totalEntries = countAllEntries(existingEntries);
    const truncationLength = isDeepSeek && totalEntries > 0 ? Math.floor(40000 / totalEntries) : Infinity;

    const existingEntriesText = existingEntries
        .map(entry => {
            const truncatedContent = entry.content.substring(0, truncationLength);
            return `条目注释: ${entry.comment}\n关键词: ${entry.keys.join(', ')}\n内容: ${truncatedContent}${entry.content.length > truncationLength ? '...' : ''
                }\n`;
        })
        .join('\n---\n');

    let prompt;
    switch (generationType) {
        case 'worldview':
            prompt = `你正在构建作品的世界大纲。请分析以下角色设定和【已有的世界书条目】，并为该角色创建3-5个【新的、不重复的】核心【世界观】条目。这些条目应该描述重要的地点、组织、概念或技术。`;
            break;
        case 'main_plot':
            prompt = `你正在设计作品的剧情。请分析以下角色设定和【已有的世界书条目】，并为该角色创建一套包含1个主线目标和2-3个步骤的【新的、不重复的】【主线剧情】条目。`;
            break;
        case 'ability_system':
            // 获取技能条目相关输入
            const useWorldbook = document.getElementById('ability-use-worldbook')?.checked || false;
            const abilityDescription = document.getElementById('ability-description')?.value.trim() || '';
            const abilityCount = parseInt(document.getElementById('ability-count')?.value || '5');

            if (!abilityDescription) {
                alert('请输入能力描述或应用场景');
                if (container) container.innerHTML = '';
                if (desc) desc.textContent = t('wb-ai-modal-desc');
                return;
            }

            prompt = `你正在为角色创建【可直接注入世界书的单独技能条目】。
请根据以下信息生成${abilityCount}个同类型但机制不同的技能方案。

**用户需求（视为硬性条件，必须全部满足）：**
${abilityDescription}

生成要求（必须遵守）：
1. 不要生成“能力体系总览/分类树/流派说明”，只生成【独立技能条目】。
2. 每个技能都要完整满足用户给出的全部硬性条件。
3. 多个结果应为同一方向下的不同实现，避免仅改名或轻微改写。
4. 每个条目的 content 必须使用以下固定格式（逐行）：
技能名称：...
技能效果：...
技能品阶：...
5. comment 字段填写技能名称；keys 至少包含技能名称与2个相关触发词。`;

            prompt += `\n\n${useWorldbook ? '请结合角色设定和已有世界书条目，确保技能与世界观一致。' : '可以自由发挥创意，但仍要严格满足用户硬性条件。'}`;
            break;
        case 'literary_style':
            // 获取文风参考内容
            const literaryStyleReference = document.getElementById('literary-style-reference')?.value.trim() || '';

            if (!literaryStyleReference) {
                alert('请输入参考内容或作者名称，或上传参考文件');
                if (container) container.innerHTML = '';
                if (desc) desc.textContent = t('wb-ai-modal-desc');
                return;
            }

            prompt = `你是一位精通叙事学、文体学与跨文化文学批评的风格分析专家。请基于用户提供的参考内容，生成结构化的文风配置条目。

**用户提供的参考内容：**
${literaryStyleReference}

你的任务是创建1-2个世界书条目，用于存储文风配置信息。条目应包含以下三大系统的分析：

**叙事系统(narrative_system)**：
- 结构(structure)：故事组织方式、推进模式、结局处理
- 视角(perspective)：人称选择、聚焦类型、叙述距离
- 时间管理(time_management)：时序、时距、频率
- 节奏(rhythm)：句长模式、速度控制、标点节奏

**表达系统(expression_system)**：
- 话语与描写(discourse_and_description)：话语风格、描写原则、具体技法
- 对话(dialogue)：对话功能、对话风格
- 人物塑造(characterization)：塑造方法、心理策略
- 感官编织(sensory_weaving)：感官优先级、通感技法

**美学系统(aesthetics_system)**：
- 核心概念(core_concepts)：核心美学立场和关键词
- 意象与象征(imagery_and_symbolism)：季节意象、自然元素、色彩系统
- 语言与修辞(language_and_rhetoric)：句法特征、词汇偏好、修辞手法
- 整体效果(overall_effect)：阅读体验目标、美学哲学

每个维度都应包含具体的原文示例（如果有提供）和可操作的描述。`;
            break;
    }

    prompt += `
**角色设定:**
- 角色名: ${characterContext.name || '未指定'}

- 角色描述: ${characterContext.description || '未指定'}

${generationType === 'ability_system' && document.getElementById('ability-use-worldbook')?.checked ? `
**已有的世界书条目 (用于参考):**
${existingEntriesText || '无'}
` : generationType !== 'ability_system' ? `
**已有的世界书条目 (用于参考，请勿重复):**
${existingEntriesText || '无'}
` : ''}

**你的任务:**
**严格按照以下JSON格式返回你的答案，不要包含任何JSON格式之外的额外文字、解释或Markdown标记。**
返回一个JSON数组，其中每个对象代表一个条目，且必须包含以下键:
- "comment": (字符串) 条目注释/标题。
- "keys": (字符串数组) 相关的触发关键词。
- "content": (字符串) 条目的详细内容。
- "priority": (数字) 优先级，越大越重要 (普通=100, 重要=200, 核心=1000)。
- "constant": (布尔值) 是否为恒定注入。对于基础世界观、角色核心设定等应为 true，对于具体事件或地点等应为 false。
`;
    if (generationType === 'ability_system') {
        prompt += `
- 对于技能条目，请确保 comment 与 content 内的“技能名称”一致。
- 对于技能条目，禁止输出“能力体系/总览/分支图/培养路线”这类总述。`;
    }

    getAiGuidance(t('ai-guidance-title'), async userGuidance => {
        let finalPrompt = getLanguagePrefix() + prompt;
        if (userGuidance) {
            finalPrompt += `\n**用户的额外指令:** ${userGuidance}\n`;
        }

        const result = await callApi(finalPrompt, button);
        try {
            if (result) {
                let cleanedResult = result.replace(/^```json\s*|```$/g, '');

                // 处理本地模型返回的完整API响应格式
                let generatedEntries;
                try {
                    // 首先尝试直接解析
                    generatedEntries = JSON.parse(cleanedResult);
                } catch (e) {
                    mylog('直接解析失败，尝试提取嵌套JSON...');
                    try {
                        // 如果是完整的API响应，提取content字段
                        const apiResponse = JSON.parse(cleanedResult);
                        if (apiResponse.choices && apiResponse.choices[0] && apiResponse.choices[0].message) {
                            const content = apiResponse.choices[0].message.content;
                            // 从content中提取JSON
                            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                            if (jsonMatch) {
                                generatedEntries = JSON.parse(jsonMatch[1]);
                            } else {
                                // 尝试直接解析content
                                generatedEntries = JSON.parse(content);
                            }
                        } else {
                            throw new Error('无法识别的API响应格式');
                        }
                    } catch (e2) {
                        console.error('JSON解析失败:', e2);
                        console.error('原始数据:', cleanedResult.substring(0, 500));
                        throw e2;
                    }
                }

                if (Array.isArray(generatedEntries)) {
                    if (generationType === 'ability_system') {
                        generatedEntries = generatedEntries.map((entry, index) =>
                            normalizeAbilityWorldbookEntry(entry, index)
                        );
                    }

                    desc.textContent = t('wb-ai-modal-desc-generated', { type: typeName });
                    container.innerHTML = ''; // Clear spinner
                    injectBtn.style.display = 'inline-block';
                    regenerateBtn.style.display = 'inline-block';

                    generatedEntries.forEach(entry => {
                        const entryData = {
                            comment: entry.comment || '无题',
                            keys: entry.keys || [],
                            content: entry.content || '无内容',
                            priority: entry.priority || 100,
                            constant: entry.constant || false, // Capture the new field
                            enabled: true,
                            selective: true,
                            position: 'before_char',
                            wb_depth: 4,
                        };

                        const entryDiv = document.createElement('div');
                        entryDiv.className = 'generated-entry';

                        // Main selection checkbox
                        // ================== BUG FIX START ==================
                        const mainCheckboxId = `main-check-id-${Math.random().toString(36).slice(2)}`;
                        // =================== BUG FIX END ===================

                        entryDiv.innerHTML = `
                    <label for="${mainCheckboxId}">
                        <input type="checkbox" id="${mainCheckboxId}" checked>
                        <div class="entry-details">
                            <h4>${entry.comment || '无题'}</h4>
                            <p><strong>${t('trigger-words-label')}:</strong> ${(entry.keys || []).join(', ')}</p>
                            <p><strong>${t('content-label')}:</strong> ${entry.content || '无内容'}</p>
                            <div class="ai-entry-controls">
                                <span><strong>${t('suggested-priority', { priority: entry.priority || 100 })}</strong></span>
                                <label>
                                    <input type="checkbox" class="wb-ai-constant-toggle" ${entry.constant ? 'checked' : ''
                            }>
                                    ${t('entry-constant')}
                                </label>
                            </div>
                        </div>
                    </label>
                `;
                        container.appendChild(entryDiv);

                        // 获取checkbox元素并设置数据
                        const mainCheckbox = entryDiv.querySelector(`#${mainCheckboxId}`);
                        // 使用JavaScript属性而不是HTML属性来存储JSON数据，避免截断
                        mainCheckbox._entryData = entryData;

                        // Add event listener to the new constant toggle
                        const constantToggle = entryDiv.querySelector('.wb-ai-constant-toggle');

                        constantToggle.addEventListener('change', e => {
                            mainCheckbox._entryData.constant = e.target.checked;
                        });
                    });
                } else {
                    throw new Error(t('ai-return-not-array'));
                }
            }
        } catch (e) {
            console.error('解析AI返回的JSON失败:', e, '收到的原始数据:', result);
            container.innerHTML = `<p>${t('ai-parse-failed')}</p>`;
            alert(t('ai-parse-failed'));
        }
    });
}

function normalizeAbilityWorldbookEntry(entry, index) {
    const safeEntry = entry && typeof entry === 'object' ? entry : {};
    const comment = String(safeEntry.comment || '').trim() || `技能方案${index + 1}`;
    const rawContent = String(safeEntry.content || '').trim();
    const rawKeys = Array.isArray(safeEntry.keys) ? safeEntry.keys : [];
    const keys = rawKeys
        .filter(k => typeof k === 'string' && k.trim())
        .map(k => k.trim());

    if (!keys.includes(comment)) {
        keys.unshift(comment);
    }

    const priority = Number.isFinite(Number(safeEntry.priority)) ? Number(safeEntry.priority) : 200;
    const hasStructuredContent =
        /技能名称[:：]/.test(rawContent) &&
        /技能效果[:：]/.test(rawContent) &&
        /技能品阶[:：]/.test(rawContent);

    let content = rawContent;
    if (!hasStructuredContent) {
        const inferredTier = priority >= 1000 ? '神话级' : priority >= 200 ? '高级' : '普通';
        content = `技能名称：${comment}\n技能效果：${rawContent || '根据用户需求生成的技能效果。'}\n技能品阶：${inferredTier}`;
    }

    return {
        ...safeEntry,
        comment,
        keys,
        content,
        priority,
        constant: Boolean(safeEntry.constant),
    };
}

async function aiCompleteAllFields(button) {
    const currentCard = buildCardObject();
    const allFields = [
        'name',

        'gender',
        'description',
        'personality',
        'tags',
        'system_prompt',
        'scenario',
        'first_mes',
        'mes_example',
    ];
    const filledFields = {};
    const emptyFields = [];

    allFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.value.trim()) {
                filledFields[id] = el.value.trim();
            } else {
                emptyFields.push(id);
            }
        }
    });

    const isAnythingFilled = Object.keys(filledFields).length > 0;
    const existingEntries = buildWorldbookDataFromDOM();

    // DeepSeek 限制逻辑
    const apiSettings = loadApiSettings();
    const isDeepSeek = apiSettings.provider === 'deepseek';
    const totalEntries = countAllEntries(existingEntries);
    const truncationLength = isDeepSeek && totalEntries > 0 ? Math.floor(40000 / totalEntries) : Infinity;

    const existingEntriesText = existingEntries
        .map(entry => {
            const truncatedContent = entry.content.substring(0, truncationLength);
            return `- ${entry.comment}: ${truncatedContent}${entry.content.length > truncationLength ? '...' : ''}`;
        })
        .join('\n');

    const worldbookContextPrompt = `
---
**已有的信息 (用于参考):**
${existingEntriesText || '无'}
---`;

    if (isAnythingFilled) {
        // 方案1：有内容，补全其他
        if (emptyFields.length === 0) {
            alert('所有字段都已填写！');
            return;
        }

        getAiGuidance(
            t('ai-guidance-title'),
            async userGuidance => {
                emptyFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.dataset.aiBackup = el.value;
                });

                let prompt = getLanguagePrefix() + `你正在设计角色/多角色世界。请根据以下已经提供的角色信息，为角色/世界补全剩余的空白字段。
---
**已提供的信息:**
${Object.entries(filledFields)
                        .map(([key, value]) => `- ${t(key)}: ${value}`)
                        .join('\n')}
${worldbookContextPrompt}
---
**需要你补全的字段:**
"${emptyFields.join('", "')}"
---
`;
                if (userGuidance) {
                    prompt += `**用户的额外指令:** ${userGuidance}\n---`;
                }
                prompt += `**你的任务:**
请为需要补全的字段生成内容，并**严格以一个单一的JSON对象格式返回**，只包含你需要补全的字段的键和值。不要包含任何解释或Markdown标记。
- 对于 "tags" 字段, 请返回一个由逗号分隔的字符串。
- 对于 "mes_example", 请生成一段包含{{user}}和{{char}}的对话示例，对话开始另起一行以<START>开头。例如：
<START>
{{user}}: 你好。
{{char}}: (微笑着向你点头) 你好，{{user}}。找我有什么事吗？

<START>
{{user}}: 再见。
{{char}}: (微笑着向你挥手) 再见，{{user}}。

`;
                const result = await callApi(prompt, button);
                if (result) {
                    try {
                        let cleanedResult = result.replace(/^```json\s*|```$/g, '');

                        // 处理本地模型返回的完整API响应格式
                        let data;
                        try {
                            data = JSON.parse(cleanedResult);
                        } catch (e) {
                            // 如果是完整的API响应，提取content字段
                            const apiResponse = JSON.parse(cleanedResult);
                            if (apiResponse.choices && apiResponse.choices[0] && apiResponse.choices[0].message) {
                                const content = apiResponse.choices[0].message.content;
                                const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                                if (jsonMatch) {
                                    data = JSON.parse(jsonMatch[1]);
                                } else {
                                    data = JSON.parse(content);
                                }
                            } else {
                                throw e;
                            }
                        }

                        emptyFields.forEach(id => {
                            if (data[id]) {
                                const el = document.getElementById(id);
                                if (el) {
                                    el.value = data[id];
                                    const undoBtn = el.closest('.field-group').querySelector('.ai-undo-button');
                                    if (undoBtn) {
                                        undoBtn.style.display = 'inline-block';
                                    }
                                }
                            }
                        });
                        alert(t('all-fields-completed'));
                    } catch (e) {
                        console.error('解析AI返回的JSON失败:', e, '收到的原始数据:', result);
                        alert(t('ai-parse-failed'));
                    }
                }
            },
            t('ai-guidance-prompt'),
        );
    } else {
        // 方案2：全空，按原逻辑执行
        getAiGuidance(
            t('ai-complete-all-guidance-title'),
            async userGuidance => {
                if (!userGuidance) {
                    alert(t('ai-complete-all-guidance-placeholder'));
                    return;
                }

                const fieldsToComplete = [
                    'description',
                    'personality',
                    'tags',
                    'system_prompt',
                    'scenario',
                    'first_mes',
                    'mes_example',
                    'name',

                    'gender',
                ];
                fieldsToComplete.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.dataset.aiBackup = el.value;
                });

                const prompt = getLanguagePrefix() + `你是专业的角色信息生成专家。请根据用户提供的角色概念，深度思考并生成完整的角色信息.
## 用户需求
**用户核心概念:** ${userGuidance}
${worldbookContextPrompt}
---
**你的任务:**
为以下字段生成内容，并**严格以一个单一的JSON对象格式返回**，不要包含任何解释或Markdown标记。
**目标字段:** "${fieldsToComplete.join('", "')}"
- 对于 "tags" 字段, 请返回一个由逗号分隔的字符串。
- 对于 "personality", 请返回一个包含MBTI性格类型的详细性格描述。
- 对于 "mes_example", 请生成一段包含{{user}}和{{char}}的对话示例，对话开始另起一行以<START>开头。例如：
<<START>
{{user}}: 你好。
{{char}}: (微笑着向你点头) 你好，{{user}}。找我有什么事吗？

<START>
{{user}}: 再见。
{{char}}: (微笑着向你挥手) 再见，{{user}}。
- 对于 "first_mes" 字段，请生成一段具有充足篇幅和沉浸感的开场白，要求：
  * **篇幅要求**：至少500-800字，充分展开场景描写
  * **结构层次**：
    - 环境描写：详细描绘场景氛围、视觉细节、空间感
    - 感官体验：失重感、眩晕感等身体感受，视觉、听觉等多感官描写
    - 角色登场：{{char}}的出场要有仪式感，包含外貌、神态、动作的细致刻画
    - 对话互动：包含{{char}}的台词，展现性格特征和当前情境
    - 情境说明：通过对话和描写自然引出当前场景的背景信息
  * **叙事视角**：以第二人称"你"({{user}})的视角展开，营造代入感
  * **氛围营造**：根据角色和场景特点，营造相应的氛围（恋爱、科幻、奇幻、日常、紧张等）
  * **细节丰富**：包含具体的视觉细节、动作描写、表情刻画、环境元素
  * **留白设计**：结尾留下互动空间，引导{{user}}做出回应

## 第一步：角色类型判断
首先判断这是什么类型的角色：
- **已知角色**（来自动漫/游戏/小说等）→ 使用「提取模式」
- **原创角色**（用户自创或仅提供简单概念）→ 使用「创作模式」

---

## 第二步：深度思考策略

### 如果是已知角色 - 提取模式
**核心原则：** 提取而非创作

**思考流程：**
1. **信息盘点**
   - 我对这个角色了解多少？
   - 哪些是原作明确的？哪些是推测的？
   - 容易遗漏的细节有哪些？（口头禅、小动作等）

2. **优先级排序**
   - 核心特征：外貌标志、性格核心、经典台词
   - 重要设定：详细外貌、背景故事、人际关系
   - 细节补充：日常习惯、兴趣爱好、语言风格
   - 合理推测：仅限NSFW或原作未明确的细节

3. **质量保证**
   - 所有原作明确信息都已包含？
   - 标志性特征有没有遗漏？
   - 绝不编造原作不存在的重要设定

### 如果是原创角色 - 创作模式
**核心原则：** 基于用户概念进行合理扩展

**思考流程：**
1. **概念解析**
   - 用户提供了哪些核心要素？
   - 哪些维度需要我补充？
   - 角色的核心定位是什么？

2. **创作策略**
   - 保持一致性：所有设定围绕核心概念展开
   - 丰富细节：从核心特征推导次要特征
   - 逻辑自洽：性格、背景、行为模式相互支撑
   - 创意发挥：在合理范围内增加独特性

3. **字段难度评估**
   - **容易生成**：description、personality、scenario、mes_example
   - **需要推理**：first_mes、tags、creator_notes
   - **可能困难**：特定的世界观设定、复杂关系网
   - **策略**：优先生成容易的字段，困难字段基于已生成内容推导

---

## 第三步：字段生成指南

### 各字段生成要点

#### description字段（核心字段，无字数上限）
**已知角色格式：**
【基础信息】原作明确的身份、年龄、身份等
【外貌特征】详细描述（含精确数据如身高/三围，如有）
【性格与行为】分层描述（表面/真实/隐藏特质）+ 典型案例
【人际关系】每个关系注明原作场景
【背景故事】按时间线整理关键事件
【语言特征】口头禅、说话方式、典型台词
【能力与技能】原作展现的所有能力
【内心世界】动机、恐惧、欲望（基于行为分析）
【衣着风格】分场景描述（日常/战斗/特殊）
【NSFW相关】可合理推测

**原创角色格式：**
基于用户概念，自由组织以上维度，重点突出：
- 核心人设定位
- 性格的多面性和成因
- 行为模式的逻辑性
- 独特的个人特征

---

## 自检与输出

**已知角色自检：**
所有原作明确信息都已包含？
标志性特征有没有遗漏？
绝不编造原作不存在的重要设定？

**原创角色自检：**
围绕用户概念展开？
各设定逻辑自洽？
人物有独特性？

**通用自检：**
难以生成的字段是否已尽力推导？
如果某字段确实无法生成，是否已在其他字段中补偿？

---

**现在开始：**
1. 先判断角色类型（已知/原创）
2. 在内心进行深度思考（不要输出思考过程）
3. 直接输出JSON格式的结果`;
                const result = await callApi(prompt, button);
                if (result) {
                    try {
                        let cleanedResult = result.replace(/^```json\s*|```$/g, '');

                        // 处理本地模型返回的完整API响应格式
                        let data;
                        try {
                            data = JSON.parse(cleanedResult);
                        } catch (e) {
                            // 如果是完整的API响应，提取content字段
                            const apiResponse = JSON.parse(cleanedResult);
                            if (apiResponse.choices && apiResponse.choices[0] && apiResponse.choices[0].message) {
                                const content = apiResponse.choices[0].message.content;
                                const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                                if (jsonMatch) {
                                    data = JSON.parse(jsonMatch[1]);
                                } else {
                                    data = JSON.parse(content);
                                }
                            } else {
                                throw e;
                            }
                        }

                        fieldsToComplete.forEach(id => {
                            if (data[id]) {
                                const el = document.getElementById(id);
                                if (el) {
                                    el.value = data[id];
                                    const undoBtn = el.closest('.field-group').querySelector('.ai-undo-button');
                                    if (undoBtn) {
                                        undoBtn.style.display = 'inline-block';
                                    }
                                }
                            }
                        });
                        alert(t('all-fields-completed'));
                    } catch (e) {
                        console.error('解析AI返回的JSON失败:', e, '收到的原始数据:', result);
                        alert(t('ai-parse-failed'));
                    }
                }
            },
            t('ai-complete-all-guidance-placeholder'),
        );
    }
}

// ====================================================================================
// --- LORE BOOK MANAGEMENT (DATA-DRIVEN) ---
// ====================================================================================

function findEntryRecursive(list, elementToFind, parent = null) {
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.element === elementToFind) {
            return {
                entry: item,
                parentList: list,
                index: i,
                parentEntry: parent,
            };
        }
        if (item.children && item.children.length > 0) {
            const found = findEntryRecursive(item.children, elementToFind, item);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function parseEntryFromElement(element) {
    return {
        id: parseInt(element.querySelector('.wb-sort-id').value, 10) || 0,
        keys: element
            .querySelector('.wb-keys')
            .value.split(/[,、，\s]+/)
            .map(k => k.trim())
            .filter(Boolean),
        secondary_keys: element.querySelector('.wb-secondary-keys')
            ? element.querySelector('.wb-secondary-keys').value.split(/[,、，\s]+/)
                .map(k => k.trim())
                .filter(Boolean)
            : [],
        secondary_keys_logic: element.querySelector('.wb-secondary-keys-logic') ? element.querySelector('.wb-secondary-keys-logic').value : 'any',
        comment: element.querySelector('.entry-comment').value,
        content: element.querySelector('.wb-content').value,
        priority: parseInt(element.querySelector('.wb-priority').value, 10) || 100,
        enabled: element.querySelector('.wb-enabled').checked,
        prevent_recursion: element.querySelector('.wb-prevent-recursion') ? element.querySelector('.wb-prevent-recursion').checked : false,
        exclude_recursion: element.querySelector('.wb-exclude-recursion') ? element.querySelector('.wb-exclude-recursion').checked : false,
        group: element.querySelector('.wb-group') ? element.querySelector('.wb-group').value.trim() : '',
        position: parseInt(element.querySelector('.wb-position').value) || 0,
        role: parseInt(element.querySelector('.wb-position').selectedOptions[0].dataset.role) || 0,
        constant: element.querySelector('.wb-constant').checked,
        selective: element.querySelector('.wb-selective').checked,
        use_regex: element.querySelector('.wb-use-regex') ? element.querySelector('.wb-use-regex').checked : false,
        match_whole_words: element.querySelector('.wb-match-whole-words') ? element.querySelector('.wb-match-whole-words').checked : true,
        case_sensitive: element.querySelector('.wb-case-sensitive') ? element.querySelector('.wb-case-sensitive').checked : false,
        probability: parseInt(element.querySelector('.wb-probability').value, 10),
        depth: element.querySelector('.wb-depth') ? (element.querySelector('.wb-depth').value !== '' ? parseInt(element.querySelector('.wb-depth').value, 10) : null) : null,
        scan_depth: element.querySelector('.wb-scan-depth').value ? parseInt(element.querySelector('.wb-scan-depth').value, 10) : null,
        group_override: element.querySelector('.wb-group-override') ? element.querySelector('.wb-group-override').checked : false,
        group_weight: element.querySelector('.wb-group-weight') ? parseInt(element.querySelector('.wb-group-weight').value, 10) || 100 : 100,
        use_group_scoring: element.querySelector('.wb-use-group-scoring') ? (element.querySelector('.wb-use-group-scoring').checked ? true : null) : null,
        // 额外匹配源 - 支持隐藏字段，默认关闭
        match_persona_description: element.querySelector('.wb-match-persona-description') ? (element.querySelector('.wb-match-persona-description').value === 'true' || element.querySelector('.wb-match-persona-description').checked) : false,
        match_character_description: element.querySelector('.wb-match-character-description') ? (element.querySelector('.wb-match-character-description').value === 'true' || element.querySelector('.wb-match-character-description').checked) : false,
        match_character_personality: element.querySelector('.wb-match-character-personality') ? (element.querySelector('.wb-match-character-personality').value === 'true' || element.querySelector('.wb-match-character-personality').checked) : false,
        match_character_depth_prompt: element.querySelector('.wb-match-character-depth-prompt') ? (element.querySelector('.wb-match-character-depth-prompt').value === 'true' || element.querySelector('.wb-match-character-depth-prompt').checked) : false,
        match_scenario: element.querySelector('.wb-match-scenario') ? (element.querySelector('.wb-match-scenario').value === 'true' || element.querySelector('.wb-match-scenario').checked) : false,
        element: element,
        children: [],
    };
}

function buildWorldbookDataFromDOM(parentElement = document.getElementById('worldbook-entries-container')) {
    const entries = [];
    const childElements = Array.from(parentElement.children);

    for (const el of childElements) {
        if (el.matches('li.worldbook-entry')) {
            const entryData = parseEntryFromElement(el);
            const childContainer = el.querySelector('.child-entries');
            if (childContainer && childContainer.children.length > 0) {
                entryData.children = buildWorldbookDataFromDOM(childContainer);
            }
            entries.push(entryData);
        }
    }
    return entries;
}

// 世界书分批渲染配置
const WB_BATCH_SIZE = 30; // 每批渲染数量
const WB_BATCH_DELAY = 10; // 批次间延迟(ms)
let wbRenderAbortController = null; // 用于取消渲染

function renderWorldbookFromData(data) {
    const container = document.getElementById('worldbook-entries-container');
    const totalEntries = countAllEntries(data);

    // 取消之前的渲染任务
    if (wbRenderAbortController) {
        wbRenderAbortController.abort();
    }
    wbRenderAbortController = new AbortController();
    const signal = wbRenderAbortController.signal;

    container.innerHTML = '';

    // 小数据量直接渲染
    if (totalEntries <= 100) {
        renderLevelSync(data, container);
        updateAllEntryAttributes();
        // 恢复折叠状态
        restoreWorldbookFoldStates();
        return;
    }

    // 大数据量：显示加载提示并分批渲染
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'wb-loading-indicator';
    loadingDiv.style.cssText = 'text-align:center;padding:20px;color:#aaa;';
    loadingDiv.innerHTML = `<span>正在加载 ${totalEntries} 个条目...</span><div style="margin-top:10px;height:4px;background:#333;border-radius:2px;overflow:hidden;"><div id="wb-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--primary-color),var(--secondary-color));transition:width 0.2s;"></div></div>`;
    container.appendChild(loadingDiv);

    // 扁平化数据用于分批处理
    const flatEntries = flattenEntries(data);
    const entryMap = new Map();

    renderBatched(flatEntries, container, entryMap, signal, totalEntries);
}

// 同步渲染（小数据量）
function renderLevelSync(entries, parentElement) {
    entries.forEach(entryData => {
        const entryElement = createWorldbookEntryElement(entryData);
        parentElement.appendChild(entryElement);
        if (entryData.children && entryData.children.length > 0) {
            const childContainer = entryElement.querySelector('.child-entries');
            renderLevelSync(entryData.children, childContainer);
        }
    });
}

// 扁平化条目数据，保留层级信息
function flattenEntries(entries, parentId = null, result = []) {
    entries.forEach(entry => {
        result.push({ ...entry, _parentId: parentId, _originalChildren: entry.children });
        if (entry.children && entry.children.length > 0) {
            flattenEntries(entry.children, entry.id, result);
        }
    });
    return result;
}

// 分批渲染
async function renderBatched(flatEntries, container, entryMap, signal, total) {
    const progressBar = document.getElementById('wb-progress-bar');
    let rendered = 0;

    for (let i = 0; i < flatEntries.length; i += WB_BATCH_SIZE) {
        if (signal.aborted) return;

        const batch = flatEntries.slice(i, i + WB_BATCH_SIZE);

        batch.forEach(entryData => {
            const entryElement = createWorldbookEntryElement({
                ...entryData,
                children: []
            });
            entryMap.set(entryData.id, entryElement);

            if (entryData._parentId !== null) {
                const parentEl = entryMap.get(entryData._parentId);
                if (parentEl) {
                    const childContainer = parentEl.querySelector('.child-entries');
                    childContainer.appendChild(entryElement);
                }
            } else {
                container.appendChild(entryElement);
            }
            rendered++;
        });

        if (progressBar) {
            progressBar.style.width = Math.round((rendered / total) * 100) + '%';
        }

        await new Promise(r => setTimeout(r, WB_BATCH_DELAY));
    }

    const loadingDiv = document.getElementById('wb-loading-indicator');
    if (loadingDiv) loadingDiv.remove();

    updateAllEntryAttributes();
    // 恢复折叠状态
    restoreWorldbookFoldStates();
    mylog(`世界书渲染完成: ${total} 个条目`);
}

function countAllEntries(entries) {
    let count = 0;
    if (!entries) return 0;
    for (const entry of entries) {
        count++;
        if (entry.children && entry.children.length > 0) {
            count += countAllEntries(entry.children);
        }
    }
    return count;
}

function sortDataTree(data) {
    data.sort((a, b) => (a.id || 0) - (b.id || 0));
    data.forEach(entry => {
        if (entry.children && entry.children.length > 0) {
            sortDataTree(entry.children);
        }
    });
}

function sortDataTreeByPriority(data) {
    data.sort((a, b) => {
        // 按顺序排：先看位置，然后深度，再看顺序，最后都一样才看是恒定与否（恒定排上面，非恒定排下面）

        // 1. 主排序：按位置 (position) 升序
        const aPos = a.position || 0;
        const bPos = b.position || 0;
        if (aPos !== bPos) {
            return aPos - bPos;
        }

        // 2. 二级排序：按深度降序 (深度大的在前，即数值大的在前)
        // 只对position=4（@深度位置）的条目进行深度排序
        const aDepth = (a.position === 4) ? (a.depth || 4) : -1;
        const bDepth = (b.position === 4) ? (b.depth || 4) : -1;
        if (aDepth !== bDepth) {
            return bDepth - aDepth; // 深度大的在前
        }

        // 3. 三级排序：按顺序 (priority) 升序 (数值小的在前，越靠前越先发送给AI)
        const aOrder = a.priority || 100;
        const bOrder = b.priority || 100;
        if (aOrder !== bOrder) {
            return aOrder - bOrder; // 顺序小的在前
        }

        // 4. 四级排序：按恒定状态 (constant=0恒定在前, normal=1, disabled=2)
        const aState = (a.enabled === false) ? 2 : (a.constant ? 0 : 1);
        const bState = (b.enabled === false) ? 2 : (b.constant ? 0 : 1);
        if (aState !== bState) {
            return aState - bState;
        }

        // 5. 五级排序：按ID升序
        return (a.id || 0) - (b.id || 0);
    });

    data.forEach(entry => {
        if (entry.children && entry.children.length > 0) {
            sortDataTreeByPriority(entry.children);
        }
    });
}

function sortWorldbookEntries() {
    const worldbookData = buildWorldbookDataFromDOM();
    sortDataTree(worldbookData);
    renderWorldbookFromData(worldbookData);
    alert('条目已按ID重新排列！');
}

function sortWorldbookEntriesByPriority() {
    const worldbookData = buildWorldbookDataFromDOM();
    sortDataTreeByPriority(worldbookData);
    renderWorldbookFromData(worldbookData);
    alert('条目已按实际Sillytavern发送顺序重新排列！');
}

function airdropEntry(button) {
    const currentEntryElement = button.closest('.worldbook-entry');
    if (!currentEntryElement) return;

    const idInput = currentEntryElement.querySelector('.wb-sort-id');
    if (!idInput) return;

    const targetId = parseInt(idInput.value, 10);
    if (isNaN(targetId)) {
        alert('请输入一个有效的数字ID。');
        return;
    }
    const worldbookData = buildWorldbookDataFromDOM();
    let entryToMove = null;
    let parentList = null;

    function findEntryAndParent(data, parent) {
        for (const entry of data) {
            if (entry.element === currentEntryElement) {
                entryToMove = entry;
                parentList = parent;
                return;
            }
            if (entry.children.length > 0) {
                findEntryAndParent(entry.children, entry.children);
            }
        }
    }
    findEntryAndParent(worldbookData, worldbookData);
    if (!entryToMove || !parentList) return;
    parentList.forEach(sibling => {
        if (sibling !== entryToMove && sibling.id >= targetId) {
            sibling.id += 1;
        }
    });
    entryToMove.id = targetId;
    sortDataTree(worldbookData);
    renderWorldbookFromData(worldbookData);
    alert(`操作完成！列表已根据新ID排列。`);
}

function createDefaultImage(ratio = '2:3') {
    const canvas = document.createElement('canvas');
    const [width, height] = ratio === '2:3' ? [512, 768] : [768, 512];
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#2d2d2d');
    gradient.addColorStop(1, '#1c1c1c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}
function addWorldbookEntry(entryData = null) {
    const worldbookData = buildWorldbookDataFromDOM();
    const newId = worldbookData.length > 0 ? Math.max(...worldbookData.map(e => e.id)) + 1 : 0;

    if (entryData) {
        // 如果提供了完整的条目数据，使用它
        const newEntry = {
            id: newId,
            comment: entryData.comment || t('new-entry'),
            keys: entryData.keys || [],
            content: entryData.content || '',
            priority: entryData.priority || 100,
            constant: entryData.constant !== undefined ? entryData.constant : false,
            enabled: entryData.enabled !== undefined ? entryData.enabled : true,
            selective: entryData.selective !== undefined ? entryData.selective : true,
            position: entryData.position !== undefined ? entryData.position : 0,
            role: entryData.role !== undefined ? entryData.role : 0,
            depth: entryData.depth !== undefined ? entryData.depth : (entryData.wb_depth !== undefined ? entryData.wb_depth : 4),
            children: entryData.children || []
        };
        worldbookData.push(newEntry);
    } else {
        // 如果没有提供数据，创建空条目
        worldbookData.push({ id: newId, comment: t('new-entry'), keys: [], content: '', children: [] });
    }

    renderWorldbookFromData(worldbookData);

    // 展开新创建的条目
    setTimeout(() => {
        const entries = document.querySelectorAll('.worldbook-entry');
        const newEntry = Array.from(entries).find(e => e.dataset.entryId == newId);
        if (newEntry) {
            expandWorldbookEntry(newEntry);
        }
    }, 100);
}

// 导入世界书函数
async function importWorldbook(event) {
    const files = event.target.files;
    if (!files.length) return;

    for (const file of files) {
        if (file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    processImportedWorldbook(importedData, file.name);
                } catch (err) {
                    console.error('世界书导入错误:', err);
                    alert(t('import-worldbook-failed', { error: err.message }) || `导入失败: ${err.message}`);
                }
            };
            reader.readAsText(file);
        } else if (file.type === 'image/png') {
            // 处理PNG格式的角色卡
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const arrayBuffer = e.target.result;
                    const charData = await extractDataFromPng(arrayBuffer);
                    processImportedWorldbook(charData, file.name);
                } catch (err) {
                    console.error('PNG世界书导入错误:', err);
                    alert(t('import-worldbook-failed', { error: err.message }) || `导入PNG失败: ${err.message}`);
                }
            };
            reader.readAsArrayBuffer(file);
        }
    }
    event.target.value = '';
}

// 处理导入的世界书数据
function processImportedWorldbook(importedData, fileName) {
    let entriesToImport = [];

    // 格式1: 纯世界书格式 (lorebook.json)
    // { entries: { "0": {...}, "1": {...} }, originalData: {...} }
    if (importedData.entries && typeof importedData.entries === 'object') {
        const entriesObj = importedData.entries;

        // 转换对象格式的entries为数组
        if (!Array.isArray(entriesObj)) {
            entriesToImport = Object.values(entriesObj);
        } else {
            entriesToImport = entriesObj;
        }
    }
    // 格式2: 角色卡V3格式 (包含character_book)
    else if (importedData.spec === 'chara_card_v3' && importedData.data?.character_book?.entries) {
        entriesToImport = importedData.data.character_book.entries;
    }
    // 格式3: 直接的entries数组
    else if (Array.isArray(importedData)) {
        entriesToImport = importedData;
    }

    if (entriesToImport.length === 0) {
        alert(t('import-worldbook-empty') || '导入的文件中没有找到世界书条目');
        return;
    }

    // 转换并添加条目
    const currentWorldbook = buildWorldbookDataFromDOM();
    let maxId = currentWorldbook.length > 0 ? Math.max(...currentWorldbook.map(e => e.id)) : -1;

    let importedCount = 0;
    const importedEntryIds = []; // 记录导入的条目ID

    entriesToImport.forEach(entry => {
        maxId++;
        const convertedEntry = convertImportedEntry(entry, maxId);
        if (convertedEntry) {
            currentWorldbook.push(convertedEntry);
            importedEntryIds.push(maxId); // 记录导入的ID
            importedCount++;
        }
    });

    // 在渲染前，先将新导入的条目设置为折叠状态
    importedEntryIds.forEach(entryId => {
        saveWorldbookFoldState(entryId, true);
    });

    // 重新渲染世界书（会自动应用折叠状态）
    renderWorldbookFromData(currentWorldbook);

    alert(t('import-worldbook-success', { count: importedCount }) || `成功导入 ${importedCount} 个世界书条目`);
}

// 转换导入的条目格式
function convertImportedEntry(entry, newId) {
    // 转换V3格式的position到内部格式
    function convertPositionToInternal(position) {
        const positionMap = {
            'before_char': 0,
            'after_char': 1,
            'top_an': 2,
            'bottom_an': 3,
            'at_depth': 4,
            'em_top': 5,
            'em_bottom': 6
        };
        if (typeof position === 'string') {
            return positionMap[position] !== undefined ? positionMap[position] : 0;
        }
        return position || 0;
    }

    // 递归转换子条目
    function convertChildren(children) {
        if (!children || !Array.isArray(children) || children.length === 0) {
            return [];
        }
        return children.map(child => ({
            id: child.id || child.uid || 0,
            comment: child.comment || '',
            keys: Array.isArray(child.keys) ? child.keys : (Array.isArray(child.key) ? child.key : []),
            content: child.content || '',
            priority: child.priority !== undefined ? child.priority : (child.order !== undefined ? child.order : 100),
            constant: child.constant !== undefined ? child.constant : false,
            enabled: child.enabled !== undefined ? child.enabled : !child.disable,
            selective: child.selective !== undefined ? child.selective : true,
            position: convertPositionToInternal(child.position || child.extensions?.position),
            role: child.role !== undefined ? child.role : (child.extensions?.role !== undefined ? child.extensions.role : 0),
            depth: child.depth !== undefined ? child.depth : (child.extensions?.depth !== undefined ? child.extensions.depth : 4),
            children: convertChildren(child.children)
        }));
    }

    try {
        return {
            id: newId,
            comment: entry.comment || '',
            keys: Array.isArray(entry.keys) ? entry.keys : (Array.isArray(entry.key) ? entry.key : []),
            content: entry.content || '',
            priority: entry.priority !== undefined ? entry.priority : (entry.order !== undefined ? entry.order : 100),
            constant: entry.constant !== undefined ? entry.constant : false,
            enabled: entry.enabled !== undefined ? entry.enabled : !entry.disable,
            selective: entry.selective !== undefined ? entry.selective : true,
            position: convertPositionToInternal(entry.position || entry.extensions?.position),
            role: entry.role !== undefined ? entry.role : (entry.extensions?.role !== undefined ? entry.extensions.role : 0),
            depth: entry.depth !== undefined ? entry.depth : (entry.extensions?.depth !== undefined ? entry.extensions.depth : 4),
            children: convertChildren(entry.children)
        };
    } catch (err) {
        console.error('转换条目失败:', err, entry);
        return null;
    }
}

// 新增：设置优先级的辅助函数
function setPriority(button, value) {
    const priorityInput = button.closest('.field-group').querySelector('.wb-priority');
    if (priorityInput) {
        priorityInput.value = value;
        // 更新折叠状态下的显示
        const entry = button.closest('.worldbook-entry');
        if (entry) {
            updateCollapsedInfo(entry);
        }
    }
}

// 切换深度字段显示
function toggleDepthField(selectElement) {
    const entryElement = selectElement.closest('.worldbook-entry');
    const depthField = entryElement.querySelector('.depth-field');
    if (depthField) {
        const selectedValue = parseInt(selectElement.value);
        // position值4表示深度位置（系统/用户/助手深度）
        const isDepthPosition = selectedValue === 4;
        depthField.style.display = isDepthPosition ? 'block' : 'none';
    }
}

// 获取位置标记文本（参考SillyTavern命名法）
function getPositionBadgeText(entry) {
    const position = entry.position || 0;
    const role = entry.role || 0;
    const depth = entry.depth || 4;

    // 基础位置
    if (position === 0) return '↑Char'; // Before Char Defs
    if (position === 1) return '↓Char'; // After Char Defs
    if (position === 5) return '↑EM';   // Before Example Messages
    if (position === 6) return '↓EM';   // After Example Messages
    if (position === 2) return '↑AN';   // Before Author's Note
    if (position === 3) return '↓AN';   // After Author's Note

    // @深度 位置
    if (position === 4) {
        const roleIcon = role === 0 ? '⚙️' : role === 1 ? '👤' : '🤖';
        return `@深${depth} ${roleIcon}`;
    }

    return '↑Char'; // 默认
}

function createWorldbookEntryElement(entryData = {}) {
    const entryLi = document.createElement('li');
    entryLi.className = 'worldbook-entry';
    const uniqueId = `wb-entry-${Date.now()}-${Math.random()}`;
    entryLi.dataset.uniqueId = uniqueId;
    entryLi.dataset.entryId = entryData?.id || 0; // 用于保存折叠状态

    const defaultEntry = {
        comment: t('new-entry'),
        keys: [],
        secondary_keys: [],
        content: '',
        secondary_keys_logic: 'any',
        priority: 100,
        enabled: true,
        prevent_recursion: true,  // 默认开启防止进一步递归
        exclude_recursion: true,  // 默认开启不可被递归
        group: '',
        position: 0,
        role: 0,
        id: 0,
        constant: false,
        selective: true,
        use_regex: false,
        match_whole_words: true,
        case_sensitive: false,
        probability: 100,
        depth: 4,
        scan_depth: null,
        group_override: false,
        group_weight: 100,
        use_group_scoring: null,
        // 额外匹配源 - 默认关闭
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        ...entryData,
    };

    entryLi.innerHTML = `
<div class="entry-content-wrapper">
    <div class="entry-header">
        <div class="entry-title-group">
            <button class="wb-fold-toggle" onclick="toggleWorldbookEntry(this)" title="${t('toggle-fold')}">
                <span class="toggle-arrow"></span>
            </button>
            <div class="entry-collapsed-title" onclick="expandWorldbookEntryByTitle(this)" style="display: none; cursor: pointer; flex: 1; padding: 8px 12px; border-radius: 4px; transition: background 0.2s;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                    <h4 style="margin: 0; color: var(--text-color); font-size: 16px; font-weight: 500; flex: 1;">${defaultEntry.comment || t('new-entry')}</h4>
                    <div class="entry-collapsed-info" onclick="event.stopPropagation();" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <span class="entry-priority-badge" style="padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; background: rgba(230, 126, 34, 0.1); color: #e67e22;" title="顺序">
                            ${defaultEntry.priority || 0}
                        </span>
                        <span class="entry-position-badge" style="padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; background: rgba(94, 91, 157, 0.1); color: var(--primary-color);" title="${t('entry-position')}">
                            ${getPositionBadgeText(defaultEntry)}
                        </span>
                        <button class="constant-toggle-btn-mini" onclick="toggleConstantMode(this)" 
                                style="padding: 4px 8px; border: none; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; ${defaultEntry.constant ? 'background-color: #ff7849; color: white;' : 'background-color: #6c757d; color: white;'}"
                                data-constant="${defaultEntry.constant || false}"
                                title="${defaultEntry.constant ? t('constant-mode-permanent') : t('constant-mode-keyword')}">
                            ${defaultEntry.constant ? '永久' : '关键词'}
                        </button>
                    </div>
                </div>
            </div>
            <div class="entry-expanded-controls" style="display: flex; align-items: center; gap: 5px; flex: 1;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <input type="number" class="wb-sort-id" title="${t('help-entry-id')}" placeholder="${t(
        'entry-id',
    )}" value="${defaultEntry.id}" style="width: 65px; flex-shrink: 0;">
                    <button title="${t('airdrop-entry-title')}" onclick="airdropEntry(this)" style="padding: 5px 8px; font-size: 14px; background-color: #6c757d; color: white;">➡️</button>
                </div>
                <input type="text" class="entry-comment" placeholder="${t('entry-comment-placeholder')}" value="${defaultEntry.comment
        }" oninput="updateCollapsedTitle(this)">
                <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-id-drop'))">?</span>
            </div>
        </div>
        <div class="entry-actions">
            <button title="${t('add-child-entry')}" onclick="addChildEntry(this)">➕</button>
            <button title="${t('exit-parent-entry-title')}" onclick="indentEntry(this, -1)">${t('exit-parent-entry')}</button>
            <button title="${t('join-parent-entry-title')}" onclick="indentEntry(this, 1)">${t('join-parent-entry')}</button>
            <button class="delete-entry-btn" onclick="deleteWorldbookEntry(this);">${t(
            'delete',
        )}</button>
        </div>
    </div>
    <div class="entry-grid">
        <div class="field-group full-width">
            <label>${t(
            'main-keys',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-main-keys'))">?</span></label>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="text" class="wb-keys" placeholder="${t('main-keys-placeholder')}" value="${(
            defaultEntry.keys || []
        ).join(', ')}" style="flex: 1;">
                <button class="constant-toggle-btn" onclick="toggleConstantMode(this)" 
                        style="padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; min-width: 60px; transition: all 0.2s ease; ${defaultEntry.constant ? 'background-color: #ff7849; color: white;' : 'background-color: #6c757d; color: white;'}"
                        data-constant="${defaultEntry.constant || false}">
                    ${defaultEntry.constant ? t('constant-mode-permanent') : t('constant-mode-keyword')}
                </button>
            </div>
        </div>
        <div class="field-group full-width">
            <label>${t(
            'injection-content',
        )} <button class="ai-button" onclick="callWorldbookDeepSeek(this)" style="padding: 2px 8px; font-size: 12px; width: auto; margin-left: 10px;">${t(
            'ai-help-write',
        )}</button><button class="ai-undo-button" onclick="undoAiCompletion(this)">${t('undo')}</button></label>
            <textarea class="wb-content" rows="3" placeholder="${t('injection-content-placeholder')}">${defaultEntry.content
        }</textarea>
        </div>

        <div class="field-group full-width">
            <details>
                <summary id="advanced-settings-summary">${t(
            'advanced-settings',
        )} <span style="font-weight: normal; font-size: 14px; color: #aaa;">${t('advanced-settings-subtitle')}</span></summary>
                <div class="advanced-grid">
                    <div class="field-group full-width">
                        <label>${t('keyword-filter')} 
                            <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-secondary-keys'))">?</span>
                        </label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <select class="wb-secondary-keys-logic" style="flex: 1; padding: 12px;">
                                <option value="any" ${defaultEntry.secondary_keys_logic === 'any' ? 'selected' : ''
        }>${t('secondary-keys-logic-any')}</option>
                                <option value="none" ${defaultEntry.secondary_keys_logic === 'none' ? 'selected' : ''
        }>${t('secondary-keys-logic-none')}</option>
                                <option value="all" ${defaultEntry.secondary_keys_logic === 'all' ? 'selected' : ''
        }>${t('secondary-keys-logic-all')}</option>
                                <option value="not_all" ${defaultEntry.secondary_keys_logic === 'not_all' ? 'selected' : ''
        }>${t('secondary-keys-logic-not-all')}</option>
                            </select>
                            <input type="text" class="wb-secondary-keys" placeholder="${t(
            'secondary-keys-placeholder',
        )}" value="${(defaultEntry.secondary_keys || []).join(', ')}" style="flex: 3;">
                        </div>
                    </div>
                    <div class="field-group">
                        <label>${t(
            'entry-position',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-position'))">?</span></label>
                        <select class="wb-position" onchange="toggleDepthField(this); updateCollapsedInfo(this.closest('.worldbook-entry'))">
                            <!-- 基础位置：在角色定义附近 -->
                            <option value="0" ${defaultEntry.position === 0 ? 'selected' : ''}>
                                ${t('position-before-char-system')}
                            </option>
                            <option value="1" ${defaultEntry.position === 1 ? 'selected' : ''}>
                                ${t('position-after-char-system')}
                            </option>
                            
                            <!-- 最高优先级：在对话历史中动态插入 -->
                            <option value="4" data-role="0" ${defaultEntry.position === 4 && defaultEntry.role === 0 ? 'selected' : ''}>
                                ${t('position-smart-system')}
                            </option>
                            <option value="4" data-role="1" ${defaultEntry.position === 4 && defaultEntry.role === 1 ? 'selected' : ''}>
                                ${t('position-smart-user')}
                            </option>
                            <option value="4" data-role="2" ${defaultEntry.position === 4 && defaultEntry.role === 2 ? 'selected' : ''}>
                                ${t('position-smart-ai')}
                            </option>

                            <!-- 高级选项（默认隐藏）
                            <option value="2" ${defaultEntry.position === 2 ? 'selected' : ''}>
                                📝 作者注释前 - 低注意力
                            </option>
                            <option value="3" ${defaultEntry.position === 3 ? 'selected' : ''}>
                                📝 作者注释后 - 低注意力
                            </option>
                            <option value="5" ${defaultEntry.position === 5 ? 'selected' : ''}>
                                📧 对话开始前 - 中等注意力
                            </option>
                            <option value="6" ${defaultEntry.position === 6 ? 'selected' : ''}>
                                📧 对话结束后 - 中等注意力
                            </option>
                            -->             
                        </select>
                    </div>
                    <div class="field-group" style="display: flex; flex-direction: column; align-items: flex-start;">
                        <label style="margin-bottom: 8px;">${t(
            'entry-priority',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-priority'))">?</span></label>
                        <div style="display: flex; align-items: center; width: 100%;">
                            <input type="number" class="wb-priority" value="${defaultEntry.priority
        }" step="100" style="flex-grow: 1;" onchange="updateCollapsedInfo(this.closest('.worldbook-entry'))">
                            <div class="priority-buttons">
                                <button onclick="setPriority(this, 1000)" title="1000">${t(
            'priority-preset-prereq',
        )}</button>
                                <button onclick="setPriority(this, 200)" title="200">${t(
            'priority-preset-important',
        )}</button>
                                <button onclick="setPriority(this, 100)" title="100">${t(
            'priority-preset-normal',
        )}</button>
                            </div>
                        </div>
                    </div>
                    <!-- <div class="field-group"><label>${t(
            'entry-group',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-group'))">?</span></label><input type="text" class="wb-group" value="${defaultEntry.group
        }" placeholder="${t('entry-group-placeholder')}"></div> -->
                    <div class="field-group"><label>${t(
            'entry-probability',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-probability'))">?</span></label><input type="number" class="wb-probability" value="${defaultEntry.probability
        }" min="0" max="100"></div>
                    <div class="field-group depth-field" style="display: ${defaultEntry.position === 4 ? 'block' : 'none'
        };"><label>${t(
            'entry-depth',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-depth'))">?</span></label><input type="number" class="wb-depth" value="${defaultEntry.depth
        }" min="0" placeholder="深度越浅AI越注意，最小为0" onchange="updateCollapsedInfo(this.closest('.worldbook-entry'))"></div>
                    <div class="field-group"><label>${t('scan-depth')} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-scan-depth'))">?</span></label><input type="number" class="wb-scan-depth" value="${defaultEntry.scan_depth || ''
        }" min="0" placeholder="${t('scan-depth-placeholder')}"></div>
                    <!-- <div class="field-group"><label>组权重 <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp('用于组内排序的权重值')">?</span></label><input type="number" class="wb-group-weight" value="${defaultEntry.group_weight
        }" min="0" step="1"></div> -->
                    <div class="field-group logic-group full-width">
                        <label><input type="checkbox" class="wb-enabled" ${defaultEntry.enabled ? 'checked' : ''
        }>${t(
            'entry-enabled',
        )}</label>
                        <label><input type="checkbox" class="wb-constant" ${defaultEntry.constant ? 'checked' : ''
        } onchange="syncConstantCheckboxChange(this)">${t(
            'entry-constant',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-constant'))">?</span></label>
                        <label><input type="checkbox" class="wb-selective" ${defaultEntry.selective ? 'checked' : ''
        }>${t(
            'entry-selective',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-entry-selective'))">?</span></label>
                        <label><input type="checkbox" class="wb-prevent-recursion" ${defaultEntry.prevent_recursion ? 'checked' : ''
        }>${t(
            'prevent-recursion',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-prevent-recursion'))">?</span></label>
                        <label><input type="checkbox" class="wb-exclude-recursion" ${defaultEntry.exclude_recursion ? 'checked' : ''
        }>${t(
            'exclude-recursion',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-exclude-recursion'))">?</span></label>
                        <label><input type="checkbox" class="wb-use-regex" ${defaultEntry.use_regex ? 'checked' : ''
        }>${t(
            'use-regex',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-use-regex'))">?</span></label>
                        <label><input type="checkbox" class="wb-match-whole-words" ${defaultEntry.match_whole_words ? 'checked' : ''
        }>${t(
            'match-whole-words',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-match-whole-words'))">?</span></label>
                        <label><input type="checkbox" class="wb-case-sensitive" ${defaultEntry.case_sensitive ? 'checked' : ''
        }>${t(
            'case-sensitive',
        )} <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('help-case-sensitive'))">?</span></label>
                        
                        <label><input type="checkbox" class="wb-additional-sources" ${defaultEntry.match_persona_description ? 'checked' : ''
        } onchange="toggleAllAdditionalSources(this)">${t('additional-match-sources')}<span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp(t('additional-match-sources-help'))">?</span></label>
                        
                        <!-- 隐藏的实际控制字段 -->
                        <input type="hidden" class="wb-match-persona-description" value="${defaultEntry.match_persona_description}">
                        <input type="hidden" class="wb-match-character-description" value="${defaultEntry.match_character_description}">
                        <input type="hidden" class="wb-match-character-personality" value="${defaultEntry.match_character_personality}">
                        <input type="hidden" class="wb-match-character-depth-prompt" value="${defaultEntry.match_character_depth_prompt}">
                        <input type="hidden" class="wb-match-scenario" value="${defaultEntry.match_scenario}">
                        
                        <!-- <label><input type="checkbox" class="wb-group-override" ${defaultEntry.group_override ? 'checked' : ''
        }>组覆盖 <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp('当同一个组有多个条目被激活时，设置了组覆盖的条目会被优先选择，而不是随机选择。用于确保重要条目在组竞争中获得优先权。')">?</span></label> -->
                        <!-- <label><input type="checkbox" class="wb-use-group-scoring" ${defaultEntry.use_group_scoring ? 'checked' : ''
        }>使用组评分 <span class="help-icon" onclick="event.preventDefault(); event.stopPropagation(); showHelp('启用组评分机制，影响同组条目的选择算法。通常与组权重配合使用，实现更精细的组内条目控制。')">?</span></label> -->
                    </div>
                </div>
            </details>
        </div>
    </div>
</div>
<ul class="child-entries"></ul>
`;

    return entryLi;
}

function addChildEntry(button) {
    const worldbookData = buildWorldbookDataFromDOM();
    const parentEntryElement = button.closest('.worldbook-entry');
    let newChildId = null;

    function findAndAdd(data) {
        for (const entry of data) {
            if (entry.element === parentEntryElement) {
                newChildId = entry.children.length > 0 ? Math.max(...entry.children.map(e => e.id)) + 1 : 0;
                entry.children.push({ id: newChildId, comment: '新子条目', keys: [], content: '', children: [] });
                return true;
            }
            if (entry.children.length > 0) {
                if (findAndAdd(entry.children)) return true;
            }
        }
        return false;
    }

    findAndAdd(worldbookData);
    renderWorldbookFromData(worldbookData);

    // 展开新创建的子条目，但不展开父条目
    setTimeout(() => {
        const entries = document.querySelectorAll('.worldbook-entry');
        const newEntry = Array.from(entries).find(e => e.dataset.entryId == newChildId);
        if (newEntry) {
            expandWorldbookEntry(newEntry);
        }
    }, 100);
}

function indentEntry(button, direction) {
    const worldbookData = buildWorldbookDataFromDOM();
    const currentEntryElement = button.closest('.worldbook-entry');
    if (!currentEntryElement) return;

    const found = findEntryRecursive(worldbookData, currentEntryElement);

    if (!found) {
        console.error(
            currentLanguage === 'zh'
                ? '无法在数据结构中找到对应的条目。'
                : 'Unable to find corresponding entry in data structure.',
        );
        return;
    }

    const { entry, parentList, index, parentEntry } = found;

    if (direction > 0) {
        // Indent: 将条目设为上方同级条目的子条目
        if (index > 0) {
            const newParent = parentList[index - 1];
            parentList.splice(index, 1); // 从当前列表中移除
            newParent.children.push(entry); // 添加到新父级的 children 数组中
        } else {
            alert(t('cannot-join-first-entry'));
            return;
        }
    } else {
        // Un-indent: 将子条目移出，成为父条目的同级
        if (parentEntry) {
            const parentFound = findEntryRecursive(worldbookData, parentEntry.element);
            if (parentFound) {
                const grandParentList = parentFound.parentList;
                const parentIndex = parentFound.index;

                parentList.splice(index, 1); // 从当前父级的 children 数组中移除
                grandParentList.splice(parentIndex + 1, 0, entry); // 添加到祖父级列表，紧跟在原父级之后
            }
        } else {
            alert(t('already-root-entry'));
            return;
        }
    }

    renderWorldbookFromData(worldbookData);
}

function deleteWorldbookEntry(button) {
    const worldbookData = buildWorldbookDataFromDOM();
    const entryElement = button.closest('.worldbook-entry');
    if (!entryElement) return;

    const found = findEntryRecursive(worldbookData, entryElement);
    if (found) {
        found.parentList.splice(found.index, 1);
        renderWorldbookFromData(worldbookData);
    }
}

function updateAllEntryAttributes() {
    const container = document.getElementById('worldbook-entries-container');

    function traverse(element, depth, indexRef) {
        if (element.matches('li.worldbook-entry')) {
            element.dataset.depth = depth;
            element.dataset.displayIndex = indexRef.index++;
            const childContainer = element.querySelector('.child-entries');
            if (childContainer) {
                Array.from(childContainer.children).forEach(child => traverse(child, depth + 1, indexRef));
            }
        } else if (element.children) {
            Array.from(element.children).forEach(child => traverse(child, 0, indexRef));
        }
    }

    let indexCounter = { index: 0 };
    traverse(container, -1, indexCounter);
}

// --- PNG EMBEDDING FUNCTIONS ---
async function cleanImageAndGetDataURL(base64Str) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('无法加载图片，可能不是有效的图片格式。'));
        img.src = base64Str;
    });
}

// 新增：将任何格式的图片转换为PNG格式
async function convertImageToPng(imageDataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // 允许跨域图片

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // 绘制图片到canvas
                ctx.drawImage(img, 0, 0);

                // 转换为PNG格式
                const pngDataUrl = canvas.toDataURL('image/png', 0.9);
                resolve(pngDataUrl);
            } catch (error) {
                reject(new Error(`图片转换失败: ${error.message}`));
            }
        };

        img.onerror = () => {
            reject(new Error('无法加载图片，可能不是有效的图片格式。'));
        };

        img.src = imageDataUrl;
    });
}
async function embedDataInPng(imageBase64, textData) {
    const response = await fetch(imageBase64);
    const imageBuffer = await response.arrayBuffer();
    const imageData = new Uint8Array(imageBuffer);

    const textEncoder = new TextEncoder();
    const encodedText = textEncoder.encode('chara\x00' + textData);

    const chunk = createTextChunk('tEXt', encodedText);

    const iendPosition = findIend(imageData);
    if (iendPosition === -1) throw new Error('Invalid PNG: IEND chunk not found.');

    const newPngData = new Uint8Array(imageData.length + chunk.length);
    newPngData.set(imageData.slice(0, iendPosition));
    newPngData.set(chunk, iendPosition);
    newPngData.set(imageData.slice(iendPosition), iendPosition + chunk.length);

    return new Blob([newPngData], { type: 'image/png' });
}

function createTextChunk(type, data) {
    const chunkType = new TextEncoder().encode(type);
    const chunkData = data;
    const chunkLength = new Uint8Array(4);
    new DataView(chunkLength.buffer).setUint32(0, chunkData.length);

    const toCrc = new Uint8Array(chunkType.length + chunkData.length);
    toCrc.set(chunkType);
    toCrc.set(chunkData, chunkType.length);
    const crcValue = crc32(toCrc);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crcValue);

    const chunk = new Uint8Array(12 + chunkData.length);
    chunk.set(chunkLength);
    chunk.set(chunkType, 4);
    chunk.set(chunkData, 8);
    chunk.set(crc, 8 + chunkData.length);

    return chunk;
}

function findIend(imageData) {
    const IEND_SIGNATURE = [0x49, 0x45, 0x4e, 0x44];
    for (let i = imageData.length - 12; i >= 8; i--) {
        if (
            imageData[i + 4] === IEND_SIGNATURE[0] &&
            imageData[i + 5] === IEND_SIGNATURE[1] &&
            imageData[i + 6] === IEND_SIGNATURE[2] &&
            imageData[i + 7] === IEND_SIGNATURE[3]
        ) {
            return i;
        }
    }
    return -1;
}

const crc32 = (function () {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
    }
    return function (bytes) {
        let crc = -1;
        for (let i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
        }
        return (crc ^ -1) >>> 0;
    };
})();

async function extractDataFromPng(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const keyword = 'chara';

    let i = 8;
    while (i < bytes.length) {
        const view = new DataView(bytes.buffer, i);
        const length = view.getUint32(0);
        const type = new TextDecoder().decode(bytes.slice(i + 4, i + 8));

        if (type === 'tEXt' || type === 'iTXt') {
            const data_start = i + 8;
            let currentKeyword = '';
            let k_end = data_start;
            while (k_end < data_start + length && bytes[k_end] !== 0) {
                currentKeyword += String.fromCharCode(bytes[k_end]);
                k_end++;
            }

            if (currentKeyword === keyword) {
                const dataBytes = bytes.slice(k_end + 1, data_start + length);
                const base64String = new TextDecoder('utf-8').decode(dataBytes);
                const jsonString = decodeURIComponent(escape(atob(base64String)));
                return JSON.parse(jsonString);
            }
        }
        i += 12 + length;
    }
    throw new Error('在PNG中未找到角色数据。');
}

// 创建新角色函数，与顶部按钮功能相同
async function createNewCharacter() {
    await showEditorView();
}

// 显示教程弹窗
function showTutorialModal() {
    document.getElementById('tutorialModal').style.display = 'flex';
    // 延迟加载教程图片
    loadTutorialImages();
}

// 关闭教程弹窗
function closeTutorialModal() {
    document.getElementById('tutorialModal').style.display = 'none';
}

// 教程图片懒加载功能
function loadTutorialImages() {
    const tutorialModal = document.getElementById('tutorialModal');
    const lazyImages = tutorialModal.querySelectorAll('img[data-lazy-src]');
}

// ==================== AI 全局修改功能 ====================

// 全局修改历史记录
let globalEditHistory = [];
let currentHistoryIndex = -1;

// 修复JSON格式问题
function fixJsonFormat(jsonString) {
    let fixed = jsonString;

    // 修复未转义的换行符和制表符
    fixed = fixed.replace(/(?<!\\)\n/g, '\\n');
    fixed = fixed.replace(/(?<!\\)\r/g, '\\r');
    fixed = fixed.replace(/(?<!\\)\t/g, '\\t');

    // 修复未转义的引号（在字符串内部）
    // 这个正则表达式尝试匹配字符串值中的未转义引号
    fixed = fixed.replace(/"([^"\\]*)(?<!\\)"([^"\\]*?)(?<!\\)"([^"\\]*?)"/g, (match, p1, p2, p3) => {
        // 如果中间部分包含引号，转义它们
        const escapedMiddle = p2.replace(/"/g, '\\"');
        return `"${p1}${escapedMiddle}${p3}"`;
    });

    // 修复控制字符
    fixed = fixed.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    // 修复可能的尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // 修复可能的多余空白
    fixed = fixed.trim();

    return fixed;
}

// 打开全局修改模态框
function openGlobalEditModal(button) {
    const modal = document.getElementById('global-edit-modal');
    if (modal) {
        modal.style.display = 'flex';

        // 初始化界面
        initializeGlobalEditModal();
    }
}

// 关闭全局修改模态框
function closeGlobalEditModal() {
    const modal = document.getElementById('global-edit-modal');
    if (modal) modal.style.display = 'none';
}

// 初始化全局修改模态框
function initializeGlobalEditModal() {
    // 重置筛选区域
    const customFilterArea = document.getElementById('custom-filter-area');
    if (customFilterArea) customFilterArea.style.display = 'none';

    // 加载所有条目
    loadAllEntries();

    // 更新历史记录选择器
    updateHistorySelector();
}

// 刷新全局修改模态框（修改完成后刷新显示）
function refreshGlobalEditModal() {
    // 重新加载所有条目，显示最新状态
    loadAllEntries();

    // 更新历史记录选择器
    updateHistorySelector();

    // 提示用户可以继续操作
    const instructionInput = document.getElementById('global-instruction');
    if (instructionInput) {
        instructionInput.placeholder = '✅ 修改已完成！您可以继续输入新的修改指令...';
        // 3秒后恢复原始占位符
        setTimeout(() => {
            instructionInput.placeholder = '输入你的修改指令，支持使用 @id 引用特定条目，例如：把重复的条目删除 并将@1条目简化';
        }, 3000);
    }
}

// 加载所有条目
function loadAllEntries() {
    const worldbookEntries = buildWorldbookDataFromDOM();
    const characterData = buildCardObject();

    // 按优先级和类型分类条目
    categorizeEntries(worldbookEntries, characterData);
}

// 分类条目
function categorizeEntries(worldbookEntries, characterData) {
    // 清空所有容器
    document.getElementById('core-entries').innerHTML = '';
    document.getElementById('detailed-entries').innerHTML = '';
    document.getElementById('other-entries').innerHTML = '';
    document.getElementById('character-entries').innerHTML = '';

    // 按优先级排序世界书条目
    worldbookEntries.sort((a, b) => (b.priority || 100) - (a.priority || 100));

    // 分类世界书条目
    worldbookEntries.forEach(entry => {
        if (entry.constant) {
            addEntryToContainer('core-entries', entry, 'worldbook');
        } else if ((entry.priority || 100) > 100) {
            addEntryToContainer('detailed-entries', entry, 'worldbook');
        } else {
            addEntryToContainer('other-entries', entry, 'worldbook');
        }
    });

    // 添加角色信息条目
    const characterFields = [
        'name', 'description', 'personality', 'scenario',
        'first_mes', 'mes_example', 'system_prompt', 'post_history_instructions'
    ];

    characterFields.forEach(field => {
        if (characterData[field] && characterData[field].trim()) {
            addCharacterFieldToContainer('character-entries', field, characterData[field]);
        }
    });
}

// 添加条目到容器
function addEntryToContainer(containerId, entry, type) {
    const container = document.getElementById(containerId);
    const entryDiv = document.createElement('div');
    entryDiv.className = 'entry-item';
    entryDiv.dataset.entryId = entry.id;
    entryDiv.dataset.entryType = type;

    const keys = Array.isArray(entry.keys) ? entry.keys.join(', ') : entry.keys || '';
    const content = entry.content || '';
    const position = entry.position === 'after_char' ? t('position-after-char') : t('position-before-char');

    entryDiv.innerHTML = `
    <input type="checkbox" class="entry-checkbox" checked>
    <div class="entry-details">
    <div class="entry-title">
        <span class="entry-id">ID:${entry.id}</span>
        ${entry.comment || '无标题'}
    </div>
    <div class="entry-keys">${t('trigger-words', { keys: keys })}</div>
    <div class="entry-content-preview">${content}</div>
    <div class="entry-meta">
        <span>${t('priority-label', { priority: entry.priority || 100 })}</span>
        <span>${t('position-label', { position: position })}</span>
        <span>${t('constant-label', { value: entry.constant ? t('yes') : t('no') })}</span>
    </div>
    </div>
`;

    container.appendChild(entryDiv);
}

// 添加角色字段到容器
function addCharacterFieldToContainer(containerId, fieldName, fieldValue) {
    const container = document.getElementById(containerId);
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'character-field-item';
    fieldDiv.dataset.fieldName = fieldName;
    fieldDiv.dataset.fieldType = 'character';

    const fieldDisplayName = getFieldDisplayName(fieldName);
    const preview = fieldValue.length > 100 ? fieldValue.substring(0, 100) + '...' : fieldValue;

    fieldDiv.innerHTML = `
    <input type="checkbox" class="entry-checkbox" checked>
    <div class="field-name">${fieldDisplayName}</div>
    <div class="field-preview">${preview}</div>
`;

    container.appendChild(fieldDiv);
}

// 获取字段显示名称
function getFieldDisplayName(fieldName) {
    const fieldNames = {
        'name': '角色名',
        'description': '角色描述',
        'personality': '性格',
        'scenario': '场景',
        'first_mes': '第一条消息',
        'mes_example': '对话示例',
        'system_prompt': '系统提示',
        'post_history_instructions': '历史后指令'
    };
    return fieldNames[fieldName] || fieldName;
}

// 快速选择功能
function selectAllWorldbook() {
    const worldbookContainers = ['core-entries', 'detailed-entries', 'other-entries'];
    worldbookContainers.forEach(containerId => {
        const checkboxes = document.querySelectorAll(`#${containerId} .entry-checkbox`);
        checkboxes.forEach(cb => cb.checked = true);
    });

    // 取消选择角色卡
    const characterCheckboxes = document.querySelectorAll('#character-entries .entry-checkbox');
    characterCheckboxes.forEach(cb => cb.checked = false);
}

function selectAllCharacterCards() {
    const characterCheckboxes = document.querySelectorAll('#character-entries .entry-checkbox');
    characterCheckboxes.forEach(cb => cb.checked = true);

    // 取消选择世界书
    const worldbookContainers = ['core-entries', 'detailed-entries', 'other-entries'];
    worldbookContainers.forEach(containerId => {
        const checkboxes = document.querySelectorAll(`#${containerId} .entry-checkbox`);
        checkboxes.forEach(cb => cb.checked = false);
    });
}

function showCustomFilter() {
    const filterArea = document.getElementById('custom-filter-area');
    filterArea.style.display = filterArea.style.display === 'none' ? 'block' : 'none';
}

// 应用自定义筛选
function applyCustomFilter() {
    const priorityFilter = document.getElementById('priority-filter').value;
    const priorityValue = parseInt(document.getElementById('priority-value').value) || 0;
    const constantFilter = document.getElementById('constant-filter').value;
    const positionFilter = document.getElementById('position-filter').value;

    // 获取所有世界书条目
    const allEntries = document.querySelectorAll('.entry-item[data-entry-type="worldbook"]');

    allEntries.forEach(entryDiv => {
        const checkbox = entryDiv.querySelector('.entry-checkbox');
        const metaSpans = entryDiv.querySelectorAll('.entry-meta span');

        let priority = 100;
        let constant = false;
        let position = 'before_char';

        // 解析元数据
        metaSpans.forEach(span => {
            const text = span.textContent;
            if (text.includes('优先级:')) {
                priority = parseInt(text.split(':')[1].trim()) || 100;
            } else if (text.includes('恒定:')) {
                constant = text.includes('是');
            } else if (text.includes('位置:')) {
                position = text.includes('角色后') ? 'after_char' : 'before_char';
            }
        });

        // 应用筛选条件
        let shouldSelect = true;

        if (priorityFilter === 'above' && priority < priorityValue) shouldSelect = false;
        if (priorityFilter === 'below' && priority > priorityValue) shouldSelect = false;
        if (constantFilter === 'true' && !constant) shouldSelect = false;
        if (constantFilter === 'false' && constant) shouldSelect = false;
        if (positionFilter !== 'all' && position !== positionFilter) shouldSelect = false;

        checkbox.checked = shouldSelect;
        entryDiv.classList.toggle('disabled', !shouldSelect);
    });
}

// 执行全局修改
async function executeGlobalEdit() {
    const instruction = document.getElementById('global-instruction').value.trim();
    if (!instruction) {
        alert('请输入修改指令');
        return;
    }

    const button = document.getElementById('global-edit-execute-btn');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '🔮 执行中...';

    let result = null;
    try {
        // 收集选中的条目
        const selectedEntries = collectSelectedEntries();
        if (selectedEntries.length === 0) {
            alert('请至少选择一个条目进行修改');
            return;
        }

        // 保存当前状态到历史记录
        saveCurrentStateToHistory();

        // 处理@id引用
        const processedInstruction = processIdReferences(instruction, selectedEntries);

        // 构建AI提示
        const prompt = buildGlobalEditPrompt(processedInstruction, selectedEntries);

        // 调用AI
        result = await callApi(prompt, button);
        if (result) {
            const deletedCount = await applyGlobalEditResult(result, selectedEntries);

            // 刷新模态框内容，显示最新状态
            await refreshGlobalEditModal();

            // 简洁提示，不关闭模态框
            if (deletedCount > 0) {
                alert(`✅ 修改完成！已删除 ${deletedCount} 个空值条目。`);
            } else {
                alert('✅ 修改完成！');
            }

            // 清空指令输入框，准备下一轮修改
            document.getElementById('global-instruction').value = '';
        }
    } catch (error) {
        console.error('全局修改失败:', error);
        if (error.message && error.message.includes('length')) {
            alert('生成失败：内容字数过多，请减少选择的条目数量或简化修改指令。');
        } else {
            alert('全局修改失败：' + error.message);
            if (result) {
                console.error('AI返回的原始结果:', result);
            }
        }
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

// 收集选中的条目
function collectSelectedEntries() {
    const selectedEntries = [];

    // 收集世界书条目
    const worldbookContainers = ['core-entries', 'detailed-entries', 'other-entries'];
    worldbookContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        const checkedItems = container.querySelectorAll('.entry-item input:checked');

        checkedItems.forEach(checkbox => {
            const entryDiv = checkbox.closest('.entry-item');
            const entryId = parseInt(entryDiv.dataset.entryId);
            const worldbookEntries = buildWorldbookDataFromDOM();
            const entry = worldbookEntries.find(e => e.id === entryId);

            if (entry) {
                selectedEntries.push({
                    type: 'worldbook',
                    id: entryId,
                    data: entry
                });
            }
        });
    });

    // 收集角色字段
    const characterContainer = document.getElementById('character-entries');
    const checkedFields = characterContainer.querySelectorAll('.character-field-item input:checked');

    checkedFields.forEach(checkbox => {
        const fieldDiv = checkbox.closest('.character-field-item');
        const fieldName = fieldDiv.dataset.fieldName;
        const fieldValue = document.getElementById(fieldName)?.value || '';

        selectedEntries.push({
            type: 'character',
            field: fieldName,
            data: { name: fieldName, content: fieldValue }
        });
    });

    return selectedEntries;
}

// 处理@id引用
function processIdReferences(instruction, selectedEntries) {
    let processedInstruction = instruction;

    // 查找所有@id引用
    const idReferences = instruction.match(/@(\d+)/g);
    if (idReferences) {
        idReferences.forEach(ref => {
            const id = parseInt(ref.substring(1));
            const entry = selectedEntries.find(e => e.type === 'worldbook' && e.id === id);

            if (entry) {
                const entryInfo = `[ID:${id} ${entry.data.comment || '无标题'}]`;
                processedInstruction = processedInstruction.replace(ref, entryInfo);
            }
        });
    }

    return processedInstruction;
}

// 构建全局修改提示
function buildGlobalEditPrompt(instruction, selectedEntries) {
    let prompt = getLanguagePrefix() + `请根据用户的指令修改以下内容。

用户指令：${instruction}

需要修改的内容：

重要提示：
- 如果用户要求删除、移除、去除某个条目或内容，请将该条目的content设置为空字符串""或null
- 如果用户要求删除重复内容，请将重复的条目content设为空字符串
- 如果某些条目不需要保留，将其content设为空值即可
- 系统会自动过滤并删除所有content为空的条目
- [世界书条目]下非无，则同类型参考[世界书条目]下的格式生成

`;

    selectedEntries.forEach((entry, index) => {
        if (entry.type === 'worldbook') {
            prompt += `${index + 1}. [世界书条目 ID:${entry.id}]
标题：${entry.data.comment || '无标题'}
触发词：${Array.isArray(entry.data.keys) ? entry.data.keys.join(', ') : entry.data.keys || ''}
内容：${entry.data.content || ''}

`;
        } else if (entry.type === 'character') {
            prompt += `${index + 1}. [角色字段：${getFieldDisplayName(entry.field)}]
内容：${entry.data.content}

`;
        }
    });

    prompt += `请按照用户指令修改上述内容，并以JSON格式返回修改结果。格式如下：
{
"modifications": [
{
"index": 1,
"type": "worldbook", // 或 "character"
"id": 条目ID (仅世界书条目需要),
"field": "字段名" (仅角色字段需要),
"comment": "修改后的标题" (仅世界书条目),
"keys": ["修改后的触发词数组"] (仅世界书条目),
"content": "修改后的内容" // 如需删除此条目，设为""或null
}
]
}

注意：如果需要删除某个条目，请将其content设为空字符串""或null，系统会自动删除。`;

    return prompt;
}

// 手动提取JSON结构的函数
function extractJsonManually(text) {
    try {
        // 查找包含modifications的JSON结构
        const lines = text.split('\n');
        let jsonStart = -1;
        let jsonEnd = -1;
        let braceCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 查找JSON开始标记
            if (jsonStart === -1 && (line.includes('"modifications"') || line.startsWith('{'))) {
                // 向前查找真正的开始位置
                for (let j = i; j >= 0; j--) {
                    if (lines[j].trim().startsWith('{')) {
                        jsonStart = j;
                        break;
                    }
                }
                if (jsonStart === -1) jsonStart = i;
            }

            // 如果已经找到开始位置，计算大括号
            if (jsonStart !== -1) {
                for (let char of line) {
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;
                    if (braceCount === 0 && jsonStart !== -1) {
                        jsonEnd = i;
                        break;
                    }
                }
                if (jsonEnd !== -1) break;
            }
        }

        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonText = lines.slice(jsonStart, jsonEnd + 1).join('\n');
            mylog('手动提取的JSON文本:', jsonText);
            return jsonText;
        }

        return null;
    } catch (error) {
        console.error('手动提取JSON失败:', error);
        return null;
    }
}

// 应用全局修改结果
async function applyGlobalEditResult(result, originalEntries) {
    try {
        mylog('原始AI返回结果:', result);

        // 多层次清理AI返回的结果
        let cleanedResult = result;

        // 1. 首先尝试提取JSON代码块
        const jsonBlockMatch = cleanedResult.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            cleanedResult = jsonBlockMatch[1].trim();
            mylog('从代码块提取的JSON:', cleanedResult);
        } else {
            // 2. 如果没有代码块，尝试查找JSON对象模式
            const jsonObjectMatch = cleanedResult.match(/\{[\s\S]*\}/);
            if (jsonObjectMatch) {
                cleanedResult = jsonObjectMatch[0].trim();
                mylog('提取的JSON对象:', cleanedResult);
            } else {
                // 3. 尝试查找以"modifications"开头的JSON
                const modificationsMatch = cleanedResult.match(/\{\s*"modifications"\s*:\s*\[[\s\S]*?\]\s*\}/);
                if (modificationsMatch) {
                    cleanedResult = modificationsMatch[0].trim();
                    mylog('提取的modifications JSON:', cleanedResult);
                }
            }
        }

        // 移除可能的前后缀
        cleanedResult = cleanedResult.replace(/^```json\s*|```$/g, '').trim();

        // 处理本地模型返回的完整API响应格式
        let data;
        try {
            data = JSON.parse(cleanedResult);
        } catch (e) {
            mylog('直接解析失败，尝试提取嵌套JSON...', e.message);
            try {
                // 如果是完整的API响应，提取content字段
                const apiResponse = JSON.parse(cleanedResult);
                if (apiResponse.choices && apiResponse.choices[0] && apiResponse.choices[0].message) {
                    const content = apiResponse.choices[0].message.content;
                    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                    if (jsonMatch) {
                        let jsonContent = jsonMatch[1];
                        // 修复常见的JSON格式问题
                        jsonContent = fixJsonFormat(jsonContent);
                        data = JSON.parse(jsonContent);
                    } else {
                        // 尝试直接解析content，并修复格式问题
                        let fixedContent = fixJsonFormat(content);
                        data = JSON.parse(fixedContent);
                    }
                } else {
                    throw e;
                }
            } catch (e2) {
                console.error('嵌套JSON解析也失败:', e2.message);
                // 尝试修复原始结果的JSON格式问题
                try {
                    let fixedResult = fixJsonFormat(cleanedResult);
                    data = JSON.parse(fixedResult);
                } catch (e3) {
                    console.error('JSON修复失败:', e3.message);
                    console.error('清理后的数据:', cleanedResult);

                    // 最后的尝试：手动提取JSON结构
                    try {
                        const manualExtract = extractJsonManually(result);
                        if (manualExtract) {
                            data = JSON.parse(manualExtract);
                            mylog('手动提取成功:', data);
                        } else {
                            throw new Error('无法从AI返回结果中提取有效的JSON数据');
                        }
                    } catch (e4) {
                        throw new Error(`JSON解析失败: ${e.message}。AI返回的内容可能包含解释文字，请尝试重新生成。`);
                    }
                }
            }
        }

        if (!data.modifications || !Array.isArray(data.modifications)) {
            throw new Error('AI返回的数据格式不正确');
        }

        // 应用修改（自动过滤空值）
        // 一次性获取世界书数据，避免重复读取DOM
        const worldbookEntries = buildWorldbookDataFromDOM();
        const entriesToDelete = new Set(); // 使用Set记录需要删除的条目ID
        let worldbookModified = false;

        data.modifications.forEach(mod => {
            const originalEntry = originalEntries[mod.index - 1];
            if (!originalEntry) return;

            // 检查是否为空值（需要删除）
            const isEmpty = mod.content === '' ||
                mod.content === null ||
                mod.content === undefined ||
                mod.content === 'null' ||
                mod.content === 'undefined' ||
                (typeof mod.content === 'string' && mod.content.trim() === '');

            if (originalEntry.type === 'worldbook') {
                // 修改世界书条目
                const entry = worldbookEntries.find(e => e.id === originalEntry.id);
                if (entry) {
                    if (isEmpty) {
                        // 标记为需要删除
                        entriesToDelete.add(originalEntry.id);
                        mylog(`标记删除世界书条目 ID:${originalEntry.id}`);
                        worldbookModified = true;
                    } else {
                        // 正常修改
                        if (mod.comment !== undefined) {
                            entry.comment = mod.comment;
                            worldbookModified = true;
                        }
                        if (mod.keys !== undefined) {
                            entry.keys = mod.keys;
                            worldbookModified = true;
                        }
                        if (mod.content !== undefined) {
                            entry.content = mod.content;
                            worldbookModified = true;
                        }
                    }
                }
            } else if (originalEntry.type === 'character') {
                // 修改角色字段
                const fieldElement = document.getElementById(originalEntry.field);
                if (fieldElement && mod.content !== undefined) {
                    if (isEmpty) {
                        // 角色字段设为空
                        fieldElement.value = '';
                        mylog(`清空角色字段: ${originalEntry.field}`);
                    } else {
                        fieldElement.value = mod.content;
                    }
                }
            }
        });

        // 如果世界书有修改，应用修改
        if (worldbookModified) {
            // 过滤掉需要删除的条目
            const filteredEntries = worldbookEntries.filter(e => !entriesToDelete.has(e.id));

            // 重新渲染世界书
            renderWorldbookFromData(filteredEntries);

            if (entriesToDelete.size > 0) {
                mylog(`已删除 ${entriesToDelete.size} 个空值条目`);
                return entriesToDelete.size; // 返回删除的条目数量
            }
        }

        return 0; // 没有删除条目

    } catch (error) {
        console.error('应用修改结果失败:', error);
        throw new Error('解析AI返回结果失败：' + error.message);
    }
}

// 保存当前状态到历史记录
function saveCurrentStateToHistory() {
    const maxHistory = parseInt(document.getElementById('history-count').value) || 5;

    const currentState = {
        timestamp: new Date().toLocaleString(),
        worldbook: JSON.parse(JSON.stringify(buildWorldbookDataFromDOM())),
        character: JSON.parse(JSON.stringify(buildCardObject()))
    };

    globalEditHistory.unshift(currentState);

    // 限制历史记录数量
    if (globalEditHistory.length > maxHistory) {
        globalEditHistory = globalEditHistory.slice(0, maxHistory);
    }

    currentHistoryIndex = 0;
    updateHistorySelector();
}

// 更新历史记录选择器
function updateHistorySelector() {
    const selector = document.getElementById('history-select');
    selector.innerHTML = '<option value="">选择历史版本...</option>';

    globalEditHistory.forEach((state, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${index + 1}. ${state.timestamp}`;
        selector.appendChild(option);
    });
}

// 加载历史版本
function loadHistoryVersion() {
    const selector = document.getElementById('history-select');
    const selectedIndex = parseInt(selector.value);

    if (isNaN(selectedIndex) || !globalEditHistory[selectedIndex]) {
        alert('请选择一个有效的历史版本');
        return;
    }

    const historyState = globalEditHistory[selectedIndex];

    // 创建当前状态的副本并添加到历史记录
    saveCurrentStateToHistory();

    // 恢复历史状态
    renderWorldbookFromData(historyState.worldbook);

    // 恢复角色字段
    Object.keys(historyState.character).forEach(field => {
        const element = document.getElementById(field);
        if (element && historyState.character[field]) {
            element.value = historyState.character[field];
        }
    });

    alert(`已回溯到：${historyState.timestamp}`);

    // 重新加载条目显示
    loadAllEntries();
}

// 切换区域选择
function toggleSectionSelection(containerId, checked) {
    const container = document.getElementById(containerId);
    const checkboxes = container.querySelectorAll('.entry-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checked;
        const entryItem = cb.closest('.entry-item, .character-field-item');
        if (entryItem) {
            entryItem.classList.toggle('disabled', !checked);
        }
    });
}

// 修复教程图片懒加载功能
function loadTutorialImages() {
    const tutorialModal = document.getElementById('tutorialModal');
    if (!tutorialModal) return;

    const lazyImages = tutorialModal.querySelectorAll('img[data-lazy-src]');
    lazyImages.forEach(img => {
        if (img.dataset.lazySrc && !img.src) {
            img.src = img.dataset.lazySrc;
            // 添加加载动画
            img.style.opacity = '0';
            img.onload = function () {
                img.style.transition = 'opacity 0.3s';
                img.style.opacity = '1';
            };
        }
    });
}

// 切换恒定注入模式
function toggleConstantMode(button) {
    const entryElement = button.closest('.worldbook-entry');
    const constantCheckbox = entryElement.querySelector('.wb-constant');
    const isConstant = button.dataset.constant === 'true';

    // 切换状态
    const newConstant = !isConstant;
    button.dataset.constant = newConstant;
    constantCheckbox.checked = newConstant;

    // 更新所有相关按钮显示（包括普通按钮和迷你按钮）
    const allButtons = entryElement.querySelectorAll('.constant-toggle-btn, .constant-toggle-btn-mini');
    allButtons.forEach(btn => {
        btn.dataset.constant = newConstant;
        updateConstantToggleButton(btn, newConstant);
    });
}

// 更新恒定注入切换按钮显示
function updateConstantToggleButton(button, isConstant) {
    const isMini = button.classList.contains('constant-toggle-btn-mini');

    if (isConstant) {
        button.style.backgroundColor = '#ff7849';
        button.style.color = 'white';
        button.textContent = isMini ? '永久' : t('constant-mode-permanent');
        button.title = t('constant-mode-permanent');
    } else {
        button.style.backgroundColor = '#6c757d';
        button.style.color = 'white';
        button.textContent = isMini ? '关键词' : t('constant-mode-keyword');
        button.title = t('constant-mode-keyword');
    }
}

// 同步恒定注入选项变化到切换按钮
function syncConstantCheckboxChange(checkbox) {
    const entryElement = checkbox.closest('.worldbook-entry');
    const toggleButtons = entryElement.querySelectorAll('.constant-toggle-btn, .constant-toggle-btn-mini');
    if (toggleButtons.length > 0) {
        const isConstant = checkbox.checked;
        toggleButtons.forEach(btn => {
            btn.dataset.constant = isConstant;
            updateConstantToggleButton(btn, isConstant);
        });
    }
}

// 复制安装链接
function copyInstallLink() {
    const link = 'https://github.com/N0VI028/JS-Slash-Runner';
    navigator.clipboard.writeText(link).then(() => {
        const button = document.getElementById('copyButton');
        const originalText = button.innerHTML;
        button.innerHTML = '✅ 已复制';
        button.style.background = '#28a745';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.background = '#007bff';
        }, 2000);
    }).catch(() => {
        alert('复制失败，请手动复制链接：' + link);
    });
}

// 简化：一键控制所有额外匹配源
function toggleAllAdditionalSources(checkbox) {
    const entryElement = checkbox.closest('.worldbook-entry');
    const isChecked = checkbox.checked;

    // 更新所有隐藏字段
    const hiddenFields = [
        'wb-match-persona-description',
        'wb-match-character-description',
        'wb-match-character-personality',
        'wb-match-character-depth-prompt',
        'wb-match-scenario'
    ];

    hiddenFields.forEach(fieldClass => {
        const field = entryElement.querySelector('.' + fieldClass);
        if (field) {
            field.value = isChecked;
        }
    });
}

// 初始化滑动手势功能
function initializeSwipeGestures() {
    // 滑动功能已移除
}

// 为世界书条目添加滑动操作按钮
function addSwipeActionsToEntries() {
    // 滑动功能已移除
}

// 展开条目详情
function expandEntry(button) {
    const entry = button.closest('.worldbook-entry');
    if (!entry) return;

    const details = entry.querySelector('details');
    if (details) {
        details.open = !details.open;
    }
}

// 复制条目
function duplicateEntry(button) {
    const entry = button.closest('.worldbook-entry');
    if (!entry) return;

    // 解析当前条目数据
    const entryData = parseEntryFromElement(entry);

    // 创建新的条目数据（修改ID和注释）
    const newEntryData = {
        ...entryData,
        id: (parseInt(entryData.id) || 0) + 1,
        comment: entryData.comment + ' (副本)'
    };

    // 创建新条目
    const newEntry = createWorldbookEntryElement(newEntryData);

    // 插入到当前条目后面
    entry.parentNode.insertBefore(newEntry, entry.nextSibling);
}

// 初始化搜索面板功能
function initializeSearchPanel() {
    const searchBtn = document.getElementById('search-float-btn');
    const searchPanel = document.getElementById('search-panel');
    const closeBtn = document.getElementById('close-search-btn');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const sortBtns = document.querySelectorAll('.sort-btn');

    if (!searchBtn || !searchPanel) return;

    let currentSort = 'name';

    // 关闭搜索面板
    function closeSearchPanel() {
        searchPanel.classList.remove('open');
    }

    // 切换搜索面板（支持开关）
    searchBtn.addEventListener('click', () => {
        if (searchPanel.classList.contains('open')) {
            closeSearchPanel();
        } else {
            searchPanel.classList.add('open');
            searchInput.focus();
            refreshSearchResults();
        }
    });

    closeBtn.addEventListener('click', closeSearchPanel);

    // 点击面板外关闭
    searchPanel.addEventListener('click', (e) => {
        if (e.target === searchPanel) {
            closeSearchPanel();
        }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchPanel.classList.contains('open')) {
            closeSearchPanel();
        }
    });

    // 搜索输入监听（添加节流）
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
        // 清除之前的定时器
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // 300ms 后执行搜索
        searchTimeout = setTimeout(() => {
            refreshSearchResults();
        }, 300);
    });

    // 排序按钮监听
    sortBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 更新按钮状态
            sortBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentSort = btn.dataset.sort;
            refreshSearchResults();
        });
    });

    // 全选功能
    const selectAllCheckbox = document.getElementById('select-all-entries');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.entry-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateSelectedCount();
        });
    }

    // 批量修改按钮
    const batchModifyBtn = document.getElementById('batch-modify-btn');
    if (batchModifyBtn) {
        batchModifyBtn.addEventListener('click', () => {
            openBatchModifyModal();
        });
    }

    // 更新已选数量
    function updateSelectedCount() {
        const checkboxes = document.querySelectorAll('.entry-checkbox:checked');
        const count = checkboxes.length;
        const countSpan = document.getElementById('selected-count');
        const batchBtn = document.getElementById('batch-modify-btn');

        if (countSpan) {
            countSpan.textContent = t('selected-count').replace('{count}', count);
        }

        if (batchBtn) {
            batchBtn.style.display = count > 0 ? 'block' : 'none';
        }

        // 更新全选复选框状态
        const allCheckboxes = document.querySelectorAll('.entry-checkbox');
        if (selectAllCheckbox && allCheckboxes.length > 0) {
            selectAllCheckbox.checked = count === allCheckboxes.length;
            selectAllCheckbox.indeterminate = count > 0 && count < allCheckboxes.length;
        }
    }

    // 使updateSelectedCount全局可用
    window.updateSelectedCount = updateSelectedCount;

    // 刷新搜索结果
    function refreshSearchResults() {
        const keyword = searchInput.value.toLowerCase().trim();
        const entries = getAllWorldbookEntries();

        // 过滤条目
        let filteredEntries = entries.filter(entry => {
            return entry.comment.toLowerCase().includes(keyword) ||
                entry.content.toLowerCase().includes(keyword) ||
                entry.keys.some(key => key.toLowerCase().includes(keyword));
        });

        // 排序
        filteredEntries.sort((a, b) => {
            switch (currentSort) {
                case 'id':
                    return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
                case 'priority':
                    return (parseInt(b.priority) || 0) - (parseInt(a.priority) || 0);
                case 'name':
                default:
                    return a.comment.localeCompare(b.comment, 'zh-CN');
            }
        });

        // 渲染结果，传递搜索关键词
        renderSearchResults(filteredEntries, keyword);
    }

    // 渲染搜索结果
    function renderSearchResults(entries, keyword = '') {
        if (entries.length === 0) {
            searchResults.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">没有找到匹配的条目</div>';
            updateSelectedCount();
            return;
        }

        const html = entries.map(entry => {
            // 生成预览内容：如果有关键词，显示匹配的上下文；否则显示开头
            let preview = '';
            if (keyword && keyword.trim()) {
                preview = getMatchPreview(entry, keyword);
            } else {
                // 没有关键词时，显示内容开头
                preview = entry.content.substring(0, 80) + (entry.content.length > 80 ? '...' : '');
            }

            return `
        <div class="search-result-item" data-entry-id="${entry.uniqueId}" data-keyword="${escapeHtml(keyword)}" style="display: flex; gap: 10px; align-items: flex-start;">
        <input type="checkbox" class="entry-checkbox" data-entry-id="${entry.uniqueId}" onclick="event.stopPropagation(); updateSelectedCount();" style="margin-top: 5px; cursor: pointer; flex-shrink: 0;">
        <div style="flex: 1; min-width: 0; cursor: pointer;" onclick="jumpToEntryWithKeyword(this)">
            <div class="search-result-title" style="word-wrap: break-word; overflow-wrap: break-word;">${entry.comment || '未命名条目'}</div>
            <div class="search-result-meta" style="display: flex; justify-content: space-between; gap: 10px;">
            <span style="flex-shrink: 0;">ID: ${entry.id}</span>
            <span style="flex-shrink: 0;">${t('priority-label', { priority: entry.priority })}</span>
            </div>
            <div class="search-result-preview" style="word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${preview}</div>
        </div>
        </div>
    `;
        }).join('');

        searchResults.innerHTML = html;
        updateSelectedCount();

        // 重新初始化框选功能
        initializeBoxSelection();
    }

    // 获取匹配的预览内容（显示关键词上下文）
    function getMatchPreview(entry, keyword) {
        const keywordLower = keyword.toLowerCase();

        // 按优先级搜索：标题 > 关键词 > 内容
        // 1. 检查标题
        if (entry.comment.toLowerCase().includes(keywordLower)) {
            const index = entry.comment.toLowerCase().indexOf(keywordLower);
            return highlightText(entry.comment, keyword, index);
        }

        // 2. 检查关键词
        const matchedKey = entry.keys.find(key => key.toLowerCase().includes(keywordLower));
        if (matchedKey) {
            return `关键词: ${highlightText(matchedKey, keyword, matchedKey.toLowerCase().indexOf(keywordLower))}`;
        }

        // 3. 检查内容
        const contentLower = entry.content.toLowerCase();
        const index = contentLower.indexOf(keywordLower);
        if (index !== -1) {
            // 获取匹配位置前后的上下文
            const contextLength = 40; // 前后各40个字符
            const start = Math.max(0, index - contextLength);
            const end = Math.min(entry.content.length, index + keyword.length + contextLength);

            let preview = entry.content.substring(start, end);

            // 添加省略号
            if (start > 0) preview = '...' + preview;
            if (end < entry.content.length) preview = preview + '...';

            // 高亮关键词
            const relativeIndex = index - start + (start > 0 ? 3 : 0); // 考虑省略号的偏移
            return highlightText(preview, keyword, relativeIndex);
        }

        // 如果都没找到（理论上不会发生），返回内容开头
        return entry.content.substring(0, 80) + (entry.content.length > 80 ? '...' : '');
    }

    // 高亮文本中的关键词
    function highlightText(text, keyword, startIndex) {
        if (startIndex === -1) return escapeHtml(text);

        const before = text.substring(0, startIndex);
        const match = text.substring(startIndex, startIndex + keyword.length);
        const after = text.substring(startIndex + keyword.length);

        return escapeHtml(before) +
            '<span style="background-color: rgba(255, 235, 59, 0.6); font-weight: bold; padding: 0 2px; border-radius: 2px;">' +
            escapeHtml(match) +
            '</span>' +
            escapeHtml(after);
    }

    // 鼠标框选功能
    function initializeBoxSelection() {
        let isSelecting = false;
        let startX = 0;
        let startY = 0;
        let selectionBox = null;
        let autoScrollInterval = null;

        // 创建选择框元素
        function createSelectionBox() {
            const box = document.createElement('div');
            box.style.position = 'absolute';
            box.style.border = '2px dashed #4a90e2';
            box.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
            box.style.pointerEvents = 'none';
            box.style.zIndex = '9999';
            return box;
        }

        // 自动滚动函数
        function autoScroll(mouseY, rect) {
            const scrollSpeed = 5;
            const scrollThreshold = 50; // 距离边缘多少像素开始滚动

            // 清除之前的滚动定时器
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }

            const distanceFromTop = mouseY - rect.top;
            const distanceFromBottom = rect.bottom - mouseY;

            // 如果鼠标靠近顶部
            if (distanceFromTop < scrollThreshold && distanceFromTop > 0) {
                autoScrollInterval = setInterval(() => {
                    if (searchResults.scrollTop > 0) {
                        searchResults.scrollTop -= scrollSpeed;
                    }
                }, 16); // 约60fps
            }
            // 如果鼠标靠近底部
            else if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0) {
                autoScrollInterval = setInterval(() => {
                    const maxScroll = searchResults.scrollHeight - searchResults.clientHeight;
                    if (searchResults.scrollTop < maxScroll) {
                        searchResults.scrollTop += scrollSpeed;
                    }
                }, 16);
            }
        }

        // 停止自动滚动
        function stopAutoScroll() {
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }
        }

        searchResults.addEventListener('mousedown', (e) => {
            // 如果点击的是复选框或链接区域，不触发框选
            if (e.target.classList.contains('entry-checkbox') ||
                e.target.closest('.search-result-title') ||
                e.target.closest('.search-result-preview')) {
                return;
            }

            isSelecting = true;
            const rect = searchResults.getBoundingClientRect();
            startX = e.clientX - rect.left + searchResults.scrollLeft;
            startY = e.clientY - rect.top + searchResults.scrollTop;

            selectionBox = createSelectionBox();
            selectionBox.style.left = startX + 'px';
            selectionBox.style.top = startY + 'px';
            searchResults.appendChild(selectionBox);

            e.preventDefault();
        });

        searchResults.addEventListener('mousemove', (e) => {
            if (!isSelecting || !selectionBox) return;

            const rect = searchResults.getBoundingClientRect();

            // 自动滚动检测
            autoScroll(e.clientY, rect);

            const currentX = e.clientX - rect.left + searchResults.scrollLeft;
            const currentY = e.clientY - rect.top + searchResults.scrollTop;

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';

            // 检测与条目的碰撞
            const boxRect = {
                left: left,
                top: top,
                right: left + width,
                bottom: top + height
            };

            const items = searchResults.querySelectorAll('.search-result-item');
            items.forEach(item => {
                const itemRect = item.getBoundingClientRect();
                const scrollTop = searchResults.scrollTop;
                const scrollLeft = searchResults.scrollLeft;
                const containerRect = searchResults.getBoundingClientRect();

                const itemBox = {
                    left: itemRect.left - containerRect.left + scrollLeft,
                    top: itemRect.top - containerRect.top + scrollTop,
                    right: itemRect.right - containerRect.left + scrollLeft,
                    bottom: itemRect.bottom - containerRect.top + scrollTop
                };

                // 检测矩形碰撞
                const isIntersecting = !(
                    boxRect.right < itemBox.left ||
                    boxRect.left > itemBox.right ||
                    boxRect.bottom < itemBox.top ||
                    boxRect.top > itemBox.bottom
                );

                const checkbox = item.querySelector('.entry-checkbox');
                if (checkbox && isIntersecting) {
                    checkbox.checked = true;
                }
            });

            updateSelectedCount();
        });

        document.addEventListener('mouseup', () => {
            if (isSelecting) {
                isSelecting = false;
                stopAutoScroll();
                if (selectionBox && selectionBox.parentNode) {
                    selectionBox.parentNode.removeChild(selectionBox);
                }
                selectionBox = null;
            }
        });
    }

    // 初始化框选功能
    initializeBoxSelection();
}

// 获取所有世界书条目数据
function getAllWorldbookEntries() {
    const entries = [];
    const entryElements = document.querySelectorAll('.worldbook-entry');

    entryElements.forEach(element => {
        const entryData = parseEntryFromElement(element);
        entryData.uniqueId = element.dataset.uniqueId;
        entries.push(entryData);
    });

    return entries;
}

// 跳转到指定条目（从搜索结果调用）
function jumpToEntryWithKeyword(element) {
    const resultItem = element.closest('.search-result-item');
    if (!resultItem) return;

    const uniqueId = resultItem.dataset.entryId;
    const keyword = resultItem.dataset.keyword || '';

    jumpToEntry(uniqueId, keyword);
}

// 跳转到指定条目
function jumpToEntry(uniqueId, keyword = '') {
    const entry = document.querySelector(`[data-unique-id="${uniqueId}"]`);
    if (!entry) return;

    // 关闭搜索面板
    document.getElementById('search-panel').classList.remove('open');

    // 展开条目（如果是折叠状态）
    const entryGrid = entry.querySelector('.entry-grid');
    const toggleBtn = entry.querySelector('.wb-fold-toggle');
    if (entryGrid && entryGrid.style.display === 'none' && toggleBtn) {
        // 展开条目
        expandWorldbookEntry(entry);
    }

    // 滚动到条目位置
    entry.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });

    // 高亮条目背景
    entry.style.backgroundColor = 'rgba(74, 144, 226, 0.3)';
    entry.style.transition = 'background-color 0.3s ease';

    setTimeout(() => {
        entry.style.backgroundColor = '';
    }, 2000);

    // 如果有搜索关键词，高亮显示
    if (keyword && keyword.trim()) {
        highlightKeywordInEntry(entry, keyword);
    }
}

// 在条目中高亮搜索关键词
function highlightKeywordInEntry(entry, keyword) {
    // 清除之前的高亮
    clearHighlightsInEntry(entry);

    const keywordLower = keyword.toLowerCase();
    const fieldsToSearch = [
        { selector: '.entry-comment', type: 'input', name: '标题' },
        { selector: '.wb-keys', type: 'input', name: '关键词' },
        { selector: '.wb-content', type: 'textarea', name: '内容' }
    ];

    let firstHighlight = null;
    let matchedField = null;

    fieldsToSearch.forEach(field => {
        const element = entry.querySelector(field.selector);
        if (!element) return;

        const text = element.value;
        const textLower = text.toLowerCase();
        const index = textLower.indexOf(keywordLower);

        if (index !== -1) {
            // 记录第一个高亮元素
            if (!firstHighlight) {
                firstHighlight = element;
                matchedField = field.name;
            }

            // 设置选中范围（只保留文本选中效果）
            setTimeout(() => {
                element.focus();
                element.setSelectionRange(index, index + keyword.length);

                // 如果是textarea，滚动到选中位置
                if (field.type === 'textarea') {
                    const lineHeight = parseInt(window.getComputedStyle(element).lineHeight) || 20;
                    const lines = text.substring(0, index).split('\n').length;
                    element.scrollTop = Math.max(0, (lines - 3) * lineHeight);
                }
            }, 300);
        }
    });

    // 如果找到匹配，滚动到第一个匹配位置
    if (firstHighlight) {
        mylog(`找到匹配: ${matchedField} - "${keyword}"`);
        setTimeout(() => {
            firstHighlight.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, 400);
    }
}

// 清除条目中的高亮
function clearHighlightsInEntry(entry) {
    // 不需要清除任何样式，因为只使用文本选中
}

// 打开批量修改模态框
function openBatchModifyModal() {
    const selectedCheckboxes = document.querySelectorAll('#search-results .entry-checkbox:checked');
    const count = selectedCheckboxes.length;

    if (count === 0) {
        alert(t('select-entries-first'));
        return;
    }

    const modal = document.getElementById('batch-modify-modal');
    const batchSelectedInfo = document.getElementById('batch-selected-info');

    if (batchSelectedInfo) {
        batchSelectedInfo.innerHTML = t('batch-selected-info').replace('{count}', `<span id="batch-selected-count">${count}</span>`);
    }

    // 重置选项
    document.getElementById('batch-modify-type').value = '';
    document.getElementById('batch-enabled-options').style.display = 'none';
    document.getElementById('batch-constant-options').style.display = 'none';
    document.getElementById('batch-recursion-options').style.display = 'none';
    document.getElementById('batch-exclude-recursion-options').style.display = 'none';
    document.getElementById('batch-selective-options').style.display = 'none';
    document.getElementById('batch-regex-options').style.display = 'none';
    document.getElementById('batch-wholewords-options').style.display = 'none';
    document.getElementById('batch-casesensitive-options').style.display = 'none';
    document.getElementById('batch-position-options').style.display = 'none';
    document.getElementById('batch-priority-options').style.display = 'none';

    modal.style.display = 'flex';

    // 监听修改类型变化
    const typeSelect = document.getElementById('batch-modify-type');
    typeSelect.onchange = function () {
        // 隐藏所有二级选项
        document.getElementById('batch-enabled-options').style.display = 'none';
        document.getElementById('batch-constant-options').style.display = 'none';
        document.getElementById('batch-recursion-options').style.display = 'none';
        document.getElementById('batch-exclude-recursion-options').style.display = 'none';
        document.getElementById('batch-selective-options').style.display = 'none';
        document.getElementById('batch-regex-options').style.display = 'none';
        document.getElementById('batch-wholewords-options').style.display = 'none';
        document.getElementById('batch-casesensitive-options').style.display = 'none';
        document.getElementById('batch-position-options').style.display = 'none';
        document.getElementById('batch-priority-options').style.display = 'none';

        // 根据选择显示对应的二级选项
        switch (this.value) {
            case 'enabled':
                document.getElementById('batch-enabled-options').style.display = 'block';
                break;
            case 'constant':
                document.getElementById('batch-constant-options').style.display = 'block';
                break;
            case 'prevent_recursion':
                document.getElementById('batch-recursion-options').style.display = 'block';
                break;
            case 'exclude_recursion':
                document.getElementById('batch-exclude-recursion-options').style.display = 'block';
                break;
            case 'selective':
                document.getElementById('batch-selective-options').style.display = 'block';
                break;
            case 'use_regex':
                document.getElementById('batch-regex-options').style.display = 'block';
                break;
            case 'match_whole_words':
                document.getElementById('batch-wholewords-options').style.display = 'block';
                break;
            case 'case_sensitive':
                document.getElementById('batch-casesensitive-options').style.display = 'block';
                break;
            case 'position':
                document.getElementById('batch-position-options').style.display = 'block';
                break;
            case 'priority':
                document.getElementById('batch-priority-options').style.display = 'block';
                break;
        }
    };
}

// 关闭批量修改模态框
function closeBatchModifyModal() {
    document.getElementById('batch-modify-modal').style.display = 'none';
}

// 应用批量修改
function applyBatchModify() {
    const modifyType = document.getElementById('batch-modify-type').value;

    if (!modifyType) {
        alert('请选择要修改的属性');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('#search-results .entry-checkbox:checked');
    const entryIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.entryId);

    let modifiedCount = 0;

    entryIds.forEach(uniqueId => {
        const entryElement = document.querySelector(`[data-unique-id="${uniqueId}"]`);
        if (!entryElement) return;

        switch (modifyType) {
            case 'enabled':
                const enabledValue = document.getElementById('batch-enabled-value').value === 'true';
                const enabledCheckbox = entryElement.querySelector('.wb-enabled');
                if (enabledCheckbox) {
                    enabledCheckbox.checked = enabledValue;
                    modifiedCount++;
                }
                break;

            case 'constant':
                const constantValue = document.getElementById('batch-constant-value').value === 'true';
                const constantCheckbox = entryElement.querySelector('.wb-constant');
                const constantBtn = entryElement.querySelector('.constant-toggle-btn');
                if (constantCheckbox) {
                    constantCheckbox.checked = constantValue;
                    if (constantBtn) {
                        constantBtn.textContent = constantValue ? t('constant-mode-permanent') : t('constant-mode-keyword');
                        constantBtn.style.backgroundColor = constantValue ? '#ff7849' : '#6c757d';
                        constantBtn.dataset.constant = constantValue.toString();
                    }
                    modifiedCount++;
                }
                break;

            case 'prevent_recursion':
                const recursionValue = document.getElementById('batch-recursion-value').value === 'true';
                const recursionCheckbox = entryElement.querySelector('.wb-prevent-recursion');
                if (recursionCheckbox) {
                    recursionCheckbox.checked = recursionValue;
                    modifiedCount++;
                }
                break;

            case 'exclude_recursion':
                const excludeRecursionValue = document.getElementById('batch-exclude-recursion-value').value === 'true';
                const excludeRecursionCheckbox = entryElement.querySelector('.wb-exclude-recursion');
                if (excludeRecursionCheckbox) {
                    excludeRecursionCheckbox.checked = excludeRecursionValue;
                    modifiedCount++;
                }
                break;

            case 'selective':
                const selectiveValue = document.getElementById('batch-selective-value').value === 'true';
                const selectiveCheckbox = entryElement.querySelector('.wb-selective');
                if (selectiveCheckbox) {
                    selectiveCheckbox.checked = selectiveValue;
                    modifiedCount++;
                }
                break;

            case 'use_regex':
                const regexValue = document.getElementById('batch-regex-value').value === 'true';
                const regexCheckbox = entryElement.querySelector('.wb-use-regex');
                if (regexCheckbox) {
                    regexCheckbox.checked = regexValue;
                    modifiedCount++;
                }
                break;

            case 'match_whole_words':
                const wholeWordsValue = document.getElementById('batch-wholewords-value').value === 'true';
                const wholeWordsCheckbox = entryElement.querySelector('.wb-match-whole-words');
                if (wholeWordsCheckbox) {
                    wholeWordsCheckbox.checked = wholeWordsValue;
                    modifiedCount++;
                }
                break;

            case 'case_sensitive':
                const caseSensitiveValue = document.getElementById('batch-casesensitive-value').value === 'true';
                const caseSensitiveCheckbox = entryElement.querySelector('.wb-case-sensitive');
                if (caseSensitiveCheckbox) {
                    caseSensitiveCheckbox.checked = caseSensitiveValue;
                    modifiedCount++;
                }
                break;

            case 'position':
                const positionValue = document.getElementById('batch-position-value').value;
                const positionSelect = entryElement.querySelector('.wb-position');
                if (positionSelect) {
                    if (positionValue.includes('-')) {
                        // 处理智能插入（position-role格式）
                        const [pos, role] = positionValue.split('-');
                        positionSelect.value = pos;
                        // 触发change事件以显示depth字段
                        positionSelect.dispatchEvent(new Event('change'));
                        // 查找对应的option并选中
                        const options = positionSelect.querySelectorAll('option');
                        options.forEach(opt => {
                            if (opt.value === pos && opt.dataset.role === role) {
                                opt.selected = true;
                            }
                        });
                    } else {
                        positionSelect.value = positionValue;
                        positionSelect.dispatchEvent(new Event('change'));
                    }
                    modifiedCount++;
                }
                break;

            case 'priority':
                const priorityValue = document.getElementById('batch-priority-value').value;
                const priorityInput = entryElement.querySelector('.wb-priority');
                if (priorityInput) {
                    priorityInput.value = priorityValue;
                    modifiedCount++;
                }
                break;
        }
    });

    alert(t('modify-success').replace('{count}', modifiedCount));
    closeBatchModifyModal();

    // 刷新搜索结果以反映变化
    const searchPanel = document.getElementById('search-panel');
    if (searchPanel && searchPanel.classList.contains('open')) {
        // 如果搜索面板打开，刷新结果
        const refreshBtn = document.querySelector('.sort-btn.active');
        if (refreshBtn) {
            refreshBtn.click();
        }
    }
}

// ========== 一键修复失败记忆功能 ==========

// 将记忆分裂为两个（当token超限时使用）
function splitMemoryIntoTwo(memoryIndex) {
    const memory = memoryQueue[memoryIndex];
    if (!memory) {
        console.error('❌ 无法找到要分裂的记忆');
        return null;
    }

    const content = memory.content;
    const halfLength = Math.floor(content.length / 2);

    // 尝试在中间位置附近找到一个合适的分割点（段落或句子结束）
    let splitPoint = halfLength;

    // 向后查找段落分隔符
    const paragraphBreak = content.indexOf('\n\n', halfLength);
    if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
        splitPoint = paragraphBreak + 2;
    } else {
        // 向后查找句号
        const sentenceBreak = content.indexOf('。', halfLength);
        if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
            splitPoint = sentenceBreak + 1;
        }
    }

    const content1 = content.substring(0, splitPoint);
    const content2 = content.substring(splitPoint);

    // 解析原标题，获取基础名称和编号
    const originalTitle = memory.title;
    let baseName = originalTitle;
    let suffix1, suffix2;

    // 检查是否已经是分裂后的记忆（如 "记忆7-1"）
    const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
    if (splitMatch) {
        // 已经是分裂记忆，继续分裂
        baseName = splitMatch[1];
        const currentNum = parseInt(splitMatch[2]);
        suffix1 = `-${currentNum}-1`;
        suffix2 = `-${currentNum}-2`;
    } else {
        // 首次分裂
        suffix1 = '-1';
        suffix2 = '-2';
    }

    // 创建两个新的记忆对象
    const memory1 = {
        title: baseName + suffix1,
        content: content1,
        processed: false,
        failed: true,  // 标记为失败，等待修复
        failedError: null
    };

    const memory2 = {
        title: baseName + suffix2,
        content: content2,
        processed: false,
        failed: true,  // 标记为失败，等待修复
        failedError: null
    };

    // 从队列中移除原记忆，插入两个新记忆
    memoryQueue.splice(memoryIndex, 1, memory1, memory2);

    mylog(`🔀 记忆分裂完成: "${originalTitle}" -> "${memory1.title}" (${content1.length}字) + "${memory2.title}" (${content2.length}字)`);

    return {
        part1: memory1,
        part2: memory2
    };
}

// 分裂从指定索引开始的所有后续记忆（当检测到上下文超限时使用）
function splitAllRemainingMemories(startIndex) {
    mylog(`🔀 开始分裂从索引 ${startIndex} 开始的所有后续记忆...`);
    const originalLength = memoryQueue.length;
    let splitCount = 0;

    // 从后往前分裂，避免索引混乱
    for (let i = memoryQueue.length - 1; i >= startIndex; i--) {
        const memory = memoryQueue[i];
        if (!memory || memory.processed) continue;

        const content = memory.content;
        const halfLength = Math.floor(content.length / 2);

        // 找分割点
        let splitPoint = halfLength;
        const paragraphBreak = content.indexOf('\n\n', halfLength);
        if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
            splitPoint = paragraphBreak + 2;
        } else {
            const sentenceBreak = content.indexOf('。', halfLength);
            if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                splitPoint = sentenceBreak + 1;
            }
        }

        const content1 = content.substring(0, splitPoint);
        const content2 = content.substring(splitPoint);

        // 解析标题
        const originalTitle = memory.title;
        let baseName = originalTitle;
        let suffix1, suffix2;

        const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
        if (splitMatch) {
            baseName = splitMatch[1];
            const currentNum = parseInt(splitMatch[2]);
            suffix1 = `-${currentNum}-1`;
            suffix2 = `-${currentNum}-2`;
        } else {
            suffix1 = '-1';
            suffix2 = '-2';
        }

        const memory1 = {
            title: baseName + suffix1,
            content: content1,
            processed: false,
            failed: false,
            failedError: null
        };

        const memory2 = {
            title: baseName + suffix2,
            content: content2,
            processed: false,
            failed: false,
            failedError: null
        };

        memoryQueue.splice(i, 1, memory1, memory2);
        splitCount++;
        mylog(`  🔀 ${originalTitle} -> ${memory1.title} + ${memory2.title}`);
    }

    mylog(`✅ 分裂完成: 原${originalLength - startIndex}个记忆 -> 现${memoryQueue.length - startIndex}个记忆 (分裂了${splitCount}个)`);
    mylog(`📋 分裂后队列: ${memoryQueue.map(m => m.title).join(', ')}`);
    return splitCount;
}

// 递归修复单个记忆（处理分裂情况）
async function repairMemoryWithSplit(memoryIndex, stats) {
    const memory = memoryQueue[memoryIndex];
    if (!memory) return;

    document.getElementById('progress-text').textContent = `正在修复: ${memory.title}`;

    try {
        await repairSingleMemory(memoryIndex);
        memory.failed = false;
        memory.failedError = null;
        memory.processed = true;  // 确保标记为已处理，UI会显示正常样式
        stats.successCount++;
        mylog(`✅ 修复成功: ${memory.title}`);
        updateMemoryQueueUI();
        // 保存状态，确保分裂后的记忆状态被保存
        await NovelState.saveState(memoryQueue.filter(m => m.processed).length);
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        // ========== 检查是否是上下文超限错误 ==========
        const errorMsg = error.message || '';

        // 使用统一的检测函数，或者检查特殊标记
        const isTokenLimitError = errorMsg.startsWith('CONTEXT_OVERFLOW:') || isContextOverflowError(errorMsg);

        if (isTokenLimitError) {
            mylog(`⚠️ 检测到token超限错误，开始分裂记忆: ${memory.title}`);
            document.getElementById('progress-text').textContent = `🔀 正在分裂记忆: ${memory.title}`;

            // 分裂记忆
            const splitResult = splitMemoryIntoTwo(memoryIndex);
            if (splitResult) {
                mylog(`✅ 记忆分裂成功: ${splitResult.part1.title} 和 ${splitResult.part2.title}`);
                updateMemoryQueueUI();
                // 分裂后立即保存状态，确保刷新后能恢复
                await NovelState.saveState(memoryQueue.filter(m => m.processed).length);
                await new Promise(resolve => setTimeout(resolve, 500));

                // 递归处理第一个分裂记忆
                const part1Index = memoryQueue.indexOf(splitResult.part1);
                await repairMemoryWithSplit(part1Index, stats);

                // 第一个完全处理完后，再处理第二个
                const part2Index = memoryQueue.indexOf(splitResult.part2);
                await repairMemoryWithSplit(part2Index, stats);
            } else {
                stats.stillFailedCount++;
                memory.failedError = error.message;
                console.error(`❌ 记忆分裂失败: ${memory.title}`);
            }
        } else {
            stats.stillFailedCount++;
            memory.failedError = error.message;
            console.error(`❌ 修复失败: ${memory.title}`, error);
            updateMemoryQueueUI();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// 一键修复失败的记忆
async function startRepairFailedMemories() {
    const failedMemories = memoryQueue.filter(m => m.failed === true);
    if (failedMemories.length === 0) {
        alert('没有需要修复的记忆');
        return;
    }

    // 设置修复模式标志
    isRepairingMemories = true;
    mylog(`🔧 开始一键修复 ${failedMemories.length} 个失败的记忆...`);
    mylog(`当前正在处理的索引: ${currentProcessingIndex}`);

    document.getElementById('progress-section').style.display = 'block';
    document.getElementById('progress-text').textContent = `正在修复失败的记忆 (0/${failedMemories.length})`;

    const repairBtn = document.getElementById('repair-memory-btn');
    if (repairBtn) {
        repairBtn.disabled = true;
        repairBtn.textContent = '🔧 修复中...';
    }

    // 统计对象，用于在递归中累计
    const stats = {
        successCount: 0,
        stillFailedCount: 0
    };

    // 按顺序处理每个失败的记忆
    for (let i = 0; i < failedMemories.length; i++) {
        const memory = failedMemories[i];
        const memoryIndex = memoryQueue.indexOf(memory);

        if (memoryIndex === -1) continue; // 可能已被分裂替换

        document.getElementById('progress-fill').style.width = ((i + 1) / failedMemories.length * 100) + '%';

        // 使用递归方式处理，确保分裂后按顺序处理
        await repairMemoryWithSplit(memoryIndex, stats);
    }

    failedMemoryQueue = failedMemoryQueue.filter(item => {
        const memory = memoryQueue[item.index];
        return memory && memory.failed === true;
    });

    document.getElementById('progress-text').textContent = `修复完成: 成功 ${stats.successCount} 个, 仍失败 ${stats.stillFailedCount} 个`;

    if (repairBtn) repairBtn.disabled = false;
    updateRepairButton();
    await NovelState.saveState(memoryQueue.length);

    // 清除修复模式标志，允许继续处理
    isRepairingMemories = false;
    mylog(`🔧 修复模式结束，继续处理标志已清除`);

    if (stats.stillFailedCount > 0) {
        alert(`修复完成！\n成功: ${stats.successCount} 个\n仍失败: ${stats.stillFailedCount} 个\n\n失败的记忆仍显示❗，可继续点击修复。`);
    } else {
        alert(`全部修复成功！共修复 ${stats.successCount} 个记忆块。`);
    }
}

// 修复单个失败的记忆
async function repairSingleMemory(index) {
    const memory = memoryQueue[index];
    const enableLiteraryStyle = document.getElementById('enable-literary-style')?.checked ?? false;
    const enablePlotOutline = document.getElementById('enable-plot-outline')?.checked ?? true;

    // 使用动态生成的简化JSON模板
    const simpleJsonTemplate = generateSimpleJsonTemplate();

    // 检查是否启用破限
    const apiSettings = loadApiSettings();
    const provider = apiSettings.provider;
    let useJailbreak = false;

    // 根据不同的provider检查破限设置
    if (provider === 'gemini') {
        useJailbreak = apiSettings.gemini?.useSystemPrompt || false;
    } else if (provider === 'gemini-proxy') {
        useJailbreak = apiSettings['gemini-proxy']?.useSystemPrompt || false;
    } else if (provider === 'tavern') {
        useJailbreak = apiSettings.tavern?.jailbreak || false;
    }

    // 根据破限设置添加前缀
    let prompt = '';
    if (useJailbreak && typeof generateLimitlessPrompt === 'function') {
        try {
            prompt = generateLimitlessPrompt('prefix') + '\n\n';
        } catch (error) {
            console.error('破限提示词生成失败:', error);
            prompt = getLanguagePrefix();
        }
    } else {
        prompt = getLanguagePrefix();
        mylog('🔧 修复记忆：未启用破限模式');
    }

    prompt += `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取关键信息，生成世界书条目。

## 输出格式
请生成标准JSON格式：
${simpleJsonTemplate}

直接输出更新后的JSON，保持一致性，不要包含代码块标记。
`;

    if (Object.keys(generatedWorldbook).length > 0) {
        prompt += `当前记忆：\n${JSON.stringify(generatedWorldbook, null, 2)}\n\n`;
    }

    prompt += `阅读内容：\n---\n${memory.content}\n---\n\n请基于内容更新世界书，直接输出JSON。`;

    // 添加prompt查看功能（与普通处理一致）
    mylog(`=== 修复记忆 第${index + 1}步 Prompt ===`);
    mylog(prompt);
    mylog('=====================');

    const response = await callSimpleAPI(prompt);
    let memoryUpdate;

    try {
        memoryUpdate = JSON.parse(response);
    } catch (jsonError) {
        let cleanResponse = response.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const firstBrace = cleanResponse.indexOf('{');
        const lastBrace = cleanResponse.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
        }

        try {
            memoryUpdate = JSON.parse(cleanResponse);
        } catch (secondError) {
            // 尝试添加闭合括号
            const openBraces = (cleanResponse.match(/{/g) || []).length;
            const closeBraces = (cleanResponse.match(/}/g) || []).length;
            if (openBraces > closeBraces) {
                try {
                    memoryUpdate = JSON.parse(cleanResponse + '}'.repeat(openBraces - closeBraces));
                } catch (e) {
                    const regexData = extractWorldbookDataByRegex(cleanResponse);
                    if (regexData && Object.keys(regexData).length > 0) {
                        memoryUpdate = regexData;
                    } else {
                        throw new Error(`JSON解析失败: ${secondError.message}`);
                    }
                }
            } else {
                const regexData = extractWorldbookDataByRegex(cleanResponse);
                if (regexData && Object.keys(regexData).length > 0) {
                    memoryUpdate = regexData;
                } else {
                    throw new Error(`JSON解析失败: ${secondError.message}`);
                }
            }
        }
    }

    // 使用带历史记录的合并函数，命名规则：记忆-修复-[记忆标题]
    const memoryTitle = `记忆-修复-${memory.title}`;
    await mergeWorldbookDataWithHistory(generatedWorldbook, memoryUpdate, index, memoryTitle);
    mylog(`记忆块 ${index + 1} 修复完成，已保存修改历史: ${memoryTitle}`);
}

// ========== 查看世界书功能 ==========

function showViewWorldbookModal() {
    const existingModal = document.getElementById('view-worldbook-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'view-worldbook-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';

    const content = document.createElement('div');
    content.style.cssText = 'background: #2d2d2d; border-radius: 10px; padding: 20px; width: 90%; max-width: 900px; max-height: 85vh; display: flex; flex-direction: column;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
    header.innerHTML = `
        <h3 style="color: #e67e22; margin: 0;">📖 查看世界书</h3>
        <div>
            <button id="optimize-worldbook-btn" style="background: #3498db; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">🤖 AI优化世界书</button>
            <button id="view-history-btn" style="background: #9b59b6; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">📜 修改历史</button>
            <button id="export-current-worldbook" style="background: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">📥 导出世界书</button>
            <button id="close-worldbook-modal" style="background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer;">关闭</button>
        </div>
    </div>`; // 在这里添加了闭合的div标签

    const previewContainer = document.createElement('div');
    previewContainer.id = 'worldbook-modal-preview';
    previewContainer.style.cssText = 'flex: 1; overflow-y: auto; background: #1c1c1c; padding: 15px; border-radius: 8px; color: #f0f0f0;';

    // 生成嵌套卡片结构
    previewContainer.innerHTML = formatWorldbookAsCards(generatedWorldbook);

    content.appendChild(header);
    content.appendChild(previewContainer);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // 绑定事件
    document.getElementById('close-worldbook-modal').onclick = () => modal.remove();
    document.getElementById('export-current-worldbook').onclick = () => {
        exportWorldbook();
        modal.remove();
    };
    document.getElementById('view-history-btn').onclick = () => {
        modal.remove();
        showMemoryHistoryModal();
    };
    document.getElementById('optimize-worldbook-btn').onclick = () => {
        modal.remove();
        showOptimizeWorldbookModal();
    };

    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    // 设置定时刷新（实时更新）- 保持展开状态
    const refreshInterval = setInterval(() => {
        if (!document.getElementById('view-worldbook-modal')) {
            clearInterval(refreshInterval);
            return;
        }
        const preview = document.getElementById('worldbook-modal-preview');
        if (preview) {
            // 保存当前展开状态
            const expandedStates = {};
            preview.querySelectorAll('[data-category]').forEach(cat => {
                const categoryName = cat.getAttribute('data-category');
                const isExpanded = cat.querySelector('.category-content').style.display !== 'none';
                expandedStates[categoryName] = { category: isExpanded, entries: {} };

                cat.querySelectorAll('[data-entry]').forEach(entry => {
                    const entryName = entry.getAttribute('data-entry');
                    const isEntryExpanded = entry.querySelector('.entry-content').style.display !== 'none';
                    expandedStates[categoryName].entries[entryName] = isEntryExpanded;
                });
            });

            // 重新渲染
            preview.innerHTML = formatWorldbookAsCards(generatedWorldbook);

            // 恢复展开状态
            preview.querySelectorAll('[data-category]').forEach(cat => {
                const categoryName = cat.getAttribute('data-category');
                if (expandedStates[categoryName]) {
                    if (expandedStates[categoryName].category) {
                        cat.querySelector('.category-content').style.display = 'block';
                    }

                    cat.querySelectorAll('[data-entry]').forEach(entry => {
                        const entryName = entry.getAttribute('data-entry');
                        if (expandedStates[categoryName].entries[entryName]) {
                            entry.querySelector('.entry-content').style.display = 'block';
                        }
                    });
                }
            });
        }
    }, 2000);
}

// 简单的 Markdown 渲染函数
function renderMarkdown(text) {
    if (!text) return '';

    let html = String(text);

    // 转义 HTML 特殊字符（除了已经是 HTML 的部分）
    html = html.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 处理换行符
    html = html.replace(/\\n/g, '\n');

    // 标题 (### 标题)
    html = html.replace(/^### (.+)$/gm, '<h3 style="color: #e67e22; margin: 10px 0 5px 0; font-size: 16px;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="color: #e67e22; margin: 12px 0 6px 0; font-size: 18px;">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="color: #e67e22; margin: 15px 0 8px 0; font-size: 20px;">$1</h1>');

    // 粗体 **文字**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #3498db; font-weight: bold;">$1</strong>');

    // 斜体 *文字*
    html = html.replace(/\*(.+?)\*/g, '<em style="font-style: italic;">$1</em>');

    // 代码块 ```代码```
    html = html.replace(/```([^`]+)```/g, '<pre style="background: #1a1a1a; padding: 8px; border-radius: 4px; overflow-x: auto; margin: 8px 0;"><code style="color: #a9b7c6;">$1</code></pre>');

    // 行内代码 `代码`
    html = html.replace(/`([^`]+)`/g, '<code style="background: #1a1a1a; padding: 2px 6px; border-radius: 3px; color: #a9b7c6; font-family: monospace;">$1</code>');

    // 无序列表 - 项目
    html = html.replace(/^- (.+)$/gm, '<li style="margin-left: 20px; list-style-type: disc;">$1</li>');
    html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin: 8px 0; padding-left: 20px;">$&</ul>');

    // 有序列表 1. 项目
    html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');

    // 链接 [文字](URL)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #3498db; text-decoration: underline;">$1</a>');

    // 分割线 ---
    html = html.replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid #555; margin: 10px 0;">');

    // 换行转为 <br>
    html = html.replace(/\n/g, '<br>');

    return html;
}

// 格式化世界书为嵌套卡片结构
function formatWorldbookAsCards(worldbook) {
    if (!worldbook || Object.keys(worldbook).length === 0) {
        return '<div style="text-align: center; color: #888; padding: 40px;">暂无世界书数据</div>';
    }

    let html = '';

    for (const category in worldbook) {
        const entries = worldbook[category];
        const entryCount = typeof entries === 'object' ? Object.keys(entries).length : 0;

        // 过滤空分类（地图环境、剧情节点等）
        if (entryCount === 0) {
            continue;
        }

        html += `
        <div data-category="${category}" style="margin-bottom: 15px; border: 2px solid #e67e22; border-radius: 8px; overflow: hidden;">
            <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" 
                 style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); padding: 12px 15px; cursor: pointer; font-weight: bold; font-size: 15px; display: flex; justify-content: space-between; align-items: center;">
                <span>📁 ${category}</span>
                <span style="font-size: 12px; opacity: 0.9;">${entryCount} 条目</span>
            </div>
            <div class="category-content" style="display: block; background: #2d2d2d;">`;

        if (typeof entries === 'object') {
            for (const entryName in entries) {
                const entry = entries[entryName];

                html += `
                <div data-entry="${entryName}" style="margin: 10px; border: 1px solid #555; border-radius: 6px; overflow: hidden;">
                    <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'"
                         style="background: #3a3a3a; padding: 10px 12px; cursor: pointer; font-weight: 500; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid #3498db;">
                        <span>📄 ${entryName}</span>
                        <span style="font-size: 11px; color: #888;">▼</span>
                    </div>
                    <div class="entry-content" style="display: none; background: #1c1c1c; padding: 12px; border-top: 1px solid #444;">`;

                if (entry && typeof entry === 'object') {
                    if (entry['关键词']) {
                        const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
                        html += `
                        <div style="margin-bottom: 10px; padding: 8px; background: #252525; border-left: 3px solid #9b59b6; border-radius: 4px;">
                            <div style="color: #9b59b6; font-size: 12px; font-weight: bold; margin-bottom: 4px;">🔑 关键词</div>
                            <div style="color: #ddd; font-size: 13px;">${keywords}</div>
                        </div>`;
                    }

                    if (entry['内容']) {
                        const content = renderMarkdown(entry['内容']);
                        html += `
                        <div style="padding: 8px; background: #252525; border-left: 3px solid #27ae60; border-radius: 4px;">
                            <div style="color: #27ae60; font-size: 12px; font-weight: bold; margin-bottom: 6px;">📝 内容</div>
                            <div style="color: #f0f0f0; font-size: 13px; line-height: 1.6;">${content}</div>
                        </div>`;
                    }
                } else {
                    html += `<div style="color: #aaa; font-size: 13px;">${entry}</div>`;
                }

                html += `
                    </div>
                </div>`;
            }
        }

        html += `
            </div>
        </div>`;
    }

    return html;
}

// 保留旧函数用于导出
function formatWorldbookForDisplay(worldbook) {
    if (!worldbook || Object.keys(worldbook).length === 0) {
        return '暂无世界书数据';
    }

    let result = '';
    for (const category in worldbook) {
        result += `【${category}】\n`;
        const entries = worldbook[category];
        if (typeof entries === 'object') {
            for (const entryName in entries) {
                const entry = entries[entryName];
                result += `  ├─ ${entryName}\n`;
                if (entry && typeof entry === 'object') {
                    if (entry['关键词']) {
                        result += `  │   关键词: ${Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词']}\n`;
                    }
                    if (entry['内容']) {
                        const content = String(entry['内容']).replace(/\\n/g, '\n');
                        const lines = content.split('\n');
                        lines.forEach((line, i) => {
                            if (i === 0) {
                                result += `  │   内容: ${line}\n`;
                            } else {
                                result += `  │         ${line}\n`;
                            }
                        });
                    }
                } else {
                    result += `  │   ${entry}\n`;
                }
                result += `  │\n`;
            }
        }
        result += '\n';
    }
    return result;
}

// 添加查看世界书按钮到停止按钮旁边
function addViewWorldbookButton() {
    if (document.getElementById('view-worldbook-btn')) return;

    // ... (其他代码保持不变)
    const progressSection = document.getElementById('progress-section');
    if (!progressSection) return;

    const viewBtn = document.createElement('button');
    viewBtn.id = 'view-worldbook-btn';
    viewBtn.textContent = '📖 查看世界书';
    viewBtn.style.cssText = 'background: #e67e22; color: white; padding: 8px 16px; border: none; border-radius: 5px; margin-top: 10px; margin-left: 10px; cursor: pointer; font-size: 14px;';
    viewBtn.onclick = showViewWorldbookModal;
    progressSection.appendChild(viewBtn);
}

// ========== 记忆修改历史功能 ==========

// 显示记忆修改历史模态框
async function showMemoryHistoryModal() {
    const existingModal = document.getElementById('memory-history-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'memory-history-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';

    const content = document.createElement('div');
    content.style.cssText = 'background: #2d2d2d; border-radius: 10px; padding: 20px; width: 95%; max-width: 1200px; max-height: 90vh; display: flex; flex-direction: column;';

    // 获取历史记录
    let historyList = [];
    try {
        // 先清理重复记录
        const cleanedCount = await MemoryHistoryDB.cleanDuplicateHistory();
        if (cleanedCount > 0) {
            mylog(`✅ 已清理 ${cleanedCount} 条重复的历史记录`);
        }

        historyList = await MemoryHistoryDB.getAllHistory();
    } catch (e) {
        console.error('获取历史记录失败:', e);
    }

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0;';
    header.innerHTML = `
        <h3 style="color: #9b59b6; margin: 0;">📜 记忆修改历史 (${historyList.length}条)</h3>
        <div>
            <button id="view-entry-evolution-btn" style="background: #3498db; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">📊 条目演变</button>
            <button id="clear-history-btn" style="background: #e74c3c; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">🗑️ 清空历史</button>
            <button id="back-to-worldbook-btn" style="background: #e67e22; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">📖 返回世界书</button>
            <button id="close-history-modal" style="background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer;">关闭</button>
        </div>
    `;

    const mainContainer = document.createElement('div');
    mainContainer.style.cssText = 'display: flex; flex: 1; overflow: hidden; gap: 15px;';

    // 左侧：历史列表
    const historyListContainer = document.createElement('div');
    historyListContainer.style.cssText = 'width: 300px; flex-shrink: 0; overflow-y: auto; background: #1c1c1c; border-radius: 8px; padding: 10px;';
    historyListContainer.innerHTML = generateHistoryListHTML(historyList);

    // 右侧：详情对比视图
    const detailContainer = document.createElement('div');
    detailContainer.id = 'history-detail-container';
    detailContainer.style.cssText = 'flex: 1; overflow-y: auto; background: #1c1c1c; border-radius: 8px; padding: 15px; color: #f0f0f0;';
    detailContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">👈 点击左侧历史记录查看详情</div>';

    mainContainer.appendChild(historyListContainer);
    mainContainer.appendChild(detailContainer);

    content.appendChild(header);
    content.appendChild(mainContainer);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // 绑定事件
    document.getElementById('close-history-modal').onclick = () => modal.remove();
    document.getElementById('back-to-worldbook-btn').onclick = () => {
        modal.remove();
        showViewWorldbookModal();
    };
    document.getElementById('clear-history-btn').onclick = async () => {
        if (confirm('确定要清空所有修改历史吗？此操作不可恢复。')) {
            await MemoryHistoryDB.clearAllHistory();
            modal.remove();
            showMemoryHistoryModal();
        }
    };
    document.getElementById('view-entry-evolution-btn').onclick = () => {
        modal.remove();
        showEntryEvolutionModal(historyList);
    };

    // 绑定历史项点击事件
    historyListContainer.querySelectorAll('.history-item').forEach(item => {
        item.onclick = async () => {
            const historyId = parseInt(item.dataset.historyId);
            await showHistoryDetail(historyId);
            // 高亮选中项
            historyListContainer.querySelectorAll('.history-item').forEach(i => i.style.background = '#2d2d2d');
            item.style.background = '#3d3d3d';
        };
    });

    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// 生成历史列表HTML
function generateHistoryListHTML(historyList) {
    if (historyList.length === 0) {
        return '<div style="text-align: center; color: #888; padding: 20px;">暂无修改历史</div>';
    }

    let html = '';
    // 按时间倒序排列
    const sortedList = [...historyList].sort((a, b) => b.timestamp - a.timestamp);

    sortedList.forEach((history, index) => {
        const time = new Date(history.timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        const changeCount = history.changedEntries?.length || 0;
        const addCount = history.changedEntries?.filter(c => c.type === 'add').length || 0;
        const modifyCount = history.changedEntries?.filter(c => c.type === 'modify').length || 0;

        html += `
        <div class="history-item" data-history-id="${history.id}" style="background: #2d2d2d; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid #9b59b6; transition: background 0.2s;">
            <div style="font-weight: bold; color: #e67e22; font-size: 13px; margin-bottom: 4px;">
                📝 ${history.memoryTitle || `记忆块 ${history.memoryIndex + 1}`}
            </div>
            <div style="font-size: 11px; color: #888; margin-bottom: 4px;">${time}</div>
            <div style="font-size: 11px; color: #aaa;">
                <span style="color: #27ae60;">➕${addCount}</span>
                <span style="color: #3498db; margin-left: 8px;">✏️${modifyCount}</span>
                <span style="color: #888; margin-left: 8px;">共${changeCount}项</span>
            </div>
        </div>`;
    });

    return html;
}

// 显示历史详情
async function showHistoryDetail(historyId) {
    const detailContainer = document.getElementById('history-detail-container');
    if (!detailContainer) return;

    const history = await MemoryHistoryDB.getHistoryById(historyId);
    if (!history) {
        detailContainer.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 40px;">找不到该历史记录</div>';
        return;
    }

    const time = new Date(history.timestamp).toLocaleString('zh-CN');

    let html = `
    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444;">
        <h4 style="color: #e67e22; margin: 0 0 10px 0;"> 📝 ${history.memoryTitle || `记忆块 ${history.memoryIndex + 1}`}</h4>
        <div style="font-size: 12px; color: #888;">时间: ${time}</div>
        <div style="margin-top: 10px;">
            <button onclick="rollbackToHistoryAndRefresh(${historyId})" style="background: #e74c3c; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                ⏪ 回退到此版本前
            </button>
            <button onclick="exportHistoryWorldbook(${historyId})" style="background: #27ae60; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 10px;">
                📥 导出此版本世界书
            </button>
        </div>
    </div>
    <div style="font-size: 14px; font-weight: bold; color: #9b59b6; margin-bottom: 10px;">变更内容 (${history.changedEntries?.length || 0}项)</div>
    `;

    if (history.changedEntries && history.changedEntries.length > 0) {
        history.changedEntries.forEach(change => {
            const typeIcon = change.type === 'add' ? '➕ 新增' : change.type === 'modify' ? '✏️ 修改' : '❌ 删除';
            const typeColor = change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';

            html += `
            <div style="background: #252525; border-radius: 6px; padding: 12px; margin-bottom: 10px; border-left: 3px solid ${typeColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="color: ${typeColor}; font-weight: bold;">${typeIcon}</span>
                    <span style="color: #e67e22;">[${change.category}] ${change.entryName}</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1; background: #1c1c1c; padding: 8px; border-radius: 4px; ${change.type === 'add' ? 'opacity: 0.5;' : ''}">
                        <div style="color: #e74c3c; font-size: 11px; margin-bottom: 4px;">原内容</div>
                        <div style="font-size: 12px; color: #ccc; max-height: 150px; overflow-y: auto;">
                            ${change.oldValue ? formatEntryForDisplay(change.oldValue) : '<span style="color: #666;">无</span>'}
                        </div>
                    </div>
                    <div style="flex: 1; background: #1c1c1c; padding: 8px; border-radius: 4px; ${change.type === 'delete' ? 'opacity: 0.5;' : ''}">
                        <div style="color: #27ae60; font-size: 11px; margin-bottom: 4px;">新内容</div>
                        <div style="font-size: 12px; color: #ccc; max-height: 150px; overflow-y: auto;">
                            ${change.newValue ? formatEntryForDisplay(change.newValue) : '<span style="color: #666;">无</span>'}
                        </div>
                    </div>
                </div>
            </div>`;
        });
    } else {
        html += '<div style="color: #888; text-align: center; padding: 20px;">无变更记录</div>';
    }

    detailContainer.innerHTML = html;
}

// 格式化条目用于显示
function formatEntryForDisplay(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    let html = '';
    if (entry['关键词']) {
        const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
        html += `<div style="color: #9b59b6; margin-bottom: 4px;"><strong>关键词:</strong> ${keywords}</div>`;
    }
    if (entry['内容']) {
        const content = String(entry['内容']).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        html += `<div><strong>内容:</strong> ${content}</div>`;
    }
    return html || JSON.stringify(entry);
}

// 回退到指定历史并刷新页面
async function rollbackToHistoryAndRefresh(historyId) {
    if (!confirm('确定要回退到此版本吗？\n\n回退后将自动刷新页面以确保API状态正确。\n当前版本之后的所有修改将被删除。')) {
        return;
    }

    try {
        const history = await MemoryHistoryDB.rollbackToHistory(historyId);
        mylog(`📚 已回退到历史记录 #${historyId}: ${history.memoryTitle}`);

        // 获取回退点的记忆索引
        const rollbackMemoryIndex = history.memoryIndex;
        mylog(`📚 回退到记忆索引: ${rollbackMemoryIndex}`);

        // 更新记忆队列的处理状态
        for (let i = 0; i < memoryQueue.length; i++) {
            if (i < rollbackMemoryIndex) {
                // 回退点之前的记忆块标记为已处理（保留原有的failed状态）
                memoryQueue[i].processed = true;
                // 不修改failed状态，保留原有的失败标记
            } else {
                // 回退点及之后的记忆块标记为未处理
                memoryQueue[i].processed = false;
                memoryQueue[i].failed = false;
            }
        }

        mylog(`📚 记忆块 0-${rollbackMemoryIndex - 1} 标记为已处理，${rollbackMemoryIndex} 及之后标记为未处理`);

        // 保存当前状态（使用回退点的索引）
        await NovelState.saveState(rollbackMemoryIndex);

        alert(`回退成功！\n\n世界书已恢复到"${history.memoryTitle}"处理之前的状态。\n• 记忆块 1-${rollbackMemoryIndex} 已处理\n• 记忆块 ${rollbackMemoryIndex + 1} 及之后将重新处理\n\n页面将自动刷新。`);
        location.reload();
    } catch (error) {
        console.error('回退失败:', error);
        alert('回退失败: ' + error.message);
    }
}

// 检测文件变化并清理历史记录
async function checkAndClearHistoryOnFileChange(newContent) {
    try {
        // 计算新文件的hash
        const newHash = await calculateFileHash(newContent);

        // 获取保存的文件hash
        const savedHash = await MemoryHistoryDB.getSavedFileHash();

        mylog(`📁 文件hash检测: 新=${newHash?.substring(0, 16)}..., 旧=${savedHash?.substring(0, 16) || '无'}...`);

        if (savedHash && savedHash !== newHash) {
            // 文件内容发生变化
            const historyList = await MemoryHistoryDB.getAllHistory();
            if (historyList.length > 0) {
                const shouldClear = confirm(
                    `检测到导入了新的文件（内容与上次不同）。\n\n` +
                    `当前有 ${historyList.length} 条修改历史记录。\n\n` +
                    `是否清空旧的历史记录？\n` +
                    `- 点击"确定"清空历史，开始新的转换\n` +
                    `- 点击"取消"保留历史（可能与新文件不匹配）`
                );

                if (shouldClear) {
                    await MemoryHistoryDB.clearAllHistory();
                    mylog('已清空旧的历史记录');
                }
            }
        }

        // 保存新文件的hash
        currentFileHash = newHash;
        await MemoryHistoryDB.saveFileHash(newHash);
        mylog('已保存新文件hash');

    } catch (error) {
        console.error('检测文件变化时出错:', error);
        // 出错时不阻止文件导入
    }
}

// ========== 历史数据导出功能 ==========

// ========== 条目演变功能 ==========

// 显示条目演变模态框
async function showEntryEvolutionModal(historyList) {
    const existingModal = document.getElementById('entry-evolution-modal');
    if (existingModal) existingModal.remove();

    // 按条目聚合历史
    const entryEvolution = aggregateEntryEvolution(historyList);

    const modal = document.createElement('div');
    modal.id = 'entry-evolution-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';

    const content = document.createElement('div');
    content.style.cssText = 'background: #2d2d2d; border-radius: 10px; padding: 20px; width: 95%; max-width: 1200px; max-height: 90vh; display: flex; flex-direction: column;';

    const entryCount = Object.keys(entryEvolution).length;
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0;';
    header.innerHTML = `
        <h3 style="color: #3498db; margin: 0;">条目演变历史 (${entryCount}个条目)</h3>
        <div>
            <button id="summarize-all-entries-btn" style="background: #9b59b6; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">AI总结全部演变</button>
            <button id="export-evolution-btn" style="background: #27ae60; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">导出演变数据</button>
            <button id="back-to-history-btn" style="background: #e67e22; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">返回历史</button>
            <button id="close-evolution-modal" style="background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer;">关闭</button>
        </div>
    `;

    const mainContainer = document.createElement('div');
    mainContainer.style.cssText = 'display: flex; flex: 1; overflow: hidden; gap: 15px;';

    // 左侧：条目列表
    const entryListContainer = document.createElement('div');
    entryListContainer.style.cssText = 'width: 300px; flex-shrink: 0; overflow-y: auto; background: #1c1c1c; border-radius: 8px; padding: 10px;';
    entryListContainer.innerHTML = generateEntryListHTML(entryEvolution);

    // 右侧：演变详情
    const evolutionDetailContainer = document.createElement('div');
    evolutionDetailContainer.id = 'evolution-detail-container';
    evolutionDetailContainer.style.cssText = 'flex: 1; overflow-y: auto; background: #1c1c1c; border-radius: 8px; padding: 15px; color: #f0f0f0;';
    evolutionDetailContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">点击左侧条目查看演变历史</div>';

    mainContainer.appendChild(entryListContainer);
    mainContainer.appendChild(evolutionDetailContainer);

    content.appendChild(header);
    content.appendChild(mainContainer);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // 保存当前演变数据到全局变量
    window.currentEntryEvolution = entryEvolution;

    // 绑定事件
    document.getElementById('close-evolution-modal').onclick = () => modal.remove();
    document.getElementById('back-to-history-btn').onclick = () => {
        modal.remove();
        showMemoryHistoryModal();
    };
    document.getElementById('export-evolution-btn').onclick = () => exportEvolutionData(entryEvolution);
    document.getElementById('summarize-all-entries-btn').onclick = () => summarizeAllEntryEvolution(entryEvolution);

    // 绑定条目点击事件
    entryListContainer.querySelectorAll('.entry-evolution-item').forEach(item => {
        item.onclick = () => {
            const entryKey = item.dataset.entryKey;
            showEntryEvolutionDetail(entryKey, entryEvolution[entryKey]);
            // 高亮选中项
            entryListContainer.querySelectorAll('.entry-evolution-item').forEach(i => i.style.background = '#2d2d2d');
            item.style.background = '#3d3d3d';
        };
    });

    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// 按条目聚合演变历史
function aggregateEntryEvolution(historyList) {
    const evolution = {};

    // 按时间正序排列
    const sortedList = [...historyList].sort((a, b) => a.timestamp - b.timestamp);

    sortedList.forEach(history => {
        if (!history.changedEntries) return;

        history.changedEntries.forEach(change => {
            const key = `${change.category}::${change.entryName}`;

            if (!evolution[key]) {
                evolution[key] = {
                    category: change.category,
                    entryName: change.entryName,
                    changes: [],
                    summary: null
                };
            }

            evolution[key].changes.push({
                timestamp: history.timestamp,
                memoryIndex: history.memoryIndex,
                memoryTitle: history.memoryTitle,
                type: change.type,
                oldValue: change.oldValue,
                newValue: change.newValue
            });
        });
    });

    return evolution;
}

// 生成条目列表HTML
function generateEntryListHTML(entryEvolution) {
    const entries = Object.entries(entryEvolution);

    if (entries.length === 0) {
        return '<div style="text-align: center; color: #888; padding: 20px;">暂无条目演变数据</div>';
    }

    // 按变更次数排序（多的在前）
    entries.sort((a, b) => b[1].changes.length - a[1].changes.length);

    let html = '';
    entries.forEach(([key, data]) => {
        const changeCount = data.changes.length;
        const hasSummary = data.summary ? '✅' : '';

        html += `
        <div class="entry-evolution-item" data-entry-key="${key}" style="background: #2d2d2d; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid #3498db; transition: background 0.2s;">
            <div style="font-weight: bold; color: #e67e22; font-size: 13px; margin-bottom: 4px; display: flex; justify-content: space-between;">
                <span> ${data.entryName}</span>
                <span style="font-size: 11px; color: #27ae60;">${hasSummary}</span>
            </div>
            <div style="font-size: 11px; color: #888; margin-bottom: 4px;">[${data.category}]</div>
            <div style="font-size: 11px; color: #aaa;">
                <span style="color: #3498db;"> ${changeCount}次变更</span>
            </div>
        </div>`;
    });

    return html;
}

// 显示条目演变详情
function showEntryEvolutionDetail(entryKey, entryData) {
    const detailContainer = document.getElementById('evolution-detail-container');
    if (!detailContainer || !entryData) return;

    let html = `
    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444;">
        <h4 style="color: #e67e22; margin: 0 0 5px 0;"> ${entryData.entryName}</h4>
        <div style="font-size: 12px; color: #888; margin-bottom: 10px;">[${entryData.category}] - 共 ${entryData.changes.length} 次变更</div>
        <button onclick="summarizeSingleEntryEvolution('${entryKey.replace(/'/g, "\\'")}')" style="background: #9b59b6; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            AI总结此条目演变
        </button>
    </div>
    `;

    // 显示已有的总结
    if (entryData.summary) {
        html += `
        <div style="background: #1a3a1a; border: 1px solid #27ae60; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
            <div style="color: #27ae60; font-weight: bold; margin-bottom: 8px;">AI总结</div>
            <div style="color: #f0f0f0; font-size: 13px; line-height: 1.6;">${renderMarkdown(entryData.summary)}</div>
        </div>
        `;
    }

    html += `<div style="font-size: 14px; font-weight: bold; color: #3498db; margin-bottom: 10px;">变更时间线</div>`;

    // 按时间正序显示变更
    entryData.changes.forEach((change, index) => {
        const time = new Date(change.timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        const typeIcon = change.type === 'add' ? '➕ 新增' : change.type === 'modify' ? '✏️ 修改' : '❌ 删除';
        const typeColor = change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';

        html += `
        <div style="background: #252525; border-radius: 6px; padding: 12px; margin-bottom: 10px; border-left: 3px solid ${typeColor};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="color: ${typeColor}; font-weight: bold;">#${index + 1} ${typeIcon}</span>
                <span style="color: #888; font-size: 11px;">${time} - ${change.memoryTitle || `记忆块 ${change.memoryIndex + 1}`}</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1; background: #1c1c1c; padding: 8px; border-radius: 4px; ${change.type === 'add' ? 'opacity: 0.5;' : ''}">
                    <div style="color: #e74c3c; font-size: 11px; margin-bottom: 4px;">变更前</div>
                    <div style="font-size: 12px; color: #ccc; max-height: 120px; overflow-y: auto;">
                        ${change.oldValue ? formatEntryForDisplay(change.oldValue) : '<span style="color: #666;">无</span>'}
                    </div>
                </div>
                <div style="flex: 1; background: #1c1c1c; padding: 8px; border-radius: 4px; ${change.type === 'delete' ? 'opacity: 0.5;' : ''}">
                    <div style="color: #27ae60; font-size: 11px; margin-bottom: 4px;">变更后</div>
                    <div style="font-size: 12px; color: #ccc; max-height: 120px; overflow-y: auto;">
                        ${change.newValue ? formatEntryForDisplay(change.newValue) : '<span style="color: #666;">无</span>'}
                    </div>
                </div>
            </div>
        </div>`;
    });

    detailContainer.innerHTML = html;
}

// 导出演变数据为SillyTavern世界书格式
function exportEvolutionData(entryEvolution) {
    const entries = Object.entries(entryEvolution);

    if (entries.length === 0) {
        alert('没有可导出的演变数据');
        return;
    }

    const triggerCategories = new Set(['地点', '剧情大纲']);
    const sillyTavernEntries = [];
    let entryId = 0;

    for (const [key, data] of entries) {
        const category = data.category;
        const entryName = data.entryName;
        const isTriggerCategory = triggerCategories.has(category);
        const constant = !isTriggerCategory;
        const selective = isTriggerCategory;

        // 获取最新的内容和关键词（优先使用AI总结，否则使用最后一次变更的内容）
        let content = data.summary || '';
        let keywords = [];

        if (!content && data.changes.length > 0) {
            const lastChange = data.changes[data.changes.length - 1];
            content = lastChange.newValue?.['内容'] || lastChange.oldValue?.['内容'] || '';
            keywords = lastChange.newValue?.['关键词'] || lastChange.oldValue?.['关键词'] || [];
        }

        if (!content) continue;

        // 处理关键词
        if (!Array.isArray(keywords) || keywords.length === 0) {
            keywords = [entryName];
        }
        const cleanKeywords = keywords.map(k => String(k).trim().replace(/[-_\s]+/g, ''))
            .filter(k => k.length > 0 && k.length <= 20);
        if (cleanKeywords.length === 0) cleanKeywords.push(entryName);
        const uniqueKeywords = [...new Set(cleanKeywords)];

        sillyTavernEntries.push({
            uid: entryId++,
            key: uniqueKeywords,
            keysecondary: [],
            comment: `${category} - ${entryName}`,
            content: content,
            constant,
            selective,
            selectiveLogic: 0,
            addMemo: true,
            order: entryId * 100,
            position: 0,
            disable: false,
            excludeRecursion: true,  // 默认开启不可被递归
            preventRecursion: true,  // 默认开启防止进一步递归
            delayUntilRecursion: false,
            probability: 100,
            depth: 4,
            group: category,
            groupOverride: false,
            groupWeight: 100,
            scanDepth: null,
            caseSensitive: false,
            matchWholeWords: true,
            useGroupScoring: null,
            automationId: '',
            role: 0,
            vectorized: false,
            sticky: null,
            cooldown: null,
            delay: null
        });
    }

    const exportData = { entries: sillyTavernEntries };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worldbook_evolution_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    mylog(`已导出 ${sillyTavernEntries.length} 个条目为SillyTavern世界书格式`);
}

// AI总结单个条目演变
async function summarizeSingleEntryEvolution(entryKey) {
    const entryEvolution = window.currentEntryEvolution;
    if (!entryEvolution) {
        alert('演变数据未加载');
        return;
    }

    const entryData = entryEvolution[entryKey];
    if (!entryData) {
        alert('找不到该条目的演变数据');
        return;
    }

    // 保存总结前的世界书状态
    const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

    // 构建演变描述
    const evolutionText = buildEvolutionText(entryData);

    // 调用AI总结
    const summary = await callAIForEvolutionSummary(entryData.entryName, evolutionText);

    if (summary) {
        entryData.summary = summary;

        // 更新世界书中的条目
        const category = entryData.category;
        const entryName = entryData.entryName;
        if (!generatedWorldbook[category]) {
            generatedWorldbook[category] = {};
        }

        const oldValue = generatedWorldbook[category][entryName] || null;
        const newValue = {
            '关键词': oldValue?.['关键词'] || [],
            '内容': summary
        };
        generatedWorldbook[category][entryName] = newValue;

        // 保存到修改历史
        const changedEntries = [{
            category: category,
            entryName: entryName,
            type: oldValue ? 'modify' : 'add',
            oldValue: oldValue,
            newValue: newValue
        }];

        try {
            await MemoryHistoryDB.saveHistory(
                -1,
                '记忆-演变总结',
                previousWorldbook,
                generatedWorldbook,
                changedEntries
            );
            mylog(`📚 已保存演变总结历史: ${entryName}`);
        } catch (error) {
            console.error('保存演变总结历史失败:', error);
        }

        // 刷新显示
        showEntryEvolutionDetail(entryKey, entryData);
        await NovelState.saveState(memoryQueue.length);
    }
}

// AI总结全部条目演变
async function summarizeAllEntryEvolution(entryEvolution) {
    window.currentEntryEvolution = entryEvolution;
    const entries = Object.entries(entryEvolution);

    if (entries.length === 0) {
        alert('没有可总结的条目');
        return;
    }

    const confirmMsg = `将对 ${entries.length} 个条目进行AI总结。\n这可能需要一些时间和API调用。\n\n是否继续？`;
    if (!confirm(confirmMsg)) return;

    // 保存总结前的世界书状态
    const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

    // 显示进度
    const progressDiv = document.createElement('div');
    progressDiv.id = 'summary-progress';
    progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2d2d2d; padding: 20px; border-radius: 10px; z-index: 10001; text-align: center; min-width: 300px;';
    progressDiv.innerHTML = `
        <div style="color: #9b59b6; font-size: 16px; margin-bottom: 10px;">AI总结中...</div>
        <div id="summary-progress-text" style="color: #aaa; font-size: 14px;">0 / ${entries.length}</div>
        <div style="margin-top: 10px; height: 4px; background: #333; border-radius: 2px; overflow: hidden;">
            <div id="summary-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #9b59b6, #3498db); transition: width 0.3s;"></div>
        </div>
        <button id="cancel-summary-btn" style="margin-top: 15px; background: #e74c3c; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">取消</button>
    `;
    document.body.appendChild(progressDiv);

    let cancelled = false;
    document.getElementById('cancel-summary-btn').onclick = () => {
        cancelled = true;
    };

    let completed = 0;
    for (const [key, data] of entries) {
        if (cancelled) break;

        try {
            const evolutionText = buildEvolutionText(data);
            const summary = await callAIForEvolutionSummary(data.entryName, evolutionText);
            if (summary) {
                data.summary = summary;
            }
        } catch (e) {
            console.error(`总结条目 ${key} 失败:`, e);
        }

        completed++;
        const progressText = document.getElementById('summary-progress-text');
        const progressBar = document.getElementById('summary-progress-bar');
        if (progressText) progressText.textContent = `${completed} / ${entries.length}`;
        if (progressBar) progressBar.style.width = `${(completed / entries.length) * 100}%`;
    }

    progressDiv.remove();

    // 保存总结后的世界书状态到修改历史
    if (completed > 0) {
        const allChangedEntries = [];
        for (const [key, data] of entries) {
            if (data.summary) {
                const category = data.category;
                const entryName = data.entryName;
                if (!generatedWorldbook[category]) {
                    generatedWorldbook[category] = {};
                }

                const oldValue = generatedWorldbook[category][entryName] || null;
                const newValue = {
                    '关键词': oldValue?.['关键词'] || [],
                    '内容': data.summary
                };
                generatedWorldbook[category][entryName] = newValue;

                allChangedEntries.push({
                    category: category,
                    entryName: entryName,
                    type: oldValue ? 'modify' : 'add',
                    oldValue: oldValue,
                    newValue: newValue
                });
            }
        }

        if (allChangedEntries.length > 0) {
            try {
                await MemoryHistoryDB.saveHistory(
                    -1,
                    '记忆-演变总结',
                    previousWorldbook,
                    generatedWorldbook,
                    allChangedEntries
                );
                mylog(`📚 已保存演变总结历史: ${allChangedEntries.length} 个条目`);
            } catch (error) {
                console.error('保存演变总结历史失败:', error);
            }
            await NovelState.saveState(memoryQueue.length);
        }
    }

    if (cancelled) {
        alert(`已取消，完成了 ${completed} 个条目的AI总结`);
    } else {
        alert(`已完成 ${completed} 个条目的AI总结！`);
    }

    // 刷新条目列表
    const entryListContainer = document.querySelector('#entry-evolution-modal .entry-evolution-item')?.parentElement;
    if (entryListContainer) {
        entryListContainer.innerHTML = generateEntryListHTML(entryEvolution);
        // 重新绑定点击事件
        entryListContainer.querySelectorAll('.entry-evolution-item').forEach(item => {
            item.onclick = () => {
                const entryKey = item.dataset.entryKey;
                showEntryEvolutionDetail(entryKey, entryEvolution[entryKey]);
                entryListContainer.querySelectorAll('.entry-evolution-item').forEach(i => i.style.background = '#2d2d2d');
                item.style.background = '#3d3d3d';
            };
        });
    }
}

// 构建演变描述文本
function buildEvolutionText(entryData) {
    let text = `条目名称: ${entryData.entryName}\n分类: ${entryData.category}\n\n变更历史:\n`;

    entryData.changes.forEach((change, index) => {
        const time = new Date(change.timestamp).toLocaleString('zh-CN');
        text += `\n--- 第${index + 1}次变更 (${time}, ${change.memoryTitle || `记忆块${change.memoryIndex + 1}`}) ---\n`;
        text += `类型: ${change.type === 'add' ? '新增' : change.type === 'modify' ? '修改' : '删除'}\n`;

        if (change.oldValue) {
            text += `变更前内容: ${change.oldValue['内容'] || JSON.stringify(change.oldValue)}\n`;
        }
        if (change.newValue) {
            text += `变更后内容: ${change.newValue['内容'] || JSON.stringify(change.newValue)}\n`;
        }
    });

    return text;
}

// 调用AI进行演变总结
async function callAIForEvolutionSummary(entryName, evolutionText) {
    try {
        const prompt = `请根据以下世界书条目的变更历史，总结这个条目（角色/事物/概念）的常态信息。

**重要要求：**
1. 这是为SillyTavern RPG角色卡准备的世界书条目
2. 人物状态应设置为**常态**（活着、正常状态），不能是死亡、受伤等临时状态
3. 提取该条目的核心特征、背景、能力、关系等持久性信息
4. 忽略故事中的临时变化，保留角色/事物的本质特征
5. 输出应该是精炼的、适合作为RPG世界书条目的描述

${evolutionText}

请直接输出总结内容，不要包含任何解释或前缀。`;

        mylog(`📤 [AI演变总结] 条目: ${entryName}\n完整Prompt:\n`, prompt);
        const response = await callSimpleAPI(prompt);
        mylog(`📥 [AI演变总结] 条目: ${entryName} 响应:\n`, response);
        return response;
    } catch (error) {
        console.error('AI总结失败:', error);
        return null;
    }
}

// 导出指定历史版本的世界书
async function exportHistoryWorldbook(historyId) {
    try {
        const history = await MemoryHistoryDB.getHistoryById(historyId);
        if (!history) {
            alert('找不到该历史记录');
            return;
        }

        const worldbook = history.newWorldbook;
        if (!worldbook || Object.keys(worldbook).length === 0) {
            alert('该历史记录没有世界书数据');
            return;
        }

        // 生成世界书名称
        const timestamp = new Date(history.timestamp);
        const readableTimeString = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}`;
        const worldbookName = `${history.memoryTitle || `记忆${history.memoryIndex + 1}`}-${readableTimeString}`;

        // 转换为标准世界书条目数组
        const standardEntries = convertGeneratedWorldbookToStandard(worldbook);

        // 构建SillyTavern世界书格式
        const lorebookEntries = {};
        standardEntries.forEach((entry, index) => {
            lorebookEntries[index] = {
                uid: entry.id,
                key: entry.keys,
                keysecondary: entry.secondary_keys || [],
                comment: entry.comment,
                content: entry.content,
                constant: entry.constant,
                selective: entry.selective,
                selectiveLogic: 0,
                addMemo: true,
                order: entry.priority || 100,
                position: entry.position === 'before_char' ? 0 : 1,
                disable: !entry.enabled,
                excludeRecursion: entry.exclude_recursion !== undefined ? entry.exclude_recursion : true,
                preventRecursion: entry.prevent_recursion !== undefined ? entry.prevent_recursion : true,
                probability: entry.probability || 100,
                useProbability: true,
                depth: entry.wb_depth || 4,
                role: 0,
                displayIndex: index,
                extensions: {
                    position: entry.position === 'before_char' ? 0 : 1,
                    exclude_recursion: entry.exclude_recursion !== undefined ? entry.exclude_recursion : true,
                    prevent_recursion: entry.prevent_recursion !== undefined ? entry.prevent_recursion : true,
                    probability: entry.probability || 100,
                    useProbability: true,
                    depth: entry.wb_depth || 4,
                    selectiveLogic: 0,
                    group: entry.group || '',
                    role: 0
                }
            };
        });

        const lorebookData = {
            entries: lorebookEntries,
            originalData: {
                name: worldbookName,
                description: `由妮卡角色工作室从历史记录导出 (ID: ${historyId})`,
                scan_depth: 10,
                token_budget: 2048,
                recursive_scanning: false,
                entries: standardEntries
            }
        };

        const blob = new Blob([JSON.stringify(lorebookData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = worldbookName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
        a.download = `${safeName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        mylog(`已导出历史记录 #${historyId} 的世界书 (SillyTavern世界书格式)`);
    } catch (error) {
        console.error('导出历史世界书失败:', error);
        alert('导出失败: ' + error.message);
    }
}

// ========== AI优化世界书功能 ==========
const DEFAULT_BATCH_CHANGES = 50;
let customOptimizationPrompt = null;

async function showOptimizeWorldbookModal() {
    const existingModal = document.getElementById('optimize-worldbook-modal');
    if (existingModal) existingModal.remove();

    let historyList = [];
    try {
        historyList = await MemoryHistoryDB.getAllHistory();
    } catch (e) {
        console.error('获取历史记录失败:', e);
    }

    // 从IndexedDB加载上次保存的自定义prompt
    try {
        const savedPrompt = await MemoryHistoryDB.getCustomOptimizationPrompt();
        if (savedPrompt) {
            customOptimizationPrompt = savedPrompt;
            mylog('📝 已加载上次保存的自定义Prompt');
        }
    } catch (e) {
        console.error('加载自定义Prompt失败:', e);
    }

    const entryEvolution = aggregateEntryEvolution(historyList);
    const entryCount = Object.keys(entryEvolution).length;
    let totalChanges = 0;
    for (const key in entryEvolution) {
        totalChanges += entryEvolution[key].changes.length;
    }

    const modal = document.createElement('div');
    modal.id = 'optimize-worldbook-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';

    const content = document.createElement('div');
    content.style.cssText = 'background: #2d2d2d; border-radius: 10px; padding: 25px; width: 90%; max-width: 800px; max-height: 85vh; overflow-y: auto;';
    content.innerHTML = `
        <h3 style="color: #3498db; margin: 0 0 20px 0;">🤖 AI优化世界书</h3>
        <div style="background: #1c1c1c; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="color: #e67e22; font-weight: bold; margin-bottom: 10px;">📊 当前数据统计</div>
            <div style="color: #aaa; font-size: 14px;">
                <div>• 条目数量: <span style="color: #27ae60;">${entryCount}</span> 个</div>
                <div>• 历史变更: <span style="color: #3498db;">${totalChanges}</span> 对</div>
            </div>
        </div>
        <div style="background: #1c1c1c; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="color: #9b59b6; font-weight: bold; margin-bottom: 10px;">⚙️ 优化设置</div>
            <label style="color: #aaa; font-size: 14px;">每批处理变更数:</label>
            <input type="number" id="batch-changes-input" value="${DEFAULT_BATCH_CHANGES}" min="10" max="200" 
                style="width: 100%; padding: 8px; background: #2d2d2d; border: 1px solid #555; border-radius: 4px; color: white; margin-top: 5px; margin-bottom: 15px;">
            
            <div style="margin-top: 15px;">
                <label style="color: #aaa; font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <input type="checkbox" id="use-custom-prompt" style="width: 16px; height: 16px;">
                    <span>使用自定义Prompt设定</span>
                </label>
                <div id="custom-prompt-container" style="display: none;">
                    <textarea id="custom-prompt-textarea" placeholder="在此输入自定义的优化Prompt...&#10;&#10;提示：可以使用 {{条目}} 作为占位符，系统会自动替换为实际条目内容。" 
                        style="width: 100%; min-height: 150px; padding: 10px; background: #2d2d2d; border: 1px solid #555; border-radius: 4px; color: white; font-family: monospace; font-size: 13px; resize: vertical; margin-bottom: 10px;">${customOptimizationPrompt || ''}</textarea>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="file" id="prompt-file-input" accept=".txt,.md" style="display: none;">
                        <button id="import-prompt-btn" style="background: #27ae60; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">📁 导入文件</button>
                        <button id="reset-prompt-btn" style="background: #3498db; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">📄 显示默认提示词</button>
                        <span id="prompt-file-status" style="color: #888; font-size: 12px;"></span>
                    </div>
                </div>
            </div>
        </div>
        <div style="background: #1a3a1a; border: 1px solid #27ae60; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="color: #27ae60; font-weight: bold; margin-bottom: 10px;">✨ 优化目标</div>
            <div style="color: #ccc; font-size: 13px; line-height: 1.6;">
                • 将条目优化为<strong>常态描述</strong>（适合RPG）<br>
                • 人物状态设为正常，忽略临时变化<br>
                • 优化后将<strong>覆盖</strong>现有世界书条目
            </div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancel-optimize-btn" style="background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">取消</button>
            <button id="start-optimize-btn" style="background: #3498db; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">🚀 开始优化</button>
        </div>
    `;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // 绑定自定义prompt开关
    const useCustomPromptCheckbox = document.getElementById('use-custom-prompt');
    const customPromptContainer = document.getElementById('custom-prompt-container');
    const customPromptTextarea = document.getElementById('custom-prompt-textarea');

    useCustomPromptCheckbox.onchange = () => {
        customPromptContainer.style.display = useCustomPromptCheckbox.checked ? 'block' : 'none';
    };

    // 监听textarea内容变化，自动保存到IndexedDB
    let saveTimeout = null;
    customPromptTextarea.addEventListener('input', () => {
        // 使用防抖，避免频繁保存
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const promptText = customPromptTextarea.value.trim();
            try {
                await MemoryHistoryDB.saveCustomOptimizationPrompt(promptText);
                mylog('💾 已自动保存自定义Prompt到IndexedDB');
            } catch (error) {
                console.error('保存自定义Prompt失败:', error);
            }
        }, 1000); // 1秒后保存
    });

    // 绑定导入文件按钮
    document.getElementById('import-prompt-btn').onclick = () => {
        document.getElementById('prompt-file-input').click();
    };

    // 绑定文件选择
    document.getElementById('prompt-file-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const statusSpan = document.getElementById('prompt-file-status');
            statusSpan.textContent = '正在读取...';
            statusSpan.style.color = '#3498db';

            // 使用detectBestEncoding函数自动检测编码
            const { encoding, content } = await detectBestEncoding(file);

            document.getElementById('custom-prompt-textarea').value = content;
            statusSpan.textContent = `已导入: ${file.name} (${encoding})`;
            statusSpan.style.color = '#27ae60';

            mylog(`📁 已导入Prompt文件: ${file.name}, 编码: ${encoding}, 长度: ${content.length}`);
        } catch (error) {
            console.error('导入Prompt文件失败:', error);
            document.getElementById('prompt-file-status').textContent = '导入失败';
            document.getElementById('prompt-file-status').style.color = '#e74c3c';
            alert('导入文件失败: ' + error.message);
        }
    };

    // 绑定显示默认提示词按钮
    document.getElementById('reset-prompt-btn').onclick = () => {
        const defaultPrompt = `你是RPG世界书优化专家。为每个条目生成**常态描述**。

**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化JSON,包含以下字段:
   - name: 角色名称【必填】
   - gender: 性别【必填】
   - age_appearance: 外观年龄
   - origin: 出身背景（position职位、背景描述等）
   - affiliation: 所属组织/阵营
   - appearance: 外观描述（发色、发型、瞳色、肤色、体型、服装、配件、特征等）【必填】
   - personality: 性格特征【必填】,必须包含:
     * core_traits: 核心特质
     * speech_style: 说话风格【必填】- 详细描述语气、用词习惯、表达方式
     * sample_dialogue: 示例对话【必填】- 至少5条典型对话示例
     * background_psychology: 心理背景
     * social_style: 社交风格
   - role_illustration: 角色定位说明
   - support_relations: 与其他角色的关系
   - style_tags: 风格标签
5. **对于非角色条目**（地点、物品、设定等），生成简洁的描述性内容

**输出JSON格式：**
{
  "条目名1": {
    "关键词": ["关键词1", "关键词2"],
    "内容": "对于角色，这里应该是完整的JSON字符串；对于非角色，这里是描述文本"
  }
}

**条目：**
{{条目}}
直接输出JSON。`;

        document.getElementById('custom-prompt-textarea').value = defaultPrompt;
        document.getElementById('prompt-file-status').textContent = '已加载默认提示词';
        document.getElementById('prompt-file-status').style.color = '#3498db';
    };

    document.getElementById('cancel-optimize-btn').onclick = () => { modal.remove(); showViewWorldbookModal(); };
    document.getElementById('start-optimize-btn').onclick = async () => {
        const batchSize = parseInt(document.getElementById('batch-changes-input').value) || DEFAULT_BATCH_CHANGES;

        // 保存自定义prompt
        if (useCustomPromptCheckbox.checked) {
            const promptText = document.getElementById('custom-prompt-textarea').value.trim();
            customOptimizationPrompt = promptText || null;
        } else {
            customOptimizationPrompt = null;
        }

        modal.remove();
        await startBatchOptimization(entryEvolution, batchSize);
    };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function startBatchOptimization(entryEvolution, batchSize) {
    const entries = Object.entries(entryEvolution);
    if (entries.length === 0) { alert('没有可优化的条目'); showViewWorldbookModal(); return; }

    const batches = [];
    let currentBatch = [], currentBatchChanges = 0;
    for (const [key, data] of entries) {
        const entryChanges = data.changes.length;
        if (currentBatchChanges + entryChanges > batchSize && currentBatch.length > 0) {
            batches.push([...currentBatch]);
            currentBatch = [];
            currentBatchChanges = 0;
        }
        currentBatch.push({ key, data });
        currentBatchChanges += entryChanges;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    // 保存优化前的世界书状态
    const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

    const progressDiv = document.createElement('div');
    progressDiv.id = 'optimize-progress';
    progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2d2d2d; padding: 25px; border-radius: 10px; z-index: 10001; text-align: center; min-width: 350px;';
    progressDiv.innerHTML = `
        <div style="color: #3498db; font-size: 18px; margin-bottom: 15px;">🤖 AI优化世界书中...</div>
        <div id="optimize-progress-text" style="color: #aaa; font-size: 14px; margin-bottom: 10px;">批次 0 / ${batches.length}</div>
        <div style="height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-bottom: 15px;">
            <div id="optimize-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #3498db, #27ae60); transition: width 0.3s;"></div>
        </div>
        <button id="cancel-optimize-progress-btn" style="background: #e74c3c; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">取消</button>
    `;
    document.body.appendChild(progressDiv);

    let cancelled = false;
    document.getElementById('cancel-optimize-progress-btn').onclick = () => { cancelled = true; };

    let completedBatches = 0, optimizedEntries = 0;
    const allChangedEntries = [];

    for (let i = 0; i < batches.length; i++) {
        if (cancelled) break;
        document.getElementById('optimize-progress-text').textContent = `批次 ${i + 1} / ${batches.length}`;
        try {
            const batchPrompt = buildBatchOptimizationPrompt(batches[i]);
            const entryNames = batches[i].map(b => b.data.entryName).join(', ');
            mylog(`📤 [AI优化世界书] 批次 ${i + 1}/${batches.length} 条目: ${entryNames}\n完整Prompt:\n`, batchPrompt);
            const response = await callSimpleAPI(batchPrompt);
            mylog(`📥 [AI优化世界书] 批次 ${i + 1}/${batches.length} 响应:\n`, response);
            const batchChanges = await applyBatchOptimizationResult(response, batches[i], previousWorldbook);
            allChangedEntries.push(...batchChanges);
            optimizedEntries += batches[i].length;
        } catch (error) { console.error(`批次 ${i + 1} 优化失败:`, error); }
        completedBatches++;
        document.getElementById('optimize-progress-bar').style.width = `${(completedBatches / batches.length) * 100}%`;
    }

    progressDiv.remove();

    // 保存修改历史
    if (allChangedEntries.length > 0) {
        try {
            await MemoryHistoryDB.saveHistory(
                -1,
                '记忆-优化',
                previousWorldbook,
                generatedWorldbook,
                allChangedEntries
            );
            mylog(`📚 已保存优化历史: ${allChangedEntries.length} 个条目`);
        } catch (error) {
            console.error('保存优化历史失败:', error);
        }
    }

    alert(cancelled ? `优化已取消，完成了 ${optimizedEntries} 个条目` : `优化完成！优化了 ${optimizedEntries} 个条目`);
    await NovelState.saveState(memoryQueue.length);
    showViewWorldbookModal();
}

function buildBatchOptimizationPrompt(batch) {
    // 构建条目内容部分
    let entriesContent = '';
    batch.forEach(({ data }) => {
        entriesContent += `\n--- ${data.entryName} [${data.category}] ---\n`;
        data.changes.forEach((change, i) => {
            if (change.newValue?.['内容']) {
                entriesContent += `${change.newValue['内容'].substring(0, 300)}...\n`;
            }
        });
    });

    // 如果有自定义prompt，使用自定义prompt
    if (customOptimizationPrompt) {
        // 替换占位符
        let prompt = customOptimizationPrompt.replace(/\{\{条目\}\}/g, entriesContent);
        mylog('📝 使用自定义Prompt');
        return prompt;
    }

    // 否则使用默认prompt
    let prompt = `你是RPG世界书优化专家。为每个条目生成**常态描述**。

**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化JSON,包含以下字段:
   - name: 角色名称【必填】
   - gender: 性别【必填】
   - age_appearance: 外观年龄
   - origin: 出身背景（position职位、背景描述等）
   - affiliation: 所属组织/阵营
   - appearance: 外观描述（发色、发型、瞳色、肤色、体型、服装、配件、特征等）【必填】
   - personality: 性格特征【必填】,必须包含:
     * core_traits: 核心特质
     * speech_style: 说话风格【必填】- 详细描述语气、用词习惯、表达方式
     * sample_dialogue: 示例对话【必填】- 至少5条典型对话示例
     * background_psychology: 心理背景
     * social_style: 社交风格
   - role_illustration: 角色定位说明
   - support_relations: 与其他角色的关系
   - style_tags: 风格标签
5. **对于非角色条目**（地点、物品、设定等），生成简洁的描述性内容

**输出JSON格式：**
{
  "条目名1": {
    "关键词": ["关键词1", "关键词2"],
    "内容": "对于角色，这里应该是完整的JSON字符串；对于非角色，这里是描述文本"
  }
}

**条目：**
${entriesContent}
直接输出JSON。`;

    return prompt;
}

// 应用批量优化结果
async function applyBatchOptimizationResult(response, batch, previousWorldbook) {
    let result;

    try {
        // 清理响应
        let cleanResponse = response.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const firstBrace = cleanResponse.indexOf('{');
        const lastBrace = cleanResponse.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
        }

        result = JSON.parse(cleanResponse);
    } catch (e) {
        console.error('解析优化结果失败:', e);
        return [];
    }

    const changedEntries = [];

    // 更新世界书中的条目
    for (const { key, data } of batch) {
        const entryName = data.entryName;
        const category = data.category;

        // 查找匹配的优化结果
        const optimized = result[entryName];
        if (optimized) {
            // 确保分类存在
            if (!generatedWorldbook[category]) {
                generatedWorldbook[category] = {};
            }

            // 记录旧值
            const oldValue = previousWorldbook[category]?.[entryName] || null;

            // 更新条目
            const newValue = {
                '关键词': optimized['关键词'] || data.changes[data.changes.length - 1]?.newValue?.['关键词'] || [],
                '内容': optimized['内容'] || ''
            };
            generatedWorldbook[category][entryName] = newValue;

            // 记录变更
            changedEntries.push({
                category: category,
                entryName: entryName,
                type: oldValue ? 'modify' : 'add',
                oldValue: oldValue,
                newValue: newValue
            });

            mylog(`✅ 已优化条目: [${category}] ${entryName}`);
        }
    }

    return changedEntries;
}


// ========== 世界书条目折叠功能 ==========
// 存储折叠状态的键名
const WB_FOLD_STATE_KEY = 'worldbookFoldStates';

// 全局标志：是否跳过恢复折叠状态（用于新导入的角色）
let skipRestoreFoldStates = false;

// 内存缓存，用于同步访问
let foldStatesCache = null;

// IndexedDB 折叠状态管理
const FoldStateDB = {
    dbName: 'FoldStateDB',
    storeName: 'foldStates',
    db: null,

    async openDB() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    },

    async loadToCache() {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(WB_FOLD_STATE_KEY);

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    foldStatesCache = request.result?.value || {};
                    resolve(foldStatesCache);
                };
                request.onerror = () => {
                    foldStatesCache = {};
                    resolve(foldStatesCache);
                };
            });
        } catch (error) {
            console.error('加载折叠状态失败:', error);
            foldStatesCache = {};
            return foldStatesCache;
        }
    },

    async saveFromCache() {
        if (!foldStatesCache) return;

        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            store.put({
                key: WB_FOLD_STATE_KEY,
                value: foldStatesCache
            });
        } catch (error) {
            console.error('保存折叠状态失败:', error);
        }
    }
};

// 初始化缓存（页面加载时调用）
(async function initFoldStateCache() {
    await FoldStateDB.loadToCache();

    // 从 localStorage 迁移数据（兼容旧版本）
    const oldData = localStorage.getItem(WB_FOLD_STATE_KEY);
    if (oldData && Object.keys(foldStatesCache).length === 0) {
        try {
            foldStatesCache = JSON.parse(oldData);
            await FoldStateDB.saveFromCache();
            localStorage.removeItem(WB_FOLD_STATE_KEY);
            mylog('已从 localStorage 迁移折叠状态到 IndexedDB');
        } catch (e) {
            console.error('迁移折叠状态失败:', e);
        }
    }
})();

// 获取当前角色的折叠状态（同步方法）
function getWorldbookFoldStates() {
    const charId = document.getElementById('charId')?.value || 'default';
    if (!foldStatesCache) {
        foldStatesCache = {};
    }
    return foldStatesCache[charId] || {};
}

// 保存折叠状态（同步方法，异步持久化）
function saveWorldbookFoldState(entryId, isFolded) {
    const charId = document.getElementById('charId')?.value || 'default';

    if (!foldStatesCache) {
        foldStatesCache = {};
    }

    if (!foldStatesCache[charId]) {
        foldStatesCache[charId] = {};
    }

    foldStatesCache[charId][entryId] = isFolded;

    // 异步保存到 IndexedDB（不阻塞）
    FoldStateDB.saveFromCache();
}

// 切换世界书条目的折叠状态
window.toggleWorldbookEntry = function (button) {
    const entry = button.closest('.worldbook-entry');
    if (!entry) return;

    const entryGrid = entry.querySelector('.entry-grid');
    const entryId = entry.dataset.entryId;

    if (!entryGrid) return;

    // 切换折叠状态
    const isFolded = entryGrid.style.display === 'none';

    // 应用新状态
    applyFoldStateToEntry(entry, !isFolded);

    // 保存状态
    if (entryId) {
        saveWorldbookFoldState(entryId, !isFolded);
    }
};

// 应用折叠状态到条目
function applyFoldStateToEntry(entry, shouldFold) {
    const entryGrid = entry.querySelector('.entry-grid');
    const childEntries = entry.querySelector('.child-entries');
    const toggleBtn = entry.querySelector('.wb-fold-toggle');
    const arrow = toggleBtn ? toggleBtn.querySelector('.toggle-arrow') : null;
    const collapsedTitle = entry.querySelector('.entry-collapsed-title');
    const expandedControls = entry.querySelector('.entry-expanded-controls');
    const entryActions = entry.querySelector('.entry-actions');

    if (!entryGrid) return;

    if (shouldFold) {
        // 折叠状态：显示只读标题，隐藏输入控件和操作按钮
        entryGrid.style.display = 'none';
        if (childEntries) childEntries.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(-45deg)';
        if (collapsedTitle) collapsedTitle.style.display = 'block';
        if (expandedControls) expandedControls.style.display = 'none';
        if (entryActions) entryActions.style.display = 'none';
    } else {
        // 展开状态：显示输入控件和操作按钮，隐藏只读标题
        entryGrid.style.display = '';
        if (childEntries) childEntries.style.display = '';
        if (arrow) arrow.style.transform = 'rotate(45deg)';
        if (collapsedTitle) collapsedTitle.style.display = 'none';
        if (expandedControls) expandedControls.style.display = 'flex';
        if (entryActions) entryActions.style.display = 'flex';
    }
}

// 恢复所有条目的折叠状态
function restoreWorldbookFoldStates() {
    // 如果设置了跳过标志，则不恢复状态
    if (skipRestoreFoldStates) {
        mylog('跳过恢复折叠状态（新导入的角色）');
        skipRestoreFoldStates = false; // 重置标志
        return;
    }

    const foldStates = getWorldbookFoldStates();
    const entries = document.querySelectorAll('.worldbook-entry');

    entries.forEach(entry => {
        const entryId = entry.dataset.entryId;
        if (entryId && foldStates.hasOwnProperty(entryId)) {
            applyFoldStateToEntry(entry, foldStates[entryId]);
        }
    });
}

// 折叠所有条目（用于导入时）
function foldAllWorldbookEntries() {
    const entries = document.querySelectorAll('.worldbook-entry');
    entries.forEach(entry => {
        applyFoldStateToEntry(entry, true);
        // 保存折叠状态
        const entryId = entry.dataset.entryId;
        if (entryId) {
            saveWorldbookFoldState(entryId, true);
        }
    });
}

// 展开指定条目（用于新建时）
function expandWorldbookEntry(entryElement) {
    if (!entryElement) return;
    applyFoldStateToEntry(entryElement, false);

    // 保存展开状态
    const entryId = entryElement.dataset.entryId;
    if (entryId) {
        saveWorldbookFoldState(entryId, false);
    }
}

// 点击折叠状态的标题展开条目
window.expandWorldbookEntryByTitle = function (titleElement) {
    const entry = titleElement.closest('.worldbook-entry');
    if (!entry) return;

    // 展开条目
    applyFoldStateToEntry(entry, false);

    // 保存展开状态
    const entryId = entry.dataset.entryId;
    if (entryId) {
        saveWorldbookFoldState(entryId, false);
    }
};

// 更新折叠状态下显示的标题
window.updateCollapsedTitle = function (inputElement) {
    const entry = inputElement.closest('.worldbook-entry');
    if (!entry) return;

    const collapsedTitle = entry.querySelector('.entry-collapsed-title h4');
    if (collapsedTitle) {
        collapsedTitle.textContent = inputElement.value || t('new-entry');
    }
};

// 更新折叠状态下的位置和优先级显示
window.updateCollapsedInfo = function (entryElement) {
    if (!entryElement) return;

    // 获取当前条目的数据
    const position = parseInt(entryElement.querySelector('.wb-position')?.value || 0);
    const role = parseInt(entryElement.querySelector('.wb-role')?.value || 0);
    const depth = parseInt(entryElement.querySelector('.wb-depth')?.value || 4);
    const priority = parseInt(entryElement.querySelector('.wb-priority')?.value || 0);

    // 更新位置标记
    const positionBadge = entryElement.querySelector('.entry-position-badge');
    if (positionBadge) {
        positionBadge.textContent = getPositionBadgeText({ position, role, depth });
    }

    // 更新优先级标记
    const priorityBadge = entryElement.querySelector('.entry-priority-badge');
    if (priorityBadge) {
        priorityBadge.textContent = `${priority}`;
    }
};


// 全局展开/折叠所有世界书条目
function toggleAllWorldbookEntries() {
    const entries = document.querySelectorAll('.worldbook-entry');
    const toggleBtn = document.getElementById('toggle-all-worldbook-btn');

    if (entries.length === 0) return;

    // 检查第一个条目的状态来决定是展开还是折叠
    const firstEntry = entries[0];
    const firstEntryGrid = firstEntry.querySelector('.entry-grid');
    const shouldFold = firstEntryGrid && firstEntryGrid.style.display !== 'none';

    // 应用到所有条目
    entries.forEach(entry => {
        applyFoldStateToEntry(entry, shouldFold);

        // 保存折叠状态
        const entryId = entry.dataset.entryId;
        if (entryId) {
            saveWorldbookFoldState(entryId, shouldFold);
        }
    });

    // 更新按钮状态
    if (toggleBtn) {
        if (shouldFold) {
            toggleBtn.classList.add('collapsed');
            toggleBtn.title = '展开所有条目';
        } else {
            toggleBtn.classList.remove('collapsed');
            toggleBtn.title = '折叠所有条目';
        }
    }

    mylog(shouldFold ? '已折叠所有条目' : '已展开所有条目');
}
