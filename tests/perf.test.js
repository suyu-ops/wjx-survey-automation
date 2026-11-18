// 性能对比：本项目脚本 vs 上游原版（x7R2p9 4.1.4）。
// 方法学要求：
//   1. 每次测量都用全新页面（避免 JIT 预热、残留全局、残留存储影响结果）；
//   2. 交替执行顺序（避免「谁先跑谁吃亏/占便宜」）；
//   3. 多轮取中位数，报告中位数与离散度，不用单次数值下结论。
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('./cdp');
const { buildFixture } = require('./fixture');

const OURS = fs.readFileSync(path.join(__dirname, '..', '问卷星.js'), 'utf8');
const UPSTREAM_PATH = path.join(__dirname, 'out', 'upstream.user.js');
const UPSTREAM = fs.existsSync(UPSTREAM_PATH) ? fs.readFileSync(UPSTREAM_PATH, 'utf8') : null;
const ROUNDS = Number(process.argv[2] || 3);

const FIXTURE = path.join(__dirname, 'out', 'perf-fixture.html');
const FIXTURE_URL = 'file:///' + FIXTURE.replace(/\\/g, '/');

async function oneRun(browser, src, label, round) {
  const page = await browser.newPage();
  if (!page) throw new Error('无法创建页面');
  await page.goto(FIXTURE_URL);
  await sleep(200);

  // 被测脚本自身在注入前开始计时，注入结束读取差值
  const m = await page.evaluate(`(() => {
    window.__t0 = performance.now();
    return true;
  })()`);
  let injectError = null;
  try {
    await page.evaluate(src + '\n//# sourceURL=' + label + '-' + round + '.user.js');
  } catch (e) {
    injectError = String(e).slice(0, 300);
  }

  const res = await page.evaluate(`(() => {
    const elapsed = performance.now() - window.__t0;
    const panel = document.getElementById('wjx-commercial-panel');
    const mem = performance.memory || {};
    return {
      elapsed: Math.round(elapsed * 100) / 100,
      panel: !!panel,
      cards: document.querySelectorAll('.wjx-card').length,
      nodes: document.querySelectorAll('*').length,
      heapUsed: mem.usedJSHeapSize || 0,
      heapTotal: mem.totalJSHeapSize || 0
    };
  })()`);

  // 再观察 1.5s，统计长期存在的定时器/观察器是否造成持续增长
  const nodesAtReady = res.nodes;
  await sleep(1500);
  const after = await page.evaluate(`(() => ({
    nodes: document.querySelectorAll('*').length,
    heapUsed: (performance.memory || {}).usedJSHeapSize || 0
  }))()`);

  await page.close();
  return {
    label, round, injectError,
    execMs: res.elapsed,
    panel: res.panel,
    cards: res.cards,
    nodesBase: 203,
    nodesAfterInject: nodesAtReady,
    nodesAfterIdle: after.nodes,
    heapAfterInject: res.heapUsed,
    heapAfterIdle: after.heapUsed
  };
}

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

(async () => {
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(FIXTURE, buildFixture(), 'utf8');

  const browser = new Browser(9347);
  await browser.launch();

  const runs = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const order = r % 2 === 1 ? ['ours', 'upstream'] : ['upstream', 'ours'];
    for (const which of order) {
      if (which === 'upstream' && !UPSTREAM) continue;
      const src = which === 'ours' ? OURS : UPSTREAM;
      const row = await oneRun(browser, src, which, r);
      runs.push(row);
      console.log(`  第${r}轮 ${which}: exec=${row.execMs}ms cards=${row.cards} nodes=${row.nodesAfterInject} err=${row.injectError || 'none'}`);
    }
  }

  const summary = {};
  for (const label of ['ours', 'upstream']) {
    const rs = runs.filter((x) => x.label === label && !x.injectError);
    if (!rs.length) continue;
    summary[label] = {
      rounds: rs.length,
      execMs: rs.map((x) => x.execMs),
      execMedian: median(rs.map((x) => x.execMs)),
      nodesAdded: rs.map((x) => x.nodesAfterInject - x.nodesBase),
      nodesAddedMedian: median(rs.map((x) => x.nodesAfterInject - x.nodesBase)),
      idleNodeGrowth: rs.map((x) => x.nodesAfterIdle - x.nodesAfterInject),
      cards: rs[0].cards,
      panel: rs.every((x) => x.panel)
    };
  }

  console.log('\n======= 汇总（中位数，%d 轮）=======', ROUNDS);
  for (const [label, s] of Object.entries(summary)) {
    console.log(`\n[${label}]  有效轮次 ${s.rounds}  面板注入成功 ${s.panel}`);
    console.log(`  脚本执行: ${s.execMs.join(' / ')} ms  → 中位数 ${s.execMedian} ms`);
    console.log(`  DOM 节点新增: ${s.nodesAdded.join(' / ')}  → 中位数 ${s.nodesAddedMedian}`);
    console.log(`  空闲 1.5s 后节点增长: ${s.idleNodeGrowth.join(' / ')}`);
    console.log(`  面板题目卡片: ${s.cards}`);
  }
  if (summary.ours && summary.upstream) {
    const ratio = (summary.ours.execMedian / summary.upstream.execMedian).toFixed(2);
    console.log(`\n执行耗时比（本项目/上游）= ${ratio}x（>1 表示本项目更慢）`);
    console.log(`DOM 节点增量比 = ${(summary.ours.nodesAddedMedian / summary.upstream.nodesAddedMedian).toFixed(2)}x`);
  }

  fs.writeFileSync(path.join(__dirname, 'out', 'perf.json'), JSON.stringify({ runs, summary }, null, 2), 'utf8');
  browser.kill();
  process.exit(0);
})().catch((e) => { console.error('测试崩溃:', e); process.exit(2); });
