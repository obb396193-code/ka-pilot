import { describe, expect, it } from "vitest";
import { buildMetricFilter } from "../src/semantic-query-support.js";
const account = { media: "KUAISHOU", accountId: "a" };
const scope = { workspaceId: "00000000-0000-4000-8000-000000000041", dateFrom: "2026-09-01", dateTo: "2026-09-02",
  filters: { accountScopes: [account], accountDays: [{ ...account, ds: "2026-09-01" }] } };
describe("internal account-day intersection SQL", () => {
  it("keeps approved tuple and exact day predicates together, no interpolated selectors", () => {
    const result = buildMetricFilter(scope);
    expect(result.whereSql).toContain('(metric.media,metric.account_id,metric.ds) IN');
    expect(result.whereSql).toContain('SELECT selected.media,selected."accountId",selected.ds');
    expect(result.whereSql).toContain('scoped.media = metric.media');
    expect(result.whereSql).toContain('scoped.account_id = metric.account_id');
    expect(result.values).toContain(JSON.stringify(scope.filters.accountDays));
  });
  it("explicit empty date selection is false, never all approved accounts", () => {
    expect(buildMetricFilter({ ...scope, filters: { ...scope.filters, accountDays: [] } }).whereSql).toContain("false");
  });
  it.each([
    [{ media: "TENCENT", accountId: "a", ds: "2026-09-01" }],
    [{ ...account, ds: "2026-09-03" }], [{ ...account, ds: "2026-02-31" }],
    [scope.filters.accountDays[0], scope.filters.accountDays[0]], null,
  ])("rejects invalid or out-of-grant day subset %j", accountDays => {
    expect(() => buildMetricFilter({ ...scope, filters: { ...scope.filters, accountDays } } as never)).toThrow();
  });
  it("does not accept internal selected days without explicit grants", () => {
    expect(() => buildMetricFilter({ ...scope, filters: { accountDays: scope.filters.accountDays } } as never)).toThrow();
  });
});
