# KPI Component Demo · Third-party sources

## Tremor Blocks

- Repository: <https://github.com/tremorlabs/tremor-blocks>
- Commit: `b319e8d3d3678a4f60f4802f7e85bc1abc52d598`
- License: MIT
- Official block structure: `src/content/components/kpi-cards/kpi-card-14.tsx`
- Copied source files:
  - `src/components/Card.tsx`
  - `src/components/SparkChart.tsx`
  - `src/components/CategoryBar.tsx`
  - `src/components/Tracker.tsx`
  - `src/components/Tooltip.tsx`
  - `src/lib/chartUtils.ts`
  - `src/lib/utils.ts`

Local adaptation is limited to relative import paths, desensitized Chinese advertising data, and removing `key` before spreading Tracker block props for React 19 compatibility. Official source comments and `tremor-id="tremor-raw"` markers are retained.
