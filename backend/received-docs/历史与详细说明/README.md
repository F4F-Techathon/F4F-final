# 今晚吃啥：可迁移的多智能体餐厅讨论 Demo

这是一个面向移动端的两天黑客松版本。用户可以持续表达需求、打断发言、换掉餐厅、查看原始评论证据，最后让主持人总结推荐。

系统把 LiveKit 限定为实时传输层。房间中只有用户和一个 Voice Host Worker；Host、Preference、Restaurant、Evidence Verifier、Judge 都是后端逻辑 Agent，共享同一个 LLM Provider，不消耗多个 LiveKit Agent 会话。

## 当前已实现

- 两家 active 餐厅和一家 holding 餐厅的动态 roster。
- 预算、菜系、场景、过敏信息的 User Profile 提取。
- 用户明确拒绝后换店，保留已有偏好。
- 真实“丁香小鲜”数据与两个明确标记的模拟餐厅。
- Evidence ID、源工作表、源行号、原文高亮和引用校验。
- 规则兜底与 OpenAI-compatible LLM 双路径。
- LiveKit Token API、DataChannel 事件契约和单 Voice Host Worker。
- Silero VAD 打断、faster-whisper 本地转写、CosyVoice 本地音频发布适配器。
- 无外部凭证可运行的本地演示模式；浏览器支持时使用系统语音朗读和语音输入。
- LiveKit Cloud 与自托管 LiveKit 共用同一套代码。
- 角色外观和八类 SVG 表演状态由 `web/characters/manifest.json` 统一管理。

## 快速启动：零付费演示模式

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn server.app:app --host 0.0.0.0 --port 8770
```

打开 `http://127.0.0.1:8770`。不配置 LiveKit、LLM 或 CosyVoice 也可以完成以下流程：

1. 输入“人均预算150，适合朋友聚餐”。
2. 输入“我花生过敏”。
3. 输入“我不要蓉姐川味了，换一家”。
4. 点击餐厅发言下方的证据按钮，查看评论原文位置。
5. 输入“现在帮我总结并推荐一个”。

## 配置 DeepSeek-compatible API

复制 `.env.example` 为 `.env.local`，填写：

```dotenv
LLM_BASE_URL=https://你的服务商提供的兼容接口地址
LLM_MODEL=deepseek-pro
LLM_API_KEY=运行时密钥
```

`deepseek-pro` 不是本项目可以推断其接口地址的公共模型名，因此 Base URL 必须以密钥服务商给出的 OpenAI-compatible 地址为准。Key 不应写入源码或 `.env.example`。

LLM 返回无效 JSON、超时或不可用时，系统自动使用可验证的规则兜底，不会自动切换到其他付费服务。

## Windows RTX 4080 实时语音链路

推荐继续使用已经可运行 CosyVoice 的 Conda 环境：

```powershell
pip install -r requirements-livekit.txt
```

在 `.env.local` 配置 LiveKit、CosyVoice 和 Whisper：

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
COSYVOICE_DIR=C:/path/to/CosyVoice
WHISPER_MODEL=small
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=int8_float16
```

分别启动：

```powershell
python -m uvicorn server.app:app --host 0.0.0.0 --port 8770
python -m server.livekit_worker dev
```

浏览器点击右上角“本地演示”即可加入 LiveKit。麦克风持续发布到房间；Silero 检测到用户开始说话时立即取消当前 CosyVoice 播放，语句结束后由 faster-whisper 转写并交给 Multi-Agent Orchestrator。

仓库中的三个配置样例对应同一套代码：

- `deploy/cloud-local-gpu.env.example`：LiveKit Cloud + Windows 本地 Ollama/STT/TTS，比赛默认。
- `deploy/selfhost-local-gpu.env.example`：自托管 LiveKit + Windows 本地 Ollama/STT/TTS。
- `deploy/cloud-ai-fallback.env.example`：本地模型故障时才填写外部 LLM 的 Base URL 和 Key。

使用时把选定的样例复制为 `.env.local`。Ollama 的本地 OpenAI-compatible 接口不要求 API Key。

## 自托管迁移

开发机可使用 Docker Desktop / WSL2：

```powershell
docker compose -f deploy/docker-compose.selfhost.yml up -d
```

然后只修改：

```dotenv
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret-change-before-exposure
```

前端、事件协议、Multi-Agent、STT、LLM、TTS 均无需修改。手机浏览器需要 HTTPS 安全上下文；比赛可使用临时 HTTPS Tunnel，自有部署可参考 `deploy/Caddyfile.example`。公网自托管还需要按 LiveKit 官方文档配置域名、TLS、TURN、外部 IP 和防火墙，示例 Compose 仅用于单机演示。

## 数据刷新

```powershell
python scripts/import_restaurants.py sample_丁香小鲜.xlsx data/restaurants.json
```

导入器保留评论原文，并以 `shop_uuid + 工作表 + 行号 + 原文` 生成稳定 Evidence ID。两个模拟餐厅始终带 `isDemo: true`，界面不会把它们伪装成真实商户。

## 事件契约

前端只消费这些业务事件：`room.snapshot`、`roster.changed`、`speech.started`、`speech.chunk`、`speech.ended`、`speech.interrupted`、`profile.updated`、`evidence.available`、`decision.final`。角色 SVG 状态由后端的 `speechAct + emotion` 决定，前端仅在 Manifest 白名单中选择 `idle/listening/presenting/challenging/defending/thinking/selected/leaving`，不再调用模型判断表情。当角色换成预制 SVG 文件时，只需替换 Manifest 和渲染器，事件协议不变。

## 测试

```powershell
python -m unittest discover -s tests -v
```

测试覆盖初始 roster、偏好更新、明确换店、Evidence 归属、最终推荐和模拟数据标记。
