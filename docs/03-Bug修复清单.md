# Bug 修复清单

> 版本：0.1.16 → 2.0.1
> 每项均含「现象 / 根因 / 修法 / 验证」。**根因不明的猜测性修复一律不列入**。
> 2.0.1 的 7 项集中在「代码看着对、跑起来是错的」，每一条都先在 `_debug/` 的真实存档或真实 Chrome 探针上复现，修完补回归断言（161 → 186）。

---

## B1 · 设计份数刷新后被覆盖（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 把设计份数改成 50 保存成功，刷新页面后面板显示 1；此后任何一次保存都把 1 永久写回 |
| 根因 | `refreshQuestions` 无条件用 `getCurrentTargetCount()` 读 DOM，而初始化时输入框还是模板里的 `value="1"`。`mergeConfig` 里 `previousTargetCount || savedConfig.targetCount` 因 1 是 truthy 而命中 1；`updateCountModeHints` 里还有第二处 `State.config.targetCount = getCurrentTargetCount()`，在「写回存档份数」之前执行，等于又把权威值打回 1 |
| 修法 | 只在 `preserveInputs` 为真（用户确实在操作面板）时才采信 DOM；份数以 `State.config.targetCount` 为权威，先把存档值写回输入框，再算「数量模式提示」 |
| 验证 | `tests/persist.test.js`：输入 37 → 刷新 → 输入框仍 37、存档仍 37；刷新后再触发一次保存仍是 37 |

## B2 · 清除本地数据后配置被写回（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 点「清除本地数据」提示已清除，但 `localStorage` 里立刻又有一份完整配置 |
| 根因 | 清除流程调 `refreshQuestions({preserveInputs:false})`，此时存档已删 → `shouldAutoRandomize` 判定「没有已有配置」→ 自动随机 → `saveConfig()` |
| 修法 | 刷新界面后再 `removeItem` 一次，让「清除」的语义真正回到「未配置状态」 |
| 验证 | `tests/persist.test.js`：清除后 `localStorage` 无该 key，面板仍存活，无未捕获异常 |

## B3 · 矩阵配额行号整体错位（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 10 行矩阵题里第 1、2 行共用同一行配额，最后一行永远用不到自己的配额 |
| 根因 | 问卷星的 `rowindex` 是 0 起（`Qw71Alf` / `desktop_page` / `mobile_page` 三份真实存档一致），旧实现做 `parsed > 0 ? parsed - 1 : parsed`，把 `0..9` 映射成 `0,0,1,…,8` |
| 修法 | 新增 `getMatrixRowIndexBase`，按整题最小 `rowindex` 判断 0 起或 1 起；`getMatrixQuotaRowIndex` 改为 `Math.floor(parsed) - offset` |
| 验证 | 单元第 14 节 6 项：0 起一一对应、1 起换算为 0 起、缺 `rowindex` 回退 DOM 序号、无数据行不崩 |

## B4 · 数字题生成值越界（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 「最大值10」的数字题生成 0–99999 的随机数，提交被判无效 |
| 根因 | 取值范围写在 `input` 的 `minword` / `maxword` 上（真实题 `verify='数字' minword='0' maxword='10'`），旧实现只读标准 `min` / `max`，取不到就退化成 0–99999 |
| 修法 | 新增 `readNumericBound`，按 `minword`/`maxword` 优先、`min`/`max` 兜底；`min > max` 时以 `min` 为准，保证 `randomInt` 区间合法 |
| 验证 | 单元第 12 节 6 项：500 次生成全部落在 `[0,10]` 且上界可达、标准属性兜底、边界写反不产生非法值 |

## B5 · 零权重选项仍被选中（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 多选题权重配成 `[0,0,0,100]`，要求选 2 项时零权重项照样被选中，用户配置完全失效 |
| 根因 | `pickMultipleIndices` 里 `Math.max(1, Number(weight) || 1)` 把 0 抬成 1 |
| 修法 | 只把负值/非数值归零，0 保持 0；每轮优先从正权重中抽，正权重不足以凑满最少选择数时才回落到零权重项（全零时均等随机） |
| 验证 | 单元第 13 节 4 项：选 1 项 2000 次全部命中唯一正权重项、选 2 项正权重始终在内、补齐数量精确不重复、全零不崩 |

