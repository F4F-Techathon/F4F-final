# 交接文档：饭店请就位

这是「饭店请就位」移动端界面和测试端（导演台）的当前版本，用来接入多智能体框架。

> **2026-10-18 更新：** 真实的多智能体后端（`Backend/eat-what-backend`）已经接入辩论台，见 [docs/multi-agent-backend.md](docs/multi-agent-backend.md)。可用性测试见 [docs/multi-agent-usability.md](docs/multi-agent-usability.md)。下文第 4 节的中继接口仍然可用：导演台、示例和其他控制端都通过它与舞台通信。
>
> **同日下午：**
> - 同一时间只有一个声音；
> - 台词里的关键信息高亮并标出来源；
> - 快餐连锁由品牌角色出镜（肯德基上校、麦当劳叔叔、老乡鸡的草帽老乡等），同台店主不会撞脸，胸牌改用店铺头图；
> - 地方菜店主说方言并附普通话释义。
>
> 已有模型密钥的额度已经用完，备用模型还缺接口地址 `LLM_FALLBACK_BASE_URL`，见可用性报告第二轮。
>
> **完整项目包：** zip 里另带多智能体后端（`backend/`）。在装有 NVIDIA 显卡的 Windows 上，双击 `start-windows-gpu.cmd` 可一次启动 CosyVoice 3 配音（GPU）、后端和界面，安装和启动步骤见 [docs/windows-gpu.md](docs/windows-gpu.md)。

- 一个 Node 服务同时提供手机界面、导演台和全部接口。
- 包里带着已构建好的页面，装好 Node.js 就能运行，不用安装依赖。
- 构建日期、源码分支与提交、检查结果见 `BUILD-INFO.json`。

