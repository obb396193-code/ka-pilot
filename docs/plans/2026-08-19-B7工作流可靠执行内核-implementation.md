# B7 Workflow Reliability Core Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the contract-safe B7 workflow compiler, simulation layer, durable event-sourced runner, and PostgreSQL/Worker core without changing frozen contracts, touching the frontend, or inventing Multica/OS protocols.

**Architecture:** A shared Capability Registry constrains all executable behavior. Unknown React Flow-compatible graphs compile into immutable DAG plans; simulations can only call read/preview capabilities, while durable runs rebuild state from PostgreSQL events and advance through injected ports with idempotency, confirmation, retry, pause, and UNKNOWN semantics.

**Tech Stack:** TypeScript 5.9, Zod 4, Vitest 3, PostgreSQL 16, existing `@ka/domain`, `@ka/db`, `apps/worker`, B1 jobs, B3 changesets, and B5 Agent safety adapters.

---

### Task 1: Shared Capability Registry and Agent safety compatibility

**Files:**
- Create: `packages/domain/test/capability-registry.test.ts`
- Create: `packages/domain/src/capability-registry.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/worker/src/agent/operation-port.ts`
- Modify: `apps/worker/test/agent/operation-port.test.ts`

**Step 1: Write failing registry tests**

Cover valid registration/resolution and rejection of duplicate IDs/versions, unsafe identifiers, unsupported mode/kind, empty descriptions, invalid timeout/attempt limits, execute-without-idempotency, action-execute-without-confirmation, and inconsistent simulation declarations.

Use the intended descriptor shape:

```ts
const registry = new CapabilityRegistry([
  {
    id: "query_account_metrics",
    version: "1.0.0",
    kind: "data",
    mode: "read",
    description: "Query canonical account metrics",
    requiredPermissions: ["metrics:read"],
    supportsSimulation: true,
    timeoutMs: 10_000,
    maxAttempts: 2,
    inputSchema: z.object({ accountId: z.string().uuid() }).strict(),
    outputSchema: z.object({ cost: z.number().nonnegative() }).strict(),
  },
]);
```

**Step 2: Run the focused test and verify failure**

Run from `packages/domain`:

```bash
npm test -- --run test/capability-registry.test.ts
```

Expected: FAIL because the registry module does not exist.

**Step 3: Implement minimal registry and validation**

Export:

```ts
export type CapabilityKind = "data" | "compute" | "agent" | "action" | "collaboration" | "control";
export type CapabilityMode = "read" | "preview" | "execute";
export interface CapabilityDefinition { /* fields tested above */ }
export class CapabilityRegistry {
  resolve(id: string, version: string): CapabilityDefinition;
  list(): readonly CapabilityDefinition[];
}
```

Rules:

- IDs are safe snake_case; versions are finite semver-like strings.
- `execute` requires `idempotencyScope` and `requiresConfirmation=true`.
- Only `read|preview` may declare direct Agent exposure.
- Zod input/output schemas remain server-owned and never serialize into workflow JSON.
- Registry keys are `id@version`; callers cannot silently upgrade versions.

**Step 4: Adapt B5 Agent capability validation**

Keep the public test helper shape backward compatible, but route common ID/mode/description checks through the shared validator. Preserve the existing hard failure when an execute capability is offered to the Agent Runtime.

**Step 5: Run focused and regression checks**

Run domain focused tests, Worker Agent operation tests, domain/Worker typecheck and lint. Expected: all PASS; B5 safety behavior unchanged.

**Step 6: Commit**

```bash
git add packages/domain/src/capability-registry.ts packages/domain/src/index.ts packages/domain/test/capability-registry.test.ts apps/worker/src/agent/operation-port.ts apps/worker/test/agent/operation-port.test.ts
git commit -m "[be] 建立工作流原子能力注册表"
```

### Task 2: Strict graph parser and deterministic compiler

**Files:**
- Create: `packages/domain/test/workflow-graph.test.ts`
- Create: `packages/domain/src/workflow-graph.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: Write failing graph parser tests**

Cover a valid six-kind DAG and rejection of unknown top-level/node/edge fields, unsafe or duplicate IDs, missing endpoints, self-loop, cycle, unreachable island, more than 100 nodes/200 edges, unknown capability, capability version/kind mismatch, execute action without confirmation, output binding to non-upstream node, invalid parameter binding, arbitrary expression/SQL/Shell/URL fields, and UI fields affecting the execution fingerprint.

Binding examples:

```ts
type WorkflowInputBinding =
  | { source: "literal"; value: unknown }
  | { source: "parameter"; name: string }
  | { source: "node_output"; nodeId: string; path: readonly string[] };
