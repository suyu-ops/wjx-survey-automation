// 持久化回归测试：设计份数与「清除本地数据」。
// 这两项都需要真实 DOM + localStorage，纯逻辑测试覆盖不到，因此单独成文件。
// 每个用例都对应一个已修复的真实缺陷：
//   1. 刷新页面后设计份数被模板默认 value="1" 覆盖（localStorage 里仍是用户值）
//   2. 「清除本地数据」后刷新界面时自动随机化又写回一份配置，清除等于没清
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('./cdp');
const { buildFixture } = require('./fixture');

const SCRIPT = path.join(__dirname, '..', '问卷星.js');
const scriptSrc = fs.readFileSync(SCRIPT, 'utf8');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`;
  console.log(line);
  if (cond) { pass++; } else { fail++; }
}

(async () => {
  const browser = new Browser(9349);
  await browser.launch();
  const page = await browser.newPage();
  if (!page) throw new Error('无法创建页面');

  const html = buildFixture();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const file = path.join(__dirname, 'out', 'persist.html');
  fs.writeFileSync(file, html, 'utf8');
  const url = 'file:///' + file.replace(/\\/g, '/');

  // 与脚本内部一致：STORAGE_PREFIX（WJX_CN_PANEL_）+ host + pathname（非字母数字转下划线）
  await page.goto(url);
  await sleep(300);
  await page.evaluate(scriptSrc + '\n//# sourceURL=wjx-user.js');
  await sleep(1200);

  const key = await page.evaluate(`(() => {
    const keys = Object.keys(localStorage);
    return keys.find(k => k.indexOf('WJX_CN_PANEL_') === 0) || null;
  })()`);

  ok(!!key, '脚本写入了配置存档', key);
  if (!key) {
    console.log('\n无法定位存档 key，后续用例无意义，终止。');
    browser.kill();
    process.exit(1);
  }

  // ===== 1. 设计份数：改值 → 保存 → 重新加载 → 不被覆盖 =====
  await page.evaluate(`(() => {
    const input = document.getElementById('wjx-target-count');
    input.value = '37';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return null;
  })()`);
  await sleep(600); // 等 350ms 去抖保存落盘

  const storedAfterEdit = await page.evaluate(`(() => {
    const raw = localStorage.getItem(${JSON.stringify(key)});
    return raw ? (JSON.parse(raw).targetCount || null) : null;
  })()`);
  ok(storedAfterEdit === 37, '输入 37 后存档里是 37', storedAfterEdit);

  // 重新加载页面并重新注入脚本，模拟用户刷新
  await page.goto(url);
  await sleep(300);
  await page.evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify({ targetCount: 37 }))})`);
  await page.evaluate(scriptSrc + '\n//# sourceURL=wjx-user.js');
  await sleep(1200);

  const afterReload = await page.evaluate(`(() => {
    const input = document.getElementById('wjx-target-count');
    const raw = localStorage.getItem(${JSON.stringify(key)});
    return {
      inputValue: input ? input.value : null,
      stored: raw ? (JSON.parse(raw).targetCount || null) : null
    };
  })()`);
  ok(afterReload.inputValue === '37', '刷新后面板输入框仍是 37（旧实现回退成 1）', afterReload);
  ok(afterReload.stored === 37, '刷新后存档份数未被改写', afterReload);

  // 更关键的：刷新后任何一次「同步并保存」都不能把 37 打回 1。
  // 旧实现的顺序是 refreshQuestions 先读 DOM（此时是模板默认 1）再写回输入框，
  // 一旦用户随后触发任意保存，37 就被永久覆盖。
  await page.evaluate(`(() => {
    const input = document.getElementById('wjx-target-count');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return null;
  })()`);
  await sleep(600);
  const afterTouch = await page.evaluate(`(() => {
    const raw = localStorage.getItem(${JSON.stringify(key)});
    return raw ? (JSON.parse(raw).targetCount || null) : null;
  })()`);
  ok(afterTouch === 37, '刷新后再次触发保存，份数仍是 37（未被打回 1）', afterTouch);

  // ===== 2. 清除本地数据：清完不能立刻又被写回 =====
  // 先确保存档存在
  const beforeClear = await page.evaluate(`!!localStorage.getItem(${JSON.stringify(key)})`);
  ok(beforeClear, '清除前存档存在');

  // confirm 在 headless 里默认返回 true，这里显式覆盖以免环境差异
  await page.evaluate(`(() => {
    window.confirm = () => true;
    const btn = document.getElementById('wjx-clear-storage');
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(1200);

  const afterClear = await page.evaluate(`(() => {
    const raw = localStorage.getItem(${JSON.stringify(key)});
    return {
      exists: !!raw,
      targetCount: raw ? (JSON.parse(raw).targetCount || null) : null,
      questionCount: raw ? (JSON.parse(raw).questions || []).length : 0,
      panelAlive: !!document.getElementById('wjx-commercial-panel'),
      toast: (document.querySelector('.wjx-toast') || {}).textContent || ''
    };
  })()`);
  ok(afterClear.exists === false, '清除后 localStorage 里没有配置（旧实现会立刻写回一份）', afterClear);
  ok(afterClear.panelAlive === true, '清除后面板仍可用，未整体崩溃', afterClear.panelAlive);

  const errorsAfterClear = page.pageErrors.slice();
  ok(errorsAfterClear.length === 0, '清除过程无未捕获异常', errorsAfterClear);

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  browser.kill();
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
