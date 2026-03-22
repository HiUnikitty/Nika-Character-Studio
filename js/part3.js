// 显示指令编辑模态框
function showInstructionModal(instruction = null) {
const isEdit = instruction !== null;
const modalTitle = isEdit ? t('edit-instruction') : t('instruction-beautify');

// 创建模态框HTML
const modalHtml = `
<div id="instruction-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center;">
    <div style="background: var(--bg-color); border-radius: 10px; padding: 20px; max-width: 900px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column;">
        <h3>${modalTitle}</h3>
        <div style="margin-bottom: 15px;">
            <label id="instruction-name-label">名称：</label>
            <input type="text" id="instruction-name-input" value="${
                instruction ? instruction.name : ''
            }" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 15px;">
            <label id="instruction-content-label">${t('instruction-content')}</label>
            <textarea id="instruction-content-input" rows="8" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; box-sizing: border-box;">${
                instruction ? instruction.content : '[系统指令]: '
            }</textarea>
            <div style="margin-top: 8px;">
                <button id="preview-instruction-btn" onclick="previewInstructionHTML()" style="background: #6c757d; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 8px;">📄 前端预览</button>
                <button id="ai-modify-instruction-btn" onclick="showInstructionAIModify()" style="background: #6c757d; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🤖 AI帮我改</button>
            </div>
        </div>
        <div style="margin-bottom: 15px;">
            <label id="template-import-label">模板导入：</label>
            <select id="template-select" onchange="applyTemplate()" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); box-sizing: border-box;">
                <option value="" data-i18n="select-template">选择预设模板...</option>
                ${Object.entries(instructionTemplates)
                    .map(
                    ([key, template]) =>
                        `<option value="${key}" ${template.isCustom ? 'data-custom="true"' : ''}>${
                        template.name
                        }</option>`,
                    )
                    .join('')}
            </select>
        </div>
        <div style="margin-bottom: 15px; padding: 12px; background: transparent;">
            <div style="display: flex; align-items: center; justify-content: space-between; color: white;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">💡</span>
                    <span id="tavern-helper-tip" style="font-size: 14px; font-weight: 500;">安装酒馆助手，并开启(简洁)预设的Main Prompt开关。</span>
                </div>
                <button id="tutorial-btn" onclick="showTutorialModal()" style="background: #007bff; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">📖 小白教程</button>
            </div>
        </div>
        <div style="margin-bottom: 20px;">
            <button id="ai-beautify-btn" onclick="showFrontendBeautifyModal()" style="background-color: var(--ai-button-bg); color: white; padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer;">🔮 AI前端美化</button>
            <button id="save-template-btn" onclick="saveAsCustomTemplate()" style="background: #6c757d; color: white; padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">💾 保存为模板</button>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="cancel-instruction-btn" onclick="closeInstructionModal()" style="background: #6c757d; color: white; padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer;">取消</button>
            <button id="save-instruction-btn" onclick="saveInstruction(${
                isEdit ? instruction.id : 'null'
            })" style="background: #FF9800; color: white; padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer;">${t('add-to-settings')}</button>
        </div>
    </div>
</div>
`;

// 添加到页面
document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 保存为自定义模板
function saveAsCustomTemplate() {
const nameInput = document.getElementById('instruction-name-input');
const contentInput = document.getElementById('instruction-content-input');

const name = nameInput.value.trim();
const content = contentInput.value.trim();

if (!name || !content) {
    alert(t('template-name-content-required'));
    return;
}

saveCustomTemplate(name, content)
    .then(() => {
    alert(t('template-save-success'));
    // 重新生成模板选择框
    const select = document.getElementById('template-select');
    const currentValue = select.value;
    select.innerHTML = `
        <option value="">${t('select-template')}</option>
        ${Object.entries(instructionTemplates)
            .map(
            ([key, template]) =>
                `<option value="${key}" ${template.isCustom ? 'data-custom="true"' : ''}>${
                template.name
                }</option>`,
            )
            .join('')}
    `;
    select.value = currentValue;
    })
    .catch(error => {
    alert(t('template-save-failed', {error: error}));
    });
}

// 应用模板
function applyTemplate() {
const select = document.getElementById('template-select');
const nameInput = document.getElementById('instruction-name-input');
const contentInput = document.getElementById('instruction-content-input');

const templateKey = select.value;
if (templateKey && instructionTemplates[templateKey]) {
    const template = instructionTemplates[templateKey];
    nameInput.value = template.name.replace(' (自定义)', ''); // 移除自定义标记
    contentInput.value = template.content;

    // 显示功能按钮
    const templateDiv = select.parentElement;
    const existingBtn = templateDiv.querySelector('.template-action-btn');
    if (existingBtn) {
    existingBtn.remove();
    }

    if (template.isCustom) {
    // 自定义模板显示删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = t('delete-template-btn');
    deleteBtn.style.cssText =
        'background: #6c757d; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 10px;';
    deleteBtn.onclick = () => deleteTemplateFromModal(template.id);
    deleteBtn.className = 'template-action-btn';
    templateDiv.appendChild(deleteBtn);
    }
}
}

// 从模态框中删除模板
function deleteTemplateFromModal(templateId) {
if (confirm(t('confirm-delete-template'))) {
    deleteCustomTemplate(templateId)
    .then(() => {
        alert(t('template-deleted'));
        // 重新生成模板选择框
        const select = document.getElementById('template-select');
        select.innerHTML = `
            <option value="">${t('select-template')}</option>
            ${Object.entries(instructionTemplates)
                .map(
                ([key, template]) =>
                    `<option value="${key}" ${template.isCustom ? 'data-custom="true"' : ''}>${
                    template.name
                    }</option>`,
                )
                .join('')}
        `;
        // 移除功能按钮
        const actionBtn = document.querySelector('.template-action-btn');
        if (actionBtn) actionBtn.remove();
    })
    .catch(error => {
        alert(t('template-delete-failed', {error: error}));
    });
}
}

// AI帮助改进指令
function requestAiHelp() {
const contentInput = document.getElementById('instruction-content-input');
const currentContent = contentInput.value;

const userRequest = prompt('请描述您希望AI如何改进这个指令：');
if (!userRequest) return;

// 这里可以集成AI API来改进指令
alert(t('ai-improve-in-development'));
}

// 保存指令
function saveInstruction(instructionId) {
const nameInput = document.getElementById('instruction-name-input');
const contentInput = document.getElementById('instruction-content-input');

const name = nameInput.value.trim();
const content = contentInput.value.trim();

if (!name && !content) {
    alert(t('instruction-name-content-required'));
    return;
}

if (!name) {
    alert(t('instruction-name-required'));
    // 自动聚焦到名称输入框
    nameInput.focus();
    nameInput.style.border = '2px solid #ff4444';
    setTimeout(() => {
    nameInput.style.border = '';
    }, 3000);
    return;
}

if (!content) {
    alert(t('instruction-content-required'));
    contentInput.focus();
    contentInput.style.border = '2px solid #ff4444';
    setTimeout(() => {
    contentInput.style.border = '';
    }, 3000);
    return;
}

if (instructionId) {
    // 编辑现有指令 - 先删除旧指令再添加新指令以精准更新
    const instruction = instructionsData.find(inst => inst.id == instructionId);
    if (instruction) {
    const oldName = instruction.name;
    // 如果名称改变了，需要先从系统设定中删除旧指令
    if (oldName !== name) {
        deleteInstructionFromSystemPrompt(oldName);
    }
    // 更新指令数据
    instruction.name = name;
    instruction.content = content;
    }
} else {
    // 添加新指令
    const newInstruction = {
    id: Date.now() + Math.random(),
    name: name,
    content: content,
    enabled: false,
    renderEnabled: false,
    };
    instructionsData.push(newInstruction);
}

renderInstructionCards();
updateSystemPromptWithInstructions();
closeInstructionModal();
}

// 关闭模态框
function closeInstructionModal() {
const modal = document.getElementById('instruction-modal');
if (modal) {
    modal.remove();
}

// 同时清除撤销通知
const notification = document.getElementById('undo-notification');
if (notification) {
    notification.remove();
}
}

// 刷新指令系统显示
function refreshInstructionSystem() {
const systemPromptTextarea = document.getElementById('system_prompt');
if (systemPromptTextarea && systemPromptTextarea.value) {
    instructionsData = parseInstructionsFromSystemPrompt(systemPromptTextarea.value);
    renderInstructionCards();
}
}

// 初始化指令系统
function initializeInstructionSystem() {
// 从系统设定中解析现有指令
refreshInstructionSystem();

// 监听系统设定变化
const systemPromptTextarea = document.getElementById('system_prompt');
if (systemPromptTextarea) {
    systemPromptTextarea.addEventListener('input', function () {
    const newInstructions = parseInstructionsFromSystemPrompt(this.value);
    if (newInstructions.length !== instructionsData.length) {
        instructionsData = newInstructions;
        renderInstructionCards();
    }
    });
    
    // 移除focus事件监听，避免点击系统设定框时清空指令列表
    // systemPromptTextarea.addEventListener('focus', function () {
    //   refreshInstructionSystem();
    // });
}
}

// IndexedDB存储自定义模板
let customTemplateDB = null;

// 初始化自定义模板存储
function initializeCustomTemplateStorage() {
const request = indexedDB.open('CustomTemplateDB', 1);

request.onupgradeneeded = event => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('templates')) {
    const objectStore = db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
    objectStore.createIndex('name', 'name', { unique: false });
    objectStore.createIndex('created', 'created', { unique: false });
    }

    // 创建设置存储
    if (!db.objectStoreNames.contains('settings')) {
    const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
    settingsStore.createIndex('updated', 'updated', { unique: false });
    }
};

request.onsuccess = event => {
    customTemplateDB = event.target.result;
    loadCustomTemplates();

    // 加载酒馆助手状态
    // 临时禁用酒馆助手状态检查，避免未定义函数错误
    // loadTavernHelperStatus().then(savedStatus => {
    //   if (savedStatus !== null) {
    //     tavernHelperInstalled = savedStatus;
    //   }
    // });
    tavernHelperInstalled = true; // 默认设为已安装
};

request.onerror = event => {
    console.error('自定义模板数据库初始化失败:', event.target.error);
};
}

// 保存自定义模板
function saveCustomTemplate(name, content) {
if (!customTemplateDB) return Promise.reject('数据库未初始化');

return new Promise((resolve, reject) => {
    const transaction = customTemplateDB.transaction(['templates'], 'readwrite');
    const objectStore = transaction.objectStore('templates');

    const template = {
    name: name,
    content: content,
    created: new Date().toISOString(),
    };

    const request = objectStore.add(template);

    request.onsuccess = () => {
    resolve(template);
    loadCustomTemplates(); // 重新加载模板列表
    };

    request.onerror = () => {
    reject(request.error);
    };
});
}

// 加载自定义模板
function loadCustomTemplates() {
if (!customTemplateDB) return;

const transaction = customTemplateDB.transaction(['templates'], 'readonly');
const objectStore = transaction.objectStore('templates');
const request = objectStore.getAll();

request.onsuccess = () => {
    const customTemplates = request.result;
    // 将自定义模板添加到模板列表中
    customTemplates.forEach(template => {
    const key = 'custom-' + template.id;
    instructionTemplates[key] = {
        name: template.name + ' (自定义)',
        content: template.content,
        isCustom: true,
        id: template.id,
    };
    });
};
}

// 删除自定义模板
function deleteCustomTemplate(templateId) {
if (!customTemplateDB) return Promise.reject('数据库未初始化');

return new Promise((resolve, reject) => {
    const transaction = customTemplateDB.transaction(['templates'], 'readwrite');
    const objectStore = transaction.objectStore('templates');
    const request = objectStore.delete(templateId);

    request.onsuccess = () => {
    // 从内存中移除模板
    delete instructionTemplates['custom-' + templateId];
    resolve();
    loadCustomTemplates(); // 重新加载模板列表
    };

    request.onerror = () => {
    reject(request.error);
    };
});
}

// 前端美化功能
function showFrontendBeautifyModal() {
// 先关闭可能存在的旧模态框
closeFrontendBeautifyModal();

const modal = document.createElement('div');
modal.className = 'modal-overlay';
modal.id = 'frontend-beautify-modal';
modal.style.cssText =
    'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 1000;';

modal.innerHTML = `
<div class="modal-content" style="background: var(--card-bg); border-radius: 10px; padding: 20px; width: 95%; height: 90%; overflow-y: auto; display: flex; flex-direction: column;">
    <h3 style="margin-top: 0; color: var(--text-color);">${t('beautify-modal-title')}</h3>
    <p style="color: var(--text-color); margin-bottom: 15px;">${t('beautify-modal-desc')}</p>
    
    <div style="margin-bottom: 15px;">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px;">${t('beautify-count-label')}</label>
        <select id="beautify-count" style="width: 100px; padding: 5px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color);">
            <option value="3">${t('beautify-count-3')}</option>
            <option value="5" selected>${t('beautify-count-5')}</option>
            <option value="8">${t('beautify-count-8')}</option>
        </select>
    </div>
    
    <div style="margin-bottom: 15px;">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px;">${t('beautify-lines-label')}</label>
        <select id="beautify-lines" style="width: 120px; padding: 5px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color);">
            <option value="50">${t('beautify-lines-50')}</option>
            <option value="80" selected>${t('beautify-lines-80')}</option>
            <option value="100">${t('beautify-lines-100')}</option>
            <option value="不限制">${t('beautify-lines-unlimited')}</option>
        </select>
    </div>
    
    <div style="margin-bottom: 15px;">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px;">${t('beautify-requirements-label')}</label>
        <textarea id="beautify-requirements" placeholder="${t('beautify-requirements-placeholder')}" style="width: 100%; height: 80px; padding: 12px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; font-size: 14px; line-height: 1.4; box-sizing: border-box;"></textarea>
    </div>
    
    <div id="beautify-results" style="margin-top: 20px;"></div>
    
    <div style="margin-top: 20px; text-align: right;">
        <button id="generate-beautify-btn" style="background: #FF9800; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">${t('beautify-generate-btn')}</button>
        <button id="cancel-beautify-btn" style="background: #6c757d; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer;">${t('beautify-cancel-btn')}</button>
    </div>
</div>
`;

document.body.appendChild(modal);

// 使用事件委托而不是onclick属性
const generateBtn = modal.querySelector('#generate-beautify-btn');
const cancelBtn = modal.querySelector('#cancel-beautify-btn');

generateBtn.addEventListener('click', generateBeautifiedStyles);
cancelBtn.addEventListener('click', closeFrontendBeautifyModal);

// modal.addEventListener('click', e => {
//     if (e.target === modal) {
//     closeFrontendBeautifyModal();
//     }
// });
}

function closeFrontendBeautifyModal() {
const modal = document.getElementById('frontend-beautify-modal');
if (modal) {
    modal.remove();
}
// 只清理前端美化相关的模态框，保护API设置模态框
const dynamicModals = document.querySelectorAll('.modal-overlay');
dynamicModals.forEach(m => {
    // 只删除动态创建的模态框，保留预定义的API设置模态框
    if (m.id !== 'api-settings-modal' && !m.querySelector('#api-settings-modal')) {
    m.remove();
    }
});
}

