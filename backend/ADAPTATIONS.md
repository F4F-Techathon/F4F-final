# 多智能体后端：接入「饭店请就位」前端的改动说明

日期 2026-10-18。收到的源码是 `吃啥-完整后端源码-2026-10-18.zip`（交接文档原样存放在 `received-docs/`）。这次改动的目标有两个：把后端接到「饭店请就位」的辩论台上，并让它在本机运行。本机是 Apple M1 Pro、16 GB 内存，没有 NVIDIA GPU。

- 全部改动对照收到的源码生成了差异文件：`patches/frontend-adaptation.diff`。
- 原文件是 CRLF 换行的，改后仍是 CRLF。
- 前端怎样使用这个后端，见 `Frontend/docs/multi-agent-backend.md`。

## 一、在本机运行

```bash
cd Backend/eat-what-backend
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements-handoff.txt "torch>=2.8,<3" "transformers>=4.51,<6"
./start_mac.sh            # API 和 WebSocket：127.0.0.1:8771（/api/realtime），调试控制台在 /console.html
./start_mac.sh --check    # 只做加载自检
```

**配置文件 `.env.local`（不含任何密钥）**

- **密钥：** 通过 `EAT_WHAT_ENV_FILES` 原地读取前端的 `Frontend/.env.local`（主模型）和 `Frontend/.env`（备用模型），不复制到这里。
- **语音合成：** `TTS_PROVIDER=macos`。
- **语音识别：** `WHISPER_BACKEND=transformers`，`WHISPER_DEVICE=mps`，`WHISPER_MODEL` 指向本机 Hugging Face 缓存里已有的 `openai/whisper-large-v3-turbo`。
- **回执等待：** `PLAYBACK_ACK_TIMEOUT_SECONDS=600`。

**店铺数据**

- `start_mac.sh` 设置 `CONSOLE_DATA_DIR=data/full`，即前端展示的 66 家店。这份数据和交付的 `data/latest`（7 家）字段完全相同，后者那 7 家也都包含在内。
- 单元测试仍用交付的 7 家快照：`.venv/bin/python -m unittest discover -s tests`，共 117 项，全部通过。

## 二、需要 NVIDIA GPU 的部件：原方案保留，另配本机方案

| 部件 | 原方案（保留，代码路径不变） | 本机方案 | 本机实测 | 直播默认用 |
|---|---|---|---|---|
| 语音合成：CosyVoice 3 | `scripts/cosyvoice_service.py`，CUDA + fp16 | 同一个服务新增 `COSYVOICE_DEVICE=mps`：LLM 和 flow 跑在 Apple GPU 上，HiFT 声码器留在 CPU（它的 F0 预测器用 float64，MPS 不支持）。直接沿用本机已有的 `~/.venvs/cosyvoice311` 环境和 `~/tts/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B` 权重，与 `config/cosyvoice-model-manifest.json` 逐个文件比对，大小一致。启动脚本：`start_cosyvoice_mac.sh` | MPS：实时率 6.9–7.2，首个音频块要 15–20 s；CPU：实时率 7.1–8.7。都比实时慢约 7 倍 | **不用于直播。** 直播用 macOS 系统语音（`providers/macos_tts.py`，见下）。CosyVoice 只适合离线预合成 |
| 语音识别：faster-whisper small | CUDA `int8_float16` 或 CPU `int8` | `providers/stt_transformers.py`：本机缓存里已有的 Whisper large-v3-turbo，在 Apple GPU 上以 fp16 运行。设 `WHISPER_BACKEND=transformers` 启用，接口与原适配器相同，仍是句末一次转写 | 5 s 语音转写 0.9–1.5 s（同模型 CPU 约 3.3 s）；加载约 16 s，加载时预热，首次按住说话不用额外等 | ✓ |

**macOS 系统语音（`providers/macos_tts.py`）**

