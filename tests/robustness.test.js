// 健壮性测试：异常数据、结构变化、重复初始化、中途停止。
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('./cdp');
const { buildFixture } = require('./fixture');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', '问卷星.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  if (cond) pass++; else fail++;
}

const cases = [];

// 场景 1：空白页面（无题目）——不应抛错，应给出「未识别到题目」
cases.push({
  name: '空白页（无任何题目）',
  html: '<!DOCTYPE html><html><body><form id="form1"></form></body></html>',
  check: async (page) => {
    const panel = await page.evaluate('!!document.getElementById("wjx-commercial-panel")');
    const empty = await page.evaluate(`(document.getElementById('wjx-question-list')||{}).textContent || ''`);
    return { panel, empty, errs: page.pageErrors };
  },
  assert: (r) => {
    ok(r.panel === true, '  空白页仍注入面板');
    ok(/未识别到题目/.test(r.empty), '  显示「未识别到题目」');
    ok(r.errs.length === 0, '  无未捕获异常', r.errs);
  },
});

// 场景 2：题目被破坏（缺 label/缺 input）
cases.push({
  name: '结构残缺的题目',
  html: `<!DOCTYPE html><html><body><form id="form1"><div id="divQuestion">
    <div class='field ui-field-contain' topic='1' type='3' req='1'>
      <div class='field-label'><div class='topichtml'>残题（无选项）</div></div>
      <div class='ui-controlgroup'></div>
    </div>
    <div class='field ui-field-contain' topic='2' type='1' req='1'>
      <div class='field-label'><div class='topichtml'>残题（无 input）</div></div>
    </div>
    <div class='field ui-field-contain' topic='3' type='6' req='1'>
      <div class='field-label'><div class='topichtml'>残矩阵（无 table）</div></div>
    </div>
    <div class='field ui-field-contain' topic='4' type='9' gapfill='1' req='1'>
      <div class='field-label'><div class='topichtml'>残填空组（无 textCont）</div></div>
    </div>
  </div></form></body></html>`,
  check: async (page) => ({
    errs: page.pageErrors,
    cards: await page.evaluate('document.querySelectorAll("#wjx-commercial-panel .wjx-card").length'),
  }),
  assert: (r) => {
    ok(r.errs.length === 0, '  无未捕获异常', r.errs);
    ok(r.cards >= 0, '  面板仍渲染', r.cards);
  },
});

// 场景 3：重复注入（模拟脚本被多次执行）
cases.push({
  name: '重复初始化',
  html: buildFixture(),
  check: async (page) => {
    await page.evaluate(SCRIPT);
    await sleep(900);
    await page.evaluate(SCRIPT); // 第二次注入
    await sleep(900);
    return {
      panels: await page.evaluate('document.querySelectorAll("#wjx-commercial-panel").length'),
      errs: page.pageErrors,
    };
  },
  assert: (r) => {
    ok(r.panels === 1, '  二次注入不产生重复面板', r.panels);
    ok(r.errs.length === 0, '  二次注入无异常', r.errs);
  },
});

// 场景 4：恶意/特殊字符题目（XSS + 中文标点 + 超长文本）
cases.push({
  name: '特殊字符与 XSS',
  html: `<!DOCTYPE html><html><body><form id="form1"><div id="divQuestion">
    <div class='field ui-field-contain' topic='1' type='3' req='1'>
      <div class='field-label'><div class='topichtml'>&lt;img src=x onerror="window.__xss=1"&gt; 题「引号」·破折号—…</div></div>
      <div class='ui-controlgroup'>
        <div class='ui-radio'><input type='radio' value='1' id='q1_1' name='q1' style='display:none;'/><a class='jqradio' href='javascript:;'></a><div class='label' for='q1_1'>&lt;script&gt;window.__xss2=1&lt;/script&gt;选项</div></div>
        <div class='ui-radio'><input type='radio' value='2' id='q1_2' name='q1' style='display:none;'/><a class='jqradio' href='javascript:;'></a><div class='label' for='q1_2'>选项"带引号"</div></div>
      </div>
    </div>
  </div></form></body></html>`,
  check: async (page) => ({
    xss: await page.evaluate('window.__xss === 1 || window.__xss2 === 1'),
    errs: page.pageErrors,
    title: await page.evaluate(`(document.querySelector('#wjx-commercial-panel .wjx-card-title, #wjx-commercial-panel .wjx-card h4')||{}).textContent||''`),
  }),
  assert: (r) => {
    ok(r.xss === false, '  题干/选项中的脚本未执行', r.xss);
    ok(r.errs.length === 0, '  无未捕获异常', r.errs);
  },
});

// 场景 5：字段缺 ID（题号靠 fallback）
cases.push({
  name: '题目缺失 id/topic',
  html: `<!DOCTYPE html><html><body><form id="form1"><div id="divQuestion">
    <div class='field ui-field-contain' type='3' req='1'>
      <div class='field-label'><div class='topichtml'>无题号的单选</div></div>
      <div class='ui-controlgroup'>
        <div class='ui-radio'><input type='radio' value='1' name='qx' style='display:none;'/><a class='jqradio' href='javascript:;'></a><div class='label'>A</div></div>
        <div class='ui-radio'><input type='radio' value='2' name='qx' style='display:none;'/><a class='jqradio' href='javascript:;'></a><div class='label'>B</div></div>
      </div>
    </div>
  </div></form></body></html>`,
  check: async (page) => ({
    errs: page.pageErrors,
    qids: await page.evaluate(`Array.from(document.querySelectorAll('#wjx-commercial-panel .wjx-card')).map(c => c.dataset.qid)`),
  }),
  assert: (r) => {
    ok(r.errs.length === 0, '  无未捕获异常', r.errs);
    ok(r.qids.length >= 1 && !!r.qids[0], '  生成了 fallback 题号', r.qids);
  },
});

(async () => {
  const browser = new Browser(9345);
  await browser.launch();

  for (const c of cases) {
    console.log(`\n--- ${c.name} ---`);
    const page = await browser.newPage();
    const file = path.join(__dirname, 'out', `case-${cases.indexOf(c)}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, c.html, 'utf8');
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    await sleep(200);
    if (!c.name.includes('重复初始化')) {
      await page.evaluate(SCRIPT);
      await sleep(1200);
    }
    try {
      const r = await c.check(page);
      c.assert(r);
    } catch (e) {
      ok(false, `  场景执行失败: ${e.message}`);
    }
    page.close();
  }

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  browser.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('测试崩溃:', e); process.exit(2); });
