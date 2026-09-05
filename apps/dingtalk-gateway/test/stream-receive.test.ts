import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), ack: vi.fn(),
  register: vi.fn(), construct: vi.fn() }));
vi.mock("dingtalk-stream", () => ({
  TOPIC_ROBOT: "robot",
  DWClient: class {
    constructor(options: unknown) { sdk.construct(options); }
    connect = sdk.connect;
    disconnect = sdk.disconnect;
    registerCallbackListener = sdk.register;
    socketCallBackResponse = sdk.ack;
  },
}));
import { connectDingTalkStream } from "../src/dingtalk-adapter.js";

describe("production Stream callback wiring", () => {
  beforeEach(() => vi.clearAllMocks());
  it("waits for persistence, reports failure without ACK, disconnects", async () => {
    let resolve!: () => void;
    const onMessage = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const onProcessingError = vi.fn();
    const connection = await connectDingTalkStream({ clientId: "synthetic", clientSecret: "synthetic", onMessage, onProcessingError });
    expect(sdk.construct).toHaveBeenCalledWith(expect.objectContaining({ debug: false }));
    const callback = sdk.register.mock.calls[0]![1] as (data: unknown) => void;
    const event = { headers: { messageId: "stream" }, data: JSON.stringify({ msgId: "msg", senderStaffId: "staff", conversationId: "group", msgtype: "text", text: { content: "help" }, sessionWebhook: "https://oapi.dingtalk.com/path" }) };
    callback(event);
    expect(sdk.ack).not.toHaveBeenCalled();
    resolve(); await vi.waitFor(() => expect(sdk.ack).toHaveBeenCalledOnce());
    sdk.ack.mockClear();
    onMessage.mockRejectedValue(Error("persistence failed"));
    callback(event);
    await vi.waitFor(() => expect(onProcessingError).toHaveBeenCalledOnce());
    expect(sdk.ack).not.toHaveBeenCalled();
    callback({ ...event, data: "bad JSON" });
    await vi.waitFor(() => expect(onProcessingError).toHaveBeenCalledTimes(2));
    connection.disconnect();
    expect(sdk.disconnect).toHaveBeenCalledOnce();
  });
});