async function generateBeautifiedStyles() {
const count = document.getElementById('beautify-count').value;
const lines = document.getElementById('beautify-lines').value;
const requirements = document.getElementById('beautify-requirements').value;
const resultsDiv = document.getElementById('beautify-results');
const generateBtn = document.getElementById('generate-beautify-btn');

// 禁用生成按钮并显示加载状态
const originalText = generateBtn.textContent;
generateBtn.disabled = true;
generateBtn.textContent = '🔄 生成中...';
generateBtn.style.opacity = '0.6';
generateBtn.style.cursor = 'not-allowed';

resultsDiv.innerHTML =
    `<div style="text-align: center; color: var(--text-color); padding: 20px;"><div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #FF9800; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>${t('beautify-generating')}</div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;

// 读取当前角色信息
const characterInfo = {
    name: document.getElementById('name')?.value || '',
    gender: document.getElementById('gender')?.value || '',

    description: document.getElementById('description')?.value || '',
    personality: document.getElementById('personality')?.value || '',
    scenario: document.getElementById('scenario')?.value || '',
    tags: document.getElementById('tags')?.value || '',
    system_prompt: document.getElementById('system_prompt')?.value || '',
};
let prompt = getLanguagePrefix();
// 构建包含角色信息的AI提示词
if (requirements.trim()) {
    prompt += `**核心要求: ${requirements.trim()}**\n\n`;
    // 处理行数限制的文本
    const linesText = lines === '不限制' ? '行数不限制' : `不超过${lines}行`;
    prompt += `请生成${count}个不同风格的HTML样式，严格按照用户的核心要求来设计。要求：\n1. 每个HTML代码${linesText}\n2. 必须严格按照用户的核心要求来设计样式和布局\n3. 每个样式有不同的设计风格（最好根据角色特点加一些样式）\n4. 必须是完整可运行的HTML代码\n5. 如果用户要求信封样式，就生成信封样式；如果要求卡片样式，就生成卡片样式；如果要求聊天气泡，就生成聊天气泡样式\n\n**重要：请根据以下角色信息来定制生成的样式和内容：**\n`;
    prompt += `\n**角色信息:**\n`;
}
else {
    // 没有要求时的默认生成状态栏与对话样式
    const linesText = lines === '不限制' ? '行数不限制' : `不超过${lines}行`;
    prompt += `请生成${count}个不同风格的HTML样式，可以是对话样式、卡片样式、信封样式、聊天气泡等多种类型。要求：\n1. 每个HTML代码${linesText}\n2. 每个样式采用不同的设计类型和风格\n3. 每个样式有不同的设计风格（最好根据角色特点加一些样式）\n4. 必须是完整可运行的HTML代码\n\n**重要：请根据以下角色信息来定制生成的样式和内容：**\n`;
    prompt += `\n请根据这些角色信息来：\n1. 选择符合角色风格的配色方案和视觉设计\n2. 在状态栏中显示与角色相关的信息（如角色状态、场景、好感度等）\n3. 生成符合角色性格和设定的对话内容\n4. 确保整体风格与角色的主题和个性相匹配\n\n参考示例（请参考这个结构和样式风格）：\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody {background:#f5f1e6;color:#3a342c;font-family:sans-serif;margin:20px}\n.status-bar {background:#d7c9aa;padding:10px;border-radius:5px;margin-bottom:15px}\n.dialogue {background:#fff;padding:15px;border-radius:8px;border-left:4px solid #9d7463}\n.character {color:#7e5e4f;font-weight:bold}\n</style>\n</head>\n<body>\n\n<div class="status-bar">\n<strong>场景:</strong> 安定区咖啡厅 · 打烊后<br>\n<strong>时间:</strong> 傍晚雨后<br>\n<strong>董香状态:</strong> 警惕→略微放松\n<strong>好感度:</strong> 23<br>\n<strong>...</strong> ...\n</div>\n\n<div class="dialogue">\n<p><span class="character">雾岛董香</span>: （手指无意识地摩挲着咖啡杯边缘，目光在你脸上停留片刻）...又是这种时候来。雨停了？</p>\n<p>她起身时围裙带子松垮地垂在腰间，制服衬衫最上面的扣子不知何时解开了，露出一小段细腻的肌肤。空气中还残留着咖啡渣的苦涩香气，混着她身上淡淡的洗涤剂味道。</p>\n<p><span class="character">雾岛董香</span>: （突然注意到你的视线，立即背过身去整理柜台）没事就快回去，我要锁门了。</p>\n</div>\n\n</body>\n</html>\n\`\`\`\n\n请基于以上示例的结构，生成包含状态栏(.status-bar)和对话内容(.dialogue)的完整HTML页面。状态栏应包含场景、时间、角色状态、好感度等信息，对话部分应包含角色名称和丰富的描述性文本。**请确保生成的内容与提供的角色信息高度匹配，体现角色的独特风格和特色。**`;
}

// 添加角色信息到prompt中
if (characterInfo.name) {
    prompt += `- **角色名称：** ${characterInfo.name}\n`;
}
if (characterInfo.gender) {
    prompt += `- **性别：** ${characterInfo.gender}\n`;
}

if (characterInfo.description) {
    prompt += `- **角色描述：** ${characterInfo.description}\n`;
}
if (characterInfo.personality) {
    prompt += `- **个性特征：** ${characterInfo.personality}\n`;
}
if (characterInfo.scenario) {
    prompt += `- **场景设定：** ${characterInfo.scenario}\n`;
}
if (characterInfo.tags) {
    prompt += `- **角色标签：** ${characterInfo.tags}\n`;
}

try {
    // 检查现有的API设置
    const apiSettings = loadApiSettings();
    const hasValidApiConfig = checkApiConfiguration(apiSettings);

    if (!hasValidApiConfig) {
    resultsDiv.innerHTML = `
        <div style="text-align: center; color: #f44336; padding: 20px;">
            <h4>${t('beautify-api-config-required')}</h4>
            <p>${t('beautify-api-config-desc')}</p>
            <div style="margin-top: 15px;">
                <button onclick="openApiSettingsModal()" style="background: #FF9800; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">${t('beautify-open-api-settings')}</button>
            </div>
        </div>
    `;
    return;
    }

    // 调用AI API生成样式
    await callAIAPIWithSettings(prompt, parseInt(count), parseInt(lines), requirements, apiSettings);
} catch (error) {
    console.error('生成样式时出错:', error);
    resultsDiv.innerHTML = `
    <div style="text-align: center; color: #f44336; padding: 20px;">
        <h4>${t('beautify-generation-failed')}</h4>
        <p>${t('beautify-api-error', {error: error.message})}</p>
    </div>
`;
} finally {
    // 恢复生成按钮状态
    generateBtn.disabled = false;
    generateBtn.textContent = originalText;
    generateBtn.style.opacity = '1';
    generateBtn.style.cursor = 'pointer';
}
}

// 检查API配置是否有效
function checkApiConfiguration(settings) {
if (!settings || !settings.provider) return false;

switch (settings.provider) {
    case 'deepseek':
    return settings.deepseek && settings.deepseek.apiKey && settings.deepseek.apiKey.trim() !== '';
    case 'gemini':
    return settings.gemini && settings.gemini.apiKey && settings.gemini.apiKey.trim() !== '';
    case 'gemini-proxy':
    return (
        settings['gemini-proxy'] &&
        settings['gemini-proxy'].apiKey &&
        settings['gemini-proxy'].apiKey.trim() !== '' &&
        settings['gemini-proxy'].endpoint &&
        settings['gemini-proxy'].endpoint.trim() !== ''
    );
    case 'ollama':
    return (
        settings.ollama &&
        settings.ollama.endpoint &&
        settings.ollama.endpoint.trim() !== '' &&
        settings.ollama.model &&
        settings.ollama.model.trim() !== ''
    );
    case 'tavern':
    if (!settings.tavern) return false;
    
    // 根据连接类型检查不同的字段
    if (settings.tavern.connectionType === 'reverse-proxy') {
        // CLI反代模式：检查代理URL和密码
        return (
        settings.tavern.proxyUrl &&
        settings.tavern.proxyUrl.trim() !== '' &&
        settings.tavern.proxyPassword &&
        settings.tavern.proxyPassword.trim() !== ''
        );
    } else {
        // 直连API模式：检查endpoint和apiKey
        return (
        settings.tavern.apiKey &&
        settings.tavern.apiKey.trim() !== '' &&
        settings.tavern.endpoint &&
        settings.tavern.endpoint.trim() !== ''
        );
    }
    case 'local':
    return settings.local && settings.local.endpoint && settings.local.endpoint.trim() !== '';
    default:
    return false;
}
}

// 使用现有API设置调用AI API生成样式
async function callAIAPIWithSettings(prompt, count, lines, requirements, settings) {
const resultsDiv = document.getElementById('beautify-results');

try {
    let response;
    const provider = settings.provider;

    if (provider === 'deepseek') {
    response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.deepseek.apiKey}`,
        },
        body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
            {
            role: 'user',
            content: prompt,
            },
        ],
        max_tokens: 8192,  // DeepSeek的最大输出限制
        temperature: 0.7,
        }),
    });
    } else if (provider === 'gemini') {
    response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${settings.gemini.model}:generateContent?key=${settings.gemini.apiKey}`,
        {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [
            {
                parts: [
                {
                    text: prompt,
                },
                ],
            },
            ],
        }),
        },
    );
    } else if (provider === 'gemini-proxy') {
    response = await fetch(settings['gemini-proxy'].endpoint, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings['gemini-proxy'].apiKey}`,
        },
        body: JSON.stringify({
        model: settings['gemini-proxy'].model,
        messages: [
            {
            role: 'user',
            content: prompt,
            },
        ],
        max_tokens: 4000,
        temperature: 0.7,
        }),
    });
    } else if (provider === 'tavern') {
    const providerSettings = settings.tavern;
    const isReverseProxy = providerSettings.connectionType === 'reverse-proxy';
    
    let endpoint, apiKey, model;
    
    if (isReverseProxy) {
        endpoint = providerSettings.proxyUrl;
        apiKey = providerSettings.proxyPassword;
        model = providerSettings.proxyModel || 'gpt-3.5-turbo';
        
        if (!endpoint) throw new Error('代理服务器 URL 未设置');
    } else {
        endpoint = providerSettings.endpoint;
        apiKey = providerSettings.apiKey;
        model = providerSettings.model || 'gpt-3.5-turbo';
        
        if (!endpoint) throw new Error('Tavern API Endpoint 未设置');
    }
    
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
    
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    response = await fetch(finalEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
        model: model,
        messages: [
            {
            role: 'user',
            content: prompt,
            },
        ],
        max_tokens: 4000,
        temperature: 0.7,
        }),
    });
    } else if (provider === 'local') {
    response = await fetch(`${settings.local.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        messages: [
            {
            role: 'user',
            content: prompt,
            },
        ],
        max_tokens: 4000,
        temperature: 0.7,
        }),
    });
    } else if (provider === 'ollama') {
    let ollamaEndpoint = settings.ollama.endpoint;
    if (!ollamaEndpoint.startsWith('http')) {
        ollamaEndpoint = 'http://' + ollamaEndpoint;
    }
    if (ollamaEndpoint.endsWith('/')) {
        ollamaEndpoint = ollamaEndpoint.slice(0, -1);
    }
    
    response = await fetch(`${ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        model: settings.ollama.model,
        prompt: prompt,
        stream: false,
        options: {
            temperature: 0.7,
        }
        }),
    });
    }

    if (!response.ok) {
    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let generatedContent = '';

    // 解析不同API的响应格式
    if (provider === 'deepseek' || provider === 'gemini-proxy' || provider === 'tavern' || provider === 'local') {
    generatedContent = data.choices[0].message.content;
    } else if (provider === 'gemini') {
    generatedContent = data.candidates[0].content.parts[0].text;
    } else if (provider === 'ollama') {
    generatedContent = data.response;
    }

    // 解析生成的HTML代码
    parseAndDisplayGeneratedStyles(generatedContent, count);
} catch (error) {
    throw error;
}
}

// 解析并显示生成的样式
function parseAndDisplayGeneratedStyles(content, count) {
const resultsDiv = document.getElementById('beautify-results');

// 提取HTML代码块
const codeBlocks = content.match(/```html?([\s\S]*?)```/gi) || [];

if (codeBlocks.length === 0) {
    // 如果没有找到代码块，尝试直接解析内容
    const htmlMatches = content.match(/<!DOCTYPE html[\s\S]*?<\/html>/gi) || [];
    if (htmlMatches.length > 0) {
    codeBlocks.push(...htmlMatches.map(html => '```html\n' + html + '\n```'));
    }
}

if (codeBlocks.length === 0) {
    resultsDiv.innerHTML = `
    <div style="text-align: center; color: #f44336; padding: 20px;">
        <h4>${t('beautify-no-html-found')}</h4>
        <p>${t('beautify-no-html-desc')}</p>
    </div>
`;
    return;
}

let resultsHTML = '<div style="display: grid; gap: 20px;">';

codeBlocks.slice(0, count).forEach((block, index) => {
    // 清理代码块标记
    const cleanCode = block
    .replace(/```html?\s*/gi, '')
    .replace(/```\s*$/gi, '')
    .trim();

    resultsHTML += `
    <div data-style-index="${index}" style="border: 1px solid var(--input-border); border-radius: 8px; overflow: hidden; background: var(--input-bg);">
        <div style="background: var(--bg-secondary); padding: 10px; border-bottom: 1px solid var(--input-border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <h4 style="margin: 0; color: var(--text-color);">🎨 样式 ${index + 1}</h4>
            <div class="style-buttons" style="display: flex; flex-wrap: wrap; gap: 5px;">
                <button onclick="previewStyle(${index})" style="background: #FF9800; color: white; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">👁️ 预览</button>
                <button onclick="handleAIModify(${index})" style="background-color: var(--ai-button-bg); color: white; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">🔮 AI改</button>
                <button onclick="directInject(${index})" style="background: #28a745; color: white; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">💉 注入</button>
            </div>
        </div>
        <div style="max-height: 300px; overflow-y: auto; padding: 15px;">
            <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; color: var(--text-color);"><code id="style-code-${index}">${cleanCode
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</code></pre>
        </div>
    </div>
`;

    // 存储原始代码用于复制和预览
    window[`generatedStyle_${index}`] = cleanCode;
});

resultsHTML += '</div>';
resultsDiv.innerHTML = resultsHTML;
}

// 预览样式
function previewStyle(index) {
const code = window[`generatedStyle_${index}`];
if (!code) {
    alert(t('style-code-not-exist'));
    return;
}

// 在新窗口中打开预览
const previewWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
previewWindow.document.write(code);
previewWindow.document.close();
}


// 直接注入代码（简化版）
function directInject(index) {
const code = window[`generatedStyle_${index}`];
if (!code) {
    alert(t('style-code-not-exist'));
    return;
}

// 自动修改指令内容为系统指令格式
const instructionTextarea = document.querySelector('#instruction-content-input');
if (instructionTextarea) {
    const newInstruction = `[系统指令]: 结合历史聊天记录和{{user}}发送的消息输出美化过的对话完整三合一html代码，必须包含<body></body>部分，必须用代码块(\`\`\`)包裹，每次只能输出代码，必须按照如下格式生成，可丰富话数与内容：
\`\`\`${code}\`\`\``;
    instructionTextarea.value = newInstruction;
}

// 复制代码到剪贴板
navigator.clipboard
    .writeText(code)
    .then(() => {
    // 显示成功提示
    const button = document.querySelector(`[data-style-index="${index}"] button[onclick*="directInject"]`);
    if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ 已注入';
        button.style.background = '#4CAF50';

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#28a745';
        }, 2000);
    }

    alert(t('code-added-to-instruction'));
    })
    .catch(err => {
    console.error('注入失败:', err);
    // 降级方案：选择文本
    const textArea = document.createElement('textarea');
    textArea.value = code;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert(t('code-copied-to-clipboard'));
    });
}


// 存储撤销数据
let undoData = {
styleCode: null,
instructionContent: null
};

// 显示撤销通知
function showUndoNotification(message, undoCallback) {
// 移除已存在的通知
const existingNotification = document.getElementById('undo-notification');
if (existingNotification) {
    existingNotification.remove();
}

// 创建通知元素
const notification = document.createElement('div');
notification.id = 'undo-notification';
notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 14px;
    max-width: 400px;
`;

notification.innerHTML = `
    <span>✅ ${message}</span>
    <button id="undo-btn" style="
    background: rgba(255,255,255,0.2);
    color: white;
    border: 1px solid rgba(255,255,255,0.3);
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    ">撤销</button>
    <button id="close-notification" style="
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 16px;
    padding: 0;
    width: 20px;
    height: 20px;
    ">×</button>
`;

// 添加到页面
document.body.appendChild(notification);

// 绑定撤销按钮事件
document.getElementById('undo-btn').onclick = () => {
    undoCallback();
    notification.remove();
};

// 绑定关闭按钮事件
document.getElementById('close-notification').onclick = () => {
    notification.remove();
};
}

// 处理AI修改功能
async function handleAIModify(index) {
const code = window[`generatedStyle_${index}`];
if (!code) {
    alert(t('style-code-not-exist'));
    return;
}

// 获取用户输入的修改要求
const modifyRequest = prompt('请描述你想要的修改内容：\n例如：添加好感度显示、增加动画效果、改变颜色主题等...');

if (!modifyRequest || !modifyRequest.trim()) {
    return;
}

// 获取当前按钮元素
const buttonElement = document.querySelector(`[data-style-index="${index}"] button[onclick*="handleAIModify"]`);
const originalButtonText = buttonElement ? buttonElement.textContent : '🔮 AI改';

try {
    // 显示加载状态
    if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.textContent = '🔄 AI修改中...';
    buttonElement.style.opacity = '0.6';
    buttonElement.style.cursor = 'not-allowed';
    }
    
    // 保存当前状态用于撤销
    undoData.styleCode = code;
    
    // 构建AI修改prompt
    const aiPrompt = getLanguagePrefix() + `请基于以下HTML/CSS代码，按照用户要求进行修改和优化：${modifyRequest.trim()}。

重要要求：
1. 保持代码的核心功能不变
2. 优化代码结构和样式
3. 直接输出修改后的完整代码
4. 不要添加任何标题、前缀、后缀或说明文字
5. 只返回纯净的HTML/CSS代码，无需任何解释

现有代码：
${code}

请直接输出修改后的代码：`;

    // 调用API获取修改后的代码
    const mockButton = { disabled: false, textContent: '生成中...' };
    const modifiedCode = await callApi(aiPrompt, mockButton);
    
    if (modifiedCode) {
    // 更新全局变量中的代码
    window[`generatedStyle_${index}`] = modifiedCode;
    
    // 更新显示的代码
    const codeElement = document.querySelector(`[data-style-index="${index}"] pre code`);
    if (codeElement) {
        codeElement.textContent = modifiedCode;
    }
    
    // 显示成功提示和撤销按钮
    showUndoNotification('样式代码已成功修改！', () => {
        // 撤销操作
        window[`generatedStyle_${index}`] = undoData.styleCode;
        const codeElement = document.querySelector(`[data-style-index="${index}"] pre code`);
        if (codeElement) {
        codeElement.textContent = undoData.styleCode;
        }
        alert('✅ 已撤销修改');
    });
    }
} catch (error) {
    console.error('AI修改失败:', error);
    alert('❌ AI修改失败，请检查API设置或网络连接');
} finally {
    // 恢复按钮状态
    if (buttonElement) {
    buttonElement.disabled = false;
    buttonElement.textContent = originalButtonText;
    buttonElement.style.opacity = '1';
    buttonElement.style.cursor = 'pointer';
    }
}
}

// 关闭AI修改弹窗
function closeAIModifyModal() {
const modal = document.getElementById('ai-modify-modal');
if (modal) {
    modal.remove();
}
}

// 添加快速选项到输入框
function addQuickOption(option) {
const input = document.getElementById('ai-modify-input');
if (input) {
    if (input.value.trim()) {
    input.value += '，' + option;
    } else {
    input.value = option;
    }
    input.focus();
}
}

// 生成AI修改指令
function generateAIModifyInstruction(index) {
const code = window[`generatedStyle_${index}`];
const modifyRequest = document.getElementById('ai-modify-input').value.trim();

if (!modifyRequest) {
    alert('请输入修改要求');
    return;
}

// 生成AI修改指令
const instructionTextarea = document.querySelector('#instruction-content-input');
if (instructionTextarea) {
    const aiModifyInstruction = `[系统指令]: 基于以下现有的HTML代码，按照用户要求进行修改：${modifyRequest}。请保持原有样式的基础结构，只修改和添加必要的部分，输出完整的修改后的HTML代码，必须包含<body></body>部分，必须用代码块(\`\`\`)包裹：

现有代码：
\`\`\`${code}\`\`\`

请根据要求修改上述代码并输出完整的新版本。`;

    instructionTextarea.value = aiModifyInstruction;
}

// 关闭弹窗
closeAIModifyModal();

// 显示成功提示
alert('✅ AI修改指令已生成！指令输入框已更新，现在可以发送给AI进行修改了。');
}

