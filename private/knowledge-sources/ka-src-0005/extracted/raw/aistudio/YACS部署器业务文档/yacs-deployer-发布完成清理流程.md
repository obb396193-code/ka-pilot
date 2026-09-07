# [核心功能知识条目 - YACS部署器发布完成清理流程]

## 1. 功能定义与边界 (Scope)

**业务描述**：该功能用于在 Kubernetes 应用发布完成后，自动清理历史废弃的 Deployment 资源和代码包 ConfigMap，以避免集群资源浪费和资源碎片化。

**用户角色**：YACS（Yet Another Container Service）部署系统，在应用发布流程完成后自动触发。

**触发场景**：
- 应用发布成功后，清理旧版本的 Deployment
- DaemonSet 发布手动失败时，清理临时节点标签
- 清理无用的代码包 ConfigMap

## 2. 核心逻辑链路 (Logic Trace)

**执行时序**：
```
MetaQ消息接收 → 消息校验 → 加载发布单 → 判断发布结果 → 清理无用Workload → 清理ConfigMap → 清理临时标签
```

**关键类/接口映射**：

| 节点 | 类名/方法 | 说明 |
|------|-----------|------|
| 消息消费 | `MetaqDeployFinishedConsumer.consumeMessage()` | MetaQ 消息监听入口，不可变动 |
| 消息校验 | `DeployFinishedMessage` 解析 | 校验 deployOrderId 和 result 字段 |
| 发布单加载 | `DeployOrderManager.load()` | 根据 ID 加载发布单实体 |
| 清理Workload | `cleanUselessWorkload()` | 核心清理逻辑，根据 k8sAppKind 分发 |
| 清理Deployment | `cleanUselessDeployment()` | 清理副本数为0且创建时间超过7天的Deployment |
| 清理ConfigMap | `cleanUselessConfigMapForCodePacket()` | 清理无主的代码包ConfigMap |
| 清理标签 | `KubeDaemonSetManager.batchDeleteNodeLabel()` | DaemonSet专用，清理临时节点标签 |

## 3. 业务规则辞典 (Business Rule Dictionary)

**硬性校验 (Hard Constraints)**：

1. **消息重试限制**：消息重试超过 3 次后，强制消费成功并记录 SOS 日志
   - 错误码：无（通过日志记录）
   - 规则：`reconsumeTimes > 3` 时返回 `CONSUME_SUCCESS`

2. **消息有效性校验**：
   - 必须包含 `deployOrderId` 和 `result` 字段
   - 缺失时直接消费成功，避免阻塞队列

3. **清理条件判断**：
   - 仅当 `result == SUCCESS` 且 `appInstanceType == k8s_pod` 时执行清理
   - 仅当 `deployCategory != scale` 时执行清理（避免缩容为0时清理基线）

4. **Deployment清理规则**：
   - 目标副本数 `toReplicas` 不能为 0
   - 当前副本数 `currentRealReplicas` 和就绪副本数 `readyReplicas` 必须都为 0
   - 创建时间必须超过 7 天（代码中设置为 0 天，实际应配置为 7）

5. **ConfigMap清理规则**：
   - 必须包含标签 `JCK_LABEL_USED_FOR_CODE_PACKET_KEY=true`
   - 必须包含 `appId` 和 `envId` 标签
   - 对应的 Workload 必须不存在

**计算逻辑**：

- **重试次数统计**：通过 `messageExt.getReconsumeTimes()` 获取
- **时间判断**：使用 `Calendar.add(Calendar.DATE, -7)` 计算 7 天前的时间点

## 4. 数据实体图谱 (Data Schema)

**核心表/实体字段**：

**DeployOrder（发布单实体）**：
- `id`：发布单主键
- `deployCategory`：发布分类（scale扩缩容、deploy发布等）
- `appInstanceType`：应用实例类型（k8s_pod、ecs、docker等）
- `k8sAppKind`：K8s应用类型（Deployment、DaemonSet、StatefulSet）
- `k8sDeployGoals`：K8s部署目标列表（JSON格式）
- `appId`：应用ID
- `envId`：环境ID

**DeployFinishedMessage（发布完成消息）**：
- `deployOrderId`：发布单ID
- `result`：发布结果（SUCCESS、FAILED_MANUAL、FAILED、CANCEL）

**DeployOrderResult（发布结果枚举）**：
- `UNCONFIRMED(0)`：待确认
- `SUCCESS(1)`：成功
- `FAILED_MANUAL(2)`：手动失败
- `FAILED(4)`：失败
- `CANCEL(6)`：取消

**AppInstanceType（应用实例类型）**：
- `ecs`：ECS实例
- `docker`：Docker容器
- `k8s_pod`：K8s Pod
- `sae_pod`：SAE Pod

**K8sAppKind（K8s应用类型）**：
- `Deployment`：无状态应用
- `DaemonSet`：守护进程集
- `StatefulSet`：有状态应用

## 5. 常见坑点与技术债 (Caveats)

**历史遗留逻辑**：

1. **时间配置问题**：代码中第 292 行 `oneWeekAgoCalendar.add(Calendar.DATE, 0)` 实际设置为 0 天，注释说应该为 7 天，这是一个配置错误，会导致所有符合条件的 Deployment 立即被清理

2. **硬编码的清理策略**：清理逻辑中硬编码了 7 天的时间阈值，缺乏配置化支持

**并发/幂等处理**：

1. **消息幂等性**：
   - 通过 `deployOrderId` 加载发布单，如果发布单不存在则直接返回成功
   - 清理操作本身是幂等的，删除不存在的资源会返回成功或忽略

2. **重试机制**：
   - 使用 MetaQ 的自动重试机制，最多重试 3 次
   - 超过 3 次后强制消费成功，避免死信队列堆积

3. **批量处理**：
   - `consumer.setConsumeMessageBatchMaxSize(1)` 设置为单条消费，避免批量处理失败影响多条消息

**中间件依赖**：

1. **MetaQ（消息队列）**：
   - Topic：`TOPIC_DEPLOY_ORDER_DEPLOY_FINISHED`
   - Consumer Group：`CID_yacs-deployer-deploy-order-deploy-finished`
   - 消费模式：集群消费（默认）
   - 重试策略：最多重试 3 次，超过后强制成功

2. **JST（Kubernetes API）**：
   - `KubeDeploymentManager`：管理 Deployment 资源
   - `KubeDaemonSetManager`：管理 DaemonSet 资源
   - `KubeConfigMapManager`：管理 ConfigMap 资源
   - `KubeAppControllerManager`：检查 Workload 是否存在

**风险点**：

1. **资源误删风险**：如果 ConfigMap 的标签配置错误，可能误删正在使用的 ConfigMap
2. **清理失败影响**：清理失败会返回 `RECONSUME_LATER`，可能导致消息重试
3. **DaemonSet标签清理**：手动失败时清理临时标签，如果清理失败可能导致节点标签残留
