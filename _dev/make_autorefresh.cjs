/* 自动刷新链路诊断：不猜，直接跑 70 秒计数
   观测 5 件事：
   A) 网络请求次数（fetchJson / jsonp 被调用了几次）—— 定时器到底有没有在跑
   B) el('upd') 更新时间戳是否推进 —— 数据到底有没有更新
   C) loading 锁是否卡死 —— 卡死则后续全部被静默跳过
   D) lastTick / 倒计时显示 —— 用户看到的「下次刷新 Ns」是否合理
   E) 后台→前台切换（派发 visibilitychange）是否触发补刷

   用法：node make_autorefresh.cjs
        SRC=xxx node make_autorefresh.cjs
*/
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
const OUT = process.env.OUT || 'vr_autorefresh.html';
let html = fs.readFileSync(SRC, 'utf8');

const inject = `
<div id="testlog" style="white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px;margin:8px;border:1px solid #ccc;background:#fff"></div>
<script>
(function(){
  var L = document.getElementById('testlog');
  function log(s){ L.textContent += s + '\\n'; }
  window.onerror = function(m, src, l, c){ log('!! JS ERROR: ' + m + ' @' + l + ':' + c); };
  window.addEventListener('unhandledrejection', function(e){ log('!! REJECT: ' + (e.reason && e.reason.message || e.reason)); });

  var T0 = Date.now();
  function el2(s){ return ((Date.now()-T0)/1000).toFixed(1) + 's'; }
  var NET = { fetchJson: 0, jsonp: 0, load: 0, doRefresh: 0, tick: 0, onVisible: 0 };
  var UPD = [], STATUS = [];

  window.addEventListener('load', function(){
    // ---- 挂钩计数（不改行为）----
    var oFJ = window.fetchJson;
    window.fetchJson = function(){ NET.fetchJson++; return oFJ.apply(this, arguments); };
    var oJP = window.jsonp;
    window.jsonp = function(){ NET.jsonp++; return oJP.apply(this, arguments); };
    var oLoad = window.load;
    window.load = function(){ NET.load++; log('  [net] load() #' + NET.load + ' @' + el2()); return oLoad.apply(this, arguments); };

    setTimeout(function(){
      if (typeof model === 'undefined' || !model.series){
        log('!! 首屏未就绪'); document.title='DONE_FAIL'; return;
      }
      log('=== A) 启动状态 ===');
      log('  auto=' + auto + '  timer=' + (timer ? '有' : 'null') +
          '  cdTimer=' + (cdTimer ? '有' : 'null') + '  loading=' + loading);
      log('  lastTick=' + (lastTick ? el2() : '0(从未 tick)') );
      log('  按钮文本="' + document.getElementById('btnAuto').textContent + '"  on态=' + document.getElementById('btnAuto').classList.contains('on'));
      log('  倒计时显示="' + document.getElementById('auto').textContent + '"');
      log('  refCode=' + model.refCode + '  histDate=' + model.histDate + '  lastBar=' + model.lastBar);
      log('  upd 初始="' + document.getElementById('upd').textContent + '"');
      log('  基准 autoP5/show5=' + (typeof show5 !== 'undefined' ? show5 : '?') + '  GRID_K=' + (typeof GRID_K!=='undefined'?GRID_K:'?') + '  BPD=' + BPD);

      // ---- 每秒采样：upd 时间戳 / 状态 / loading / 倒计时 ----
      var samples = [];
      var t = setInterval(function(){
        samples.push({
          t: (Date.now()-T0)/1000,
          upd: document.getElementById('upd').textContent,
          status: document.getElementById('status').textContent.slice(0,30),
          dot: document.getElementById('dot').className,
          loading: loading,
          cd: document.getElementById('auto').textContent,
          viewj: view.j, lastBar: model.lastBar,
          fj: NET.fetchJson, jp: NET.jsonp, ld: NET.load
        });
      }, 1000);

      // ---- 35s 时模拟「后台切回前台」----
      setTimeout(function(){
        log('');
        log('=== E) 模拟切回前台（派发 visibilitychange）@' + el2() + ' ===');
        Object.defineProperty(document, 'hidden', {configurable:true, get:function(){ return false; }});
        document.dispatchEvent(new Event('visibilitychange'));
        log('  已派发 visibilitychange');
      }, 35000);

      // ---- 70s 收尾 ----
      setTimeout(function(){
        clearInterval(t);
        log('');
        log('=== 汇总（跑了 ' + ((Date.now()-T0)/1000).toFixed(0) + ' 秒）===');
        log('网络请求： fetchJson=' + NET.fetchJson + '  jsonp=' + NET.jsonp + '  load()=' + NET.load);
        log('  期望：70s / 30s 周期 ≈ 2 次自动刷新（首屏那次不计入 load 钩子前）');
        log('  ' + (NET.load >= 2 ? '✅ 自动刷新有在发请求' : '❌ 自动刷新几乎没有请求'));

        var updSet = {};
        samples.forEach(function(s){ updSet[s.upd] = 1; });
        log('upd 时间戳出现过 ' + Object.keys(updSet).length + ' 个不同值: ' + Object.keys(updSet).join(' | '));
        log('  ' + (Object.keys(updSet).length >= 2 ? '✅ 数据确实在更新' : '❌ upd 从未变化 → 数据没更新'));

        var stuck = samples.filter(function(s){ return s.loading; });
        log('loading=true 的采样数: ' + stuck.length + '/' + samples.length +
            (stuck.length > samples.length*0.5 ? '  ❌ loading 锁疑似卡死' : '  ✅ 未卡死'));

        log('');
        log('=== 每 5 秒采样表 ===');
        log('  时间   upd        loading  倒计时显示        status');
        samples.forEach(function(s, i){
          if (i % 5 === 0 || i === samples.length-1){
            log('  ' + s.t.toFixed(0).padStart(3) + 's  ' + String(s.upd).padEnd(9) +
                '  ' + String(s.loading).padEnd(7) + ' ' + String(s.cd).padEnd(16) + ' ' + s.status);
          }
        });

        log('');
        log('=== view.j 是否跟随 lastBar 前进 ===');
        var last = samples[samples.length-1];
        log('  末次 view.j=' + last.viewj + '  model.lastBar=' + last.lastBar +
            '  ' + (last.viewj >= last.lastBar ? '✅ 跟到最新' : '⚠️ view.j 落后于 lastBar（锁在旧 bar，看着像不刷新）'));

        document.title = 'DONE';
      }, 70000);
    }, 12000);
  });
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIR, OUT), html, 'utf8');
console.log('生成 ' + OUT + '（跑 70 秒）');
