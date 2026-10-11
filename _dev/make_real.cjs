/* 生成「真实链路」测试页：不造假数据，只记录请求/响应与页面状态
   用法：node make_real.cjs   →  _dev/vr_real.html
   再用 headless Chrome --dump-dom 跑，读 #testlog                        */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
// SRC=xxx 可指定被测文件（默认 ../index.html）；OUT=yyy 可指定输出名
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
const OUT = process.env.OUT || 'vr_real.html';
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

  // 只记录，不改变行为
  var origFetchJson = window.fetchJson;
  window.__net = [];
  window.fetchJson = function(url, cb, to){
    var t0 = Date.now();
    return origFetchJson.apply(null, arguments).then(function(r){
      var n = 0; try { n = (r && r.data && r.data.klines) ? r.data.klines.length : -1; } catch(e){}
      window.__net.push({url:url, ms:Date.now()-t0, bars:n});
      log('[net] ' + (Date.now()-t0) + 'ms bars=' + n + '  ' + url.slice(0, 130));
      return r;
    }, function(e){
      window.__net.push({url:url, ms:Date.now()-t0, err:String(e && e.message || e)});
      log('[net] FAIL ' + (Date.now()-t0) + 'ms  ' + String(e && e.message || e).slice(0,120) + '  ' + url.slice(0,110));
      throw e;
    });
  };
  var origJsonp = window.jsonp;
  window.jsonp = function(url){
    var t0 = Date.now();
    return origJsonp.apply(null, arguments).then(function(r){
      log('[jsonp] ' + (Date.now()-t0) + 'ms  ' + url.slice(0,120));
      return r;
    }, function(e){ log('[jsonp] FAIL ' + String(e && e.message || e).slice(0,100) + '  ' + url.slice(0,110)); throw e; });
  };

  function snap(tag){
    var st = document.getElementById('status').textContent.trim();
    var hero = document.getElementById('hero').textContent.replace(/\\s+/g,' ').slice(0,150);
    log(tag + ' | histDate=' + model.histDate + ' src=' + model.histSrc + ' BPD=' + BPD + ' GRID_K=' + GRID_K +
        ' UNIT=' + AMT_UNIT + ' days=' + model.days.length + ' lastBar=' + model.lastBar);
    log('   status: ' + st);
    log('   hero: ' + hero);
    if (model.days.length) log('   dates: ' + model.days.map(function(d){return d.date;}).join(','));
    var t = document.getElementById('toast'); if (t && t.className.indexOf('show') >= 0) log('   toast: ' + t.textContent);
    var s = model.series;
    if (s && s.predKpl){
      var end = s.predKpl[s.predKpl.length-1], tot = model.days.length ? model.days[model.days.length-1].total : NaN;
      log('   predEnd=' + (end/1e8).toFixed(1) + '亿  dayTotal=' + (tot/1e8).toFixed(1) + '亿  比值=' + (end/tot).toFixed(4));
    } else log('   series: (none)');
  }

  (async function(){
    await new Promise(function(r){ setTimeout(r, 4000); });
    log('===== 1) 首屏（实时） =====');
    snap('live');

    log('===== 2) 复盘 sh000985 2026-10-08（本地1分钟数据集） =====');
    try { await loadHistory('sh000985', '20261008'); snap('hist1008'); }
    catch(e){ log('EXCEPTION: ' + e.message); log((e.stack||'').split('\\n').slice(0,3).join(' | ')); }

    if (window.__SHOT) { log('SHOT_MODE_STOP_AT_HIST'); document.title='TESTLOG_DONE'; return; }

    log('===== 3) 复盘 sh000985 2026-09-15（中段历史） =====');
    try { await loadHistory('sh000985', '20260915'); snap('hist0915'); }
    catch(e){ log('EXCEPTION: ' + e.message); }

    log('===== 4) 复盘 sh000985 2026-03-03（数据集极早段） =====');
    try { await loadHistory('sh000985', '20260303'); snap('hist0303'); }
    catch(e){ log('EXCEPTION: ' + e.message); }

    log('===== 5) 切标的 sz399106 保持 2026-09-15 =====');
    try { await loadHistory('sz399106', '20260915'); snap('hist0915-399106'); }
    catch(e){ log('EXCEPTION: ' + e.message); }

    log('===== 6) 无本地数据的标的 sh600519 复盘 2026-09-15（应回落粗网格） =====');
    try { await loadHistory('sh600519', '20260915'); snap('hist0915-600519'); }
    catch(e){ log('EXCEPTION: ' + e.message); }

    log('===== 7) 边界：sh000985 2026-02-24（早于可复盘范围） =====');
    try { await loadHistory('sh000985', '20260224'); snap('edge'); }
    catch(e){ log('EXCEPTION: ' + e.message); }
    log('   grid after fail: BPD=' + BPD + ' GRID_K=' + GRID_K + ' UNIT=' + AMT_UNIT + ' histDate=' + model.histDate);

    log('===== 8) 回到今天 =====');
    try { await load('sh000985', false); snap('back'); }
    catch(e){ log('EXCEPTION: ' + e.message); }

    log('DONE requests=' + window.__net.length);
    document.title = 'TESTLOG_DONE';
  })();
})();
</script>
`;

html = html.replace('</body>', inject + '</body>');
const out = path.join(DIR, OUT);
fs.writeFileSync(out, html, 'utf8');
console.log('written', out, html.length);
