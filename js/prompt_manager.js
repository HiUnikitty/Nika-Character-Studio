// ==========================================================================
// 📝 全量提示词自定义中心 & 可视化色块占位符引擎 (PromptManager)
// ==========================================================================
// - 内部模板占位符采用 [[key]] 语法，与角色卡内置的 {{user}} / {{char}} 零冲突
// - 编辑器使用富文本色块胶囊渲染（中文标签 + 必填标记），点击侧栏色块直接插入光标处
// - 持久化存储于 localStorage['nika_custom_prompts_v1']
// ==========================================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'nika_custom_prompts_v1';

    // ==================== 1. 全站提示词注册表（覆盖全站所有 AI 提示词） ====================
    const PROMPT_REGISTRY = [
        // ---------- 分类 1：角色卡生成与补全 ----------
        {
            id: 'complete_all_new',
            category: '🎭 角色卡生成与补全',
            name: '从概念一键生成完整角色卡',
            desc: '编辑器全空时，点击「AI 一键补全」根据角色概念生成所有字段。',
            tokens: [
                { key: 'userGuidance', label: '用户核心概念', required: true, color: 'orange', desc: '你在弹窗输入的角色概念与需求' },
                { key: 'worldbookContextPrompt', label: '世界书参考', required: false, color: 'blue', desc: '勾选参考已有世界书时自动注入的条目内容' },
                { key: 'fieldsToComplete', label: '目标字段列表', required: true, color: 'purple', desc: '需要 AI 以 JSON 返回的角色卡字段名列表' }
            ],
            defaultTemplate: `你是专业的角色信息生成专家。请根据用户提供的角色概念，深度思考并生成完整的角色信息.
## 用户需求
**用户核心概念:** [[userGuidance]]
[[worldbookContextPrompt]]
---
**你的任务:**
为以下字段生成内容，并**严格以一个单一的JSON对象格式返回**，不要包含任何解释或Markdown标记。
**目标字段:** "[[fieldsToComplete]]"
- 对于 "tags" 字段, 请返回一个由逗号分隔的字符串。
- 对于 "personality", 请返回一个包含MBTI性格类型的详细性格描述。
- 对于 "mes_example", 请生成一段包含{{user}}和{{char}}的对话示例，对话开始另起一行以<START>开头。例如：
<START>
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

---`
        },
        {
            id: 'complete_all_fill',
            category: '🎭 角色卡生成与补全',
            name: '补全剩余空白字段',
            desc: '编辑器已有部分内容时，点击「AI 一键补全」补齐剩余空白字段。',
            tokens: [
                { key: 'filledFieldsText', label: '已填写字段信息', required: true, color: 'green', desc: '当前表单里已经填好的角色字段' },
                { key: 'worldbookContextPrompt', label: '世界书参考', required: false, color: 'blue', desc: '勾选参考已有世界书时自动注入' },
                { key: 'emptyFields', label: '待补全字段列表', required: true, color: 'purple', desc: '需要 AI 补全的空白字段名' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '你在弹窗输入的补充要求（留空则不显示）' }
            ],
            defaultTemplate: `你正在设计角色/多角色世界。请根据以下已经提供的角色信息，为角色/世界补全剩余的空白字段。
---
**已提供的信息:**
[[filledFieldsText]]
[[worldbookContextPrompt]]
---
**需要你补全的字段:**
"[[emptyFields]]"
---
[[userGuidanceBlock]]**你的任务:**
请为需要补全的字段生成内容，并**严格以一个单一的JSON对象格式返回**，只包含你需要补全的字段的键和值。不要包含任何解释或Markdown标记。
- 对于 "tags" 字段, 请返回一个由逗号分隔的字符串。
- 对于 "mes_example", 请生成一段包含{{user}}和{{char}}的对话示例，对话开始另起一行以<START>开头。例如：
<START>
{{user}}: 你好。
{{char}}: (微笑着向你点头) 你好，{{user}}。找我有什么事吗？

<START>
{{user}}: 再见。
{{char}}: (微笑着向你挥手) 再见，{{user}}。`
        },
        {
            id: 'single_field_generate',
            category: '🎭 角色卡生成与补全',
            name: '单字段「AI 帮我写」',
            desc: '编辑器各输入框旁的「AI 帮我写」按钮提示词。',
            tokens: [
                { key: 'labelText', label: '当前字段名称', required: true, color: 'purple', desc: '如“角色描述”“首次发言”“性格”等' },
                { key: 'cardInfoText', label: '已有角色信息', required: true, color: 'green', desc: '当前表单中已填写的角色名/性别/描述/场景等' },
                { key: 'worldbookBlock', label: '世界书参考', required: false, color: 'blue', desc: '勾选参考世界书时注入的完整条目内容' },
                { key: 'firstMesGuide', label: '开场白专项要求', required: false, color: 'teal', desc: '仅生成「首次发言」时自动注入的篇幅与结构要求' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '你在弹窗输入的额外要求' }
            ],
            defaultTemplate: `请根据以下已经提供的角色信息，为我生成或补全【[[labelText]]】这一项。
请直接返回最适合填入该项的内容，语言风格要自然

已提供信息:

[[cardInfoText]][[worldbookBlock]]
注意：我的代词为"{{user}}"，角色的代词为"{{char}}"，在输出中已知名字时，必须输出为代词

根据以上提供的角色信息，生成或补全【[[labelText]]】这一项。
请直接返回最适合填入该项的内容，语言风格要自然
特别注意：你不是角色
**Avoid** writing {{char}}'s words and thoughts
[[firstMesGuide]][[userGuidanceBlock]]
现在，请生成【[[labelText]]】的内容。`
        },
        {
            id: 'generate_ai_names',
            category: '🎭 角色卡生成与补全',
            name: 'AI 角色起名',
            desc: '根据性别、描述和个性生成 5 个贴切角色名。',
            tokens: [
                { key: 'gender', label: '角色性别', required: false, color: 'teal', desc: '当前已填写的性别' },
                { key: 'description', label: '角色描述', required: true, color: 'green', desc: '当前已填写的角色描述' },
                { key: 'personality', label: '角色个性', required: false, color: 'blue', desc: '当前已填写的角色个性' }
            ],
            defaultTemplate: `请根据以下角色设定，为角色生成5个好听、贴切的名字。
请严格按照JSON数组的格式返回，例如：["名字A", "名字B", "名字C", "名字D", "名字E"]。不要包含任何额外的解释或文本。

角色设定:

- 性别: [[gender]]
- 角色描述: [[description]]
- 个性: [[personality]]`
        },
        {
            id: 'batch_generate_greetings',
            category: '🎭 角色卡生成与补全',
            name: '批量生成多风格开场白',
            desc: '一次性生成多条不同氛围与场景的开场白。',
            tokens: [
                { key: 'count', label: '生成条数', required: true, color: 'purple', desc: '下拉框选择的生成数量' },
                { key: 'wordCount', label: '每条字数要求', required: true, color: 'teal', desc: '选择的每条字数区间' },
                { key: 'cardInfoText', label: '角色基础信息', required: true, color: 'green', desc: '角色名、性别、描述、个性、场景' },
                { key: 'worldbookBlock', label: '世界书参考', required: false, color: 'blue', desc: '勾选参考世界书时注入的内容' },
                { key: 'extraSettingsBlock', label: '风格/地点/人物偏好', required: false, color: 'orange', desc: '弹窗中填写的剧情风格、地点、User设定与人物约束' }
            ],
            defaultTemplate: `你是一个专业的角色扮演剧情设计师。请根据以下角色信息，生成[[count]]个不同风格的问候消息（开场白）。

**角色信息：**
[[cardInfoText]]

[[worldbookBlock]][[extraSettingsBlock]]
**生成要求：**
1. 每条问候消息都应该是一个完整的开场场景，篇幅在[[wordCount]]字左右
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
  }
]

不要包含任何解释或Markdown标记，直接返回JSON数组。`
        },
        {
            id: 'translate_card',
            category: '🎭 角色卡生成与补全',
            name: '整卡 / 世界书翻译',
            desc: '将角色卡文本与世界书翻译为目标语言。',
            tokens: [
                { key: 'fromLang', label: '源语言', required: true, color: 'teal', desc: '原始语言名称' },
                { key: 'toLang', label: '目标语言', required: true, color: 'purple', desc: '目标语言名称' },
                { key: 'jsonData', label: '待翻译JSON数据', required: true, color: 'green', desc: '系统打包好的待翻译 JSON 对象' }
            ],
            defaultTemplate: `You are an expert translator. Translate the following JSON object's string values from [[fromLang]] to [[toLang]].
Maintain the original JSON structure and keys. For keys like "tags" or "keys", translate each item in the comma-separated string individually.
For array fields like "alternate_greetings", translate each greeting string and maintain the exact array length and order.
Do not translate special placeholders like {{user}} or {{char}} or "<START>".

Translate this data:
[[jsonData]]`
        },

        // ---------- 分类 2：世界书 AI 创作与维护 ----------
        {
            id: 'wb_entry_content',
            category: '📚 世界书 AI 创作与维护',
            name: '单条世界书「AI 帮我写」',
            desc: '为单个世界书条目撰写详细的注入内容。',
            tokens: [
                { key: 'currentComment', label: '当前条目标题', required: true, color: 'purple', desc: '正在编辑的世界书条目名称/注释' },
                { key: 'currentKeys', label: '当前条目关键词', required: false, color: 'teal', desc: '当前条目的触发关键词' },
                { key: 'charInfoText', label: '角色核心设定', required: true, color: 'green', desc: '角色名、描述、个性' },
                { key: 'worldbookContext', label: '其他世界书参考', required: false, color: 'blue', desc: '勾选参考已有世界书时注入的条目' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '你在弹窗输入的补充要求' }
            ],
            defaultTemplate: `请基于以下提供的角色信息与上下文，为我撰写条目【[[currentComment]]】的"注入内容"。内容需要详细、富有想象力，并与角色设定保持高度一致。

---
**角色核心设定:**
[[charInfoText]]

**世界书上下文:**
- **当前条目标题 (Comment):** [[currentComment]]
- **当前条目主要关键词 (Keys):** [[currentKeys]]

[[worldbookContext]][[userGuidanceBlock]]
---
**你的任务:**
现在，请为条目【[[currentComment]]】生成详细的"注入内容"。`
        },
        {
            id: 'wb_custom_generate',
            category: '📚 世界书 AI 创作与维护',
            name: '自定义生成世界书条目',
            desc: '世界书 AI 弹窗中按自定义需求批量生成条目。',
            tokens: [
                { key: 'userRequest', label: '用户生成要求', required: true, color: 'orange', desc: '你在弹窗中填写的详细生成要求' },
                { key: 'charInfoText', label: '当前角色信息', required: true, color: 'green', desc: '角色名、性别、描述、个性、场景' },
                { key: 'existingEntriesBlock', label: '已有世界书参考', required: false, color: 'blue', desc: '勾选参考已有世界书时注入（防重复）' }
            ],
            defaultTemplate: `你是一个专业的sillytavern世界观构建师和剧情设计师。请根据用户的要求生成世界书条目。

用户要求：
[[userRequest]]

当前角色信息：
[[charInfoText]]
[[existingEntriesBlock]]
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
5. 所有条目默认开启"额外匹配源"功能，使角色卡内容也能触发世界书条目`
        },
        {
            id: 'wb_worldview',
            category: '📚 世界书 AI 创作与维护',
            name: '生成世界观条目',
            desc: '世界书 AI 弹窗点击「世界观」快捷生成。',
            tokens: [
                { key: 'charInfoText', label: '角色设定', required: true, color: 'green', desc: '角色名与角色描述' },
                { key: 'existingEntriesBlock', label: '已有世界书参考', required: false, color: 'blue', desc: '已有条目列表（避免重复）' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '弹窗中追加的额外要求' }
            ],
            defaultTemplate: `你正在构建作品的世界大纲。请分析以下角色设定，为该角色创建3-5个【新的、不重复的】核心【世界观】条目。这些条目应该描述重要的地点、组织、概念或技术。
**角色设定:**
[[charInfoText]]
[[existingEntriesBlock]]
**你的任务:**
**严格按照以下JSON格式返回你的答案，不要包含任何JSON格式之外的额外文字、解释或Markdown标记。**
返回一个JSON数组，其中每个对象代表一个条目，且必须包含以下键:
- "comment": (字符串) 条目注释/标题。
- "keys": (字符串数组) 相关的触发关键词。
- "content": (字符串) 条目的详细内容。
- "priority": (数字) 优先级，越大越重要 (普通=100, 重要=200, 核心=1000)。
- "constant": (布尔值) 是否为恒定注入。对于基础世界观、角色核心设定等应为 true，对于具体事件或地点等应为 false。
[[userGuidanceBlock]]`
        },
        {
            id: 'wb_main_plot',
            category: '📚 世界书 AI 创作与维护',
            name: '生成主线剧情条目',
            desc: '世界书 AI 弹窗点击「主线剧情」快捷生成。',
            tokens: [
                { key: 'charInfoText', label: '角色设定', required: true, color: 'green', desc: '角色名与角色描述' },
                { key: 'existingEntriesBlock', label: '已有世界书参考', required: false, color: 'blue', desc: '已有条目列表（避免重复）' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '弹窗中追加的额外要求' }
            ],
            defaultTemplate: `你正在设计作品的剧情。请分析以下角色设定，为该角色创建一套包含1个主线目标和2-3个步骤的【新的、不重复的】【主线剧情】条目。
**角色设定:**
[[charInfoText]]
[[existingEntriesBlock]]
**你的任务:**
**严格按照以下JSON格式返回你的答案，不要包含任何JSON格式之外的额外文字、解释或Markdown标记。**
返回一个JSON数组，其中每个对象代表一个条目，且必须包含以下键:
- "comment": (字符串) 条目注释/标题。
- "keys": (字符串数组) 相关的触发关键词。
- "content": (字符串) 条目的详细内容。
- "priority": (数字) 优先级，越大越重要 (普通=100, 重要=200, 核心=1000)。
- "constant": (布尔值) 是否为恒定注入。对于基础世界观、角色核心设定等应为 true，对于具体事件或地点等应为 false。
[[userGuidanceBlock]]`
        },
        {
            id: 'wb_ability_system',
            category: '📚 世界书 AI 创作与维护',
            name: '生成独立技能条目',
            desc: '世界书 AI 弹窗点击「技能/能力体系」生成独立技能条目。',
            tokens: [
                { key: 'abilityCount', label: '技能数量', required: true, color: 'purple', desc: '选择的技能方案数量' },
                { key: 'abilityDescription', label: '能力描述与硬性条件', required: true, color: 'orange', desc: '你输入的能力方向与应用场景' },
                { key: 'worldbookHint', label: '世界观约束提示', required: false, color: 'teal', desc: '根据是否勾选世界书自动生成的提示句' },
                { key: 'charInfoText', label: '角色设定', required: true, color: 'green', desc: '角色名与角色描述' },
                { key: 'existingEntriesBlock', label: '已有世界书参考', required: false, color: 'blue', desc: '已有条目列表' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '额外补充指令' }
            ],
            defaultTemplate: `你正在为角色创建【可直接注入世界书的单独技能条目】。
请根据以下信息生成[[abilityCount]]个同类型但机制不同的技能方案。

**用户需求（视为硬性条件，必须全部满足）：**
[[abilityDescription]]

生成要求（必须遵守）：
1. 不要生成“能力体系总览/分类树/流派说明”，只生成【独立技能条目】。
2. 每个技能都要完整满足用户给出的全部硬性条件。
3. 多个结果应为同一方向下的不同实现，避免仅改名或轻微改写。
4. 每个条目的 content 必须使用以下固定格式（逐行）：
技能名称：...
技能效果：...
技能品阶：...
5. comment 字段填写技能名称；keys 至少包含技能名称与2个相关触发词。

[[worldbookHint]]
**角色设定:**
[[charInfoText]]
[[existingEntriesBlock]]
**你的任务:**
**严格按照以下JSON格式返回你的答案，不要包含任何JSON格式之外的额外文字、解释或Markdown标记。**
返回一个JSON数组，其中每个对象代表一个条目，且必须包含以下键:
- "comment": (字符串) 条目注释/标题。
- "keys": (字符串数组) 相关的触发关键词。
- "content": (字符串) 条目的详细内容。
- "priority": (数字) 优先级，越大越重要 (普通=100, 重要=200, 核心=1000)。
- "constant": (布尔值) 是否为恒定注入。
- 对于技能条目，请确保 comment 与 content 内的“技能名称”一致。
- 对于技能条目，禁止输出“能力体系/总览/分支图/培养路线”这类总述。
[[userGuidanceBlock]]`
        },
        {
            id: 'wb_literary_style',
            category: '📚 世界书 AI 创作与维护',
            name: '生成文风配置条目',
            desc: '世界书 AI 弹窗基于参考样本/作家名生成文风条目。',
            tokens: [
                { key: 'literaryStyleReference', label: '文风参考内容', required: true, color: 'orange', desc: '你提供的作家名或原文参考文本' },
                { key: 'charInfoText', label: '角色设定', required: false, color: 'green', desc: '当前角色设定' },
                { key: 'existingEntriesBlock', label: '已有世界书参考', required: false, color: 'blue', desc: '已有条目列表' },
                { key: 'userGuidanceBlock', label: '用户额外指令', required: false, color: 'orange', desc: '额外补充指令' }
            ],
            defaultTemplate: `你是一位精通叙事学、文体学与跨文化文学批评的风格分析专家。请基于用户提供的参考内容，生成结构化的文风配置条目。

**用户提供的参考内容：**
[[literaryStyleReference]]

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

每个维度都应包含具体的原文示例（如果有提供）和可操作的描述。
**角色设定:**
[[charInfoText]]
[[existingEntriesBlock]]
**你的任务:**
**严格按照以下JSON格式返回你的答案，不要包含任何JSON格式之外的额外文字、解释或Markdown标记。**
返回一个JSON数组，其中每个对象代表一个条目，且必须包含以下键:
- "comment": (字符串) 条目注释/标题。
- "keys": (字符串数组) 相关的触发关键词。
- "content": (字符串) 条目的详细内容。
- "priority": (数字) 优先级，越大越重要 (普通=100, 重要=200, 核心=1000)。
- "constant": (布尔值) 是否为恒定注入。
[[userGuidanceBlock]]`
        },
        {
            id: 'wb_ai_sort',
            category: '📚 世界书 AI 创作与维护',
            name: '世界书 AI 智能排序建议',
            desc: '分析世界书条目重要性，自动给出 position / depth / priority / constant 建议。',
            tokens: [
                { key: 'entriesJson', label: '待排序条目JSON', required: true, color: 'green', desc: '当前批次的世界书条目列表 JSON' }
            ],
            defaultTemplate: `你是一个SillyTavern世界书条目排序专家。请分析以下世界书条目，并给出排序和深度位置的建议。

## 第一步：识别作品信息
请先从条目内容中推断：
1. 作品名称/类型（如：游戏、小说、原创等）
2. 主角是谁（通常是{{user}}或与{{user}}关系最密切的角色）
3. 哪些是重要角色（可攻略角色、主要剧情角色、与主角有深厚关系的角色）
4. 哪些是真正的NPC（路人、店员、只出现一次的角色等）

## 注入位置说明
- position=0: 📄 角色卡前 - 很高注意力（在系统指令中）- 适合世界观设定、基础规则
- position=1: 📄 角色卡后 - 中等注意力（在系统指令中）- 适合补充说明、次要设定
- position=4 + role=0: ⭐ 智能插入 - 系统视角（最高注意力）- 适合需要AI高度关注的核心设定
- position=4 + role=1: ⭐ 智能插入 - 用户视角（最高注意力）- 适合用户相关的设定
- position=4 + role=2: ⭐ 智能插入 - AI视角（最高注意力）- 适合角色定义、角色行为指导

## 深度(depth)说明（仅position=4时有效）
- depth=0: 最近消息位置，AI注意力最高
- depth=1-2: 较近位置，高注意力
- depth=3-4: 中等位置，中等注意力
- depth=5+: 较远位置，注意力递减

## 优先级(priority)说明
- 1000: 前置条件级别（最高优先级）
- 200: 重要级别
- 100: 普通级别（默认）
- 低于100: 次要级别

## 恒定注入 vs 关键词触发
- **恒定注入(constant=true)**：始终注入，不需要关键词触发
- **关键词触发(constant=false)**：只有当对话中出现关键词时才注入

## 角色重要性判断标准
### 重要角色（应恒定注入）：
- 主角、玩家角色({{user}})
- 可攻略角色/主要互动对象
- 与主角有深厚关系的角色（儿时玩伴、家人、恋人等）
- 剧情核心角色
- 描述详细、有独特性格/背景的角色

### 次要角色/NPC（应关键词触发）：
- 只在特定场景出现的角色
- 描述简单、没有深入刻画的角色
- 功能性角色（店员、路人等）
- 与主角没有特殊关系的角色

## 条目类型与建议
### 恒定注入类（constant=true）
1. **世界观/背景设定**: position=0, priority=200-300
2. **主角/可攻略角色/重要角色**: position=4, role=2, depth=0-1, priority=200
3. **核心规则/系统**: position=0, priority=300-500

### 关键词触发类（constant=false）
4. **地点/场景**: position=1, priority=100-150
5. **道具/物品**: position=1, priority=100
6. **真正的NPC（路人、功能性角色）**: position=1, priority=100-150
7. **技能/能力**: position=1, priority=100
8. **剧情/事件**: position=1, priority=100-150

## 输出要求
请以JSON数组格式输出建议，只输出需要调整的条目。每个建议包含：
- id: 条目ID
- suggestedPosition: 建议的position值 (0, 1, 或 4)
- suggestedRole: 如果position=4，建议的role值 (0=系统, 1=用户, 2=AI)
- suggestedDepth: 如果position=4，建议的depth值
- suggestedPriority: 建议的优先级值
- suggestedConstant: 建议是否恒定注入 (true/false)
- reason: 简短的调整原因（中文）

只输出JSON数组，不要包含任何其他文字或markdown标记。如果没有需要调整的条目，输出空数组 []

## 当前条目列表
[[entriesJson]]`
        },

        // ---------- 分类 3：小说转世界书 ----------
        {
            id: 'ntw_agent_initial',
            category: '📖 小说转世界书',
            name: '智能 Agent 开篇初始化（第1章）',
            desc: '小说转世界书开启智能 Agent 模式时，处理第 1 块文本的提示词。',
            tokens: [
                { key: 'categorySpecs', label: '启用分类规范', required: true, color: 'teal', desc: '当前勾选的设定分类及字段要求' },
                { key: 'categoryRule', label: '严格/自由分类规则', required: true, color: 'purple', desc: '是否严格限定分类白名单的规则' },
                { key: 'firstCatName', label: '示例分类名', required: false, color: 'blue', desc: '用于 JSON 示例的首个分类名' },
                { key: 'exampleEntryName', label: '示例条目名', required: false, color: 'blue', desc: '用于 JSON 示例的条目名' },
                { key: 'memoryContent', label: '小说开篇正文', required: true, color: 'green', desc: '本次送给 AI 阅读的第 1 块小说原文' }
            ],
            defaultTemplate: `你是专业的小说世界书生成专家，当前正在处理小说的【第1章/开篇部分】。
本次生成将作为整部作品的基础记忆，需要为后续章节的智能 Agent 增量维护奠定优良的结构化基础。

## 🌟 核心规范：Markdown 双星号字段分段标准（至关重要）
为了支持后续章节通过智能 Agent 进行精准的局部追加（如追加经历、替换装备等），**每个条目的“内容”字段必须严格使用 Markdown 双星号标题（\`**字段名**:\`）进行分段描述**！严禁输出没有加粗标题的大段混杂文本！

[[categorySpecs]]
[[categoryRule]]

## 重要要求
1. **只提取文中实际出现的信息**，严禁凭空编造
2. **关键词必须是文中实际出现的词语**，以字符串数组形式提供
3. **内容必须严格采用 \`**字段名**:\` 加粗结构分段**
4. 直接输出标准的 JSON 对象，格式示例：
{
  "[[firstCatName]]": {
    "[[exampleEntryName]]": {
      "关键词": ["[[exampleEntryName]]", "别名"],
      "内容": "**名称**: [[exampleEntryName]]\\n**身份与背景**: 真实身份背景\\n**性格特征**: 具体性格描述"
    }
  }
}
严禁添加任何 Markdown 代码块标记（如 \`\`\`json）或多余的解释文字。

【本次阅读的小说开篇内容】：
---
[[memoryContent]]
---

请直接输出符合上述加粗字段规范的初始世界书 JSON：`
        },
        {
            id: 'ntw_agent_incremental',
            category: '📖 小说转世界书',
            name: '智能 Agent 后续增量维护',
            desc: '小说转世界书智能 Agent 模式处理第 2 块及后续章节的增量补丁指令集。',
            tokens: [
                { key: 'categoryRule', label: '分类约束规则', required: true, color: 'purple', desc: '严格分类白名单或自由分类说明' },
                { key: 'categorySpecs', label: '各分类字段规范', required: true, color: 'teal', desc: '已启用分类的细分字段提取标准' },
                { key: 'lastEnding', label: '上块结尾衔接片段', required: false, color: 'blue', desc: '上一块文本末尾 500 字，供上下文衔接' },
                { key: 'worldbookJson', label: '已有世界书记忆', required: true, color: 'orange', desc: '当前已积累的全部世界书 JSON' },
                { key: 'memoryContent', label: '本次新章节正文', required: true, color: 'green', desc: '本次阅读的最新小说文本' }
            ],
            defaultTemplate: `你现在是小说世界书智能维护 Agent。请仔细分析本次阅读的最新内容，对当前记忆库中的世界书条目发出**精准、非覆盖式的增量编辑指令集（Actions）**。

========================================
【核心原则：严禁覆写失忆】
========================================
1. 已有条目是作品前文积累的历史全貌，绝对禁止使用当前章节的局部描写重写整个条目！
2. 凡是当前章节未提及的信息（如角色过往经历、童年背景、固有习惯等），必须完整保留。
3. 条目内容由 Markdown 双星号标题（**字段名**:）分段管理。
   - 【追加新信息】：使用 append_field 在对应字段后追加新心路、遭遇或行动；若条目尚无该字段，系统会自动在尾部新建该字段。
   - 【状态变迁替换】：若具体某个事实或状态发生改变（如换了装备、地点转移、认知改变），使用 replace 将对应字段内的旧描述精准替换为新描述。
4. 【新增实体】：仅当当前章节登场了前文完全未记录的新角色/新势力/新地点时，使用 add_entry 添加全新条目。
5. 【补充关键词】：使用 add_keywords 为已有条目追加新出现的别名、绰号或称谓。
6. 【严禁全量覆盖】：若条目在本章无实质变化，不要对其做任何操作。严禁输出覆盖式的整篇重写。[[categoryRule]]

========================================
【输出指令集 JSON 格式规范】
========================================
你必须输出标准 JSON 对象，顶层必须且仅包含 "actions" 数组，严禁任何 Markdown 代码块标记（如 \`\`\`json）或前后闲聊：
{
  "actions": [
    {
      "type": "append_field",
      "category": "角色",
      "entryName": "卡尔",
      "fieldName": "性格与背景更新",
      "text": "具体新增经历..."
    },
    {
      "type": "replace",
      "category": "角色",
      "entryName": "卡尔",
      "fieldName": "装备与状态",
      "searchText": "旧描述",
      "replaceText": "新描述"
    },
    {
      "type": "add_entry",
      "category": "角色",
      "entryName": "新角色名",
      "keywords": ["别名1", "别名2"],
      "content": "**名称**: 新角色名\\n**身份**: ...\\n**当前状态**: ..."
    }
  ]
}

支持的指令类型（type）：
- append_field：向指定加粗字段末尾追加新文本
- replace：在指定字段内精准替换旧文本（使用 searchText 与 replaceText）
- add_entry：新增独立条目（使用 keywords 与 content）
- add_keywords：为已有条目追加别名或关键词（使用 keywords 数组）
- delete_field：删除某个过期字段（使用 fieldName）

========================================
【各分类细分字段提取标准】
========================================
[[categorySpecs]]
========================================
【上下文信息】
========================================
【1. 上次阅读结尾片段（供上下文衔接）】：
---
[[lastEnding]]
---

【2. 当前作品已有的世界书记忆（绝对历史事实，严禁覆盖抹除）】：
[[worldbookJson]]

【3. 本次阅读的新章节内容】：
---
[[memoryContent]]
---

========================================
【执行指令：直接输出 actions JSON】
========================================
请仔细分析上方【3. 本次阅读的新章节内容】，严格遵照前文已定义的【输出指令集 JSON 格式规范】，直接输出标准的 actions JSON 对象：`
        },
        {
            id: 'ntw_legacy',
            category: '📖 小说转世界书',
            name: '传统模式提取（非 Agent）',
            desc: '关闭智能 Agent 模式时，使用传统增量/累积方式提取小说世界书。',
            tokens: [
                { key: 'categoryGuide', label: '分类约束规则', required: true, color: 'purple', desc: '分类限制与剧情/文风必选项说明' },
                { key: 'categorySpecs', label: '各分类字段规范', required: true, color: 'teal', desc: '启用分类的字段提取说明' },
                { key: 'jsonTemplate', label: '输出JSON模板', required: true, color: 'blue', desc: '系统生成的标准 JSON 输出示例' },
                { key: 'historyContextBlock', label: '上文与已有记忆', required: false, color: 'orange', desc: '第 2 块及以后自动注入的上文结尾与当前记忆' },
                { key: 'memoryContent', label: '本次阅读正文', required: true, color: 'green', desc: '本次送入的新小说内容' },
                { key: 'modeInstruction', label: '首章/增量/累积规则', required: true, color: 'purple', desc: '根据当前块与开关自动切换的合并指令' }
            ],
            defaultTemplate: `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **关键词必须是文中实际出现的名称**，用逗号分隔
3. **内容必须基于原文描述**，不要添加原文没有的信息
4. **内容使用markdown格式**，可以层层嵌套或使用序号标题[[categoryGuide]]

[[categorySpecs]]
## 📤 输出格式参考模板：
\`\`\`json
[[jsonTemplate]]
\`\`\`

[[historyContextBlock]]这是你现在阅读的部分：
---
[[memoryContent]]
---

[[modeInstruction]]请直接输出JSON格式的结果，不要添加任何代码块标记或解释文字。`
        },
        {
            id: 'ntw_repair_memory',
            category: '📖 小说转世界书',
            name: '失败记忆块修复提取',
            desc: '点击「修复记忆」重新提取失败分块时的提示词。',
            tokens: [
                { key: 'simpleJsonTemplate', label: 'JSON格式模板', required: true, color: 'blue', desc: '精简版世界书 JSON 结构示例' },
                { key: 'currentMemoryBlock', label: '当前已有记忆', required: false, color: 'orange', desc: '已提取的世界书记忆（有则注入）' },
                { key: 'memoryContent', label: '待修复章节正文', required: true, color: 'green', desc: '本次重新提取的原文内容' }
            ],
            defaultTemplate: `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取关键信息，生成世界书条目。

## 输出格式
请生成标准JSON格式：
[[simpleJsonTemplate]]

直接输出更新后的JSON，保持一致性，不要包含代码块标记。
[[currentMemoryBlock]]阅读内容：
---
[[memoryContent]]
---

请基于内容更新世界书，直接输出JSON。`
        },
        {
            id: 'ntw_evolution_summary',
            category: '📖 小说转世界书',
            name: '条目历史演变常态总结',
            desc: '查看世界书历史演变时，将多章节变动汇总为常态描述。',
            tokens: [
                { key: 'evolutionText', label: '条目变更历史', required: true, color: 'green', desc: '该条目在各章节的变更时间线文本' }
            ],
            defaultTemplate: `请根据以下世界书条目的变更历史，总结这个条目（角色/事物/概念）的常态信息。

**重要要求：**
1. 这是为SillyTavern RPG角色卡准备的世界书条目
2. 人物状态应设置为**常态**（活着、正常状态），不能是死亡、受伤等临时状态
3. 提取该条目的核心特征、背景、能力、关系等持久性信息
4. 忽略故事中的临时变化，保留角色/事物的本质特征
5. 输出应该是精炼的、适合作为RPG世界书条目的描述

[[evolutionText]]

请直接输出总结内容，不要包含任何解释或前缀。`
        },
        {
            id: 'ntw_batch_optimize',
            category: '📖 小说转世界书',
            name: 'RPG 世界书批量常态优化',
            desc: '将全书世界书条目批量提炼为 RPG 常态化结构条目。',
            tokens: [
                { key: 'entriesBlock', label: '当前批次条目', required: true, color: 'green', desc: '系统自动传入的本批次条目内容' }
            ],
            defaultTemplate: `你是RPG世界书优化专家。为每个条目生成**常态描述**。

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
[[entriesBlock]]
直接输出JSON。`
        },

        // ---------- 分类 4：小说转剧情卡 ----------
        {
            id: 'ntc_initial_extract',
            category: '🃏 小说转剧情卡',
            name: '剧情卡开篇四层提取（第1块）',
            desc: '小说转剧情卡处理开篇文本，提取卷幕→章节→动态阶段→场景细纲与设定。',
            tokens: [
                { key: 'loreCategoriesSpec', label: '启用设定分类规范', required: true, color: 'teal', desc: '已勾选的设定分类及字段要求' },
                { key: 'catRule', label: '分类约束规则', required: true, color: 'purple', desc: '严格分类或自由补充说明' },
                { key: 'chunkTitle', label: '当前章节标题', required: false, color: 'blue', desc: '当前处理的分块/章节名' },
                { key: 'chunkContent', label: '原著开篇正文', required: true, color: 'green', desc: '第 1 块小说原文内容' }
            ],
            defaultTemplate: `你是顶尖的“小说转 SillyTavern 高还原剧情游戏卡”架构师，正在处理原著的【第 1 块内容（开篇）】。
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
[[loreCategoriesSpec]]

[[catRule]]

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

【本次阅读的原著开篇内容（[[chunkTitle]]）】：
---
[[chunkContent]]
---

请直接输出严格合法的 JSON 对象：`
        },
        {
            id: 'ntc_patch_agent',
            category: '🃏 小说转剧情卡',
            name: '剧情卡 Patch-Agent 增量维护',
            desc: '小说转剧情卡处理后续章节，精准追加场景/章节与设定补丁。',
            tokens: [
                { key: 'chunkNumber', label: '当前块序号', required: false, color: 'blue', desc: '当前正在处理的第 N 块' },
                { key: 'chunkTitle', label: '当前章节标题', required: false, color: 'blue', desc: '当前分块/章节标题' },
                { key: 'catRule', label: '分类约束规则', required: true, color: 'purple', desc: '严格/自由分类说明' },
                { key: 'loreCategoriesSpec', label: '设定分类规范', required: true, color: 'teal', desc: '已启用设定分类字段要求' },
                { key: 'lastEnding', label: '上一块结尾片段', required: false, color: 'blue', desc: '上块末尾 500 字衔接参考' },
                { key: 'plotIndex', label: '已提取章节目录', required: true, color: 'orange', desc: '实时章节与阶段索引' },
                { key: 'loreCompact', label: '已有设定世界书', required: true, color: 'orange', desc: '已积累的设定世界书 JSON' },
                { key: 'chunkContent', label: '本次新原著正文', required: true, color: 'green', desc: '本次送入的新原著内容' }
            ],
            defaultTemplate: `你是专业的小说转剧情卡 **Patch-Agent 实时增量维护专家**，正在处理原著第 [[chunkNumber]] 块内容（[[chunkTitle]]）。
请仔细阅读新文本，向系统发出**精准、非覆盖式的增量补丁指令集（actions）**！

========================================
【核心铁律】
========================================
1. ★ **每次 Chunk 必须更新剧情（强制）** ★：
   - 你的 \`actions\` 数组中**必须包含至少一条剧情类指令**（\`add_chapter\` / \`add_phase\` / \`append_scene\` / \`update_chapter_overview\`）！
   - 判断衔接关系：
     * 如果本块内容是**上一章的延续**，请对已有章节使用 \`append_scene\` 或 \`add_phase\`，并用 \`update_chapter_overview\` 补充更新本章总览梗概与阶段顺序。
     * 如果本块内容**进入了原著的新章节/新卷幕**，请使用 \`add_chapter\` 创建新章（编号顺延，如 \`A1_C2\` 或进入新卷 \`A2_C1\`），并在其中给出完整的 \`overview\` 和动态 \`phases\` + 详尽 \`scenes\`。
     * 若单块内跨越多个原著章节，可连续发出多条 \`add_chapter\` 指令。
   - **场景复述（recap）与原话保留（硬性要求）**：每个场景的 \`recap\` 必须详尽还原剧情细节、核心情绪转折与伏笔，绝不简略敷衍；**凡包含人物对话的场景，必须保留原著关键原话**（用「」或双引号原样摘录标志性口癖、名台词及重要反应）。
   - ⚠️ **过滤非正篇杂质**：若本块内容仅为作者后记、创作感言、致谢、版权信息等非故事正文，直接输出 \`{"actions": []}\` 即可。
2. **设定世界书严禁覆写失忆**：
   - 追加角色新经历/新能力/新关系变化：使用 \`append_lore_field\`。
   - 具体事实状态变迁：使用 \`replace_lore_text\` 局部替换。
   - 新登场未记录实体：使用 \`add_lore\`（内容必须严格使用 \`**字段名**:\` 分段）。
   - 出现新称呼/别名：使用 \`add_lore_keywords\`。
   - [[catRule]]

========================================
【已启用设定分类规范参考】
========================================
[[loreCategoriesSpec]]

========================================
【当前上下文】
========================================
【1. 上一块结尾片段（衔接用）】：
---
[[lastEnding]]
---

【2. 当前已提取的剧情章节索引（实时目录）】：
[[plotIndex]]

【3. 当前已有的设定世界书（严禁覆写抹除）】：
[[loreCompact]]

【4. 本次阅读的新原著内容（[[chunkTitle]]）】：
---
[[chunkContent]]
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
      "scene": { "sceneName": "04-新场景名", "location": "地点", "characters": ["角色A"], "recap": "详尽的场景复述与关键对话..." }
    },
    {
      "type": "add_phase",
      "chapterId": "A1_C1",
      "phase": { "name": "冲突爆发", "summary": "本阶段概述...", "scenes": [{ "sceneName": "01-冲突起点", "location": "地点", "characters": ["角色A"], "recap": "详尽复述..." }] }
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
        "id": "A1_C2", "act": 1, "chapter": 2, "title": "第二章标题",
        "overview": { "meta": { "核心事件": "..." }, "phaseOrder": ["阶段1"], "summary": "本章梗概...", "transitionCondition": "过渡条件..." },
        "phases": [{ "name": "阶段1", "summary": "阶段概述...", "scenes": [{ "sceneName": "01-开场", "location": "地点", "characters": ["角色A"], "recap": "详尽复述..." }] }]
      }
    },
    { "type": "append_lore_field", "category": "角色详情", "entryName": "角色全名", "fieldName": "重要事件", "text": "本章发生的新经历..." },
    { "type": "replace_lore_text", "category": "角色详情", "entryName": "角色全名", "fieldName": "外貌与服装", "searchText": "旧描述", "replaceText": "新描述" },
    { "type": "add_lore", "category": "角色详情", "entryName": "新角色名", "keywords": ["新角色名", "别名"], "content": "**名称**: 新角色名\\n**核心性格**: ..." },
    { "type": "add_lore_keywords", "category": "角色详情", "entryName": "角色全名", "keywords": ["新绰号"] }
  ]
}

请直接输出包含 "actions" 数组的合法 JSON：`
        },
        {
            id: 'ntc_user_setting',
            category: '🃏 小说转剧情卡',
            name: '剧情卡 AI 定制 <user> 身份',
            desc: '步骤 2 参考全书设定与总览，生成无缝融入舞台的玩家身份设定。',
            tokens: [
                { key: 'modeDesc', label: '定位模式说明', required: true, color: 'purple', desc: '同行者/主角视角/知情者/自定义模式描述' },
                { key: 'userCustomHintBlock', label: '用户额外偏好', required: false, color: 'orange', desc: '你在输入框填写的自定义身份偏好' },
                { key: 'bookTitle', label: '作品名称', required: false, color: 'teal', desc: '当前小说作品名' },
                { key: 'fullLoreSummary', label: '全书设定世界书', required: true, color: 'green', desc: '全书世界观、角色一览与角色详情' },
                { key: 'overviewsBlock', label: '全书各章总览', required: false, color: 'blue', desc: '勾选参考全书总览时自动注入的章节脉络' }
            ],
            defaultTemplate: `你是顶尖的互动剧情游戏卡架构师。请充分阅读以下原著的全部设定世界书，为玩家角色 \`<user>\` 设计一份**具体、立体、能无缝融入并贯穿整部作品多个舞台**的 \`User设定\`。

========================================
【核心设计目标（极其重要，杜绝“陌生人尬聊”和“换章掉线”）】
========================================
1. **必须给出具体落地的身份与物理锚点**：明确说明 \`<user>\` 在这个世界里的合理社会/日常身份、常规活动地点，绝不能写“一个神秘的同行者”这种空话！
2. **必须建立与核心角色的既有关系锚点**：明确至少 1～3 位原著核心人物开局就认识 \`<user>\`（或有直接顺理成章的相识契机与初始态度），确保一开场就能自然对话推进剧情，绝对避免“门外陌生人尬聊”！
3. **贯穿全书舞台的合理性**：结合全书核心矛盾与主要舞台，确保这个身份能自然跟进后续多章剧情，不会演完序章或第一章就掉线。
4. **防剧透边界**：如果设计了与原著主线暗线挂钩的隐藏定位，必须标注“前期仅作为暗线背景，严禁提前剧透”。
5. **严禁替 <user> 写死外貌性别姓名**（统一用 \`<user>\` 指代，留给玩家扮演空间），且严禁凭空捏造破坏原著世界观上限的外挂。

【定位模式】：[[modeDesc]]
[[userCustomHintBlock]]【作品名称】：[[bookTitle]]

【一、全书设定世界书】：
[[fullLoreSummary]][[overviewsBlock]]

请直接输出结构清晰的 YAML/分层文本格式 \`User设定\`（包含：基本档案/身份与常驻位置、与核心角色的既有关系锚点、主线融入与互动定位、可选隐藏暗线与防剧透说明），不要输出代码块标记或多余解释：`
        },
        {
            id: 'ntc_first_mes',
            category: '🃏 小说转剧情卡',
            name: '剧情卡 AI 生成开场白',
            desc: '步骤 2 结合所选起始章节与 User 设定生成沉浸式开场白。',
            tokens: [
                { key: 'bookTitle', label: '作品名称', required: false, color: 'teal', desc: '当前作品名' },
                { key: 'greetingLabel', label: '开场白标签', required: false, color: 'blue', desc: '如主开场白 / 备选开场' },
                { key: 'startChapterInfo', label: '开局起始章节', required: true, color: 'purple', desc: '起始章 ID 与标题' },
                { key: 'customHintBlock', label: '本开场额外指引', required: false, color: 'orange', desc: '你填写的本条开场额外指引' },
                { key: 'userSetting', label: '已定制的User设定', required: true, color: 'orange', desc: '玩家角色身份与人物关系锚点' },
                { key: 'charRefs', label: '登场角色人设', required: false, color: 'blue', desc: '勾选章节中出场的主要角色详情' },
                { key: 'refPlotText', label: '勾选的参考章节内容', required: true, color: 'green', desc: '勾选章节的总览与场景细纲' }
            ],
            defaultTemplate: `你是顶尖的互动视觉小说与 SillyTavern 角色卡编剧。请根据【已定制的 <user> 身份设定】与【用户勾选的参考章节】，为本作撰写一段极具沉浸感、节奏流畅、**绝不卡死在原地**的开场白（700～1300字，中文）。

========================================
【开场白核心铁律（必须严格遵守）】
========================================
1. **严格锚定起始章节的真实时空与行动现场**：
   - 本开场白对应的**开局起始章节**为：【[[startChapterInfo]]】。
   - 如果参考章节里包含了纯背景介绍/静态回忆（如序章心理独白），只需用 1～2 段简短氛围带过，**必须立刻落脚到起始章节中第一个有具体地点、在场人物与实质事件推动的行动场景**！
   - **严禁自作聪明编造大纲里根本不存在且与后续时空脱节的原创桥段**。
2. **明确交代 <user> 的具体身份、物理位置与人际自然连接**：
   - 严格依照下方【<user> 身份设定】，在开场白里自然点明 \`<user>\` 当下身在何处、与在场角色是什么关系，确保角色对 \`<user>\` 的反应合情合理。
3. **动态流动的收尾节点（防拖沓防卡死）**：
   - 结尾必须停在一个**正在向前流动的真实事件/对话节点**上——既给 \`<user>\` 留出清晰的回应与介入空间，也保证即使玩家只回复“继续”，在场原著角色也能顺着事件流直接往下推。
4. **严禁代替 <user> 发言、做决定或抢夺主动权**。
5. 直接输出开场白正文，不要输出任何标题包装或多余解释。

【作品名称】：[[bookTitle]]
【开场白标签】：[[greetingLabel]]
【指定开局起始章节】：[[startChapterInfo]]
[[customHintBlock]]【已定制的 <user> 身份设定】：
[[userSetting]]

【登场角色人设参考】：
[[charRefs]]

【用户勾选的参考章节内容】：
[[refPlotText]]`
        },

        // ---------- 分类 5：正则 / 小白X / 美化 / 全局修改 ----------
        {
            id: 'regex_generate',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 生成正则脚本',
            desc: '正则编辑器中根据自然语言描述生成正则查找与替换规则。',
            tokens: [
                { key: 'userGuidance', label: '用户效果描述', required: true, color: 'orange', desc: '你描述的正则匹配与替换需求' }
            ],
            defaultTemplate: `你是一个正则表达式生成助手。根据用户的描述，生成对应的正则表达式脚本。

用户描述：[[userGuidance]]

请严格按照以下JSON格式返回，不要包含任何额外文字或Markdown标记：
{
    "scriptName": "脚本名称（简短描述用途，例如：粗体转HTML标签）",
    "findRegex": "要查找的正则表达式",
    "replaceString": "替换的字符串（使用$1、$2等引用捕获组）",
    "affectsPrompt": true或false
}

判断标准：
- affectsPrompt = true：该正则替换会改变AI实际看到或生成的内容，影响AI的行为或回复（例如：过滤敏感词、修改AI拒绝回复、替换角色名字等）
- affectsPrompt = false：该正则替换仅为美化/格式调整，不影响AI实际看到的内容含义（例如：将**加粗**转换为<strong>标签、调整标点符号格式、添加颜色样式等）

请确保：
1. findRegex 是合法有效的正则表达式
2. 正确转义特殊字符
3. 使用适当的捕获组
4. replaceString 正确引用捕获组`
        },
        {
            id: 'regex_test_input',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 生成正则测试文本',
            desc: '点击「AI 帮测」自动生成用于验证正则效果的测试样本。',
            tokens: [
                { key: 'findRegex', label: '查找正则', required: true, color: 'purple', desc: '当前正则脚本的查找表达式' },
                { key: 'replaceString', label: '替换为文本', required: false, color: 'teal', desc: '当前正则脚本的替换模板' }
            ],
            defaultTemplate: `你是一个正则表达式测试助手。请根据以下正则脚本，生成一段合适的测试文本。

查找正则: [[findRegex]]
替换为: [[replaceString]]

要求：
1. 测试文本应该包含能够被该正则匹配的内容
2. 也要包含不会被匹配的内容，以验证选择性
3. 文本要自然、通顺，像是真实的对话或文章片段
4. 直接返回测试文本本身，不要包含任何额外解释或Markdown标记`
        },
        {
            id: 'regex_verify_init',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 帮填并验证正则（首次生成）',
            desc: '自动生成正则 + 测试样本并进行闭环验证的首轮提示词。',
            tokens: [
                { key: 'userGuidance', label: '用户效果描述', required: true, color: 'orange', desc: '你希望正则实现的效果' }
            ],
            defaultTemplate: `你是一个正则表达式生成助手。根据用户的描述，生成对应的正则表达式脚本。

用户描述：[[userGuidance]]

请严格按照以下JSON格式返回，不要包含任何额外文字或Markdown标记：
{
    "scriptName": "脚本名称（简短描述用途，例如：粗体转HTML标签）",
    "findRegex": "要查找的正则表达式",
    "replaceString": "替换的字符串（使用$1、$2等引用捕获组）",
    "affectsPrompt": true或false,
    "testInput": "一段用于验证的测试文本，必须包含能匹配到的内容"
}

判断标准：
- affectsPrompt = true：该正则替换会改变AI实际看到或生成的内容
- affectsPrompt = false：该正则替换仅为美化/格式调整

请确保：
1. findRegex 是合法有效的正则表达式
2. 正确转义特殊字符
3. 使用适当的捕获组
4. replaceString 正确引用捕获组
5. testInput 是能验证该正则的测试文本`
        },
        {
            id: 'regex_verify_retry',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 帮填并验证正则（失败重试）',
            desc: '正则未通过验证时自动修正重试的提示词。',
            tokens: [
                { key: 'userGuidance', label: '用户效果描述', required: true, color: 'orange', desc: '原始用户需求' },
                { key: 'findRegex', label: '上次生成的查找正则', required: true, color: 'purple', desc: '验证失败的查找表达式' },
                { key: 'replaceString', label: '上次生成的替换文本', required: false, color: 'teal', desc: '验证失败的替换文本' }
            ],
            defaultTemplate: `我正在尝试生成一个正则表达式，但之前的版本没有通过验证。

用户需求：[[userGuidance]]

上一次生成的正则：
- findRegex: [[findRegex]]
- replaceString: [[replaceString]]

验证时使用的测试输入和预期不匹配。

请重新生成，严格按照以下JSON格式返回：
{
    "scriptName": "...（简短描述用途）",
    "findRegex": "...",
    "replaceString": "...",
    "affectsPrompt": true/false,
    "testInput": "用于验证的测试文本，必须包含能匹配到的内容"
}

请确保正则表达式能正确处理testInput中的内容，满足用户的需求。`
        },
        {
            id: 'xiaobaix_task_gen',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 生成小白X 循环任务脚本',
            desc: '根据角色设定和需求生成 SillyTavern 小白X <<taskjs>> 代码。',
            tokens: [
                { key: 'charInfoText', label: '角色信息', required: true, color: 'green', desc: '角色名、描述、个性、场景' },
                { key: 'userGuidance', label: '用户任务需求', required: true, color: 'orange', desc: '你需要脚本实现的功能描述' }
            ],
            defaultTemplate: `你是一个SillyTavern小白X插件的任务脚本编写专家。请根据角色设定和用户需求，生成小白X循环任务的 <<taskjs>> 代码。

**角色信息:**
[[charInfoText]]

**用户需求:** [[userGuidance]]

**STscript 可用命令参考:**
- /setvar key=变量名 值 - 设置本地变量
- /getvar key=变量名 - 获取本地变量
- /addvar key=变量名 值 - 给变量追加/累加
- /setglobalvar key=变量名 值 - 设置全局变量
- /getglobalvar key=变量名 - 获取全局变量
- /incvar 变量名 - 变量加1
- /decvar 变量名 - 变量减1
- /flushvar 变量名 - 删除变量
- /listvar - 列出所有变量
- /echo 内容 - 输出内容
- 支持的数据类型: STRING, NUMBER, BOOLEAN, LIST [], DICTIONARY {}

**变量管理2.0 (LWB_StateV2):**
- await LWB_StateV2.applyText(\`<state>\\n$schema 数据\\n  字段: ""\\n数据:\\n  字段: "值"\\n</state>\`, { silent: true });

**要求:**
1. 代码必须包裹在 <<taskjs>>...<</taskjs>> 中
2. 使用 await STscript() 调用酒馆命令
3. 如果需要变量管理2.0系统，使用 await LWB_StateV2.applyText()
4. 返回纯净的代码，不要Markdown代码块标记，不要额外解释`
        },
        {
            id: 'global_edit',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 全局批量修改',
            desc: '按指令同时批量修改选中的角色字段与世界书条目。',
            tokens: [
                { key: 'instruction', label: '用户修改指令', required: true, color: 'orange', desc: '你在全局修改框中输入的修改指令' },
                { key: 'entriesText', label: '选中的待修改内容', required: true, color: 'green', desc: '勾选的角色字段与世界书条目内容' }
            ],
            defaultTemplate: `请根据用户的指令修改以下内容。

用户指令：[[instruction]]

需要修改的内容：

重要提示：
- 如果用户要求删除、移除、去除某个条目或内容，请将该条目的content设置为空字符串""或null
- 如果用户要求删除重复内容，请将重复的条目content设为空字符串
- 如果某些条目不需要保留，将其content设为空值即可
- 系统会自动过滤并删除所有content为空的条目
- [世界书条目]下非无，则同类型参考[世界书条目]下的格式生成

[[entriesText]]请按照用户指令修改上述内容，并以JSON格式返回修改结果。格式如下：
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

注意：如果需要删除某个条目，请将其content设为空字符串""或null，系统会自动删除。`
        },
        {
            id: 'beautify_style_custom',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 美化样式生成（有自定义要求）',
            desc: '美化器填写了核心要求时，生成多套完整 HTML/CSS 样式。',
            tokens: [
                { key: 'requirements', label: '用户核心要求', required: true, color: 'orange', desc: '你填写的样式设计要求' },
                { key: 'count', label: '生成数量', required: true, color: 'purple', desc: '需要生成的样式套数' },
                { key: 'linesText', label: '行数限制', required: false, color: 'teal', desc: '如“不超过100行”或“行数不限制”' },
                { key: 'characterInfoBlock', label: '角色信息', required: true, color: 'green', desc: '当前角色卡的名称/描述/性格/场景等' }
            ],
            defaultTemplate: `**核心要求: [[requirements]]**

请生成[[count]]个不同风格的HTML样式，严格按照用户的核心要求来设计。要求：
1. 每个HTML代码[[linesText]]
2. 必须严格按照用户的核心要求来设计样式和布局
3. 每个样式有不同的设计风格（最好根据角色特点加一些样式）
4. 必须是完整可运行的HTML代码
5. 如果用户要求信封样式，就生成信封样式；如果要求卡片样式，就生成卡片样式；如果要求聊天气泡，就生成聊天气泡样式

**重要：请根据以下角色信息来定制生成的样式和内容：**

**角色信息:**
[[characterInfoBlock]]`
        },
        {
            id: 'beautify_style_default',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 美化样式生成（默认状态栏+对话）',
            desc: '美化器未填写要求时，自动结合角色风格生成状态栏与对话样式。',
            tokens: [
                { key: 'count', label: '生成数量', required: true, color: 'purple', desc: '需要生成的样式套数' },
                { key: 'linesText', label: '行数限制', required: false, color: 'teal', desc: '行数约束文本' },
                { key: 'characterInfoBlock', label: '角色信息', required: true, color: 'green', desc: '当前角色卡信息' }
            ],
            defaultTemplate: `请生成[[count]]个不同风格的HTML样式，可以是对话样式、卡片样式、信封样式、聊天气泡等多种类型。要求：
1. 每个HTML代码[[linesText]]
2. 每个样式采用不同的设计类型和风格
3. 每个样式有不同的设计风格（最好根据角色特点加一些样式）
4. 必须是完整可运行的HTML代码

**重要：请根据以下角色信息来定制生成的样式和内容：**

请根据这些角色信息来：
1. 选择符合角色风格的配色方案和视觉设计
2. 在状态栏中显示与角色相关的信息（如角色状态、场景、好感度等）
3. 生成符合角色性格和设定的对话内容
4. 确保整体风格与角色的主题和个性相匹配

参考示例（请参考这个结构和样式风格）：
\`\`\`html
<!DOCTYPE html>
<html>
<head>
<style>
body {background:#f5f1e6;color:#3a342c;font-family:sans-serif;margin:20px}
.status-bar {background:#d7c9aa;padding:10px;border-radius:5px;margin-bottom:15px}
.dialogue {background:#fff;padding:15px;border-radius:8px;border-left:4px solid #9d7463}
.character {color:#7e5e4f;font-weight:bold}
</style>
</head>
<body>
<div class="status-bar"><strong>场景:</strong> 咖啡厅 · 傍晚<br><strong>好感度:</strong> 23</div>
<div class="dialogue"><p><span class="character">角色</span>: （动作描写）示例对话内容。</p></div>
</body>
</html>
\`\`\`

请基于以上示例的结构，生成包含状态栏(.status-bar)和对话内容(.dialogue)的完整HTML页面。**请确保生成的内容与提供的角色信息高度匹配，体现角色的独特风格和特色。**
[[characterInfoBlock]]`
        },
        {
            id: 'beautify_modify',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 修改美化 HTML/CSS 代码',
            desc: '在美化结果卡片里点击「AI 修改代码」时使用的提示词。',
            tokens: [
                { key: 'modifyRequest', label: '修改要求', required: true, color: 'orange', desc: '你输入的样式优化需求' },
                { key: 'code', label: '现有HTML/CSS代码', required: true, color: 'green', desc: '当前待修改的完整样式代码' }
            ],
            defaultTemplate: `请基于以下HTML/CSS代码，按照用户要求进行修改和优化：[[modifyRequest]]。

重要要求：
1. 保持代码的核心功能不变
2. 优化代码结构和样式
3. 直接输出修改后的完整代码
4. 不要添加任何标题、前缀、后缀或说明文字
5. 只返回纯净的HTML/CSS代码，无需任何解释

现有代码：
[[code]]

请直接输出修改后的代码：`
        },
        {
            id: 'instruction_optimize',
            category: '🛠️ 正则 · 小白X · 美化 · 全局修改',
            name: 'AI 优化附加指令内容',
            desc: '在指令库编辑器中点击「AI 优化指令」时的提示词。',
            tokens: [
                { key: 'request', label: '优化要求', required: true, color: 'orange', desc: '你输入的指令修改方向' },
                { key: 'currentContent', label: '现有指令原文', required: true, color: 'green', desc: '当前编辑中的指令内容' }
            ],
            defaultTemplate: `请基于以下现有指令内容，按照用户要求进行优化和修改：[[request]]。

重要要求：
1. 保持指令的核心功能不变
2. 优化表达方式和逻辑结构
3. 直接输出优化后的完整指令内容
4. 不要添加任何标题、前缀、后缀或说明文字
5. 不要包含"优化后的"、"改写说明"等格式化内容
6. 只返回纯净的指令文本，无需任何解释

现有指令：
[[currentContent]]

请直接输出优化后的指令内容：`
        },

        // ---------- 分类 6：底层与智能助手 ----------
        {
            id: 'json_repair',
            category: '🤖 底层修复与智能助手',
            name: 'JSON 解析失败自动修复专家',
            desc: '小说转世界书遇到 AI 输出残缺/错误 JSON 时的自动修复提示词。',
            tokens: [
                { key: 'brokenJson', label: '待修复的错误JSON', required: true, color: 'green', desc: 'AI 上一次返回但无法解析的原始文本' }
            ],
            defaultTemplate: `你是专业的JSON修复专家。请将下面“格式错误的JSON文本”修复为严格有效、可被 JavaScript 的 JSON.parse() 直接解析的JSON。

【严格要求】
1. 仅输出修复后的纯JSON，严禁输出任何解释、说明或 Markdown 代码块标记（如 \`\`\`json）。
2. 最大限度保留原文中的所有字段、中文内容、换行和结构，不要删除已有信息。
3. 修复缺失的引号、逗号、括号闭合，正确转义字符串内部的引号与换行符。

【待修复文本】：
[[brokenJson]]`
        },
        {
            id: 'agent_extra_persona',
            category: '🤖 底层修复与智能助手',
            name: '侧边栏 AI 智能助手补充设定',
            desc: '追加到编辑器右下角 AI 智能助手系统提示词中的自定义风格与工作规范。',
            tokens: [],
            defaultTemplate: `你是妮卡角色工作室的智能助手，帮助用户创建和修改SillyTavern角色卡（chara_card_v3格式）。
请用清晰、专业的中文回复，动手大幅改写前先简要确认意图，优先使用精准局部工具避免破坏用户原有设定。`
        }
    ];

    const REGISTRY_MAP = new Map(PROMPT_REGISTRY.map(item => [item.id, item]));

    // ==================== 2. 存储与模板渲染引擎 ====================
    let customPromptsCache = null;

    function loadCustomMap() {
        if (customPromptsCache) return customPromptsCache;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            customPromptsCache = (parsed && typeof parsed === 'object') ? parsed : {};
        } catch {
            customPromptsCache = {};
        }
        return customPromptsCache;
    }

    function saveCustomMap(map) {
        customPromptsCache = map;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        } catch (e) {
            console.error('[PromptManager] 保存自定义提示词失败:', e);
        }
    }

    function getTemplate(id) {
        const meta = REGISTRY_MAP.get(id);
        if (!meta) return '';
        const map = loadCustomMap();
        if (typeof map[id] === 'string' && map[id].trim() !== '') {
            return map[id];
        }
        return meta.defaultTemplate;
    }

    function isCustomized(id) {
        const map = loadCustomMap();
        return typeof map[id] === 'string' && map[id].trim() !== '';
    }

    function render(id, vars = {}) {
        const tpl = getTemplate(id);
        if (!tpl) return '';
        return tpl.replace(/\[\[([a-zA-Z0-9_]+)\]\]/g, (match, key) => {
            if (Object.prototype.hasOwnProperty.call(vars, key)) {
                return vars[key] === undefined || vars[key] === null ? '' : String(vars[key]);
            }
            return '';
        });
    }

    function getMissingRequiredTokens(id, templateText) {
        const meta = REGISTRY_MAP.get(id);
        if (!meta || !Array.isArray(meta.tokens)) return [];
        return meta.tokens.filter(tk => tk.required && !templateText.includes(`[[${tk.key}]]`));
    }

    // ==================== 3. 富文本色块编辑器（核心交互） ====================
    let currentPromptId = PROMPT_REGISTRY[0]?.id || '';
    let searchKeyword = '';
    let savedSelectionRange = null;

    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildChipHtml(tokenMeta) {
        const color = tokenMeta.color || 'blue';
        const reqBadge = tokenMeta.required ? '<span class="pm-chip-star">*</span>' : '';
        const titleTip = `${tokenMeta.label}${tokenMeta.required ? '（必填）' : '（可选）'}：${tokenMeta.desc || ''}`;
        return `<span class="pm-chip pm-color-${color}${tokenMeta.required ? ' is-required' : ''}" contenteditable="false" data-token="${escHtml(tokenMeta.key)}" title="${escHtml(titleTip)}"><span class="pm-chip-dot"></span>${escHtml(tokenMeta.label)}${reqBadge}</span>`;
    }

    // 把纯文本模板（含 [[key]]）渲染到 contenteditable 富文本容器（色块 + 中文）
    function templateToEditorHtml(id, templateText) {
        const meta = REGISTRY_MAP.get(id);
        const tokenMap = new Map((meta?.tokens || []).map(t => [t.key, t]));
        const normalized = String(templateText || '').replace(/\r\n/g, '\n');

        let html = '';
        let lastIdx = 0;
        const re = /\[\[([a-zA-Z0-9_]+)\]\]/g;
        let m;
        while ((m = re.exec(normalized)) !== null) {
            const plain = normalized.slice(lastIdx, m.index);
            if (plain) html += escHtml(plain).replace(/\n/g, '<br>');
            const key = m[1];
            const tk = tokenMap.get(key);
            if (tk) {
                html += buildChipHtml(tk);
            } else {
                html += escHtml(m[0]);
            }
            lastIdx = m.index + m[0].length;
        }
        const tail = normalized.slice(lastIdx);
        if (tail) html += escHtml(tail).replace(/\n/g, '<br>');
        return html;
    }

    // 把 contenteditable 富文本容器反序列化回纯文本模板（色块 → [[key]]）
    function editorDomToTemplate(editorEl) {
        if (!editorEl) return '';
        let out = '';

        function walk(node, isRoot = false) {
            if (node.nodeType === Node.TEXT_NODE) {
                // 过滤零宽空格
                out += node.nodeValue.replace(/\u200B/g, '');
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toUpperCase();
            if (node.classList && node.classList.contains('pm-chip') && node.dataset.token) {
                out += `[[${node.dataset.token}]]`;
                return;
            }
            if (tag === 'BR') {
                out += '\n';
                return;
            }

            const isBlock = !isRoot && (tag === 'DIV' || tag === 'P' || tag === 'LI');
            if (isBlock && out.length > 0 && !out.endsWith('\n')) {
                out += '\n';
            }
            for (const child of node.childNodes) {
                walk(child, false);
            }
            if (isBlock && !out.endsWith('\n')) {
                out += '\n';
            }
        }

        walk(editorEl, true);
        // 移除浏览器在 contenteditable 末尾可能自动补的单个多余尾换行
        return out.replace(/\n$/, '');
    }

    function captureSelection() {
        const editor = document.getElementById('pm-rich-editor');
        if (!editor) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) {
            savedSelectionRange = range.cloneRange();
        }
    }

    function insertTokenAtCursor(tokenKey) {
        const meta = REGISTRY_MAP.get(currentPromptId);
        const editor = document.getElementById('pm-rich-editor');
        if (!meta || !editor) return;
        const tk = (meta.tokens || []).find(t => t.key === tokenKey);
        if (!tk) return;

        editor.focus();
        const sel = window.getSelection();
        let range;
        if (savedSelectionRange && editor.contains(savedSelectionRange.commonAncestorContainer)) {
            range = savedSelectionRange.cloneRange();
        } else if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
            range = sel.getRangeAt(0).cloneRange();
        } else {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
        }

        // 若光标不小心落在色块内部，移至其后
        let container = range.startContainer;
        const insideChip = container.nodeType === Node.ELEMENT_NODE
            ? container.closest?.('.pm-chip')
            : container.parentElement?.closest?.('.pm-chip');
        if (insideChip) {
            range.setStartAfter(insideChip);
            range.collapse(true);
        }

        range.deleteContents();
        const temp = document.createElement('span');
        temp.innerHTML = buildChipHtml(tk);
        const chipEl = temp.firstElementChild;
        const spacer = document.createTextNode('\u200B');

        range.insertNode(spacer);
        range.insertNode(chipEl);

        // 把光标移动到新插入色块后面的零宽字符后，方便继续打字
        const newRange = document.createRange();
        newRange.setStartAfter(spacer);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();

        refreshTokenPanelStatus();
    }

    function refreshTokenPanelStatus() {
        const meta = REGISTRY_MAP.get(currentPromptId);
        const editor = document.getElementById('pm-rich-editor');
        const warnBar = document.getElementById('pm-missing-warn');
        if (!meta || !editor) return;

        const currentTpl = editorDomToTemplate(editor);
        const tokens = meta.tokens || [];

        tokens.forEach(tk => {
            const btn = document.querySelector(`#pm-token-list .pm-token-btn[data-token="${tk.key}"]`);
            if (!btn) return;
            const present = currentTpl.includes(`[[${tk.key}]]`);
            btn.classList.toggle('is-present', present);
            btn.classList.toggle('is-missing-req', tk.required && !present);
            const stateEl = btn.querySelector('.pm-token-state');
            if (stateEl) {
                if (tk.required) {
                    stateEl.textContent = present ? '✓ 已插入' : '⚠️ 必填缺失';
                } else {
                    stateEl.textContent = present ? '✓ 已插入' : '+ 点击插入';
                }
            }
        });

        const missing = getMissingRequiredTokens(currentPromptId, currentTpl);
        const isEn = () => (typeof currentLanguage !== 'undefined' ? currentLanguage : localStorage.getItem('language')) === 'en';
        if (warnBar) {
            if (missing.length > 0) {
                warnBar.style.display = 'flex';
                const names = missing.map(m => isEn() ? `"${m.label}"` : `「${m.label}」`).join(isEn() ? ', ' : '、');
                warnBar.querySelector('.pm-warn-text').textContent = isEn()
                    ? `Missing required placeholder(s): ${names} (click on the right or use the button to restore)`
                    : `缺少必填色块：${names}（点击右侧色块或右侧一键补回）`;
            } else {
                warnBar.style.display = 'none';
            }
        }
    }

    function insertAllMissingRequired() {
        const editor = document.getElementById('pm-rich-editor');
        if (!editor) return;
        const currentTpl = editorDomToTemplate(editor);
        const missing = getMissingRequiredTokens(currentPromptId, currentTpl);
        if (!missing.length) return;

        // 定位到末尾补回缺失的必填色块
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        savedSelectionRange = range.cloneRange();

        missing.forEach(tk => {
            const br = document.createElement('br');
            editor.appendChild(br);
            const endRange = document.createRange();
            endRange.selectNodeContents(editor);
            endRange.collapse(false);
            savedSelectionRange = endRange;
            insertTokenAtCursor(tk.key);
        });
    }

    // ==================== 4. 弹窗渲染与管理操作 ====================
    const pmIsEn = () => (typeof currentLanguage !== 'undefined' ? currentLanguage : localStorage.getItem('language')) === 'en';

    function renderSidebar() {
        const listEl = document.getElementById('pm-sidebar-list');
        if (!listEl) return;
        const en = pmIsEn();

        const kw = searchKeyword.trim().toLowerCase();
        const groups = new Map();
        PROMPT_REGISTRY.forEach(item => {
            if (kw) {
                const hay = `${item.name} ${item.category} ${item.desc}`.toLowerCase();
                if (!hay.includes(kw)) return;
            }
            if (!groups.has(item.category)) groups.set(item.category, []);
            groups.get(item.category).push(item);
        });

        if (groups.size === 0) {
            listEl.innerHTML = `<div style="color:#888;font-size:12.5px;padding:16px;text-align:center;">${en ? 'No matching prompts' : '没有匹配的提示词'}</div>`;
            return;
        }

        let html = '';
        groups.forEach((items, cat) => {
            const customCnt = items.filter(i => isCustomized(i.id)).length;
            const badge = customCnt > 0 ? `<span class="pm-cat-badge">${en ? `${customCnt} edited` : `${customCnt}已改`}</span>` : '';
            html += `<div class="pm-cat-group">
                <div class="pm-cat-title">${escHtml(cat)} ${badge}</div>
                ${items.map(item => {
                    const active = item.id === currentPromptId ? 'active' : '';
                    const edited = isCustomized(item.id) ? `<span class="pm-edited-dot" title="${en ? 'Customized' : '已自定义'}"></span>` : '';
                    return `<button type="button" class="pm-nav-item ${active}" onclick="PromptManager.selectPrompt('${item.id}')">
                        <span class="pm-nav-name">${escHtml(item.name)}</span>${edited}
                    </button>`;
                }).join('')}
            </div>`;
        });
        listEl.innerHTML = html;

        const countEl = document.getElementById('pm-custom-summary');
        if (countEl) {
            const totalEdited = PROMPT_REGISTRY.filter(i => isCustomized(i.id)).length;
            countEl.textContent = en
                ? `${PROMPT_REGISTRY.length} prompts total · ${totalEdited} customized`
                : `共 ${PROMPT_REGISTRY.length} 项提示词 · 已自定义 ${totalEdited} 项`;
        }
    }

    function renderEditorArea() {
        const meta = REGISTRY_MAP.get(currentPromptId);
        if (!meta) return;
        const en = pmIsEn();

        const titleEl = document.getElementById('pm-current-title');
        const descEl = document.getElementById('pm-current-desc');
        const statusEl = document.getElementById('pm-current-status');
        const editorEl = document.getElementById('pm-rich-editor');
        const tokenListEl = document.getElementById('pm-token-list');

        if (titleEl) titleEl.textContent = meta.name;
        if (descEl) descEl.textContent = meta.desc;
        if (statusEl) {
            const customized = isCustomized(meta.id);
            statusEl.textContent = customized ? (en ? 'Customized' : '已自定义') : (en ? 'Default Template' : '默认模板');
            statusEl.className = 'pm-status-tag ' + (customized ? 'is-custom' : 'is-default');
        }

        const tpl = getTemplate(meta.id);
        if (editorEl) {
            editorEl.innerHTML = templateToEditorHtml(meta.id, tpl);
            savedSelectionRange = null;
        }

        if (tokenListEl) {
            const tokens = meta.tokens || [];
            if (!tokens.length) {
                tokenListEl.innerHTML = `<div style="color:#999;font-size:12px;line-height:1.5;padding:6px 2px;">${en ? 'This prompt has no dynamic placeholders. You can freely edit the entire text.' : '该提示词无动态占位符，可直接自由编辑全部文本。'}</div>`;
            } else {
                const reqTokens = tokens.filter(t => t.required);
                const optTokens = tokens.filter(t => !t.required);
                const renderGroup = (title, arr) => {
                    if (!arr.length) return '';
                    return `<div class="pm-token-group-title">${title}</div>` + arr.map(tk => `
                        <button type="button" class="pm-token-btn pm-color-${tk.color || 'blue'}" data-token="${escHtml(tk.key)}"
                            onmousedown="event.preventDefault()" onclick="PromptManager.insertToken('${escHtml(tk.key)}')">
                            <div class="pm-token-btn-top">
                                <span class="pm-token-pill"><span class="pm-chip-dot"></span>${escHtml(tk.label)}${tk.required ? ' *' : ''}</span>
                                <span class="pm-token-state"></span>
                            </div>
                            <div class="pm-token-desc">${escHtml(tk.desc || '')}</div>
                        </button>
                    `).join('');
                };
                tokenListEl.innerHTML =
                    renderGroup(en ? 'Required (Must Keep)' : '必须保留（缺一不可）', reqTokens) +
                    renderGroup(en ? 'Optional (Insert as Needed)' : '可选插入（按需放置）', optTokens);
            }
        }

        refreshTokenPanelStatus();
    }

    function selectPrompt(id) {
        if (!REGISTRY_MAP.has(id)) return;
        currentPromptId = id;
        renderSidebar();
        renderEditorArea();
    }

    function saveCurrentPrompt() {
        const meta = REGISTRY_MAP.get(currentPromptId);
        const editor = document.getElementById('pm-rich-editor');
        if (!meta || !editor) return;

        const tpl = editorDomToTemplate(editor).trim();
        if (!tpl) {
            alert('提示词内容不能为空！如需还原请点击「恢复本条默认」。');
            return;
        }

        const missing = getMissingRequiredTokens(meta.id, tpl);
        if (missing.length > 0) {
            const names = missing.map(m => `「${m.label}」`).join('、');
            alert(`保存失败：缺少必填色块 ${names}。\n\n请点击右侧对应色块将其插入输入框（或点击黄色提示条中的“一键补回”），否则 AI 无法获取关键数据。`);
            return;
        }

        const map = loadCustomMap();
        if (tpl === meta.defaultTemplate.trim()) {
            delete map[meta.id];
        } else {
            map[meta.id] = tpl;
        }
        saveCustomMap(map);
        renderSidebar();
        renderEditorArea();
        showSaveToast(`✅ 已保存「${meta.name}」`);
    }

    function resetCurrentPrompt() {
        const meta = REGISTRY_MAP.get(currentPromptId);
        if (!meta) return;
        if (!confirm(`确定将「${meta.name}」恢复为默认提示词吗？`)) return;
        const map = loadCustomMap();
        delete map[meta.id];
        saveCustomMap(map);
        renderSidebar();
        renderEditorArea();
        showSaveToast(`🔄 已恢复「${meta.name}」为默认`);
    }

    function resetAllPrompts() {
        if (!confirm('确定将所有已自定义的提示词全部恢复为系统默认吗？此操作不可撤销。')) return;
        saveCustomMap({});
        renderSidebar();
        renderEditorArea();
        showSaveToast('🔄 已将全部提示词恢复为默认');
    }

    function exportAllCustomPrompts() {
        const map = loadCustomMap();
        const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), prompts: map }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `妮卡工作室-自定义提示词-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importCustomPrompts(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                const incoming = parsed.prompts && typeof parsed.prompts === 'object' ? parsed.prompts : parsed;
                const map = loadCustomMap();
                let count = 0;
                Object.entries(incoming).forEach(([id, val]) => {
                    if (REGISTRY_MAP.has(id) && typeof val === 'string' && val.trim()) {
                        map[id] = val;
                        count++;
                    }
                });
                saveCustomMap(map);
                renderSidebar();
                renderEditorArea();
                showSaveToast(`📥 成功导入 ${count} 条自定义提示词`);
            } catch (err) {
                alert('导入失败：JSON 格式无效（' + err.message + '）');
            }
        };
        reader.readAsText(file, 'UTF-8');
        event.target.value = '';
    }

    function showSaveToast(msg) {
        const toast = document.getElementById('pm-toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    let modalBound = false;
    function openModal(initialId) {
        const modal = document.getElementById('prompt-manager-modal');
        if (!modal) return;

        if (!modalBound) {
            modalBound = true;
            const editor = document.getElementById('pm-rich-editor');
            if (editor) {
                editor.addEventListener('input', () => {
                    captureSelection();
                    refreshTokenPanelStatus();
                });
                editor.addEventListener('keyup', captureSelection);
                editor.addEventListener('mouseup', captureSelection);
                editor.addEventListener('focus', captureSelection);
                // 粘贴时强制转纯文本，避免带入乱七八糟的 HTML 样式
                editor.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                    document.execCommand('insertText', false, text);
                });
            }
            const searchInput = document.getElementById('pm-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    searchKeyword = searchInput.value;
                    renderSidebar();
                });
            }
        }

        if (initialId && REGISTRY_MAP.has(initialId)) {
            currentPromptId = initialId;
        }
        renderSidebar();
        renderEditorArea();
        modal.style.display = 'flex';
    }

    function closeModal() {
        const modal = document.getElementById('prompt-manager-modal');
        if (modal) modal.style.display = 'none';
    }

    window.PromptManager = {
        registry: PROMPT_REGISTRY,
        getTemplate,
        isCustomized,
        render,
        openModal,
        closeModal,
        selectPrompt,
        insertToken: insertTokenAtCursor,
        insertAllMissingRequired,
        saveCurrentPrompt,
        resetCurrentPrompt,
        resetAllPrompts,
        exportAllCustomPrompts,
        importCustomPrompts,
        onLanguageChanged: () => {
            const modal = document.getElementById('prompt-manager-modal');
            if (modal && modal.style.display !== 'none') {
                renderSidebar();
                renderEditorArea();
            }
        }
    };
})();

