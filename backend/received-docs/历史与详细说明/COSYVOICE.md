# 本机 CosyVoice 3

代码、独立 Python、依赖、模型与缓存均放在 F 盘。官方项目：[CosyVoice](https://github.com/FunAudioLLM/CosyVoice)。模型为 `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`，下载后按官方清单逐个校验 SHA256，清单保存在模型目录的 `download-manifest.json`。

| 项目 | 位置 |
| --- | --- |
| 官方源码与 Matcha 子模块 | `F:\吃啥\runtime\CosyVoice` |
| 独立 Python 3.10 | `F:\吃啥\runtime\tools\uv-python` |
| 独立依赖环境 | `F:\吃啥\runtime\cosyvoice-env` |
| 模型 | `F:\吃啥\runtime\CosyVoice\pretrained_models\Fun-CosyVoice3-0.5B` |
| 下载缓存与临时文件 | `F:\吃啥\runtime\cache`、`F:\吃啥\runtime\tmp` |
| 服务日志 | `F:\吃啥\runtime\logs\cosyvoice.log` |

模型使用 RTX 4070 Ti / CUDA / FP16。声纹与语音 token 提取使用 CPU ONNX Runtime；没有安装 TensorRT/vLLM。Windows 推理依赖见 `requirements-cosyvoice-win.txt`；`setuptools<81` 是旧版 Whisper/Lightning 的兼容依赖，`pyworld==0.3.5` 使用 Windows 可用版本。没有安装训练或官方 Gradio 页面。

启动、检查、停止（在项目目录运行）：

```powershell
.\runtime\tools\python\python.exe scripts/manage_cosyvoice.py start
.\runtime\tools\python\python.exe scripts/manage_cosyvoice.py status
.\runtime\tools\python\python.exe scripts/manage_cosyvoice.py stop
```

后台进程隐藏窗口，仅监听 `127.0.0.1:8772`。`GET /health` 返回模型、CUDA、采样率和完成/取消次数。`POST /tts` 接收 `{ "text": "台词", "voice": "rong" }`，返回 24kHz、单声道、s16le PCM 流；`voice` 支持 rong、hua、pierre，对应项目已有的三个参考 WAV。当前使用 zero-shot 模式，尚未按每家餐厅配置方言/外国口音指令，口音表现需要另外听测，安装完成不等于口音已调好。

配置文件 `.env.local` 中使用 `TTS_PROVIDER=cosyvoice-http`、`COSYVOICE_URL=http://127.0.0.1:8772`。控制台管理脚本会自动启动此服务。8771 的控制台已切换；旧 LiveKit worker 只有重启后才会读取此配置。前端收音、播放、结构化文本和音频绑定协议不变。

HTTP 断连会停止后续 token 生成；当前 GPU 运算收尾并清理缓存后释放模型锁。取消后不再把旧音频发给前端。服务串行使用 GPU，避免多个会话同时争抢显存。文本已由上游拆为短句，服务不再次分段；当前未启用 wetext 数字标准化。

验证命令：

```powershell
.\runtime\tools\python\python.exe scripts/validate_cosyvoice.py
```

该测试真实生成三份音频，检查 PCM 非空、采样率、音量及中途取消，不开启麦克风。结果与试听文件在 `F:\吃啥\artifacts\cosyvoice-validation.json`、`cosyvoice-rong.wav`、`cosyvoice-hua.wav`、`cosyvoice-pierre.wav`。测得的首包耗时仅供本机参考，不是延迟保证。
