import { agentModelCatalogSchema, approvedWorkspaceAuthContextSchema, type ApprovedWorkspaceAuthContext, type AgentModelCatalog } from "@ka/domain";
import { AgentModelCatalogError } from "@ka/db";

export class AgentModelCatalogService {
  constructor(private readonly repository: { list(auth: ApprovedWorkspaceAuthContext): Promise<unknown> }) {}
  async list(rawAuth: unknown): Promise<AgentModelCatalog> {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!auth.success) throw new AgentModelCatalogError("FORBIDDEN");
    const result = agentModelCatalogSchema.safeParse(await this.repository.list(auth.data));
    if (!result.success) throw new AgentModelCatalogError("UPSTREAM_INVALID_RESPONSE");
    return result.data;
  }
}
