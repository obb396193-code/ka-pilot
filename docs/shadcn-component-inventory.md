# shadcn/ui 组件清单（供前端开发查找）

> 2026-08-19 建档。做任何页面/功能前**先来这里找**，有现成的直接用，别自己写。

## 基础组件（Base Components）- 共 67 个

### 布局 & 容器
- **card** - 卡片容器
- **separator** - 分隔线
- **aspect-ratio** - 宽高比容器
- **scroll-area** - 滚动区域
- **resizable** - 可调整大小面板
- **sheet** - 侧边抽屉
- **dialog** - 对话框/模态框
- **drawer** - 抽屉（移动端友好）
- **sidebar** - 侧边栏（我们正在用的）

### 导航
- **breadcrumb** - 面包屑导航
- **navigation-menu** - 顶部导航菜单
- **menubar** - 菜单栏
- **tabs** - 标签页
- **pagination** - 分页器
- **command** - 命令面板（⌘K）

### 数据展示
- **table** - 基础表格
- **data-table** - 数据表格（带排序/筛选）
- **chart** - 图表组件（基于 Recharts）
- **avatar** - 头像
- **badge** - 徽章/标签
- **skeleton** - 骨架屏
- **progress** - 进度条
- **spinner** - 加载动画
- **empty** - 空状态
- **typography** - 排版组件

### 表单 & 输入
- **input** - 文本输入框
- **input-group** - 输入框组（带前缀/后缀）
- **input-otp** - OTP 验证码输入
- **textarea** - 多行文本
- **select** - 下拉选择
- **native-select** - 原生下拉
- **combobox** - 组合框（可搜索下拉）
- **checkbox** - 复选框
- **radio-group** - 单选组
- **switch** - 开关
- **slider** - 滑块
- **date-picker** - 日期选择器
- **calendar** - 日历
- **field** - 表单字段容器
- **label** - 标签
- **button** - 按钮
- **button-group** - 按钮组

### 反馈 & 提示
- **alert** - 警告/提示框
- **alert-dialog** - 确认对话框
- **toast** - 轻提示
- **message** - 消息提示
- **message-scroller** - 消息滚动器
- **tooltip** - 工具提示
- **popover** - 气泡卡片
- **hover-card** - 悬停卡片

### 交互 & 动作
- **dropdown-menu** - 下拉菜单
- **context-menu** - 右键菜单
- **accordion** - 折叠面板
- **collapsible** - 可折叠区域
- **toggle** - 切换按钮
- **toggle-group** - 切换按钮组
- **carousel** - 轮播图

### 其他工具组件
- **attachment** - 附件/文件上传
- **bubble** - 气泡（聊天界面用）
- **kbd** - 键盘按键显示
- **marker** - 标记/高亮
- **direction** - 方向控制
- **item** - 列表项
- **questionnaire** - 问卷调查

### ARIA 无障碍组件
- **aria/accordion** - 无障碍折叠面板

---

## Blocks（整页模板）- 3 个

- **dashboard-01** ✅ - 我们正在用的仪表盘模板
- **login** - 登录页
- **signup** - 注册页
- **sidebar** - 侧边栏布局模板

---

## 对应业务场景的组件选型建议

### 「工作台」页面可能需要：
- ✅ sidebar（已用）
- ✅ card + chart（已用）
- data-table（数据列表）
- badge（状态标签）
- button-group（操作按钮组）
- empty（空状态）
- tabs（视图切换）

### 「投放任务」页面可能需要：
- data-table（任务列表）
- dialog / sheet（任务详情抽屉）
- select / date-picker（筛选器）
- progress（任务进度）
- badge（任务状态）
- dropdown-menu（批量操作）

### 「数据分析」页面可能需要：
- chart（各种图表，shadcn 基于 Recharts）
- tabs（不同分析视角）
- date-picker（时间范围选择）
- select（维度选择）
- card（指标卡片）

### 「账户资源」页面可能需要：
- data-table（账户列表）
- avatar（账户头像）
- switch（启用/禁用）
- badge（账户状态）
- context-menu（右键操作）

### 「自动化」页面可能需要：
- accordion（规则折叠）
- switch（开关规则）
- combobox（条件选择）
- alert（规则提示）

### 「商品素材」页面可能需要：
- carousel（素材轮播）
- aspect-ratio（素材预览）
- attachment（文件上传）
- data-table（素材列表）

### 「报告」页面可能需要：
- chart（报表图表）
- table（报表数据）
- button-group（导出/分享）
- date-picker（报告周期）

### 「知识库」页面可能需要：
- accordion / collapsible（文档树）
- breadcrumb（文档路径）
- typography（文档排版）
- tabs（文档分类）

### 「集成与通知」页面可能需要：
- switch（集成开关）
- message / toast（通知提示）
- badge（未读数）
- dropdown-menu（通知操作）

---

## 重要提醒

1. **做页面前先来这里查**：有 shadcn 现成的就直接用，别自己写
2. **安装命令**：`npx shadcn@latest add <component-name>`
3. **Chart 组件**：shadcn 的 chart 基于 Recharts，但任务要求用 **ECharts**，所以图表部分后续单独处理
4. **配色和视觉调整**：现在不做，等原型图拍板后统一改
5. **参考案例**：蝉妈妈等竞品的设计，等视觉定稿阶段再去看怎么融合
