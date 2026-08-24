# B21 工作流“为什么没触发”诊断实施计划

1. 先写失败测试：严格身份/版本/时间、检查唯一性/连续顺序、证据与 retryAt。
2. 实现 blocked/incomplete/eligible 三态、primary blocker 和 nextActionCode。
3. 增加稳定排序、深冻结、fingerprint 与重算 hash 后语义完整性门。
4. 跑 Domain/全仓质量门禁，更新状态、总账、台账和 arch P-028。

