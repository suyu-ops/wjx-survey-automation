// 题目列表分页回归测试。
//
// 背景：面板原来把全部题目卡片平铺在同一个滚动容器里，几十道题就要一直往下翻。
// 改成「列表内独立滚动 + 分页」之后，最容易引入的不是 UI 问题，而是**数据丢失**：
//   collectCurrentQuestionsFromDom 原本以「DOM 里的卡片」为准重建配置数组，
//   分页后 DOM 只有当前页卡片，一旦某条路径触发 syncStateFromDom + saveConfig，
//   未渲染页的全部配置就会被静默抹掉。
// 所以本文件的前半部分专测「翻页不影响配置」，后半部分才是分页 UI 行为。
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('./cdp');
const { buildFixture, extractDiv } = require('./fixture');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', '问卷星.js'), 'utf8');

const REAL = path.join(__dirname, '..', '_debug', 'Qw71Alf.html');
const real = fs.existsSync(REAL) ? fs.readFileSync(REAL, 'utf8') : '';
const radioBlock = extractDiv(real, '6') || '';

// 复制 N 份单选块并改写题号，模拟大问卷。
// 注意：问卷星导出的 HTML 属性用的是单引号（topic='6'），
// 用双引号做替换会静默匹配不上，25 份复制题的题号全都还是 6——
// 那样分页测的就不是「多道题」，而是「同一个题号的 25 张卡」。
function repeatRadio(n) {
  if (!radioBlock) return '';
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = String(9100 + i);
    out.push(radioBlock
      .replace(/topic='6'/g, `topic='${t}'`)
      .replace(/id='div6'/g, `id='div${t}'`)
      .replace(/id='q6'/g, `id='q${t}'`)
      .replace(/name='q6'/g, `name='q${t}'`)
      .replace(/_6_/g, `_${t}_`)
      .replace(/q6_/g, `q${t}_`));
  }
  return out.join('\n');
}

// 基础 fixture 里的题目数（pick 了 8 个题型块）
const BASE_QUESTION_COUNT = 8;

