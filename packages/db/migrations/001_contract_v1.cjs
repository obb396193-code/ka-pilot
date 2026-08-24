const fs = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  pgm.sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  const snapshot = fs.readFileSync(
    path.join(__dirname, "sql", "001_contract_v1.sql"),
    "utf8",
  );
  pgm.sql(snapshot);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS audit_log, assets, report_configs, inbound_events,
      outbound_messages, subscriptions, identity_mappings, integration_connections,
      agent_runs, agent_memory, agent_context_items, agent_messages, agent_sessions,
      infra_requests, multica_threads, business_calendar, duty_roster,
      data_quality_checks, backfill_jobs, etl_runs, jobs, workflow_run_events,
      workflow_runs, workflow_versions, workflow_definitions, alert_rules,
      execution_runs, changeset_items, changesets, work_items, account_balance,
      ad_entities, ad_metrics_hourly, account_metrics_daily, metrics_raw,
      task_accounts, accounts, channel_coefficients, assessment_price_history,
      tasks, users, workspaces CASCADE;
  `);
};