- 用 `say` 按小分句渲染成 24 kHz PCM，按 20 ms 一帧流式发出，对应 Windows 方案里的 `windows_tts.py`。
- 文本经标准输入传入。被打断时，正在进行的渲染会被结束。
- 第一次用到某个音色要加载几秒，会话开始时会预热。
- 渲染速度：约 3 s 的句子用 0.8–1.6 s。

## 三、为适配前端所做的改动

**配置（`server/config.py`）**

- `EAT_WHAT_ENV_FILES`：在 `.env.local` 之后原地读取其他 env 文件，不覆盖已有的值，也不打印。
- `CONSOLE_DATA_DIR`、`PLAYBACK_ACK_TIMEOUT_SECONDS`（默认仍是 12）、`LLM_REASONING_EFFORT`、`LLM_FALLBACK_*`、`WHISPER_BACKEND`。
- 在 macOS 上 `TTS_PROVIDER` 默认改为 `macos`。

**模型（`server/providers/llm.py`）**

- **`reasoning_effort`：** 环境变量设置后随请求发送。Gemini 默认会思考，思考会占用 `max_tokens`，这里设为 `none`。
- **`FallbackLLM` 与 `make_llm`：** 所有智能体（调度器和各家餐厅）先用已有设置 `LLM_*`。主模型在开始输出之前失败时，自动改用备用 `LLM_FALLBACK_*`。算作失败的情况：连不上、密钥被拒、模型不存在、5xx、超时。
  - 切换后 5 分钟内先用备用（`LLM_FALLBACK_COOLDOWN_SECONDS`），避免每轮都等主模型超时。
  - 已经开始输出后才出错，不会中途换模型。
  - 日志只记模型名、主机名和状态码。
- **实测切换：** 主模型故意指向不存在的模型时被拒（403），备用接着回答，总共 2.9 s；下一次直接用备用。
- **备用模型：** DeepSeek V4.1 Flash，模型标识 `deepseek-pro`，密钥只存在被忽略的 `Frontend/.env` 里。还缺发放方提供的接口地址 `LLM_FALLBACK_BASE_URL`，填上即可生效。

**前端的店主（`server/voices.py`、`console_persona.py`、`realtime_console.py`）**

- `session.start` 和 `restaurants.update` 可以带 `characters: {shop_uuid: {characterName, gender, age}}`，即前端为每家店生成的店主。
- 后端用这个名字说话（`nameSource: frontend`），因此台上人物、名牌和台词里的自称一致。
- 语气和接招习惯仍按后端自己对这家店的判断（`backendCharacterName`），交付时调好的 7 个角色口吻不变。
- 音色按性别和年龄分配，尽量不重复。macOS 用 9 个普通话音色，老人用 Grandma 或 Grandpa；CosyVoice 用 rong、hua、pierre。没有提供店主信息时，仍按原来的位置轮换。

**声音开关（`control: audio` 加 `deferred: true`）**

- 不打断台上正在说的这句，从下一轮起生效；前端同时把正在播的这句静音。
- 不带这个参数时行为照旧。

**调度（`console_coordinator.conversation_balance`）**

- 新增只读字段 `speakerCounts` 和 `notYetSpoken`。有店还没开口、前面又只在两三家之间来回时，节奏提示会请调度器先让没开口的店参与。仍然只是提示，用户的新问题优先。
- **起因：** 5 家同台实测 12 轮，只有 2 家说过话。
- **加了提示之后：** 前 6 轮 5 家全部亮相；之后围绕用户的问题，由最相关的两家继续交锋。

**续接讨论（`session.start` 的 `history`，`console_resume.py`、`realtime_console.py`）**

