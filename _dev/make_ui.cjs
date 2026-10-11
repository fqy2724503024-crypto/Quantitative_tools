/* 验证暗黑模式 / 键盘盲操 / 方向性脉冲 / 状态胶囊 / 共振色带 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
let html = fs.readFileSync(SRC, 'utf8');

const SHOT = process.argv[2] === 'shot';   // shot dark / shot light
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
  function clickEl(e){ if(!e) return; var r=e.getBoundingClientRect();
    e.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.left+2,clientY:r.top+2})); }
  function key(k, opt){ document.dispatchEvent(new KeyboardEvent('keydown',
      Object.assign({key:k, bubbles:true, cancelable:true}, opt||{}))); }
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function pxCount(){   // 统计主画布里的像素颜色，确认画布真的重绘成了深色
    var cv = document.getElementById('cv'), c = cv.getContext('2d');
    var d = c.getImageData(0,0,cv.width,cv.height).data, m = {};
    for (var i=0;i<d.length;i+=4){ if(d[i+3]<8) continue;
      var k = d[i]+','+d[i+1]+','+d[i+2]; m[k]=(m[k]||0)+1; }
    return Object.entries(m).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
  }
  function txt(id){ var e=document.getElementById(id); return e?e.textContent.replace(/\\s+/g,' ').trim():'(nf)'; }

  (async function(){
    await wait(5200);

    log('===== 1) 初始主题 =====');
    log('data-theme=' + document.documentElement.getAttribute('data-theme') +
        '  --bg=' + css('--bg') + '  --card=' + css('--card') + '  --up=' + css('--up'));
    log('PAL.up=' + PAL.up + '  PAL.card=' + PAL.card + '  画布主色:');
    pxCount().forEach(function(p){ log('   ' + p[1] + 'px  rgb(' + p[0] + ')'); });

    log('===== 2) 快捷键 K 切暗色 =====');
    key('k');
    await wait(700);
    log('data-theme=' + document.documentElement.getAttribute('data-theme') +
        '  --bg=' + css('--bg') + '  --up=' + css('--up') + '  --ov=' + css('--ov'));
    log('PAL.up=' + PAL.up + '  PAL.card=' + PAL.card + '  按钮文字=' + txt('btnTheme') + '  画布主色:');
    pxCount().forEach(function(p){ log('   ' + p[1] + 'px  rgb(' + p[0] + ')'); });

    log('===== 3) 状态胶囊 =====');
    var pill = document.getElementById('pill');
    log('存在=' + !!pill + '  内容=' + (pill?pill.textContent.trim():'-'));
    var pj = pillJudge();
    if (pj) log('判定=' + pj.t + '  量斜率=' + pj.dv.toFixed(2) + 'pp  价斜率=' + pj.dp.toFixed(2) + 'pp');
    // 扫不同时刻，看五态能不能都被触发
    var seen = {};
    for (var j = 5; j <= model.lastBar; j += 5){
      view.j = j; var q = pillJudge();
      if (q) seen[q.t] = (seen[q.t]||0)+1;
    }
    view.j = model.lastBar;
    log('全天可出现的形态: ' + Object.keys(seen).map(function(k){return k+'×'+seen[k];}).join('  '));

    log('===== 4) 分量比：主线/全线 + 共振带 =====');
    log('showNoise=' + showNoise + ' showReso=' + showReso + ' btnNoise=' + txt('btnNoise'));
    var a = model.series.MLB[model.lastBar], b = model.series.JMLB[model.lastBar];
    log('当前 MLB=' + a.toFixed(3) + ' JMLB=' + b.toFixed(3) +
        '  → ' + (a>1.2&&b>1.2?'增量区':(a<0.8&&b<0.8?'缩量冰点':'中性')));
    key('r'); await wait(300); log('按 R 后 showNoise=' + showNoise + ' btnNoise=' + txt('btnNoise'));
    key('g'); await wait(300); log('按 G 后 showReso=' + showReso);
    key('g'); await wait(200); key('r'); await wait(200);

    log('===== 5) 其余快捷键 =====');
    var b0 = BASE_MODE; key('b'); await wait(250); log('B 轮换基准: ' + b0 + ' -> ' + BASE_MODE);
    key('b'); await wait(200); key('b'); await wait(250); log('再轮三次回: ' + BASE_MODE);
    var ov0 = ovOn; key('o'); await wait(200); log('O 叠加线: ' + ov0 + ' -> ' + ovOn); key('o');
    var bd0 = showBand; key('c'); await wait(200); log('C 置信带: ' + bd0 + ' -> ' + showBand); key('c');
    var j0 = view.j; key(']'); await wait(200);
    log('] 时间回放: ' + j0 + ' -> ' + view.j + ' rt=' + txt('rt'));
    key('['); key('['); await wait(200); log('[ [ 回退两次: ' + view.j);
    key('l'); await wait(200); log('L 跳到最新: ' + view.j);
    var t0 = document.documentElement.getAttribute('data-theme'); key('k'); await wait(400);
    log('K 切回: ' + t0 + ' -> ' + document.documentElement.getAttribute('data-theme'));

    log('===== 6) 快捷键面板 =====');
    key('?'); await wait(300);
    var kp = document.getElementById('keypop');
    log('shown=' + (kp.className.indexOf('show')>=0) + ' 行数=' + kp.querySelectorAll('.keyrow').length +
        ' 首行=' + (kp.querySelector('.keyrow')?kp.querySelector('.keyrow').textContent.replace(/\\s+/g,' ').trim():'-'));
    key('Escape'); await wait(200);
    log('Esc 后 shown=' + (kp.className.indexOf('show')>=0));

    log('===== 7) 输入框内不抢按键 =====');
    var inp = document.getElementById('code'); inp.focus();
    var t1 = document.documentElement.getAttribute('data-theme');
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'k',bubbles:true,cancelable:true}));
    await wait(300);
    log('聚焦输入框按 K: 主题 ' + t1 + ' -> ' + document.documentElement.getAttribute('data-theme') + '（应不变）');
    inp.blur();

    if (window.__SHOT){
      if (document.documentElement.getAttribute('data-theme') !== 'dark') toggleTheme();
      view.j = model.lastBar; renderHero(); renderKpis(); draw();
      log('SHOT_STOP theme=' + document.documentElement.getAttribute('data-theme'));
      document.title='DONE'; return;
    }
    log('DONE'); document.title='DONE';
  })();
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
const out = path.join(DIR, 'vr_ui.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written', out);
