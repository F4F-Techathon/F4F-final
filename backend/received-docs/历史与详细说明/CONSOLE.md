# Multi-Agent 调试控制台

打开 http://127.0.0.1:8771/console.html 。页面入口为 `web/console.html`，依赖同目录的JS/CSS和本机后端，不能仅双击HTML文件来连接语音服务。

双击 `start_console.cmd` 启动；或运行 `runtime/tools/python/python.exe scripts/manage_console.py start`。停止使用同一命令的stop参数。控制台端口8771，原Demo的8770不变。全部代码、数据副本、日志、运行时留在F盘。启动进程必须是已安装中文音色的当前Windows用户；隔离账号可能看不到音色。

操作顺序：选餐厅、填写用户偏好 → 建立调试会话 → 只跑一轮检查链路，或开始持续讨论 → 按需打开麦克风。麦克风默认关闭，断开、关页面或关闭麦克风都会释放采集设备。暂停/打断讨论不会等同关闭麦克风。

页面可以检查：

- 前端提交的参选名单和真实WebSocket收发事件。
- 每家餐厅的资料读取结果与基于店名/分类构建的人格system prompt。
- 人格构建同时确定characterName/nameSource/nameBasis/regionalStyle：已确认品牌角色优先，其次店名明确人物称呼，再按商户名生成稳定昵称。data/brand_characters.json保留品牌别名、角色类型和官方来源，未收录品牌不凭空称为官方吉祥物。当前默认三家为阿乐（聚聚乐）、上校（肯德基）、小麦（赛百味）。
- Coordinator的具体TurnPlan、餐厅Agent每轮读取的只读SessionView及资料。
- 短句、证据检查结果、用户句末转写、TTS请求、PCM帧数量、播放回执和取消。
- 实时工作流：调度器、各餐厅、转写、核验、TTS与播放的处理状态。真实模型delta到达时立刻更新执行卡；点击可固定检查完整提示词、输入、原始公开输出流和结果，新音频日志不会覆盖选中的内容。
- 节点图展示餐厅分支、证据检查、失败修正与播放回执循环；运行节点和传输中的连线高亮。点击节点在下方右侧检查器查看最近执行。逐次执行记录默认折叠。播放节点由浏览器实际PCM排队事件点亮，来源标记为browser，最终以播放回执结束。
- 工作流/人格/会话/Agent输入/原始事件五个检查页签，以及证据原文。工作流默认跟随最新步骤，点击「取消固定，跟随最新步骤」恢复。
- 导出JSONL事件日志，不包含PCM音频数据。

当前能力边界：使用最新七家CSV快照；与旧Demo会话隔离，状态仅存在此调试连接中，断开后不恢复。正式接入时前端只需提交名单、采集麦克风、消费文本/音频；说话人由后端事件指定。调试页的文字、暂停、选店等额外按钮用于人工验证。

2026-10-18：已取消固定introductionText。首轮/后续轮使用不同实际system prompt，首轮由模型自然带出角色名和商户简称，融进同一条抢客台词；isIntroduction=true标记这次动态亮相，经营内容仍有引用。首次最多55字、后续最多40字，每轮一个重点。introducedRestaurantIds只在实际播放到包含角色名与商户简称的完整小分句后提交；未听完的亮相不提交，预生成仅作条件假设。文本模式收到完整展示回执后提交。

七家角色有不同表达设定：阿乐热情张罗、上校老练干脆、小麦机灵算账、阿甬从容犀利、小湘爽直火辣、小竹克制惜字、阿灶实在直给。湘/甬及菜系支持轻地域风格，不能因门店地址给全国品牌硬加地域口音。评论可直接转成自家亮点、对手槽点，来源在evidenceIds里，不念“有位客人提过/评论里/资料显示”；不能把个别体验夸大成绝对保证或捏造竞品问题。

