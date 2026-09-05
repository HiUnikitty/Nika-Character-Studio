/**
 * Nika Character Studio - 双开对比与镜像编辑模块 (dual_pane.js)
 * 彻底 1:1 镜像左侧主卡编辑器的外观结构与全部功能，支持同步/分别滚动切换、副卡选择、条目互导与批量删除。
 */

(function (window) {
    'use strict';

    // 内部状态
    const state = {
        active: false,
        syncScroll: true,
        isSyncingScroll: false,
        secondaryCard: null,
        secAvatarBase64: null,
        secWorldbook: [],
        secGreetings: [],
        secRegexScripts: [],
        secTasks: [],
        secInstructionsData: [],
        secDepthPrompt: { depth: 4, role: 'system', prompt: '' },
        secOriginalRaw: {}
    };

    // 默认空卡片模板
    function createEmptyCard(name = '对比副卡') {
        return {
            id: null,
            name: name,
            gender: '',
            tags: [],
            character_version: '1.0',
            description: '',
            personality: '',
            scenario: '',
            first_mes: '',
            mes_example: '',
            system_prompt: '',
            post_history_instructions: '',
            creator_notes: '',
            depth_prompt: { depth: 4, role: 'system', prompt: '' },
            avatar: null,
            worldbook: [],
            alternate_greetings: [],
            regex_scripts: [],
            xiaobaix_tasks: [],
            instructionsData: []
        };
    }

    // ============================================================
    // 初始化与模式切换
    // ============================================================

    function toggleDualPaneMode() {
        if (state.active) {
            closeDualPane();
        } else {
            openDualPane();
        }
    }

    async function openDualPane() {
        const editorView = document.getElementById('editor-view');
        if (!editorView) return;

        state.active = true;
        editorView.classList.add('dual-pane-active');

        // 移除可能遗留的顶部独立黑条
        const oldToolbar = document.getElementById('dual-pane-toolbar');
        if (oldToolbar) oldToolbar.remove();

        // 确保副卡镜像容器存在
        ensureDualPaneDOM();

        // 显示左侧橙色条上的滚动切换按钮
        const syncBtn = document.getElementById('dp-sync-scroll-btn');
        if (syncBtn) {
            syncBtn.style.display = 'inline-flex';
            updateSyncButtonText();
        }

        // 刷新副卡选择下拉列表（位于右侧橙色条上）
        await refreshCardSelector();

        // 如果副卡尚未载入过任何数据，默认克隆一份当前主卡作为对比基准
        if (!state.secondaryCard) {
            loadCopyOfPrimaryCard(true);
        } else {
            renderSecondaryCard();
        }

        // 绑定滚动同步
        setupScrollSync();

        // 显示主卡上的双开批量操作栏与转移按钮
        updatePrimaryTransferButtons();

        // 启动主副卡全要素双向实时同步引擎
        setupLiveSync();

        // 更新切换按钮状态（与 API 设置样式保持统一）
        const toggleBtn = document.getElementById('dual-pane-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.add('active');
            toggleBtn.style.background = 'rgba(0, 0, 0, 0.35)';
            toggleBtn.style.border = '1px solid rgba(255, 255, 255, 0.4)';
            toggleBtn.innerHTML = '🪟 退出双开';
        }

        console.log('[DualPane] 双开对比镜像模式已开启');
    }

    function closeDualPane() {
        const editorView = document.getElementById('editor-view');
        if (!editorView) return;

        // 退出双开前执行全量数据收拢，确保副卡在双开期间的所有修改无缝保存在主卡
        syncSecondaryToPrimaryOnClose();

        state.active = false;
        editorView.classList.remove('dual-pane-active');

        // 隐藏左侧橙色条上的滚动切换按钮
        const syncBtn = document.getElementById('dp-sync-scroll-btn');
        if (syncBtn) syncBtn.style.display = 'none';

        const toolbar = document.getElementById('dual-pane-toolbar');
        if (toolbar) toolbar.remove();

        const secContainer = document.getElementById('editor-secondary-container');
        if (secContainer) secContainer.style.display = 'none';

        // 隐藏主卡上的双开批量操作栏与转移按钮
        updatePrimaryTransferButtons();

        const toggleBtn = document.getElementById('dual-pane-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.style.background = 'var(--secondary-color)';
            toggleBtn.style.border = 'none';
            toggleBtn.innerHTML = '🪟 双开对比';
        }

        console.log('[DualPane] 双开对比模式已关闭');
    }

    // ============================================================
    // DOM 注入与结构生成
    // ============================================================

    function ensureDualPaneDOM() {
        const editorView = document.getElementById('editor-view');
        if (!editorView) return;

        // 彻底移除独立顶栏
        const oldToolbar = document.getElementById('dual-pane-toolbar');
        if (oldToolbar) oldToolbar.remove();

        // 副卡容器：100% 镜像复刻左侧 .editor-container
        let secContainer = document.getElementById('editor-secondary-container');
        if (!secContainer) {
            secContainer = document.createElement('div');
            secContainer.id = 'editor-secondary-container';
            secContainer.className = 'editor-container secondary-pane';
            secContainer.innerHTML = buildSecondaryContainerHTML();
            editorView.appendChild(secContainer);

            // 绑定副卡输入自动调整高度
            secContainer.querySelectorAll('textarea').forEach(ta => {
                ta.addEventListener('input', function() {
                    if (typeof autoResizeTextarea === 'function') autoResizeTextarea(this);
                });
            });
        }
        secContainer.style.display = 'flex';
    }

    // 100% 镜像左侧 .editor-container 生成副卡 HTML
    function buildSecondaryContainerHTML() {
        return `
      <div class="editor-header secondary-header">
        <h1 id="sec-editor-title" style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; font-size: 20px;">对比副卡</h1>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: rgba(255, 255, 255, 0.95); font-weight: bold; white-space: nowrap;">副卡选择:</span>
            <select id="sec-character-selector" onchange="DualPane.onSelectCard(this.value)"
              style="background: rgba(0, 0, 0, 0.35); color: white; border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 5px; padding: 7px 10px; font-size: 13px; min-width: 170px; max-width: 220px; cursor: pointer; outline: none; font-weight: bold;"
              title="选择副卡">
              <option value="__copy_primary__">📋 载入当前主卡副本</option>
            </select>
          </div>
          <button onclick="DualPane.saveSecondaryCard()"
            style="background: #27ae60; color: white; padding: 7px 13px; border-radius: 5px; border: none; cursor: pointer; font-weight: bold; white-space: nowrap;"
            title="保存副卡修改到角色库">
            💾 保存副卡
          </button>
          <button onclick="DualPane.close()"
            style="background: #c0392b; color: white; padding: 7px 13px; border-radius: 5px; border: none; cursor: pointer; font-weight: bold; white-space: nowrap;"
            title="关闭副卡对比">
            ✕ 关闭
          </button>
        </div>
      </div>
      <div class="editor-body sec-editor-body">
        <div class="panel-content">
          <input type="hidden" id="sec-charId" value="">
          <input type="hidden" id="sec-internalTags" value="">
          <input type="hidden" id="sec-isFavorite" value="">
          <input type="hidden" id="sec-originalCardData" value="">

          <h3 class="section-title" id="sec-avatar-operation-title">角色头像 </h3>
          <div class="field-group">
            <label for="sec-avatar-input-label" id="sec-avatar-input-label" title="点击下方按钮上传图片">角色头像</label>
            <img id="sec-avatar-preview"
              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
              alt="副卡头像预览"
              style="max-width: 250px; width: 100%; border-radius: 8px; border: 2px dashed var(--input-border); object-fit: cover; aspect-ratio: 2/3; margin-bottom: 10px; display: block; box-sizing: border-box; cursor: pointer;"
              onclick="document.getElementById('sec-avatar-input').click()"
              title="点击上传并更换副卡头像">
            <input type="file" id="sec-avatar-input" accept="image/*" style="display: none" onchange="DualPane.onAvatarChange(event)">
            <button class="uniform-btn no-hover" onclick="document.getElementById('sec-avatar-input').click()"
              style="max-width: 250px">上传图片</button>
          </div>
          <div class="action-buttons" style="flex-direction: column">
            <button id="sec-save-and-return-btn" onclick="DualPane.saveSecondaryCard()">💾 储存并返回角色库</button>
            <button id="sec-download-json-btn" onclick="DualPane.downloadSecondaryJson()">📥 下载 JSON</button>
            <button id="sec-download-png-btn" onclick="DualPane.downloadSecondaryPng()">📥 下载 PNG 角色卡</button>
            <button id="sec-download-lorebook-btn" onclick="DualPane.downloadSecondaryLorebook()">📥 下载为世界书</button>
            <button id="sec-return-without-save-btn" class="secondary" onclick="DualPane.resetSecondaryCard()">🔙 重置副卡</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center">
            <h3 class="section-title" id="sec-character-info-title">角色信息 </h3>
            <div>
              <button id="sec-translate-all-btn" onclick="DualPane.translateAllFields(this)" style="
                    background-color: #e67e22;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 5px;
                    margin-right: 10px;
                  ">🌐 一键翻译</button>
              <button id="sec-complete-all-btn" onclick="DualPane.aiCompleteAllFields(this)">🔮 一键生成角色</button>
            </div>
          </div>

          <div class="field-group">
            <div class="inline-group">
              <div style="flex: 3">
                <label for="sec-name">名字</label>
                <div style="display: flex; align-items: center; gap: 5px">
                  <input id="sec-name" placeholder="头像旁的字" style="flex-grow: 1">
                  <button class="name-generator-btn" onclick="DualPane.generateAiNames(this)" title="AI 生成多个名字供选择">
                    🎲
                  </button>
                </div>
              </div>
              <div style="flex: 1"><label for="sec-gender">性别</label><input id="sec-gender" placeholder="例如：女"></div>
            </div>
          </div>
          <div class="field-group">
            <label for="sec-description">描述</label>
            <textarea id="sec-description" rows="5" placeholder="背景介绍与角色的身份、外貌、故事等"></textarea>
            <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-description')">🔮 AI 帮我写</button>
            <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
            <div class="field-group" style="margin-top: 15px;">
              <label for="sec-personality">个性</label>
              <textarea id="sec-personality" rows="2" placeholder="详细性格特质"></textarea>
              <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-personality')">🔮 AI 帮我写</button>
              <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
            </div>

            <h3 class="section-title" id="sec-ai-settings-title" style="margin-top: 20px;">AI设定 </h3>
            <div class="field-group">
              <label for="sec-system_prompt">系统设定</label>
              <textarea id="sec-system_prompt" rows="3" placeholder="和预设一个级别"></textarea>
              <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-system_prompt')">🔮 AI 帮我写</button>
              <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
            </div>
          </div>
          <div class="field-group">
            <div class="instructions-container" id="sec-instructions-container">
              <!-- 指令卡片将在这里动态生成 -->
              <div class="instruction-card add-instruction" onclick="DualPane.addNewInstructionForSec()">
                <div class="add-icon">+</div>
                <div class="add-text">系统指令 · 状态栏 · 美化</div>
              </div>
            </div>
            <!-- 隐藏的原始textarea，用于兼容性 -->
            <textarea id="sec-post_history_instructions_hidden" style="display: none"
              placeholder="酒馆用它来修改AI的回复格式。例如，要让{{char}}的动作都用星号包围，可以写：将{{char}}的所有动作和叙述都放在星号（*）之间。"></textarea>
          </div>
          <div class="field-group">
            <label for="sec-scenario">环境设定</label>
            <textarea id="sec-scenario" rows="3" placeholder="角色所处的环境"></textarea>
            <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-scenario')">🔮 AI 帮我写</button>
            <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
          </div>
          <div class="field-group">
            <label for="sec-first_mes">问候消息</label>
            <textarea id="sec-first_mes" rows="3" placeholder="角色的第一句话"></textarea>
            <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-first_mes')">🔮 AI 帮我写</button>
            <button class="ai-button batch-generate-btn" onclick="DualPane.batchGenerateGreetingsForSec(this)"
              style="margin-left: 5px;">🎲 批量生成</button>
            <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
          </div>

          <div class="field-group">
            <label id="sec-alternate-greetings-label">备用问候语</label>
            <p class="help-text" id="sec-alternate-greetings-help-text">可选的多个开场白，在SillyTavern中可以切换使用</p>
            <div id="sec-alternate-greetings-container" class="alternate-greetings-list"></div>
            <button class="add-item-button" onclick="DualPane.addSecondaryGreeting()" id="sec-add-greeting-btn">+ 添加问候语</button>
          </div>

          <div class="field-group">
            <label for="sec-mes_example">示例消息</label>
            <textarea id="sec-mes_example" rows="6" placeholder="AI会模仿的对话，一般没用"></textarea>
            <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-mes_example')">🔮 AI 帮我写</button>
            <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
          </div>
          <div class="field-group">
            <label for="sec-post_history_instructions">额外要求</label>
            <textarea id="sec-post_history_instructions" rows="3"
              placeholder="例如：说中文，字数800。要开启预设的 Post-History Instructions"></textarea>
          </div>

          <!-- 正则脚本区域 -->
          <h3 class="section-title" id="sec-regex-scripts-title"
            style="display: flex; justify-content: space-between; align-items: center;">
            <span>正则脚本</span>
            <button onclick="if(typeof previewRegexHTML==='function') previewRegexHTML()" id="sec-preview-regex-html-btn"
              style="background-color: #e67e22; color: white; padding: 4px 12px; border: none; border-radius: 3px; font-size: 13px; margin: 0; cursor: pointer;">预览所有HTML组件</button>
          </h3>
          <p class="help-text" id="sec-regex-scripts-help-text">用于文本替换的正则表达式脚本，可实现美化等效果</p>
          <div id="sec-regex-scripts-container" class="regex-scripts-list"></div>
          <button class="add-item-button" onclick="DualPane.addSecondaryRegexScript()" id="sec-add-regex-btn">+ 添加正则脚本</button>

          <!-- 小白X 任务区域 -->
          <h3 class="section-title" id="sec-xiaobaix-tasks-title"
            style="margin-top: 25px; display: flex; align-items: center; justify-content: space-between;">
            <span>小白X 任务</span>
            <span onclick="if(typeof openLWBInstallTutorial==='function') openLWBInstallTutorial()"
              style="font-size: 12px; font-weight: normal; color: #3498db; cursor: pointer; border: 1px solid #3498db; padding: 2px 8px; border-radius: 4px; transition: all 0.2s;">📦
              安装教程 & 必看</span>
          </h3>
          <p class="help-text" id="sec-xiaobaix-tasks-help-text">变量卡初始化必须的脚本，如需帮助，请点击右下角智能体图标</p>
          <div id="sec-xiaobaix-tasks-container" class="xiaobaix-tasks-list"></div>
          <button class="add-item-button" onclick="DualPane.addSecondaryXiaobaixTask()" id="sec-add-xiaobaix-task-btn">+ 添加任务</button>

          <h3 class="section-title" id="sec-advanced-settings-title">卡片信息 </h3>
          <div class="field-group">
            <label for="sec-tags">分类标签</label>
            <textarea id="sec-tags" rows="2" placeholder="方便角色库查找"></textarea>
            <button class="ai-button" onclick="DualPane.callDeepSeekForSec('sec-tags')">🔮 AI 帮我写</button>
            <button class="ai-undo-button" onclick="DualPane.undoAiCompletionForSec(this)">↩️ 撤销</button>
          </div>
          <div class="field-group">
            <label for="sec-creator_notes">备注</label>
            <textarea id="sec-creator_notes" rows="2" placeholder="作者的名字"></textarea>
          </div>
          <div class="field-group">
            <label for="sec-character_version">版本</label>
            <input id="sec-character_version" placeholder="例如：1.0, 测试版">
          </div>
          <div class="field-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label for="sec-depth_prompt_prompt" style="margin-bottom: 0;">角色备忘录 (Character's Note)</label>
              <div style="display: flex; gap: 12px; align-items: center;">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 12px; color: var(--text-color, #ccc);">深度:</span>
                  <input id="sec-depth_prompt_depth" type="number" min="0" max="9999" value="4" style="width: 60px; padding: 2px 6px; font-size: 12px; height: 26px;" title="插入深度 (@ Depth)">
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 12px; color: var(--text-color, #ccc);">角色:</span>
                  <select id="sec-depth_prompt_role" style="padding: 2px 6px; font-size: 12px; height: 26px;" title="插入角色 (Role)">
                    <option value="system" selected>System</option>
                    <option value="user">User</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
              </div>
            </div>
            <textarea id="sec-depth_prompt_prompt" rows="3" placeholder="在聊天指定深度插入的提示词内容 (depth_prompt)"></textarea>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <button id="sec-toggle-all-worldbook-btn" onclick="DualPane.toggleAllSecondaryWorldbookEntries()" title="展开/折叠所有条目"
                class="wb-global-toggle">
                <span class="toggle-arrow"></span>
              </button>
              <h3 class="section-title worldbook-title" id="sec-world-knowledge-book-title" style="margin: 0;">世界书</h3>
            </div>
            <div style="display: flex; gap: 10px;">
              <button onclick="if(typeof openGlobalEditModal==='function') openGlobalEditModal(this)"
                style="background-color: var(--ai-button-bg, #e67e22); color: white; padding: 8px 15px; border-radius: 5px; border: none; cursor: pointer;">
                🔮 AI 全局改
              </button>
              <button onclick="if(typeof openWorldbookAiModal==='function') openWorldbookAiModal(this)"
                style="background-color: var(--ai-button-bg, #e67e22); color: white; padding: 8px 15px; border-radius: 5px; border: none; cursor: pointer;">
                🔮 一键生成世界书
              </button>
            </div>
          </div>
          <p class="help-text" id="sec-worldbook-help-text">“世界书”是给AI角色绑定的一部<b>参考词典和设定集</b>。如果你要世界书，上面的信息只用填名字</p>
          <ul id="sec-worldbook-entries-container" class="worldbook-list"></ul>
          <div class="action-buttons row" style="margin-top: 15px">
            <button id="sec-add-worldbook-entry-btn" onclick="DualPane.addSecondaryWorldbookEntry()" class="secondary"
              style="background-color: #e67e22; flex-grow: 1">+ 补充世界书</button>
            <input type="file" id="sec-worldbook-importer" accept=".json,.png" style="display: none"
              onchange="DualPane.importSecondaryWorldbook(event)" multiple />
            <button id="sec-import-worldbook-btn" onclick="document.getElementById('sec-worldbook-importer').click()"
              class="secondary" style="background-color: #e67e22; flex-grow: 1">📥 导入世界书</button>
            <button id="sec-worldbook-sort-priority-btn" onclick="DualPane.sortSecondaryWorldbookByPriority()" class="secondary"
              style="flex-grow: 1">按优先级排序</button>
            <button id="sec-worldbook-sort-id-btn" onclick="DualPane.sortSecondaryWorldbookById()" class="secondary"
              style="flex-grow: 1">按ID排序</button>
          </div>

          <!-- 副卡世界书批量操作条 -->
          <div class="dp-batch-bar" style="margin-top: 10px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: #ccc; margin: 0;">
              <input type="checkbox" id="sec-wb-select-all" onchange="DualPane.toggleSelectAll('sec', 'worldbook', this.checked)">
              <span>全选</span>
            </label>
            <span id="sec-wb-selected-count" style="font-size: 12px; color: #888;">已选 0 项</span>
            <div style="display: flex; gap: 8px; margin-left: auto;">
              <button class="dp-batch-btn transfer" onclick="DualPane.batchTransferWorldbook('secToPrim')">⬅ 批量转移到主卡</button>
              <button class="dp-batch-btn delete" onclick="DualPane.batchDeleteWorldbook('sec')">🗑 批量删除</button>
            </div>
          </div>
        </div>
      </div>
        `;
    }

    // ============================================================
    // 滚动联动控制器 (Scroll Synchronization)
    // ============================================================

    function setupScrollSync() {
        const primBody = document.querySelector('#editor-view .editor-container:not(.secondary-pane) .editor-body');
        const secBody = document.querySelector('#editor-secondary-container .editor-body');

        if (!primBody || !secBody) return;

        primBody.removeEventListener('scroll', onPrimaryScroll);
        secBody.removeEventListener('scroll', onSecondaryScroll);

        primBody.addEventListener('scroll', onPrimaryScroll, { passive: true });
        secBody.addEventListener('scroll', onSecondaryScroll, { passive: true });
    }

    function onPrimaryScroll() {
        if (!state.syncScroll || state.isSyncingScroll || !state.active) return;
        const primBody = document.querySelector('#editor-view .editor-container:not(.secondary-pane) .editor-body');
        const secBody = document.querySelector('#editor-secondary-container .editor-body');
        if (!primBody || !secBody) return;

        state.isSyncingScroll = true;
        const maxPrim = primBody.scrollHeight - primBody.clientHeight;
        const maxSec = secBody.scrollHeight - secBody.clientHeight;
        if (maxPrim > 0 && maxSec > 0) {
            const ratio = primBody.scrollTop / maxPrim;
            secBody.scrollTop = Math.round(ratio * maxSec);
        }
        requestAnimationFrame(() => { state.isSyncingScroll = false; });
    }

    function onSecondaryScroll() {
        if (!state.syncScroll || state.isSyncingScroll || !state.active) return;
        const primBody = document.querySelector('#editor-view .editor-container:not(.secondary-pane) .editor-body');
        const secBody = document.querySelector('#editor-secondary-container .editor-body');
        if (!primBody || !secBody) return;

        state.isSyncingScroll = true;
        const maxPrim = primBody.scrollHeight - primBody.clientHeight;
        const maxSec = secBody.scrollHeight - secBody.clientHeight;
        if (maxPrim > 0 && maxSec > 0) {
            const ratio = secBody.scrollTop / maxSec;
            primBody.scrollTop = Math.round(ratio * maxPrim);
        }
        requestAnimationFrame(() => { state.isSyncingScroll = false; });
    }

    function updateSyncButtonText() {
        const btn = document.getElementById('dp-sync-scroll-btn');
        if (btn) {
            if (state.syncScroll) {
                btn.style.background = 'rgba(0, 0, 0, 0.35)';
                btn.style.color = '#2ecc71';
                btn.style.borderColor = '#2ecc71';
                btn.innerHTML = '🔗 同步滚动: 开启';
            } else {
                btn.style.background = 'rgba(0, 0, 0, 0.35)';
                btn.style.color = '#f1c40f';
                btn.style.borderColor = '#f1c40f';
                btn.innerHTML = '🔓 分别滚动: 独立';
            }
        }
    }

    function toggleSyncScroll() {
        state.syncScroll = !state.syncScroll;
        updateSyncButtonText();
    }

    // ============================================================
    // 副卡数据载入与渲染
    // ============================================================

    async function refreshCardSelector() {
        const selector = document.getElementById('sec-character-selector');
        if (!selector) return;

        let optionsHtml = '<option value="__copy_primary__">📋 载入当前主卡副本</option>';

        if (typeof db !== 'undefined' && db) {
            try {
                const transaction = db.transaction(['characters'], 'readonly');
                const store = transaction.objectStore('characters');
                const request = store.getAll();

                await new Promise((resolve) => {
                    request.onsuccess = e => {
                        const characters = e.target.result || [];
                        const currentPrimaryId = parseInt(document.getElementById('charId')?.value, 10);

                        characters.forEach(char => {
                            const isCurrent = char.id === currentPrimaryId;
                            const label = `${char.name || '(未命名)'} (v${char.character_version || '1.0'})${isCurrent ? ' [当前主卡]' : ''}`;
                            optionsHtml += `<option value="${char.id}">${escapeHtml(label)}</option>`;
                        });
                        resolve();
                    };
                    request.onerror = () => resolve();
                });
            } catch (err) {
                console.error('[DualPane] 获取角色列表失败:', err);
            }
        }

        selector.innerHTML = optionsHtml;
    }

    function onSelectCard(charIdStr) {
        if (!charIdStr) return;
        if (charIdStr === '__copy_primary__') {
            loadCopyOfPrimaryCard(false);
            return;
        }

        const charId = parseInt(charIdStr, 10);
        if (isNaN(charId) || typeof db === 'undefined' || !db) return;

        const transaction = db.transaction(['characters'], 'readonly');
        const store = transaction.objectStore('characters');
        const request = store.get(charId);

        request.onsuccess = e => {
            const charData = e.target.result;
            if (charData) {
                loadCardDataIntoSecondary(charData);
            }
        };
    }

    // 载入当前主卡的副本
    function loadCopyOfPrimaryCard(silent = false) {
        if (typeof buildCardObject !== 'function') return;
        const mainCard = buildCardObject();

        const copy = JSON.parse(JSON.stringify(mainCard));
        copy.name = `${copy.name || '未命名'} (副本)`;
        copy.id = null; // 副本默认不带原 ID，便于存为新角色
        copy.avatar = mainCard.avatar || document.getElementById('avatar-preview')?.src;
        if (Array.isArray(window.instructionsData)) {
            copy.instructionsData = JSON.parse(JSON.stringify(window.instructionsData));
        }

        loadCardDataIntoSecondary(copy);
        if (!silent) {
            alert('已载入当前主卡副本到副卡栏！');
        }
    }

    // 将卡片数据载入副卡并渲染
    function loadCardDataIntoSecondary(data) {
        if (!data) return;

        state.secondaryCard = data;
        state.secAvatarBase64 = data.avatar || null;
        state.secWorldbook = JSON.parse(JSON.stringify(data.worldbook || []));
        state.secGreetings = JSON.parse(JSON.stringify(data.alternate_greetings || []));
        state.secRegexScripts = JSON.parse(JSON.stringify(data.regex_scripts || data.regex || []));
        state.secTasks = JSON.parse(JSON.stringify(data.xiaobaix_tasks || data.extensions?.['xiaobaix-tasks']?.tasks || []));
        state.secDepthPrompt = data.depth_prompt || { depth: 4, role: 'system', prompt: '' };
        state.secOriginalRaw = data.rawExtensions || {};

        if (Array.isArray(data.instructionsData)) {
            state.secInstructionsData = JSON.parse(JSON.stringify(data.instructionsData));
        } else if (typeof parseInstructionsFromSystemPrompt === 'function' && data.system_prompt) {
            state.secInstructionsData = parseInstructionsFromSystemPrompt(data.system_prompt);
        } else if (Array.isArray(window.instructionsData) && window.instructionsData.length > 0) {
            state.secInstructionsData = JSON.parse(JSON.stringify(window.instructionsData));
        } else {
            state.secInstructionsData = [];
        }

        renderSecondaryCard();
    }

    // 渲染副卡全部字段
    function renderSecondaryCard() {
        const c = state.secondaryCard || createEmptyCard();

        const titleEl = document.getElementById('sec-editor-title');
        if (titleEl) titleEl.textContent = c.name || '对比副卡';

        const idEl = document.getElementById('sec-charId');
        if (idEl) idEl.value = c.id || '';

        // 头像
        const avatarEl = document.getElementById('sec-avatar-preview');
        if (avatarEl) {
            const defSrc = typeof createDefaultImage === 'function' ? createDefaultImage('2:3') : (document.getElementById('avatar-preview')?.src || '');
            avatarEl.src = state.secAvatarBase64 || defSrc;
            avatarEl.style.maxWidth = '250px';
            avatarEl.style.width = '100%';
            avatarEl.style.aspectRatio = '2/3';
            avatarEl.style.objectFit = 'cover';
            avatarEl.style.borderRadius = '8px';
            avatarEl.style.border = '2px dashed var(--input-border)';
            avatarEl.style.marginBottom = '10px';
            avatarEl.style.display = 'block';
            avatarEl.style.boxSizing = 'border-box';
        }

        // 基本字段
        setVal('sec-name', c.name || '');
        setVal('sec-gender', c.gender || '');
        setVal('sec-character_version', c.character_version || '1.0');
        setVal('sec-tags', Array.isArray(c.tags) ? c.tags.join(', ') : (c.tags || ''));
        setVal('sec-description', c.description || '');
        setVal('sec-personality', c.personality || '');
        setVal('sec-scenario', c.scenario || '');
        setVal('sec-first_mes', c.first_mes || '');
        setVal('sec-mes_example', c.mes_example || '');
        setVal('sec-system_prompt', c.system_prompt || '');
        setVal('sec-post_history_instructions', c.post_history_instructions || '');
        setVal('sec-creator_notes', c.creator_notes || '');

        // 角色备忘录
        const dp = state.secDepthPrompt || {};
        setVal('sec-depth_prompt_depth', dp.depth !== undefined ? dp.depth : 4);
        setVal('sec-depth_prompt_role', dp.role || 'system');
        setVal('sec-depth_prompt_prompt', dp.prompt || '');

        // 渲染条目
        renderSecondaryWorldbook();
        renderSecondaryGreetings();
        renderSecondaryRegex();
        renderSecondaryTasks();
        renderSecondaryInstructions();

        // 自动调整高度
        document.querySelectorAll('#editor-secondary-container textarea').forEach(ta => {
            if (typeof autoResizeTextarea === 'function') autoResizeTextarea(ta);
        });
    }

    function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    // ============================================================
    // 条目渲染与管理 (Worldbook, Greetings, Regex, Tasks)
    // ============================================================

    // 1. 世界书渲染
    function renderSecondaryWorldbook() {
        const container = document.getElementById('sec-worldbook-entries-container');
        if (!container) return;

        container.innerHTML = '';
        const entries = state.secWorldbook || [];

        entries.forEach((entry, idx) => {
            // 直接复用系统自带的条目创建器（如果存在），以获得 100% 相同的高级 UI
            let entryLi = null;
            if (typeof createWorldbookEntryElement === 'function') {
                entryLi = createWorldbookEntryElement(entry);
            } else {
                entryLi = document.createElement('li');
                entryLi.className = 'worldbook-entry';
                entryLi.innerHTML = `
                    <div class="entry-header" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #222; border-radius: 4px;">
                        <span>${escapeHtml(entry.comment || `条目 ${idx + 1}`)}</span>
                    </div>
                `;
            }

            entryLi.dataset.secIndex = idx;

            // 在条目头部插入复选框和“⬅ 移入主卡”按钮
            const header = entryLi.querySelector('.entry-header') || entryLi.firstElementChild;
            if (header) {
                // 插入左侧复选框
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'sec-wb-check';
                cb.dataset.index = idx;
                cb.style.marginRight = '8px';
                cb.style.cursor = 'pointer';
                cb.onchange = () => updateSelectedCount('sec', 'worldbook');
                cb.onclick = (e) => e.stopPropagation();
                header.insertBefore(cb, header.firstChild);

                // 插入转移按钮与删除按钮
                const actionSpan = document.createElement('span');
                actionSpan.style.display = 'inline-flex';
                actionSpan.style.gap = '6px';
                actionSpan.style.alignItems = 'center';
                actionSpan.style.marginLeft = 'auto';
                actionSpan.onclick = (e) => e.stopPropagation();

                const transferBtn = document.createElement('button');
                transferBtn.className = 'dp-entry-transfer-btn to-prim';
                transferBtn.title = '复制此条目到主卡';
                transferBtn.textContent = '⬅ 移入主卡';
                transferBtn.onclick = (e) => {
                    e.stopPropagation();
                    transferSingleWorldbook(idx, 'secToPrim');
                };

                const delBtn = document.createElement('button');
                delBtn.style.background = 'none';
                delBtn.style.border = 'none';
                delBtn.style.color = '#e74c3c';
                delBtn.style.cursor = 'pointer';
                delBtn.style.fontSize = '12px';
                delBtn.textContent = '删除';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteSecondaryWorldbookEntry(idx);
                };

                actionSpan.appendChild(transferBtn);
                actionSpan.appendChild(delBtn);
                header.appendChild(actionSpan);
            }

            container.appendChild(entryLi);
        });

        updateSelectedCount('sec', 'worldbook');
    }

    function addSecondaryWorldbookEntry() {
        // 与主卡 ID 自增规则保持 100% 绝对一致（从 0 开始自增整数，绝不使用 Date.now 毫秒戳）
        const primEntries = typeof buildWorldbookDataFromDOM === 'function' ? buildWorldbookDataFromDOM() : [];
        const primIds = primEntries.map(e => Number(e.id)).filter(n => !isNaN(n));
        const secIds = (state.secWorldbook || []).map(e => Number(e.id)).filter(n => !isNaN(n));
        const allIds = [...primIds, ...secIds];
        const newId = allIds.length > 0 ? Math.max(...allIds) + 1 : 0;

        const newEntry = {
            id: newId,
            comment: '新世界书条目',
            keys: [],
            secondary_keys: [],
            content: '',
            priority: 100,
            enabled: true,
            position: 0
        };
        state.secWorldbook.push(newEntry);
        renderSecondaryWorldbook();

        // 实时同步主卡
        if (typeof addWorldbookEntry === 'function') {
            window.__isDualPaneSyncingWb = true;
            try {
                addWorldbookEntry(JSON.parse(JSON.stringify(newEntry)));
            } finally {
                window.__isDualPaneSyncingWb = false;
            }
            // 确保主卡刚添加的条目 ID 与副卡 newId 保持完全一致
            const primContainer = document.getElementById('worldbook-entries-container');
            if (primContainer) {
                const primList = primContainer.querySelectorAll('.worldbook-entry');
                const lastPrim = primList[primList.length - 1];
                if (lastPrim) {
                    const idInput = lastPrim.querySelector('.wb-sort-id');
                    if (idInput && idInput.value != newId) {
                        idInput.value = newId;
                    }
                }
            }
        }
    }

    function deleteSecondaryWorldbookEntry(idx) {
        if (confirm('确定删除此世界书条目吗？')) {
            state.secWorldbook.splice(idx, 1);
            renderSecondaryWorldbook();

            // 实时同步主卡删除对应条目
            const primEntries = document.querySelectorAll('#worldbook-entries-container .worldbook-entry');
            if (primEntries[idx]) {
                primEntries[idx].remove();
                if (typeof updateAllEntryAttributes === 'function') updateAllEntryAttributes();
            }
        }
    }

    function sortSecondaryWorldbookByPriority() {
        state.secWorldbook.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        renderSecondaryWorldbook();
    }

    function sortSecondaryWorldbookById() {
        state.secWorldbook.sort((a, b) => (a.id || 0) - (b.id || 0));
        renderSecondaryWorldbook();
    }

    async function importSecondaryWorldbook(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        for (const file of Array.from(files)) {
            try {
                const text = await file.text();
                const json = JSON.parse(text);
                const entries = json.entries ? Object.values(json.entries) : (Array.isArray(json) ? json : []);
                if (entries.length) {
                    state.secWorldbook.push(...entries);
                }
            } catch (err) {
                console.error('[DualPane] 导入世界书失败:', err);
            }
        }
        renderSecondaryWorldbook();
        alert('副卡世界书导入完成！');
        event.target.value = '';
    }

    function toggleAllSecondaryWorldbookEntries() {
        const entries = document.querySelectorAll('#sec-worldbook-entries-container .worldbook-entry');
        if (!entries.length) return;
        const firstFolded = entries[0].classList.contains('collapsed');
        entries.forEach(el => {
            if (firstFolded) el.classList.remove('collapsed');
            else el.classList.add('collapsed');
        });
    }

    // 2. 备用问候语渲染
    function renderSecondaryGreetings() {
        const container = document.getElementById('sec-alternate-greetings-container');
        if (!container) return;

        container.innerHTML = '';
        const list = state.secGreetings || [];

        list.forEach((greeting, idx) => {
            const card = document.createElement('div');
            card.className = 'greeting-card collapsed';
            const preview = greeting ? greeting.substring(0, 50) + (greeting.length > 50 ? '...' : '') : '(空)';

            card.innerHTML = `
                <div class="greeting-header" onclick="this.closest('.greeting-card').classList.toggle('collapsed')">
                    <span class="greeting-preview">${escapeHtml(preview)}</span>
                    <div style="display: flex; gap: 6px; align-items: center;" onclick="event.stopPropagation()">
                        <button class="dp-entry-transfer-btn to-prim" onclick="DualPane.transferSingleGreeting(${idx}, 'secToPrim')" title="复制此问候语到主卡">⬅ 移入主卡</button>
                        <button class="greeting-delete" onclick="DualPane.deleteSecondaryGreeting(${idx})">删除</button>
                    </div>
                </div>
                <div class="greeting-content">
                    <textarea placeholder="输入备用问候消息..."
                        oninput="DualPane.updateSecondaryGreeting(${idx}, this.value); const p = this.closest('.greeting-card').querySelector('.greeting-preview'); if(p) p.textContent = this.value ? (this.value.substring(0,50) + (this.value.length>50?'...':'')) : '(空)';"
                        onchange="DualPane.updateSecondaryGreeting(${idx}, this.value);">${escapeHtml(greeting)}</textarea>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function addSecondaryGreeting(content = '') {
        state.secGreetings.push(content);
        renderSecondaryGreetings();

        // 实时同步主卡
        if (Array.isArray(window.alternateGreetingsData)) {
            window.alternateGreetingsData.push(content);
            if (typeof renderAlternateGreetings === 'function') renderAlternateGreetings();
        }
    }

    function updateSecondaryGreeting(idx, val) {
        if (state.secGreetings && state.secGreetings[idx] !== undefined) {
            state.secGreetings[idx] = val;
        }
        // 实时细粒度同步主卡对应问候语，无需整页刷新，光标绝不丢失
        if (Array.isArray(window.alternateGreetingsData)) {
            window.alternateGreetingsData[idx] = val;
        }
        const primContainer = document.getElementById('alternate-greetings-container');
        if (primContainer) {
            const cards = primContainer.querySelectorAll('.greeting-card');
            if (cards[idx]) {
                const ta = cards[idx].querySelector('textarea');
                const preview = cards[idx].querySelector('.greeting-preview');
                if (ta && ta.value !== val) {
                    ta.value = val;
                    if (typeof autoResizeTextarea === 'function') autoResizeTextarea(ta);
                }
                if (preview) {
                    preview.textContent = val ? (val.substring(0, 50) + (val.length > 50 ? '...' : '')) : '(空)';
                }
            }
        }
    }

    function deleteSecondaryGreeting(idx) {
        if (confirm('确定删除此备用问候语吗？')) {
            state.secGreetings.splice(idx, 1);
            renderSecondaryGreetings();

            // 实时同步主卡删除对应问候语
            if (Array.isArray(window.alternateGreetingsData) && idx < window.alternateGreetingsData.length) {
                window.alternateGreetingsData.splice(idx, 1);
                if (typeof renderAlternateGreetings === 'function') renderAlternateGreetings();
            }
        }
    }

    // 3. 正则脚本渲染
    function renderSecondaryRegex() {
        const container = document.getElementById('sec-regex-scripts-container');
        if (!container) return;

        container.innerHTML = '';
        const list = state.secRegexScripts || [];

        list.forEach((script, idx) => {
            const card = document.createElement('div');
            card.className = 'regex-card collapsed' + (script.disabled ? ' disabled' : '');
            const displayName = script.scriptName || `正则脚本 ${idx + 1}`;

            card.innerHTML = `
                <div class="regex-header" style="display: flex; align-items: center; justify-content: space-between;" onclick="this.closest('.regex-card').classList.toggle('collapsed')">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                        <span style="font-weight: bold; color: #fff;">${escapeHtml(displayName)}</span>
                        <span style="font-size: 11px; color: #888;">/${escapeHtml(script.findRegex || '')}/</span>
                    </div>
                    <div class="regex-actions" onclick="event.stopPropagation()">
                        <button class="dp-entry-transfer-btn to-prim" onclick="DualPane.transferSingleRegex(${idx}, 'secToPrim')" title="复制此正则脚本到主卡">⬅ 移入主卡</button>
                        <button class="regex-delete" onclick="DualPane.deleteSecondaryRegex(${idx})">删除</button>
                    </div>
                </div>
                <div class="regex-fields" style="padding: 10px;">
                    <div class="regex-field" style="margin-bottom: 8px;">
                        <label style="font-size: 11px; color: #aaa;">名称</label>
                        <input type="text" value="${escapeHtml(script.scriptName || '')}"
                            oninput="DualPane.updateSecondaryRegexField(${idx}, 'scriptName', this.value)"
                            onchange="DualPane.updateSecondaryRegexField(${idx}, 'scriptName', this.value)" style="width: 100%; padding: 4px 8px; font-size: 12px;">
                    </div>
                    <div class="regex-field" style="margin-bottom: 8px;">
                        <label style="font-size: 11px; color: #aaa;">匹配正则</label>
                        <input type="text" value="${escapeHtml(script.findRegex || '')}"
                            oninput="DualPane.updateSecondaryRegexField(${idx}, 'findRegex', this.value)"
                            onchange="DualPane.updateSecondaryRegexField(${idx}, 'findRegex', this.value)" style="width: 100%; padding: 4px 8px; font-size: 12px;">
                    </div>
                    <div class="regex-field">
                        <label style="font-size: 11px; color: #aaa;">替换字符串</label>
                        <textarea rows="3"
                            oninput="DualPane.updateSecondaryRegexField(${idx}, 'replaceString', this.value)"
                            onchange="DualPane.updateSecondaryRegexField(${idx}, 'replaceString', this.value)" style="width: 100%; padding: 4px 8px; font-size: 12px;">${escapeHtml(script.replaceString || '')}</textarea>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function addSecondaryRegexScript() {
        const newScript = {
            scriptName: '新正则脚本',
            findRegex: '',
            replaceString: '',
            placement: [2],
            disabled: false
        };
        state.secRegexScripts.push(newScript);
        renderSecondaryRegex();

        // 实时同步主卡
        if (Array.isArray(window.regexScriptsData)) {
            window.regexScriptsData.push(JSON.parse(JSON.stringify(newScript)));
            if (typeof renderRegexScripts === 'function') renderRegexScripts();
        }
    }

    function updateSecondaryRegexField(idx, field, val) {
        if (state.secRegexScripts && state.secRegexScripts[idx]) {
            state.secRegexScripts[idx][field] = val;
        }
        // 实时细粒度同步主卡，无需重绘整体，光标不丢失
        if (Array.isArray(window.regexScriptsData) && window.regexScriptsData[idx]) {
            window.regexScriptsData[idx][field] = val;
            const primContainer = document.getElementById('regex-scripts-container');
            if (primContainer) {
                const cards = primContainer.querySelectorAll('.regex-card');
                if (cards[idx]) {
                    if (field === 'scriptName') {
                        const nameSpan = cards[idx].querySelector('.regex-header span');
                        if (nameSpan) nameSpan.textContent = val || `正则脚本 ${idx + 1}`;
                    } else if (field === 'findRegex') {
                        const allSpans = cards[idx].querySelectorAll('.regex-header span');
                        if (allSpans[1]) allSpans[1].textContent = `/${val || ''}/`;
                    }
                    const inputs = cards[idx].querySelectorAll('input, textarea');
                    inputs.forEach(inp => {
                        if (inp.getAttribute('onchange')?.includes(`'${field}'`) || inp.dataset.field === field) {
                            if (inp.value !== String(val)) inp.value = val;
                        }
                    });
                }
            }
        }
    }

    function deleteSecondaryRegex(idx) {
        if (confirm('确定删除此正则脚本吗？')) {
            state.secRegexScripts.splice(idx, 1);
            renderSecondaryRegex();

            // 实时同步主卡删除对应脚本
            if (Array.isArray(window.regexScriptsData) && idx < window.regexScriptsData.length) {
                window.regexScriptsData.splice(idx, 1);
                if (typeof renderRegexScripts === 'function') renderRegexScripts();
            }
        }
    }

    // 4. 小白X任务渲染
    function renderSecondaryTasks() {
        const container = document.getElementById('sec-xiaobaix-tasks-container');
        if (!container) return;

        container.innerHTML = '';
        const list = state.secTasks || [];

        list.forEach((task, idx) => {
            const card = document.createElement('div');
            card.className = 'task-card collapsed' + (task.disabled ? ' disabled' : '');
            const displayName = task.name || `任务 ${idx + 1}`;

            card.innerHTML = `
                <div class="task-header" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #222; border-radius: 4px; cursor: pointer;" onclick="this.closest('.task-card').classList.toggle('collapsed')">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                        <span style="font-weight: bold; color: #f1c40f;">${escapeHtml(displayName)}</span>
                        <span style="font-size: 11px; color: #888;">[${escapeHtml(task.triggerTiming || '循环')}]</span>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;" onclick="event.stopPropagation()">
                        <button class="dp-entry-transfer-btn to-prim" onclick="DualPane.transferSingleTask(${idx}, 'secToPrim')" title="复制此任务到主卡">⬅ 移入主卡</button>
                        <button onclick="DualPane.deleteSecondaryTask(${idx})" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 12px;">删除</button>
                    </div>
                </div>
                <div class="task-body" style="padding: 10px; background: #262626; border-radius: 4px; margin-top: 6px;">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 11px; color: #aaa;">任务名称</label>
                        <input type="text" value="${escapeHtml(task.name || '')}"
                            oninput="DualPane.updateSecondaryTaskField(${idx}, 'name', this.value)"
                            onchange="DualPane.updateSecondaryTaskField(${idx}, 'name', this.value)" style="width: 100%; padding: 4px 8px; font-size: 12px;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #aaa;">任务脚本命令</label>
                        <textarea rows="4"
                            oninput="DualPane.updateSecondaryTaskField(${idx}, 'commands', this.value)"
                            onchange="DualPane.updateSecondaryTaskField(${idx}, 'commands', this.value)" style="width: 100%; padding: 6px 8px; font-size: 12px; font-family: monospace;">${escapeHtml(task.commands || '')}</textarea>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function addSecondaryXiaobaixTask() {
        const newTask = {
            name: '新变量任务',
            triggerTiming: 'ai_output',
            interval: 0,
            commands: '<<taskjs>>\n\n<</taskjs>>',
            disabled: false
        };
        state.secTasks.push(newTask);
        renderSecondaryTasks();

        // 实时同步主卡
        if (Array.isArray(window.xiaobaixTasksData)) {
            window.xiaobaixTasksData.push(JSON.parse(JSON.stringify(newTask)));
            if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
        }
    }

    function updateSecondaryTaskField(idx, field, val) {
        if (state.secTasks && state.secTasks[idx]) {
            state.secTasks[idx][field] = val;
        }
        // 实时细粒度同步主卡
        if (Array.isArray(window.xiaobaixTasksData) && window.xiaobaixTasksData[idx]) {
            window.xiaobaixTasksData[idx][field] = val;
            const primContainer = document.getElementById('xiaobaix-tasks-container');
            if (primContainer) {
                const cards = primContainer.querySelectorAll('.task-card');
                if (cards[idx]) {
                    if (field === 'name') {
                        const nameSpan = cards[idx].querySelector('.task-header span');
                        if (nameSpan) nameSpan.textContent = val || `任务 ${idx + 1}`;
                    }
                    const inputs = cards[idx].querySelectorAll('input, textarea');
                    inputs.forEach(inp => {
                        if (inp.getAttribute('onchange')?.includes(`'${field}'`) || inp.dataset.field === field) {
                            if (inp.value !== String(val)) inp.value = val;
                        }
                    });
                }
            }
        }
    }

    function deleteSecondaryTask(idx) {
        if (confirm('确定删除此小白X任务吗？')) {
            state.secTasks.splice(idx, 1);
            renderSecondaryTasks();

            // 实时同步主卡删除对应任务
            if (Array.isArray(window.xiaobaixTasksData) && idx < window.xiaobaixTasksData.length) {
                window.xiaobaixTasksData.splice(idx, 1);
                if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
            }
        }
    }

    // 5. 系统指令 · 状态栏 · 美化 渲染与操作
    function renderSecondaryInstructions() {
        const container = document.getElementById('sec-instructions-container');
        if (!container) return;

        let addButton = container.querySelector('.add-instruction');
        if (!addButton) {
            addButton = document.createElement('div');
            addButton.className = 'instruction-card add-instruction';
            addButton.onclick = () => DualPane.addNewInstructionForSec();
            addButton.innerHTML = `
                <div class="add-icon">+</div>
                <div class="add-text">系统指令 · 状态栏 · 美化</div>
            `;
            container.appendChild(addButton);
        }

        // 清除现有的非添加卡片
        const existingCards = container.querySelectorAll('.instruction-card:not(.add-instruction)');
        existingCards.forEach(card => card.remove());

        const list = state.secInstructionsData || [];
        list.forEach(instruction => {
            const card = document.createElement('div');
            card.className = 'instruction-card';
            card.dataset.instructionId = instruction.id;
            const editTxt = (typeof t === 'function' ? t('edit-btn') : null) || '编辑';
            const delTxt = (typeof t === 'function' ? t('delete-btn') : null) || '删除';

            card.innerHTML = `
                <div class="instruction-header">
                    <div class="instruction-name">${escapeHtml(instruction.name || '未命名指令')}</div>
                    <div class="instruction-actions">
                        <button onclick="DualPane.editInstructionForSec('${instruction.id}')">${editTxt}</button>
                        <button class="delete-btn" onclick="DualPane.deleteInstructionForSec('${instruction.id}')">${delTxt}</button>
                    </div>
                </div>
                <div class="instruction-content">${escapeHtml(instruction.content || '')}</div>
            `;
            container.insertBefore(card, addButton);
        });
    }

    function addNewInstructionForSec() {
        showSecondaryInstructionModal(null);
    }

    function editInstructionForSec(instructionId) {
        const inst = (state.secInstructionsData || []).find(i => i.id == instructionId);
        if (inst) {
            showSecondaryInstructionModal(inst);
        }
    }

    function deleteInstructionForSec(instructionId) {
        const confirmMsg = (typeof t === 'function' ? t('confirm-delete-instruction') : null) || '确定要删除这条指令吗？';
        if (confirm(confirmMsg)) {
            const instToDelete = (state.secInstructionsData || []).find(i => i.id == instructionId);
            if (instToDelete) {
                deleteInstructionFromSecondarySystemPrompt(instToDelete.name);
                if (typeof deleteInstructionFromSystemPrompt === 'function') {
                    deleteInstructionFromSystemPrompt(instToDelete.name);
                }
            }
            state.secInstructionsData = (state.secInstructionsData || []).filter(i => i.id != instructionId);
            if (Array.isArray(window.instructionsData)) {
                window.instructionsData = window.instructionsData.filter(i => i.id != instructionId);
            }

            renderSecondaryInstructions();
            updateSecondarySystemPromptWithInstructions();

            // 实时同步主卡指令卡片渲染与系统设定
            if (typeof renderInstructionCards === 'function') renderInstructionCards();
            if (typeof updateSystemPromptWithInstructions === 'function') updateSystemPromptWithInstructions();
        }
    }

    function deleteInstructionFromSecondarySystemPrompt(instructionName) {
        const textarea = document.getElementById('sec-system_prompt');
        if (textarea && instructionName) {
            const current = textarea.value;
            const escapedName = instructionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\n\\n《${escapedName}》指令[\\s\\S]*?《\/${escapedName}》`, 'g');
            textarea.value = current.replace(regex, '');
            if (typeof autoResizeTextarea === 'function') autoResizeTextarea(textarea);
        }
    }

    function updateSecondarySystemPromptWithInstructions() {
        const textarea = document.getElementById('sec-system_prompt');
        if (textarea && typeof embedInstructionsInSystemPrompt === 'function') {
            textarea.value = embedInstructionsInSystemPrompt(textarea.value, state.secInstructionsData || []);
            if (typeof autoResizeTextarea === 'function') autoResizeTextarea(textarea);
        }
    }

    function showSecondaryInstructionModal(instruction = null) {
        const isEdit = instruction !== null;
        const modalTitle = isEdit
            ? ((typeof t === 'function' ? t('edit-instruction') : null) || '编辑指令')
            : ((typeof t === 'function' ? t('instruction-beautify') : null) || '系统指令 · 美化');

        const oldModal = document.getElementById('sec-instruction-modal');
        if (oldModal) oldModal.remove();

        const tmpls = (typeof instructionTemplates !== 'undefined' && instructionTemplates) ? instructionTemplates : {};

        const modal = document.createElement('div');
        modal.id = 'sec-instruction-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10002; display: flex; align-items: center; justify-content: center;';

        modal.innerHTML = `
            <div style="background: var(--bg-color, #1e1e1e); border-radius: 10px; padding: 20px; max-width: 900px; width: 90%; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; border: 1px solid var(--input-border, #444); color: var(--text-color, #fff); box-sizing: border-box;">
                <h3 style="margin-top: 0; color: var(--primary-color, #e67e22);">${modalTitle}</h3>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">名称：</label>
                    <input type="text" id="sec-instruction-name-input" value="${escapeHtml(instruction ? instruction.name : '')}" style="width: 100%; padding: 8px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">${(typeof t === 'function' ? t('instruction-content') : null) || '指令内容：'}</label>
                    <textarea id="sec-instruction-content-input" rows="8" style="width: 100%; padding: 8px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); resize: vertical; box-sizing: border-box;">${escapeHtml(instruction ? instruction.content : '[系统指令]: ')}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">模板导入：</label>
                    <select id="sec-template-select" style="width: 100%; padding: 8px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); box-sizing: border-box;">
                        <option value="">选择预设模板...</option>
                        ${Object.entries(tmpls).map(([key, template]) => `<option value="${key}">${escapeHtml(template.name)}</option>`).join('')}
                    </select>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                    <button id="sec-cancel-instruction-btn" style="padding: 8px 16px; border: 1px solid var(--input-border); border-radius: 5px; background: var(--input-bg); color: var(--text-color); cursor: pointer;">取消</button>
                    <button id="sec-save-instruction-btn" style="padding: 8px 16px; border: none; border-radius: 5px; background: var(--primary-color, #e67e22); color: white; cursor: pointer;">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const templateSelect = modal.querySelector('#sec-template-select');
        const nameInput = modal.querySelector('#sec-instruction-name-input');
        const contentInput = modal.querySelector('#sec-instruction-content-input');
        const cancelBtn = modal.querySelector('#sec-cancel-instruction-btn');
        const saveBtn = modal.querySelector('#sec-save-instruction-btn');

        templateSelect.addEventListener('change', () => {
            const key = templateSelect.value;
            if (key && tmpls[key]) {
                nameInput.value = tmpls[key].name;
                contentInput.value = tmpls[key].content;
            }
        });

        cancelBtn.addEventListener('click', () => modal.remove());

        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.trim();

            if (!name) {
                alert((typeof t === 'function' ? t('instruction-name-required') : null) || '请输入指令名称');
                nameInput.focus();
                return;
            }
            if (!content) {
                alert((typeof t === 'function' ? t('instruction-content-required') : null) || '请输入指令内容');
                contentInput.focus();
                return;
            }

            if (instruction) {
                // 编辑现有指令
                if (instruction.name !== name) {
                    deleteInstructionFromSecondarySystemPrompt(instruction.name);
                    if (typeof deleteInstructionFromSystemPrompt === 'function') {
                        deleteInstructionFromSystemPrompt(instruction.name);
                    }
                }
                instruction.name = name;
                instruction.content = content;

                // 实时同步主卡数据
                if (Array.isArray(window.instructionsData)) {
                    const primInst = window.instructionsData.find(i => i.id == instruction.id);
                    if (primInst) {
                        primInst.name = name;
                        primInst.content = content;
                    }
                }
            } else {
                // 添加新指令
                const newInst = {
                    id: Date.now() + Math.random(),
                    name: name,
                    content: content,
                    enabled: false,
                    renderEnabled: false
                };
                if (!state.secInstructionsData) state.secInstructionsData = [];
                state.secInstructionsData.push(newInst);

                // 实时同步主卡数据
                if (Array.isArray(window.instructionsData)) {
                    window.instructionsData.push(JSON.parse(JSON.stringify(newInst)));
                }
            }

            renderSecondaryInstructions();
            updateSecondarySystemPromptWithInstructions();

            // 实时刷新主卡指令卡片与系统设定
            if (typeof renderInstructionCards === 'function') renderInstructionCards();
            if (typeof updateSystemPromptWithInstructions === 'function') updateSystemPromptWithInstructions();

            modal.remove();
        });
    }

    // 副卡批量生成问候语
    function batchGenerateGreetingsForSec(button) {
        window.__batchGreetingTarget = 'sec';
        if (typeof batchGenerateGreetings === 'function') {
            batchGenerateGreetings(button);
        }
    }

    // 拦截与代理全局 useGreeting，使其在双开副卡上下文下作用于副卡
    (function initUseGreetingProxy() {
        const origUseGreeting = window.useGreeting;
        window.useGreeting = function (index, type) {
            if (window.__batchGreetingTarget === 'sec') {
                if (!window.generatedGreetings || !window.generatedGreetings[index]) {
                    alert('找不到该问候消息');
                    return;
                }
                const content = window.generatedGreetings[index];
                if (type === 'first_mes') {
                    const firstMesField = document.getElementById('sec-first_mes');
                    if (firstMesField) {
                        firstMesField.value = content;
                        if (typeof autoResizeTextarea === 'function') autoResizeTextarea(firstMesField);
                        alert('✅ 已设置为副卡主问候消息');
                    }
                } else if (type === 'alternate') {
                    addSecondaryGreeting(content);
                    alert('✅ 已添加到副卡备选问候消息');
                }
                return;
            }
            if (typeof origUseGreeting === 'function') {
                origUseGreeting(index, type);
            }
        };
    })();

    // 头像变更
    function onAvatarChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            state.secAvatarBase64 = reader.result;
            const preview = document.getElementById('sec-avatar-preview');
            if (preview) preview.src = reader.result;

            // 实时同步主卡头像预览与内存卡片
            const primPreview = document.getElementById('avatar-preview');
            if (primPreview) primPreview.src = reader.result;
            const mainCard = typeof buildCardObject === 'function' ? buildCardObject() : null;
            if (mainCard) mainCard.avatar = reader.result;
        };
        reader.readAsDataURL(file);
    }

    // ============================================================
    // 主副卡全要素双向实时同步引擎 (Live Synchronization Engine)
    // ============================================================

    let isSyncing = false; // 互斥锁，防止 A -> B -> A 循环更新
    let liveSyncInitialized = false;

    const SYNC_FIELD_MAP = [
        { prim: 'name', sec: 'sec-name' },
        { prim: 'gender', sec: 'sec-gender' },
        { prim: 'character_version', sec: 'sec-character_version' },
        { prim: 'tags', sec: 'sec-tags' },
        { prim: 'description', sec: 'sec-description' },
        { prim: 'personality', sec: 'sec-personality' },
        { prim: 'system_prompt', sec: 'sec-system_prompt' },
        { prim: 'scenario', sec: 'sec-scenario' },
        { prim: 'first_mes', sec: 'sec-first_mes' },
        { prim: 'mes_example', sec: 'sec-mes_example' },
        { prim: 'post_history_instructions', sec: 'sec-post_history_instructions' },
        { prim: 'creator_notes', sec: 'sec-creator_notes' },
        { prim: 'depth_prompt_depth', sec: 'sec-depth_prompt_depth' },
        { prim: 'depth_prompt_role', sec: 'sec-depth_prompt_role' },
        { prim: 'depth_prompt_prompt', sec: 'sec-depth_prompt_prompt' }
    ];

    function setupLiveSync() {
        const secContainer = document.getElementById('editor-secondary-container');
        const primContainer = document.querySelector('#editor-view .editor-container:not(.secondary-pane)');

        // 1. 副卡输入 -> 主卡实时同步
        if (secContainer && !secContainer._liveSyncBound) {
            secContainer._liveSyncBound = true;
            secContainer.addEventListener('input', (e) => handleContainerInput(e, 'sec'));
            secContainer.addEventListener('change', (e) => handleContainerInput(e, 'sec'));
        }

        // 2. 主卡输入 -> 副卡实时同步
        if (primContainer && !primContainer._liveSyncBound) {
            primContainer._liveSyncBound = true;
            primContainer.addEventListener('input', (e) => handleContainerInput(e, 'prim'));
            primContainer.addEventListener('change', (e) => handleContainerInput(e, 'prim'));
        }
    }

    function handleContainerInput(e, fromSide) {
        if (!state.active || isSyncing) return;
        const target = e.target;
        if (!target) return;

        // A. 基础字段同步
        if (target.id) {
            const pair = SYNC_FIELD_MAP.find(p => (fromSide === 'sec' ? p.sec === target.id : p.prim === target.id));
            if (pair) {
                const targetId = fromSide === 'sec' ? pair.prim : pair.sec;
                const targetEl = document.getElementById(targetId);
                if (targetEl && targetEl.value !== target.value) {
                    isSyncing = true;
                    try {
                        targetEl.value = target.value;
                        if (typeof autoResizeTextarea === 'function') autoResizeTextarea(targetEl);
                        if (fromSide === 'sec') {
                            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } finally {
                        isSyncing = false;
                    }
                }
                return;
            }
        }

        // B. 世界书条目内部手敲输入同步
        const wbEntry = target.closest('.worldbook-entry');
        if (wbEntry) {
            handleWorldbookLiveSync(target, wbEntry, fromSide);
            return;
        }

        // C. 备用问候语手敲输入同步
        const greetingCard = target.closest('.greeting-card');
        if (greetingCard) {
            handleGreetingsLiveSync(target, greetingCard, fromSide);
            return;
        }

        // D. 正则脚本手敲输入同步
        const regexCard = target.closest('.regex-card');
        if (regexCard) {
            handleRegexLiveSync(target, regexCard, fromSide);
            return;
        }

        // E. 任务手敲输入同步
        const taskCard = target.closest('.task-card');
        if (taskCard) {
            handleTaskLiveSync(target, taskCard, fromSide);
            return;
        }
    }

    // 世界书实时细粒度输入同步
    function handleWorldbookLiveSync(target, entryElement, fromSide) {
        const sourceContainerId = fromSide === 'sec' ? 'sec-worldbook-entries-container' : 'worldbook-entries-container';
        const targetContainerId = fromSide === 'sec' ? 'worldbook-entries-container' : 'sec-worldbook-entries-container';

        const sourceContainer = document.getElementById(sourceContainerId);
        const targetContainer = document.getElementById(targetContainerId);
        if (!sourceContainer || !targetContainer) return;

        const sourceEntries = Array.from(sourceContainer.querySelectorAll('.worldbook-entry'));
        const entryIdx = sourceEntries.indexOf(entryElement);
        if (entryIdx === -1) return;

        const targetEntries = Array.from(targetContainer.querySelectorAll('.worldbook-entry'));
        const targetEntry = targetEntries[entryIdx];
        if (!targetEntry) return;

        // 查找对应输入框
        const candidateClasses = [
            'entry-comment', 'wb-keys', 'wb-content', 'wb-secondary-keys',
            'wb-sort-id', 'wb-position', 'wb-secondary-keys-logic', 'wb-priority'
        ];
        const matchedClass = candidateClasses.find(cls => target.classList.contains(cls));

        isSyncing = true;
        try {
            if (matchedClass) {
                const targetInput = targetEntry.querySelector('.' + matchedClass);
                if (targetInput && targetInput.value !== target.value) {
                    targetInput.value = target.value;
                    if (typeof autoResizeTextarea === 'function') autoResizeTextarea(targetInput);
                    if (matchedClass === 'entry-comment') {
                        const titleH4 = targetEntry.querySelector('.entry-collapsed-title h4');
                        if (titleH4) titleH4.textContent = target.value || '新世界书条目';
                    }
                    if (matchedClass === 'wb-position' && typeof toggleDepthField === 'function') {
                        toggleDepthField(targetInput);
                    }
                }
                // 同步副卡内存数据
                if (state.secWorldbook && state.secWorldbook[entryIdx]) {
                    if (matchedClass === 'wb-sort-id') {
                        state.secWorldbook[entryIdx].id = parseInt(target.value, 10) || 0;
                    } else if (matchedClass === 'entry-comment') {
                        state.secWorldbook[entryIdx].comment = target.value;
                    } else if (matchedClass === 'wb-content') {
                        state.secWorldbook[entryIdx].content = target.value;
                    } else if (matchedClass === 'wb-priority') {
                        state.secWorldbook[entryIdx].priority = parseInt(target.value, 10) || 100;
                    }
                }
            }
        } finally {
            isSyncing = false;
        }
    }

    // 备用问候语实时细粒度输入同步
    function handleGreetingsLiveSync(target, cardElement, fromSide) {
        const sourceContainerId = fromSide === 'sec' ? 'sec-alternate-greetings-container' : 'alternate-greetings-container';
        const targetContainerId = fromSide === 'sec' ? 'alternate-greetings-container' : 'sec-alternate-greetings-container';

        const sourceContainer = document.getElementById(sourceContainerId);
        const targetContainer = document.getElementById(targetContainerId);
        if (!sourceContainer || !targetContainer) return;

        const sourceCards = Array.from(sourceContainer.querySelectorAll('.greeting-card'));
        const cardIdx = sourceCards.indexOf(cardElement);
        if (cardIdx === -1) return;

        const targetCards = Array.from(targetContainer.querySelectorAll('.greeting-card'));
        const targetCard = targetCards[cardIdx];
        if (!targetCard) return;

        const targetTa = targetCard.querySelector('textarea');
        const targetPreview = targetCard.querySelector('.greeting-preview');

        isSyncing = true;
        try {
            if (targetTa && targetTa.value !== target.value) {
                targetTa.value = target.value;
                if (typeof autoResizeTextarea === 'function') autoResizeTextarea(targetTa);
            }
            if (targetPreview) {
                targetPreview.textContent = target.value ? (target.value.substring(0, 50) + (target.value.length > 50 ? '...' : '')) : '(空)';
            }
            // 更新内存数据
            if (fromSide === 'sec') {
                if (Array.isArray(window.alternateGreetingsData)) window.alternateGreetingsData[cardIdx] = target.value;
            } else {
                if (state.secGreetings) state.secGreetings[cardIdx] = target.value;
            }
        } finally {
            isSyncing = false;
        }
    }

    // 正则脚本实时细粒度输入同步
    function handleRegexLiveSync(target, cardElement, fromSide) {
        const sourceContainerId = fromSide === 'sec' ? 'sec-regex-scripts-container' : 'regex-scripts-container';
        const targetContainerId = fromSide === 'sec' ? 'regex-scripts-container' : 'sec-regex-scripts-container';

        const sourceContainer = document.getElementById(sourceContainerId);
        const targetContainer = document.getElementById(targetContainerId);
        if (!sourceContainer || !targetContainer) return;

        const sourceCards = Array.from(sourceContainer.querySelectorAll('.regex-card'));
        const cardIdx = sourceCards.indexOf(cardElement);
        if (cardIdx === -1) return;

        const targetCards = Array.from(targetContainer.querySelectorAll('.regex-card'));
        const targetCard = targetCards[cardIdx];
        if (!targetCard) return;

        const sourceInputs = Array.from(cardElement.querySelectorAll('input, textarea'));
        const targetInputs = Array.from(targetCard.querySelectorAll('input, textarea'));
        const inputIdx = sourceInputs.indexOf(target);
        if (inputIdx === -1 || !targetInputs[inputIdx]) return;

        isSyncing = true;
        try {
            if (targetInputs[inputIdx].value !== target.value) {
                targetInputs[inputIdx].value = target.value;
                // 更新标题显示
                if (inputIdx === 0) {
                    const nameSpan = targetCard.querySelector('.regex-header span');
                    if (nameSpan) nameSpan.textContent = target.value || `正则脚本 ${cardIdx + 1}`;
                } else if (inputIdx === 1) {
                    const allSpans = targetCard.querySelectorAll('.regex-header span');
                    if (allSpans[1]) allSpans[1].textContent = `/${target.value || ''}/`;
                }
            }
        } finally {
            isSyncing = false;
        }
    }

    // 任务实时细粒度输入同步
    function handleTaskLiveSync(target, cardElement, fromSide) {
        const sourceContainerId = fromSide === 'sec' ? 'sec-xiaobaix-tasks-container' : 'xiaobaix-tasks-container';
        const targetContainerId = fromSide === 'sec' ? 'xiaobaix-tasks-container' : 'sec-xiaobaix-tasks-container';

        const sourceContainer = document.getElementById(sourceContainerId);
        const targetContainer = document.getElementById(targetContainerId);
        if (!sourceContainer || !targetContainer) return;

        const sourceCards = Array.from(sourceContainer.querySelectorAll('.task-card'));
        const cardIdx = sourceCards.indexOf(cardElement);
        if (cardIdx === -1) return;

        const targetCards = Array.from(targetContainer.querySelectorAll('.task-card'));
        const targetCard = targetCards[cardIdx];
        if (!targetCard) return;

        const sourceInputs = Array.from(cardElement.querySelectorAll('input, textarea'));
        const targetInputs = Array.from(targetCard.querySelectorAll('input, textarea'));
        const inputIdx = sourceInputs.indexOf(target);
        if (inputIdx === -1 || !targetInputs[inputIdx]) return;

        isSyncing = true;
        try {
            if (targetInputs[inputIdx].value !== target.value) {
                targetInputs[inputIdx].value = target.value;
                if (inputIdx === 0) {
                    const nameSpan = targetCard.querySelector('.task-header span');
                    if (nameSpan) nameSpan.textContent = target.value || `任务 ${cardIdx + 1}`;
                }
            }
        } finally {
            isSyncing = false;
        }
    }

    // 退出双开时的兜底数据整合
    function syncSecondaryToPrimaryOnClose() {
        if (!state.secondaryCard) return;

        // 1. 同步基础字段
        SYNC_FIELD_MAP.forEach(({ prim, sec }) => {
            const secEl = document.getElementById(sec);
            const primEl = document.getElementById(prim);
            if (secEl && primEl && secEl.value !== undefined) {
                primEl.value = secEl.value;
                if (typeof autoResizeTextarea === 'function') autoResizeTextarea(primEl);
            }
        });

        // 2. 同步备用问候语
        if (Array.isArray(state.secGreetings)) {
            window.alternateGreetingsData = JSON.parse(JSON.stringify(state.secGreetings));
            if (typeof renderAlternateGreetings === 'function') renderAlternateGreetings();
        }

        // 3. 同步正则脚本
        if (Array.isArray(state.secRegexScripts)) {
            window.regexScriptsData = JSON.parse(JSON.stringify(state.secRegexScripts));
            if (typeof renderRegexScripts === 'function') renderRegexScripts();
        }

        // 4. 同步任务
        if (Array.isArray(state.secTasks)) {
            window.xiaobaixTasksData = JSON.parse(JSON.stringify(state.secTasks));
            if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
        }

        // 5. 同步指令
        if (Array.isArray(state.secInstructionsData)) {
            window.instructionsData = JSON.parse(JSON.stringify(state.secInstructionsData));
            if (typeof renderInstructionCards === 'function') renderInstructionCards();
            if (typeof updateSystemPromptWithInstructions === 'function') updateSystemPromptWithInstructions();
        }

        // 6. 同步世界书
        const secWbContainer = document.getElementById('sec-worldbook-entries-container');
        if (secWbContainer && typeof buildWorldbookDataFromDOM === 'function' && typeof renderWorldbookFromData === 'function') {
            const currentSecWb = buildWorldbookDataFromDOM(secWbContainer);
            if (currentSecWb && currentSecWb.length > 0) {
                renderWorldbookFromData(currentSecWb);
            }
        }
    }

    // ============================================================
    // 条目单条与批量互导、批量删除
    // ============================================================

    function transferSingleWorldbook(idx, direction) {
        if (direction === 'secToPrim') {
            const entry = state.secWorldbook[idx];
            if (!entry) return;
            const primContainer = document.getElementById('worldbook-entries-container');
            if (primContainer && typeof createWorldbookEntryElement === 'function') {
                const clone = JSON.parse(JSON.stringify(entry));
                delete clone.element;
                delete clone.children;
                primContainer.appendChild(createWorldbookEntryElement(clone));
                alert(`条目 "${entry.comment || '未命名'}" 已复制到主卡！`);
            }
        } else {
            // 主卡 -> 副卡
            const primEntries = Array.from(document.querySelectorAll('#worldbook-entries-container .worldbook-entry'));
            const targetEl = primEntries[idx];
            if (targetEl && typeof parseEntryFromElement === 'function') {
                const data = parseEntryFromElement(targetEl);
                delete data.element;
                delete data.children;
                state.secWorldbook.push(data);
                renderSecondaryWorldbook();
                alert(`条目 "${data.comment || '未命名'}" 已复制到副卡！`);
            }
        }
    }

    function transferSingleGreeting(idx, direction) {
        if (direction === 'secToPrim') {
            const g = state.secGreetings[idx];
            if (g !== undefined) {
                if (!Array.isArray(window.alternateGreetingsData)) window.alternateGreetingsData = [];
                window.alternateGreetingsData.push(g);
                if (typeof renderAlternateGreetings === 'function') renderAlternateGreetings();
                alert('问候语已复制到主卡！');
            }
        } else {
            const primList = window.alternateGreetingsData || [];
            if (primList[idx] !== undefined) {
                state.secGreetings.push(primList[idx]);
                renderSecondaryGreetings();
                alert('问候语已复制到副卡！');
            }
        }
    }

    function transferSingleRegex(idx, direction) {
        if (direction === 'secToPrim') {
            const r = state.secRegexScripts[idx];
            if (r) {
                if (!Array.isArray(window.regexScriptsData)) window.regexScriptsData = [];
                window.regexScriptsData.push(JSON.parse(JSON.stringify(r)));
                if (typeof renderRegexScripts === 'function') renderRegexScripts();
                alert('正则脚本已复制到主卡！');
            }
        } else {
            const primList = window.regexScriptsData || [];
            if (primList[idx]) {
                state.secRegexScripts.push(JSON.parse(JSON.stringify(primList[idx])));
                renderSecondaryRegex();
                alert('正则脚本已复制到副卡！');
            }
        }
    }

    function transferSingleTask(idx, direction) {
        if (direction === 'secToPrim') {
            const t = state.secTasks[idx];
            if (t) {
                if (!Array.isArray(window.xiaobaixTasksData)) window.xiaobaixTasksData = [];
                window.xiaobaixTasksData.push(JSON.parse(JSON.stringify(t)));
                if (typeof renderXiaobaixTasks === 'function') renderXiaobaixTasks();
                alert('小白X任务已复制到主卡！');
            }
        } else {
            const primList = window.xiaobaixTasksData || [];
            if (primList[idx]) {
                state.secTasks.push(JSON.parse(JSON.stringify(primList[idx])));
                renderSecondaryTasks();
                alert('小白X任务已复制到副卡！');
            }
        }
    }

    // 全选切换
    function toggleSelectAll(side, type, isChecked) {
        const selector = side === 'sec' ? '.sec-wb-check' : '.prim-worldbook-check';
        document.querySelectorAll(selector).forEach(cb => { cb.checked = isChecked; });
        updateSelectedCount(side, type);
    }

    function updateSelectedCount(side, type) {
        const countEl = document.getElementById(`${side}-wb-selected-count`);
        const selector = side === 'sec' ? '.sec-wb-check:checked' : '.prim-worldbook-check:checked';
        const checkedCount = document.querySelectorAll(selector).length;
        if (countEl) countEl.textContent = `已选 ${checkedCount} 项`;
    }

    // 批量转移世界书
    function batchTransferWorldbook(direction) {
        if (direction === 'secToPrim') {
            const checks = Array.from(document.querySelectorAll('.sec-wb-check:checked'));
            if (!checks.length) { alert('请先勾选副卡要转移的条目！'); return; }
            const primContainer = document.getElementById('worldbook-entries-container');
            if (!primContainer || typeof createWorldbookEntryElement !== 'function') return;

            checks.forEach(cb => {
                const idx = parseInt(cb.dataset.index, 10);
                const entry = state.secWorldbook[idx];
                if (entry) {
                    const clone = JSON.parse(JSON.stringify(entry));
                    delete clone.element;
                    delete clone.children;
                    primContainer.appendChild(createWorldbookEntryElement(clone));
                }
            });
            alert(`已成功转移 ${checks.length} 个世界书条目到主卡！`);
        } else {
            const checks = Array.from(document.querySelectorAll('.prim-worldbook-check:checked'));
            if (!checks.length) { alert('请先勾选主卡要转移的条目！'); return; }

            let count = 0;
            checks.forEach(cb => {
                const entryEl = cb.closest('.worldbook-entry');
                if (entryEl && typeof parseEntryFromElement === 'function') {
                    const data = parseEntryFromElement(entryEl);
                    delete data.element;
                    delete data.children;
                    state.secWorldbook.push(data);
                    count++;
                }
            });
            renderSecondaryWorldbook();
            alert(`已成功转移 ${count} 个世界书条目到副卡！`);
        }
    }

    // 批量删除世界书
    function batchDeleteWorldbook(side) {
        if (side === 'sec') {
            const checks = Array.from(document.querySelectorAll('.sec-wb-check:checked'));
            if (!checks.length) { alert('请先勾选副卡要删除的条目！'); return; }
            if (!confirm(`确定要从副卡中批量删除选中的 ${checks.length} 个条目吗？`)) return;

            const indices = checks.map(c => parseInt(c.dataset.index, 10)).sort((a, b) => b - a);
            indices.forEach(idx => { state.secWorldbook.splice(idx, 1); });
            renderSecondaryWorldbook();
        } else {
            const checks = Array.from(document.querySelectorAll('.prim-worldbook-check:checked'));
            if (!checks.length) { alert('请先勾选主卡要删除的条目！'); return; }
            if (!confirm(`确定要从主卡中批量删除选中的 ${checks.length} 个条目吗？`)) return;

            checks.forEach(cb => {
                const entryEl = cb.closest('.worldbook-entry');
                if (entryEl) entryEl.remove();
            });
            alert(`已从主卡删除 ${checks.length} 个条目！`);
        }
    }

    // 主卡渲染条目时动态注入转移按钮与批量操作条
    function updatePrimaryTransferButtons() {
        const primContainer = document.querySelector('#editor-view .editor-container:not(.secondary-pane)');
        if (!primContainer) return;

        // 注入主卡世界书批量操作栏
        let primBatchBar = document.getElementById('prim-wb-batch-bar');
        const wbEntriesList = document.getElementById('worldbook-entries-container');
        if (wbEntriesList) {
            if (!primBatchBar) {
                primBatchBar = document.createElement('div');
                primBatchBar.id = 'prim-wb-batch-bar';
                primBatchBar.className = 'dp-batch-bar';
                primBatchBar.style.marginTop = '10px';
                primBatchBar.innerHTML = `
                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: #ccc; margin: 0;">
                      <input type="checkbox" id="prim-wb-select-all" onchange="DualPane.toggleSelectAll('prim', 'worldbook', this.checked)">
                      <span>全选</span>
                    </label>
                    <span id="prim-wb-selected-count" style="font-size: 12px; color: #888;">已选 0 项</span>
                    <div style="display: flex; gap: 8px; margin-left: auto;">
                      <button class="dp-batch-btn transfer" onclick="DualPane.batchTransferWorldbook('primToSec')">➡ 批量转移到副卡</button>
                      <button class="dp-batch-btn delete" onclick="DualPane.batchDeleteWorldbook('prim')">🗑 批量删除</button>
                    </div>
                `;
                wbEntriesList.parentElement.insertBefore(primBatchBar, wbEntriesList.nextSibling);
            }
            primBatchBar.style.display = state.active ? 'flex' : 'none';
        }

        // 主卡世界书条目注入
        document.querySelectorAll('#worldbook-entries-container .worldbook-entry').forEach((entryEl, idx) => {
            const header = entryEl.querySelector('.entry-header') || entryEl.firstElementChild;
            if (!header) return;

            let cb = header.querySelector('.prim-worldbook-check');
            let btn = header.querySelector('.prim-transfer-btn');

            if (state.active) {
                if (!cb) {
                    cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'prim-worldbook-check';
                    cb.dataset.index = idx;
                    cb.style.marginRight = '8px';
                    cb.style.cursor = 'pointer';
                    cb.onchange = () => updateSelectedCount('prim', 'worldbook');
                    cb.onclick = e => e.stopPropagation();
                    header.insertBefore(cb, header.firstChild);
                } else {
                    cb.style.display = 'inline-block';
                    cb.dataset.index = idx;
                }

                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'dp-entry-transfer-btn to-sec prim-transfer-btn';
                    btn.title = '复制此条目到副卡';
                    btn.textContent = '➡ 移入副卡';
                    btn.onclick = e => {
                        e.stopPropagation();
                        transferSingleWorldbook(idx, 'primToSec');
                    };
                    header.appendChild(btn);
                } else {
                    btn.style.display = 'inline-block';
                }
            } else {
                if (cb) cb.style.display = 'none';
                if (btn) btn.style.display = 'none';
            }
        });

        // 主卡备用问候语注入
        document.querySelectorAll('#alternate-greetings-container .greeting-card').forEach((card, idx) => {
            const header = card.querySelector('.greeting-header');
            if (!header) return;
            let btn = header.querySelector('.prim-greeting-transfer');
            if (state.active) {
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'dp-entry-transfer-btn to-sec prim-greeting-transfer';
                    btn.style.marginRight = '6px';
                    btn.textContent = '➡ 移入副卡';
                    btn.onclick = e => {
                        e.stopPropagation();
                        transferSingleGreeting(idx, 'primToSec');
                    };
                    const delBtn = header.querySelector('.greeting-delete');
                    if (delBtn) header.insertBefore(btn, delBtn);
                    else header.appendChild(btn);
                } else {
                    btn.style.display = 'inline-block';
                }
            } else if (btn) {
                btn.style.display = 'none';
            }
        });

        // 主卡正则脚本注入
        document.querySelectorAll('#regex-scripts-container .regex-card').forEach((card, idx) => {
            const actions = card.querySelector('.regex-actions');
            if (!actions) return;
            let btn = actions.querySelector('.prim-regex-transfer');
            if (state.active) {
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'dp-entry-transfer-btn to-sec prim-regex-transfer';
                    btn.textContent = '➡ 移入副卡';
                    btn.onclick = e => {
                        e.stopPropagation();
                        transferSingleRegex(idx, 'primToSec');
                    };
                    actions.insertBefore(btn, actions.firstChild);
                } else {
                    btn.style.display = 'inline-block';
                }
            } else if (btn) {
                btn.style.display = 'none';
            }
        });

        // 主卡小白X任务注入
        document.querySelectorAll('#xiaobaix-tasks-container .task-card').forEach((card, idx) => {
            const header = card.querySelector('.task-header');
            if (!header) return;
            let btn = header.querySelector('.prim-task-transfer');
            if (state.active) {
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'dp-entry-transfer-btn to-sec prim-task-transfer';
                    btn.textContent = '➡ 移入副卡';
                    btn.onclick = e => {
                        e.stopPropagation();
                        transferSingleTask(idx, 'primToSec');
                    };
                    header.appendChild(btn);
                } else {
                    btn.style.display = 'inline-block';
                }
            } else if (btn) {
                btn.style.display = 'none';
            }
        });
    }

    // ============================================================
    // 副卡储存、导出与下载 (SillyTavern 标准)
    // ============================================================

    function buildSecondaryCardObject() {
        const depthPrompt = {
            depth: parseInt(getVal('sec-depth_prompt_depth'), 10) || 4,
            role: getVal('sec-depth_prompt_role') || 'system',
            prompt: getVal('sec-depth_prompt_prompt')
        };

        const card = {
            name: getVal('sec-name').trim(),
            gender: getVal('sec-gender').trim(),
            character_version: getVal('sec-character_version').trim() || '1.0',
            tags: getVal('sec-tags').split(/[,、，\s]+/).map(t => t.trim()).filter(Boolean),
            description: getVal('sec-description').trim(),
            personality: getVal('sec-personality').trim(),
            scenario: getVal('sec-scenario').trim(),
            first_mes: getVal('sec-first_mes').trim(),
            mes_example: getVal('sec-mes_example').trim(),
            system_prompt: getVal('sec-system_prompt').trim(),
            post_history_instructions: getVal('sec-post_history_instructions').trim(),
            creator_notes: getVal('sec-creator_notes').trim(),
            depth_prompt: depthPrompt,
            avatar: state.secAvatarBase64,
            worldbook: state.secWorldbook || [],
            alternate_greetings: state.secGreetings || [],
            regex_scripts: state.secRegexScripts || [],
            xiaobaix_tasks: state.secTasks || [],
            instructionsData: state.secInstructionsData || [],
            rawExtensions: state.secOriginalRaw || {}
        };

        const secId = parseInt(document.getElementById('sec-charId')?.value, 10);
        if (!isNaN(secId)) card.id = secId;

        return card;
    }

    async function saveSecondaryCard() {
        if (typeof db === 'undefined' || !db) {
            alert('数据库未就绪！');
            return;
        }

        const card = buildSecondaryCardObject();
        if (!card.name) {
            alert('请输入副角色名字！');
            return;
        }

        const cleanCard = { ...card };
        if (typeof cleanWorldbookForStorage === 'function') {
            cleanCard.worldbook = cleanWorldbookForStorage(card.worldbook);
        }
        cleanCard.lastUsed = Date.now();

        const transaction = db.transaction(['characters'], 'readwrite');
        const store = transaction.objectStore('characters');

        if (cleanCard.id) {
            const putReq = store.put(cleanCard);
            putReq.onsuccess = () => {
                alert(`副卡 "${cleanCard.name}" 已成功保存到角色库！`);
                refreshCardSelector();
            };
            putReq.onerror = () => alert('保存副卡失败！');
        } else {
            const addReq = store.add(cleanCard);
            addReq.onsuccess = e => {
                cleanCard.id = e.target.result;
                const idEl = document.getElementById('sec-charId');
                if (idEl) idEl.value = cleanCard.id;
                alert(`副卡已作为新角色保存到库 (ID: ${cleanCard.id})！`);
                refreshCardSelector();
            };
            addReq.onerror = () => alert('保存副卡失败！');
        }
    }

    function downloadSecondaryJson() {
        const card = buildSecondaryCardObject();
        let exportData = card;
        if (typeof buildV3Card === 'function') {
            exportData = buildV3Card(card);
        }
        const str = JSON.stringify(exportData, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${card.name || 'character'}_v3.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadSecondaryPng() {
        const card = buildSecondaryCardObject();
        if (!card.name) {
            alert('请输入角色名以生成PNG角色卡。');
            return;
        }

        let exportData = card;
        if (typeof buildV3Card === 'function') {
            exportData = buildV3Card(card);
        }

        const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(exportData))));
        const imageToUse = card.avatar || document.getElementById('sec-avatar-preview')?.src || (typeof createDefaultImage === 'function' ? createDefaultImage('2:3') : '');

        if (typeof embedDataInPng === 'function') {
            try {
                const finalPngBlob = await embedDataInPng(imageToUse, base64Data);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(finalPngBlob);
                let filename = card.name || 'character';
                if (card.character_version && card.character_version.trim() !== '') {
                    filename += ' ' + card.character_version.trim();
                }
                filename = filename.replace(/\.png$/i, '');
                a.download = filename + '.png';
                a.click();
                URL.revokeObjectURL(a.href);
            } catch (e) {
                console.error('[DualPane] 导出 PNG 失败:', e);
                alert('导出 PNG 角色卡失败: ' + e.message);
            }
        } else {
            alert('系统未加载 embedDataInPng 函数，无法写入 PNG 元数据！');
        }
    }

    function downloadSecondaryLorebook() {
        const card = buildSecondaryCardObject();
        const lorebookData = {
            name: `${card.name || '副角色'} 的世界书`,
            description: `从副卡 ${card.name} 导出的世界设定集`,
            scan_depth: 100,
            token_budget: 2048,
            recursive_scanning: true,
            entries: {}
        };

        (card.worldbook || []).forEach((entry, idx) => {
            lorebookData.entries[idx] = {
                uid: idx,
                key: entry.keys || [],
                keysecondary: entry.secondary_keys || [],
                comment: entry.comment || '',
                content: entry.content || '',
                constant: !!entry.constant,
                selective: !!entry.selective,
                order: entry.priority || 100,
                position: entry.position || 0,
                disable: !entry.enabled
            };
        });

        const blob = new Blob([JSON.stringify(lorebookData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${card.name || 'lorebook'}_lorebook.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function resetSecondaryCard() {
        if (confirm('确定重置副卡吗？所有未保存的修改将被清空。')) {
            state.secondaryCard = createEmptyCard();
            state.secAvatarBase64 = null;
            state.secWorldbook = [];
            state.secGreetings = [];
            state.secRegexScripts = [];
            state.secTasks = [];
            renderSecondaryCard();
        }
    }

    // 副卡 AI 补全桥接
    function callDeepSeekForSec(fieldId) {
        const el = document.getElementById(fieldId);
        if (!el) return;
        if (typeof callDeepSeek === 'function') {
            // 临时将当前字段挂载为全局或直接调用 callDeepSeek
            callDeepSeek(fieldId);
        } else {
            alert('AI 接口未就绪！');
        }
    }

    function undoAiCompletionForSec(btn) {
        if (typeof undoAiCompletion === 'function') {
            undoAiCompletion(btn);
        }
    }

    function translateAllFields(btn) {
        if (typeof window.translateAllFields === 'function') {
            window.translateAllFields(btn);
        }
    }

    function aiCompleteAllFields(btn) {
        if (typeof window.aiCompleteAllFields === 'function') {
            window.aiCompleteAllFields(btn);
        }
    }

    function generateAiNames(btn) {
        if (typeof window.generateAiNames === 'function') {
            window.generateAiNames(btn);
        }
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // ============================================================
    // 暴露全局 API
    // ============================================================

    window.DualPane = {
        isActive: () => state.active,
        toggle: toggleDualPaneMode,
        open: openDualPane,
        close: closeDualPane,
        toggleSyncScroll: toggleSyncScroll,
        refreshCardSelector: refreshCardSelector,
        onSelectCard: onSelectCard,
        loadCopyOfPrimaryCard: loadCopyOfPrimaryCard,
        saveSecondaryCard: saveSecondaryCard,
        downloadSecondaryJson: downloadSecondaryJson,
        downloadSecondaryPng: downloadSecondaryPng,
        downloadSecondaryLorebook: downloadSecondaryLorebook,
        resetSecondaryCard: resetSecondaryCard,
        getSecondaryCardObject: buildSecondaryCardObject,
        onAvatarChange: onAvatarChange,
        transferSingleWorldbook: transferSingleWorldbook,
        transferSingleGreeting: transferSingleGreeting,
        transferSingleRegex: transferSingleRegex,
        transferSingleTask: transferSingleTask,
        toggleSelectAll: toggleSelectAll,
        updateSelectedCount: updateSelectedCount,
        batchTransferWorldbook: batchTransferWorldbook,
        batchDeleteWorldbook: batchDeleteWorldbook,
        addSecondaryWorldbookEntry: addSecondaryWorldbookEntry,
        deleteSecondaryWorldbookEntry: deleteSecondaryWorldbookEntry,
        sortSecondaryWorldbookByPriority: sortSecondaryWorldbookByPriority,
        sortSecondaryWorldbookById: sortSecondaryWorldbookById,
        importSecondaryWorldbook: importSecondaryWorldbook,
        toggleAllSecondaryWorldbookEntries: toggleAllSecondaryWorldbookEntries,
        addSecondaryGreeting: addSecondaryGreeting,
        updateSecondaryGreeting: updateSecondaryGreeting,
        deleteSecondaryGreeting: deleteSecondaryGreeting,
        addSecondaryRegexScript: addSecondaryRegexScript,
        updateSecondaryRegexField: updateSecondaryRegexField,
        deleteSecondaryRegex: deleteSecondaryRegex,
        addSecondaryXiaobaixTask: addSecondaryXiaobaixTask,
        updateSecondaryTaskField: updateSecondaryTaskField,
        deleteSecondaryTask: deleteSecondaryTask,
        updatePrimaryTransferButtons: updatePrimaryTransferButtons,
        callDeepSeekForSec: callDeepSeekForSec,
        undoAiCompletionForSec: undoAiCompletionForSec,
        addNewInstructionForSec: addNewInstructionForSec,
        editInstructionForSec: editInstructionForSec,
        deleteInstructionForSec: deleteInstructionForSec,
        batchGenerateGreetingsForSec: batchGenerateGreetingsForSec,
        translateAllFields: translateAllFields,
        aiCompleteAllFields: aiCompleteAllFields,
        generateAiNames: generateAiNames
    };

    window.toggleDualPaneMode = toggleDualPaneMode;

    // ============================================================
    // 全局方法代理增强：保证主副卡世界书增删双向实时同步与 ID 绝对一致
    // ============================================================

    // 1. 代理全局 addWorldbookEntry：主卡添加条目时，若处于双开状态，副卡保持镜像同步
    const _origAddWorldbookEntry = window.addWorldbookEntry;
    window.addWorldbookEntry = function (entryData = null) {
        if (typeof _origAddWorldbookEntry === 'function') {
            _origAddWorldbookEntry(entryData);
        }
        if (state.active && !window.__isDualPaneSyncingWb) {
            if (typeof buildWorldbookDataFromDOM === 'function') {
                const primData = buildWorldbookDataFromDOM();
                state.secWorldbook = JSON.parse(JSON.stringify(primData));
                renderSecondaryWorldbook();
            }
        }
    };

    // 2. 代理全局 deleteWorldbookEntry：副卡内部点击红色“删除”按钮时，精准删除副卡条目并同步主卡
    const _origDeleteWorldbookEntry = window.deleteWorldbookEntry;
    window.deleteWorldbookEntry = function (button) {
        const secContainer = document.getElementById('sec-worldbook-entries-container');
        if (secContainer && button && secContainer.contains(button)) {
            const entryEl = button.closest('.worldbook-entry');
            if (entryEl) {
                const entries = Array.from(secContainer.querySelectorAll('.worldbook-entry'));
                const idx = entries.indexOf(entryEl);
                if (idx !== -1) {
                    deleteSecondaryWorldbookEntry(idx);
                }
            }
            return;
        }
        if (typeof _origDeleteWorldbookEntry === 'function') {
            _origDeleteWorldbookEntry(button);
        }
        if (state.active && !window.__isDualPaneSyncingWb) {
            if (typeof buildWorldbookDataFromDOM === 'function') {
                const primData = buildWorldbookDataFromDOM();
                state.secWorldbook = JSON.parse(JSON.stringify(primData));
                renderSecondaryWorldbook();
            }
        }
    };

    // 监听主卡列表变化自动同步转移按钮
    let debounceTimer = null;
    function scheduleUpdateTransferButtons() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updatePrimaryTransferButtons();
        }, 150);
    }

    function setupMutationObservers() {
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const m of mutations) {
                if (m.type === 'childList') {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) scheduleUpdateTransferButtons();
        });

        const targets = [
            'worldbook-entries-container',
            'alternate-greetings-container',
            'regex-scripts-container',
            'xiaobaix-tasks-container'
        ];

        targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                observer.observe(el, { childList: true });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMutationObservers);
    } else {
        setupMutationObservers();
    }

})(window);
