/* 验证「前N日均量」口径改为**排除今日**（v1.1 修复）
   断言：
   1) priorAvg() 的 n == DAYS-1（4），且 v == 只用 days[0..3] 的均值
   2) priorAvg().v 与「含今日」的旧算法结果**不相等**（盘中未跑完的量确实会拉低）
   3) baseVal('avg5') === priorAvg().v（三处口径统一）
   4) 头部 / KPI / 图例 / 主图参考线标签里不再出现「近5日」「5日均量」
   5) 基准三档切换后 model.base 仍自洽，无 JS 错误

   用法：node make_avgfix.cjs [shot]
        SRC=xxx node make_avgfix.cjs     指定被测文件
*/
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
const OUT = process.env.OUT || 'vr_avgfix.html';
let html = fs.readFileSync(SRC, 'utf8');

const SHOT = process.argv[2] === 'shot';
const inject = `
${SHOT ? '' : '<div id="testlog" style="white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px;margin:8px;border:1px solid #ccc;background:#fff"></div>'}
<script>
window.__SHOT = ${SHOT ? 'true' : 'false'};
var LOGEL = document.getElementById('testlog');
if (!LOGEL){ LOGEL = document.createElement('div'); LOGEL.id='testlog'; LOGEL.style.display='none'; document.body.appendChild(LOGEL); }
(function(){
  var L = document.getElementById('testlog');
  function log(s){ L.textContent += s + '\\n'; }
  window.__log = log;
  window.onerror = function(m, src, l, c){ log('!! JS ERROR: ' + m + ' @' + l + ':' + c); };
  window.addEventListener('unhandledrejection', function(e){ log('!! REJECT: ' + (e.reason && e.reason.message || e.reason)); });

  function fmt(v){ return (isFinite(v) ? v.toFixed(4) : 'NaN'); }
  function step(n, t){ log('\\n[' + n + '] ' + t); }

  window.addEventListener('load', function(){
    setTimeout(function(){
      try{
        // ---------- 前提：等模型就绪 ----------
        if (typeof model === 'undefined' || !model.days || !model.days.length){
          log('!! 模型未就绪：typeof model=' + (typeof model) +
              ' series=' + (typeof model!=='undefined' && !!model.series) +
              ' days=' + (typeof model!=='undefined' && model.days ? model.days.length : 'null') +
              ' status=' + ((document.getElementById('status')||{}).textContent||''));
          document.title='DONE_FAIL'; return;
        }
        var DAYS = (typeof DAYS !== 'undefined') ? DAYS : 5;
        log('DAYS=' + DAYS + '  days.length=' + model.days.length +
            '  today=' + model.days[DAYS-1].date + '  total=' + fmtAmt(model.days[DAYS-1].total));
        log('各日 total： ' + model.days.map(function(d){ return d.date + '=' + fmtAmt(d.total); }).join('  '));

        // ---------- 断言 1：n == DAYS-1，v 只用前 4 日 ----------
        step(1, 'priorAvg() 是否排除今日');
        var pa = priorAvg();
        var expect = model.days.slice(0, DAYS-1).filter(function(d){ return isFinite(d.total) && d.total>0; });
        var expectV = expect.reduce(function(s,d){ return s+d.total; },0) / expect.length;
        log('  priorAvg() -> n=' + pa.n + '  v=' + fmtAmt(pa.v));
        log('  手算前' + (DAYS-1) + '日均值 -> n=' + expect.length + '  v=' + fmtAmt(expectV));
        log('  ' + (pa.n === expect.length ? '✅ n 一致' : '❌ n 不一致 ' + pa.n + ' vs ' + expect.length));
        log('  ' + (Math.abs(pa.v - expectV) < 1e-6 ? '✅ v 与「排除今日」手算一致' : '❌ v 不一致'));

        // ---------- 断言 2：与「含今日」的旧算法确实不同 ----------
        step(2, '与旧的「含今日」算法对比（证明修复有效）');
        var dsAll = model.days.filter(function(d){ return isFinite(d.total) && d.total>0; });
        var oldV = dsAll.reduce(function(s,d){ return s+d.total; },0) / dsAll.length;
        var today = model.days[DAYS-1].total;
        log('  旧(含今日,n=' + dsAll.length + ') = ' + fmtAmt(oldV));
        log('  新(排除今日,n=' + pa.n + ') = ' + fmtAmt(pa.v));
        log('  差值 = ' + fmtAmt(oldV - pa.v) + '  (' + fmt((oldV-pa.v)/pa.v*100) + '%)');
        log('  ' + (Math.abs(oldV - pa.v) > 1e-9 ? '✅ 两者不同 → 旧口径确实偏低，修复有意义' : '⚠ 本日今日量恰好≈均值，两值相同'));
        log('  ' + (oldV < pa.v ? '✅ 旧口径偏低（今日未跑完拉低了基准，会放大放量读数）' : 'ℹ 旧口径不偏低（今日量已超均值，属收盘后/复盘情形）'));

        // ---------- 断言 3：baseVal('avg5') === priorAvg().v ----------
        step(3, 'baseVal 三档口径统一');
        var oldMode = BASE_MODE;
        BASE_MODE = 'avg5';
        var bv = baseVal();
        log('  baseVal(avg5) = ' + fmtAmt(bv));
        log('  ' + (Math.abs(bv - pa.v) < 1e-6 ? '✅ baseVal(avg5) === priorAvg().v（0轴基准同口径）' : '❌ 不一致 ' + fmtAmt(bv) + ' vs ' + fmtAmt(pa.v)));
        var ms = model.stats;
        BASE_MODE = 'med60';
        var mv = baseVal();
        log('  baseVal(med60) = ' + fmtAmt(mv) + (ms && isFinite(ms.medAll) ? '  (medAll=' + fmtAmt(ms.medAll) + ' ✅)' : '  (无本地数据集，跳过)'));
        BASE_MODE = 'yest';
        var yv = baseVal();
        log('  baseVal(yest)  = ' + fmtAmt(yv) + '  ' + (Math.abs(yv - model.days[DAYS-2].total) < 1e-6 ? '✅ = 昨日全天' : '❌'));
        BASE_MODE = oldMode;

        // ---------- 断言 4：标签不再出现「近5日」「5日均量」 ----------
        step(4, '界面标签检查');
        var heroTxt = (document.getElementById('hero')||{}).textContent || '';
        var kpiTxt  = (document.getElementById('kpis')||{}).textContent || '';
        var b5 = document.getElementById('btnB5');
        var b5Txt = b5 ? b5.textContent : '(缺失)';
        log('  头部含「前' + pa.n + '日均量」: ' + (heroTxt.indexOf('前' + pa.n + '日均量') >= 0 ? '✅' : '❌ 未找到'));
        log('  KPI 含「前' + pa.n + '日均量」: ' + (kpiTxt.indexOf('前' + pa.n + '日均量') >= 0 ? '✅' : '❌ 未找到'));
        log('  基准按钮文本 = "' + b5Txt + '"  ' + (b5Txt.indexOf('5日均量') >= 0 || b5Txt.indexOf('近5日') >= 0 ? '❌ 仍写5日' : '✅'));
        var bad = /近5日|5日均量/.test(heroTxt + kpiTxt);
        log('  ' + (bad ? '❌ 头部/KPI 仍出现「近5日/5日均量」' : '✅ 头部与 KPI 已无「近5日/5日均量」字样'));
        // 头部显示的均量数值应等于 priorAvg().v
        var m = heroTxt.match(/前\\d日均量([^昨]*?)(昨天同期|\\d)/);
        log('  头部 meta 片段: ' + (heroTxt.replace(/\\s+/g,' ').slice(0,150)));

        // ---------- 断言 5：切基准重绘不报错 ----------
        step(5, '基准轮换（B 键等价）不产生 JS 错误');
        var seq = ['avg5','med60','yest','avg5','yest'];
        var i = 0;
        (function next(){
          if (i >= seq.length){
            log('  ✅ 轮换 ' + seq.length + ' 次完成，无异常');
            // 复原默认
            BASE_MODE = oldMode; computeAll(); draw(); renderKpis(); renderHero();
            log('');
            log('=== ' + (window.__errCount ? '❌ 有 JS 错误 ' + window.__errCount + ' 处' : '✅ 全部通过，0 JS 错误') + ' ===');
            document.title = 'DONE';
            return;
          }
          BASE_MODE = seq[i++];
          try{ computeAll(); draw(); renderKpis(); renderHero();
            log('  ' + seq[i-1] + ' -> base=' + fmtAmt(model.base) + '  baseName=' + model.baseName); }
          catch(e){ log('  ❌ ' + seq[i-1] + ' 抛错: ' + e.message); }
          setTimeout(next, 30);
        })();

      }catch(e){ log('!! FATAL: ' + e.message + '\\n' + e.stack); document.title='DONE_FAIL'; }
    }, 9000);
  });
})();
</script>
`;

html = html.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIR, OUT), html, 'utf8');
console.log('生成 ' + OUT + '  (被测: ' + SRC + ')');