已于2026-10-17接通用户提供的上科大兼容接口，模型标识为deepseek-pro。密钥仅保存在已忽略的本机.env.local，页面不接收或回显密钥。调度器与餐厅均通过真实模型增量接口调用。调度器读取SessionView、最新问题和各餐厅可用资料，返回下一位发言者、引用、回应对象、发言目标与一句决策说明；不对用户发声。后端验证名单、证据归属、已播放replyTo和结构后执行，非法结果或模型请求失败会暂停并显示错误；只有未配置LLM的开发环境才使用明确标记的轮询规则。人格目前仍按餐厅资料规则构建，餐厅生成失败可能记录来源限定模板降级。

调度引用允许跨参选餐厅比较：evidenceIds共1–4条，必须至少有一条属于发言店，所有ID都须出现在本次availableAgents.evidence内。调度候选同时提供新资料、基础资料和已听历史中引用的原始记录；freshEvidenceIds提示优先推进的新资料。不能引用被移除店或未提供资料。非法计划由LLM在相同上下文中修正一次，再严格检查，仍失败才暂停；修正过程可见且可被用户打断，不静默替换成规则调度。

调度提示词在 `server/console_coordinator.py` 的 `COORDINATOR_PROMPT`；餐厅人格与首轮/后续轮提示词在 `server/console_persona.py` 的 `build_persona()/speech_system()`。执行卡中的systemPrompt是该次调用的完整实际提示词。处理中/接收中表示可观察的请求状态，summary为模型明确生成的简短调度说明，不收集或显示内部思维链。餐厅模型输出流在TTS处理前台片段时继续后台接收。

新增调试事件 `workflow`：data包括runId、actor（coordinator/餐厅ID/stt/input/verifier/tts/playback）、stage、status（running/streaming/completed/cancelled/error/waiting）。开始时附systemPrompt/input，增量附delta，结束附output；取消时标记cancelled并推进epoch。该流仅用于开发调试；文本/音频产品输出接口保持原有形式。首文本/首音频指标包含本轮LLM调度耗时。

当前机器的环境代理会中止该学校接口的连接，因此仅模型客户端设置LLM_TRUST_ENV=0走直连，系统代理不变，TLS证书校验保持开启。服务端配置项为LLM_BASE_URL、LLM_MODEL、LLM_API_KEY、LLM_TIMEOUT_SECONDS；修改后重启控制台。运行scripts/check_llm.py可做最小流式探测，脚本不会输出密钥或原始错误响应。真实餐厅生成验收见artifacts/llm-validation.json。

证据检查目前覆盖全部引用ID、非空/长度和数字是否来自实际引用的记录（规范化33与33.00），尚不能声称完成所有语义核验、中文数字或单位匹配。失败节点显示reasons、unknownEvidenceIds、invalidNumbers和availableCitations；失败片段最多交给餐厅LLM修正一次并重新检查，仍失败则不播出。调度候选含偏好检索资料、基础事实和历史原始引用；餐厅的evidence严格等于调度选中的evidenceIds，不再自动补入其他经营资料。历史文本本身不作为新的事实来源。明确复述用户预算的数字允许来自preferences.maxBudget。推荐仍是预算过滤后按参考人均排序的规则建议，缺少禁忌资料时不作符合保证。

正式文本事件仅每轮成功产出一次 `type=text,data.phase=done`，不再发text.delta。最终data含turnId、speakerId、speaker、targetIds、replyTo、完整text、segments与去重evidence。每个segment含segmentId/text/evidenceIds及音频样本范围[sampleStart,sampleEnd)，未启用音频时audio为null；PCM帧携带同一epoch/turnId/segmentId/speakerId。音频持续先发，audio.end后发完整文本，再发turn.generated；无须等待前端实际播放完。正式结构化文本仍在音频发送完成后一次交付。控制台另接收speech.ready：核验完成、TTS开始前展示完整台词并标“文本已生成·音频输出中”；随后区分“音频已发送·播放中”和“播放完成”。打断后全文保留并标含未播放内容；预览不写入已听历史，废弃预生成不发送预览。调试workflow/trace保留中间生成可见性。可在文本卡点击「查看完整结构化结果」。当前类型定义见 `handoff/realtime-output.ts`。

