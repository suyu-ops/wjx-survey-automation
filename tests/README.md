# 测试

纯 Node 脚本，**无第三方依赖**。自己实现的极简 CDP 客户端（`cdp.js`）直接驱动 Chrome/Edge 的原生
WebSocket，不引 puppeteer、不引 jsdom——少一层依赖，就少一层「测试通过了但其实测的是模拟环境」。

## 前置条件

- Node.js（只在 v24.16.0 上验证过；代码只用到 `child_process` / `http` / `crypto` / `net` / `os` / `fs` / `path`
  这些内置模块，没有用任何新语法，但低版本未实测）
- 本机装有 Chrome 或 Edge（`cdp.js` 顶部 `CHROME_CANDIDATES` 里硬编码了 Windows 常见安装路径，
  其他平台改这个数组即可）
- fixture 依赖 `_debug/Qw71Alf.html`（一份真实问卷星页面的本地快照）。该文件不在仓库内，
  缺失时 `fixture.js` 会退化为空题目块，多数用例会失败。

## 运行

```bash
node tests/unit.test.js          # 65 项：纯函数与算法不变量
node tests/integration.test.js   # 26 项：真 Chrome + 复刻的 WJX DOM/事件契约
node tests/robustness.test.js    # 11 项：空页面、畸形 DOM、缺属性、XSS 载荷
node tests/lifecycle.test.js     # 15 项：会话状态机、配额快照回滚
node tests/pagination.test.js    # 44 项：分页不丢配置、一键随机覆盖全页
```

合计 **161 项断言**。

## 性能对照（可选）

```bash
node tests/perf.test.js 5        # 5 轮交替执行顺序，取中位数
node tests/scale.test.js 7       # 规模曲线，7 轮中位数
SCALE_VERBOSE=1 node tests/scale.test.js 7   # 额外打印每轮原始样本
```

这两个脚本会拿**上游原版 4.1.4** 做同 fixture 对照，需要手动放一份副本到
`tests/out/upstream.user.js`（MIT 许可，来源见脚本头 `@original-script`）。
该文件**不入库**（第三方代码），缺失时脚本会自动跳过上游列、只测本项目。

## 产物

所有运行产物（fixture 页面、`perf.json`、`scale.json`）都写到 `tests/out/`，已 gitignore。

## 已知的测试自身缺陷（已修）

`fixture.js` 里的复制题块函数曾用**双引号**做属性替换（`/topic="6"/g`），而问卷星导出的 HTML
用的是**单引号**（`topic='6'`）——替换全部静默失配，N 份复制块的题号全都还是 `6`，测的其实是
「同一个题号的 N 张卡」而不是「N 道不同的题」。`pagination.test.js` 与 `scale.test.js` 现已改为
单引号，并在断言里核对实际卡片数。

历史性能数据受此影响（题数标签失真），已在 `docs/06-测试报告.md` 6.1 节标注并重测。
