# 多智能体接入示例

两个零依赖的最小后端，Node 版和 Python 版行为相同。它们扮演舞台中继上的 `console` 角色，和导演台（`/director/`）是同一个角色：

- **收：** 订阅 `GET /api/stage/events?role=console`（SSE），收到手机回报的页面与台上阵容、每句进度、Jev 决策、顾客插话。
- **发：** 往 `POST /api/stage/send` 发台词，`from` 填 `console`。

接入多智能体框架时，只需替换文件里「The brain」下面的两个函数，连接、发送和节奏控制都不用动：

| 函数 | 什么时候调用 | 返回 |
|---|---|---|
| `openingLines(cast)` / `opening_lines(cast)` | 手机第一次进入辩论页，台上有人 | 开场要说的几句，按顺序 |
| `repliesToCustomer(text, cast, userLineId)` / `replies_to_customer(...)` | 顾客在台上长按说话 | 回应的几句；`replyTo` 填顾客那句的 id |

每句是 `{ speaker, text, topic?, replyTo?, evidenceIds? }`：

- **speaker：** `cast` 里的 id（店铺 id 或嘉宾 id），或 `host`（主持人 Orb）。
- **evidenceIds：** 手机在 `cast[].evidenceIds` 里列出的依据 id，第一条是店铺本身的资料。

示例每句等手机报「done」（演完）或「dropped」（没演）再发下一句。顾客一插话，手机先结束正在演的那句，示例随即停掉还没说完的那一轮，改说回应。

## 运行

先启动界面（`npm start`，或者解压包里的 `start.sh` / `start.bat`），在手机或浏览器里走到辩论页，再开一个终端：

```bash
node examples/stage-bridge.mjs --base http://localhost:3000
```

```bash
python3 examples/stage_bridge.py --base http://localhost:3000
```

- 开发模式下界面在 5173：`--base http://localhost:5173`。
- `--once`：开场一轮说完就退出。`--quiet`：只打印台词。
- 示例和导演台可以同时连着。导演台会看到示例发的每一句，方便对照检视。

测试：`scripts/examples.test.mjs` 由测试代码扮演手机，检查 Node 版是否按顺序开场、是否等上一句演完再发下一句、是否回应顾客，以及 `--once` 能否正常退出。

消息字段、限制和约定见 [HANDOVER.md](../HANDOVER.md) 的「接入多智能体框架」一节。
