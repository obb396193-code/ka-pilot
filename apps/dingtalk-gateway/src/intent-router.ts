export type RoutedIntent =
  | { kind: "query"; input: string }
  | { kind: "create_task"; input: string }
  | { kind: "help"; input: string }
  | { kind: "agent"; input: string };

const commandPrefixes = ["/", "／"];

function normalize(text: string): string {
  const trimmed = text.trim();
  const prefix = commandPrefixes.find((value) => trimmed.startsWith(value));
  return prefix ? trimmed.slice(prefix.length).trim() : trimmed;
}

export function routeIntent(text: string): RoutedIntent {
  const input = normalize(text);
  if (/^(帮助|help)$/i.test(input)) {
    return { kind: "help", input };
  }
  if (/^(查数|数据)(\s|$)/.test(input)) {
    return { kind: "query", input: input.replace(/^(查数|数据)\s*/, "") };
  }
  if (/^(创建任务|建任务)(\s|$)/.test(input)) {
    return {
      kind: "create_task",
      input: input.replace(/^(创建任务|建任务)\s*/, ""),
    };
  }
  return { kind: "agent", input: text.trim() };
}
