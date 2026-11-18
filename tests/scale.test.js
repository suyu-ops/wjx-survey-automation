// 规模曲线：随题目数量增长，两个脚本的扫描/渲染耗时如何变化。
// 目的：7 题的 11ms 差异不足以定论，必须看斜率——若耗时随题数呈平方增长，
// 真实大问卷（上百题）下就会变成秒级卡顿，那才是需要修的性能缺陷。
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('./cdp');
const { buildFixture, extractDiv } = require('./fixture');

const OURS = fs.readFileSync(path.join(__dirname, '..', '问卷星.js'), 'utf8');
const UP_PATH = path.join(__dirname, 'out', 'upstream.user.js');
const UP = fs.existsSync(UP_PATH) ? fs.readFileSync(UP_PATH, 'utf8') : null;

const REAL = path.join(__dirname, '..', '_debug', 'Qw71Alf.html');
const real = fs.existsSync(REAL) ? fs.readFileSync(REAL, 'utf8') : '';
const radioBlock = extractDiv(real, '6') || '';

// 复制 N 份单选块，改写 topic/id，模拟大问卷。
// 注意：问卷星导出的 HTML 属性用的是单引号（topic='6'），
// 用双引号做替换会静默匹配不上，N 份复制题的题号全都还是 6——
// 那样测的就不是「N 道不同的题」，而是「同一个题号的 N 张卡」。
function repeatRadio(n) {
  if (!radioBlock) return '';
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = String(9000 + i);
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

function median(a) { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

(async () => {
  const browser = new Browser(9348);
  await browser.launch();
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // 轮数可传参：冷启动第一轮会带 JIT/缓存预热开销，
  // 3 轮的中位数容易被单次抖动带偏，需要更高置信度时传 5。
  const reps = Math.max(3, Number(process.argv[2]) || 3);

  const scales = [0, 20, 60, 140];
  // 基础 fixture 是 8 道题（见 fixture.js 里 pick 的 8 个题型块），
  // 之前这里写的是 7，导致小规模那档的题数被少算。
  const BASE_QUESTION_COUNT = 8;
  const table = [];

  for (const n of scales) {
    const html = buildFixture({ extraHtml: repeatRadio(n) });
    const total = BASE_QUESTION_COUNT + n;
    const file = path.join(outDir, `scale-${total}.html`);
    fs.writeFileSync(file, html, 'utf8');
    const url = 'file:///' + file.replace(/\\/g, '/');

    const row = { total };

    for (const [label, src] of [['ours', OURS], ['upstream', UP]]) {
      if (!src) continue;
      const samples = [];
      let cards = 0;
      for (let rep = 0; rep < reps; rep++) {
        const page = await browser.newPage();
        await page.goto(url);
        await sleep(180);
        const r = await page.evaluate(`(() => {
          window.__t0 = performance.now();
          return true;
        })()`);
        try {
          await page.evaluate(src + '\n//# sourceURL=' + label + '.user.js');
        } catch (e) { /* 记录为失败 */ }
        const m = await page.evaluate(`(() => ({
          ms: performance.now() - window.__t0,
          cards: document.querySelectorAll('.wjx-card').length
        }))()`);
        samples.push(m.ms);
        cards = m.cards;
        await page.close();
      }
      row[label] = { median: Math.round(median(samples) * 10) / 10, samples: samples.map((x) => Math.round(x * 10) / 10), cards };
    }
    table.push(row);
    console.log(`${String(total).padStart(4)} 题: ours=${row.ours ? row.ours.median + 'ms(' + row.ours.cards + '卡)' : '-'}  upstream=${row.upstream ? row.upstream.median + 'ms(' + row.upstream.cards + '卡)' : '-'}`);
    if (process.env.SCALE_VERBOSE) {
      for (const label of ['ours', 'upstream']) {
        if (row[label]) console.log(`      ${label}: ${row[label].samples.join(' / ')}`);
      }
    }
  }

  console.log('\n======= 规模曲线（' + reps + ' 次中位数）=======');
  console.log('题数\t本项目(ms)\t上游(ms)\t倍数');
  for (const r of table) {
    if (!r.ours || !r.upstream) continue;
    console.log(`${r.total}\t${r.ours.median}\t\t${r.upstream.median}\t\t${(r.ours.median / r.upstream.median).toFixed(2)}x`);
  }

  fs.writeFileSync(path.join(outDir, 'scale.json'), JSON.stringify(table, null, 2), 'utf8');
  browser.kill();
  process.exit(0);
})().catch((e) => { console.error('崩溃:', e); process.exit(2); });
