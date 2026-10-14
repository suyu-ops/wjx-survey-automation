// ==UserScript==
// @name         问卷星答题配置助手（增强版）
// @namespace    https://wjx.panel.local
// @version      0.1.15
// @description  问卷星填写辅助工具：识别常见题型，按比例或次数配置选项，支持评分星级、关联题、多页填写、预览、配置导入导出和失败恢复。自动批量提交可能触发网站风控，请仅在获得授权的问卷中使用。
// @updateLog 0.1.15 - 新增占比题（type=12）支持：此前该题型被兜底识别成填空题，填充词库文本导致提交被拦；现在按行的 issum 输入框精确识别、读出题目 total 作为合计目标、按权重分配并补齐取整误差后写入，同时同步滑块视觉位置，面板显示「占比题 / N 个占比项，合计 100」，题型筛选新增占比题。同时修复带封面页的问卷「多一步进入」：封面入口 #slideChunk 不是 a/button，此前不在可见按钮候选里，导致预览/自动化报「未识别到题目页或开始按钮」；现在优先识别并点击封面入口再等题目页出现。
// @updateLog 0.1.14 - 风控识别与自我保护：连续多次未通过人机验证时不再空撞，自动暂停并提示「疑似设备/IP 被风控、建议换网络」，避免把风控等级撞高；「设计份数」输入框下方新增份数建议提示，超过 100 份时用醒目样式提醒分批执行；「清除本地数据」按钮扩展为同时清理问卷星的作答残留（wjxanswerdata 等）与设备标识 Cookie（uuuvid / _c_WBKFRo / jac* / SERVERID），并在提示中给出换网络与冷却引导。
// @updateLog 0.1.13 - 修复手机版（v.wjx.cn）矩阵题填不上：手机版矩阵数据行没有标题列，旧逻辑无条件跳过首列并依赖「行文本非空」判定数据行，导致 6 行全部被跳过、表头行反被当成数据行点击，提交时提示「请回答此题」；现在按 tr[rowindex] 精确取数据行、排除表头/分组行，并按是否存在标题列决定是否跳过首列。同时缓解快速档提交被拦：快速档压缩系数由 0.68 放宽到 0.85，并为快速档加上操作与提交前等待的绝对下限。
// @updateLog 0.1.12 - 修复排序题（type=11）间歇性漏填：预览填写入口未复位上一轮自动化留下的停止标志，导致 fillSorting 按 isAutomationInterrupted 提前退出而静默跳过；现在预览入口会重置该标志，且排序题的逐项中断判断只在本题执行期间新出现的中断才收手。
// @updateLog 0.1.11 - 修复排序题适配代码语法问题，并补充原生排序回调兜底，确保填写状态能同步到问卷星内部答案。
// @updateLog 0.1.10 - 修复部分页面点击事件未响应：增加 li 原生点击、jQuery 点击和排序状态兜底，确保预览填写时显示排序编号。
// @updateLog 0.1.9 - 完善排序题校验与兼容：识别问卷星 sortnum 状态、清理残留排序、兼容原生和自定义排序列表，并更新排序题配置提示。
// @updateLog 0.1.8 - 修复排序题（type=11）填写失效：改为按问卷星真实点击协议逐项选中，点击顺序即排序位，遵循 minvalue/maxvalue 配额，填写前清理上一份残留的排序状态。
// @updateLog 0.1.7 - 新增星夜题库资源入口与 QQ 群反馈入口；所有外链均需用户主动点击打开，不传递问卷内容或本地配置。
// @updateLog 0.1.6 - 清理死代码：移除 fillMatrix 未使用的 weights 形参及其冗余实参；删除从未调用的 handleAliyunCaptchaCheckbox 函数（其能力已由 handleVerification 的轮询逻辑覆盖）。
// @updateLog 0.1.5 - 修复 19 个 bug：进度弹窗按钮泄漏（排除进度弹窗和 toast）；自动化启动防重入守卫；findQuestionNodes 缓存 TTL 从 16µs 恢复为 16ms；数量模式 checkbox 随机分配考虑最少选择数；fillLocation 选项查找兜底到 body；fillSorting 实现真实排序；fillMatrix 零行不再误判成功；pageSignature 捕获时机后移；pickRandomText 死代码移除；DOM 变化主动失效节点缓存；CSS 修复等。
// @updateLog 0.1.4 - 优化：添加 clearUsedTextAnswers 清理文本答案缓存；MutationObserver 添加 try/catch 保护；scheduleRescan 错误容错增强。
// @updateLog 0.1.3 - 修复：完成页会话旁路收紧为同 host 校验；failed 计数仅在用户跳过时累加；saveQuotaState 加 try/catch；fillToSubmit 防重入；triggerNativeNextPage 去 eval；多输入填空题按索引错开取值；checkbox 全零权重校验拦截；findQuestionNodes 加 16ms 缓存降低关联题扫描开销。
// @updateLog 0.1.2 - 修复：填空题多输入按字段类型生成内容；配额耗尽显式失败；地区题限定激活弹层；滑块验证按弹层消失判定成功。
// @updateLog 0.1.1 - 新增：配置导入导出功能；面板拖拽记忆位置；题目搜索和题型筛选；矩阵题、地区题、排序题支持；速度配置（慢速/正常/快速）；预览填写/高亮/填写到提交；自动化会话暂停/继续/跳过/停止。
// @updateLog 0.1.0 - 初始发布：基于原版二次开发，重构 UI 为可视化面板，支持比例/数量双模式，关联题联动，多页自动翻页循环提交，滑块验证模拟。
// @original-author x7R2p9、yangwenren
// @original-license MIT
// @original-script https://scriptcat.org/zh-CN/script-show-page/6321
// @original-script https://greasyfork.org/zh-CN/scripts/569375-%E9%80%9F%E6%98%9F-%E9%97%AE%E5%8D%B7%E6%98%9F%E8%87%AA%E5%8A%A8%E7%AD%94%E9%A2%98%E5%8A%A9%E6%89%8B-%E5%8F%AF%E8%A7%86%E5%8C%96%E6%AF%94%E4%BE%8B%E9%85%8D%E7%BD%AE-%E7%A0%B4%E8%A7%A3%E5%A4%8D%E5%88%B6%E9%99%90%E5%88%B6-%E6%89%B9%E9%87%8F%E5%BE%AA%E7%8E%AF%E6%8F%90%E4%BA%A4-%E8%BE%85%E5%8A%A9%E7%BB%95%E8%BF%87%E9%AA%8C%E8%AF%81
// @match        https://*.wjx.top/*
// @match        https://*.wjx.cn/*
// @match        https://*.wjx.com/*
// @grant        none
// @run-at       document-end
// @license      MIT
// @tag          问卷星
// @tag          自动填写
// @tag          配置工具
// @tag          批量提交
// @antifeature  自动批量提交
// @antifeature  生成式随机答案可能造成低质量或重复回答
// ==/UserScript==

