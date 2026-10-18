# 《今晚吃啥》黑客松 Demo 交接文档

> 交接快照：2026-10-17  
> 目标设备：Windows + NVIDIA RTX 4080  
> 项目定位：移动端 Web 中的实时语音 Multi-Agent 餐厅决策 Demo

## 1. 当前状态

项目已经可以在不配置任何付费 API 的情况下运行完整文字 Demo，并在支持 Web Speech API 的浏览器中提供“点击麦克风说话 + 系统语音朗读”的本地语音演示。

真正的 LiveKit 持续通话链路已完成代码和依赖层面的校验，但必须在 Windows 4080 上填写 LiveKit/CosyVoice 配置后进行最后的真实麦克风、CUDA 和端到端音频联调。

### 已完成

- 移动端餐厅辩论舞台、字幕、聊天记录、候场区和动态 Roster。
- Host、Preference、Restaurant、Evidence Verifier、Judge 五种逻辑 Agent。
- 同时最多两家 active 餐厅，第三家进入 holding room。
- 用户明确拒绝后，Host 移出旧餐厅、换入候场餐厅，并保留已有偏好。
- 预算、菜系、聚餐场景和过敏信息的 User Profile 提取与 SQLite 存储。
- “丁香小鲜”真实商户数据，以及两个始终显示“演示数据”标记的模拟餐厅。
- Evidence ID、引用校验、源工作表、原表行号、原文定位与 Unicode/Emoji 安全高亮。
- 统一 `TurnEnvelope`，包含 `speechAct` / `emotion` / `targetAgentId` / `evidenceIds` / `visualState`。
- SVG 角色 Manifest 和八类表演状态：`idle`、`listening`、`presenting`、`challenging`、`defending`、`thinking`、`selected`、`leaving`。
- 最终 Judge 推荐和“今晚首选” SVG 状态。
- LiveKit Token API、DataChannel 事件、单 Voice Host Worker 和远程音轨发布。
- Silero VAD 说话开始检测、取消 CosyVoice 播放、faster-whisper 句末转写。
- CosyVoice 按短句生成并分帧发布，不同角色使用不同参考音色。
- OpenAI-compatible LLM Provider，可接 Ollama 或外部 DeepSeek-compatible 服务。
- LLM/STT/TTS 失效时可见降级；LLM 使用可验证规则兜底，不会自动切换付费服务。
- LiveKit Cloud + 本地 GPU、自托管 LiveKit + 本地 GPU、外部 LLM fallback 三份配置样例。

### 已实测

- Multi-Agent 单元测试 5/5 通过。
- FastAPI 页面、Manifest、Bootstrap、Profile、Evidence 和完整文字 Turn 通过。
- LiveKit Python SDK 实际安装，Worker 可导入，CLI 可正常显示 `dev/start/console`。
- LiveKit Token API 已用测试密钥生成有效 JWT。
- Silero VAD 模型已在本机成功初始化。
- 浏览器实测了预算更新、动态换店、Evidence 弹层、最终推荐和 SVG 选中状态，控制台无错误。

### 还需在目标电脑完成

- 确认 NVIDIA 驱动、CUDA 和 CosyVoice 环境已可用。
- 填写 LiveKit Cloud 凭证，或启动自托管 LiveKit。
- 填写 `COSYVOICE_DIR`，实测三份参考音色。
- 使用真实麦克风测试回声消除、VAD 阈值、说话即打断和音频回传。
- 测量“用户开始说话 → 远端语音停止”时延，目标不超过 700ms。
- 如使用 `deepseek-pro`，向密钥服务商确认准确的 OpenAI-compatible Base URL。
- 手机真机演示必须使用 HTTPS，需配置 Tunnel 或 Caddy/域名。

## 2. 系统架构

```text
移动端浏览器
  ├─ WebRTC：用户麦克风 / Voice Host 音轨
  └─ DataChannel：字幕、Roster、Profile、Evidence、SVG 状态
             ⇅
       LiveKit Room
             ⇅
Voice Host Worker（Windows RTX 4080）
  ├─ Silero VAD
  ├─ faster-whisper small
  ├─ Multi-Agent Orchestrator
  │    ├─ Host Agent
  │    ├─ Preference Agent
  │    ├─ Restaurant Agents
  │    ├─ Evidence Verifier
  │    └─ Judge Agent
  ├─ Ollama/Qwen 或 DeepSeek-compatible API
  ├─ CosyVoice
  └─ restaurants.json + SQLite
```

餐厅 Agent 是后端逻辑角色，不是独立 LiveKit Participant。LiveKit 房间中只需用户和一个 Voice Host Worker，因此不会因 Agent 数量增加连接成本。

