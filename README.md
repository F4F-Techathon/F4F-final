# 饭店请就位

Vue 3 + TypeScript + Pinia 的移动端选餐体验，复用 `damo.html` 中的 SVG 角色、复古配色与剧场视觉。

> 交接，或者要接入多智能体框架：先读 [HANDOVER.md](HANDOVER.md)。其中有运行方式、架构、数据位置、舞台通道接口和接入示例。
>
> 辩论台已接入真实多智能体后端（`../Backend/eat-what-backend`，`./start_mac.sh`）：见 [docs/multi-agent-backend.md](docs/multi-agent-backend.md)；可用性测试见 [docs/multi-agent-usability.md](docs/multi-agent-usability.md)。

## 本地运行

```sh
npm install
npm run dev
```

```sh
npm test       # 语音、LLM 代理、需求纠正与重试、筛选、用户定店、会话恢复、店主生成与 Jev 决策对拍、舞台通道、服务路由、接入示例
npm run build  # TypeScript 检查，构建手机界面（dist/）和导演台（director/dist/）
npm start      # 生产运行，默认 3000 端口：手机界面在 /，导演台在 /director/，同时提供需求整理、Jev、舞台通道等接口
```

交接包（`npm run handover`）里已带构建产物，解压后运行 `start.sh` 或 `start.bat` 即可，只需要 Node.js。

```sh
npm run director  # 导演台（5174）：给 5173 的手机页面发台词、请嘉宾登台、看资产和系统状态
npm run dev:lan   # 同 dev，对局域网开放，手机可以直接打开
```

需要 Node.js 22.18+（22.x）或 24.12+。

## 页面流程

首页 → 语音（或文字）表达与 Orb 逐轮整理需求 → 用户确认 → 滑卡选店 → 集合开场 → 餐馆辩论 → 用户选定饭店 → 餐厅详情。

说完一轮后，Orb 显示结构化需求卡，并提出至多一个补充问题。可以继续语音修改预算、人数、偏好和忌口；每轮成功后更新同一份需求，不自动跳页。点击「就这样，去挑饭店」才把确认结果用于筛选。失败时保留上一份需求和本轮发言，可重试原文或重新说；未整理的更改会阻止按旧需求继续。对话草稿保存在当前浏览器，返回时可接着聊，开始新饭局会清空。

左滑跳过、右滑邀请，也支持键盘方向键；卡片下方常驻小地图、当前餐厅地址和直线距离，随滑卡同步位置，无需展开；不设操作按钮。支持取消邀请，不会自动填满选手。划完这一轮或选手就位后，中央出现可点击的场记板，合板动画完成后衔接地图集合和拉幕布入场；没有选够时可以再看一轮。右上角可调整条件，硬条件排除不符合或相关信息未知的餐厅，偏好作为讨论内容，饭店顺序保持稳定。确认需求后，按滑卡顺序为每家店实时生成店主形象，邀请的店优先；卡片头像先显示生成进度，场记板要等所有选手生成完才能合板。滑卡进度、选择、讨论历史与新条件保存在当前浏览器。讨论页不预置台词：每句台词从舞台通道送来，Jev 决定说话人和每位听众的表演。讨论页右上角的「做出决定」打开饭店选择，用户选中并确认后才生成结果；讨论结束也会等待用户选择。依据随当前发言常驻展开，需要细看时可暂停；打开历史会暂停讨论，通过播放按钮继续。

## 地图配置

将 `.env.example` 复制为 `.env.local`（开发）或 `.env`（运行），设置高德 Web JS API 的 `AMAP_KEY` 与安全密钥 `AMAP_SECURITY_CODE`。旧名 `VITE_AMAP_KEY`、`VITE_AMAP_SECURITY_CODE` 仍然有效。本地配置文件已被 `.gitignore` 忽略。

key 不会打进页面构建：页面启动时从同源的 `GET /api/config` 读取，所以同一份构建换个 `.env` 就能在别的机器上运行。改了环境变量要重启服务。

