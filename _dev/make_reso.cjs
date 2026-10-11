/* 验证共振阈值可调：口径一致性 / 实时生效 / 灵敏度统计 / 预设 / 快捷键 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
let html = fs.readFileSync(SRC, 'utf8');

const SHOT = process.argv[2] === 'shot';
const inject = `
${SHOT ? '' : '<div id="testlog" style="white-space:pre-wrap;font:12px/1.55 ui-monospace,Consolas,monospace;padding:10px;margin:8px;border:1px solid #ccc;background:#fff"></div>'}
<script>
window.__SHOT = ${SHOT ? 'true' : 'false'};
(function(){
  var L = document.getElementById('testlog');
  if (!L){ L = document.createElement('div'); L.id='testlog'; L.style.display='none'; document.body.appendChild(L); }
  function log(s){ L.textContent += s + '\\n'; }
  window.onerror = function(m,s,l,c){ log('!! ERR '+m+' @'+l+':'+c); };
  window.addEventListener('unhandledrejection', function(e){ log('!! REJ '+(e.reason&&e.reason.message||e.reason)); });
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function txt(id){ var e=document.getElementById(id); return e?e.textContent.replace(/\\s+/g,' ').trim():'(nf)'; }
  function key(k){ document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true})); }

  // 数当前共振色带的像素数（红/绿竖带的总面积），用来验证阈值真的生效
  function bandPixels(){
    var cv=document.getElementById('cv'), c=cv.getContext('2d');
    var r = { x: document.getElementById('cv').getBoundingClientRect() };
    // 取分量比 pane 区域：从 paneRects.ratio 换算到 canvas 像素
    var pr = paneRects.ratio, dpr = window.devicePixelRatio||1;
    var y0 = Math.round(pr.py*dpr), hh = Math.round(pr.ph*dpr);
    var d = c.getImageData(0, y0, cv.width, hh).data;
    var n=0;
    for (var i=0;i<d.length;i+=4){ if (d[i+3] > 6) n++; }   // 有色即算（含线条）
    return n;
  }

  (async function(){
    await wait(5200);

    log('===== 1) 控件存在与初始值 =====');
    log('resoHi=' + txt('resoHi') + ' resoLo=' + txt('resoLo') +
        '  RESO_HI=' + RESO_HI + ' RESO_LO=' + RESO_LO);
    var bar = document.getElementById('resobar');
    log('工具条位置 top=' + bar.style.top + ' right=' + bar.style.right +
        ' （分量比副图 y=' + paneRects.ratio.y + '）');

    log('===== 2) 灵敏度统计 =====');
    var t0 = performance.now();
    var st = resoStats();
    log('耗时 ' + Math.round(performance.now()-t0) + 'ms  样本=' + (st?st.n:'-'));
    if (st) log('  放量中位=' + pct1(st.hotMed) + ' 四分位 ' + pct1(st.hotQ1) + '~' + pct1(st.hotQ3) +
                '　缩量中位=' + pct1(st.coldMed) + ' 四分位 ' + pct1(st.coldQ1) + '~' + pct1(st.coldQ3));
    log('  页面提示: ' + txt('resoTip'));

    log('===== 3) 改阈值 → 统计与色带应随之变化 =====');
    [['1.20','0.80'],['1.35','0.70'],['1.10','0.90'],['2.00','0.40']].forEach(function(p){
      setReso(p[0], p[1]);
      var s = resoStats();
      log('阈值 ' + p[0] + '/' + p[1] + ' → 放量中位 ' + (s?pct1(s.hotMed):'-') +
          '　缩量中位 ' + (s?pct1(s.coldMed):'-') + '　提示="' + txt('resoTip').slice(0,60) + '"');
    });
    log('（阈值越高，放量占比应单调下降；越低则上升）');

    log('===== 4) 非法输入校验 =====');
    setReso(0.9, 1.5);
    log('放量 0.90 / 缩量 1.50 → resoTip="' + txt('resoTip') + '" bad高亮=' +
        document.getElementById('resoHi').classList.contains('bad'));
    setReso('abc', '');
    log('输入 abc → 保持 ' + RESO_HI + '/' + RESO_LO + '（拒绝非法值）');

    log('===== 5) 预设按钮 =====');
    setReso(1.20, 0.80);
    document.querySelector('.resobar .rb-b[data-p="strict"]').click();
    log('点严格 → ' + RESO_HI + '/' + RESO_LO +
        ' on态=' + document.querySelector('.resobar .rb-b[data-p="strict"]').classList.contains('on'));
    document.querySelector('.resobar .rb-b[data-p="loose"]').click();
    log('点宽松 → ' + RESO_HI + '/' + RESO_LO +
        ' strict的on态=' + document.querySelector('.resobar .rb-b[data-p="strict"]').classList.contains('on'));

    log('===== 6) 快捷键 Y 轮换 =====');
    setReso(1.20, 0.80);
    key('y'); await wait(200); log('Y 一次 → ' + RESO_HI + '/' + RESO_LO);
    key('y'); await wait(200); log('Y 二次 → ' + RESO_HI + '/' + RESO_LO);
    key('y'); await wait(200); log('Y 三次 → ' + RESO_HI + '/' + RESO_LO + '（回到标准）');
    log('面板行数=' + document.querySelectorAll('#keyList .keyrow').length);

    log('===== 7) 口径一致性：复盘日 MLB/JMLB 必须与 resoSeries 逐根相同 =====');
    try { await loadHistory('sh000985', '20260915'); } catch(e){ log('EX '+e.message); }
    var ser = resoSeries('sh000985');
    var row = null;
    for (var i=0;i<ser.length;i++) if (ser[i].date === '20260915') row = ser[i];
    log('resoSeries 里有 20260915: ' + !!row);
    if (row){
      var mx1=0, mx2=0, bad=0;
      for (var j=0;j<240;j++){
        var a1=model.series.MLB[j], a2=row.mlb[j];
        var b1=model.series.JMLB[j], b2=row.jmlb[j];
        if (isFinite(a1)&&isFinite(a2)) mx1=Math.max(mx1, Math.abs(a1-a2));
        if (isFinite(b1)&&isFinite(b2)) mx2=Math.max(mx2, Math.abs(b1-b2));
        if (j===239) log('  j=239 页面 MLB=' + a1.toFixed(6) + ' resoSeries=' + a2.toFixed(6) +
                          '　JMLB=' + b1.toFixed(6) + ' vs ' + b2.toFixed(6));
      }
      log('  全天最大差: MLB=' + mx1.toExponential(2) + '  JMLB=' + mx2.toExponential(2) +
          (mx1 < 1e-9 && mx2 < 1e-9 ? '  ✓ 完全一致' : '  ✗ 口径不一致'));
    }

    log('===== 8) 共振带开关时工具条显隐 =====');
    setReso(1.20, 0.80);
    document.getElementById('btnReso').click(); await wait(300);
    log('关共振带 → resobar display=' + document.getElementById('resobar').style.display);
    document.getElementById('btnReso').click(); await wait(300);
    log('开共振带 → resobar display=' + (document.getElementById('resobar').style.display || '(默认显示)'));

    log('===== 9) 个股（无内置历史）=====');
    try { await loadHistory('sh600519', '20260915'); } catch(e){ log('EX '+e.message); }
    log('resoTip="' + txt('resoTip') + '"');
    setReso(1.20, 0.80);

    if (window.__SHOT){
      try { await loadHistory('sh000985', '20260915'); } catch(e){ log('EX '+e.message); }
      setReso(1.10, 0.90);
      if (document.documentElement.getAttribute('data-theme') !== 'dark') toggleTheme();
      log('SHOT_STOP ' + txt('resoTip'));
      document.title='DONE'; return;
    }
    log('DONE'); document.title='DONE';
  })();
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
const out = path.join(DIR, 'vr_reso.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written', out);