## 3. 迁移时应该拷贝什么

必须拷贝：

- `server/`
- `web/`
- `data/restaurants.json`
- `voices/`
- `deploy/`
- `scripts/`
- `tests/`
- `requirements.txt`
- `requirements-livekit.txt`
- `.env.example`
- `.gitignore`
- `start_windows.ps1`
- `README.md`
- `HANDOFF.md`

不要从 Mac 拷到 Windows：

- `.venv/`：当前是 macOS ARM 二进制环境，约 435MB，Windows 无法使用。
- `node_modules`：当前仅用于本地工具，运行 Demo 不需要。
- `__pycache__/` 和 `*.pyc`。
- `data/sessions.sqlite3`：只是测试期间的会话状态，新电脑会自动创建。
- `.env.local`、`.env` 或任何 API Key。

原始 Excel 不是运行必需项，现有数据已转为 `data/restaurants.json`。如果后续需要重新导入数据，再单独传输原始工作簿。

## 4. Windows 4080 安装与启动

### 4.1 建议环境

- Windows 11
- NVIDIA 驱动和与 CosyVoice/PyTorch 匹配的 CUDA
- Python 3.10 或 3.11
- Git（可选）
- Docker Desktop / WSL2（仅自托管 LiveKit 时需要）
- Ollama（仅本地 LLM 时需要）

建议把项目放在简短路径，例如 `C:\hackathon\eat-what`。

### 4.2 安装 Python 依赖

```powershell
cd C:\hackathon\eat-what
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-livekit.txt
```

CosyVoice 如果已有独立 Conda 环境，优先在那个已经能正常调用 CUDA 的环境中安装本项目依赖，避免重复安装不匹配的 PyTorch。

### 4.3 选择配置模式

比赛推荐：

```powershell
Copy-Item deploy\cloud-local-gpu.env.example .env.local
```

自托管：

```powershell
Copy-Item deploy\selfhost-local-gpu.env.example .env.local
docker compose -f deploy\docker-compose.selfhost.yml up -d
```

使用外部 LLM：

```powershell
Copy-Item deploy\cloud-ai-fallback.env.example .env.local
```

然后用文本编辑器填写 `.env.local`。不要把该文件发到群里或提交到 Git。

### 4.4 LLM 二选一

方案 A：本地 Ollama，无付费 API 依赖。

```powershell
ollama pull qwen2.5:3b
```

```dotenv
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=qwen2.5:3b
LLM_API_KEY=
```

方案 B：DeepSeek-compatible API。

```dotenv
LLM_BASE_URL=由密钥服务商提供的 OpenAI-compatible 地址
LLM_MODEL=deepseek-pro
LLM_API_KEY=新密钥
```

目前不能只根据 `deepseek-pro` 模型名推断 Base URL。旧密钥曾出现在聊天中，交接前应当轮换，不要继续使用或写入交接包。

### 4.5 启动

终端 1：

```powershell
.\.venv\Scripts\Activate.ps1
.\start_windows.ps1
```

终端 2：

```powershell
.\.venv\Scripts\Activate.ps1
python -m server.livekit_worker dev
```

电脑本机打开 `http://127.0.0.1:8770`。不要直接双击 `web/index.html`；`file://` 方式无法访问 API、Manifest 和 LiveKit Token。

手机浏览器访问时需 HTTPS。比赛可使用临时 Tunnel，正式部署可参考 `deploy/Caddyfile.example`。

## 5. 语音模式说明

| 模式 | 触发方式 | 输入 | 输出 | 是否支持真打断 |
|---|---|---|---|---|
| 本地演示 | 不配置 LiveKit | 点击麦克风后使用 Web Speech API | 浏览器 SpeechSynthesis | 仅可取消本地朗读 |
| LiveKit 实时 | 配置 LiveKit 并启动 Worker | 麦克风持续 WebRTC 推流 | CosyVoice → LiveKit 远程音轨 | 是，VAD 检测说话即取消播放 |

页面右上角显示“本地演示”时，当前不是 LiveKit 持续通话。配置完成后点击该按钮连接房间，成功后会显示“LiveKit 实时”。

## 6. 推荐演示脚本

1. 用户：“人均预算150，想找适合朋友聚餐的。”
2. 观察 Host 更新 Profile，两家 active 餐厅依次发言。
3. 用户在餐厅说话时插话：“我花生过敏。”
4. 观察语音被打断、Profile 出现“花生过敏”，后续推荐不再违反忌口。
5. 用户：“我不要蓉姐川味了，换一家。”
6. 观察蓉姐离场、Pierre 从 holding 进入 active，原偏好仍保留。
7. 点击“原评”，展示来自 Excel 的完整原文、行号和原位高亮。
8. 用户：“现在帮我总结并推荐一个。”
9. Judge 输出取舍，被选餐厅进入 `selected` 状态并显示“今晚首选”。