持续讨论采用一轮预生成：当前回合完成短句生成与核验后流式TTS，首帧发送时就在后台调度并生成/核验下一轮。下一轮不提前合成或播放音频、不发正式turn/text，也不写入历史；只在当前前端ended回执确认且epoch/revision/前置turnId一致时采用，没有固定0.35秒等待。预生成还没完成时仍须等待模型；单轮调试按钮不预生成。一次正式完整文本JSON的输出约定不变。页面的完整文本/首音频时延从该轮被激活计算；准备阶段耗时可看调度/生成节点。

SessionView.recentDialogue只包含输出时钟确认已播完的小分句文本；当前整段生成全文仅保存在内部待播放记录。浏览器按AudioContext输出时钟和每帧调度区间每100ms发送playback(progress)，禁止用收到的PCM长度冒充已播放长度。停止时先报告最后实际位置再清队列，旧epoch回执只更新旧回合的已听记录，不能激活新回合。新问题开始生成前最多等400ms接收最终停止回执；未收到时保守使用上次已确认位置。

当前TTS无字级时间戳，按保留标点的小分句分别合成并记录准确样本边界。已播完的小分句进入历史；正在播放但未完整播完的小分句不猜测字数，记partialAudio（segmentId、playedSamplesInUnit、textAvailable=false），不把完整句、未播内容或对应未知文字带入历史。已结束回合的晚到progress会忽略。

预生成的SessionView带speculative=true，pendingPlayback单独包含预计会完整播放的文本与引用，不伪装成recentDialogue的已听内容。任何用户说话、文字输入、名单更新、暂停/打断都会取消活动任务、废弃已准备结果。节点中的预生成公开输出仅用于调试，版本失效后标记已废弃。

STT采用服务端VAD + GPU faster-whisper small，当前只返回句末final。TTS使用F盘独立CosyVoice 3 GPU服务，PCM实时传回；安装与启动说明见COSYVOICE.md。前端不做STT或TTS；当前播放器按片段关联字幕，不声称精确音素对齐。首次加载模型有等待，具体时延需实机测量。

语义协议参考 `handoff/最终方案.md`。本控制台实现还包含debug专用trace事件、mic.start/mic.stop和测试资料目录接口；不能将调试trace视为用户产品必须展示的内容。

## 已执行的自动验证

`scripts/smoke_console.py`通过真实WebSocket验证：资料与动态人格、跨角色读取已播放会话、后端PCM音频、取消后不再发送旧音频、播放中合成语音触发VAD取消、合成输入经过STT转写。不会打开真实麦克风。结果在 `artifacts/console-validation.json`。里面的命令到cancel数值不包含真实麦克风检测或浏览器实际静音耗时。

`scripts/test_console_audio.mjs`验证实际采集processor在16kHz/48kHz输入下输出连续16kHz PCM帧。真实麦克风的权限、设备与回声环境由用户手动测试。

`scripts/test_console_playback.mjs`验证按输出时钟计算的播放样本位置，不包含未来排队帧。`scripts/validate_pipeline.py`使用真实LLM/TTS和模拟输出回执，验证音频未结束即预调度、回执后采用、打断废弃已准备回合、旧epoch反馈只更新已听历史，以及新问题上下文不含未播放的未来台词。结果见artifacts/pipeline-validation.json，不打开实体麦克风。

`runtime/tools/python/python.exe -m unittest discover -s tests -v` 包含调度ID防护、LLM决定说话人、公开输出流事件、调度中取消和TTS消费期间后台接收等测试。`scripts/validate_workflow.py`通过真实API与WebSocket检查两轮调度、餐厅增量、TTS PCM、语音输出中断及调度请求中断，报告写入 `artifacts/workflow-validation.json`，不打开实体麦克风。


用户偏好：session.start可传preferences对象（maxBudget、quiet、noSpice、allergySource、userNotes）；调试页提供用户偏好输入框。文字/转写持续保存用户原话和结构化检索提示，中文预算和辣度更正可识别。后续query清空后偏好仍保留，最新更正优先。DataReader混合偏好相关、当前交锋和未展示的新资料，每店最多10条，保留菜品/套餐/评论等不同类型，再补调度可见基础/历史证据；Coordinator决定发言动作、preferenceFocus和精确引用，Restaurant只用分配证据。

