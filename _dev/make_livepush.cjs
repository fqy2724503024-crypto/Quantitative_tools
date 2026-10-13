/* 复现「自动刷新了但图线不前进」（v1.3 修复）

   原理：盘中 model.lastBar 会随时间增长（= 最后一根 amt>0 的 bar）。
   自动刷新走 load(code, /*keepSlot*\/ true) 分支，原实现是
       view.j = Math.min(view.j, model.lastBar)
   若正跟随最新（view.j 停在上一次的 lastBar），新 lastBar 更大，
   min() 仍返回旧值 → view.j 永远钉在旧线头，图线不往前推。

   手法：stub fetchSeries 返回「把今日尾部清零」的副本，模拟盘中进度推进：
     ① load(code,false) + 截断到第 100 根  → view.j 应 = 100
     ② load(code,true)  + 截断到第 140 根  → view.j 应 = 140（跟随最新）
     ③ 手动暂停（view.live=false, j=50）后再刷新到 140 → view.j 应仍 = 50（不被打断）

   用法：node make_livepush.cjs   → vr_livepush.html
*/
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
const OUT = process.env.OUT || 'vr_livepush.html';
let html = fs.readFileSync(SRC, 'utf8');

const inject = `
<div id="testlog" style="white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px;margin:8px;border:1px solid #ccc;background:#fff"></div>
<script>
(function(){
  var L=document.getElementById('testlog');
  function log(s){ L.textContent += s + '\\n'; }
  window.onerror=function(m,s,l,c){ log('!! JS ERROR: '+m+' @'+l+':'+c); };
  window.addEventListener('unhandledrejection', function(e){ log('!! REJECT: '+(e.reason&&e.reason.message||e.reason)); });
  function setLog(t){ L.textContent = t; }

  function cloneDay(d){
    return { date:d.date, px:Float64Array.from(d.px), amt:Float64Array.from(d.amt),
             cum:Float64Array.from(d.cum), total:d.total, hasAmt:d.hasAmt };
  }
  /* 构造「盘中走到第 k 根」的合成快照。
     ⚠️ 关键：不能直接拿今日真实数据截断 —— 盘中今日本来就只有几十根，
     把 j>k 清零根本不改变 lastBar（实测今天只有 47 根，截断到 100 毫无效果，
     测试会假通过）。正解：先用**昨日完整数据**充当今日（240 根齐），再截断到 k，
     lastBar 就确定性地等于 k。 */
  function synthetic(ref, k){
    var days = ref.days.map(cloneDay);
    var src = ref.days[DAYS-2];        // 昨日是完整的一天
    var t = days[DAYS-1];
    for (var j = 0; j < BPD; j++){ t.amt[j] = src.amt[j]; t.px[j] = src.px[j]; }
    var s = 0;
    for (var j = 0; j < BPD; j++){
      if (j > k) t.amt[j] = 0;
      s += t.amt[j];
      t.cum[j] = s;
    }
    t.total = s;
    return { code:ref.code, name:ref.name, days:days, quote:ref.quote,
             preClose:ref.preClose, pct:Float64Array.from(ref.pct) };
  }

  window.addEventListener('load', function(){
    setTimeout(function(){
      if (typeof model === 'undefined' || !model.series){ log('!! 首屏未就绪'); document.title='DONE_FAIL'; return; }
      var REAL = model.ref;
      var CODE = model.refCode;
      log('首屏就绪：refCode=' + CODE + '  BPD=' + BPD + '  DAYS=' + DAYS +
          '  首屏 lastBar=' + model.lastBar);

      (async function(){
        try{
          var realFS = fetchSeries;

          // ---------- ① 盘中早段：截断到第 100 根 ----------
          fetchSeries = function(){ return Promise.resolve(synthetic(REAL, 100)); };
          await load(CODE, false);          // keepSlot=false：整屏重载
          log('');
          log('① 载入「第 100 根」快照（keepSlot=false）');
          log('   model.lastBar = ' + model.lastBar + '   view.j = ' + view.j +
              '   view.live = ' + view.live);
          var a_ok = (model.lastBar === 100 && view.j === 100);
          log('   ' + (a_ok ? '✅ 线头落在 100' : '❌ 期望 lastBar=100 且 view.j=100'));

          // ---------- ② 30 秒后：推进到第 140 根（模拟自动刷新）----------
          fetchSeries = function(){ return Promise.resolve(synthetic(REAL, 140)); };
          await load(CODE, true);           // keepSlot=true：自动刷新走的正是这条
          log('');
          log('② 自动刷新到「第 140 根」（keepSlot=true，跟随最新）');
          log('   model.lastBar = ' + model.lastBar + '   view.j = ' + view.j +
              '   view.live = ' + view.live);
          log('   滑块 max=' + document.getElementById('rng').max +
              ' value=' + document.getElementById('rng').value);
          log('   时间标签 rt = "' + document.getElementById('rt').textContent + '"');
          var b_ok = (model.lastBar === 140 && view.j === 140);
          log('   ' + (b_ok ? '✅ 线头跟着推进到 140（图线会往前延伸）'
                            : '❌ 线头没跟上！view.j 仍为 ' + view.j + '，图线钉在旧位置'));
          var rt_ok = (+document.getElementById('rng').value === 140);   // DOM value 是字符串，须转数字
          log('   ' + (rt_ok ? '✅ 滑块同步到 140' : '❌ 滑块未同步'));

          // ---------- ③ 用户手动停在历史某根，刷新不应打断 ----------
          view.j = 50; view.live = false;
          document.getElementById('rng').value = 50;
          fetchSeries = function(){ return Promise.resolve(synthetic(REAL, 160)); };
          await load(CODE, true);
          log('');
          log('③ 手工暂停在 50 后再刷新到「第 160 根」');
          log('   model.lastBar = ' + model.lastBar + '   view.j = ' + view.j +
              '   view.live = ' + view.live);
          var c_ok = (view.j === 50);
          log('   ' + (c_ok ? '✅ 尊重用户停靠位置，仍停在 50（未被强行拉走）'
                           : '❌ 把用户停靠位置强行拉到了 ' + view.j));

          // ---------- ④ 像素级验证：图线真的往前延伸了吗 ----------
          // 光看 view.j 推进还不够 —— 要确认 canvas 确实重画出了新的一段。
          // 手法：数主画布上与背景色不同的像素（"墨量"）。脉冲柱/量能曲线只画到
          // view.j 为止，所以 view.j 从 100 推到 160，墨量必然增加。
          function ink(){
            var ctx2 = cv.getContext('2d');
            var w = cv.width, h = cv.height;
            var d = ctx2.getImageData(0, 0, w, h).data;
            var bg = getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
            var mm = bg.match(/\d+/g); 
            var br = mm?+mm[0]:255, bgc = mm?+mm[1]:255, bb = mm?+mm[2]:255;
            var n = 0;
            for (var i = 0; i < d.length; i += 4){
              // 与背景色差异明显才算"墨"
              if (Math.abs(d[i]-br) + Math.abs(d[i+1]-bgc) + Math.abs(d[i+2]-bb) > 30) n++;
            }
            return n;
          }
          fetchSeries = function(){ return Promise.resolve(synthetic(REAL, 100)); };
          await load(CODE, false);
          var ink100 = ink(), j100 = view.j;
          fetchSeries = function(){ return Promise.resolve(synthetic(REAL, 160)); };
          await load(CODE, true);
          var ink160 = ink(), j160 = view.j;
          log('');
          log('④ 像素级验证（图线是否真的延伸）');
          log('   view.j=100 时墨量 = ' + ink100 + '  (canvas ' + cv.width + 'x' + cv.height + ')');
          log('   view.j=160 时墨量 = ' + ink160);
          log('   增量 = ' + (ink160 - ink100) + '  (' + ((ink160/Math.max(1,ink100)-1)*100).toFixed(1) + '%)');
          var d_ok = (j160 === 160 && ink160 > ink100);
          log('   ' + (d_ok ? '✅ 画布确实重画出了新的 60 根（图线往前延伸）'
                           : '❌ 画布没有延伸（墨量未增加）'));

          // ---------- 收尾 ----------
          fetchSeries = realFS;
          log('');
          var all = a_ok && b_ok && rt_ok && c_ok && d_ok;
          log('=== ' + (all ? '✅ 全部通过' : '❌ 存在失败项') + ' ===');
          document.title = all ? 'DONE' : 'DONE_FAIL';
        }catch(e){
          log('!! FATAL: ' + e.message + '\\n' + (e.stack||''));
          document.title='DONE_FAIL';
        }
      })();
    }, 12000);
  });
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIR, OUT), html, 'utf8');
console.log('生成 ' + OUT);