(function() {
    'use strict';

    const PANEL_ID = 'wjx-commercial-panel';
    const STORAGE_PREFIX = 'WJX_CN_PANEL_';
    const REMAINING_COUNT_KEY = 'WJX_REMAINING_COUNT';
    const TOTAL_COUNT_KEY = 'WJX_TOTAL_COUNT';
    const SURVEY_URL_KEY = 'WJX_SURVEY_URL';
    const PANEL_COLLAPSED_KEY = 'WJX_PANEL_COLLAPSED_BEFORE_AUTOMATION';
    const QUOTA_STATE_KEY = 'WJX_COUNT_QUOTA_STATE';
    const AUTOMATION_STOPPED_KEY = 'WJX_AUTOMATION_STOPPED';
    const CONFIG_EXPORT_VERSION = 2;
    // 连续多少次「提交后未通过人机验证」就判定为设备/IP 已被风控并自动暂停。
    // 问卷星与阿里云验证码的风控判定在服务端，脚本无法绕过，只能尽早收手避免把风控等级撞高。
    const RISK_CONTROL_VERIFY_FAILURE_LIMIT = 2;
    const RISK_CONTROL_PAUSE_MESSAGE = '连续多次未通过人机验证，疑似当前网络环境已被问卷星风控；已自动暂停。建议更换网络（换出口 IP）后点「继续」，或等待数小时冷却后再试。';
    // 问卷星作答残留与设备标识（清缓存治不了根，但换环境后能少一点脏状态）。
    // 注意 acw_tc 等由 WAF 下发的 HttpOnly Cookie 无法从页面脚本清除，只能靠换网络绕开。
    const SURVEY_DEVICE_COOKIE_PATTERNS = [
        /^uuuvid$/i,
        /^_c_WBKFRo$/i,
        /^jac\d+$/i,
        /^SERVERID$/i,
        /^ASPXANONYMOUS$/i
    ];
    const SURVEY_RESIDUE_STORAGE_KEYS = [
        'wjxanswerdata',
        'wjxgguid',
        'wjxsa',
        'wjxea',
        'wjxge',
        'wjxed',
        'wjxeduloc',
        'wjxct'
    ];
    const MAX_AUTO_PAGES = 80;
    const PLACEHOLDER_OPTION_PATTERN = /请选择|请选择项|请选取|please\s*select/i;
    const QUESTION_NODE_SELECTORS = [
        '.field.ui-field-contain',
        '.div_question',
        '.div_table_radio_question',
        '.ui-field-contain'
    ];
    const DEFAULT_TEXT_LIBRARY = [
        '很好', '满意', '支持', '体验不错', '整体不错',
        '符合预期', '使用方便', '界面友好', '响应及时',
        '比较顺畅', '总体可以', '没什么问题', '值得推荐',
        '功能齐全', '运行稳定', '体验良好', '界面清晰',
        '操作简单', '服务周到', '效果不错'
    ];

    function logWarning(label, error) {
        try {
            console.warn(`[问卷星助手] ${label}:`, error);
        } catch (e) {}
    }
    const TYPE_LABELS = {
        radio: '单选题',
        checkbox: '多选题',
        dropdown: '下拉题',
        text: '填空题',
        rating: '评分题',
        matrix: '矩阵题',
        slide: '滑块题',
        location: '地区题',
        sorting: '排序题',
        proportion: '占比题',
        unknown: '未知题型'
    };

    const State = {
        surveyKey: '',
        config: {
            targetCount: 1,
            distributionMode: 'ratio',
            speedProfile: 'normal',
            questions: []
        }
    };

    const STYLE_TEXT = `
        :root {
            --wjx-bg: #f5f9ff;
            --wjx-surface: #ffffff;
            --wjx-surface-strong: #ffffff;
            --wjx-primary: #0064ff;
            --wjx-primary-deep: #0052d9;
            --wjx-primary-soft: #edf4ff;
            --wjx-line: #d7e6ff;
            --wjx-text: #1f2d3d;
            --wjx-subtle: #5f6f82;
            --wjx-shadow: 0 10px 28px rgba(23, 80, 179, 0.10);
        }
        #${PANEL_ID} {
            position: fixed;
            top: 16px;
            right: 16px;
            width: 402px;
            min-width: 320px;
            max-width: min(560px, calc(100vw - 32px));
            max-height: calc(100vh - 32px);
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-radius: 10px;
            border: 1px solid var(--wjx-line);
            background: var(--wjx-surface);
            color: var(--wjx-text);
            box-shadow: var(--wjx-shadow);
            font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
        }
        #${PANEL_ID}.is-collapsed {
            width: 240px;
        }
        #${PANEL_ID}.is-automation-hidden {
            display: none !important;
        }
        .wjx-head {
            padding: 16px;
            background: linear-gradient(180deg, #f8fbff, #edf4ff);
            color: var(--wjx-text);
            border-bottom: 1px solid var(--wjx-line);
            border-top: 3px solid var(--wjx-primary);
        }
        .wjx-head-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }
        .wjx-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 0;
        }
        .wjx-author {
            margin-top: 4px;
            font-size: 12px;
            font-weight: 700;
            color: var(--wjx-subtle);
        }
        .wjx-toggle {
            border: 1px solid #b9d2ff;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 700;
            color: var(--wjx-primary-deep);
            background: #ffffff;
            cursor: pointer;
            flex-shrink: 0;
        }
        #${PANEL_ID} .wjx-head-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        #${PANEL_ID} .wjx-feedback-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 30px;
            padding: 0 9px;
            box-sizing: border-box;
            border-radius: 6px;
            color: #ffffff;
            background: linear-gradient(135deg, #12b7f5, #1286e8);
            box-shadow: 0 4px 10px -5px rgba(18, 134, 232, 0.75);
            text-decoration: none;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            transition: filter 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        }
        #${PANEL_ID} .wjx-feedback-link:hover {
            color: #ffffff;
            filter: brightness(1.08);
            transform: translateY(-1px);
            box-shadow: 0 7px 14px -6px rgba(18, 134, 232, 0.85);
        }
        #${PANEL_ID} .wjx-feedback-link:focus-visible {
            outline: 3px solid rgba(18, 134, 232, 0.25);
            outline-offset: 2px;
        }
        .wjx-body {
            padding: 16px;
            overflow-y: auto;
            background: var(--wjx-bg);
        }
        .wjx-section {
            margin-bottom: 14px;
            padding: 14px;
            border-radius: 8px;
            background: var(--wjx-surface);
            border: 1px solid var(--wjx-line);
        }
        .wjx-section-title {
            margin: 0 0 10px;
            font-size: 13px;
            font-weight: 700;
            color: var(--wjx-primary-deep);
        }
        .wjx-metrics {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        .wjx-metric {
            padding: 12px;
            border-radius: 8px;
            background: var(--wjx-surface-strong);
            border: 1px solid var(--wjx-line);
        }
        .wjx-metric span {
            display: block;
        }
        .wjx-metric-label {
            font-size: 11px;
            color: var(--wjx-subtle);
            margin-bottom: 4px;
        }
        .wjx-metric-value {
            font-size: 18px;
            font-weight: 800;
        }
        #${PANEL_ID} .wjx-tiku-promo {
            margin: 0 0 14px;
            padding: 10px;
            border: 1px solid rgba(14, 165, 233, 0.30);
            border-radius: 9px;
            background: linear-gradient(135deg, rgba(14, 165, 233, 0.09), rgba(16, 185, 129, 0.08));
            box-shadow: 0 7px 18px -14px rgba(14, 116, 144, 0.52);
        }
        #${PANEL_ID} .wjx-tiku-promo-top {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }
        #${PANEL_ID} .wjx-tiku-promo-icon {
            display: grid;
            flex: 0 0 30px;
            width: 30px;
            height: 30px;
            place-items: center;
            border-radius: 9px;
            color: #0284c7;
            background: #ffffff;
            box-shadow: 0 5px 11px -8px rgba(2, 132, 199, 0.65);
            font-size: 16px;
        }
        #${PANEL_ID} .wjx-tiku-promo-copy {
            display: flex;
            flex: 1;
            flex-direction: column;
            min-width: 0;
            gap: 1px;
        }
        #${PANEL_ID} .wjx-tiku-promo-copy strong {
            color: #0369a1;
            font-size: 12.5px;
            font-weight: 800;
            line-height: 1.3;
        }
        #${PANEL_ID} .wjx-tiku-promo-copy small {
            color: #52708a;
            font-size: 10.5px;
            font-weight: 600;
            line-height: 1.4;
        }
        #${PANEL_ID} .wjx-tiku-promo-actions {
            display: flex;
            gap: 7px;
            margin-top: 9px;
        }
        #${PANEL_ID} .wjx-tiku-promo-link {
            display: inline-flex;
            flex: 1;
            align-items: center;
            justify-content: center;
            min-height: 29px;
            padding: 0 8px;
            border: 1px solid rgba(2, 132, 199, 0.52);
            border-radius: 7px;
            color: #0369a1;
            background: rgba(255, 255, 255, 0.72);
            text-decoration: none;
            font-size: 10.5px;
            font-weight: 800;
            line-height: 1;
            transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        }
        #${PANEL_ID} .wjx-tiku-promo-link:hover {
            border-color: #0284c7;
            color: #ffffff;
            background: #0284c7;
            box-shadow: 0 7px 14px -8px rgba(2, 132, 199, 0.68);
            transform: translateY(-1px);
        }
        #${PANEL_ID} .wjx-tiku-promo-link:focus-visible {
            outline: 3px solid rgba(14, 165, 233, 0.24);
            outline-offset: 2px;
        }
        .wjx-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 10px;
        }
        .wjx-field label {
            font-size: 12px;
            font-weight: 700;
        }
        .wjx-input,
        .wjx-textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #c9dbff;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 13px;
            color: var(--wjx-text);
            background: #ffffff;
            outline: none;
        }
        .wjx-input:focus,
        .wjx-textarea:focus {
            border-color: #7fb0ff;
            box-shadow: 0 0 0 3px rgba(0,100,255,0.10);
        }
        .wjx-textarea {
            min-height: 88px;
            resize: vertical;
            line-height: 1.5;
        }
        .wjx-mode-switch {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .wjx-mode-btn {
            min-height: 36px;
            border-radius: 6px;
            padding: 0 10px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            color: var(--wjx-text);
            background: #ffffff;
            border: 1px solid #c9dbff;
        }
        .wjx-mode-btn.is-active {
            color: #ffffff;
            background: var(--wjx-primary);
            border-color: var(--wjx-primary);
        }
        .wjx-mode-hint {
            margin: 0 0 10px;
            font-size: 11px;
            line-height: 1.5;
            color: var(--wjx-subtle);
        }
        .wjx-count-hint {
            margin: 6px 0 0;
            font-size: 11px;
            line-height: 1.5;
            color: var(--wjx-subtle);
        }
        .wjx-count-hint.is-warning {
            color: #d4380d;
            font-weight: 700;
        }
        .wjx-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .wjx-btn {
            min-height: 40px;
            border-radius: 6px;
            padding: 0 12px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }
        .wjx-btn:hover {
            filter: none;
        }
        .wjx-btn-primary {
            color: #ffffff;
            background: var(--wjx-primary);
            border: 1px solid var(--wjx-primary);
        }
        .wjx-btn-secondary {
            color: var(--wjx-text);
            background: #ffffff;
            border: 1px solid #c9dbff;
        }
        .wjx-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .wjx-card {
            padding: 14px;
            border-radius: 8px;
            background: var(--wjx-surface-strong);
            border: 1px solid var(--wjx-line);
        }
        .wjx-card-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 8px;
        }
        .wjx-card-title {
            font-size: 13px;
            font-weight: 800;
            line-height: 1.5;
        }
        .wjx-card-type {
            flex-shrink: 0;
            padding: 5px 9px;
            border-radius: 6px;
            background: var(--wjx-primary-soft);
            color: var(--wjx-primary-deep);
            font-size: 11px;
            font-weight: 700;
            border: 1px solid #cfe0ff;
        }
        .wjx-card-meta {
            margin-bottom: 10px;
            color: var(--wjx-subtle);
            font-size: 11px;
            line-height: 1.45;
        }
        .wjx-count-hint {
            margin: 0 0 8px;
            font-size: 12px;
            font-weight: 700;
            color: var(--wjx-primary-deep);
            line-height: 1.45;
        }
        .wjx-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        .wjx-grid-item {
            padding: 8px;
            border-radius: 6px;
            background: #f7fbff;
            border: 1px solid #deebff;
        }
        .wjx-grid-item span {
            display: block;
            margin-bottom: 6px;
            font-size: 11px;
            color: var(--wjx-subtle);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .wjx-grid-item input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #c9dbff;
            border-radius: 6px;
            padding: 8px 10px;
            font-size: 13px;
            background: #ffffff;
        }
        .wjx-tools {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .wjx-toolbar {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 132px;
            gap: 8px;
            margin-bottom: 10px;
        }
        .wjx-save-status {
            min-height: 18px;
            margin-top: 8px;
            font-size: 11px;
            color: var(--wjx-subtle);
        }
        .wjx-save-status.is-saved { color: #17864b; }
        .wjx-save-status.is-error { color: #d4380d; }
        .wjx-weight-bar-wrap {
            height: 4px;
            margin-top: 6px;
            overflow: hidden;
            background: #e8f1ff;
            border-radius: 2px;
        }
        .wjx-weight-bar {
            width: 0;
            height: 100%;
            background: var(--wjx-primary);
            transition: width 0.18s ease;
        }
        .wjx-weight-summary {
            margin-top: 8px;
            font-size: 11px;
            color: var(--wjx-subtle);
        }
        .wjx-card.is-disabled { opacity: 0.58; }
        .wjx-card.is-filtered { display: none; }
        .wjx-card-error { border-color: #ff9c9c; }
        .wjx-preview-highlight {
            outline: 3px solid #ffb020 !important;
            outline-offset: 3px;
            background-color: rgba(255, 176, 32, 0.08) !important;
        }
        .wjx-progress-actions {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-top: 12px;
        }
        .wjx-progress-pause,
        .wjx-progress-skip {
            min-height: 34px;
            padding: 0 12px;
            border-radius: 6px;
            border: 1px solid #b9d2ff;
            background: #f5f9ff;
            color: var(--wjx-primary-deep);
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }
        .wjx-chip {
            border: 1px solid #cfe0ff;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 11px;
            font-weight: 700;
            color: var(--wjx-primary-deep);
            background: var(--wjx-primary-soft);
            cursor: pointer;
        }
        .wjx-empty {
            text-align: center;
            padding: 24px 16px;
            color: var(--wjx-subtle);
            line-height: 1.7;
        }
        .wjx-toast {
            position: fixed;
            right: 24px;
            bottom: 24px;
            z-index: 2147483647;
            max-width: 320px;
            padding: 12px 14px;
            border-radius: 8px;
            color: #ffffff;
            background: rgba(0, 82, 217, 0.94);
            box-shadow: 0 12px 28px rgba(0, 82, 217, 0.20);
            font-size: 13px;
            line-height: 1.5;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.18s ease, transform 0.18s ease;
            pointer-events: none;
        }
        .wjx-toast.is-actionable {
            max-width: 300px;
            padding: 10px 12px;
            font-size: 12px;
            line-height: 1.6;
            background: rgba(19, 50, 104, 0.96);
            box-shadow: 0 10px 24px rgba(19, 50, 104, 0.18);
            pointer-events: auto;
            cursor: pointer;
        }
        .wjx-toast .wjx-toast-link {
            color: #ffd36b;
            font-weight: 700;
        }
        .wjx-toast.is-visible {
            opacity: 1;
            transform: translateY(0);
        }
        .wjx-progress-modal {
            position: fixed;
            top: 16px;
            left: 50%;
            z-index: 2147483647;
            min-width: 240px;
            padding: 14px 18px;
            border-radius: 10px;
            border: 1px solid #b9d2ff;
            background: rgba(255, 255, 255, 0.98);
            color: var(--wjx-text);
            box-shadow: 0 12px 32px rgba(0, 82, 217, 0.18);
            font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
            text-align: center;
            opacity: 0;
            transform: translate(-50%, -8px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: none;
        }
        .wjx-progress-modal.is-visible {
            opacity: 1;
            transform: translate(-50%, 0);
            pointer-events: auto;
        }
        .wjx-progress-title {
            margin: 0 0 8px;
            font-size: 13px;
            font-weight: 700;
            color: var(--wjx-primary-deep);
        }
        .wjx-progress-count {
            margin: 0 0 10px;
            font-size: 16px;
            font-weight: 800;
            color: var(--wjx-text);
        }
        .wjx-progress-bar-wrap {
            height: 8px;
            margin-bottom: 8px;
            border-radius: 999px;
            background: #e8f1ff;
            overflow: hidden;
        }
        .wjx-progress-bar {
            height: 100%;
            width: 0;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--wjx-primary), #3d8bff);
            transition: width 0.25s ease;
        }
        .wjx-progress-percent {
            margin: 0;
            font-size: 12px;
            font-weight: 700;
            color: var(--wjx-subtle);
        }
        .wjx-progress-stop {
            margin-top: 12px;
            min-height: 34px;
            padding: 0 16px;
            border-radius: 6px;
            border: 1px solid #ffb4b4;
            background: #fff5f5;
            color: #d4380d;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }
        .wjx-progress-stop:hover {
            background: #ffece8;
        }
        .wjx-hidden {
            display: none;
        }
        .wjx-file-input {
            display: none;
        }
        @media (max-width: 640px) {
            #${PANEL_ID} {
                top: auto;
                right: 10px;
                left: 10px;
                bottom: 10px;
                width: auto;
                min-width: 0;
                max-width: none;
                max-height: 82vh;
            }
            .wjx-metrics,
            .wjx-actions,
            .wjx-grid,
            .wjx-toolbar {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }
    `;

    function init() {
        // 破解右键、选择和复制限制
        try {
            document.oncontextmenu = () => true;
            document.onselectstart = () => true;
            document.oncopy = () => true;
            document.onpaste = () => true;
            if (window.$ && window.$.fn) {
                $('body').css('user-select', 'text');
            }
        } catch (e) {
            logWarning('解除复制限制失败', e);
        }

        State.surveyKey = createSurveyKey();

        if (isCompletionPage()) {
            handleCompletion();
            return;
        }

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        injectStyles();
        renderPanel();
        refreshQuestions({ silent: true, preserveInputs: false });
        updateAllRelationVisibility();
        scheduleRescan();

        checkAndContinueAutomation();
    }

    function isCompletionPage() {
        // 完成页判定：优先看 URL 特征，再兜底检测页面上的成功标志元素
        if (/complete\w*\.aspx|join\/complete|\/done|result\.aspx|wjx.*\/(done|finish|thank)/i.test(location.href)) {
            return true;
        }
        // 关键排除：若页面上仍存在可填写的题目节点，则一定不是完成页。
        // 否则问卷填首页会因 title 残留（如“已完成/结束”）或 DOM 残留（.success-tip 等）
        // 被误判为完成页，导致多份续跑时 handleCompletion 反复把 remaining 减一却不真正填写，
        // 表现为“填了一份就不动了”。
        if (findQuestionNodes().some((node) => isNodeVisible(node))) {
            return false;
        }
        // title 兜底去掉过于宽泛的“结束|已完成”——它们极易在填写页命中；
        // 保留明确表示提交成功的措辞。
        if (/感谢您的参与|提交成功|谢谢您的填写|问卷已结束/.test(document.title || '')) {
            return true;
        }
        return !!document.querySelector('#QEnd, .QEnd, .endtext, .div_end, .success-tip');
    }

    function loadAutomationSession() {
        try {
            const raw = localStorage.getItem(REMAINING_COUNT_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            // 会话键全局共享（不按问卷隔离）：完成页 pathname 与问卷页不同，
            // 按问卷隔离会让完成页读不到问卷页写入的会话，导致续跑断链。
            // 这里用两层校验降低跨问卷串扰：
            //   1. 普通题目页：surveyKey 必须严格匹配。
            //   2. 完成页：surveyKey 必然不同（pathname 变了），退而要求 session.url
            //      与当前页同 host，至少堵住跨域名（wjx.cn / wjx.top / wjx.com）串扰。
            if (parsed.surveyKey && State.surveyKey && parsed.surveyKey !== State.surveyKey) {
                if (!isCompletionPage()) {
                    return null;
                }
                const sessionHost = parseHostFromUrl(parsed.url);
                if (sessionHost && sessionHost !== location.host) {
                    return null;
                }
            }
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function parseHostFromUrl(url) {
        try {
            return new URL(String(url || ''), location.href).host;
        } catch (error) {
            return '';
        }
    }

    function saveAutomationSession(session) {
        try {
            localStorage.setItem(REMAINING_COUNT_KEY, JSON.stringify(session));
            if (session && session.url) {
                localStorage.setItem(SURVEY_URL_KEY, session.url);
            }
        } catch (error) {
            logWarning('保存自动化会话失败', error);
        }
    }

    function scheduleNextSubmissionRedirect(session) {
        const url = session && (session.url || localStorage.getItem(SURVEY_URL_KEY));
        if (!url) {
            endAutomationSession('缺失问卷地址，无法续跑下一份');
            return false;
        }
        clearTimeout(automationRedirectTimer);
        automationRedirectTimer = setTimeout(() => {
            automationRedirectTimer = null;
            if (!isAutomationStillActive()) {
                return;
            }
            location.href = url;
        }, 2000);
        return true;
    }

    function handleCompletion() {
        // 用户已停止：即使到达完成页也不要再减份数/跳转续跑
        if (isAutomationAborted()) {
            clearAutomationStorage();
            return;
        }
        if (isAutomationPaused()) {
            showAutomationProgress();
            return;
        }
        const session = loadAutomationSession();
        if (!session) {
            return;
        }
        let remaining = Math.max(0, Number(session.remaining) || 0);
        if (session.completionHandled) {
            if (remaining > 0) {
                hidePanelForAutomation();
                showAutomationProgress();
                scheduleNextSubmissionRedirect(session);
            }
            return;
        }
        if (remaining > 0) {
            remaining -= 1;
            session.remaining = remaining;
            session.retryCount = 0;
            session.verifyFailures = 0;
            session.lastError = '';
            session.attemptQuotaSnapshot = null;
            session.completionHandled = true;
            saveAutomationSession(session);

            if (remaining > 0) {
                ensureTotalCountForAutomation();
                hidePanelForAutomation();
                showAutomationProgress();
                scheduleNextSubmissionRedirect(session);
            } else {
                endAutomationSession('所有自动化提交任务已完成！');
            }
            updateAutomationProgress();
        }
    }

    function checkAndContinueAutomation() {
        // 跨页面持久化的停止标志：用户上次点过“停止提交”，
        // 即便完成页→首页的 location.href 跳转把内存标志清零，这里仍能拦住续跑。
        if (isAutomationAborted()) {
            return;
        }
        const session = loadAutomationSession();
        if (session && session.skipping) {
            session.skipping = false;
            saveAutomationSession(session);
        }
        if (session && session.paused) {
            hidePanelForAutomation();
            showAutomationProgress();
            return;
        }
        const remaining = session ? Math.max(0, Number(session.remaining) || 0) : 0;
        if (remaining > 0) {
            if (session.completionHandled) {
                session.completionHandled = false;
                saveAutomationSession(session);
            }
            ensureTotalCountForAutomation();
            ensureQuotaState();
            // 双重保险：定时器触发前再确认一次未被停止
            beginAutomationSession();
            setTimeout(() => {
                if (isAutomationInterrupted()) {
                    return;
                }
                executeAutoFillAndSubmit();
            }, 2000);
        }
    }

    function createSurveyKey() {
        return STORAGE_PREFIX + `${location.host}${location.pathname}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = STYLE_TEXT;
        document.head.appendChild(style);
    }

    function renderPanel() {
        const panel = document.createElement('aside');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="wjx-head">
                <div class="wjx-head-top">
                    <div>
                        <h2 class="wjx-title">问卷星配置面板</h2>
                    </div>
                    <div class="wjx-head-actions">
                        <a class="wjx-feedback-link"
                           href="https://qm.qq.com/cgi-bin/qm/qr?k=576pg6G95bKB3A1nGXaUo3pY_xYdeBEW&amp;jump_from=webapi&amp;authKey=VEDKaRZobYLzHSWu87P/RqGVH6E7FiPrCfcNpkBURCDt3TbVCWJ8mUZ3yh3obWIa"
                           target="_blank" rel="noopener noreferrer" title="加入 QQ 群反馈问题">QQ群反馈</a>
                        <button type="button" class="wjx-toggle" id="wjx-toggle-panel">收起</button>
                    </div>
                </div>
            </div>
            <div class="wjx-body" id="wjx-panel-body">
                <section class="wjx-section">
                    <div class="wjx-metrics">
                        <div class="wjx-metric">
                            <span class="wjx-metric-label">识别题目</span>
                            <span class="wjx-metric-value" id="wjx-stat-total">0</span>
                        </div>
                        <div class="wjx-metric">
                            <span class="wjx-metric-label">题型种类</span>
                            <span class="wjx-metric-value" id="wjx-stat-types">0</span>
                        </div>
                    </div>
                </section>
                <section class="wjx-tiku-promo" aria-label="星夜题库资源入口">
                    <div class="wjx-tiku-promo-top">
                        <span class="wjx-tiku-promo-icon" aria-hidden="true">✦</span>
                        <span class="wjx-tiku-promo-copy">
                            <strong>星夜题库 · 千万免费题库</strong>
                            <small>支持 OCS 网课助手接入与配置</small>
                        </span>
                    </div>
                    <div class="wjx-tiku-promo-actions">
                        <a class="wjx-tiku-promo-link" href="https://tiku888.top/" target="_blank" rel="noopener noreferrer" title="在新标签页打开星夜题库">进入题库 ↗</a>
                        <a class="wjx-tiku-promo-link" href="https://tiku888.top/guide" target="_blank" rel="noopener noreferrer" title="查看 OCS 网课助手接入说明">OCS 接入说明 ↗</a>
                    </div>
                </section>
                <section class="wjx-section">
                    <h3 class="wjx-section-title">全局设置</h3>
                    <div class="wjx-field">
                        <label for="wjx-target-count">设计份数</label>
                        <input id="wjx-target-count" class="wjx-input" type="number" min="1" step="1" value="1" />
                        <p class="wjx-count-hint" id="wjx-count-hint" aria-live="polite"></p>
                    </div>
                    <div class="wjx-field">
                        <label>分配模式</label>
                        <p class="wjx-mode-hint" id="wjx-mode-hint">比例模式：各选项数值为权重比例。</p>
                        <div class="wjx-mode-switch">
                            <button type="button" class="wjx-mode-btn is-active" id="wjx-mode-ratio" data-mode="ratio">比例模式</button>
                            <button type="button" class="wjx-mode-btn" id="wjx-mode-count" data-mode="count">数量模式</button>
                        </div>
                    </div>
                    <div class="wjx-field">
                        <label for="wjx-speed-profile">填写速度</label>
                        <select id="wjx-speed-profile" class="wjx-input">
                            <option value="slow">慢速</option>
                            <option value="normal" selected>正常</option>
                            <option value="fast">快速</option>
                        </select>
                    </div>
                    <div id="wjx-save-status" class="wjx-save-status" aria-live="polite">配置尚未修改</div>
                    <div class="wjx-actions">
                        <button type="button" class="wjx-btn wjx-btn-primary" id="wjx-randomize-all">一键随机全部</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-rescan">重新识别</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-export-config">导出当前配置</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-import-config">导入配置</button>
                        <input type="file" id="wjx-import-file" class="wjx-file-input" accept=".json,application/json" />
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-preview-fill" style="grid-column: span 2; margin-top: 8px;">预览填写（不提交）</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-preview-plan" style="grid-column: span 2;">预览选择（只高亮）</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-fill-to-submit" style="grid-column: span 2;">填写到提交前暂停</button>
                        <button type="button" class="wjx-btn wjx-btn-primary" id="wjx-start-automation" style="grid-column: span 2;">开始自动化提交</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-reset-config">恢复默认配置</button>
                        <button type="button" class="wjx-btn wjx-btn-secondary" id="wjx-clear-storage">清除本地数据</button>
                    </div>
                </section>
                <section class="wjx-section">
                    <h3 class="wjx-section-title">题目配置</h3>
                    <div class="wjx-toolbar">
                        <input id="wjx-question-search" class="wjx-input" type="search" placeholder="搜索题目标题或编号" />
                        <select id="wjx-question-type-filter" class="wjx-input">
                            <option value="all">全部题型</option>
                            <option value="radio">单选题</option>
                            <option value="checkbox">多选题</option>
                            <option value="dropdown">下拉题</option>
                            <option value="rating">评分题</option>
                            <option value="matrix">矩阵题</option>
                            <option value="slide">滑块题</option>
                            <option value="text">填空题</option>
                            <option value="location">地区题</option>
                            <option value="sorting">排序题</option>
                            <option value="proportion">占比题</option>
                        </select>
                    </div>
                    <div id="wjx-question-list" class="wjx-list"></div>
                </section>
            </div>
        `;
        document.body.appendChild(panel);
        bindEvents(panel);
        bindPanelDragging(panel);
    }

    function bindPanelDragging(panel) {
        const head = panel.querySelector('.wjx-head');
        if (!head) {
            return;
        }
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        head.addEventListener('pointerdown', (event) => {
            if (event.target.closest('a, button, input, select')) {
                return;
            }
            const rect = panel.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            head.setPointerCapture && head.setPointerCapture(event.pointerId);
        });
        head.addEventListener('pointermove', (event) => {
            if (!dragging || window.matchMedia('(max-width: 640px)').matches) {
                return;
            }
            const left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - offsetX));
            const top = Math.max(8, Math.min(window.innerHeight - 80, event.clientY - offsetY));
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });
        const release = () => {
            if (!dragging) {
                return;
            }
            dragging = false;
            try {
                localStorage.setItem(`${State.surveyKey}_PANEL_POSITION`, JSON.stringify({
                    left: panel.style.left,
                    top: panel.style.top
                }));
            } catch (error) {}
        };
        head.addEventListener('pointerup', release);
        head.addEventListener('pointercancel', release);
        try {
            const position = JSON.parse(localStorage.getItem(`${State.surveyKey}_PANEL_POSITION`) || 'null');
            if (position && position.left && position.top && !window.matchMedia('(max-width: 640px)').matches) {
                // 恢复位置时钳制在视口内，防止窗口缩放后面板跑出屏幕
                const left = Math.max(8, Math.min(Number(position.left.replace('px', '')) || 8, window.innerWidth - panel.offsetWidth - 8));
                const top = Math.max(8, Math.min(Number(position.top.replace('px', '')) || 8, window.innerHeight - 80));
                panel.style.left = `${left}px`;
                panel.style.top = `${top}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        } catch (error) {}
    }

    function bindEvents(panel) {
        panel.querySelector('#wjx-toggle-panel').addEventListener('click', () => {
            panel.classList.toggle('is-collapsed');
            const body = panel.querySelector('#wjx-panel-body');
            const button = panel.querySelector('#wjx-toggle-panel');
            const collapsed = panel.classList.contains('is-collapsed');
            body.classList.toggle('wjx-hidden', collapsed);
            button.textContent = collapsed ? '展开' : '收起';
        });

        panel.querySelector('#wjx-target-count').addEventListener('input', (event) => {
            State.config.targetCount = Math.max(1, Number(event.target.value) || 1);
            updateTargetCountHint();
            updateCountModeHints();
            scheduleConfigSave();
        });

        panel.querySelector('#wjx-speed-profile').addEventListener('change', (event) => {
            State.config.speedProfile = ['slow', 'normal', 'fast'].includes(event.target.value)
                ? event.target.value
                : 'normal';
            scheduleConfigSave();
        });

        panel.addEventListener('input', (event) => {
            if (event.target.matches('[data-role="weight-input"]')) {
                updateWeightVisuals(event.target.closest('.wjx-card'));
                if (isCountMode()) {
                    updateCountModeHints();
                }
            }
            if (event.target.matches('[data-role="weight-input"], [data-role="content-editor"], [data-role="slide-min"], [data-role="slide-max"]')) {
                scheduleConfigSave();
            }
        });

        const searchInput = panel.querySelector('#wjx-question-search');
        const typeFilter = panel.querySelector('#wjx-question-type-filter');
        [searchInput, typeFilter].forEach((element) => {
            if (element) {
                element.addEventListener('input', applyQuestionFilters);
                element.addEventListener('change', applyQuestionFilters);
            }
        });

        panel.querySelector('#wjx-mode-ratio').addEventListener('click', () => {
            setDistributionMode('ratio');
        });
        panel.querySelector('#wjx-mode-count').addEventListener('click', () => {
            setDistributionMode('count');
        });

        panel.querySelector('#wjx-randomize-all').addEventListener('click', () => {
            randomizeAllQuestions();
        });

        panel.querySelector('#wjx-rescan').addEventListener('click', () => {
            refreshQuestions({ silent: false, preserveInputs: true });
        });

        panel.querySelector('#wjx-export-config').addEventListener('click', () => {
            exportCurrentConfig();
        });

        panel.querySelector('#wjx-import-config').addEventListener('click', () => {
            const fileInput = panel.querySelector('#wjx-import-file');
            if (fileInput) {
                fileInput.click();
            }
        });

        panel.querySelector('#wjx-import-file').addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            importConfigFromFile(file);
            event.target.value = '';
        });

        panel.querySelector('#wjx-start-automation').addEventListener('click', () => {
            if (panel.querySelector('#wjx-start-automation').dataset.running === '1') {
                return;
            }
            panel.querySelector('#wjx-start-automation').dataset.running = '1';
            try {
                syncStateFromDom();
                if (!saveConfig()) {
                    showToast('配置无法保存，已停止启动以避免数据丢失。');
                    return;
                }
                startAutomation();
            } finally {
                panel.querySelector('#wjx-start-automation').dataset.running = '';
            }
        });

        const previewBtn = panel.querySelector('#wjx-preview-fill');
        if (previewBtn) {
            previewBtn.addEventListener('click', async () => {
                if (previewBtn.dataset.running === '1') {
                    return;
                }
                previewBtn.dataset.running = '1';
                previewBtn.textContent = '正在预览填写…';
                try {
                    await previewFillOnce();
                } finally {
                    previewBtn.dataset.running = '';
                    previewBtn.textContent = '预览填写（不提交）';
                }
            });
        }

        const previewPlanBtn = panel.querySelector('#wjx-preview-plan');
        if (previewPlanBtn) {
            previewPlanBtn.addEventListener('click', async () => {
                if (previewPlanBtn.dataset.running === '1') {
                    return;
                }
                previewPlanBtn.dataset.running = '1';
                previewPlanBtn.textContent = '正在生成预览…';
                try {
                    await previewSelectionPlan();
                } finally {
                    previewPlanBtn.dataset.running = '';
                    previewPlanBtn.textContent = '预览选择（只高亮）';
                }
            });
        }

        const fillToSubmitBtn = panel.querySelector('#wjx-fill-to-submit');
        if (fillToSubmitBtn) {
            fillToSubmitBtn.addEventListener('click', async () => {
                if (fillToSubmitBtn.dataset.running === '1') {
                    return;
                }
                fillToSubmitBtn.dataset.running = '1';
                const originalText = fillToSubmitBtn.textContent;
                fillToSubmitBtn.textContent = '正在填写…';
                try {
                    await fillToSubmitAndPause();
                } finally {
                    fillToSubmitBtn.dataset.running = '';
                    fillToSubmitBtn.textContent = originalText;
                }
            });
        }
        panel.querySelector('#wjx-reset-config').addEventListener('click', () => {
            resetCurrentSurveyConfig();
        });
        panel.querySelector('#wjx-clear-storage').addEventListener('click', () => {
            clearCurrentSurveyStorage();
        });

        panel.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-preset]');
            if (trigger) {
                applyPreset(trigger.closest('.wjx-card'), trigger.dataset.preset);
                scheduleConfigSave();
                return;
            }
            const action = event.target.closest('[data-action]');
            if (action) {
                handleQuestionAction(action.closest('.wjx-card'), action.dataset.action);
            }
        });
    }

    function refreshQuestions(options) {
        const settings = Object.assign({ silent: false, preserveInputs: true }, options);
        const previousQuestions = settings.preserveInputs ? collectCurrentQuestionsFromDom() : [];
        const previousTargetCount = getCurrentTargetCount();
        const savedConfig = loadConfig();
        const scannedQuestions = scanQuestions();

        State.config = mergeConfig(savedConfig, previousQuestions, previousTargetCount, scannedQuestions);
        renderStats();
        renderQuestionList();
        updateCountModeHints();

        const targetInput = document.getElementById('wjx-target-count');
        if (targetInput) {
            targetInput.value = String(State.config.targetCount);
        }
        updateTargetCountHint();
        const speedInput = document.getElementById('wjx-speed-profile');
        if (speedInput) {
            speedInput.value = ['slow', 'normal', 'fast'].includes(State.config.speedProfile)
                ? State.config.speedProfile
                : 'normal';
        }
        updateDistributionModeUI();

        if (shouldAutoRandomize(settings, previousQuestions, savedConfig, scannedQuestions)) {
            randomizeAllQuestions({ silent: true });
        }

        // 重新识别题目时，清空文本答案去重缓存，避免旧题目的文本残留
        clearUsedTextAnswers();
        updateAllRelationVisibility();

        if (!settings.silent) {
            const relationCount = scannedQuestions.filter((item) => Array.isArray(item.relations) && item.relations.length).length;
            if (scannedQuestions.length) {
                const relationTip = relationCount ? `，其中 ${relationCount} 道含题目关联` : '';
                showToast(`已重新识别 ${scannedQuestions.length} 道题${relationTip}。`);
            } else {
                showToast('当前页面没有识别到可配置题目。');
            }
        }
    }

    function shouldAutoRandomize(settings, previousQuestions, savedConfig, scannedQuestions) {
        if (!scannedQuestions.length) {
            return false;
        }
        if (settings.preserveInputs && previousQuestions.length) {
            return false;
        }
        if (hasConfiguredQuestions(savedConfig && savedConfig.questions, savedConfig && savedConfig.distributionMode)) {
            return false;
        }
        return true;
    }

    function hasConfiguredQuestions(list, distributionMode) {
        if (!Array.isArray(list) || !list.length) {
            return false;
        }
        const countMode = isCountModeFromConfig({ distributionMode });
        return list.some((question) => {
            if (question.type === 'text') {
                return Array.isArray(question.content) && question.content.length > 0;
            }
            if (question.type === 'slide') {
                return clampScore(question.minScore, 1) !== 1 || clampScore(question.maxScore, 100) !== 100;
            }
            if (countMode) {
                return Array.isArray(question.weights) && question.weights.some((weight) => Number(weight) > 0);
            }
            return Array.isArray(question.weights) && question.weights.some((weight) => Number(weight) > 1);
        });
    }

    function mergeConfig(savedConfig, previousQuestions, previousTargetCount, scannedQuestions) {
        const mergedQuestions = scannedQuestions.map((question) => {
            const previous = findMatchingQuestion(previousQuestions, question) || findMatchingQuestion(savedConfig && savedConfig.questions, question);
            if (!previous) {
                return question;
            }

            const next = Object.assign({}, question);
            next.enabled = previous.enabled !== false;
            if (question.type === 'text') {
                next.content = Array.isArray(previous.content) && previous.content.length ? previous.content.slice() : question.content.slice();
            } else if (question.type === 'slide') {
                next.minScore = clampScore(previous.minScore, question.minScore);
                next.maxScore = clampScore(previous.maxScore, question.maxScore);
                if (next.maxScore < next.minScore) {
                    next.maxScore = next.minScore;
                }
            } else if (Array.isArray(previous.weights) && previous.weights.length === question.weights.length) {
                next.weights = previous.weights.slice();
            }
            return next;
        });

        const mode = normalizeDistributionMode(
            (savedConfig && savedConfig.distributionMode) ||
            State.config.distributionMode
        );

        return {
            targetCount: Math.max(1, Number(previousTargetCount || (savedConfig && savedConfig.targetCount) || 1) || 1),
            distributionMode: mode,
            speedProfile: ['slow', 'normal', 'fast'].includes(savedConfig && savedConfig.speedProfile)
                ? savedConfig.speedProfile
                : 'normal',
            questions: mergedQuestions
        };
    }

    function findMatchingQuestion(list, question) {
        if (!Array.isArray(list)) {
            return null;
        }
        return list.find((item) => String(item.id) === String(question.id) && item.type === question.type) || null;
    }

    function loadConfig() {
        try {
            return JSON.parse(localStorage.getItem(State.surveyKey) || 'null');
        } catch (error) {
            return null;
        }
    }

    function saveConfig() {
        try {
            localStorage.setItem(State.surveyKey, JSON.stringify(buildConfigPayload()));
            setSaveStatus('配置已保存', 'saved');
            return true;
        } catch (error) {
            setSaveStatus('配置保存失败，请导出备份', 'error');
            logWarning('保存配置失败', error);
            return false;
        }
    }

    let saveConfigTimer = null;
    function setSaveStatus(message, state) {
        const element = document.getElementById('wjx-save-status');
        if (!element) {
            return;
        }
        element.textContent = message;
        element.classList.toggle('is-saved', state === 'saved');
        element.classList.toggle('is-error', state === 'error');
    }

    function scheduleConfigSave() {
        setSaveStatus('正在保存…', '');
        clearTimeout(saveConfigTimer);
        saveConfigTimer = setTimeout(() => {
            syncStateFromDom();
            saveConfig();
        }, 350);
    }

    function buildConfigPayload() {
        return {
            targetCount: State.config.targetCount,
            distributionMode: normalizeDistributionMode(State.config.distributionMode),
            speedProfile: ['slow', 'normal', 'fast'].includes(State.config.speedProfile) ? State.config.speedProfile : 'normal',
            questions: State.config.questions
        };
    }

    function cloneQuestionForExport(question) {
        const next = Object.assign({}, question);
        if (Array.isArray(next.optionLabels)) {
            next.optionLabels = next.optionLabels.slice();
        }
        if (Array.isArray(next.weights)) {
            next.weights = next.weights.slice();
        }
        if (Array.isArray(next.content)) {
            next.content = next.content.slice();
        }
        if (Array.isArray(next.relations)) {
            next.relations = next.relations.map((relation) => Object.assign({}, relation));
        }
        return next;
    }

    function buildConfigExportSnapshot() {
        syncStateFromDom();
        return {
            version: CONFIG_EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            surveyKey: State.surveyKey,
            targetCount: State.config.targetCount,
            distributionMode: normalizeDistributionMode(State.config.distributionMode),
            speedProfile: State.config.speedProfile,
            questions: State.config.questions.map((question) => cloneQuestionForExport(question))
        };
    }

    function downloadJsonFile(filename, payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportCurrentConfig() {
        syncStateFromDom();
        if (!State.config.questions.length) {
            showToast('当前没有可导出的题目配置。');
            return;
        }
        const payload = buildConfigExportSnapshot();
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        downloadJsonFile(`wjx-config-${stamp}.json`, payload);
        showToast('配置已导出为 JSON 文件。');
    }

    function normalizeImportedConfig(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const questions = Array.isArray(raw.questions) ? raw.questions : null;
        if (!questions || !questions.length) {
            return null;
        }
        const allowedTypes = new Set(Object.keys(TYPE_LABELS));
        const normalizedQuestions = questions.filter((question) => {
            return question && question.id != null && allowedTypes.has(question.type);
        }).map((question) => ({
            id: String(question.id),
            type: question.type,
            enabled: question.enabled !== false,
            weights: Array.isArray(question.weights)
                ? question.weights.slice(0, 100).map((value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0))
                : [],
            content: Array.isArray(question.content)
                ? question.content.slice(0, 500).map((value) => String(value).trim()).filter(Boolean)
                : [],
            minScore: clampScore(question.minScore, 1),
            maxScore: clampScore(question.maxScore, 100),
            proportionTotal: Math.max(1, Number(question.proportionTotal) || 100),
            relations: Array.isArray(question.relations)
                ? question.relations.slice(0, 100).map((relation) => ({
                    topicId: String(relation && relation.topicId || ''),
                    optionIndex: Math.max(1, Math.floor(Number(relation && relation.optionIndex) || 1))
                })).filter((relation) => relation.topicId)
                : []
        }));
        if (!normalizedQuestions.length) {
            return null;
        }
        return {
            targetCount: Math.min(10000, Math.max(1, Number(raw.targetCount) || 1)),
            distributionMode: normalizeDistributionMode(raw.distributionMode),
            speedProfile: ['slow', 'normal', 'fast'].includes(raw.speedProfile) ? raw.speedProfile : 'normal',
            questions: normalizedQuestions
        };
    }

    function importConfigFromFile(file) {
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const raw = JSON.parse(String(reader.result || ''));
                applyImportedConfig(raw);
            } catch (error) {
                showToast('配置文件解析失败，请检查 JSON 格式。');
            }
        };
        reader.onerror = () => {
            showToast('读取配置文件失败。');
        };
        reader.readAsText(file, 'utf-8');
    }

    function applyImportedConfig(raw) {
        const imported = normalizeImportedConfig(raw);
        if (!imported) {
            showToast('配置文件格式无效，需包含 questions 数组。');
            return;
        }

        const scannedQuestions = scanQuestions();
        if (!scannedQuestions.length) {
            showToast('当前页面未识别到题目，请先打开问卷题目页再导入。');
            return;
        }

        State.config = mergeConfig(imported, [], imported.targetCount, scannedQuestions);
        State.config.distributionMode = imported.distributionMode;
        State.config.speedProfile = imported.speedProfile;
        saveConfig();
        renderStats();
        renderQuestionList();
        updateCountModeHints();

        const targetInput = document.getElementById('wjx-target-count');
        if (targetInput) {
            targetInput.value = String(State.config.targetCount);
        }
        updateTargetCountHint();
        const speedInput = document.getElementById('wjx-speed-profile');
        if (speedInput) {
            speedInput.value = State.config.speedProfile;
        }
        updateDistributionModeUI();
        updateAllRelationVisibility();

        const matched = imported.questions.filter((question) => findMatchingQuestion(scannedQuestions, question)).length;
        const unmatched = imported.questions.length - matched;
        showToast(`已导入配置：匹配 ${matched} 道，未匹配 ${unmatched} 道。`, { duration: 4200 });
        if (unmatched > 0) {
            logWarning('导入配置存在未匹配题目', imported.questions.filter((question) => !findMatchingQuestion(scannedQuestions, question)));
        }
    }

    function normalizeDistributionMode(mode) {
        return mode === 'count' ? 'count' : 'ratio';
    }

    function isCountModeFromConfig(config) {
        return normalizeDistributionMode(config && config.distributionMode) === 'count';
    }

    function isCountMode() {
        return normalizeDistributionMode(State.config.distributionMode) === 'count';
    }

    function supportsCountDistribution(type) {
        return ['radio', 'dropdown', 'rating', 'checkbox', 'matrix'].includes(type);
    }

    function setDistributionMode(mode) {
        syncStateFromDom();
        State.config.distributionMode = normalizeDistributionMode(mode);
        saveConfig();
        updateDistributionModeUI();
        renderQuestionList();
        updateCountModeHints();
        showToast(mode === 'count' ? '已切换为数量模式' : '已切换为比例模式');
    }

    function updateDistributionModeUI() {
        const mode = normalizeDistributionMode(State.config.distributionMode);
        State.config.distributionMode = mode;
        const ratioBtn = document.getElementById('wjx-mode-ratio');
        const countBtn = document.getElementById('wjx-mode-count');
        const hint = document.getElementById('wjx-mode-hint');
        if (ratioBtn) {
            ratioBtn.classList.toggle('is-active', mode === 'ratio');
        }
        if (countBtn) {
            countBtn.classList.toggle('is-active', mode === 'count');
        }
        if (hint) {
            hint.textContent = mode === 'count'
                ? '数量模式：各选项数值为该选项被选中的次数。无关联题目次数合计应等于设计份数；有关联题目次数合计应等于其父题对应选项的次数。'
                : '比例模式：各选项数值为权重比例。';
        }
    }

    function getWeightInputSuffix(type) {
        if (type === 'proportion') {
            return '占比';
        }
        return isCountMode() ? '次数' : '比例';
    }

    function getRandomPresetLabel() {
        return isCountMode() ? '均衡次数' : '随机比例';
    }

    function distributeCountsEvenly(optionCount, total) {
        const count = Math.max(1, optionCount || 1);
        const target = Math.max(0, Math.round(Number(total) || 0));
        const base = Math.floor(target / count);
        const remainder = target % count;
        return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
    }

    function buildRandomWeightValues(optionCount, question) {
        if (isCountMode()) {
            const targetQuestion = question || { relations: [] };
            let total = getExpectedCountTotalForQuestion(targetQuestion);
            // 多选题每份可选多项，总次数需要乘以最少选择数，否则校验必不通过
            if (targetQuestion.type === 'checkbox') {
                const minSel = Math.max(1, Number(targetQuestion.minSelections) || 1);
                total *= minSel;
            }
            return distributeCountsEvenly(optionCount, total);
        }
        // 占比题的合计由题目上的 total 决定，不是固定 100。
        if (question && question.type === 'proportion') {
            const total = Math.max(1, Number(question.proportionTotal) || 100);
            return distributeRatiosToTotal(optionCount, total);
        }
        return distributeRatiosToTotal(optionCount, 100);
    }

    // 比例模式：生成一组总和恒为 total（默认 100）的随机正整数份额，
    // 例如 4 选项 → 28/19/37/16（约等于 0.28/0.19/0.37/0.16）。
    // 每个选项都给一个非零权重，再按比例缩放到 total 并把取整误差补到最大项，保证和=total。
    function distributeRatiosToTotal(optionCount, total) {
        const count = Math.max(1, optionCount || 1);
        const target = Math.max(count, Math.round(Number(total) || 0));
        const raw = Array.from({ length: count }, () => Math.random() + 0.05);
        const sum = raw.reduce((acc, value) => acc + value, 0);
        const scaled = raw.map((value) => Math.max(1, Math.round((value / sum) * target)));
        let diff = scaled.reduce((acc, value) => acc + value, 0) - target;
        while (diff !== 0) {
            // 找当前最大/最小项把误差补回去，维持相对比例
            let extremumIndex = 0;
            for (let i = 1; i < scaled.length; i++) {
                if (diff > 0 ? scaled[i] > scaled[extremumIndex] : scaled[i] < scaled[extremumIndex]) {
                    extremumIndex = i;
                }
            }
            const step = diff > 0 ? -1 : 1;
            if (scaled[extremumIndex] + step < 1) {
                // 不允许把某项扣到 0，放弃本轮微调（剩余误差极小，可忽略）
                break;
            }
            scaled[extremumIndex] += step;
            diff += step;
        }
        return scaled;
    }

    function findConfigQuestionByTopicId(topicId) {
        return State.config.questions.find((item) => String(item.id) === String(topicId)) || null;
    }

    function getRelationOptionCount(relation) {
        const optionIndex = Number(relation.optionIndex) - 1;
        if (!Number.isFinite(optionIndex) || optionIndex < 0) {
            return null;
        }
        const parentCard = document.querySelector(
            `#${PANEL_ID} .wjx-card[data-qid="${String(relation.topicId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
        );
        if (parentCard) {
            const inputs = parentCard.querySelectorAll('[data-role="weight-input"]');
            if (optionIndex < inputs.length) {
                return Math.max(0, Math.round(Number(inputs[optionIndex].value) || 0));
            }
        }
        const parent = findConfigQuestionByTopicId(relation.topicId);
        if (!parent || !Array.isArray(parent.weights)) {
            return null;
        }
        if (optionIndex >= parent.weights.length) {
            return null;
        }
        return Math.max(0, Math.round(Number(parent.weights[optionIndex]) || 0));
    }

    function getExpectedCountTotalForQuestion(question) {
        const total = getCurrentTargetCount();
        if (!Array.isArray(question.relations) || !question.relations.length) {
            return total;
        }
        // 关联子题的可见份数 = 各关联父题选项次数之和（父题按 OR 逻辑任一满足即显示）。
        // 之前用 Math.min 会在父题某选项配额耗尽时让子题提前结束，语义错误。
        const groups = new Map();
        question.relations.forEach((relation) => {
            const count = getRelationOptionCount(relation);
            if (count !== null) {
                const key = String(relation.topicId);
                groups.set(key, (groups.get(key) || 0) + Math.max(0, count));
            }
        });
        if (!groups.size) {
            return total;
        }
        const groupCounts = Array.from(groups.values()).map((count) => Math.min(total, count));
        if (groupCounts.length === 1) {
            return Math.min(total, groupCounts[0]);
        }
        // 不同父题之间是 OR 关系，无法仅凭边际次数精确知道重叠量；
        // 用独立事件的并集估计避免把多个条件简单相加到满额。
        const notVisible = groupCounts.reduce((product, count) => {
            return product * (1 - Math.min(1, count / Math.max(1, total)));
        }, 1);
        return Math.min(total, Math.round(total * (1 - notVisible)));
    }

    function formatCountSumOnlyHint(question) {
        if (question.type === 'checkbox') {
            return '';
        }
        const expected = getExpectedCountTotalForQuestion(question);
        if (question.type === 'matrix') {
            return `每行次数合计应为 ${expected}`;
        }
        return `次数合计应为 ${expected}`;
    }

    function findQuestionByCard(card) {
        if (!card) {
            return null;
        }
        return State.config.questions.find((item) => {
            return String(item.id) === String(card.dataset.qid) && item.type === card.dataset.type;
        }) || null;
    }

    function getQuestionWeightInputCount(card, question) {
        const inputCount = card ? card.querySelectorAll('[data-role="weight-input"]').length : 0;
        const labelCount = question && Array.isArray(question.optionLabels) ? question.optionLabels.length : 0;
        const weightCount = question && Array.isArray(question.weights) ? question.weights.length : 0;
        return Math.max(inputCount, labelCount, weightCount, 1);
    }

    function syncQuestionWeightsFromCard(card) {
        const question = findQuestionByCard(card);
        if (!question) {
            return;
        }
        question.weights = Array.from(card.querySelectorAll('[data-role="weight-input"]')).map((input) => {
            const value = Number(input.value);
            return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
        });
    }

    function sortCardsParentsFirst(cards) {
        const relationDepth = (card, stack) => {
            const visited = stack || new Set();
            if (visited.has(card)) {
                return 0;
            }
            visited.add(card);
            const question = findQuestionByCard(card);
            if (!question || !Array.isArray(question.relations) || !question.relations.length) {
                return 0;
            }
            let depth = 0;
            question.relations.forEach((relation) => {
                const parentCard = cards.find((item) => String(item.dataset.qid) === String(relation.topicId));
                if (parentCard) {
                    depth = Math.max(depth, relationDepth(parentCard, visited) + 1);
                }
            });
            return depth;
        };
        return cards.slice().sort((left, right) => relationDepth(left) - relationDepth(right));
    }

    // 建议单次不超过 100 份：问卷星与阿里云验证码会按设备/IP 做提交频率风控，
    // 一次跑太多份很容易在中途被拦（表现为「连续多次未通过人机验证」）。
    // 这里只做提示，不限制输入上限，用户仍可自行承担风险填更大数字。
    const TARGET_COUNT_ADVICE = 100;

    function updateTargetCountHint() {
        const hint = document.getElementById('wjx-count-hint');
        if (!hint) {
            return;
        }
        const input = document.getElementById('wjx-target-count');
        const count = Math.max(1, Number(input && input.value) || 1);
        if (count > TARGET_COUNT_ADVICE) {
            hint.classList.add('is-warning');
            hint.textContent = `建议单次不超过 ${TARGET_COUNT_ADVICE} 份：本问卷一次跑 ${count} 份，容易被问卷星按设备/IP 判定风控而卡在人机验证。建议分批执行（例如每次 50～100 份），中间换网络或间隔一段时间。`;
            return;
        }
        hint.classList.remove('is-warning');
        hint.textContent = `建议单次不超过 ${TARGET_COUNT_ADVICE} 份；需要更多份数时建议分批执行。`;
    }

    function updateCountModeHints() {
        if (!isCountMode()) {
            return;
        }
        State.config.targetCount = getCurrentTargetCount();
        document.querySelectorAll(`#${PANEL_ID} [data-role="count-expected-hint"]`).forEach((element) => {
            const question = findQuestionByCard(element.closest('.wjx-card'));
            if (!question) {
                return;
            }
            const text = formatCountSumOnlyHint(question);
            element.textContent = text;
            element.classList.toggle('wjx-hidden', !text);
        });
        document.querySelectorAll(`#${PANEL_ID} .wjx-card`).forEach((card) => {
            const meta = card.querySelector('.wjx-card-meta');
            const question = findQuestionByCard(card);
            if (!meta || !question) {
                return;
            }
            meta.textContent = buildQuestionMeta(question);
        });
    }

    function formatCountModeExpectedHint(question) {
        const expected = getExpectedCountTotalForQuestion(question);
        const total = getCurrentTargetCount();
        if (question.type === 'matrix') {
            return `${question.rowCount || 0} 行 ${question.optionLabels.length} 列，每行次数合计应为 ${expected}`;
        }
        if (question.type === 'checkbox') {
            if (Array.isArray(question.relations) && question.relations.length) {
                return `${question.optionLabels.length} 个选项，数量为各选项在关联可见的 ${expected} 份答卷中的选中次数`;
            }
            return `${question.optionLabels.length} 个选项，数量为各选项在 ${total} 份答卷中的选中次数`;
        }
        if (Array.isArray(question.relations) && question.relations.length && expected !== total) {
            return `${question.optionLabels.length} 个选项，次数合计应为 ${expected}（关联 ${formatRelationText(question.relations)}）`;
        }
        return `${question.optionLabels.length} 个选项，次数合计应为 ${expected}`;
    }

    function validateCountModeBeforeStart() {
        if (!isCountMode()) {
            return true;
        }
        const total = getCurrentTargetCount();
        const issues = [];
        State.config.questions.forEach((question) => {
            if (question.enabled === false || !supportsCountDistribution(question.type)) {
                return;
            }
            const weights = Array.isArray(question.weights) ? question.weights : [];
            const sum = weights.reduce((acc, value) => acc + Math.max(0, Math.round(Number(value) || 0)), 0);
            const hasRelations = Array.isArray(question.relations) && question.relations.length;
            if (question.type === 'checkbox') {
                const expected = getExpectedCountTotalForQuestion(question);
                const normalizedWeights = weights.map((value) => Math.max(0, Math.round(Number(value) || 0)));
                const maxSelections = Math.max(
                    Number(question.minSelections) || 0,
                    Math.min(normalizedWeights.length, Number(question.maxSelections) || normalizedWeights.length)
                );
                const minSelections = Math.min(normalizedWeights.length, Number(question.minSelections) || 0);
                const minTotal = expected * minSelections;
                const maxTotal = expected * maxSelections;
                const overMax = normalizedWeights.some((value) => value > expected);
                // 全零权重：运行时配额全零会导致 pickCheckboxIndicesForQuestion 返回空数组，
                // fillQuestion 返回 false，触发「存在未填写的关联题目」错误或重试。
                // 在此显式拦截，避免「校验通过却跑不动」。
                const allZero = expected > 0 && sum === 0;
                if (allZero || overMax || sum < minTotal || sum > maxTotal) {
                    issues.push(`Q${question.order} 多选次数应在 ${minTotal}～${maxTotal} 之间，且单项不超过 ${expected}，当前为 ${sum}`);
                }
                return;
            }
            const expected = getExpectedCountTotalForQuestion(question);
            if (sum !== expected) {
                const relationTip = hasRelations
                    ? `（关联父题选项次数为 ${expected}）`
                    : `（设计份数为 ${total}）`;
                issues.push(`Q${question.order} 选项次数合计为 ${sum}，应为 ${expected}${relationTip}`);
            }
        });
        if (!issues.length) {
            return true;
        }
        showToast(issues[0] + (issues.length > 1 ? ' 等' : ''));
        return false;
    }

    function loadQuotaState() {
        try {
            const raw = localStorage.getItem(QUOTA_STATE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function saveQuotaState(state) {
        try {
            localStorage.setItem(QUOTA_STATE_KEY, JSON.stringify(state));
        } catch (error) {
            logWarning('保存配额状态失败', error);
        }
    }

    function clearQuotaState() {
        localStorage.removeItem(QUOTA_STATE_KEY);
    }

    function buildQuotaEntry(question) {
        const weights = (question.weights || []).map((value) => Math.max(0, Math.round(Number(value) || 0)));
        if (question.type === 'matrix') {
            const rowCount = Math.max(1, Number(question.rowCount) || 1);
            return {
                type: 'matrix',
                rows: Array.from({ length: rowCount }, () => weights.slice())
            };
        }
        return {
            type: 'flat',
            values: weights.slice()
        };
    }

    function initQuotaState() {
        const quotas = {};
        State.config.questions.forEach((question) => {
            if (!supportsCountDistribution(question.type)) {
                return;
            }
            quotas[String(question.id)] = buildQuotaEntry(question);
        });
        saveQuotaState({
            surveyKey: State.surveyKey,
            quotas
        });
    }

    function ensureQuotaState() {
        if (!isCountMode()) {
            clearQuotaState();
            return;
        }
        const existing = loadQuotaState();
        if (!existing || existing.surveyKey !== State.surveyKey || !existing.quotas) {
            initQuotaState();
            return;
        }
        let changed = false;
        State.config.questions.forEach((question) => {
            const key = String(question.id);
            if (!supportsCountDistribution(question.type) || existing.quotas[key]) {
                return;
            }
            existing.quotas[key] = buildQuotaEntry(question);
            changed = true;
        });
        if (changed) {
            saveQuotaState(existing);
        }
    }

    function getQuotaEntry(questionId) {
        const state = loadQuotaState();
        if (!state || state.surveyKey !== State.surveyKey || !state.quotas) {
            return null;
        }
        return state.quotas[String(questionId)] || null;
    }

    function getFlatQuotas(questionId) {
        const entry = getQuotaEntry(questionId);
        if (!entry || entry.type !== 'flat' || !Array.isArray(entry.values)) {
            return null;
        }
        return entry.values;
    }

    function getMatrixRowQuotas(questionId, rowIndex) {
        const entry = getQuotaEntry(questionId);
        if (!entry || entry.type !== 'matrix' || !Array.isArray(entry.rows)) {
            return null;
        }
        return entry.rows[rowIndex] || null;
    }

    function pickQuotaIndexFromValues(quotas) {
        const available = quotas
            .map((quota, index) => ({ index, quota: Math.max(0, Number(quota) || 0) }))
            .filter((item) => item.quota > 0);
        if (!available.length) {
            // 配额耗尽不应静默均匀随机，否则次数模式彻底失效。
            // 返回 -1 让调用方判定为填写失败 -> 触发重试或跳过，而不是偷偷生成超配额数据。
            return -1;
        }
        const total = available.reduce((sum, item) => sum + item.quota, 0);
        let random = Math.random() * total;
        for (const item of available) {
            random -= item.quota;
            if (random <= 0) {
                return item.index;
            }
        }
        return available[available.length - 1].index;
    }

    function consumeFlatQuota(questionId, optionIndex) {
        const state = loadQuotaState();
        const entry = state && state.surveyKey === State.surveyKey && state.quotas
            ? state.quotas[String(questionId)]
            : null;
        if (!entry || entry.type !== 'flat' || !Array.isArray(entry.values)) {
            return;
        }
        if (entry.values[optionIndex] > 0) {
            entry.values[optionIndex] -= 1;
            saveQuotaState(state);
        }
    }

    function consumeMatrixQuota(questionId, rowIndex, optionIndex) {
        const state = loadQuotaState();
        const entry = state && state.surveyKey === State.surveyKey && state.quotas
            ? state.quotas[String(questionId)]
            : null;
        if (!entry || entry.type !== 'matrix' || !entry.rows[rowIndex]) {
            return;
        }
        if (entry.rows[rowIndex][optionIndex] > 0) {
            entry.rows[rowIndex][optionIndex] -= 1;
            saveQuotaState(state);
        }
    }

    function pickOptionIndexForQuestion(question) {
        if (!isCountMode() || !supportsCountDistribution(question.type)) {
            return pickWeightedIndex(Array.isArray(question.weights) ? question.weights : []);
        }
        const quotas = getFlatQuotas(question.id);
        if (!quotas) {
            return pickWeightedIndex(Array.isArray(question.weights) ? question.weights : []);
        }
        return pickQuotaIndexFromValues(quotas);
    }

    function pickCheckboxIndicesForQuestion(question) {
        const weights = Array.isArray(question.weights) ? question.weights : [];
        if (!isCountMode()) {
            return pickMultipleIndices(weights, question.minSelections, question.maxSelections);
        }
        const quotas = getFlatQuotas(question.id);
        if (!quotas) {
            return pickMultipleIndices(weights, question.minSelections, question.maxSelections);
        }

        const totalOptions = quotas.length;
        const available = quotas
            .map((quota, index) => ({ index, quota: Math.max(0, Number(quota) || 0) }))
            .filter((item) => item.quota > 0);
        if (!available.length) {
            // 配额耗尽：返回空数组让上层 clickOption 全部落空 -> selectedIndices.length === 0
            // -> fillQuestion 返回 false -> 触发重试或跳过。不应退回均匀随机破坏次数约束。
            return [];
        }

        const minCount = Math.max(0, Math.min(Number(question.minSelections) || 0, totalOptions));
        const defaultMax = Math.min(totalOptions, Math.max(minCount || 1, totalOptions));
        const maxCount = Math.max(minCount, Math.min(Number(question.maxSelections) || defaultMax, totalOptions));
        const remainingAnswers = Math.max(1, Number((loadAutomationSession() || {}).remaining) || getCurrentTargetCount());
        const remainingQuotaTotal = available.reduce((sum, item) => sum + item.quota, 0);
        const lowerBound = Math.max(minCount, remainingQuotaTotal - (remainingAnswers - 1) * maxCount);
        const upperBound = Math.min(maxCount, remainingQuotaTotal - (remainingAnswers - 1) * minCount);
        const mandatory = available.filter((item) => item.quota >= remainingAnswers).map((item) => item.index);
        const lower = Math.max(mandatory.length, Math.min(available.length, lowerBound));
        const upper = Math.max(lower, Math.min(available.length, upperBound));
        const count = Math.min(available.length, randomInt(lower, upper));

        const pool = available.filter((item) => !mandatory.includes(item.index));
        const results = [];
        mandatory.slice(0, count).forEach((index) => results.push(index));
        while (results.length < count && pool.length > 0) {
            const total = pool.reduce((sum, item) => sum + item.quota, 0);
            let random = Math.random() * total;
            let pickIndex = 0;
            for (let i = 0; i < pool.length; i++) {
                random -= pool[i].quota;
                if (random <= 0) {
                    pickIndex = i;
                    break;
                }
            }
            const pick = pool[pickIndex];
            results.push(pick.index);
            pool.splice(pool.indexOf(pick), 1);
        }
        return results;
    }

    function pickMatrixRowIndex(question, rowIndex) {
        if (!isCountMode()) {
            return pickWeightedIndex(question.weights);
        }
        const quotas = getMatrixRowQuotas(question.id, rowIndex);
        if (!quotas) {
            return pickWeightedIndex(question.weights);
        }
        return pickQuotaIndexFromValues(quotas);
    }

    function renderStats() {
        document.getElementById('wjx-stat-total').textContent = String(State.config.questions.length);
        document.getElementById('wjx-stat-types').textContent = String(new Set(State.config.questions.map((item) => item.type)).size);
    }

    function renderQuestionList() {
        const container = document.getElementById('wjx-question-list');
        if (!container) {
            return;
        }

        if (!State.config.questions.length) {
            container.innerHTML = `
                <div class="wjx-empty">未识别到题目</div>
            `;
            return;
        }

        container.innerHTML = State.config.questions.map((question) => renderQuestionCard(question)).join('');
        applyQuestionFilters();
    }

    function renderQuestionCard(question) {
        const title = escapeHtml(question.title || `题目 ${question.order}`);
        const typeLabel = TYPE_LABELS[question.type] || TYPE_LABELS.unknown;
        const meta = escapeHtml(buildQuestionMeta(question));
        const enabled = question.enabled !== false;
        const weights = Array.isArray(question.weights) ? question.weights : [];
        const weightTotal = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
        const editor = question.type === 'text'
            ? `
                <div class="wjx-field">
                    <label>候选内容</label>
                    <textarea class="wjx-textarea" data-role="content-editor" placeholder="每行一个候选内容">${escapeHtml(Array.isArray(question.content) ? question.content.join('\n') : '')}</textarea>
                </div>
            `
            : question.type === 'slide'
                ? `
                    <div class="wjx-grid">
                        <div class="wjx-grid-item">
                            <span>最小分值</span>
                            <input type="number" min="0" max="100" step="1" value="${escapeHtml(String(clampScore(question.minScore, 1)))}" data-role="slide-min" />
                        </div>
                        <div class="wjx-grid-item">
                            <span>最大分值</span>
                            <input type="number" min="0" max="100" step="1" value="${escapeHtml(String(clampScore(question.maxScore, 100)))}" data-role="slide-max" />
                        </div>
                    </div>
                `
            : question.type === 'unknown'
                ? ''
            : question.type === 'location' || question.type === 'sorting'
                ? `
                    <div class="wjx-empty" style="padding:16px 8px;">已适配自动随机选取并排序，不使用比例/次数配置。</div>
                `
                : `
                    <div class="wjx-grid">
                        ${question.optionLabels.map((label, index) => `
                            <div class="wjx-grid-item">
                                <span title="${escapeHtml(label)}">${escapeHtml(label)}（${getWeightInputSuffix(question.type)}）</span>
                                <input type="number" min="0" step="1" value="${escapeHtml(String(weights[index] || 0))}" data-role="weight-input" data-index="${index}" />
                                <div class="wjx-weight-bar-wrap" aria-hidden="true"><div class="wjx-weight-bar" style="width:${weightTotal > 0 ? Math.round((Math.max(0, Number(weights[index]) || 0) / weightTotal) * 100) : 0}%"></div></div>
                            </div>
                        `).join('')}
                    </div>
                `;
        const presetTool = question.type === 'text'
            ? '<button type="button" class="wjx-chip" data-preset="text-default">填入默认词库</button>'
            : question.type === 'slide'
                ? '<button type="button" class="wjx-chip" data-preset="slide-default">随机分值区间</button>'
            : question.type === 'unknown' || question.type === 'location' || question.type === 'sorting'
                    ? ''
                    : `<button type="button" class="wjx-chip" data-preset="random">${question.type === 'proportion' ? '随机比例' : getRandomPresetLabel()}</button>`;
        const tools = `
            <div class="wjx-tools">
                ${presetTool}
                ${question.type === 'rating' ? '<button type="button" class="wjx-chip" data-preset="rating-positive">偏向高分</button>' : ''}
                <button type="button" class="wjx-chip" data-action="reset">恢复本题</button>
                <button type="button" class="wjx-chip" data-action="copy">复制到同类题</button>
                <button type="button" class="wjx-chip" data-action="toggle">${enabled ? '暂不自动填写' : '恢复自动填写'}</button>
            </div>
        `;
        const countHint = isCountMode() && supportsCountDistribution(question.type) && question.type !== 'checkbox'
            ? `<div class="wjx-count-hint${formatCountSumOnlyHint(question) ? '' : ' wjx-hidden'}" data-role="count-expected-hint">${escapeHtml(formatCountSumOnlyHint(question))}</div>`
            : '';
        const summaryTotal = question.type === 'proportion'
            ? Math.max(1, Number(question.proportionTotal) || 100)
            : Math.round(weightTotal);
        const summarySuffix = question.type === 'proportion' ? '' : (isCountMode() ? ' 次' : '');
        const summary = question.type !== 'text' && question.type !== 'slide' && question.type !== 'unknown' && question.type !== 'location' && question.type !== 'sorting'
            ? `<div class="wjx-weight-summary" data-role="weight-summary">合计 ${summaryTotal}${summarySuffix}</div>`
            : '';

        return `
            <article class="wjx-card${enabled ? '' : ' is-disabled'}" data-qid="${escapeHtml(String(question.id))}" data-type="${escapeHtml(question.type)}">
                <div class="wjx-card-head">
                    <div class="wjx-card-title">Q${question.order}. ${title}</div>
                    <div class="wjx-card-type">${typeLabel}</div>
                </div>
                <div class="wjx-card-meta">${meta}</div>
                ${editor}
                ${summary}
                ${countHint}
                ${tools}
            </article>
        `;
    }

    function applyQuestionFilters() {
        const search = cleanText(document.getElementById('wjx-question-search') && document.getElementById('wjx-question-search').value).toLowerCase();
        const type = String(document.getElementById('wjx-question-type-filter') && document.getElementById('wjx-question-type-filter').value || 'all');
        document.querySelectorAll(`#${PANEL_ID} .wjx-card`).forEach((card) => {
            const matchesType = type === 'all' || card.dataset.type === type;
            const matchesSearch = !search || cleanText(card.textContent).toLowerCase().includes(search);
            card.classList.toggle('is-filtered', !matchesType || !matchesSearch);
        });
    }

    function updateWeightVisuals(card) {
        if (!card) {
            return;
        }
        const values = Array.from(card.querySelectorAll('[data-role="weight-input"]')).map((input) => Math.max(0, Number(input.value) || 0));
        const total = values.reduce((sum, value) => sum + value, 0);
        card.querySelectorAll('.wjx-weight-bar').forEach((bar, index) => {
            bar.style.width = `${total > 0 ? Math.round((values[index] / total) * 100) : 0}%`;
        });
        const summary = card.querySelector('[data-role="weight-summary"]');
        if (summary) {
            summary.textContent = `合计 ${Math.round(total)}${isCountMode() ? ' 次' : ''}`;
        }
    }

    function handleQuestionAction(card, action) {
        if (!findQuestionByCard(card)) {
            return;
        }
        syncStateFromDom();
        const question = findQuestionByCard(card);
        if (!question) {
            return;
        }
        if (action === 'toggle') {
            question.enabled = question.enabled === false;
            renderQuestionList();
            scheduleConfigSave();
            return;
        }
        if (action === 'reset') {
            const fresh = scanQuestions().find((item) => String(item.id) === String(question.id) && item.type === question.type);
            if (fresh) {
                fresh.enabled = question.enabled !== false;
                const index = State.config.questions.findIndex((item) => String(item.id) === String(question.id) && item.type === question.type);
                State.config.questions[index] = fresh;
                renderQuestionList();
                scheduleConfigSave();
            }
            return;
        }
        if (action === 'copy') {
            State.config.questions.forEach((target) => {
                if (target === question || target.type !== question.type) {
                    return;
                }
                if (Array.isArray(question.weights) && Array.isArray(target.weights) && question.weights.length === target.weights.length) {
                    target.weights = question.weights.slice();
                }
                if (question.type === 'text') {
                    target.content = Array.isArray(question.content) ? question.content.slice() : [];
                }
                if (question.type === 'slide') {
                    target.minScore = question.minScore;
                    target.maxScore = question.maxScore;
                }
            });
            renderQuestionList();
            scheduleConfigSave();
            showToast('已复制到选项结构一致的同类题。');
        }
    }

    function resetCurrentSurveyConfig() {
        if (!window.confirm('恢复当前问卷的默认配置？')) {
            return;
        }
        const targetCount = getCurrentTargetCount();
        const mode = State.config.distributionMode;
        const speedProfile = State.config.speedProfile;
        State.config = {
            targetCount,
            distributionMode: mode,
            speedProfile,
            questions: scanQuestions()
        };
        clearUsedTextAnswers();
        renderStats();
        renderQuestionList();
        updateDistributionModeUI();
        saveConfig();
        showToast('已恢复当前问卷默认配置。');
    }

    // 清理问卷星自身的作答残留与设备标识 Cookie。
    // 说明：真正参与风控的 acw_tc、.ASPXANONYMOUS 由服务端/WAF 以 HttpOnly 下发，
    // 页面脚本改不了；这里能清的是脚本可写的那几个（uuuvid、_c_WBKFRo、jac* 等），
    // 换网络后用得上，避免带着旧环境状态直接重试。
    function clearSurveyDeviceState() {
        const clearedCookies = [];
        for (const key of SURVEY_RESIDUE_STORAGE_KEYS) {
            try {
                localStorage.removeItem(key);
            } catch (error) {}
        }
        const host = location.hostname;
        const domains = [host, '.' + host, host.replace(/^[^.]+\./, '.'), ''];
        let cookieNames = [];
        try {
            cookieNames = String(document.cookie || '')
                .split(';')
                .map((part) => part.split('=')[0].trim())
                .filter(Boolean);
        } catch (error) {}
        for (const name of cookieNames) {
            if (!SURVEY_DEVICE_COOKIE_PATTERNS.some((pattern) => pattern.test(name))) {
                continue;
            }
            for (const domain of domains) {
                const domainPart = domain ? `; domain=${domain}` : '';
                try {
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}`;
                } catch (error) {}
            }
            clearedCookies.push(name);
        }
        return { cookies: Array.from(new Set(clearedCookies)), storages: SURVEY_RESIDUE_STORAGE_KEYS.slice() };
    }

    function clearCurrentSurveyStorage() {
        if (!window.confirm('清除当前问卷配置、进度和配额数据？（同时清理问卷星的作答残留与设备标识 Cookie）')) {
            return;
        }
        localStorage.removeItem(State.surveyKey);
        clearAutomationStorage();
        clearAutomationStoppedFlag();
        const deviceState = clearSurveyDeviceState();
        refreshQuestions({ silent: true, preserveInputs: false });
        setSaveStatus('本地数据已清除', 'saved');
        const cookieText = deviceState.cookies.length
            ? `已清理 Cookie：${deviceState.cookies.join('、')}。`
            : '未发现可清理的设备标识 Cookie。';
        showToast(`当前问卷的本地数据已清除。${cookieText}若仍被人机验证拦截，请更换网络（换出口 IP）后重试。`, { duration: 8000 });
    }

    function buildQuestionMeta(question) {
        const relationText = formatRelationText(question.relations);
        if (relationText) {
            return `关联：${relationText}`;
        }
        if (question.type === 'matrix') {
            if (isCountMode() && supportsCountDistribution(question.type)) {
                return formatCountModeExpectedHint(question);
            }
            return `${question.rowCount || 0} 行 ${question.optionLabels.length} 列`;
        }
        if (question.type === 'text') {
            return '填空题';
        }
        if (question.type === 'slide') {
            return `分值范围 ${clampScore(question.minScore, 1)} - ${clampScore(question.maxScore, 100)}`;
        }
        if (question.type === 'unknown') {
            return '未知题型';
        }
        if (question.type === 'proportion') {
            const total = Math.max(1, Number(question.proportionTotal) || 100);
            return `${question.optionLabels.length} 个占比项，合计 ${total}`;
        }
        if (question.type === 'location' || question.type === 'sorting') {
            return '自动随机选取并排序，不使用比例/次数配置';
        }
        if (question.type === 'checkbox' && question.minSelections) {
            return `${question.optionLabels.length} 个选项，最少选 ${question.minSelections} 项`;
        }
        if (isCountMode() && supportsCountDistribution(question.type)) {
            return formatCountModeExpectedHint(question);
        }
        return `${question.optionLabels.length} 个选项`;
    }

    function syncStateFromDom() {
        State.config.targetCount = getCurrentTargetCount();
        State.config.questions = collectCurrentQuestionsFromDom();
    }

    function getCurrentTargetCount() {
        const input = document.getElementById('wjx-target-count');
        return Math.max(1, Number(input && input.value) || 1);
    }

    function collectCurrentQuestionsFromDom() {
        return Array.from(document.querySelectorAll(`#${PANEL_ID} .wjx-card`)).map((card, index) => {
            const id = card.dataset.qid;
            const type = card.dataset.type;
            const original = State.config.questions.find((item) => String(item.id) === String(id) && item.type === type) || {};
            const next = {
                id,
                order: original.order || index + 1,
                title: original.title || '',
                type,
                optionLabels: Array.isArray(original.optionLabels) ? original.optionLabels.slice() : [],
                relations: Array.isArray(original.relations) ? original.relations.map((relation) => Object.assign({}, relation)) : [],
                rowCount: original.rowCount || 0,
                minSelections: original.minSelections || 0,
                maxSelections: original.maxSelections || 0,
                proportionTotal: Math.max(1, Number(original.proportionTotal) || 100),
                enabled: original.enabled !== false,
                minScore: clampScore(original.minScore, 1),
                maxScore: clampScore(original.maxScore, 100)
            };

            if (type === 'text') {
                const area = card.querySelector('[data-role="content-editor"]');
                next.content = area
                    ? area.value.split('\n').map((line) => line.trim()).filter(Boolean)
                    : DEFAULT_TEXT_LIBRARY.slice();
            } else if (type === 'slide') {
                next.minScore = clampScore(card.querySelector('[data-role="slide-min"]') && card.querySelector('[data-role="slide-min"]').value, original.minScore || 1);
                next.maxScore = clampScore(card.querySelector('[data-role="slide-max"]') && card.querySelector('[data-role="slide-max"]').value, original.maxScore || 100);
                if (next.maxScore < next.minScore) {
                    next.maxScore = next.minScore;
                }
            } else if (type !== 'unknown') {
                next.weights = Array.from(card.querySelectorAll('[data-role="weight-input"]')).map((input) => {
                    const value = Number(input.value);
                    return Number.isFinite(value) && value >= 0 ? value : 0;
                });
            }
            return next;
        });
    }

    function applyPreset(card, preset) {
        if (!card) {
            return;
        }

        if (preset === 'text-default') {
            const area = card.querySelector('[data-role="content-editor"]');
            if (area) {
                area.value = DEFAULT_TEXT_LIBRARY.join('\n');
                showToast('已填入默认词库。');
            }
            return;
        }
        if (preset === 'slide-default') {
            const minInput = card.querySelector('[data-role="slide-min"]');
            const maxInput = card.querySelector('[data-role="slide-max"]');
            if (minInput && maxInput) {
                const minScore = randomInt(20, 70);
                const maxScore = randomInt(minScore, Math.min(100, minScore + 30));
                minInput.value = String(minScore);
                maxInput.value = String(maxScore);
                showToast('已生成随机分值区间。');
            }
            return;
        }

        const inputs = Array.from(card.querySelectorAll('[data-role="weight-input"]'));
        if (!inputs.length) {
            return;
        }

        syncStateFromDom();
        const original = findQuestionByCard(card) || { relations: [] };
        if (preset === 'rating-positive' && original.type === 'rating') {
            const activeStart = Math.max(0, inputs.length - 3);
            const values = isCountMode()
                ? distributeCountsEvenly(inputs.length - activeStart, getExpectedCountTotalForQuestion(original))
                : distributeRatiosToTotal(inputs.length - activeStart, 100);
            inputs.forEach((input, index) => {
                input.value = String(index >= activeStart ? values[index - activeStart] || 0 : 0);
            });
            syncQuestionWeightsFromCard(card);
            updateWeightVisuals(card);
            showToast('已设置为偏向高分，仅保留高星级权重。');
            return;
        }
        // 占比题在需要时用生成器的随机比例，但合计必须等于题目上的 total。
        if (original.type === 'proportion') {
            const total = Math.max(1, Number(original.proportionTotal) || 100);
            const values = distributeRatiosToTotal(inputs.length, total);
            inputs.forEach((input, index) => {
                input.value = String(values[index] || 0);
            });
            syncQuestionWeightsFromCard(card);
            updateWeightVisuals(card);
            showToast(`已生成随机占比，合计 ${total}。`);
            return;
        }

        const values = buildRandomWeightValues(getQuestionWeightInputCount(card, original), original);
        inputs.forEach((input, index) => {
            input.value = String(values[index] || 0);
        });
        syncQuestionWeightsFromCard(card);
        updateCountModeHints();
        showToast(isCountMode() ? '已按关联次数均衡分配。' : '已生成随机比例。');
    }

    function randomizeAllQuestions(options) {
        const settings = Object.assign({ silent: false }, options);
        syncStateFromDom();
        const cards = sortCardsParentsFirst(Array.from(document.querySelectorAll(`#${PANEL_ID} .wjx-card`)));
        cards.forEach((card) => {
            const type = card.dataset.type;
            if (type === 'text') {
                const area = card.querySelector('[data-role="content-editor"]');
                if (area) {
                    area.value = DEFAULT_TEXT_LIBRARY.join('\n');
                }
                return;
            }
            if (type === 'slide') {
                const minInput = card.querySelector('[data-role="slide-min"]');
                const maxInput = card.querySelector('[data-role="slide-max"]');
                if (minInput && maxInput) {
                    const minScore = randomInt(20, 70);
                    const maxScore = randomInt(minScore, Math.min(100, minScore + 30));
                    minInput.value = String(minScore);
                    maxInput.value = String(maxScore);
                }
                return;
            }
            if (type === 'unknown' || type === 'location' || type === 'sorting') {
                return;
            }
            const original = findQuestionByCard(card) || { relations: [] };
            const values = buildRandomWeightValues(getQuestionWeightInputCount(card, original), original);            card.querySelectorAll('[data-role="weight-input"]').forEach((input, index) => {
                input.value = String(values[index] || 0);
            });
            syncQuestionWeightsFromCard(card);
        });
        syncStateFromDom();
        saveConfig();
        updateCountModeHints();
        if (!settings.silent) {
            showToast(isCountMode() ? '已按各题关联次数均衡分配。' : '已随机全部题目。');
        }
    }

    function scanQuestions() {
        return findQuestionNodes().map((node, index) => buildQuestionConfig(node, index + 1)).filter(Boolean);
    }

    // 同一同步帧内缓存 findQuestionNodes 结果，避免 updateAllRelationVisibility 等
    // 高频调用路径在关联题多时退化为 O(N²) 全页扫描。
    // 缓存在下一个 macrotask 自动失效，保证 DOM 变更后能刷新。
    let questionNodesCache = null;
    let questionNodesCacheTick = -1;
    function findQuestionNodes() {
        const tick = Math.floor(performance.now());
        if (questionNodesCache && tick - questionNodesCacheTick < 16) {
            return questionNodesCache;
        }
        const nodes = Array.from(document.querySelectorAll(QUESTION_NODE_SELECTORS.join(',')));
        const filtered = nodes.filter((node, index, list) => {
            if (!(node instanceof HTMLElement)) {
                return false;
            }
            if (!extractTitle(node)) {
                return false;
            }
            return !list.some((other, otherIndex) => otherIndex !== index && other.contains(node));
        });
        questionNodesCache = filtered;
        questionNodesCacheTick = tick;
        return filtered;
    }

    function invalidateQuestionNodesCache() {
        questionNodesCache = null;
        questionNodesCacheTick = -1;
    }

    function parseRelations(node) {
        const raw = String(node.getAttribute('relation') || '').trim();
        if (!raw) {
            return [];
        }
        return raw.split(';').map((part) => {
            const pieces = part.split(',').map((item) => item.trim()).filter(Boolean);
            if (pieces.length < 2) {
                return null;
            }
            const topicId = pieces[0].replace(/\D/g, '') || pieces[0];
            const optionIndex = Number(pieces[1]);
            if (!topicId || !Number.isFinite(optionIndex) || optionIndex < 1) {
                return null;
            }
            return { topicId: String(topicId), optionIndex: Math.floor(optionIndex) };
        }).filter(Boolean);
    }

    function findQuestionNodeById(topicId) {
        return findQuestionNodes().find((node) => String(extractQuestionId(node, 0)) === String(topicId)) || null;
    }

    function getRelationOptionLabel(topicId, optionIndex) {
        const parentNode = findQuestionNodeById(topicId);
        if (!parentNode) {
            return `选项${optionIndex}`;
        }
        const parentType = detectType(parentNode);
        const detail = extractDetail(parentNode, parentType);
        return detail.optionLabels[optionIndex - 1] || `选项${optionIndex}`;
    }

    function formatRelationText(relations) {
        if (!Array.isArray(relations) || !relations.length) {
            return '';
        }
        return relations.map((relation) => {
            const label = getRelationOptionLabel(relation.topicId, relation.optionIndex);
            return `第${relation.topicId}题·${label}`;
        }).join('；');
    }

    function isRelationSatisfied(relations) {
        if (!Array.isArray(relations) || !relations.length) {
            return true;
        }
        return relations.some((relation) => isOptionSelectedByIndex(relation.topicId, relation.optionIndex));
    }

    function isOptionSelectedByIndex(topicId, optionIndex) {
        const parentNode = findQuestionNodeById(topicId);
        if (!parentNode) {
            return false;
        }
        return isOptionSelected(parentNode, optionIndex);
    }

    function isOptionSelected(node, optionIndex) {
        const type = detectType(node);
        if (type === 'dropdown') {
            const select = node.querySelector('select');
            if (!select || select.selectedIndex < 0) {
                return false;
            }
            const selected = select.options[select.selectedIndex];
            if (!selected) {
                return false;
            }
            if (Number(selected.value) === optionIndex) {
                return true;
            }
            // 若存在「请选择」占位项， selectedIndex 需要减去占位项偏移
            let realIndex = select.selectedIndex;
            if (select.options[0] && PLACEHOLDER_OPTION_PATTERN.test(cleanText(select.options[0].textContent))) {
                realIndex = select.selectedIndex - 1;
            }
            return realIndex === optionIndex - 1;
        }

        const valueInput = node.querySelector(`input[type="radio"][value="${optionIndex}"], input[type="checkbox"][value="${optionIndex}"]`);
        if (valueInput) {
            return !!valueInput.checked;
        }

        const choiceType = type === 'checkbox' ? 'checkbox' : 'radio';
        const options = getChoiceElements(node, type === 'checkbox' ? 'checkbox' : (type === 'rating' ? 'rating' : 'radio'));
        const option = options[optionIndex - 1];
        return !!(option && isChoiceSelected(option, choiceType));
    }

    function updateAllRelationVisibility() {
        findQuestionNodes().forEach((node) => {
            const relations = parseRelations(node);
            if (!relations.length) {
                return;
            }
            const satisfied = isRelationSatisfied(relations);
            // 用 data 属性标记脚本隐藏，避免直接覆盖 style.display 与问卷星自身联动冲突
            if (satisfied) {
                if (node.dataset.wjxHiddenByRelation === '1') {
                    delete node.dataset.wjxHiddenByRelation;
                    node.removeAttribute('hidden');
                }
            } else {
                if (node.dataset.wjxHiddenByRelation !== '1') {
                    node.dataset.wjxHiddenByRelation = '1';
                }
                node.setAttribute('hidden', '');
            }
        });
    }

    function buildQuestionConfig(node, order) {
        const title = extractTitle(node);
        if (!title) {
            return null;
        }

        const type = detectType(node);
        const base = {
            id: extractQuestionId(node, order),
            order,
            title,
            type,
            rawType: String(node.getAttribute('type') || ''),
            relations: parseRelations(node),
            optionLabels: [],
            rowCount: 0,
            minSelections: 0,
            maxSelections: 0,
            enabled: true,
            minScore: 1,
            maxScore: 100
        };

        if (type === 'text') {
            return Object.assign(base, { content: DEFAULT_TEXT_LIBRARY.slice() });
        }

        if (type === 'slide') {
            return Object.assign(base, {
                minScore: 1,
                maxScore: 100
            });
        }

        if (type === 'unknown') {
            return base;
        }

        // 地区题、排序题：填写逻辑为随机选择，不读 weights。
        // 让它们走不可配置分支，避免渲染假的权重输入框误导用户。
        if (type === 'location' || type === 'sorting') {
            return Object.assign(base, { optionLabels: [], weights: [] });
        }

        // 占比题：各行数值由 total（默认 100）决定，权重即各行占比，
        // 必须合计恰好等于 total，因此按份额生成而不是自由填数。
        if (type === 'proportion') {
            const labels = extractProportionLabels(node);
            const total = readProportionTotal(node);
            return Object.assign(base, {
                optionLabels: labels.length ? labels : ['项目1', '项目2'],
                rowCount: labels.length,
                proportionTotal: total,
                weights: distributeRatiosToTotal(labels.length || 2, total)
            });
        }

        const detail = extractDetail(node, type);
        const limits = extractSelectionLimits(node, type, detail.optionLabels.length);
        return Object.assign(base, {
            optionLabels: detail.optionLabels,
            rowCount: detail.rowCount || 0,
            minSelections: limits.minSelections,
            maxSelections: limits.maxSelections,
            weights: Array.from({ length: detail.optionLabels.length }, () => 1)
        });
    }

    function extractQuestionId(node, fallbackOrder) {
        const raw = node.id || node.getAttribute('topic') || '';
        const match = raw.match(/(\d+)/);
        // fallback 用命名空间前缀避免序号与真实 topic 数字串冲突
        // fallbackOrder===0 表示临时查询（填写循环/签名），用独立前缀不与配置 ID 碰撞
        return match ? match[1] : `fallback:${fallbackOrder || 'temp'}`;
    }

    function extractTitle(node) {
        const titleNode = node.querySelector('.div_title_question, .ui-controlgroup-label, .field-label, .legend, .title');
        return cleanText(titleNode ? titleNode.textContent : '').replace(/^\d+\s*[\.、)]\s*/, '');
    }

    function detectType(node) {
        const wjxType = String(node.getAttribute('type') || '');
        if (wjxType === '6') {
            return 'matrix';
        }
        if (wjxType === '5') {
            return 'rating';
        }
        if (wjxType === '4') {
            return 'checkbox';
        }
        if (wjxType === '3') {
            return 'radio';
        }
        if (wjxType === '7') {
            return 'dropdown';
        }
        if (wjxType === '11') {
            return 'sorting';
        }
        if (wjxType === '1' || wjxType === '2') {
            return 'text';
        }
        if (wjxType === '8') {
            return 'slide';
        }
        // 占比题（比重题）：题目属性带 total（各行必须合计等于它），
        // 行内是 issum=1 的滑动输入框，不是普通填空题。
        if (wjxType === '12') {
            return 'proportion';
        }
        if (node.getAttribute('total') && node.querySelector('input[issum="1"], table.matrix-rating')) {
            return 'proportion';
        }
        if (node.querySelector('.div_table_radio_question, .div_table_clear_top')) {
            return 'matrix';
        }
        const table = node.querySelector('table');
        if (table && table.querySelector('input[type="radio"], input[type="checkbox"], .ui-radio, .ui-checkbox, a[dval], .rate-off, .rate-on')) {
            return 'matrix';
        }
        if (node.querySelector('.city-container, .divProvince, .divCity')) {
            return 'location';
        }
        if (node.querySelector('.reorder-list, .ui-sortable')) {
            return 'sorting';
        }
        if (node.querySelector('.scale-div, .rating-star, .onscore, .starlevel')) {
            return 'rating';
        }
        if (node.querySelector('.ui-checkbox, .jqCheckbox, input[type="checkbox"]')) {
            return 'checkbox';
        }
        if (node.querySelector('.ui-radio, .jqRadio, input[type="radio"]')) {
            return 'radio';
        }
        if (node.querySelector('select')) {
            return 'dropdown';
        }
        if (node.querySelector('textarea, input[type="text"]:not([style*="display:none"]), input[type="tel"], input[type="email"], input[type="number"]')) {
            return 'text';
        }
        return 'unknown';
    }

    function extractSelectionLimits(node, type, optionCount) {
        const rawMin = Number(node.getAttribute('minvalue') || 0);
        const rawMax = Number(node.getAttribute('maxvalue') || 0);
        let minSelections = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;
        let maxSelections = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 0;

        if (!minSelections && (type === 'checkbox' || type === 'radio') && node.getAttribute('req') === '1') {
            minSelections = 1;
        }

        minSelections = Math.min(Math.max(minSelections, 0), optionCount || 0);
        maxSelections = Math.min(Math.max(maxSelections, 0), optionCount || 0);
        if (maxSelections && maxSelections < minSelections) {
            maxSelections = minSelections;
        }

        return { minSelections, maxSelections };
    }

    // 占比题只读结果行标题：标题行 tr#drv12_Nt 内的 td.title，数据行只含输入框。
    function extractProportionLabels(node) {
        const titleCells = Array.from(node.querySelectorAll('tr[id$="t"] td.title, tr[id$="t"] td'));
        const labels = titleCells
            .map((cell) => trimOptionPrefix(cleanText(cell.textContent)))
            .filter(Boolean);
        if (labels.length) {
            return dedupeTexts(labels).slice(0, 50);
        }
        const fallback = Array.from(node.querySelectorAll('table tr'))
            .filter((row) => !row.querySelector('input'))
            .map((row) => trimOptionPrefix(cleanText(row.textContent)))
            .filter(Boolean);
        return dedupeTexts(fallback).slice(0, 50);
    }

    // 占比题要求各行之和恰好等于题目上的 total（卷面一般是 100）。
    function readProportionTotal(node) {
        const raw = node && node.getAttribute ? Number(node.getAttribute('total')) : NaN;
        return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 100;
    }

    function extractDetail(node, type) {
        if (type === 'proportion') {
            const optionLabels = extractProportionLabels(node);
            return {
                optionLabels: optionLabels.length ? optionLabels : ['项目1', '项目2'],
                rowCount: optionLabels.length
            };
        }

        if (type === 'dropdown') {
            const select = node.querySelector('select');
            const optionLabels = Array.from(select ? select.options : [])
                .map((item) => trimOptionPrefix(cleanText(item.textContent)))
                .filter((text) => text && !PLACEHOLDER_OPTION_PATTERN.test(text));
            return {
                optionLabels: optionLabels.length ? optionLabels : ['选项1', '选项2'],
                rowCount: 0
            };
        }

        if (type === 'rating') {
            const optionLabels = extractRatingLabels(node);
            return {
                optionLabels: optionLabels.length ? optionLabels : ['1星', '2星', '3星', '4星', '5星'],
                rowCount: 0
            };
        }

        if (type === 'matrix') {
            return extractMatrixDetail(node);
        }

        const optionLabels = extractChoiceLabels(node);
        return {
            optionLabels: optionLabels.length ? optionLabels : ['选项1', '选项2'],
            rowCount: 0
        };
    }

    function extractRatingLabels(node) {
        return getChoiceElements(node, 'rating').map((option, index) => {
            const control = option.matches('[val], [dval], input[value]')
                ? option
                : option.querySelector('a[val], [dval], input[value], a[title], [aria-label]');
            const rawScore = control && (
                control.getAttribute('val') ||
                control.getAttribute('dval') ||
                control.getAttribute('value')
            );
            const score = cleanText(rawScore) || String(index + 1);
            const description = cleanText(
                control && (control.getAttribute('title') || control.getAttribute('aria-label')) || ''
            );
            return description && description !== score
                ? `${score}星（${description}）`
                : `${score}星`;
        });
    }

    function extractChoiceLabels(node) {
        // 优先只读取真实选项元素，避免把题目内部的隐藏/辅助 .label 也当成候选选项。
        const primarySelectors = [
            '.ulradiocheck li',
            '.ui-controlgroup .ui-radio',
            '.ui-controlgroup .ui-checkbox',
            '.wjx-options li'
        ];
        const rawTexts = [];
        primarySelectors.forEach((selector) => {
            node.querySelectorAll(selector).forEach((item) => {
                const text = trimOptionPrefix(cleanText(item.textContent));
                if (text) {
                    rawTexts.push(text);
                }
            });
        });
        // 仅在主选择器完全没取到内容时，才用更宽（含 .label / .option-item）的兜底选择器。
        if (rawTexts.length === 0) {
            const fallbackSelectors = ['.label', '.option-item'];
            fallbackSelectors.forEach((selector) => {
                node.querySelectorAll(selector).forEach((item) => {
                    const text = trimOptionPrefix(cleanText(item.textContent));
                    if (text) {
                        rawTexts.push(text);
                    }
                });
            });
        }
        return dedupeTexts(rawTexts).slice(0, 20);
    }

    function extractMatrixDetail(node) {
        const table = node.querySelector('table');
        if (!table) {
            return { optionLabels: ['选项1', '选项2'], rowCount: 0 };
        }

        // 手机版（v.wjx.cn）矩阵首行是 tbody 里的 tr.trlabel，首列不是空占位列；
        // 桌面版首行首列是空 <th></th>。统一按「首列文本是否为空」决定是否跳过，
        // 否则手机版会把第一列标签（如「非常不满意」）整体丢掉。
        let headerCells = [];
        const theadCells = table.querySelectorAll('thead tr:first-child th, thead tr:first-child td');
        if (theadCells.length > 1) {
            headerCells = Array.from(theadCells);
        } else {
            const firstRow = table.querySelector('tbody tr.trlabel') || table.querySelector('tbody tr, tr');
            const bodyCells = firstRow ? firstRow.querySelectorAll('td, th') : [];
            if (bodyCells.length > 1) {
                headerCells = Array.from(bodyCells);
            }
        }
        if (headerCells.length > 1 && !cleanText(headerCells[0].textContent)) {
            headerCells = headerCells.slice(1);
        }

        const optionLabels = dedupeTexts(headerCells.map((cell) => trimOptionPrefix(cleanText(cell.textContent)))).filter(Boolean);
        const rowCount = getMatrixDataRows(table).length;
        return {
            optionLabels: optionLabels.length ? optionLabels : ['选项1', '选项2'],
            rowCount
        };
    }

    function dedupeTexts(list) {
        const result = [];
        const seen = new Set();
        list.forEach((item) => {
            const normalized = cleanText(item);
            if (!normalized || seen.has(normalized)) {
                return;
            }
            seen.add(normalized);
            result.push(normalized);
        });
        return result;
    }

    function trimOptionPrefix(text) {
        return String(text || '').replace(/^[A-ZＡ-Ｚa-zａ-ｚ0-9０-９]+[\.\、\)]\s*/, '').trim();
    }

    function cleanText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function clampScore(value, fallback) {
        const score = Number(value);
        if (!Number.isFinite(score)) {
            return Number(fallback);
        }
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let progressStyleInjected = false;
    let automationRedirectTimer = null;
    // 停止标志：用户点“停止提交”后置位，用于中断正在飞行的异步提交流程，
    // 避免依赖清空 session 才停（清完 session 后完成页跳转/正在 await 的提交仍会继续走）。
    // 同时持久化到 localStorage，跨页面（完成页→跳首页的 location.href）后仍能阻止续跑。
    let automationAborted = false;

    function isAutomationAborted() {
        if (automationAborted) {
            return true;
        }
        try {
            return localStorage.getItem(AUTOMATION_STOPPED_KEY) === '1';
        } catch (error) {
            return false;
        }
    }

    function isAutomationPaused() {
        const session = loadAutomationSession();
        return !!session && (session.paused === true || session.skipping === true);
    }

    function isAutomationInterrupted() {
        return isAutomationAborted() || isAutomationPaused();
    }

    function markAutomationStopped() {
        automationAborted = true;
        try {
            localStorage.setItem(AUTOMATION_STOPPED_KEY, '1');
        } catch (error) {
            logWarning('写入停止标志失败', error);
        }
    }

    function clearAutomationStoppedFlag() {
        automationAborted = false;
        try {
            localStorage.removeItem(AUTOMATION_STOPPED_KEY);
        } catch (error) {}
    }

    function isAutomationStillActive() {
        // 真正的“还在跑”：未被用户停止 且 session 有剩余份数
        return !isAutomationInterrupted() && isAutomationActive();
    }

    // 记录一次「提交后未通过人机验证」。连续达到阈值即判定为设备/IP 已被风控并自动暂停，
    // 返回 true 表示本次已暂停，调用方必须立刻收手，不要再走重试（否则会把风控等级撞高）。
    function noteVerificationFailure() {
        const session = loadAutomationSession();
        if (!session) {
            return false;
        }
        session.verifyFailures = Math.max(0, Number(session.verifyFailures) || 0) + 1;
        if (session.verifyFailures < RISK_CONTROL_VERIFY_FAILURE_LIMIT) {
            saveAutomationSession(session);
            return false;
        }
        session.verifyFailures = 0;
        session.paused = true;
        // 清零重试计数，避免暂停后状态栏还显示「已重试 N 次」造成误解。
        session.retryCount = 0;
        session.lastError = '疑似当前设备/IP 已被风控';
        saveAutomationSession(session);
        updateAutomationProgress();
        showToast(RISK_CONTROL_PAUSE_MESSAGE, { duration: 9000 });
        return true;
    }

    function injectProgressStyles() {
        if (progressStyleInjected || document.querySelector('style[data-wjx-progress]')) {
            progressStyleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.setAttribute('data-wjx-progress', '1');
        // 主进度模态框样式已在 STYLE_TEXT 中定义，这里只补充主样式未覆盖的扩展样式
        style.textContent = `
            .wjx-progress-status {
                margin: 0 0 8px;
                font-size: 12px;
                font-weight: 700;
                color: #d4380d;
            }
        `;
        document.head.appendChild(style);
        progressStyleInjected = true;
    }

    function hidePanelForAutomation() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return;
        }
        try {
            sessionStorage.setItem(
                PANEL_COLLAPSED_KEY,
                panel.classList.contains('is-collapsed') ? '1' : '0'
            );
        } catch (error) {
            logWarning('记忆面板折叠状态失败', error);
        }
        panel.classList.add('is-automation-hidden');
    }

    function showPanelAfterAutomation() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return;
        }
        panel.classList.remove('is-automation-hidden');
        let collapsed = false;
        try {
            const saved = sessionStorage.getItem(PANEL_COLLAPSED_KEY);
            collapsed = saved === '1';
            sessionStorage.removeItem(PANEL_COLLAPSED_KEY);
        } catch (error) {
            logWarning('恢复面板折叠状态失败', error);
        }
        const body = panel.querySelector('#wjx-panel-body');
        const button = panel.querySelector('#wjx-toggle-panel');
        panel.classList.toggle('is-collapsed', collapsed);
        if (body) {
            body.classList.toggle('wjx-hidden', collapsed);
        }
        if (button) {
            button.textContent = collapsed ? '展开' : '收起';
        }
    }

    function clearAutomationStorage() {
        localStorage.removeItem(REMAINING_COUNT_KEY);
        localStorage.removeItem(TOTAL_COUNT_KEY);
        localStorage.removeItem(SURVEY_URL_KEY);
        clearQuotaState();
    }

    function endAutomationSession(message) {
        // 立即置停止标志，打断正在飞行的异步提交与完成页跳转
        markAutomationStopped();
        clearTimeout(automationRedirectTimer);
        automationRedirectTimer = null;
        clearAutomationStorage();
        hideAutomationProgress();
        showPanelAfterAutomation();
        if (message) {
            showToast(message);
        }
    }

    function beginAutomationSession() {
        // 新一轮自动化开始时复位停止标志
        clearAutomationStoppedFlag();
        hidePanelForAutomation();
        showAutomationProgress();
    }

    function stopAutomation() {
        endAutomationSession('已停止自动化提交');
    }

    function captureAttemptQuotaSnapshot() {
        const session = loadAutomationSession();
        if (!session || session.attemptQuotaSnapshot !== null || !isCountMode()) {
            return;
        }
        try {
            session.attemptQuotaSnapshot = localStorage.getItem(QUOTA_STATE_KEY) || '';
            saveAutomationSession(session);
        } catch (error) {
            logWarning('保存本次尝试配额快照失败', error);
        }
    }

    function restoreAttemptQuotaSnapshot(session) {
        if (!session || typeof session.attemptQuotaSnapshot !== 'string') {
            return;
        }
        try {
            if (!session.attemptQuotaSnapshot) {
                localStorage.removeItem(QUOTA_STATE_KEY);
            } else {
                localStorage.setItem(QUOTA_STATE_KEY, session.attemptQuotaSnapshot);
            }
        } catch (error) {
            logWarning('恢复本次尝试配额快照失败', error);
        }
    }

    function toggleAutomationPause() {
        const session = loadAutomationSession();
        if (!session) {
            return;
        }
        if (session.paused) {
            session.paused = false;
            saveAutomationSession(session);
            showToast('已恢复自动化，将重新打开问卷入口。');
            const url = session.url || localStorage.getItem(SURVEY_URL_KEY);
            if (url) {
                location.href = url;
            } else {
                executeAutoFillAndSubmit();
            }
            return;
        }
        restoreAttemptQuotaSnapshot(session);
        session.paused = true;
        saveAutomationSession(session);
        clearTimeout(automationRedirectTimer);
        automationRedirectTimer = null;
        updateAutomationProgress();
        showToast('自动化已暂停，可恢复、跳过当前份或停止。', { duration: 4200 });
    }

    function skipAutomationAttempt() {
        const session = loadAutomationSession();
        if (!session) {
            return;
        }
        restoreAttemptQuotaSnapshot(session);
        session.failed = Math.max(0, Number(session.failed) || 0) + 1;
        session.remaining = Math.max(0, Number(session.remaining) || 0) - 1;
        session.retryCount = 0;
        session.attemptQuotaSnapshot = null;
        session.paused = false;
        session.skipping = true;
        saveAutomationSession(session);
        if (session.remaining <= 0) {
            endAutomationSession('自动化任务已结束，当前份已跳过。');
            return;
        }
        updateAutomationProgress();
        const url = session.url || localStorage.getItem(SURVEY_URL_KEY);
        if (!url) {
            endAutomationSession('缺失问卷地址，无法继续下一份。');
            return;
        }
        setTimeout(() => {
            location.href = url;
        }, 500);
    }

    function isAutomationActive() {
        const session = loadAutomationSession();
        return !!session && Number(session.remaining) > 0;
    }

    function ensureTotalCountForAutomation() {
        const session = loadAutomationSession();
        if (!session) {
            return;
        }
        const remaining = Math.max(0, Number(session.remaining) || 0);
        const total = Math.max(0, Number(session.total) || 0);
        if (remaining > 0 && total <= 0) {
            session.total = remaining;
            saveAutomationSession(session);
        }
    }

    function getAutomationProgress() {
        const session = loadAutomationSession();
        if (!session) {
            return null;
        }
        const remaining = Math.max(0, Number(session.remaining) || 0);
        let total = Math.max(0, Number(session.total) || 0);
        if (total <= 0) {
            total = remaining;
        }
        if (remaining <= 0 || total <= 0) {
            return null;
        }
        const completed = Math.max(0, total - remaining);
        const current = Math.min(total, completed + 1);
        const percent = Math.min(100, Math.round((completed / total) * 100));
        const failed = Math.max(0, Number(session.failed) || 0);
        const succeeded = Math.max(0, completed - failed);
        return {
            current,
            total,
            percent,
            completed,
            succeeded,
            failed,
            paused: session.paused === true,
            error: String(session.lastError || ''),
            retryCount: Math.max(0, Number(session.retryCount) || 0)
        };
    }

    function ensureProgressModal() {
        injectProgressStyles();
        let modal = document.querySelector('.wjx-progress-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'wjx-progress-modal';
            modal.innerHTML = `
                <p class="wjx-progress-title">自动化提交中</p>
                <p class="wjx-progress-count" id="wjx-progress-count">第1份/共1份</p>
                <div class="wjx-progress-bar-wrap" aria-hidden="true">
                    <div class="wjx-progress-bar" id="wjx-progress-bar"></div>
                </div>
                <p class="wjx-progress-percent" id="wjx-progress-percent">进度 0%</p>
                <p class="wjx-progress-status" id="wjx-progress-status"></p>
                <div class="wjx-progress-actions">
                    <button type="button" class="wjx-progress-pause" id="wjx-progress-pause">暂停</button>
                    <button type="button" class="wjx-progress-skip" id="wjx-progress-skip">跳过当前份</button>
                    <button type="button" class="wjx-progress-stop" id="wjx-progress-stop">停止提交</button>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#wjx-progress-pause').addEventListener('click', (event) => {
                event.stopPropagation();
                toggleAutomationPause();
            });
            modal.querySelector('#wjx-progress-skip').addEventListener('click', (event) => {
                event.stopPropagation();
                skipAutomationAttempt();
            });
            modal.querySelector('#wjx-progress-stop').addEventListener('click', (event) => {
                event.stopPropagation();
                stopAutomation();
            });
        }
        return modal;
    }

    function updateAutomationProgressUI(progress) {
        const countEl = document.getElementById('wjx-progress-count');
        const percentEl = document.getElementById('wjx-progress-percent');
        const barEl = document.getElementById('wjx-progress-bar');
        const statusEl = document.getElementById('wjx-progress-status');
        const pauseEl = document.getElementById('wjx-progress-pause');
        if (countEl) {
            countEl.textContent = `第${progress.current}份/共${progress.total}份`;
        }
        if (percentEl) {
            percentEl.textContent = `进度 ${progress.percent}%`;
        }
        if (barEl) {
            barEl.style.width = `${progress.percent}%`;
        }
        if (statusEl) {
            if (progress.error) {
                statusEl.textContent = `${progress.error}${progress.retryCount ? `（已重试 ${progress.retryCount} 次）` : ''}`;
                statusEl.style.display = '';
            } else if (progress.paused) {
                statusEl.textContent = '任务已暂停';
                statusEl.style.display = '';
            } else if (progress.failed > 0) {
                statusEl.textContent = `已成功 ${progress.succeeded} 份，失败 ${progress.failed} 份`;
                statusEl.style.display = '';
            } else {
                statusEl.style.display = 'none';
            }
        }
        if (pauseEl) {
            pauseEl.textContent = progress.paused ? '继续' : '暂停';
        }
    }

    function showAutomationProgress() {
        const progress = getAutomationProgress();
        if (!progress) {
            return;
        }
        const modal = ensureProgressModal();
        updateAutomationProgressUI(progress);
        modal.classList.add('is-visible');
    }

    function updateAutomationProgress() {
        const progress = getAutomationProgress();
        if (!progress) {
            return;
        }
        const modal = document.querySelector('.wjx-progress-modal') || ensureProgressModal();
        updateAutomationProgressUI(progress);
        modal.classList.add('is-visible');
    }

    function hideAutomationProgress() {
        const modal = document.querySelector('.wjx-progress-modal');
        if (modal) {
            modal.classList.remove('is-visible');
        }
    }

    let toastTimer = null;
    function showToast(message, options) {
        const settings = Object.assign({ html: false, duration: 2200, actionable: false, href: '' }, options);
        let toast = document.querySelector('.wjx-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'wjx-toast';
            document.body.appendChild(toast);
        }
        toast.classList.toggle('is-actionable', settings.actionable);
        toast.onclick = null;
        if (settings.html) {
            toast.innerHTML = message;
        } else {
            toast.textContent = message;
        }
        if (settings.actionable && settings.href) {
            toast.onclick = () => {
                window.open(settings.href, '_blank', 'noopener,noreferrer');
            };
        }
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, settings.duration);
    }

    let questionObserver = null;
    let rescanTimer = null;
    function scheduleRescan() {
        setTimeout(() => {
            if (document.getElementById(PANEL_ID)) {
                refreshQuestions({ silent: true, preserveInputs: true });
            }
        }, 1500);
        if (questionObserver) {
            return;
        }
        const root = document.querySelector('#divQuestion, #divContent, form') || document.body;
        try {
            questionObserver = new MutationObserver((mutations) => {
                const hasQuestionMutation = mutations.some((mutation) => {
                    return Array.from(mutation.addedNodes).some((node) => {
                        return node instanceof HTMLElement
                            && !node.closest(`#${PANEL_ID}`)
                            && !node.closest('.wjx-toast')
                            && !node.closest('.wjx-progress-modal');
                    });
                });
                if (!hasQuestionMutation) {
                    return;
                }
                // DOM 变化时主动失效节点缓存，确保下次查询重新扫描
                invalidateQuestionNodesCache();
                clearTimeout(rescanTimer);
                rescanTimer = setTimeout(() => {
                    if (document.getElementById(PANEL_ID) && !isAutomationActive()) {
                        refreshQuestions({ silent: true, preserveInputs: true });
                    }
                }, 450);
            });
            questionObserver.observe(root, { childList: true, subtree: true });
        } catch (error) {
            logWarning('创建 DOM 观察器失败', error);
        }
    }

    function startAutomation() {
        const count = State.config.targetCount;
        if (count <= 0) {
            showToast('请输入有效的设计份数。');
            return;
        }
        if (!validateCountModeBeforeStart()) {
            return;
        }
        saveAutomationSession({
            surveyKey: State.surveyKey,
            remaining: count,
            total: count,
            failed: 0,
            paused: false,
            retryCount: 0,
            verifyFailures: 0,
            maxRetries: 2,
            attemptQuotaSnapshot: null,
            completionHandled: false,
            url: location.href
        });
        if (isCountMode()) {
            initQuotaState();
        } else {
            clearQuotaState();
        }
        beginAutomationSession();
        clearAutomationStoppedFlag();
        executeAutoFillAndSubmit();
    }

    function syncQuestionConfigForCurrentPage() {
        const scannedQuestions = scanQuestions();
        if (!scannedQuestions.length) {
            return;
        }
        const existingQuestions = Array.isArray(State.config.questions) ? State.config.questions : [];
        const mergedQuestions = existingQuestions.slice();
        const newQuestionKeys = new Set();
        let changed = false;

        scannedQuestions.forEach((question) => {
            const index = mergedQuestions.findIndex((item) => String(item.id) === String(question.id) && item.type === question.type);
            if (index >= 0) {
                mergedQuestions[index] = mergeQuestionConfig(mergedQuestions[index], question);
            } else {
                const nextQuestion = Object.assign({}, question);
                mergedQuestions.push(nextQuestion);
                newQuestionKeys.add(`${String(nextQuestion.id)}:${nextQuestion.type}`);
                changed = true;
            }
        });

        if (changed) {
            State.config.questions = mergedQuestions.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
            // 新题目加入时清空文本缓存，保证新题能随机到不同词
            clearUsedTextAnswers();
            if (isCountMode()) {
                State.config.questions.forEach((question) => {
                    if (!newQuestionKeys.has(`${String(question.id)}:${question.type}`) || !supportsCountDistribution(question.type)) {
                        return;
                    }
                    const optionCount = Array.isArray(question.optionLabels) ? question.optionLabels.length : 0;
                    let total = getExpectedCountTotalForQuestion(question);
                    if (question.type === 'checkbox') {
                        const minSel = Math.max(1, Number(question.minSelections) || 1);
                        total *= minSel;
                    }
                    question.weights = distributeCountsEvenly(optionCount, total);
                });
            }
            saveConfig();
            renderStats();
            renderQuestionList();
            updateCountModeHints();
        }
        if (isCountMode()) {
            ensureQuotaState();
        }
    }

    function mergeQuestionConfig(previous, question) {
        const next = Object.assign({}, question);
        if (!previous) {
            return next;
        }
        next.enabled = previous.enabled !== false;
        if (question.type === 'text') {
            next.content = Array.isArray(previous.content) && previous.content.length ? previous.content.slice() : question.content.slice();
        } else if (question.type === 'slide') {
            next.minScore = clampScore(previous.minScore, question.minScore);
            next.maxScore = clampScore(previous.maxScore, question.maxScore);
            if (next.maxScore < next.minScore) {
                next.maxScore = next.minScore;
            }
        } else if (Array.isArray(previous.weights) && previous.weights.length === question.weights.length) {
            next.weights = previous.weights.slice();
        }
        return next;
    }

    async function fillAllQuestions(options) {
        const settings = Object.assign({ stopBeforeSubmit: false }, options);
        const filledQuestionIds = new Set();
        for (let pageIndex = 0; pageIndex < MAX_AUTO_PAGES; pageIndex++) {
            if (isAutomationInterrupted()) {
                return { submitted: false, aborted: true };
            }
            syncQuestionConfigForCurrentPage();
            updateAllRelationVisibility();
            const visibleNodes = getVisibleQuestionNodes();
            if (!visibleNodes.length) {
                throw new Error('当前页面未识别到可填写题目');
            }

            let filledOnPage = false;
            for (let pass = 0; pass < 8; pass++) {
                if (isAutomationInterrupted()) {
                    return { submitted: false, aborted: true };
                }
                updateAllRelationVisibility();
                let filledInPass = false;
                for (const node of getVisibleQuestionNodes()) {
                    if (isAutomationInterrupted()) {
                        return { submitted: false, aborted: true };
                    }
                    const questionId = extractQuestionId(node, 0);
                    if (filledQuestionIds.has(questionId)) {
                        continue;
                    }
                    const relations = parseRelations(node);
                    if (relations.length && !isRelationSatisfied(relations)) {
                        continue;
                    }
                    const question = State.config.questions.find((item) => String(item.id) === String(questionId));
                    if (!question || question.enabled === false) {
                        continue;
                    }
                    const filled = await fillQuestion(question, node);
                    if (filled) {
                        filledQuestionIds.add(questionId);
                        updateAllRelationVisibility();
                        await scaledDelay(200, 500);
                        filledInPass = true;
                        filledOnPage = true;
                    }
                }
                if (!filledInPass) {
                    break;
                }
            }

            if (!filledOnPage) {
                const pendingVisible = getVisibleQuestionNodes().filter((node) => {
                    const questionId = extractQuestionId(node, 0);
                    if (filledQuestionIds.has(questionId)) {
                        return false;
                    }
                    const relations = parseRelations(node);
                    const question = State.config.questions.find((item) => String(item.id) === String(questionId));
                    if (!question || question.enabled === false) {
                        return false;
                    }
                    return !relations.length || isRelationSatisfied(relations);
                });
                if (pendingVisible.length) {
                    // 判断是否是配额耗尽导致的填写失败
                    const quotaExhausted = pendingVisible.some((node) => {
                        const qid = extractQuestionId(node, 0);
                        return isCountMode() && supportsCountDistribution(findConfigQuestionByTopicId(qid))
                            && !getQuotaEntry(qid);
                    });
                    if (quotaExhausted) {
                        throw new Error('部分题目配额已耗尽，无法继续填写（可跳过当前份或切换为比例模式）');
                    }
                    throw new Error('存在未填写的关联题目，请检查父题选项是否已选中');
                }
            }

            // 页面签名在填写完成后、翻页前捕获，避免父题填写导致关联子题出现后签名变化，
            // 被 waitForNextPage 误判为「已翻页」
            const pageSignature = getPageStateSignature();
            const action = await advanceSurvey(pageSignature);
            if (action === 'next') {
                continue;
            }
            if (action === 'submit') {
                if (settings.stopBeforeSubmit) {
                    return { submitted: false, readyToSubmit: true };
                }
                await scaledDelay(800, 1500);
                const result = await submitSurvey();
                if (!result || !result.ok) {
                    // 不在此处累计 failed：本次 attempt 失败会触发上层 catch 的重试逻辑，
                    // 重试成功则应视为同一份提交成功；只有用户主动「跳过当前份」时才计 failed。
                    // 在此累加会让进度框在重试期间显示「失败 N 份」放大失败数。
                    if (result && result.reason === 'no-submit-button') {
                        throw new Error('进入提交分支后仍未找到提交按钮');
                    }
                    if (result && result.verificationFailed) {
                        // 服务端按设备/IP 风控：先把本次计入风控失败数，达阈值则暂停并由上层收手，
                        // 不能让它落进「重试 2 次」的老路，否则只会把风控等级撞得更高。
                        if (noteVerificationFailure()) {
                            return { submitted: false, riskControlled: true };
                        }
                        const verificationError = new Error('进入提交分支后提交未成功（可能验证码未通过）');
                        verificationError.verificationFailed = true;
                        throw verificationError;
                    }
                    throw new Error('进入提交分支后提交未成功（可能验证码未通过）');
                }
                return { submitted: true };
            }
            if (action === 'stalled') {
                throw new Error('检测到下一页按钮，但页面未成功翻页');
            }
            return { submitted: false };
        }
        throw new Error(`已达到自动翻页上限 ${MAX_AUTO_PAGES} 页，请检查是否卡在分页或验证环节`);
    }

    async function fillQuestion(question, node) {
        switch (question.type) {
            case 'radio':
            case 'dropdown':
            case 'rating': {
                const index = pickOptionIndexForQuestion(question);
                const selected = clickOption(node, index, question.type);
                if (isCountMode() && selected) {
                    consumeFlatQuota(question.id, index);
                }
                updateAllRelationVisibility();
                return selected;
            }
            case 'checkbox': {
                const indices = pickCheckboxIndicesForQuestion(question);
                const selectedIndices = indices.filter((idx) => clickOption(node, idx, question.type));
                if (isCountMode()) {
                    selectedIndices.forEach((idx) => consumeFlatQuota(question.id, idx));
                }
                updateAllRelationVisibility();
                const minRequired = Math.max(0, Number(question.minSelections) || 0);
                return selectedIndices.length > 0 && (minRequired === 0 || selectedIndices.length >= minRequired);
            }
            case 'text': {
                // fillText 内部会查询可见输入框并按索引错开取值。
                // 没有可见输入框时视为填写失败。
                return fillText(node, question.content, question);
            }
            case 'slide':
                return fillSlide(node, question.minScore, question.maxScore);
            case 'matrix':
                return fillMatrix(node, question);
            case 'location':
                return await fillLocation(node);
            case 'sorting':
                return await fillSorting(node);
            case 'proportion':
                return fillProportion(node, question);
            default:
                return false;
        }
    }

    // 找到当前激活（可见且 z-index 最高）的 layui-layer 作为地区选择弹层根。
    // 不能 fallback 到 document，否则多地区题或页面残留弹层时会点错对象。
    function getActiveCityLayerRoot(node) {
        const layers = Array.from(document.querySelectorAll('.layui-layer, .ui-dialog'));
        let best = null;
        let bestZ = -Infinity;
        for (const layer of layers) {
            if (!isElementVisible(layer)) {
                continue;
            }
            // 优先选含省份/城市容器的弹层，避免拿到无关 dialog
            const hasCity = layer.querySelector('.city-container, .divProvince, [id^=select2-province]');
            if (!hasCity) {
                continue;
            }
            const z = Number(window.getComputedStyle(layer).zIndex) || 0;
            if (z > bestZ) {
                bestZ = z;
                best = layer;
            }
        }
        return best || node;
    }

    async function fillLocation(node) {
        const trigger = node.querySelector('.city-container, .divProvince, .ui-select, textarea, input[type="text"]');
        if (!trigger) {
            return false;
        }
        trigger.click();
        await scaledDelay(700, 1200);

        const layerRoot = getActiveCityLayerRoot(node);

        const clickAndPick = async (selector) => {
            const btn = layerRoot.querySelector(selector);
            if (!btn) {
                return false;
            }
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            await scaledDelay(350, 700);
            // select2 可能将下拉选项 append 到 document.body，先从弹层内查，兜底全局查
            let optionContainer = layerRoot.querySelector('[id$=-results]');
            if (!optionContainer || !optionContainer.querySelectorAll('li:not(:first-child)').length) {
                optionContainer = document.querySelector('[id$=-results]');
            }
            const options = optionContainer ? Array.from(optionContainer.querySelectorAll('li:not(:first-child)')).filter((li) => cleanText(li.textContent)) : [];
            if (!options.length) {
                return false;
            }
            const randomOpt = options[Math.floor(Math.random() * options.length)];
            randomOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            await scaledDelay(350, 700);
            return true;
        };

        const hasProvince = await clickAndPick('.divProvince, [id^=select2-province]');
        if (hasProvince) {
            await clickAndPick('.divCity, [id^=select2-city]');
            await clickAndPick('.divArea, [id^=select2-area]');
            const saveBtn = layerRoot.querySelector('.layer_save_btn a, .save_btn');
            if (saveBtn) {
                saveBtn.click();
            }
        }
        return hasProvince;
    }

    function fisherYatesShuffle(list) {
        const result = list.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = result[i];
            result[i] = result[j];
            result[j] = tmp;
        }
        return result;
    }

    function getSortingList(node) {
        return node.querySelector('.ui-controlgroup, .reorder-list, .ui-sortable') || node;
    }

    function getSortingItems(node) {
        const list = getSortingList(node);
        const items = list.querySelectorAll('li.ui-li-static, li.reorder-item, li.ui-sortable-handle, .reorder-item');
        return Array.from(items)
            .filter((item) => isElementVisible(item) && cleanText(item.textContent));
    }

    function isSortingItemChecked(item) {
        return String(item.getAttribute('check') || '') === '1' || item.classList.contains('check');
    }

    function readSortingRank(item) {
        const span = item.querySelector('.sortnum');
        const rank = span ? Number(cleanText(span.textContent)) || 0 : 0;
        if (rank) {
            return rank;
        }
        const attrRank = Number(item.getAttribute('data-sort-index') || item.getAttribute('data-rank'));
        return Number.isFinite(attrRank) && attrRank > 0 ? attrRank : 0;
    }

    function readSortingValue(item) {
        const input = item.querySelector('input[type="hidden"]') || item.querySelector('input');
        return input ? String(input.value) : '';
    }

    // 排序题的选中标记、排序位都在 li 上，撤选必须走页面运行时的 sortClear
    function clearSortingItems(node, items) {
        items.forEach((item) => {
            if (!isSortingItemChecked(item) && !readSortingRank(item)) {
                return;
            }
            if (typeof window.sortClear === 'function') {
                try {
                    window.sortClear(item);
                    return;
                } catch (error) {
                    // 页面运行时函数异常时回落到手工清理
                }
            }
            const span = item.querySelector('.sortnum');
            if (span) {
                span.textContent = '';
                span.classList.remove('sortnum-sel');
            }
            item.removeAttribute('check');
            item.classList.remove('check');
            item.removeAttribute('data-sort-index');
            item.removeAttribute('data-rank');
            const marker = item.querySelector('.aftercheck');
            if (marker) {
                marker.remove();
            }
        });
        if (typeof window.sortRestore === 'function' && typeof window.jQuery === 'function') {
            try {
                window.sortRestore(window.jQuery(node));
            } catch (error) {
                // 恢复原始顺序失败不影响后续点击
            }
        }
    }

    // 页面用全局 window.moveanimate 标记排序动画，动画期间对选项的点击会被直接忽略。
    // 这里必须自带轮询：waitForCondition 在自动化被中断时会立刻返回，动画没结束就继续点下一项，
    // 后面的点击会被页面直接丢弃。
    async function waitSortingSettle() {
        const deadline = Date.now() + 1600;
        while (window.moveanimate && Date.now() < deadline) {
            await sleep(40);
        }
        await sleep(60);
    }

    // 排序题靠真实点击选中：首次点击写入排序位，再次点击取消选中，因此重试次数必须保守
    function applySortingItemState(item, rank) {
        const span = item.querySelector('.sortnum');
        if (span && !readSortingRank(item)) {
            span.textContent = String(rank);
            span.classList.add('sortnum-sel');
        }
        item.setAttribute('check', '1');
        item.classList.add('check');
        if (span) {
            span.classList.add('sortnum-sel');
        }
        if (!item.querySelector('.aftercheck')) {
            const marker = document.createElement('div');
            marker.className = 'aftercheck';
            item.appendChild(marker);
        }
        const list = item.parentElement;
        if (list && list.classList.contains('ui-controlgroup')) {
            const selectedItems = Array.from(list.querySelectorAll('li.ui-li-static.check, li.reorder-item.check'));
            selectedItems.sort((left, right) => readSortingRank(left) - readSortingRank(right));
            selectedItems.forEach((selectedItem, index) => {
                const selectedSpan = selectedItem.querySelector('.sortnum');
                if (selectedSpan) {
                    selectedSpan.textContent = String(index + 1);
                    selectedSpan.classList.add('sortnum-sel');
                }
            });
        }
    }

    async function clickSortingItem(item, rank) {
        for (let attempt = 0; attempt < 2; attempt++) {
            if (isSortingItemChecked(item)) {
                if (!readSortingRank(item)) {
                    applySortingItemState(item, rank);
                }
                if (typeof window.sortEvt === 'function' && typeof window.jQuery === 'function') {
                    try {
                        window.sortEvt(window.jQuery(getSortingList(item)), item, { preventDefault() {} });
                    } catch (error) {
                        logWarning('同步排序题内部答案失败', error);
                    }
                }
                return true;
            }
            // 问卷星的 type=11 监听 li 的委托 click；优先点击 li，避免空的 sortnum
            // span 或隐藏 input 成为事件目标后被页面脚本忽略。
            item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            item.click();
            await waitSortingSettle();
        }
        if (isSortingItemChecked(item)) {
            if (!readSortingRank(item)) {
                applySortingItemState(item, rank);
            }
            return true;
        }

        // 某些新版页面只在 jQuery 委托事件中处理排序点击。
        if (typeof window.jQuery === 'function') {
            try {
                window.jQuery(item).trigger('click');
                await waitSortingSettle();
            } catch (error) {
                logWarning('触发排序题 jQuery 点击失败', error);
            }
        }
        if (!isSortingItemChecked(item)) {
            applySortingItemState(item, rank);
        } else if (!readSortingRank(item)) {
            applySortingItemState(item, rank);
        }
        if (typeof window.sortEvt === 'function' && typeof window.jQuery === 'function') {
            try {
                window.sortEvt(window.jQuery(getSortingList(item)), item, {
                    preventDefault() {}
                });
            } catch (error) {
                logWarning('同步排序题内部答案失败', error);
            }
        }
        return isSortingItemChecked(item) && readSortingRank(item) > 0;
    }

    function readSortingLimits(node, optionCount) {
        const minValue = Number(node.getAttribute('minvalue')) || 0;
        const maxValue = Number(node.getAttribute('maxvalue')) || 0;
        const minCount = Math.min(Math.max(minValue > 0 ? minValue : node.getAttribute('req') === '1' ? 1 : 0, 0), optionCount);
        const maxCount = maxValue > 0 ? Math.min(maxValue, optionCount) : optionCount;
        return {
            minCount,
            maxCount: Math.max(minCount, maxCount),
        };
    }

    function hasSortingRank(item) {
        return isSortingItemChecked(item) && readSortingRank(item) > 0;
    }

    async function fillSorting(node) {
        const items = getSortingItems(node);
        if (!items.length) {
            return false;
        }

        clearSortingItems(node, items);
        await waitSortingSettle();

        const { minCount, maxCount } = readSortingLimits(node, items.length);
        const upperBound = Math.max(1, Math.min(maxCount, items.length));
        const targetCount = upperBound >= items.length
            ? items.length
            : Math.min(Math.max(randomInt(Math.max(minCount, 1), upperBound), 1), items.length);

        let selected = 0;
        // 进入本题时若已处于中断态，说明调用来自预览/填到提交前这类非自动化入口，
        // 不能据此放弃排序；只有本题进行中新出现的中断才需要立刻收手。
        const interruptedAtEntry = isAutomationInterrupted();
        for (const item of fisherYatesShuffle(items).slice(0, targetCount)) {
            if (!interruptedAtEntry && isAutomationInterrupted()) {
                return selected > 0;
            }
            if (await clickSortingItem(item, selected + 1)) {
                selected += 1;
            }
            await scaledDelay(120, 260);
        }

        if (selected < minCount || !selected) {
            return false;
        }

        // 问卷星校验依赖每个已选 li 的排序位；仅检查隐藏值会误把未真正选中的题当成成功。
        const rankedItems = items
            .slice()
            .filter(hasSortingRank)
            .sort((a, b) => readSortingRank(a) - readSortingRank(b));
        if (rankedItems.length < minCount || rankedItems.length !== selected) {
            return false;
        }
        return rankedItems.map(readSortingValue).every((value) => value !== '');
    }

    function pickWeightedIndex(weights) {
        const list = Array.isArray(weights) ? weights : [];
        if (!list.length) {
            return 0;
        }
        const total = list.reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
        if (total <= 0) return Math.floor(Math.random() * list.length);
        let random = Math.random() * total;
        for (let i = 0; i < list.length; i++) {
            const weight = Math.max(0, Number(list[i]) || 0);
            if (random < weight) {
                return i;
            }
            random -= weight;
        }
        return list.length - 1;
    }

    function pickMultipleIndices(weights, minSelections, maxSelections) {
        const list = Array.isArray(weights) ? weights : [];
        const totalOptions = list.length;
        if (!totalOptions) {
            return [];
        }

        const minCount = Math.max(0, Math.min(Number(minSelections) || 0, totalOptions));
        const defaultMax = Math.min(totalOptions, Math.max(minCount || 1, Math.min(3, totalOptions)));
        const maxCount = Math.max(minCount, Math.min(Number(maxSelections) || defaultMax, totalOptions));
        const count = minCount >= maxCount ? Math.max(1, minCount || 1) : randomInt(minCount || 1, maxCount);
        const pool = list.map((weight, index) => ({
            index,
            weight: Math.max(1, Number(weight) || 1)
        }));
        const results = [];

        while (results.length < count && pool.length > 0) {
            const total = pool.reduce((sum, item) => sum + item.weight, 0);
            let random = Math.random() * total;
            let selectedIndex = 0;
            for (let i = 0; i < pool.length; i++) {
                random -= pool[i].weight;
                if (random <= 0) {
                    selectedIndex = i;
                    break;
                }
            }
            results.push(pool[selectedIndex].index);
            pool.splice(selectedIndex, 1);
        }

        return results;
    }

    const usedTextAnswers = new Map();
    function clearUsedTextAnswers() {
        usedTextAnswers.clear();
    }
    function pickRandomText(texts, question, textIndex) {
        const source = Array.isArray(texts) && texts.length ? texts : DEFAULT_TEXT_LIBRARY;
        const key = String(question && question.id || 'default');
        const used = usedTextAnswers.get(key) || new Set();
        let candidates = source.filter((value) => !used.has(value));
        if (!candidates.length) {
            used.clear();
            candidates = source.slice();
        }
        let selected;
        if (typeof textIndex === 'number' && textIndex > 0 && candidates.length > 1) {
            // 后续文本框按索引错开取值，避免同题多个文本框填入相同内容。
            const offset = textIndex % candidates.length;
            selected = candidates[offset] || candidates[0] || '';
        } else {
            // 首框或单项输入：随机取（已去重）
            selected = candidates[Math.floor(Math.random() * candidates.length)] || '';
        }
        used.add(selected);
        usedTextAnswers.set(key, used);
        return String(selected)
            .replace(/\{序号\}/g, String((getAutomationProgress() || {}).current || 1))
            .replace(/\{随机数\}/g, String(randomInt(100, 999)));
    }

    function randomInt(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    function isNodeVisible(node) {
        if (!(node instanceof HTMLElement)) {
            return false;
        }
        if (node.hasAttribute('hidden')) {
            return false;
        }
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }
        return node.getClientRects().length > 0;
    }

    function getVisibleQuestionNodes() {
        return findQuestionNodes().filter(isNodeVisible);
    }

    function getButtonText(button) {
        if (!(button instanceof HTMLElement)) {
            return '';
        }
        return cleanText(button.textContent || button.value || button.getAttribute('aria-label') || '');
    }

    function getVisibleActionButtons() {
        return Array.from(document.querySelectorAll(
            '#divNext, #ctlNext, #divStart, #submit_button, .submitbutton, .btn-submit, .nextbutton, .prevbutton, a.button, .button, button, input[type="button"], input[type="submit"], [onclick*="next"], [onclick*="Next"], [onclick*="page"], [onclick*="Page"], [id*="Next"], [id*="next"], #slideChunk, #CoverStartGroup'
        )).filter((button) => {
            return isNodeVisible(button)
                && !button.closest(`#${PANEL_ID}`)
                && !button.closest('.wjx-progress-modal')
                && !button.closest('.wjx-toast');
        });
    }

    // 封面页（有卷首说明/图片的问卷）的「开始作答」入口。
    // 它不是 a/button/input，而是 #CoverStartGroup 里的 #slideChunk，
    // 点击事件由 coverEffect_new.js 通过 jQuery 委托绑定，因此必须原生点它本身。
    function getVisibleCoverEntry() {
        const candidates = ['#slideChunk', '#CoverStartGroup', '.slideChunkWord'];
        for (const selector of candidates) {
            const element = document.querySelector(selector);
            if (element && isNodeVisible(element)) {
                return element;
            }
        }
        return null;
    }

    function isNextButtonText(text) {
        return /\u4e0b\u4e00\u9875|\u4e0b\u4e00\u6b65|\u4e0b\u4e00\u9898|\u7ee7\u7eed|next|continue|>/i.test(text);
    }

    function isStartButtonText(text) {
        return /\u5f00\u59cb|\u8fdb\u5165|\u7ee7\u7eed|\u53c2\u4e0e|\u9a6c\u4e0a|\u7acb\u5373/.test(text);
    }

    function isSubmitButtonText(text) {
        return /\u63d0\u4ea4|\u4ea4\u5377|\u5b8c\u6210|\u53d1\u9001/.test(text);
    }

    function getElementOnclickText(element) {
        return String(element && element.getAttribute && element.getAttribute('onclick') || '');
    }

    function getCoverStartButton() {
        // 封面入口优先：有它时页面上的 #divNext/#ctlNext 往往还在 DOM 里但不可见，
        // 直接返回封面入口，避免误判成「没有开始按钮」。
        const coverEntry = getVisibleCoverEntry();
        if (coverEntry) {
            return coverEntry;
        }
        return getVisibleActionButtons().find((button) => {
            const text = getButtonText(button);
            if (button.matches('#divStart')) {
                return true;
            }
            if (button.matches('#ctlNext, #divNext') && (isStartButtonText(text) || isNextButtonText(text))) {
                return true;
            }
            return isStartButtonText(text);
        }) || null;
    }

    function getNextPageButton() {
        const exact = document.querySelector('#divNext');
        if (exact && isNodeVisible(exact)) {
            return resolveActionTarget(exact);
        }
        const candidates = getVisibleActionButtons();
        return candidates.find((button) => {
            const text = getButtonText(button);
            const onclick = getElementOnclickText(button);
            if (button.id === 'divNext' || button.id === 'ctlNext') {
                return !isSubmitButtonText(text);
            }
            return isNextButtonText(text) || /next|page/i.test(onclick) || /next/i.test(button.id || '');
        }) || null;
    }

    function getSubmitButton() {
        const exactCandidates = Array.from(document.querySelectorAll('#ctlNext, #submit_button, .submitbutton, .btn-submit'));
        const exact = exactCandidates.find((button) => isNodeVisible(button));
        if (exact) {
            return resolveActionTarget(exact);
        }
        return getVisibleActionButtons().find((button) => {
            const text = getButtonText(button);
            if (button.matches('#submit_button, .submitbutton, .btn-submit')) {
                return true;
            }
            if (button.matches('#ctlNext')) {
                return isSubmitButtonText(text) && !isNextButtonText(text);
            }
            return isSubmitButtonText(text);
        }) || null;
    }

    function getPageStateSignature() {
        const fieldsets = Array.from(document.querySelectorAll('fieldset.fieldset, [pg]'))
            .filter(isNodeVisible)
            .map((node) => `${node.id || ''}:${node.getAttribute('pg') || ''}`)
            .join(',');
        const questionIds = getVisibleQuestionNodes().map((node) => extractQuestionId(node, 0)).join(',');
        const nativePage = typeof window.cur_page === 'number' ? String(window.cur_page) : '';
        return `${nativePage}|${fieldsets}|${questionIds}|${getNextPageButton() ? 'N' : ''}${getSubmitButton() ? 'S' : ''}`;
    }

    async function waitForNextPage(previousSignature) {
        const start = Date.now();
        const previousNodeCount = getVisibleQuestionNodes().length;
        while (Date.now() - start < 8000) {
            if (isAutomationInterrupted()) {
                return false;
            }
            await sleep(250);
            updateAllRelationVisibility();
            const currentNodes = getVisibleQuestionNodes();
            const currentSignature = getPageStateSignature();
            if (currentSignature && currentSignature !== previousSignature) {
                return true;
            }
            if (currentNodes.length && currentNodes.length !== previousNodeCount) {
                return true;
            }
            if (!getNextPageButton() && getSubmitButton()) {
                return true;
            }
        }
        return false;
    }

    async function waitForQuestionPage() {
        const start = Date.now();
        while (Date.now() - start < 8000) {
            await sleep(250);
            if (getVisibleQuestionNodes().length > 0) {
                return true;
            }
        }
        return false;
    }

    async function ensureSurveyStarted() {
        if (getVisibleQuestionNodes().length > 0) {
            return true;
        }
        const startButton = getCoverStartButton();
        if (!startButton) {
            return false;
        }
        clickActionButton(startButton);
        return waitForQuestionPage();
    }

    async function advanceSurvey(previousSignature) {
        const nextPageButton = getNextPageButton();
        if (nextPageButton) {
            clickActionButton(nextPageButton);
            let pageChanged = await waitForNextPage(previousSignature);
            if (!pageChanged) {
                triggerNativeNextPage(nextPageButton);
                pageChanged = await waitForNextPage(previousSignature);
            }
            return pageChanged ? 'next' : 'stalled';
        }
        return getSubmitButton() ? 'submit' : null;
    }

    function resolveActionTarget(element) {
        if (!(element instanceof HTMLElement)) {
            return null;
        }
        if (element.matches('a, button, input, [onclick], [role="button"]')) {
            return element;
        }
        return Array.from(element.querySelectorAll('a, button, input, [onclick], [role="button"]'))
            .find((candidate) => isNodeVisible(candidate)) || element;
    }

    function clickActionButton(button) {
        const actionTarget = resolveActionTarget(button);
        if (!actionTarget) {
            return false;
        }
        try {
            actionTarget.scrollIntoView({ block: 'center', inline: 'center' });
        } catch (error) {
            logWarning('滚动到按钮失败', error);
        }
        const rect = actionTarget.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const target = getEventTargetAt(clientX, clientY, actionTarget);
        dispatchMouseLikeEvent(target, 'pointerdown', clientX, clientY, { buttons: 1, pressure: 0.5 });
        dispatchMouseLikeEvent(target, 'mousedown', clientX, clientY, { buttons: 1 });
        dispatchTouchLikeEvent(target, 'touchstart', clientX, clientY);
        dispatchMouseLikeEvent(target, 'pointerup', clientX, clientY, { buttons: 0, pressure: 0 });
        dispatchMouseLikeEvent(target, 'mouseup', clientX, clientY, { buttons: 0 });
        dispatchTouchLikeEvent(target, 'touchend', clientX, clientY);
        if (typeof actionTarget.click === 'function') {
            actionTarget.click();
        }
        return true;
    }

    function dispatchTouchLikeEvent(target, type, clientX, clientY) {
        if (!(target instanceof HTMLElement) || typeof TouchEvent === 'undefined') {
            return;
        }
        try {
            const touch = new Touch({ identifier: Date.now(), target, clientX, clientY, screenX: window.screenX + clientX, screenY: window.screenY + clientY });
            target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch] }));
        } catch (error) {
            logWarning('派发触摸事件失败', error);
        }
    }

    function triggerNativeNextPage(button) {
        const actionTarget = resolveActionTarget(button) || button;
        const names = ['show_next_page', 'to_next_page', 'PDF_nextPage', 'nextPage', 'NextPage', 'showNextPage', 'goNextPage', 'jumpNextPage'];
        for (const name of names) {
            if (typeof window[name] === 'function') {
                try {
                    window[name](actionTarget);
                    return;
                } catch (error) {
                    try {
                        window[name]();
                        return;
                    } catch (innerError) {
                        logWarning(`调用原生翻页函数 ${name} 失败`, innerError);
                    }
                }
            }
        }
        // 优先调用元素本身的 onclick 属性（浏览器解析 onclick 字符串生成的函数），
        // 避免 new Function(...) 走 eval 路径引入注入面。
        if (typeof actionTarget.onclick === 'function') {
            try {
                actionTarget.onclick.call(actionTarget, new MouseEvent('click', { bubbles: true, cancelable: true }));
            } catch (error) {
                logWarning('调用 onclick 属性翻页失败', error);
            }
        }
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // 快速档只压缩「等待」，不能把操作密度一起压掉。
    // 实测：原 fast=0.68 会把提交前的 800~1500ms 压到 540~1020ms，
    // 问卷星人机验证直接判定为机器操作并拦下（同一问卷正常/慢速都能过）。
    // 现在把系数放宽到 0.85，并对快速档做双边约束：
    //   不低于下限（提交前 1300ms / 其它操作 220ms）—— 避免被判定为机器；
    //   不高于正常档的等待时长 —— 保持「快速」语义，绝不比正常档慢。
    const SPEED_FACTORS = { slow: 1.45, normal: 1, fast: 0.85 };
    const FAST_MIN_SUBMIT_DELAY_MS = 1300;
    const FAST_MIN_ACTION_DELAY_MS = 220;

    function getSpeedFactor() {
        const profile = State.config.speedProfile;
        return Object.prototype.hasOwnProperty.call(SPEED_FACTORS, profile)
            ? SPEED_FACTORS[profile]
            : 1;
    }

    function scaledDelay(min, max) {
        const factor = getSpeedFactor();
        const base = min + Math.random() * (max - min);
        if (factor >= 1) {
            return sleep(base * factor);
        }
        const floor = min >= 800 ? FAST_MIN_SUBMIT_DELAY_MS : FAST_MIN_ACTION_DELAY_MS;
        return sleep(Math.min(Math.max(base * factor, floor), base));
    }

    function getChoiceElements(node, type) {
        const controlGroup = node.querySelector('.ui-controlgroup');
        if (type === 'checkbox' && controlGroup) {
            const directOptions = Array.from(controlGroup.children).filter((item) => item.matches('.ui-checkbox, li, .option-item'));
            if (directOptions.length) {
                return directOptions;
            }
        }
        if ((type === 'radio' || type === 'rating') && controlGroup) {
            const directOptions = Array.from(controlGroup.children).filter((item) => item.matches('.ui-radio, li, .option-item'));
            if (directOptions.length) {
                return directOptions;
            }
        }
        if (type === 'checkbox') {
            const options = Array.from(node.querySelectorAll('.ui-controlgroup .ui-checkbox, .ulradiocheck > li, .option-item'));
            return options.length ? options : Array.from(node.querySelectorAll('input[type="checkbox"]'));
        }
        if (type === 'radio' || type === 'rating') {
            const options = Array.from(node.querySelectorAll('.ui-controlgroup .ui-radio, .ulradiocheck > li, .scale-div li, .rating-star, .onscore, .starlevel, .option-item'));
            return options.length ? options : Array.from(node.querySelectorAll('input[type="radio"]'));
        }
        return [];
    }

    function isChoiceSelected(option, type) {
        if (!option) {
            return false;
        }
        const inputSelector = type === 'checkbox' ? 'input[type="checkbox"]' : 'input[type="radio"]';
        const input = option.matches(inputSelector) ? option : option.querySelector(inputSelector);
        if (input) {
            return !!input.checked;
        }
        return option.classList.contains('checked') ||
            option.classList.contains('active') ||
            option.classList.contains('on') ||
            option.classList.contains('rate-on') ||
            option.querySelector('.jqchecked, .checked, .active, .rate-on, a.checked, a.jqchecked') !== null;
    }

    function clickChoiceElement(option, type) {
        if (!option) {
            return false;
        }

        const ratingTarget = type === 'rating'
            ? (option.matches('a[val], [dval], .rate-off, .rate-on, .rating-star, .onscore, .starlevel')
                ? option
                : option.querySelector('a[val], [dval], .rate-off, .rate-on, .rating-star, .onscore, .starlevel'))
            : null;
        const targets = [
            ratingTarget,
            option,
            option.querySelector('.label'),
            option.querySelector('.jqcheck, .jqradio, a.jqcheck, a.jqradio'),
            option.querySelector('label'),
            option.querySelector('input')
        ].filter(Boolean);

        for (const target of targets) {
            ['mousedown', 'mouseup'].forEach((eventName) => {
                target.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
            });
            if (typeof target.click === 'function') {
                target.click();
            }
            if (isChoiceSelected(option, type)) {
                break;
            }
        }

        const otherInput = option.querySelector('input.OtherText, input.OtherRadioText, .OtherText, .OtherRadioText, .ui-text input[type="text"]');
        if (otherInput && !otherInput.value) {
            otherInput.value = '其他';
            otherInput.dispatchEvent(new Event('input', { bubbles: true }));
            otherInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return isChoiceSelected(option, type);
    }

    function clickOption(node, index, type) {
        if (type === 'dropdown') {
            const select = node.querySelector('select');
            if (select && select.options.length > index) {
                let realIndex = index;
                // If the first option is a placeholder, we skip it
                if (select.options[0] && PLACEHOLDER_OPTION_PATTERN.test(cleanText(select.options[0].textContent))) {
                    realIndex += 1;
                }
                if (select.options[realIndex]) {
                    select.selectedIndex = realIndex;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return select.selectedIndex === realIndex;
                }
            }
            return false;
        }

        const options = getChoiceElements(node, type);
        if (options[index]) {
            const option = options[index];
            // checkbox 重试时如果已选中则直接跳过，避免 toggle 导致取消勾选
            if (type === 'checkbox' && isChoiceSelected(option, type)) {
                return true;
            }
            let selected = clickChoiceElement(option, type);
            if (!isChoiceSelected(option, type)) {
                const fallback = option.querySelector(type === 'checkbox' ? 'input[type="checkbox"]' : 'input[type="radio"]');
                if (fallback && typeof fallback.click === 'function') {
                    fallback.click();
                    selected = isChoiceSelected(option, type);
                }
            }
            return selected || isChoiceSelected(option, type);
        }
        return false;
    }

    // 多输入填空题：按 input type 派发生成内容，避免电话/邮箱/数字框被写入普通词库文本导致校验失败。
    // baseText 仍用于 textarea 和 input[type="text"]；其他 type 用各自格式覆盖。
    function generateInputValue(input, baseText) {
        const type = (input.getAttribute('type') || '').toLowerCase();
        if (type === 'tel') {
            // 11 位手机号，1 开头，第二位取 3-9 避免旧号段
            return '1' + randomInt(3, 9) + String(randomInt(100000000, 999999999));
        }
        if (type === 'email') {
            const user = 'u' + randomInt(1000, 9999);
            const domains = ['qq.com', '163.com', '126.com', 'sina.com', 'outlook.com', 'gmail.com'];
            return `${user}@${domains[randomInt(0, domains.length - 1)]}`;
        }
        if (type === 'number') {
            const max = Number(input.max) > 0 ? Math.min(Number(input.max), 99999) : 99999;
            const min = Number.isFinite(Number(input.min)) ? Math.max(0, Number(input.min)) : 0;
            return String(randomInt(min, Math.max(min, max)));
        }
        return baseText;
    }

    function fillText(node, content, question) {
        const inputs = Array.from(node.querySelectorAll('textarea, input[type="text"], input[type="tel"], input[type="email"], input[type="number"]'))
            .filter((input) => isElementVisible(input) && !input.classList.contains('OtherText') && !input.classList.contains('OtherRadioText'));
        if (!inputs.length) {
            return false;
        }
        // 统计 text 类输入框（textarea + input[type=text]）的序号，
        // 为它们从候选内容错开取值；tel/email/number 各自按类型生成。
        let textIndex = 0;
        inputs.forEach((input) => {
            const type = (input.getAttribute('type') || '').toLowerCase();
            const isTextArea = input.tagName === 'TEXTAREA';
            const isText = isTextArea || type === 'text';
            let value;
            if (isText) {
                value = pickRandomText(content, question, textIndex);
                textIndex += 1;
            } else {
                value = generateInputValue(input, '');
            }
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        return true;
    }

    function fillSlide(node, minScore, maxScore) {
        const lower = clampScore(minScore, 1);
        const upper = Math.max(lower, clampScore(maxScore, 100));
        const value = randomInt(lower, upper);
        const input = node.querySelector('input[type="range"], input[type="hidden"], input[type="number"], input[type="text"][id^="q"], input[name^="q"]');
        if (!input) {
            return false;
        }
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const visibleDisplay = node.querySelector('.slider-value, .scale-value, .slider_num, .slider-value-text');
        if (visibleDisplay) {
            visibleDisplay.textContent = String(value);
        }
        return true;
    }

    // 取占比题真正可作答的输入框：带 issum 属性的滑动输入，
    // 没有该属性时退化为行内 input[type=text]（排除隐藏域）。
    function getProportionInputs(node) {
        if (!node) {
            return [];
        }
        const marked = Array.from(node.querySelectorAll('input[issum="1"]'));
        if (marked.length) {
            return marked;
        }
        return Array.from(node.querySelectorAll('input[type="text"], input[type="number"]'))
            .filter((input) => !input.classList.contains('OtherText'));
    }

    // 占比题：所有行的数值必须恰好合计等于题目上的 total，否则问卷星校验不过。
    // 先按配置权重分配，再把取整误差补到最大项，并同步 rangeslider 的视觉位置。
    function fillProportion(node, question) {
        const inputs = getProportionInputs(node);
        if (!inputs.length) {
            return false;
        }
        const total = readProportionTotal(node);
        const labels = Array.isArray(question && question.optionLabels) ? question.optionLabels : [];
        const weights = Array.isArray(question && question.weights) && question.weights.length === inputs.length
            ? question.weights
            : distributeRatiosToTotal(inputs.length, total);

        const values = weights.map((value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
        });
        let diff = values.reduce((sum, value) => sum + value, 0) - total;
        while (diff !== 0) {
            let extremum = 0;
            for (let i = 1; i < values.length; i++) {
                if (diff > 0 ? values[i] > values[extremum] : values[i] < values[extremum]) {
                    extremum = i;
                }
            }
            const step = diff > 0 ? -1 : 1;
            if (values[extremum] + step < 0) {
                break;
            }
            values[extremum] += step;
            diff += step;
        }

        let filled = false;
        inputs.forEach((input, index) => {
            const value = String(values[index] || 0);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            syncProportionSliderVisual(input, value, total);
            if (!filled && value !== '0') {
                filled = true;
            }
            if (labels[index] && !input.getAttribute('aria-label')) {
                input.setAttribute('aria-label', labels[index]);
            }
        });
        return filled || values.some((value) => value > 0);
    }

    // rangeslider 由脚本单独渲染，改 input.value 不会自动移动手柄，
    // 这里按比例补一次视觉同步，避免用户看到输入值与滑块不一致。
    function syncProportionSliderVisual(input, value, total) {
        const wrapper = input.parentElement && input.parentElement.querySelector('.rangeslider');
        if (!wrapper) {
            return;
        }
        const numeric = Number(value);
        const percent = total > 0 ? Math.min(100, Math.max(0, (numeric / total) * 100)) : 0;
        const fill = wrapper.querySelector('.rangeslider__fill');
        const handle = wrapper.querySelector('.rangeslider__handle');
        if (fill) {
            fill.style.width = `${percent}%`;
        }
        if (handle) {
            handle.style.left = `${percent}%`;
            handle.setAttribute('data-value', String(numeric));
        }
    }

    // 取矩阵题真正可作答的数据行。
    // 有 rowindex 属性时直接用它；没有时才退化为 tbody tr，并排除表头行 trlabel
    // 与分组标题行 rowtitle —— 它们不是数据行，混进来会让 fillMatrix 误判失败。
    function getMatrixDataRows(scope) {
        if (!scope) {
            return [];
        }
        const indexed = Array.from(scope.querySelectorAll('tr[rowindex]'));
        if (indexed.length) {
            return indexed;
        }
        return Array.from(scope.querySelectorAll('tbody tr, tr')).filter((row) => {
            if (row.classList.contains('trlabel') || row.classList.contains('rowtitle')) {
                return false;
            }
            return row.querySelectorAll('td, th').length > 0;
        });
    }

    function getMatrixQuotaRowIndex(row, fallbackIndex) {
        const raw = row.getAttribute('rowindex');
        if (raw !== null && raw !== '') {
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
                return Math.max(0, Math.floor(parsed > 0 ? parsed - 1 : parsed));
            }
        }
        return fallbackIndex;
    }

    function getMatrixRowOptions(row) {
        const directControls = Array.from(row.querySelectorAll('.ui-radio, .ui-checkbox, .jqRadio, .jqCheckbox'));
        if (directControls.length) {
            return directControls;
        }
        const rateAnchors = Array.from(row.querySelectorAll('a[dval], .rate-off, .rate-on, .rate-offlarge, .rate-onlarge'));
        if (rateAnchors.length) {
            return rateAnchors;
        }
        // 只有桌面版数据行才带标题列；手机版数据行第一格就是第一个选项，
        // 无条件 slice(1) 会吃掉首列并把整行选项右移一格。
        let cells = Array.from(row.querySelectorAll('td, th'));
        const firstCell = cells[0];
        const hasTitleCell = !!firstCell && (
            firstCell.matches('.scalerowtitletd') ||
            !!firstCell.querySelector('.scalerowtitletd, .rowtitlediv, .itemTitleSpan')
        );
        if (hasTitleCell) {
            cells = cells.slice(1);
        }
        return cells.filter((cell) =>
            cell.querySelector('input[type="radio"], input[type="checkbox"], .ui-radio, .ui-checkbox, a[dval], .rate-off, .rate-on') ||
            cleanText(cell.textContent)
        );
    }

    function fillMatrix(node, question) {
        const rows = getMatrixDataRows(node);
        let attempted = 0;
        let succeeded = 0;
        rows.forEach((row, domIndex) => {
            // 手机版数据行的单元格里只有 <a class="rate-off">，没有任何文本，
            // 不能再用「行文本非空」当作数据行判据（那会把 6 行全跳过）。
            if (!getMatrixRowOptions(row).length) {
                return;
            }
            attempted += 1;
            const quotaRowIndex = getMatrixQuotaRowIndex(row, domIndex);
            const index = pickMatrixRowIndex(question, quotaRowIndex);
            const options = getMatrixRowOptions(row);
            if (!options[index]) {
                return;
            }
            const option = options[index];
            let rowFilled = false;
            if (option.matches('a[dval], .rate-off, .rate-on, .rate-offlarge, .rate-onlarge')) {
                option.click();
                rowFilled = true;
            } else if (option.matches('td, th')) {
                const clickable = option.querySelector('a[dval], .rate-off, .rate-on, .rate-offlarge, .rate-onlarge, .ui-radio, .ui-checkbox, input[type="radio"], input[type="checkbox"]');
                if (clickable) {
                    clickable.click();
                    rowFilled = true;
                } else {
                    option.click();
                    rowFilled = true;
                }
            } else {
                rowFilled = clickChoiceElement(option, option.querySelector('input[type="checkbox"]') ? 'checkbox' : 'radio');
            }
            if (rowFilled) {
                succeeded += 1;
                if (isCountMode()) {
                    consumeMatrixQuota(question.id, quotaRowIndex, index);
                }
            }
        });
        return attempted > 0 && succeeded === attempted;
    }

    function isElementVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }
        if (element.hasAttribute('hidden')) {
            return false;
        }
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }
        return element.getClientRects().length > 0;
    }

    async function waitForCondition(checker, timeoutMs, intervalMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            // 自动化被用户停止后立即跳出轮询，避免“停不下来”
            if (isAutomationInterrupted()) {
                return checker();
            }
            if (checker()) {
                return true;
            }
            await sleep(intervalMs);
        }
        return false;
    }

    const SECURITY_DIALOG_POLL_MS = 40;
    const SECURITY_DIALOG_CONFIRM_DELAY_MIN_MS = 800;
    const SECURITY_DIALOG_CONFIRM_DELAY_MAX_MS = 2000;
    const SECURITY_DIALOG_POST_CLICK_MS = 350;

    function getSecurityCheckDialog() {
        const layers = document.querySelectorAll('.layui-layer-dialog');
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (!isElementVisible(layer)) {
                continue;
            }
            const content = layer.querySelector('.layui-layer-content');
            if (content && /需要安全校验/.test(cleanText(content.textContent))) {
                return layer;
            }
        }
        return null;
    }

    function getSecurityCheckConfirmButton(layer) {
        const root = layer || getSecurityCheckDialog();
        if (!root) {
            return null;
        }
        const directBtn = root.querySelector('.layui-layer-btn0');
        if (directBtn && isElementVisible(directBtn)) {
            return directBtn;
        }
        return Array.from(root.querySelectorAll('.layui-layer-btn a, .layui-layer-btn button')).find((btn) => {
            return isElementVisible(btn) && /确认|确定|知道了/.test(getButtonText(btn));
        }) || null;
    }

    function clickConfirmFast(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        dispatchMouseLikeEvent(element, 'pointerdown', clientX, clientY, { buttons: 1, pressure: 0.5 });
        dispatchMouseLikeEvent(element, 'mousedown', clientX, clientY, { buttons: 1 });
        dispatchMouseLikeEvent(element, 'pointerup', clientX, clientY, { buttons: 0, pressure: 0 });
        dispatchMouseLikeEvent(element, 'mouseup', clientX, clientY, { buttons: 0 });
        if (typeof element.click === 'function') {
            element.click();
        }
        return true;
    }

    function getAliyunCaptchaPopup() {
        const popup = document.querySelector('#aliyunCaptcha-window-popup');
        return popup && isElementVisible(popup) ? popup : null;
    }

    function getAliyunCaptchaCheckboxIcon() {
        const icon = document.querySelector('#aliyunCaptcha-checkbox-icon.aliyunCaptcha-checkbox-icon') ||
            document.getElementById('aliyunCaptcha-checkbox-icon');
        return icon && isElementVisible(icon) ? icon : null;
    }

    function randomFloat(min, max) {
        return min + Math.random() * (max - min);
    }

    function getRandomPointInElement(element, paddingRatio) {
        const ratio = Number.isFinite(paddingRatio) ? paddingRatio : 0.22;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return { clientX: rect.left, clientY: rect.top };
        }
        const padX = Math.min(rect.width * ratio, rect.width * 0.42);
        const padY = Math.min(rect.height * ratio, rect.height * 0.42);
        const minX = rect.left + padX;
        const maxX = Math.max(minX, rect.right - padX);
        const minY = rect.top + padY;
        const maxY = Math.max(minY, rect.bottom - padY);
        return {
            clientX: randomFloat(minX, maxX),
            clientY: randomFloat(minY, maxY)
        };
    }

    function buildPointerInit(clientX, clientY, extra) {
        return Object.assign({
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY,
            screenX: window.screenX + clientX,
            screenY: window.screenY + clientY,
            button: 0,
            buttons: 0,
            detail: 1,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            width: 1,
            height: 1,
            pressure: 0.5
        }, extra || {});
    }

    function dispatchMouseLikeEvent(target, type, clientX, clientY, extra) {
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const mouseInit = buildPointerInit(clientX, clientY, extra);
        if (type.startsWith('pointer') && typeof PointerEvent !== 'undefined') {
            const pointerInit = Object.assign({}, mouseInit, {
                pressure: type === 'pointerdown' ? 0.5 : 0
            });
            target.dispatchEvent(new PointerEvent(type, pointerInit));
        }
        if (/^mouse|click|dblclick$/.test(type)) {
            target.dispatchEvent(new MouseEvent(type, mouseInit));
        }
    }

    function getEventTargetAt(clientX, clientY, fallback) {
        const hit = document.elementFromPoint(clientX, clientY);
        return hit instanceof HTMLElement ? hit : fallback;
    }

    function collectEventTargets(hitTarget, rootElement) {
        const chain = [];
        let node = hitTarget;
        while (node instanceof HTMLElement) {
            chain.push(node);
            if (node === rootElement) {
                break;
            }
            node = node.parentElement;
        }
        if (rootElement instanceof HTMLElement && !chain.includes(rootElement)) {
            chain.push(rootElement);
        }
        return chain;
    }

    async function simulateMouseMovePath(endX, endY, startX, startY) {
        const steps = randomInt(10, 22);
        for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const eased = progress * progress * (3 - 2 * progress);
            const clientX = startX + (endX - startX) * eased + randomFloat(-1.8, 1.8);
            const clientY = startY + (endY - startY) * eased + randomFloat(-1.8, 1.8);
            const target = getEventTargetAt(clientX, clientY, document.body);
            dispatchMouseLikeEvent(target, 'mousemove', clientX, clientY, { buttons: 0 });
            if (typeof PointerEvent !== 'undefined') {
                dispatchMouseLikeEvent(target, 'pointermove', clientX, clientY, { buttons: 0 });
            }
            await sleep(randomInt(14, 42));
        }
    }

    async function simulateHumanClick(element, options) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const settings = Object.assign({
            paddingRatio: 0.22,
            preDelay: [120, 380],
            hoverDelay: [60, 180],
            pressDelay: [55, 140],
            postDelay: [80, 200],
            approachDistance: [45, 110]
        }, options || {});

        await sleep(randomInt(settings.preDelay[0], settings.preDelay[1]));

        const point = getRandomPointInElement(element, settings.paddingRatio);
        const clientX = point.clientX;
        const clientY = point.clientY;
        const approach = settings.approachDistance;
        const startX = clientX + randomFloat(-approach[1], approach[1]);
        const startY = clientY + randomFloat(-approach[0], approach[0]);

        await simulateMouseMovePath(clientX, clientY, startX, startY);
        await sleep(randomInt(settings.hoverDelay[0], settings.hoverDelay[1]));

        const hitTarget = getEventTargetAt(clientX, clientY, element);
        const eventTargets = collectEventTargets(hitTarget, element);

        eventTargets.forEach((target) => {
            dispatchMouseLikeEvent(target, 'mouseover', clientX, clientY, { buttons: 0 });
            dispatchMouseLikeEvent(target, 'mouseenter', clientX, clientY, { buttons: 0 });
            if (typeof PointerEvent !== 'undefined') {
                dispatchMouseLikeEvent(target, 'pointerover', clientX, clientY, { buttons: 0 });
                dispatchMouseLikeEvent(target, 'pointerenter', clientX, clientY, { buttons: 0 });
            }
        });

        await sleep(randomInt(settings.pressDelay[0], settings.pressDelay[1]));

        const clickTarget = hitTarget.closest('#aliyunCaptcha-checkbox-icon, #aliyunCaptcha-checkbox-body, #aliyunCaptcha-checkbox-left, #aliyunCaptcha-checkbox-wrapper') || element;
        dispatchMouseLikeEvent(clickTarget, 'pointerdown', clientX, clientY, { buttons: 1, pressure: 0.5 });
        dispatchMouseLikeEvent(clickTarget, 'mousedown', clientX, clientY, { buttons: 1 });
        await sleep(randomInt(45, 125));
        dispatchMouseLikeEvent(clickTarget, 'pointerup', clientX, clientY, { buttons: 0, pressure: 0 });
        dispatchMouseLikeEvent(clickTarget, 'mouseup', clientX, clientY, { buttons: 0 });
        dispatchMouseLikeEvent(clickTarget, 'click', clientX, clientY, { buttons: 0 });

        await sleep(randomInt(settings.postDelay[0], settings.postDelay[1]));
        return true;
    }

    async function performAliyunCaptchaClick(timeoutMs) {
        const icon = getAliyunCaptchaCheckboxIcon() ||
            document.querySelector('#aliyunCaptcha-checkbox-body') ||
            document.querySelector('#aliyunCaptcha-checkbox-left');
        if (!icon) {
            return false;
        }

        await sleep(randomInt(450, 1100));
        await simulateHumanClick(icon, {
            paddingRatio: 0.18,
            preDelay: [180, 520],
            hoverDelay: [90, 240],
            pressDelay: [70, 160],
            postDelay: [120, 280],
            approachDistance: [55, 130]
        });
        await sleep(randomInt(600, 1200));

        const loading = document.querySelector('#aliyunCaptcha-loading');
        if (loading && isElementVisible(loading)) {
            await waitForCondition(() => {
                return !isElementVisible(loading) || !!document.querySelector('.aliyunCaptcha-checkbox-icon-checked');
            }, Math.min(timeoutMs, 12000), 400);
        }

        const popupGone = await waitForCondition(() => !getAliyunCaptchaPopup(), Math.min(timeoutMs, 15000), 400);
        return popupGone;
    }

    async function handleVerification(timeoutMs) {
        const deadline = Date.now() + (timeoutMs || 12000);
        let handled = false;
        let securityConfirmed = false;
        let aliyunClicked = false;
        let sliderHandled = false;
        let idleSince = Date.now();

        while (Date.now() < deadline) {
            let activeThisTick = false;

            if (!securityConfirmed) {
                const confirmBtn = getSecurityCheckConfirmButton(getSecurityCheckDialog());
                if (confirmBtn) {
                    await sleep(randomInt(SECURITY_DIALOG_CONFIRM_DELAY_MIN_MS, SECURITY_DIALOG_CONFIRM_DELAY_MAX_MS));
                    clickConfirmFast(confirmBtn);
                    await sleep(SECURITY_DIALOG_POST_CLICK_MS);
                    securityConfirmed = true;
                    handled = true;
                    activeThisTick = true;
                    idleSince = Date.now();
                }
            }

            if (!aliyunClicked && getAliyunCaptchaPopup()) {
                if (await performAliyunCaptchaClick(deadline - Date.now())) {
                    aliyunClicked = true;
                    handled = true;
                    activeThisTick = true;
                    idleSince = Date.now();
                }
            }

            if (!sliderHandled) {
                const rectMask = document.querySelector('#rectMask');
                if (rectMask && isElementVisible(rectMask)) {
                    rectMask.click();
                    await sleep(2000);
                    await simulateSlider();
                    // 只有当滑块弹层真的消失或出现成功标志才视为已处理，
                    // 否则下一轮 while 还能再次尝试拖动。
                    const sliderGone = !isElementVisible(rectMask) && !document.querySelector('#nc_1__scale_text > span, .nc_iconfont.btn_slide');
                    if (sliderGone) {
                        sliderHandled = true;
                    }
                    handled = true;
                    activeThisTick = true;
                    idleSince = Date.now();
                }
            }

            if (activeThisTick) {
                await sleep(SECURITY_DIALOG_POLL_MS);
                continue;
            }

            if (Date.now() - idleSince >= 1200) {
                break;
            }

            await sleep(SECURITY_DIALOG_POLL_MS);
        }

        return handled;
    }

    async function submitSurvey() {
        const submitBtn = getSubmitButton();
        if (!submitBtn) {
            return { ok: false, reason: 'no-submit-button' };
        }

        clickActionButton(submitBtn);
        const verificationHandled = await handleVerification();

        if (verificationHandled) {
            const completedAfterVerification = await waitForCondition(() => isCompletionPage(), 1800, 250);
            if (!completedAfterVerification) {
                const retrySubmit = getSubmitButton();
                if (retrySubmit && !getAliyunCaptchaPopup() && !getSecurityCheckDialog()) {
                    clickActionButton(retrySubmit);
                    await handleVerification();
                }
            }
        } else {
            await sleep(800);
        }

        // 只接受明确的完成页信号。按钮可能因加载、校验或 DOM 重绘暂时消失，不能据此判定成功。
        const navigated = await waitForCondition(() => {
            return isCompletionPage();
        }, 8000, 250);

        if (navigated) {
            return { ok: true };
        }
        // 提交按钮仍在且没跳转 => 大概率验证码未通过 / 提交被拒
        logWarning('提交未确认完成', { verificationHandled, stillHasSubmit: !!getSubmitButton() });
        return { ok: false, reason: 'verification-failed', verificationFailed: true };
    }

    async function runOneAutomationSubmission() {
        try {
            showAutomationProgress();
            captureAttemptQuotaSnapshot();

            const started = await ensureSurveyStarted();
            if (!isAutomationStillActive()) {
                return;
            }
            if (!started) {
                throw new Error('未识别到题目页或封面开始按钮');
            }

            const result = await fillAllQuestions();
            if (!isAutomationStillActive()) {
                return;
            }
            if (result && result.riskControlled) {
                // 已被风控判定并自动暂停，切勿再走下面的重试分支。
                return;
            }
            if (result && result.submitted) {
                await advanceToNextSubmission();
                return;
            }

            // Wait a bit to look more natural
            await scaledDelay(1100, 1800);
            if (!isAutomationStillActive()) {
                return;
            }

            const submitResult = await submitSurvey();
            if (!isAutomationStillActive()) {
                return;
            }
            if (!submitResult.ok) {
                if (submitResult.reason === 'no-submit-button') {
                    throw new Error('未找到提交按钮');
                }
                // 验证失败：不累计 failed，交给上层 catch 走重试。
                // failed 仅在用户主动「跳过当前份」时累加，避免重试期间放大失败计数。
                // 但连续多次验证失败通常是服务端按设备/IP 风控（脚本无法绕过），
                // 此时继续空撞只会把风控等级撞得更高，因此计数到阈值就主动暂停。
                if (submitResult.verificationFailed && noteVerificationFailure()) {
                    return;
                }
                throw new Error('提交未成功（可能验证码未通过）');
            }

            // 提交成功：主动推进到下一份，不被动依赖感谢页 handleCompletion。
            // 感谢页 URL 多变且 isCompletionPage 可能漏判，这里作为主续跑路径。
            await advanceToNextSubmission();
        } catch (error) {
            logWarning('自动化单次提交出错', error);
            const message = error.message || '未知错误';
            const session = loadAutomationSession();
            if (!session || isAutomationAborted()) {
                endAutomationSession(`提交出错: ${message}`);
                return;
            }
            restoreAttemptQuotaSnapshot(session);
            session.retryCount = Math.max(0, Number(session.retryCount) || 0) + 1;
            session.lastError = `本次执行失败：${message}`;
            session.attemptQuotaSnapshot = null;
            const maxRetries = Math.max(0, Number(session.maxRetries) || 2);
            if (session.retryCount <= maxRetries) {
                session.paused = false;
                saveAutomationSession(session);
                updateAutomationProgress();
                showToast(`执行失败，正在进行第 ${session.retryCount} 次重试。`, { duration: 3500 });
                scheduleNextSubmissionRedirect(session);
                return;
            }
            session.paused = true;
            saveAutomationSession(session);
            updateAutomationProgress();
            showToast('重试次数已用完，任务已暂停。', { duration: 5000 });
        }
    }

    // 提交成功后减少剩余份数并跳回问卷首页续跑下一份，或正常结束。
    async function advanceToNextSubmission() {
        if (isCompletionPage()) {
            handleCompletion();
            return;
        }
        const session = loadAutomationSession();
        if (!session) {
            // 没有会话（可能已被 handleCompletion 处理过），交给后续 init 检查
            return;
        }
        let remaining = Math.max(0, Number(session.remaining) || 0);
        remaining = Math.max(0, remaining - 1);
        session.remaining = remaining;
        session.retryCount = 0;
        session.verifyFailures = 0;
        session.lastError = '';
        session.attemptQuotaSnapshot = null;
        session.completionHandled = false;
        saveAutomationSession(session);

        if (remaining <= 0) {
            endAutomationSession('所有自动化提交任务已完成！');
            return;
        }

        ensureTotalCountForAutomation();
        scheduleNextSubmissionRedirect(session);
    }

    async function executeAutoFillAndSubmit() {
        if (!isAutomationStillActive()) {
            return;
        }
        await runOneAutomationSubmission();
    }

    async function withQuotaRollback(callback) {
        let snapshot = null;
        try {
            snapshot = localStorage.getItem(QUOTA_STATE_KEY);
        } catch (error) {}
        try {
            return await callback();
        } finally {
            try {
                if (snapshot === null) {
                    localStorage.removeItem(QUOTA_STATE_KEY);
                } else {
                    localStorage.setItem(QUOTA_STATE_KEY, snapshot);
                }
            } catch (error) {}
        }
    }

    async function previewSelectionPlan() {
        syncStateFromDom();
        saveConfig();
        clearAutomationStoppedFlag();
        const started = await ensureSurveyStarted();
        if (!started) {
            showToast('未识别到题目页或开始按钮，无法生成预览。');
            return;
        }
        updateAllRelationVisibility();
        const highlighted = [];
        getVisibleQuestionNodes().forEach((node) => {
            const questionId = extractQuestionId(node, 0);
            const question = State.config.questions.find((item) => String(item.id) === String(questionId));
            if (!question || question.enabled === false) {
                return;
            }
            const relations = parseRelations(node);
            if (relations.length && !isRelationSatisfied(relations)) {
                return;
            }
            node.classList.add('wjx-preview-highlight');
            highlighted.push(node);
            if (['radio', 'rating', 'dropdown', 'checkbox'].includes(question.type)) {
                const indexes = question.type === 'checkbox'
                    ? pickCheckboxIndicesForQuestion(question)
                    : [pickOptionIndexForQuestion(question)];
                const options = getChoiceElements(node, question.type);
                indexes.forEach((index) => {
                    if (options[index]) {
                        options[index].classList.add('wjx-preview-highlight');
                        highlighted.push(options[index]);
                    }
                });
            }
        });
        showToast(`已高亮 ${highlighted.filter((node) => node.matches('.field, .div_question, .ui-field-contain')).length} 道题的预选结果。`);
        setTimeout(() => highlighted.forEach((node) => node.classList.remove('wjx-preview-highlight')), 6000);
    }

    async function fillToSubmitAndPause() {
        syncStateFromDom();
        saveConfig();
        clearAutomationStoppedFlag();
        try {
            const result = await withQuotaRollback(async () => {
                const started = await ensureSurveyStarted();
                if (!started) {
                    throw new Error('未识别到题目页或开始按钮');
                }
                return fillAllQuestions({ stopBeforeSubmit: true });
            });
            if (result && result.readyToSubmit) {
                showToast('已填写到提交前，请检查答案后手动提交。', { duration: 5000 });
            }
        } catch (error) {
            logWarning('填写到提交前失败', error);
            showToast(`填写失败：${error.message || '未知错误'}`);
        }
    }

    async function previewFillOnce() {
        syncStateFromDom();
        saveConfig();
        // 预览填写是独立入口，必须复位上一轮自动化留下的停止标志，
        // 否则 fillSorting 等按 isAutomationInterrupted 提前退出的路径会静默漏填。
        clearAutomationStoppedFlag();
        if (!State.config.questions.length) {
            showToast('当前没有可填写的题目配置。');
            return;
        }
        let quotaSnapshot = null;
        try {
            quotaSnapshot = localStorage.getItem(QUOTA_STATE_KEY);
        } catch (error) {}
        try {
            const started = await ensureSurveyStarted();
            if (!started) {
                showToast('未识别到题目页或开始按钮，无法预览。');
                return;
            }
            // 仅填写当前可见页，不翻页、不提交
            syncQuestionConfigForCurrentPage();
            updateAllRelationVisibility();
            const visibleNodes = getVisibleQuestionNodes();
            if (!visibleNodes.length) {
                showToast('当前页面未识别到可填写题目。');
                return;
            }
            const filledIds = new Set();
            for (let pass = 0; pass < 8; pass++) {
                updateAllRelationVisibility();
                let filledInPass = false;
                for (const node of getVisibleQuestionNodes()) {
                    const questionId = extractQuestionId(node, 0);
                    if (filledIds.has(questionId)) {
                        continue;
                    }
                    const relations = parseRelations(node);
                    if (relations.length && !isRelationSatisfied(relations)) {
                        continue;
                    }
                    const question = State.config.questions.find((item) => String(item.id) === String(questionId));
                    if (!question || question.enabled === false) {
                        continue;
                    }
                    const filled = await fillQuestion(question, node);
                    if (!filled) {
                        continue;
                    }
                    filledIds.add(questionId);
                    updateAllRelationVisibility();
                    await scaledDelay(120, 320);
                    filledInPass = true;
                }
                if (!filledInPass) {
                    break;
                }
            }
            showToast(`预览完成：已填写 ${filledIds.size} 道题（未提交，可检查后手动操作）。`);
        } catch (error) {
            logWarning('预览填写出错', error);
            showToast(`预览填写出错: ${error.message || '未知错误'}`);
        } finally {
            try {
                if (quotaSnapshot === null) {
                    localStorage.removeItem(QUOTA_STATE_KEY);
                } else {
                    localStorage.setItem(QUOTA_STATE_KEY, quotaSnapshot);
                }
            } catch (error) {}
        }
    }

    async function simulateSlider() {
        const slider = document.querySelector('#nc_1__scale_text > span') || document.querySelector('.nc_iconfont.btn_slide');
        if (!slider) {
            return;
        }
        // 读取轨道实际宽度，避免硬编码 300px 导致拖不到底或越界
        const track = document.querySelector('#nc_1_n1z, .nc_iconfont.btn_slide, .nc-lang-cnt, .scale_text') || slider.parentElement;
        const trackRect = (track && track.getBoundingClientRect) ? track.getBoundingClientRect() : slider.getBoundingClientRect();
        const sliderRect = slider.getBoundingClientRect();
        const startX = sliderRect.left + sliderRect.width / 2;
        const startY = sliderRect.top + sliderRect.height / 2;
        // 目标位移 = 轨道宽度 - 滑块宽度，留一点余量
        const totalWidth = Math.max(40, (trackRect.width || 300) - sliderRect.width - 4);

        const dispatchDrag = (type, clientX, clientY) => {
            const target = type === 'mousemove' || type === 'mouseup' ? document : slider;
            target.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY
            }));
        };

        dispatchDrag('mousedown', startX, startY);

        const steps = randomInt(15, 25);
        for (let i = 0; i <= steps; i++) {
            await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
            const progress = i / steps;
            const clientX = startX + totalWidth * progress + (Math.random() * 6 - 3);
            const clientY = startY + (Math.random() * 6 - 3);
            dispatchDrag('mousemove', clientX, clientY);
        }

        dispatchDrag('mouseup', startX + totalWidth, startY);
    }

    init();
})();
