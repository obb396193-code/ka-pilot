// Synthetic fixtures only: no media credentials, no media execution.
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { ChangeSetRecord } from "@ka/db";
import { ChangeSetDryRunService } from "../src/changesets/dry-run-service.js";

const ws = "00000000-0000-4000-8000-000000000024";
const user = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000301";
const hash = "a".repeat(64);
const now = new Date("2026-09-08T00:00:00Z");
const auth: ApprovedWorkspaceAuthContext = {
  workspaceId: ws, userId: user, role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a1", accessLevel: "preview" }] },
};
const draft: ChangeSetRecord = {
  id, workspaceId: ws, media: "KUAISHOU", accountId: "a1", workItemId: null, title: null,
  status: "draft", initiator: user, credentialOwnerUserId: user, executorIdentity: null,
  multicaIssueId: null, ttlExpireAt: new Date(now.getTime() + 60_000), reasonCode: "test", simulation: null,
  createdAt: now, executedAt: null,
  items: [{ id: 1, targetType: "unit", targetId: "u1", field: "bid", fromValue: { type: "number", value: 30 },
    toValue: { type: "number", value: 29 }, itemStatus: "pending", failReason: null }],
};
function setup() {
  const store = {
    find: vi.fn(async () => structuredClone(draft)),
    prepareDryRun: vi.fn(async () => ({ changeset: structuredClone(draft), hash })),
    recordDryRun: vi.fn(async () => ({ executionRunId: id, hash, status: "success" as const })),
  };
  const proof = { workspaceId: ws, media: "KUAISHOU", accountId: "a1", credentialOwnerUserId: user,
    draftHash: hash, items: [{ itemId: 1, status: "success", failReason: null }] };
  const preflight = { check: vi.fn(async (input: unknown): Promise<unknown> => { void input; return structuredClone(proof); }) };
  const service = new ChangeSetDryRunService({ store, preflight, now: () => now, timeoutMs: 20 });
  return { store, proof, preflight, service };
}