let pass = 0, fail = 0;
const results = [];
function ok(cond, name, extra) {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`;
  results.push(line);
  if (cond) { pass++; console.log(line); } else { fail++; console.log(line); }
}

// 面板内部工具：通过 DOM 事件驱动，不直接调用脚本私有函数
const HELPERS = `
window.__panel = () => document.getElementById('wjx-commercial-panel');
window.__cards = () => Array.from(document.querySelectorAll('#wjx-commercial-panel .wjx-card'));
window.__pagerState = () => {
  const pager = document.getElementById('wjx-question-pager');
  const pageInput = document.getElementById('wjx-pager-page');
  const sizeSelect = document.getElementById('wjx-pager-size');
  return {
    hidden: !pager || pager.hidden,
    page: pageInput ? Number(pageInput.value) : null,
    totalPages: Number((document.getElementById('wjx-pager-total-pages') || {}).textContent || 0),
    pageSize: sizeSelect ? Number(sizeSelect.value) : null,
    info: (document.getElementById('wjx-pager-info') || {}).textContent || '',
    prevDisabled: (document.getElementById('wjx-pager-prev') || {}).disabled,
    nextDisabled: (document.getElementById('wjx-pager-next') || {}).disabled
  };
};
window.__setPage = (n) => {
  const input = document.getElementById('wjx-pager-page');
  input.value = String(n);
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
window.__setPageSize = (n) => {
  const sel = document.getElementById('wjx-pager-size');
  sel.value = String(n);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};
window.__clickNext = () => document.getElementById('wjx-pager-next').click();
window.__clickPrev = () => document.getElementById('wjx-pager-prev').click();
window.__setSearch = (v) => {
  const el = document.getElementById('wjx-question-search');
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
window.__setTypeFilter = (v) => {
  const el = document.getElementById('wjx-question-type-filter');
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
// 从 localStorage 读回脚本真正保存的配置（验证「配置没被抹掉」的最终依据）
window.__savedConfig = () => {
  const key = Object.keys(localStorage).find(k => k.indexOf('WJX_CN_PANEL_') === 0);
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return { parseError: String(e) }; }
};
window.__setWeight = (qid, index, value) => {
  const card = __cards().find(c => c.dataset.qid === qid);
  if (!card) return { ok: false, reason: 'card not rendered', qid };
  const inputs = Array.from(card.querySelectorAll('[data-role="weight-input"]'));
  if (!inputs[index]) return { ok: false, reason: 'no such input', qid, count: inputs.length };
  inputs[index].value = String(value);
  inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
  inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, qid, index, value };
};
`;

(async () => {
  const browser = new Browser(9349);
  await browser.launch();
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // 用基础题 + 25 道复制题 = 33 道，默认 10/页 → 4 页
  const TOTAL = BASE_QUESTION_COUNT + 25;
  const TOTAL_PAGES = Math.ceil(TOTAL / 10);
  const LAST_PAGE_CARDS = TOTAL - (TOTAL_PAGES - 1) * 10;
  const html = buildFixture({ extraHtml: repeatRadio(25) });
  const file = path.join(outDir, 'pagination.html');
  fs.writeFileSync(file, html, 'utf8');
  const url = 'file:///' + file.replace(/\\/g, '/');

  const page = await browser.newPage();
  await page.goto(url);
  await sleep(250);
  await page.evaluate(SCRIPT + '\n//# sourceURL=wjx-pagination.js');
  await sleep(1500);
  await page.evaluate(HELPERS);

  // ===== 1. 面板定位：固定而非可拖动 =====
  console.log('\n--- 面板定位 ---');
  const layout = await page.evaluate(`(() => {
    const p = __panel();
    if (!p) return { ok: false, reason: 'no panel' };
    const cs = getComputedStyle(p);
    const rect = p.getBoundingClientRect();
    return {
      ok: true,
      position: cs.position,
      top: cs.top,
      right: cs.right,
      // 拖拽实现会挂 mousedown 监听；这里检查是否存在拖拽残留的 cursor 提示
      cursor: cs.cursor,
      // 面板必须完整落在视口内
      inViewport: rect.top >= 0 && rect.right <= window.innerWidth + 1 && rect.height <= window.innerHeight + 1,
      rect: { top: Math.round(rect.top), right: Math.round(rect.right), w: Math.round(rect.width), h: Math.round(rect.height) },
      vw: window.innerWidth, vh: window.innerHeight
    };
  })()`);
  ok(layout.ok && layout.position === 'fixed', '面板使用 position: fixed（不可拖动）', layout);
  ok(layout.ok && layout.inViewport, '面板完整落在视口内', layout.rect);

  // 拖动标题栏后位置不应改变（证明拖拽逻辑已移除）
  const dragResult = await page.evaluate(`(() => {
    const p = __panel();
    const head = p.querySelector('.wjx-head');
    const before = p.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: 200, clientY: 200, buttons: 1 };
    head.dispatchEvent(new MouseEvent('mousedown', opts));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 420, clientY: 380, buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 420, clientY: 380 }));
    const after = p.getBoundingClientRect();
    return {
      dx: Math.round(after.left - before.left),
      dy: Math.round(after.top - before.top)
    };
  })()`);
  ok(dragResult.dx === 0 && dragResult.dy === 0, '拖动标题栏不再移动面板（已改为固定定位）', dragResult);

  // ===== 2. 分页 UI 基本行为 =====
  console.log('\n--- 分页 UI ---');
  const initial = await page.evaluate(`(() => ({
    total: Number(document.getElementById('wjx-stat-total').textContent),
    cards: __cards().length,
    pager: __pagerState(),
    listOverflow: (() => {
      const list = document.getElementById('wjx-question-list');
      const cs = getComputedStyle(list);
      return { overflowY: cs.overflowY, maxHeight: cs.maxHeight };
    })(),
    // 底部 CTA 必须常驻可见，不随列表滚动
    ctaVisible: (() => {
      const btn = document.getElementById('wjx-start-automation');
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom <= window.innerHeight + 1;
    })()
  }))()`);
  console.log('  初始状态:', JSON.stringify(initial));

  ok(initial.total === TOTAL, `识别到 ${TOTAL} 道题`, initial.total);
  ok(initial.cards === 10, '默认每页渲染 10 张卡片（不再一次性渲染全部）', initial.cards);
  ok(initial.pager.pager ? true : initial.pager.pageSize === 10, '每页条数默认 10', initial.pager);
  ok(initial.pager.hidden === false, '题目超过一页时分页控件可见', initial.pager);
  ok(initial.pager.totalPages === TOTAL_PAGES, `总页数为 ${TOTAL_PAGES}`, initial.pager);
  ok(initial.pager.prevDisabled === true, '第 1 页时「上一页」禁用', initial.pager);
  ok(initial.listOverflow.overflowY === 'auto', '题目列表独立滚动（overflow-y: auto）', initial.listOverflow);
  ok(initial.ctaVisible === true, '底部「开始自动化提交」常驻可见', initial.ctaVisible);

  // 翻到第 2 页
  const page2 = await page.evaluate(`(() => {
    __clickNext();
    return { cards: __cards().length, pager: __pagerState(), qids: __cards().map(c => c.dataset.qid) };
  })()`);
  ok(page2.pager.page === 2, '点击「下一页」到第 2 页', page2.pager);
  ok(page2.cards === 10, '第 2 页仍渲染 10 张卡片', page2.cards);

  // 跳到最后页
  const lastPage = await page.evaluate(`(() => {
    __setPage(${TOTAL_PAGES});
    return { cards: __cards().length, pager: __pagerState(), qids: __cards().map(c => c.dataset.qid) };
  })()`);
  ok(lastPage.pager.page === TOTAL_PAGES, `输入页码 ${TOTAL_PAGES} 可跳转`, lastPage.pager);
  ok(lastPage.cards === LAST_PAGE_CARDS, `最后页只剩 ${LAST_PAGE_CARDS} 张卡片（${TOTAL} = 10*${TOTAL_PAGES - 1} + ${LAST_PAGE_CARDS}）`, lastPage.cards);
  ok(lastPage.pager.nextDisabled === true, '最后一页「下一页」禁用', lastPage.pager);

  // 越界页码被夹紧
  const clamp = await page.evaluate(`(() => {
    __setPage(999);
    return { pager: __pagerState(), cards: __cards().length };
  })()`);
  ok(clamp.pager.page === TOTAL_PAGES, '输入越界页码被夹紧到最后一页', clamp.pager);

  // ===== 3. 核心安全点：翻页不能丢配置 =====
  console.log('\n--- 翻页不丢配置（回归重点） ---');
  // 在第 1 页把第 1 道题的权重改成一个可识别的值
  const page1Edit = await page.evaluate(`(() => {
    __setPage(1);
    const cards = __cards();
    const first = cards[0];
    const result = __setWeight(first.dataset.qid, 0, 777);
    return { result, qid: first.dataset.qid, title: (first.querySelector('.wjx-card-title')||{}).textContent || '' };
  })()`);
  ok(page1Edit.result.ok, '第 1 页第 1 题权重已改为 777', page1Edit);

  // 等待 debounce 保存（350ms）+ 余量
  await sleep(900);

  // 翻到其他页，再切回第 1 页，确认编辑值还在
  const roundTrip = await page.evaluate(`(() => {
    __setPage(3);
    __setPage(1);
    const card = __cards().find(c => c.dataset.qid === '${page1Edit.qid}');
    const inputs = card ? Array.from(card.querySelectorAll('[data-role="weight-input"]')) : [];
    return { found: !!card, value: inputs[0] ? inputs[0].value : null };
  })()`);
  ok(roundTrip.found && roundTrip.value === '777', '翻到第 3 页再回第 1 页，权重值保留', roundTrip);

  // 关键断言：localStorage 里保存的配置必须仍有 32 道题，且第 1 题权重是 777
  const savedAfterPaging = await page.evaluate(`(() => {
    const cfg = __savedConfig();
    if (!cfg || !Array.isArray(cfg.questions)) return { ok: false, cfg };
    const first = cfg.questions.find(q => String(q.id) === '${page1Edit.qid}');
    return {
      ok: true,
      count: cfg.questions.length,
      firstWeights: first && Array.isArray(first.weights) ? first.weights : null,
      ids: cfg.questions.map(q => String(q.id))
    };
  })()`);
  ok(savedAfterPaging.ok, 'localStorage 中存在已保存的配置', savedAfterPaging.ok);
  ok(savedAfterPaging.count === TOTAL, `翻页后保存的配置仍有 ${TOTAL} 道题（未被分页裁剪）`, savedAfterPaging.count);
  ok(savedAfterPaging.firstWeights && savedAfterPaging.firstWeights[0] === 777,
    '翻页后保存的权重仍是用户编辑的 777', savedAfterPaging.firstWeights && savedAfterPaging.firstWeights[0]);

  // 在非第 1 页时编辑第 3 页的题，再回第 1 页——验证反向不丢
  const page3Edit = await page.evaluate(`(() => {
    __setPage(3);
    const cards = __cards();
    const target = cards[0];
    const result = __setWeight(target.dataset.qid, 0, 888);
    return { result, qid: target.dataset.qid };
  })()`);
  ok(page3Edit.result.ok, '第 3 页第 1 题权重已改为 888', page3Edit);
  await sleep(900);
  const afterPage3 = await page.evaluate(`(() => {
    __setPage(1);
    const cfg = __savedConfig();
    const q = cfg && Array.isArray(cfg.questions) ? cfg.questions.find(x => String(x.id) === '${page3Edit.qid}') : null;
    return {
      count: cfg ? cfg.questions.length : 0,
      weights: q && Array.isArray(q.weights) ? q.weights.slice(0, 3) : null
    };
  })()`);
  ok(afterPage3.count === TOTAL, `在第 3 页编辑后配置仍有 ${TOTAL} 道题`, afterPage3.count);
  ok(afterPage3.weights && afterPage3.weights[0] === 888, '第 3 页的编辑已保存到配置', afterPage3.weights);

  // ===== 4. 一键随机必须覆盖所有页 =====
  console.log('\n--- 一键随机覆盖全部页面 ---');
  // 先把所有题权重清零（逐页操作），再点「一键随机全部」，
  // 然后逐页检查每道题的权重是否都被重新赋值（非全零）。
  const zeroAll = await page.evaluate(`(() => {
    const size = __pagerState().totalPages;
    let touched = 0;
    for (let p = 1; p <= size; p++) {
      __setPage(p);
      __cards().forEach((card) => {
        const inputs = Array.from(card.querySelectorAll('[data-role="weight-input"]'));
        inputs.forEach((inp, i) => {
          inp.value = '0';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          touched++;
        });
      });
    }
    return { touched, totalPages: size };
  })()`);
  await sleep(900);
  const zeroCheck = await page.evaluate(`(() => {
    const cfg = __savedConfig();
    const zeros = (cfg.questions || []).filter(q => Array.isArray(q.weights) && q.weights.length && q.weights.every(v => Number(v) === 0)).length;
    return { zeros, count: cfg.questions.length };
  })()`);
  ok(zeroCheck.zeros > 0, '清零后确实存在全零权重的题目（前置条件成立）', zeroCheck);

  const randomize = await page.evaluate(`(() => {
    __setPage(1);
    document.getElementById('wjx-randomize-all').click();
    return true;
  })()`);
  await sleep(1200);
  const afterRandom = await page.evaluate(`(() => {
    const cfg = __savedConfig();
    const questions = cfg.questions || [];
    const zeroWeight = questions.filter(q =>
      Array.isArray(q.weights) && q.weights.length && q.weights.every(v => Number(v) === 0)
    );
    // 只统计本来就该有权重的题型
    const shouldHaveWeights = questions.filter(q =>
      ['radio','checkbox','dropdown','rating','matrix','proportion'].includes(q.type)
    );
    const zeroAmongThem = shouldHaveWeights.filter(q =>
      Array.isArray(q.weights) && q.weights.length && q.weights.every(v => Number(v) === 0)
    );
    return {
      count: questions.length,
      shouldHaveWeights: shouldHaveWeights.length,
      zeroWeight: zeroWeight.length,
      zeroAmongThem: zeroAmongThem.map(q => q.id),
      // 顺便确认第 1 页 DOM 上的输入框也刷新了
      page1Sample: (__cards()[0] ? Array.from(__cards()[0].querySelectorAll('[data-role="weight-input"]')).map(i => i.value) : [])
    };
  })()`);
  ok(randomize, '「一键随机全部」按钮可点击');
  ok(afterRandom.count === TOTAL, `随机后配置仍有 ${TOTAL} 道题`, afterRandom.count);
  ok(afterRandom.zeroAmongThem.length === 0,
    '随机后所有需要权重且非零的题型都已赋值（跨页生效，不再只作用于当前页）',
    { zero: afterRandom.zeroAmongThem, shouldHave: afterRandom.shouldHaveWeights });

  // ===== 5. 每页条数切换 =====
  console.log('\n--- 每页条数 ---');
  const resize = await page.evaluate(`(() => {
    __setPage(2);
    __setPageSize(50);
    return { cards: __cards().length, pager: __pagerState() };
  })()`);
  ok(resize.cards === TOTAL, `切到 50/页 时 ${TOTAL} 道题一页显示完`, resize.cards);
  ok(resize.pager.hidden === true, '全部题目在一页内时分页控件隐藏', resize.pager);

  const backTo10 = await page.evaluate(`(() => {
    __setPageSize(10);
    return { cards: __cards().length, pager: __pagerState() };
  })()`);
  ok(backTo10.cards === 10 && backTo10.pager.totalPages === TOTAL_PAGES, `切回 10/页 恢复 ${TOTAL_PAGES} 页`, backTo10);

  // ===== 6. 筛选与分页联动 =====
  console.log('\n--- 筛选与分页联动 ---');
  const filtered = await page.evaluate(`(() => {
    __setPage(3);
    __setTypeFilter('text');
    return { cards: __cards().length, pager: __pagerState(), summary: (document.getElementById('wjx-match-summary')||{}).textContent || '' };
  })()`);
  ok(filtered.pager.page === 1, '改变筛选后页码复位到第 1 页', filtered.pager);
  ok(filtered.cards <= 10, '筛选后只渲染命中的题目', filtered.cards);
  ok(filtered.summary.indexOf('已匹配') === 0, '标题旁显示「已匹配 x / y 道」', filtered.summary);

  const noMatch = await page.evaluate(`(() => {
    __setSearch('这个关键词一定不存在zzzz');
    return { cards: __cards().length, empty: (document.querySelector('#wjx-question-list .wjx-empty')||{}).textContent || '', pager: __pagerState() };
  })()`);
  ok(noMatch.cards === 0 && noMatch.empty.indexOf('没有符合') === 0, '无匹配时显示明确空态而非空白', noMatch.empty);

  const cleared = await page.evaluate(`(() => {
    __setSearch('');
    __setTypeFilter('all');
    return { cards: __cards().length, pager: __pagerState() };
  })()`);
  ok(cleared.cards === 10 && cleared.pager.totalPages === TOTAL_PAGES, '清空筛选后恢复分页', cleared);

  // ===== 7. 折叠后 footer 一并隐藏 =====
  console.log('\n--- 折叠行为 ---');
  const collapse = await page.evaluate(`(() => {
    document.getElementById('wjx-toggle-panel').click();
    const p = __panel();
    const body = document.getElementById('wjx-panel-body');
    const footer = p.querySelector('.wjx-footer');
    return {
      collapsed: p.classList.contains('is-collapsed'),
      bodyHidden: body.classList.contains('wjx-hidden'),
      footerDisplay: footer ? getComputedStyle(footer).display : null,
      toggleText: document.getElementById('wjx-toggle-panel').textContent
    };
  })()`);
  ok(collapse.collapsed && collapse.bodyHidden, '折叠后主体隐藏', collapse);
  ok(collapse.footerDisplay === 'none', '折叠后底部 CTA 一并隐藏', collapse.footerDisplay);
  ok(collapse.toggleText === '展开', '折叠后按钮文字变为「展开」', collapse.toggleText);

  const expand = await page.evaluate(`(() => {
    document.getElementById('wjx-toggle-panel').click();
    const p = __panel();
    return {
      collapsed: p.classList.contains('is-collapsed'),
      bodyHidden: document.getElementById('wjx-panel-body').classList.contains('wjx-hidden'),
      footerDisplay: getComputedStyle(p.querySelector('.wjx-footer')).display,
      toggleText: document.getElementById('wjx-toggle-panel').textContent
    };
  })()`);
  ok(!expand.collapsed && !expand.bodyHidden, '展开后主体恢复', expand);
  ok(expand.footerDisplay !== 'none', '展开后底部 CTA 恢复', expand.footerDisplay);

  // ===== 8. 无控制台错误 =====
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