scripts/validate_preferences.py用真实LLM检查约会安静与四十元预算两种场景、短句长度、偏好持续读取和精确证据分配，报告artifacts/preferences-validation.json；无实体麦克风。


2026-10-18表达与选题调整：角色就是餐厅化身，直接用我/我们/我这儿表达具体长处，不念“被夸/被评价”，不说“替某某接一句”的申请发言串词。每家首次出场仍需先简短介绍角色名和商户简称，由模型按性格组织，后续不再报身份；不固定开场句，也不每轮先复述用户需求。预算和禁忌等明确限制保留，普通喜好只是选题因素之一。Coordinator综合现场交锋、尚未展示的资料、话题历史和偏好选择任务，discussionDimension记录菜品/口味/食材/价格/环境/座位/摆盘/服务/上菜/套餐/分量/便利/综合；两轮同维度已聊清时优先换角度，有实质反驳可继续，不按机械轮换。最近话题只统计已听非空文本，预生成额外考虑pendingPlayback一次。验证脚本scripts/validate_debate.py检查多轮话题展开、短句、首轮与后续轮身份表达。


控制台每轮卡片显示调度行为、对象、话题维度；可展开查看本轮行为、对象、关联回合与资料ID分配，不含台词指导。speechAct区分present自荐、attack攻击、respond回应、compare对比、answer回答用户、clarify澄清/追问，标签直接来自调度计划。speech.ready及最终text也携带speechAct和discussionDimension，便于文本、音频、行为同轮绑定。

调度防复读：无人新提问且同维度连讲两轮时，不能再安排present式重复自荐；真实定向交锋的respond可接着反驳，模型可换角度或给出有依据的attack/compare。已说清的需求起手语可在不改身份与经营事实的前提下裁去，speech.polished保留前后文本；具体反驳中的需求引用保留。调度不再生成goal；餐厅实际发言中的数字仍须有本轮原始依据，避免拿历史数字当资料。


正式角色名单事件 restaurants.updated：首次session.start、restaurants.update、user.remove（文字/语音移除）和reset后，在角色构建完成后、下一轮发言前发送。data包括revision、reason、restaurants全量快照、addedRestaurantIds、removedRestaurantIds。每个restaurant含restaurantId（同发言speakerId）、restaurantName、displayRestaurantName、characterName、nameSource、personaVersion。前端用全量快照替换当前名单，用增删ID处理进出场动画；角色不必先开口才能显示名字，不依赖persona.ready调试事件。名单更新保留偏好、已听历史及介绍状态，非法更新不打断现有会话。控制台左侧“服务端角色名单”消费同一正式事件，点击角色查看原始回包。类型见handoff/realtime-output.ts的RestaurantsUpdatedEvent。


评论与聊天节奏更新：DataReader按原文提取reviewInsights检索线索，混合好评亮点与负面体验，优先覆盖不同维度，保留菜品/套餐与原始价格。线索不是事实核验结论，引用仍回到原文；差评文件名不代表内容一定负面。互喷抢客为主线，attack和真实respond占主线，present/compare穿插，用户问题优先answer/clarify；连续两轮攻击或比价且无新用户问题时需换节奏。角色首次先简短招呼用户再自然介绍，湘/江浙角色可有少量地域表达，外来品牌角色可以一声Hi/Hello，后续中文为主，不固定开场台词或反复夹英文。人格版本persona-v10；完整实际提示词导出在artifacts/current-agent-prompts.json。

CosyVoice安装：8771控制台改用F盘独立CosyVoice 3本机GPU服务（8772），详细目录、启动、取消行为及测试见COSYVOICE.md。当前参考音色已实测；按餐厅细调方言/外国口音尚未完成，不能把角色文本风格当作真实口音控制。


发言检查故障处理：历史里提到的数字不自动成为本轮依据。修正请求的requiredEdits明确要求删除未分配数字或改用不带金额的指代，不能擅自扩充调度分配的资料。修正仍失败时error.message展示具体原因，error.validation包含turnId、reasons、invalidNumbers与unknownEvidenceIds；控制台自动打开该原始事件。失败原稿和检查结果写入runtime/logs/console.log，日志不包含API密钥。

