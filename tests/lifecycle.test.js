// 自动化生命周期测试：启动 → 暂停 → 继续 → 停止 → 跳过。
// 这些流程涉及 location.href 跳转，用 CDP 的 Fetch 域拦截导航来观察意图。
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

// 生成与脚本一致的 surveyKey，否则会话会被 loadAutomationSession 正确拒绝
function surveyKeyFor(url) {
  const u = new URL(url);
  return 'WJX_CN_PANEL_' + `${u.host}${u.pathname}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

(async () => {
  const browser = new Browser(9346);
  await browser.launch();

  // --- 测试 1：停止标志能跨页面持久化并阻止续跑 ---
  console.log('\n--- 停止标志持久化 ---');
  {
    const page = await browser.newPage();
    const file = path.join(__dirname, 'out', 'lifecycle.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buildFixture(), 'utf8');
    const url = 'file:///' + file.replace(/\\/g, '/');
    await page.goto(url);
    await sleep(200);
    await page.evaluate(SCRIPT);
    await sleep(1000);

    // 写入会话（模拟自动化进行中），然后点停止
    const key1 = surveyKeyFor(url);
    await page.evaluate(`
      localStorage.setItem('WJX_REMAINING_COUNT', JSON.stringify({
        surveyKey: ${JSON.stringify(key1)}, remaining: 5, total: 5, failed: 0, paused: false,
        retryCount: 0, verifyFailures: 0, maxRetries: 2, url: location.href
      }));
    `);
    const sessionBefore = await page.evaluate(`localStorage.getItem('WJX_REMAINING_COUNT') !== null`);
    ok(sessionBefore, '  会话已写入');

    // 重新加载页面，让 init 读会话并尝试续跑
    await page.goto(url);
    await sleep(300);
    await page.evaluate(SCRIPT);
    await sleep(3000);
    const resumed = await page.evaluate(`!!document.querySelector('.wjx-progress-modal.is-visible')`);
    ok(resumed, '  有会话时自动续跑（进度弹窗显示）');

    // 点停止
    const stopClicked = await page.evaluate(`(() => {
      const btn = document.getElementById('wjx-progress-stop');
      if (!btn) return false;
      btn.click(); return true;
    })()`);
    ok(stopClicked, '  找到并点击「停止提交」');
    await sleep(500);

    const afterStop = await page.evaluate(`({
      stoppedFlag: localStorage.getItem('WJX_AUTOMATION_STOPPED'),
      session: localStorage.getItem('WJX_REMAINING_COUNT'),
      modalVisible: !!document.querySelector('.wjx-progress-modal.is-visible')
    })`);
    ok(afterStop.stoppedFlag === '1', '  停止标志已持久化', afterStop.stoppedFlag);
    ok(afterStop.session === null, '  会话已清除', afterStop.session);
    ok(afterStop.modalVisible === false, '  进度弹窗已隐藏', afterStop.modalVisible);

    // 再次加载：停止标志应阻止续跑
    await page.goto(url);
    await sleep(300);
    await page.evaluate(SCRIPT);
    await sleep(2500);
    const afterReload = await page.evaluate(`({
      modalVisible: !!document.querySelector('.wjx-progress-modal.is-visible'),
      panelHidden: (document.getElementById('wjx-commercial-panel')||{classList:{contains:()=>false}}).classList.contains('is-automation-hidden')
    })`);
    ok(afterReload.modalVisible === false, '  停止后重新加载不再续跑', afterReload);
    ok(afterReload.panelHidden === false, '  面板正常显示（未被隐藏）', afterReload);

    page.close();
  }

  // --- 测试 2：暂停后不再继续填写 ---
  console.log('\n--- 暂停行为 ---');
  {
    const page = await browser.newPage();
    const file = path.join(__dirname, 'out', 'lifecycle2.html');
    fs.writeFileSync(file, buildFixture(), 'utf8');
    const url = 'file:///' + file.replace(/\\/g, '/');
    await page.goto(url);
    await sleep(200);
    await page.evaluate(SCRIPT);
    await sleep(1000);

    const key2 = surveyKeyFor(url);
    await page.evaluate(`
      localStorage.setItem('WJX_REMAINING_COUNT', JSON.stringify({
        surveyKey: ${JSON.stringify(key2)}, remaining: 3, total: 3, failed: 0, paused: false,
        retryCount: 0, verifyFailures: 0, maxRetries: 2, url: location.href
      }));
    `);
    // 清理上一组用例留下的停止标志（同域共享 localStorage）
    await page.goto(url);
    await sleep(200);
    await page.evaluate(`localStorage.removeItem('WJX_AUTOMATION_STOPPED')`);
    await page.goto(url);
    await sleep(300);
    await page.evaluate(SCRIPT);
    await sleep(2500);

    const pauseClicked = await page.evaluate(`(() => {
      const btn = document.getElementById('wjx-progress-pause');
      if (!btn) return false;
      btn.click(); return true;
    })()`);
    ok(pauseClicked, '  找到并点击「暂停」');
    await sleep(400);

    const paused = await page.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem('WJX_REMAINING_COUNT')||'null');
      return { paused: s && s.paused, remaining: s && s.remaining };
    })()`);
    ok(paused.paused === true, '  会话标记为 paused', paused);
    ok(paused.remaining === 3, '  暂停不消耗份数', paused);

    // 暂停后应能「继续」
    const resumeClicked = await page.evaluate(`(() => {
      const btn = document.getElementById('wjx-progress-pause');
      if (!btn) return false;
      btn.click(); return true;
    })()`);
    ok(resumeClicked, '  再次点击「继续」可用');

    page.close();
  }

  // --- 测试 3：无 session 时点停止不应报错 ---
  console.log('\n--- 边界：无会话时操作 ---');
  {
    const page = await browser.newPage();
    const file = path.join(__dirname, 'out', 'lifecycle3.html');
    fs.writeFileSync(file, buildFixture(), 'utf8');
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    await sleep(200);
    await page.evaluate(SCRIPT);
    await sleep(900);
    // 无会话时进度弹窗可能根本不存在；真正要验证的是「即使弹窗存在，点击也不抛错」。
    const r = await page.evaluate(`(() => {
      const out = { errors: [], existed: {} };
      const modal = document.querySelector('.wjx-progress-modal');
      out.modalExists = !!modal;
      ['stop','pause','skip'].forEach((k) => {
        const btn = document.getElementById('wjx-progress-' + k);
        out.existed[k] = !!btn;
        if (!btn) return; // 弹窗不存在 -> 按钮不存在，属正常
        try { btn.click(); } catch (e) { out.errors.push(k + ':' + e.message); }
      });
      return out;
    })()`);
    ok(r.errors.length === 0, '  无会话时按钮点击不抛错', r);
    ok(r.modalExists === false, '  无会话时不显示进度弹窗', r.modalExists);
    ok(page.pageErrors.length === 0, '  无未捕获异常', page.pageErrors);
    page.close();
  }

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  browser.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('测试崩溃:', e); process.exit(2); });
