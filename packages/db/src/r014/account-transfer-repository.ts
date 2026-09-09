import {
  accountTransferRequestSchema, accountTransferResultSchema,
  type AccountTransferRequest, type AccountTransferResult, type ApprovedWorkspaceAuthContext,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
} from "./workspace-authority.js";

/**
 * v1.5 4.10 账户交接（A7）。从 Q-003 起一直卡在 `account_access_grants` 没有 `revoked_at`，
 * 018 补上后才能做。
 *
 * 语义按契约：**原 grant 置 `revoked_at` 保留审计行，新 grant 另起一行**——删行会让
 * 「这个户以前归谁」永久消失。整批在一个事务里，任何一户失败就整批回滚。
 */
type Skipped = AccountTransferResult["skipped"][number];

async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${name}`]);
  return result.rows[0]?.name !== null;
}

export class AccountTransferRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * `fromUserId` 默认是调用者自己；管理员做离职交接时显式传离职者。
   * **不靠伪造 auth 上下文来「变成」那个人**——成员校验会核对角色，伪装当场就露馅，
   * 而且伪装本身会绕过一次真实的权限检查。
   */
  async transfer(
    auth: ApprovedWorkspaceAuthContext,
    input: AccountTransferRequest,
    fromUserId?: string,
  ): Promise<AccountTransferResult> {
    const approved = approveAuth(auth);
    const parsed = accountTransferRequestSchema.safeParse(input);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const request = parsed.data; // Freeze caller input before the first await.
    const donor = fromUserId ?? approved.userId;
    if (request.toUserId === donor) throw new R014RepositoryError("INVALID_INPUT");

    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);

      // 目标必须是本空间在册且启用的成员——否则等于把账户交给一个不存在的人。
      const target = (await client.query(
        `SELECT member.identity_id FROM workspace_memberships AS member
         JOIN users AS actor ON actor.workspace_id=member.workspace_id AND actor.id=member.user_id
           AND actor.is_active=true
         JOIN auth_identities AS identity ON identity.id=member.identity_id AND identity.is_active=true
         WHERE member.workspace_id=$1 AND member.user_id=$2 AND member.is_active=true
         LIMIT 2 FOR SHARE OF member, actor, identity`,
        [approved.workspaceId, request.toUserId],
      )).rows;
      if (target.length !== 1) throw new R014RepositoryError("FORBIDDEN");
      const toIdentityId = String((target[0] as { identity_id: unknown }).identity_id);

      const fromIdentityId = String((await client.query(
        "SELECT identity_id FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND is_active=true",
        [approved.workspaceId, donor],
      )).rows[0]?.identity_id ?? "");
      if (fromIdentityId === "") throw new R014RepositoryError("FORBIDDEN");

      const skipped: Skipped[] = [];
      const moved: { media: string; accountId: string }[] = [];

      for (const item of request.items) {
        // 有未终态变更集的账户不许交接：执行到一半换人会让「谁发起、谁负责」对不上。
        const running = (await client.query(
          `SELECT 1 FROM changesets
           WHERE workspace_id=$1 AND media=$2 AND account_id=$3
             AND status IN ('confirmed','executing') LIMIT 1`,
          [approved.workspaceId, item.media, item.accountId],
        )).rows.length > 0;
        if (running) {
          skipped.push({ ...item, reason: "blocked_by_changeset" });
          continue;
        }
        const revoked = await client.query(
          `UPDATE account_access_grants SET revoked_at=now(), revoked_by=$5
           WHERE workspace_id=$1 AND identity_id=$2 AND media=$3 AND account_id=$4 AND revoked_at IS NULL
           RETURNING access_level`,
          [approved.workspaceId, fromIdentityId, item.media, item.accountId, approved.userId],
        );
        if (revoked.rows.length !== 1) {
          skipped.push({ ...item, reason: "not_granted" });
          continue;
        }
        const accessLevel = String((revoked.rows[0] as { access_level: unknown }).access_level);
        // 目标可能早就有这个户的有效授权；那就只撤旧的，不重复插一行。
        await client.query(
          `INSERT INTO account_access_grants(workspace_id, identity_id, media, account_id, access_level)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT (workspace_id, identity_id, media, account_id) DO UPDATE
             SET access_level=EXCLUDED.access_level, revoked_at=NULL, revoked_by=NULL`,
          [approved.workspaceId, toIdentityId, item.media, item.accountId, accessLevel],
        );
        moved.push(item);
      }

      let workItems = 0;
      if (request.include.workItems && moved.length > 0) {
        const result = await client.query(
          `UPDATE work_items SET assignee=$2
           WHERE workspace_id=$1 AND status IN ('open','processing','dispatched','escalated')
             AND (media, account_id) IN (SELECT * FROM unnest($3::text[], $4::text[]))
           RETURNING id`,
          [approved.workspaceId, request.toUserId,
            moved.map((item) => item.media), moved.map((item) => item.accountId)],
        );
        workItems = result.rows.length;
      }

      // `dispatches` 表要 migration 014（Codex）。表不在就是 0 —— 系统里根本没有派发单这种对象。
      let dispatches = 0;
      if (request.include.dispatches && moved.length > 0 && await tableExists(client, "dispatches")) {
        const result = await client.query(
          `UPDATE dispatches SET receiver=$2
           WHERE workspace_id=$1 AND status='open'
             AND (media, account_id) IN (SELECT * FROM unnest($3::text[], $4::text[]))
           RETURNING id`,
          [approved.workspaceId, request.toUserId,
            moved.map((item) => item.media), moved.map((item) => item.accountId)],
        );
        dispatches = result.rows.length;
      }

      if (request.include.starred && moved.length > 0) {
        // 星标随账户走：交接后新负责人看到的仍是同一批「已标记」的户。
        await client.query(
          `UPDATE accounts SET owner_user_id=$2
           WHERE workspace_id=$1 AND (media, account_id) IN (SELECT * FROM unnest($3::text[], $4::text[]))`,
          [approved.workspaceId, request.toUserId,
            moved.map((item) => item.media), moved.map((item) => item.accountId)],
        );
      }

      const transfer = (await client.query(
        `INSERT INTO account_transfers(workspace_id, from_user_id, to_user_id, initiated_by, items, include, moved, note)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8) RETURNING id`,
        // from 是交出方，initiated_by 是实际操作人——离职交接时这两者不是同一个人。
        [approved.workspaceId, donor, request.toUserId, approved.userId,
          JSON.stringify(moved), JSON.stringify(request.include),
          JSON.stringify({ accounts: moved.length, workItems, dispatches }),
          request.note ?? null],
      )).rows[0] as { id: string };

      // 双方各一条出站通知（契约 4.10）。通知只入队，发送由 Worker 负责。
      for (const userId of [donor, request.toUserId]) {
        await client.query(
          `INSERT INTO outbound_messages(workspace_id, channel, target, kind, payload, status)
           VALUES($1,'inbox',$2,'account_transfer',$3::jsonb,'queued')`,
          [approved.workspaceId, userId, JSON.stringify({
            transferId: transfer.id, accounts: moved.length, note: request.note ?? null,
          })],
        );
      }

      return accountTransferResultSchema.parse({
        transferId: transfer.id,
        moved: { accounts: moved.length, workItems, dispatches },
        notifiedUserIds: [donor, request.toUserId],
        skipped,
      });
    });
  }

  /** 离职场景：把某人当前全部有效授权的账户打包交接（admin）。 */
  async transferAll(
    auth: ApprovedWorkspaceAuthContext,
    fromUserId: string,
    toUserId: string,
    note: string | null,
  ): Promise<AccountTransferResult> {
    const approved = approveAuth(auth);
    if (approved.role !== "admin") throw new R014RepositoryError("FORBIDDEN");
    if (fromUserId === toUserId) throw new R014RepositoryError("INVALID_INPUT");
    const items = (await this.pool.query(
      `SELECT grant_row.media, grant_row.account_id FROM account_access_grants AS grant_row
       JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
         AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
       WHERE grant_row.workspace_id=$1 AND grant_row.revoked_at IS NULL
       ORDER BY grant_row.media, grant_row.account_id`,
      [approved.workspaceId, fromUserId],
    )).rows as { media: string; account_id: string }[];
    if (items.length === 0) throw new R014RepositoryError("NOT_FOUND");
    // 管理员以自己的身份执行，交出方显式传入——撤的是离职者的授权，不是管理员自己的。
    return this.transfer(
      approved,
      {
        items: items.map((row) => ({ media: row.media, accountId: row.account_id })),
        toUserId,
        include: { workItems: true, dispatches: true, starred: true },
        note,
      },
      fromUserId,
    );
  }
}
