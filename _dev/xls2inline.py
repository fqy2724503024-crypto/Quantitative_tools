# -*- coding: utf-8 -*-
"""
把通达信导出的「指数 1 分钟K线」固化进 index.html，供历史复盘使用。

用法：
    <venv python> _dev/xls2inline.py [源目录] [index.html 路径]

· 源目录里放形如「000985一分钟.xls」的文件（通达信 → 导出数据）。
  兼容两种格式：制表符分隔的 UTF-8/GBK 文本、真正的 Excel .xls（需 xlrd）。
· 只取「收盘价」与「成交额」两列；成交额原始单位是万元，这里换算成元。
· 按 A 股 240 根/日网格（09:31–11:30、13:01–15:00）对齐，缺失分钟前向填充。
· 编码：收盘价×100 的差分 zigzag+LEB128；每分钟成交额增量的 LEB128（自动挑更省的一种）。
· 结果写入 index.html 的 /*<<<HIST1M_BEGIN>>>*/ … /*<<<HIST1M_END>>>*/ 之间。
"""
import base64
import os
import re
import sys
from collections import OrderedDict, defaultdict

# ---------- 时间网格：与页面 TIMES1M 严格一致 ----------
def build_times():
    t = []
    for m in range(9 * 60 + 31, 11 * 60 + 31):      # 09:31 – 11:30
        t.append('%02d%02d' % (m // 60, m % 60))
    for m in range(13 * 60 + 1, 15 * 60 + 1):       # 13:01 – 15:00
        t.append('%02d%02d' % (m // 60, m % 60))
    return t

TIMES = build_times()          # 240 根
N = len(TIMES)


def code_of(raw6):
    """6 位代码 → 行情代码：399xxx 归深市，其余（000/688/852…）归沪市"""
    return ('sz' if raw6.startswith('399') else 'sh') + raw6


def name_of(title):
    m = re.match(r'^(.*?)\((.{6})\)', title.strip())
    if m:
        return m.group(1).strip(), m.group(2)
    return None, None


# ---------- 读取 ----------
def read_rows(path):
    """返回 [(title, header, [row...])]，row = [时间串, 各列数值...]"""
    head = open(path, 'rb').read(8)
    if head[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':      # OLE2 = 真 Excel
        import xlrd
        sh = xlrd.open_workbook(path).sheet_by_index(0)
        grid = [[sh.cell_value(r, c) for c in range(sh.ncols)] for r in range(sh.nrows)]
    else:                                                     # 制表符文本
        raw = open(path, 'rb').read()
        for enc in ('gbk', 'utf-8-sig', 'utf-8'):
            try:
                txt = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise RuntimeError('无法解码：' + path)
        grid = [ln.split('\t') for ln in txt.replace('\r\n', '\n').split('\n')]
    return grid


def parse_file(path):
    grid = read_rows(path)
    title = str(grid[0][0]) if grid else ''
    header = [str(x).strip() for x in grid[1]] if len(grid) > 1 else []
    # 定位列：时间 / 收盘 / 成交额
    i_t = 0
    def find(*names):
        for nm in names:
            for i, h in enumerate(header):
                if h == nm:
                    return i
        return None
    i_c = find('收盘', '收盘价')
    i_a = find('成交额', '成交金额', '成交额(万元)')
    if i_c is None or i_a is None:
        # 兜底：6 列 = 时间开高低收额；8 列 = 时间开高低收 量 额 量
        i_c, i_a = (4, 5) if len(header) <= 6 else (4, 6)
    name, raw6 = name_of(title)
    if not raw6:
        m = re.search(r'(\d{6})', os.path.basename(path))
        raw6 = m.group(1) if m else None
        name = name or raw6
    if not raw6:
        raise RuntimeError('无法识别代码：' + path)

    by_day = OrderedDict()
    for r in grid[2:]:
        if len(r) <= max(i_c, i_a):
            continue
        ts = str(r[i_t]).strip()
        if '-' not in ts and ' ' not in ts:
            continue
        m = re.match(r'^(\d{4})/(\d{2})/(\d{2})[- ](\d{2}):(\d{2})', ts)
        if not m:
            continue
        ymd = m.group(1) + m.group(2) + m.group(3)
        hm = m.group(4) + m.group(5)
        try:
            px = float(r[i_c])
            am = float(r[i_a])
        except (TypeError, ValueError):
            continue
        by_day.setdefault(ymd, {})[hm] = (px, am)
    return code_of(raw6), name or raw6, by_day


# ---------- 编码 ----------
def leb(n):
    assert n >= 0
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def zz(n):
    return (n << 1) if n >= 0 else (-n - 1 << 1 | 1)


def enc_delta_zigzag(vals):
    buf = bytearray()
    prev = 0
    for v in vals:
        buf += leb(zz(v - prev))
        prev = v
    return bytes(buf)


def enc_plain(vals):
    buf = bytearray()
    for v in vals:
        buf += leb(v)
    return bytes(buf)


def b64(b):
    return base64.b64encode(b).decode('ascii')


def build_entry(code, name, by_day, am_scale):
    """am_scale：成交额（万元）放大倍数后取整；还原时 amt元 = v/am_scale*1e4"""
    dates, pxs, ams = [], [], []
    for ymd in sorted(by_day):
        cells = by_day[ymd]
        if len(cells) < 120:          # 半日/残缺日直接丢弃
            continue
        last_px = None
        day_px, day_am = [], []
        for hm in TIMES:
            if hm in cells:
                last_px = cells[hm][0]
                am = cells[hm][1]
            else:
                am = 0.0
            if last_px is None:       # 开盘前缺口，用当日第一根补
                first = next(iter(cells.values()))
                last_px = first[0]
            day_px.append(int(round(last_px * 100)))
            day_am.append(int(round(abs(am) * am_scale)))
        if sum(day_am) <= 0:
            continue
        dates.append(ymd)
        pxs.extend(day_px)
        ams.extend(day_am)

    px_b = enc_delta_zigzag(pxs)
    am_plain = enc_plain(ams)
    am_zz = enc_delta_zigzag(ams)
    if len(am_zz) < len(am_plain):
        am_field = 'z' + b64(am_zz)
        am_bytes = len(am_zz)
    else:
        am_field = b64(am_plain)
        am_bytes = len(am_plain)
    return {
        'name': name,
        'n': N,
        'd': ','.join(dates),
        'px': b64(px_b),
        'am': am_field,
        '_stat': (len(dates), dates[0] if dates else '-', dates[-1] if dates else '-',
                  len(px_b), am_bytes),
    }


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else \
        r'D:\xwechat_files\wxid_d3fje00iuhkd22_f7fd\msg\file\2026-10'
    html_path = sys.argv[2] if len(sys.argv) > 2 else \
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html')
    am_scale = 1          # 成交额取整到「万元」；还原 amt元 = v * 1e4

    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.xls'))
    if not files:
        raise SystemExit('源目录里没有 .xls：' + src)

    idx = OrderedDict()
    print('%-10s %-8s %6s  %s ~ %s   px/am 字节' % ('code', 'name', 'days', 'from', 'to'))
    for f in files:
        code, name, by_day = parse_file(os.path.join(src, f))
        e = build_entry(code, name, by_day, am_scale)
        ndays, d0, d1, npx, nam = e.pop('_stat')
        idx[code] = e
        print('%-10s %-8s %6d  %s ~ %s   %d / %d  (%s)' %
              (code, name, ndays, d0, d1, npx, nam, f))

    lines = []
    for code, e in idx.items():
        lines.append("    '%s': { name:'%s', n:%d, s:%d, d:'%s',\n      px:'%s',\n      am:'%s' }," %
                     (code, e['name'], e['n'], am_scale, e['d'], e['px'], e['am']))
    block = (
        "/* 本地 1 分钟历史数据集 —— 由 _dev/xls2inline.py 自动生成，源：通达信导出的指数 1 分钟K线。\n"
        "   网格 240 根/日（09:31-11:30、13:01-15:00），成交额单位万元（页面还原成元）。\n"
        "   覆盖：%s */\n"
        "window.HIST1M = {\n  idx: {\n%s\n  }\n};\n"
    ) % (', '.join('%s(%d日)' % (e['name'], len(e['d'].split(','))) for e in idx.values()),
         '\n'.join(lines))

    html = open(html_path, encoding='utf-8').read()
    a, b = html.find('/*<<<HIST1M_BEGIN>>>*/'), html.find('/*<<<HIST1M_END>>>*/')
    if a < 0 or b < 0:
        raise SystemExit('index.html 里找不到 HIST1M 占位标记')
    html = html[:a] + '/*<<<HIST1M_BEGIN>>>*/\n' + block + '\n' + html[b:]
    open(html_path, 'w', encoding='utf-8').write(html)
    print('\n已写入 %s  （%.2f MB）' % (html_path, len(html.encode('utf-8')) / 1048576.0))


if __name__ == '__main__':
    main()
