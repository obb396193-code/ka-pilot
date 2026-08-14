# KA Pilot v2 全页面概念原型

> 生成日期：2026-08-14  
> 生成方式：OpenAI 内置生图模型，`ui-mockup` 高保真界面原型。  
> 产品依据：`docs/plans/2026-08-14-KA投放经营平台-v2-design.md`。  
> 声明：所有任务、账户、人员、商品、素材、金额和指标均为虚构演示信息；图片用于产品讨论，不代表功能已实现或数据口径已确认。
> 导航说明：图片中的六项左侧导航仅是本轮视觉壳假设，**不代表一级导航和菜单分组已确定**。产品能力与业务对象以 `docs/plans/2026-08-14-KA投放经营平台-讨论版-v0.4.md` 为最新讨论基准。

## 网页画册

浏览器直接打开 [`index.html`](./index.html)，即可按 P01 → P16 顺序查看全部原型。网页只负责排版和说明，页面主体仍是原始图片，不是可交互前端。

## 统一视觉系统

- 桌面端高密度企业工作台，白色/极浅冷灰底；
- 深海军蓝文字、电光蓝主色、青绿成功、琥珀风险、珊瑚红异常、克制紫色 AI；
- 左侧暂用六项视觉占位以保持整套原型一致；最终一级导航待完整信息架构讨论后确定；
- 顶部全局搜索、时间、任务、渠道和消息；
- Agent 以右侧抽屉或浮动入口出现，不做聊天框首页；
- 写操作先展示变更集，再出现确认入口。

## 页面索引

### P01 优化师·我的工作

![P01 我的工作](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P01-my-work.png)

验证今日待处理、待确认、运行中、效果回收和数据新鲜度。

### P02 负责人·团队经营

![P02 团队经营](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P02-team-overview.png)

验证目标差距树、任务健康、聚合阻塞、经营简报和需要拍板事项。

### P03 投放任务库

![P03 投放任务](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P03-campaign-tasks.png)

验证任务配置、账户/充值/商品/素材/策略/基建准备度和里程碑。

### P04 投放任务详情

![P04 任务详情](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P04-task-detail.png)

验证任务中心化控制台，以及投放策略和开户到监控 SOP 的明确分离。

### P05 数据探索 Explore

![P05 数据探索](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P05-data-explore.png)

验证认证指标、维度、数据视图、数据健康、交叉筛选和表内 Agent。

### P06 自助报表设计器

![P06 自助报表](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P06-report-builder.png)

验证官方数据视图、可复用 Question、组件布局、查询预估和 Agent 建表。

### P07 投放策略库

![P07 投放策略](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P07-strategy-library.png)

验证策略是广告业务打法，不是工作流触发器；展示版位、投法、RTA、阶段、样本和效果。

### P08 投放策略详情

![P08 策略详情](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P08-strategy-detail.png)

验证版位、投法、RTA、预算、账户矩阵、商品素材组合、适用条件和版本对比。

### P09 账户池

![P09 账户池](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P09-account-pool.png)

验证账户生命周期、容量、余额、健康、任务匹配和批量变更预览。

### P10 商品与素材

![P10 商品素材](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P10-product-creative.png)

验证商品×素材矩阵、素材卡片、内容拆解、生命周期、复刻谱系和测试任务。

### P11 自动化中心

![P11 自动化](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P11-automation-center.png)

验证官方模板、个人工作流、自动化规则、为什么没触发、运行状态和原子能力。

### P12 工作流设计器

![P12 工作流画布](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P12-workflow-builder.png)

验证唯一画布、投放领域节点、Agent 草稿、类型校验、执行身份、幂等和发布流程。

### P13 运行与变更确认

![P13 运行确认](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P13-run-change-set.png)

验证不可变版本、节点状态、变更集、权限、冲突锁、Multica 对账和未来效果回收。

### P14 报告与结算

![P14 报告结算](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P14-reports-settlement.png)

验证月度结算单模板版本、字段映射、缺失校验、数据新鲜度和 Agent 经营洞察。

### P15 全局 Agent

![P15 全局 Agent](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P15-global-agent.png)

验证显式上下文、实时引用、结论—证据—动作、结构化资产和 Patch 接受流程。

### P16 钉钉互动卡片

![P16 钉钉卡片](/Users/aik/Desktop/投放agent/docs/prototypes/v2/P16-dingtalk-cards.png)

验证只读查询、媒体写确认、执行中动态更新和部分成功后的重试闭环。

## 注意

- 生图原型中的小字号文字存在模型生成误差，进入可交互原型阶段后需按产品字段重新排版。
- 图片表达的是信息架构和交互方向，不直接作为前端像素稿。
- P05、P09 使用更宽横向画布，其余页面为 1536×1024。