```

**Step 2: Run the focused test and verify failure**

Run: `npm test -- --run test/workflow-graph.test.ts`

Expected: FAIL because the graph compiler does not exist.

**Step 3: Implement strict `b7-internal-v1` parsing**

Use strict Zod objects. Execution fields are graph version, nodes, edges, capability references, bindings, and bounded runtime overrides. Optional React Flow UI data is parsed through a narrow schema and removed before compilation/fingerprinting.

**Step 4: Implement deterministic compilation**

Export:

```ts
export function compileWorkflowGraph(input: unknown, registry: CapabilityRegistry): CompiledWorkflowPlan;
export function fingerprintWorkflowPlan(plan: CompiledWorkflowPlan): string;
```

Use stable Kahn topological sorting (tie-break by node ID), explicit ancestor sets, reachability checks, exact capability pinning, and canonical JSON hashing. First version rejects all cycles instead of attempting unbounded execution.

**Step 5: Run focused tests, typecheck, and lint**

Expected: all PASS.

**Step 6: Commit**

Commit with `[be] 编译严格工作流DAG`.

### Task 3: Run events, state replay, and next-step planning

**Files:**
- Create: `packages/domain/test/workflow-runtime.test.ts`
- Create: `packages/domain/src/workflow-runtime.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: Write failing state replay tests**

Cover:

- queued → running → succeeded;
- dependency fan-out/fan-in;
- waiting confirmation and confirmation resume;
- pause/resume;
- retryable failure with bounded attempt and `retryAt`;
- permanent failure;
- ambiguous execute → unknown and no runnable successor;
- skipped branches;
- duplicate/stale/out-of-order event rejection;
- successful nodes not rerun after lease recovery;
- structured blocked reason codes.

**Step 2: Run focused test and verify failure**

Run: `npm test -- --run test/workflow-runtime.test.ts`

Expected: FAIL because runtime state functions do not exist.

**Step 3: Implement event and state schemas**

Define strict, versioned safe events such as:

```ts
type WorkflowRunEvent =
  | { kind: "run_started"; sequence: number; at: string }
  | { kind: "node_started"; sequence: number; at: string; nodeId: string; attempt: number; inputHash: string }
  | { kind: "node_succeeded"; sequence: number; at: string; nodeId: string; attempt: number; outputRef?: string }
  | { kind: "node_waiting_confirmation"; sequence: number; at: string; nodeId: string; changesetId: string; previewHash: string }
  | { kind: "node_retry_scheduled"; sequence: number; at: string; nodeId: string; attempt: number; retryAt: string; errorCode: string }
  | { kind: "node_unknown"; sequence: number; at: string; nodeId: string; reconciliationRef?: string }
  | { kind: "run_finished"; sequence: number; at: string; status: "succeeded" | "failed" | "cancelled" };
```

No event payload may contain credentials, prompts, arbitrary external responses, or unbounded text.

**Step 4: Implement deterministic replay and planner**

Export:

```ts
export function replayWorkflowRun(plan: CompiledWorkflowPlan, events: readonly WorkflowRunEvent[]): WorkflowRunState;
export function planWorkflowAdvance(state: WorkflowRunState, now: string): WorkflowAdvanceDecision;
export function workflowNodeIdempotencyKey(input: NodeInvocationIdentity): string;
```

Replay validates strictly increasing per-run sequence and legal transitions. The planner returns runnable nodes in stable order or one terminal/blocking decision; it never performs effects.

**Step 5: Run focused/package checks and commit**

Expected: all PASS. Commit with `[be] 增加工作流事件回放与推进状态机`.

### Task 4: PostgreSQL workflow repository on the existing schema

**Files:**
- Create: `packages/db/test/workflow-repository.test.ts`
- Create: `packages/db/src/workflow-repository.ts`
- Modify: `packages/db/src/index.ts`

**Step 1: Write failing PostgreSQL tests**

Using migrated PostgreSQL, cover:

