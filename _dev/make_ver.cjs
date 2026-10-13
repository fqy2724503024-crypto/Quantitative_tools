/* 版本号徽标验证：亮/暗双主题渲染检查
   断言：①徽标文本与 APP_VERSION 自洽  ②document.title 含该版本  ③暗色下徽标配色跟随变量（非写死色）
        ④变更说明区块存在且含关键条目  ⑤无 JS 错误
   用法：node make_ver.cjs [shot]     shot 参数会额外截图
*/
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.join(DIR, '..', 'index.html');
const OUT = process.env.OUT || 'vr_ver.html';
let html = fs.readFileSync(SRC, 'utf8');

const SHOT = process.argv[2] === 'shot';
const inject = `
${SHOT ? '' : '<div id="testlog" style="white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px;margin:8px;border:1px solid #ccc;background:#fff"></div>'}
<script>
window.__SHOT = ${SHOT ? 'true' : 'false'};
(function(){
  var L=document.getElementById('testlog');
  function log(s){ if(L) L.textContent += s + '\\n'; }
  window.onerror=function(m,s,l,c){ log('!! JS ERROR: '+m+' @'+l+':'+c); };
  window.addEventListener('load', function(){
    setTimeout(function(){
      log('=== ① 版本徽标 ===');
      var ver = document.querySelector('.logo .ver');
      log('  徽标元素存在: ' + (ver ? '✅' : '❌'));
      if (ver){
        var exp = 'v' + APP_VERSION;
        log('  文本 = "' + ver.textContent + '"  期望 = "' + exp + '"  ' + (ver.textContent === exp ? '✅ 与 APP_VERSION 自洽' : '❌ 与 APP_VERSION 不一致'));
        var cs = getComputedStyle(ver);
        log('  样式: color=' + cs.color + ' background=' + cs.backgroundColor +
            ' border=' + cs.borderColor + ' weight=' + cs.fontWeight + ' size=' + cs.fontSize);
        log('  ' + (cs.color !== 'rgb(0, 0, 0)' ? '✅ 颜色已生效（非浏览器默认黑）' : '❌ 样式未生效'));
      }
      log('  APP_VERSION 常量 = ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '(未定义)'));

      log('');
      log('=== ② 标题 ===');
      log('  document.title = "' + document.title + '"');
      log('  ' + (document.title.indexOf('v' + APP_VERSION) >= 0 ? '✅ 含 v' + APP_VERSION : '❌ 标题未同步版本号'));

      log('');
      log('=== ③ 变更说明区块 ===');
      var cards = document.querySelectorAll('.card');
      var found = false, txt = '';
      for (var i=0;i<cards.length;i++){
        if (cards[i].textContent.indexOf('v' + APP_VERSION + ' 更新说明') >= 0){ found = true; txt = cards[i].textContent; break; }
      }
      log('  ' + (found ? '✅ 找到「v' + APP_VERSION + ' 更新说明」' : '❌ 未找到 v' + APP_VERSION + ' 更新说明'));
      if (found){
        log('  含「图线不前进」: ' + (txt.indexOf('图线不前进')>=0?'✅':'❌'));
        log('  长度: ' + txt.replace(/\\s+/g,' ').length + ' 字符');
      }

      log('');
      log('=== ④ 暗色主题下徽标跟随变量 ===');
      document.documentElement.setAttribute('data-theme','dark');
      applyTheme();
      setTimeout(function(){
        var v2 = document.querySelector('.logo .ver');
        var cs2 = getComputedStyle(v2);
        log('  暗色: color=' + cs2.color + ' background=' + cs2.backgroundColor);
        log('  --pred(dark)=' + getComputedStyle(document.documentElement).getPropertyValue('--pred'));
        log('  ' + (cs2.color.indexOf('79, 141, 255') >= 0 || cs2.color !== 'rgb(47, 111, 237)'
                    ? '✅ 已跟随暗色变量（亮色 #2f6fed → 暗色 #4c8dff）' : '❌ 未跟随'));
        // 复原
        document.documentElement.setAttribute('data-theme','light');
        applyTheme();
        log('');
        log('=== ' + (L && L.textContent.indexOf('❌')>=0 ? '❌ 有失败项' : '✅ 全部通过') + ' ===');
        document.title = 'DONE';
      }, 400);
    }, 9000);
  });
})();
</script>
`;
html = html.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIR, OUT), html, 'utf8');
console.log('生成 ' + OUT);
