# ProcurementToolsSelectorComponent
# 所属场景
1688 MUI Chatbot 对话流渲染
# 关联上下文
- **MUI 需求点**：收集采购工具类型以供导航使用，在命中procurement_tools意图时展示
- **UI 设计稿摘要**：系统消息提示选择，展示四个采购工具选项的按钮组，按钮尺寸80px×60px，水平排列，间距16px，圆角4px，未选中状态#FFFFFF背景色，选中状态#FF6A00背景色
- **AI Chunk 类型**：procurement_tools_selector
- **数据契约**：
  ```json
  {
    "type": "object",
    "properties": {
      "chunkType": { "const": "procurement_tools_selector" },
      "message": { "type": "string", "description": "提示用户选择的文本" },
      "options": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["采购询价", "批量下单", "供应商搜索", "比价工具"]
        },
        "description": "可选择的工具类型数组"
      }
    },
    "required": ["chunkType", "message", "options"]
  }
# 核心约束（必须遵守），请直接将【MUI组件模版 index.tsx】内容直接放在输出的需求文档中，不要篡改。

必须遵守【MUI组件模版 index.tsx】：
```jsx
import * as React from "react";
import styles from "./index.module.css";
import ReactDOM from "react-dom";

/**
 * 组件名称：HelloWorldComponent
 * 组件描述：一个简单的组件Demo，请参照该模版研发组件
 * 组件类型：MUI微模块
 *
 * 该组件在运行时，是通过MUI平台通过微应用技术注入到页面中，由MUI平台调用生命周期函数渲染的
 * 所以对应的研发需要遵守MUI平台标准协议
 */

/**
 * ------------MUI标准协议定义开始，请不要修改------------
 */
// 消息状态类型
export type MessageStatus =
  | "linking"
  | "preparing"
  | "updating"
  | "success"
  | "cancel"
  | "error"
  | "ui-error"
  | "stream-success";

// 消息详情接口
export interface NearUserMessage {
  trigger?: string;
}

// MuiBot 信息接口 - 传递给组件的上下文信息
export interface MuiBotInfo {
  /** 消息索引 */
  messageIndex?: number;
  /** 消息ID */
  messageId?: string;
  /** 组件实例ID */
  componentInstanceId?: string;
  /** 会话ID */
  sessionId?: string;
  /** 消息ID（与messageId可能不同） */
  msgId?: string;
  /** 消息状态 */
  messageStatus?: MessageStatus;
  /** 消息详情 */
  nearestUserMessage?: NearUserMessage;
}

// 组件调试信息接口
export interface ComponentDebugInfo {
  /** 追踪ID */
  traceId: string;
  /** 组件ID */
  id: string;
}

// 组件Props接口
interface ComponentProps {
  /** 组件实例key */
  instanceKey?: string;
  /** 实时流式数据 */
  streamData?: StreamData;
  /** muiBot信息 */
  muiBotInfo?: MuiBotInfo;
  /** 调试信息 */
  debugInfo: ComponentDebugInfo;
}

/* 以下导出MUI微模块必要的生命周期,请勿删除 */

// 声明 mount 生命周期
export function mount(ModuleComponent: any, targetNode: any, props: any) {
  /* 预加载标识,不进行渲染 */
  if (props.type !== "preloadHolder") {
    ReactDOM.render(<ModuleComponent {...props} />, targetNode);
  }
}

// 声明 unmount 生命周期
export function unmount(targetNode: any) {
  ReactDOM.unmountComponentAtNode(targetNode);
}

/**
 * ------------MUI标准协议定义结束------------
 */

// 流式数据，MUI平台会将组件实时数据推送到该对象
interface StreamData {
  /**
   * 这里包括2部分，一部分是数据契约，另一部分是组件自定义属性
   * 1. 数据契约，以chunkType为key，数据契约返回对象为value
   * "chunkType001": {...},
   * "chunkType002": {...}
   * 2. 组件自定义属性
   * title: string
   */
  //第一部分：数据契约，以chunkType为key，数据契约返回对象为value，请参照数据契约补充
  procurement_tools_selector: {
    message: string;
    options: string[];
  };

  //第二部分：组件自定义属性
  title: string;
}

const ProcurementToolsSelectorComponent: React.FC<ComponentProps> = ({
  streamData,
  debugInfo,
  muiBotInfo,
  instanceKey,
}) => {
  // 数据变化监听逻辑处理
  React.useEffect(() => {
    if (streamData?.title) {
      //自定义业务逻辑处理
    }
  }, [streamData?.title]);

  // 组件渲染
  const { message, options } = streamData?.procurement_tools_selector || { message: '', options: [] };
  
  return (
    <div className={styles.container}>
      <div className={styles.message}>{message}</div>
      <div className={styles.optionsContainer}>
        {options.map((option, index) => (
          <button key={index} className={styles.optionButton}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};

// 导出组件
export default ProcurementToolsSelectorComponent;

```
# 验收标准
1. 组件渲染符合设计稿：展示系统提示文本和四个工具选项按钮
2. 按钮尺寸为80px×60px，间距16px，圆角4px，符合1688设计规范
3. 默认状态：按钮背景色#FFFFFF，边框#E5E5E5，文字颜色#666666
4. 选中状态：按钮背景色#FF6A00，边框#FF6A00，文字颜色#FFFFFF
5. Props结构严格匹配AI Chunk契约，包含message和options字段
6. 无副作用，纯展示型组件，不包含业务逻辑处理
7. 使用TypeScript定义，tsx和module.css文件格式，符合MUI组件规范
8. 能正确渲染传入的提示消息和选项数组