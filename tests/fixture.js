// 生成测试用问卷页：题干预先从真实问卷（Qw71Alf）抽取，行为协议按 jqmobo2.js 复刻。
const fs = require('fs');
const path = require('path');

const REAL = path.join(__dirname, '..', '_debug', 'Qw71Alf.html');

function extractDiv(html, topic) {
  const re = new RegExp(`<div class='field ui-field-contain' topic='${topic}'`);
  const m = re.exec(html);
  if (!m) return null;
  let i = m.index, depth = 0;
  while (i < html.length) {
    if (html.startsWith('<div', i)) { depth++; i += 4; }
    else if (html.startsWith('</div>', i)) { depth--; i += 6; if (depth === 0) return html.slice(m.index, i); }
    else i++;
  }
  return null;
}

// 复刻问卷星的交互协议（依据 _debug/jqmobo2.js 的实际绑定）：
//  - 单选/多选：点击 .label / a.jqradio 后 toggle .checked 与 jqchecked 类
//  - 填空：input 上绑 keyup/blur/click 才做 verifyTxt + saveAnswer
//  - 填空组：span.textCont 的 blur 把 textContent 写回前一个 input.value
//  - 选项内嵌填空：点击选项后显示 .ui-text，input 上绑 blur/keyup
const CLIENT_PROTOCOL = `
window.__wjxLog = { saved: {}, errors: [], verifyCalls: 0, savedAnswers: {} };

// 单选题/多选题的点击协议
document.querySelectorAll('.ui-radio, .ui-checkbox').forEach((option) => {
  const isCheck = option.classList.contains('ui-checkbox');
  const input = option.querySelector('input');
  const trigger = option.querySelector('.label, a.jqradio, a.jqcheck');
  const group = option.parentElement;
  const onClick = (ev) => {
    if (ev) { ev.preventDefault && ev.preventDefault(); }
    if (!isCheck) {
      group.querySelectorAll('.ui-radio').forEach((sib) => {
        sib.classList.remove('checked');
        const si = sib.querySelector('input');
        if (si) si.checked = false;
        const a = sib.querySelector('a.jqradio');
        if (a) a.classList.remove('jqchecked');
      });
      input.checked = true;
      option.classList.add('checked');
      const a = option.querySelector('a.jqradio');
      if (a) a.classList.add('jqchecked');
      // 单选：选项内嵌填空面板显示
      const box = option.querySelector('.ui-text');
      if (box) { box.style.display = 'block'; }
      // 单选同组其他选项的内嵌框隐藏并清空
      group.querySelectorAll('.ui-radio').forEach((sib) => {
        if (sib === option) return;
        const sb = sib.querySelector('.ui-text');
        if (sb) sb.style.display = 'none';
      });
    } else {
      input.checked = !input.checked;
      option.classList.toggle('checked', input.checked);
      const a = option.querySelector('a.jqcheck');
      if (a) a.classList.toggle('jqchecked', input.checked);
      const box = option.querySelector('.ui-text');
      if (box) { box.style.display = input.checked ? 'block' : 'none'; }
      if (!input.checked) {
        const ot = option.querySelector('input.OtherText');
        if (ot) ot.value = '';
      }
    }
    // 记录已作答（问卷星 saveAnswer 的语义）
    const name = input.name;
    if (isCheck) {
      const vals = Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map((i) => i.value);
      window.__wjxLog.saved[name] = vals.join('|');
    } else {
      window.__wjxLog.saved[name] = input.value;
    }
    // 点击后把焦点交给内嵌输入框（问卷星行为）
    const otext = option.querySelector('input.OtherRadioText, input.OtherText');
    if (otext && input.checked) { setTimeout(() => otext.focus(), 0); }
  };
  if (trigger) trigger.addEventListener('click', onClick);
  option.addEventListener('click', (ev) => {
    if (ev.target === option) onClick(ev);
  });
});

// 矩阵题/量表题：点击 a.rate-off 后切换为 rate-on（问卷星 styler 协议）
document.querySelectorAll('a.rate-off, a.rate-on, a[dval]').forEach((anchor) => {
  anchor.addEventListener('click', () => {
    const row = anchor.closest('tr');
    if (!row) return;
    row.querySelectorAll('a[dval]').forEach((sib) => {
      sib.classList.remove('rate-on');
      sib.classList.add('rate-off');
    });
    anchor.classList.remove('rate-off');
    anchor.classList.add('rate-on');
    const field = row.closest('.field');
    if (field) {
      const topic = field.getAttribute('topic');
      window.__wjxLog.savedAnswers[topic + '_' + row.getAttribute('rowindex')] = anchor.getAttribute('dval');
    }
  });
});

// 下拉题
document.querySelectorAll('select').forEach((select) => {
  select.addEventListener('change', () => {
    window.__wjxLog.saved[select.name] = select.value;
  });
});

// 关联题显示协议（复刻 jqmobo2.js 的 handleItemRelation）：
// 问卷星在每次点击选项后按 relation='父题号,父选项序号' 重新计算子题的 style.display。
// 缺少这段，带 relation 的题目会永远停在初始的 display:none，
// 对脚本表现为「题目识别到了但不可见、永远填不到」。
function __wjxApplyRelations() {
  const sel = 'div.field[topic][relation]';
  document.querySelectorAll(sel).forEach((field) => {
    const raw = field.getAttribute('relation');
    if (!raw) return;
    // 问卷星支持 '$'（或）与 '|'（且）两种分隔；fixture 只复刻最常见的一种/多种并列。
    const useOr = raw.indexOf('|') === -1;
    const parts = raw.split(useOr ? '$' : '|');
    let ok = useOr ? false : true;
    for (const part of parts) {
      const bits = part.split(',');
      const parentTopic = (bits[0] || '').replace(/[^0-9]/g, '');
      const optIndex = parseInt(bits[1], 10);
      if (!parentTopic || !optIndex) continue;
      const parent = document.querySelector('div.field[topic="' + parentTopic + '"]');
      let hit = false;
      if (parent) {
        const ptype = parent.getAttribute('type');
        if (ptype === '7') {
          const s = parent.querySelector('select');
          hit = !!s && Number(s.value) === optIndex;
        } else {
          const inp = parent.querySelector('input[type=radio][value="' + optIndex + '"], input[type=checkbox][value="' + optIndex + '"]');
          hit = !!inp && inp.checked;
        }
      }
      if (useOr) { if (hit) { ok = true; break; } }
      else if (!hit) { ok = false; break; }
    }
    field.style.display = ok ? '' : 'none';
  });
}
window.__wjxApplyRelations = __wjxApplyRelations;
// 初始对齐一次，并在任何选项变化后重算
__wjxApplyRelations();
document.addEventListener('change', () => __wjxApplyRelations(), true);
document.addEventListener('click', () => setTimeout(__wjxApplyRelations, 0), true);

// 填空题：input 上绑 keyup / blur / click 才校验并保存（这是脚本原先缺失的事件）
document.querySelectorAll('.field input[type="text"], .field input[type="tel"], .field input[type="number"], .field input[type="email"]').forEach((input) => {
  if (input.closest('.textEdit') || input.classList.contains('OtherText') || input.classList.contains('OtherRadioText')) return;
  if (input.style.display === 'none') return;
  const verifyAndSave = () => {
    window.__wjxLog.verifyCalls += 1;
    const verify = input.getAttribute('verify') || '';
    let error = '';
    const v = input.value.trim();
    if (!v) {
      error = '请回答此题';
    } else if (verify === '身份证号') {
      if (!/^\\d{15}(\\d{2}[A-Za-z0-9])?$/.test(v) || (v.length === 18 && !checkIDCard(v))) {
        error = '请输入正确的身份证号（如：432123198912103118），请注意使用英文字符格式。';
      }
    } else if (verify === '数字') {
      if (!/^(\\-)?\\d+$/.test(v)) error = '请输入数字';
    }
    const box = input.closest('.field').querySelector('.errorMessage');
    if (box) { box.textContent = error; box.style.display = error ? 'block' : 'none'; }
    if (error) { window.__wjxLog.errors.push({ id: input.id, error }); return; }
    window.__wjxLog.savedAnswers[input.id] = v;
  };
  ['keyup', 'blur', 'click'].forEach((t) => input.addEventListener(t, verifyAndSave));
});

// 复刻问卷星的身份证校验（原样搬运自 jqmobo2.js，用于验证生成值是否合法）
function checkIDCard(e) {
  for (var t = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2], i = e + "", n = e[17],
    a = i.substring(0, 17).split(""), r = a.length, o = 0, s = 0; s < r; s++) o += a[s] * t[s];
  i = ["1","0","X","9","8","7","6","5","4","3","2"][o % 11];
  e = /^[1-9][0-9]{5}([1][9][0-9]{2}|[2][0][0|1|2|3][0-9])([0][1-9]|[1][0|1|2])([0][1-9]|[1|2][0-9]|[3][0|1])[0-9]{3}([0-9]|[X]|[x])$/.test(e);
  try { return !(n.toLowerCase() != i.toLowerCase() || !e); } catch (err) { return false; }
}

// 填空组：span.textCont 的 blur 把内容写回相邻 input（问卷星 jqmobo2.js 的原文逻辑）
document.querySelectorAll('.textEdit .textCont').forEach((span) => {
  const label = span.closest('.textEdit');
  span.addEventListener('blur', () => {
    let e = label.previousElementSibling;
    if (e && !e.classList.contains('ui-input-text')) {
      const prev2 = e.previousElementSibling;
      if (prev2) e = prev2;
    }
    if (e && e.tagName === 'INPUT') {
      e.value = span.textContent.trim();
      window.__wjxLog.savedAnswers[e.id] = e.value;
    }
  });
  span.addEventListener('keyup', () => {
    const text = span.textContent.trim();
    if (text) { label.classList.remove('initStyle'); span.style.cssText = 'display:inline;width:auto'; }
  });
});

// 选项内嵌填空：blur/keyup 时保存
document.querySelectorAll('input.OtherText, input.OtherRadioText').forEach((input) => {
  ['blur', 'keyup'].forEach((t) => input.addEventListener(t, () => {
    const name = input.name;
    if (input.value.trim()) { window.__wjxLog.savedAnswers[name] = input.value.trim(); }
  }));
});

// 提交拦截：记录提交时每题的真实作答状态（模拟服务端校验）
window.__collectSubmission = function () {
  const result = { answers: {}, missing: [], invalid: [] };
  document.querySelectorAll('.field.ui-field-contain[topic]').forEach((field) => {
    const topic = field.getAttribute('topic');
    if (field.style.display === 'none') return;
    if (field.getAttribute('req') !== '1') return;
    const type = field.getAttribute('type');
    let filled = false;
    if (type === '3' || type === '4') {
      filled = !!field.querySelector('input:checked');
      // 复合题（选项内嵌填空）：选中的选项若带必填内嵌框，框里必须有值，
      // 否则问卷星按「未作答」处理（这正是 0.1.19 修的那个 bug）。
      if (filled) {
        const checked = field.querySelector('input:checked');
        const rel = checked && checked.getAttribute('rel');
        const inline = rel ? document.getElementById(rel) : null;
        if (inline && inline.hasAttribute('required') && !inline.value.trim()) {
          filled = false;
        }
      }
    } else if (type === '7') {
      const sel = field.querySelector('select');
      filled = !!sel && sel.selectedIndex > 0;
    } else if (type === '6') {
      const rows = field.querySelectorAll('tr[rowindex]');
      filled = rows.length > 0 && Array.from(rows).every((r) => !!r.querySelector('input:checked') || !!r.querySelector('.rate-on'));
    } else if (type === '9') {
      const inputs = Array.from(field.querySelectorAll('.textEdit')).map((l) => {
        const prev = l.previousElementSibling;
        return prev && prev.tagName === 'INPUT' ? prev.value.trim() : spanText(l);
      });
      filled = inputs.length > 0 && inputs.every((v) => v !== '');
    } else if (type === '1') {
      const inp = field.querySelector('input[type="text"], input[type="tel"]');
      filled = !!inp && inp.value.trim() !== '';
    }
    if (filled) { result.answers[topic] = true; } else { result.missing.push(topic); }
  });
  return result;
};
function spanText(label) {
  const s = label.querySelector('.textCont');
  return s ? s.textContent.trim() : '';
}
`;

