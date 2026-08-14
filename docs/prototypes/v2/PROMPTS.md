# KA Pilot v2 生图提示词集

> 用途：记录本轮内置生图模型的最终提示方向，方便后续重生成、局部修订和与 Claude 对齐。

## 共享提示

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web application prototype
Product: KA Pilot 投放经营平台
Canvas: full 16:10 desktop application screenshot, no browser chrome, no device frame
Sidebar: 我的工作 / 投放任务 / 数据分析 / 账户与素材 / 自动化 / 报告
Style: premium Chinese enterprise SaaS; white/light cool gray; deep navy typography;
electric blue primary; teal success; amber risk; coral anomaly; restrained violet AI;
12-column grid; crisp borders; subtle shadows; compact rounded corners; dense but breathable
Data: fictional demo only; no real company data or real employees
Avoid: chat-box homepage, external brand logos, watermark, decorative illustration,
excessive gradients and glassmorphism
```

## 页面特定提示

| 页面 | 特定要求摘要 |
|---|---|
| P01 | 优先级队列；对象、原因、证据、建议、动作；待确认变更集；SOP；效果回收 |
| P02 | 目标差距树；任务健康；聚合阻塞；经营简报；需要拍板；无个人绩效排名 |
| P03 | 任务库；预算、考核价、RTA、版位、阶段；六项准备度；里程碑 |
| P04 | 任务详情；九个业务 Tab；策略卡；开户到监控 SOP；阻塞和时间线 |
| P05 | 认证 Dataset View、Metric、Dimension、Segment；数据健康；图表＋透视；Agent 洞察 |
| P06 | 三栏报表设计器；数据视图、Question、组件、属性；查询预估；Agent 搭建 |
| P07 | 官方/团队/个人策略；版位、投法、出价、RTA、阶段、样本、成本和跑量证据 |
| P08 | 策略地图；版位→投法→目标→RTA→预算→账户→阶段；商品素材条件；版本对比 |
| P09 | 账户生命周期；容量、余额、健康、任务匹配；批量操作进入变更预览 |
| P10 | 商品×素材矩阵；素材卡；拆解；Agent 证据；复刻谱系和测试任务 |
| P11 | 官方工作流模板；自动化规则；为什么未触发；RUNNING/WAITING/UNKNOWN；系统健康 |
| P12 | 唯一工作流画布；十类领域节点；类型、执行身份、副作用、幂等、重试、权限 |
| P13 | 不可变运行版本；阶段、节点日志、变更集、确认、权限、冲突锁、对账和效果窗口 |
| P14 | 报告库；月度结算单向导；字段映射变化；缺失校验；口径和新鲜度；Agent 摘要 |
| P15 | 任务详情上的全局 Agent 抽屉；上下文 Chip；结论证据动作；Patch 全部/局部接受 |
| P16 | 四手机状态：只读简报、待确认变更集、执行中、部分成功；按钮驱动产品工作流 |

## 参考图

- v1 经营总览：统一企业级视觉密度；
- v1 操作中心：工具、运行和确认组件；
- v1 商品素材：图片卡片与分析抽屉；
- v2 任务详情：后续修订报告页和全局 Agent 页时作为新导航壳参考。

