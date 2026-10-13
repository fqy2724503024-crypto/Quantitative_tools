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
| `make_ver.cjs` | 版本徽标：文本与 `APP_VERSION` 自洽 / 样式 / 标题 / 更新说明 / 暗色跟随；`shot` 参数额外截图（**版本无关**，升级版本不必改测试） |
| `make_livepush.cjs` | **v1.3** 盘中推进：断言自动刷新后 `view.j` 跟随 `lastBar` 前移、滑块/时间标签同步、用户停靠位置不被拉走；含**像素级校验**（墨量须增加） |

`make_real.cjs` 支持 `SRC=` / `OUT=` 环境变量，可直接测 `交付/量能雷达.html`
（验证 `file://` 协议下真实可用）。**所有脚本都支持 `SRC=xxx`**，便于测任意副本：

```bash
SRC="D:/document/量能雷达-v1.3.html" node _dev/make_p0.cjs
```

## 定位「刷新不工作」类问题的方法论（v1.2 / v1.3 两次都用到了）

这类问题的共同点：**正常网络下测试是通过的，静态读代码也看不出问题**，必须构造场景。

### 三类典型故障与复现手法

| 故障 | 复现手法 | 脚本 |
| --- | --- | --- |
| 刷新彻底卡死（请求永不 settle） | 把 `window.fetch` 换成永不 resolve 的 Promise，并把刷新周期 30s 压到 6s 放大 | `make_arsim.cjs` |
| 刷新了但数据没更新 | 真实跑 70s，钩住 `fetchJson/jsonp/load` 计数 + 每秒采样 `upd`/`loading`/`dot` | `make_autorefresh.cjs` |
| 刷新了、数据更新了，但**图线不前进** | stub `fetchSeries` 返回"盘中走到第 k 根"的合成快照，断言 `view.j` 随 `lastBar` 前移 | `make_livepush.cjs` |

### ⚠️ 构造"盘中进度"快照的关键陷阱

**不能直接拿今日真实数据截断**：盘中今天本来就只有几十根（实测 47 根），
把 `j > k` 清零根本不改变 `lastBar`（`lastBar` = 最后一根 `amt>0` 的 bar），
截断到 100 毫无效果，**测试会假通过**。
正解：**先用昨日完整数据充当今日**（240 根齐），再截断到 k，`lastBar` 就确定性等于 k。

### 断言的两个坑（都真实踩过）

1. **DOM 属性是字符串**：`rng.value` 是 `"140"` 而非 `140`，
   `value === 140` 恒为假 → 会把"已同步"误判成 bug。必须 `+value === 140`。
2. **变量名改过就别再按旧名写 patch**：`make_ver.cjs` 里 `notes` 曾改名为 `cards`，
   之后按 `notes[i]` 写的替换脚本静默失配（不报错），导致版本升级后断言仍查旧版本号。
   改断言后**务必 grep 一遍是否还有硬编码残留**。

## 发布流程备忘（升版本时必做，都是踩过的坑）

### 版本号有三处载体，前两处必须一起改

| 载体 | 位置 | 漏改的后果 |
| --- | --- | --- |
| `APP_VERSION` 常量 | `<script>` 内 | 徽标与标题不被同步 |
| **静态 `<title>` 与 logo `.ver`** | HTML 源码 | JS 未跑时（看源码 / 禁脚本 / 爬虫取标题）显示旧版本号，源码自相矛盾 |
| changelog 卡片 | 页面底部 | 用户看不到改动说明 |

`syncVersion()` 只在**运行时**把徽标与标题改成 `APP_VERSION` 的值，
所以静态源码写错时页面看着是对的 —— **极易漏掉**。
v1.3 就漏了，发完才发现。升版本后务必：

```bash
grep -n "v1\.[0-9]" index.html     # 除 changelog 正文与版本注释外，不应再有旧版本号
```

### 交付物清单（四处 + zip 内条目名都要同步）

`index.html` → `交付/量能雷达.html` → `交付/site/index.html`（部署用）→ `D:/document/量能雷达-vX.Y.html`，
外加 zip（**条目名也要带版本号**），最后用 md5 校验四处一致。

### 沙箱写权限

`交付/` 下的文件在**沙箱内**写入会报 `PermissionError`（文件属性看着是 `rw-r--r--`，是沙箱策略）。
表现为 `cp` 静默失败、zip 重建后内容没变（长度相同，只有 2 字节不同 → 极易看漏）。
若写入失败，重试让命令以无隔离方式运行，或改用 PowerShell 工具。

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