function buildFixture(options = {}) {
  const real = fs.existsSync(REAL) ? fs.readFileSync(REAL, 'utf8') : '';
  const pick = (topic) => (real ? extractDiv(real, topic) : null) || '';

  const extra = options.extraHtml || '';
  // 构造题型齐全的问卷：单选/多选/下拉/填空(数字)/填空(身份证)/填空组/矩阵/关联题
  const body = [
    pick('6'),    // 单选
    pick('3'),    // 下拉
    pick('31'),   // 填空 verify=数字
    pick('4'),    // 填空 verify=身份证号
    pick('5'),    // 填空组（出生日期）
    pick('223'),  // 矩阵
    pick('7'),    // 单选 + 内嵌填空（复合题，「是，绝经的年龄为多少岁？」→ input.OtherRadioText）
    pick('15'),   // 多选（带关联，初始 display:none）
    extra,
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>问卷调查</title>
<style>
  body { font-family: sans-serif; margin: 20px; }
  .field { margin-bottom: 18px; }
  .ui-text { display: none; }
  .errorMessage { color: #e00; display: none; }
  .textEdit { display: inline-block; min-width: 60px; border-bottom: 1px solid #999; }
  .textEdit.initStyle { background: #eee; }
  #divNext { display: inline-block; padding: 8px 20px; background: #06f; color: #fff; cursor: pointer; }
</style>
</head>
<body>
<form id="form1">
<div id="divQuestion">
${body}
</div>
<div id="divNext" class="nextbutton" onclick="window.__nextClicked = (window.__nextClicked||0)+1">下一页</div>
</form>
<script>${CLIENT_PROTOCOL}</script>
</body>
</html>`;
}

module.exports = { buildFixture, extractDiv };
