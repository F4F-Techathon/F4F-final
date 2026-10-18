> 当前给前端的简版交接以 [传输形式约定](./frontend/README.md) 为准：业务数据结构由前端定义，后端负责传输与交互形式。下面保留历史方案。

# 按 Frontend / F4F-battle 对齐的交接与 Multi-Agent 设计

> 已由 [最终简化方案与前端接口 v1](./最终方案.md) 替代。以下保留为仓库阅读记录与早期方案，角色拆分和事件命名不再作为当前接口基准。

日期：2026-10-17。本文是读代码后的**建议方案**，不是已经由三方确认的接口，也不表示以下功能已全部实现。本次只新增交接材料，没有改动两个参考仓库或运行中的 Demo。

每个 Agent 的能力、设置、输入输出和完整协作示例见 [AGENT-SPECS.md](./AGENT-SPECS.md)；可讨论的参数样例见 [agent-config.example.json](./agent-config.example.json)，当前服务器不会自动加载这份提案配置。

## 1. 结论与职责

你的核心交付应是：**接收候选餐厅、用户条件和插话，持续产出有证据、有回应关系、可以取消的讨论事件流**。文本是主体，但只给无结构字符串不足以驱动他们已有的角色、引用、证据和结果页。

语音试验保留为可选适配层。产品展示沿用 Frontend；表演、方言和 CosyVoice 优先复用 F4F-battle。不要把本机自建页面、Windows 音色或 LiveKit 变成其他成员必须迁移的技术前提。

| 交付边界 | 建议负责内容 | 输入 / 输出 |
|---|---|---|
| Frontend | 产品流程、地图选店、条件与证据面板、历史、暂停、结果展示 | 向核心提交候选和条件；消费文本与业务事件 |
| Multi-Agent（你） | 偏好更新、硬条件校验、发言调度、角色内容、引用核验、去重、取消、推荐理由 | 输出结构化文本流；处理播放回执与用户操作 |
| F4F-battle | 角色资产、表情动作、旁听反应、方言改写、CosyVoice、口型和播放 | 消费确定的台词与回应关系；返回播放状态 |
| 语音适配层 | 麦克风、VAD、STT、打断、媒体传输 | 识别结果归一为同一个 user.input；不另建一套业务逻辑 |

这些是按代码推导的职责建议，不能从仓库直接推断成员之间已有的分工约定。

## 2. 阅读依据与实际状态

参考快照：Frontend `47b5241728ba8e853f9fb9f990f01f7727385ab3`；F4F-battle `e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe`。私有仓库通过本机已有 Git 权限读取，公开访问的 404 不代表仓库不存在。