- **起因：** 顾客离开辩论页再回来（看店铺详情、刷新页面、断线重连）时，前端会新开一个会话。原后端只把讨论历史存在会话内存里，也没有续接接口（交接文档写明了这一点）。新会话因此从头开场，各家再自我介绍一遍，之前的交锋全部丢失。
- **新字段：** `session.start` 可以带 `history`，即前端已经演完的台词，按时间先后排列。
  - 餐厅的回合：`{turnId, restaurantId, text, evidenceIds}`。turnId 用台词 id，也就是原会话的 turnId，所以新会话的 `replyTo` 能接着引用它们。
  - 顾客的话：`{role: "user", text}`。
- **校验：** 不合格的项直接丢弃，不报错。
  - 每项须是对象；`text` 须是非空字符串，超过 600 字截断。
  - 餐厅回合的 `turnId` 须为 1–64 个字母、数字或 `_:.-`，且不重复；`restaurantId` 须在本次的 `restaurantIds` 里；`evidenceIds` 须是数组。
  - 证据 ID 只保留台上各店资料里确实存在的，去重后最多 12 条。
- **条数：** 一次最多读最近 200 项。会话的 `history` 只保留最近 40 项，与现场会话相同；亮过相的店和用过的证据则按读到的全部回合统计，长场次里早先只说过一句的店也不会再自我介绍。
- **写入后的状态，与同一会话一直讲下来相同：**
  - 回合标为 `presentation: ended`（已听完），可以被 `replyTo` 引用；
  - 说过话的店记入 `introduced`，之后不再自我介绍；还没开口的店照常首次亮相；
  - 这些回合引用过的证据记入 `used`，不再作为新资料交给调度器。已听回合的证据仍按原设计随历史带上，供回应时引用原始依据，这一点和现场会话一样；
  - 回合数记入 `index`，选资料的轮换接着往下走；
  - 顾客的话依次更新偏好，与收到 `user.text` 时相同；
  - 最后一项若是顾客的话，说明还没有人回答，它仍是当前问题（`userQuestion`）。
- **调试事件：** 续接时发出 `trace: session.resumed`，内容包括收到的条数、恢复的回合数、顾客的话数、已亮相的店、已讨论的证据和待回答的问题。
- **不变的部分：** 不带 `history` 的 `session.start` 行为不变；`control: reset` 仍从头开始，不带历史。
- **实测：** 5 家同台，讲了 5 句、顾客插了一句之后离开，去看店铺详情，再返回。
  - 第一次返回：`session.start` 带回 6 项，即 5 句台词和顾客的问题。侯伯直接回答了这个问题（「回答你」），没有再自我介绍；之前还没开口的龙叔第一次亮相。
  - 第二次返回：带回 9 项。谢叔、侯伯直接接着聊，谢叔还回击了侯伯的对比。
  - 整场 14 句，每家只自我介绍了一次。

**数据（`console_data.py`）**

- 抓取数据里有些行属于店铺表以外的店（推荐菜 60 行，评论 210 行，等等），现在跳过这些行并计数，不会因此启动失败。

**地方菜店主说方言（`server/console_localize.py`，新增）**

- **做法：** 移植自 agent-studio 的改写器（`agent-studio/server/llm.py` 的 `Localizer`）。
  - 台词照旧先用普通话写好、通过全部检查（证据里的数字、字数、重复攻击点）。
  - 然后对说方言的店主，把这句改写成他的方言再配音；普通话原句留作「原文释义」，前端显示在字幕下方。
  - 改写提示词：四川话、粤语、法语沿用 agent-studio 的原提示词和片中例句；湖南话、上海话、东北话补了例句；其余地方话用 agent-studio 的通用提示词。
- **谁说方言：** 前端生成店主时已经按菜系定了口音（川菜→四川话，粤菜和潮汕牛肉火锅→粤语，湘菜→湖南话……），随 `session.start` 的 `characters[id].language` 送来。
  - 只有地方话和法语会改写。
  - 外国口音普通话（英式、日式等）不改写，因为人格提示里已经有外来语感。
