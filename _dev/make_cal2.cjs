/* 生成日期选择器测试页：驱动自建日历（开→渲染→选日→复盘），把状态写进 #testlog */
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

  function calStat(){
    var pop = document.getElementById('calpop');
    var btns = document.querySelectorAll('#calGrid button[data-d]');
    var on = 0, off = 0;
    btns.forEach(function(b){ b.disabled ? off++ : on++; });
    var f = document.getElementById('calFoot').textContent.replace(/\\s+/g,' ').trim();
    var r = pop.getBoundingClientRect();
    return { shown: pop.className.indexOf('show')>=0, title: document.getElementById('calTitle').textContent,
             total: btns.length, on: on, off: off, foot: f,
             box: Math.round(r.x)+','+Math.round(r.y)+' '+Math.round(r.width)+'x'+Math.round(r.height),
             inViewport: r.top>=0 && r.left>=0 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1 };
  }
  function clickEl(e){
    if (!e) return;
    var r = e.getBoundingClientRect();
    e.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, clientX:r.left+2, clientY:r.top+2}));
  }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function pick(ymd){
    // calShift → renderCal 是同步的，所以可以直接连点翻月去找
    for (var g = 0; g < 5; g++){
      var t = document.querySelector('#calGrid button[data-d="'+ymd+'"]');
      if (t) return t;
      if (document.getElementById('calPrev').disabled) break;
      clickEl(document.getElementById('calPrev'));
    }
    return null;
  }

  (async function(){
    await wait(4500);

    log('===== 1) 点输入框打开日历 =====');
    clickEl(document.getElementById('hdate'));
    await wait(1500);
    var s1 = calStat();
    log('shown=' + s1.shown + ' | 月份=' + s1.title + ' | 格子=' + s1.total + ' 可点=' + s1.on + ' 灰显=' + s1.off);
    log('位置=' + s1.box + ' 在视口内=' + s1.inViewport);
    log('底部说明: ' + s1.foot);

    log('===== 2) 翻上/下月 =====');
    clickEl(document.getElementById('calPrev')); await wait(350);
    var s2 = calStat();
    log('上月: ' + s2.title + ' 可点=' + s2.on + ' 灰显=' + s2.off + ' prevDisabled=' + document.getElementById('calPrev').disabled);
    clickEl(document.getElementById('calNext')); await wait(350);
    log('回来: ' + calStat().title + ' 可点=' + calStat().on);

    log('===== 3) 灰显日点击应无反应 =====');
    var dis = document.querySelector('#calGrid button[data-d]:disabled');
    if (dis){
      clickEl(dis); await wait(300);
      log('点 ' + dis.dataset.d + '（disabled）后 日历仍开=' + (document.getElementById('calpop').className.indexOf('show')>=0) +
          '  value 未变=' + (document.getElementById('hdate').value === ''));
    } else log('（本月无灰显日，跳过）');

    if (window.__SHOT){ log('SHOT_STOP'); document.title='DONE'; return; }

    log('===== 4) 选 2026-09-15（交易日，应直接复盘） =====');
    var t = pick('20260915');
    if (!t){ log('!! 找不到 20260915'); }
    else {
      log('在 ' + calStat().title + ' 找到，disabled=' + t.disabled);
      clickEl(document.querySelector('#calGrid button[data-d="20260915"]'));
      await wait(2500);
      log('日历已关=' + (document.getElementById('calpop').className.indexOf('show') < 0));
      log('input.value=' + document.getElementById('hdate').value);
      log('status=' + document.getElementById('status').textContent);
      log('hero=' + document.getElementById('hero').textContent.replace(/\\s+/g,' ').slice(0,120));
    }

    log('===== 5) 再次打开（应高亮当前日） =====');
    clickEl(document.getElementById('hdate')); await wait(1200);
    var cur = document.querySelector('#calGrid button.cur');
    log('当前月=' + calStat().title + ' 可点=' + calStat().on + ' 高亮日=' + (cur ? cur.dataset.d : '(无)'));

    log('===== 6) 点空白处关闭 =====');
    document.body.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:5, clientY:600}));
    await wait(250);
    log('关闭后 shown=' + (document.getElementById('calpop').className.indexOf('show')>=0));

    log('===== 7) 切个股 sh600519（无本地数据，区间应变窄） =====');
    clickEl(document.getElementById('hdate')); await wait(1200);
    log('中证全指: ' + calStat().foot.split('（')[0] + ' | 当月可点=' + calStat().on);
    clickEl(document.getElementById('calClose'));
    try { await loadHistory('sh600519', model.histDate); } catch(e){ log('EX '+e.message); }
    log('refCode=' + model.refCode);
    clickEl(document.getElementById('hdate')); await wait(3500);
    log('茅台    : ' + calStat().foot.split('（')[0] + ' | 当月可点=' + calStat().on + ' 月份=' + calStat().title);

    log('DONE');
    document.title = 'DONE';
  })();
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
const out = path.join(DIR, SHOT ? 'vr_cal_shot.html' : 'vr_cal2.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written', out);
