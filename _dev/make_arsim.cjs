/* 自动刷新故障复现：模拟网络失败/超时
   验证三个可疑缺陷是否真实存在：
   缺陷1  loading 锁卡死 → 后续 tick 全被静默跳过（无 loading 标志，用户看不出）
   缺陷2  单次刷新最坏 45s > 刷新周期 30s → 网络差时必然跳票
   缺陷3  doRefresh 在 loading 时 return，但倒计时照跑 → 显示"下次刷新 3s"却什么都没发生

   手法：把 fetch 换成永不 resolve 的假 fetch（模拟挂住），
        再把 jsonp 的 setTimeout 压到很短，模拟"快速失败"与"慢速失败"两种网络状况。

   用法：node make_arsim.cjs
*/
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
const OUT = 'vr_arsim.html';
let html = fs.readFileSync(SRC, 'utf8');

const inject = `
<div id="testlog" style="white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px;margin:8px;border:1px solid #ccc;background:#fff"></div>
<script>
(function(){
  var L = document.getElementById('testlog');
  function log(s){ L.textContent += s + '\\n'; }
  window.onerror = function(m,s,l,c){ log('!! JS ERROR: '+m+' @'+l+':'+c); };

  var T0 = Date.now();
  function el2(){ return ((Date.now()-T0)/1000).toFixed(1)+'s'; }

  // 在页面脚本执行前替换 fetch：按 SCENARIO 决定行为
  window.__SCENARIO = 'hang';   // 'hang' = 永不返回；'fail' = 立刻 500
  var realFetch = window.fetch;
  window.fetch = function(url, opt){
    if (String(url).indexOf('ifzq.gtimg.cn') >= 0 || String(url).indexOf('push2') >= 0){
      if (window.__SCENARIO === 'hang'){
        return new Promise(function(){ /* 永不 settle —— 模拟请求挂死 */ });
      }
      return Promise.resolve({ ok:false, status:503, json: function(){ return Promise.reject(new Error('503')); } });
    }
    return realFetch.apply(this, arguments);
  };

  window.addEventListener('load', function(){
    // 等首屏（首屏用真数据先加载成功，便于观察）
    setTimeout(function(){
      log('=== 场景：' + window.__SCENARIO + ' ===');
      log('现在把网络切到「' + (window.__SCENARIO==='hang'?'永不返回':'立刻失败') + '」');

      // 缩短 jsonp 超时，让测试在可控时间内跑完（生产是 12s，这里压到 2s）
      var realST = window.setTimeout;
      window.setTimeout = function(fn, ms){
        if (ms === 12000) ms = 2000;
        return realST(fn, ms);
      };

      // 压缩刷新周期 30s → 6s，等比放大问题（30/6 = 5 倍）
      // 直接改 A uto 内部：重开一个 6s 周期
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 6000);

      var calls = 0;
      var oLoad = window.load;
      window.load = function(){ calls++; log('  [load] 第 ' + calls + ' 次 @' + el2()); return oLoad.apply(this, arguments); };

      var skipped = 0;
      var oDo = window.doRefresh;
      window.doRefresh = function(){
        if (loading){ skipped++; log('  ⚠️ tick@' + el2() + ' 因 loading=true 被跳过（累计 ' + skipped + ' 次）'); }
        return oDo.apply(this, arguments);
      };

      var samples = [];
      var iv = setInterval(function(){
        samples.push({ t:(Date.now()-T0)/1000, loading:loading, cd:document.getElementById('auto').textContent,
                       dot:document.getElementById('dot').className, st:document.getElementById('status').textContent.slice(0,40) });
      }, 1000);

      setTimeout(function(){
        clearInterval(iv);
        log('');
        log('=== 结果（跑了 ' + ((Date.now()-T0)/1000).toFixed(0) + 's，刷新周期已压到 6s）===');
        log('load() 实际调用次数 = ' + calls + '（期望 ~' + (((Date.now()-T0)/1000)/6).toFixed(0) + ' 次）');
        log('因 loading 被跳过的 tick = ' + skipped + ' 次');
        log('');
        log('  ' + (calls <= 1 ? '❌ 只刷新了首屏那 1 次，之后全部卡死/跳过 → 这就是你说的「不能自动刷新」' : '✅ 刷新正常'));

        var stuckCount = samples.filter(function(s){ return s.loading; }).length;
        log('  loading=true 持续采样 = ' + stuckCount + '/' + samples.length +
            (stuckCount > samples.length * 0.5 ? '  ❌ loading 锁长期卡死' : ''));
        log('');
        log('  倒计时显示样本（注意：即使什么都没刷新，倒计时也在往下走 → 误导用户）:');
        samples.filter(function(s,i){ return i%4===0; }).forEach(function(s){
          log('    ' + s.t.toFixed(0).padStart(3) + 's loading=' + String(s.loading).padEnd(5) + ' ' + String(s.cd).padEnd(14) + ' dot=' + s.dot.padEnd(9) + ' ' + s.st);
        });
        var anyErr = samples.some(function(s){ return s.dot.indexOf('err')>=0; });
        log('');
        log('  ' + (anyErr ? '✅ 有 dot.err 失败提示' : '❌ 全程无任何失败提示 → 用户看不出已经卡住'));
        document.title = 'DONE';
      }, 40000);
    }, 12000);
  });
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIR, OUT), html, 'utf8');
console.log('生成 ' + OUT + '（模拟网络挂死，40 秒）');