## 7. 事件协议

前端和 Voice Host 之间使用固定 DataChannel 事件：

- `room.snapshot`
- `roster.changed`
- `speech.started`
- `speech.chunk`
- `speech.ended`
- `speech.interrupted`
- `profile.updated`
- `evidence.available`
- `decision.final`

餐厅 Agent 的发言统一使用 `TurnEnvelope`。前端不应自行调用 LLM 判断 SVG，只根据后端 `visualState` 在 Manifest 白名单中切换。

## 8. 关键文件

| 文件 | 职责 |
|---|---|
| `server/app.py` | FastAPI、Token API、Demo API、Evidence API、静态页面 |
| `server/livekit_worker.py` | LiveKit 房间、音轨、DataChannel、VAD、STT、TTS 和打断 |
| `server/orchestrator.py` | Multi-Agent 流程、Roster、Profile、Judge 和规则兜底 |
| `server/evidence.py` | Evidence ID 的存在性和归属校验 |
| `server/providers/` | 可替换 STT/LLM/TTS Provider |
| `server/store.py` | SQLite 会话状态 |
| `web/app.js` | LiveKit 前端、事件消费、Roster、Evidence 和本地语音演示 |
| `web/rigkit.js` | 程序化内联 SVG 角色渲染和表情状态 |
| `web/characters/manifest.json` | 角色外观与允许的 SVG 状态 |
| `data/restaurants.json` | 统一餐厅与 Evidence 数据 |
| `scripts/import_restaurants.py` | Excel 到餐厅 JSON 的可重复导入 |
| `deploy/*.env.example` | 三种可迁移部署配置 |

## 9. 检查与验收

运行自动测试：

```powershell
python -m unittest discover -s tests -v
```

检查 API：

```powershell
Invoke-RestMethod http://127.0.0.1:8770/api/health
```

预期字段：

```json
{
  "ok": true,
  "livekit": true,
  "llm": true,
  "llmModel": "qwen2.5:3b 或 deepseek-pro",
  "data": 3
}
```

`livekit` 或 `llm` 为 `false` 不代表 Web Demo 不能运行，但表示相应实时能力尚未配置。

验收项：

- [ ] 无付费 API Key 时文字全流程可运行。
- [ ] 首轮两家 active、一家 holding。
- [ ] 用户过敏/预算会更新 Profile。
- [ ] 明确拒绝后才换店。
- [ ] Evidence 能定位原表行和高亮文本。
- [ ] 餐厅说话时角色 SVG 状态与字幕同步。
- [ ] 用户插话后 700ms 内停止正在播放的语音。
- [ ] Judge 只在用户要求总结时作出最终推荐。
- [ ] 本地模型失败时显示降级状态，不伪造语音或 Evidence。
- [ ] 改用自托管 `LIVEKIT_URL` 后不需修改业务代码。

## 10. 建议分工

- **老邵 / 实时与 Multi-Agent**：Windows 上的 Worker、VAD 参数、STT/LLM/TTS Provider、LiveKit 打断和时延。
- **步卓阳 / 前端与表演**：移动端布局、SVG Manifest、动画、字幕、Roster 和 Evidence 交互。
- **数据负责人**：继续补齐真实餐厅、校验 Evidence 原文和导入规则。
- **视觉/产品负责人**：状态覆盖、信息层级、手机真机验收和现场演示脚本。

## 11. 已知风险

- `deepseek-pro` 可能是某个具体服务商的模型别名，不应默认它等于 DeepSeek 官方模型名。
- CosyVoice 首次加载和首句合成可能较慢，比赛前应预热 Worker。
- 真实双向语音中的回声消除主要依赖 WebRTC/浏览器端，现场音箱环境需单独测试。
- 当前是单用户、单房间 Demo，没有账号系统、跨设备 Profile 同步或生产级鉴权。
- 演示数据只有三家餐厅；接入真实数据源后，Host 的候选检索需扩展为向量检索或结构化过滤。

## 12. 安全要求

- API Secret 永远不下发前端，前端只向 `/api/livekit/token` 请求短期 Token。
- `.env.local` 已在 `.gitignore` 中，交接包中不应包含该文件。
- 曾在聊天、截图或现场展示中出现过的密钥都应视为已暴露并立即轮换。
- 不要把原 ZIP 中的 `.env` 复制进新电脑项目。