发散实测：scripts/validate_breadth.py重放128元未引用故障，真实LLM修正通过；当前四店无偏好连续10轮，以及约会安静偏好的三店连续8轮，再分别追问价格，报告artifacts/breadth-validation.json。统计按实际发言绑定的discussionDimension、speechAct与最终引用，不以提示词已修改代替实测。页面左侧显示实际ttsProvider与personaVersion，更新后需重新建立会话。


模拟用户输入现已纳入固定测试：`scripts/validate_user_inputs.py` 使用真实LLM与生产的 `ConsoleSession.command`，按步骤注入 `user.text`：切换服务/上菜话题、点名上校回答、预算改为50元且不能吃辣、撤销预算和辣度限制、移除上校、点名小麦追问及暂停。步骤之间保留会话和偏好；无输入时继续自动讨论。测试端只限制每步生成一轮并确认完整文本已展示，避免用直接改query代替实际输入解析。结果包含每条模拟输入、对应文本、行为、引用、偏好和剩余名单，见 `artifacts/user-input-validation.json`。

播放中输入另测：`scripts/validate_pipeline.py --user-barge-in` 在真实CosyVoice音频输出及下一轮已预生成时，直接发送“等等，人均预算改成50元，别一直聊价格，讲讲服务。”，不先按打断按钮。验证旧回合取消、预生成丢弃、迟到的旧epoch回执只更新已听历史、新一轮读取新条件；当前未播完的小分句和未播放未来回合不能进入文字历史。结果在 `artifacts/user-barge-in-validation.json`。两项均不启用实体麦克风；文字输入测试不能替代真实麦克风/VAD/STT验收。


2026-10-18 调度与表达边界（persona-v10，覆盖此前含goal的旧说明）：
- 调度LLM选择restaurantId、speechAct、targetRestaurantId、replyTo、evidenceIds、discussionDimension；topic/summary/preferenceFocus仅用于调试与分析，不进入餐厅TurnPlan。
- 已移除goal和自由文本发言指导。restaurant_directive使用字段白名单，旧goal、summary、suggestedText等即使出现也不会传入生成或修正模型。调度不定论点、起手句、句式、口吻、发言提纲或回复结论。
- 餐厅读取完整SessionView：所有保留的会话历史（不再只截最后12条）、当前状态、角色名单、用户偏好和最新userQuestion，结合调度分配的原始资料自主组织内容。历史只包含确认已听的小分句，预生成pending仍单独标记假设，未播全文不进入正式历史。完整会话不等于全商户资料，新增经营事实仍限本轮分配evidence。
- 每家个性化systemPrompt同时写入角色节奏、句式习惯、措辞禁忌、进攻表达和接招习惯，主要由各自人格控制表达差异。公共校验仅挡自我检讨和明显共用让步套句，不负责生成个性。不许承认失误/整改式自我检讨，也不许编造否认或补救事实。
- 首次仍招呼并介绍身份，由餐厅自主措辞，之后不重复介绍。没有统一开场、固定introductionText或轮流报菜单。
- 控制台可在「人格」查看各店systemPrompt，「Agent 输入」查看完整实际输入，在回合卡展开查看精简调度分配。公共最终文本/音频绑定协议不变。


persona-v10验收：81项单元测试通过；scripts/validate_speech_mix.py真实LLM连续12轮自动讨论（attack=4、respond=5、compare=2、present=1），再加入停车点名提问、要求澄清忌口、更正辣度/预算等3条模拟user.text，共15轮通过。测试检查生成及修正请求均不含goal/summary/topic/suggestedText，偏好与完整上下文仍传入；各店首次/后续提示词及行为输出可在控制台查看。报告artifacts/speech-mix-validation.json。行为分布是这次实测结果，不是固定轮转或每12轮强制配额。真实CosyVoice插话/预生成取消与已听历史回归另见artifacts/user-barge-in-validation.json，未开启实体麦克风。提示词导出可用scripts/export_agent_prompts.py重新生成。


