# Windows + NVIDIA GPU：完整运行（含语音）

这份说明对应完整项目包（`npm run handover -- --with-backend` 打出的 zip）。在一台装有 NVIDIA 显卡的 Windows 电脑上，把手机界面、多智能体后端和语音一起跑起来：

| 部件 | 跑在哪里 | 端口 |
|---|---|---|
| 配音：CosyVoice 3 | GPU（CUDA，fp16） | 8772 |
| 识别：Whisper large-v3-turbo（faster-whisper） | GPU（CUDA） | 由后端内部调用 |
| 多智能体后端：调度器和各家餐厅 | CPU，调用云端大模型 | 8771 |
| 手机界面和导演台 | Node.js | 3000 |

配音这条路线就是后端交付时实测过的方案（见 `backend/received-docs/01-后端部署.md` 第 3 节），这里只加了一键启动和本项目需要的设置。

> **注意：** 这套 Windows 启动脚本是按交付文档写的，没有在 Windows 实机上跑过。第一次部署请按下面的顺序逐步确认，每一步的检查方法都写在后面。

## 1. 准备

- **系统：** Windows 10 / 11，64 位。
- **显卡：** NVIDIA 显卡，显存建议 8 GB 以上。装好较新的驱动，命令行运行 `nvidia-smi` 能看到显卡，且显示的 CUDA 版本不低于 12.1。
- **Python：** 从 python.org 装两个版本，3.11 和 3.10，安装时勾选 py launcher。
  - 3.11 给后端；
  - 3.10 给 CosyVoice。两套环境不要混用。
- **Node.js：** 22.18 以上或 24.12 以上。
- **磁盘：** 约 15 GB，用于模型和两套 Python 环境。
- **解压位置：** 放在纯英文、不带空格的路径下，例如 `F:\what-to-eat`。CosyVoice 的依赖对中文路径不友好。

解压后的目录：

```
what-to-eat-full-YYYYMMDD\
  start.bat                 只启动界面（不含语音）
  start-windows-gpu.cmd     一键启动：配音、后端、界面各开一个窗口
  .env.example              密钥模板（界面和后端共用）
  docs\                     说明文档（本文在这里）
  backend\
    ADAPTATIONS.md          后端为本项目做的改动
    received-docs\          后端原始交接文档
    eat-what-backend\       多智能体后端源码、66 家店数据、CosyVoice 源码
```

## 2. 密钥（只填一处）

在解压目录（界面根目录）把 `.env.example` 复制为 `.env.local`，然后填写：

- **`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`：** 所有智能体共用的模型，包括后端的调度器和各家餐厅，以及界面的需求整理。
- **`LLM_FALLBACK_BASE_URL`、`LLM_FALLBACK_MODEL`、`LLM_FALLBACK_API_KEY`：** 备用模型（DeepSeek V4.1 Flash，模型名 `deepseek-pro`）。这几行在 `.env.example` 里是注释，去掉行首的 `#` 再填。主模型连不上、密钥被拒或额度用完时，自动切到这里。
  - 接口地址要向密钥发放方确认后填写，不能凭模型名猜。
  - 不填地址时，备用模型不会启用。
- **`TYPESAFE_API_KEY`（Jev）、`AMAP_KEY` 和 `AMAP_SECURITY_CODE`（高德地图）：** 见 HANDOVER.md 第 7 节「环境变量」。

后端不保存密钥。`start_api_windows.cmd` 让后端原地读取界面目录的 `.env.local` 和 `.env`。

## 3. 一次性安装

以下命令都在 `backend\eat-what-backend` 目录里，用 PowerShell 运行。

