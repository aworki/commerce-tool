# Web 即 Skills — 路由优先闭环 MVP

Status: Draft

## One-liner
把一个没有 OpenAPI 的运营后台任务，转成一个可复用的 skill：系统先尝试 API，失败后退化为网页执行，再不行由用户录制示范；一旦任务完成，系统自动沉淀出可复用的 skill，供下次直接调用。

## Why this matters
多数运营后台承载了大量重复劳动，但没有可直接调用的 API。真正有价值的不是“AI 会点网页”，而是：
- 系统能在 API / 网页 / 用户录制之间正确路由
- 一次成功执行后，能沉淀为可复用的 skill
- 第二次面对同类任务时，明显更快、更稳

## MVP scope
首版严格限制在以下边界内：
- 单后台
- 单 web page
- 单页内的一类结构化任务族
- skill 的最小单位是“单任务模板”
- 成功标准是“对象身份校验 + 页面结果验证”
- 记录结构化执行证据
- 用 5-10 个样本组成小评估集，并包含 refusal / negative cases

这里的“单页任务族”指的是：同一个页面内 2-3 类稳定、可验证的结构化任务，例如：
- 字段编辑
- 开关切换
- 简单表单新增

首版不追求跨页面泛化，也不追求长工作流。

## In scope
### 1. Route-first execution
同一个自然语言任务，按以下优先级执行：
1. API path
2. Web path
3. User recording fallback

### 2. Task-template skill
首版 skill 不是单动作，也不是长工作流，而是一个可参数化、可验证结果的单任务模板。

示例：
- 修改文章标题
- 修改摘要
- 修改标签
- 修改某个短文本配置字段

### 3. Success verification
没有显式成功证据，不算成功。

首版采用双重验证：
1. 对象身份校验
2. 页面结果验证

也就是说，必须同时满足：
- 编辑的是正确对象，而不是碰巧文本相同的错误记录
- 目标字段或控件的结果已真实生效

例如：
- 目标对象的唯一标识（如 URL、ID、slug、列表主键）匹配
- 字段值在页面中已更新
- 保存提示出现且结果可见
- 目标对象显示修改后的内容

只看“页面看起来改了”不算成功。

### 4. Structured evidence
每次执行至少记录：
- task text
- chosen route
- page URL
- target object identity
- target field / control identity
- before value
- after value
- verification result
- attempt timestamp
- failure stage / failure reason
- skill created or not
- skill reused or not

如果后续调试发现仍然不足，再补 locator、截图或更细的 DOM 证据；但首版至少要能明确回答“改的是谁、改了什么、在哪一页、为什么判成成功或失败”。

### 5. Small evaluation set
准备 5-10 个同类任务样本，验证：
- 第一次执行能成功
- 第二次同类任务能复用 skill
- 更换参数后仍能复用

## Out of scope
- 通用网页登录
- 账号密码托管
- 多后台 / 多租户
- 富文本正文编辑
- 长工作流 skill
- 共享市场 / skill store
- 全量页面轨迹回放
- 生产高风险不可逆操作

## Security boundary
首版只面向：
- 单个已登录后台
- 复用现成会话，不保存密码
- 单个 web page 内的低风险、可验证、尽量可回退的编辑动作
- skill 只能在产出它的那个 page 内复用

首版必须有可执行护栏：
- page scope 绑定：skill 只能跑单一 page
- 字段 / 控件白名单：只允许预先确认过的结构化目标
- 不满足白名单或 page scope 时，直接拒绝执行

禁止首版碰：
- 真正的通用网页登录能力
- 凭证存储
- 跨租户后台
- 高风险 destructive actions
- 跨页面 skill 复用
- 无白名单的任意编辑

录制 fallback 也必须遵守同样的 page scope 和白名单边界。

## Product definition
这个项目的核心不是 browser automation，而是 capability routing + skill generation。

换句话说：
- Router 决定怎么做
- Executor 负责做成
- Skill Builder 负责把一次成功变成可复用能力