| 章节 | 内容 |
|---|---|
| [1. 运行](#1-运行) | 三种运行方式；不配密钥能走到哪一步；对浏览器和设备的要求 |
| [2. 架构](#2-架构) | 总图、一句台词的流程、端口、目录 |
| [3. 数据](#3-数据放在哪) | 打包的数据、运行时状态、密钥、外部服务 |
| [4. 接入多智能体框架](#4-接入多智能体框架) | 接口、收发的消息、约定、示例、上线前要补的 |
| [5. 测试端](#5-测试端导演台) | 导演台能做什么 |
| [6. 开发、测试与打包](#6-开发测试与打包) | 命令和测试清单 |
| [7. 环境变量](#7-环境变量) | 全部变量 |
| [8. 已知边界](#8-已知边界) | 现在做不到或要注意的地方 |
| [9. 文档索引](#9-文档索引) | 其他文档 |

## 1. 运行

### 方式一：直接运行（推荐）

需要 Node.js **22.18+ 或 24.12+**，macOS、Windows、Linux 都可以。这两个版本能直接运行 `.ts` 文件。

1. 解压后进入文件夹，运行启动脚本：
   - **macOS / Linux：** 在终端运行 `./start.sh`；macOS 也可以在访达里双击 `start.command`。
   - **Windows：** 双击 `start.bat`。

   第一次运行时，脚本会从 `.env.example` 生成 `.env`。
2. 在浏览器打开：
   - 手机界面：http://localhost:3000/
   - 导演台：http://localhost:3000/director/
3. 把密钥填进 `.env`（见下表和[第 7 节](#7-环境变量)），重新运行。

启动后，终端会列出访问地址、局域网地址，以及每项服务是否已配置（只显示 ✓ / ✗，不显示密钥）。启动脚本做的事等同于 `node server/index.ts`。

### 方式二：Docker

```bash
docker compose up -d --build
```

- 镜像直接用包里构建好的页面，不在镜像里安装依赖。
- 密钥从同目录的 `.env` 读，不会打进镜像。
- 要换端口，改 `docker-compose.yml` 里 `ports` 左边的数字。
- 改过源码的话，先在本机运行 `npm ci && npm run build`，再构建镜像。

### 方式三：开发模式（要改代码时）

```bash
npm ci                # 安装依赖，需要联网
npm run dev           # 手机界面 http://localhost:5173
npm run director      # 导演台 http://localhost:5174，/api 转给 5173
```

开发时密钥放在 `.env.local`。

### 多智能体后端

```bash
cd ../Backend/eat-what-backend && ./start_mac.sh      # 127.0.0.1:8771；首次安装见 Backend/ADAPTATIONS.md
```

- 辩论页通过 `/api/agents/realtime` 连接后端（开发服务器和 `npm start` 都会转发）。
- 后端没启动时，辩论台由导演台驱动，页面会提示可以「重新连接」。

### 不配密钥能走到哪一步

| 功能 | 需要 | 不配时 |
|---|---|---|
| 需求整理：首页说话 → 需求卡 → 去挑饭店 | `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` | 停在需求页，提示「需求整理暂未连接」。**只有这一项会挡住流程。** |
| 每句台词怎么演（表情、手势、听众反应），店主形象怎么生成 | `TYPESAFE_API_KEY` | 用关键词基线和关键词规则代替；导演台会标明「关键词基线」 |
| 地图、地点搜索、定位 | `AMAP_KEY`、`AMAP_SECURITY_CODE` | 地图位置提示未配置；滑卡和辩论不受影响 |

### 浏览器和设备

- **需求页可以说，也可以打字。** 「长按说话」下方有一行「不方便？试试发文字」，点开就是文字框（回车发送，Shift+回车换行），打的字和说的话走同一套需求整理。浏览器不支持语音识别时，页面直接以文字框打开。语音输入要满足三个条件：
  - 浏览器支持 Web Speech API：Chrome、Edge 可以，Safari 部分支持，Firefox 不支持；
  - 允许使用麦克风；
  - 页面来自安全来源，即 `localhost` 或 HTTPS。
- **手机经局域网打开 `http://192.168.x.x:3000` 时，浏览器不给麦克风。** 两种办法：
  - 在 `.env` 设置 `TLS_CERT_FILE`、`TLS_KEY_FILE`，服务就改用 HTTPS。证书可以用 mkcert 生成，手机上要信任它的根证书。
  - 用隧道拿到 HTTPS 地址，例如 `cloudflared tunnel --url http://localhost:3000`。
- **同时只开一个手机页。** 开了两个的话，两个页面都会演同一句并各自回报，导演台看到的状态会互相覆盖。
- **手机页在后台会自动暂停。** 在电脑上测试时，切到导演台标签页也算后台；台词会排队，切回手机页、点继续后接着演。
- **需要外网的资源：**
  - 大众点评图片直接从点评 CDN 加载；
  - 地图来自高德；
  - 导演台的字体来自 Google Fonts，加载不到时用系统字体，不影响功能。

## 2. 架构

```
   浏览器：手机界面  /                                浏览器：导演台  /director/
   需求 → 滑卡选店 → 开场 → 辩论舞台                  演播 · 资产 · 系统（测试端）
   Jev 决策与表演编排都在这一侧
          │  ▲                                               │  ▲
   回报   │  │ 台词、走台（SSE）                 台词、走台   │  │ 回报（SSE）
   (POST) ▼  │                                     (POST)    ▼  │
 ┌─────────────────── Node 服务 server/index.ts（默认 3000 端口）──────────────────┐
 │ /api/stage/*   舞台中继：events（SSE 订阅）、send（发消息）；数据只在内存里   │ ◄── 多智能体后端
 │ /api/jev       Jev 转发，服务端补上 TYPESAFE_API_KEY → api.typesafe.ai       │     （role=console，
 │ /api/intake    需求整理，服务端补上 LLM_API_KEY → OpenAI 兼容接口            │      和导演台一样）
 │ /api/config    给页面的运行时配置（高德 key）；/api/status 各服务配没配     │
 │ 静态文件       dist/（手机界面）· director/dist/（导演台）                   │
 └──────────────────────────────────────────────────────────────────────────────────┘
   页面还直接访问：高德 JS API（webapi.amap.com）、大众点评图片 CDN
```

### 一句台词怎么走

1. 后端（现在是导演台）把台词 POST 到 `/api/stage/send`：`{"from": "console", "message": {"kind": "line", ...}}`。
2. 中继通过 SSE 把它推给所有手机页（`role=app`），也推给所有控制端（`role=console`）。
3. 手机把台词排进队列。只有在辩论页时才会开演；在别的页面就一直排着，并回报排队的原因。
4. 轮到这句时，手机先回报 `line-state: deciding`，再经 `/api/jev` 问 Jev 这句怎么演：说话人的表情、手势、动作、视线，以及每位听众的反应。得到结果后回报 `decision`。
5. 手机按决策演出这句：逐字显示字幕，同时做表情、动作和听众反应。开演时回报 `speaking`，演完回报 `done`。
6. 后端收到 `done` 后发下一句。顾客长按说话时，手机先结束正在演的那句，回报 `user-line`，再把顾客的话当作一句台词演出来，台上各位店主随之反应。

### 端口

| 场景 | 手机界面 | 导演台 | 接口 |
|---|---|---|---|
| 运行（start 脚本、`npm start`、Docker） | `:3000/` | `:3000/director/` | `:3000/api/*` |
| 开发（`npm run dev` + `npm run director`） | `:5173` | `:5174`（/api 转给 5173） | `:5173/api/*` |

### 目录

| 路径 | 作用 |
|---|---|
| `start.sh` / `start.command` / `start.bat` | 一键运行：检查 Node 版本，没有 `.env` 时生成一份，然后启动服务 |
| `Dockerfile` / `docker-compose.yml` | 容器运行 |
| `server/` | Node 服务。`index.ts` 是入口（读 `.env`、监听端口、打印地址）；`app.ts` 挂载全部接口和静态文件；`stageRelay.ts` 舞台中继；`jev.ts` Jev 转发；`intake.ts` 需求整理；`publicConfig.ts` 运行时配置；`status.ts` 服务状态；`network.ts` 代理设置 |
| `src/` | 手机界面源码（Vue 3 + TypeScript + Pinia） |
| `src/views/` | 页面：首页、说需求、滑卡选店、辩论、结果、餐厅详情 |
| `src/agents/` | 舞台的领域层，不依赖 Vue：`feed/` 舞台通道协议与客户端（**接入时主要看这里**）；`jev/` 台词决策；`performance/` 表演编排；`generation/` 按店铺信息生成店主；`rig/` 角色绘制；`catalog/` 表演目录与人设；`stage/` 演员表与台上阵容 |
| `src/stores/` | 状态：`dining.ts`（需求、选店、讨论历史）、`stage.ts`（舞台通道与台词队列）、`cast.ts`（店主生成与缓存）、`intake.ts`（需求对话） |
| `src/data/` | 店铺数据与转换，见第 3 节 |
| `director/` | 导演台（测试端）源码；`director/src/{live,library,system}` 对应演播、资产、系统三页 |
| `examples/` | 多智能体后端的接入示例，Node 版和 Python 版 |
| `scripts/` | 测试（`*.test.mjs`）、测试金标准（`fixtures/`）、大众点评导入脚本、交接包打包脚本 |
| `public/` | 原样发布的静态文件：图标、每家店的完整资料 |
| `dist/`、`director/dist/` | 构建产物：手机界面、导演台。用 `npm run build` 重新生成 |
| `docs/` | 设计与数据文档，见第 9 节 |

## 3. 数据放在哪

### 打进包里的数据

| 路径 | 内容 | 谁用 | 怎么更新 |
|---|---|---|---|
| `src/data/dianping/shops.json` | 66 家上海张江的大众点评店铺：基本资料、评分、人均、坐标、推荐菜前 6、团购、精选评价，以及推断出的场景、辣度、过敏原（约 340 KB） | 构建时打进手机界面；后端也可以直接读 | 用 `node scripts/import-dianping.mjs <CSV 文件夹>` 重新导入，详见 `docs/shop-data.md` |
| `public/data/dianping/<店铺 id>.json` | 每家店的完整资料：全部菜品、套餐、代金券、评价、图片地址。构建后位于 `dist/data/dianping/` | 打开店铺详情时才加载 | 同上 |
| `src/data/demo.ts` | 9 家手写的演示餐厅 | 构建时设 `VITE_DATASET=demo` 才会用；单元测试也用 | 直接改代码 |
| `src/data/dianping.ts` | 把店铺转成界面用的 `Restaurant` 和依据（evidence） | 手机界面、导演台 | 直接改代码 |
| `src/assets/images/restaurants/` | 没有照片的店铺用的菜系示意图；摄影师与来源见同目录的 `CREDITS.md` | 手机界面 | 直接替换 |
| `src/agents/catalog/` | 表演目录（表情、手势、动作、反应）和主持人、顾客的人设。目录里的文字就是 Jev 的判据 | 手机界面、导演台 | 改完要跑决策对拍测试 |
| `director/src/data/studio-agents/*.json` | 从 agent-studio 导入的 3 个品牌 agent：雪王·蜜雪冰城、茶姬·霸王茶姬、塞壬·星巴克 | 导演台的资产库，可以作为嘉宾登台 | 导演台「资产」页可以导入新的 JSON |
| `director/src/data/film.ts` | 原片 13 句台词和编排真值 | 导演台「系统」页的一致性检查 | — |
| `scripts/fixtures/*.json` | Python 原版导出的金标准：生成器、Jev 决策、店铺解析 | 测试 | 规则变动后按新输出更新 |

**店铺 id 在各处通用。** 下面这些都是同一个 id：

- `shops.json` 里的 `id`；
- `public/data/dianping/<id>.json` 的文件名；
- 界面里 `Restaurant.id`；
- 舞台上这位店主的 `speaker`。

所以后端拿台上的 speaker id，就能直接查到这家店的完整资料。依据（evidence）的 id 也以店铺 id 开头：

| 依据 id | 内容 |
|---|---|
| `<id>-info` | 商家资料 |
| `<id>-note` | 用餐前需要确认的事项 |
| `<id>-deals` | 团购与代金券 |
| `<id>-dish-<n>` | 一道推荐菜 |
| `<id>-review-<n>` | 一条评价 |
| `<id>-complaint-<n>` | 一条差评 |

**原始 CSV 不在包里。** 原始数据里有未打码的评价人昵称，所以没有打包。导入脚本、CSV 格式和导入规则都在 `docs/shop-data.md`。

### 运行时状态

**服务端只在内存里保存数据，不写盘，重启后清空：**

- 中继的消息积压：每个发送方最多 300 条、512 KB；
- 手机最新的一份快照；
- 每位店主的合同，最多 40 份。

**浏览器存储**按访问地址（协议、主机、端口）分开：3000 端口和 5173 端口的数据互不相通。

| 页面 | 存储 | 键 | 内容 |
|---|---|---|---|
| 手机界面 | localStorage | `tonight-dining-v1` | 需求、选店、滑卡进度、讨论历史 |
| 手机界面 | localStorage | `tonight-intake-v1` | 需求对话草稿 |
| 手机界面 | localStorage | `tonight-cast-v1` | 生成好的店主（按店铺资料指纹缓存） |
| 手机界面 | sessionStorage | `stage-feed-app` | 舞台通道的续播点 |
| 手机界面 | sessionStorage | `stage-lineup-v1` | 台上阵容（嘉宾、下场的店主） |
| 导演台 | localStorage | `stage-director-v2`、`director-hosts-v1` | 时间线、本场店主 |
| 导演台 | localStorage | `director-agents-v1`、`director-imports-v1` | 新建、导入的 agent |
| 导演台 | localStorage | `director-sessions-v1`、`director-session-autosave` | 保存的会话、自动保存 |
| 导演台 | sessionStorage | `director-live-session` | 当前演播状态 |

### 密钥

- 密钥只放在 `.env`（运行）或 `.env.local`（开发），只有服务端读取。
- 浏览器拿到的只有：经 `/api/config` 下发的高德 key 和安全密钥。高德的 Web 端 key 本来就要交给浏览器；如果设置了 `AMAP_SERVICE_HOST` 安全代理，安全密钥也不会下发。
- 交接包和构建产物里都没有密钥。打包脚本会逐个文件核对这一点，见[第 6 节](#6-开发测试与打包)。

### 外部服务

| 服务 | 谁访问 | 用途 |
|---|---|---|
| TypeSafe Jev `api.typesafe.ai` | 服务端（`/api/jev`） | 台词表演决策、店主形象生成 |
| OpenAI 兼容 LLM（默认 `api.gpt.ge`，`gemini-3.8-flash`） | 服务端（`/api/intake`） | 把顾客的话整理成需求 |
| 高德 JS API 2.0 | 页面 | 地图、地点搜索、定位 |
| 大众点评图片 CDN（`*.dpfile.com`、`*.meituan.net`） | 页面 | 店铺与评价照片 |
| Google Fonts | 导演台页面 | 字体，加载不到时不影响功能 |

## 4. 接入多智能体框架

### 怎么接

多智能体后端在舞台中继上的身份是 `console`，和导演台相同：

- 往 `/api/stage/send` 发台词；
- 订阅 `/api/stage/events?role=console`，收手机的回报。

手机界面的代码不用改。后端决定**谁说、说什么、引用哪条依据**；**怎么演**由手机这边的 Jev 决定。

后端和导演台可以同时连着。导演台会看到后端发的每一句，可以用来检视决策、补发台词、插话，或者请嘉宾登台。

### 接口

| 方法与路径 | 作用 | 说明 |
|---|---|---|
| `POST /api/stage/send` | 发一条消息 | 请求体 `{"from": "console", "message": {...}}`，`Content-Type: application/json`，不超过 64 KB。成功返回 `202 {"id": "<事件 id>"}`；格式不对返回 `400`，`detail` 指出是哪个字段 |
| `GET /api/stage/events?role=console` | 订阅（SSE） | 每个事件的 `data` 是 `{"id", "at", "from", "message"}`；`event: presence` 事件是在线数 `{"app": n, "console": n}`。断线后带上 `Last-Event-ID` 请求头或 `lastEventId` 参数重连，中间漏掉的会补发 |
| `GET /api/status` | 各服务配没配 | 也有在线数，不含任何密钥 |

消息类型和校验规则以 `src/agents/feed/protocol.ts` 为准。这个文件不依赖任何东西，可以直接拷给后端参考，或照着生成别的语言的类型。

### 你会收到的消息（`from: "app"`）

控制端会收到所有消息，包括自己和其他控制端发的。只处理 `from` 为 `"app"` 的即可。

| `kind` | 什么时候 | 关键字段 |
|---|---|---|
| `snapshot` | 连上时先补发最新一份；之后手机换页或阵容变化时再发 | `phase`：`home`、`input`、`pick`、`opening`、`debate`、`result`、`detail`。`cast[]`：受邀的店主和嘉宾，字段有 `id`（即 speaker id）、`name`、`restaurant`、`color`、`status`（`generating` 或 `ready` 等）、`kind`（`host` / `guest`）、`onStage`、`greeting`、`evidenceIds`、`look` |
| `line-state` | 每句的进度 | `id`、`phase`（`queued` → `deciding` → `speaking` → `done`，没演的是 `dropped`）、`note`：排队原因，例如「手机在「滑卡选店」页，进入辩论后才开演」，或者「被顾客打断」「说话人不在台上」「舞台已清空」 |
| `decision` | Jev 决定好一句怎么演 | `lineId`；`source`：`jev`，或关键词基线 `baseline`；`speaker`：表情、手势、动作、视线、语气等，都带中文名；`listeners`：每位听众的反应；`detail`：完整的题目与概率 |
| `user-line` | 顾客在台上长按说话 | `id`、`text`。回应时把 `replyTo` 设为 `[id]` |
| `agent` | 手机生成好一位店主（连上时补发全部） | `contract`：名字、人设 `persona`、口音 `language`、招牌、关键词、开场白 `greeting`、配色、形象，以及生成它用的店铺资料 `shop`。可以直接用来给每个 agent 写角色设定 |

### 你可以发的消息（`from: "console"`）

| `kind` | 作用 | 字段 |
|---|---|---|
| `line` | 一句台词 | `id`（自己生成）、`speaker`、`text`；可选 `topic`、`replyTo`、`evidenceIds`、`interrupt`（插话：打断正在演的那句，这句先演）、`replaces`（重播或改写之前的某句，讨论历史里保留原句的 id）、`override`（手动指定表演槽位，一般不用） |
| `drop` | `{id}`：撤回排队中的一句，或者停掉正在演的那句 | — |
| `clear` | 清空舞台：停掉当前这句，丢弃全部排队的台词 | — |
| `cast` | 走台：`act` 为 `enter`、`exit`、`remove` 或 `reset`，`who` 是店铺 id 或嘉宾 id。嘉宾第一次登台要附上 `guest` 资料（形象、人设等） | 一般由导演台操作；台上最多 6 位 |

示例：

```bash
curl -s -X POST http://localhost:3000/api/stage/send -H 'Content-Type: application/json' \
  -d '{"from":"console","message":{"kind":"line","id":"agent-1","speaker":"host","text":"欢迎来到今晚的饭局！","topic":"开场"}}'
```

### 约定与限制

- **speaker：**
  - 台上 `snapshot.cast[].id` 里的某一位（店铺 id 或嘉宾 id）；
  - 或者 `host`（主持人 Orb）。
  - `user` 留给顾客。说话人不在台上的句子会被丢弃（`dropped`，注明「说话人不在台上」）。
- **id：** 1–80 个字符，限 `A–Z a–z 0–9 _ . : -`，每句不能重复。建议格式是「前缀-时间戳-随机串」，例如协议里的 `createMessageId('agent')`。
- **长度和数量上限：**

  | 项 | 上限 |
  |---|---|
  | `text` | 600 字符 |
  | `topic` | 40 字符 |
  | `replyTo` | 12 个 |
  | `evidenceIds` | 12 个 |
  | 单条消息 | 64 KB |
  | 台上人数 | 6 位 |

- **节奏：**
  - 手机按到达顺序一句一句演。
  - 建议等上一句报 `done` 或 `dropped` 再发下一句，这样随时可以根据顾客的反应改口。示例就是这样做的。
  - 一次发很多句也行，手机会排队。
- **什么时候开始发：**
  - 等 `snapshot.phase` 变成 `debate`，并且台上有人。
  - 手机在别的页面时，台词照样排队，回报的 `line-state` 里 `note` 会写原因。
  - 新打开的手机页只收打开以后发的消息；刷新的手机页会补收没演完的。
- **顾客插话：** 收到 `user-line` 时，手机已经结束了正在演的那句（`done`，注明「被顾客打断」）。回应这句时设 `replyTo: [user-line 的 id]`。
- **依据：**
  - `evidenceIds` 从 `cast[].evidenceIds` 里挑，手机会在字幕下方展示依据卡片。
  - 依据 id 的格式见[第 3 节](#3-数据放在哪)。
- **店铺资料：** 后端可以直接读 `src/data/dianping/shops.json` 和 `public/data/dianping/<id>.json`，id 与 speaker id 相同。

### 示例

`examples/` 里有两个零依赖的最小后端，Node 版和 Python 版行为相同：

- **开场：** 手机进入辩论页后，主持人开场，台上各位依次自我介绍；
- **节奏：** 每句等手机演完再发下一句；
- **回应顾客：** 收到顾客插话后，停掉还没说完的那一轮，改说回应。

先按第 1 节启动服务，并把手机界面走到辩论页，再运行：

```bash
node examples/stage-bridge.mjs --base http://localhost:3000
```

```bash
python3 examples/stage_bridge.py --base http://localhost:3000
```

接入框架时，只需替换文件里「The brain」下的两个函数：`openingLines` 和 `repliesToCustomer`，Python 版是 `opening_lines` 和 `replies_to_customer`。连接、断线重连、发送和节奏控制都可以照用。说明见 `examples/README.md`；测试 `scripts/examples.test.mjs` 由测试代码扮演手机。

### 接入前后要补的

- **顾客的需求还没传给后端。** 现在 `snapshot` 只带页面和台上阵容，不带预算、人数、忌口这些整理好的需求（存在手机的 `src/stores/dining.ts`）。后端要据此辩论的话，建议在 `snapshot` 里加一个 `requirements` 字段：在 `protocol.ts` 加字段和校验，由 `src/App.vue` 填入。
- **中继没有鉴权，只有一个全局频道。** 局域网里谁都能往舞台发台词。上公网前要加鉴权，或者按会话分频道。
- **语音合成还没接。** 现在台词时长按打字机节奏估算，朗读用设备自带的语音合成。接入流式语音（如 CosyVoice3）后，时长和口型应改为从音频得到；编排已经按「开演时刻 + 预计时长」设计。
- **多台手机：** 每台都会各演一遍、各自回报，后端要按 `line-state` 去重。

## 5. 测试端（导演台）

导演台在 http://localhost:3000/director/ （开发时在 5174），代替以后的多智能体后端给手机发台词，并显示手机回报的一切。详细说明见 `docs/agent-stage.md` 的「导演台」一节。

| 页面 | 能做什么 |
|---|---|
| **演播** | 选说话人、写台词、引用依据，一次回复多句；插话、重播、改写、撤回；请嘉宾或新建的店铺 agent 登台；检视每句的 Jev 决策（概率、门控），也可以手动改；保存、载入、播放会话 |
| **资产** | 6 个人形模板、5 个品牌吉祥物、原片 3 位角色、本场店主、导入和新建的 agent；每个角色的表情、手势、动作、口型、特效动画都能逐个查看，可导出 PNG 帧序列 |
| **系统** | 架构图（有消息时对应节点会亮）、服务状态、演员名册，以及 Jev 与原片编排的一致性检查（跑 13 句台词并打分） |

## 6. 开发、测试与打包

| 命令 | 作用 |
|---|---|
| `npm ci` | 安装依赖（要联网） |
| `npm run dev` / `npm run dev:lan` | 手机界面开发服务（5173）；`:lan` 版本对局域网开放 |
| `npm run director` | 导演台开发服务（5174） |
| `npm test` | 全部测试（`scripts/*.test.mjs`） |
| `npm run type-check` | 类型检查，包含导演台和服务端 |
| `npm run build` | 类型检查，并构建手机界面（`dist/`）和导演台（`director/dist/`） |
| `npm start` | 用构建产物运行，等同于 `node server/index.ts` |
| `npm run bridge -- --base http://localhost:3000` | 运行 Node 版接入示例 |
| `npm run handover` | 重新打这个交接包，生成 `release/what-to-eat-<日期>.zip` |
| `npm run handover -- --with-backend` | 打完整项目包：另外带上多智能体后端（`backend/`）和 Windows GPU 语音的一键启动，说明见 [docs/windows-gpu.md](docs/windows-gpu.md) |

**打包脚本（`scripts/pack-handover.mjs`）的步骤：**

1. 复制一份干净的源码。复制时排除 `node_modules`、`.git`、所有 `.env*`（`.env.example` 除外）、旧的构建产物和证书。
2. 在这份副本里构建手机界面和导演台，然后跑类型检查和全部测试，以证明副本完整。
3. 逐个文件检查：既不能出现本机 `.env*` 里任何密钥的值，也不能出现形似密钥的字符串。发现任何一处就停止，只报变量名和文件名。
4. 写入 `BUILD-INFO.json`，然后打成 zip。

**测试清单：**

| 测试文件 | 内容 |
|---|---|
| `agents-generation`、`jev` | 生成器、台词决策与 Python 原版逐字段对拍 |
| `agents-cast`、`agents-stage`、`stage-cues` | 店主生成队列与缓存、演员表、走台和阵容 |
| `stage-relay` | 舞台中继与协议：重放、背压、续播 |
| `director` | 导演台：店铺解析、合同导入、重播与改写 |
| `dianping`、`dianping-app` | 大众点评导入与转换 |
| `dining`、`intake` | 需求整理、筛选、语音输入、会话恢复 |
| `server` | 一个端口同时提供两个页面、路径越界防护、运行时配置不泄露密钥 |
| `examples` | 接入示例的开场顺序、节奏、回应顾客 |

## 7. 环境变量

运行时写在 `.env`，开发时写在 `.env.local`，模板是 `.env.example`。所有变量都只由服务端读取，页面构建里不含任何 key。

| 变量 | 用途 | 默认 |
|---|---|---|
| `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` | 需求整理用的 LLM（OpenAI 兼容 Chat Completions） | 地址 `https://api.gpt.ge/v1/`，模型 `gemini-3.8-flash` |
| `LLM_REASONING_EFFORT` | 关掉模型思考，更快，也不会因思考截断 | `none` |
| `TYPESAFE_API_KEY`、`TYPESAFE_MODEL` | Jev 表演决策与店主生成 | 模型 `jev-latest` |
| `AMAP_KEY`、`AMAP_SECURITY_CODE`、`AMAP_SERVICE_HOST` | 高德地图；旧名 `VITE_AMAP_*` 也认 | — |
| `HTTPS_PROXY`、`NO_PROXY` | 服务端访问外部接口时走代理（TypeSafe 在部分地区直连会返回 451） | — |
| `PORT`、`HOST` | 监听端口和地址 | `3000`、`0.0.0.0` |
| `TLS_CERT_FILE`、`TLS_KEY_FILE` | 设置后改用 HTTPS（手机经局域网使用麦克风时需要） | — |
| `DIRECTOR_TARGET` | 开发时导演台把 /api 转给哪个服务，在命令行设置 | `http://localhost:5173` |
| `AGENT_BACKEND_URL` | 多智能体后端地址，辩论页经 `/api/agents/realtime` 转发到它 | `http://127.0.0.1:8771` |
| `LLM_FALLBACK_BASE_URL`、`LLM_FALLBACK_MODEL`、`LLM_FALLBACK_API_KEY` | 备用模型：已有设置失效时，所有智能体自动改用它 | — |
| `VITE_DATASET` | 构建时选数据：`demo` 为 9 家演示餐厅 | 大众点评 66 家 |

## 8. 已知边界

- 需求页的语音输入对浏览器和来源有要求，见[第 1 节](#浏览器和设备)；不满足时可以改用文字输入。
- 最终选哪家由顾客在「做出决定」里自己选，系统不自动替顾客选。
- 讨论中顾客补充的条件由本地规则解析，中文数字（如「一百以内」）目前识别不了。
- 没有接入预订、电话或交易服务。
- 导演台的会话、新建和导入的 agent 都存在那台电脑的浏览器里；换电脑前先导出 JSON。
- 原片里 `rong`、`pierre` 两个角色有专属加成（星星眼、飞吻、鞠躬），生成的店主没有。
- 店铺范围固定在上海张江。用户位置离张江太远时会筛不到店。

## 9. 文档索引

| 文档 | 内容 |
|---|---|
| `README.md` | 产品流程、页面行为、数据与服务边界 |
| `docs/agent-stage.md` | 舞台全貌：分层、店主生成、一句台词怎么演、舞台通道、导演台、测试 |
| `docs/shop-data.md` | 大众点评数据：导入、字段来源、图片与坐标、店铺详情页 |
| `docs/intake-design.md` | 需求对话（Orb）的设计与模型输入输出 |
| `docs/multi-agent-backend.md` | 多智能体后端接入辩论台：流程、声音与识别、回执、状态、文件 |
| `docs/multi-agent-usability.md` | 接入后的可用性测试：任务、测量、发现的问题与处理 |
| `docs/windows-gpu.md` | Windows + NVIDIA GPU：安装与一键启动，CosyVoice 3 配音和 Whisper 识别都跑在 GPU 上 |
| `../Backend/ADAPTATIONS.md`（完整项目包里是 `backend/ADAPTATIONS.md`） | 后端为接入与本机运行做的改动，以及 NVIDIA GPU 部件的本机替代方案 |
| `examples/README.md` | 多智能体接入示例 |
| `src/agents/feed/protocol.ts` | 舞台通道协议的权威定义 |