| 已核对源码 | 事实及其影响 |
|---|---|
| [Frontend dining.ts](https://github.com/F4F-Techathon/Frontend/blob/47b5241728ba8e853f9fb9f990f01f7727385ab3/src/stores/dining.ts#L38)、[debate.ts](https://github.com/F4F-Techathon/Frontend/blob/47b5241728ba8e853f9fb9f990f01f7727385ab3/src/data/debate.ts) | `createDebate()` 本地生成三轮台词；`intervene()` 本地修改条件；尚无真实 Multi-Agent 连接。应换数据来源，保留页面设计。 |
| [DebateView.vue](https://github.com/F4F-Techathon/Frontend/blob/47b5241728ba8e853f9fb9f990f01f7727385ab3/src/views/DebateView.vue#L50) | 完整文本用 65ms 定时器逐字显示，最后一条自动 `finish()`。这是显示效果，不是模型流；持续讨论时需取消“数组耗尽即推荐”。 |
| [filtering.ts](https://github.com/F4F-Techathon/Frontend/blob/47b5241728ba8e853f9fb9f990f01f7727385ab3/src/lib/filtering.ts#L11) | 硬条件和软排序分开，某些硬条件的未知数据会排除。后端也必须校验，不能只降分。 |
| [Battle console.js](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/agent-studio/web/js/console.js#L292)、[live.js](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/agent-studio/web/js/live.js#L53) | 导演指定角色、完整台词、多条引用，再调用 `LiveEngine.send(turn)`。可以作为你生成台词之后的消费入口。 |
| [Battle /api/decide](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/agent-studio/server/app.py#L232)、[jev.py](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/agent-studio/server/jev.py#L98) | 输入里已经有 speaker 和 text；Jev 决定表情、动作、视线、语气及听众反应。它没有替你完成“下一位是谁、该说什么、该推荐哪家”的业务编排。 |
| [Battle /api/tts/stream](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/agent-studio/server/app.py#L304) | 已有 NDJSON 的 meta / clause / done，逐句返回 PCM 与口型；请求仍带完整 text。不能把音频分句流或生成角色资产的进度流当成讨论内容流。 |
| [avatar-lab v0.2](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/avatar-lab/CONTRACT-v0.2.md)、[events.js](https://github.com/F4F-Techathon/F4F-battle/blob/e56913195cb1ab7b358ce8e51c5a0f6f79ce9afe/avatar-lab/src/events.js) | 独立 3D 样机，支持 utterance / turn.cancel、去重和会话隔离；固定三人，只允许 `/audio/` 下的音频文件，未接实时网络语音。与 agent-studio 不是同一个现成渲染入口。 |

### 必须明确的差异

1. **舞台人数**：Frontend 选 2–3 家，3D 样机固定 3 家，本机 Demo 原来是 2 active + 1 holding。建议核心支持 0–3 家，前端与 3D 对接另行处理二人布局；不要为凑三人把已拒绝的餐厅加回来。第一轮 3D 联调用三家，但不能据此声称两家/离场已经接通。
2. **身份**：restaurantId 是业务实体，agentId 是该店讨论实例，character/actorId 是造型。Frontend 多家店共用 rong/hua/pierre，不能把 rong 当作唯一餐厅 ID。本机丁香小鲜也不能映射成 Frontend 的华记粤点，它们只是共用了 hua 造型。Battle 的 `who` 必须存在于 catalog：适配器应维护 restaurantId → catalog角色ID 的显式映射，不把 `restaurant:bashi` 直接发给现有接口。若两家共用 hua 造型，要建立独立角色实例/生成角色，不能合并为一个华叔；3D 三个固定角色也需要明确实例绑定。
3. **状态**：Frontend 的 speaking/disagree 等、本机 presenting/challenging 等、Battle 的细致动作词表不一致。核心输出 speechAct/语义情绪；适配层映射，Jev 负责具体表演，避免两边同时写表情。
4. **数据**：Frontend 商户与评论明确为演示数据；本机包含丁香小鲜数据和两家模拟店，地理位置也不同。传递 mock/source/日期，禁止只换名字就混用证据。
5. **推荐触发**：你的需求是无人下指令也能继续讨论、主持人不出声；Frontend 当前有限三轮后自动进结果。建议明确采用“持续讨论 + 用户请求才推荐”，最终确认仍由用户选择。此项是产品行为调整。
6. **音频时钟**：生成完文本、TTS 完成、浏览器播完是三个不同事件。核心的 `turn.completed` 不能复用 `speech.ended`。

## 3. 细化 Multi-Agent：先划职责，再决定模型调用次数

这里的 Agent 是逻辑职责，不需要每个角色独立进程，也不需要每一步都调用大模型。首版采用一个会话编排器，确定性控制状态、检索和约束；餐厅角色负责受约束的语言生成。

| 角色 / 模块 | 具体输入与产出 | 约束 |
|---|---|---|
| Preference | 用户原话 + 旧条件 → 有来源的条件 patch、意图与歧义项 | 区分“不吃辣”和“少辣”；支持撤销和修改；不把“不要川菜”加入偏好；保留原话与版本 |
| Candidate / Constraint | 前端候选 + 条件 → eligible / excluded / unknown 与原因 | 原则上不重新发明地图候选；超预算等硬条件不得靠高评分抵消；全部不合适返回无候选 |
| Coordinator（隐式主持） | 议程、未回答问题、最近发言 → nextSpeaker、target、replyTo、speechAct、topic | 只产生控制与状态，不进入 TTS；不是每轮说一句“好的，继续” |
| Restaurant | 本店资料、允许引用的对手资料、用户目标、turn plan → 简短可核验台词 | 先回应上一条具体观点；可承认短板；不编造库存、座位、折扣、营业状态 |
| Evidence verifier | 台词中的事实声明 + 引用原文/结构化字段 → 允许发布的句子或修正 | 引用 ID 存在不等于支持结论；检查数值、店铺归属、否定语义、引用截断与主客观范围 |
| Judge | 当前 eligible 集合 + 用户显式推荐请求 → 排序、理由、代价、待确认项 | 不能选择已移除/硬条件不符的店；区分 recommendation 与用户 selection |

### 会话状态

保存 `sessionId / revision / epoch / phase / profile / candidates / active / removed / currentTurn / agenda / memory / cursor`。

- `phase`：intake → ready → discussing；插话进入 refining，再回 discussing；可进入 paused / awaiting_choice / selected。
- `profile`：对齐 Frontend 的预算区间、半径、中心点、菜系、场景、人数、时间、安静/清淡偏好、不吃辣与过敏。保留 hard/soft、信息来源和未知状态。
- `memory`：保留已发布发言、实际播放/显示进度、每家已经说过的卖点、未回答问题、被质疑的事实。取消的未播片段不应当作用户已经听过。
- `removed`：用户明确拒绝后不自动复活；新搜索可建立新会话。
- `revision`：条件/名单更新时递增；生成任务绑定 revision，过期结果不能提交。
- `epoch`：打断时立即递增，先停声音，再等待 STT 和新内容；旧 epoch 的迟到文本、音频和动作统一丢弃。

### 自动讨论与选下一位

优先级：用户停止/插话 > 硬条件与名单变化 > 点名问题 > 针对上一句的回应 > 未覆盖的关键比较 > 新证据补充。轮换只是同优先级下的公平策略，不是固定 A/B/C 循环。

1. 开场每家只说一个与当前需求相关的卖点，不轮流念完整自我介绍。
2. 挑一个有效比较：预算、距离、辣度、环境、场景或资料不确定性。
3. 被质疑者先回应，其他角色只做无声反应；下一回合可补充或承认对方优势。
4. 每回合检查“是否回答了具体问题、是否有新信息、是否重复最近论点”。连续重复时换议题或生成简短澄清问题，不自动做最终选择。
5. 正常无人输入时自动接下一回合。所有已知信息耗尽时可以放慢节奏、等待补充，保留继续讨论状态；不循环编造事实。用户暂停、查看证据/历史时按 Frontend 既有行为暂停，手动继续后恢复。
6. 推荐后暂停并等待选择；只剩一家仍可解释利弊，不伪造“对手”；零家停止发言并提示重新选店。

### 用户说“踢走丁香小仙”的正确链路

VAD 检出用户开口 → 清空当前播放并取消旧 turn → STT → 名称候选消歧 → 更新名单与 revision → 发出 roster.updated → 重新调度仍在场角色。没有候场店也必须能移除。目标不唯一才请求澄清；“别踢走…”不能触发移除。主持人保持无声。

别名字典应来自当前候选店名及确认过的 ASR 别名，不把本机三家店的硬编码迁移为通用名称解析器。

## 4. 文本流怎样接给他们

建议公共契约见 [multiagent-contract.ts](./multiagent-contract.ts)，离线示例见 [example-events.ndjson](./example-events.ndjson)。**两者均是提案与夹具，不是当前服务器已提供的接口。**

推荐首版 HTTP 命令 + SSE 事件；它容易与 Vue 解耦。WebSocket 或 LiveKit DataChannel 可包装同一事件结构，不把 SDK 类型写进业务对象。需携带鉴权时可用 fetch 读取 SSE 或同源代理；开发联调处理好端口/CORS。

建议端点：POST `/api/discussions` 建会话；POST `/api/discussions/{id}/commands` 发用户文本、暂停、继续、打断、选择；GET `/api/discussions/{id}/events` 订阅。端点尚未实现。

- `turn.started`：明确说话店铺、角色造型、回应目标、话题与引用关系，页面进入准备态。
- `text.delta`：追加已经校验的短句片段及 evidenceIds；不是把完整文本用定时器拆字发送。
- `turn.completed`：结束本轮生成并携带完整台词，供旧接口消费及一致性核对；不要再次追加到字幕。
- `turn.cancelled`：停止指定回合；已取消回合的后续 delta/completed 均不执行。
- `profile.updated / roster.updated`：业务状态变化；`decision.proposed` 是推荐建议，`selection.confirmed` 才是用户选店。
- 公共字段含 version、eventId、sessionId、epoch、seq；重连从 cursor 补发，去重后恢复。缺历史则发完整 snapshot，不重播已消费的声音。

**流的粒度建议**：首版公开流用“经过校验的短句增量”，LLM 适配器内部可真实流式接收 token，再在短句边界校验发布。若需要逐 token 的草稿显示，另标 draft、允许撤回，且不可直接送 TTS；不要承诺未核验 token 都是可靠事实。整轮生成完再拆句不算这一目标完成。

### 两段式接入

第一段先跑通完整台词：Frontend 接流并维护消息；`turn.completed` 经适配器转换成 Battle 的 `{id, who, src, text, lang, quotes, voiceOn, interrupt}`，调用一次 `LiveEngine.send()`。由 Battle 做 Jev 与 TTS。3D 则转换为一次 `utterance`。这是兼容路径，配音仍等待整轮文本完成。

已有 Battle `/api/decide` 限制台词 1–300 字；首版核心每轮也限制在 300 字以内，引用最多六条。`replyToTurnIds` 需通过会话记录解析为 `{who,text,src,ref}`，不是直接把 ID 数组塞给 quotes。首轮用原始三位角色验证，动态/同造型多店另做角色实例联调。

第二段再降低首音延迟：Battle 增加同一 turn 的 `begin / appendSegment / end / cancel` 消费方式，让已校验短句进入音频队列。不能每个 delta 都调用 `send()`，否则会被当成多次独立发言、重复 Jev、字幕和引用。3D 也需新增可信音频来源与流缓冲，不能直接塞 LiveKit URL 进当前 `/audio/` 白名单接口。

### 播放反馈与调度

有音频时由当前播放方返回 `playback.started/ended/cancelled/failed`；纯文本由页面阅读完成返回 `display.ended`。只有一个主播放方。核心最多预取一轮，正常在当前展示完成后发布下一位，避免后台生成速度压垮舞台队列。超时进入可见错误/暂停，不盲目叠加新声音。

文本生成事件由核心发出；真实 speech.started/ended 由播放层发出。UI 的逐字效果与口型以实际音频时钟为准，网络抵达时间不是发音时间。

Battle 现有方言改写之后，应保留 `sourceText` 和 `spokenText` 对应，数值、店名、否定词和证据含义不变；必要时校验改写结果。保持一套音频输出：接 Battle TTS 后关闭本机 Windows TTS、Frontend speechSynthesis，避免双重播放。

## 5. 语音试验怎么交接

### 现在实际具备

本机链路为 LiveKit → Silero VAD → GPU faster-whisper small → 当前编排逻辑 → Windows 中文离线音色 → LiveKit 音轨。当前未安装 CosyVoice 模型、未配置 LLM；不能写作“CosyVoice 和真实大模型多智能体已经验收”。详细运行说明见 [VOICE-DEMO.md](../VOICE-DEMO.md)。

已有 13 项本机单元测试；[语音测试报告](../artifacts/voice-discussion-validation.json)记录了真实 LiveKit 音轨、合成输入、移除餐厅、持续讨论、暂停恢复和主持人无声。合成输入到打断事件约 417.5ms 是该次本机值，不是手机麦克风端到端时延保证。

### 建议交接物

| 分类 | 文件 / 内容 | 如何使用 |
|---|---|---|
| 核心参考 | `server/orchestrator.py`、models/store/data/evidence、LLM provider、相关测试 | 参考已有名单/证据/会话逻辑；按新契约整理后交付，不直接宣称完成 |
| 可选语音参考 | `server/livekit_worker.py`、voice_turns/discussion、STT/TTS provider、`scripts/manage_voice.py`、语音测试脚本、VOICE-DEMO.md | 保存 VAD、取消顺序、音轨回传、自动调度经验；按需接到共同核心 |
| 联调材料 | 本文、契约提案、NDJSON 夹具、脱敏测试结果 | 不装模型也能先对接展示与状态 |
| 本机演示入口 | `web/`、start/stop 脚本 | 作为调试工具保留；正式产品视觉以他们仓库为准 |

不要打包 `.env.local`、会话数据库、整套 `.venv`、模型、缓存、参考仓库、日志原件或私人录音。需要分享语音样例时只挑经确认可分享的合成样例。模型与依赖给版本和安装方法，不拷贝本机环境。

原 HANDOFF.md 是早期快照，含旧设备/未验收状态和旧人数设计，不适合作为本次事实依据直接发给队友。

### 可以发给队友的说明草稿（尚未发送）

> 我这边以 Frontend 的产品流程和 F4F-battle 的角色/配音能力为准，主要补 Multi-Agent 讨论核心。计划接收你们选出的餐厅和用户条件，输出说话人、回应关系、文本增量、证据、名单变化与推荐建议。语音已做过本机验证，会作为可选适配器交接；正式 TTS 优先复用 Battle 的 CosyVoice，不要求迁移我这边的页面或 Windows 音色。先用事件夹具对接完整台词和取消，再联调增量文本与分句播放。需要共同定下主展示入口、二/三人舞台、以及持续讨论与推荐触发规则。

## 6. 当前核心的不足与下一轮顺序

| 优先级 | 工作 | 完成标准 |
|---|---|---|
| P0 | 对齐候选数据、ID、硬/软条件与人数 | Frontend 选出的店进入核心；同一造型的两家店不串台；无合格候选不推荐 |
| P0 | 会话状态、revision/epoch、取消与真实事件流 | 首个已核验片段在本轮生成结束前可被消费；插话后旧结果不复活 |
| P0 | 替换固定轮换为按问题/回应关系调度 | 点名谁谁先回答；移除后不再发言；无人输入继续讨论；主持人不出声 |
| P0 | 主张级证据核验与 Judge 硬过滤 | 有效 ID 但不支持的说法被拒绝；超预算和未知硬条件不能靠评分抵消 |
| P1 | 跨轮记忆、议题覆盖与重复抑制 | 多轮围绕用户取舍推进，承认短板；不重复自我介绍，不编造新事实 |
| P1 | 接 Battle Jev/TTS、真实播放回执 | 单一声音源；队列受控；生成结束与播放结束分开；取消能停动作和音频 |
| P2 | 真实麦克风、回声、手机、弱网、重连 | 在目标设备测端到端时延、恢复和误打断，记录环境及分位数 |

本机当前 `complete_json()` 使用 `stream: false`，`_turn_events()` 一次发完整 `speech.chunk`；EvidenceVerifier 只筛引用 ID 的归属；Judge 的过敏风险和超预算主要是扣分。这些需要改进后才能匹配上述交付标准。已跑通的语音传输不会自动解决这些业务问题。

示例 NDJSON 使用 Frontend 的三家**虚构演示店**与已有证据 ID；假定会话已创建并加载这些资料，事件记录只覆盖讨论片段，播放/阅读回执及用户命令由测试驱动另行提交。移除华记之后仍绑定两名 3D 角色只是目标场景，不表示当前固定三人的样机已经支持离场或二人流程。该夹具不是真实模型输出，也不是语音实测日志。

建议核心验收场景：新增/撤销预算、禁辣与少辣区分、ASR 店名别名及否定命令、多目标澄清、候场耗尽仍能移除、全部移除、全部硬条件不符、未知过敏信息、无依据拆台、点名回应、连续重复、模型中断/超时、旧回合迟到、重连去重、证据页暂停和继续、无声主持、用户推荐与最终选店分离。