地图使用高德 JS API 2.0，支持地点搜索、定位、平移缩放和候选标记。地图在滑卡时预载，开场时展示集合动画；加载失败不影响滑卡和入场。生产环境可通过 `AMAP_SERVICE_HOST` 设置安全代理，这时安全密钥不再下发到页面，参见[高德安全配置文档](https://developer.amap.com/api/javascript-api-v2/guide/abc/jscode)。

## 数据与服务边界

- 餐厅、价格、菜品、团购和评价来自大众点评抓取的 66 家上海张江真实店铺（`node scripts/import-dianping.mjs <数据文件夹>` 导入，评价人昵称已隐去），详见 [docs/shop-data.md](docs/shop-data.md)；`VITE_DATASET=demo` 可切回原来的 9 家演示餐厅。依据中逐条保留数据性质与来源。`EvidencePanel` 直接接收依据数据，支持纯评价文字、图片和图文混排，讨论页随当前发言更新并保持展开；`text`、`images` 和日期均可按实际资料提供，来源链接可跳转原文。
- 真实店铺的主图、菜品图和评价图直接加载大众点评的图片地址；没有照片的店铺和演示餐厅使用按菜系选配的本地示意照片，[摄影师与图片来源](src/assets/images/restaurants/CREDITS.md)保存在素材目录中。
- 地图底图、地点搜索和定位调用高德真实服务；店铺坐标直接交给高德（与高德同为 GCJ-02），默认搜索中心是店铺所在的上海张江。
- 初始需求由真实 LLM 整理为经过校验的完整快照，确认后直接应用，避免重新解析旧发言而覆盖已纠正的预算。菜系排除、不能吃辣、多个过敏原和食材忌口会参与硬条件筛选；过敏原与食材由菜品信息推断，缺少资料的店铺会被排除。软偏好不会伪装成商家事实。
- 确认需求后，选店助手（同源 `POST /api/shortlist`，与需求整理共用 `LLM_*` 设置）读取通过硬条件的店铺真实资料（人均、评分、距离、评价提到的场景、招牌菜、团购、好评与差评），按这次需求挑出至多 10 家并排好顺序，滑卡上显示每家的推荐理由，标题下显示挑选思路。助手没连上时按硬条件筛出的顺序展示全部店铺。
- 具体地名由高德 POI 服务解析；有多条匹配时在页内选择。明确“我附近”或只给距离限制时，确认后请求真实定位。未指定位置与距离时不擅自增加距离硬条件，地图仍使用默认搜索中心。
- 辩论台词从舞台通道送来：现在由导演台（`npm run director`）发送，接入多智能体后端后由后端推送同样的消息。每句台词的表演由 Jev 在前端决定，经同源 `/api/jev` 转发；没有 key 或调用失败时用关键词基线，并在控制台标明不是 Jev。讨论内的补充条件仍使用本地规则；最终饭店由用户自行选择。见 [docs/agent-stage.md](docs/agent-stage.md)。
- 店主形象按店铺信息实时生成（Jev 依次决定形象、口音和招牌表演，失败时用关键词规则），缓存在当前浏览器，店铺资料变化时重新生成；蜜雪冰城、星巴克、茶百道由品牌吉祥物出演。辩论舞台上方的 Orb 是主持人：说自己的台词时会开口，别人发言时看向说话的人。
- 语音目前使用浏览器语音识别，需要允许麦克风；需求页和舞台均为长按说话、松开发送，短点或切到后台会取消录音。需求页的按钮下方有「不方便？试试发文字」，可以改为打字（回车发送），打的字与语音转写走同一套整理；浏览器不支持语音识别时直接以文字框打开。讨论中的识别内容显示在原有对话卡片中，说完继续讨论。播放使用设备语音合成，尚未接入实时语音后端（CosyVoice3 留给流式多智能体系统）。
- 未接入预订、电话或商家交易服务，不展示预订成功等虚构结果。

## LLM 配置与部署

在被忽略的 `.env.local` 中配置 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL`。这三个变量只供服务端使用，不加 `VITE_` 前缀，不提交密钥。当前模型为 `gemini-3.8-flash`，接口使用服务商文档中的 [Chat Completions 协议](https://api-gpt-ge.apifox.cn/210339408e0)。

浏览器只请求同源 `POST /api/intake`；代理限定模型、输入长度与响应结构，45 秒超时，浏览器断开后会取消上游请求。不会把上游原始报错或密钥返回页面。

Jev 决策同样需要在 `.env.local` 配置只供服务端使用的 `TYPESAFE_API_KEY`。浏览器只请求同源 `POST /api/jev`，由服务端补上 key 再转发。TypeSafe 在部分地区直连会返回 451，这时在 `.env.local` 设置 `HTTPS_PROXY`（并设 `NO_PROXY=localhost,127.0.0.1,::1`），开发和生产服务都会经代理访问。

`npm run dev` 和 `npm run preview` 已挂载这些接口，以及舞台通道 `/api/stage/*`、运行时配置 `/api/config`、服务状态 `/api/status`。

**生产运行：**

- 在项目根目录执行 `npm run build`，再用 `npm start`（即 `node server/index.ts`）。Node 同时提供 `dist/`（手机界面，在 `/`）、`director/dist/`（导演台，在 `/director/`）和全部接口。
- `PORT`、`HOST` 可由环境变量设置。设置 `TLS_CERT_FILE`、`TLS_KEY_FILE` 后改用 HTTPS。
- 服务按自身位置找构建产物和 `.env`，从哪个目录启动都可以。
- 部署需要保留 `server/`、`src/lib/intakeProtocol.ts`、`src/lib/shortlistProtocol.ts`、`src/data/dianping/shops.json`（选店助手读取）、`src/agents/feed/protocol.ts`、`package.json` 和两个构建目录，不需要 `node_modules`。也可以用仓库里的 `Dockerfile` / `docker-compose.yml`。
- 只做静态托管时，要另外部署这个 Node API，并把 `/api/intake`、`/api/shortlist`、`/api/jev`、`/api/stage/`、`/api/config`、`/api/status` 同源转发过去。

## 主要代码

- `src/views/`：需求、滑卡、讨论、结果等页面
- `src/components/`：SVG 角色、舞台关联界面、筛选、地图、通用抽屉
- `src/stores/dining.ts`：跨页面状态、选择、历史与恢复
- `src/stores/intake.ts`：多轮需求草稿、请求取消、失败重试与恢复
- `src/lib/intakeProtocol.ts`：浏览器与服务端共用的需求结构和校验
- `server/intake.ts`：LLM 提示词与受限代理接口
- `src/data/`：真实店铺（`dianping.ts` 与导入的 `dianping/shops.json`）、演示餐厅（`demo.ts`）、证据与类型
- `src/lib/characterRig.js`：从参考演示提取的角色绘制模块，生成的店主也用它渲染
- `src/agents/`：智能体舞台的领域层（不依赖 Vue）：`rig/` 生成角色绘制，`generation/` 店主生成，`jev/` 台词决策，`performance/` 表演编排，`feed/` 舞台通道，`stage/` 舞台组装
- `src/stores/cast.ts`、`src/stores/stage.ts`：店主生成队列与缓存；舞台通道、台词队列与回报
- `src/composables/useLinePlayback.ts`、`useStageDirector.ts`：逐句演出与台上统一时钟
- `server/jev.ts`、`server/stageRelay.ts`、`server/network.ts`：Jev 转发、舞台通道中继、代理设置
- `director/`：导演台，继承 agent-studio 的演播 · 资产 · 系统三页
- `src/lib/filtering.ts`：需求解析、硬条件过滤与距离计算
- `src/lib/amap.ts`：高德 SDK 加载与错误重试

## 仓库与日常开发

远程仓库：[F4F-Techathon/Frontend](https://github.com/F4F-Techathon/Frontend)。本地直接在本项目目录开发。

```sh
git pull --rebase
# 修改代码后
npm test
npm run build
git add .
git commit -m "说明本次修改"
git push
```

`.env.local`、`node_modules/` 和 `dist/` 不提交。其他设备克隆后，运行 `npm install`，再从 `.env.example` 创建本机的 `.env.local`。