// 显示指令编辑页面的AI修改功能
function showInstructionAIModify() {
const currentContent = document.getElementById('instruction-content-input').value;

// 创建AI修改弹窗
const aiModalHTML = `
<div id="instruction-ai-modify-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10001; display: flex; justify-content: center; align-items: center;">
    <div style="background: var(--bg-color); padding: 30px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); max-width: 600px; width: 90%;">
        <h3 style="margin: 0 0 20px 0; color: var(--text-color); text-align: center;">🤖 AI帮我改指令</h3>
        <p style="margin: 0 0 15px 0; color: var(--text-color);">请描述你想要的修改内容：</p>
        <textarea id="instruction-ai-modify-input" placeholder="例如：优化指令逻辑、添加更多细节、改变输出格式等..." style="width: 100%; height: 120px; padding: 12px; border: 1px solid var(--input-border); border-radius: 5px; font-size: 14px; resize: vertical; box-sizing: border-box; background: var(--input-bg); color: var(--text-color);"></textarea>
        <div style="margin-top: 20px;">
            <h4 style="margin: 0 0 10px 0; color: var(--text-color); font-size: 14px;">快速选项：</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
                <button onclick="addInstructionQuickOption('优化指令逻辑和表达')" style="background: #e3f2fd; color: #1976d2; padding: 6px 12px; border: 1px solid #1976d2; border-radius: 15px; cursor: pointer; font-size: 12px;">✨ 优化逻辑</button>
                <button onclick="addInstructionQuickOption('这个html无法渲染，请改良')" style="background: #e8f5e8; color: #388e3c; padding: 6px 12px; border: 1px solid #388e3c; border-radius: 15px; cursor: pointer; font-size: 12px;">🔄 改良错误</button>
            </div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button onclick="executeInstructionAIModify()" style="background: #ff6b35; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">AI帮我改</button>
            <button onclick="closeInstructionAIModifyModal()" style="background: #6c757d; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">取消</button>
        </div>
    </div>
</div>
`;

// 添加弹窗到页面
document.body.insertAdjacentHTML('beforeend', aiModalHTML);
}

// 执行指令AI修改功能
async function executeInstructionAIModify() {
const modifyRequest = document.getElementById('instruction-ai-modify-input').value.trim();
const instructionInput = document.getElementById('instruction-content-input');

if (!modifyRequest) {
    alert('请输入修改要求');
    return;
}

// 保存当前内容作为备份
undoData.instructionContent = instructionInput.value;

// 获取AI改按钮并设置加载状态
const aiModifyButton = document.querySelector('#instruction-ai-modify-modal button[onclick="executeInstructionAIModify()"]');
if (aiModifyButton) {
    aiModifyButton.disabled = true;
    aiModifyButton.textContent = '🔄 AI修改中...';
    aiModifyButton.style.opacity = '0.7';
    aiModifyButton.style.cursor = 'not-allowed';
}

try {
    // 调用generateInstructionAIModify函数进行实际修改
    await generateInstructionAIModify(modifyRequest);

    // 关闭弹窗
    closeInstructionAIModifyModal();

    // 显示撤销通知
    showUndoNotification('指令内容已成功修改！', () => {
    // 撤销操作
    instructionInput.value = undoData.instructionContent;
    alert('✅ 已撤销修改');
    });
} catch (error) {
    console.error('指令AI修改失败:', error);
    alert('❌ 指令AI修改失败，请检查API设置或网络连接');
} finally {
    // 恢复按钮状态
    if (aiModifyButton) {
    aiModifyButton.disabled = false;
    aiModifyButton.textContent = '🤖 AI帮我改';
    aiModifyButton.style.opacity = '1';
    aiModifyButton.style.cursor = 'pointer';
    }
}
}

// 关闭指令AI修改弹窗
function closeInstructionAIModifyModal() {
const modal = document.getElementById('instruction-ai-modify-modal');
if (modal) {
    modal.remove();
}
}

// 添加指令快速选项
function addInstructionQuickOption(option) {
const input = document.getElementById('instruction-ai-modify-input');
if (input) {
    if (input.value.trim()) {
    input.value += '，' + option;
    } else {
    input.value = option;
    }
    input.focus();
}
}

// HTML预览功能
function previewInstructionHTML() {
const instructionContent = document.getElementById('instruction-content-input').value;

if (!instructionContent.trim()) {
    alert('指令内容为空，无法预览');
    return;
}

// 提取HTML代码块
const htmlCodeBlocks = extractHTMLCodeBlocks(instructionContent);

if (htmlCodeBlocks.length === 0) {
    alert('未找到HTML代码块，请确保代码使用```包裹，或者用🤖 AI帮我改 改错误');
    return;
}

// 创建预览弹窗
const previewModalHTML = `
<div id="html-preview-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10002; display: flex; justify-content: center; align-items: center;">
    <div style="background: var(--bg-color); padding: 20px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); max-width: 90%; max-height: 90%; width: 800px; height: 600px; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin: 0; color: var(--text-color);">📄 前端预览</h3>
            <button onclick="closeHTMLPreviewModal()" style="background: #6c757d; color: white; padding: 8px 12px; border: none; border-radius: 5px; cursor: pointer;">关闭</button>
        </div>
        <div style="flex: 1; border: 1px solid var(--input-border); border-radius: 5px; overflow: hidden;">
            <iframe id="html-preview-frame" sandbox="allow-scripts allow-same-origin" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
    </div>
</div>
`;

// 添加弹窗到页面
document.body.insertAdjacentHTML('beforeend', previewModalHTML);

// 渲染HTML内容到iframe
const iframe = document.getElementById('html-preview-frame');
const htmlContent = htmlCodeBlocks.join('\n');

// 直接写入HTML内容
setTimeout(() => {
    try {
        iframe.contentDocument.open();
        iframe.contentDocument.write(htmlContent);
        iframe.contentDocument.close();
    } catch (e) {
    console.error('HTML预览渲染失败:', e);
        iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    }
}, 100);
}

// 提取HTML代码块
function extractHTMLCodeBlocks(content) {
const htmlBlocks = [];

// 方法1: 直接匹配所有 <html>...</html> 标签对（支持多个HTML文档）
const htmlDocRegex = /<html[\s\S]*?<\/html>/gi;
let match;

while ((match = htmlDocRegex.exec(content)) !== null) {
    htmlBlocks.push(match[0]);
}

// 方法2: 如果没找到完整的 <html> 标签，尝试匹配 <!DOCTYPE html>...
if (htmlBlocks.length === 0) {
    const doctypeRegex = /<!DOCTYPE\s+html[\s\S]*?<\/html>/gi;
    while ((match = doctypeRegex.exec(content)) !== null) {
    htmlBlocks.push(match[0]);
    }
}

// 方法3: 如果还是没找到，尝试从代码块中提取
if (htmlBlocks.length === 0) {
    const codeBlockRegex = /```(?:html|HTML)?\s*\n?([\s\S]*?)```/gi;
    while ((match = codeBlockRegex.exec(content)) !== null) {
    const code = match[1].trim();
    if (code && /<[^>]+>/.test(code)) {
        htmlBlocks.push(code);
    }
    }
}

// 方法4: 最后尝试查找任何包含 <body> 标签的内容块
if (htmlBlocks.length === 0) {
    const bodyRegex = /<body[\s\S]*?<\/body>/gi;
    while ((match = bodyRegex.exec(content)) !== null) {
    // 构建一个最小的HTML文档
    const bodyContent = match[0];
    const minimalHtml = `<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"></head>\n${bodyContent}\n</html>`;
    htmlBlocks.push(minimalHtml);
    }
}

return htmlBlocks;
}

// 关闭HTML预览弹窗
function closeHTMLPreviewModal() {
const modal = document.getElementById('html-preview-modal');
if (modal) {
    modal.remove();
}
}

// 生成指令AI修改指令
async function generateInstructionAIModify(modifyRequest = null) {
const currentContent = document.getElementById('instruction-content-input').value;
const request = modifyRequest || document.getElementById('instruction-ai-modify-input')?.value?.trim();

if (!request) {
    alert('请输入修改要求');
    return;
}

// 获取按钮元素并显示加载状态
const generateButton = document.querySelector('#instruction-ai-modify-modal button[onclick="generateInstructionAIModify()"]');
const originalText = generateButton ? generateButton.textContent : '生成修改指令';

if (generateButton) {
    generateButton.disabled = true;
    generateButton.textContent = '生成中...';
}

// 构建AI优化prompt
const aiPrompt = getLanguagePrefix() + `请基于以下现有指令内容，按照用户要求进行优化和修改：${request}。

重要要求：
1. 保持指令的核心功能不变
2. 优化表达方式和逻辑结构
3. 直接输出优化后的完整指令内容
4. 不要添加任何标题、前缀、后缀或说明文字
5. 不要包含"优化后的"、"改写说明"等格式化内容
6. 只返回纯净的指令文本，无需任何解释

现有指令：
${currentContent}

请直接输出优化后的指令内容：`;

try {
    // 调用API获取优化后的指令，传递一个模拟的button对象
    const mockButton = { disabled: false, textContent: originalText };
    const optimizedInstruction = await callApi(aiPrompt, mockButton);
    
    // 将优化后的指令直接插入到指令框中
    const instructionTextarea = document.getElementById('instruction-content-input');
    if (instructionTextarea && optimizedInstruction) {
    instructionTextarea.value = optimizedInstruction;
    }

    // 关闭弹窗（如果存在）
    if (document.getElementById('instruction-ai-modify-modal')) {
    closeInstructionAIModifyModal();
    }

    // 显示成功提示
    alert('✅ 指令已成功优化！');
} catch (error) {
    console.error('AI优化指令失败:', error);
    alert('❌ AI优化指令失败，请检查API设置或网络连接');
} finally {
    // 恢复按钮状态
    if (generateButton) {
    generateButton.disabled = false;
    generateButton.textContent = originalText;
    }
}
}

// 处理注入逻辑
function handleInject(position, index) {
const code = window[`generatedStyle_${index}`];
if (!code) {
    alert(t('style-code-not-exist'));
    return;
}

let finalCode = code;

// 自动修改指令内容为系统指令格式，包含完整的生成代码
const instructionTextarea = document.querySelector('#instruction-content-input');
if (instructionTextarea) {
    const newInstruction = `[系统指令]: 结合历史聊天记录和{{user}}发送的消息输出美化过的对话完整三合一html代码，必须包含<body></body>部分，必须用代码块(\`\`\`)包裹，每次只能输出代码，必须按照如下格式生成，可丰富话数与内容：
\`\`\`${finalCode}\`\`\``;
    instructionTextarea.value = newInstruction;
}

// 同时复制代码到剪贴板作为备用
navigator.clipboard
    .writeText(finalCode)
    .then(() => {
    // 显示成功提示
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '✅ 已注入';
    button.style.background = '#4CAF50';

    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = getOriginalButtonColor(position);
    }, 2000);

    // 关闭弹窗
    closeInjectModal();

    // 显示注入成功消息
    let message = '';
    switch (position) {
        case 'beginning':
        message = '✅ 指令输入框已自动更新为系统指令格式，代码已复制到剪贴板，将在对话最开始显示美化界面';
        break;
        case 'end':
        message = '✅ 指令输入框已自动更新为系统指令格式，代码已复制到剪贴板，将在对话最后显示美化界面';
        break;
        case 'only':
        message = '✅ 指令输入框已自动更新为系统指令格式，代码已复制到剪贴板，将只显示美化界面';
        break;
    }
    alert(message);
    })
    .catch(err => {
    console.error('注入失败:', err);
    // 降级方案：选择文本
    const textArea = document.createElement('textarea');
    textArea.value = finalCode;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('代码已加入到”指令内容“中，同时备份到了剪切板');
    closeInjectModal();
    });
}

// 获取按钮原始颜色
function getOriginalButtonColor(position) {
switch (position) {
    case 'beginning':
    return '#007bff';
    case 'end':
    return '#28a745';
    case 'only':
    return '#dc3545';
    default:
    return '#6c757d';
}
}

function saveStyleAsTemplate(styleName, instruction) {
const templateName = prompt(`请输入模板名称:`, styleName);
if (!templateName) return;

saveCustomTemplate(templateName, instruction)
    .then(() => {
    alert('样式已保存为自定义模板！');
    })
    .catch(error => {
    alert('保存失败：' + error);
    });
}

function applyStyleToCurrentInstruction(instruction) {
const contentInput = document.getElementById('instruction-content-input');
if (contentInput) {
    contentInput.value = instruction;
    alert('样式指令已应用到当前编辑框！');
    closeFrontendBeautifyModal();
} else {
    alert('请先打开指令编辑窗口！');
}
}

/**
 * [NEW] Converts a SillyTavern lorebook object into the application's internal format.
 * @param {object} lorebook - The raw lorebook object from the imported JSON.
 * @returns {Array} An array of worldbook entries in the internal format.
 */
function convertTavernLorebookToInternal(lorebook) {
const internalEntries = [];
let entriesSource = null;

// 支持数组格式（纯世界书JSON）
if (lorebook.entries && Array.isArray(lorebook.entries)) {
    entriesSource = lorebook.entries;
}
// 支持对象格式（传统Tavern格式）
else if (lorebook.entries && typeof lorebook.entries === 'object' && !Array.isArray(lorebook.entries)) {
    entriesSource = lorebook.entries;
}
// 支持extensions格式
else if (lorebook.extensions &&
        lorebook.extensions.entries &&
        typeof lorebook.extensions.entries === 'object' &&
        !Array.isArray(lorebook.extensions.entries)) {
    entriesSource = lorebook.extensions.entries;
}

if (!entriesSource) {
    console.warn("Could not find a valid 'entries' in the provided file.");
    return [];
}

const positionMap = {
    0: 'before_prompt',
    1: 'after_char',
    2: 'before_char',
};

// 递归函数：转换条目及其子条目
function convertTavernEntryToInternal(tavernEntry, index) {
    const internalEntry = {
        id: tavernEntry.uid !== undefined ? tavernEntry.uid : (tavernEntry.order || index),
        keys: tavernEntry.keys || tavernEntry.key || [],
        secondary_keys: tavernEntry.keysecondary || tavernEntry.secondary_keys || [],
        comment: tavernEntry.name || tavernEntry.comment || '',
        content: tavernEntry.content || '',
        priority: tavernEntry.order || 100,
        enabled:
        tavernEntry.disable !== undefined
            ? !tavernEntry.disable
            : tavernEntry.enabled !== undefined
            ? tavernEntry.enabled
            : true,
        constant: tavernEntry.constant || false,
        selective: tavernEntry.selective || false,
        prevent_recursion: tavernEntry.excludeRecursion || tavernEntry.preventRecursion || false,
        position: positionMap[tavernEntry.position] || 'before_char',
        secondary_keys_logic: 'any',
        use_regex: tavernEntry.use_regex || false,
        group: tavernEntry.group || '',
        scope: 'chat',
        probability: tavernEntry.probability !== undefined ? tavernEntry.probability : 100,
        wb_depth: tavernEntry.depth || 4,
        match_whole_words: tavernEntry.matchWholeWords || tavernEntry.match_whole_words || false,
        case_sensitive: tavernEntry.caseSensitive || tavernEntry.case_sensitive || false,
        children: [],
    };
    
    // 递归处理子词条
    if (tavernEntry.children && Array.isArray(tavernEntry.children) && tavernEntry.children.length > 0) {
        internalEntry.children = tavernEntry.children.map((child, childIndex) => 
            convertTavernEntryToInternal(child, childIndex)
        );
    }
    
    return internalEntry;
}

// 处理数组格式
if (Array.isArray(entriesSource)) {
    entriesSource.forEach((tavernEntry, index) => {
        const internalEntry = convertTavernEntryToInternal(tavernEntry, index);
        internalEntries.push(internalEntry);
    });
}
// 处理对象格式
else {
    for (const key in entriesSource) {
        const tavernEntry = entriesSource[key];
        const internalEntry = convertTavernEntryToInternal(tavernEntry, parseInt(key, 10) || 0);
        internalEntries.push(internalEntry);
    }
}

internalEntries.sort((a, b) => a.id - b.id);
internalEntries.forEach((entry, index) => {
    entry.id = index;
});

mylog(`✅ 成功转换 ${internalEntries.length} 个世界书条目`);
return internalEntries;
}

