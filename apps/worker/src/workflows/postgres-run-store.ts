import { WorkflowRepository } from "@ka/db";
import { CapabilityRegistry, compileWorkflowGraph } from "@ka/domain";
import type { Pool } from "pg";
import type { DurableWorkflowRunSnapshot, WorkflowRunRepositoryPort } from "./types.js";

/** No media wiring here: the caller must still supply authorized capability ports. */
export class PostgresWorkflowRunStore implements WorkflowRunRepositoryPort {
  readonly repository: WorkflowRepository;
  constructor(pool: Pool, private readonly registry: CapabilityRegistry) { this.repository = new WorkflowRepository(pool); }
  async loadRun(workspaceId:string,runId:string): Promise<DurableWorkflowRunSnapshot | null> {
    const run = await this.repository.getRun(workspaceId,runId);
    if (!run || !run.initiatorUserId || !run.credentialOwnerUserId) return null;
    const version = await this.repository.getPublishedVersion(workspaceId,run.versionId);
    if (!version) return null;
    return {runId:run.id,workspaceId,initiatorUserId:run.initiatorUserId,credentialOwnerUserId:run.credentialOwnerUserId,
      status:run.status,params:run.params,plan:compileWorkflowGraph({graph:version.graph,paramsSchema:version.paramsSchema},this.registry)};
  }
  compareAndSetStatus(input: Parameters<WorkflowRepository["compareAndSetRunStatus"]>[0]) { return this.repository.compareAndSetRunStatus(input); }
  claimExecutor(input: Parameters<WorkflowRepository["claimExecutor"]>[0]) { return this.repository.claimExecutor(input); }
  renewExecutor(input: Parameters<WorkflowRepository["renewExecutor"]>[0]) { return this.repository.renewExecutor(input); }
  releaseExecutor(input: Parameters<WorkflowRepository["releaseExecutor"]>[0]) { return this.repository.releaseExecutor(input); }
  reserveEffect(input: Parameters<WorkflowRepository["reserveEffect"]>[0]) { return this.repository.reserveEffect(input); }
  finishEffect(input: Parameters<WorkflowRepository["finishEffect"]>[0]) { return this.repository.finishEffect(input); }
  async appendEvent(input: Parameters<WorkflowRepository["appendEvent"]>[0]) {
    return eventOnly(await this.repository.appendEvent(input));
  }
  async listEvents(workspaceId:string,runId:string) { return (await this.repository.listEvents(workspaceId,runId)).map(eventOnly); }
}
function eventOnly(stored: Awaited<ReturnType<WorkflowRepository["appendEvent"]>>) {
  // Persistence identity is not part of the strict domain event envelope.
  const {databaseId,...event} = stored;
  void databaseId;
  return event;
}