## Minimal architecture
首版采用 concrete-first，而不是 abstraction-first。

```text
[Natural language task]
          |
          v
 +----------------------+
 | Page-scoped handler   |
 | (one page task family)|
 +----------------------+
    |       |        |
    |       |        |
    v       v        v
 locate   execute   verify
 target   task      identity + result
    \       |        /
     \      |       /
      v     v      v
   +----------------------+
   | Structured evidence  |
   +----------------------+
             |
             v
   +----------------------+
   | Page-scoped template |
   | + simple registry    |
   +----------------------+
             |
             v
     [Reuse on same page]
```

录制 fallback 不是另一套系统，而是另一种 step 来源：

```text
Task request
   |
   +--> system-planned steps
   |
   +--> user-recorded steps
            |
            v
   shared execution / verification / evidence / template flow
```

首版不要求先做完整通用 router；先证明一个具体页面上的任务族能跑通，再决定哪些接口值得抽象。

简化版 registry 只需要：
- 单 page scope
- 单模板或极少模板
- 显式 version
- 失败后标记失效 / 需重教

首版不做复杂匹配、自动修复、冲突解决或完整生命周期系统。

## Key decisions already locked
### Skill unit
单任务模板，而不是：
- 单动作
- 长工作流

### First task family
单页内的一类结构化任务族，而不是单字段玩具能力。

例如同一页面内可以包含：
- 结构化字段编辑
- 开关切换
- 简单表单新增

### Success criteria
对象身份校验 + 页面结果验证，而不是“点到了/提交了就算成功”。

### Evidence level
结构化证据，而不是只有基础日志。

### Implementation strategy
先做 concrete-first 的单页闭环，再抽象值得抽象的接口；不先做完整通用 router。

### Registry strategy
先做简化版 page-scoped registry，不先做完整平台化生命周期系统。

### Recording strategy
录制 fallback 作为另一种 step 来源，后续复用同一套 execution / verification / evidence / template 流程。

### Shared primitives
首版只抽 4 个共用原语：
- locate target
- capture before state
- verify identity + result
- emit evidence

其他抽象一律延后。

## Failure modes to defend against
- 路由选错
- 页面元素变化导致定位失败
- 编辑动作触发了，但字段未真正保存
- 页面刷新慢导致误判成功
- 录制演示包含脏上下文
- 抽象出的 skill 参数绑定错误
- skill 复用失败但未正确降级

## What success looks like
如果 MVP 成功，应该能清楚证明：
1. 系统能在单个 page 内完成一个结构化任务族中的具体任务
2. 系统能完成对象身份校验 + 页面结果验证，而不是伪成功
3. 用户示范一次后，系统能产出 page-scoped skill
4. 同页同类任务第二次可直接复用 skill
5. 换参数后仍然能复用，而不是一次性回放
6. 遇到 wrong page / wrong target / stale template / disallowed field 时，系统会拒绝执行或要求重教

建议跟踪的工程指标：
- first-run success rate
- reuse success rate
- verification false-positive rate
- fallback rate
- refusal correctness rate

## Build order
1. 选定一个真实后台、一个具体 page、一个单页任务族
2. 先 hard-code 打通一个具体任务的端到端闭环
3. 实现对象身份校验 + 页面结果验证
4. 实现 evidence schema
5. 抽出最小的 task-template skill schema
6. 保存 page-scoped template 到简化版 registry
7. 打通同页同类任务的第二次 skill reuse
8. 接入 recording fallback，作为另一种 step 来源
9. 建立 5-10 个样本的小评估集，并覆盖 refusal / negative / stale-template 场景

顺序原则：先证明一个具体页面能跑通，再抽象；不要 abstraction-first。

## Why this is the right MVP
这个 MVP 足够窄，能够避免“平台化过早”；同时又足够完整，能够验证真正重要的命题：

> 网站能力是否可以被稳定萃取成可复用的 skill。

如果这点成立，后续才值得继续扩到：
- 更多任务家族
- 更多后台
- skill 版本化
- 分享/安装
- 自动评估与回退
