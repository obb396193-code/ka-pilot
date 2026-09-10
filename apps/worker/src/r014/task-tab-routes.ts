import { AssessmentPriceRepository, TaskFunnelRepository, TaskTimelineRepository } from "@ka/db";
import { metricValue, shanghaiTaskBusinessDate } from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

/**
 * 任务详情八页签里此前只接了 overview，这里补 timeline 与 funnel 两签，
 * 并把契约明写「一期 501」的 materials / review 真的做成 501。
 *
 * 之前它们是 **404**——前端分不出「这个功能一期不做」和「路径写错了」，
 * 只能猜；契约特意点名 501 就是为了让空态显得有据。
 */
const TIMELINE = /^\/api\/v1\/tasks\/([^/]{1,128})\/timeline$/;
const FUNNEL = /^\/api\/v1\/tasks\/([^/]{1,128})\/funnel$/;
// v1.9.19：review 的两条（POST 起 run、GET latest）也是一期 501，与 GET materials/review 同。
// 三条各自一个正则而不是一个交替组——交替组在覆盖绊线抹平路径时成不了独立路径，
// 会被反向检查报成「后端不存在」。
const DEFERRED_MATERIALS = /^\/api\/v1\/tasks\/([^/]{1,128})\/materials$/;
const DEFERRED_REVIEW = /^\/api\/v1\/tasks\/([^/]{1,128})\/review$/;
const DEFERRED_REVIEW_LATEST = /^\/api\/v1\/tasks\/([^/]{1,128})\/review\/latest$/;
const NOT_IMPLEMENTED = (pathname: string): boolean =>
  DEFERRED_MATERIALS.test(pathname) || DEFERRED_REVIEW.test(pathname)
  || DEFERRED_REVIEW_LATEST.test(pathname);
const ASSESSMENT_PRICE = /^\/api\/v1\/tasks\/([^/]{1,128})\/assessment-price$/;

const TIMELINE_KINDS = ["changeset", "assessment_price", "dispatch", "external_change", "work_item", "escalation"];

/** 分母为 0 或缺数一律 undefined/infinite，**不按 0 代入**。 */
function ratio(numerator: number | null, denominator: number | null):
{ value: number | null; state: "finite" | "infinite" | "undefined" } {
  if (numerator === null || denominator === null) return { value: null, state: "undefined" };
  if (denominator === 0) return numerator === 0 ? { value: null, state: "undefined" } : { value: null, state: "infinite" };
  return { value: Number((numerator / denominator).toFixed(6)), state: "finite" };
}

export function createTaskTabRoutes(pool: Pool): R014Route[] {
  const timelines = new TaskTimelineRepository(pool);
  const funnels = new TaskFunnelRepository(pool);
  const prices = new AssessmentPriceRepository(pool);

  return [
    guardedRoute((pathname) => TIMELINE.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const taskId = decodeURIComponent(TIMELINE.exec(context.url.pathname)![1]!);
      const kindsParam = context.url.searchParams.get("kinds");
      const kinds = kindsParam === null ? [] : kindsParam.split(",").map((kind) => kind.trim()).filter(Boolean);
      for (const kind of kinds) {
        // 认不出的 kind 直接拒，不悄悄忽略——悄悄忽略会让调用方以为筛过了。
        if (!TIMELINE_KINDS.includes(kind)) {
          throw new R014HttpError(400, "INVALID_REQUEST", "kinds contains an unknown value");
        }
      }
      const limitParam = context.url.searchParams.get("limit");
      if (limitParam !== null && !/^[0-9]{1,3}$/.test(limitParam)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "limit must be a positive integer");
      }

      const page = await timelines.page(context.auth, taskId, {
        ...(limitParam === null ? {} : { limit: Number(limitParam) }),
        ...(context.url.searchParams.get("cursor") === null
          ? {} : { cursor: context.url.searchParams.get("cursor")! }),
        kinds,
      });
      sendData(
        context.response,
        { items: page.items, nextCursor: page.nextCursor },
        context.requestId, context.maxResponseBytes,
        // 整类取不到时如实标出来，别让空列表看起来像「查过了，没有」。
        page.unavailableKinds.length === 0 ? {} : { unavailableKinds: page.unavailableKinds },
      );
    }),

    guardedRoute((pathname) => FUNNEL.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const taskId = decodeURIComponent(FUNNEL.exec(context.url.pathname)![1]!);
      const businessDate = shanghaiTaskBusinessDate(new Date());
      const dateTo = context.url.searchParams.get("date_to") ?? businessDate;
      const dateFrom = context.url.searchParams.get("date_from") ?? `${dateTo.slice(0, 7)}-01`;

      const facts = await funnels.facts(context.auth, taskId, dateFrom, dateTo);
      const { exposure, click, conversion, realConversion } = facts.online;
      // 线下链路的源（account_offline）还没有，三项一律 missing——不拿线上数顶替。
      const offline = { value: null, availability: "missing" as const };

      sendData(context.response, {
        online: {
          exposure: metricValue(exposure), click: metricValue(click),
          conversion: metricValue(conversion), realConversion: metricValue(realConversion),
        },
        offline: { wakeUv: offline, potentialUv: offline, realConversion: metricValue(realConversion) },
        rates: {
          ctr: ratio(click, exposure),
          cvr: ratio(conversion, click),
          // 扣量 gap = 真实转化 / 平台转化 − 1。
          gap: conversion === null || realConversion === null || conversion === 0
            ? { value: null, state: "undefined" as const }
            : { value: Number((realConversion / conversion - 1).toFixed(6)), state: "finite" as const },
          // 这两个要线下量，源不在 → undefined。
          potentialRate: { value: null, state: "undefined" as const },
          biCvr: { value: null, state: "undefined" as const },
        },
      }, context.requestId, context.maxResponseBytes,
      facts.offlineAvailable ? {} : { unavailableSources: ["account_offline"] });
    }),

    guardedRoute((pathname) => ASSESSMENT_PRICE.test(pathname), async (context) => {
      requireMethod(context.request, ["POST"]);
      const taskId = decodeURIComponent(ASSESSMENT_PRICE.exec(context.url.pathname)![1]!);
      const body = await readJsonBody(context.request, 8_192) as Record<string, unknown> | undefined;
      const change = await prices.change(context.auth, taskId, {
        price: body?.price,
        effectiveDate: body?.effective_date ?? body?.effectiveDate,
        ...(body?.evidence_url === undefined && body?.evidenceUrl === undefined
          ? {} : { evidenceUrl: body?.evidence_url ?? body?.evidenceUrl }),
      });
      // 响应键名照契约 v1.5 590 行的 snake_case。
      sendData(context.response, {
        task_id: change.taskId,
        old_price: change.oldPrice,
        new_price: change.newPrice,
        effective_date: change.effectiveDate,
        recomputed_days: change.recomputedDays,
        notified_user_ids: change.notifiedUserIds,
      }, context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => NOT_IMPLEMENTED(pathname), async (context) => {
      // POST /tasks/:id/review 也在这条上（v1.9.19），所以两种方法都放行到 501。
      requireMethod(context.request, ["GET", "POST"]);
      // 契约（api.md 任务域）明写这两签一期 501，前端据此显空态而不是显假数据。
      throw new R014HttpError(501, "NOT_IMPLEMENTED", "This tab is not part of the first release");
    }),
  ];
}