## B6 · 完成页进度弹窗无样式（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 完成页上的进度弹窗贴在文档流里，`position: static`、背景透明 |
| 根因 | `.wjx-progress-modal` 定义在 `STYLE_TEXT` 里，但完成页走 `handleCompletion` 分支时 `injectStyles()` 还没执行，弹窗只剩 `injectProgressStyles` 补的那条状态文字样式 |
| 修法 | 把样式注入提到完成页判定之前，并给 `injectStyles` 加 `data-wjx-panel` 幂等保护（否则提前注入后会被重复调用） |
| 验证 | 探针实测弹窗恢复固定定位与背景；集成 / 生命周期套件无新增 `console.error` |

## B7 · 无 id/topic 的题永远填不上（2.0.1）

| 项 | 内容 |
|---|---|
| 现象 | 缺少 `id` / `topic` 的题目在面板里能看到，但自动化从不填写 |
| 根因 | 扫描时用序号兜底（`fallback:index+1`），填写与翻页签名用 `fallback:temp`，两处永不相等 → 配置匹配失败被静默跳过；多道这样的题还会把页面签名压成同一个值 |
| 修法 | `fallbackOrder === 0` 的临时查询改用「题目在页面中的稳定序号」，与 `scanQuestions` 的 `index + 1` 对齐 |
| 验证 | `tests/robustness.test.js`「题目缺失 id/topic」用例断言生成了 `fallback:1` 且无未捕获异常 |

---

## P1-1 · 身份证号被问卷星判「请输入正确的身份证号」

| 项 | 内容 |
|---|---|
| 现象 | 生成的身份证号提交被拒；用户自己的真实身份证号也被拒 |
| 根因 | ① 第 18 位是 GB 11643 加权校验码，生成器「前 17 位随机、末位随便写」，约 10/11 概率非法；② 填写时只派发 `input`/`change`，问卷星绑的是 `keyup blur click`，`verifyTxt` 与 `saveAnswer` 从未执行，真号也被判错 |
| 修法 | ① 实现 `computeIdCardChecksum`（权重 `[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]`，校验码 `1 0 X 9 8 7 6 5 4 3 2`）；年份限 1975–2003、日限 1–28；② `writeTextInput` 补齐 `focus`/`keyup`/`blur` |
| 验证 | 500 个生成号 500/500 通过从 `jqmobo2.js` 逐字复刻的 `checkIDCard`；集成测试断言 `checkIDCard(idVal) === true` |

**关键证据**：用问卷星自己的 `checkIDCard` 跑截图里的两个号码，两个都 FAIL；跑一个真实号码 PASS。**证明是本脚本生成器的问题，不是问卷星的问题。**

## P1-2 · 填空组（出生日期）报「请回答此题」

| 项 | 内容 |
|---|---|
| 现象 | 「出生日期：__年__月__日」三格都不填 |
| 根因 | 升级后配置里同时存在同题号的两条记录（旧 `unknown` + 新 `gapfill`）。`findConfigQuestionByTopicId` 只按题号 `find`，旧条目抢先命中 → 走到 `default` 分支 `return false` |
| 修法 | ① 同步时清理「同题号但题型已变」的历史条目；② 新增 `findConfigQuestionForNode(questionId, node)`，查找时同时比对页面实际题型 |
| 验证 | 集成测试 Q5 三格均非空 |

## P1-3 · 选项内嵌填空写不进答案表（0.1.19）

