# 字体

中文装饰标题使用站酷庆科黄油体（ZCOOL QingKe HuangYou）。`ZCOOLQingKeHuangYou-Regular.woff2` 从 [Google Fonts 官方仓库的完整 TTF](https://github.com/google/fonts/tree/main/ofl/zcoolqingkehuangyou) 转为 WOFF2，未裁剪字符；授权见同目录的 `ZCOOL-QingKe-HuangYou-OFL.txt`。

原演示中的 `HY.woff2` 只包含 444 个字符，缺少“店、请”等标题用字，会触发逐字系统字体回退，已替换。

排版规则统一在 `src/assets/styles/base.less` 中维护：

- `--font-body`：导航、商家名称、正文、按钮、表单和辅助信息共用中文优先的系统字体栈，中英文不再单独指定字体。
- `--font-display`：仅用于首页大标题、引导标题、滑卡印章和剧场招牌，固定使用字体原生的 400 字重。
- 字重只使用 `--weight-regular`（400）和 `--weight-semibold`（600）；行高使用标题、紧凑信息、正文三档。

| 用途 | 变量 | 手机至平板字号 |
| --- | --- | --- |
| 首页大标题 | `--hero-size` | 46–82px |
| 页面主标题、结果商家名 | `--title-size` | 27–38px |
| 弹层标题、卡片商家名、剧场招牌 | `--section-size` | 20–26px |
| 导航标题、区块标题 | `--heading-size` | 17–23px |
| 正文、主按钮 | `--body-size` | 15–18px |
| 标签、次级操作 | `--label-size` | 13–16px |
| 来源、时间等辅助信息 | `--small-size` | 12–14px |
| 表单输入 | `--input-size` | 至少 16px |

组件继续引用这些变量，不另设固定字号或字重。剧场人物标签按舞台缩放反算字号，保证显示时仍与普通标签一致。SVG 插画内的文字保留画布坐标字号，星芒和月桂符号按装饰尺寸设置。