window.onload = function () {
try {
    // 显示加载动画
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
    } else {
    alert('⚠️ 警告：未找到加载动画元素，可能是DOM未完全加载');
    }
    
    // 初始化拖拽和编码功能
    initializeDragAndDrop();

    // 优化：移除不必要的延迟，让应用更快启动
    try {
    initializeApiSettingsModal();
    initializeOtherSettingsModal();
    } catch (error) {
    alert('⚠️ API设置模态框初始化失败: ' + error.message);
    }
    
    try {
    loadApiSettings();
    loadOtherSettings();
    } catch (error) {
    alert('⚠️ API设置加载失败: ' + error.message);
    }
    
    initializeDatabase(); // initializeDatabase will call showLibraryView, which hides the overlay
    initializePlusSwitch();
    initializeNameGeneratorModal();
    initializeWorldbookAiModal();
    initializeAiGuidanceModal();
    setupTextareaAutoResize(); // Initialize textarea resizing for mobile
    initializeFoldView(); // 初始化文本折叠视图
    initializeSearchPanel(); // 初始化搜索面板
    initializeInstructionSystem(); // 初始化指令系统
    initializeCustomTemplateStorage(); // 初始化自定义模板存储

    // 初始化语言设置
    try {
    const savedLanguage = localStorage.getItem('language') || 'zh';
    switchLanguage(savedLanguage);
    } catch (error) {
    alert('⚠️ 语言设置初始化失败: ' + error.message);
    }
} catch (error) {
    alert('❌ 初始化失败: ' + error.message + '\n堆栈信息: ' + (error.stack ? error.stack.substring(0, 200) : '未知'));
}
};

function initializeDatabase() {
// 检查浏览器是否支持IndexedDB
if (!window.indexedDB) {
    alert('❌ 数据库初始化失败：您的浏览器不支持IndexedDB\n请更新浏览器或切换到支持的浏览器');
    return;
}

const dbTimeout = setTimeout(() => {
    if (!db) {
    alert('⚠️ 本地数据库连接已超时（7秒），按确定继续');
    }
}, 7000);

const request = indexedDB.open('CharacterDB', 2);

request.onupgradeneeded = event => {
    const tempDb = event.target.result;
    if (!tempDb.objectStoreNames.contains('characters')) {
    const objectStore = tempDb.createObjectStore('characters', { keyPath: 'id', autoIncrement: true });
    objectStore.createIndex('name', 'name', { unique: false });
    objectStore.createIndex('lastUsed', 'lastUsed', { unique: false });
    }
};

request.onsuccess = async event => {
    clearTimeout(dbTimeout);
    db = event.target.result;
    try {
    await showLibraryView();
    checkAndRestoreDraft();
    } catch (error) {
    alert('❌ 界面加载失败: ' + error.message);
    }
};

request.onerror = event => {
    clearTimeout(dbTimeout);
    const errorMsg = event.target.error ? event.target.error.message || event.target.error : '未知错误';
    alert('❌ 数据库连接失败: ' + errorMsg + '\n可能原因：\n1. 浏览器不支持IndexedDB\n2. 存储空间不足\n3. 隐私模式限制\n4. 浏览器版本过旧');
};

request.onblocked = event => {
    clearTimeout(dbTimeout);
    alert('⚠️ 数据库连接被阻塞：\n请关闭其他标签页中的妮卡角色工作室页面，\n然后刷新当前页面重试');
};
}

async function checkDbReady(maxWaitTime = 10000, retryInterval = 500) {
if (db) {
    return true;
}

// 等待数据库初始化完成
const startTime = Date.now();
while (!db && (Date.now() - startTime) < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, retryInterval));
}

if (!db) {
    alert('⚠️ 数据库未准备就绪：请等待数据库初始化完成或刷新页面重试');
    return false;
}
return true;
}

// --- View Management ---
async function showLibraryView() {
if (!(await checkDbReady())) return;

try {
    editorView.style.display = 'none';
    document.getElementById('novel-to-worldbook-view').style.display = 'none';
    libraryView.style.display = 'block';
    await renderUI(); // 等待渲染完成，renderUI内部会处理加载动画
} catch (error) {
    document.getElementById('loading-overlay').style.display = 'none';
    alert('❌ 显示库视图失败: ' + error.message);
}
}

async function showNovelToWorldbookView() {
if (!(await checkDbReady())) return;

// 隐藏其他视图
document.getElementById('library-view').style.display = 'none';
document.getElementById('editor-view').style.display = 'none';

// 显示长文本转世界书视图
const worldbookView = document.getElementById('novel-to-worldbook-view');
worldbookView.style.display = 'flex';

// 初始化拖拽功能
initializeDragAndDrop();

// 检查是否有未完成的状态
await checkForSavedState();

// 隐藏加载圈
document.getElementById('loading-overlay').style.display = 'none';
}

async function showEditorView(characterId = null) {
if (!(await checkDbReady())) return;

// 显示加载圈
document.getElementById('loading-overlay').style.display = 'flex';

libraryView.style.display = 'none';
editorView.style.display = 'flex';
clearEditorForm();

if (characterId) {
    document.getElementById('editor-title').innerText = characterId === DRAFT_ID ? (t('edit-draft')) : t('edit-character');
    const transaction = db.transaction(['characters'], 'readonly');
    const store = transaction.objectStore('characters');
    const request = store.get(characterId);

    request.onsuccess = e => {
    const charData = e.target.result;
    if (charData) {
        populateEditorForm(charData);
        // 如果是草稿，且有原ID，恢复原ID以便保存
        if (charData.id === DRAFT_ID) {
            if (charData.draftForId) {
                document.getElementById('charId').value = charData.draftForId;
            } else {
                document.getElementById('charId').value = ''; // 新建角色的草稿
            }
        }
    } else {
        // 角色不存在，隐藏加载圈并提示
        document.getElementById('loading-overlay').style.display = 'none';
        alert(t('character-not-found') || '角色不存在');
        showLibraryView();
    }
    };
    
    request.onerror = () => {
    // 查询出错，隐藏加载圈并提示
    document.getElementById('loading-overlay').style.display = 'none';
    alert(t('load-character-error') || '加载角色失败');
    showLibraryView();
    };
} else {
    document.getElementById('editor-title').innerText = t('create-new-character');
    // 创建新角色时清空指令数据
    instructionsData = [];
    renderInstructionCards();
    updatePostHistoryInstructions();
    renderWorldbookFromData([]);
    document.getElementById('avatar-preview').src = createDefaultImage('2:3');
    // 隐藏加载圈
    document.getElementById('loading-overlay').style.display = 'none';
}
// 确保每次进入编辑器时，按钮文本都根据开关状态刷新
toggleAiButtonText(document.getElementById('Plus-switch').checked);

initAutoSave();
}

// --- Import / Export ---
async function importCharacter(event) {
if (!(await checkDbReady())) return;

const files = event.target.files;
if (!files.length) return;

for (const file of files) {
    if (file.type === 'image/png') {
    const readAsBuffer = file.arrayBuffer();
    const readAsDataURL = new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

    Promise.all([readAsBuffer, readAsDataURL])
        .then(async ([buffer, dataUrl]) => {
        try {
            const charData = await extractDataFromPng(buffer);
            const pngDataUrl = await convertImageToPng(dataUrl);
            saveImportedCharacter(charData, pngDataUrl);
        } catch (err) {
            console.error(currentLanguage === 'zh' ? 'PNG导入错误:' : 'PNG import error:', err);
            alert(
            t('import-png-failed', {
                error:
                err.message ||
                (currentLanguage === 'zh'
                    ? '未知错误，请检查控制台。'
                    : 'Unknown error, please check console.'),
            }),
            );
        }
        })
        .catch(err => {
        alert(t('file-read-error-with-name', { name: file.name, error: err }));
        });
    } else if (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'image/webp' ||
    file.type === 'image/gif' ||
    file.type === 'image/bmp'
    ) {
    // 处理各种图片格式
    const readAsDataURL = new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

    readAsDataURL
        .then(async dataUrl => {
        try {
            // 将任何格式的图片转换为PNG格式
            const pngDataUrl = await convertImageToPng(dataUrl);
            // 创建一个模拟的角色数据对象
            const charData = {
            spec: 'chara_card_v3',
            data: {
                name: file.name.replace(/\.[^/.]+$/, ''), // 使用文件名作为角色名
                description: t('imported-character'),
                personality: '',
                scenario: '',
                first_mes: '',
                mes_example: '',
                system_prompt: '',
                post_history_instructions: '',
                creator_notes: '',
                character_version: '1.0',
                tags: [],
                character_book: { entries: [] },
            },
            };
            saveImportedCharacter(charData, pngDataUrl);
        } catch (err) {
            console.error(currentLanguage === 'zh' ? '图片导入错误:' : 'Image import error:', err);
            alert(
            t('import-image-failed', {
                error:
                err.message ||
                (currentLanguage === 'zh'
                    ? '未知错误，请检查控制台。'
                    : 'Unknown error, please check console.'),
            }),
            );
        }
        })
        .catch(err => {
        alert(t('file-read-error-with-name', { name: file.name, error: err }));
        });
    } else if (file.type === 'application/json') {
    const reader = new FileReader();
    reader.onload = e => {
        try {
        const charData = JSON.parse(e.target.result);
        saveImportedCharacter(charData, null);
        } catch (err) {
        console.error(currentLanguage === 'zh' ? 'JSON导入错误:' : 'JSON import error:', err);
        alert(t('import-json-failed'));
        }
    };
    reader.readAsText(file);
    }
}
event.target.value = '';
}

/**
 * [MODIFIED] Saves an imported character card or lorebook to the database.
 * @param {object} originalCard - The parsed data from the imported file.
 * @param {string|null} avatarBase64 - The base64-encoded avatar image, if any.
 */
async function saveImportedCharacter(originalCard, avatarBase64 = null) {
if (!(await checkDbReady())) return;

let charDataForDb;

// 检测纯世界书格式：包含entries数组且没有spec字段
const isPureWorldbook = 
    originalCard.entries && 
    Array.isArray(originalCard.entries) && 
    !originalCard.spec &&
    !originalCard.data;
    
const isTavernLorebook =
    isPureWorldbook ||
    (originalCard.entries && typeof originalCard.entries === 'object' && !Array.isArray(originalCard.entries)) ||
    (originalCard.extensions &&
    originalCard.extensions.entries &&
    typeof originalCard.extensions.entries === 'object' &&
    !Array.isArray(originalCard.extensions.entries));

if (originalCard.spec === 'chara_card_v3' && originalCard.data) {
    const data = originalCard.data;
    const extensions = data.extensions || {};
    const book = data.character_book || {};

    // 转换外部卡片的 position 字段到内部格式
    function convertPositionToInternal(position) {
    // 参考SillyTavern的world_info_position定义
    const positionMap = {
        'before_char': 0,    // before
        'after_char': 1,     // after
        'top_an': 2,         // ANTop
        'bottom_an': 3,      // ANBottom
        'at_depth': 4,       // atDepth
        'em_top': 5,         // EMTop
        'em_bottom': 6       // EMBottom
    };
    
    if (typeof position === 'number') {
        return position; // 已经是数值格式
    }
    
    return positionMap[position] !== undefined ? positionMap[position] : 0;
    }

    function convertV3EntryToInternal(entry) {
    const entryExt = entry.extensions || {};
    const internalEntry = {
        id: entry.id,
        keys: entry.keys || [],
        secondary_keys: entry.secondary_keys || [],
        secondary_keys_logic: entryExt.secondary_keys_logic || 'any',
        comment: entry.comment || '',
        content: entry.content || '',
        priority: entry.insertion_order || 100,
        enabled: entry.enabled,
        position: entryExt.position !== undefined ? entryExt.position : convertPositionToInternal(entry.position),
        role: entryExt.role !== undefined ? entryExt.role : 0,
        constant: entry.constant || false,
        selective: entry.selective === undefined ? true : entry.selective,
        use_regex: entry.use_regex || false,
        prevent_recursion: entryExt.prevent_recursion || false,
        group: entryExt.group || '',
        scope: 'chat',
        display_index: entryExt.display_index || 0,
        depth: entryExt.depth !== undefined ? Number(entryExt.depth) : (entry.depth !== undefined ? Number(entry.depth) : 4),
        probability: entryExt.probability === undefined ? 100 : entryExt.probability,
        match_whole_words: entryExt.match_whole_words || false,
        case_sensitive: entryExt.case_sensitive || false,
        children: [],
    };

    if (entry.children && entry.children.length > 0) {
        internalEntry.children = entry.children.map(child => convertV3EntryToInternal(child));
    }

    return internalEntry;
    }

    const internalBookEntries = (book.entries || []).map(entry => convertV3EntryToInternal(entry));

    charDataForDb = {
    name: data.name || '',
    gender: data.gender || '',

    description: data.description || '',
    personality: data.personality || '',
    tags: data.tags || [],
    system_prompt: data.system_prompt || '',
    scenario: data.scenario || '',
    first_mes: data.first_mes || '',
    mes_example: data.mes_example || '',
    post_history_instructions: data.post_history_instructions || '',
    creator_notes: data.creator_notes || '',
    character_version: data.character_version || '',
    worldbook: internalBookEntries,
    isFavorite: extensions.fav || false,
    // 新增：备用问候语和正则脚本
    alternate_greetings: data.alternate_greetings || [],
    regex_scripts: extensions.regex_scripts || [],
    };
} else if (originalCard.spec === 'chara_card_v2' && originalCard.data) {
    const data = originalCard.data;
    const v2Extensions = data.extensions || {};
    charDataForDb = {
    name: data.name || '',
    gender: data.gender || '',

    description: data.description || '',
    personality: data.personality || '',
    tags: Array.isArray(data.tags)
        ? data.tags
        : typeof data.tags === 'string'
        ? data.tags
            .split(/[,、，\s]+/)
            .map(t => t.trim())
            .filter(Boolean)
        : [],
    system_prompt: data.system_prompt || '',
    scenario: data.scenario || '',
    first_mes: data.first_mes || '',
    mes_example: data.mes_example || '',
    post_history_instructions: data.post_history_instructions || '',
    creator_notes: data.creatorcomment || '',
    character_version: '', // v2 doesn't have this field
    worldbook:
        data.character_book && Array.isArray(data.character_book.entries) ? data.character_book.entries : [],
    // 新增：备用问候语和正则脚本（v2也可能有这些字段）
    alternate_greetings: data.alternate_greetings || [],
    regex_scripts: v2Extensions.regex_scripts || [],
    };
} else if (isTavernLorebook) {
    // Handle SillyTavern Lorebook JSON
    mylog('Detected SillyTavern Lorebook format. Converting...');
    const internalBookEntries = convertTavernLorebookToInternal(originalCard);

    charDataForDb = {
    name: originalCard.name || t('imported-lorebook'),
    description: originalCard.description || t('lorebook-description'),
    gender: '',

    personality: '',
    tags: [t('lorebook-tag')],
    system_prompt: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    post_history_instructions: '',
    creator_notes: '',
    character_version: '',
    worldbook: internalBookEntries,
    isFavorite: false,
    };
    mylog('Conversion complete. Processed entries:', internalBookEntries.length);
} else {
    charDataForDb = JSON.parse(JSON.stringify(originalCard));
    charDataForDb.tags = Array.isArray(charDataForDb.tags)
    ? charDataForDb.tags
    : typeof charDataForDb.tags === 'string'
    ? charDataForDb.tags
        .split(/[,、，\s]+/)
        .map(t => t.trim())
        .filter(Boolean)
    : [];
    charDataForDb.personality = charDataForDb.personality || '';
    charDataForDb.creator_notes = charDataForDb.creator_notes || '';
    charDataForDb.character_version = charDataForDb.character_version || '';
    charDataForDb.worldbook = charDataForDb.worldbook || [];
}

charDataForDb.avatar = avatarBase64 || originalCard.avatar || null;
charDataForDb.internalTags = charDataForDb.internalTags || [];
charDataForDb.isFavorite = charDataForDb.isFavorite || false;
charDataForDb.lastUsed = Date.now();
charDataForDb.isNewImport = true; // 标记为新导入

const transaction = db.transaction(['characters'], 'readwrite');
const store = transaction.objectStore('characters');
const addRequest = store.add(charDataForDb);

addRequest.onsuccess = async () => {
    if (document.getElementById('library-view').style.display !== 'none') {
    await renderUI();
    }
};
addRequest.onerror = e => {
    console.error(
    currentLanguage === 'zh' ? '保存导入角色失败:' : 'Failed to save imported character:',
    e.target.error,
    );
    alert(t('save-import-failed'));
};
}