| 项 | 内容 |
|---|---|
| 现象 | 复合题「是，绝经的年龄为多少岁？」界面看着填上了，提交仍判「未作答」 |
| 根因 | 问卷星绑 `$("input.OtherRadioText").bind("blur keyup", ...)`：`keyup` 走 `otherTextEvent` 把值同步进选项对象，`blur` 才调 `saveAnswer`。脚本只派发 `input`/`change`，两条回调都没触发 |
| 修法 | `fillInlineOptionInput` 改为复用 `writeTextInput`，与填空题共用同一套事件序列 |
| 验证 | 集成测试三条断言（选中/写入/进入答案表）；**反向验证**：回退该行后立刻报 `inlineValue: null`，证明测试真能捕获此缺陷；连续 4 轮 26/26 稳定 |

## P1-4 · 11 位手机号被写进数字题（0.1.16）

| 项 | 内容 |
|---|---|
| 现象 | 度数题（11/12/13）填了 11 位随机数字，用户配置的候选被丢弃 |
| 根因 | 按 `input type` 猜格式。度数题 `verify='数字'` 但 `type='tel'`，被判成手机号 |
| 修法 | `detectTextRequirement` 以 `verify` 属性为准（数字/手机/身份证/邮箱/多级下拉），`type` 仅作兜底；候选内容先按格式过滤 |
| 验证 | Q31 断言「纯数字 且 长度 ≤5 且 非 11 位」 |

## P2-1 · `distributeRatiosToTotal` 合计不等于目标

| 项 | 内容 |
|---|---|
| 现象 | `(optionCount=5, total=1)` 返回的各项之和是 5 而非 1 |
| 根因 | `target` 被 `Math.max(count, ...)` 抬到 5，每项又被下限抬到 1 |
| 修法 | `target` 只保底到 0；不足项数时允许部分项为 0（此前"每项至少 1"的假设在 total < count 时不成立） |
| 验证 | 720 组不变量测试（1–8 项 × 0–40 合计 × 30 次随机）全部满足 `sum === total`、长度正确、无负值 |

## P2-2 · `distributeCountsEvenly` 零项返回 `[total]`

| 项 | 内容 |
|---|---|
| 现象 | `(0, 10)` 返回 `[10]` |
| 根因 | `Math.max(1, optionCount)` 把 0 项抬成 1 项 |
| 修法 | 项数为 0 直接返回 `[]` |
| 验证 | 同上不变量测试 |

## P2-3 · 配额回滚静默失败（0.1.19）

| 项 | 内容 |
|---|---|
| 现象 | `localStorage` 异常时份数可能凭空减少，无任何提示 |
| 根因 | `withQuotaRollback` 的读取与恢复都是空 `catch` |
| 修法 | 两处改 `logWarning`，保留 `try/finally` 结构（该结构本身是正确用法） |
| 验证 | 静态审计确认 44 处 try 中再无"既不上报也不降级"者 |

## P3 · 死代码与重复代码（0.1.19）

| 项 | 内容 |
|---|---|
| `optionTexts: {}` | 只声明从不读写，实际字段是 `optionFills`。已删 |
| `isNodeVisible` / `isElementVisible` | 两份逐字节相同的副本。合并为一份定义 + 别名，保持既有调用点可读性 |
| 2846 行两语句同行 | `const values = ...;            card.querySelectorAll(...)`。已拆行 |

## 修复原则自查

| 约束 | 落实情况 |
|---|---|
| 找根本原因，不绕过 | 4 个 P1 与 2.0.1 的 7 项均定位到具体代码行、真实存档属性或 WJX 前端脚本的具体绑定，无一处用「加延时重试」绕过 |
| 不为修一个问题引入新问题 | 每次修改后跑全量断言（2.0.1 起 186 项）；内嵌填空修复做了反向验证 |
| 保留现有可用功能 | 未删除任何功能；`optionTexts` 是死字段（零读取），删除不影响行为 |
| 不用大量 try-catch 掩盖错误 | 反而把唯一的静默 catch 改为上报 |
| 不用固定延时掩盖异步时序 | 关联题可见性复用既有 8 轮重扫机制，未新增任何 `setTimeout` |
