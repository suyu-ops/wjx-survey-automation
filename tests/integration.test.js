// 真实浏览器集成测试：把脚本注入 fixture 页面，验证题型识别与填写协议。
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('./cdp');
const { buildFixture } = require('./fixture');

const SCRIPT = path.join(__dirname, '..', '问卷星.js');
const scriptSrc = fs.readFileSync(SCRIPT, 'utf8');

let pass = 0, fail = 0;
const results = [];
function ok(cond, name, extra) {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`;
  results.push(line);
  if (cond) { pass++; console.log(line); } else { fail++; console.log(line); }
}

(async () => {
  const browser = new Browser(9344);
  await browser.launch();
  const page = await browser.newPage();
  if (!page) throw new Error('无法创建页面');

  const html = buildFixture();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const file = path.join(__dirname, 'out', 'fixture.html');
  fs.writeFileSync(file, html, 'utf8');

  await page.goto('file:///' + file.replace(/\\/g, '/'));
  await sleep(300);

  // 注入脚本（模拟 Tampermonkey 在 document-end 执行）
  await page.evaluate(scriptSrc + '\n//# sourceURL=wjx-user.js');
  await sleep(1200);

  // ===== 1. 初始化 =====
  ok(await page.evaluate('!!document.getElementById("wjx-commercial-panel")'), '面板已注入');

  const panelMissingNode = await page.evaluate(`(() => {
    const ids = ['wjx-stat-total','wjx-stat-types','wjx-question-list','wjx-target-count','wjx-speed-profile'];
    return ids.filter(id => !document.getElementById(id));
  })()`);
  ok(panelMissingNode.length === 0, '面板关键节点齐全', panelMissingNode);

  // ===== 2. 题型识别 =====
  const scan = await page.evaluate(`(() => {
    const panel = document.getElementById('wjx-commercial-panel');
    const cards = Array.from(panel.querySelectorAll('.wjx-card'));
    return cards.map(c => ({
      qid: c.dataset.qid,
      type: c.dataset.type,
      requirement: c.dataset.requirement || '',
      label: (c.querySelector('.wjx-card-type, .wjx-type-badge, [data-role="type-label"]') || {}).textContent || ''
    }));
  })()`);
  console.log('\n  识别结果:', JSON.stringify(scan, null, 0));

  const byQid = Object.fromEntries(scan.map((c) => [c.qid, c]));
  ok(byQid['6'] && byQid['6'].type === 'radio', 'Q6 识别为单选', byQid['6']);
  ok(byQid['3'] && byQid['3'].type === 'dropdown', 'Q3 识别为下拉', byQid['3']);
  ok(byQid['31'] && byQid['31'].type === 'text' && byQid['31'].requirement === 'number',
    'Q31 识别为 text + 数字校验', byQid['31']);
  ok(byQid['4'] && byQid['4'].type === 'text' && byQid['4'].requirement === 'idcard',
    'Q4 识别为 text + 身份证校验', byQid['4']);
  ok(byQid['5'] && byQid['5'].type === 'gapfill', 'Q5 识别为填空组', byQid['5']);
  ok(byQid['223'] && byQid['223'].type === 'matrix', 'Q223 识别为矩阵题', byQid['223']);
  ok(byQid['7'] && byQid['7'].type === 'radio', 'Q7（复合题）识别为单选', byQid['7']);
  ok(byQid['15'] && byQid['15'].type === 'checkbox', 'Q15 识别为多选', byQid['15']);

  // ===== 3. 填写各题型（走真实事件）=====
  // Q7 带 relation='6,2'：只有 Q6 选中第 2 个选项时才显示。若不给 Q6 固定权重，
  // 每轮随机选到第 1 项的概率约 50%，Q7 就会因「关联未触发」而合法地不填——
  // 那样测的就不是复合题填写，而是运气。这里把 Q6 锁到第 2 项，让关联稳定成立。
  const RELATION_SETUP = await page.evaluate(`(() => {
    const panel = document.getElementById('wjx-commercial-panel');
    const cards = Array.from(panel.querySelectorAll('.wjx-card'));
    const lockWeights = (qid, index) => {
      const card = cards.find(c => c.dataset.qid === qid);
      if (!card) return null;
      const inputs = Array.from(card.querySelectorAll('[data-role="weight-input"]'));
      if (!inputs.length) return { qid, count: 0 };
      inputs.forEach((inp, i) => {
        inp.value = String(i === index ? 100 : 0);
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return { qid, count: inputs.length };
    };
    // Q6 锁到第 2 项让 relation='6,2' 成立；Q7 锁到第 1 项——只有第 1 项
    // （「是，绝经的年龄为多少岁？」）带内嵌填空框，选到「否」时本题不需要内嵌值，
    // 那样测的就不是复合题填写路径了。
    const q6 = lockWeights('6', 1);
    const q7 = lockWeights('7', 0);
    const q7field = document.querySelector('.field[topic="7"]');
    // 卡片的权重输入框即使在题未显示时也应存在（面板渲染不依赖页面可见性）；
    // 若为空则说明面板未渲染该题，需在断言里暴露出来而不是静默跳过。
    return {
      ok: !!q6 && !!q7 && q6.count > 0 && q7.count > 0,
      q6, q7,
      q7InitiallyHidden: q7field ? q7field.style.display === 'none' : null,
      q7Options: Array.from(document.querySelectorAll('.field[topic="7"] .ui-radio')).map(o => ({
        label: (o.querySelector('.label') || {}).textContent || '',
        hasInline: !!o.querySelector('input.OtherRadioText')
      }))
    };
  })()`);
  console.log('  关联题/复合题前置设置:', JSON.stringify(RELATION_SETUP));

  const fillResult = await page.evaluate(`(async () => {
    const out = {};
    // 借助面板的「预览填写」等价路径：直接调用脚本暴露前的内部逻辑不可行，
    // 改为模拟用户点击面板上的预览填写按钮
    const btn = document.getElementById('wjx-preview-fill');
    if (!btn) return { error: 'no preview button' };
    btn.click();
    await new Promise(r => setTimeout(r, 6000));
    out.log = window.__wjxLog;
    out.submission = window.__collectSubmission();
    const q7field = document.querySelector('.field[topic="7"]');
    out.values = {
      q4: (document.getElementById('q4')||{}).value,
      q31: (document.getElementById('q31')||{}).value,
      gap: Array.from(document.querySelectorAll('#div5 .textEdit')).map(l => {
        const p = l.previousElementSibling;
        return p && p.tagName === 'INPUT' ? p.value : '';
      }),
      q6: Array.from(document.querySelectorAll('#div6 input')).map(i => i.checked),
      q3: (document.getElementById('q3')||{}).selectedIndex,
      q7Visible: q7field ? q7field.style.display !== 'none' : null
    };
    return out;
  })()`);

  console.log('\n  填写后状态:', JSON.stringify(fillResult, null, 2).slice(0, 2500));

  ok(fillResult.values && /^\d+$/.test(fillResult.values.q31 || ''),
    'Q31（数字题）填入纯数字', fillResult.values && fillResult.values.q31);
  ok(fillResult.values && fillResult.values.q31 !== '' && String(fillResult.values.q31).length <= 5,
    'Q31 不是 11 位手机号（未误判为号码题）', fillResult.values && fillResult.values.q31);

  const idVal = fillResult.values && fillResult.values.q4;
  ok(/^\d{17}[\dXx]$/.test(idVal || ''), 'Q4（身份证）填满 18 位', idVal);
  const idValid = await page.evaluate(`(${JSON.stringify(idVal || '')}) && checkIDCard(${JSON.stringify(idVal || '')})`);
  ok(idValid === true, 'Q4 身份证通过问卷星校验函数', idVal);

  ok(fillResult.values && fillResult.values.gap && fillResult.values.gap.every((v) => v !== ''),
    'Q5（填空组）三格都写入', fillResult.values && fillResult.values.gap);

  ok(fillResult.values && fillResult.values.q6 && fillResult.values.q6.some(Boolean),
    'Q6（单选）已选中', fillResult.values && fillResult.values.q6);
  ok(fillResult.values && fillResult.values.q3 > 0, 'Q3（下拉）已选择', fillResult.values && fillResult.values.q3);

  // ===== 复合题：选项内嵌填空（input.OtherRadioText）=====
  const inline = await page.evaluate(`(() => {
    const field = document.querySelector('.field[topic="7"]');
    if (!field) return { ok: false, reason: 'no field' };
    const checked = field.querySelector('input:checked');
    const rel = checked && checked.getAttribute('rel');
    const input = rel ? document.getElementById(rel) : null;
    return {
      ok: true,
      checked: !!checked,
      inlineValue: input ? input.value : null,
      inlineRequired: input ? input.hasAttribute('required') : null,
      // 答案表里是否真的存了这项（问卷星 saveAnswer 的等价物）
      saved: input ? (window.__wjxLog.savedAnswers[input.name] || '') : ''
    };
  })()`);
  ok(inline.ok && inline.checked, 'Q7 复合题选项已选中', inline);
  ok(inline.inlineValue && inline.inlineValue.trim() !== '', 'Q7 内嵌填空框已写入', inline);
  ok(inline.saved && inline.saved !== '', 'Q7 内嵌填空进入答案表（keyup/blur 协议生效）', inline);

  // ===== 4. 页面级校验结果 =====
  const errors = (fillResult.log && fillResult.log.errors) || [];
  const idErrors = errors.filter((e) => e.id === 'q4');
  ok(idErrors.length === 0, 'Q4 无校验错误（未触发「请输入正确的身份证号」）', errors);

  const missing = (fillResult.submission && fillResult.submission.missing) || [];
  ok(!missing.includes('4'), '提交时 Q4 有值（未被判未作答）', missing);
  ok(!missing.includes('5'), '提交时 Q5 有值（未被判未作答）', missing);
  ok(!missing.includes('31'), '提交时 Q31 有值', missing);

  // ===== 5. 控制台错误 =====
  ok(page.pageErrors.length === 0, '无未捕获异常', page.pageErrors);
  ok(page.consoleErrors.filter((e) => !/favicon/i.test(e)).length === 0, '无 console.error', page.consoleErrors);

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  page.close();
  browser.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('测试崩溃:', e);
  process.exit(2);
});
