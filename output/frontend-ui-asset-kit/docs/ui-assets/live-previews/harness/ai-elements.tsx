import { createRoot } from "react-dom/client";
import { useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/official/ai/conversation";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/official/ai/sources";

function Demo() {
  const [messages, setMessages] = useState([
    { role: "user", text: "把今天消耗异常的计划找出来。" },
    { role: "agent", text: "已定位 3 个计划，先按影响排序，并保留数据来源。" },
  ]);

  return (
    <main className="preview-shell" data-preview-source="ai-elements">
      <header className="preview-heading">
        <div><span>01 / AGENT UI</span><h1>AI Elements</h1></div>
        <p>实际运行 Conversation 与 Sources：消息滚动、追加结果、来源折叠均可交互。</p>
      </header>
      <section className="preview-grid">
        <article className="demo-card min-h-[390px]">
          <div className="demo-label">CONVERSATION</div>
          <Conversation className="h-[285px] overflow-hidden rounded-xl border bg-background">
            <ConversationContent className="gap-3 p-4">
              {messages.map((message, index) => (
                <div
                  className={message.role === "user"
                    ? "ml-auto max-w-[78%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground"
                    : "mr-auto max-w-[88%] rounded-2xl bg-muted px-4 py-3 text-sm leading-6"}
                  key={`${message.role}-${index}`}
                >
                  {message.text}
                </div>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <button
            className="demo-action"
            data-testid="ai-add-message"
            onClick={() => setMessages((items) => [...items, {
              role: "agent",
              text: `工具执行完成：第 ${items.length + 1} 条结果已写入审计记录。`,
            }])}
            type="button"
          >
            追加工具结果
          </button>
        </article>
        <article className="demo-card">
          <div className="demo-label">SOURCES</div>
          <div className="rounded-xl border bg-card p-5">
            <p className="mb-4 text-sm leading-6 text-muted-foreground">回答先给结论，证据保持可展开，适合投放数据与规则引用。</p>
            <Sources defaultOpen>
              <SourcesTrigger count={3} data-testid="ai-sources-trigger" />
              <SourcesContent>
                <Source href="#" onClick={(event) => event.preventDefault()} title="账户小时级消耗表" />
                <Source href="#" onClick={(event) => event.preventDefault()} title="任务考核价契约" />
                <Source href="#" onClick={(event) => event.preventDefault()} title="变更审计记录" />
              </SourcesContent>
            </Sources>
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
