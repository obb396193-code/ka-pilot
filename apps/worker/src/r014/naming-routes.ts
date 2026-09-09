import { AccountNameParseRepository } from "@ka/db";
import {
  applyOverride, computeConflicts, namingRuleSchema, parseAccountName, statusWithConflicts,
  toNamingRule, type NamingRule,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.8 归属清洗后台（R-017 T4）。六个端点全在 /api/v1/admin/ 下。
const ACCOUNT_NAME = /^\/api\/v1\/admin\/account-names\/([A-Z0-9_]{1,32})\/([A-Za-z0-9_-]{1,128})$/;

function requireRule(rule: NamingRule | null): NamingRule {
  // 没配规范就解析不了。回 409 而不是拿一份默认规范硬解——硬解出来的段全是错的。
  if (rule === null) {
    throw new R014HttpError(409, "CONFLICT", "No naming rule is configured for this media yet");
  }
  return rule;
}

export function createNamingRoutes(pool: Pool): R014Route[] {
  const repository = new AccountNameParseRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/admin/naming-rules", async (context) => {
      const method = requireMethod(context.request, ["GET", "PUT"]);
      const media = context.url.searchParams.get("media");
      if (media === null) throw new R014HttpError(400, "INVALID_REQUEST", "media is required");
      if (method === "GET") {
        sendData(context.response, await repository.currentRule(context.auth, media),
          context.requestId, context.maxResponseBytes);
        return;
      }
      const body = await readJsonBody(context.request, 1_048_576) as Record<string, unknown> | undefined;
      if (body === undefined) throw new R014HttpError(400, "INVALID_REQUEST", "a rule body is required");
      sendData(
        context.response,
        await repository.putRule(context.auth, media, {
          segments: body.segments,
          separators: body.separators,
          effectiveFrom: String(body.effective_from ?? body.effectiveFrom ?? ""),
          note: (body.note as string | null | undefined) ?? null,
        }),
        context.requestId, context.maxResponseBytes,
      );
    }),

    /**
     * 干跑：给一批样本名，返回逐条解析结果与命中率，**不写库**（arch 硬要求 ②，
     * 老板要在页面上边调规范边看效果）。规范从请求体里取，取不到才回落到已存的当前版。
     */
    guardedRoute((pathname) => pathname === "/api/v1/admin/naming-rules/test", async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 1_048_576) as Record<string, unknown> | undefined;
      const media = String(body?.media ?? "");
      const samples = body?.sample_names ?? body?.sampleNames;
      if (!/^[A-Z0-9_]{1,32}$/.test(media) || !Array.isArray(samples) || samples.length === 0 || samples.length > 500) {
        throw new R014HttpError(400, "INVALID_REQUEST", "media and sample_names are required");
      }
      const draft = body?.rule ?? (body?.segments === undefined ? undefined : {
        media, version: 1, segments: body.segments, separators: body.separators,
      });
      const stored = await repository.currentRule(context.auth, media);
      const rule = draft === undefined
        ? toNamingRule(requireRule(stored))
        : namingRuleSchema.parse(draft);

      const results = samples.map((sample) => {
        if (typeof sample !== "string" || sample.length === 0) {
          throw new R014HttpError(400, "INVALID_REQUEST", "sample_names must be non-empty strings");
        }
        const parse = parseAccountName(sample, rule);
        return {
          accountName: sample,
          status: parse.status,
          segments: parse.segments,
          taskIds: parse.taskIds,
          unmatched: parse.unmatched,
        };
      });
      const parsed = results.filter((result) => result.status === "parsed").length;
      sendData(
        context.response,
        {
          ruleVersion: rule.version,
          results,
          // 命中率按「完全解析」算：partial 不计入，否则改规范时看不出到底改好没有。
          hitRate: { value: results.length === 0 ? null : parsed / results.length, state: results.length === 0 ? "undefined" : "finite" },
          counts: {
            parsed,
            partial: results.filter((result) => result.status === "partial").length,
            failed: results.filter((result) => result.status === "failed").length,
          },
        },
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => pathname === "/api/v1/admin/account-names", async (context) => {
      requireMethod(context.request, ["GET"]);
      const page = context.url.searchParams.get("page");
      sendData(
        context.response,
        await repository.list(context.auth, {
          ...(context.url.searchParams.get("status") === null ? {} : { status: context.url.searchParams.get("status")! }),
          ...(context.url.searchParams.get("media") === null ? {} : { media: context.url.searchParams.get("media")! }),
          ...(context.url.searchParams.get("q") === null ? {} : { q: context.url.searchParams.get("q")! }),
          ...(page === null ? {} : { page: Number(page) }),
        }),
        context.requestId, context.maxResponseBytes,
      );
    }),

    guardedRoute((pathname) => pathname === "/api/v1/admin/account-names/confirm", async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 262_144) as { items?: unknown } | undefined;
      if (!Array.isArray(body?.items)) throw new R014HttpError(400, "INVALID_REQUEST", "items must be an array");
      sendData(
        context.response,
        await repository.confirmBatch(context.auth, body.items as { media: string; accountId: string }[]),
        context.requestId, context.maxResponseBytes,
      );
    }),

    /**
     * 重解析：**跳过 overridden**（人工结论不动）。冲突照实记，不替谁选一边。
     * 平台侧对照值本批还没有来源，`platform` 传空——缺证据不算冲突（见 computeConflicts）。
     */
    guardedRoute((pathname) => pathname === "/api/v1/admin/account-names/reparse", async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 262_144) as Record<string, unknown> | undefined;
      const media = body?.media === undefined ? undefined : String(body.media);
      const accountIds = body?.accountIds ?? body?.account_ids;
      if (accountIds !== undefined && !Array.isArray(accountIds)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "accountIds must be an array when present");
      }
      const candidates = await repository.reparseCandidates(context.auth, {
        ...(media === undefined ? {} : { media }),
        ...(accountIds === undefined ? {} : { accountIds: accountIds as string[] }),
      });

      const rules = new Map<string, NamingRule>();
      const summary = { reparsed: 0, skippedNoRule: 0, byStatus: {} as Record<string, number> };
      for (const candidate of candidates) {
        if (!rules.has(candidate.media)) {
          const stored = await repository.currentRule(context.auth, candidate.media);
          if (stored === null) { summary.skippedNoRule += 1; continue; }
          rules.set(candidate.media, toNamingRule(stored));
        }
        const rule = rules.get(candidate.media)!;
        const parse = parseAccountName(candidate.accountName, rule);
        const conflicts = computeConflicts(parse, { platform: {}, qihangTaskIds: [] });
        const status = statusWithConflicts(parse, conflicts);
        const saved = await repository.upsertParse(context.auth, {
          media: candidate.media,
          accountId: candidate.accountId,
          accountName: candidate.accountName,
          ruleVersion: rule.version,
          status,
          segments: parse.segments,
          taskIds: parse.taskIds,
          conflicts,
        });
        summary.reparsed += 1;
        summary.byStatus[saved.status] = (summary.byStatus[saved.status] ?? 0) + 1;
      }
      sendData(context.response, summary, context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => ACCOUNT_NAME.test(pathname), async (context) => {
      requireMethod(context.request, ["PATCH"]);
      const [, media, accountId] = ACCOUNT_NAME.exec(context.url.pathname)!;
      const body = await readJsonBody(context.request, 262_144) as Record<string, unknown> | undefined;
      const patched = await repository.patch(context.auth, media!, accountId!, {
        ...(body?.segments === undefined ? {} : { segments: body.segments }),
        ...(body?.confirm === undefined ? {} : { confirm: body.confirm === true }),
      });
      // 把人工覆盖叠回解析结果再返回，前端看到的就是最终生效的那一份。
      const stored = await repository.currentRule(context.auth, media!);
      const rule = stored === null ? null : toNamingRule(stored);
      const effective = rule === null || patched.override === null
        ? null
        : applyOverride(parseAccountName(patched.accountName, rule), patched.override, rule);
      sendData(
        context.response,
        { ...patched, effectiveSegments: effective?.segments ?? null },
        context.requestId, context.maxResponseBytes,
      );
    }),
  ];
}