- draft creation and same-definition concurrent version numbering;
- workspace/owner isolation;
- publication only from draft after compiled fingerprint verification;
- published version immutability through Repository methods;
- run creation binds exact published version and freezes initiator/credential owner;
- cross-workspace version/run/event rejection;
- serial event append with monotonically increasing internal sequence in event detail;
- event replay in database ID order;
- legal run status compare-and-set;
- stale/duplicate append idempotency.

**Step 2: Run focused test and verify failure**

Run from `packages/db`:

```bash
npm test -- --run test/workflow-repository.test.ts
```

Expected: FAIL because repository does not exist.

**Step 3: Implement transactional Repository**

Provide internal ports for draft version save, publish, load published plan, create run, load run, append event, and compare-and-set run status. Enforce tenant joins even though existing FKs/checks are incomplete. Use transaction advisory locks for version allocation and event append; store event schema version and sequence inside `detail` without changing the table.

Published graph stores the validated internal graph plus compiler fingerprint. Repository must not accept an already-published mutation.

**Step 4: Run focused/all DB tests, typecheck, lint, and migration diff**

Expected: all PASS; `packages/contract` and migrations unchanged.

**Step 5: Commit**

Commit with `[be] 持久化固定版本工作流运行`.

### Task 5: Simulation runner with technical execute prohibition

**Files:**
- Create: `apps/worker/src/workflows/types.ts`
- Create: `apps/worker/src/workflows/simulation-runner.ts`
- Create: `apps/worker/src/workflows/index.ts`
- Create: `apps/worker/test/workflows/simulation-runner.test.ts`

**Step 1: Write failing simulation tests**

Cover read/compute/Agent/preview success, deterministic dependency binding, missing parameter/data, permission denial, capability unavailable, output schema mismatch, preview result, action execute prohibition, timeout, and safe result summaries.

Include a hostile fake execute capability whose invoker increments a counter; assert the counter remains zero in every simulation path.

**Step 2: Run focused test and verify failure**

Run: `npm test -- --run test/workflows/simulation-runner.test.ts`

Expected: FAIL because simulation modules do not exist.

**Step 3: Implement simulation ports and runner**

Ports:

```ts
interface WorkflowCapabilityInvoker {
  invoke(input: {
    auth: WorkflowAuthContext;
    capability: CapabilityDefinition;
    mode: "read" | "preview";
    values: Record<string, unknown>;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}
```

The type and runtime guard both exclude execute. Resolve parameters/upstream outputs, validate input/output with the registry schemas, cap total nodes/output size/time, and return per-node `ready|blocked|missing_data|permission_denied|would_wait_confirmation` results.

**Step 4: Run focused/Worker checks and commit**

Expected: all PASS. Commit with `[be] 增加无写入工作流模拟器`.

### Task 6: Durable Workflow Run Handler

**Files:**
- Create: `apps/worker/src/workflows/run-handler.ts`
- Create: `apps/worker/test/workflows/run-handler.test.ts`
- Modify: `apps/worker/src/workflows/types.ts`
- Modify: `apps/worker/src/workflows/index.ts`

**Step 1: Write failing handler tests**

Use memory Repository/Invoker ports. Cover:

- linear DAG and fan-in success;
- replay skips succeeded nodes after simulated process crash;
- stable node idempotency key across retry;
- retryable read/preview with bounded attempts;
- execute capability routes to a `ChangesetActionPort`, never the generic invoker;
- execute waits for dry-run/confirmation and resumes only with matching preview hash;
- confirmation mismatch/expiry blocks;
- ambiguous execute records UNKNOWN and never retries;
- permanent failure stops successors;
- pause/resume/cancel;
- max steps and total time yield safely;
- wrong workspace/user/credential owner fail closed;
- logs/events contain no secret-shaped strings.

**Step 2: Run focused test and verify failure**

Run: `npm test -- --run test/workflows/run-handler.test.ts`

Expected: FAIL because the durable handler does not exist.

**Step 3: Implement execution ports**

Keep external contracts abstract:

```ts
interface ChangesetActionPort {
  preview(input: ActionInput): Promise<{ changesetId: string; previewHash: string }>;
  executeConfirmed(input: ConfirmedActionInput): Promise<ActionExecutionResult>;
  reconcileUnknown(input: UnknownActionInput): Promise<ActionReconciliationResult>;
}

interface WorkflowRunRepositoryPort { /* load plan/run/events, append, CAS status */ }
interface WorkflowPermissionPort { authorize(input): Promise<"allowed" | BlockReason>; }
```

No OS/Multica request shape appears in this code.