async function downloadCharacter() {
if (!(await checkDbReady())) return;
const v3Card = buildLiveExportCard();
const blob = new Blob([JSON.stringify(v3Card, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
// 版本控制：文件名包含版本号
let filename = v3Card.data && v3Card.data.name ? v3Card.data.name : 'character';
if (v3Card.data && v3Card.data.character_version && v3Card.data.character_version.trim() !== '') {
    filename += '-' + v3Card.data.character_version.trim();
}
a.download = filename + '.json';
a.click();
URL.revokeObjectURL(a.href);
}

async function downloadCharacterAsPng() {
if (!(await checkDbReady())) return;
const v3Card = buildLiveExportCard();
const cardData = buildCardObject();
if (!v3Card.data || !v3Card.data.name) {
    alert('请输入角色名以生成PNG角色卡。');
    return;
}
const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(v3Card))));
const imageToUse =
    cardData.avatar || document.getElementById('avatar-preview').src || createDefaultImage('2:3');
const finalPngBlob = await embedDataInPng(imageToUse, base64Data);
const a = document.createElement('a');
a.href = URL.createObjectURL(finalPngBlob);
// 版本控制：PNG文件名包含版本号
let filename = v3Card.data.name || 'character';
if (v3Card.data.character_version && v3Card.data.character_version.trim() !== '') {
    filename += ' ' + v3Card.data.character_version.trim();
}
a.download = filename + '.png';
a.click();
URL.revokeObjectURL(a.href);
}

async function downloadAsWorldbookFile() {
if (!(await checkDbReady())) return;
const lorebookData = buildWorldbookExportObject();
const blob = new Blob([JSON.stringify(lorebookData, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
let filename = 'lorebook';
if (lorebookData.originalData && lorebookData.originalData.name) {
    filename = lorebookData.originalData.name.replace(`(${t('world-knowledge-book')}) `, '');
}
a.download = filename + '.json';
a.click();
URL.revokeObjectURL(a.href);
}

// --- 草稿卡系统 ---
const DRAFT_ID = -1;
let autoSaveTimer = null;

function debounce(func, wait) {
return function(...args) {
    const context = this;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => func.apply(context, args), wait);
};
}

async function saveDraft() {
// 只有在编辑视图可见时才保存草稿
if (document.getElementById('editor-view').style.display === 'none') return;

// 如果数据库未就绪，暂不保存
if (!db) return; 

try {
    const card = buildCardObject();
    
    // 处理 ID 
    if (card.id && String(card.id) !== String(DRAFT_ID)) {
        card.draftForId = card.id;
    }
    
    // 强制 ID 为草稿 ID
    card.id = DRAFT_ID;
    card.lastUsed = Date.now();
    if (!card.name) card.name = '未命名草稿';

    // 清理世界书数据
    const cardForDb = { ...card };
    if (typeof cleanWorldbookForStorage === 'function') {
        cardForDb.worldbook = cleanWorldbookForStorage(card.worldbook);
    } else {
            cardForDb.worldbook = JSON.parse(JSON.stringify(card.worldbook));
    }
    
    const transaction = db.transaction(['characters'], 'readwrite');
    const store = transaction.objectStore('characters');
    store.put(cardForDb);
} catch (e) {
    console.error('自动保存草稿失败', e);
}
}

const debouncedSaveDraft = debounce(saveDraft, 1000);

async function deleteDraft() {
if (!(await checkDbReady())) return;
try {
    const transaction = db.transaction(['characters'], 'readwrite');
    const store = transaction.objectStore('characters');
    store.delete(DRAFT_ID);
} catch(e) {
    console.error('删除草稿失败', e);
}
}

async function checkAndRestoreDraft() {
if (!(await checkDbReady())) return;
try {
    const transaction = db.transaction(['characters'], 'readonly');
    const store = transaction.objectStore('characters');
    const request = store.get(DRAFT_ID);
    
    request.onsuccess = (e) => {
        const draft = e.target.result;
        if (draft) {
            const restore = confirm(t('restore-draft-confirm') || '发现未保存的草稿，是否恢复？\n取消将丢弃草稿。');
            if (restore) {
                showEditorView(DRAFT_ID);
            } else {
                deleteDraft();
            }
        }
    };
} catch(e) {
    console.error('检查草稿失败', e);
}
}

// 初始化自动保存监听器
function initAutoSave() {
    const editorView = document.getElementById('editor-view');
    if (editorView.dataset.autoSaveBound) return;

    editorView.addEventListener('input', (e) => {
        if (e.target.matches('input, textarea, select')) {
            debouncedSaveDraft();
        }
    });
    
    editorView.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('.worldbook-entry')) {
            setTimeout(debouncedSaveDraft, 500);
        }
    });
    
    editorView.dataset.autoSaveBound = 'true';
}

// --- CRUD Operations ---
async function saveCharacter() {
if (!(await checkDbReady())) return;

const card = buildCardObject();
if (!card.name) {
    alert('请输入角色名称。');
    return;
}

card.internalTags = card.internalTags.filter(internalTag => card.tags.includes(internalTag));

// --- 开始修复 ---
// 创建一个专门用于存储的"干净"版本的卡片数据对象
const cardForDb = { ...card };
// 使用新函数清理世界书数据，移除所有对DOM元素的引用
cardForDb.worldbook = cleanWorldbookForStorage(card.worldbook);
// --- 修复结束 ---

const transaction = db.transaction(['characters'], 'readwrite');
const store = transaction.objectStore('characters');

cardForDb.lastUsed = Date.now(); // 确保更新的是干净对象的时间戳

// 版本控制逻辑：检查是否需要创建版本化副本
if (cardForDb.id) {
    // 编辑现有角色时，检查版本号是否变化
    const getRequest = store.get(cardForDb.id);
    getRequest.onsuccess = e => {
    const existingChar = e.target.result;
    const currentVersion = cardForDb.character_version || '';
    const previousVersion = existingChar ? existingChar.character_version || '' : '';

    if (existingChar && currentVersion !== previousVersion && currentVersion.trim() !== '') {
        // 版本号发生变化且新版本号不为空，创建版本化副本
        const versionedCopy = { ...cardForDb };
        delete versionedCopy.id; // 删除ID，让数据库自动分配新ID
        versionedCopy.lastUsed = Date.now();

        // 保存版本化副本（新版本）
        const addVersionRequest = store.add(versionedCopy);
        addVersionRequest.onsuccess = () => {
        mylog(`已创建版本化副本: ${card.name}-${currentVersion}`);
        deleteDraft();
        alert(t('character-saved', { name: card.name }));
        // 强制刷新UI以确保头像正确显示
        setTimeout(() => {
            showLibraryView();
        }, 100);
        };
        addVersionRequest.onerror = e => {
        console.error('创建版本化副本失败:', e.target.error);
        alert(t('save-failed'));
        };
    } else {
        // 版本号没有变化，正常更新原有记录
        const putRequest = store.put(cardForDb);
        putRequest.onsuccess = () => {
        deleteDraft();
        alert(t('character-saved', { name: card.name }));
        // 强制刷新UI以确保头像正确显示
        setTimeout(() => {
            showLibraryView();
        }, 100);
        };
        putRequest.onerror = e => {
        alert(t('save-failed'));
        console.error(currentLanguage === 'zh' ? '保存失败:' : 'Save failed:', e.target.error);
        };
    }
    };
    getRequest.onerror = e => {
    console.error('获取现有角色数据失败:', e.target.error);
    // 如果获取失败，直接保存
    const request = store.put(cardForDb);
    request.onsuccess = () => {
        deleteDraft();
        alert(t('character-saved', { name: card.name }));
        setTimeout(() => {
        showLibraryView();
        }, 100);
    };
    request.onerror = e => {
        alert(t('save-failed'));
        console.error(currentLanguage === 'zh' ? '保存失败:' : 'Save failed:', e.target.error);
    };
    };
} else {
    // 新建角色，直接保存
    const request = store.put(cardForDb);
    request.onsuccess = () => {
    deleteDraft();
    alert(t('character-saved', { name: card.name }));
    setTimeout(() => {
        showLibraryView();
    }, 100);
    };
    request.onerror = e => {
    alert(t('save-failed'));
    console.error(currentLanguage === 'zh' ? '保存失败:' : 'Save failed:', e.target.error);
    };
}
}

function isPureLorebook(char) {
// It must have a worldbook to be considered a lorebook.
if (!char.worldbook || char.worldbook.length === 0) {
    return false;
}

// List of fields that MUST be empty for it to be a "pure" lorebook.
const mustBeEmptyFields = [
    'gender',

    'description',
    'personality',
    'system_prompt',
    'scenario',
    'first_mes',
    'mes_example',
    'post_history_instructions',
];

for (const field of mustBeEmptyFields) {
    const value = char[field];
    if (value && typeof value === 'string' && value.trim() !== '') {
    return false; // If any of these string fields have content, it's not a pure lorebook.
    }
}

// The 'tags' field must also be empty, but we can allow the default 'lorebook' tag.
if (char.tags && Array.isArray(char.tags) && char.tags.length > 0) {
    const filteredTags = char.tags.filter(tag => tag !== t('lorebook-tag'));
    if (filteredTags.length > 0) {
    return false;
    }
}

return true;
}

function buildWorldbookExportObjectFromData(cardData) {
const v3Card = buildV3Card(cardData);

// 递归函数：将V3条目转换为Tavern格式（包括子词条）
function convertV3EntryToTavern(entry, index) {
    const tavernEntry = {
        uid: entry.id,
        key: entry.keys,
        keysecondary: entry.secondary_keys,
        comment: entry.comment,
        content: entry.content,
        constant: entry.constant,
        selective: entry.selective,
        selectiveLogic: 0,
        addMemo: true,
        order: entry.insertion_order,
        position: entry.extensions.position !== undefined ? entry.extensions.position : 0,
        disable: !entry.enabled,
        excludeRecursion: entry.extensions.prevent_recursion,
        preventRecursion: entry.extensions.prevent_recursion,
        probability: entry.extensions.probability,
        useProbability: true,
        depth: entry.extensions.depth,
        role: entry.extensions.role !== undefined ? entry.extensions.role : 0,
        displayIndex: index,
        extensions: {
            position: entry.extensions.position !== undefined ? entry.extensions.position : 0,
            exclude_recursion: entry.extensions.prevent_recursion || false,
            probability: entry.extensions.probability,
            useProbability: true,
            depth: entry.extensions.depth,
            selectiveLogic: 0,
            group: entry.extensions.group || '',
            role: entry.extensions.role !== undefined ? entry.extensions.role : 0,
        },
    };
    
    // 递归处理子词条
    if (entry.children && Array.isArray(entry.children) && entry.children.length > 0) {
        tavernEntry.children = entry.children.map((child, childIndex) => 
            convertV3EntryToTavern(child, childIndex)
        );
    }
    
    return tavernEntry;
}

// This is the format SillyTavern uses for its lorebooks.
const lorebookEntries = {};
if (v3Card.data.character_book && v3Card.data.character_book.entries) {
    v3Card.data.character_book.entries.forEach((entry, index) => {
        lorebookEntries[index] = convertV3EntryToTavern(entry, index);
    });
}

return {
    entries: lorebookEntries,
    originalData: v3Card.data.character_book || {
    name: `(${t('world-knowledge-book')}) ${cardData.name || 'Character Book'}`,
    description: cardData.creator_notes || `Character book for ${cardData.name}.`,
    scan_depth: 10,
    token_budget: 2048,
    recursive_scanning: false,
    entries: [],
    },
};
}