describe("ChangeSetDryRunService", () => {
  it("records trusted complete preflight without confirming or enqueuing", async () => {
    const c = setup();
    await expect(c.service.run(id, auth)).resolves.toMatchObject({ executionRunId: id, status: "success", hash });
    expect(c.store.recordDryRun).toHaveBeenCalledWith({ workspaceId: ws, changeSetId: id,
      expectedHash: hash, now, items: [{ itemId: 1, status: "success" }],
      expectedScope: { media: "KUAISHOU", accountId: "a1", initiatorUserId: user, credentialOwnerUserId: user } });
    expect(draft.status).toBe("draft");
  });
  it.each([null, {}, { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } },
    { ...auth, scope: { kind: "explicit_accounts", accounts: [] } }])("denies bad/team/empty auth before repository", async (input) => {
    const c = setup(); await expect(c.service.run(id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(c.store.find).not.toHaveBeenCalled(); expect(c.preflight.check).not.toHaveBeenCalled();
  });
  it.each(["read", "other-media"])("rejects %s scope before prepare and preflight", async (kind) => {
    const c = setup(); const input = structuredClone(auth);
    if (input.workspaceKind === "personal") input.scope.accounts[0] = {
      media: kind === "read" ? "KUAISHOU" : "TENCENT", accountId: "a1", accessLevel: kind === "read" ? "read" : "execute",
    };
    await expect(c.service.run(id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(c.store.prepareDryRun).not.toHaveBeenCalled(); expect(c.preflight.check).not.toHaveBeenCalled();
  });
  it.each(["workspaceId", "id", "credentialOwnerUserId", "initiator"] as const)("rejects different %s", async (key) => {
    const c = setup(); c.store.find.mockResolvedValue({ ...draft, [key]: "00000000-0000-4000-8000-000000000099" });
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(c.preflight.check).not.toHaveBeenCalled();
  });
  it("rechecks prepared draft scope after initial read", async () => {
    const c = setup(); c.store.prepareDryRun.mockResolvedValue({ changeset: { ...draft, media: "TENCENT" }, hash });
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(c.preflight.check).not.toHaveBeenCalled();
  });
  it.each(["id", "hash", "missing", "duplicate", "foreign", "extra", "reason", "status"])("rejects invalid %s proof", async (kind) => {
    const c = setup(); const proof = structuredClone(c.proof) as Record<string, unknown>;
    if (kind === "id") proof.accountId = "outside";
    if (kind === "hash") proof.draftHash = "b".repeat(64);
    if (kind === "missing") proof.items = [];
    if (kind === "duplicate") proof.items = [c.proof.items[0], c.proof.items[0]];
    if (kind === "foreign") proof.items = [{ ...c.proof.items[0], itemId: 2 }];
    if (kind === "extra") proof.secret = "never expose";
    if (kind === "reason") proof.items = [{ itemId: 1, status: "failed", failReason: "raw upstream token" }];
    if (kind === "status") proof.items = [{ itemId: 1, status: "good", failReason: null }];
    c.preflight.check.mockResolvedValue(proof);
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it("does not upgrade unknown to success", async () => {
    const c = setup(); c.preflight.check.mockResolvedValue({ ...c.proof, items: [{ itemId: 1, status: "unknown", failReason: "SOURCE_UNAVAILABLE" }] });
    const record = vi.fn(async () => ({ executionRunId: id, hash, status: "unknown" as const }));
    const service = new ChangeSetDryRunService({ store: { ...c.store, recordDryRun: record }, preflight: c.preflight, now: () => now });
    await expect(service.run(id, auth)).resolves.toMatchObject({ status: "unknown" });
    expect(record.mock.calls[0]).toBeDefined();
  });
  it("missing provider is explicit unavailable, no persistence", async () => {
    const c = setup(); const service = new ChangeSetDryRunService({ store: c.store, now: () => now });
    await expect(service.run(id, auth)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it("late preflight completion after timeout never persists", async () => {
    const c = setup(); let finish!: (value: unknown) => void;
    c.preflight.check.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
    finish(c.proof); await new Promise((resolve) => setTimeout(resolve, 5));
    expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it("raw provider errors do not escape", async () => {
    const c = setup(); c.preflight.check.mockRejectedValue(new Error("token=secret SQL select raw_body"));
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "Preflight source is unavailable" });
  });
  it("expired draft never calls preflight", async () => {
    const c = setup(); c.store.find.mockResolvedValue({ ...draft, ttlExpireAt: now });
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(c.preflight.check).not.toHaveBeenCalled();
  });
  it("invalid id is rejected before touching any store", async () => {
    const c = setup(); await expect(c.service.run("bad-id", auth)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(c.store.find).not.toHaveBeenCalled();
  });
  it("a provider cannot mutate the private draft used for persistence", async () => {
    const c = setup(); c.preflight.check.mockImplementation(async input => {
      const request = input as { items: ChangeSetRecord["items"]; accountId: string };
      request.items[0]!.id = 999; request.accountId = "other"; return c.proof;
    });
    await c.service.run(id, auth);
    expect(c.store.recordDryRun).toHaveBeenCalledWith(expect.objectContaining({ items: [{ itemId: 1, status: "success" }],
      expectedScope: expect.objectContaining({ accountId: "a1" }) }));
  });
  it.each(["NaN", "duplicate", "unsafe-id", "done", "empty"])("fails closed on %s draft data", async kind => {
    const c = setup(); const data = structuredClone(draft);
    if (kind === "NaN") data.items[0]!.toValue = { type: "number", value: Number.NaN };
    if (kind === "duplicate") data.items.push(data.items[0]!);
    if (kind === "unsafe-id") data.items[0]!.id = Number.MAX_SAFE_INTEGER + 1;
    if (kind === "done") data.items[0]!.itemStatus = "success";
    if (kind === "empty") data.items = [];
    c.store.find.mockResolvedValue(data);
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(c.preflight.check).not.toHaveBeenCalled();
  });
  it("does not expose a storage exception", async () => {
    const c = setup(); c.store.recordDryRun.mockRejectedValue(new Error("private SQL/body/token"));
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "Preflight could not be recorded" });
  });
  it.each([0, -1, 1.5, 60_001, NaN, Infinity])("rejects invalid timeout %s", timeoutMs => {
    const c = setup(); expect(() => new ChangeSetDryRunService({ store: c.store, timeoutMs })).toThrow("Invalid preflight timeout");
  });
  it("rejects exact 16MiB evidence", async () => {
    const c = setup(); const proof = { ...c.proof, extra: "" };
    proof.extra = "a".repeat(16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(proof)));
    expect(Buffer.byteLength(JSON.stringify(proof))).toBe(16 * 1024 * 1024);
    c.preflight.check.mockResolvedValue(proof);
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it("accepts exactly 10k independently identified items, rejects 10001", async () => {
    const c = setup(); const data = structuredClone(draft);
    data.items = Array.from({ length: 10_000 }, (_, i) => ({ ...structuredClone(draft.items[0]!), id: i + 1, targetId: `unit-${i}` }));
    c.store.find.mockResolvedValue(data); c.store.prepareDryRun.mockResolvedValue({ changeset: data, hash });
    c.preflight.check.mockResolvedValue({ ...c.proof, items: data.items.map(item => ({ itemId: item.id, status: "success", failReason: null })) });
    await c.service.run(id, auth); expect(c.store.recordDryRun).toHaveBeenCalledOnce();
    data.items.push({ ...data.items[0]!, id: 10001, targetId: "unit-10001" });
    await expect(c.service.run(id, auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(c.store.recordDryRun).toHaveBeenCalledOnce();
  }, 30_000);
});
