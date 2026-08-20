import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  SettlementError,
  createSettlementTemplate,
  freezeSettlementPreview,
  previewSettlement,
  type SettlementPreviewInput,
  type SettlementTemplateInput,
} from "../src/settlement.js";

function templateInput(overrides: Partial<SettlementTemplateInput> = {}): SettlementTemplateInput {
  return {
    templateId: "monthly-ka",
    templateVersion: "2026-08-v1",
    name: "KA 月度结算模板",
    currencyCode: "CNY",
    unitNote: "金额字段单位为元",
    fields: [
      {
        fieldKey: "account_name",
        label: "账户",
        order: 1,
        valueType: "text",
        aggregation: "none",
        source: { kind: "fact", factKey: "account_name" },
        required: true,
        allowCorrection: false,
      },
      {
        fieldKey: "book_cost",
        label: "账面消耗",
        order: 2,
        valueType: "money",
        aggregation: "sum",
        source: { kind: "fact", factKey: "cost_api" },
        required: true,
        allowCorrection: false,
      },
      {
        fieldKey: "compensation",
        label: "赔付",
        order: 3,
        valueType: "money",
        aggregation: "sum",
        source: { kind: "fact", factKey: "income" },
        required: true,
        allowCorrection: false,
      },
      {
        fieldKey: "coefficient",
        label: "折算系数",
        order: 4,
        valueType: "number",
        aggregation: "none",
        source: { kind: "fact", factKey: "channel_coefficient" },
        required: true,
        allowCorrection: false,
      },
      {
        fieldKey: "cash_cost",
        label: "现金消耗",
        order: 5,
        valueType: "money",
        aggregation: "sum",
        source: {
          kind: "formula",
          expression: {
            kind: "divide",
            left: {
              kind: "subtract",
              left: { kind: "field", fieldKey: "book_cost" },
              right: { kind: "field", fieldKey: "compensation" },
            },
            right: { kind: "field", fieldKey: "coefficient" },
          },
        },
        required: true,
        allowCorrection: false,
      },
      {
        fieldKey: "estimated_rebate",
        label: "估算返点",
        order: 6,
        valueType: "money",
        aggregation: "sum",
        source: {
          kind: "formula",
          expression: {
            kind: "subtract",
            left: { kind: "field", fieldKey: "book_cost" },
            right: { kind: "field", fieldKey: "cash_cost" },
          },
        },
        required: true,
        allowCorrection: false,
      },
      {
        fieldKey: "actual_rebate",
        label: "实际返点",
        order: 7,
        valueType: "money",
        aggregation: "sum",
        source: { kind: "fact", factKey: "rebate" },
        required: true,
        allowCorrection: true,
      },
    ],
    checks: [{
      checkKey: "rebate_match",
      label: "实际返点与估算返点",
      order: 1,
      leftFieldKey: "actual_rebate",
      rightFieldKey: "estimated_rebate",
      tolerance: { mode: "absolute", amount: 1 },
      severity: "block",
    }],
    createdByUserId: "user-001",
    createdAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function template(overrides: Partial<SettlementTemplateInput> = {}) {
  return createSettlementTemplate(templateInput(overrides), "2026-08-21T00:01:00.000Z");
}

function previewInput(overrides: Partial<SettlementPreviewInput> = {}): SettlementPreviewInput {
  return {
    runId: "settlement-run-001",
    template: template(),
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    scopeId: "optimizer-user-001",
    dataBasis: "offline_settlement",
    dataCutoffAt: "2026-09-01T03:00:00.000Z",
    facts: [{
      sourceFactId: "fact-account-001",
      rowKey: "account-001",
      values: {
        account_name: "测试账户A",
        cost_api: 109,
        income: 0,
        channel_coefficient: 1.09,
        rebate: 9,
      },
    }],
    corrections: [],
    generatedAt: "2026-09-01T04:00:00.000Z",
    ...overrides,
  };
}

function preview(overrides: Partial<SettlementPreviewInput> = {}) {
  return previewSettlement(previewInput(overrides), "2026-09-01T05:00:00.000Z");
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

describe("settlement template", () => {
  it("normalizes explicit field/check order and produces an immutable stable template", () => {
    const first = template();
    const input = templateInput();
    const second = createSettlementTemplate({
      ...input,
      fields: [...input.fields].reverse(),
      checks: [...input.checks].reverse(),
    }, "2026-08-21T00:01:00.000Z");

    expect(second).toEqual(first);
    expect(first.fields.map(({ fieldKey }) => fieldKey)).toEqual([
      "account_name", "book_cost", "compensation", "coefficient", "cash_cost", "estimated_rebate", "actual_rebate",
    ]);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first.fields)).toBe(true);
  });

  it.each([
    { templateId: "../unsafe" },
    { currencyCode: "rmb" },
    { createdAt: "2026-08-21T00:02:00.000Z" },
    { fields: [] },
    { fields: [templateInput().fields[0]!, { ...templateInput().fields[0]!, order: 2 }] },
    { fields: [templateInput().fields[0]!, { ...templateInput().fields[1]!, order: 1 }] },
    { fields: [{ ...templateInput().fields[0]!, unexpected: true }] },
    { fields: [{ ...templateInput().fields[0]!, aggregation: "sum" }] },
    { fields: [{ ...templateInput().fields[0]!, source: { kind: "formula", expression: { kind: "constant", value: 1 } } }] },
    { fields: [{ ...templateInput().fields[4]!, source: { kind: "formula", expression: { kind: "field", fieldKey: "missing" } } }], checks: [] },
    {
      fields: [
        { ...templateInput().fields[1]!, source: { kind: "formula", expression: { kind: "field", fieldKey: "cash_cost" } } },
        { ...templateInput().fields[4]!, source: { kind: "formula", expression: { kind: "field", fieldKey: "book_cost" } } },
      ],
      checks: [],
    },
    { checks: [templateInput().checks[0]!, { ...templateInput().checks[0]!, order: 2 }] },
    { checks: [{ ...templateInput().checks[0]!, leftFieldKey: "account_name" }] },
    { checks: [{ ...templateInput().checks[0]!, tolerance: { mode: "relative", rate: -1 } }] },
    { unexpected: true },
  ])("rejects an invalid template %#", (override) => {
    expect(() => createSettlementTemplate({ ...templateInput(), ...override } as never, "2026-08-21T00:01:00.000Z"))
      .toThrow(SettlementError);
  });

  it("rejects an expression beyond the bounded evaluation depth", () => {
    let expression: unknown = { kind: "constant", value: 1 };
    for (let index = 0; index < 13; index += 1) {
      expression = { kind: "add", left: expression, right: { kind: "constant", value: 1 } };
    }
    expect(() => template({
      fields: [{ ...templateInput().fields[4]!, source: { kind: "formula", expression } as never }],
      checks: [],
    })).toThrow(SettlementError);
  });
});

describe("settlement preview", () => {
  it("computes deterministic fields and explicit rebate reconciliation from offline facts", () => {
    const result = preview();
    const row = result.rows[0]!;

    expect(result.status).toBe("ready_to_freeze");
    expect(result.dataBasis).toBe("offline_settlement");
    expect(row.fields.find(({ fieldKey }) => fieldKey === "cash_cost")).toMatchObject({ value: 100, source: "formula" });
    expect(row.fields.find(({ fieldKey }) => fieldKey === "estimated_rebate")).toMatchObject({ value: 9, source: "formula" });
    expect(row.checks).toEqual([expect.objectContaining({ checkKey: "rebate_match", status: "matched", difference: 0 })]);
    expect(result.totals).toContainEqual({ fieldKey: "cash_cost", value: 100 });
    expect(result.issues).toEqual([]);
    expect(Object.isFrozen(result.rows)).toBe(true);
  });

  it("supports only the declared finite arithmetic and tolerance modes", () => {
    const input = templateInput();
    const arithmeticTemplate = template({
      fields: [...input.fields, {
        fieldKey: "scaled_cost",
        label: "缩放值",
        order: 8,
        valueType: "number",
        aggregation: "sum",
        source: {
          kind: "formula",
          expression: {
            kind: "multiply",
            left: {
              kind: "add",
              left: { kind: "field", fieldKey: "book_cost" },
              right: { kind: "field", fieldKey: "compensation" },
            },
            right: { kind: "constant", value: 2 },
          },
        },
        required: true,
        allowCorrection: false,
      }],
      checks: [
        { ...input.checks[0]!, checkKey: "relative_match", tolerance: { mode: "relative", rate: 0.01 } },
        { ...input.checks[0]!, checkKey: "either_match", order: 2, tolerance: { mode: "either", amount: 1, rate: 0.01 } },
      ],
    });
    const result = preview({ template: arithmeticTemplate });
    expect(result.rows[0]!.fields.find(({ fieldKey }) => fieldKey === "scaled_cost")?.value).toBe(218);
    expect(result.rows[0]!.checks.map(({ status }) => status)).toEqual(["matched", "matched"]);
  });

  it("is stable across fact order and exact duplicate retries", () => {
    const base = previewInput();
    const secondFact = {
      ...base.facts[0]!,
      sourceFactId: "fact-account-002",
      rowKey: "account-002",
      values: { ...base.facts[0]!.values, account_name: "测试账户B" },
    };
    const first = previewSettlement({ ...base, facts: [base.facts[0]!, secondFact] }, "2026-09-01T05:00:00.000Z");
    const second = previewSettlement({ ...base, facts: [secondFact, base.facts[0]!, secondFact] }, "2026-09-01T05:00:00.000Z");
    expect(second).toEqual(first);
    expect(first.rows.map(({ rowKey }) => rowKey)).toEqual(["account-001", "account-002"]);
    expect(first.totals).toContainEqual({ fieldKey: "book_cost", value: 218 });
  });

  it("blocks missing, invalid and undefined deterministic values without inventing numbers", () => {
    const missing = preview({ facts: [{ ...previewInput().facts[0]!, values: { account_name: "测试账户A" } }] });
    expect(missing.status).toBe("blocked");
    expect(missing.issues.map(({ code }) => code)).toContain("missing_required");
    expect(missing.totals.find(({ fieldKey }) => fieldKey === "book_cost")?.value).toBeNull();

    const invalid = preview({ facts: [{ ...previewInput().facts[0]!, values: { ...previewInput().facts[0]!.values, cost_api: "109" } }] });
    expect(invalid.issues.map(({ code }) => code)).toContain("invalid_field_value");

    const divisionByZero = preview({ facts: [{ ...previewInput().facts[0]!, values: { ...previewInput().facts[0]!.values, channel_coefficient: 0 } }] });
    expect(divisionByZero.issues.map(({ code }) => code)).toContain("undefined_formula");
    expect(divisionByZero.rows[0]!.fields.find(({ fieldKey }) => fieldKey === "cash_cost")?.value).toBeNull();
  });

  it("uses template-declared blocking and warning tolerances without a hidden default", () => {
    const mismatchFacts = [{ ...previewInput().facts[0]!, values: { ...previewInput().facts[0]!.values, rebate: 30 } }];
    const blocked = preview({ facts: mismatchFacts });
    expect(blocked.status).toBe("blocked");
    expect(blocked.issues).toContainEqual(expect.objectContaining({ code: "check_mismatch", severity: "block" }));

    const warningTemplate = template({
      checks: [{ ...templateInput().checks[0]!, severity: "warn" }],
    });
    const warning = preview({ template: warningTemplate, facts: mismatchFacts });
    expect(warning.status).toBe("ready_to_freeze");
    expect(warning.issues).toContainEqual(expect.objectContaining({ code: "check_mismatch", severity: "warn" }));
  });

  it("applies an auditable from-value correction and reruns reconciliation", () => {
    const result = preview({
      facts: [{ ...previewInput().facts[0]!, values: { ...previewInput().facts[0]!.values, rebate: 30 } }],
      corrections: [{
        correctionId: "correction-001",
        rowKey: "account-001",
        fieldKey: "actual_rebate",
        fromValue: 30,
        toValue: 9,
        reason: "按已确认的返点明细修正",
        correctedByUserId: "user-002",
        correctedAt: "2026-09-01T03:30:00.000Z",
        evidenceRef: "evidence-001",
      }],
    });

    expect(result.status).toBe("ready_to_freeze");
    expect(result.rows[0]!.fields.find(({ fieldKey }) => fieldKey === "actual_rebate"))
      .toMatchObject({ value: 9, source: "correction", correctionId: "correction-001" });
    expect(result.rows[0]!.checks[0]).toMatchObject({ status: "matched" });
  });

  it.each([
    { dataBasis: "realtime" },
    { periodStart: "2026-08-32" },
    { periodStart: "2026-09-01", periodEnd: "2026-08-31" },
    { dataCutoffAt: "2026-08-30T23:00:00.000Z" },
    { dataCutoffAt: "2026-09-01T05:00:00.000Z" },
    { generatedAt: "2026-09-01T06:00:00.000Z" },
    { facts: [] },
    { facts: [previewInput().facts[0]!, { ...previewInput().facts[0]!, values: { account_name: "冲突" } }] },
    { facts: [previewInput().facts[0]!, { ...previewInput().facts[0]!, sourceFactId: "another", values: { ...previewInput().facts[0]!.values } }] },
    { corrections: [{ correctionId: "bad", rowKey: "missing", fieldKey: "actual_rebate", fromValue: 9, toValue: 8, reason: "x", correctedByUserId: "u", correctedAt: "2026-09-01T03:30:00.000Z" }] },
    { corrections: [{ correctionId: "bad", rowKey: "account-001", fieldKey: "book_cost", fromValue: 109, toValue: 108, reason: "x", correctedByUserId: "u", correctedAt: "2026-09-01T03:30:00.000Z" }] },
    { corrections: [{ correctionId: "bad", rowKey: "account-001", fieldKey: "actual_rebate", fromValue: 8, toValue: 9, reason: "x", correctedByUserId: "u", correctedAt: "2026-09-01T03:30:00.000Z" }] },
    { unexpected: true },
  ])("rejects invalid preview input %#", (override) => {
    expect(() => previewSettlement({ ...previewInput(), ...override } as never, "2026-09-01T05:00:00.000Z"))
      .toThrow(SettlementError);
  });

  it("deduplicates exact correction retries and rejects conflicting correction ids", () => {
    const correction = {
      correctionId: "correction-001",
      rowKey: "account-001",
      fieldKey: "actual_rebate",
      fromValue: 9,
      toValue: 9,
      reason: "确认实际返点",
      correctedByUserId: "user-002",
      correctedAt: "2026-09-01T03:30:00.000Z",
    } as const;
    expect(preview({ corrections: [correction, correction] }).appliedCorrections).toHaveLength(1);
    expect(() => preview({ corrections: [correction, { ...correction, toValue: 8 }] })).toThrow(SettlementError);
  });

  it("rejects a tampered template and a numeric total beyond the bounded settlement range", () => {
    const original = template();
    expect(() => preview({ template: { ...original, name: "被修改" } as never })).toThrow(SettlementError);

    const base = previewInput().facts[0]!;
    const largeValues = { ...base.values, cost_api: 1_000_000_000_000_000, channel_coefficient: 1, rebate: 0 };
    expect(() => preview({
      facts: [
        { ...base, values: largeValues },
        { ...base, sourceFactId: "large-002", rowKey: "account-002", values: largeValues },
      ],
    })).toThrow(SettlementError);
  });
});

describe("settlement freeze", () => {
  it("freezes only a ready, integrity-checked value snapshot", () => {
    const inputPreview = preview();
    const frozen = freezeSettlementPreview(inputPreview, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z");

    expect(frozen).toMatchObject({
      status: "frozen",
      runId: "settlement-run-001",
      previewFingerprint: inputPreview.fingerprint,
      confirmedByUserId: "user-003",
    });
    expect(frozen.rows).toEqual(inputPreview.rows);
    expect(frozen.templateSnapshot).toEqual(inputPreview.templateSnapshot);
    expect(Object.isFrozen(frozen.rows)).toBe(true);
    expect(frozen.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves a stable multi-step correction chain in the frozen snapshot", () => {
    const correctionA = {
      correctionId: "correction-a",
      rowKey: "account-001",
      fieldKey: "actual_rebate",
      fromValue: 9,
      toValue: 8,
      reason: "第一轮确认",
      correctedByUserId: "user-002",
      correctedAt: "2026-09-01T03:30:00.000Z",
    } as const;
    const correctionB = {
      ...correctionA,
      correctionId: "correction-b",
      fromValue: 8,
      toValue: 9,
      reason: "第二轮复核",
    } as const;
    const correctedPreview = preview({ corrections: [correctionB, correctionA] });
    const frozen = freezeSettlementPreview(correctedPreview, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z");

    expect(frozen.appliedCorrections.map(({ correctionId }) => correctionId))
      .toEqual(["correction-a", "correction-b"]);
    expect(frozen.rows[0]!.fields.find(({ fieldKey }) => fieldKey === "actual_rebate"))
      .toMatchObject({ value: 9, correctionId: "correction-b" });
  });

  it("rejects blocked, tampered and invalidly confirmed previews", () => {
    const blocked = preview({ facts: [{ ...previewInput().facts[0]!, values: { account_name: "测试" } }] });
    expect(() => freezeSettlementPreview(blocked, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z")).toThrow(SettlementError);

    const ready = preview();
    expect(() => freezeSettlementPreview({ ...ready, fingerprint: "f".repeat(64) }, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z")).toThrow(SettlementError);
    expect(() => freezeSettlementPreview(ready, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T03:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z")).toThrow(SettlementError);
  });

  it("rejects a forged ready status even when the outer fingerprint is recalculated", () => {
    const blocked = preview({ facts: [{ ...previewInput().facts[0]!, values: { account_name: "测试" } }] });
    const { fingerprint: oldFingerprint, ...body } = blocked;
    expect(oldFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const forgedBody = { ...body, status: "ready_to_freeze" as const };
    const forged = { ...forgedBody, fingerprint: hash(forgedBody) };
    expect(() => freezeSettlementPreview(forged as never, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z")).toThrow(SettlementError);

    const ready = preview();
    const { fingerprint: readyFingerprint, ...readyBody } = ready;
    expect(readyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const badTimeBody = { ...readyBody, dataCutoffAt: "not-a-time" };
    expect(() => freezeSettlementPreview({ ...badTimeBody, fingerprint: hash(badTimeBody) } as never, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z")).toThrow(SettlementError);

    const changedTotalsBody = {
      ...readyBody,
      totals: readyBody.totals.map((total, index) => index === 0 ? { ...total, value: 999 } : total),
    };
    expect(() => freezeSettlementPreview({
      ...changedTotalsBody,
      fingerprint: hash(changedTotalsBody),
    } as never, {
      confirmedByUserId: "user-003",
      confirmedAt: "2026-09-01T05:30:00.000Z",
    }, "2026-09-01T06:00:00.000Z")).toThrow(SettlementError);
  });
});