async function exportCharacter(id) {
if (!(await checkDbReady())) return;
const transaction = db.transaction(['characters'], 'readonly');
const store = transaction.objectStore('characters');
const request = store.get(id);

request.onsuccess = async e => {
    const charData = e.target.result;
    if (!charData) {
    alert('未找到角色!');
    return;
    }

    if (isPureLorebook(charData)) {
    const lorebookData = buildWorldbookExportObjectFromData(charData);
    const blob = new Blob([JSON.stringify(lorebookData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (charData.name || 'lorebook') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    } else {
    const v3Card = buildV3Card(charData);
    // 检查头像是否有效（不为空且不是无效值）
    const hasValidAvatar =
        charData.avatar &&
        charData.avatar.trim() !== '' &&
        charData.avatar !== 'none' &&
        charData.avatar !== 'null' &&
        charData.avatar !== 'undefined';

    if (hasValidAvatar) {
        try {
        const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(v3Card))));
        const finalPngBlob = await embedDataInPng(charData.avatar, base64Data);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalPngBlob);
        // 版本控制：PNG文件名包含版本号
        let filename = v3Card.data.name || 'character';
        if (v3Card.data.character_version && v3Card.data.character_version.trim() !== '') {
            filename += ' ' + v3Card.data.character_version.trim();
        }
        a.download = filename + '.png';
        a.click();
        URL.revokeObjectURL(a.href);
        } catch (error) {
        console.error('PNG导出失败，回退到JSON:', error);
        // 如果PNG导出失败，回退到JSON导出
        const blob = new Blob([JSON.stringify(v3Card, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        // 版本控制：JSON文件名包含版本号
        let filename = v3Card.data && v3Card.data.name ? v3Card.data.name : 'character';
        if (v3Card.data && v3Card.data.character_version && v3Card.data.character_version.trim() !== '') {
            filename += ' ' + v3Card.data.character_version.trim();
        }
        a.download = filename + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        }
    } else {
        const blob = new Blob([JSON.stringify(v3Card, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        // 版本控制：JSON文件名包含版本号
        let filename = v3Card.data && v3Card.data.name ? v3Card.data.name : 'character';
        if (v3Card.data && v3Card.data.character_version && v3Card.data.character_version.trim() !== '') {
        filename += ' ' + v3Card.data.character_version.trim();
        }
        a.download = filename + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }
    }
};

request.onerror = e => {
    alert('检索角色以供导出失败。');
    console.error('Export failed:', e.target.error);
};
}

async function deleteCharacter(id) {
if (!(await checkDbReady())) return;
if (confirm(t('confirm-delete-character'))) {
    const transaction = db.transaction(['characters'], 'readwrite');
    transaction.objectStore('characters').delete(id);
    transaction.oncomplete = async () => {
    await renderUI();
    };
}
}

// --- 聊天功能 ---
async function startChatWithCharacter(id) {
if (!(await checkDbReady())) return;

try {
    // 从当前数据库获取角色数据
    const transaction = db.transaction(['characters'], 'readonly');
    const store = transaction.objectStore('characters');
    const request = store.get(id);
    
    request.onsuccess = async (e) => {
    const charData = e.target.result;
    if (!charData) {
        alert('角色数据不存在');
        return;
    }
    
    mylog('准备复制角色到chat.html:', charData.name, 'ID:', id);
    
    // 确保角色数据的id字段正确
    charData.id = id;
    
    // 转换字段名：index.html 使用 worldbook，chat.html 使用 character_book
    if (charData.worldbook && !charData.character_book) {
        charData.character_book = {
        name: charData.name ? `${charData.name}的世界书` : '角色世界书',
        entries: charData.worldbook || []
        };
    }
    
    // 转换正则脚本字段：确保 chat.html 能正确加载局部正则脚本
    // 优先级：extensions.regex_scripts > regex_scripts > regex
    if (!charData.regex) {
        if (charData.extensions && charData.extensions.regex_scripts) {
        charData.regex = charData.extensions.regex_scripts;
        charData.regex_enabled = true;
        } else if (charData.regex_scripts) {
        charData.regex = charData.regex_scripts;
        charData.regex_enabled = true;
        }
    }
    
    // 打开chat.html使用的独立IndexedDB（NikaChatDB）
    const chatDbRequest = indexedDB.open('NikaChatDB', 1);
    
    chatDbRequest.onerror = () => {
        console.error('无法打开聊天数据库');
        alert('无法连接到聊天数据库');
    };
    
    chatDbRequest.onsuccess = async (event) => {
        const chatDb = event.target.result;
        
        try {
        // 将角色添加到IndexedDB的characters存储
        const chatTransaction = chatDb.transaction(['characters'], 'readwrite');
        const chatStore = chatTransaction.objectStore('characters');
        
        // 使用put而不是add，这样可以更新已存在的角色
        const putRequest = chatStore.put(charData);
        
        putRequest.onsuccess = () => {
            mylog('角色已保存到IndexedDB characters存储');
            
            // 将当前角色ID存入IndexedDB的keyvalue存储
            const kvTransaction = chatDb.transaction(['keyvalue'], 'readwrite');
            const kvStore = kvTransaction.objectStore('keyvalue');
            const kvRequest = kvStore.put({ key: 'active_character_v2', value: String(id) });
            
            kvRequest.onsuccess = () => {
            mylog('当前角色ID已保存到IndexedDB:', id);
            // 跳转到chat.html
            window.location.href = 'chat.html?from_index=1';
            };
            
            kvRequest.onerror = () => {
            console.error('保存角色ID失败');
            // 仍然跳转，chat.html会使用默认角色
            window.location.href = 'chat.html?from_index=1';
            };
        };
        
        putRequest.onerror = (error) => {
            console.error('保存角色到IndexedDB失败:', error);
            alert('保存角色失败，请重试');
        };
        
        } catch (error) {
        console.error('IndexedDB操作失败:', error);
        alert('数据库操作失败: ' + error.message);
        }
    };
    
    chatDbRequest.onupgradeneeded = (event) => {
        const chatDb = event.target.result;
        // 创建 characters 存储（用于角色数据）
        if (!chatDb.objectStoreNames.contains('characters')) {
        const store = chatDb.createObjectStore('characters', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('lastUsed', 'lastUsed', { unique: false });
        }
        // 创建 keyvalue 存储（用于配置和聊天记录）
        if (!chatDb.objectStoreNames.contains('keyvalue')) {
        chatDb.createObjectStore('keyvalue', { keyPath: 'key' });
        }
    };
    };
    
    request.onerror = () => {
    alert('获取角色数据失败');
    console.error('Failed to get character:', request.error);
    };
} catch (error) {
    console.error('启动聊天失败:', error);
    alert('启动聊天失败: ' + error.message);
}
}

function continueChatting() {
// 直接跳转到chat.html，chat.html会自动加载上次的角色
window.location.href = 'chat.html';
}

// 将函数暴露到全局作用域，以便HTML的onclick可以访问
window.startChatWithCharacter = startChatWithCharacter;
window.continueChatting = continueChatting;

async function toggleFavorite(id, event) {
if (!(await checkDbReady())) return;
event.stopPropagation();
const transaction = db.transaction(['characters'], 'readwrite');
const store = transaction.objectStore('characters');
const request = store.get(id);
request.onsuccess = e => {
    const charData = e.target.result;
    charData.isFavorite = !charData.isFavorite;
    store.put(charData);
};
event.target.classList.toggle('favorited');
}

// --- UI Rendering ---
async function renderUI() {
if (!(await checkDbReady())) return;

// 显示加载动画
const loadingOverlay = document.getElementById('loading-overlay');
loadingOverlay.style.display = 'flex';

// 记录开始时间，确保加载动画至少显示500ms
const startTime = Date.now();

try {
    const transaction = db.transaction(['characters'], 'readonly');
    const allChars = await new Promise((resolve, reject) => {
    const req = transaction.objectStore('characters').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    });
    
    // 过滤掉草稿
    const validChars = allChars.filter(c => c.id !== DRAFT_ID);
    
    validChars.sort((a, b) => b.isFavorite - a.isFavorite || (b.lastUsed || 0) - (a.lastUsed || 0));
    renderTags(validChars);
    renderCharacters(validChars);
    
    // 等待所有图片加载完成
    await waitForImagesToLoad();
    
    // 确保加载动画至少显示500ms
    const elapsedTime = Date.now() - startTime;
    const minDisplayTime = 500;
    if (elapsedTime < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
    }
    
    // 渲染完成后隐藏加载动画
    loadingOverlay.style.display = 'none';
} catch (error) {
    loadingOverlay.style.display = 'none';
    alert('❌ UI渲染失败: ' + error.message + '\n请刷新页面重试');
}
}

// 等待所有角色卡背景图片加载完成
async function waitForImagesToLoad() {
    const cards = document.querySelectorAll('.character-card');
    const imagePromises = [];
    
    cards.forEach(card => {
        const bgImage = card.style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
            // 提取URL
            const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (urlMatch && urlMatch[1]) {
                const imageUrl = urlMatch[1];
                // 创建Image对象来预加载
                const promise = new Promise((resolve) => {
                    // 如果是data URL，直接resolve
                    if (imageUrl.startsWith('data:')) {
                        resolve();
                        return;
                    }
                    
                    const img = new Image();
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); // 即使加载失败也继续
                    img.src = imageUrl;
                    
                    // 设置超时，避免某个图片加载太久
                    setTimeout(() => resolve(), 3000);
                });
                imagePromises.push(promise);
            }
        }
    });
    
    // 等待所有图片加载完成（或超时）
    if (imagePromises.length > 0) {
        await Promise.all(imagePromises);
    }
}

function renderTags(characters) {
const tagContainer = document.getElementById('tag-container');
const internalTags = new Set();
const extraTags = new Set();

characters.forEach(char => {
    (char.internalTags || []).forEach(tag => {
    if (tag) internalTags.add(tag.trim());
    });
    const tags = Array.isArray(char.tags)
    ? char.tags
    : typeof char.tags === 'string'
    ? char.tags.split(/[,、，\s]+/)
    : [];
    tags.forEach(tag => {
    if (tag) extraTags.add(tag.trim());
    });
});

let tagsHtml = `<div class="tag type-special ${
    activeFilters.has('FAVORITE') ? 'active' : ''
}" onclick="toggleFilter('FAVORITE', event)">${t('favorite')}</div>`;
[...extraTags].sort().forEach(tag => {
    tagsHtml += `<div class="tag type-personality ${
    activeFilters.has(tag) ? 'active' : ''
    }" onclick="toggleFilter('${tag}', event)">${tag}</div>`;
});
[...internalTags].sort().forEach(tag => {
    tagsHtml += `<div class="tag type-internal ${
    activeFilters.has(tag) ? 'active' : ''
    }" onclick="toggleFilter('${tag}', event)">${tag}</div>`;
});

tagContainer.innerHTML = tagsHtml;
}

function renderCharacters(characters) {
const grid = document.getElementById('character-grid');
grid.innerHTML = '';

let filteredChars = characters;
if (activeFilters.size > 0) {
    filteredChars = characters.filter(char => {
    if (activeFilters.has('FAVORITE') && !char.isFavorite) return false;

    const regularFilters = [...activeFilters].filter(f => f !== 'FAVORITE');
    if (regularFilters.length > 0) {
        const tagSet = new Set(
        [
            ...(Array.isArray(char.tags)
            ? char.tags
            : typeof char.tags === 'string'
            ? char.tags.split(/[,、，\s]+/)
            : []),
            ...(char.internalTags || []),
        ].map(t => t.trim()),
        );
        return regularFilters.every(filter => tagSet.has(filter));
    }
    return true;
    });
}

if (filteredChars.length === 0) {
    grid.innerHTML = `
        <div class="create-character-placeholder" style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; min-height: 200px;">
            <button class="create-character-btn" onclick="createNewCharacter()" style="
                width: 150px;
                height: 150px;
                border: 2px dashed #ccc;
                background: transparent;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-size: 48px;
                color: #999;
                transition: all 0.3s ease;
            " onmouseover="this.style.borderColor='#e67e22'; this.style.color='#e67e22';" onmouseout="this.style.borderColor='#ccc'; this.style.color='#999';">
                <div>+</div>
                <div style="font-size: 14px; margin-top: 8px;">${t('create-new-character')}</div>
            </button>
        </div>
    `;
    return;
}

function fitCharacterCardTags(card, headerDiv, tagsDiv, footerDiv) {
    if (!card || !headerDiv || !tagsDiv || !footerDiv) return;

    const tags = Array.from(tagsDiv.children);
    if (tags.length === 0) return;

    const header = headerDiv.querySelector('.card-header');
    const description = headerDiv.querySelector('.card-description');
    const headerHeight = header ? header.offsetHeight : 0;
    const descriptionHeight = description ? description.offsetHeight : 0;
    const availableHeight = Math.max(0, card.clientHeight - footerDiv.offsetHeight - headerHeight - descriptionHeight - 18);

    tagsDiv.innerHTML = '';
    let usedHeight = 0;

    for (const tag of tags) {
        tagsDiv.appendChild(tag);
        const nextHeight = tagsDiv.scrollHeight;
        if (nextHeight <= availableHeight) {
            usedHeight = nextHeight;
            continue;
        }
        tagsDiv.removeChild(tag);
        break;
    }

    tagsDiv.style.maxHeight = usedHeight > 0 ? `${usedHeight}px` : '0px';
}

filteredChars.forEach(char => {
    const card = document.createElement('div');
    card.className = 'character-card';

    // 直接设置背景图片，不使用懒加载
    let imageToDisplay;
    if (char.avatar && char.avatar.trim() !== '') {
        imageToDisplay = char.avatar;
    } else {
        imageToDisplay = createDefaultImage('2:3');
    }
    
    // 直接设置背景图片，使用!important确保覆盖CSS默认样式
    card.style.setProperty('background-image', `url('${imageToDisplay}')`, 'important');
    card.style.setProperty('background-size', 'cover', 'important');
    card.style.setProperty('background-position', 'center', 'important');
    
    // 添加一个轻微的遮罩以确保文字可读性
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(to top, rgba(28, 28, 28, 0.6) 0%, rgba(28, 28, 28, 0.2) 50%, rgba(28, 28, 28, 0.4) 100%);
        pointer-events: none;
        z-index: 1;
    `;
    card.appendChild(overlay);

    const headerDiv = document.createElement('div');
    headerDiv.style.position = 'relative';
    headerDiv.style.zIndex = '2'; // 确保内容在遮罩层之上
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';

    const h2 = document.createElement('h2');
    // 版本控制：显示角色名 版本号格式
    let displayName = char.name || '无名角色';
    if (char.character_version && char.character_version.trim() !== '') {
    displayName += ' ' + char.character_version.trim();
    }
    h2.textContent = displayName;

    const favButton = document.createElement('button');
    favButton.className = `favorite-btn ${char.isFavorite ? 'favorited' : ''}`;
    favButton.innerHTML = '★';
    favButton.onclick = event => toggleFavorite(char.id, event);

    cardHeader.appendChild(h2);
    cardHeader.appendChild(favButton);

    const descriptionP = document.createElement('p');
    descriptionP.className = 'card-description';
    descriptionP.textContent = char.description || t('no-description');

    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'card-tags tag-group';
    const tagsArray = Array.isArray(char.tags)
    ? char.tags
    : typeof char.tags === 'string'
    ? char.tags.split(/[,、，\s]+/)
    : [];
    const personalityTagsHtml = tagsArray
    .filter(t => t)
    .map(tag => `<span class="tag type-personality">${tag.trim()}</span>`)
    .join(' ');
    const internalTagsHtml = (char.internalTags || [])
    .filter(t => t)
    .map(tag => `<span class="tag type-internal">${tag.trim()}</span>`)
    .join(' ');
    tagsDiv.innerHTML = personalityTagsHtml + ' ' + internalTagsHtml;

    headerDiv.appendChild(cardHeader);
    headerDiv.appendChild(descriptionP);
    headerDiv.appendChild(tagsDiv);

    const footerDiv = document.createElement('div');
    footerDiv.className = 'card-footer';
    footerDiv.style.position = 'relative';
    footerDiv.style.zIndex = '2'; // 确保内容在遮罩层之上
    footerDiv.innerHTML = `
    <button onclick="showEditorView(${char.id})">✏️ ${t('edit')}</button>
    <button onclick="exportCharacter(${char.id})">📤 ${t('export')}</button>
    <button onclick="deleteCharacter(${char.id})">🗑️ ${t('delete')}</button>
    <button onclick="startChatWithCharacter(${char.id})">💬 ${t('chat')}</button>
`;

    card.appendChild(headerDiv);
    card.appendChild(footerDiv);
    grid.appendChild(card);

    requestAnimationFrame(() => fitCharacterCardTags(card, headerDiv, tagsDiv, footerDiv));
});
}

async function toggleFilter(filterName, event) {
event.stopPropagation();
const button = event.currentTarget;
button.classList.toggle('active');
activeFilters.has(filterName) ? activeFilters.delete(filterName) : activeFilters.add(filterName);
await renderUI();
}

// --- Editor Form Management ---
function clearEditorForm() {
const fields = [
    'charId',
    'name',
    'description',
    'personality',
    'system_prompt',
    'scenario',
    'first_mes',
    'mes_example',
    'internalTags',
    'isFavorite',
    'originalCardData',

    'gender',
    'tags',
    'post_history_instructions',
    'creator_notes',
    'character_version',
];
fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
});
document.querySelectorAll('.ai-undo-button').forEach(btn => (btn.style.display = 'none'));
document.getElementById('worldbook-entries-container').innerHTML = '';
document.getElementById('avatar-input').value = '';
document.getElementById('avatar-preview').src = createDefaultImage('2:3');
avatarImageBase64 = null;
// 清空备用问候语和正则脚本数据
alternateGreetingsData = [];
regexScriptsData = [];
document.querySelector('#editor-view .editor-body').scrollTop = 0;
}

function populateEditorForm(charData) {
document.getElementById('charId').value = charData.id || '';
document.getElementById('name').value = charData.name || '';
document.getElementById('gender').value = charData.gender || '';

document.getElementById('description').value = charData.description || '';
document.getElementById('tags').value = Array.isArray(charData.tags)
    ? charData.tags.join(', ')
    : typeof charData.tags === 'string'
    ? charData.tags
    : '';
document.getElementById('personality').value = charData.personality || '';
document.getElementById('system_prompt').value = charData.system_prompt || '';
document.getElementById('scenario').value = charData.scenario || '';
document.getElementById('first_mes').value = charData.first_mes || '';
document.getElementById('mes_example').value = charData.mes_example || '';
const postHistoryTextarea = document.getElementById('post_history_instructions');
postHistoryTextarea.value = charData.post_history_instructions || '';
// 标记这是用户保存的内容，防止被指令系统覆盖
postHistoryTextarea.dataset.lastInstructionText = '';

document.getElementById('creator_notes').value = charData.creator_notes || '';
document.getElementById('character_version').value = charData.character_version || '';
document.getElementById('internalTags').value = JSON.stringify(charData.internalTags || []);
document.getElementById('isFavorite').value = charData.isFavorite || false;

// 恢复角色卡关联的指令数据
if (charData.instructionsData && Array.isArray(charData.instructionsData)) {
    instructionsData = charData.instructionsData;
    renderInstructionCards();
    updatePostHistoryInstructions();
} else {
    // 如果没有保存的指令数据，清空当前指令
    instructionsData = [];
    renderInstructionCards();
    updatePostHistoryInstructions();
}

// 如果是新导入的角色，设置标志跳过恢复折叠状态
if (charData.isNewImport) {
    skipRestoreFoldStates = true;
    mylog('检测到新导入的角色，将在渲染后折叠所有条目');
}

renderWorldbookFromData(charData.worldbook || []);

// 如果是新导入的角色，折叠所有世界书条目
if (charData.isNewImport) {
    // 使用更长的延迟确保DOM完全渲染
    setTimeout(() => {
        mylog('开始折叠所有世界书条目');
        foldAllWorldbookEntries();
        
        // 清除标记，避免下次编辑时再次折叠
        const charId = charData.id;
        if (charId && db) {
            const transaction = db.transaction(['characters'], 'readwrite');
            const store = transaction.objectStore('characters');
            const getRequest = store.get(charId);
            getRequest.onsuccess = () => {
                const char = getRequest.result;
                if (char) {
                    delete char.isNewImport;
                    store.put(char);
                    mylog('已清除新导入标记');
                }
            };
        }
    }, 500);
}

// 恢复备用问候语数据
if (charData.alternate_greetings && Array.isArray(charData.alternate_greetings)) {
    alternateGreetingsData = charData.alternate_greetings;
    renderAlternateGreetings();
} else {
    alternateGreetingsData = [];
    renderAlternateGreetings();
}

// 恢复正则脚本数据（兼容 regex_scripts 和 regex 两种字段名）
const regexData = charData.regex_scripts || charData.regex;
if (regexData && Array.isArray(regexData)) {
    regexScriptsData = regexData;
    renderRegexScripts();
} else {
    regexScriptsData = [];
    renderRegexScripts();
}

// 新增: 角色加载后，自动调整所有文本框大小以适应内容，改善移动端编辑体验
document.querySelectorAll('#editor-view textarea').forEach(autoResizeTextarea);

if (charData.avatar) {
    // 强制显示任何图片格式
    if (charData.avatar.startsWith('data:image/')) {
    document.getElementById('avatar-preview').src = charData.avatar;
    avatarImageBase64 = charData.avatar;
    } else if (charData.avatar.startsWith('http://') || charData.avatar.startsWith('https://')) {
    document.getElementById('avatar-preview').src = charData.avatar;
    avatarImageBase64 = charData.avatar;
    } else if (charData.avatar.trim() !== '') {
    document.getElementById('avatar-preview').src = charData.avatar;
    avatarImageBase64 = charData.avatar;
    } else {
    document.getElementById('avatar-preview').src = createDefaultImage('2:3');
    avatarImageBase64 = null;
    }
} else {
    document.getElementById('avatar-preview').src = createDefaultImage('2:3');
    avatarImageBase64 = null;
}
document.querySelectorAll('.ai-undo-button').forEach(btn => (btn.style.display = 'none'));
document.querySelector('#editor-view .editor-body').scrollTop = 0;

// 隐藏加载圈
document.getElementById('loading-overlay').style.display = 'none';
}

document.getElementById('avatar-input').addEventListener('change', function (event) {
const file = event.target.files[0];
if (!file) return;

if (!file.type.startsWith('image/')) {
    alert(t('upload-image-only'));
    event.target.value = '';
    return;
}

const reader = new FileReader();
reader.onload = async function (e) {
    try {
    // 将任何格式的图片转换为PNG格式
    const pngDataUrl = await convertImageToPng(e.target.result);
    avatarImageBase64 = pngDataUrl;
    document.getElementById('avatar-preview').src = pngDataUrl;
    mylog(
        currentLanguage === 'zh' ? '头像已转换为PNG格式:' : 'Avatar converted to PNG format:',
        pngDataUrl.substring(0, 50) + '...',
    );
    } catch (error) {
    console.error(currentLanguage === 'zh' ? '图片转换失败:' : 'Image conversion failed:', error);
    alert(t('image-process-failed', { error: error.message }));
    event.target.value = '';
    }
};
reader.onerror = function () {
    alert(t('file-read-error'));
    event.target.value = '';
};
reader.readAsDataURL(file);
});

// 用于在保存到数据库前，清理世界书数据中的DOM元素引用
function cleanWorldbookForStorage(entries) {
if (!entries) return [];
return entries.map(entry => {
    // 创建一个不包含 'element' 属性的新对象
    const { element, ...cleanedEntry } = entry;

    // 对子条目进行递归清理
    if (entry.children && entry.children.length > 0) {
    cleanedEntry.children = cleanWorldbookForStorage(entry.children);
    }
    return cleanedEntry;
});
}

// --- Object Building ---
function buildCardObject() {
const worldbookData = buildWorldbookDataFromDOM();

const card = {
    name: document.getElementById('name').value.trim(),
    gender: document.getElementById('gender').value.trim(),

    description: document.getElementById('description').value.trim(),
    personality: document.getElementById('personality').value.trim(),
    tags: document
    .getElementById('tags')
    .value.trim()
    .split(/[,、，\s]+/)
    .map(t => t.trim())
    .filter(Boolean),
    system_prompt: document.getElementById('system_prompt').value.trim(),
    scenario: document.getElementById('scenario').value.trim(),
    first_mes: document.getElementById('first_mes').value.trim(),
    mes_example: document.getElementById('mes_example').value.trim(),
    post_history_instructions: document.getElementById('post_history_instructions').value.trim(),
    creator_notes: document.getElementById('creator_notes').value.trim(),
    character_version: document.getElementById('character_version').value.trim(),
    internalTags: JSON.parse(document.getElementById('internalTags').value || '[]'),
    isFavorite: document.getElementById('isFavorite').value === 'true',
    avatar: avatarImageBase64,
    worldbook: worldbookData,
    instructionsData: instructionsData || [],
    // 新增：备用问候语和正则脚本
    alternate_greetings: alternateGreetingsData || [],
    regex_scripts: regexScriptsData || [],
};
const charId = parseInt(document.getElementById('charId').value, 10);
if (!isNaN(charId)) card.id = charId;

return card;
}

function buildLiveExportCard() {
const currentCardState = buildCardObject();
return buildV3Card(currentCardState);
}

function hasWorldbookContent(entries) {
if (!entries || entries.length === 0) {
    return false;
}
for (const entry of entries) {
    if (entry.content && entry.content.trim() !== '') {
    return true;
    }
    if (entry.children && entry.children.length > 0) {
    if (hasWorldbookContent(entry.children)) {
        return true;
    }
    }
}
return false;
}

function buildV3Card(cardData) {
// 转换内部数值格式的position到V3字符串格式
function convertPositionToV3(position) {
    const positionMap = {
    0: 'before_char',
    1: 'after_char', 
    2: 'top_an',
    3: 'bottom_an',
    4: 'at_depth',
    5: 'em_top',
    6: 'em_bottom'
    };
    return positionMap[position] || 'before_char';
}

// 递归函数：将条目及其子条目转换为V3格式
function convertEntryToV3(entry) {
    const v3Entry = {
    id: entry.id,
    keys: entry.keys || [],
    secondary_keys: entry.secondary_keys || [],
    comment: entry.comment || '',
    content: entry.content || '',
    constant: entry.constant || false,
    selective: entry.selective === undefined ? true : entry.selective,
    insertion_order: entry.priority || 100,
    enabled: entry.enabled === undefined ? true : entry.enabled,
    position: convertPositionToV3(entry.position),
    use_regex: entry.use_regex || false,
    extensions: {
        position: entry.position !== undefined ? entry.position : 0,
        exclude_recursion: entry.exclude_recursion !== undefined ? entry.exclude_recursion : true,
        display_index: entry.display_index || 0,
        probability: entry.probability === undefined ? 100 : entry.probability,
        useProbability: true,
        depth: (entry.depth !== undefined && entry.depth !== null) ? Number(entry.depth) : 4,
        selectiveLogic: 0,
        group: entry.group || '',
        group_override: entry.group_override || false,
        group_weight: entry.group_weight || 100,
        prevent_recursion: entry.prevent_recursion !== undefined ? entry.prevent_recursion : true,
        delay_until_recursion: false,
        scan_depth: entry.scan_depth || null,
        match_whole_words: entry.match_whole_words || null,
        use_group_scoring: entry.use_group_scoring || false,
        case_sensitive: entry.case_sensitive || null,
        automation_id: '',
        role: entry.position === 4 ? (entry.role !== undefined ? entry.role : 0) : 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        // 额外匹配源 - 默认开启
        match_persona_description: entry.match_persona_description !== undefined ? entry.match_persona_description : true,
        match_character_description: entry.match_character_description !== undefined ? entry.match_character_description : true,
        match_character_personality: entry.match_character_personality !== undefined ? entry.match_character_personality : true,
        match_character_depth_prompt: entry.match_character_depth_prompt !== undefined ? entry.match_character_depth_prompt : true,
        match_scenario: entry.match_scenario !== undefined ? entry.match_scenario : true,
        secondary_keys_logic: entry.secondary_keys_logic || 'any',
    },
    };

    // 递归处理子条目
    if (entry.children && entry.children.length > 0) {
    v3Entry.children = entry.children.map(child => convertEntryToV3(child));
    }

    return v3Entry;
}

const v3BookEntries = (cardData.worldbook || []).map(entry => convertEntryToV3(entry));
const worldbookHasContent = hasWorldbookContent(cardData.worldbook);

const dataObject = {
    name: cardData.name || '',
    description: cardData.description || '',
    personality: cardData.personality || '',
    scenario: cardData.scenario || '',
    first_mes: cardData.first_mes || '',
    mes_example: cardData.mes_example || '',
    creator_notes: cardData.creator_notes || 'Created with Nika Character Studio',
    system_prompt: cardData.system_prompt || '',
    post_history_instructions: cardData.post_history_instructions || '',
    tags: cardData.tags || [],
    creator: 'Nika Studio User',
    character_version: cardData.character_version || '1.0',
    alternate_greetings: cardData.alternate_greetings || [],
    group_only_greetings: [],
    extensions: {
    talkativeness: '0.5',
    fav: cardData.isFavorite || false,
    depth_prompt: { prompt: '', depth: 4, role: 'system' },
    regex_scripts: cardData.regex_scripts || [],
    },
    character_book: worldbookHasContent
    ? {
        name: `(${t('world-knowledge-book')}) ${cardData.name || 'Character Book'}`,
        description: cardData.creator_notes || `Character book for ${cardData.name}.`,
        scan_depth: 10,
        token_budget: 2048,
        recursive_scanning: false,
        entries: v3BookEntries,
        }
    : undefined,
};

return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    name: dataObject.name,
    description: dataObject.description,
    personality: dataObject.personality,
    scenario: dataObject.scenario,
    first_mes: dataObject.first_mes,
    mes_example: dataObject.mes_example,
    creatorcomment: dataObject.creator_notes,
    post_history_instructions: dataObject.post_history_instructions,
    tags: dataObject.tags,
    create_date: new Date().toISOString(),
    avatar: 'none',
    talkativeness: '0.5',
    fav: dataObject.extensions.fav,
    data: dataObject,
};
}

function buildWorldbookExportObject() {
const cardData = buildCardObject();
return buildWorldbookExportObjectFromData(cardData);
}

function injectEntry(entry) {
const userPromptTextarea = document.getElementById('user_prompt');
const comment = entry.comment;
const content = entry.content;
let newText;

if (content.trim().length > 0) {
    newText = `[${comment}：${content}]`;
} else {
    newText = `[${comment}]`;
}

// 获取光标位置
const startPos = userPromptTextarea.selectionStart;
const endPos = userPromptTextarea.selectionEnd;

// 插入文本
const textBefore = userPromptTextarea.value.substring(0, startPos);
const textAfter = userPromptTextarea.value.substring(endPos, userPromptTextarea.value.length);
userPromptTextarea.value = textBefore + newText + textAfter;

// 恢复光标位置
userPromptTextarea.selectionStart = startPos + newText.length;
userPromptTextarea.selectionEnd = startPos + newText.length;

// 聚焦到文本框
userPromptTextarea.focus();
}





































// ====================================================================================
// --- 长文本转世界书功能 ---
// ====================================================================================

// 全局变量
let currentNovelContent = '';
let memoryQueue = [];
let generatedWorldbook = {};
let isProcessingStopped = false; // 停止处理标志
let failedMemoryQueue = []; // 失败的记忆队列，用于一键修复
let isRepairingMemories = false; // 是否正在修复记忆
let currentProcessingIndex = -1; // 当前正在处理的记忆块索引

// IndexedDB 辅助类
const IndexedDBHelper = {
dbName: 'NovelWorldbookDB',
storeName: 'states',
version: 1,

// 打开数据库
async openDB() {
    return new Promise((resolve, reject) => {
    const request = indexedDB.open(this.dbName, this.version);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName);
        }
    };
    });
},

// 保存数据
async setItem(key, value) {
    try {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(value, key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        
        transaction.oncomplete = () => db.close();
    });
    } catch (error) {
    console.error('IndexedDB setItem 错误:', error);
    throw error;
    }
},

// 获取数据
async getItem(key) {
    try {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        
        transaction.oncomplete = () => db.close();
    });
    } catch (error) {
    console.error('IndexedDB getItem 错误:', error);
    return null;
    }
},

// 删除数据
async removeItem(key) {
    try {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        
        transaction.oncomplete = () => db.close();
    });
    } catch (error) {
    console.error('IndexedDB removeItem 错误:', error);
    throw error;
    }
}
};

// 简单的状态管理（使用 IndexedDB）
const NovelState = {
// 保存当前状态
async saveState(currentIndex = 0) {
    const state = {
    currentIndex: currentIndex,
    totalItems: memoryQueue.length,
    memoryQueue: memoryQueue,
    generatedWorldbook: generatedWorldbook,
    currentNovelContent: currentNovelContent,
    currentFileName: currentFile ? currentFile.name : null,
    lastUpdate: Date.now(),
    completed: currentIndex >= memoryQueue.length
    };
    await IndexedDBHelper.setItem('novel_worldbook_state', state);
    mylog(`状态已保存: ${currentIndex}/${memoryQueue.length}`, currentFile ? `文件: ${currentFile.name}` : '无文件');
},

// 加载状态
async loadState() {
    const saved = await IndexedDBHelper.getItem('novel_worldbook_state');
    return saved || null;
},

// 清除状态
async clearState() {
    await IndexedDBHelper.removeItem('novel_worldbook_state');
    mylog('状态已清除');
},

// 检查是否有未完成的状态
async hasIncompleteState() {
    const state = await this.loadState();
    return state && !state.completed && state.currentIndex < state.totalItems;
},

// 检查是否有任何保存的状态（包括已完成的）
async hasSavedState() {
    const state = await this.loadState();
    return state !== null;
}
};

// 检查是否有保存的状态
async function checkForSavedState() {
const state = await NovelState.loadState();
if (!state) return;

const lastUpdate = new Date(state.lastUpdate).toLocaleString();

// 检查实际未处理的记忆块数量
const unprocessedCount = (state.memoryQueue || []).filter(m => !m.processed).length;
const processedCount = (state.memoryQueue || []).filter(m => m.processed).length;
const totalCount = state.totalItems || (state.memoryQueue || []).length;

// 只有当所有记忆块都已处理时才算完成
const isCompleted = (state.completed && unprocessedCount === 0) || (unprocessedCount === 0 && processedCount > 0);
const progress = Math.round((processedCount / totalCount) * 100);

mylog(`状态检查: 总数=${totalCount}, 已处理=${processedCount}, 未处理=${unprocessedCount}, 完成=${isCompleted}`);

let message;
if (isCompleted) {
    message = 
    `检测到已完成的转换结果:\n` +
    `文件: ${totalCount} 个记忆块\n` +
    `完成时间: ${lastUpdate}\n` +
    `世界书条目: ${Object.keys(state.generatedWorldbook || {}).length} 个分类\n\n` +
    `是否加载上次的结果？\n` +
    `选择"确定"加载，"取消"开始新任务`;
} else {
    message = 
    `检测到未完成的转换任务:\n` +
    `进度: ${processedCount}/${totalCount} (${progress}%)\n` +
    `还有 ${unprocessedCount} 个记忆块未处理\n` +
    `最后更新: ${lastUpdate}\n\n` +
    `是否继续上次的进度？\n` +
    `选择"确定"继续，"取消"开始新任务`;
}

const shouldRestore = confirm(message);

if (shouldRestore) {
    restoreState(state, isCompleted);
} else {
    // 用户选择开始新任务，清除旧状态
    await NovelState.clearState();
}
}

// 恢复状态
function restoreState(state, isCompleted = false) {
// 恢复全局变量
memoryQueue = state.memoryQueue || [];
generatedWorldbook = state.generatedWorldbook || {};
currentNovelContent = state.currentNovelContent || '';

// 恢复文件信息（创建一个虚拟的文件对象）
if (state.currentFileName) {
    currentFile = { name: state.currentFileName };
    mylog('恢复文件名:', state.currentFileName);
} else {
    currentFile = null;
    mylog('没有保存的文件名信息');
}

// 更新UI
updateMemoryQueueUI();

// 显示恢复的内容信息
if (currentNovelContent) {
    document.getElementById('novel-drop-zone').innerHTML = `
    <div style="font-size: 48px; margin-bottom: 15px;">📖</div>
    <p>${isCompleted ? '已恢复已完成的小说内容' : '已恢复上次的小说内容'}</p>
    <p style="color: #aaa; font-size: 14px; margin-top: 10px;">字数：${currentNovelContent.length.toLocaleString()}</p>
    `;
}

if (isCompleted) {
    // 已完成的任务，显示结果
    showCompletedResult();
} else {
    // 未完成的任务，找到第一个未处理的记忆块索引
    let firstUnprocessedIndex = 0;
    for (let i = 0; i < memoryQueue.length; i++) {
        if (!memoryQueue[i].processed) {
            firstUnprocessedIndex = i;
            break;
        }
    }
    mylog(`📋 恢复状态: 第一个未处理的记忆块索引=${firstUnprocessedIndex}`);
    addContinueButton(firstUnprocessedIndex);
}
}

// 显示已完成的结果
function showCompletedResult() {
// 检查是否有失败的记忆
const failedCount = memoryQueue.filter(m => m.failed === true).length;

// 显示进度区域
document.getElementById('progress-section').style.display = 'block';

// 显示进度为100%
document.getElementById('progress-fill').style.width = '100%';

if (failedCount > 0) {
    document.getElementById('progress-text').textContent = `⚠️ 转换已完成（已恢复），但有 ${failedCount} 个记忆块失败，请点击修复`;
} else {
    document.getElementById('progress-text').textContent = '✅ 转换已完成（已恢复）';
}

// 如果有失败记忆，显示修复按钮和记忆队列
if (failedCount > 0) {
    updateRepairButton();
    updateMemoryQueueUI();
}

// 显示操作按钮
const container = document.querySelector('.conversion-controls') || document.querySelector('.worldbook-body');

// 添加查看世界书按钮（带历史和AI优化功能）
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
}

// 添加继续处理按钮
function addContinueButton(fromIndex) {
const container = document.querySelector('.conversion-controls') || document.querySelector('.worldbook-body');

// 避免重复添加
const existingBtn = document.getElementById('continue-btn');
if (existingBtn) existingBtn.remove();

const continueBtn = document.createElement('button');
continueBtn.id = 'continue-btn';
continueBtn.textContent = `继续处理 (从第${fromIndex + 1}个开始)`;
continueBtn.style.cssText = 'background: #ff6b35; color: white; padding: 12px 24px; border: none; border-radius: 5px; margin: 15px 0; cursor: pointer; font-size: 16px;';
continueBtn.onclick = () => {
    continueBtn.remove();
    continueProcessing(fromIndex);
};

container.appendChild(continueBtn);
}

// 继续处理
async function continueProcessing(fromIndex) {
if (memoryQueue.length === 0) {
    alert('没有要处理的内容');
    return;
}

// 显示进度区域
document.getElementById('progress-section').style.display = 'block';

// 重置停止标志并添加停止按钮
isProcessingStopped = false;
addStopButton();

// 找到第一个未处理的记忆索引（考虑分裂后队列变化的情况）
let startIndex = 0;
for (let i = 0; i < memoryQueue.length; i++) {
    if (!memoryQueue[i].processed) {
        startIndex = i;
        break;
    }
}
mylog(`📋 继续处理：队列长度=${memoryQueue.length}，从索引${startIndex}开始（原索引${fromIndex}）`);
mylog(`📋 队列标题: ${memoryQueue.map(m => m.title).join(', ')}`);

try {
    for (let i = startIndex; i < memoryQueue.length; i++) {
    // 跳过已处理的记忆
    if (memoryQueue[i].processed) {
        mylog(`⏭️ 跳过已处理的记忆: ${memoryQueue[i].title}`);
        continue;
    }
    
    // 检查是否用户要求停止
    if (isProcessingStopped) {
        mylog('继续处理被用户停止');
        document.getElementById('progress-text').textContent = `⏸️ 已暂停处理 (${i}/${memoryQueue.length})`;
        
        // 转换为继续按钮
        convertToResumeButton(i);
        
        alert(`处理已暂停！\n当前进度: ${i}/${memoryQueue.length}\n\n进度已保存，点击"继续处理"按钮可以继续。`);
        break;
    }
    
    await processMemoryChunk(i);
    
    // 每处理完一个记忆块就保存状态（使用已处理数量而非索引）
    await NovelState.saveState(memoryQueue.filter(m => m.processed).length);
    }
    
    // 完成处理
    document.getElementById('progress-text').textContent = '✅ 所有记忆块处理完成！';
    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('result-section').style.display = 'block';
    
    removeStopButton();
    alert('所有记忆块处理完成！现在可以查看生成的世界书JSON。');
    
    // 标记完成并保存最终状态（不清除，以便下次恢复）
    if (!isProcessingStopped) {
    await NovelState.saveState(memoryQueue.length); // 保存完成状态
    mylog('✅ 转换完成，状态已保存，可在下次打开时恢复');
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
    console.error('继续处理时出错:', error);
    document.getElementById('progress-text').textContent = `❌ 处理出错: ${error.message}`;
    alert(`处理失败: ${error.message}\n\n进度已保存，可以稍后继续。`);
} finally {
    // 只有在完成或出错时才移除停止按钮，暂停时不移除
    if (!isProcessingStopped) {
    removeStopButton();
    }
    
    // 确保进度条在3秒后隐藏（除非被停止）
    if (!isProcessingStopped) {
    setTimeout(() => {
        document.getElementById('progress-section').style.display = 'none';
    }, 3000);
    }
}
}

// 存储当前文件引用
let currentFile = null;

// 初始化拖拽功能和编码选择器
function initializeDragAndDrop() {
try {
    const dropZone = document.getElementById('novel-drop-zone');
    if (!dropZone) {
    alert('⚠️ 初始化拖拽功能失败：未找到拖拽区域');
    return;
    }

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
    handleNovelFile({ target: { files } });
    }
});

// 添加编码选择器监听器
const encodingSelect = document.getElementById('file-encoding');
if (encodingSelect) {
    encodingSelect.addEventListener('change', () => {
    if (currentFile && encodingSelect.value !== 'auto') {
        // 重新加载文件
        reloadFileWithEncoding(currentFile, encodingSelect.value);
    }
    });
}

} catch (error) {
    alert('❌ 初始化拖拽功能失败: ' + error.message);
}
}

// 用指定编码重新加载文件
async function reloadFileWithEncoding(file, encoding) {
try {
    const reader = new FileReader();
    reader.onload = (e) => {
    const content = e.target.result;
    currentNovelContent = content;
    
    // 显示文本预览
    const preview = content.substring(0, 200).replace(/\n/g, ' ');
    
    // 更新UI显示重新加载的结果
    document.getElementById('novel-drop-zone').innerHTML = `
        <div style="font-size: 48px; margin-bottom: 15px;">📖</div>
        <p>文件已重新加载：${file.name}</p>
        <p style="color: #aaa; font-size: 14px; margin-top: 5px;">字数：${content.length.toLocaleString()} | 编码：${encoding}</p>
        <p style="color: #aaa; font-size: 12px; margin-top: 5px;">预览：${preview}${content.length > 200 ? '...' : ''}</p>
    `;
    
    };
    reader.onerror = () => {
    alert(`使用 ${encoding} 编码加载失败`);
    };
    reader.readAsText(file, encoding);
} catch (error) {
    alert('重新加载失败，请重新选择文件');
}
}

// 处理文件导入
async function handleNovelFile(event) {
const file = event.target.files[0];
if (!file) return;

// 存储文件引用以便后续重新加载
currentFile = file;

try {
    const fileName = file.name.toLowerCase();
    let content = '';
    
    if (fileName.endsWith('.txt')) {
    content = await readTextFile(file);
    } else {
    alert('不支持的文件格式，请使用 txt 文件');
    return;
    }
    
    // 检测文件是否变化，如果变化则清理历史记录
    await checkAndClearHistoryOnFileChange(content);
    
    currentNovelContent = content;
    
    // 显示文本预览（前200字符）
    const preview = content.substring(0, 200).replace(/\n/g, ' ');
    const detectedEncoding = document.getElementById('file-encoding').value;
    
    // 更新UI
    document.getElementById('novel-drop-zone').innerHTML = `
    <div style="font-size: 48px; margin-bottom: 15px;">📖</div>
    <p>文件已加载：${file.name}</p>
    <p style="color: #aaa; font-size: 14px; margin-top: 5px;">字数：${content.length.toLocaleString()} | 编码：${detectedEncoding}</p>
    <p style="color: #aaa; font-size: 12px; margin-top: 5px;">预览：${preview}${content.length > 200 ? '...' : ''}</p>
    `;
    
    // 导入成功后重置编码选择为自动检测（为下次使用准备）
    setTimeout(() => {
    document.getElementById('file-encoding').value = 'auto';
    }, 100);
    
} catch (error) {
    console.error('文件读取失败:', error);
    alert('文件读取失败，请检查文件格式');
}
}

// 读取文本文件（支持多种编码）
function readTextFile(file) {
return new Promise((resolve, reject) => {
    const selectedEncoding = document.getElementById('file-encoding').value;
    
    if (selectedEncoding !== 'auto') {
    // 使用用户指定的编码
    const reader = new FileReader();
    reader.onload = (e) => {
        mylog(`使用用户指定编码 ${selectedEncoding} 读取文件`);
        resolve(e.target.result);
    };
    reader.onerror = reject;
    reader.readAsText(file, selectedEncoding);
    return;
    }
    
    // 自动检测编码 - 优化版：选择解码后字数最少的编码（乱码字数更多）
    const encodings = ['UTF-8', 'GBK', 'GB2312', 'Big5'];
    let bestResult = null;
    let bestEncoding = 'UTF-8';
    let minLength = Infinity;
    
    // 同时尝试所有编码
    const tryAllEncodings = async () => {
    const promises = encodings.map(encoding => {
        return new Promise((resolveEncoding) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target.result;
            const length = result.length;
            mylog(`编码 ${encoding} 解码后字数: ${length}`);
            
            if (length < minLength) {
            minLength = length;
            bestResult = result;
            bestEncoding = encoding;
            }
            resolveEncoding();
        };
        reader.onerror = () => resolveEncoding();
        reader.readAsText(file, encoding);
        });
    });
    
    await Promise.all(promises);
    
    mylog(`最佳编码: ${bestEncoding}, 字数: ${minLength}`);
    // 更新UI显示检测结果
    document.getElementById('file-encoding').value = bestEncoding;
    resolve(bestResult);
    };
    
    tryAllEncodings();
});
}

// 设置章回正则表达式
function setChapterRegex(pattern) {
document.getElementById('chapter-regex').value = pattern;
}

// 检测章回结构
function detectChapters() {
if (!currentNovelContent) {
    alert('请先导入小说文件');
    return;
}

const regexText = document.getElementById('chapter-regex').value;
if (!regexText) {
    alert('请输入正则表达式');
    return;
}

try {
    const regex = new RegExp(regexText, 'gm');
    const matches = [...currentNovelContent.matchAll(regex)];
    
    if (matches && matches.length > 0) {
    const matchTexts = matches.map(match => match[0]);
    alert(`检测到 ${matches.length} 个章节\n\n前5个章节标题：\n${matchTexts.slice(0, 5).join('\n')}`);
    
    // 按章节切分
    const chapters = splitByChapters(currentNovelContent, regex);
    memoryQueue = chapters.map((chapter, index) => ({
        id: `chapter_${index + 1}`,
        title: matchTexts[index] || `第${index + 1}章`,
        content: chapter,
        processed: false
    }));
    
    updateMemoryQueueUI();
    startAIProcessing();
    
    } else {
    // 提供一些调试信息
    const sampleText = currentNovelContent.substring(0, 1000);
    alert(`未检测到匹配的章节！\n\n请检查正则表达式：${regexText}\n\n文本开头预览：\n${sampleText}...\n\n建议：\n1. 检查章节标题格式\n2. 尝试使用快速选择按钮\n3. 或使用"自动化连续阅读"模式`);
    }
} catch (error) {
    alert('正则表达式错误：' + error.message);
}
}

// 暴力切分
function bruteForceSplit() {
if (!currentNovelContent) {
    alert('请先导入小说文件');
    return;
}

const splitSize = parseInt(document.getElementById('split-size').value);
const chunks = [];

for (let i = 0; i < currentNovelContent.length; i += splitSize) {
    chunks.push(currentNovelContent.slice(i, i + splitSize));
}

memoryQueue = chunks.map((chunk, index) => ({
    id: `memory_${index + 1}`,
    title: `记忆${index + 1}`,
    content: chunk,
    processed: false
}));

updateMemoryQueueUI();
startAIProcessing();
}

// 基础配置：默认使用中文维基百科
    const API_ENDPOINT = "https://zh.wikipedia.org/w/api.php";

    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            startSearch();
        }
    }

    async function startSearch() {
        const input = document.getElementById('searchInput');
        const query = input.value.trim();
        const statusDiv = document.getElementById('status');
        const contentDiv = document.getElementById('content');
        const btn = document.getElementById('searchBtn');

        if (!query) {
            alert("请输入搜索内容");
            return;
        }

        // 重置界面状态
        statusDiv.textContent = "正在搜索...";
        contentDiv.innerHTML = "";
        btn.disabled = true;

        try {
            // 第一步：搜索最匹配的页面标题
            // 使用 opensearch 或 query list=search
            const searchUrl = `${API_ENDPOINT}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
            
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchData.query || searchData.query.search.length === 0) {
                statusDiv.textContent = "未找到相关结果，请尝试其他关键词。";
                btn.disabled = false;
                return;
            }

            // 获取第一个结果的标题
            const bestMatchTitle = searchData.query.search[0].title;
            statusDiv.textContent = `找到词条：${bestMatchTitle}，正在加载详细内容...`;

            // 第二步：根据标题获取页面 HTML 内容
            // 使用 action=parse 获取解析后的 HTML
            const parseUrl = `${API_ENDPOINT}?action=parse&page=${encodeURIComponent(bestMatchTitle)}&prop=text&format=json&origin=*&disableeditsection=true`;

            const contentResponse = await fetch(parseUrl);
            const contentData = await contentResponse.json();

            if (contentData.error) {
                statusDiv.textContent = `错误：${contentData.error.info}`;
            } else {
                statusDiv.textContent = ""; // 清空状态
                
                // 获取原始 HTML
                let rawHtml = contentData.parse.text['*'];

                // 第三步：处理 HTML 中的相对链接
                // 维基百科的链接通常是 /wiki/xxx，我们需要把它变成 https://zh.wikipedia.org/wiki/xxx
                // 这样用户点击链接时会跳转到维基百科官网，而不是本地报错
                const processedHtml = fixLinks(rawHtml);

                contentDiv.innerHTML = `<h2>${contentData.parse.title}</h2>` + processedHtml;
            }

        } catch (error) {
            console.error(error);
            statusDiv.textContent = "请求失败，请检查网络连接（可能需要科学上网访问维基百科）。";
        } finally {
            btn.disabled = false;
        }
    }

    function fixLinks(html) {
        // 创建一个临时的 DOM 元素来解析 HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // 1. 修复超链接 (a 标签)
        const links = tempDiv.querySelectorAll('a');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/wiki/')) {
                link.setAttribute('href', `https://zh.wikipedia.org${href}`);
                link.setAttribute('target', '_blank'); // 在新标签页打开
            }
            // 处理以 # 开头的锚点链接（页面内跳转），防止跳转失效
            if (href && href.startsWith('#')) {
                link.removeAttribute('href'); // 简单处理：移除锚点跳转，或者你可以保留
            }
        });

        // 2. 修复图片链接 (img 标签)
        // 维基百科图片通常是 //upload.wikimedia.org... 这种协议相对路径
        // 在本地文件打开时 (file://) 会出错，需要补全 https:
        const images = tempDiv.querySelectorAll('img');
        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src && src.startsWith('//')) {
                img.setAttribute('src', `https:${src}`);
            }
            // 移除 srcset 以防止浏览器加载错误的相对路径资源
            img.removeAttribute('srcset');
        });

        return tempDiv.innerHTML;
    }

    // 维基百科模态框控制
    let currentWikipediaSource = null; // 记录从哪个模态框打开的
    let currentWikipediaContent = ''; // 保存当前维基百科内容
    let cachedWikipediaQuery = ''; // 缓存搜索关键词
    let cachedWikipediaHtml = ''; // 缓存HTML内容
    let cachedWikipediaStatus = ''; // 缓存状态文本

    window.openWikipediaModal = function(source) {
        currentWikipediaSource = source;
        const modal = document.getElementById('wikipedia-modal');
        const searchInput = document.getElementById('wikipedia-search-input');
        const statusDiv = document.getElementById('wikipedia-status');
        const contentDiv = document.getElementById('wikipedia-content');
        const importBtn = document.getElementById('wikipedia-import-btn');
        
        // 不重置状态,保留上次搜索结果
        if (searchInput && cachedWikipediaQuery) {
            searchInput.value = cachedWikipediaQuery;
        }
        if (statusDiv && cachedWikipediaStatus) {
            statusDiv.textContent = cachedWikipediaStatus;
        }
        if (contentDiv && cachedWikipediaHtml) {
            contentDiv.innerHTML = cachedWikipediaHtml;
        }
        if (importBtn && currentWikipediaContent) {
            importBtn.style.display = 'inline-block';
        }
        
        if (modal) modal.style.display = 'flex';
    };

    window.closeWikipediaModal = function() {
        const modal = document.getElementById('wikipedia-modal');
        if (modal) modal.style.display = 'none';
        // 不清空缓存,保留搜索结果
    };

    window.handleWikipediaKeyPress = function(event) {
        if (event.key === 'Enter') {
            startWikipediaSearch();
        }
    };

    window.startWikipediaSearch = async function() {
        const input = document.getElementById('wikipedia-search-input');
        const query = input.value.trim();
        const statusDiv = document.getElementById('wikipedia-status');
        const contentDiv = document.getElementById('wikipedia-content');
        const btn = document.getElementById('wikipedia-search-btn');
        const importBtn = document.getElementById('wikipedia-import-btn');

        if (!query) {
            alert("请输入搜索内容");
            return;
        }

        // 重置界面状态
        statusDiv.textContent = "正在搜索...";
        contentDiv.innerHTML = "";
        btn.disabled = true;
        if (importBtn) importBtn.style.display = 'none';
        currentWikipediaContent = '';
        
        try {
            const searchUrl = `${API_ENDPOINT}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
            
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchData.query || searchData.query.search.length === 0) {
                statusDiv.textContent = "未找到相关结果，请尝试其他关键词。";
                btn.disabled = false;
                return;
            }

            const bestMatchTitle = searchData.query.search[0].title;
            statusDiv.textContent = `找到词条：${bestMatchTitle}，正在加载详细内容...`;

            const parseUrl = `${API_ENDPOINT}?action=parse&page=${encodeURIComponent(bestMatchTitle)}&prop=text&format=json&origin=*&disableeditsection=true`;

            const contentResponse = await fetch(parseUrl);
            const contentData = await contentResponse.json();

            if (contentData.error) {
                statusDiv.textContent = `错误：${contentData.error.info}`;
                // 缓存错误状态
                cachedWikipediaStatus = statusDiv.textContent;
            } else {
                statusDiv.textContent = "加载完成";
                
                let rawHtml = contentData.parse.text['*'];
                const processedHtml = fixLinks(rawHtml);

                const fullHtml = `<h2>${contentData.parse.title}</h2>` + processedHtml;
                contentDiv.innerHTML = fullHtml;
                
                // 提取纯文本内容用于导入
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = processedHtml;
                currentWikipediaContent = tempDiv.textContent || tempDiv.innerText || '';
                
                // 缓存搜索结果
                cachedWikipediaQuery = query;
                cachedWikipediaHtml = fullHtml;
                cachedWikipediaStatus = statusDiv.textContent;
                
                // 显示导入按钮
                if (importBtn) importBtn.style.display = 'inline-block';
            }

        } catch (error) {
            console.error(error);
            statusDiv.textContent = "请求失败，请检查魔法连接（需要科学上网访问维基百科）。";
        } finally {
            btn.disabled = false;
        }
    };

    window.importWikipediaToGuidance = function() {
        if (!currentWikipediaContent) {
            alert('没有可导入的内容');
            return;
        }

        let targetTextarea = null;
        
        // 根据来源确定目标textarea
        if (currentWikipediaSource === 'ai-guidance') {
            targetTextarea = document.getElementById('ai-guidance-input');
        } else if (currentWikipediaSource === 'wb-ai') {
            targetTextarea = document.getElementById('wb-ai-request-input');
        } else if (currentWikipediaSource === 'literary-style') {
            targetTextarea = document.getElementById('literary-style-reference');
        }

        if (targetTextarea) {
            // 追加内容而不是覆盖
            const currentValue = targetTextarea.value.trim();
            if (currentValue) {
                targetTextarea.value = currentValue + '\n\n' + currentWikipediaContent;
            } else {
                targetTextarea.value = currentWikipediaContent;
            }
            
            // 触发input事件
            targetTextarea.dispatchEvent(new Event('input'));
            
            // 自动调整textarea高度
            autoResizeTextarea(targetTextarea);
            
            // 关闭维基百科模态框
            closeWikipediaModal();
            
            alert('维基百科内容已导入到输入框');
        } else {
            alert('无法找到目标输入框');
        }
    };

    // 自动调整textarea高度函数
    function autoResizeTextarea(textarea) {
        const maxHeight = window.innerHeight * 0.5;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    }

    // 文件上传处理函数
    function handleFileUpload(event) {
        const fileInput = event.target;
        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = function(event) {
            const fileContent = event.target.result;
            // 处理文件内容
            mylog(fileContent);
        };

        reader.readAsText(file);
    }

    // 绑定文件上传事件
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