- **保底：** 以下情况都按普通话原句说，并在 `trace: dialect.rewrite` 里记下原因：
  - 改写丢了阿拉伯数字；
  - 丢了角色名或店名（自我介绍时两样都要保留）；
  - 结果为空或过长；
  - 12 s 内没完成。
  - 同一句改写结果会缓存。
- **接入（`realtime_console.py`）：**
  - `prepare_turn` 在检查通过后调用 `speak_dialect`：每个片段的 `text` 换成方言，`gloss` 存普通话。
  - `speech.ready` 和 `text: done` 带上 `gloss`；`speech.ready` 另带 `language`。
  - 改写发生在预生成阶段，所以通常藏在上一句的播放时间里。只有开场第一句和插话后的第一句，会多等一次模型调用（约 1–3 s）。
- **音色（`voices.py`）：** `parse_characters` 接受 `language`。说粤语的女店主用 macOS 的粤语音色 Sinji；系统没有男声粤语，男店主仍用普通话音色念粤语字幕。

**语音识别提示词（`stt_transformers.py`）**

- 实测发现，「店名（角色）、…」形式的提示词会让 Whisper 模仿全角括号、截断最后一个字，还把「不吃辣」写成「不吃啦」。
- 现在改成用纯词表（店名、角色名，加上预算、不吃辣等常用词），转写恢复正常。
- 这个改动只影响本机方案，faster-whisper 原路径不受影响。

**CosyVoice 服务（`scripts/cosyvoice_service.py`）**

- 新增设备选择（auto 依次尝试 cuda、mps、cpu），可用 `COSYVOICE_DIR` 和 `COSYVOICE_MODEL_DIR` 复用已有安装。
- 缓存目录的环境变量若已设置就不覆盖，这样能沿用已下载的 wetext。
- 在 MPS 和 CPU 上，启动时先合成一句预热。

## 四、没有改的部分

- 协议：通信外壳、二进制帧、回合与 epoch、回执规则（`ended` 必须等于已发送的全部样本数）。
  - 命令只新增了可选字段：`session.start` 和 `restaurants.update` 的 `characters`（含 `language`），`session.start` 的 `history`，`control: audio` 的 `deferred`。不带时行为照旧。
  - 事件只新增了可选字段：方言店主的 `speech.ready` 带 `gloss` 和 `language`，`text: done` 带 `gloss`。
- 调度、人格、证据检查、攻击点记忆、预生成，以及取消逻辑。
- faster-whisper 和 CUDA 的原有路径。
- 调试控制台和旧 Demo。

## 五、测试

- `tests/test_llm_fallback.py`（7 项）：备用切换、冷却、开始输出后不再切换、工厂函数。
- `tests/test_frontend_adaptation.py`（6 项）：前端店主名与口吻保留、店主信息校验、音色分配、参与度提示、macOS 语音渲染与取消。
- `tests/test_console_resume.py`（6 项）：续接历史的校验与条数上限；续接后已亮相的店不再自我介绍，没开口的店仍须亮相；用过的证据不再作为新资料，新一轮也不再引用；顾客没人回答的问题优先作答，并更新偏好；长场次只保留 40 项，但亮相按全部回合统计；`reset` 从头开始；不带历史时照旧开场。
- `tests/test_console_localize.py`（5 项）：方言改写与原文释义、丢数字或丢名字时不用改写、普通话和外国口音不改写、超时保底、各地方话都有提示词、粤语音色分配。
- 原有 98 项全部通过；合计 122 项。

## 六、已知问题（交付版本里原有的）

- **不配模型时的规则模式跑不通：**
  - 规则调度给出的计划里没有 `evidenceIds`，而 `prepare_turn` 只保留计划点名的资料，第一轮就报 `KeyError: 'evidenceIds'`；
  - 补上这一项后，规则模板的台词（「有位客人提过：……」、超过字数）又过不了后端自己的发言检查。
  - 所以后端实际上离不开模型。这里没有改，留给后端负责人决定：是修好规则模式，还是去掉它。
