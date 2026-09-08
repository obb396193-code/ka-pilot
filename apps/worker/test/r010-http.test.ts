import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { byteLimit, readJson, sendData } from "../src/r010/http.js";

describe("R010 transport bounds", () => {
  it("validates and clamps deploy limits", () => {
    expect(byteLimit(undefined, 16)).toBe(16);
    expect(byteLimit(17, 16)).toBe(16); expect(byteLimit(8, 16)).toBe(8);
    for (const limit of [0, -1, NaN, Infinity, 1.5]) expect(() => byteLimit(limit, 16)).toThrow();
  });
  it("handles string chunks and exact request limit", async () => {
    const raw = '{"reason":"合成"}', stream = Readable.from([raw]) as IncomingMessage;
    await expect(readJson(stream, Buffer.byteLength(raw))).resolves.toEqual({ reason: "合成" });
  });
  it("rejects a destroyed request", async () => {
    const stream = Readable.from([]) as IncomingMessage; stream.destroy();
    await expect(readJson(stream, 100)).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
  });
  it("rejects stream failures without carrying the source message", async () => {
    const stream = new Readable({ read() {} }) as IncomingMessage;
    const promise = readJson(stream, 100);
    const rejected = expect(promise).rejects.toMatchObject({ status: 400, message: "INVALID_REQUEST" });
    stream.emit("error", new Error("synthetic private source"));
    stream.emit("error", new Error("late socket error"));
    await rejected; stream.destroy();
  });
  it("enforces physical exact 16MiB before sending any response", () => {
    const response = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const requestId = "test", max = 16 * 1024 * 1024;
    const base = Buffer.byteLength(JSON.stringify({ ok: true, data: "", meta: { requestId } }));
    expect(() => sendData(response, "x".repeat(max - base), requestId, max)).toThrow("SOURCE_TRUNCATED");
    expect(response.writeHead).not.toHaveBeenCalled(); expect(response.end).not.toHaveBeenCalled();
  });
});
