/* 生成 P0 三功能的测试页：基准切换 / 置信带 / 自检面板 */
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
  function clickEl(e){ if(!e) return; var r=e.getBoundingClientRect();
    e.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.left+2,clientY:r.top+2})); }
  function txt(id){ var e=document.getElementById(id); return e ? e.textContent.replace(/\\s+/g,' ').trim() : '(nf)'; }
  function cards(){ return Array.prototype.map.call(document.querySelectorAll('#kpis .kpi'), function(k){
      return k.querySelector('.t').textContent.trim() + '=' + k.querySelector('.v').textContent.trim(); }).join(' | '); }

  (async function(){
    await wait(5000);

    log('===== 1) 自检统计 buildStats =====');
    var t0 = performance.now();
    var st = buildStats('sh000985');
    log('耗时 ' + Math.round(performance.now()-t0) + 'ms  n=' + (st?st.n:'-') +
        '  区间=' + (st?fmtD8(st.from)+'~'+fmtD8(st.to):'-') +
        '  medAll=' + (st&&isFinite(st.medAll)?fmtAmt(st.medAll):'-'));
    if (st){
      ['0931','0945','1000','1030','1130','1400','1430','1500'].forEach(function(h){
        var j = TIMES1M.indexOf(h);
        log('   ' + h + '  预测20%~80% = ' + fmtAmt(st.lo[j]) + '~' + fmtAmt(st.hi[j]) +
            '   偏差中位=' + (st.errMid[j]*100).toFixed(2) + '%' +
            '  [' + (st.errLo[j]*100).toFixed(2) + '%~' + (st.errHi[j]*100).toFixed(2) + '%]');
      });
      log('   收盘收敛检查: lo[239]=' + fmtAmt(st.lo[239]) + ' hi[239]=' + fmtAmt(st.hi[239]));
    }

    log('===== 2) 三档基准切换 =====');
    ['yest','avg5','med60'].forEach(function(m){
      setBase(m);
      log('基准=' + BASE_MODE + ' name=' + model.baseName + ' base=' + fmtAmt(model.base) +
          '  pred@J相对=' + (model.base>0 ? ((model.series.predKpl[view.j]/model.base-1)*100).toFixed(2)+'%' : '—'));
      log('   卡片: ' + cards());
    });

    log('===== 3) 基准回退（无本地数据的标的） =====');
    try { await loadHistory('sh600519', '20260915'); } catch(e){ log('EX '+e.message); }
    log('refCode=' + model.refCode + ' stats=' + (model.stats?'有':'无') +
        ' btnBM.disabled=' + document.getElementById('btnBM').disabled +
        ' btnBand.disabled=' + document.getElementById('btnBand').disabled);
    log('BASE_MODE=' + BASE_MODE + '（应自动回退到 yest）  base=' + fmtAmt(model.base));
    clickEl(document.getElementById('btnBM'));
    log('点 btnBM 后 BASE_MODE=' + BASE_MODE + '（应仍为 yest）toast="' + txt('toast') + '"');

    log('===== 4) 自检面板内容（茅台应为无数据态） =====');
    log('accSub=' + txt('accSub'));
    log('accNote=' + txt('accNote').slice(0, 120));

    log('===== 5) 回到中证全指 =====');
    try { await load('sh000985', false); } catch(e){ log('EX '+e.message); }
    log('accSub=' + txt('accSub'));
    log('accNote=' + txt('accNote').slice(0, 300));
    var cvAcc = document.getElementById('cvAcc');
    log('cvAcc 尺寸=' + cvAcc.width + 'x' + cvAcc.height);
    var d = cvAcc.getContext('2d').getImageData(0,0,cvAcc.width,cvAcc.height).data;
    var nz = 0; for (var i=3;i<d.length;i+=4) if (d[i]>0) nz++;
    log('cvAcc 非空像素=' + nz + (nz > 5000 ? '（已绘制）' : '（几乎空白！）'));

    log('===== 6) 置信带开关 =====');
    var before = document.getElementById('btnBand').className;
    clickEl(document.getElementById('btnBand'));
    log('点后 on 状态=' + (before.indexOf('on')>=0) + ' -> ' + (document.getElementById('btnBand').className.indexOf('on')>=0));
    clickEl(document.getElementById('btnBand'));

    if (window.__SHOT){ setBase('med60'); log('SHOT_STOP base=' + BASE_MODE); document.title='DONE'; return; }

    log('===== 7) 复盘模式下自检仍可用 =====');
    try { await loadHistory('sh000985', '20260915'); } catch(e){ log('EX '+e.message); }
    log('histDate=' + model.histDate + ' stats.n=' + (model.stats?model.stats.n:'-') +
        ' base=' + fmtAmt(model.base) + ' accSub=' + txt('accSub').slice(0,60));

    log('DONE');
    document.title = 'DONE';
  })();
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
const out = path.join(DIR, SHOT ? 'vr_p0_shot.html' : 'vr_p0.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written', out);