**Step 4: Implement bounded event-sourced advancement**

On each invocation, reload exact version and events, replay state, select stable runnable nodes, resolve/validate input, authorize, append `node_started` before effects, invoke the correct port, validate output, append one terminal/wait event, then continue until blocked/terminal/budget exhausted. Persistence failure stops immediately.

**Step 5: Run focused/all Worker checks and commit**

Expected: all PASS; no production runtime/job registration. Commit with `[be] 增加可恢复工作流运行器`.

### Task 7: Full quality gate and adversarial review

**Files:**
- Modify as findings require, only within B7-owned backend files.
- Create: `docs/evidence/B7-代码质量报告.md`

**Step 1: Run all package tests and opt-in SDK smoke**

Run domain, db, worker, gateway default suites and the existing opt-in real SDK → localhost gateway → fake upstream smoke. Expected: all PASS; no B5 regression.

**Step 2: Run coverage**

Run Vitest coverage for all four packages. Expected: each package stays above 80% line coverage and every new B7 production module reaches at least 80%.

**Step 3: Run type/lint/dependency/complexity gates**

Run all typecheck/lint scripts, `npm audit --audit-level=high`, complexity check, secret/dynamic execution scans, and `git diff --check be/b6..HEAD`. Expected: 0 Critical/High, no credentials, no arbitrary execution, clean diff.

**Step 4: Run PostgreSQL regression and contract freeze check**

Replay migrations down/up and run all DB tests against PostgreSQL 16. Verify zero diff under `packages/contract` and `packages/db/migrations` from B6.

**Step 5: Write the evidence report and remediate findings**

Record exact commands, test counts, coverage, limitations, and fixes. Fake adapters must remain labeled fake.

**Step 6: Commit**

Commit with `[be] 完成B7工作流质量门禁`.

### Task 8: Contract differences, master ledger, and Claude audit handoff

**Files:**
- Modify: `docs/plans/B7-状态.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Record exact B7 completion state**

Mark only implemented scope. Distinguish functional review SHA, quality evidence SHA, and final handoff SHA.

**Step 2: Add P-011 B7 contract differences**

Request Claude/arch decisions for:

- public graph/parameter/capability DTO and versioning;
- per-node status/checkpoint storage vs event-only projection;
- per-run event sequence and reconnect pagination;
- workflow run/create/confirm/pause/resume/cancel APIs;
- trigger idempotency and rule/schedule correlation;
- official template cross-workspace ownership;
- action confirmation/preview hash and conflict key DTO;
- real Multica/OS adapter and result/reconciliation schema;
- run retention, raw log references, effect recovery, and “why not run” response.

**Step 3: Add Claude audit checklist**

Require review of DAG safety, exact capability pinning, Agent execute exclusion, simulation execute impossibility, tenant/credential freeze, published immutability, event legality, replay idempotency, confirmation matching, UNKNOWN no-retry, and fake/real boundaries.

**Step 4: Update master/work ledger and commit**

Expected: branch contains B1a-B7a linearly, clean working tree, no frontend/contract/migration changes.

Commit with `[be] 回执B7工作流可靠执行内核`.

### Task 9: Begin B8a knowledge-base foundation only after B7 handoff

**Files:**
- Create later: `docs/plans/2026-08-19-B8知识库领域底座-design.md`
- Create later: `docs/plans/2026-08-19-B8知识库领域底座-implementation.md`
- Create later: `docs/plans/B8-状态.md`

**Step 1: Re-read ContentRadar read-only implementation**

Verify BlockNote `{blocks}` truth envelope, plain-text projection, ID-based wikilink extraction, same-workspace link validation, backlinks, fractional ordering, and last-write-wins autosave semantics against current source. Do not modify ContentRadar.

**Step 2: Propose the KA-specific delta before code**

Define task/account/report/run object links, source types, visibility, asset lifecycle, report auto-archive, case/error-book inputs, and Agent retrieval citations. Separate code-copyable frontend components from Python semantics that must be ported to TypeScript.

**Step 3: Limit implementation to contract-independent pure domain logic**

Until Claude/arch freezes B8 tables/API, only implement BlockNote envelope validation, text projection, wikilink extraction, safe business-object references, and permission/search ports. Do not create `kb_*` migrations or public endpoints.

**Step 4: Commit design before B8 code**

Keep B8a as a separate review boundary derived from completed B7a.
