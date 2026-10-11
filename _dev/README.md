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

`make_real.cjs` 支持 `SRC=` / `OUT=` 环境变量，可直接测 `交付/量能雷达.html`
（验证 `file://` 协议下真实可用）。
