# ka-src-0005 压缩包逐文档导读

> 权限：confidential，仅授权本机 Agent/审查角色使用。
> 本文的“介绍”是机器生成的抽取式导读，帮助快速判断文件讲什么；不等于人工复核、正式产品口径或可发布知识。
> 子文件状态统一为 `extractive_unreviewed / unreviewed_child / not_ready`；需要正式引用时必须单篇提升、补证和审查。

## 覆盖概况

- 清单文件：671
- 已生成介绍：671
- 唯一 child_asset_id：671
- 内容质量：{"empty": 27, "short": 207, "stub": 35, "substantive": 402}
- 异常标记：{"contains_nul": 11, "credential_sanitized": 17, "duplicate_content_group_member": 44, "exact_duplicate": 33, "historical_or_deprecated_path": 14, "invalid_json": 3, "pdf_extension_but_plain_text": 5}
- 产品相关性：{"background_only": 405, "cannot_assess": 62, "conditional_candidate": 173, "direct_candidate": 8, "not_relevant": 23}
- 建议动作：{"exclude_from_product": 58, "reference_only": 405, "restore_source_then_assess": 27, "selective_extract": 6, "verify_before_use": 175}

## 状态含义

- `substantive`：有较多可读正文；仍不代表内容有效或最新。
- `short`：有正文但较短。
- `stub`：占位、链接提示或极短片段。
- `empty`：没有可用正文。
- `pdf_extension_but_plain_text`：文件名是 PDF，实际为 UTF-8 文本导出，不是可渲染 PDF。
- `exact_duplicate`：与包内另一文件逐字节相同。

## AIStudio 与模型接入（139）

### AK申请须知（AI Studio&API）／主AK FY26预算配置

- child_asset_id：`ka-src-0005-child-a37aeaf9493f7ba7`
- 相对路径：`raw/aistudio/AIStudio/AK申请须知（AI Studio&API）／主AK FY26预算配置`
- 讲什么：围绕“AK申请须知（AI Studio&API）／主AK FY26预算配置”展开，正文主要说明：确认FY26预算是否已经正确维护 需要维护子AK FY26的预算，否则子AK 4.1失效。 章节线索包括：确认FY26预算是否已经正确维护、需要维护子AK FY26的预算，否则子AK 4.1失效。
- 主题：安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、平台与部署、权限与凭证
- 判断理由：涉及模型 Provider 的凭证、预算、额度或配额治理，对 Agent 运行有间接价值，但时效性很强。
- 可提取：可形成 Provider 账户、配额、费用和 secret_ref 的核验清单。
- 借鉴边界：必须回到当前 AIStudio/IdeaLab 官方页面实证；不把历史财年、价格或 AK 操作写成产品规则。
- 审查/发布：`unreviewed_child / not_ready`

### AK申请须知（AI Studio&API）／关于FY26年度预算申请及AK余额使用

- child_asset_id：`ka-src-0005-child-3131020b1569ae00`
- 相对路径：`raw/aistudio/AIStudio/AK申请须知（AI Studio&API）／关于FY26年度预算申请及AK余额使用`
- 讲什么：围绕“AK申请须知（AI Studio&API）／关于FY26年度预算申请及AK余额使用”展开，正文主要说明：为了确保财务流程的规范性，请注意以下关于FY26年度预算申请及现有AK余额使用的重要事项 财务规定，预算使用不允许跨财年。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、平台与部署、权限与凭证
- 判断理由：涉及模型 Provider 的凭证、预算、额度或配额治理，对 Agent 运行有间接价值，但时效性很强。
- 可提取：可形成 Provider 账户、配额、费用和 secret_ref 的核验清单。
- 借鉴边界：必须回到当前 AIStudio/IdeaLab 官方页面实证；不把历史财年、价格或 AK 操作写成产品规则。
- 审查/发布：`unreviewed_child / not_ready`

### IDEAs应用实践模版／Agent构建方法-运维&排障机器人为例

- child_asset_id：`ka-src-0005-child-1a7f5eeb38d59ba6`
- 相对路径：`raw/aistudio/AIStudio/IDEAs应用实践模版／Agent构建方法-运维&排障机器人为例`
- 讲什么：围绕“IDEAs应用实践模版／Agent构建方法-运维&排障机器人为例”展开，正文主要说明：使用AI Studio开发运维机器人用于链路排障。 以下是具体的开发步骤和指南。 章节线索包括：一、概述、二、事前准备、构建思路、前期规划、三、具体搭建步骤。
- 主题：数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### IDEAs应用实践模版／客服机器人(FLOW版）

- child_asset_id：`ka-src-0005-child-0547417450c68756`
- 相对路径：`raw/aistudio/AIStudio/IDEAs应用实践模版／客服机器人(FLOW版）`
- 讲什么：围绕“IDEAs应用实践模版／客服机器人(FLOW版）”展开，正文主要说明：尝试在AI Studio平台构建智能客服机器人，让您的答疑工作更高效省心！ Step1确定目标：首先，你要明确答疑的内容，服务的产品，比如xx平台、xx领域。 章节线索包括：事前准备、开始搭建、新建一个FLOW型IDEAs、新增知识库节点、添加LLM节点。
- 主题：大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型

- child_asset_id：`ka-src-0005-child-623f194dca5db6ec`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型”展开，正文主要说明：登录AI Studio，进入顶部导航Workspace 在左侧导航栏点击【创建IDEAs】或 在工作区进入指定团队，在IDEAs tab点击【创建IDEAs】。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试

- child_asset_id：`ka-src-0005-child-6236b9efe9e4fae9`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试”展开，正文主要说明：IDEAs创建完成后，您可以选择相应的IDEAs并进入其调试界面。 作为应用开发者，你将针对你的IDEAs进行以下开发活动。
- 主题：大模型与 Agent、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／上下文

- child_asset_id：`ka-src-0005-child-23297ed459dfb538`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／上下文`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／上下文”展开，正文主要说明：如果IDEAs希望利用私有知识库数据来影响模型的对话内容，可以通过使用上下文功能来实现。 您可以点击上下文区域中的“添加”按钮，以关联你预先准备好的知识库。 章节线索包括：dui概述、上下文管理、变量绑定、智能助手、生成型。
- 主题：数据分析、大模型与 Agent、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／保存&发布

- child_asset_id：`ka-src-0005-child-b76791291588787e`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／保存&发布`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／保存&发布”展开，正文主要说明：AI Studio调试保存逻辑 自动保存：每次修改界面内容并执行运行后，所有变更及运行日志将自动保存。 章节线索包括：保存、发布。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／变量

- child_asset_id：`ka-src-0005-child-8f85dc91b22a209b`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／变量`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／变量”展开，正文主要说明：为了适应各种业务场景对变量使用的需求，提示词允许用户加入变量，格式为 ${X}。 这些变量会被系统自动识别，并且它们主要分为三种类型。 章节线索包括：概述、变量类型、变量设置。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／工作流使用

- child_asset_id：`ka-src-0005-child-702b454642202192`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／工作流使用`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／工作流使用”展开，正文主要说明：AI Studio支持自主搭建的流程编排的工作流来增强IDEAs的功能。 每个工作流都有独特的功能和参数，因此需要选择适合IDEAs需求的工作流，使用方式同工具使用。 章节线索包括：概述、IDEAs内使用工具、工作流设置。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／工具使用

- child_asset_id：`ka-src-0005-child-b594bd8e8592c8e7`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／工具使用`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／工具使用”展开，正文主要说明：AI Studio支持各种工具来增强IDEAs的功能。 每个工具都有独特的功能和参数，因此需要选择适合IDEAs需求的工具。 章节线索包括：概述、IDEAs内使用工具、工具权限、平台工具、自定义工具。
- 主题：大模型与 Agent、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／提示词

- child_asset_id：`ka-src-0005-child-e88ac0c346ade420`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／提示词`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／提示词”展开，正文主要说明：提示词是一种自然语言指令，用于告诉大型语言模型（LLM）需要执行的任务。 通过编写清晰、明确的提示词，我们为IDEAs设定角色和目标。 章节线索包括：概述、关键点、提示词示例、提示词智能优化。
- 主题：大模型与 Agent、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／模型设置

- child_asset_id：`ka-src-0005-child-828c5c738b2eac53`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／模型设置`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／模型设置”展开，正文主要说明：AI Studio现已集成多种主流AI模型供应商，包括但不限于阿里云的Qwen和星辰系列、Azure OpenAI的GPT系列、Anthropic的Claude系列，以及广泛的开源模型集合。 由于不同供应商的模型展现出各异的性能特点和参数配置，您可以根据特定场景的需求来挑选合适的模型。 章节线索包括：概述、模型类型、模型参数配置。
- 主题：大模型与 Agent、研发与部署、安全与权限、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／调试对比

- child_asset_id：`ka-src-0005-child-1ad4b634f7df0dbd`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／调试对比`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／调试对比”展开，正文主要说明：为降低大家模型、提示词的选型决策门槛，Workspace推出调试对比功能，支持通过创建不同的提示词+模型+知识库+工具的对比组合直观对比效果，实现效果对比及低门槛选型。 手动添加：通过手动新建提示词+模型+知识库+工具的新组合。 章节线索包括：组合添加、对比流程、对比记录。
- 主题：大模型与 Agent、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／调试运行

- child_asset_id：`ka-src-0005-child-d9c8098a56ecb9c9`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／调试运行`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-智能助手、生成型／调试／调试运行”展开，正文主要说明：在所有必要的配置项，包括提示词、模型、变量、上下文以及所需工具等均已设定完毕之后，便可以进入调试运行阶段，此时将对IDEA的运行效果进行验证检查。 主要针对智能助手IDEAs，提供问答相关设置。 章节线索包括：概述、问答设置、欢迎语、提示性问题、预置QA干预。
- 主题：数据分析、大模型与 Agent、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）

- child_asset_id：`ka-src-0005-child-c01214ee22159c7c`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）”展开，正文主要说明：将复杂任务分解为较小的步骤（节点）的工作流，显著降低了系统的复杂度。 这种方法减少了对高级提示词技术和模型推理能力的依赖，使得LLM在处理复杂任务时的性能得以大幅提升。 章节线索包括：基本介绍、如何开始。
- 主题：大模型与 Agent、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／ideaLAB上线Flow流程编排详细介绍

- child_asset_id：`ka-src-0005-child-d5c61ffb6053251b`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／ideaLAB上线Flow流程编排详细介绍`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／ideaLAB上线Flow流程编排详细介绍”展开，正文主要说明：在过去的一年多里，我们都看到了AI Agent的巨大潜力，但真正使用过才能体会到AI Agent的局限性，完全依赖大模型去执行复杂任务在当前阶段很难符合人们的预期。 因此，我们上线了Flow流程编排能力来弥补AI Agent的不足，我们希望能将复杂的任务分解成较小的步骤，以降低系统复杂度，减少对提示词工程和模型推理能力的依赖，整体上提高AI应用面向复杂任务的能力，提升系统的可解释性、稳定性和容错性。 章节线索包括：背景、如何开始、详细说明、3.1. 基本概念、3.1.1. 节点。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／搭建及管理流程

- child_asset_id：`ka-src-0005-child-ecb34ae95d0269ad`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／搭建及管理流程`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／搭建及管理流程”展开，正文主要说明：step1：选择并添加节点 点击节点“+”号添加节点。 章节线索包括：step1：选择并添加节点、step2：节点配置、step3：节点连接、step4：单节点运行、step5：流程运行。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／核心概念

- child_asset_id：`ka-src-0005-child-ee0682fceae549e4`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／核心概念`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／核心概念”展开，正文主要说明：节点是流程编排的关键构成，通过连接不同功能的节点，可以实现复杂的工作流自动化并执行一系列有序的操作。 这种编排方式不仅提高了流程的可视化和可管理性，还增强了系统的灵活性和扩展性。 章节线索包括：节点、变量。
- 主题：数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明

- child_asset_id：`ka-src-0005-child-6b9fae483fcca9b1`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明”展开，正文主要说明：开始节点是整个流程的起点，标志着流程的启动。 触发流程的执行，初始化相关变量，使流程进入下一步操作。 章节线索包括：节点说明、开始节点、知识库节点、回复节点、LLM节点。
- 主题：数据分析、大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明／代码节点示例

- child_asset_id：`ka-src-0005-child-eadd7cee6597f134`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明／代码节点示例`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明／代码节点示例”展开，正文主要说明：Python函数计算(FC)-阿里云帮助中心 (aliyun.com) 代码中获取入参的方法： eventObj = json.loads(event) arg1 = eventObj['arg1'] 章节线索包括：Python、其他示例、使用 Pandas 进行数据处理、复杂的业务逻辑处理、调用外部api。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明／参数提取&输出变量设置

- child_asset_id：`ka-src-0005-child-b6894420bcbf41ee`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明／参数提取&输出变量设置`
- 讲什么：围绕“产品使用指南／IDEAs构建／IDEAs创建-流程编排型（FLOW）／节点及功能说明／参数提取&输出变量设置”展开，正文主要说明：目标：模型输出的内容符合后续流程节点的入参要求 问题：怎么提取参数、怎么让模型输出我想要的格式。
- 主题：大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／发布管理

- child_asset_id：`ka-src-0005-child-65b3ba650000a2a2`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／发布管理`
- 讲什么：围绕“产品使用指南／IDEAs构建／发布管理”展开，正文主要说明：为增强IDEAs的可访问性和推广效率，AI Studio推出了四种终端渠道，以便用户能够方便地进行IDEAs的规模化测试、部署和宣传活动。 此外，AI Studio亦详尽记录了每次IDEAs的发布情况，确保用户可以轻松追踪历史动态和版本更新。 章节线索包括：概述、终端管理、API、Web、阿里钉。
- 主题：大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／发布管理／1分钟快速接入阿里钉个人助理！

- child_asset_id：`ka-src-0005-child-6e414d271cd90226`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／发布管理／1分钟快速接入阿里钉个人助理！`
- 讲什么：围绕“产品使用指南／IDEAs构建／发布管理／1分钟快速接入阿里钉个人助理！”展开，正文主要说明：蚂蚁同学目前看不到个人助理入口，后续迁移到蚂蚁钉之后，会自动开放。 ideaLAB目前支持了群聊机器人端到端的能力，在阿里钉上就能和 IDEAs 交互对话，但是接入过程略显繁琐，需要绑定参数和群ID等信息，可能还要申请机器人。 章节线索包括：接入步骤、点击阿里钉右上角的图标，创建新的AI助理、填写基本信息，删掉智能对话技能、新增自定义技能、调试、发布。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／应用管理

- child_asset_id：`ka-src-0005-child-8968a9a132225ca7`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／应用管理`
- 讲什么：围绕“产品使用指南／IDEAs构建／应用管理”展开，正文主要说明：应用管理旨在提供一个方便易用的平台，集中管理应用的基本信息、数据看板、日志和预置QA问答对等关键模块，以便用户能够更高效地执行日常的应用迭代与维护工作。 应用列表，选择某个应用，点击应用右上角“...”，选择“管理”入口进入或在调试界面点击IDEAs名称后的下拉图标。 章节线索包括：概述、管理入口、基本信息、数据看板、日志管理&标注。
- 主题：数据分析、大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／IDEAs构建／调试记录

- child_asset_id：`ka-src-0005-child-426e38685ed570bb`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／IDEAs构建／调试记录`
- 讲什么：围绕“产品使用指南／IDEAs构建／调试记录”展开，正文主要说明：为了提高应用创作团队及个人的开发效率，平台提供了一套完善的调试记录管理工具。 IDEAs调试页面会自动保存每一次运行的记录，便于用户进行产品化的调试过程管理。 章节线索包括：概述、对话型记录、生成型记录。
- 主题：大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／ideaTALK

- child_asset_id：`ka-src-0005-child-80a9bbf6f76e7a31`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／ideaTALK`
- 讲什么：围绕“产品使用指南／ideaTALK”展开，正文主要说明：为集团小二提供：先进的AI模型，丰富的AI应用，帮助大家探索AI价值 支持选择多个模型进行效果对比。 章节线索包括：ideaTALK、心流 - 慢思考智能问答、图生视频（体验）、ideaIMAGE、IDEAs。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／任务中心

- child_asset_id：`ka-src-0005-child-32f196bf3d05b3fe`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／任务中心`
- 讲什么：围绕“产品使用指南／任务中心”展开，正文主要说明：任务中心可以批量执行IDEAs，用户可以通过文件，批量输入IDEAs的入参。 入口二：空间——生成型IDEAs——调试记录——批量任务（通过指定某个调试记录直接发起批量任务） 章节线索包括：0、任务发起入口、1、任务发起、1.1基本信息填写、1.2选择数据导入方式、1.2.1文件格导入。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／协作空间

- child_asset_id：`ka-src-0005-child-b05f2ef0ba9e389a`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／协作空间`
- 讲什么：围绕“产品使用指南／协作空间”展开，正文主要说明：AI Studio 为每位用户提供了一个个人工作空间，并为了促进更高效的团队合作，我们还支持创建多个团队工作空间。 点击空间列表展开按钮，选择创建新的工作空间。 章节线索包括：概述、空间管理。
- 主题：大模型与 Agent、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／工具

- child_asset_id：`ka-src-0005-child-b2a22cf5650db6c8`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／工具`
- 讲什么：围绕“产品使用指南／工具”展开，正文主要说明：工具多功能工具箱总称，一个工具箱里面可以包含一个或者多个特定的工具（也就是API）。 AI Studio现在已经提供了基本的搜索及绘图工具箱，未来将持续提升平台工具箱覆盖范围，通过使用这些工具，你能让你的聊天机器人（IDEAs）变得更聪明，能力更全面。 章节线索包括：概述、应用场景。
- 主题：项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／工具／创建工具箱&工具

- child_asset_id：`ka-src-0005-child-9b21f4fb213eb9b2`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／工具／创建工具箱&工具`
- 讲什么：围绕“产品使用指南／工具／创建工具箱&工具”展开，正文主要说明：构建自定义工具使您能够将个人API接入IDEAs。 空间创建的工具仅支持该空间下使用。 章节线索包括：操作流程、附：schema字段详解、典型的工具箱schema、字段解释。
- 主题：大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／工具／将ideas发布成工具

- child_asset_id：`ka-src-0005-child-75761ced9ea7150a`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／工具／将ideas发布成工具`
- 讲什么：围绕“产品使用指南／工具／将ideas发布成工具”展开，正文主要说明：平台支持将ideas一键转为工具，添加到其他ideas后，实现类似multi-agent的效果。 Ideas发布后，点击图上红框处按钮，即跳转到工具创建页。 章节线索包括：创建、使用。
- 主题：大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／工具／工具箱／工具管理

- child_asset_id：`ka-src-0005-child-15e246c1da6b4a24`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／工具／工具箱／工具管理`
- 讲什么：围绕“产品使用指南／工具／工具箱／工具管理”展开，正文主要说明：选择某个工具箱，在界面右上角，点击“编辑工具箱”按钮。 在弹出的编辑窗口中，您可以修改工具箱的名称以及调整其包含的具体schema。
- 主题：AIStudio 与模型接入
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／工具／平台工具使用指南

- child_asset_id：`ka-src-0005-child-ac2be801c0ce96a5`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／工具／平台工具使用指南`
- 讲什么：围绕“产品使用指南／工具／平台工具使用指南”展开，正文主要说明：注：工具模块年前将进行如下改造 部分工具入参封装，简化工具使用门槛。 章节线索包括：运维工具、星环运维日志查询、工具描述、工具入参、MOCK示例。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／快速开始／业务场景使用贴士

- child_asset_id：`ka-src-0005-child-91fd9d3ec06121fe`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／快速开始／业务场景使用贴士`
- 讲什么：围绕“产品使用指南／快速开始／业务场景使用贴士”展开，正文主要说明：业务初期想法诞生，寻求可行性验证，可参考市场中提供的提示词和IDEAs等 验证渠道1：ideaTALK。 章节线索包括：初期探索阶段、POC实施阶段、模型及提示词选型、其他功能选择：工具、知识库、FAQ等、调优及评测。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／快速开始／体验IDEAs

- child_asset_id：`ka-src-0005-child-30f484eca767203c`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／快速开始／体验IDEAs`
- 讲什么：围绕“产品使用指南／快速开始／体验IDEAs”展开，正文主要说明：ideaTALK推出IDEAs频道，IDEAs市场，将展示平台及用户发布的IDEAs，大家可以浏览选择体验。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／快速开始／搭建你的IDEAs（智能助手）

- child_asset_id：`ka-src-0005-child-ea56f5ef5e204d3e`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／快速开始／搭建你的IDEAs（智能助手）`
- 讲什么：围绕“产品使用指南／快速开始／搭建你的IDEAs（智能助手）”展开，正文主要说明：面向所有阿里小二，AI Studio一直在为同学们提供更加简化、更加高效的AI应用搭建平台而不断努力。 为方便非编程基础的同学使用，本文以创建AI Studio智能客服的IDEAs为例演示如何在AI Studio搭建IDEAs。 章节线索包括：Step1：新建一个IDEAs、Step2：调试IDEAs、Step3：IDEAs发布。
- 主题：大模型与 Agent、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／我的

- child_asset_id：`ka-src-0005-child-ca2dc04dfde9dfa0`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／我的`
- 讲什么：围绕“产品使用指南／我的”展开，正文主要说明：个人额度资源管理、体验AK管理 支持用户添加私有模型接入平台，接入后可同平台模型一样使用相关的平台能力，私有模型平台不计费，资源由供给方自行承担。 章节线索包括：我的管理、个人资源、个人额度资源管理、体验AK管理、私有模型管理、AccessKEY管理。
- 主题：大模型与 Agent、安全与权限、资金与结算
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库

- child_asset_id：`ka-src-0005-child-df3ce7184ebf8f29`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库`
- 讲什么：围绕“产品使用指南／知识库”展开，正文主要说明：在构建IDEAs（Agent应用）中，知识库有着不可或缺的作用。 当前大模型虽具备强大能力，但存在一定局限性——训练知识滞后性，即其所涵盖知识是截止xx时期之前的，在此之后新涌现的知识内容，模型是无法知晓的。 章节线索包括：作用、功能概要。
- 主题：数据分析、大模型与 Agent、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／召回评测

- child_asset_id：`ka-src-0005-child-2a291a9bc5ce6521`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／召回评测`
- 讲什么：围绕“产品使用指南／知识库／召回评测”展开，正文主要说明：为了使大家能够更有效地管理和验证知识库内容的召回性能，确保召回结果的精准度、召回率和实体召回率，进而提升知识库的召回质量，我们引入了知识库召回评测功能。 用户在添加知识库内容后，可以利用此功能进行快速测试及评测，以检验知识库是否达到预期标准。 章节线索包括：概述、知识库快速测试、召回测试入口、操作、知识库评测。
- 主题：数据分析、大模型与 Agent、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／文档上传及内容管理

- child_asset_id：`ka-src-0005-child-4220dc7c4df7228a`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／文档上传及内容管理`
- 讲什么：围绕“产品使用指南／知识库／文档上传及内容管理”展开，正文主要说明：知识库支持文本类和表格类两种类型数据。
- 主题：数据分析
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／文档上传及内容管理／ODPS 上传说明

- child_asset_id：`ka-src-0005-child-918f294b9ec32d8f`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／文档上传及内容管理／ODPS 上传说明`
- 讲什么：围绕“产品使用指南／知识库／文档上传及内容管理／ODPS 上传说明”展开，正文主要说明：文本类和表格类均支持上传odps表 文本类上传：odps表的一行对应aistudio知识库内的一个文档。 章节线索包括：表地址填写说明、示例、文本类上传odps、表结构说明、表结构约束。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／文档上传及内容管理／文本类文档上传及内容管理

- child_asset_id：`ka-src-0005-child-45da5c6ceb76af68`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／文档上传及内容管理／文本类文档上传及内容管理`
- 讲什么：围绕“产品使用指南／知识库／文档上传及内容管理／文本类文档上传及内容管理”展开，正文主要说明：开始添加： 打开指定的知识库界面，点击屏幕右上角的「添加」按钮进入添加文档流程。 选择文档类型： 在弹出的选项中选择您要上传的文档类型，“文本类”。 章节线索包括：文档上传、查看文档信息、查看分段信息、分段管理。
- 主题：数据分析、大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／文档上传及内容管理／表格类文档上传及内容管理

- child_asset_id：`ka-src-0005-child-3f651df44eece8d8`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／文档上传及内容管理／表格类文档上传及内容管理`
- 讲什么：围绕“产品使用指南／知识库／文档上传及内容管理／表格类文档上传及内容管理”展开，正文主要说明：开始添加： 打开指定的知识库界面，点击屏幕右上角的「添加」按钮进入添加文档流程。 选择文档类型： 在弹出的选项中选择您要上传的文档类型，“表格类”。 章节线索包括：文档上传、查看文档信息、查看表格行信息、表管理。
- 主题：数据分析、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／文档上传及内容管理／钉钉文档上传说明

- child_asset_id：`ka-src-0005-child-ada959e19a0993b1`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／文档上传及内容管理／钉钉文档上传说明`
- 讲什么：围绕“产品使用指南／知识库／文档上传及内容管理／钉钉文档上传说明”展开，正文主要说明：文本类文档支持上传单篇钉钉文档链接或钉钉知识库链接 表格类文档支持上传单篇钉钉表格链接。 章节线索包括：注意事项📢、功能概览、支持类型、权限要求、性能说明。
- 主题：安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／知识库文档更新

- child_asset_id：`ka-src-0005-child-71be2ae9ab2ff8e5`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／知识库文档更新`
- 讲什么：围绕“产品使用指南／知识库／知识库文档更新”展开，正文主要说明：仅支持知识库维度自动更新，不支持对单文档/渠道自动更新，详情见 支持对在线文档进行手动更新，详情见。 章节线索包括：支持自动更新、支持手动更新。
- 主题：AIStudio 与模型接入
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／知识库文档更新／文档手动更新

- child_asset_id：`ka-src-0005-child-46d234748ed55291`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／知识库文档更新／文档手动更新`
- 讲什么：围绕“产品使用指南／知识库／知识库文档更新／文档手动更新”展开，正文主要说明：目前平台针对语雀及钉钉文档提供了手动更新功能，方便大家进行在线文档的管理 限制：只针对0419以后上传的在线文档生效。 章节线索包括：更新入口、文档更新策略、备注。
- 主题：AIStudio 与模型接入
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／知识库文档管理

- child_asset_id：`ka-src-0005-child-da658dbf995d35f6`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／知识库文档管理`
- 讲什么：围绕“产品使用指南／知识库／知识库文档管理”展开，正文主要说明：在添加文档之后，您可以通过以下管理功能对文档进行维护 文档概览：包含文档名称、文档类型、标签、文件大小、累计被召回次数、上传日期以及当前状态。 章节线索包括：文档管理。
- 主题：数据分析
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／知识库／知识库新建及管理

- child_asset_id：`ka-src-0005-child-f8d0e3dcf23d4204`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／知识库／知识库新建及管理`
- 讲什么：围绕“产品使用指南／知识库／知识库新建及管理”展开，正文主要说明：进入“知识库”，点击“创建知识库”按钮。 输入知识库的名称，并提供一个简短描述。 章节线索包括：创建知识库、知识库管理、知识库列表页、知识库详情页、设置知识库基础信息。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／评测（应用）

- child_asset_id：`ka-src-0005-child-2432c54ca2a624f4`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／评测（应用）`
- 讲什么：围绕“产品使用指南／评测（应用）”展开，正文主要说明：为满足应用开发者验证应用研发迭代效果，获取主客观评价指标参考，从而循环迭代提升应用质量以达到投产标准，AI Studio支持应用测评功能。 应用评测是对已发布的应用进行端到端效果的验证，支持用户用自定义评测数据集测试应用质量，支持人工对应用生成结果进行评判，同时支持智能评测，让模型来评判应用生成结果。 章节线索包括：功能概述。
- 主题：数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／评测（应用）／评测任务发起及管理

- child_asset_id：`ka-src-0005-child-b045a62a524d414c`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／评测（应用）／评测任务发起及管理`
- 讲什么：围绕“产品使用指南／评测（应用）／评测任务发起及管理”展开，正文主要说明：需要评测的应用及版本（自动展示应用需要输入的变量及是否为必填）， 评测数据集（自动展示评测数据集的列结果） 章节线索包括：发起评测任务、任务状态说明、人工评分、评测结果、评分详情。
- 主题：数据分析、大模型与 Agent、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／评测（应用）／评测数据集打标

- child_asset_id：`ka-src-0005-child-c7b77414c80a815d`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／评测（应用）／评测数据集打标`
- 讲什么：围绕“产品使用指南／评测（应用）／评测数据集打标”展开，正文主要说明：评测任务状态变为“已完成”后，可以对评测任务使用的评测数据集进行打标，打标完成后将创建一个新的评测数据集。 填写打标后评测数据集信息。
- 主题：数据分析、大模型与 Agent
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 产品使用指南／评测（应用）／评测集创建及管理

- child_asset_id：`ka-src-0005-child-2c86d7abc3ff8387`
- 相对路径：`raw/aistudio/AIStudio/产品使用指南／评测（应用）／评测集创建及管理`
- 讲什么：围绕“产品使用指南／评测（应用）／评测集创建及管理”展开，正文主要说明：输入评测集名称（注意评测集不能重名），并可在此时选择添加文件上传到评测集里（也可以选择不上传文件，即创建一个空评测集）。 点击“文件示例”可以下载评测集模版，同时页面上也有评测集列规则的说明。 章节线索包括：创建评测集、添加数据、删除评测数据集的影响。
- 主题：数据分析、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 平台内容分享／RAG技术详解

- child_asset_id：`ka-src-0005-child-f0d7b89a62a8d18a`
- 相对路径：`raw/aistudio/AIStudio/平台内容分享／RAG技术详解`
- 讲什么：围绕“平台内容分享／RAG技术详解”展开，正文主要说明：检索增强生成（Retrieval-Augmented Generation，RAG）指的是在LLM回答问题之前从外部知识库中检索相关信息，RAG有效地将LLM的参数化知识与非参数化的外部知识库结合起来，使其成为实现大型语言模型的最重要方法之一 早期的神经网络模型，在处理需要依赖外部知识或特定信息的任务时遇到了瓶颈。 章节线索包括：RAG概览与应用场景、一个典型的RAG场景、RAG背景、RAG概述、RAG应用场景。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 平台内容分享／idealab-AI Studio平台介绍&这一年的一些变化

- child_asset_id：`ka-src-0005-child-0b982ac8fe19775c`
- 相对路径：`raw/aistudio/AIStudio/平台内容分享／idealab-AI Studio平台介绍&这一年的一些变化`
- 讲什么：围绕“平台内容分享／idealab-AI Studio平台介绍&这一年的一些变化”展开，正文主要说明：一支专注于当前热门AI应用方向的团队，致力于开发前沿技术。 我们的现有平台—AI Studio，基于此打造了一系列AI相关产品，业务范围涵盖全集团AI创新领域。 章节线索包括：ideaLAB团队介绍、AI Studio平台介绍、IdeaTalk：先进的AI生产力体验平台、先进模型体验平台、高效AI应用体验平台。
- 主题：数据分析、大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 平台内容分享／拜托了-极客工具箱_玄空24.10

- child_asset_id：`ka-src-0005-child-ef4e3ecf4d3d2c2b`
- 相对路径：`raw/aistudio/AIStudio/平台内容分享／拜托了-极客工具箱_玄空24.10`
- 讲什么：围绕“平台内容分享／拜托了-极客工具箱_玄空24.10”展开，正文主要说明：平台定位：集团内AI先进生产力能力普及，提供AI应用构建管理平台，支持集团小二进行AI应用价值探索 主要产品：ideaTALK、Workspace、ideaIMAGE。 章节线索包括：平台概述、核心功能介绍、想法验证阶段、平台首页及4大能力市场能力展示，业务寻求匹配的能力、AI能力体验场，业务想法初体验。
- 主题：数据分析、大模型与 Agent、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／DeepSeek问题汇总

- child_asset_id：`ka-src-0005-child-fd13ba265e733bdc`
- 相对路径：`raw/aistudio/AIStudio/技术文档／DeepSeek问题汇总`
- 讲什么：围绕“技术文档／DeepSeek问题汇总”展开，正文主要说明：idealab 的 API 是否有计划提供 DeepSeek R1 的服务 目前deepSeek已开放API调用，如果遇到提示无模型权限，请联系殳驱。 章节线索包括：idealab 的 API 是否有计划提供 DeepSeek R1 的服务、ideaTalk平台的DeepSeek模型，部署来源是哪里？、IdeaTalk 中调用的 DeepSeek(内部版) 目前是私有化部署的版本吗？、在 Whale 模型广场里订阅调用 DeepSeek 的效果和 IdeaTalk 是相同的吗？、DeepSeek 内部部署是否不上传云端，可以处理一些内部分析，比如用户原声归类，不包含用户 ID 那些敏感信息？。
- 主题：大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／FAQ

- child_asset_id：`ka-src-0005-child-45f6524164ddaa2d`
- 相对路径：`raw/aistudio/AIStudio/技术文档／FAQ`
- 讲什么：围绕“技术文档／FAQ”展开，正文主要说明：提问/答疑时需要提供的信息 我们会记录请求日志，其中包括TraceId、请求时间、业务businessCode等维度信息，当请求不符合预期进行问题咨询时，请提供以下信息。 章节线索包括：提问/答疑时需要提供的信息、申请、接入、计费、ak的申请流程、各版本模型的收费标准、ak余额查询、非弹内机房调用302。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册

- child_asset_id：`ka-src-0005-child-c6aa08eb22f2697c`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册`
- 讲什么：围绕“技术文档／LLM API使用手册”展开，正文主要说明：Chat Completion API Embedding API。
- 主题：大模型与 Agent
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Audio API

- child_asset_id：`ka-src-0005-child-d88a65cbf2ebc784`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Audio API`
- 讲什么：围绕“技术文档／LLM API使用手册／Audio API”展开，正文主要说明：模型名称 （在请求api时使用的入参） azure openai。 章节线索包括：上架的模型、Create speech、curl实例、请求体、响应体。
- 主题：广告投放、大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Chat Completion API

- child_asset_id：`ka-src-0005-child-1030d5c8786d8b0d`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Chat Completion API`
- 讲什么：围绕“技术文档／LLM API使用手册／Chat Completion API”展开，正文主要说明：2024-08-13：支持美国region的vipserver访问方式 2024-07-19：支持通过vip方式请求API。 章节线索包括：快速开始、HTTP调用接口、入参、对入参结构的说明、openai格式的入参 【官方文档】。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Chat Completion API／AI Studio Chat模型清单

- child_asset_id：`ka-src-0005-child-bdbca0cb3763a23a`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Chat Completion API／AI Studio Chat模型清单`
- 讲什么：仅含很短的占位或提示文字：文档已经迁移到钉钉文档： 
>
- 主题：大模型与 Agent
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Chat Completion API／OpenAI流式使用FunctionCall & ToolChoice示例

- child_asset_id：`ka-src-0005-child-4c910522efd3a3c2`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Chat Completion API／OpenAI流式使用FunctionCall & ToolChoice示例`
- 讲什么：围绕“技术文档／LLM API使用手册／Chat Completion API／OpenAI流式使用FunctionCall & ToolChoice示例”展开，正文主要说明：FunctionCall 参数示例 FunctionCall每次返回一个工具，name只在第一次出现，需要拼接arguments。 章节线索包括：FunctionCall 参数示例、ToolChoice 参数示例。
- 主题：大模型与 Agent
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Chat Completion API／错误码

- child_asset_id：`ka-src-0005-child-43499589b69f1cf3`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Chat Completion API／错误码`
- 讲什么：围绕“技术文档／LLM API使用手册／Chat Completion API／错误码”展开，正文主要说明：/api/openai/v1/chat/completions /api/openai/v1/embeddings。 章节线索包括：接口错误码信息。
- 主题：数据分析、大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Embeddings API

- child_asset_id：`ka-src-0005-child-fa90fb829fe9123a`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Embeddings API`
- 讲什么：围绕“技术文档／LLM API使用手册／Embeddings API”展开，正文主要说明：2024-07-25：Embeddings API完全遵循OpenAI Embeddings规范 模型名称 （在请求api时使用的入参） 章节线索包括：上架的模型、申请AK、Create embeddings、Example request、Request body。
- 主题：广告投放、大模型与 Agent、安全与权限
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Image API

- child_asset_id：`ka-src-0005-child-92cd044fa305af35`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Image API`
- 讲什么：围绕“技术文档／LLM API使用手册／Image API”展开，正文主要说明：模型名称 （在请求api时使用的入参） azure openai。 章节线索包括：上架的模型、Create image(dalle3)、curl实例、请求体、响应体。
- 主题：广告投放、数据分析、大模型与 Agent
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Realtime API

- child_asset_id：`ka-src-0005-child-34d5425153e93b1e`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Realtime API`
- 讲什么：围绕“技术文档／LLM API使用手册／Realtime API”展开，正文主要说明：url: wss://idealab.alibaba-inc.com/api/openai/realtime? model=gpt-4o-realtime-preview-1001。 章节线索包括：Quick Start、Client events （用户向ideaLAB发送的message）、概览、用法、Server events （ideaLAB向用户发送的message）。
- 主题：大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／Search API

- child_asset_id：`ka-src-0005-child-6c0cb3dce4ab9775`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／Search API`
- 讲什么：围绕“技术文档／LLM API使用手册／Search API”展开，正文主要说明：idea-lab对模型的命名 Google Serper。 章节线索包括：支持的模型、模型价格、Getting Started、curl格式、请求体格式。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／模型下架及替换说明

- child_asset_id：`ka-src-0005-child-522d8558f93ad09a`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／模型下架及替换说明`
- 讲什么：围绕“技术文档／LLM API使用手册／模型下架及替换说明”展开，正文主要说明：我们即将（9/10）对部分模型进行下架处理。 下架的主要原因包括模型供应商不再提供维护支持，或因旧模型占用了新模型的配额。
- 主题：数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／模型的FAQ

- child_asset_id：`ka-src-0005-child-4526a9970849f097`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／模型的FAQ`
- 讲什么：围绕“技术文档／LLM API使用手册／模型的FAQ”展开，正文主要说明：Chat Completions API 首先，你需要传入ideaLAB的AK（正式AK / 个人AK） 章节线索包括：Chat Completions API、关于百炼AK、多模态数据的限制、gpt的一些模型，会带有global的尾缀，它们的区别是？、o1系列模型的说明。
- 主题：数据分析、大模型与 Agent、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／LLM API使用手册／模型的FAQ／gpt-4o-2024-05-13、gpt-4o-mini，图片转成token的规则不同

- child_asset_id：`ka-src-0005-child-a57c944b17a8e95a`
- 相对路径：`raw/aistudio/AIStudio/技术文档／LLM API使用手册／模型的FAQ／gpt-4o-2024-05-13、gpt-4o-mini，图片转成token的规则不同`
- 讲什么：围绕“技术文档／LLM API使用手册／模型的FAQ／gpt-4o-2024-05-13、gpt-4o-mini，图片转成token的规则不同”展开，正文主要说明：GPT-4o 图片换算成token的算法 detail: high。 章节线索包括：官方文档、GPT-4o 图片换算成token的算法、GPT-4o mini 图片换算成token的算法。
- 主题：大模型与 Agent
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／SDK使用手册／JavaSDK RAG模块使用文档

- child_asset_id：`ka-src-0005-child-8b32e525f0fd8c89`
- 相对路径：`raw/aistudio/AIStudio/技术文档／SDK使用手册／JavaSDK RAG模块使用文档`
- 讲什么：围绕“技术文档／SDK使用手册／JavaSDK RAG模块使用文档”展开，正文主要说明：在上一个版本的idealab sdk中，我们的SDK支持了模型，工具，agent等功能。 在新的版本中，我们进一步支持了RAG模块，我们将初步支持文档上传，文档切片，切片上传和召回等功能。 章节线索包括：快速上手、引入Maven依赖、application.properties、示例代码、概念简介。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／SDK使用手册／JavaSDK使用文档

- child_asset_id：`ka-src-0005-child-6b2ab50e316101f9`
- 相对路径：`raw/aistudio/AIStudio/技术文档／SDK使用手册／JavaSDK使用文档`
- 讲什么：围绕“技术文档／SDK使用手册／JavaSDK使用文档”展开，正文主要说明：idealab提供了完善的模型API，但同时我们注意到大家使用API还是有一定的门槛，为了简化使用流程，我们基于SpringAI框架的思想， 围绕这idealab的核心API开放了Java SDK，并制作成了spring-boot-starter，实现了模型能力的开箱即用。 Chat对话模型的基础调用：块式、流式、FunctionCall、ToolChoice。 章节线索包括：背景、快速上手、引入Maven依赖、application.properties、注入ChatModel使用。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／SDK使用手册／PandoraBootStarter使用文档

- child_asset_id：`ka-src-0005-child-b945ee2c87fa1b42`
- 相对路径：`raw/aistudio/AIStudio/技术文档／SDK使用手册／PandoraBootStarter使用文档`
- 讲什么：围绕“技术文档／SDK使用手册／PandoraBootStarter使用文档”展开，正文主要说明：idealab：构建一站式AI场景应用研发平台，集成了丰富的AI大模型、高效调试、一键Demo、精准评测，致力于简化交付流程，加速业务成长，引领AI技术新潮流！ 本文描述了使用 Spring Boot 的编程模型在 Pandora Boot 应用中如何使用idealab模型能力。 章节线索包括：参考文档、注意事项、例子、如何使用、Maven依赖。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／SDK使用手册／适配主流SDK和框架：OpenAI-SDK、LangChain、LangChain4J

- child_asset_id：`ka-src-0005-child-08a2b9b613451795`
- 相对路径：`raw/aistudio/AIStudio/技术文档／SDK使用手册／适配主流SDK和框架：OpenAI-SDK、LangChain、LangChain4J`
- 讲什么：围绕“技术文档／SDK使用手册／适配主流SDK和框架：OpenAI-SDK、LangChain、LangChain4J”展开，正文主要说明：ideaLAB适配OpenAI-SDK、LangChain、LangChain4J啦！ 2024-06-25：Chat Completions API适配主流SDK和框架。 章节线索包括：1 适配OpenAI-SDK、Chat 模型、块式调用、流式调用、Embedding 模型。
- 主题：大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／IDEAs API使用说明

- child_asset_id：`ka-src-0005-child-7e5bd20d239ac820`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／IDEAs API使用说明`
- 讲什么：围绕“技术文档／WORKSPACE／IDEAs API使用说明”展开，正文主要说明：ai应用交付API仅支持HTTP 可以在发布管理页面获取。 章节线索包括：AI应用交付运行（新）、HTTP地址、POST参数、Header、Body。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／IDEAs 会话日志数据回流申请（ODPS）

- child_asset_id：`ka-src-0005-child-747ce81d141bb991`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／IDEAs 会话日志数据回流申请（ODPS）`
- 讲什么：围绕“技术文档／WORKSPACE／IDEAs 会话日志数据回流申请（ODPS）”展开，正文主要说明：注意：申请人必须是AI Studio对应申请空间的管理员/成员，否则审批会被拒绝 对话的message日志: idealab.aiappconversationmessage。 章节线索包括：申请地址（流通中心）、表名、场景目的、选择表字段、分离字段配置。
- 主题：数据分析、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／IDEAs页面嵌入_JS插件引入使用文档

- child_asset_id：`ka-src-0005-child-a579de56a4fe9d4a`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／IDEAs页面嵌入_JS插件引入使用文档`
- 讲什么：围绕“技术文档／WORKSPACE／IDEAs页面嵌入_JS插件引入使用文档”展开，正文主要说明：集成 ideas 页面的主要入口点，支持动态展示和交互，包括但不限于拖放功能、模态框弹窗以及 iframe 页面加载等特性。 此组件特别设计用于适应不同的部署环境，目前仅支持PC端，且必须有buc登录态的页面。 章节线索包括：概述、效果图、体验DEMO、线上最新版本：1.0.3、完整使用示例。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive；contains_nul、credential_sanitized
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／批量任务API说明

- child_asset_id：`ka-src-0005-child-99afd27d5c22f9b1`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／批量任务API说明`
- 讲什么：围绕“技术文档／WORKSPACE／批量任务API说明”展开，正文主要说明：/aigc/v1/submitTextToTextBatchTask 业务方AccessKey。 章节线索包括：批量任务接口、接口地址、参数说明、调用示例、1.CURL示例（包括odps）。
- 主题：数据分析、大模型与 Agent、安全与权限
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／私有模型接入指南

- child_asset_id：`ka-src-0005-child-215302e5397f894f`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／私有模型接入指南`
- 讲什么：围绕“技术文档／WORKSPACE／私有模型接入指南”展开，正文主要说明：​快来AI Studio接入自己的模型吧 仅靠ideaLAB团队接入市面上的流行模型，难以满足集团内使用模型的需求，体现在：丰富性不够、时效性不够。 章节线索包括：1 背景、2 怎么接入？、2.1 添加模型、2.1.1 基础信息、2.1.2 http配置。
- 主题：大模型与 Agent、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／绑定百炼AK

- child_asset_id：`ka-src-0005-child-3f453c1f406214b5`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／绑定百炼AK`
- 讲什么：围绕“技术文档／WORKSPACE／绑定百炼AK”展开，正文主要说明：在Workspace/API使用通义(qwen)系列模型时，如果遇到频繁限流的情况，可以绑定自己的阿里云百炼AK。 绑定百炼AK后，模型调用时会使用各位的独立的资源，避免使用公共通义资源时的限流问题。
- 主题：大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／WORKSPACE／账单日志数据回流申请（ODPS）

- child_asset_id：`ka-src-0005-child-a3a4991a0aeb689b`
- 相对路径：`raw/aistudio/AIStudio/技术文档／WORKSPACE／账单日志数据回流申请（ODPS）`
- 讲什么：围绕“技术文档／WORKSPACE／账单日志数据回流申请（ODPS）”展开，正文主要说明：注意：申请人必须提前ideaLAB管理员及财务确认过取数范围，否则审批会被拒绝 ebusinessportal.idealabbusinessinvokellmdailystatisticsbillnew0829。 章节线索包括：表名、场景目的、选择表字段、分离字段配置、分离逻辑。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／ideaTALK／前端嵌入式IDEAS接入文档

- child_asset_id：`ka-src-0005-child-812c73ff03fe7318`
- 相对路径：`raw/aistudio/AIStudio/技术文档／ideaTALK／前端嵌入式IDEAS接入文档`
- 讲什么：围绕“技术文档／ideaTALK／前端嵌入式IDEAS接入文档”展开，正文主要说明：提供ideas卡片点击后的首页地址 进行对话后推送页面信息，idealab保存用于后续点击左侧历史记录重新进入会话。
- 主题：数据分析、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库快速开始／AI-Studio 知识库模块的一些基本概念

- child_asset_id：`ka-src-0005-child-68be03adfb5141f5`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库快速开始／AI-Studio 知识库模块的一些基本概念`
- 讲什么：围绕“技术文档／知识库／知识库快速开始／AI-Studio 知识库模块的一些基本概念”展开，正文主要说明：了解 AI-Studio 知识库模块的一些基本概念，以便在接入 API 的过程中更加高效，事半功倍 了解项目空间、知识库、知识库文档、知识库文档块。 章节线索包括：了解 AI-Studio 知识库模块的一些基本概念，以便在接入 API 的过程中更加高效，事半功倍、了解项目空间、知识库、知识库文档、知识库文档块、项目空间、知识库、知识库文档、知识库文档块在产品上指的是哪些内容？、什么是 AK？必须要有 AK 吗？AK 的用处是什么？如何申请 AK？、知识库绑定的 AK 怎么查看？项目空间绑定的 AK 怎么查看？。
- 主题：大模型与 Agent、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库快速开始／最基础的 RAG 知识

- child_asset_id：`ka-src-0005-child-1401dbe770dce397`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库快速开始／最基础的 RAG 知识`
- 讲什么：围绕“技术文档／知识库／知识库快速开始／最基础的 RAG 知识”展开，正文主要说明：最基础的 RAG 知识，以方便使用知识库产品 这里以一个简单的 RAG 为例。 章节线索包括：最基础的 RAG 知识，以方便使用知识库产品、知识抽取（蓝线）、知识检索（红线+绿线）。
- 主题：数据分析、大模型与 Agent
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／@Deprecated／@Deprecated 知识库数据上传API

- child_asset_id：`ka-src-0005-child-28999bae7ff6e1de`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／@Deprecated／@Deprecated 知识库数据上传API`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／@Deprecated／@Deprecated 知识库数据上传API”展开，正文主要说明：版本：20230530（该版本已经下线） /aiStudio/source/dataManager/systemImport/batchUploadSourceData.do。 章节线索包括：系统导入接口、接口地址、参数说明、请求方式、POST。
- 主题：数据分析、大模型与 Agent
- 质量/异常：substantive；contains_nul、historical_or_deprecated_path
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／@Deprecated／知识库文档上传API（最新版）

- child_asset_id：`ka-src-0005-child-a81719401ee63761`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／@Deprecated／知识库文档上传API（最新版）`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／@Deprecated／知识库文档上传API（最新版）”展开，正文主要说明：该文档介绍了文档上传相关的知识库 API。 v1 、v0 版本的区别是什么？ 章节线索包括：常见问题、版本问题、v1 、v0 版本的区别是什么？我应该选择哪个版本？、API 相关问题（v1）、文档上传支持哪些类型的文档？。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive；contains_nul、historical_or_deprecated_path
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／@Deprecated／知识库文档管理API

- child_asset_id：`ka-src-0005-child-899c5cc1eeae5593`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／@Deprecated／知识库文档管理API`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／@Deprecated／知识库文档管理API”展开，正文主要说明：1. 知识库文档：查看某个知识库的文档列表 2. 知识库文档：查看某个知识库文档的内容。 章节线索包括：v1、知识库文档：查看某个知识库的文档列表、接口描述、请求参数、schema属性说明。
- 主题：数据分析、大模型与 Agent、安全与权限
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／参数说明／API-常用参数及获取方式

- child_asset_id：`ka-src-0005-child-0a5aaf9721d149b9`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／参数说明／API-常用参数及获取方式`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／参数说明／API-常用参数及获取方式”展开，正文主要说明：根据前端页面知识库的链接查看。 其中，projectId=129372，表示项目空间 id 为 129372。 章节线索包括：项目空间ID、项目空间绑定的ak、知识库ID。
- 主题：安全与权限、项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-ODPS文档类文档上传

- child_asset_id：`ka-src-0005-child-99c465fa05636f35`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-ODPS文档类文档上传`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-ODPS文档类文档上传”展开，正文主要说明：具体的上传限制和页面上上传的限制一致，参考文档 表格行数、索引列的限制目前与产品的限制一致，以产品文档为主。 章节线索包括：ODPS文档上传、接口描述、ODSP限制、接口限制、ODPS表格上传。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-ODPS表格类文档上传

- child_asset_id：`ka-src-0005-child-8d087247f3146b5c`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-ODPS表格类文档上传`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-ODPS表格类文档上传”展开，正文主要说明：具体的上传限制和页面上上传的限制一致，参考文档 表格行数、索引列的限制目前与产品的限制一致，以产品文档为主。 章节线索包括：ODPS表格上传、接口描述、ODSP限制、接口限制、request headers and body。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-文档处理进度

- child_asset_id：`ka-src-0005-child-21192ed34933eda3`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-文档处理进度`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-文档处理进度”展开，正文主要说明：根据提交的任务id查询文档处理进度 Request Headers。 章节线索包括：根据提交的任务id查询文档处理进度、request、response。
- 主题：数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-本地普通文档上传、更新、删除、查询

- child_asset_id：`ka-src-0005-child-1354b3a5130e6aba`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-本地普通文档上传、更新、删除、查询`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-本地普通文档上传、更新、删除、查询”展开，正文主要说明：支持的文件后缀包括：.txt, .html, .md, .pdf,.doc,.docx 对于没有指定后缀名的文档，默认按照.txt格式处理。 章节线索包括：本地文档上传、支持的文档格式、接口限制、测试文档、本地普通类文档上传。
- 主题：数据分析、安全与权限、项目管理、前端体验
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-查询文档详情的参数解释

- child_asset_id：`ka-src-0005-child-072855fb983e8a06`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-查询文档详情的参数解释`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-查询文档详情的参数解释”展开，正文主要说明：文档详情的response示例 文档详情的response解释。 章节线索包括：文档详情的response示例、文档详情的response解释。
- 主题：AIStudio 与模型接入
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-语雀知识库文档上传、更新、查询、删除

- child_asset_id：`ka-src-0005-child-6c42ea617c5133a2`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-语雀知识库文档上传、更新、查询、删除`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-语雀知识库文档上传、更新、查询、删除”展开，正文主要说明：支持语雀知识库的上传，仅支持上传知识库里面的语雀文档 语雀文档属于团队知识库。 章节线索包括：语雀表格上传、接口描述、语雀限制、测试的知识库、语雀文档上传。
- 主题：数据分析、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-语雀表格文档上传、更新、查询、删除

- child_asset_id：`ka-src-0005-child-9b4098d57a04b8bb`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-语雀表格文档上传、更新、查询、删除`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-语雀表格文档上传、更新、查询、删除”展开，正文主要说明：语雀表格属于团队知识库。 Token的获取可以查看详细文档。 章节线索包括：语雀表格上传、接口描述、语雀限制、测试的语雀表格、接口限制。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-钉钉知识库文档上传、更新、查询、删除

- child_asset_id：`ka-src-0005-child-acf1bcab5402a6a5`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-钉钉知识库文档上传、更新、查询、删除`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-钉钉知识库文档上传、更新、查询、删除”展开，正文主要说明：支持钉钉知识库的上传，仅支持上传钉钉知识库里面的钉钉自研文档、PDF、WORD文档。 支持单篇钉钉文档的上传，支持的格式同上。 章节线索包括：钉钉文档上传、接口描述、钉钉限制、接口说明、测试的知识库。
- 主题：数据分析、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／API-钉钉表格文档上传、更新、查询、删除

- child_asset_id：`ka-src-0005-child-b9e8dbeb901bed72`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／API-钉钉表格文档上传、更新、查询、删除`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／API-钉钉表格文档上传、更新、查询、删除”展开，正文主要说明：简单来说，钉钉知识库需要满足 公开范围包括阿里巴巴及蚂蚁集团外包。 章节线索包括：钉钉表格上传、接口描述、钉钉限制、接口说明、测试的钉钉表格。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档上传／知识库文档上传API-表格文档

- child_asset_id：`ka-src-0005-child-90525450760b519b`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档上传／知识库文档上传API-表格文档`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档上传／知识库文档上传API-表格文档”展开，正文主要说明：请求Header需要设置下面参数 实践1：上传QA数据，QA均建立索引。 章节线索包括：请求Header需要设置下面参数、实践1：上传QA数据，QA均建立索引、上传一份表头包含Question、Answer的、方式1：直接在前端上传、方式2：直接调用接口上传一个表格文档。
- 主题：数据分析、大模型与 Agent、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／文档检索／知识库文档检索API

- child_asset_id：`ka-src-0005-child-7a1ceb3149137588`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／文档检索／知识库文档检索API`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／文档检索／知识库文档检索API”展开，正文主要说明：1. 文档/FAQ 检索API 2. 文档/FAQ 关键词检索API。 章节线索包括：v1、文档/FAQ 检索API、请求参数、Header、Params。
- 主题：大模型与 Agent、安全与权限、前端体验
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库 API 的功能及其间的关系

- child_asset_id：`ka-src-0005-child-c3024fef4c6ea9ce`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库 API 的功能及其间的关系`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库 API 的功能及其间的关系”展开，正文主要说明：了解知识库 API 的功能及其间的关系，快速找到自己需要的API 知识库文档管理：对于上传后的文档，进行查询、删除、更新操作。 章节线索包括：了解知识库 API 的功能及其间的关系，快速找到自己需要的API。
- 主题：AIStudio 与模型接入
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库 API 说明

- child_asset_id：`ka-src-0005-child-6a6f0e036bc807ed`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库 API 说明`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库 API 说明”展开，正文主要说明：第一步，最基础的 RAG 知识，以方便使用知识库产品 第二步，了解 AI-Studio 知识库模块的一些基本概念，以便在接入 API 的过程中更加高效，事半功倍。 章节线索包括：第一步，最基础的 RAG 知识，以方便使用知识库产品、第二步，了解 AI-Studio 知识库模块的一些基本概念，以便在接入 API 的过程中更加高效，事半功倍、了解项目空间、知识库、知识库文档、知识库文档块、项目空间、知识库、知识库文档、知识库文档块在产品上指的是哪些内容？、什么是 AK？必须要有 AK 吗？AK 的用处是什么？如何申请 AK？。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库-基于工具实现自定义重排模型、切分模型、向量化模型

- child_asset_id：`ka-src-0005-child-d11d28798061741c`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库-基于工具实现自定义重排模型、切分模型、向量化模型`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库-基于工具实现自定义重排模型、切分模型、向量化模型”展开，正文主要说明：待上线，10 月中旬上线，目前还在预发测试中。 知识库支持用户使用自定义的重排模型、切分模型、以及向量化模型。 章节线索包括：概述、知识库协议、请求头要求、API出入参协议、重排工具示例。
- 主题：大模型与 Agent、安全与权限
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库常见QA

- child_asset_id：`ka-src-0005-child-48012467d515fe52`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库常见QA`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库常见QA”展开，正文主要说明：AI Studio技术对接运维群：25765049689 文档中没有回答我的问题怎么办？ 章节线索包括：文档中没有回答我的问题怎么办？、报错问题、功能问题、TraceId 怎么获取？有TraceId 后用户可以做哪些事情？、知识库收费吗，怎么收费？。
- 主题：大模型与 Agent、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库常见QA／QA-文档切分相关

- child_asset_id：`ka-src-0005-child-c1bd115143ef29ca`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库常见QA／QA-文档切分相关`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库常见QA／QA-文档切分相关”展开，正文主要说明：单元格长度超过阈值300 ops-text-embedding-001模型的默认长度为300。 章节线索包括：单元格长度超过阈值300、方法一：新建知识库，默认模型为ops-text-embedding-002、方法二：知识库切换模型，切换为ops-text-embedding-002。
- 主题：大模型与 Agent、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库文档切分API

- child_asset_id：`ka-src-0005-child-e88a750e4a56e221`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库文档切分API`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库文档切分API”展开，正文主要说明：1. 知识库文档：知识库文档批量处理 2. 知识库文档：知识库文档切分（只切分，不存储） 章节线索包括：v1、知识库文档：知识库文档批量处理（切分 & 存储）、入参示例、响应示例、知识库文档：知识库文档切分（只切分，不存储）。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库管理／知识库创建

- child_asset_id：`ka-src-0005-child-15aa1f670558dcea`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库管理／知识库创建`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库管理／知识库创建”展开，正文主要说明：知识库产品页面创建知识库 界面左侧有两个选项卡：“基本信息”和“知识库配置”。 章节线索包括：知识库产品页面创建知识库、知识库设置-基础信息、知识库设置-知识库配置。
- 主题：大模型与 Agent、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／知识库／知识库接口列表／知识库评测

- child_asset_id：`ka-src-0005-child-6e5dfcd7ed7c4d98`
- 相对路径：`raw/aistudio/AIStudio/技术文档／知识库／知识库接口列表／知识库评测`
- 讲什么：围绕“技术文档／知识库／知识库接口列表／知识库评测”展开，正文主要说明：AI-Studio 的评测使用了 Ragas，Ragas评测指标及计算方式见。 章节线索包括：评测指标及计算方式。
- 主题：数据分析
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### 技术文档／账单接口使用文档

- child_asset_id：`ka-src-0005-child-1894c16a61ec6eea`
- 相对路径：`raw/aistudio/AIStudio/技术文档／账单接口使用文档`
- 讲什么：围绕“技术文档／账单接口使用文档”展开，正文主要说明：不清楚的地方，先@巧锋。 查询大模型每天的使用情况，数据时效: T+1。 章节线索包括：查询账单、接口信息、请求header、请求body、响应body。
- 主题：数据分析、大模型与 Agent、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P3`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### ／AK申请须知（AI Studio&API）

- child_asset_id：`ka-src-0005-child-d4f9775dcc14d080`
- 相对路径：`raw/aistudio/AIStudio/／AK申请须知（AI Studio&API）`
- 讲什么：仅含很短的占位或提示文字：ideaLAB文档中心已全部迁移至钉钉文档，请移步至钉钉文档：
- 主题：安全与权限
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### ／语雀→钉钉文档知识库迁移通知

- child_asset_id：`ka-src-0005-child-3e4f511600cdc4e2`
- 相对路径：`raw/aistudio/AIStudio/／语雀→钉钉文档知识库迁移通知`
- 讲什么：围绕“／语雀→钉钉文档知识库迁移通知”展开，正文主要说明：应集团文档迁移要求，AI Studio已经将文档中心全部迁移至钉钉文档，后续ideaLAB团队将不再维护语雀文档内容，请大家转移钉钉知识库查看。
- 主题：AIStudio 与模型接入
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### ／📢版本更新提示

- child_asset_id：`ka-src-0005-child-0df635f42f86c52d`
- 相对路径：`raw/aistudio/AIStudio/／📢版本更新提示`
- 讲什么：围绕“／📢版本更新提示”展开，正文主要说明：支持PC阿里钉客户端第四屏使用 优化ideaTALK H5版本 支持浏览器插件 Worksapce ​ ​ ​。 章节线索包括：主要在途需求、已发布版本记录。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### MCP测试文档-指定文件夹

- child_asset_id：`ka-src-0005-child-e6bc5bf83e6d5384`
- 相对路径：`raw/aistudio/MCP测试文档-指定文件夹.md`
- 讲什么：围绕“MCP测试文档-指定文件夹”展开，正文主要说明：这是一个测试文档，验证使用 MCP 工具上传到语雀知识库的指定文件夹。 目标文件夹: 需求&bug代码变更文档。 章节线索包括：MCP测试文档 - 指定文件夹。
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### OpenClaw工程开发实战指南

- child_asset_id：`ka-src-0005-child-add6e49a44bb9d8d`
- 相对路径：`raw/aistudio/OpenClaw工程开发实战指南.md`
- 讲什么：围绕“OpenClaw工程开发实战指南”展开，正文主要说明：用 OpenClaw 做工程开发：能干啥、怎么干、如何测试 副标题：让你的 AI Agent 不再是黑盒，一文搞定可观测插件开发全流程。 章节线索包括：用 OpenClaw 做工程开发：能干啥、怎么干、如何测试、🧭 先说清楚：这篇文章能给你什么、一、OpenClaw + 工具链：你能干的工程类事情、二、背景：老插件哪里不行？、三、新插件能干啥：完整 Trace 长这样。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### 00_README

- child_asset_id：`ka-src-0005-child-f2ff5c645910af4c`
- 相对路径：`raw/aistudio/PICPLOT 知识库/00_README`
- 讲什么：围绕“00_README”展开，正文主要说明：PICPLOT (PP) 项目知识库 欢迎来到 PICPLOT 项目知识库。 章节线索包括：PICPLOT (PP) 项目知识库、📁 目录导航、🚀 快速开始 (Quick Start)、⛓️ 核心工作流 (Core Workflows)、🤖 AI 模型与 Prompt 仓库。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### environment

- child_asset_id：`ka-src-0005-child-8df69f814ea52b1f`
- 相对路径：`raw/aistudio/PICPLOT 知识库/01_quickstart/environment.md`
- 讲什么：围绕“environment”展开，正文主要说明：本指南旨在帮助新同学快速拉起 PICPLOT 的本地开发环境。 Python: 3.10 (强制要求) 章节线索包括：💻 环境搭建与开发配置、基础环境、快速安装、配置文件、启动项目。
- 主题：数据分析、项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### overview

- child_asset_id：`ka-src-0005-child-9fff8d6639de9280`
- 相对路径：`raw/aistudio/PICPLOT 知识库/02_workflows/overview.md`
- 讲什么：围绕“overview”展开，正文主要说明：⛓️ 工作流概览与编排逻辑 PICPLOT 项目使用 NexusFlow 工作流引擎来编排复杂的 AI 生产链路。 章节线索包括：⛓️ 工作流概览与编排逻辑、主业务链路、核心设计模式、工作流文件清单。
- 主题：广告投放、数据分析、大模型与 Agent、项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### models_matrix

- child_asset_id：`ka-src-0005-child-ec8c5e7a3ead9a06`
- 相对路径：`raw/aistudio/PICPLOT 知识库/03_ai_models/models_matrix.md`
- 讲什么：围绕“models_matrix”展开，正文主要说明：PICPLOT 项目集成了多家 AI 服务商的多模态模型能力，按业务场景分工如下 负责文本理解、脚本创作、逻辑提取与内容评测。 章节线索包括：🤖 AI 模型分工矩阵、大语言模型 (LLM)、图像生成模型 (T2I)、视频生成模型 (T2V / I2V)、语音合成 (TTS)。
- 主题：大模型与 Agent、项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### state_machines

- child_asset_id：`ka-src-0005-child-723f888600b96e04`
- 相对路径：`raw/aistudio/PICPLOT 知识库/04_data_architecture/state_machines.md`
- 讲什么：围绕“state_machines”展开，正文主要说明：📊 Episode 状态机与流转逻辑 tbepisode 的 stat 字段是驱动整个系统自动流转的“齿轮”。 章节线索包括：📊 Episode 状态机与流转逻辑、EpisodeStatEnum 状态流转图、关键字段说明、任务重试逻辑。
- 主题：项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### cloud_services

- child_asset_id：`ka-src-0005-child-5c849f60cbd08b4c`
- 相对路径：`raw/aistudio/PICPLOT 知识库/05_infrastructure/cloud_services.md`
- 讲什么：围绕“cloud_services”展开，正文主要说明：☁️ 基础设施与云服务概览 PICPLOT 系统的生产力很大程度上取决于底层云服务的稳定性。 章节线索包括：☁️ 基础设施与云服务概览、存储服务 (OSS)、视频处理 (ICE)、认证体系 (BUC SSO)、异步队列 (Redis/Kafka)。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、前端体验
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### PICPLOT 知识库索引

- child_asset_id：`ka-src-0005-child-3deadea5d5ce6dac`
- 相对路径：`raw/aistudio/PICPLOT 知识库/PICPLOT 知识库索引`
- 讲什么：围绕“PICPLOT 知识库索引”展开，正文主要说明：PICPLOT (PP) 项目知识库 欢迎来到 PICPLOT 项目知识库。 章节线索包括：PICPLOT (PP) 项目知识库、📁 目录导航、🚀 快速开始 (Quick Start)、⛓️ 核心工作流 (Core Workflows)、🤖 AI 模型与 Prompt 仓库。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-f2ff5c645910af4c`

### README

- child_asset_id：`ka-src-0005-child-3af524ce08e857d2`
- 相对路径：`raw/aistudio/PICPLOT 知识库/README.md`
- 讲什么：围绕“README”展开，正文主要说明：PICPLOT (PP) 项目知识库 欢迎来到 PICPLOT 项目知识库。 章节线索包括：PICPLOT (PP) 项目知识库、📁 目录导航、🚀 快速开始 (Quick Start)、⛓️ 核心工作流 (Core Workflows)、🤖 AI 模型与 Prompt 仓库。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-f2ff5c645910af4c`

### index

- child_asset_id：`ka-src-0005-child-2c75f29ef8772079`
- 相对路径：`raw/aistudio/PICPLOT 知识库/index.md`
- 讲什么：围绕“index”展开，正文主要说明：PICPLOT 知识库目录。 章节线索包括：PICPLOT 知识库目录。
- 主题：AIStudio 与模型接入
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### project_summary

- child_asset_id：`ka-src-0005-child-337786efeafad6f9`
- 相对路径：`raw/aistudio/PICPLOT 知识库/picplot_project/project_summary.md`
- 讲什么：围绕“project_summary”展开，正文主要说明：PICPLOT (PP) 项目梳理总结 PICPLOT (PP) 是一个基于 AI 技术的自动化短视频/剧集生成平台。 章节线索包括：PICPLOT (PP) 项目梳理总结、项目概览、核心架构设计、2.1 逻辑分层、2.2 任务调度系统 (src/app/scheduler)。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### vidu_migration_requirement

- child_asset_id：`ka-src-0005-child-36044b406eedc3e1`
- 相对路径：`raw/aistudio/PICPLOT 知识库/picplot_project/vidu_migration_requirement.md`
- 讲什么：围绕“vidu_migration_requirement”展开，正文主要说明：生成分镜视频接入 vidu (迁移需求) picplot-web 是一个 SpringBoot 服务，要改造成 Python 服务，对应工程是 picplot。 章节线索包括：生成分镜视频接入 vidu (迁移需求)、背景、需求详情、开发要求。
- 主题：项目管理
- 质量/异常：substantive；duplicate_content_group_member
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`

### ProcurementToolsSelectorComponent需求文档

- child_asset_id：`ka-src-0005-child-ad207d9b35f59cf1`
- 相对路径：`raw/aistudio/ProcurementToolsSelectorComponent需求文档.md`
- 讲什么：围绕“ProcurementToolsSelectorComponent需求文档”展开，正文主要说明：ProcurementToolsSelectorComponent 1688 MUI Chatbot 对话流渲染。 章节线索包括：ProcurementToolsSelectorComponent、所属场景、关联上下文、核心约束（必须遵守），请直接将【MUI组件模版 index.tsx】内容直接放在输出的需求文档中，不要篡改。、验收标准。
- 主题：数据分析、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### yacs-deployer-发布完成清理流程

- child_asset_id：`ka-src-0005-child-82f6cffa278ffec0`
- 相对路径：`raw/aistudio/YACS部署器业务文档/yacs-deployer-发布完成清理流程.md`
- 讲什么：围绕“yacs-deployer-发布完成清理流程”展开，正文主要说明：[核心功能知识条目 - YACS部署器发布完成清理流程] 功能定义与边界 (Scope) 章节线索包括：[核心功能知识条目 - YACS部署器发布完成清理流程]、功能定义与边界 (Scope)、核心逻辑链路 (Logic Trace)、业务规则辞典 (Business Rule Dictionary)、数据实体图谱 (Data Schema)。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。
- 可提取：只在遇到具体 AIStudio 问题时定向查阅。
- 借鉴边界：不进入产品功能清单或默认 Agent 知识。
- 审查/发布：`unreviewed_child / not_ready`

### !!!雀儿空投测试!!!

- child_asset_id：`ka-src-0005-child-8859ed4f285d9fe0`
- 相对路径：`raw/aistudio/picplot/!!!雀儿空投测试!!!`
- 讲什么：围绕“!!!雀儿空投测试!!!”展开，正文主要说明：雀儿空投测试\n这是一个测试文档，请检查是否在 picplot 目录下可见。 章节线索包括：雀儿空投测试\n这是一个测试文档，请检查是否在 picplot 目录下可见。。
- 主题：AIStudio 与模型接入
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### environment

- child_asset_id：`ka-src-0005-child-e59c739b01d276cd`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/01_quickstart/environment`
- 讲什么：围绕“environment”展开，正文主要说明：本指南旨在帮助新同学快速拉起 PICPLOT 的本地开发环境。 Python: 3.10 (强制要求) 章节线索包括：💻 环境搭建与开发配置、基础环境、快速安装、配置文件、启动项目。
- 主题：数据分析、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-8df69f814ea52b1f`

### overview

- child_asset_id：`ka-src-0005-child-d3a09645534024ed`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/02_workflows/overview`
- 讲什么：围绕“overview”展开，正文主要说明：⛓️ 工作流概览与编排逻辑 PICPLOT 项目使用 NexusFlow 工作流引擎来编排复杂的 AI 生产链路。 章节线索包括：⛓️ 工作流概览与编排逻辑、主业务链路、核心设计模式、工作流文件清单。
- 主题：广告投放、数据分析、大模型与 Agent、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-9fff8d6639de9280`

### models_matrix

- child_asset_id：`ka-src-0005-child-f49129f44797f695`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/03_ai_models/models_matrix`
- 讲什么：围绕“models_matrix”展开，正文主要说明：PICPLOT 项目集成了多家 AI 服务商的多模态模型能力，按业务场景分工如下 负责文本理解、脚本创作、逻辑提取与内容评测。 章节线索包括：🤖 AI 模型分工矩阵、大语言模型 (LLM)、图像生成模型 (T2I)、视频生成模型 (T2V / I2V)、语音合成 (TTS)。
- 主题：大模型与 Agent、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-ec8c5e7a3ead9a06`

### state_machines

- child_asset_id：`ka-src-0005-child-d671cdcdda421dc8`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/04_data_architecture/state_machines`
- 讲什么：围绕“state_machines”展开，正文主要说明：📊 Episode 状态机与流转逻辑 tbepisode 的 stat 字段是驱动整个系统自动流转的“齿轮”。 章节线索包括：📊 Episode 状态机与流转逻辑、EpisodeStatEnum 状态流转图、关键字段说明、任务重试逻辑。
- 主题：项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-723f888600b96e04`

### cloud_services

- child_asset_id：`ka-src-0005-child-56dae138c13df439`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/05_infrastructure/cloud_services`
- 讲什么：围绕“cloud_services”展开，正文主要说明：☁️ 基础设施与云服务概览 PICPLOT 系统的生产力很大程度上取决于底层云服务的稳定性。 章节线索包括：☁️ 基础设施与云服务概览、存储服务 (OSS)、视频处理 (ICE)、认证体系 (BUC SSO)、异步队列 (Redis/Kafka)。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、前端体验
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-5c849f60cbd08b4c`

### README

- child_asset_id：`ka-src-0005-child-cc36fb7a18afd7df`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/README`
- 讲什么：围绕“README”展开，正文主要说明：PICPLOT (PP) 项目知识库 欢迎来到 PICPLOT 项目知识库。 章节线索包括：PICPLOT (PP) 项目知识库、📁 目录导航、🚀 快速开始 (Quick Start)、⛓️ 核心工作流 (Core Workflows)、🤖 AI 模型与 Prompt 仓库。
- 主题：数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-f2ff5c645910af4c`

### project_summary

- child_asset_id：`ka-src-0005-child-0af28d0967437f69`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/picplot_project/project_summary`
- 讲什么：围绕“project_summary”展开，正文主要说明：PICPLOT (PP) 项目梳理总结 PICPLOT (PP) 是一个基于 AI 技术的自动化短视频/剧集生成平台。 章节线索包括：PICPLOT (PP) 项目梳理总结、项目概览、核心架构设计、2.1 逻辑分层、2.2 任务调度系统 (src/app/scheduler)。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-337786efeafad6f9`

### vidu_migration_requirement

- child_asset_id：`ka-src-0005-child-261c0aab1e6a6ac4`
- 相对路径：`raw/aistudio/picplot/PICPLOT知识库/picplot_project/vidu_migration_requirement`
- 讲什么：围绕“vidu_migration_requirement”展开，正文主要说明：生成分镜视频接入 vidu (迁移需求) picplot-web 是一个 SpringBoot 服务，要改造成 Python 服务，对应工程是 picplot。 章节线索包括：生成分镜视频接入 vidu (迁移需求)、背景、需求详情、开发要求。
- 主题：项目管理
- 质量/异常：substantive；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：Agent 体系、知识库、自动化与工作流、平台与部署
- 判断理由：内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。
- 可提取：可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。
- 借鉴边界：只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-36044b406eedc3e1`

### 雀儿测试文档

- child_asset_id：`ka-src-0005-child-fcca358ba3bc3836`
- 相对路径：`raw/aistudio/picplot/雀儿测试文档`
- 讲什么：仅含很短的占位或提示文字：Test
- 主题：AIStudio 与模型接入
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 测试文档-淘宝购买系统

- child_asset_id：`ka-src-0005-child-16d056615d180c29`
- 相对路径：`raw/aistudio/测试文档-淘宝购买系统.md`
- 讲什么：围绕“测试文档-淘宝购买系统”展开，正文主要说明：测试时间: 2026-01-22 测试内容: 钉钉文档上传功能验证。 章节线索包括：钉钉文档上传测试、测试信息、测试步骤、预期结果。
- 主题：AIStudio 与模型接入
- 质量/异常：short
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### 测试文档

- child_asset_id：`ka-src-0005-child-87cb2ceca8b86ef4`
- 相对路径：`raw/aistudio/测试文档.md`
- 讲什么：围绕“测试文档”展开，正文主要说明：这是一个测试文档，用于验证 MCP 上传功能。 章节线索包括：测试文档。
- 主题：AIStudio 与模型接入
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

## EVO 实验平台（19）

### 0.平台介绍

- child_asset_id：`ka-src-0005-child-1ed8cb9353de2691`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/0.平台介绍`
- 讲什么：围绕“0.平台介绍”展开，正文主要说明：EVO实验平台介绍 [大促版）0922.pdf。
- 主题：实验设计
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 1.业务接入指南

- child_asset_id：`ka-src-0005-child-614d174c5a14dec3`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/1.业务接入指南`
- 讲什么：围绕“1.业务接入指南”展开，正文主要说明：一个完整的实验生命周期包括：实验设计、实验配置、联调测试、发布运行、数据分析及实验决策。 工程接入 & 成功校验 ⭐ ️。 章节线索包括：1.申请接入一休sdk、Java服务端、3.客户端、1.iOS、Android。
- 主题：实验设计、数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`direct_candidate`；建议 `selective_extract`
- 用途/阶段：`product_design / later`
- 评估优先级：`P1`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。
- 可提取：可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。
- 借鉴边界：只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。
- 审查/发布：`unreviewed_child / not_ready`

### 2. A／B 实验全流程

- child_asset_id：`ka-src-0005-child-5f63bfc97c473c39`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/2. A／B 实验全流程`
- 讲什么：围绕“2. A／B 实验全流程”展开，正文主要说明：根据实验假设，确定实验方案，并计算最小样本量和时间周期等 根据业务需要，可选择以下三种流量规划模型 + 简单：实验正交 + 流量互斥 - 实验互斥 - 全局空桶 整体遵循，先创建流量模型（场景），再创建域（注：实验互斥非必须），再创建层的顺序。 章节线索包括：实验阶段/实验生命周期、1.图文版、2.一休详情版、实验状态转移图。
- 主题：实验设计、广告投放、数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`direct_candidate`；建议 `selective_extract`
- 用途/阶段：`product_design / later`
- 评估优先级：`P1`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。
- 可提取：可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。
- 借鉴边界：只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。
- 审查/发布：`unreviewed_child / not_ready`

### 3.平台管理

- child_asset_id：`ka-src-0005-child-9ca3a3f5f8fd6089`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/3.平台管理`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：EVO 实验平台
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-2dabfa114f958717`

### 4.实验案例

- child_asset_id：`ka-src-0005-child-5d906a5e33237a05`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/4.实验案例`
- 讲什么：围绕“4.实验案例”展开，正文主要说明：[ [页面样式]签到红包POP弹窗的最佳展示样式 ]( [ [页面样式]手猫详情页提升转化的最佳实践 ](。 章节线索包括：1.产品优化、1.1 页面样式、1.2 交互、1.3 其他、2 .运营策略。
- 主题：实验设计、大模型与 Agent、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`direct_candidate`；建议 `selective_extract`
- 用途/阶段：`product_design / later`
- 评估优先级：`P2`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。
- 可提取：可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。
- 借鉴边界：只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。
- 审查/发布：`unreviewed_child / not_ready`

### 5.A／B 知识专区

- child_asset_id：`ka-src-0005-child-0bb5efec3ff19d8d`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/5.A／B 知识专区`
- 讲什么：围绕“5.A／B 知识专区”展开，正文主要说明：A/B Test能测什么 实验中的最小样本量如何计算。 章节线索包括：A/B知识入门、A/B 常见误区、科学实验原理。
- 主题：实验设计
- 质量/异常：short
- 对 KA 产品的价值：`direct_candidate`；建议 `selective_extract`
- 用途/阶段：`product_design / later`
- 评估优先级：`P2`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。
- 可提取：可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。
- 借鉴边界：只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。
- 审查/发布：`unreviewed_child / not_ready`

### 7.常见问题FAQ

- child_asset_id：`ka-src-0005-child-67abb046a4b8e76c`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/7.常见问题FAQ`
- 讲什么：围绕“7.常见问题FAQ”展开，正文主要说明：1.实验不生效，用户为什么无法命中实验？ 该实验已关闭，任何用户都无法命中实验。 章节线索包括：1.实验不生效，用户为什么无法命中实验？、2.实验发布了，没有实验数据、3.实验分流不均、4.白名单不生效、5.beta发布后，实验不生效。
- 主题：实验设计、数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`direct_candidate`；建议 `selective_extract`
- 用途/阶段：`product_design / later`
- 评估优先级：`P1`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。
- 可提取：可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。
- 借鉴边界：只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。
- 审查/发布：`unreviewed_child / not_ready`

### 8.二方平台接入支持手册

- child_asset_id：`ka-src-0005-child-27e8feeb47e78bc4`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/8.二方平台接入支持手册`
- 讲什么：围绕“8.二方平台接入支持手册”展开，正文主要说明：💡一个完整的实验生命周期包括：实验设计、实验配置、联调测试、发布运行、数据分析及实验决策。 💡 蓝色字体均为可点击超链接。 章节线索包括：EVO(一休)平台简介、如何接入 【必读】、3 . OpenAPI指南、4.快捷使用举例、5.版本变更 changelog。
- 主题：实验设计、数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`direct_candidate`；建议 `selective_extract`
- 用途/阶段：`product_design / later`
- 评估优先级：`P2`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。
- 可提取：可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。
- 借鉴边界：只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。
- 审查/发布：`unreviewed_child / not_ready`

### 【重要❗️必读❗️】一休平台服务等级协议(SLA)

- child_asset_id：`ka-src-0005-child-a6883690efc068d8`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/【重要❗️必读❗️】一休平台服务等级协议(SLA)`
- 讲什么：围绕“【重要❗️必读❗️】一休平台服务等级协议(SLA)”展开，正文主要说明：规范与限制：新增(8)、(9)，调整(14) 除外情形：新增(10)、(11) 章节线索包括：1.  定义、【服务型】服务可用性、2.1.  服务可用性计算公式、2.2.  服务可用性承诺、服务性能。
- 主题：实验设计、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：描述 EVO 平台运营、收费或保障规则，不是 KA 投放产品功能依据。
- 可提取：可参考平台治理和重保意识。
- 借鉴边界：不把别的平台 SLA、收费或封网规则移植到我们的产品。
- 审查/发布：`unreviewed_child / not_ready`

### 一休平台服务BU收费细则

- child_asset_id：`ka-src-0005-child-1e240250ede3694b`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/一休平台服务BU收费细则`
- 讲什么：围绕“一休平台服务BU收费细则”展开，正文主要说明：实时计算：包括用于实时数据存储、实时指标计算、在线数据服务等功能依赖资源消耗项，涉及SLS、TT、Hologres、Flink、ZSearch、Clickhouse等。 离线计算：包括用于AB实验离线指标计算、实验分析等功能所使用的ODPS资源消耗项。 章节线索包括：收费项、计费项说明、按天计费。
- 主题：实验设计、数据分析、研发与部署、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：描述 EVO 平台运营、收费或保障规则，不是 KA 投放产品功能依据。
- 可提取：可参考平台治理和重保意识。
- 借鉴边界：不把别的平台 SLA、收费或封网规则移植到我们的产品。
- 审查/发布：`unreviewed_child / not_ready`

### Rax 接入文档

- child_asset_id：`ka-src-0005-child-417512da46ef7845`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/Rax 接入文档`
- 讲什么：围绕“Rax 接入文档”展开，正文主要说明：SDK不再迭代，推荐使用 ER接入方案 一休Rax SDK提供了一套简单，高效的前端AB实验方案。 章节线索包括：平台地址、介绍、一休Rax SDK 接入方式、特别说明、安装。
- 主题：实验设计、数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。
- 可提取：可了解实验接入曾如何组织。
- 借鉴边界：不复制历史 SDK、接口或版本结论；只作演进背景。
- 审查/发布：`unreviewed_child / not_ready`

### React 接入文档

- child_asset_id：`ka-src-0005-child-3125c300ec6f9fb2`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/React 接入文档`
- 讲什么：围绕“React 接入文档”展开，正文主要说明：SDK不再迭代，推荐使用 ER接入方案 一休React SDK提供了一套简单，高效的前端AB实验方案。 章节线索包括：介绍、一休React SDK 接入方式、特别说明、安装、声明式接入。
- 主题：实验设计、数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。
- 可提取：可了解实验接入曾如何组织。
- 借鉴边界：不复制历史 SDK、接口或版本结论；只作演进背景。
- 审查/发布：`unreviewed_child / not_ready`

### rax多端小程序 接入文档

- child_asset_id：`ka-src-0005-child-8ea934a2279bbb33`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/rax多端小程序 接入文档`
- 讲什么：围绕“rax多端小程序 接入文档”展开，正文主要说明：SDK不再迭代，推荐使用 ER接入方案 一休多端小程序 SDK为前端开发者提供了一种接入实验的方式。 章节线索包括：接入前准备、添加服务器域名白名单 （微信，支付宝都需要配置，淘宝轻应用不需要配置）、申请挂载相应功能包 （支付宝配置）、在项目里面需要将userId存入缓存中（接入集团的登录体系找 @金铎 ） （微信配置）、安装。
- 主题：实验设计、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。
- 可提取：可了解实验接入曾如何组织。
- 借鉴边界：不复制历史 SDK、接口或版本结论；只作演进背景。
- 审查/发布：`unreviewed_child / not_ready`

### 创建实验（2.0版本）

- child_asset_id：`ka-src-0005-child-ea314827b743e721`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/创建实验（2.0版本）`
- 讲什么：围绕“创建实验（2.0版本）”展开，正文主要说明：一休平台支持两种实验模式:A/B实验和定向投放。 是指为优化某一个指标制定两个或多个方案，在同一时间把用户流量随机分为A、B两组，分别访问不同的产品方案，最后根据用户的真实数据反馈评估出最优的方案。 章节线索包括：A/B实验、定向投放。
- 主题：实验设计、广告投放、数据分析、前端体验
- 质量/异常：short；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。
- 可提取：可了解实验接入曾如何组织。
- 借鉴边界：不复制历史 SDK、接口或版本结论；只作演进背景。
- 审查/发布：`unreviewed_child / not_ready`

### 废弃文档

- child_asset_id：`ka-src-0005-child-556bf6b290d36478`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/废弃文档`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：EVO 实验平台
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate、historical_or_deprecated_path
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 淘宝／支付宝小程序 接入文档

- child_asset_id：`ka-src-0005-child-4879da79ada724ff`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/淘宝／支付宝小程序 接入文档`
- 讲什么：围绕“淘宝／支付宝小程序 接入文档”展开，正文主要说明：SDK不再迭代，推荐使用 ER接入方案 一休(淘宝/支付宝)小程序 SDK 接入方式。 章节线索包括：一休(淘宝/支付宝)小程序 SDK 接入方式、特别说明、接入前准备、添加服务器域名白名单、申请挂载相应功能包。
- 主题：实验设计、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。
- 可提取：可了解实验接入曾如何组织。
- 借鉴边界：不复制历史 SDK、接口或版本结论；只作演进背景。
- 审查/发布：`unreviewed_child / not_ready`

### 离线分流

- child_asset_id：`ka-src-0005-child-6134a507b77c9474`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/历史文档/离线分流`
- 讲什么：围绕“离线分流”展开，正文主要说明：鉴于很多业务方需要在ODPS中调用一休分流接口补数据，一休提供了UDF函数，该UDF支持对特定实验的分桶判定能否命中 step1 : 申请udf函数 evohash。 章节线索包括：申请流程、step1 : 申请udf函数 evohash、step2 : 申请udf函数对应资源 evo-hash.jar、使用参考。
- 主题：实验设计、数据分析
- 质量/异常：short；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。
- 可提取：可了解实验接入曾如何组织。
- 借鉴边界：不复制历史 SDK、接口或版本结论；只作演进背景。
- 审查/发布：`unreviewed_child / not_ready`

### 封网通知 & 一休大促实验操作规范白皮书

- child_asset_id：`ka-src-0005-child-53987e59084cda73`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/封网通知 & 一休大促实验操作规范白皮书`
- 讲什么：围绕“封网通知 & 一休大促实验操作规范白皮书”展开，正文主要说明：大促期间，平台将于峰值时间段封网， 封网阶段实验不可新建，不可变更。 【提醒】请大家检查并调整自己的实验开始/结束时间，禁止在预热期及正式期封网时间内内上下线。 章节线索包括：一、封网通知、二、重保实验、1.近期大促（双12）重保实验、实验数据影响说明、三、配置规范（自检）。
- 主题：实验设计、数据分析、研发与部署、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：描述 EVO 平台运营、收费或保障规则，不是 KA 投放产品功能依据。
- 可提取：可参考平台治理和重保意识。
- 借鉴边界：不把别的平台 SLA、收费或封网规则移植到我们的产品。
- 审查/发布：`unreviewed_child / not_ready`

### 更新日志

- child_asset_id：`ka-src-0005-child-25beca5fb31c1328`
- 相对路径：`raw/evo/EVO（一休）实验平台用户手册/更新日志`
- 讲什么：围绕“更新日志”展开，正文主要说明：持续更新中，订阅内容请进入群（21945015）。 2021.3 实验数据改版，多维聚合分析🆕。 章节线索包括：发布记录、增长月刊。
- 主题：实验设计、数据分析、研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：实验与效果回收、自动化与工作流、知识库
- 判断理由：描述 EVO 平台运营、收费或保障规则，不是 KA 投放产品功能依据。
- 可提取：可参考平台治理和重保意识。
- 借鉴边界：不把别的平台 SLA、收费或封网规则移植到我们的产品。
- 审查/发布：`unreviewed_child / not_ready`

## O2/Aone 研发与部署（380）

### Aone FaaS／产品简介／Aone FaaS产品介绍

- child_asset_id：`ka-src-0005-child-bda2e6f964542940`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／产品简介／Aone FaaS产品介绍`
- 讲什么：围绕“Aone FaaS／产品简介／Aone FaaS产品介绍”展开，正文主要说明：什么是Aone FaaS 事件驱动: 函数由特定事件触发，如HTTP请求、HSF请求、Mtop请求等。 章节线索包括：什么是Aone FaaS、基础特性、集团典型支持场景、研发平台简述、基础框图。
- 主题：研发与部署、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／产品简介／AoneFaaS 运行时

- child_asset_id：`ka-src-0005-child-1f3e8e1d070d5c3e`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／产品简介／AoneFaaS 运行时`
- 讲什么：围绕“Aone FaaS／产品简介／AoneFaaS 运行时”展开，正文主要说明：运行时（runtime）是指函数的实际执行环境，一般会以语言维度进行区分，其提供了管理运行函数所需的系统依赖和其他资源的隔离环境。 Aone FaaS 支持下列 runtime。 章节线索包括：alinode7、custom.debian10。
- 主题：数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／产品简介／什么场景下不适合用函数

- child_asset_id：`ka-src-0005-child-ccc3db603f5e89c9`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／产品简介／什么场景下不适合用函数`
- 讲什么：围绕“Aone FaaS／产品简介／什么场景下不适合用函数”展开，正文主要说明：函数的架构决定了，有些需求是无法支持的，另外，函数和应用在能力上还是有一定的区别。 以下是函数不适合支持的场景。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／产品简介／快速上手

- child_asset_id：`ka-src-0005-child-76e12fbf0966ff1c`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／产品简介／快速上手`
- 讲什么：围绕“Aone FaaS／产品简介／快速上手”展开，正文主要说明：边缘服务（基座阿里云ESA边缘容器，公网） 应用仓库：可以新建和关联你的code代码仓库 （需要仓库中添加 tbfed 用户为 group 管理员） 章节线索包括：快速开始。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／内侧方案（请联系平台使用）／Aone FaaS 支持 GPU 类函数

- child_asset_id：`ka-src-0005-child-25615bb0b968bf60`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／内侧方案（请联系平台使用）／Aone FaaS 支持 GPU 类函数`
- 讲什么：围绕“Aone FaaS／内侧方案（请联系平台使用）／Aone FaaS 支持 GPU 类函数”展开，正文主要说明：在AI 大背景下，GPU计算已成为支撑大规模AI推理任务的核心基础设施。 Aone FaaS平台推出了 GPU 函数服务，能够轻松部署和运行GPU密集型AI应用。 章节线索包括：创建 GPU 函数、Runtime 脚手架、Fuse 集成、Mount model storage via Fuse service、Transformer。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／方案定制／五分钟使用社区模板部署 node 函数

- child_asset_id：`ka-src-0005-child-07af585ae82373e1`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／方案定制／五分钟使用社区模板部署 node 函数`
- 讲什么：围绕“Aone FaaS／方案定制／五分钟使用社区模板部署 node 函数”展开，正文主要说明：填写仓库等信息，点击下方“创建函数应用”( 等待应用创建和注册流程。 章节线索包括：创建应用、初始化代码、自定义入口、自定义 js 入口文件、自定义启动脚本。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／方案定制／在 AoneFaaS 部署存量 O2 应用

- child_asset_id：`ka-src-0005-child-dc787d8982bc4f21`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／方案定制／在 AoneFaaS 部署存量 O2 应用`
- 讲什么：围绕“Aone FaaS／方案定制／在 AoneFaaS 部署存量 O2 应用”展开，正文主要说明：注意： O2 FC 迁移可分为基座迁移和研发平台迁移，我们提供基座一键迁移工具，基座迁移后的应用仍在 O2 平台进行部署。 如果你希望在新的 AoneFaaS 平台部署存量 O2 平台应用，那么可以继续向下看。 章节线索包括：增加 ${app}.release 文件、修改 package.json、修改 f.yml、直接将 build.sh 替换为新版文件、删除abc.json。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／方案定制／自定义脚手架

- child_asset_id：`ka-src-0005-child-6bdf4f50fd814cc8`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／方案定制／自定义脚手架`
- 讲什么：围绕“Aone FaaS／方案定制／自定义脚手架”展开，正文主要说明：新增一个开放权限的 code 仓库，仓库内提交你的模板代码。 可以参考 aonefaas-generator 代码组 内的示例项目。 章节线索包括：准备一个模板代码仓库、新增数据源、平台查看。
- 主题：数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／方案定制／自定义运行时打包工具

- child_asset_id：`ka-src-0005-child-a9bf0ee256587482`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／方案定制／自定义运行时打包工具`
- 讲什么：围绕“Aone FaaS／方案定制／自定义运行时打包工具”展开，正文主要说明：为简化多语言框架部署到 Aone FaaS，我们提供了通用打包工具，下载地址如下 本工具只适用于自定义 Runtime custom.debian10，不适用于 Rapis。 章节线索包括：执行构建逻辑、压缩 built-functions 目录、完成构建。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／最佳实践／Python 获取入参

- child_asset_id：`ka-src-0005-child-5ffad133606bb65a`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／最佳实践／Python 获取入参`
- 讲什么：围绕“Aone FaaS／最佳实践／Python 获取入参”展开，正文主要说明：Python 3.12 解决方案中，HTTP 接口的常用入参如下。
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／最佳实践／多语言触发器配置

- child_asset_id：`ka-src-0005-child-60bacb5de0e64e71`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／最佳实践／多语言触发器配置`
- 讲什么：围绕“Aone FaaS／最佳实践／多语言触发器配置”展开，正文主要说明：本文档主要介绍平台提供的 Java Python FaaS 解决方案如何通过改动代码中的配置文件发布 HTTP 服务或 HSF 服务 使用下图解决方案所创建应用。 章节线索包括：多语言触发器配置、Java FaaS、hsf 触发器、http 触发器、Python FaaS。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／最佳实践／实现流式和SSE

- child_asset_id：`ka-src-0005-child-b427fbcd50e1a31b`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／最佳实践／实现流式和SSE`
- 讲什么：围绕“Aone FaaS／最佳实践／实现流式和SSE”展开，正文主要说明：Aone FaaS 支持流式分块传输和 SSE SSE 的实现可参考该 demo 预览地址。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／最佳实践／获取当前运行环境

- child_asset_id：`ka-src-0005-child-5f424844eac7052e`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／最佳实践／获取当前运行环境`
- 讲什么：围绕“Aone FaaS／最佳实践／获取当前运行环境”展开，正文主要说明：如何判断当前是预发还是生产环境、如何获得当前应用名 如果是 nodejs ，可直接调用该包获得。 章节线索包括：如何判断当前是预发还是生产环境、如何获得当前应用名。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／AoneFaaS 报警帮助文档

- child_asset_id：`ka-src-0005-child-9b212e7fe72eddf4`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／AoneFaaS 报警帮助文档`
- 讲什么：围绕“Aone FaaS／研发平台／AoneFaaS 报警帮助文档”展开，正文主要说明：点击配置报警进入函数应用对应 sunfire 应用，并且根据配置报警文档进行配置( 目前平台支持的报警项为以下六项。 章节线索包括：QPS/RT/错误率、内存使用率/CPU使用率/容器数。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／AoneFaaS 日志

- child_asset_id：`ka-src-0005-child-ffea279d9e6a7236`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／AoneFaaS 日志`
- 讲什么：围绕“Aone FaaS／研发平台／AoneFaaS 日志”展开，正文主要说明：nodejs（midway 框架） 上下文日志是函数最基础的日志，它位于 context 之上。 章节线索包括：nodejs（midway 框架）、nodejs、java、Python、平台查询日志。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／AoneFaaS 监控

- child_asset_id：`ka-src-0005-child-43ff1f03fdcc500f`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／AoneFaaS 监控`
- 讲什么：围绕“Aone FaaS／研发平台／AoneFaaS 监控”展开，正文主要说明：目前全语言支持以下几种 metrics 指标监控 Java FaaS 额外支持 JVM 相关监控项。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／函数容量评估

- child_asset_id：`ka-src-0005-child-558bc7943a51a17a`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／函数容量评估`
- 讲什么：围绕“Aone FaaS／研发平台／函数容量评估”展开，正文主要说明：预留容器：预留容器比较好理解可以类比于传统应用，启动一定数量的机器一直放在那里处理请求，函数预留容器与之类似，就是启动多个一定规格的容器（单容器规格一般是 1C2G ）不管有没有流量容器一直存在。 当这波流量高峰过去并发下降到预设最大并发值后，这部分弹性容器就会自动缩容。 章节线索包括：容器类型、单实例并发度配置、函数容器弹性范围、注意。
- 主题：实验设计、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／函数常见错误码

- child_asset_id：`ka-src-0005-child-84a31c3c800bcf1d`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／函数常见错误码`
- 讲什么：围绕“Aone FaaS／研发平台／函数常见错误码”展开，正文主要说明：当函数服务异常时，通常会带着错误码返回，通过学习下面常见错误码知识，可以帮助你快速定位问题。 在HTTP协议中，响应状态码 429 Too Many Requests 表示在一定的时间内用户发送了太多的请求，即超出了“频次限制”。 章节线索包括：背景、常见错误码、429、如何处理、499。
- 主题：大模型与 Agent、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／函数并发度与容器范围

- child_asset_id：`ka-src-0005-child-7674aaabb96ff9ff`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／函数并发度与容器范围`
- 讲什么：围绕“Aone FaaS／研发平台／函数并发度与容器范围”展开，正文主要说明：为什么要关注并发与弹性？ 相比较于传统应用，函数容器的价值之一在于按需使用资源和自动弹性伸缩：无需申请固定机器，且能够在流量突增时自动扩容。 章节线索包括：为什么要关注并发与弹性？、基础概念、单实例并发数、容器弹性范围。
- 主题：实验设计、数据分析、研发与部署、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／函数环境变量

- child_asset_id：`ka-src-0005-child-f25907c379d45713`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／函数环境变量`
- 讲什么：围绕“Aone FaaS／研发平台／函数环境变量”展开，正文主要说明：点击函数配置 Tab，修改配置，然后修改对应环境变量配置即可。 注意保存完需要在对应环境发布才能生效。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／函数部署单元

- child_asset_id：`ka-src-0005-child-3229f55de602ce02`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／函数部署单元`
- 讲什么：围绕“Aone FaaS／研发平台／函数部署单元”展开，正文主要说明：和传统应用一样，函数也是分机房部署，目前弹内仅支持 张北、南通、深圳云机房部署，海外近期计划支持新加坡 如果是内网应用，一般只需要部署中心单元（中心即张北） 章节线索包括：确认部署单元、设置部署单元。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／更改函数部署单元

- child_asset_id：`ka-src-0005-child-66105d67b480f8bc`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／更改函数部署单元`
- 讲什么：围绕“Aone FaaS／研发平台／更改函数部署单元”展开，正文主要说明：函数应用上线后，但是由于某些问题，需要改变函数的部署结构。 中心单单元部署 -> 中心、南通双单元或多单元部署。 章节线索包括：场景、注意、函数新增部署单元流程、函数减少部署单元流程。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／研发平台／自定义域名

- child_asset_id：`ka-src-0005-child-ae22a45fd486e10c`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／研发平台／自定义域名`
- 讲什么：围绕“Aone FaaS／研发平台／自定义域名”展开，正文主要说明：平台默认分配的仅为内网域名，当用户需要外网访问或者有个性域名需求的时候，就需要用户申请域名、走统一接入、绑定函数应用。 新增域名（注意：应用名填自己的函数应用） 章节线索包括：背景、步骤。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／域名接入 & 站点管理

- child_asset_id：`ka-src-0005-child-c86f4d307abc887c`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／域名接入 & 站点管理`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／域名接入 & 站点管理”展开，正文主要说明：在边缘容器应用创建时，平台会为应用自动添加日常 / 预发环境各一个内网域名（在侧边栏「函数配置」—「域名配置」中可查看） 用户可在完成日常 / 预发环境发布后，通过对应环境的域名，进行内网服务验证。 章节线索包括：内网域名、线上域名 & 站点、新增站点、删除站点、关联站点。
- 主题：广告投放、数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／容器应用快速上手

- child_asset_id：`ka-src-0005-child-07d21c70b6d68f42`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／容器应用快速上手`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／容器应用快速上手”展开，正文主要说明：进入新建应用页，选择「边缘服务」，并根据业务诉求对应选择可用脚手架，点击下一步。 根据选择的脚手架（以 Express-TS 为例），对应选择使用的容器基础镜像（对于 Express-TS，应选择 node20-nginx-express-ts 镜像），并对应填写其他信息，点击创建等待应用创建 & 初始化。 章节线索包括：应用创建、变更创建、日常 / 预发发布、线上域名、新增站点。
- 主题：广告投放、数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／容器日志

- child_asset_id：`ka-src-0005-child-ee53d02ed5e8c6bb`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／容器日志`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／容器日志”展开，正文主要说明：平台提供容器日志采集 & 投递 & 查询 & 展示等一系列日志能力，辅助用户进行各个环境间独立的问题 / 故障排查。 其中，线上环境日志提供独立日志投递开关，需开启后方可查阅。 章节线索包括：线上日志采集、采集目录约定、日志写入方式、日志查看。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／容器预留

- child_asset_id：`ka-src-0005-child-e1e09b5d7ee8019b`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／容器预留`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／容器预留”展开，正文主要说明：对于边缘容器应用，虽然底层阿里云 ESA 产品提供动态扩缩容能力，但因为当前容器弹起速度为分钟级，对于较大流量业务，仅依靠默认的中国大陆/海外各一个常驻容器无法满足大多数时间的资源诉求。 因此 Aone FaaS 平台对边缘容器应用支持了容器预留能力，允许用户主动向目标区域添加指定数目的常驻容器（会产生额外资源使用费用），从而满足更多场景的能力需要。 章节线索包括：什么是容器预留、如何配置容器预留、预留配置模式支持、单区域预留、批量预留。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／监控

- child_asset_id：`ka-src-0005-child-499315244b23335e`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／监控`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／监控”展开，正文主要说明：对边缘容器应用，平台提供各个环境独立、包含容器指标的监控信息感知 边缘容器应用的日常 / 预发环境监控同其他 Aone FaaS 应用，支持以下几种 metrics 指标监控（JVM 相关监控在 node 应用中不适用） 章节线索包括：日常 / 预发、线上、容器监控。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／资源自持（内测）／什么是资源自持

- child_asset_id：`ka-src-0005-child-893da445c3f9d593`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／资源自持（内测）／什么是资源自持`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／资源自持（内测）／什么是资源自持”展开，正文主要说明：资源自持是相对于平台托管（默认模式）的接入方式。 对于在 FaaS 平台创建的边缘容器应用，一般情况推荐用户使用默认的平台托管模式，在平台进行资源创建，平台将会把对应云资源创建在平台大账号下，由平台进行统一管理。 章节线索包括：解决了什么问题、自持包括哪些资源、注意事项。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／资源自持（内测）／如何进行自持接入

- child_asset_id：`ka-src-0005-child-983f6fc9d0738b5a`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／资源自持（内测）／如何进行自持接入`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／资源自持（内测）／如何进行自持接入”展开，正文主要说明：对于自持接入，与平台托管应用一致，通过 FaaS 应用创建进行接入。 在进行 FaaS 平台操作前，需要。 章节线索包括：前置依赖、FaaS 应用创建（临时链路）。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／边缘服务ESA／边缘容器介绍

- child_asset_id：`ka-src-0005-child-e95840d6a5571ce5`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／边缘服务ESA／边缘容器介绍`
- 讲什么：围绕“Aone FaaS／边缘服务ESA／边缘容器介绍”展开，正文主要说明：边缘容器是 Aone FaaS 平台边缘服务下提供的一种应用类型，底层基于阿里云 ESA 边缘容器产品建设，为用户提供高弹性、易运维的计算资源，并由平台配套提供创建 & 发布流程 & 测试环境 & 运维等一系列全生命周期服务支持。 应用将以容器的方式进行公网部署，通过绑定公网域名的方式进行线上投放，在遍布全球的边缘节点上实现全球部署和就近调度。 章节线索包括：什么是边缘容器、什么场景选择边缘容器、如何使用边缘容器。
- 主题：广告投放、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／迁移指南／O2 FC 基座迁移指南

- child_asset_id：`ka-src-0005-child-1cd0febb20fdd356`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／迁移指南／O2 FC 基座迁移指南`
- 讲什么：围绕“Aone FaaS／迁移指南／O2 FC 基座迁移指南”展开，正文主要说明：迁移入口位于 O2 平台应用概览页，目前以租户为维度开启。 点击可跳转至迁移产品页。
- 主题：数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／迁移指南／O2 FC 泛域名复用

- child_asset_id：`ka-src-0005-child-23d55ef6e9164849`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／迁移指南／O2 FC 泛域名复用`
- 讲什么：围绕“Aone FaaS／迁移指南／O2 FC 泛域名复用”展开，正文主要说明：迁移函数复用平台给的泛域名：appname.fc.alibaba-inc.com 若 fs 平台新增报错，可前往 诺曼底。 章节线索包括：vipserverkey 映射。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／迁移指南／O2 FaaS HSF 切流帮助文档

- child_asset_id：`ka-src-0005-child-3d3d28c6aba1362c`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／迁移指南／O2 FaaS HSF 切流帮助文档`
- 讲什么：围绕“Aone FaaS／迁移指南／O2 FaaS HSF 切流帮助文档”展开，正文主要说明：我们保留了历史的 HSF Provider，通过修改切流配置来做流量的转发，回滚也是同理。 函数切流前如何做功能验证？
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／迁移指南／O2 FaaS 应用 HTTP 域名迁移方案

- child_asset_id：`ka-src-0005-child-c223e613d0b72ae7`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／迁移指南／O2 FaaS 应用 HTTP 域名迁移方案`
- 讲什么：围绕“Aone FaaS／迁移指南／O2 FaaS 应用 HTTP 域名迁移方案”展开，正文主要说明：O2 FaaS 应用 HTTP 域名迁移方案 本文档旨在为 O2 FaaS 用户提供详细的 HTTP 域名迁移指南。 章节线索包括：O2 FaaS 应用 HTTP 域名迁移方案、概述、准备阶段、确认迁移的域名类型、评估域名的可迁移性。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／迁移指南／O2 域名迁移复用（存在BUC版本）

- child_asset_id：`ka-src-0005-child-c9941b9c6d4ac006`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／迁移指南／O2 域名迁移复用（存在BUC版本）`
- 讲什么：围绕“Aone FaaS／迁移指南／O2 域名迁移复用（存在BUC版本）”展开，正文主要说明：旧域名复用（泛域名和自定义域名） 如果希望复用旧的 fc 泛域名或自定义域名，请按下面步骤操作。 章节线索包括：旧域名复用（泛域名和自定义域名）、buc 白名单（未接入 buc 可跳过）、备注： vipserverkey 映射。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### Aone FaaS／迁移指南／判断HTTP域名指向AoneFaaS

- child_asset_id：`ka-src-0005-child-460de506584e51be`
- 相对路径：`raw/o2/终端交付（O2）/Aone FaaS／迁移指南／判断HTTP域名指向AoneFaaS`
- 讲什么：围绕“Aone FaaS／迁移指南／判断HTTP域名指向AoneFaaS”展开，正文主要说明：访问 HTTP 触发器域名，若响应头中携带了 X-Apiserver-Hostname: alifaas-api-server 的字样，则说明该域名已指向新的 AoneFaaS 容器。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／函数相关／FaaS 老 alinode5 项目升级运行时 nodejs 版本到 16

- child_asset_id：`ka-src-0005-child-0050a14cfabb6ac8`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／函数相关／FaaS 老 alinode5 项目升级运行时 nodejs 版本到 16`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／函数相关／FaaS 老 alinode5 项目升级运行时 nodejs 版本到 16”展开，正文主要说明：老项目 alinode5 想要升级到 alinode7 也需要框架升级比较困难， alinode5 是 nodejs12 目前很多包的新版本都不兼容，需要频繁锁包。 下面方法可以在不升级框架和 alinode5 的情况下把运行环境从 nodejs12 -> nodejs16。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／函数相关／O2 Faas 计费项相关说明

- child_asset_id：`ka-src-0005-child-080b6d34053254dc`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／函数相关／O2 Faas 计费项相关说明`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／函数相关／O2 Faas 计费项相关说明”展开，正文主要说明：O2 FaaS 是集团工程化函数开发生态体系。 通过配套的规范、工具、流程定义、权限管理以及数据日志提高前端开发效率，保证团队开发过程的一致性和可复制性，提升代码质量和安全，面向前端开发者的一站式、全流程软件交付平台及服务，助力研发效率提升的产品。 章节线索包括：计价规则（国内）、如何通过账单查询到具体的 O2 应用。
- 主题：数据分析、研发与部署、安全与权限、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／函数相关／函数查询请求日志

- child_asset_id：`ka-src-0005-child-4659b8cfba86018e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／函数相关／函数查询请求日志`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／函数相关／函数查询请求日志”展开，正文主要说明：临时查询函数请求日志方式 根据函数服务的部署单元选择查询region，比如部署了张北 就选择 log-fc-self-monitor-zjk-corp。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／函数相关／函数海外单元部署-新加坡

- child_asset_id：`ka-src-0005-child-67970a5929f0895c`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／函数相关／函数海外单元部署-新加坡`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／函数相关／函数海外单元部署-新加坡”展开，正文主要说明：目前函数线上环境重新正式支持了（容量更大稳定性更高）海外新加坡部署（仅线上，预发统一走集团预发环境）,并且支持了最新的 runtime alinode7，可以配合midway-faas V3 使用。 O2 应用设置中配置应用部署模版，选择对应的新加坡部署模版即可。 章节线索包括：如何将函数部署到新加坡、没有新加坡部署模版、如何添加租户部署模版（FOR 租户管理员）。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／发布规范／为什么不允许发布注释到生产环境

- child_asset_id：`ka-src-0005-child-51493728f11f2277`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／发布规范／为什么不允许发布注释到生产环境`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／发布规范／为什么不允许发布注释到生产环境”展开，正文主要说明：代码注释不允许直接发布到生产环境，主要原因包括以下几点 敏感信息泄露：注释中可能包含内部架构、未公开的API细节、数据库结构、密钥提示或业务逻辑说明，这些信息可能被恶意利用。 章节线索包括：一、基本发布规范、1. 安全风险、2. 性能影响、3. 维护与可读性、4. 行业最佳实践。
- 主题：数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／发布规范／为什么文件大小严格控制在20MB以下

- child_asset_id：`ka-src-0005-child-bd577cc9a6881b51`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／发布规范／为什么文件大小严格控制在20MB以下`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／发布规范／为什么文件大小严格控制在20MB以下”展开，正文主要说明：“为什么O2发布的资源大小严格限制？ ”，在此向用户进行说明。 章节线索包括：CDN链路类型补充说明、大文件拆分建议。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／发布规范／为什么要限制CDN发布文件类型

- child_asset_id：`ka-src-0005-child-7092f8f3996b251e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／发布规范／为什么要限制CDN发布文件类型`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／发布规范／为什么要限制CDN发布文件类型”展开，正文主要说明：CDN链路做文件类型限制的主要原因 安全性：防止恶意文件（如脚本、可执行文件等）通过CDN分发，降低安全风险。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／发布规范／禁止擅自使用代理应用到O2侧服务

- child_asset_id：`ka-src-0005-child-a98290348eb382eb`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／发布规范／禁止擅自使用代理应用到O2侧服务`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／发布规范／禁止擅自使用代理应用到O2侧服务”展开，正文主要说明：为保障系统的稳定性和合规性，平台再次提醒如下事项 禁止擅自使用代理应用（包括但不限于 Aone 应用、ER 等）代理至 O2 源站应用、非自身业务自定义CDN域名、集团公共核心CDN域名。
- 主题：研发与部署、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／平台操作相关／XReplay 录制安全公告

- child_asset_id：`ka-src-0005-child-f2f0e27e99cb8de5`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／平台操作相关／XReplay 录制安全公告`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／平台操作相关／XReplay 录制安全公告”展开，正文主要说明：O2 Space 前端研发平台会收集您在平台使用过程中的操作行为，包括全量的鼠标，键盘操作，控制台错误信息，用于用户的服务质量监测，服务风险控制及服务复盘等目的，便于更好的发现问题及改进平台服务。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／平台操作相关／在构建时使用无头浏览器（puppeteer）

- child_asset_id：`ka-src-0005-child-25d019774ff7083d`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／平台操作相关／在构建时使用无头浏览器（puppeteer）`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／平台操作相关／在构建时使用无头浏览器（puppeteer）”展开，正文主要说明：在构建时使用无头浏览器（puppeteer） 有些项目，希望在构建时通过 puppeteer 实现构建后预渲染，来优化线上资源的体验。 章节线索包括：在构建时使用无头浏览器（puppeteer）、构建配置、编写截图逻辑、触发发布并查看结果。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／平台操作相关／如何批量转交／接收应用负责人

- child_asset_id：`ka-src-0005-child-a58f3eff6ff0b1d1`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／平台操作相关／如何批量转交／接收应用负责人`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／平台操作相关／如何批量转交／接收应用负责人”展开，正文主要说明：如果您是团队管理员，那么可以在「团队空间」批量转交应用负责人（无需审批，转交即时生效） 在应用列表页，将负责人状态选择 “离职”，全量后即可批量修复负责人。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／平台操作相关／推送版本号边界说明

- child_asset_id：`ka-src-0005-child-4e222c5f17b802d5`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／平台操作相关／推送版本号边界说明`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／平台操作相关／推送版本号边界说明”展开，正文主要说明：平台只负责将版本号推送到相应环境的 diamond-server 中，并且以 diamond-server 返回 http response 为判断是否推送成功的依据。 如上图所描述的，diamond-server 到数据库的同步，以及配置同步到用户配置消费侧的链路，都需要用自己验证，O2 Space 无法感知。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／平台操作相关／迭代版本号推送逻辑

- child_asset_id：`ka-src-0005-child-5db50a803734784a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／平台操作相关／迭代版本号推送逻辑`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／平台操作相关／迭代版本号推送逻辑”展开，正文主要说明：研发平台提供了迭代版本号的自动推荐，推荐逻辑如下 主版本 x 必须保持连续：若存在版本号 1.x.x、2.x.x、4.x.x，则主版本号判定为 2（因为 2 和 4 不连续）
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／源站相关／CDN 域名资源处置 FAQ

- child_asset_id：`ka-src-0005-child-1a61bbd6d41d72df`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／源站相关／CDN 域名资源处置 FAQ`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／源站相关／CDN 域名资源处置 FAQ”展开，正文主要说明：人工答疑请访问 研发小蜜（O2 前端研发平台） 正常响应时间为工作日 10:00-18:00，其余时间非紧急线上问题勿扰。 章节线索包括：公告、常用文档、常见问题、归属问题、域名访问相关。
- 主题：广告投放、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／源站相关／O2 CDN 及 源站 404资源治理优化方案

- child_asset_id：`ka-src-0005-child-ad5d76aa80ae3112`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／源站相关／O2 CDN 及 源站 404资源治理优化方案`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／源站相关／O2 CDN 及 源站 404资源治理优化方案”展开，正文主要说明：404请求与200请求消耗同等CDN计算资源 前端重试逻辑会导致请求量倍增（如：1次访问→2-3次重试） 章节线索包括：一、各层面影响分析、1.1 CDN层面、1.2 源站层面、1.3 文件存储（OSS层面）、二、404治理措施。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／源站相关／O2 源站 CDN 计费相关说明

- child_asset_id：`ka-src-0005-child-5ad60209f6756d6a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／源站相关／O2 源站 CDN 计费相关说明`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／源站相关／O2 源站 CDN 计费相关说明”展开，正文主要说明：O2 Space 平台在 2022 年开始对 CDN、页面等资源使用进行收费 如有疑问，请联系研发小蜜。 章节线索包括：计价规则（国内/国外）、如何查看自己名下应用的费用情况、如何通过 HCRM 中的资源 ID 找到 Space 应用？、例如：资源格式 wh1234airwh1234、最新版本HCRM资源ID说明。
- 主题：广告投放、数据分析、研发与部署、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／源站相关／O2研发平台CDN相关问题的应急排查SOP

- child_asset_id：`ka-src-0005-child-e065513b5e681a24`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／源站相关／O2研发平台CDN相关问题的应急排查SOP`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／源站相关／O2研发平台CDN相关问题的应急排查SOP”展开，正文主要说明：确保在 CDN 或源站 出现问题时，能够快速定位并解决问题，减少对业务的影响。 适用于所有使用O2平台上 CDN 服务的业务系统。 章节线索包括：1. 目的、2. 适用范围、3. 职责、4.应急排查流程、4.1 问题发现。
- 主题：广告投放、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／源站相关／如何查看CDN证书信息

- child_asset_id：`ka-src-0005-child-dc25cda3f15e198b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／源站相关／如何查看CDN证书信息`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／源站相关／如何查看CDN证书信息”展开，正文主要说明：当前FY24 集团CDN keyless证书：1f797e2e521a9d9b5577e6dc04aa1a2bd57717ede8edabc3f124b4cd944173f8 FY25证书更新正式开启时间07.02，预计07.15前全量域名证书更换，如遇keyless域名证书访问异常问题及时联系冠夫报备处理。 章节线索包括：一、命令行模式、二、浏览器模式。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／研发类型相关／Assets 开发测试环境域名迁移 FAQ

- child_asset_id：`ka-src-0005-child-75454949dc2be4ca`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／研发类型相关／Assets 开发测试环境域名迁移 FAQ`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／研发类型相关／Assets 开发测试环境域名迁移 FAQ”展开，正文主要说明：Assets 开发测试环境域名迁移 FAQ Assets 开发测试环境的域名有什么变化？ 章节线索包括：Assets 开发测试环境域名迁移 FAQ、Assets 开发测试环境的域名有什么变化？、为什么要这么变化？、以前所使用的绑定 hosts 方式怎么办？、还有别的问题或者需求？。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／研发类型相关／SSR 应用替换测试域名为正式域名

- child_asset_id：`ka-src-0005-child-2c4656e874a42983`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／研发类型相关／SSR 应用替换测试域名为正式域名`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／研发类型相关／SSR 应用替换测试域名为正式域名”展开，正文主要说明：本文档主要告知用户如何在 O2 SSR 解决方案中，把域名从测试域名切换成用户自定义的正式域名。 （仅对 Web 研发类型中的 SSR 方案有效）
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／研发类型相关／Web一体化站点OSS资源申请

- child_asset_id：`ka-src-0005-child-4ab8747f50792414`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／研发类型相关／Web一体化站点OSS资源申请`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／研发类型相关／Web一体化站点OSS资源申请”展开，正文主要说明：访问 space o2 工作台 注意：资源是 BU 级别共用的，如果资源列表中已经有“独立 Assets”或ER 一体化的 OSS 资源，则对应OSS的应用类型都可以使用，可以跳过申请。 章节线索包括：资源准备、step 1、step 2。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／FAQ／研发类型相关／应用类型大全

- child_asset_id：`ka-src-0005-child-460fde033314bf25`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／FAQ／研发类型相关／应用类型大全`
- 讲什么：围绕“O2 Space 用户帮助文档／FAQ／研发类型相关／应用类型大全”展开，正文主要说明：是否强制开启Changefree defgenerator。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／主干研发／使用指南

- child_asset_id：`ka-src-0005-child-8df85ae1fd1d559b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／主干研发／使用指南`
- 讲什么：围绕“O2 Space 用户帮助文档／主干研发／使用指南”展开，正文主要说明：O2 Space 主干研发，是 O2 Space 提供的基于主干研发流程的新一代前端研发平台，地址为 O2 Space 上存量的项目迁移到主干研发 在介绍功能之前，我们先简单介绍下什么是主干研发（已经了解的同学可以跳过） 章节线索包括：主干研发介绍、功能介绍、新建应用、CI 测试准备、单测。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／AOT

- child_asset_id：`ka-src-0005-child-76e5f40ea3891414`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／AOT`
- 讲什么：仅含很短的占位或提示文字：详情见
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／Node 版本自定义

- child_asset_id：`ka-src-0005-child-1bd19e215e699c6e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／Node 版本自定义`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／Node 版本自定义”展开，正文主要说明：O2 Space 对不同的 Node 版本升级问题，采用了每个 Node 版本提供一个单独的镜像的模式，随着 Node 大版本更新，镜像也会随之新增、更新、下线。 系统的默认镜像会定期随 Node 官方版本生命周期，发公告切换，当前的默认版本 14。 章节线索包括：应用定义步骤、构建器定义步骤、更多。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／云构建数据洞察

- child_asset_id：`ka-src-0005-child-f98ac2dedb12f752`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／云构建数据洞察`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／云构建数据洞察”展开，正文主要说明：在 O2 Space 发布流程中，云构建耗时占比最高，是影响我们发布效率的主要步骤 构建过程中会引入外部依赖，可能会带来预期外的风险因素。 章节线索包括：功能概览、详细介绍、质量评级计算方式、构建耗时情况分析、云端缓存使用分析。
- 主题：数据分析、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／云构建配置

- child_asset_id：`ka-src-0005-child-436741e3d15ecacd`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／云构建配置`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／云构建配置”展开，正文主要说明：云构建系统负责发布过程中的代码构建过程，仓库需要添加云构建配置才能正确运行，云构建文档请查看【地址】 提示构建结果为空如何排查。 章节线索包括：O2 Space 在调用云构建时会往 BUILDARGVSTR 中注入如下变量、如何使用 O2 Space 注入的变量、使用 node 脚本、使用 shell 脚本（可通过 sed 匹配获取）、从 defpublishdevbranches 获取变更分支。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／依赖助手与锁依赖自动升级

- child_asset_id：`ka-src-0005-child-a22a63b6cf0d9dc2`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／依赖助手与锁依赖自动升级`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／依赖助手与锁依赖自动升级”展开，正文主要说明：在前端生态中，npm 依赖不可或缺，但因依赖包升级与 Semver 动态版本而造成的各项问题层出不穷。 社区为应用提供了“依赖锁定”能力，来解决动态版本造成的问题，但其也有弊端：无法享受包自动升级带来的 Bug 修复、性能优化、新特性，也会造成依赖包版本碎片化的问题，且锁定的时间越长，后续升级时遇到的阻碍越大。 章节线索包括：简介、适用场景、前端应用开发者、构建环节、CI 环节。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／依赖缓存

- child_asset_id：`ka-src-0005-child-d2ddc05f018c9d0c`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／依赖缓存`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／依赖缓存”展开，正文主要说明：平台已为 O2 Space 应用默认开启包管理器级别的依赖缓存能力，不再需要手动开启。 2024.01.04 - 01.10。 章节线索包括：上线灰度计划、依赖安装速度提升、如何开启 NPM 锁依赖、第一步：在仓库提交 package-lock.json 文件、TNPM 用户。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／依赖锁定

- child_asset_id：`ka-src-0005-child-a1312b1969a96730`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／依赖锁定`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／依赖锁定”展开，正文主要说明：请直接跳转至 常见问题 查阅解决方案。 请跳转至 快速入门 完成准备操作。 章节线索包括：简介、背景、适用场景、开启效果、快速入门。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／关于构建时长的说明

- child_asset_id：`ka-src-0005-child-fc18c178be2ed69b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／关于构建时长的说明`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／关于构建时长的说明”展开，正文主要说明：面板顶部展示的时间是构建节点在流水线中运行时长，它包括流水线节点耗时 + 云构建耗时 - AOT前置构建节约的时间 面板右侧展示的「构建耗时」是指云构建耗时，可以理解为真实的构建任务运行时长。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／如何接入云端编译缓存

- child_asset_id：`ka-src-0005-child-92c1ed382701b12e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／如何接入云端编译缓存`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／如何接入云端编译缓存”展开，正文主要说明：编译缓存命中率统计插件已正式上线，简单接入，让云端缓存状态一目了然！ 编译缓存支持「构建器」为用户批量开启编译缓存功能，点击文档了解详情。 章节线索包括：何为编译缓存、简单三步，配置编译缓存、2.1. Step 1：框架/构建工具开启持久化缓存、2.1.1. 为框架开启持久化缓存能力、2.1.2. 为构建工具开启持久化缓存能力。
- 主题：数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／平台默认开启编译缓存

- child_asset_id：`ka-src-0005-child-769620895f80fae1`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／平台默认开启编译缓存`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／平台默认开启编译缓存”展开，正文主要说明：云构建平台于 2024 年 9 月 9 日起将为构建后有持久化缓存生成的项目在日常发布环境默认开启编译缓存。 为什么平台要默认开启编译缓存？ 章节线索包括：为什么平台要默认开启编译缓存？、如何判断应用默认开启了编译缓存？、O2 Space、云构建详情页、如何关闭默认开启编译缓存功能？。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／构建详情

- child_asset_id：`ka-src-0005-child-2d309773fc5726cd`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／构建详情`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／构建详情”展开，正文主要说明：O2 Space 工程平台为每次发布的构建提供了多种数据，可以帮助你更好的了解构建的状态，在定位构建相关的问题时这些辅助信息也能帮助你更快速的定位问题。 在构建流程结束后，你可以通过如下方式打开构建详情面板。 章节线索包括：打开构建详情面板、构建详情面板、构建日志、Sourcemap 面板、构建时依赖面板。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／云构建／构建阶段化

- child_asset_id：`ka-src-0005-child-e17fcaf3ef524147`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／云构建／构建阶段化`
- 讲什么：围绕“O2 Space 用户帮助文档／云构建／构建阶段化”展开，正文主要说明：云构建构建器、构建脚本以往只约定了一个简单的入口文件，可自由配置，不提供面向前端构建场景额外的能力和约束，实现非常灵活，这带来了以下问题 平台无法感知到构建逻辑内部的执行情况，连 install 阶段和 build 阶段都无法区分出来，导致平台在依赖安装、构建环节做的一些优化无法被充分利用起来（比如平台锁依赖安装后，构建器额外再安装了一次的问题） 章节线索包括：背景、升级收益、更友好的构建日志展示、无感启用锁依赖安装、0 成本的数据采集。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 03 月产品更新

- child_asset_id：`ka-src-0005-child-04342a7991d07756`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 03 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 03 月产品更新”展开，正文主要说明：O2 Space 研发平台 修复新建质量插件时样式异常的问题。 章节线索包括：O2 Space 研发平台、修复、新增、优化。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 04 月产品更新

- child_asset_id：`ka-src-0005-child-8a5df465ae5a589f`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 04 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 04 月产品更新”展开，正文主要说明：O2 Space 研发平台 对于构建产物静态检测未命中灰度场景，相应不添加数据库触发记录，避免展示未触发。 章节线索包括：O2 Space 研发平台、修复、新增、优化。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 05 月产品更新

- child_asset_id：`ka-src-0005-child-b8e5ca2020e1be18`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 05 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 05 月产品更新”展开，正文主要说明：O2 Space 研发平台 团队空间中，兼容团队主管无工号情况，防止团队实例化失败。 章节线索包括：O2 Space 研发平台、修复、新增、优化、主干研发。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 06 月产品更新

- child_asset_id：`ka-src-0005-child-e3a327ede5337606`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 06 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 06 月产品更新”展开，正文主要说明：O2 Space 研发平台 重要更新O2 用户帮助中心上线，平台地址，主要功能点如下。 章节线索包括：O2 Space 研发平台、新增、优化、修复。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 07 月产品更新

- child_asset_id：`ka-src-0005-child-69259dfab50eff35`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 07 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 07 月产品更新”展开，正文主要说明：O2 Space 研发平台 增加自动部署的提醒及一键开启。 章节线索包括：O2 Space 研发平台、新增、优化、修复。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 08 月产品更新

- child_asset_id：`ka-src-0005-child-632c67c9d2581509`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 08 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 08 月产品更新”展开，正文主要说明：O2 Space 研发平台 o2-space 新建应用支持选择主干研发。 章节线索包括：O2 Space 研发平台、新增、优化、修复。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 09 月产品更新

- child_asset_id：`ka-src-0005-child-d8d5d2c53edfbf4a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 09 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 09 月产品更新”展开，正文主要说明：O2 Space 研发平台 扩展开放产品升级，详情见文档。 章节线索包括：O2 Space 研发平台、新增、优化、修复。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品动态／2024 年 10 月产品更新

- child_asset_id：`ka-src-0005-child-a4169307dd3c3807`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品动态／2024 年 10 月产品更新`
- 讲什么：围绕“O2 Space 用户帮助文档／产品动态／2024 年 10 月产品更新”展开，正文主要说明：O2 Space 研发平台 【o2 pai】开放控制台支持单独新建、管理研发类型和应用类型。 章节线索包括：O2 Space 研发平台、优化、修复。
- 主题：数据分析、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品简介／平台介绍

- child_asset_id：`ka-src-0005-child-396482c4b39707f1`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品简介／平台介绍`
- 讲什么：围绕“O2 Space 用户帮助文档／产品简介／平台介绍”展开，正文主要说明：O2 Space 研发平台是面向终端研发同学的应用研发交付平台。 通过底层建设的流水线、构建等基础服务驱动以及开放体系能力的支撑，结合不同的代码源服务，迭代/主干研发模式。 章节线索包括：简介、链路类型、平台特性、持续集成/持续部署、开放。
- 主题：数据分析、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／产品简介／术语库

- child_asset_id：`ka-src-0005-child-d09ec5ed4ab96741`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／产品简介／术语库`
- 讲什么：围绕“O2 Space 用户帮助文档／产品简介／术语库”展开，正文主要说明：O2 Space 研发平台基于集团 Code 、 OSS 等多种代码源，以应用为研发基础单位，实现了从接入到部署上线的研发流程。 其中通过 应用 、迭代、变更、发布实现了流程的串联和规范。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／体验故事／体验故事十一期

- child_asset_id：`ka-src-0005-child-1c8565401fbef21a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／体验故事／体验故事十一期`
- 讲什么：围绕“O2 Space 用户帮助文档／体验故事／体验故事十一期”展开，正文主要说明：我们决定重新启动体验双周刊啦！ 在体验双周刊中我们会透出在过去两周里做了哪些体验相关的优化和改进，以及下一步会做哪些改进。 章节线索包括：背景、体验小故事、部署预检展示优化 @乾杯、文档侧边阅读器 @时路、变更分支的集成验证结果通知 @栖邀。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／变更管理／变更创建

- child_asset_id：`ka-src-0005-child-3463978af240e810`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／变更管理／变更创建`
- 讲什么：围绕“O2 Space 用户帮助文档／变更管理／变更创建”展开，正文主要说明：当用户需要在平台侧对仓库的开发分支进行日常 / 线上发布时，需要通过变更来完成这一操作，变更是用户在平台上研发活动的最小单元。 基于上线批次，完成迭代创建。 章节线索包括：背景信息、前提条件、具体操作、常见问题。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／变更管理／变更概述

- child_asset_id：`ka-src-0005-child-85e38c0b77316295`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／变更管理／变更概述`
- 讲什么：围绕“O2 Space 用户帮助文档／变更管理／变更概述”展开，正文主要说明：在应用迭代中，变更代表以仓库代码分支为基础的，包含相关分支所需完成的 开发需求描述、代码审核、工作项绑定操作 的一个集合概念。 变更是用户在 O2 Space 主站上进行研发活动的最小单元，与代码库的分支挂钩，用于实现对单一功能实现所对应的代码分支（又称变更分支）进行产品化管理。 章节线索包括：变更的概念、应用场景。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／变更管理／变更设置

- child_asset_id：`ka-src-0005-child-18ffd39f9835bb21`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／变更管理／变更设置`
- 讲什么：围绕“O2 Space 用户帮助文档／变更管理／变更设置”展开，正文主要说明：变更是用户在 O2 Space 进行研发活动的最小单元，代码评审、工作项绑定等功能均与之直接相关。 用户在平台上完成了对应的变更创建。 章节线索包括：背景信息、前提条件、具体操作。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／代码评审

- child_asset_id：`ka-src-0005-child-574a9b602e7903f3`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／代码评审`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／代码评审”展开，正文主要说明：O2 Space 平台利用 CR（代码评审）数据，打造了代码评审报表功能。 该功能可使您可以多方位了解团队及个人的代码评审状况，有助于提升代码质量和协作效率，欢迎大家积极体验！ 章节线索包括：操作入口、如何使用、功能介绍、指标总览、团队维度。
- 主题：数据分析、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／应用／应用分析

- child_asset_id：`ka-src-0005-child-c6edde65cba8724b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／应用／应用分析`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／应用／应用分析”展开，正文主要说明：应用分析包含应用数据、应用成员数据。 应用数据：包含各应用类型的发布次数、近30天未发布过的应用、各类型应用的分布、每日发布时长趋势图。 章节线索包括：应用分析、应用数据、成员数据。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／应用／应用列表&类型

- child_asset_id：`ka-src-0005-child-a068e5112858de38`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／应用／应用列表&类型`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／应用／应用列表&类型”展开，正文主要说明：应用列表下，展示了当前团队下的所有应用及其负责人情况。 点击应用ID，可跳转到当前应用。 章节线索包括：应用列表、应用类型、脚手架、结果查看。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／应用／应用规则

- child_asset_id：`ka-src-0005-child-112dc88af6a316d4`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／应用／应用规则`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／应用／应用规则”展开，正文主要说明：在应用规则下，团队管理员可自行为团队配置应用规则，如门神检查器、外包发布管控、Aone 工作项强制绑定等。 团队管理员可自行设置规则生效的范围，如全量范围、自定义范围。 章节线索包括：应用规则、规则展示、添加规则、编辑、删除规则、查看效果。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／应用／应用订阅

- child_asset_id：`ka-src-0005-child-79673c6c73e53b5d`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／应用／应用订阅`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／应用／应用订阅”展开，正文主要说明：团队空间——应用——应用订阅 创建一个 HTTP 服务。 章节线索包括：操作入口、操作流程、创建一个 HTTP 服务、将 POST 服务注册到 O2 网关、在 O2 Space 平台添加订阅。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／应用／质量检测

- child_asset_id：`ka-src-0005-child-49c1a6272502f6cd`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／应用／质量检测`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／应用／质量检测”展开，正文主要说明：本文介绍如何在 O2 Space 团队空间中使用质量检测功能。 质量检测：指研发流程中起到代码质量检测的功能，O2 Space 上所有和质量检测相关的配置项已经全都收拢在这里。 章节线索包括：什么是质量检测、如何配置质量检测、质量插件如何运行、如何自定义质量插件。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／成员管理

- child_asset_id：`ka-src-0005-child-45524b296bb5441e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／成员管理`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／成员管理”展开，正文主要说明：成员角色分为 主管、管理员、普通成员，各角色的权限如下 主管、管理员：能操作团队管理的所有功能，能访问和操作团队下所有应用。 章节线索包括：成员管理。
- 主题：数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／概述

- child_asset_id：`ka-src-0005-child-eda0e7d52d8bdbfa`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／概述`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／概述”展开，正文主要说明：团队空间是以团队维度为背景设计的工作台，包含了首页、应用、成员、代码评审、账单分析、资源管理，提供了全链路的应用管控能，团队管理者可配置应用类型、配置发布规则，查看团队应用大盘，协助管理员更有效地规范团队研发流程以及治理费用。 入口位于顶部导航栏处，点击即可进入。 章节线索包括：团队空间概述、如何进入团队空间、功能介绍。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／账单分析

- child_asset_id：`ka-src-0005-child-adca2f01e725402e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／账单分析`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／账单分析”展开，正文主要说明：账单分析包含 CDN 账单、Fass 账单两部分，可分别进行查看。 其中，每部分账单都包含了成本总览和自助分析，为团队管理员专项治理应用成本提供有力的数据支持。 章节线索包括：账单分析。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／资源管理

- child_asset_id：`ka-src-0005-child-07ae1ada35fca197`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／资源管理`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／资源管理”展开，正文主要说明：目前团队空间提供对 OSS 资源的管理 通过资源管理自助申请 BU 独立的 OSS bucket。 章节线索包括：资源管理、资源申请、申请后使用方法。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／团队空间／首页

- child_asset_id：`ka-src-0005-child-be445178eee9e1a0`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／团队空间／首页`
- 讲什么：围绕“O2 Space 用户帮助文档／团队空间／首页”展开，正文主要说明：首页分为 4 个区块：自定义内容、近期数据总览、重要通知、快捷指引。 自定义内容：自定义内容本质上是一篇钉钉文档，团队管理员可以利用它灵活地编写团队空间首页内容（团队公告、应用开发说明、发布指引等重要内容），便于团队成员在发布平台上就能直接了解到自己团队相关内容。 章节线索包括：介绍、详情图。
- 主题：数据分析、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／平台工具／O2 命令行工具

- child_asset_id：`ka-src-0005-child-4fa8c3c755bee611`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／平台工具／O2 命令行工具`
- 讲什么：围绕“O2 Space 用户帮助文档／平台工具／O2 命令行工具”展开，正文主要说明：DEF CLI 由于 DEF 1.0 网关下线及 NodeJS 10/12 即将停止维护的问题，已停止对于 DEF Build 功能支持，其他功能仍可正常使用。 O2 命令行工具支持所有原 DEF 命令行功能，请使用 O2 命令行用于后续开发。 章节线索包括：背景、相关背景、如何安装、方式一（未安装过 O2 客户端用户）、方式二（适用于已安装 O2 客户端用户）。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／发布设置

- child_asset_id：`ka-src-0005-child-a6cdbfe62ab8c2ed`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／发布设置`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／发布设置”展开，正文主要说明：默认打开，关闭后，DEF 在每次发布时都会重建迭代发布分支，可能会造成「分支预处理」节点运行耗时增加或者合并冲突重复解决 默认关闭，关闭后会检查主干分支上是否有非法提交（非平台合入的提交），如果存在非法提交，发布前会弹框提示确认。 章节线索包括：发布、复用迭代发布分支、关闭主干检查、主干同步检测、上线后删除分支。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／基础设置

- child_asset_id：`ka-src-0005-child-4f28b022c09b3402`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／基础设置`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／基础设置”展开，正文主要说明：应用是 O2 Space 研发的基础，用户的 开发、变更、迭代、发布 等流程都离不开 应用，所以在应用上我们提供了一系列设置项。 进入应用，点击左侧菜单的【设置】，进入应用设置页，可以看到默认打开了基础设置的 tab。 章节线索包括：背景、基础设置、1、应用设置、2、代码评审设置。
- 主题：研发与部署、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／应用创建

- child_asset_id：`ka-src-0005-child-56a63f13ebab6975`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／应用创建`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／应用创建”展开，正文主要说明：应用是其它平台操作的基础，本文将介绍如何创建一个应用。 访问 O2 Space 平台，点击新建应用。 章节线索包括：具体操作、新建仓库、关联仓库、云脚手架介绍、常见问题。
- 主题：数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／应用概述

- child_asset_id：`ka-src-0005-child-18577f11fa3ab84d`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／应用概述`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／应用概述”展开，正文主要说明：应用是以 Code 仓库为基础的研发单位，一个代码仓库对应一个应用，研发同学通过 应用 进行开发、变更、迭代、发布等流程。 按应用的发布产物和发布流程将应用分为不同的应用类型，如 Assets（发布到 CDN）、Tnpm（发布到 Tnpm Registry），在创建应用时、应用信息页面都可以看到应用的应用类型。 章节线索包括：应用概述、应用类型概述、研发类型概述。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／成员管理

- child_asset_id：`ka-src-0005-child-bc9ad5a623d2b4a3`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／成员管理`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／成员管理”展开，正文主要说明：管理应用的成员，包括添加删除成员，分配不同成员的权限等。 进入应用，点击左侧导航栏中 “成员” 的选项。 章节线索包括：具体操作、常见问题。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／更多功能

- child_asset_id：`ka-src-0005-child-eafb14f1d5c54fac`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／更多功能`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／更多功能”展开，正文主要说明：进入应用详情页，点击收藏按钮 回到首页切换到“我的收藏”，可以看到刚才收藏的应用。 章节线索包括：应用收藏。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／通知设置

- child_asset_id：`ka-src-0005-child-41de35b44e82c184`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／通知设置`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／通知设置”展开，正文主要说明：进入应用设置页，点击【通知设置】的 tab，即可设置应用不同操作时的 钉钉通知 在这个页面，可对各消息通知场景增加群聊配置，也可以自定义额外关注人。 章节线索包括：功能说明、群聊配置步骤、自定义人员、消息类型。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／集成验证

- child_asset_id：`ka-src-0005-child-a990dda1cd18de73`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／集成验证`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／集成验证”展开，正文主要说明：集成验证是 O2 Space 平台在实现敏捷研发目标下，对原持续集成和代码规范扫描能力的一次集中升级。 在当前质量检测 2.0已提供发布阶段的质量检测能力背景下，通过对扫描器配置和运行能力的打通，实现在代码提交场景对变更分支进行质量检测，实现质量左移。 章节线索包括：集成验证的概述、与原持续集成区别、如何使用、扫描器配置、扫描触发和结果查看。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／应用管理／高级设置

- child_asset_id：`ka-src-0005-child-1d783c113b2078d2`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／应用管理／高级设置`
- 讲什么：围绕“O2 Space 用户帮助文档／应用管理／高级设置”展开，正文主要说明：进入【应用设置】-> 【高级设置】 目前 O2 Space 的前端发布是以 master 分支为单一主干，迭代的代码分支检查、代码合并都是围绕 master 分支。 章节线索包括：功能入口、多主干设置、成员同步设置。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／开发指南／metaq 消息

- child_asset_id：`ka-src-0005-child-6b7e53cc4142e413`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／开发指南／metaq 消息`
- 讲什么：围绕“O2 Space 用户帮助文档／开发指南／metaq 消息”展开，正文主要说明：变更创建
 
变更完成
 
变更废弃
 
迭代绑定变更
 
任务发布
 
页面灰度
 
页面回滚。 章节线索包括：变更创建、变更完成、变更废弃、迭代绑定变更、任务发布。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／开发指南／离线数据

- child_asset_id：`ka-src-0005-child-f088fe249cfcdcbf`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／开发指南／离线数据`
- 讲什么：围绕“O2 Space 用户帮助文档／开发指南／离线数据”展开，正文主要说明：注意：根据数据安全生产要求，O2 Space 离线数据不再全量开放，请根据实际使用范围申请。 P1 O2 Space 开放离线数据包括。 章节线索包括：注意：根据数据安全生产要求，O2 Space 离线数据不再全量开放，请根据实际使用范围申请。、P1 O2 Space 开放离线数据包括、P2 已经隔离的BU列表、P3 如上述隔离BU视图没有你所在部门，请进入。
- 主题：数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／开发指南／自定义异步任务／线上卡口

- child_asset_id：`ka-src-0005-child-dcb9f18bbd3502c5`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／开发指南／自定义异步任务／线上卡口`
- 讲什么：围绕“O2 Space 用户帮助文档／开发指南／自定义异步任务／线上卡口”展开，正文主要说明：本文介绍如何在 O2 Space 研发平台自定义三方异步任务以及线上卡口。 异步任务指的是在 O2 Space 研发平台发布完日常/预发后需要触发的检测任务，如代码安全扫描、工作项验收检测等。 章节线索包括：背景信息、使用场景、具体操作、提供必要的检测项配置、O2 Space 传递的数据内容。
- 主题：数据分析、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／归档／AI 生成单元测试

- child_asset_id：`ka-src-0005-child-ab140cf264bc74c5`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／归档／AI 生成单元测试`
- 讲什么：围绕“O2 Space 用户帮助文档／归档／AI 生成单元测试”展开，正文主要说明：AI 生成单元测试功能旨在通过 LLM 的能力以及工程化的手段对增量代码编写单元测试，核心是为了解决一些应用缺少单元测试以及编写成本过高的问题。 目前 AI 生成单元测试功能为预览版本，需要在平台集成验证中添加单元测试插件。 章节线索包括：功能概述、如何使用、开启单元测试插件、使用 AI 生成单元测试、常见问题。
- 主题：大模型与 Agent、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／归档／自定义质量插件

- child_asset_id：`ka-src-0005-child-71598dd6a04be075`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／归档／自定义质量插件`
- 讲什么：围绕“O2 Space 用户帮助文档／归档／自定义质量插件”展开，正文主要说明：本文介绍如何在 O2 Space 研发平台自定义质量插件。 质量插件指研发流程中起到代码质量验证功能的插件，如单元测试、E2E扫描、源码检测、构建产物检测等。 章节线索包括：背景信息、使用场景、具体操作、新建插件、新增插件版本。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／快速入门

- child_asset_id：`ka-src-0005-child-6b5c0ffafb01001b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／快速入门`
- 讲什么：围绕“O2 Space 用户帮助文档／快速入门”展开，正文主要说明：O2 Space 研发平台 是基于集团 Code 、 OSS 等多种代码源，以应用为研发基础单位，实现了从接入到部署上线的研发流程。 其中通过 应用 、迭代、变更、发布实现了流程的串联和规范。 章节线索包括：仓库接入、新建仓库、关联仓库、迭代创建、应用发布。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型研发类型／小程序

- child_asset_id：`ka-src-0005-child-dbf9d79e88cc6b4f`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型研发类型／小程序`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型研发类型／小程序”展开，正文主要说明：小程序发布 支持发布各种小程序研发类型（原生小程序，Rax小程序）应用到 淘宝、支付宝、微信、钉钉等各端。 小程序仅有一个发布环境，预发阶段和线上阶段仅作为研发阶段的区分。 章节线索包括：小程序、能力介绍、基础能力、提供的发布环境、发布产物说明。
- 主题：研发与部署、安全与权限、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets Plus

- child_asset_id：`ka-src-0005-child-76e903f959faf07b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets Plus`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets Plus”展开，正文主要说明：当前该功能已对用户开放，如有问题请联系 @栖邀、@冠夫。 Space O2 研发平台目前仅支持固定源的 Assets 研发链路，也就是将资源发布到统一的 OSS 资源桶，获得固定的可访问域名。 章节线索包括：当前该功能已对用户开放，如有问题请联系 @栖邀、@冠夫。、背景、痛点、产品链路、新建应用。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 灰度覆盖式

- child_asset_id：`ka-src-0005-child-2af94429afe89060`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 灰度覆盖式`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 灰度覆盖式”展开，正文主要说明：Assets 灰度覆盖式发布 与 Assets 覆盖发布 基本一致，唯一区别是 灰度覆盖式发布 支持利用 ip 进行用户分桶（可识别 ipv4 和 ipv6 ）灰度放量发布，灰度比例支持 0%, 5%, 25%, 50%。 注意，使用 Assets 灰度覆盖式发布 请注意如下几点。 章节线索包括：能力介绍、基础能力、提供的发布环境、应用创建、关于灰度调节。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 覆盖

- child_asset_id：`ka-src-0005-child-c1f1d6d4245d44bd`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 覆盖`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 覆盖”展开，正文主要说明：提醒：因不符合安全生产要求，该研发类型已不支持新仓库接入（存量仓库仍旧可以，但建议迁移），有覆盖发布场景需求的用户请使用 “Assets 灰度覆盖” 研发类型 Assets 覆盖式发布 基本与 Assets非覆盖 一致，唯一区别是发布的路径没有前置版本号。 章节线索包括：能力介绍、使用场景一：通过添加文件名 hash 实现非覆盖式发布、迭代 0.0.1、迭代 0.0.2、使用场景二：未添加 hash，同名文件直接覆盖。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 覆盖／Assets 自定义 Header

- child_asset_id：`ka-src-0005-child-82c252cf451ba5d5`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 覆盖／Assets 自定义 Header`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 覆盖／Assets 自定义 Header”展开，正文主要说明：O2 Space 发布支持 assets 的响应头设置，你只要在仓库根目录添加一个 .assetsmetafile 文件即可。 .assetsmetafile 文件格式如下，如果有多 header 自定义，换行隔开。 章节线索包括：格式、注意事项。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 非覆盖

- child_asset_id：`ka-src-0005-child-840679f7f40a78f7`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 非覆盖`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Assets 研发类型／Assets 非覆盖”展开，正文主要说明：Assets 非覆盖发布 支持将 Code 仓库中的 assets 代码按照一定规则发布到集团日常环境（又称日开发测试环境）和 线上生产环境。 Assets 非覆盖发布 发布产物为 CDN 资源，即构建产物中的 js、css 等资源会被发布到日常或线上 CDN 上。 章节线索包括：能力介绍、基础能力、提供的发布环境、发布产物说明、接入说明。
- 主题：研发与部署、安全与权限、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Assets 研发类型／开启线上构建

- child_asset_id：`ka-src-0005-child-cc3159bc2a832bbc`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Assets 研发类型／开启线上构建`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Assets 研发类型／开启线上构建”展开，正文主要说明：线上构建是指发布线上的过程执行代码构建 assets 发布，默认线上是不执行构建过程的，而是直接获取对应 commitId 最新日常发布的构建结果。 章节线索包括：开启注意事项、如何开启、开启线上构建对流程的影响、构建脚本如何判断当前发布环境、-- 后面表示传入云构建的环境变量。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／ER常见问题

- child_asset_id：`ka-src-0005-child-7e60310c5128e028`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／ER常见问题`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／ER常见问题”展开，正文主要说明：获取代码上传配置异常（you got upper limits of code revisions） 解决方案：ER 最多可保留 10 个程序版本，超过之后需手动清理历史版本。 章节线索包括：ER 常见问题、获取代码上传配置异常（you got upper limits of code revisions）、IPV4s 列表为空、查询域名下 ER 配置失败、er 存在异常，O2 无法继续提供服务，请联系 O2 管理员处理。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／EdgeRoutine

- child_asset_id：`ka-src-0005-child-f5f5ef1f22b1596a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／EdgeRoutine`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／EdgeRoutine”展开，正文主要说明：边缘程序：EdgeRoutine，简称 ER，是一个运行在阿里云全球边缘节点上的 JavaScript 代码运行环境，支持ES6 语法和标准的 Web Service Worker API。 您可以将自行开发的 JavaScript 代码发布至全球边缘程序运行，在全球边缘节点上就近地处理客户端的请求。 章节线索包括：能力介绍、基础能力、提供的发布环境、接入说明、主账号给子账号授权 CDN、DCDN。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／主账号给子账号授权 CDN、DCDN

- child_asset_id：`ka-src-0005-child-1e20da8eebca4a6b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／主账号给子账号授权 CDN、DCDN`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／主账号给子账号授权 CDN、DCDN”展开，正文主要说明：CDN 的域名，子账号需授权 CDN 和 DCDN 的所有权限 DCDN 的域名，子账号需授权 DCDN 的所有权限。 章节线索包括：Step1、Step2、Step3。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／域名与边缘程序绑定

- child_asset_id：`ka-src-0005-child-eb1ea320d57774f5`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／域名与边缘程序绑定`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／域名与边缘程序绑定”展开，正文主要说明：当 ER 接入 O2 Space 后，ER 所绑定的域名初始状态均为未绑定状态，需要用户手动进行绑定。 点击 “去绑定” 按钮，会跳转至域名栏。 章节线索包括：域名与边缘程序绑定、绑定域名、添加域名。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／域名接入

- child_asset_id：`ka-src-0005-child-53f62c48017101fa`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／域名接入`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／域名接入”展开，正文主要说明：准备 AK、SK 子账号，开通 ER 服务。 CDN 的域名，子账号需授权 CDN 和 DCDN 的所有权限。 章节线索包括：新建、账号及域名、新建应用、接管已有 ER、创建成功。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／程序发布与灰度

- child_asset_id：`ka-src-0005-child-41d4f5e806846e85`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／程序发布与灰度`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／程序发布与灰度”展开，正文主要说明：预发：ER 程序发布到内网预发环境，发布完成后点击查看结果，可以看到内网预发的地址 线上验证：原来的预发发布，把 ER 程序发布到公有云预发环境。 章节线索包括：程序发布与灰度、预发、线上验证、线上、灰度环境设置。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／程序版本回滚

- child_asset_id：`ka-src-0005-child-5bd5ee2c70e97117`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／程序版本回滚`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／程序版本回滚”展开，正文主要说明：当存在历史线上版本时，可选择需要回滚到的历史线上版本 当不存在历史线上版本时，则提示是否将域名与程序进行解绑，解绑后域名访问，将不再经过此 ER，解除绑定后仍可在应用概览页进行再次绑定。 章节线索包括：程序版本回滚。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／ER 研发类型／程序管理

- child_asset_id：`ka-src-0005-child-9fe8e54e2814332c`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／ER 研发类型／程序管理`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／ER 研发类型／程序管理”展开，正文主要说明：程序配置包括生产环境配置、预发环境配置和灰度环境配置。 配置项包括：程序规格和域名白名单。 章节线索包括：程序管理、管理、程序配置、程序版本、发布记录。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 单包

- child_asset_id：`ka-src-0005-child-54793f899db7ce71`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 单包`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 单包”展开，正文主要说明：O2 Space tnpm 发布流程是在 tnpm publish 之上提供的一层 tnpm 包发布流程，适用于组件和模块平台的基础发布服务。 支持云端构建，你可以用 ES6 或者 Typescript 编写代码，配置构建命令后云端发布自动构建，不需要将构建后代码存于仓库。 章节线索包括：能力介绍、基础能力、提供的发布环境、发布产物说明、接入说明。
- 主题：研发与部署、安全与权限、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 单包／自定义 prerelease 版本号

- child_asset_id：`ka-src-0005-child-962622bdcfe20459`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 单包／自定义 prerelease 版本号`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 单包／自定义 prerelease 版本号”展开，正文主要说明：版本号为 x.y.z-beta. 形式 建议使用官方构建器 @ali/builder-package。 章节线索包括：日常环境、版本号为 x.y.z-beta. 形式、操作步骤、已经有构建器、自定义日常环境下版本号。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 多包

- child_asset_id：`ka-src-0005-child-0d3b789be8aff330`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 多包`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 多包”展开，正文主要说明：O2 Space TNPM 多包发布流程是在 tnpm publish 之上提供的一层 tnpm 多包 发布流程，适用于组件和模块平台的基础发布服务。 支持 TNPM 多包发布。 章节线索包括：基础能力、提供的发布环境、发布产物说明、接入说明、发布流程。
- 主题：研发与部署、安全与权限、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 多包／自定义prerelease 版本号

- child_asset_id：`ka-src-0005-child-2e71323dad41e3dc`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 多包／自定义prerelease 版本号`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 多包／自定义prerelease 版本号”展开，正文主要说明：日常环境下版本号为 x.y.z-beta. 形式 建议使用官方构建器@ali/builder-package-monorepo。 章节线索包括：日常环境、日常环境下版本号为 x.y.z-beta. 形式、操作步骤、已经有构建器、自定义日常环境下版本号。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 常见问题

- child_asset_id：`ka-src-0005-child-ce157b09b86d19d6`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 常见问题`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／TNPM 研发类型／TNPM 常见问题”展开，正文主要说明：了解更多请查看文档：《一文搞懂 TNPM 发布指定文件》 期望在新的应用使用原先的包名。 章节线索包括：平台发布产物与预期不符、期望在新的应用使用原先的包名。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／TNPM 研发类型／开启 TNPM 日常环境发布

- child_asset_id：`ka-src-0005-child-79b600d6b8cff3ee`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／TNPM 研发类型／开启 TNPM 日常环境发布`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／TNPM 研发类型／开启 TNPM 日常环境发布”展开，正文主要说明：TNPM 默认只允许线上环境发布，在下方的配置中可以开启日常环境发布 该选项开启后开启以后，将强制开启云构建。 章节线索包括：构建器。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／SSR

- child_asset_id：`ka-src-0005-child-349689c51c585df6`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／SSR`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／SSR”展开，正文主要说明：结合 DCDN + ER 能力，通过 FaaS 函数进行页面渲染。 在使用前确认是否有合适的站点，若没有的话需要创建站点并进行域名接入。 章节线索包括：前置准备、创建站点、接入域名、资源申请、域名接入。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／WEB CDN资源刷新&预热

- child_asset_id：`ka-src-0005-child-27b9c6dbc75eae71`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／WEB CDN资源刷新&预热`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／WEB CDN资源刷新&预热”展开，正文主要说明：平台提供了自助刷新或预热 CDN 资源的工具，管理员审批后会直接执行相关操作。 需要刷新的 URL 列表。 章节线索包括：操作入口、资源刷新、资源预热。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／Web Plus

- child_asset_id：`ka-src-0005-child-11fb46ac7a7fc1b2`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／Web Plus`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／Web Plus”展开，正文主要说明：当前该功能已对用户开放，如有问题请联系 @栖邀、@冠夫。 Web Plus 应用类型通过整合跨端应用和 Assets Plus 应用的能力，支持应用将 assets 和 页面发布到业务自定义的域名。 章节线索包括：当前该功能已对用户开放，如有问题请联系 @栖邀、@冠夫。、产品能力、产品链路、接入方式、1）绑定 Assets 站点。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／WebApp

- child_asset_id：`ka-src-0005-child-fc7b4c22bb9141fa`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／WebApp`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／WebApp”展开，正文主要说明：WebApp 发布流程是为 WebApp 类型项目设计的发布解决方案，主要有以下特点。 Assets 发布到 CDN。 章节线索包括：能力介绍、基础能力、提供的发布环境、发布产物说明、接入说明。
- 主题：研发与部署、安全与权限、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／Weex

- child_asset_id：`ka-src-0005-child-2aa0eca72263460b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／Weex`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／Weex”展开，正文主要说明：Weex 发布流程是为 Weex 类型项目设计的发布解决方案，主要有以下特点。 支持 Rax 和 Vue DSL。 章节线索包括：能力介绍、基础能力、提供的发布环境、发布产物说明、接入说明。
- 主题：广告投放、研发与部署、安全与权限、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／产物约定

- child_asset_id：`ka-src-0005-child-ddb0bf2abda6f6b6`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／产物约定`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／产物约定”展开，正文主要说明：跨端应用（含跨端应用、Web Plus 等应用类型）的页面支持强大的多端投放能力，同一个页面 url 可以根据 accept 头返回不同内容。 默认会返回 html，支持的端包括：PHA、Weex2.0。 章节线索包括：产物结构、Assets 产物、页面产物、端协商、自定义 Header。
- 主题：广告投放、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／可缓存 SSR

- child_asset_id：`ka-src-0005-child-0f1eb3677d37937b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／可缓存 SSR`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／可缓存 SSR”展开，正文主要说明：通过可缓存 SSR 的前端页面研发解决方案，可以基于一体化框架 rax 编写代码，通过 serverless 函数进行 SSR 页面渲染，一键部署到 CDN 获得投放域名，并提供完善的降级、兜底、容灾方案。 页面发布后，可以获得可访问的 CDN 地址。 章节线索包括：方案特性、前置准备、新建应用、应用发布、应用灰度。
- 主题：广告投放、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／灰度发布

- child_asset_id：`ka-src-0005-child-491f63edf81c739e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／灰度发布`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／灰度发布”展开，正文主要说明：灰度发布功能提供的是一种放量发布机制。 执行线上发布时，先让内网及少量外网用户访问新页面。 章节线索包括：如何使用、灰度比例说明、细粒度灰度、支持内网灰度的域名、如何强制 命中/不命中 灰度页面。
- 主题：实验设计、广告投放、数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／灰度发布(自定义)

- child_asset_id：`ka-src-0005-child-e1350d5d624034e0`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／灰度发布(自定义)`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／灰度发布(自定义)”展开，正文主要说明：接入“Web 一体化”站点的跨端应用和 SSR 应用支持自定义灰度。 除默认的灰度分桶规则外，可以自行选择 Header、Cookie、Query 中的参数用于分桶计算，也可以指定部分参数值设置强制命中灰度。 章节线索包括：灰度发布(自定义)、自定义灰度参数、强制命中、指定灰度。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用

- child_asset_id：`ka-src-0005-child-3f44164d32b9a5d0`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用”展开，正文主要说明：跨端应用是一种提供 Web、PHA、Kraken、Weex2.0 等跨端产物部署及投放的应用类型。 跨端应用类型中主要包含下面的基本概念。 章节线索包括：基本概念。
- 主题：广告投放、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／创建应用

- child_asset_id：`ka-src-0005-child-ee22d89e942ec971`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／创建应用`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／创建应用”展开，正文主要说明：应用是以 Code 仓库为基础的研发单位，一个仓库一个应用。 Step 1 选择解决方案。 章节线索包括：操作流程、Step 1 选择解决方案、Step 2 完善应用信息、Step 2-1 完善基本信息、Step 2-2 完善扩展信息。
- 主题：广告投放、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／发布应用

- child_asset_id：`ka-src-0005-child-7cc8f43301a0a695`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／发布应用`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／发布应用”展开，正文主要说明：应用的发布基于迭代，在发布前需要创建迭代。 迭代中支持多分支集成，可以在迭代中添加多个变更，一起进行发布。 章节线索包括：新建迭代、发布流程、结果查看、产物约定。
- 主题：广告投放、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／发布文件到自定义域名

- child_asset_id：`ka-src-0005-child-f98ba5768b861fe8`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／发布文件到自定义域名`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／发布文件到自定义域名”展开，正文主要说明：跨端应用支持发布文件（比如：.txt）到自定义域名。 通用域名（如 market.m.taobao.com、web.m.taobao.com、pages.tmall.com）不支持业务配置验证文件，需要使用业务自己的域名配置。 章节线索包括：Step 1 文件准备、Step 1-1 新建应用、Step 1-2 发布文件、Step 2 路由配置、常见问题。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／回滚应用

- child_asset_id：`ka-src-0005-child-f7cf2dfc52d1d33c`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／回滚应用`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／回滚应用”展开，正文主要说明：应用在灰度过程中出现问题，可以直接取消灰度。 如果应用在正式发布后出现问题，则可以通过回滚操作将页面内容回滚到需要的版本。 章节线索包括：操作方式、Step 1、Step 2、Step 3、注意事项。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／埋点&监控

- child_asset_id：`ka-src-0005-child-e8ca9387adc62c13`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／埋点&监控`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／埋点&监控”展开，正文主要说明：跨端应用默认不会注入任何埋点脚本。 请参考相关框架的文档来使用埋点，比如 rax 框架的埋点方案可以直接使用。 章节线索包括：埋点方案、监控能力、前端监控、CDN 监控。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／多套预发

- child_asset_id：`ka-src-0005-child-7876ca5646868a56`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／多套预发`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／多套预发”展开，正文主要说明：针对用户反馈的多迭代并行开发导致预发环境不稳定的问题，我们决定对原有的跨端应用进行升级。 现在，我们将为用户提供多套预发环境的能力，每个迭代都可以选择绑定到不同的预发环境。 章节线索包括：多套预发、产品链路、多套环境准备、多套环境绑定、迭代发布。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／应用设置

- child_asset_id：`ka-src-0005-child-6a448734483489d7`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／应用设置`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／应用设置”展开，正文主要说明：如果应用有更换站点的需求，可以通过“应用-设置-发布设置-域名设置-更换站点“来进行操作。 更换站点相当于重新接入的流程，同样遵循应用接入站点的审批规则（站点负责人审批，站点成员免审批），提交接入申请后请及时跟进审批单，避免影响发布。 章节线索包括：更换站点、更新域名。
- 主题：广告投放、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／接入 SPA 应用

- child_asset_id：`ka-src-0005-child-980247591afedf90`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／接入 SPA 应用`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／接入 SPA 应用”展开，正文主要说明：跨端应用默认是多页应用（Multiple Page Application），我们也支持单页应用（Single Page Application）能力。 基于 HashRouter 的单页。 章节线索包括：基于 HashRouter 的单页、基于 BrowserRouter 的单页、实现原理、域名接入、Step 1 创建公网 SPA 站点。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／灰度放量

- child_asset_id：`ka-src-0005-child-5640875777df7e01`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／灰度放量`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／跨端应用／灰度放量”展开，正文主要说明：跨端应用默认都会开启灰度放量功能。 该功能开启后，执行线上发布时，默认只有特定的用户可以访问到新页面。 章节线索包括：如何进入灰度、放量过程、灰度比例说明、灰度命中策略、内网灰度。
- 主题：实验设计、广告投放、数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／Web 研发类型／页面回滚

- child_asset_id：`ka-src-0005-child-684b4ec9c2d476c2`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／Web 研发类型／页面回滚`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／Web 研发类型／页面回滚”展开，正文主要说明：页面回滚支持 webapp/weex 发布流程，以及淘应用发布流程中的 weex 发布部分。 页面回滚以单页面为维度，发布线上后若出现故障，可将页面回滚到之前的版本。 章节线索包括：页面回滚、注意事项、如何操作。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／函数研发类型／Next.js 使用文档

- child_asset_id：`ka-src-0005-child-e3ed590a18ff5aa1`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／函数研发类型／Next.js 使用文档`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／函数研发类型／Next.js 使用文档”展开，正文主要说明：通过脚手架建立新应用（推荐） 在新建应用页面中，选择“函数研发-全栈应用-Next.js”。 章节线索包括：开始使用、通过脚手架建立新应用（推荐）、已有项目接入、monorepo 特殊配置、扩展能力。
- 主题：数据分析、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／小程序研发类型／PHA 轻应用

- child_asset_id：`ka-src-0005-child-35e3d5aa51099448`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／小程序研发类型／PHA 轻应用`
- 讲什么：仅含很短的占位或提示文字：PHA 轻应用源码研发
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／小程序研发类型／小程序 + WebApp

- child_asset_id：`ka-src-0005-child-dd15846a5310f10b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／小程序研发类型／小程序 + WebApp`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／小程序研发类型／小程序 + WebApp”展开，正文主要说明：小程序 + WebApp 小程序发布 支持发布各种研发类型的小程序应用到 淘宝、支付宝、微信、钉钉等各端的同时发布构建出来的 webapp。 章节线索包括：小程序 + WebApp、能力介绍、基础能力、提供的发布环境、发布产物说明。
- 主题：研发与部署、安全与权限、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／研发类型／小程序研发类型／小程序 + 跨端

- child_asset_id：`ka-src-0005-child-171145a189deee42`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／研发类型／小程序研发类型／小程序 + 跨端`
- 讲什么：围绕“O2 Space 用户帮助文档／研发类型／小程序研发类型／小程序 + 跨端”展开，正文主要说明：为一个 Code 仓库同时发布多端小程序和跨端应用。 将小程序产物包发布到对应开放平台。 章节线索包括：小程序 + 跨端、能力介绍、产物说明、接入说明、新建应用。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／【案例】域名接入斑马

- child_asset_id：`ka-src-0005-child-c7f77ac6fa5b35b0`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／【案例】域名接入斑马`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／【案例】域名接入斑马”展开，正文主要说明：以下步骤需要在 跨端研发平台完成。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／【案例】验证类文件发布

- child_asset_id：`ka-src-0005-child-1cc5baf43a894e3f`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／【案例】验证类文件发布`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／【案例】验证类文件发布”展开，正文主要说明：根据验证类文件需要生效的域名选择对应需要接入的站点，点击“确定” 目前新建应用需要关联预发域名，但 16N 后部分业务可能无法正常完成预发域名接入。 章节线索包括：通过跨端项目发布、前置准备、使用模板初始化（推荐）、手动配置、文件发布。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／什么是 O2 站点

- child_asset_id：`ka-src-0005-child-10bdcb559b2d2e2e`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／什么是 O2 站点`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／什么是 O2 站点”展开，正文主要说明：前端页面具有预发和线上两个环境。 当业务希望使用自定义域名时，需要为两个环境分别申请并配置域名。
- 主题：广告投放、数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／内网劫持（SPE）接入

- child_asset_id：`ka-src-0005-child-50f04a26291fd45b`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／内网劫持（SPE）接入`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／内网劫持（SPE）接入”展开，正文主要说明：内网劫持用于将全量办公网用户纳入灰度范围，以便在外部放量前对办公网用户进行灰度发布验证。 内网劫持接入流程包含众多人工节点，整体接入较为复杂，如无特殊需求不建议申请接入。 章节线索包括：需求沟通及协议签署（重要）、提交接入流程、办公网 DNS 劫持。
- 主题：实验设计、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／创建站点

- child_asset_id：`ka-src-0005-child-2d5badb393b6f0d3`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／创建站点`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／创建站点”展开，正文主要说明：以下步骤需要在 O2 Space完成 要创建新站点，先进入对应的研发类型。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／域名接入

- child_asset_id：`ka-src-0005-child-cc94feaab3af0d64`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／域名接入`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／域名接入”展开，正文主要说明：以下步骤需要在 O2 Space完成 ==== 提示 ====。 章节线索包括：接入 CDN 域名、接入内网劫持/预发域名/多套域名、接入后配置、常见问题、提示“应用不一致”、“无法修改应用”。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／域名证书维护

- child_asset_id：`ka-src-0005-child-3f7f038498dd42d3`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／域名证书维护`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／域名证书维护”展开，正文主要说明：以下步骤需要在跨端研发平台完成 您可以在站点总览中对域名的证书进行维护。 章节线索包括：证书更新、证书申请、证书上传、审批及更新操作、FAQ。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／添加路由关联

- child_asset_id：`ka-src-0005-child-8919b10a51a9c8ad`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／添加路由关联`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／添加路由关联”展开，正文主要说明：根据使用场景选择需要添加的路由类型 提交表单后，若路由没有冲突，则可以看到添加的路由信息。 章节线索包括：操作路径、操作流程、路由类型、添加应用路由、添加页面路由。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／监控、分析与告警

- child_asset_id：`ka-src-0005-child-e80e28d324056109`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／监控、分析与告警`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／监控、分析与告警”展开，正文主要说明：在站点中，集成了多种数据源和分析工具，帮助您了解站点下域名的实时状态。 在监控页面中，您可以查询特定域名的 QPS、状态码、命中率、带宽 四项常用监控项的实时图表。 章节线索包括：监控、分析、分析页面介绍、维度与指标、数据下钻。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／站点成员管理

- child_asset_id：`ka-src-0005-child-e6864c1684aff267`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／站点成员管理`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／站点成员管理”展开，正文主要说明：在站点详情页内点击二级导航的【成员管理】即可进入成员管理界面 点击右上方【添加成员】会弹出对话框。 章节线索包括：添加站点成员、删除站点成员。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／站点管理／路由配置发布

- child_asset_id：`ka-src-0005-child-72c93f083417a067`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／站点管理／路由配置发布`
- 讲什么：围绕“O2 Space 用户帮助文档／站点管理／路由配置发布”展开，正文主要说明：在资源管理页面点击【路由发布】标签，即可进入配置发布页面。 此页面中会显示当前站点中所有已关联的域名及其路由配置状态。 章节线索包括：发布、灰度控制、校验。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代发布／发布操作

- child_asset_id：`ka-src-0005-child-1a68ef6d5ccfd848`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代发布／发布操作`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代发布／发布操作”展开，正文主要说明：本文将介绍如何在 O2 Space 平台中进行迭代发布操作。 发布是指将代码构建后的产物部署到特定环境的操作。 章节线索包括：发布的定义、发布操作流程、非线上环境发布、线上环境发布、发布流水线。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代发布／测试阶段

- child_asset_id：`ka-src-0005-child-7cd19285f524722d`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代发布／测试阶段`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代发布／测试阶段”展开，正文主要说明：本文介绍如何在 O2 Space 中使用迭代的测试阶段功能。 测试阶段是指迭代研发链路中的 “提测” 环节。 章节线索包括：测试阶段概述、测试阶段使用、开启应用的测试能力、开发同学如何进行提测、2.1 发起提测。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代发布／线上卡口

- child_asset_id：`ka-src-0005-child-51293455b045aa6a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代发布／线上卡口`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代发布／线上卡口”展开，正文主要说明：本文介绍如何在 O2 Space 中使用 “迭代流程· 线上阶段” 中的发布卡口功能。 线上发布卡口是一套 O2 Space 平台用于控制和保证发布流程质量的机制，它包含多个检测点，旨在确保部署资源的稳定性和可靠性。 章节线索包括：什么是线上发布卡口、有哪些线上发布卡口、部署状态检测通过条件、工作项检测通过条件、代码评审检测通过条件。
- 主题：数据分析、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代管理／更多功能

- child_asset_id：`ka-src-0005-child-66a4692f2bd9137a`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代管理／更多功能`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代管理／更多功能”展开，正文主要说明：在迭代基础使用之外，O2 Space 平台还支持对迭代的更多功能，主要有两个：「测试迭代」和「迭代锁定」。 考虑到在业务场景中有时存在只进行日常环境测试而无需发布线上的诉求，O2 Space 平台支持测试迭代功能，在产品逻辑上对这一场景进行保障。 章节线索包括：测试迭代、迭代锁定。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代管理／迭代创建

- child_asset_id：`ka-src-0005-child-656a0cec481ea746`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代管理／迭代创建`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代管理／迭代创建”展开，正文主要说明：作为在平台上进行发布的单元，用户要想完成一次发布，需要先创建迭代。 1、在平台主页（工作台）、应用概览页等页面，点击「新建迭代」按钮。 章节线索包括：背景信息、具体操作。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代管理／迭代概述

- child_asset_id：`ka-src-0005-child-46a85b6a88c4ee03`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代管理／迭代概述`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代管理／迭代概述”展开，正文主要说明：迭代是在 O2 Space 上进行发布活动的单元。 O2 Space 研发平台针对一定周期内的需求及所对应的在不同发布环境下的发布、集成区的设置与流程，以迭代概念进行组织，每次迭代代表一个应用发布版本。 章节线索包括：迭代概述、迭代的作用、应用场景。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代管理／迭代设置

- child_asset_id：`ka-src-0005-child-d006b8569a731e65`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代管理／迭代设置`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代管理／迭代设置”展开，正文主要说明：迭代作为发布的基础单元，其自身有一系列配置，支持用户根据自身业务需求进行配置。 1、在任意应用的迭代页面，可以点击右上角的迭代设置按钮（下图位置 6 所示区域），进入迭代设置。 章节线索包括：迭代设置概述、迭代设置。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 Space 用户帮助文档／迭代管理／迭代集成区

- child_asset_id：`ka-src-0005-child-d6bdeea31af150b6`
- 相对路径：`raw/o2/终端交付（O2）/O2 Space 用户帮助文档／迭代管理／迭代集成区`
- 讲什么：围绕“O2 Space 用户帮助文档／迭代管理／迭代集成区”展开，正文主要说明：在 O2 Space 平台上，研发活动主要围绕迭代集成区展开，下文将对其内容和使用方式进行详细介绍。 打开任意 O2 Space 应用，并选择任意迭代进入，页面主体部分展示的就是迭代集成区，如下图位置 2 所示。 章节线索包括：使用方式、功能概述、变更管理、变更添加、变更退出。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／事件中心／事件中心使用指南

- child_asset_id：`ka-src-0005-child-d52891647d894206`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／事件中心／事件中心使用指南`
- 讲什么：围绕“O2 开放文档／事件中心／事件中心使用指南”展开，正文主要说明：非常感谢阿里云 Event Bridge、PVL 团队，集团统一接入团队，作为底层依赖，支撑 O2Bridge 的技术运行。 非常感谢 O2Bridge 初期技术论证阶段，和我们一起共创的业务团队，例如：阿里云云原生应用平台前端团队、阿里拍卖体验技术部、淘宝大营销体系前台技术前端团队等。 章节线索包括：事件中心使用指南、致谢、先介绍下 JSBridge、O2Bridge 的来源、最初的场景。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／发布／创建迭代发布任务

- child_asset_id：`ka-src-0005-child-0ade68e7875f14ff`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／发布／创建迭代发布任务`
- 讲什么：围绕“O2 开放文档／开放 API／发布／创建迭代发布任务”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/task Path parameters。 章节线索包括：创建迭代发布任务、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／发布／取消迭代发布任务

- child_asset_id：`ka-src-0005-child-eab43729a3f2ed20`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／发布／取消迭代发布任务`
- 讲什么：围绕“O2 开放文档／开放 API／发布／取消迭代发布任务”展开，正文主要说明：取消正在进行中的发布任务 /v1.0/work/api/iteration/{iterationId}/task/{taskId}/cancel。 章节线索包括：接口名称、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／发布／获取发布任务详情

- child_asset_id：`ka-src-0005-child-b87a1f8beb60a5ec`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／发布／获取发布任务详情`
- 讲什么：围绕“O2 开放文档／开放 API／发布／获取发布任务详情”展开，正文主要说明：/v1.0/work/tasks/{taskId}/detail Path parameters。 章节线索包括：获取发布任务详情、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／发布／获取发布列表

- child_asset_id：`ka-src-0005-child-9ea08e5a4a279255`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／发布／获取发布列表`
- 讲什么：围绕“O2 开放文档／开放 API／发布／获取发布列表”展开，正文主要说明：/v1.0/work/tasks Query parameters。 章节线索包括：获取发布列表、Query parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／发布／获取应用发布列表

- child_asset_id：`ka-src-0005-child-93f01e5122c51406`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／发布／获取应用发布列表`
- 讲什么：围绕“O2 开放文档／开放 API／发布／获取应用发布列表”展开，正文主要说明：/v1.0/work/apps/{appIdorName}/tasks Path parameters。 章节线索包括：获取应用发布列表、Path parameters、Query parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／变更／创建变更

- child_asset_id：`ka-src-0005-child-fe97b4439cb5edf8`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／变更／创建变更`
- 讲什么：围绕“O2 开放文档／开放 API／变更／创建变更”展开，正文主要说明：/v1.0/work/apps/{appIdorName}/devbranches/add Path parameters。 章节线索包括：创建变更、Path parameters、Request body、Returns、Example。
- 主题：数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／变更／发起代码评审

- child_asset_id：`ka-src-0005-child-aa6bbbbe3cb3f7d1`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／变更／发起代码评审`
- 讲什么：围绕“O2 开放文档／开放 API／变更／发起代码评审”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/devbranch/{devbranchId}/cr Path parameters。 章节线索包括：发起代码评审、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／变更／废弃代码评审

- child_asset_id：`ka-src-0005-child-da3a5fa0f69e0b80`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／变更／废弃代码评审`
- 讲什么：围绕“O2 开放文档／开放 API／变更／废弃代码评审”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/devbranch/{devbranchId}/cr/remove Path parameters。 章节线索包括：废弃代码评审、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／变更／废弃变更

- child_asset_id：`ka-src-0005-child-432e225ed82c985a`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／变更／废弃变更`
- 讲什么：围绕“O2 开放文档／开放 API／变更／废弃变更”展开，正文主要说明：/v1.0/work/apps/{appId}/devbranches/{devbranchId}/delete Path parameters。 章节线索包括：Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：short；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／变更／编辑代码评审

- child_asset_id：`ka-src-0005-child-220f14c08a15c17f`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／变更／编辑代码评审`
- 讲什么：围绕“O2 开放文档／开放 API／变更／编辑代码评审”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/devbranch/{devbranchId}/cr/update Path parameters。 章节线索包括：编辑代码评审、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／变更／编辑变更

- child_asset_id：`ka-src-0005-child-ded561b603140842`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／变更／编辑变更`
- 讲什么：围绕“O2 开放文档／开放 API／变更／编辑变更”展开，正文主要说明：/v1.0/work/apps/{appIdorName}/devbranchs/{devbranchId}/edit Path parameters。 章节线索包括：编辑变更、Path parameters、Request body、Returns、Example。
- 主题：数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／对象描述

- child_asset_id：`ka-src-0005-child-f933e915ce3a58df`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／对象描述`
- 讲什么：围绕“O2 开放文档／开放 API／对象描述”展开，正文主要说明：用户 gitlab id O2 Space 应用基本信息。 章节线索包括：User、App、PubType、Iteration、AppTrunk。
- 主题：广告投放、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／常见问题（FAQ）

- child_asset_id：`ka-src-0005-child-baaafc29bf6c1bd5`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／常见问题（FAQ）`
- 讲什么：围绕“O2 开放文档／开放 API／常见问题（FAQ）”展开，正文主要说明：遇到问题，第一步先获取 RequestId 或 traceId 去 API 链路诊断 自行查看出错日志 如何获取 RequestId 或 traceId：从接口的 Response Header 中找到如下两个参数。 章节线索包括：Cannot read properties of undefined (reading 'empid')。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／创建应用的主干分支

- child_asset_id：`ka-src-0005-child-28fd6b43160f820d`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／创建应用的主干分支`
- 讲什么：围绕“O2 开放文档／开放 API／应用／创建应用的主干分支”展开，正文主要说明：若应用需要用到多主干开发，可以通过该接口创建应用的主干分支 /v1.0/work/apps/{appIdorName}/trunk。 章节线索包括：创建应用的主干分支、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／删除应用

- child_asset_id：`ka-src-0005-child-e7a090ad7fdd4283`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／删除应用`
- 讲什么：围绕“O2 开放文档／开放 API／应用／删除应用”展开，正文主要说明：/v1.0/work/apps/{appIdorName}/delete Path parameters。 章节线索包括：删除应用、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／删除应用主干

- child_asset_id：`ka-src-0005-child-d838399b6be68613`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／删除应用主干`
- 讲什么：围绕“O2 开放文档／开放 API／应用／删除应用主干”展开，正文主要说明：删除应用主干，支持是否删除 git 分支 /v1.0/work/apps/{appIdorName}/trunk/{trunkId}/remove。 章节线索包括：删除应用主干、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／删除应用成员

- child_asset_id：`ka-src-0005-child-5c74748413e9fa01`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／删除应用成员`
- 讲什么：围绕“O2 开放文档／开放 API／应用／删除应用成员”展开，正文主要说明：移除 O2 应用成员列表中某成员 /v1.0/work/apps/{appId}/members/delete。 章节线索包括：删除应用成员、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／新建应用

- child_asset_id：`ka-src-0005-child-236330edc9785a3e`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／新建应用`
- 讲什么：围绕“O2 开放文档／开放 API／应用／新建应用”展开，正文主要说明：/v1.0/work/apps/create Request body。 章节线索包括：新建应用、Request body、Returns、Example。
- 主题：广告投放、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／更新应用设置

- child_asset_id：`ka-src-0005-child-8a1024d81b2ef4c0`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／更新应用设置`
- 讲什么：围绕“O2 开放文档／开放 API／应用／更新应用设置”展开，正文主要说明：/v1.0/work/apps/{appIdorName}/conf/update Path parameters。 章节线索包括：更新应用设置、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／检查仓库是否可以接入

- child_asset_id：`ka-src-0005-child-c1eecba33db6f7f8`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／检查仓库是否可以接入`
- 讲什么：围绕“O2 开放文档／开放 API／应用／检查仓库是否可以接入”展开，正文主要说明：判断仓库是否符合 O2 要求，以便接入研发平台 /v1.0/work/repos/checkjoin。 章节线索包括：检查仓库是否可以接入、Query parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／添加应用成员

- child_asset_id：`ka-src-0005-child-a8889956d13f43e4`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／添加应用成员`
- 讲什么：围绕“O2 开放文档／开放 API／应用／添加应用成员”展开，正文主要说明：/v1.0/work/apps/{appId}/members Path parameters。 章节线索包括：添加应用成员、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／获取应用基础信息

- child_asset_id：`ka-src-0005-child-c6927a9d722bc66b`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／获取应用基础信息`
- 讲什么：围绕“O2 开放文档／开放 API／应用／获取应用基础信息”展开，正文主要说明：通过仓库名获取 O2 应用基本信息 /v1.0/work/apps/infos/basic。 章节线索包括：获取应用信息、Query parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／获取应用成员

- child_asset_id：`ka-src-0005-child-9d78f4eca8398dbe`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／获取应用成员`
- 讲什么：围绕“O2 开放文档／开放 API／应用／获取应用成员”展开，正文主要说明：通过应用 ID 获取应用成员列表 /v1.0/work/apps/{appId}/members。 章节线索包括：获取应用成员列表、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／获取应用的主干分支列表

- child_asset_id：`ka-src-0005-child-de955465d7afac3b`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／获取应用的主干分支列表`
- 讲什么：围绕“O2 开放文档／开放 API／应用／获取应用的主干分支列表”展开，正文主要说明：通过应用 ID 或应用名称获取应用的主干分支列表 /v1.0/work/apps/{appIdorName}/trunk。 章节线索包括：获取应用的主干分支列表、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／获取应用详细信息

- child_asset_id：`ka-src-0005-child-7fd4d5577686cba3`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／获取应用详细信息`
- 讲什么：围绕“O2 开放文档／开放 API／应用／获取应用详细信息”展开，正文主要说明：通过应用 ID 获取应用详细信息 /v1.0/work/apps/{appIdorName}/detail。 章节线索包括：获取应用详细信息、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／应用／获取我创建的应用

- child_asset_id：`ka-src-0005-child-febe1ce8ad03c29f`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／应用／获取我创建的应用`
- 讲什么：围绕“O2 开放文档／开放 API／应用／获取我创建的应用”展开，正文主要说明：获取我创建的应用列表，支持分页 /v1.0/work/apps/my。 章节线索包括：获取我创建的应用、Query parameters、Returns、Example。
- 主题：数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／接入指南（接入必看）

- child_asset_id：`ka-src-0005-child-d7eb92a0939fc9c8`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／接入指南（接入必看）`
- 讲什么：围绕“O2 开放文档／开放 API／接入指南（接入必看）”展开，正文主要说明：如果您在使用过程中遇到问题，可以通过以下三种方式反馈 O2 Space 平台提供的开放接口遵循 RESTful 风格，为了提升 API 调用安全性，O2 所有开放接口都经过网关，在调用接口时，需要进行身份认证，并且部分接口还需要登录态信息。 章节线索包括：流程概述、注意事项。
- 主题：研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／创建迭代

- child_asset_id：`ka-src-0005-child-3a91b4c97f5cb7f6`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／创建迭代`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／创建迭代”展开，正文主要说明：/v1.0/work/apps/{appIdorName}/iteration Path parameters。 章节线索包括：创建迭代、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／废弃迭代

- child_asset_id：`ka-src-0005-child-753a46d0a4704e64`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／废弃迭代`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／废弃迭代”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/abandon Path parameters。 章节线索包括：废弃迭代、Path parameters、Request body、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／获取应用迭代列表

- child_asset_id：`ka-src-0005-child-9f1a75c652c7682b`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／获取应用迭代列表`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／获取应用迭代列表”展开，正文主要说明：通过应用 ID 或应用名获取该应用下的迭代列表 /v1.0/work/apps/{appIdorName}/iterations。 章节线索包括：获取应用迭代列表、Path parameters、Query parameters、Returns、Example。
- 主题：广告投放、数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／获取我的进行中迭代

- child_asset_id：`ka-src-0005-child-50923f24f7a96559`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／获取我的进行中迭代`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／获取我的进行中迭代”展开，正文主要说明：/v1.0/work/my/undergoingiteration Query parameters。 章节线索包括：获取我的进行中迭代、Query parameters、Returns、Example。
- 主题：广告投放、数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／获取迭代变更列表

- child_asset_id：`ka-src-0005-child-27d37ff47af7ddd3`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／获取迭代变更列表`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／获取迭代变更列表”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/devbranches Path parameters。 章节线索包括：获取迭代变更列表、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／迭代绑定变更

- child_asset_id：`ka-src-0005-child-bd882a64b25ececa`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／迭代绑定变更`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／迭代绑定变更”展开，正文主要说明：/v1.0/work/iterations/{iterationId}/devbranch/bind Path parameters。 章节线索包括：迭代绑定变更、Path parameters、Request body、Returns、Example。
- 主题：数据分析、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／通过ID获取迭代信息

- child_asset_id：`ka-src-0005-child-ab2aecd950f69198`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／通过ID获取迭代信息`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／通过ID获取迭代信息”展开，正文主要说明：通过迭代 ID 获取迭代基本信息 /v1.0/work/iterations/{iterationId}/detail。 章节线索包括：获取迭代基本信息、Path parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放 API／迭代／通过分支获取迭代信息

- child_asset_id：`ka-src-0005-child-08e6f701235365f5`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放 API／迭代／通过分支获取迭代信息`
- 讲什么：围绕“O2 开放文档／开放 API／迭代／通过分支获取迭代信息”展开，正文主要说明：通过仓库名和分支名获取迭代基本信息 /v1.0/work/apps/iterations/infos。 章节线索包括：获取迭代基本信息、Query parameters、Returns、Example。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放简介／开放体系介绍

- child_asset_id：`ka-src-0005-child-e2729d31af47f1de`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放简介／开放体系介绍`
- 讲什么：围绕“O2 开放文档／开放简介／开放体系介绍”展开，正文主要说明：平台提供的开放可以分为两类 通过平台提供的 SPI 扩展点，定制平台功能。 章节线索包括：有哪些开放能力、SPI 定制、API 集成、我应该使用哪些开放能力。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／开放简介／术语库

- child_asset_id：`ka-src-0005-child-31769c2db3132cb0`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／开放简介／术语库`
- 讲什么：围绕“O2 开放文档／开放简介／术语库”展开，正文主要说明：定制场景下，业务方使用这个控制台完成业务的接入， 另外事件中心的使用目前也在这个平台完成。 章节线索包括：扩展开放控制台、网关、事件中心、扩展点、扩展包。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／全局导航

- child_asset_id：`ka-src-0005-child-b5baae2568a9a526`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／全局导航`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／全局导航”展开，正文主要说明：navigation-first-level-add 整个站点维度的一级导航新增。 章节线索包括：navigation-first-level-add、Props、Config Demo。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／发布

- child_asset_id：`ka-src-0005-child-ba87666e338339dd`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／发布`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／发布”展开，正文主要说明：publish-list-item-extend 发布记录每个item的expand扩展。 章节线索包括：publish-list-item-extend、Props、task-list-column-extend、Config、props 声明。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／发布节点展示

- child_asset_id：`ka-src-0005-child-145345becc0bd866`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／发布节点展示`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／发布节点展示”展开，正文主要说明：flow-publish-result-node 通过 config 指定定制的发布节点，切换对应节点时展示对应的 UI Spi impl module，module 内通过 tpl 判断展示哪个定制节点，参数通过 widgetProps 传入。 章节线索包括：flow-publish-result-node、config、Props、props 声明。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／变更

- child_asset_id：`ka-src-0005-child-a707e0f6929a0638`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／变更`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／变更”展开，正文主要说明：change-new-branch-name-rule 业务定制自己的变更分支名称格式规范。 章节线索包括：change-new-branch-name-rule、Config、change-workitem-rule、change-exist-branch-name-rule、change-detail-extend-page。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／基础

- child_asset_id：`ka-src-0005-child-92b2e391505cc0f0`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／基础`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／基础”展开，正文主要说明：扩展点通过 Config、Props、Event、Params 四种方式与平台交互，下面分别介绍他们的基础用法 扩展实现配置，可以在 上编辑。 章节线索包括：Config、Props、Event、Params。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／工作台

- child_asset_id：`ka-src-0005-child-e5d97d65b8250e4b`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／工作台`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／工作台”展开，正文主要说明：workbench-left-bottom-overview 工作台左边下面区域的自定义扩展。 章节线索包括：workbench-left-bottom-overview、props、props 声明、workbench-right-top-overview、workbench-left-app-list。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／应用

- child_asset_id：`ka-src-0005-child-07f1c50397c67feb`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／应用`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／应用”展开，正文主要说明：app-basic-overview-extend def应用基础概览底部的坑位。 章节线索包括：app-basic-overview-extend、Props、props 声明、app-basic-overview-left-middle、app-basic-overview-right-top。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／搜索

- child_asset_id：`ka-src-0005-child-0392b73652b84e6e`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／搜索`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／搜索”展开，正文主要说明：search-more-list Service Api Params。 章节线索包括：search-more-list、config、Service Api Params。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／独立站点

- child_asset_id：`ka-src-0005-child-32a0f6ae07cc7070`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／独立站点`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／独立站点”展开，正文主要说明：独立域名（联系管理员配置）下固定业务，支持包括一些高阶扩展（如定制 header ，站点主题等） independent-header-custom。 章节线索包括：independent-header-custom、Component、Config、independent-category-bar、independent-system-notice。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／研发小蜜

- child_asset_id：`ka-src-0005-child-fde03aebce2f69b8`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／研发小蜜`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／研发小蜜”展开，正文主要说明：links-replace。 章节线索包括：links-replace、Config。
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／O2 Space 扩展点文档／迭代

- child_asset_id：`ka-src-0005-child-96208735b51c9cc5`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／O2 Space 扩展点文档／迭代`
- 讲什么：围绕“O2 开放文档／扩展／O2 Space 扩展点文档／迭代”展开，正文主要说明：iteration-common-config iteration-setting-basic。 章节线索包括：iteration-common-config、Config、iteration-setting-basic、Props、props 声明。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／使用扩展

- child_asset_id：`ka-src-0005-child-e791cc1cc1d5fe3a`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／使用扩展`
- 讲什么：围绕“O2 开放文档／扩展／使用扩展”展开，正文主要说明：如果需要使用的扩展只发布了预发，则需要到 o2-space 预发环境 进行下面的操作 进入 o2-space 平台，找到需要安装扩展的应用。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／发布后置流程扩展

- child_asset_id：`ka-src-0005-child-6330a23de85ffc65`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／发布后置流程扩展`
- 讲什么：围绕“O2 开放文档／扩展／发布后置流程扩展”展开，正文主要说明：本文前置条件：对 O2 扩展机制有一定了解，若不了解可以先看 《新建扩展》、《扩展的开发》 许多用户都个疑问：“我想在发布后运行一些自定义逻辑，并且希望运行的成功/失败能影响发布的结果、运行的返回在发布页面上可见，想要快速实现这一定制逻辑，我该怎么做呢？ 章节线索包括：编码、调试/发布、老的扩展项目改造。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／已过时的文档／ 已有的扩展如何修改目录结构

- child_asset_id：`ka-src-0005-child-2787a84ae8bfbc1f`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／已过时的文档／ 已有的扩展如何修改目录结构`
- 讲什么：围绕“O2 开放文档／扩展／已过时的文档／ 已有的扩展如何修改目录结构”展开，正文主要说明：已有项目如何升级到 Pai App 1、联系研发小蜜，将已有的 O2 扩展应用升级到 Pai App，需要提供应用 id 或 repo。 章节线索包括：已有项目如何升级到 Pai App。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／已过时的文档／按应用类型接入扩展

- child_asset_id：`ka-src-0005-child-7ec5184d58d3120b`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／已过时的文档／按应用类型接入扩展`
- 讲什么：围绕“O2 开放文档／扩展／已过时的文档／按应用类型接入扩展”展开，正文主要说明：首次接入的同学可以看下以下两篇文章 《O2 Space 扩展开放建设之路》。 章节线索包括：基础概念、扩展、扩展怎么关联到应用类型、业务接入、新建业务。
- 主题：数据分析、研发与部署、安全与权限、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／已过时的文档／老的目录结构

- child_asset_id：`ka-src-0005-child-1599a49474d6fd5f`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／已过时的文档／老的目录结构`
- 讲什么：围绕“O2 开放文档／扩展／已过时的文档／老的目录结构”展开，正文主要说明：虽然 Pai App 开发时，这些目录结构和模版代码、类型都会通过云研发自动生成，但还是建议大家了解一下 1、遇到问题时可以自己主动定位。 章节线索包括：src/pai/[spiName]、src/pai/meta.json。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／扩展的开发

- child_asset_id：`ka-src-0005-child-b04b707bc69617d4`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／扩展的开发`
- 讲什么：围绕“O2 开放文档／扩展／扩展的开发”展开，正文主要说明：开发的前提是已经新建了一个扩展，新建扩展的流程可以看 《新建扩展》 迭代创建完成后，进入迭代详情页，可以看到共有四个阶段（开发、预发部署、线上部署、灰度放量） 章节线索包括：目录结构、创建迭代、本地研发、云研发（可选）、预发发布。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### O2 开放文档／扩展／新建扩展

- child_asset_id：`ka-src-0005-child-825be8101eebf998`
- 相对路径：`raw/o2/终端交付（O2）/O2 开放文档／扩展／新建扩展`
- 讲什么：围绕“O2 开放文档／扩展／新建扩展”展开，正文主要说明：扩展自身也是一个 O2 应用，扩展的新建和开发流程都和 O2 应用一致（熟悉 O2 平台的同学应该一看就能懂了，别看下面的截图比较多，其实就是正常迭代发布的过程） 我们进入 o2 space 平台新建应用页，选择【O2 开放】->【O2 扩展】，点击下一步。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／CR显示已通过，发布卡口显示未提交，无法进行发布该怎么办？

- child_asset_id：`ka-src-0005-child-4049fb8c9ac44ab9`
- 相对路径：`raw/o2/终端交付（O2）/已验收／CR显示已通过，发布卡口显示未提交，无法进行发布该怎么办？`
- 讲什么：围绕“已验收／CR显示已通过，发布卡口显示未提交，无法进行发布该怎么办？”展开，正文主要说明：原因：变更原因中存在图标/emoj表情时，提交CR的接口报错 现状：目前已修正，即使变更原因中存在图标/emoj表情，也不会再出现上述问题。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／ER应用灰度后为什么无法进行全量发布？

- child_asset_id：`ka-src-0005-child-670b65b03d5664c2`
- 相对路径：`raw/o2/终端交付（O2）/已验收／ER应用灰度后为什么无法进行全量发布？`
- 讲什么：围绕“已验收／ER应用灰度后为什么无法进行全量发布？”展开，正文主要说明：可能原因一：未配置灰度环境，ER 线上发布必须经过灰度发布，灰度放量前需要对灰度环境进行设置，请前往“程序->程序配置->灰度环境配置”添加灰度环境 可能原因二：配置的灰度区域未完成全部灰度，灰度区域在灰度放量阶段必须完整全部区域放量，方可进行线上发布。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／ER研发发布完成后在哪里查看IPv4列表

- child_asset_id：`ka-src-0005-child-95c68a0ee807cbe0`
- 相对路径：`raw/o2/终端交付（O2）/已验收／ER研发发布完成后在哪里查看IPv4列表`
- 讲什么：围绕“已验收／ER研发发布完成后在哪里查看IPv4列表”展开，正文主要说明：路径：点击流水线中的 预发验证 节点，就可以查看 IPv4 列表。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／FAAS 如何配置固定 ip

- child_asset_id：`ka-src-0005-child-61cf60b2f09c6d4b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／FAAS 如何配置固定 ip`
- 讲什么：围绕“已验收／FAAS 如何配置固定 ip”展开，正文主要说明：faas函数是随机运行多台机器上的，所以ip地址也是随机的，不支持配置固定ip。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／InternalServerError，好几个应用日常环境没有任何发布，为什么突然就打不开了？

- child_asset_id：`ka-src-0005-child-38b861de5534deec`
- 相对路径：`raw/o2/终端交付（O2）/已验收／InternalServerError，好几个应用日常环境没有任何发布，为什么突然就打不开了？`
- 讲什么：围绕“已验收／InternalServerError，好几个应用日常环境没有任何发布，为什么突然就打不开了？”展开，正文主要说明：解决方案：该是由于网络原因造成的， 请搜索 弹内FC用户群，咨询值班同学。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2 PaiApp 这样的场景下，需要怎么调开放服务？

- child_asset_id：`ka-src-0005-child-df92708be5cc9bf4`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2 PaiApp 这样的场景下，需要怎么调开放服务？`
- 讲什么：围绕“已验收／O2 PaiApp 这样的场景下，需要怎么调开放服务？”展开，正文主要说明：1、检查开放服务的接口的权限是否设置为“通用接口”，平台只允许调用“通用接口” 2、如果不是“通用接口”，需要重新创建一个接口（选择“通用接口”），然后改成使用新接口。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2源码基础检查器提示有不规范的license，无法发布，该怎么办？

- child_asset_id：`ka-src-0005-child-13d82d149025d158`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2源码基础检查器提示有不规范的license，无法发布，该怎么办？`
- 讲什么：围绕“已验收／O2源码基础检查器提示有不规范的license，无法发布，该怎么办？”展开，正文主要说明：对于源码基础检查器提供的报错内容，请根据如下步骤进行排查 根据透出的报错详情，检查代码实现是否存在相应问题，如存在请进行相应修复。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／CDN

- child_asset_id：`ka-src-0005-child-d6ddcaf5cc3377ea`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／CDN`
- 讲什么：围绕“已验收／O2／CDN”展开，正文主要说明：阿里云CDN官方介绍文档。
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／Node

- child_asset_id：`ka-src-0005-child-ee690e726474101d`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／Node`
- 讲什么：仅含很短的占位或提示文字：Node.js官方介绍
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／abc.json

- child_asset_id：`ka-src-0005-child-77e43b41e7a288ba`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／abc.json`
- 讲什么：围绕“已验收／O2／abc.json”展开，正文主要说明：abc.json云构建配置文件规范。
- 主题：研发与部署
- 质量/异常：stub；invalid_json
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／ice

- child_asset_id：`ka-src-0005-child-31c62fbe1b7745be`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／ice`
- 讲什么：围绕“已验收／O2／ice”展开，正文主要说明：飞冰 (ICE) 是一套面向大淘宝技术的终端应用研发体系。
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／package.json

- child_asset_id：`ka-src-0005-child-476547d800e10a90`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／package.json`
- 讲什么：围绕“已验收／O2／package.json”展开，正文主要说明：package.json文件是配置和描述如何与程序交互和运行的中心。 详细参考：package介绍。
- 主题：研发与部署、前端体验
- 质量/异常：short；invalid_json
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／构建阶段化

- child_asset_id：`ka-src-0005-child-916a5fa19aa06ea8`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／构建阶段化`
- 讲什么：仅含很短的占位或提示文字：构建阶段化介绍
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／终端Web代码规范扫描

- child_asset_id：`ka-src-0005-child-e4b5cbb4f5869212`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／终端Web代码规范扫描`
- 讲什么：围绕“已验收／O2／终端Web代码规范扫描”展开，正文主要说明：终端Web代码规范扫描插件详细。
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／脚手架

- child_asset_id：`ka-src-0005-child-a15e718bfb02f41a`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／脚手架`
- 讲什么：仅含很短的占位或提示文字：云脚手架介绍
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／O2／锁依赖

- child_asset_id：`ka-src-0005-child-2ca4e425d9e35675`
- 相对路径：`raw/o2/终端交付（O2）/已验收／O2／锁依赖`
- 讲什么：仅含很短的占位或提示文字：依赖版本锁定能力
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／SPA站点配置Robots.txt后不生效是怎么回事？

- child_asset_id：`ka-src-0005-child-4ae015f9d0639811`
- 相对路径：`raw/o2/终端交付（O2）/已验收／SPA站点配置Robots.txt后不生效是怎么回事？`
- 讲什么：围绕“已验收／SPA站点配置Robots.txt后不生效是怎么回事？”展开，正文主要说明：SPA 站点会将所有请求转发至单一页面。 此规则没有对 robots.txt 等文件进行特殊处理，在访问这些文件时，仍然返回设置的页面内容。
- 主题：前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／aone流水线提示有冲突，在 O2 解决冲突时显示未检测到冲突，该如何解决？

- child_asset_id：`ka-src-0005-child-e2aff3f5baa83860`
- 相对路径：`raw/o2/终端交付（O2）/已验收／aone流水线提示有冲突，在 O2 解决冲突时显示未检测到冲突，该如何解决？`
- 讲什么：围绕“已验收／aone流水线提示有冲突，在 O2 解决冲突时显示未检测到冲突，该如何解决？”展开，正文主要说明：在 Aone 或 O2 Space 发布流水线中可能会出现合并过程中提示出现冲突，但使用 O2 解决冲突时提示 分支 xx 与 yy 未检测到冲突的问题。 不论应用在 Aone 或 O2 Space 发布，请尝试手动合并一下主干分支（取决于你的应用主干分支是哪个，一般是 master）
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／assets应用，外包可以把资源发布上线，如何能够拦截？

- child_asset_id：`ka-src-0005-child-b3772f5bae07c899`
- 相对路径：`raw/o2/终端交付（O2）/已验收／assets应用，外包可以把资源发布上线，如何能够拦截？`
- 讲什么：围绕“已验收／assets应用，外包可以把资源发布上线，如何能够拦截？”展开，正文主要说明：解决方案：在 “团队空间” 中添加一条 “外包不允许线上发布” 的规则。 点击导航栏 “团队空间” 进入操作页面。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／assets研发日常获取到的环境变量是production，如何才能获取到daily或pre呢？需要通过环境变量判断环境

- child_asset_id：`ka-src-0005-child-03a12b37045fede6`
- 相对路径：`raw/o2/终端交付（O2）/已验收／assets研发日常获取到的环境变量是production，如何才能获取到daily或pre呢？需要通过环境变量判断环境`
- 讲什么：围绕“已验收／assets研发日常获取到的环境变量是production，如何才能获取到daily或pre呢？需要通过环境变量判断环境”展开，正文主要说明：原因：assets 发布，默认线上是不执行构建过程的，而是直接获取对应 commitId 最新日常发布的构建结果。 这样做主要是为了遵循所测即所发的原则，避免在日常测试好的代码线上发布时重新构建引入 bug。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P2`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／def的预发域名是什么

- child_asset_id：`ka-src-0005-child-72fc52eae45d925e`
- 相对路径：`raw/o2/终端交付（O2）/已验收／def的预发域名是什么`
- 讲什么：围绕“已验收／def的预发域名是什么”展开，正文主要说明：预发域名：pre-space.o2.alibaba-inc.com。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／diamond 如何推送除了版本号之外的信息呢？

- child_asset_id：`ka-src-0005-child-32d354331c7ae19b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／diamond 如何推送除了版本号之外的信息呢？`
- 讲什么：围绕“已验收／diamond 如何推送除了版本号之外的信息呢？”展开，正文主要说明：diamond 目前推送内容包括：版本号、推送时间、推送人信息、推送应用 ID、迭代 ID、推送环境。 若不满足您的业务场景，可在 Aone 中提需求单。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／er 研发，灰度发布暂停时无法取消发布，该怎么办？

- child_asset_id：`ka-src-0005-child-36b1430b8be79b27`
- 相对路径：`raw/o2/终端交付（O2）/已验收／er 研发，灰度发布暂停时无法取消发布，该怎么办？`
- 讲什么：围绕“已验收／er 研发，灰度发布暂停时无法取消发布，该怎么办？”展开，正文主要说明：目前暂不支持在流水线暂停时取消发布，如有需求，请联系平台管理员操作。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／er域名如何访问源站的内网SPE环境

- child_asset_id：`ka-src-0005-child-f7565583711be531`
- 相对路径：`raw/o2/终端交付（O2）/已验收／er域名如何访问源站的内网SPE环境`
- 讲什么：围绕“已验收／er域名如何访问源站的内网SPE环境”展开，正文主要说明：ER属于公网服务，内网SPE归属集团内部网络，网络隔离，预期行为，不支持公网访问内部网络。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／er研发想查询IPv4的列表结果报错，ERROR ER_PRE_DEPLOY 失败 _查询模拟环境节点的 IP 异常_，如何解决

- child_asset_id：`ka-src-0005-child-4fa628de2494b0cd`
- 相对路径：`raw/o2/终端交付（O2）/已验收／er研发想查询IPv4的列表结果报错，ERROR ER_PRE_DEPLOY 失败 _查询模拟环境节点的 IP 异常_，如何解决`
- 讲什么：围绕“已验收／er研发想查询IPv4的列表结果报错，ERROR ER_PRE_DEPLOY 失败 _查询模拟环境节点的 IP 异常_，如何解决”展开，正文主要说明：可能原因一：可能是网络原因造成的，请确保网络联通正常 可能原因二：当前子账号未开通相关权限，请确保开通了 CDN 的 DescribeStagingIp 权限。
- 主题：安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／o2 web ide无法进入

- child_asset_id：`ka-src-0005-child-870b7f5780a69d27`
- 相对路径：`raw/o2/终端交付（O2）/已验收／o2 web ide无法进入`
- 讲什么：围绕“已验收／o2 web ide无法进入”展开，正文主要说明：可能原因一：收到浏览器插件影响，请在隐身模式下尝试访问 可能原因二：网络问题，可以尝试在本地查看代码或开发。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／oxs区访问不了dev.g.alicdn.com资源，该怎么办？

- child_asset_id：`ka-src-0005-child-4b4375693ebb24e4`
- 相对路径：`raw/o2/终端交付（O2）/已验收／oxs区访问不了dev.g.alicdn.com资源，该怎么办？`
- 讲什么：围绕“已验收／oxs区访问不了dev.g.alicdn.com资源，该怎么办？”展开，正文主要说明：OXS区限了弹内域名的访问，所以无法访问dev.g.alicdn.com，请使用daily-assets.aliyun-inc.com进行替换。 此外，g.alicdn.com是公网CDN域名，不受OXS访问限制。 章节线索包括：七网隔离、OXS区。
- 主题：研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／serverless 如何流式调用

- child_asset_id：`ka-src-0005-child-4d823671babc08a3`
- 相对路径：`raw/o2/终端交付（O2）/已验收／serverless 如何流式调用`
- 讲什么：围绕“已验收／serverless 如何流式调用”展开，正文主要说明：问题描述：serverless 如何流式调用？ 解决方案： serverless支持流式ssr，在web研发里，如下图所示： (。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／serverless函数调用日志的查询结果都是空的，应该从哪儿看函数调用日志呢？

- child_asset_id：`ka-src-0005-child-d2c58f1f722e7ae0`
- 相对路径：`raw/o2/终端交付（O2）/已验收／serverless函数调用日志的查询结果都是空的，应该从哪儿看函数调用日志呢？`
- 讲什么：围绕“已验收／serverless函数调用日志的查询结果都是空的，应该从哪儿看函数调用日志呢？”展开，正文主要说明：临时查询函数请求日志方式 根据函数服务的部署单元选择查询region，比如部署了张北 就选择 log-fc-self-monitor-zjk-corp。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／taskId怎么获得

- child_asset_id：`ka-src-0005-child-be73bfc1b8da367b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／taskId怎么获得`
- 讲什么：围绕“已验收／taskId怎么获得”展开，正文主要说明：接口 /v1.0/work/iterations/{iterationId}/detail可以通过迭代ID获取迭代详细信息，在接口的返回值中 "lastTask" 中 的 "id" 即为迭代最新发布任务的taskid 参考文档：通过ID获取迭代详细。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／tnpm 研发没有 diamond 推送入口，是不支持吗？

- child_asset_id：`ka-src-0005-child-62f060b489d07b7a`
- 相对路径：`raw/o2/终端交付（O2）/已验收／tnpm 研发没有 diamond 推送入口，是不支持吗？`
- 讲什么：围绕“已验收／tnpm 研发没有 diamond 推送入口，是不支持吗？”展开，正文主要说明：当前 diamond 推送仅支持 Assets 应用类型，不支持 Tnpm 研发。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／tnpm安装依赖失败，提示zlib：incorrect data check，该怎么办？

- child_asset_id：`ka-src-0005-child-52ebfb3c3471afbb`
- 相对路径：`raw/o2/终端交付（O2）/已验收／tnpm安装依赖失败，提示zlib：incorrect data check，该怎么办？`
- 讲什么：围绕“已验收／tnpm安装依赖失败，提示zlib：incorrect data check，该怎么办？”展开，正文主要说明：执行 tnpm install 时，出现 zlib: incorrect data check、ZDATAERROR 报错信息。 如果你使用的是 mac arm 系列芯片（M1 / M2），旧版本的 node 在 mac arm 系列芯片下存在兼容性问题。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／为什么er研发中根据地区灰度的功能不生效？我选了线上灰度北京，但是我在北京访问还是旧版本的页面

- child_asset_id：`ka-src-0005-child-1389a43f1740ba08`
- 相对路径：`raw/o2/终端交付（O2）/已验收／为什么er研发中根据地区灰度的功能不生效？我选了线上灰度北京，但是我在北京访问还是旧版本的页面`
- 讲什么：围绕“已验收／为什么er研发中根据地区灰度的功能不生效？我选了线上灰度北京，但是我在北京访问还是旧版本的页面”展开，正文主要说明：首先，灰度的是北京的CDN节点，你需要确认你访问的是不是北京的节点。 （办公网大部分园区的出口IP连接的节点是杭州，上海，青岛，河北等，这是由abtn决定，所以测试时，请选择普通5G网络）
- 主题：前端体验
- 质量/异常：short；historical_or_deprecated_path
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／为什么函数发布后预发internal server error？

- child_asset_id：`ka-src-0005-child-340c1991e6431410`
- 相对路径：`raw/o2/终端交付（O2）/已验收／为什么函数发布后预发internal server error？`
- 讲什么：围绕“已验收／为什么函数发布后预发internal server error？”展开，正文主要说明：一般是函数执行报错，业务同学可以自查日志解决。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／为什么站点接入CDN域名时提示不允许接入内网域名？

- child_asset_id：`ka-src-0005-child-462a2b1407c287ed`
- 相对路径：`raw/o2/终端交付（O2）/已验收／为什么站点接入CDN域名时提示不允许接入内网域名？`
- 讲什么：围绕“已验收／为什么站点接入CDN域名时提示不允许接入内网域名？”展开，正文主要说明：接入 CDN 的域名可以被公网上的所有用户访问。 而-inc相关域名规划上属于内网域名，不应对外开放访问。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／主干分支是 main，如何改回 master

- child_asset_id：`ka-src-0005-child-682c4730b015b215`
- 相对路径：`raw/o2/终端交付（O2）/已验收／主干分支是 main，如何改回 master`
- 讲什么：围绕“已验收／主干分支是 main，如何改回 master”展开，正文主要说明：1、确保有 master 分支，并使其和 main 分支保持一致 2、到 Code 设置仓库的默认分支为 master。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／事件中心报错，错误信息为空怎么办

- child_asset_id：`ka-src-0005-child-484673e282463c09`
- 相对路径：`raw/o2/终端交付（O2）/已验收／事件中心报错，错误信息为空怎么办`
- 讲什么：围绕“已验收／事件中心报错，错误信息为空怎么办”展开，正文主要说明：如果在事件中心看到错误信息为空，可以 联系平台管理员查看具体报错信息。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／产物：js／index.js   超出大小限制，能否部署上线？

- child_asset_id：`ka-src-0005-child-3dfc12711a2a0408`
- 相对路径：`raw/o2/终端交付（O2）/已验收／产物：js／index.js   超出大小限制，能否部署上线？`
- 讲什么：围绕“已验收／产物：js／index.js   超出大小限制，能否部署上线？”展开，正文主要说明：问题描述：构建 产物：js/index.js，超出大小限制，能否部署上线？ 解决方案：不能，需要优化一下产物的大小。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／代码已合并到master了，但cr检查提示cr未提交，该怎么办？

- child_asset_id：`ka-src-0005-child-c18a2c67da85f558`
- 相对路径：`raw/o2/终端交付（O2）/已验收／代码已合并到master了，但cr检查提示cr未提交，该怎么办？`
- 讲什么：围绕“已验收／代码已合并到master了，但cr检查提示cr未提交，该怎么办？”展开，正文主要说明：原因：其他平台上提交 CR，CR 单的状态不会同步到 O2 平台，所以显示未提交 CR 解决方案：在 O2 平台重新提交 CR，可自动同步状态，该 CR 单会显示为“已通过”。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／代码已经被合并，但是未发布成功，该如何处理？

- child_asset_id：`ka-src-0005-child-cefd7e71c304ea24`
- 相对路径：`raw/o2/终端交付（O2）/已验收／代码已经被合并，但是未发布成功，该如何处理？`
- 讲什么：围绕“已验收／代码已经被合并，但是未发布成功，该如何处理？”展开，正文主要说明：请访问应用的【发布记录】页面，查看当前迭代是否成功执行过线上发布 如果没有执行过线上发布，则此次代码合并不是平台执行的。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／代码评审人怎么可以变成多选框的格式呢？

- child_asset_id：`ka-src-0005-child-cca592b8c654c368`
- 相对路径：`raw/o2/终端交付（O2）/已验收／代码评审人怎么可以变成多选框的格式呢？`
- 讲什么：围绕“已验收／代码评审人怎么可以变成多选框的格式呢？”展开，正文主要说明：问题描述：代码评审人怎么可以变成多选框的格式呢？ 解决方案：在成员页面设置 代码评审负责人 即可，如下图所示。
- 主题：前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／使用o2组件开发发布平台，window.PageData_.fgModules.is_use_o2_code_lite_merge_conflict 这个值是undefine，导致无法发布，该怎么办？

- child_asset_id：`ka-src-0005-child-35d1c1462d410afc`
- 相对路径：`raw/o2/终端交付（O2）/已验收／使用o2组件开发发布平台，window.PageData_.fgModules.is_use_o2_code_lite_merge_conflict 这个值是undefine，导致无法发布，该怎么办？`
- 讲什么：围绕“已验收／使用o2组件开发发布平台，window.PageData_.fgModules.is_use_o2_code_lite_merge_conflict 这个值是undefine，导致无法发布，该怎么办？”展开，正文主要说明：注意，已经不推荐使用 O2 组件进行业务开发，推荐使用 O2 扩展（SPI）或 O2 API。 这个报错的原因是使用的组件已经比较老了，升级到较新的版本或者自己 mock 一下该变量即可。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／修改仓库会有什么影响呢？

- child_asset_id：`ka-src-0005-child-71713d6bbd15bc72`
- 相对路径：`raw/o2/终端交付（O2）/已验收／修改仓库会有什么影响呢？`
- 讲什么：围绕“已验收／修改仓库会有什么影响呢？”展开，正文主要说明：以下场景可能会存在修改应用关联仓库的诉求 如何修改应用关联的仓库？
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／函数发布提示未找到对应环境下的域名信息，如何解决？

- child_asset_id：`ka-src-0005-child-0794acf50af6a30c`
- 相对路径：`raw/o2/终端交付（O2）/已验收／函数发布提示未找到对应环境下的域名信息，如何解决？`
- 讲什么：围绕“已验收／函数发布提示未找到对应环境下的域名信息，如何解决？”展开，正文主要说明：一般是 fyml 中的 service 和 domainName 需要和应用实际的应用名保持一致，一般出现这种问题的在 copy 其他项目代码的场景下比较多。 上图函数应用名是 ai-service 而他代码里是 midwaydefaultservice 两边不一致就会出现报错，只需要把 fyml 中的 midwaydefaultservice 都改成 ai-service 即可。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／函数应用删除多套环境时，实例会释放吗

- child_asset_id：`ka-src-0005-child-12a7a42d7e902293`
- 相对路径：`raw/o2/终端交付（O2）/已验收／函数应用删除多套环境时，实例会释放吗`
- 讲什么：围绕“已验收／函数应用删除多套环境时，实例会释放吗”展开，正文主要说明：问题描述：函数应用删除多套环境时，实例会释放吗？ 解决方案：实例不会释放，还会存留，开发同学手动删除一下即可。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／函数应用，将一些变量放到内存中进行缓存，发现本地和预发都可行，但线上偶尔会读到最新的缓存，偶尔会读到老的缓存，是因为预发只有一台机器，线上多台机器导致的吗？

- child_asset_id：`ka-src-0005-child-7c22c90d0fb7d3e4`
- 相对路径：`raw/o2/终端交付（O2）/已验收／函数应用，将一些变量放到内存中进行缓存，发现本地和预发都可行，但线上偶尔会读到最新的缓存，偶尔会读到老的缓存，是因为预发只有一台机器，线上多台机器导致的吗？`
- 讲什么：围绕“已验收／函数应用，将一些变量放到内存中进行缓存，发现本地和预发都可行，但线上偶尔会读到最新的缓存，偶尔会读到老的缓存，是因为预发只有一台机器，线上多台机器导致的吗？”展开，正文主要说明：线上环境至少有 2 个预留容器，访问时随机分配。 此外，由于函数存在轮转和弹性机制机制，实际线上提供服务的容器数量不固定，建议您使用外部存储服务（如 Redis 或 OSS）存储缓存数据。
- 主题：数据分析
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／创建天马时出现源码页面创建失败，该怎么办？

- child_asset_id：`ka-src-0005-child-420b0bad81006241`
- 相对路径：`raw/o2/终端交付（O2）/已验收／创建天马时出现源码页面创建失败，该怎么办？`
- 讲什么：围绕“已验收／创建天马时出现源码页面创建失败，该怎么办？”展开，正文主要说明：问题说明：接入的仓库未添加平台公共账号，平台无权限创建，导致创建失败 解决方案：在仓库的 group 增加 tbfed 和 zebra-gitlab 作为管理员。
- 主题：安全与权限、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／创建构建任务失败_ VError_ 没有权限调用开放服务builder，如何处理

- child_asset_id：`ka-src-0005-child-d3252e6a4b9faf55`
- 相对路径：`raw/o2/终端交付（O2）/已验收／创建构建任务失败_ VError_ 没有权限调用开放服务builder，如何处理`
- 讲什么：围绕“已验收／创建构建任务失败_ VError_ 没有权限调用开放服务builder，如何处理”展开，正文主要说明：请确保在 O2 开放平台（ client 请确保申请了 O2 云构建的接口权限。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／创建迭代页面，新建变更，通过已有分支创建，在下拉列表里没有找到全量远程git分支，这是为什么？

- child_asset_id：`ka-src-0005-child-49d791854e7b9afa`
- 相对路径：`raw/o2/终端交付（O2）/已验收／创建迭代页面，新建变更，通过已有分支创建，在下拉列表里没有找到全量远程git分支，这是为什么？`
- 讲什么：围绕“已验收／创建迭代页面，新建变更，通过已有分支创建，在下拉列表里没有找到全量远程git分支，这是为什么？”展开，正文主要说明：O2 Space 在新建迭代-新建变更-通过已有分支创建操作中，下拉列表仅展示未绑定变更的分支，因此在这一场景中下拉列表不会展示已绑定其他变更的分支。 如果对应分支已经绑定至其他变更，则推荐使用「已有变更」的方式将对应变更关联进当前迭代，而不是重新创建一个变更。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／前端动态资源未做替换

- child_asset_id：`ka-src-0005-child-61e9e73ec700aa5f`
- 相对路径：`raw/o2/终端交付（O2）/已验收／前端动态资源未做替换`
- 讲什么：围绕“已验收／前端动态资源未做替换”展开，正文主要说明：前端动态资源中的参数没有按照后端接口返回的做替换，如下图 需要用户自己在 构建过程中完成参数替换这一步骤。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／单元测试结果显示错误，看不到正确结果怎么办？

- child_asset_id：`ka-src-0005-child-22f12a91027d0207`
- 相对路径：`raw/o2/终端交付（O2）/已验收／单元测试结果显示错误，看不到正确结果怎么办？`
- 讲什么：围绕“已验收／单元测试结果显示错误，看不到正确结果怎么办？”展开，正文主要说明：若日志中展示了多条 “ 轮询判断 coverage-final.json 是否已产出... ” ，说明系统无法获取到单测报告。 请检查单测配置，单测覆盖率产出目录不是 ./.ci ，请参考 文档，在 jest.config.js 或 vitest.test.js 中需指定报告输出目录为 ./.ci，如下。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／原aone前端项目如何迁移到o2

- child_asset_id：`ka-src-0005-child-ed044dd45b0e8a0c`
- 相对路径：`raw/o2/终端交付（O2）/已验收／原aone前端项目如何迁移到o2`
- 讲什么：围绕“已验收／原aone前端项目如何迁移到o2”展开，正文主要说明：请参照 《快速接入》文档进行应用接入，如需开启 diamond 推送，请在 O2答疑需求 中提需求。
- 主题：研发与部署、项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／发布失败（doing）

- child_asset_id：`ka-src-0005-child-4cccf50c45cebcd6`
- 相对路径：`raw/o2/终端交付（O2）/已验收／发布失败（doing）`
- 讲什么：围绕“已验收／发布失败（doing）”展开，正文主要说明：O2发布流水线中存在多个发布节点，发布失败时各个节点的失败原因各不相同，请根据报错判断具体原因。 质量检测节点会运行构建产物检查等门神检查器，日常发布时失败不会卡发布，线上发布时会卡发布。 章节线索包括：源码检查、CDN检查、分支集成、上传源代码、构建。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／发布时提示“天马业务扩展 hook”执行失败怎么办

- child_asset_id：`ka-src-0005-child-e862bbb4097ced01`
- 相对路径：`raw/o2/终端交付（O2）/已验收／发布时提示“天马业务扩展 hook”执行失败怎么办`
- 讲什么：围绕“已验收／发布时提示“天马业务扩展 hook”执行失败怎么办”展开，正文主要说明：天马物料发布流水线中的“天马业务扩展 hook”是由业务在天马配置的基于“天马应用”维度的 web hook 业务扩展 hook 执行失败主要会存在两种情况。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／发布时显示变更的 终端 Web 代码规范扫描 未触发，该如何触发

- child_asset_id：`ka-src-0005-child-60ebff44057f5884`
- 相对路径：`raw/o2/终端交付（O2）/已验收／发布时显示变更的 终端 Web 代码规范扫描 未触发，该如何触发`
- 讲什么：围绕“已验收／发布时显示变更的 终端 Web 代码规范扫描 未触发，该如何触发”展开，正文主要说明：当发现变更分支集成验证中存在扫描器未正常触发时，可以通过如下操作，进行触发 将当前变更退出迭代集成区。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／发布页面的构建日志智能诊断窗口是否可以关闭？已经遮挡左边的构建信息了

- child_asset_id：`ka-src-0005-child-c425a7cb357df0ff`
- 相对路径：`raw/o2/终端交付（O2）/已验收／发布页面的构建日志智能诊断窗口是否可以关闭？已经遮挡左边的构建信息了`
- 讲什么：围绕“已验收／发布页面的构建日志智能诊断窗口是否可以关闭？已经遮挡左边的构建信息了”展开，正文主要说明：AI 智能诊断当前不会默认开启，点击悬浮小球，可进行开启和关闭。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／在发布的时候，遇到release分支不见的问题

- child_asset_id：`ka-src-0005-child-ebdfa94286f54d0a`
- 相对路径：`raw/o2/终端交付（O2）/已验收／在发布的时候，遇到release分支不见的问题`
- 讲什么：围绕“已验收／在发布的时候，遇到release分支不见的问题”展开，正文主要说明：问题原因：release分支被自动清除了 解决方案：点击重新部署按钮，重新部署一次即可。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／在开发扩展的时候，为什么没有【扩展配置】按钮

- child_asset_id：`ka-src-0005-child-73c7c93054c022c9`
- 相对路径：`raw/o2/终端交付（O2）/已验收／在开发扩展的时候，为什么没有【扩展配置】按钮`
- 讲什么：围绕“已验收／在开发扩展的时候，为什么没有【扩展配置】按钮”展开，正文主要说明：原因：使用的还是老的开放扩展类型，「扩展配置」是新的 Pai App 应用类型才支持的能力 请迁移至 Pai App，参考文档。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／在接入 O2 ER 研发时，子账号需要开通哪些权限

- child_asset_id：`ka-src-0005-child-74ff98c55ee34368`
- 相对路径：`raw/o2/终端交付（O2）/已验收／在接入 O2 ER 研发时，子账号需要开通哪些权限`
- 讲什么：围绕“已验收／在接入 O2 ER 研发时，子账号需要开通哪些权限”展开，正文主要说明：赋予子账号 AliyunCDNFullAccess 和 AliyunDCDNFullAccess 权限，具体可以参考文档： 中接入说明部分 部分团队无法可能无法开 通个人子账号控制台 full 授权，可以开通如下权限。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／在线解冲突提交代码有没有办法通过lint-staged做代码检查

- child_asset_id：`ka-src-0005-child-8abe6e3931a40ff0`
- 相对路径：`raw/o2/终端交付（O2）/已验收／在线解冲突提交代码有没有办法通过lint-staged做代码检查`
- 讲什么：围绕“已验收／在线解冲突提交代码有没有办法通过lint-staged做代码检查”展开，正文主要说明：当前暂不支持， 在线解决冲突定位是一个比较简易的解冲突环境，目前暂时还不支持 lint-staged 做代码检查。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／天马创建的gcp应用为什么在gcp中找不到

- child_asset_id：`ka-src-0005-child-82ff1f925967b8cc`
- 相对路径：`raw/o2/终端交付（O2）/已验收／天马创建的gcp应用为什么在gcp中找不到`
- 讲什么：围绕“已验收／天马创建的gcp应用为什么在gcp中找不到”展开，正文主要说明：GCP 的应用不要在天马工作台创建，请前往 创建 如果在 GCP 平台依然未找到应用，请确认业务团队是否正确。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何为应用启用门神检查器

- child_asset_id：`ka-src-0005-child-1d9c66e7ab76b9ee`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何为应用启用门神检查器`
- 讲什么：围绕“已验收／如何为应用启用门神检查器”展开，正文主要说明：如果需要为应用开启门神检查器，请按如下步骤操作 查看「应用设置」—「基础设置」—「代码检查设置」。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何修改三方异步任务的负责人

- child_asset_id：`ka-src-0005-child-0802c2abb1b0a53e`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何修改三方异步任务的负责人`
- 讲什么：围绕“已验收／如何修改三方异步任务的负责人”展开，正文主要说明：目前暂未提供修改入口，请通过研发小蜜或联系平台管理员处理。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何删除assets应用

- child_asset_id：`ka-src-0005-child-f99a3a427bb3e698`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何删除assets应用`
- 讲什么：围绕“已验收／如何删除assets应用”展开，正文主要说明：O2应用删除按钮位置：设置 -> 高级设置 -> 应用删除 类似问题：应用删除的入口在哪里。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何增加发布卡点任务

- child_asset_id：`ka-src-0005-child-3d6c8eb015179965`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何增加发布卡点任务`
- 讲什么：围绕“已验收／如何增加发布卡点任务”展开，正文主要说明：当前平台提供以下方式为应用增加线上质量检测卡口 是否支持团队空间强制开启。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何导出负责的应用list

- child_asset_id：`ka-src-0005-child-ac08eb2e8183ecb3`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何导出负责的应用list`
- 讲什么：围绕“已验收／如何导出负责的应用list”展开，正文主要说明：o2不提供用户所负责应用列表的导出能力，有需要的用户可以申请离线数据，通过离线数据获取应用列表。 参考文档： O2离线数据。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何查看历史上的 Blocker 问题和 Major 问题？

- child_asset_id：`ka-src-0005-child-c2ea2864aae95998`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何查看历史上的 Blocker 问题和 Major 问题？`
- 讲什么：围绕“已验收／如何查看历史上的 Blocker 问题和 Major 问题？”展开，正文主要说明：可以通过 ATI 平台的代码规范页进行查看（链接。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何申请成为npm包的管理员？

- child_asset_id：`ka-src-0005-child-e9ca622ebd392d2d`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何申请成为npm包的管理员？`
- 讲什么：围绕“已验收／如何申请成为npm包的管理员？”展开，正文主要说明：鼠标 hover 到头像，选择“审批列表” 点击“新建审批”，选择“npm 包 owner 申请”。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何移除质量卡口

- child_asset_id：`ka-src-0005-child-441deda53c4ab7cc`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何移除质量卡口`
- 讲什么：围绕“已验收／如何移除质量卡口”展开，正文主要说明：当前平台质量卡口在集成验证插件列表页可以通过点击详情查看。 该校验策略由应用本身配置，只作用于当前应用，可直接设置为空进行移除。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何获取BU所有前端应用的仓库信息

- child_asset_id：`ka-src-0005-child-1c4ddfc6a843f9f6`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何获取BU所有前端应用的仓库信息`
- 讲什么：围绕“已验收／如何获取BU所有前端应用的仓库信息”展开，正文主要说明：查看 离线数据 中是否已有需要的信息 如果没有，打开 集团研发基础设置反馈空间，按下面格式新建任务，描述清楚想要的信息，如 O2 Spce 应用的仓库信息。
- 主题：数据分析、研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何获取离线数据

- child_asset_id：`ka-src-0005-child-0404a02eead1affc`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何获取离线数据`
- 讲什么：围绕“已验收／如何获取离线数据”展开，正文主要说明：参考 开放能力-离线数据 文档 进入研发小蜜，点击在线咨询。
- 主题：数据分析
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何解决分支合并时报错：refusing to merge unrelated histories？

- child_asset_id：`ka-src-0005-child-91925740a2045350`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何解决分支合并时报错：refusing to merge unrelated histories？`
- 讲什么：围绕“已验收／如何解决分支合并时报错：refusing to merge unrelated histories？”展开，正文主要说明：报错原因：这个报错表示你在尝试合并两个没有共同历史的分支。 这是因为在 Git 中，分支是基于某个共同的历史创建的，如果你试图合并两个没有共同历史的分支，Git 将无法正确地完成此次合并。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何解决发布TNPM包时遇到报错Can't modify pre-existing version_ @ali／___-___@x.y.z-beta._

- child_asset_id：`ka-src-0005-child-d0044437b647ab44`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何解决发布TNPM包时遇到报错Can't modify pre-existing version_ @ali／___-___@x.y.z-beta._`
- 讲什么：围绕“已验收／如何解决发布TNPM包时遇到报错Can't modify pre-existing version_ @ali／___-___@x.y.z-beta._”展开，正文主要说明：该报错原因是用户发布npm包时版本号已存在于 中，anpm不允许重复发布版本，所以会发布失败 请修改npm包根目录中package.json中的version字段后的版本号，注意必须为线上不存在的版本。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何解决报错：413 Request Entity Too Large

- child_asset_id：`ka-src-0005-child-fcd581dfb88bbc13`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何解决报错：413 Request Entity Too Large`
- 讲什么：围绕“已验收／如何解决报错：413 Request Entity Too Large”展开，正文主要说明：413 Request Entity Too Large 报错通常发生在发布 tnpm 的时候，主要原因是产物npm包的体积较大（一般为100MB以上），体积较大的包对系统负担较重，所以存在此限制。 请检查构建逻辑和产物，尝试减少打包文件的体积大小来满足发布要求。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何解决版本号推送配置失败

- child_asset_id：`ka-src-0005-child-906ee54745fe356b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何解决版本号推送配置失败`
- 讲什么：围绕“已验收／如何解决版本号推送配置失败”展开，正文主要说明：一般都是因为网络原因，可以尝试重新推送，看问题是否可以解决。 如果没有解决问题，可以根据以下步骤逐一排查。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何解绑域名

- child_asset_id：`ka-src-0005-child-5562944a6c4b0d1e`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何解绑域名`
- 讲什么：围绕“已验收／如何解绑域名”展开，正文主要说明：解绑域名需要通过邮件申请 如果要解绑的域名是 CDN 域名，需要按照 域名下线 流程操作。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何跳过代码评审

- child_asset_id：`ka-src-0005-child-4b4497b7a8d289bb`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何跳过代码评审`
- 讲什么：围绕“已验收／如何跳过代码评审”展开，正文主要说明：确认代码评审的规则和状态 a. 进入团队空间→应用→应用规则，检查当前团队是否受到“禁止跳过CodeReview”规则的限制。
- 主题：项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如何通过api跳过cr

- child_asset_id：`ka-src-0005-child-83e02c0d5ce55f39`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如何通过api跳过cr`
- 讲什么：围绕“已验收／如何通过api跳过cr”展开，正文主要说明：/work/api/iteration/:iterationId/devbranch/:devbranchId/codereview/skip Path parameters。 章节线索包括：跳过代码评审、Path parameters。
- 主题：安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／如果diamond推送的版本有问题，如何回滚呢？

- child_asset_id：`ka-src-0005-child-4ee8174c6ce300ec`
- 相对路径：`raw/o2/终端交付（O2）/已验收／如果diamond推送的版本有问题，如何回滚呢？`
- 讲什么：围绕“已验收／如果diamond推送的版本有问题，如何回滚呢？”展开，正文主要说明：首先确定要回滚到哪个版本 前往迭代列表找到对应版本号的迭代。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／小程序构建遇到报错：sh_ 1_ anpm_ not found，如何处理？

- child_asset_id：`ka-src-0005-child-95e210d0e0435109`
- 相对路径：`raw/o2/终端交付（O2）/已验收／小程序构建遇到报错：sh_ 1_ anpm_ not found，如何处理？`
- 讲什么：围绕“已验收／小程序构建遇到报错：sh_ 1_ anpm_ not found，如何处理？”展开，正文主要说明：将 anpm 命令行换成 tnpm，anpm 命令行不在维护状态 tnpm 命令行文档请参考。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工信部备案是不是只需要主域名备案就可以

- child_asset_id：`ka-src-0005-child-b73586bc8d600d8a`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工信部备案是不是只需要主域名备案就可以`
- 讲什么：围绕“已验收／工信部备案是不是只需要主域名备案就可以”展开，正文主要说明：是的，申请域名接入cdn时只需要主域名（例如.alibaba.com）在工信部进行备案即可。 未备案的域名只能接入海外cdn。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程基础／npm包发布时如何同时打包对应的 asset 的资源？

- child_asset_id：`ka-src-0005-child-b9698c1693f22ba1`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程基础／npm包发布时如何同时打包对应的 asset 的资源？`
- 讲什么：围绕“已验收／工程基础／npm包发布时如何同时打包对应的 asset 的资源？”展开，正文主要说明：npm 发布的时候，额外打包一份 放到 dist 目录下，然后开启发布到 cdn 应用下打开 「开启 CDN 同步」。 章节线索包括：npm 发布的时候，额外打包一份 放到 dist 目录下，然后开启发布到 cdn、操作步骤。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程基础／tnpm多包构建，有个包没有改动为什么没有跳过构建？该如何跳过构建？

- child_asset_id：`ka-src-0005-child-423602bf9e521ae0`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程基础／tnpm多包构建，有个包没有改动为什么没有跳过构建？该如何跳过构建？`
- 讲什么：围绕“已验收／工程基础／tnpm多包构建，有个包没有改动为什么没有跳过构建？该如何跳过构建？”展开，正文主要说明：可能原因：问题包的 package.json 的 version 不是 registry 上的 latest 版本 快速解决：找构建器作者。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程基础／构建时提示：tnpm8 已不再维护，请升级至新版本。请问如何升级tnpm

- child_asset_id：`ka-src-0005-child-7eabcd2f06f7c2b6`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程基础／构建时提示：tnpm8 已不再维护，请升级至新版本。请问如何升级tnpm`
- 讲什么：围绕“已验收／工程基础／构建时提示：tnpm8 已不再维护，请升级至新版本。请问如何升级tnpm”展开，正文主要说明：目前云构建平台 node14 镜像默认使用 tnpm8，你可以在项目的 abc.json 中加入 "nodeVeresion": 16来切换到 node16 镜像，切换后将默认使用 tnpm9。 如果你的构建类型是构建器，切换 node 版本还需要构建器支持，具体规则详见云构建文档。
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程研发平台／三方代码存在注释，导致产物检查不通过，发布失败，该怎么办

- child_asset_id：`ka-src-0005-child-8d9dfa9106bb3f37`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程研发平台／三方代码存在注释，导致产物检查不通过，发布失败，该怎么办`
- 讲什么：围绕“已验收／工程研发平台／三方代码存在注释，导致产物检查不通过，发布失败，该怎么办”展开，正文主要说明：长期解决方案：请按照扫描结果对注释进行处理，如可以借助 uglify 之类的压缩工具，或者 webpack 里面有的一些压缩配置来避免在产物中出现注释 短期解决方案：提交单次跳过审批单。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程研发平台／如何修改配置对应的diamond

- child_asset_id：`ka-src-0005-child-0aa20ad92a096138`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程研发平台／如何修改配置对应的diamond`
- 讲什么：围绕“已验收／工程研发平台／如何修改配置对应的diamond”展开，正文主要说明：前提：平台固定了推送的 Group 为 O2SPACEFRONT，平台暂不支持修改 Diamond Group 或 DataId 前缀的诉求。 若只是想配置平台默认的 Diamond 推送配置，可以参考如下步骤。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程研发平台／如何将 whrxpi 代码分组添加到天马

- child_asset_id：`ka-src-0005-child-90d5a5eddf58bb92`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程研发平台／如何将 whrxpi 代码分组添加到天马`
- 讲什么：仅含很短的占位或提示文字：用户真实问题链接: 
作者：时路
评审人：上坡
- 主题：O2/Aone 研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／工程研发平台／如何解决发布失败，cdn检查提示分支已存在

- child_asset_id：`ka-src-0005-child-659c93216e396d9a`
- 相对路径：`raw/o2/终端交付（O2）/已验收／工程研发平台／如何解决发布失败，cdn检查提示分支已存在`
- 讲什么：围绕“已验收／工程研发平台／如何解决发布失败，cdn检查提示分支已存在”展开，正文主要说明：1、web 研发的应用，线上发布 页面部署失败后，应该点击 “查看结果” -> “重试”，从当前节点重试 2、若此时误点击了“立即发布”，会出现 CDN 检查失败的情况，此时页面已发布，但代码还未合入主干，需要新建迭代，使用原来的变更重新发布线上，发布完成后代码即可合入主干。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／已经开通了 dcdn 的所有权限，为什么er发布结果了查询不到IPv4列表

- child_asset_id：`ka-src-0005-child-b3fe6237e66e2571`
- 相对路径：`raw/o2/终端交付（O2）/已验收／已经开通了 dcdn 的所有权限，为什么er发布结果了查询不到IPv4列表`
- 讲什么：围绕“已验收／已经开通了 dcdn 的所有权限，为什么er发布结果了查询不到IPv4列表”展开，正文主要说明：注意：查询 IPv4 列表需要的是 CDN 的 DescribeStagingIp 权限 ，而非 DCND。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／应用删除的入口在哪里

- child_asset_id：`ka-src-0005-child-00468dcb3aa1e66e`
- 相对路径：`raw/o2/终端交付（O2）/已验收／应用删除的入口在哪里`
- 讲什么：围绕“已验收／应用删除的入口在哪里”展开，正文主要说明：应用删除入口，进入应用后，点击左侧设置 在设置的右侧 tab 面板中，在页面中间位置，点击高级设置的横向 tab，然后在面板中找到删除按钮，进行删除。
- 主题：前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／应用发布进程一直处在质量检测中不完成怎么办？

- child_asset_id：`ka-src-0005-child-94dad18d3476ad65`
- 相对路径：`raw/o2/终端交付（O2）/已验收／应用发布进程一直处在质量检测中不完成怎么办？`
- 讲什么：围绕“已验收／应用发布进程一直处在质量检测中不完成怎么办？”展开，正文主要说明：检查发布流水线中的质量检测详情，查看具体处于哪个扫描任务未结束，对应的扫描器是什么 在应用的质量检测Tab页中，查看对应的扫描器，是否属于单测覆盖率检测、e2e扫描这两个耗时本身较久的扫描器。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／应用还需要申请开启覆盖式发布吗？

- child_asset_id：`ka-src-0005-child-9122b41e72718f72`
- 相对路径：`raw/o2/终端交付（O2）/已验收／应用还需要申请开启覆盖式发布吗？`
- 讲什么：围绕“已验收／应用还需要申请开启覆盖式发布吗？”展开，正文主要说明：不需要，请使用 Assets Plus 应用类型，具体可以参考文档。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／开放平台如何创建服务开放

- child_asset_id：`ka-src-0005-child-041ee20ddb972872`
- 相对路径：`raw/o2/终端交付（O2）/已验收／开放平台如何创建服务开放`
- 讲什么：围绕“已验收／开放平台如何创建服务开放”展开，正文主要说明：用户可以将接口服务注册到 O2 网关中，从而使用工程平台对外提供的统一开放接口服务，默认为 HTTPS 协议，服务开放支持两种方式接入 方式一：Midway 服务接入。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／开放接口调用404，显示网关到调用侧请求404，是哪里的问题？

- child_asset_id：`ka-src-0005-child-c7ab3eb36b57d5d5`
- 相对路径：`raw/o2/终端交付（O2）/已验收／开放接口调用404，显示网关到调用侧请求404，是哪里的问题？`
- 讲什么：围绕“已验收／开放接口调用404，显示网关到调用侧请求404，是哪里的问题？”展开，正文主要说明：可能原因一：路径缺少 /v1.0 如接口为 /cdn-path-notify/api/getCdnPath，实际请求时需要加上 /v1.0 前缀，如下。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／待部署文件中未找到 package.json

- child_asset_id：`ka-src-0005-child-0912078934b726b6`
- 相对路径：`raw/o2/终端交付（O2）/已验收／待部署文件中未找到 package.json`
- 讲什么：围绕“已验收／待部署文件中未找到 package.json”展开，正文主要说明：发布过程中在 提取构建产物 节点失败，提示 待部署文件中未找到 package.json，请确保已按照流程文档配置 。 在TNPM研发以及其他类似应用的发布流水线中，提取构建产物 节点会检查构建产物中 npm 包根目录下是否存在 package.json 文件。
- 主题：研发与部署
- 质量/异常：short；invalid_json
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／微信小程序预构建卡在了查询构建任务中，但是从构建日志看已经成功了，这是怎么回事？

- child_asset_id：`ka-src-0005-child-af253c4f17d1a1b6`
- 相对路径：`raw/o2/终端交付（O2）/已验收／微信小程序预构建卡在了查询构建任务中，但是从构建日志看已经成功了，这是怎么回事？`
- 讲什么：围绕“已验收／微信小程序预构建卡在了查询构建任务中，但是从构建日志看已经成功了，这是怎么回事？”展开，正文主要说明：可能是日志内容过多，导致底层日志传输超过限制后程序异常，尽可能删除掉日志重试 找到具体的答疑人员进行排查。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／怎么查看当前迭代的代码质量？

- child_asset_id：`ka-src-0005-child-b18e1bf82cbbab65`
- 相对路径：`raw/o2/终端交付（O2）/已验收／怎么查看当前迭代的代码质量？`
- 讲什么：围绕“已验收／怎么查看当前迭代的代码质量？”展开，正文主要说明：代码质量有多方面因素影响，如单元测试、代码规范等。 目前，平台已默认开启了代码的规范扫描，您可以在 “应用集成验证”中找到（单元测试需手动开启）
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／怎么根据代码仓库找应用

- child_asset_id：`ka-src-0005-child-9d12dad581f8d820`
- 相对路径：`raw/o2/终端交付（O2）/已验收／怎么根据代码仓库找应用`
- 讲什么：围绕“已验收／怎么根据代码仓库找应用”展开，正文主要说明：代码仓库的名称即 O2 Space 平台的应用名称，可通过搜索方式实现。 复制代码仓库名称，去除/符号前后的空格。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／想给应用成员中增加一个部门账号，应该怎么操作

- child_asset_id：`ka-src-0005-child-45e60ed68e21640d`
- 相对路径：`raw/o2/终端交付（O2）/已验收／想给应用成员中增加一个部门账号，应该怎么操作`
- 讲什么：围绕“已验收／想给应用成员中增加一个部门账号，应该怎么操作”展开，正文主要说明：背景：平台无法搜索到部门账号的原因是该账号未登录过 O2 Space 研发平台 解决方案：使用部门公共账号访问下 O2 Space，就可以搜索到了。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／想要关联O2到AEM，但是应用设置里没有体验监控设置，该怎么办？

- child_asset_id：`ka-src-0005-child-bef1ea9807613416`
- 相对路径：`raw/o2/终端交付（O2）/已验收／想要关联O2到AEM，但是应用设置里没有体验监控设置，该怎么办？`
- 讲什么：围绕“已验收／想要关联O2到AEM，但是应用设置里没有体验监控设置，该怎么办？”展开，正文主要说明：该功能仅在 Assets 应用类型下支持，请检查应用类型是否匹配。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／想要搭建一个前端项目，能够在日常环境，预发环境，线上环境都能访问到，并且是三个不同域名，该怎么做呢？

- child_asset_id：`ka-src-0005-child-f5a2bb6e26c5dd69`
- 相对路径：`raw/o2/终端交付（O2）/已验收／想要搭建一个前端项目，能够在日常环境，预发环境，线上环境都能访问到，并且是三个不同域名，该怎么做呢？`
- 讲什么：围绕“已验收／想要搭建一个前端项目，能够在日常环境，预发环境，线上环境都能访问到，并且是三个不同域名，该怎么做呢？”展开，正文主要说明：O2 前端发布的环境体系与后端应用存在一定区别。 无论预发还是线上环境，都不支持通过内网 IP 或 VipServer 直接访问。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／我们项目中配置了@ali／eslint-config-att／typescript／react 进行开发规范，但是还是无法在开发阶段暴露major级别的问题，是否major问题只能在平台上扫描 再手动处理？

- child_asset_id：`ka-src-0005-child-73e75477bdfd1f40`
- 相对路径：`raw/o2/终端交付（O2）/已验收／我们项目中配置了@ali／eslint-config-att／typescript／react 进行开发规范，但是还是无法在开发阶段暴露major级别的问题，是否major问题只能在平台上扫描 再手动处理？`
- 讲什么：围绕“已验收／我们项目中配置了@ali／eslint-config-att／typescript／react 进行开发规范，但是还是无法在开发阶段暴露major级别的问题，是否major问题只能在平台上扫描 再手动处理？”展开，正文主要说明：当前终端 Web 代码规范有提供对应的本地扫描 NPM 包，链接。
- 主题：项目管理、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／推送版本的时候changfree检测一直查询结果怎么办？

- child_asset_id：`ka-src-0005-child-3103f45a1994b1b0`
- 相对路径：`raw/o2/终端交付（O2）/已验收／推送版本的时候changfree检测一直查询结果怎么办？`
- 讲什么：围绕“已验收／推送版本的时候changfree检测一直查询结果怎么办？”展开，正文主要说明：首先，可以尝试点击状态旁边的“刷新” ICON，看问题是否可以解决。 如果刷新没有解决问题，可以根据以下步骤逐一排查。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／新增多主干分支时遇到报错_[GitLab create branch API]Invalid reference name_该怎么办？

- child_asset_id：`ka-src-0005-child-23792c22c2fb9950`
- 相对路径：`raw/o2/终端交付（O2）/已验收／新增多主干分支时遇到报错_[GitLab create branch API]Invalid reference name_该怎么办？`
- 讲什么：围绕“已验收／新增多主干分支时遇到报错_[GitLab create branch API]Invalid reference name_该怎么办？”展开，正文主要说明：可以根据以下步骤逐一排查 检查“创建自”的分支是否存在。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／无法发布，提示无法获取变更分支的最新提交，请检查分支是否存在，如何解决？

- child_asset_id：`ka-src-0005-child-4519251d21634029`
- 相对路径：`raw/o2/终端交付（O2）/已验收／无法发布，提示无法获取变更分支的最新提交，请检查分支是否存在，如何解决？`
- 讲什么：围绕“已验收／无法发布，提示无法获取变更分支的最新提交，请检查分支是否存在，如何解决？”展开，正文主要说明：当前 Code 平台对 git commit message 中包含特殊字符时，对该分支的最新 commit 查询会接口返回异常（例如，包含^），此时建议先排查一下变更分支的 commit message 是否包含特殊字符，有则进行修改。 若不包含，则建议联系 O2 Space 平台答疑。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／日常环境的 cdn 资源为什么会被清空？

- child_asset_id：`ka-src-0005-child-ab21423502ce5b88`
- 相对路径：`raw/o2/终端交付（O2）/已验收／日常环境的 cdn 资源为什么会被清空？`
- 讲什么：围绕“已验收／日常环境的 cdn 资源为什么会被清空？”展开，正文主要说明：在 O2 Space 上发布的资源通过版本号管理，与迭代版本号保持一致。 在同一个迭代下进行多次日常发布时，平台只会保留最新一次发布的资源与该版本之间的关联，从而保持预发的资源最新，防止出现历史发布过，但最终没有发布，预发测不出来，带到线上产生故障。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／是否支持通过小程序id查找对应的o2应用？

- child_asset_id：`ka-src-0005-child-173a8944a9aac030`
- 相对路径：`raw/o2/终端交付（O2）/已验收／是否支持通过小程序id查找对应的o2应用？`
- 讲什么：仅含很短的占位或提示文字：用户真实问题链接: 
作者：上坡
评审人：时路
暂时不支持
 样例库 ：
- 主题：研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／普通的web研发应用无法开启多套预发吗？

- child_asset_id：`ka-src-0005-child-4a52224fcaec1ca8`
- 相对路径：`raw/o2/终端交付（O2）/已验收／普通的web研发应用无法开启多套预发吗？`
- 讲什么：围绕“已验收／普通的web研发应用无法开启多套预发吗？”展开，正文主要说明：WebApp 及 Weex 应用属于历史链路，不支持多套预发功能。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／构建的产物有什么接口或者方法可以上传到cdn上呢

- child_asset_id：`ka-src-0005-child-8041fffd263387c5`
- 相对路径：`raw/o2/终端交付（O2）/已验收／构建的产物有什么接口或者方法可以上传到cdn上呢`
- 讲什么：围绕“已验收／构建的产物有什么接口或者方法可以上传到cdn上呢”展开，正文主要说明：上传 CDN 不直接开放，请正常走创建应用->创建迭代->迭代发布流程。 如果有自定义链路诉求，可以走 O2 开放扩展（SPI）链路，具体文档可参考。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／构建类型可以切换吗

- child_asset_id：`ka-src-0005-child-5b261f9ce5fcbb3e`
- 相对路径：`raw/o2/终端交付（O2）/已验收／构建类型可以切换吗`
- 讲什么：围绕“已验收／构建类型可以切换吗”展开，正文主要说明：可以切换，构建类型其实就是构建器或构建脚本，可以通过修改代码中的 abc.json 文件内容选择合适的构建类型。 关于构建器的内容可以参考。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／构建过程中未生成预期的结果目录或构建产物为空

- child_asset_id：`ka-src-0005-child-c80cb32d1dfa2712`
- 相对路径：`raw/o2/终端交付（O2）/已验收／构建过程中未生成预期的结果目录或构建产物为空`
- 讲什么：围绕“已验收／构建过程中未生成预期的结果目录或构建产物为空”展开，正文主要说明：构建任务失败并提示：构建产物为空 构建过程中，通常会因为构建逻辑、构建配置等因素使构建产物未生成或未被正确移动到指定目录。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／没有找到推送版本号入口，请问在哪里？

- child_asset_id：`ka-src-0005-child-39d2ebb3232fd48b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／没有找到推送版本号入口，请问在哪里？`
- 讲什么：围绕“已验收／没有找到推送版本号入口，请问在哪里？”展开，正文主要说明：前提：请确保你的研发类型是 Assets 研发，目前仅支持 Assets 研发类型开启版本推送 开启 Diamond 推送。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源码静态检测生效范围是团队下全部应用，但实际上团队里的部分应用却没有生效这是为什么？

- child_asset_id：`ka-src-0005-child-ace85928452eef98`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源码静态检测生效范围是团队下全部应用，但实际上团队里的部分应用却没有生效这是为什么？`
- 讲什么：围绕“已验收／源码静态检测生效范围是团队下全部应用，但实际上团队里的部分应用却没有生效这是为什么？”展开，正文主要说明：当前集成验证中，扫描器根据下发配置，支持团队 / 应用两个维度的下发。 若出现从团队空间下发相应扫描配置后，部分应用生效，而部分应用未生效时，请根据如下路径进行排查。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／函数发布时提示请检查当前“http”协议域名是否存在风险，该怎么处理？

- child_asset_id：`ka-src-0005-child-069ce6605c1fe49c`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／函数发布时提示请检查当前“http”协议域名是否存在风险，该怎么处理？`
- 讲什么：围绕“已验收／源站／函数发布时提示请检查当前“http”协议域名是否存在风险，该怎么处理？”展开，正文主要说明：一般是 O2 门神检查，只是提示不阻塞发布（一般函数不推荐使用 HTTP，如必须使用 HTTP，请自行验证）
- 主题：研发与部署、项目管理
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／函数应用如何修改租户

- child_asset_id：`ka-src-0005-child-2e2f891e714d0208`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／函数应用如何修改租户`
- 讲什么：围绕“已验收／源站／函数应用如何修改租户”展开，正文主要说明：找夙言，经其评估后走数据订正。
- 主题：数据分析
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／函数应用监控报警为什么收不到告警短信？

- child_asset_id：`ka-src-0005-child-076ace9bf65561c4`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／函数应用监控报警为什么收不到告警短信？`
- 讲什么：围绕“已验收／源站／函数应用监控报警为什么收不到告警短信？”展开，正文主要说明：函数邮件和短信报警在订阅后邮箱和手机会收到一激活链接，点击激活后才会收到报警推送。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／函数日志遇到Error_ function handler = app.handler not found怎么处理

- child_asset_id：`ka-src-0005-child-a05e17ddc3eb4d8b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／函数日志遇到Error_ function handler = app.handler not found怎么处理`
- 讲什么：围绕“已验收／源站／函数日志遇到Error_ function handler = app.handler not found怎么处理”展开，正文主要说明：一般是业务代码执行报错，自查日志解决，或咨询框架负责人张挺。
- 主题：O2/Aone 研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／函数调用日志全部为空，如何查看调用日志？

- child_asset_id：`ka-src-0005-child-98840592710f1e87`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／函数调用日志全部为空，如何查看调用日志？`
- 讲什么：围绕“已验收／源站／函数调用日志全部为空，如何查看调用日志？”展开，正文主要说明：一般是函数跳过 O2 直接在 aone 上直接下线了，已下线函数应用无法恢复，只能新建应用重新发布，并且需要更换函数应用名。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／如何查看函数调用量统计

- child_asset_id：`ka-src-0005-child-a585193e64843d45`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／如何查看函数调用量统计`
- 讲什么：围绕“已验收／源站／如何查看函数调用量统计”展开，正文主要说明：监控报警 ->调用次数，可以看到每分钟的函数调用次数。
- 主题：O2/Aone 研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／如何获取Assets应用资源访问量

- child_asset_id：`ka-src-0005-child-b27703d768cb3239`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／如何获取Assets应用资源访问量`
- 讲什么：围绕“已验收／源站／如何获取Assets应用资源访问量”展开，正文主要说明：您可以在应用中的“用量”页面中查看访问量。
- 主题：前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／安全部这边说我这个静态资源涉及 xss 漏洞，目前应用已经删除，但cdn访问（https_／／g.alicdn.com／dt-f2e／aplus_h5_demo／0.0.1／index.html）还可以，该如何处理呢

- child_asset_id：`ka-src-0005-child-f15f52aefc4d6f16`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／安全部这边说我这个静态资源涉及 xss 漏洞，目前应用已经删除，但cdn访问（https_／／g.alicdn.com／dt-f2e／aplus_h5_demo／0.0.1／index.html）还可以，该如何处理呢`
- 讲什么：围绕“已验收／源站／安全部这边说我这个静态资源涉及 xss 漏洞，目前应用已经删除，但cdn访问（https_／／g.alicdn.com／dt-f2e／aplus_h5_demo／0.0.1／index.html）还可以，该如何处理呢”展开，正文主要说明：若遇到安全合规问题需要下线资源，可以进行文件删除。 历史版本原则上不进行删出，由于删除行为涉及g.alicdn.com链路多条回源链路文件删除，属于高危操作，非必要不进行操作。
- 主题：安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／已经切换为了alinode7，为什么构建时还提示：由于函数运行 Runtime 版本为 alinode5，所以将使用 Alinode5(Node12) 进行构建

- child_asset_id：`ka-src-0005-child-63853b9d4bb6851c`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／已经切换为了alinode7，为什么构建时还提示：由于函数运行 Runtime 版本为 alinode5，所以将使用 Alinode5(Node12) 进行构建`
- 讲什么：围绕“已验收／源站／已经切换为了alinode7，为什么构建时还提示：由于函数运行 Runtime 版本为 alinode5，所以将使用 Alinode5(Node12) 进行构建”展开，正文主要说明：此问题是框架/构建器问题，请加群咨询 “Ali Node.js: Midway / Noslate / Insight 内部答疑总部”群的钉钉群号： 35627750。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／怎么在页面中发布静态产物且地址中不携带迭代版本号？

- child_asset_id：`ka-src-0005-child-03ed810ef86ce07c`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／怎么在页面中发布静态产物且地址中不携带迭代版本号？`
- 讲什么：围绕“已验收／源站／怎么在页面中发布静态产物且地址中不携带迭代版本号？”展开，正文主要说明：建议您使用"Assets 灰度覆盖"应用。
- 主题：研发与部署、前端体验
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／想发布一个内网的网站，我需要怎么做？看起来Assert发布会直接将产物发布到公网的，会有影响吗？

- child_asset_id：`ka-src-0005-child-810817ab2701fec3`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／想发布一个内网的网站，我需要怎么做？看起来Assert发布会直接将产物发布到公网的，会有影响吗？`
- 讲什么：围绕“已验收／源站／想发布一个内网的网站，我需要怎么做？看起来Assert发布会直接将产物发布到公网的，会有影响吗？”展开，正文主要说明：如果有对应的后端服务，可以通过 Assets 应用发布到 CDN 之后，在后端服务上引用发布的资源。 目前包括阿里内外、MyHR 在内的大多数内网服务都通过此方案发布。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／想要将一个域名redirect 到另一个域名，该如何操作

- child_asset_id：`ka-src-0005-child-e7f967d074bf5db0`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／想要将一个域名redirect 到另一个域名，该如何操作`
- 讲什么：围绕“已验收／源站／想要将一个域名redirect 到另一个域名，该如何操作”展开，正文主要说明：目前不提供此能力，如果您确认要进行相关配置，请参考文档提交非标变更。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／日常发布失败，提示g.alicdn.com already has files, please checkout a new branch，该如何处理？

- child_asset_id：`ka-src-0005-child-28b3431dc69f4f23`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／日常发布失败，提示g.alicdn.com already has files, please checkout a new branch，该如何处理？`
- 讲什么：围绕“已验收／源站／日常发布失败，提示g.alicdn.com already has files, please checkout a new branch，该如何处理？”展开，正文主要说明：线上发布assets资源发布成功，函数服务发布失败的情况下操作人员没有点击重试而是重新发起了整体发布，就会出现这个报错，导致发布流程阻塞。 解决方式：新建迭代重新发布（新建迭代的目的是更新cdn版本号）
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／请问下怎么查看我们业务页面的源站访问量？

- child_asset_id：`ka-src-0005-child-0654958aaef00033`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／请问下怎么查看我们业务页面的源站访问量？`
- 讲什么：围绕“已验收／源站／请问下怎么查看我们业务页面的源站访问量？”展开，正文主要说明：可以在【站点】-【域名数据】中查看。
- 主题：数据分析、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／源站／跨端应用发布静态资源，提示不支持访问后缀.wasm文件，该如何解决？

- child_asset_id：`ka-src-0005-child-1592b74e2c180cbf`
- 相对路径：`raw/o2/终端交付（O2）/已验收／源站／跨端应用发布静态资源，提示不支持访问后缀.wasm文件，该如何解决？`
- 讲什么：围绕“已验收／源站／跨端应用发布静态资源，提示不支持访问后缀.wasm文件，该如何解决？”展开，正文主要说明：建议您使用"Assets 灰度覆盖"应用。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／研发类型tab中，无法找到 大淘宝终端研发，团队有配置该类型，团队其他成员也能正常显示，这是为什么？

- child_asset_id：`ka-src-0005-child-ee2bf9e53c5c79f1`
- 相对路径：`raw/o2/终端交付（O2）/已验收／研发类型tab中，无法找到 大淘宝终端研发，团队有配置该类型，团队其他成员也能正常显示，这是为什么？`
- 讲什么：围绕“已验收／研发类型tab中，无法找到 大淘宝终端研发，团队有配置该类型，团队其他成员也能正常显示，这是为什么？”展开，正文主要说明：1、检查是否在“更多”中 2、若“更多”里没有，检查是否在“管理”中没有勾选该类型。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／研发类型的负责人离职后如何修改

- child_asset_id：`ka-src-0005-child-610af61b8ccc9956`
- 相对路径：`raw/o2/终端交付（O2）/已验收／研发类型的负责人离职后如何修改`
- 讲什么：围绕“已验收／研发类型的负责人离职后如何修改”展开，正文主要说明：前往 O2 SPACE 开放研发平台 ，查找对应的研发类型 在研发类型的设置中找到 维护团队&使用范围 一栏，选择 负责人 一栏进行修改。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／离职人员负责应用产生的账单，该如何处理

- child_asset_id：`ka-src-0005-child-357275b39bbbd6fd`
- 相对路径：`raw/o2/终端交付（O2）/已验收／离职人员负责应用产生的账单，该如何处理`
- 讲什么：围绕“已验收／离职人员负责应用产生的账单，该如何处理”展开，正文主要说明：请通过 “团队空间-应用” 重新确认应用负责人，操作方式见。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／私网（VPC）域名是否支持接入cdn域名

- child_asset_id：`ka-src-0005-child-7c45a26e35c900e1`
- 相对路径：`raw/o2/终端交付（O2）/已验收／私网（VPC）域名是否支持接入cdn域名`
- 讲什么：围绕“已验收／私网（VPC）域名是否支持接入cdn域名”展开，正文主要说明：无法支持，仅支持公网且已接入idns域名进行接入。
- 主题：O2/Aone 研发与部署
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／线上事件中心连接器触发成功，为什么在正式服务器上未找到访问日志？

- child_asset_id：`ka-src-0005-child-24d68625b20cc485`
- 相对路径：`raw/o2/终端交付（O2）/已验收／线上事件中心连接器触发成功，为什么在正式服务器上未找到访问日志？`
- 讲什么：围绕“已验收／线上事件中心连接器触发成功，为什么在正式服务器上未找到访问日志？”展开，正文主要说明：1、通过连接器的日志查看服务器返回是否报错 2、若返回报错，根据错误原因定位服务端问题，若不是服务端的问题可以咨询平台管理员。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／线上发布卡口前置部署检查不通过怎么办？

- child_asset_id：`ka-src-0005-child-a8d2baf93744f71a`
- 相对路径：`raw/o2/终端交付（O2）/已验收／线上发布卡口前置部署检查不通过怎么办？`
- 讲什么：围绕“已验收／线上发布卡口前置部署检查不通过怎么办？”展开，正文主要说明：“前置部署检查不通过”，请参考卡口不通过时给出的提示进行操作。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／线上发布卡口集团soc安全扫描异常怎么处理

- child_asset_id：`ka-src-0005-child-a86845552860becc`
- 相对路径：`raw/o2/终端交付（O2）/已验收／线上发布卡口集团soc安全扫描异常怎么处理`
- 讲什么：围绕“已验收／线上发布卡口集团soc安全扫描异常怎么处理”展开，正文主要说明：SOC 安全扫描异常时，不会卡发线上，直接发布即可。 备注：查询异常原因，可能包括：soc 平台任务创建超时。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／线上环境发布异常：线上发布卡口【前置部署检查、集团 SOC 安全扫描】未检测通过，实际显示扫描已通过，怎么办？

- child_asset_id：`ka-src-0005-child-48d847e6a8adae40`
- 相对路径：`raw/o2/终端交付（O2）/已验收／线上环境发布异常：线上发布卡口【前置部署检查、集团 SOC 安全扫描】未检测通过，实际显示扫描已通过，怎么办？`
- 讲什么：围绕“已验收／线上环境发布异常：线上发布卡口【前置部署检查、集团 SOC 安全扫描】未检测通过，实际显示扫描已通过，怎么办？”展开，正文主要说明：前置部署检查未通过时，不会对其他三方任务检查，表现形式为 xxx 未检测通过 如果拿之前的 SOC 扫描链接，发现在 SOC 平台上是扫描通过的，但是在 Space 上是检测未触发或不通过的，是因为此刻 “前置部署检查” 不通过，导致该 SOC 任务在 Space 平台上被判定为了无效任务。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／线上环境构建完成后会自动合入 master，如何取消这个能力？

- child_asset_id：`ka-src-0005-child-993d4779799872f1`
- 相对路径：`raw/o2/终端交付（O2）/已验收／线上环境构建完成后会自动合入 master，如何取消这个能力？`
- 讲什么：围绕“已验收／线上环境构建完成后会自动合入 master，如何取消这个能力？”展开，正文主要说明：线上资源发布完成后，平台默认会将发布分支合并回主干分支，如果业务有灰度场景，不期望自动合并到主干，平台提供对应的功能（注意：该功能默认不对外提供，无合理诉求不予提供）。 平台提供的功能描述：开启后，线上发布时不再自动合并主干，待业务判定灰度结束后，需手动恢复发布流程，流程会继续执行合并主干的动作。
- 主题：研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／自定义 Webhook 添加失败，提示：域名不在白名单内，如何解决？

- child_asset_id：`ka-src-0005-child-23ef3bfd12f4f587`
- 相对路径：`raw/o2/终端交付（O2）/已验收／自定义 Webhook 添加失败，提示：域名不在白名单内，如何解决？`
- 讲什么：围绕“已验收／自定义 Webhook 添加失败，提示：域名不在白名单内，如何解决？”展开，正文主要说明：目前已经不再支持新增 Webhook 的域名白名单，请使用事件中心代替。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／访问平台时遇到一堆接口报错是什么情况？

- child_asset_id：`ka-src-0005-child-fab1fb33cd8fdccf`
- 相对路径：`raw/o2/终端交付（O2）/已验收／访问平台时遇到一堆接口报错是什么情况？`
- 讲什么：围绕“已验收／访问平台时遇到一堆接口报错是什么情况？”展开，正文主要说明：1、确定是否为本地环境问题，如系统代理、本地网络断开等 2、若本地环境无问题，尝试刷新，若仍未恢复，请联系平台管理员。
- 主题：O2/Aone 研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／请问能否支持在g.alicdn.com上传一个微信小程序校验文件

- child_asset_id：`ka-src-0005-child-f27aa21dd59de24b`
- 相对路径：`raw/o2/终端交付（O2）/已验收／请问能否支持在g.alicdn.com上传一个微信小程序校验文件`
- 讲什么：围绕“已验收／请问能否支持在g.alicdn.com上传一个微信小程序校验文件”展开，正文主要说明：不支持，g.alicdn.com 是集团共用域名，不支持某一业务方绑定。 如有定制域名诉求，请走 Assets plus 链路，申请域名并进行投放。
- 主题：广告投放
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／资源上传到cdn后出现中文乱码怎么办

- child_asset_id：`ka-src-0005-child-557fe71d33f9a469`
- 相对路径：`raw/o2/终端交付（O2）/已验收／资源上传到cdn后出现中文乱码怎么办`
- 讲什么：围绕“已验收／资源上传到cdn后出现中文乱码怎么办”展开，正文主要说明：发布过程本身不会对资源使用的编码进行识别。 因此，在浏览器请求时也不会返回编码信息。
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／遇到提示：无权限创建类型为def_extend的应用，如需申请，请咨询研发小蜜，如何解决？

- child_asset_id：`ka-src-0005-child-1e0debaf2d8ecd52`
- 相对路径：`raw/o2/终端交付（O2）/已验收／遇到提示：无权限创建类型为def_extend的应用，如需申请，请咨询研发小蜜，如何解决？`
- 讲什么：围绕“已验收／遇到提示：无权限创建类型为def_extend的应用，如需申请，请咨询研发小蜜，如何解决？”展开，正文主要说明：“O2 扩展”应用类型不再支持新增，请使用“O2 Pai App”应用类型。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／部分用户内网访问不了页面，报错ERR_CONTENT_DECODING_FAILED，如何解决？

- child_asset_id：`ka-src-0005-child-82b8161af7a9b31f`
- 相对路径：`raw/o2/终端交付（O2）/已验收／部分用户内网访问不了页面，报错ERR_CONTENT_DECODING_FAILED，如何解决？`
- 讲什么：围绕“已验收／部分用户内网访问不了页面，报错ERR_CONTENT_DECODING_FAILED，如何解决？”展开，正文主要说明：部分历史域名配置不完整，可能产生此问题。
- 主题：前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／配置单测后，如何作为应用的发布卡口

- child_asset_id：`ka-src-0005-child-9b40282b43df200d`
- 相对路径：`raw/o2/终端交付（O2）/已验收／配置单测后，如何作为应用的发布卡口`
- 讲什么：围绕“已验收／配置单测后，如何作为应用的发布卡口”展开，正文主要说明：在 “应用-集成验证” 中配置单测卡口检测项。 操作路径：应用左侧栏 · 集成验证 -> 单元测试 -> 校验策略，如下图所示。
- 主题：研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／集成验证E2E测试结果白屏该怎么办？

- child_asset_id：`ka-src-0005-child-ca3f20365021935e`
- 相对路径：`raw/o2/终端交付（O2）/已验收／集成验证E2E测试结果白屏该怎么办？`
- 讲什么：围绕“已验收／集成验证E2E测试结果白屏该怎么办？”展开，正文主要说明：由于 playwright 版本更新等原因，可能会存在因内部部署的 playwright Viewer 版本较低导致的 Trace 详情无法查看问题。 此时可以通过如下方式解决。
- 主题：研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／预发发布后访问页面404怎么办

- child_asset_id：`ka-src-0005-child-af7c506e1519f640`
- 相对路径：`raw/o2/终端交付（O2）/已验收／预发发布后访问页面404怎么办`
- 讲什么：围绕“已验收／预发发布后访问页面404怎么办”展开，正文主要说明：1）检查访问的 URL 地址是否有拼写错误？ 2）检查用于访问 URL 的宿主环境（如：电脑、手机等）中是否有开启代理、做了 host 绑定？
- 主题：研发与部署、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。
- 可提取：只在具体工程问题出现时作为搜索入口。
- 借鉴边界：不纳入产品 PRD、功能路线图或产品知识库默认召回。
- 审查/发布：`unreviewed_child / not_ready`

### 已验收／预发域名接入失败。提示没有证书

- child_asset_id：`ka-src-0005-child-f5f41dfd4366bdc7`
- 相对路径：`raw/o2/终端交付（O2）/已验收／预发域名接入失败。提示没有证书`
- 讲什么：围绕“已验收／预发域名接入失败。提示没有证书”展开，正文主要说明：如果您的域名归属于云智能，目前我们无法受理您的接入需求，请您自行到宙斯平台接入域名后，在【站点】-【域名接入】中选择虚拟集群接入域名 如果您的域名归属于除阿里控股、淘天集团以外的部门（例如国际商业、优酷、本地生活、菜鸟等），请确认在接入预发域名时选择了对应的接入集群。
- 主题：项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / phase1`
- 评估优先级：`P3`
- 对应模块：平台与部署、权限与凭证
- 判断理由：与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。
- 可提取：可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。
- 借鉴边界：仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。
- 审查/发布：`unreviewed_child / not_ready`

## Panama/FBI 数据与业务（15）

### 3. FBI 开放接入+数据处理技术

- child_asset_id：`ka-src-0005-child-7fc1565327526623`
- 相对路径：`raw/panama/FBI技术方案/3. FBI 开放接入+数据处理技术`
- 讲什么：围绕“3. FBI 开放接入+数据处理技术”展开，正文主要说明：一、FBI 开放能力接入 1.1 根据开发指南创建账号，并且根据需求给账号申请权限。 章节线索包括：一、FBI 开放能力接入、1.1 根据开发指南创建账号，并且根据需求给账号申请权限、1.2 后端SDK方式嵌入报表、1.2.1 适应情况、1.2.2 方案原理。
- 主题：广告投放、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：数据分析与口径、报告与结算、权限与凭证
- 判断理由：涉及 FBI 报表接入、账号权限、下载控制或数据处理，与数据分析/报告候选相关，但当前一期主通路已锁定奇航 get_data。
- 可提取：可提取报表嵌入的权限、下载、安全参数和 adapter 检查项。
- 借鉴边界：不得把 FBI 改成一期主数据链；必须验证当前接口、权限、前端技术栈和数据口径。
- 审查/发布：`unreviewed_child / not_ready`

### 正向账单数据迁移至FBI技术方案

- child_asset_id：`ka-src-0005-child-383851d1c6ea905f`
- 相对路径：`raw/panama/FBI技术方案/正向账单数据迁移至FBI技术方案`
- 讲什么：围绕“正向账单数据迁移至FBI技术方案”展开，正文主要说明：减少数据处理流程，减少不正常的数据处理错误 正向账单数据迁移到FBI开放能力，缩短数据处理流程。 章节线索包括：一、AONE、二、实现效果、三、预期目标、四、开发预期。
- 主题：数据分析、研发与部署
- 质量/异常：short
- 对 KA 产品的价值：`conditional_candidate`；建议 `verify_before_use`
- 用途/阶段：`engineering_reference / later`
- 评估优先级：`P2`
- 对应模块：数据分析与口径、报告与结算、权限与凭证
- 判断理由：涉及 FBI 报表接入、账号权限、下载控制或数据处理，与数据分析/报告候选相关，但当前一期主通路已锁定奇航 get_data。
- 可提取：可提取报表嵌入的权限、下载、安全参数和 adapter 检查项。
- 借鉴边界：不得把 FBI 改成一期主数据链；必须验证当前接口、权限、前端技术栈和数据口径。
- 审查/发布：`unreviewed_child / not_ready`

### 巴拿马跨境分销业务与产品总览

- child_asset_id：`ka-src-0005-child-8bc707dd55137ecd`
- 相对路径：`raw/panama/_wiki/01-业务与产品总览/巴拿马跨境分销业务与产品总览.md`
- 讲什么：围绕“巴拿马跨境分销业务与产品总览”展开，正文主要说明：巴拿马是"淘系海外 OVS 供给侧"下的跨境分销 / 跨境供销平台的内部代号，对外称谓包括淘海外跨境分销平台、跨境供销平台、TaoWorld 跨境供货平台。 它依托淘宝、天猫、1688 的丰富供给，面向跨境分销商提供一站式的寻源、采购、支付、履约解决方案，本质是一套完全 B 属性的端外分销体系，与手淘 App 海外版一起服务海外华人及海外消费群体。 章节线索包括：巴拿马跨境分销业务与产品总览、概述、业务模式与目标客户、角色与实体关系、产品与技术架构。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 采购交易与履约链路

- child_asset_id：`ka-src-0005-child-3a7a486ea94a06c9`
- 相对路径：`raw/panama/_wiki/02-交易与履约链路/采购交易与履约链路.md`
- 讲什么：围绕“采购交易与履约链路”展开，正文主要说明：巴拿马（淘系海外 OVS 供给侧 / 跨境分销）的核心能力，是把国内大淘宝的商品货源供给给具备海外分销能力的分销商，通过 API 与产品化工具（分销工作台、Excel 批量创单）为其提供 采购、支付、履约 的整体链路解决方案。 业务底层完全复用国内淘系交易履约链路，因此采购交易的本质是「把分销商的采购诉求适配为国内淘系交易，并把跨境物流履约与国内物流协同拆解」。 章节线索包括：采购交易与履约链路、概述、交易架构演进（历年梳理）、稳定主干（FY23 奠定）、交易身份与产品包定制。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 佣金结算与资损防控

- child_asset_id：`ka-src-0005-child-d737fd2038f05c34`
- 相对路径：`raw/panama/_wiki/03-佣金结算与资损防控/佣金结算与资损防控.md`
- 讲什么：围绕“佣金结算与资损防控”展开，正文主要说明：本页面沉淀「巴拿马跨境分销（淘系海外 OVS 供给侧）」的资金域知识：从平台向淘宝商家收取佣金（收佣/收入链路），到平台向分销商/服务商返佣（返佣/支出链路），再到提现、支付、对账、结算 SOP 与资损防控的端到端体系。 核心资金模型（贯穿全域的第一性原理，来自《分销激励返佣一期概要设计》） 章节线索包括：佣金结算与资损防控、概述、一、资金四链路总览、1.1 收佣规则（佣金类型体系）、二、佣金中心与结算（佣金规则封闭）。
- 主题：数据分析、大模型与 Agent、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 商品域·铺货·选品与搜索

- child_asset_id：`ka-src-0005-child-9dd281c9a201ed6c`
- 相对路径：`raw/panama/_wiki/04-商品域铺货选品与搜索/商品域·铺货·选品与搜索.md`
- 讲什么：围绕“商品域·铺货·选品与搜索”展开，正文主要说明：巴拿马（淘系海外 OVS 供给侧 / 跨境分销）商品域，负责把国内大淘宝 / 天猫 / 1688 的货源商品，经过国际化 / 铺货加工，供给给海外分销商用于选品、铺货、搜索与采购。 整个链路以货通平台（GSP / 全球铺货中心）为商品数据主干，分销侧应用 ovs-pnm-item 作为商品域核心，在其之上构建撞库寻源、选品中心、导购搜索、图搜拍立淘、消息订阅、商品 ID 加解密等能力。 章节线索包括：商品域·铺货·选品与搜索、概述、商品域应用与链路、ovs-pnm-item 核心接口、开放平台商品 API 全景（来源：商品API）。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 账号体系与开放平台

- child_asset_id：`ka-src-0005-child-4f4cff8929fc0017`
- 相对路径：`raw/panama/_wiki/05-账号体系与开放平台/账号体系与开放平台.md`
- 讲什么：围绕“账号体系与开放平台”展开，正文主要说明：本页汇总巴拿马跨境分销（淘系海外 OVS 供给侧）的账号域建设：主子账号体系、UserRelation、入驻与国际支付宝绑定、分层分权/分层分级 API 调用管控、开放平台（OpenAPI）授权链路，以及 1688 采购对接（聚石塔）与 leads/CRM。 账号域是整个分销业务的基础设施：商品铺货、交易履约、佣金结算、IM 等一切上层能力都依赖它提供的账号识别、权限校验与授权 token。 章节线索包括：账号体系与开放平台、概述、账号域与主子账号体系、演进脉络、账号模型（V2 采用方案）。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 消息中心与IM工具

- child_asset_id：`ka-src-0005-child-37a2f217ed7dbc07`
- 相对路径：`raw/panama/_wiki/06-消息中心与IM工具/消息中心与IM工具.md`
- 讲什么：围绕“消息中心与IM工具”展开，正文主要说明：本页汇总巴拿马跨境分销（淘系海外 OVS 供给侧）中"消息"相关的两条技术主线 客服沟通 IM 工具：面向分销商与淘宝卖家（千牛）之间的即时消息互通。 章节线索包括：消息中心与IM工具、概述、IM 工具架构与演进、选型：集团 IM PaaS（而非自建）、系统边界与核心建设。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 限流与服务治理

- child_asset_id：`ka-src-0005-child-9f950c9869e42ce7`
- 相对路径：`raw/panama/_wiki/07-限流与服务治理/限流与服务治理.md`
- 讲什么：围绕“限流与服务治理”展开，正文主要说明：本页汇总巴拿马跨境分销（淘系海外 OVS 供给侧）在服务治理与稳定性工程上的核心建设，围绕四条主线 多维度限流：以 ovs-pnm-security-sdk 为载体，低侵入注解 + 小二控制台 + Diamond 动态配置，对开放平台 HSF 接口按分销商多维度限流。 章节线索包括：限流与服务治理、概述、多维度限流架构、核心概念与策略模型、方法级与用户级优先级。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 技术架构与研发规范

- child_asset_id：`ka-src-0005-child-c16b0c12f69863ba`
- 相对路径：`raw/panama/_wiki/08-技术架构与研发规范/技术架构与研发规范.md`
- 讲什么：围绕“技术架构与研发规范”展开，正文主要说明：本页沉淀巴拿马跨境分销（淘系海外 OVS 供给侧）的整体技术架构、历年架构演进、研发通用规范、公共库/工具能力与 AI 研发规范，是研发同学日常开发、CR、联调、治理的规范性索引。 分销侧核心应用以 ovs-pnm- 为前缀（分销域自建），依赖大量 gsp-（全球供给平台）与国内交易中台（buy2、tradeplatform）等外部系统。 章节线索包括：技术架构与研发规范、概述、整体技术架构与应用列表、领域分层、FY2024 核心模型。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、资金与结算
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 安全生产与稳定性保障

- child_asset_id：`ka-src-0005-child-4617e7db1abe5da7`
- 相对路径：`raw/panama/_wiki/09-安全生产与稳定性保障/安全生产与稳定性保障.md`
- 讲什么：围绕“安全生产与稳定性保障”展开，正文主要说明：本页汇总巴拿马跨境分销域（淘系海外 OVS 供给侧）的安全生产与稳定性保障机制，覆盖安全生产技术场景梳理、故障等级定义、预案与降级、大促保障机制、压测与容量流量模型、监控与报警治理、问题排查 SOP、性能治理案例八大主题，聚焦可复用的机制、规范与操作方法，跳过一次性值班/告警流水记录。 核心自建应用（贯穿全文）：ovs-pnm-open（开放平台网关/核心）、ovs-pnm-account（账号）、ovs-pnm-item（商品）、ovs-pnm-xt（搜索）、ovs-pnm-distributor（分销工作台）、ovs-pnm-matrix（权限/leads）、ovs-pnm-purchase（购物车）、ovs-pnm-pressure（压测施压机）。 章节线索包括：安全生产与稳定性保障、概述、一、安全生产技术场景梳理（FY26）、二、故障等级定义、2.1 设计准则（FY24）。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### AI能力建设

- child_asset_id：`ka-src-0005-child-db76d0a4a5002b31`
- 相对路径：`raw/panama/_wiki/10-AI能力建设/AI能力建设.md`
- 讲什么：围绕“AI能力建设”展开，正文主要说明：本页汇总巴拿马跨境分销（淘系海外 OVS 供给侧，平台品牌为 Taoworld / 淘天跨境供货平台）在 AI 方向的能力建设，覆盖五条主线 AI Coding 研发范式：以 OpenSpec（SDD 规范驱动开发）为底座，融合 Glue Coding 领域知识体系，落地后端 SDD SOP、前端 AI Coding SOP（sdd-fe-all-in-one skill）、IM 群聊版 AI Native 研发流程，实现"需求→设计→澄清→生码→测试→归档"的自动化闭环。 章节线索包括：AI能力建设、概述、AI Coding 研发范式、TMW SDD AI Coding SOP（后端五阶段）、后端 AI Coding 范式：OpenSpec + Glue。
- 主题：实验设计、广告投放、数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### 日本站与自营独立站

- child_asset_id：`ka-src-0005-child-2bc90cd2b14b619e`
- 相对路径：`raw/panama/_wiki/11-日本站与自营独立站/日本站与自营独立站.md`
- 讲什么：围绕“日本站与自营独立站”展开，正文主要说明：本页汇总淘宝天猫海外（AIDC）面向日本独立站的供给侧建设方案。 日本站是一个面向日本市场的独立站（淘外站点），供给侧的核心目标是把淘宝/天猫的商品作为货源，通过铺货、定价、采购与履约的完整链路，在日本站以自营店（自营模式）的形态对外销售。 章节线索包括：日本站与自营独立站、概述、整体方案与工作拆解、全托管模式、自营店商品定价。
- 主题：数据分析、大模型与 Agent、研发与部署、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-65b991959c220fe1`
- 相对路径：`raw/panama/_wiki/index.md`
- 讲什么：围绕“index”展开，正文主要说明：本 Wiki 从「巴拿马业务知识」知识库（淘系海外 OVS 供给侧 / 跨境分销）的 1053 篇源文档中，精炼出稳定、可复用的核心知识，按知识主题重构为 11 个专题页面。 周报、告警流水、值班表、提测/发布 checklist 等流水型内容未纳入本次编译。 章节线索包括：知识库 Wiki 索引、业务与产品、交易与履约、资金与结算、商品与选品。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

### log

- child_asset_id：`ka-src-0005-child-2e687493f607d665`
- 相对路径：`raw/panama/_wiki/log.md`
- 讲什么：围绕“log”展开，正文主要说明：[2026-07-21 21:45] ingest 巴拿马业务知识 Wiki 首次全量初始化（精炼核心知识） 章节线索包括：Wiki 编译日志、[2026-07-21 21:45] ingest ； 巴拿马业务知识 Wiki 首次全量初始化（精炼核心知识）。
- 主题：研发与部署、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。
- 可提取：对当前产品没有直接价值。
- 借鉴边界：不把其他业务域的对象和流程类比成投放任务。
- 审查/发布：`unreviewed_child / not_ready`

## 国际广告白皮书（57）

### AE 广告

- child_asset_id：`ka-src-0005-child-280e464a7ad9c3b4`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/AE 广告`
- 讲什么：仅含很短的占位或提示文字：一、整体业务
 
二、业务数据和KPI
业务数据
- 主题：广告投放、数据分析
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### BP外部依赖

- child_asset_id：`ka-src-0005-child-b69a9f70ab65540e`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/BP外部依赖`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：国际广告白皮书
- 质量/异常：empty；duplicate_content_group_member
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`

### FY20 广告稳定性排雷

- child_asset_id：`ka-src-0005-child-e3ff77c8ffa943c9`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/FY20 广告稳定性排雷`
- 讲什么：围绕“FY20 广告稳定性排雷”展开，正文主要说明：关键词推广双写-推广计划 关键词推广双写-推广信息。 章节线索包括：排雷内容、架构梳理、直通车、顶展、橱窗。
- 主题：广告投放、资金与结算
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### ICBU 广告

- child_asset_id：`ka-src-0005-child-0a4df0e01e861c7a`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/ICBU 广告`
- 讲什么：仅含很短的占位或提示文字：一、整体业务
 
二、业务数据和KPI
业务数据
 
 
KPI
- 主题：广告投放、数据分析
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### ICBU广告-简介

- child_asset_id：`ka-src-0005-child-d8e2578c59eb8f68`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/ICBU广告-简介`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：广告投放
- 质量/异常：empty
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`

### test

- child_asset_id：`ka-src-0005-child-1e6d1c9edcfb59b4`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/test`
- 讲什么：围绕“test”展开，正文主要说明：柯柯是 icbu 一名工程师。
- 主题：国际广告白皮书
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### ※广告大事记※

- child_asset_id：`ka-src-0005-child-b3ae998355851ce5`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/※广告大事记※`
- 讲什么：围绕“※广告大事记※”展开，正文主要说明：2017.08, 广告智能运营平台1.0上线，打造广告运营闭环，运营自动化，数据化。 2018.02, 直通车GGS版本上线，具备服务全球广告客户（多币种、多税率）的能力。 章节线索包括：2017.08, 广告智能运营平台1.0上线，打造广告运营闭环，运营自动化，数据化。、2018.02, 直通车GGS版本上线，具备服务全球广告客户（多币种、多税率）的能力。、2018.03, 顶展创意1.0上线，首次提供给广告主创意表达能力。、2018.08, 直通车人群定向推广上线，关键词营销走向人群营销。、2019.06, 顶展智选词包上线，客户效果和销售售卖共赢的解决方案。。
- 主题：广告投放、数据分析、大模型与 Agent、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 参考资料

- child_asset_id：`ka-src-0005-child-416e36ff57b04261`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/参考资料`
- 讲什么：围绕“参考资料”展开，正文主要说明：download: 搜索联盟技术部故障处理流程.docx download: 搜索联盟容灾体系建设V1.0.docx。
- 主题：研发与部署、安全与权限
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 发布验证

- child_asset_id：`ka-src-0005-child-186592924fb4bcae`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/发布验证`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：研发与部署
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### ads-web

- child_asset_id：`ka-src-0005-child-c089711ed620df4a`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/国际广告应用清单/ads-web`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：国际广告白皮书
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### p4pnmas

- child_asset_id：`ka-src-0005-child-8bb1a54715d0be47`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/国际广告应用清单/p4pnmas`
- 讲什么：围绕“p4pnmas”展开，正文主要说明：computeRecMatchNodeNew filterAndSaveRecNode。 章节线索包括：computeRecMatchNodeNew、filterAndSaveRecNode、solrUpdateCustIdAndKeywordIdNodeForRec。
- 主题：国际广告白皮书
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告应用机器汇总

- child_asset_id：`ka-src-0005-child-0b5087d5d6929303`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/国际广告应用清单/广告应用机器汇总`
- 讲什么：围绕“广告应用机器汇总”展开，正文主要说明：2020.12.01机器分布 2020.12.03扩容操作。 章节线索包括：ads-web、p4p-apps、bw、bwservice、bss。
- 主题：广告投放
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 数据库

- child_asset_id：`ka-src-0005-child-c4dc48f8db464e1d`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/国际广告应用清单/数据库`
- 讲什么：围绕“数据库”展开，正文主要说明：SCP4PHZAPP、SCP4PUSAPP p4p@11.15.3.104:3306【dbfreeP23NK6YoTpEI9wwR】。
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 国际广告白皮书

- child_asset_id：`ka-src-0005-child-0db6a10696829b52`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/国际广告白皮书`
- 讲什么：围绕“国际广告白皮书”展开，正文主要说明：按系统现状梳理系统交互架构图 基于系统交互架构图梳理架构优化点和监控点。 章节线索包括：梳理思路、Action。
- 主题：广告投放、前端体验
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 如何实现支持多币种&多税率的国际化广告竞价系统？

- child_asset_id：`ka-src-0005-child-8082d054a809885e`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/如何实现支持多币种&多税率的国际化广告竞价系统？`
- 讲什么：围绕“如何实现支持多币种&多税率的国际化广告竞价系统？”展开，正文主要说明：别名：多币种、多税率环境下竞价系统实现 国际化广告竞价系统实现 alibaba平台为国内外卖家提供各类付费营销产品，如直通车、顶展等营销产品。
- 主题：广告投放、数据分析、安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 安全领域建设

- child_asset_id：`ka-src-0005-child-905a354624945932`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/安全领域建设`
- 讲什么：仅含很短的占位或提示文字：安全领域建设
Action：
跟进安全领域建设事项；
- 主题：安全与权限
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 容灾体系建设

- child_asset_id：`ka-src-0005-child-a70bab781e0e3cc1`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/容灾体系建设`
- 讲什么：围绕“容灾体系建设”展开，正文主要说明：S1 完成全链路压测，评估核心链路水位和瓶颈。
- 主题：国际广告白皮书
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 广告团队研发规约

- child_asset_id：`ka-src-0005-child-28d33b13067ec2a6`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/广告团队研发规约`
- 讲什么：围绕“广告团队研发规约”展开，正文主要说明：需求评审完成后，必须做设计评审，设计评审完成后再评估工作量，再进行迭代排期 按需求复杂度选择 概要设计和详细设计。 章节线索包括：一、总体原则、二、需求评审、三、概要设计、1、数据库设计（如有）、2、架构设计：系统模块划分+系统模块交互。
- 主题：广告投放、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 故障快速恢复

- child_asset_id：`ka-src-0005-child-bc3e9764b03c97bd`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/故障快速恢复`
- 讲什么：仅含很短的占位或提示文字：故障快速恢复
- 主题：国际广告白皮书
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 智能运营平台

- child_asset_id：`ka-src-0005-child-e6ef97cc24412854`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/智能运营平台`
- 讲什么：仅含很短的占位或提示文字：智能运营平台
- 主题：国际广告白皮书
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### 架构稳定性建设

- child_asset_id：`ka-src-0005-child-2dabfa114f958717`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/架构稳定性建设`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：国际广告白皮书
- 质量/异常：empty；duplicate_content_group_member
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`

### FY19 S1计划

- child_asset_id：`ka-src-0005-child-caebb779417f498b`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/FY19 S1计划`
- 讲什么：围绕“FY19 S1计划”展开，正文主要说明：结合业务项目落地上线（省心宝、CPM），SC P4P结算合并，团队分享 S1结束后，结算日常开发+维护降为0.5人日。
- 主题：广告投放、数据分析、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### GOC盯屏广告监控简单思路

- child_asset_id：`ka-src-0005-child-bbbf3e5cb68e4693`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/GOC盯屏广告监控简单思路`
- 讲什么：围绕“GOC盯屏广告监控简单思路”展开，正文主要说明：前言：广告业务特殊，监控指标受网站流量、运营调整、bt实验、上下游业务变更等多因素影响，所以无法通过单一报警判断是否异常，需要GOC同学进行简单过滤。 1、首先关注“ ICBU广告消耗监控 ”群里，是否有同样的监控报警，且有同学已经在关注并@相关人， 如果已经有业务、开发、测试人员关注到报警且在群里讨论，可不用通知 。
- 主题：实验设计、广告投放、数据分析
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### New document

- child_asset_id：`ka-src-0005-child-2c7d4b382a7a5f71`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/New document`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：国际广告白皮书
- 质量/异常：empty；duplicate_content_group_member
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`

### P4P充值订单与消耗订单匹配关系方案初稿

- child_asset_id：`ka-src-0005-child-d992b8859f0578b8`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/P4P充值订单与消耗订单匹配关系方案初稿`
- 讲什么：围绕“P4P充值订单与消耗订单匹配关系方案初稿”展开，正文主要说明：阿里巴巴印度公司在2017年7月1日进行税制改革，对税率进行了调整。 由于现有系统对于充值订单与消耗订单没有关联关系，ICBU-GGS询盘现金充值包-新签/续签（简称EIP）这个消耗类产品收入产生了影响。 章节线索包括：[](#流程一：scp4p账户现金充值流程：)流程一：SCP4P账户现金充值流程。
- 主题：数据分析、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### P4P／AE P4P结算设计

- child_asset_id：`ka-src-0005-child-0f064401586aa192`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/P4P／AE P4P结算设计`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：资金与结算
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-2c7d4b382a7a5f71`

### adclickserver点击服务器排查日志

- child_asset_id：`ka-src-0005-child-7497bd23d101c8ff`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/adclickserver点击服务器排查日志`
- 讲什么：围绕“adclickserver点击服务器排查日志”展开，正文主要说明：1、原始请求串及refer相关信息 accesslog：/home/admin/cai/logs/cronolog/2018/01/accesslog。 章节线索包括：排查使用到的日志、[](#排查工具)排查工具、[](#常用排查类)常用排查类、[](#点击服务器整体流程)点击服务器整体流程、[](#如何判定点击服务处理完成)如何判定点击服务处理完成。
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### p4pclickserver 交接文档

- child_asset_id：`ka-src-0005-child-8da3738d90fa2219`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/p4pclickserver 交接文档`
- 讲什么：围绕“p4pclickserver 交接文档”展开，正文主要说明：p4pclickserver 这个应用承接了两个业务逻辑。 第一个：m站p4p广告点击跳转逻辑。 章节线索包括：拆分思路、[](#3qv3hk)M站P4P点击跳转逻辑。
- 主题：广告投放、数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### p4pclickserver与adclickserver合并

- child_asset_id：`ka-src-0005-child-e7120e053eeef808`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/p4pclickserver与adclickserver合并`
- 讲什么：围绕“p4pclickserver与adclickserver合并”展开，正文主要说明：p4pclickserver域名 adclickserver域名。 章节线索包括：p4pclickserver域名、adclickserver域名、p4pclickserver职责、处理逻辑、迁移方案。
- 主题：数据分析、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 与Alink沟通内容

- child_asset_id：`ka-src-0005-child-15ededca80362177`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/与Alink沟通内容`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 卡券分产品方案设计&对接CRM卡券平台

- child_asset_id：`ka-src-0005-child-24d4c8ce36a37206`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/卡券分产品方案设计&对接CRM卡券平台`
- 讲什么：围绕“卡券分产品方案设计&对接CRM卡券平台”展开，正文主要说明：一、原日终结算抵用卡券流程 p4pdayclick：日终点击表。
- 主题：广告投放、数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 多帐户打通-P4P资金支付其他产品

- child_asset_id：`ka-src-0005-child-e7640232dbc02bf8`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/多帐户打通-P4P资金支付其他产品`
- 讲什么：围绕“多帐户打通-P4P资金支付其他产品”展开，正文主要说明：[](#2owhdu)详细设计 [](#8cq0vb)P4P。 章节线索包括：[](#2owhdu)详细设计、[](#8cq0vb)P4P、[](#ls0ozd) 新增账户（通用退款账户）定义 generalRefund、[](#sql:)sql、[](#客户端：)客户端。
- 主题：数据分析、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 实时结算流程

- child_asset_id：`ka-src-0005-child-608b6ce479ced151`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/实时结算流程`
- 讲什么：围绕“实时结算流程”展开，正文主要说明：[](#spout配置)spout配置 jingwei/metaq。 章节线索包括：主流程、[](#spout配置)spout配置、[](#bolt配置)Bolt配置。
- 主题：广告投放、数据分析、大模型与 Agent、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 实时计算对比

- child_asset_id：`ka-src-0005-child-001ce2c37c7f59fa`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/实时计算对比`
- 讲什么：围绕“实时计算对比”展开，正文主要说明：设置checkpoint statebackend，例如RocksDB。
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告全链路监控

- child_asset_id：`ka-src-0005-child-aaff141ca05bd03e`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/广告全链路监控`
- 讲什么：围绕“广告全链路监控”展开，正文主要说明：目标： 与广告上下游协同，实现广告全链路的指标可视化、异常可监控。 价值： 让监控更直观、可联动，更可以让上下游依赖、贡献、影响等等更易于沉淀和展现，从而赋能业务、开发、发布、运维。
- 主题：广告投放、数据分析、研发与部署、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告消耗影响分析

- child_asset_id：`ka-src-0005-child-3353908c71a0af1d`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/广告消耗影响分析`
- 讲什么：围绕“广告消耗影响分析”展开，正文主要说明：[](#gxerrg)相关因子 广告消耗=网站PV，广告PV，CPC，CTR，COV，ASN，costLimt，过滤比。 章节线索包括：[](#gxerrg)相关因子、[](#ufe5ae)参考算法、[](#799zuy)数据源。
- 主题：广告投放、数据分析、安全与权限
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告点击服务接入说明

- child_asset_id：`ka-src-0005-child-5da126550402c852`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/广告点击服务接入说明`
- 讲什么：围绕“广告点击服务接入说明”展开，正文主要说明：从广告产品的返回数据中获取广告点击URL key:clickUrl 点击域名，国内：cn-click.aliexpress.com，海外：us-click.aliexpress.com。
- 主题：广告投放、数据分析
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告监控治理

- child_asset_id：`ka-src-0005-child-2ea75c69da669610`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/广告监控治理`
- 讲什么：围绕“广告监控治理”展开，正文主要说明：1、现有结算相关监控梳理 [](#2、后续action：)2、后续Action。 章节线索包括：1、现有结算相关监控梳理、[](#2、后续action：)2、后续Action。
- 主题：广告投放、数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告结算平台规划

- child_asset_id：`ka-src-0005-child-353329aebe57f916`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/广告结算平台规划`
- 讲什么：围绕“广告结算平台规划”展开，正文主要说明：由于国际站广告业务的迅速发展，原本单一的推广方式已经无法满足业务发展的需要，随着多种商业化项目的开展，也要求我们结算和账户能快速适应需求的变化，能支持多种产品线，多种结算方式，并能支持未来快速扩展新的结算产品。 高效、稳定、安全的广告结算中心，并与广告业务中心一起协同为业务服务。 章节线索包括：背景、[](#目标)目标、[](#现状评估（8月初-8月中旬）)现状评估（8月初-8月中旬）、[](#业务能力)业务能力、[](#技术能力)技术能力。
- 主题：广告投放、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 广告结算账户支持GGS p4p

- child_asset_id：`ka-src-0005-child-fe5f5fbc729af736`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/广告结算账户支持GGS p4p`
- 讲什么：围绕“广告结算账户支持GGS p4p”展开，正文主要说明：p4prealclick.bidwordpricecny p4prealclick.clickpricecny。 章节线索包括：1、表字段新增、[](#2、增加转换成中间币种（人民币）价格)2、增加转换成中间币种（人民币）价格、[](#3、财务充值相关)3、财务充值相关。
- 主题：广告投放、数据分析、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 数据表规划

- child_asset_id：`ka-src-0005-child-3e750030ae3f2b96`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/数据表规划`
- 讲什么：围绕“数据表规划”展开，正文主要说明：实际点击扣费,用负号表示校正日志 实时展示表，与点击表差异。
- 主题：广告投放、数据分析、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 新增卡券使用

- child_asset_id：`ka-src-0005-child-b0d305d9cdd8f937`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/新增卡券使用`
- 讲什么：围绕“新增卡券使用”展开，正文主要说明：发放、查询卡券消息接口 2 卡券类型 卡券规则定义 3。 章节线索包括：工作量评估、[](#服务接口)服务接口、[](#表结构)表结构。
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 新增钻展账户类型

- child_asset_id：`ka-src-0005-child-a3384f4c6f73059d`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/新增钻展账户类型`
- 讲什么：围绕“新增钻展账户类型”展开，正文主要说明：新增账户定义 starshow com.alibaba.intl.adaccount.biz.constants.SiteEnum。 章节线索包括：新增账户定义 starshow、[](#sql:)sql、[](#客户端：)客户端、[](#增加收入、支出处理器)增加处理器。
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 日终结算完成后通知

- child_asset_id：`ka-src-0005-child-d9a8873ab8772d97`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/日终结算完成后通知`
- 讲什么：围绕“日终结算完成后通知”展开，正文主要说明：Topic:ADSETTLEDEALLOGTOPIC bizType:业务类型 all 为全部（其它：scp4p、aep4p、feedback、topranking）
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 日结报警处理方式

- child_asset_id：`ka-src-0005-child-717fd9ffd6de8270`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/日结报警处理方式`
- 讲什么：围绕“日结报警处理方式”展开，正文主要说明：[](#sc干预页面)sc干预页面 绑定：140.205.173.180 hz-p4p-settle.alibaba-inc.com。 章节线索包括：xflush监控地址、[](#sc干预页面)sc干预页面、[](#ae干预页面)ae干预页面、[](#账户)账户、[](#点击服务器报警)点击服务器报警。
- 主题：数据分析、大模型与 Agent、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 监控智能诊断建设思路

- child_asset_id：`ka-src-0005-child-08e33411fcbf16f0`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/监控智能诊断建设思路`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：国际广告白皮书
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 线下日终运行步骤

- child_asset_id：`ka-src-0005-child-bffd69d0e28541dd`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/线下日终运行步骤`
- 讲什么：围绕“线下日终运行步骤”展开，正文主要说明：1、修改结算拉取反作弊的目录、文件 2、修改结算文件中的日期字段和当天结算文件一致。
- 主题：资金与结算
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 结算产品化设计

- child_asset_id：`ka-src-0005-child-21788f38badc0e81`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/结算产品化设计`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：资金与结算
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 结算压测

- child_asset_id：`ka-src-0005-child-34a58aa9559aa3f9`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/结算压测`
- 讲什么：围绕“结算压测”展开，正文主要说明：点击服务器（直接相关，看机器容量） 风控系统-MTEE（直接相关，需要同时观测机器指标） 章节线索包括：点击服务器压测、涉及的应用、压测方案、观测指标、应急方案。
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 结算增加计划（省心宝升级）

- child_asset_id：`ka-src-0005-child-85ef7683c85f5704`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/结算增加计划（省心宝升级）`
- 讲什么：围绕“结算增加计划（省心宝升级）”展开，正文主要说明：保持与AE一致，没有的字段为空 campaignid\03unitid\03creativeid\03adminmemberseq\03campaigntype \03usertag。 章节线索包括：一、上下游字段约定、[](#5421wf)二、结算改造点。
- 主题：广告投放、数据分析、资金与结算
- 质量/异常：substantive；contains_nul
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 结算常见关注点

- child_asset_id：`ka-src-0005-child-786b8c193fa645ab`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/结算常见关注点`
- 讲什么：围绕“结算常见关注点”展开，正文主要说明：1、日结关注以下输出，证明已经结算完成，正常情况下晚上18点30前是能收到所有的信息 2、日结没有完成并且报杭州结算延迟p4pdaysyncverify不正常，一般是反作弊延迟，咨询德策，如果延迟，确认什么时候跑完。
- 主题：数据分析、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 结算监控项明细

- child_asset_id：`ka-src-0005-child-09acdc8c4d3a706e`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/结算监控项明细`
- 讲什么：围绕“结算监控项明细”展开，正文主要说明：[](#系统监控)系统监控 [](#1、监控维度)1、监控维度。 章节线索包括：一、技术监控、[](#系统监控)系统监控、[](#1、监控维度)1、监控维度、[](#2、节点划分)2、节点划分、[](#3、系统监控项)3、系统监控项。
- 主题：广告投放、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 网红结算账户改造

- child_asset_id：`ka-src-0005-child-6751610dcf9a55e5`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/网红结算账户改造`
- 讲什么：围绕“网红结算账户改造”展开，正文主要说明：[ ] 调整收入、扣款校验规则 [ ] 增加收入、扣款处理器。 章节线索包括：[](#sql:)sql、[](#校验：)校验、[](#客户端：)客户端、[](#收入方法：)收入方法、[](#增加收入、支出处理器)增加收入、支出处理器。
- 主题：数据分析、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 账户结算现状

- child_asset_id：`ka-src-0005-child-dc9a6ebdff9aeca3`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/账户结算现状`
- 讲什么：围绕“账户结算现状”展开，正文主要说明：[](#adaccount)adaccount Language files blank comment code。 章节线索包括：技术现状、[](#代码量)代码量、[](#adaccount)adaccount、[](#p4psetle)p4psetle、[](#p4paesettle)p4paesettle。
- 主题：资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 集团与P4P账户维护关系方案对比

- child_asset_id：`ka-src-0005-child-fd33e4302dfe16fa`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台/集团与P4P账户维护关系方案对比`
- 讲什么：围绕“集团与P4P账户维护关系方案对比”展开，正文主要说明：方案一：集团账户负责记录充值订单与消耗订单的对应关系 1、如上图，新增字段充值订单金额（加粗字段），产生充值记录同时，初始化充值订单余额为充值金额。 章节线索包括：方案一：集团账户负责记录充值订单与消耗订单的对应关系、[](#方案二：p4p账户负责记录充值订单与消耗订单的对应关系)方案二：P4P账户负责记录充值订单与消耗订单的对应关系。
- 主题：数据分析、项目管理、资金与结算、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 结算平台升级pandora-boot

- child_asset_id：`ka-src-0005-child-71116ce0408694e2`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/结算平台升级pandora-boot`
- 讲什么：围绕“结算平台升级pandora-boot”展开，正文主要说明：CommonTaskDispatch-钻展结算【启用】 CommonTaskDispatch-SCP4P数据清理【启用】。
- 主题：数据分析、资金与结算
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

### 营销能力任务

- child_asset_id：`ka-src-0005-child-e7cc4bdcdd8d36f1`
- 相对路径：`raw/ad-whitepaper/国际广告白皮书/营销能力任务`
- 讲什么：围绕“营销能力任务”展开，正文主要说明：SchedulerX2.0任务：p4p-customer-level，执行频率为半小时/次 对应的p4pglobalconfig配置项： levelUpdate，此配置项标识本月是否已经进行过层级变更的操作。
- 主题：国际广告白皮书
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：报告与结算、监控诊断与值守、平台与部署
- 判断理由：属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。
- 可提取：可用于理解广告账户、结算、监控和稳定性的一般问题形态。
- 借鉴边界：不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。
- 审查/发布：`unreviewed_child / not_ready`

## 用户增长与投放摘要（3）

### _搜索索引_仅摘要可见.json

- child_asset_id：`ka-src-0005-child-68d3a2b2d1ddd42a`
- 相对路径：`raw/145201/_搜索索引_仅摘要可见.json`
- 讲什么：这是“_搜索索引_仅摘要可见.json”的结构化索引，共收录 43 条记录；每条主要保存标题、页面标识、相关度、摘要和来源链接，用于发现原文，不能替代原文审查。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`direct_candidate`；建议 `verify_before_use`
- 用途/阶段：`product_design / later`
- 评估优先级：`P1`
- 对应模块：基建与投放执行、数据分析与口径、商品与素材、实验与效果回收
- 判断理由：索引覆盖广告投放平台、RTA/OCPX/DPA、选品、追踪归因和可视化，主题与 KA 投放直接相关，但多数只有摘要。
- 可提取：适合形成待补全文清单，校对投放对象、归因与程序化基建方向。
- 借鉴边界：摘要只作发现入口；找到全文、确认作者版本和当前有效性前，不写入 PRD 或正式知识。
- 审查/发布：`unreviewed_child / not_ready`

### _搜索索引_摘要版

- child_asset_id：`ka-src-0005-child-21dce1c921c22513`
- 相对路径：`raw/145201/_搜索索引_摘要版.md`
- 讲什么：围绕“_搜索索引_摘要版”展开，正文主要说明：用户增长知识库(repo 145201)搜索索引 说明：以下页面在知识库搜索索引中可见摘要。 章节线索包括：用户增长知识库(repo 145201)搜索索引、可视化平台介绍及技术方案、RTA介绍、Ppc 拉新选品优化技术方案、saas追踪归因技术方案选型调研。
- 主题：广告投放、数据分析、大模型与 Agent、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`direct_candidate`；建议 `verify_before_use`
- 用途/阶段：`product_design / later`
- 评估优先级：`P1`
- 对应模块：基建与投放执行、数据分析与口径、商品与素材、实验与效果回收
- 判断理由：索引覆盖广告投放平台、RTA/OCPX/DPA、选品、追踪归因和可视化，主题与 KA 投放直接相关，但多数只有摘要。
- 可提取：适合形成待补全文清单，校对投放对象、归因与程序化基建方向。
- 借鉴边界：摘要只作发现入口；找到全文、确认作者版本和当前有效性前，不写入 PRD 或正式知识。
- 审查/发布：`unreviewed_child / not_ready`

### 新人单权益插卡素材配置字段

- child_asset_id：`ka-src-0005-child-3f37154bc2738027`
- 相对路径：`raw/145201/新人单权益插卡素材配置字段`
- 讲什么：围绕“新人单权益插卡素材配置字段”展开，正文主要说明：20260625-首页插卡下沉与策略触达平台技术方案 1. 支持直塞/点领 2. 直塞弹POP，点领不弹POP。 章节线索包括：项目文档、需求范围、小二后台、素材配置字段、首页未登录单权益-素材字段。
- 主题：广告投放、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容聚焦消费者权益插卡/素材字段，不是当前 KA 信息流投放经营平台的问题域。
- 可提取：没有直接产品借鉴价值。
- 借鉴边界：不因为同属‘素材’字段就映射到快手素材管理。
- 审查/发布：`unreviewed_child / not_ready`

## 资料包导读（1）

### INDEX

- child_asset_id：`ka-src-0005-child-13736b5a52be7f41`
- 相对路径：`INDEX.md`
- 讲什么：围绕“INDEX”展开，正文主要说明：KA 投放经营平台 — 内部文档包导读（v2） 打包时间：2026-08-20 ｜ 由内网 agent 通过 a1 kbase 实际下载。 章节线索包括：KA 投放经营平台 — 内部文档包导读（v2）、目录结构、第一优先级（先读这些）、你们团队的产品方案沉淀（raw/145201/搜索索引摘要版.md）、怎么做产品/项目（raw/project-mgmt/）。
- 主题：实验设计、广告投放、数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：资料包导航只帮助发现文件，不是产品需求或能力证据。
- 可提取：可用于定位原文。
- 借鉴边界：不把打包者推荐语当成我们的产品判断。
- 审查/发布：`unreviewed_child / not_ready`

## 项目管理（57）

### Lazada项目管理Tips.adoc

- child_asset_id：`ka-src-0005-child-9f17d288f1db0712`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/Lazada项目管理Tips.adoc`
- 讲什么：仅含很短的占位或提示文字：原语雀文档链接： 
---
- 主题：项目管理
- 质量/异常：stub
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：正文只有占位、链接或极短片段，证据不足。
- 可提取：最多作为回源线索。
- 借鉴边界：不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-fb33cee7d3653018`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### Lazada测试规范V1.0.adoc

- child_asset_id：`ka-src-0005-child-a4d8b963efe22e7c`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/Lazada测试规范V1.0.adoc`
- 讲什么：围绕“Lazada测试规范V1.0.adoc”展开，正文主要说明：1，Lazada需求生命周期介绍 1.1 通用需求生命周期介绍。 章节线索包括：1，Lazada需求生命周期介绍、1.1 通用需求生命周期介绍、1.2 Lazada App版本发布流程介绍、2，需求评审【需求评审checklist】、3，技术方案评审【技术方案评审checklist】。
- 主题：实验设计、数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### SIT标准流程.adoc

- child_asset_id：`ka-src-0005-child-e2991d61b00121bd`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/SIT标准流程.adoc`
- 讲什么：围绕“SIT标准流程.adoc”展开，正文主要说明：SIT是系统集成测试（System Integrate Test）的简称，即当一个大项目在所有业务侧内部测试通过之后，拉通上下游进行全链路测试。 与标准的业务测试不同，SIT更多关注业务全链路每个节点的重要细节，比如入口的透出、标记展示、Icon、入口文案等，以及上下游之间的调度和跳转关系，比如从上游入口进入落地页再到下单流程的一步步跳转以及参数传递是否正确。 章节线索包括：一、SIT标准流程简介、二、项目SIT前期准备、1、测试数据和测试环境、2、项目排期、3、各业务产研测责任人。
- 主题：实验设计、数据分析、研发与部署、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### UAT流程标准.adoc

- child_asset_id：`ka-src-0005-child-2a6dd410e779b8a6`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/UAT流程标准.adoc`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### index

- child_asset_id：`ka-src-0005-child-093c36da80f25687`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `restore_source_then_assess`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 发布SOP.adoc

- child_asset_id：`ka-src-0005-child-9c3cf9a2a64f9985`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/发布SOP.adoc`
- 讲什么：围绕“发布SOP.adoc”展开，正文主要说明：直接走正式流程将代码合并发布到预发 改为全部变更，在发布文档的中，找出所有的要发布的分支填上、查询并勾选。 章节线索包括：合并及Review代码、直接走正式流程将代码合并发布到预发、改为全部变更，在发布文档的中，找出所有的要发布的分支填上、查询并勾选、全部成功勾选后点击提交发布、逐个点击进入变更检查变更创建时间及关联需求创建时间是否符合预期。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 回滚SOP - 交易.adoc

- child_asset_id：`ka-src-0005-child-9707c1510e2a6dfb`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/回滚SOP - 交易.adoc`
- 讲什么：围绕“回滚SOP - 交易.adoc”展开，正文主要说明：其仅仅会回退未发布完成的机器分组 ，其余的机器分组请按照下面的《已完成发布的机器分组回滚》进行 选择靠上的回退，其对所有机器分组进行操作。 章节线索包括：发布中的机器分组回滚、已完成发布的机器分组回滚、进入回滚页面、选择回滚环境，清注意 云原生生产环境 以及 云原生安全生产环境 都要分别操作回滚、勾选所有要回滚的分组。
- 主题：研发与部署、安全与权限、前端体验
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 软件研发跨域联调指引.adoc

- child_asset_id：`ka-src-0005-child-6f6c7c720bed0780`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/软件研发跨域联调指引.adoc`
- 讲什么：围绕“软件研发跨域联调指引.adoc”展开，正文主要说明：在电商类软件研发中，跨域（如前后端、多服务间、第三方系统对接等）联调是保障系统功能完整、数据交互顺畅的关键环节。 为提升联调效率、降低沟通成本，特制定本指引规范，明确各角色职责、合作方式、流程及风险应对机制。
- 主题：数据分析、研发与部署、安全与权限、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目风险管理 SOP.adoc

- child_asset_id：`ka-src-0005-child-d73709f1044f906f`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/执行&监控/项目风险管理 SOP.adoc`
- 讲什么：围绕“项目风险管理 SOP.adoc”展开，正文主要说明：对于风险管理流程（识别/评估/应对/上升）有兴趣的同学，请关注Section 2 对于只需要风险管理模版的同学，请关注Section 3。 章节线索包括：定义和目标、1.1 定义、1.2 目标、风险管理流程、2.1 识别风险。
- 主题：数据分析、安全与权限、项目管理、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-a84a09ca34a8ee8b`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/收尾/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 线上复盘操作手册 AiOne Postmortem Q&A.adoc

- child_asset_id：`ka-src-0005-child-c30b88c227a3ef9d`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/收尾/线上复盘操作手册 AiOne Postmortem Q&A.adoc`
- 讲什么：围绕“线上复盘操作手册 AiOne Postmortem Q&A.adoc”展开，正文主要说明：【项目复盘】模块入口/Entrance 先约定几个页面名称的常用叫法 Frequently used pages。 章节线索包括：先约定几个页面名称的常用叫法 Frequently used pages、如何在【项目复盘】快速查找待复盘的项目？How to quickly find the project list pending postmortem?、入口1：详情列表页 Entrance 1: the page of Postmortem project list、入口2：复盘趋势页 Entrance 2: Trends/Dashboard Page、编辑复盘信息的操作入口 Entrance for edit postmortem details。
- 主题：数据分析、研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目复盘SOP.adoc

- child_asset_id：`ka-src-0005-child-722e114fd5d05ffe`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/收尾/项目复盘SOP.adoc`
- 讲什么：围绕“项目复盘SOP.adoc”展开，正文主要说明：项目复盘是检验资源是否有效利用、项目目标是否有效达成、确定后续怎么优化的重要一环。 复盘是一个开放性的活动，对事不对人，不是要刻意去追责或表功，而是提供一个团队一起交流和反思的场合，力求把好的可复制的经验、不好的避免再次踩坑的教训沉淀下来价值化，给予团队和个人长期成长。 章节线索包括：1.背景、复盘分类、2.1 项目复盘、2.1.1 轻量化复盘、2.2.2 深度复盘。
- 主题：数据分析、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目结项SOP.adoc

- child_asset_id：`ka-src-0005-child-62d6bb28a586f8cc`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/收尾/项目结项SOP.adoc`
- 讲什么：围绕“项目结项SOP.adoc”展开，正文主要说明：在Lazada推动项目效能管理和提升的背景下，需要建立从立项到结项的项目管理闭环，结项作为项目管理的闭环节点，需要有始有终的对项目进行总结。 项目发布上线 、 并且完成项目复盘和记录 ，则视为项目已完结、可以进行结项操作。 章节线索包括：1.背景、2.结项定义、3.结项流程、3.1.Project list 结项、3.2.Aone 结项。
- 主题：研发与部署、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-abbf21ee5265806f`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/立项/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 项目命名规则.adoc

- child_asset_id：`ka-src-0005-child-6b478ddbbd013cb7`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/立项/项目命名规则.adoc`
- 讲什么：围绕“项目命名规则.adoc”展开，正文主要说明：为了便于Lazada的项目管理、资源统筹及跨团队协作，以下是针对Lazada软件研发项目的名称的方案介绍，结合年季、业务域、优先级进行结构化设计 财年\+优先级 \+项目集名称。 章节线索包括：项目命名规则。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目立项SOP.adoc

- child_asset_id：`ka-src-0005-child-5662cd36d9f5dac8`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/立项/项目立项SOP.adoc`
- 讲什么：围绕“项目立项SOP.adoc”展开，正文主要说明：在Lazada推动项目效能管理和提升的背景下，需要对Lazada的项目立项过程进行标准化和线上化管理，进而通过AiONE平台进行项目效能数据的呈现和追踪，以数据驱动改进。 项目定义：项目是为创造独特的产品、服务或成果而进行的临时性工作，其中电商项目具有涉及角色多、复杂性、动态性、高风险等特点。 章节线索包括：1.背景、2.项目准入规则、3.立项关键字段&模板、4.立项创建入口及操作、5.审批流程。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 规划

- child_asset_id：`ka-src-0005-child-d3cdaf3f2a4bc4af`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理SOP/规划`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### index

- child_asset_id：`ka-src-0005-child-8b17ababdb796faa`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### BRD文档汇总.adoc

- child_asset_id：`ka-src-0005-child-43005e1a7a3f5c94`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/业务文档/BRD文档汇总.adoc`
- 讲什么：围绕“BRD文档汇总.adoc”展开，正文主要说明：； 需求点 ； BRD ；
；--------------------------------------------------；--------------------------------------------；
； ； ；
； ； ；
； ； ；
； ； ；
。
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-f185b5b2bf911bef`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/业务文档/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 【参考模板】业务方案BRD.adoc

- child_asset_id：`ka-src-0005-child-e572d016c4df32ed`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/业务文档/【参考模板】业务方案BRD.adoc`
- 讲什么：围绕“【参考模板】业务方案BRD.adoc”展开，正文主要说明：补充xxxx部分的相关逻辑 从 “背景现状、问题痛点、影响范围” 三个方面，描述业务整体背景、痛点对业务目标的影响，明确受影响的范围、角色、体量等。 章节线索包括：一、项目背景 \、二、目标/价值 \、三、业务方案 \、3.1 业务方案详情、3.2 业务需求列表。
- 主题：实验设计、数据分析、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### PRD文档汇总.adoc

- child_asset_id：`ka-src-0005-child-56cb085caab244cf`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/产品文档/PRD文档汇总.adoc`
- 讲什么：围绕“PRD文档汇总.adoc”展开，正文主要说明：为了保持PRD总体的资产沉淀，针对项目来说，请将原始PRD存放至。
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-936e8ab036230ac2`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/产品文档/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 产品方案PRD.adoc

- child_asset_id：`ka-src-0005-child-1a7cb60d2dc0dfe6`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/产品文档/产品方案PRD.adoc`
- 讲什么：围绕“产品方案PRD.adoc”展开，正文主要说明：按照需求大小做不同建议，2个模版均包含PRD必要模块以及对应案例描述 按照Logistics域特点改动小部分。
- 主题：实验设计、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-183579ecc716034e`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/技术文档/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 【参考模板】技术方案.adoc

- child_asset_id：`ka-src-0005-child-073d0c6f4f33bc7b`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/技术文档/【参考模板】技术方案.adoc`
- 讲什么：围绕“【参考模板】技术方案.adoc”展开，正文主要说明：补充xxxx部分的相关逻辑 描述目标用户画像、用户问题与现状总结、给目标客户带来什么价值、用户场景、与竞对&同类产品的差异化价值、趋势分析等。 章节线索包括：一、项目背景和目标 \、1.1 需求背景、1.2 目标/价值、二、整体技术方案 \、三、技术风险分析 \。
- 主题：数据分析、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 发布计划.adoc

- child_asset_id：`ka-src-0005-child-0a8ba95a05da1c75`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/技术文档/发布计划.adoc`
- 讲什么：围绕“发布计划.adoc”展开，正文主要说明：1\. 发布准备：确认测试报告、回滚方案（如版本回退、数据备份），协调运维、运营团队，获取发布审批。 2\. 正式发布与监控：按计划部署版本到生产环境，实时监控系统性能（响应时间、报错率）、核心业务链路（下单转化率、支付成功率），出现问题立即触发回滚。
- 主题：数据分析、研发与部署、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 技术方案文档汇总.adoc

- child_asset_id：`ka-src-0005-child-411355f3088c87ce`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/技术文档/技术方案文档汇总.adoc`
- 讲什么：围绕“技术方案文档汇总.adoc”展开，正文主要说明：； 需求点 ； 技术方案 ；
；--------------------------------------------------；-----------------------------------------------------；
； ； ；
； ； ；
； ； ；
； ； ；
。
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 提测.adoc

- child_asset_id：`ka-src-0005-child-7873e5cf0ed96c94`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/技术文档/提测.adoc`
- 讲什么：围绕“提测.adoc”展开，正文主要说明：提测流程简述：提测流程核心是研发完成功能开发/自测/联调（如有）后，提交测试申请，由测试团队验证功能、性能及兼容性，最终输出测试结果并推动问题修复，具体步骤如下 1\. 研发自测阶段：研发人员完成代码开发后，先进行单元测试、接口测试，验证功能是否符合需求文档（PRD），并修复自身发现的bug。
- 主题：数据分析、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-1b9388e6c2fd674e`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/测试文档/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 【参考模板】测试方案.adoc

- child_asset_id：`ka-src-0005-child-3dc8a1494040c4e4`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/测试文档/【参考模板】测试方案.adoc`
- 讲什么：围绕“【参考模板】测试方案.adoc”展开，正文主要说明：补充xxxx部分的相关逻辑 2.3 稳定性测试(含压测) 章节线索包括：一、整体保障思路、二、线下保障、2.1 功能测试、2.2 性能测试、2.3 稳定性测试(含压测)。
- 主题：安全与权限、资金与结算
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### 功能测试.adoc

- child_asset_id：`ka-src-0005-child-d1175ea115863b76`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/测试文档/功能测试.adoc`
- 讲什么：围绕“功能测试.adoc”展开，正文主要说明：功能测试流程简述：测试团队按PRD内容，依据测试用例，开展多维度测试。 功能测试：按PRD内容，根据测试用例，验证核心流程（如商品上架、下单、支付、退款等）是否正常。
- 主题：研发与部署、安全与权限、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### 测试方案文档汇总.adoc

- child_asset_id：`ka-src-0005-child-2b7972ad50e216d4`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/测试文档/测试方案文档汇总.adoc`
- 讲什么：围绕“测试方案文档汇总.adoc”展开，正文主要说明：； 需求点 ； 测试方案 ；
；--------------------------------------------------；-----------------------------------------------------；
； ； ；
； ； ；
； ； ；
； ； ；
。
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`not_relevant`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。
- 可提取：没有产品借鉴价值。
- 借鉴边界：保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-d2ea1aa263739b96`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### index

- child_asset_id：`ka-src-0005-child-5a4c72663cf15861`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目会议&报告/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 【参考模版】项目例会材料&纪要.adoc

- child_asset_id：`ka-src-0005-child-f1c04226c7a1836c`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目会议&报告/【参考模版】项目例会材料&纪要.adoc`
- 讲什么：围绕“【参考模版】项目例会材料&纪要.adoc”展开，正文主要说明：项目PM在固定时间（单周/双周/月）组织项目例会，邀请核心项目组成员（核心业务、产品、技术方）参加 例会的目的是为了拉齐目标达成情况、回顾项目计划、进展同步、风险同步，明确关键决策、近期待办任务安排。 章节线索包括：一、参会信息、二、会议议题 \、2.1 上周待办review、2.2 项目目标及核心指标数据概览、2.3 项目进展及风险同步。
- 主题：数据分析、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目报告产出.adoc

- child_asset_id：`ka-src-0005-child-e5283f5529efe343`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目会议&报告/项目报告产出.adoc`
- 讲什么：围绕“项目报告产出.adoc”展开，正文主要说明：最细 需求/任务进度 问题和Action 风险统计和监控 中等 项目进展 风险汇总 下周计划。
- 主题：项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目复盘结项.adoc

- child_asset_id：`ka-src-0005-child-48aba1fa7bb42747`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目复盘结项.adoc`
- 讲什么：围绕“项目复盘结项.adoc”展开，正文主要说明：完整版项目复盘模板，包含应复盘回顾的所有重要项目要素和环节，建议中大型、复杂项目采用 简化版项目复盘模板，建议小型、简单项目采用。 章节线索包括：可供选用的模板、裁剪说明。
- 主题：项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目章程.adoc

- child_asset_id：`ka-src-0005-child-94142329b34382cd`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目章程.adoc`
- 讲什么：围绕“项目章程.adoc”展开，正文主要说明：简要概述项目立项原因，需要解决的问题、痛点，发起人是谁等等 结构化罗列定性或者定量的目标。 章节线索包括：1.项目背景 ​、2.项目目标、3.项目变更记录、4.业务策略概述、5.产品方案概述。
- 主题：数据分析、研发与部署、安全与权限、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-9081fedc922a844f`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目计划/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 功能验收（UAT）.adoc

- child_asset_id：`ka-src-0005-child-0b8be41f9c4e0950`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目计划/功能验收（UAT）.adoc`
- 讲什么：围绕“功能验收（UAT）.adoc”展开，正文主要说明：UAT（用户验收测试）是电商软件研发上线前的关键环节，指由需求方（产品、运营等）验证软件是否符合业务需求、能否支撑实际使用的测试活动。 产研类UAT：聚焦技术产品相关的功能验证，核心是确认软件功能是否匹配产品需求文档（PRD）、技术设计要求，确保功能可用性、数据准确性及系统稳定性。
- 主题：数据分析、项目管理
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 灰度／放量计划.adoc

- child_asset_id：`ka-src-0005-child-5415f090c7085588`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目计划/灰度／放量计划.adoc`
- 讲什么：围绕“灰度／放量计划.adoc”展开，正文主要说明：1\. 灰度目标与范围定义：明确灰度目的（如验证新功能稳定性、收集用户反馈），确定放量维度（用户量级：如1%→5%→20% 用户类型：如新用户/老用户、特定地域用户）。
- 主题：实验设计、数据分析、研发与部署、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目变更／待办／风险模版.adoc

- child_asset_id：`ka-src-0005-child-d809f28e7d33df25`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目计划/项目变更／待办／风险模版.adoc`
- 讲什么：围绕“项目变更／待办／风险模版.adoc”展开，正文主要说明：； 适用场景 ； 模板链接 ；
；-----------------------------------------------------；-----------------------------------------------------；
； 项目待办清单 ； [我的附件] ；
； 项目风险清单 ； [我的附件] ；
； 项目变更清单 ； [我的附件]
- 主题：项目管理
- 质量/异常：short
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 项目计划-Tracker.adoc

- child_asset_id：`ka-src-0005-child-d110edb20821d1d3`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理模版库/项目管理/项目计划/项目计划-Tracker.adoc`
- 讲什么：围绕“项目计划-Tracker.adoc”展开，正文主要说明：钉钉画板样式的里程碑-样式1 钉钉画板样式的里程碑-样式2。 章节线索包括：结果型项目、典型项目。
- 主题：数据分析、项目管理、前端体验
- 质量/异常：substantive
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### Lazada项目管理分享.adoc

- child_asset_id：`ka-src-0005-child-c9994f6926e0788c`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/Lazada项目管理分享.adoc`
- 讲什么：围绕“Lazada项目管理分享.adoc”展开，正文主要说明：Lazada项目管理基本流程和规范 1\. 项目管理系列分享的背景和目的 2\. 项目管理系列分享的内容一览 3\. 什么是项目 4\. 项目、需求和迭代的关系 5\. 项目是如何产生的?
- 主题：大模型与 Agent、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### index

- child_asset_id：`ka-src-0005-child-ca621ec6e3de25d5`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/index.md`
- 讲什么：空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。
- 主题：项目管理
- 质量/异常：empty；duplicate_content_group_member、exact_duplicate
- 对 KA 产品的价值：`cannot_assess`；建议 `exclude_from_product`
- 用途/阶段：`none / none`
- 评估优先级：`none`
- 对应模块：无
- 判断理由：文件没有可用正文，不能因为标题像相关主题就推断有价值。
- 可提取：当前没有可提取的产品依据。
- 借鉴边界：补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。
- 审查/发布：`unreviewed_child / not_ready`
- 完全重复于：`ka-src-0005-child-b69a9f70ab65540e`

### 第一讲：项目管理基本流程和规范.adoc

- child_asset_id：`ka-src-0005-child-cad0ea21e885bc97`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第一讲：项目管理基本流程和规范.adoc`
- 讲什么：围绕“第一讲：项目管理基本流程和规范.adoc”展开，正文主要说明：01 项目管理系列分享的背景和目的 在Lazada的产研项目中，技术PM/产品PM/测试PM扮演了不可或缺的角色，在大量项目的执行阶段，基本都依靠各PM来负责具体的项目管理工作。 章节线索包括：01 项目管理系列分享的背景和目的、02 什么是项目和项目管理、03 项目、需求和迭代的关系、04 项目是如何产生的、05 项目列表管理。
- 主题：数据分析、研发与部署、项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第一讲：项目管理基本流程和规范

- child_asset_id：`ka-src-0005-child-406945ab29967eba`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第一讲：项目管理基本流程和规范.pdf`
- 讲什么：围绕“第一讲：项目管理基本流程和规范”展开，正文主要说明：Lazada项目管理【流程、方法、实践】 系列分享 第1场:Lazada项目管理基本流程和规范。
- 主题：数据分析、大模型与 Agent、研发与部署、项目管理、资金与结算
- 质量/异常：substantive；pdf_extension_but_plain_text
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第三讲：项目进度管理.adoc

- child_asset_id：`ka-src-0005-child-5168da639e43020d`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第三讲：项目进度管理.adoc`
- 讲什么：围绕“第三讲：项目进度管理.adoc”展开，正文主要说明：在Lazada怎么做进度管理 作为项目PIC或成员怎么才能知道项目目前整体的情况？ 章节线索包括：目录、为什么要做进度管理、常见问题、什么是进度管理、Lazada怎么做进度管理。
- 主题：实验设计、数据分析、项目管理、资金与结算、前端体验
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第三讲：项目进度管理

- child_asset_id：`ka-src-0005-child-e6bdb98e65489844`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第三讲：项目进度管理.pdf`
- 讲什么：围绕“第三讲：项目进度管理”展开，正文主要说明：Lazada项目管理–进度管理 LazadaPMO，01/22/2026。
- 主题：实验设计、数据分析、研发与部署、项目管理、资金与结算
- 质量/异常：substantive；pdf_extension_but_plain_text
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第二讲：从项目到需求的拆解方法.adoc

- child_asset_id：`ka-src-0005-child-3de6df19425af17f`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第二讲：从项目到需求的拆解方法.adoc`
- 讲什么：围绕“第二讲：从项目到需求的拆解方法.adoc”展开，正文主要说明：什么是WBS： Work Breakdown Structure/工作分解结构，是将项目可交付成果和项目工作分解成较小的、更易于管理的组成部分的层次结构。 项目到产研任务的四层拆解模型。 章节线索包括：产研项目的WBS框架、项目到产研任务的四层拆解模型、项目怎么拆解到子项目(策略层)、子项目怎么拆解到父需求(产品层)、父需求怎么拆解到子需求(战术层)。
- 主题：广告投放、数据分析、大模型与 Agent、研发与部署、安全与权限
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第二讲：从项目到需求的拆解方法

- child_asset_id：`ka-src-0005-child-0570a969574bf142`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第二讲：从项目到需求的拆解方法.pdf`
- 讲什么：围绕“第二讲：从项目到需求的拆解方法”展开，正文主要说明：Lazada项目管理【流程、方法、实践】 系列分享 第2场:从项目到需求的拆解方法。
- 主题：实验设计、广告投放、数据分析、大模型与 Agent、研发与部署
- 质量/异常：substantive；pdf_extension_but_plain_text
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第五讲：项目风险管理.adoc

- child_asset_id：`ka-src-0005-child-476b32eb668b0493`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第五讲：项目风险管理.adoc`
- 讲什么：围绕“第五讲：项目风险管理.adoc”展开，正文主要说明：风险：可能影响项目目标实现的不确定性事件或条件 风险管理：提前预判\+主动应对 → 降低负面影响/增强机会点。 章节线索包括：目录、什么是风险、什么是风险管理、怎么做风险管理、规划风险管理 -识别风险-分析风险-应对风险-监控风险。
- 主题：项目管理
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第五讲：项目风险管理

- child_asset_id：`ka-src-0005-child-38be39aa688be5ce`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第五讲：项目风险管理.pdf`
- 讲什么：围绕“第五讲：项目风险管理”展开，正文主要说明：Lazada项目管理–风险管理 LazadaPMO, 2026.03。
- 主题：数据分析、项目管理
- 质量/异常：substantive；pdf_extension_but_plain_text
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第四讲：项目沟通管理.adoc

- child_asset_id：`ka-src-0005-child-9c23230711274975`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第四讲：项目沟通管理.adoc`
- 讲什么：围绕“第四讲：项目沟通管理.adoc”展开，正文主要说明：项目沟通管理的重要性与挑战 沟通规划：设计项目沟通计划。 章节线索包括：目录、培训目的、1.项目沟通管理的重要性与挑战 - 为什么需要“刻意”管理沟通？ (The "Why")、1.1项目沟通管理的重要性与挑战 - 各阶段的常见沟通问题、1.2项目沟通管理的重要性与挑战 - 沟通是项目经理的“第一要务”。
- 主题：数据分析、研发与部署、安全与权限、项目管理、资金与结算
- 质量/异常：substantive；credential_sanitized
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`

### 第四讲：项目沟通管理

- child_asset_id：`ka-src-0005-child-90855ee5838a808b`
- 相对路径：`raw/project-mgmt/6. Project Mgmt - PUBLIC/项目管理赋能分享/第四讲：项目沟通管理.pdf`
- 讲什么：围绕“第四讲：项目沟通管理”展开，正文主要说明：Lazada项目沟通管理 LazadaPMO，02/05/2026。
- 主题：数据分析、研发与部署、安全与权限、项目管理、资金与结算
- 质量/异常：substantive；pdf_extension_but_plain_text
- 对 KA 产品的价值：`background_only`；建议 `reference_only`
- 用途/阶段：`research_reference / research_only`
- 评估优先级：`none`
- 对应模块：项目交付方法
- 判断理由：内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。
- 可提取：可改善团队实施、评审和复盘方法。
- 借鉴边界：只用于项目工作方法，不因方法论内容修改产品功能或业务口径。
- 审查/发布：`unreviewed_child / not_ready`
