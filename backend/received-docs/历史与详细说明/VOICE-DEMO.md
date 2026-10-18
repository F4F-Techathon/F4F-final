# 语音演示

项目、独立 Python、依赖、模型、缓存、日志均位于 `F:\吃啥`。语音服务使用 `runtime/tools/python/python.exe`，避免现有 Anaconda 与原生语音扩展的兼容问题。

双击 `start_voice.cmd` 启动本机 LiveKit、Web 和 Voice Worker，然后访问 http://127.0.0.1:8770 ，点击“开始语音对话”。双击 `stop_voice.cmd` 可停止本项目启动的服务。

当前实际链路：浏览器麦克风 → 本机 LiveKit → Silero VAD → GPU faster-whisper small → 餐厅协调逻辑 → Windows 中文离线音色 → LiveKit 音轨 → 浏览器。CosyVoice 适配器仍可选择，当前没有安装其模型，正在使用 Windows 离线音色。

## 当前交互

- 连接后餐厅自行轮流发言，无需逐次输入命令。规则模式会轮换预算、菜品、场景、短板、对比和原评等角度。
- 主持人只在界面显示协调结果与推荐结论，不进入语音音轨。
- 用户开口后取消当前发言，识别并处理新要求，再由在场餐厅继续讨论。
- “踢走丁香小仙”“我不要叮香小仙”等转写写法可定位丁香小鲜。候场用完后仍可移出餐厅，不会把已经拒绝的餐厅自动请回。
- 已离场餐厅不会继续发言；没有候选时停止讨论，并显示重新选择提示。
- 可说“暂停”“停一下”“继续”，也可以使用“暂停讨论 / 继续讨论”按钮。总结推荐完成后暂停，继续讨论或提出新要求即可恢复。
- “结束语音”关闭连接并释放麦克风，静音麦克风则保留餐厅讨论。

## 验收

2026-10-17：13 项单元测试通过。真实 LiveKit 音轨测试验证了既有空房间补派 Worker、无指令自动发言、合成语音踢走指定餐厅、继续讨论、暂停恢复、主持人不发声。最新一轮合成输入开始到收到打断事件约 418ms；这是本机合成音频测试值，不能替代真实麦克风声学环境验收。

```powershell
./runtime/tools/python/python.exe -m unittest discover -s tests -v
./runtime/tools/python/python.exe scripts/smoke_voice_discussion.py
```

测试不启用真实麦克风。报告：`artifacts/voice-discussion-validation.json`；接收到的实际音轨：`artifacts/voice-discussion-output.wav`。日志：`runtime/logs/`。

当前 LLM 未配置，使用有证据的规则讨论。配置 OpenAI-compatible 模型后，后续发言会携带最近讨论上下文；现有语音链路不变。
