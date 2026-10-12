# _dev · 开发脚本

不属于工具本体，仅记录数据更新与测试方法。

## 数据更新（把新的通达信 1 分钟数据灌进 index.html）

```bash
python _dev/xls2inline.py  <通达信导出目录>  index.html
```

脚本会把 `xxxxxx一分钟.xls`（GBK 制表符文本或 OLE2 Excel 都支持）压缩后写入
`index.html` 里的 `/*<<<HIST1M_BEGIN>>>*/ … /*<<<HIST1M_END>>>*/` 占位块。
页面逻辑不受影响，可重复运行。成交额单位是**万元**，脚本内已按 `10000/scale` 换算成元。

## 测试（headless Chrome 驱动页面内的注入脚本）

先 `node _dev/make_xxx.cjs` 生成带测试桩的临时页面，再用 Chrome `--dump-dom` 读回日志：

| 脚本 | 覆盖内容 |
| --- | --- |
| `make_real.cjs` | 真实数据链路：实时 → 复盘 → 切标的 → 回落 → 超范围 → 回今天 |
| `make_p0.cjs` | 0 轴基准三档、自检面板、置信带 |
| `make_cal2.cjs` | 自建月历：可用区间、交易日高亮、点选复盘 |
| `make_ui.cjs` | 暗黑主题、量价胶囊、分量比、全部快捷键、输入框隔离 |
| `make_reso.cjs` | 共振阈值可调 + 历史灵敏度标尺（含 MLB/JMLB 逐根一致性断言） |
| `make_avgfix.cjs` | **v1.2** 均量口径：断言 `priorAvg()` 排除今日、与 `baseVal` 同源、标签无残留 |
| `make_autorefresh.cjs` | **v1.2** 自动刷新真实跑 70s：钩 `fetchJson/jsonp/load` 计数 + 每秒采样 `upd`/`loading`/倒计时/`dot` |
| `make_arsim.cjs` | **v1.2** 故障注入：把 `fetch` 换成永不 resolve 的假 fetch 复现刷新卡死（需 ~75s） |
| `make_ver.cjs` | **v1.2** 版本徽标：文本/样式/标题/更新说明/暗色跟随；`node make_ver.cjs shot` 额外截图 |

`make_real.cjs` 支持 `SRC=` / `OUT=` 环境变量，可直接测 `交付/量能雷达.html`
（验证 `file://` 协议下真实可用）。**所有脚本都支持 `SRC=xxx`**，便于测任意副本：

```bash
SRC="D:/document/量能雷达-v1.2.html" node _dev/make_p0.cjs
```

## 两条踩坑备忘（写测试时反复遇到）

1. **`const` / `let` 顶层声明不挂 `window`**：`model` 是 `const model`、`BASE_MODE` 是
   `let BASE_MODE`，所以测试脚本里写 `window.BASE_MODE = 'avg5'` 会**静默失效**，
   断言全部失真却不报错，表现为"产品有 bug"的假象。**测试里一律用裸标识符赋值。**
2. **断言要按外层容器查**：变更说明的标题在 `.acc-head`、正文在 `.note`，
   只查 `querySelectorAll('.note')` 会误报"未找到"，应按 `.card` 整块查。

## 定位「自动刷新不工作」的方法论

正常网络下测试是**通过**的，静态读代码也看不出问题——必须构造故障场景。
`make_arsim.cjs` 的做法是替换 `window.fetch` 为永不 resolve 的 Promise，
再把刷新周期从 30s 压到 6s 放大问题。对比两种场景即可定位：

| 场景 | 结果 |
| --- | --- |
| fetch 立刻失败（503） | 刷新正常 |
| fetch 永不返回（挂死） | **仅首屏 1 次，之后全被跳过 → 完全卡死** |

> 通用教训：**「请求 promise 永不 settle」是所有轮询代码的经典死锁**。
> `.finally()` 不是解锁保险——它与 promise 同生共死，挂住时根本不会执行。
> 必须有**独立于请求生命周期**的看门狗定时器。