2026-10-18 调度引用修复：实际故障是把offer:店ID:1510784735误写成review:店ID:1510784735（3条引用未超限）。Coordinator候选原文现附本轮selectionRef（E001等），模型返回evidenceRefs短码，后端严格映射为原始evidenceIds，再做餐厅归属、对象、数量和关联回合检查。餐厅输入与前端输出仍用完整原始ID，不改变接口。合法旧evidenceIds提案兼容，错前缀不自动替换、未知码不模糊匹配、不按位置截断超量引用；重复引用同一事实仅计一次。数量、类型、未知ID和未知选择码分别报告具体原因；修正请求附本轮短码映射。失败诊断也写入本机console.log，日志不含API凭据。调度职责仍仅为选行为/对象/依据，不增加台词指导。

调度引用修复验收：85项单元测试通过；scripts/validate_coordinator_refs.py使用本次真实失败现场、原始候选与用户“我喜欢吃炸鸡”的上下文，验证错误review/offer前缀仍拒绝、真实模型短码选择、一次修正、原始ID映射及完整调度/餐厅生成。报告artifacts/coordinator-ref-validation.json。


2026-10-18 证据容错策略（当前规则，替代前面的严格拒绝/超4条暂停说明）：无效选择码、错误ID、已移除商户和未提供的引用逐项忽略；重复引用去重，所有有效引用保留，取消4条硬上限，不截断合法资料。过滤后有充分资料就直接继续，trace中的coordinator.evidence_filtered记录被忽略项。资料全部失效、缺少发言店/对比对象依据或所选在场餐厅暂时不可读时，调度重选一次；仍失败则以当前可读资料生成自荐/回答，必要时换店，明确记录coordinator.evidence_recovered，不发送TURN_FAILED。原来无法读取的内容不会交给餐厅，也不会凭空补造引用。所有餐厅都无可读资料才等待新输入；没有无限重试。

容错验证：87项单元测试通过。scripts/validate_evidence_continuity.py连续注入“部分引用失效”“5条有效引用+无效引用”“全部引用连续失效”三种情况，再恢复正常LLM调度；四轮均实际生成并确认文本、保留历史，没有error事件。报告artifacts/evidence-continuity-validation.json。取消、预生成、已听历史和最终文本/音频协议保持原有行为。


2026-10-18 攻击点记忆（persona-v11）：按原始评论ID＋具体问题生成稳定pointId，所有餐厅共享SessionView.usedAttackPoints。一次评论里的倒水慢、菜太咸分别记录，换说话人、换行为标签、换已识别的同义表述不能把同一点当成新攻击。未用过的其他问题和同评论里的好评仍可用；不是封禁整个维度或整家店。评论原文不改，criticismPoints只作为问题索引，不代表事实真实性核验。

记忆从已听到的短分句及其原始引用计算，不从整段已生成文本推断。未播、取消的预生成不提交；speculative上下文仅暂时计入pendingPlayback一次，版本失效后自然废弃。当前实现用已知问题类型、否定处理和词片段匹配辅助识别，配合模型读取完整历史与已用点，不声称覆盖全部中文语义改写。

调度可看到每条候选的criticismPoints/alreadyUsed，attackOpportunities只列未用点；旧差评中所有已识别问题均用过时，过滤该攻击依据并重选，不暂停会话。餐厅生成与修正也读取同一记忆，实际复读旧槽点先修正；修正仍重复则放弃该台词、用可读自家资料继续，记录coordinator.repeated_attack_avoided。针对自己的质疑仍能正常接招；用户明确追问旧事时可解释，没有新追问时不能靠answer标签绕过记忆。

验收：98项单元测试通过，覆盖跨角色共享、同评不同问题、正面内容、自己接招、取消/已听部分、预生成暂存及无中断恢复。scripts/validate_attack_memory.py把第三家已经讲过的差评再次注入发言生成，真实模型修正后没有播出同一问题，并继续下一轮，报告artifacts/attack-memory-validation.json。