**后端环境（Python 3.11）：**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-handoff.txt
# 让 faster-whisper 在 GPU 上识别：CUDA 12 的 cuBLAS 和 cuDNN 9
.\.venv\Scripts\python.exe -m pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*"
```

**CosyVoice 模型（约数 GB，会校验 SHA256）：**

```powershell
.\.venv\Scripts\python.exe scripts\download_cosyvoice.py
```

模型下载到 `runtime\CosyVoice\pretrained_models\Fun-CosyVoice3-0.5B`。

**CosyVoice 环境（Python 3.10，CUDA 12.1 版 PyTorch）：**

```powershell
py -3.10 -m venv runtime\cosyvoice-env
.\runtime\cosyvoice-env\Scripts\python.exe -m pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121
.\runtime\cosyvoice-env\Scripts\python.exe -m pip install -r requirements-cosyvoice-win.txt
```

**界面：** 不需要安装。zip 里已经带了构建好的页面，`start.bat` 只要 Node.js。

## 4. 启动

双击解压目录里的 `start-windows-gpu.cmd`，会打开三个窗口：

1. **CosyVoice 3 (GPU) :8772：** 加载模型要一两分钟。浏览器打开 `http://127.0.0.1:8772/health`，返回 ready 才算好。
2. **Multi-agent backend :8771：**
   - 第一次运行时，会把 `env.windows-gpu.example` 复制成 `.env.local`：配音走 CosyVoice，识别用 GPU 上的 large-v3-turbo。
   - 店铺数据用 `data\full`，即界面上的 66 家店。
   - 检查：`http://127.0.0.1:8771/api/health` 里 `llm` 为 true。
3. **App :3000：** 手机界面在 `http://localhost:3000/`，导演台在 `http://localhost:3000/director/`。

也可以分别启动，顺序不限：

- 配音：`backend\eat-what-backend\start_cosyvoice_windows.cmd`；
- 后端：`backend\eat-what-backend\start_api_windows.cmd`；
- 界面：`start.bat`。

## 5. 确认语音在 GPU 上

- 进入辩论页，状态条应显示「多智能体辩论中 · 模型名 · 语音 cosyvoice-http · 本地识别」。
- **配音：** 选手开口时，CosyVoice 窗口里有合成日志，`nvidia-smi` 能看到 Python 进程占用显存。
- **识别：** 第一次按住说话时，后端加载 Whisper（首次会下载 large-v3-turbo），之后转写一般在 1 s 左右。

## 6. 常见问题

| 现象 | 处理 |
|---|---|
| CosyVoice 窗口报 `COSYVOICE_DEVICE=cuda is not available` | PyTorch 不是 CUDA 版，或驱动太旧。用第 3 步的 cu121 地址重新安装 torch，再用 `nvidia-smi` 确认驱动 |
| 后端识别时报找不到 `cublas64_12.dll` 或 `cudnn*.dll` | 确认第 3 步的 `nvidia-cublas-cu12` 和 `nvidia-cudnn-cu12` 已装进 `.venv`。启动脚本会把它们的目录加进 PATH |
| 暂时只想先跑通 | 把 `backend\eat-what-backend\.env.local` 里的识别改成 `WHISPER_MODEL=small`、`WHISPER_DEVICE=cpu`、`WHISPER_COMPUTE_TYPE=int8`；配音改成 `TTS_PROVIDER=windows`，即 Windows 自带语音，不需要 CosyVoice |
| 状态条显示「暂时连不上模型」 | 主模型的密钥失效或额度用完，并且备用模型没有配好。检查 `.env.local` 里的 `LLM_*`，以及 `LLM_FALLBACK_BASE_URL` |
| 手机经局域网打开时麦克风不可用 | 麦克风需要 HTTPS，做法见 HANDOVER.md 第 1 节 |

## 7. 和 Mac 方案的区别

本机开发用的是 Mac（无 NVIDIA 显卡）：配音用系统语音，识别用 Apple GPU 上的 Whisper（`backend\eat-what-backend\start_mac.sh`），说明见 `backend\ADAPTATIONS.md` 第二节。

两套方案的协议、台词、方言改写和前端完全一样，只是 `.env.local` 里的语音设置不同。
