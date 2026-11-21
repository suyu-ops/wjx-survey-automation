// 纯逻辑单元测试：用 brace-matching 从源码抽取函数体，在 Node 中执行。
// 只测不依赖 DOM 的函数；依赖 DOM 的部分交给 integration.test.js（真实 Chrome）。
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '问卷星.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
}
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  ok(a === b, name, { actual, expected });
}

// 抽取顶层 function 定义
function pull(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('未找到函数: ' + name);
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (!depth) break; }
  }
  return SRC.slice(start, i + 1);
}
function pullConst(name) {
  const idx = SRC.indexOf(`const ${name} =`);
  if (idx < 0) throw new Error('未找到常量: ' + name);
  // 处理数组/对象字面量多行
  let i = SRC.indexOf('=', idx) + 1;
  let depth = 0, started = false;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '[' || c === '{' || c === '(') { depth++; started = true; }
    else if (c === ']' || c === '}' || c === ')') { depth--; }
    else if (c === ';' && started && depth === 0) break;
    else if (c === '\n' && !started) {
      // 简单字面量（正则/数字）
      const rest = SRC.slice(i + 1).trimStart();
      if (!/^[.[({]/.test(rest)) break;
    }
  }
  return SRC.slice(idx, i + 1);
}
function globalize(code) {
  return code.replace(/^(\s*)(async )?function (\w+)\(/, (m, ind, asy, nm) => `${ind}globalThis.${nm} = ${asy || ''}function ${nm}(`);
}

// ===== 加载被测函数 =====
const sandbox = {};
function load(...names) {
  for (const n of names) {
    const body = pull(n);
    // 把函数内引用的其他顶层函数也转为 global 调用
    eval(globalize(body));
  }
}
globalThis.randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// 常量
eval(pullConst('ID_CARD_WEIGHTS').replace('const ID_CARD_WEIGHTS', 'globalThis.ID_CARD_WEIGHTS'));
eval(pullConst('ID_CARD_CHECK_CODES').replace('const ID_CARD_CHECK_CODES', 'globalThis.ID_CARD_CHECK_CODES'));
eval(pullConst('SPEED_FACTORS').replace('const SPEED_FACTORS', 'globalThis.SPEED_FACTORS'));
eval(pullConst('PLACEHOLDER_OPTION_PATTERN').replace('const PLACEHOLDER_OPTION_PATTERN', 'globalThis.PLACEHOLDER_OPTION_PATTERN'));
eval(pullConst('TYPE_LABELS').replace('const TYPE_LABELS', 'globalThis.TYPE_LABELS'));
eval(pullConst('TEXT_REQUIREMENT_LABELS').replace('const TEXT_REQUIREMENT_LABELS', 'globalThis.TEXT_REQUIREMENT_LABELS'));
eval(pullConst('TEXT_REQUIREMENT_TAGS').replace('const TEXT_REQUIREMENT_TAGS', 'globalThis.TEXT_REQUIREMENT_TAGS'));

load('cleanText', 'clampScore', 'escapeHtml', 'trimOptionPrefix', 'dedupeTexts',
  'computeIdCardChecksum', 'isValidIdCard', 'isContentAllowedForRequirement',
  'generateValueForRequirement', 'suggestGapfillValue', 'randomInt',
  'pickWeightedIndex', 'pickMultipleIndices', 'distributeRatiosToTotal',
  'distributeCountsEvenly', 'fisherYatesShuffle', 'parseRelations',
  'normalizeDistributionMode', 'getQuestionTypeLabel', 'formatRequirementHint',
  'readNumericBound', 'getMatrixRowIndexBase', 'getMatrixQuotaRowIndex');

// 需要别名的
globalThis.isElementVisible = () => true;

console.log('===== 1. 文本清洗 =====');
eq(cleanText('  a\n\tb  '), 'a b', 'cleanText 折叠空白');
eq(cleanText(null), '', 'cleanText 处理 null');
eq(trimOptionPrefix('A. 选项一'), '选项一', 'trimOptionPrefix 去字母前缀');
eq(trimOptionPrefix('1、选项'), '选项', 'trimOptionPrefix 去数字前缀');
eq(trimOptionPrefix('选项一*'), '选项一', 'trimOptionPrefix 去尾部星号');
eq(trimOptionPrefix('（请填写）mL*'), '（请填写）mL', 'trimOptionPrefix 复合选项');
eq(dedupeTexts(['a', 'a', ' b ', 'b', '']), ['a', 'b'], 'dedupeTexts 去重去空');
eq(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;', 'escapeHtml 转义 XSS');

console.log('\n===== 2. 数值钳制 =====');
eq(clampScore(50, 1), 50, 'clampScore 正常值');
eq(clampScore(-5, 1), 0, 'clampScore 下界');
eq(clampScore(150, 1), 100, 'clampScore 上界');
eq(clampScore('abc', 42), 42, 'clampScore 非数字回退');
// 注意：Number(null) === 0，所以 clampScore(null, 7) 返回 0 而非 7。
// 这是既有语义（null 被当作 0 分），不改动，仅记录以避免误判为回归。
eq(clampScore(null, 7), 0, 'clampScore null 按 0 处理（既有语义）');
eq(clampScore(undefined, 7), 7, 'clampScore undefined 回退 fallback');

console.log('\n===== 3. 身份证 =====');
for (let i = 0; i < 200; i++) {
  const id = generateValueForRequirement('idcard', null);
  if (!isValidIdCard(id)) { ok(false, '生成的身份证应全部合法', id); break; }
}
ok(true, '生成 200 个身份证全部通过自身校验');
ok(!isValidIdCard('110101195309115197'), '校验位错误的号码被拒');
ok(isValidIdCard('11010519491231002X'), '合法号码通过');
ok(!isValidIdCard('11010119900307123456'), '19 位被拒');
ok(!isValidIdCard(''), '空串被拒');

console.log('\n===== 4. 校验类型过滤 =====');
ok(isContentAllowedForRequirement('12', 'number'), 'number 接受整数');
ok(isContentAllowedForRequirement('12.5', 'number'), 'number 接受小数');
ok(!isContentAllowedForRequirement('12a', 'number'), 'number 拒绝混合');
ok(isContentAllowedForRequirement('13800138000', 'phone'), 'phone 接受合法手机号');
ok(!isContentAllowedForRequirement('12345678901', 'phone'), 'phone 拒绝非法号段');
ok(isContentAllowedForRequirement('a@b.com', 'email'), 'email 接受');
ok(!isContentAllowedForRequirement('a@b', 'email'), 'email 拒绝无域名后缀');
ok(isContentAllowedForRequirement('任何文本', 'text'), 'text 全接受');

console.log('\n===== 5. 填空组取值 =====');
{
  let okYear = true, okMonth = true, okDay = true;
  for (let i = 0; i < 300; i++) {
    const y = Number(suggestGapfillValue('年'));
    const m = Number(suggestGapfillValue('月'));
    const d = Number(suggestGapfillValue('日'));
    if (!(y >= 1900 && y <= 2010)) okYear = false;
    if (!(m >= 1 && m <= 12)) okMonth = false;
    if (!(d >= 1 && d <= 31)) okDay = false;
  }
  ok(okYear, '年份在合理区间');
  ok(okMonth, '月份 1-12');
  ok(okDay, '日期 1-31');
}

console.log('\n===== 6. 权重抽取 =====');
{
  // 权重 [0,0,5] 必须只选到 index 2
  let allThird = true;
  for (let i = 0; i < 300; i++) {
    if (pickWeightedIndex([0, 0, 5]) !== 2) { allThird = false; break; }
  }
  ok(allThird, 'pickWeightedIndex 尊重零权重');
  ok(pickWeightedIndex([]) === 0, 'pickWeightedIndex 空数组返回 0');
  ok(pickWeightedIndex([0, 0, 0]) >= 0, 'pickWeightedIndex 全零不崩');
  ok(pickWeightedIndex(null) === 0, 'pickWeightedIndex null 不崩');
}
{
  // 多选：不能返回重复索引
  let dup = false, outOfRange = false;
  for (let i = 0; i < 300; i++) {
    const r = pickMultipleIndices([1, 1, 1, 1, 1], 1, 3);
    if (new Set(r).size !== r.length) dup = true;
    if (r.some((x) => x < 0 || x > 4)) outOfRange = true;
  }
  ok(!dup, 'pickMultipleIndices 无重复索引');
  ok(!outOfRange, 'pickMultipleIndices 索引在范围内');
  eq(pickMultipleIndices([], 1, 2), [], 'pickMultipleIndices 空数组');
  // min=max 时必须严格等于
  let exact = true;
  for (let i = 0; i < 100; i++) {
    if (pickMultipleIndices([1, 1, 1, 1], 2, 2).length !== 2) { exact = false; break; }
  }
  ok(exact, 'pickMultipleIndices min=max 时数量精确');
}

console.log('\n===== 7. 占比分配 =====');
{
  for (const total of [100, 50, 7, 1]) {
    const r = distributeRatiosToTotal(5, total);
    const sum = r.reduce((a, b) => a + b, 0);
    ok(sum === total, `distributeRatiosToTotal(5, ${total}) 合计等于 total`, { got: sum, r });
  }
  for (const n of [1, 2, 3, 10]) {
    const r = distributeCountsEvenly(n, 10);
    ok(r.length === n && r.reduce((a, b) => a + b, 0) === 10,
      `distributeCountsEvenly(${n}, 10) 正确`, r);
  }
  eq(distributeCountsEvenly(0, 10), [], 'distributeCountsEvenly 0 项');
}

console.log('\n===== 8. 关联题解析 =====');
eq(parseRelations({ getAttribute: () => '14,1' }), [{ topicId: '14', optionIndex: 1 }], 'parseRelations 单条');
eq(parseRelations({ getAttribute: () => '14,1;15,2' }),
  [{ topicId: '14', optionIndex: 1 }, { topicId: '15', optionIndex: 2 }], 'parseRelations 多条');
eq(parseRelations({ getAttribute: () => '' }), [], 'parseRelations 空');
eq(parseRelations({ getAttribute: () => '14' }), [], 'parseRelations 缺选项号');
eq(parseRelations({ getAttribute: () => '14,abc' }), [], 'parseRelations 非数字选项号');
eq(parseRelations({ getAttribute: () => null }), [], 'parseRelations null');

console.log('\n===== 9. 洗牌 =====');
{
  const src = [1, 2, 3, 4, 5];
  const out = fisherYatesShuffle(src);
  ok(out.length === 5 && JSON.stringify([...out].sort()) === JSON.stringify(src), 'shuffle 元素不丢');
  ok(JSON.stringify(src) === JSON.stringify([1, 2, 3, 4, 5]), 'shuffle 不修改原数组');
}

console.log('\n===== 10. 分布模式 =====');
eq(normalizeDistributionMode('count'), 'count', 'normalize count');
eq(normalizeDistributionMode('ratio'), 'ratio', 'normalize ratio');
eq(normalizeDistributionMode('垃圾'), 'ratio', 'normalize 非法值回退 ratio');
eq(normalizeDistributionMode(undefined), 'ratio', 'normalize undefined 回退');

console.log('\n===== 11. 题型标签 =====');
eq(getQuestionTypeLabel({ type: 'text', textRequirement: 'phone' }), '号码题', 'phone 标签');
eq(getQuestionTypeLabel({ type: 'text', textRequirement: 'number' }), '数字题', 'number 标签');
eq(getQuestionTypeLabel({ type: 'text', textRequirement: 'text' }), '填空题', 'text 标签');
eq(getQuestionTypeLabel({ type: 'gapfill' }), '填空组', 'gapfill 标签');
eq(getQuestionTypeLabel({ type: 'unknown' }), '未知题型', 'unknown 标签');
eq(getQuestionTypeLabel(null), '未知题型', 'null 不崩');

// ===== 以下为回归测试：每一项都对应一个已修复的真实缺陷 =====

console.log('\n===== 12. 数字题范围（minword/maxword） =====');
{
  // 真实题：verify='数字' minword='0' maxword='10'。
  // 旧实现只读 input.min / input.max，取不到就退化成 0~99999，几乎必定越界。
  const input = {
    getAttribute: (name) => {
      const attrs = { minword: '0', maxword: '10' };
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    }
  };
  let inRange = true, seenMax = false;
  for (let i = 0; i < 500; i++) {
    const v = Number(generateValueForRequirement('number', input));
    if (!(v >= 0 && v <= 10)) { inRange = false; break; }
    if (v === 10) seenMax = true;
  }
  ok(inRange, 'minword/maxword 约束下 500 次生成全部落在 [0,10]');
  ok(seenMax, '上界 10 可达（不是永远取不到边界）');
  eq(readNumericBound(input, ['maxword', 'max'], NaN), 10, 'readNumericBound 优先 maxword');
  eq(readNumericBound({ getAttribute: () => null }, ['maxword', 'max'], 7), 7, 'readNumericBound 全缺失时回退');
  // 标准 min/max 仍作为兜底
  const stdInput = {
    getAttribute: (name) => (name === 'max' ? '5' : name === 'min' ? '2' : null)
  };
  let stdOk = true;
  for (let i = 0; i < 300; i++) {
    const v = Number(generateValueForRequirement('number', stdInput));
    if (!(v >= 2 && v <= 5)) { stdOk = false; break; }
  }
  ok(stdOk, '无 minword/maxword 时用 min/max 兜底');
  // 边界写反不能产生非法区间
  const reversed = {
    getAttribute: (name) => (name === 'minword' ? '9' : name === 'maxword' ? '3' : null)
  };
  const rv = Number(generateValueForRequirement('number', reversed));
  ok(Number.isFinite(rv) && rv >= 3, 'min>max 时以 min 为准，不产生非法值', rv);
}

console.log('\n===== 13. 多选零权重 =====');
{
  // 旧实现 Math.max(1, w) 把 0 抬成 1，于是 [0,0,0,100] 选 1 项时
  // 零权重项也有 3/103 ≈ 3% 的概率被选中，用户配的 0 等于失效。
  let leaked = 0;
  for (let i = 0; i < 2000; i++) {
    const r = pickMultipleIndices([0, 0, 0, 100], 1, 1);
    if (r.length !== 1 || r[0] !== 3) leaked++;
  }
  eq(leaked, 0, '选 1 项时永远选唯一正权重项');
  // 多项时正权重项必须始终在内（不因零权重干扰而落空）
  let alwaysHasPositive = true;
  for (let i = 0; i < 500; i++) {
    const r = pickMultipleIndices([0, 0, 0, 100], 2, 2);
    if (!r.includes(3)) { alwaysHasPositive = false; break; }
  }
  ok(alwaysHasPositive, '选 2 项时正权重项始终在内');
  // 只有一项正权重但要求选 2 项：必须回落到零权重项补齐，且不重复
  let fillOk = true;
  for (let i = 0; i < 200; i++) {
    const r = pickMultipleIndices([0, 0, 0, 100], 2, 2);
    if (r.length !== 2 || new Set(r).size !== 2) { fillOk = false; break; }
  }
  ok(fillOk, '正权重不足时用零权重项补齐，数量仍精确且不重复');
  // 全零权重退化为均等随机，不应崩
  let allZeroOk = true;
  for (let i = 0; i < 200; i++) {
    const r = pickMultipleIndices([0, 0, 0, 0], 1, 2);
    if (!r.length || r.some((idx) => idx < 0 || idx > 3)) { allZeroOk = false; break; }
  }
  ok(allZeroOk, '全零权重均等回退，不崩且索引合法');
}

console.log('\n===== 14. 矩阵配额行号 =====');
{
  const mkRow = (rowindex) => ({ getAttribute: (name) => (name === 'rowindex' ? rowindex : null) });
  // 真实存档（Qw71Alf / desktop_page / mobile_page）里 rowindex 都是 0 起。
  // 旧实现做 parsed > 0 ? parsed - 1 : parsed，把 0..9 映射成 0,0,1,2,...,8，
  // 导致第 1、2 行共用配额行 0，最后一行永远用不到自己的配额。
  const zeroBased = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(mkRow);
  eq(getMatrixRowIndexBase(zeroBased), 0, '0 起页面识别为 base=0');
  const mapped0 = zeroBased.map((row, i) => getMatrixQuotaRowIndex(row, i, 0));
  eq(mapped0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], '0 起页面行号与原值一一对应');
  // 若某版本是 1 起，按整题基准换算不应错位
  const oneBased = [1, 2, 3].map(mkRow);
  eq(getMatrixRowIndexBase(oneBased), 1, '1 起页面识别为 base=1');
  eq(oneBased.map((row, i) => getMatrixQuotaRowIndex(row, i, 1)), [0, 1, 2], '1 起页面换算为 0 起配额行');
  // 缺 rowindex 时用 DOM 序号兜底
  eq(getMatrixQuotaRowIndex(mkRow(null), 4, 0), 4, '缺 rowindex 时回退 DOM 序号');
  eq(getMatrixRowIndexBase([]), 0, '无数据行时 base 为 0，不崩');
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) {
  console.log('\n失败项:');
  failures.forEach((f) => console.log('  ' + f));
}
process.exit(fail ? 1 : 0);
