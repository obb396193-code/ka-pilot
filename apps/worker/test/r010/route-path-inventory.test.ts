import { describe, expect, it } from "vitest";
import { sourcePaths } from "./route-path-inventory.js";

describe("R010 route inventory parser", () => {
  it("finds literals and regex while excluding comments", () => {
    const source = 'const a="/api/v1/tasks"; const b=/^\\/api\\/v1\\/work-items\\/([^/]+)$/; // "/api/v1/fake"';
    expect(sourcePaths(source)).toEqual({ paths: ["/api/v1/tasks", "/api/v1/work-items/:p"], unresolved: [] });
  });
  it("expands conditional suffixes rather than treating the whole suffix as one parameter", () => {
    expect(sourcePaths('const p=`/api/v1/admin/members${id ? `/${id.toLowerCase()}/grants` : ""}`')).toEqual({
      paths: ["/api/v1/admin/members", "/api/v1/admin/members/:p/grants"], unresolved: [] });
  });
  it("resolves literal-union resource parameters with origin interpolation", () => {
    expect(sourcePaths('type Kind="work-items"|"changesets"; function f(kind:Kind,id:string) {return `${config.origin}/api/v1/${kind}/${id}`}')).toEqual({
      paths: ["/api/v1/changesets/:p", "/api/v1/work-items/:p"], unresolved: [] });
  });
  it("preserves correlated regex-capture guards instead of inventing cross-product operations", () => {
    expect(sourcePaths('if (item && ((item[1]==="work-items" && item[3]==="ignore") || (item[1]==="changesets" && item[3]==="dry-run"))) {const p=`/api/v1/${item[1]}/${id}/${item[3]}`}')).toEqual({
      paths: ["/api/v1/changesets/:p/dry-run", "/api/v1/work-items/:p/ignore"], unresolved: [] });
  });
  it("refuses unknown resource names and unbounded route regex rather than silently green", () => {
    expect(sourcePaths('const p=`/api/v1/${unknown}/${id}`').unresolved).toHaveLength(1);
    expect(sourcePaths('const p=/^\\/api\\/v1\\/prefix/').unresolved).toHaveLength(1);
  });
});
