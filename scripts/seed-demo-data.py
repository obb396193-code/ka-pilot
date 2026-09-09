#!/usr/bin/env python3
"""演示用合成数据：形状真实、数值合理、故意留缺数与异常，让每页都有东西看且能验三态。
合成假数据，账户名按 ka-src-0003 的 12 段命名规范拼，任务 ID 用规范里带的真 ID。"""
import subprocess, random, datetime as dt, json, sys
DB = "postgres://ka:ka@127.0.0.1:55432/ka_pilot_local"
WS_P = "00000000-0000-4000-8000-000000000091"   # 个人空间
USER = "00000000-0000-4000-8000-000000000092"
random.seed(20260907)

def sql(q):
    r = subprocess.run(["psql", DB, "-v", "ON_ERROR_STOP=1", "-q", "-c", q],
                       capture_output=True, text=True)
    if r.returncode: print("SQL 失败:", r.stderr.strip()[:400]); sys.exit(1)
    return r.stdout

# 12 段：渠道-业务-运营方-优化师-出价模式-设备-流量版位-出价目标-RTA-专项-承接-自定义
ACCOUNTS = [
    ("KUAISHOU","account-1","DAU-CVR有端-自投-张三-单出价-安卓-优选-激活-有R-常规-13177-A", "1803240580","CVR有端","优选","self",  38.0,"green"),
    ("KUAISHOU","account-2","DAU-CVR有端-自投-张三-单出价-IOS-上下滑-激活-有R-常规-13178-B",  "1803240580","CVR有端","上下滑","self", 38.0,"red"),
    ("KUAISHOU","account-3","DAU-M运动-代投-某代理-双出价-双端-联盟-付费-非R-一户一品-13179-C","280707655","M运动","联盟","agency",52.0,"green"),
    ("KUAISHOU","account-4","DAU-M运动-代投-某代理-单出价-安卓-主站-付费-非R-常规-13180-D",   "280707655","M运动","主站","agency", 52.0,"yellow"),
    ("KUAISHOU","account-5","DAU-闲鱼DAU-自投-李四-单出价-安卓-搜索-唤起-有R-常规-13181-E",  "1278297263","闲鱼DAU","搜索","self",29.0,"red"),
    ("KUAISHOU","account-6","没按规范起的名字_测试户",                                      None,None,None,"unknown",29.0,"green"),
]
print("① 账户与任务")
sql(f"DELETE FROM changeset_items WHERE workspace_id='{WS_P}'"); sql(f"DELETE FROM changesets WHERE workspace_id='{WS_P}'"); sql(f"DELETE FROM work_items WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM account_access_grants WHERE workspace_id='{WS_P}'")   # 授权引用账户，必须先删
sql(f"DELETE FROM account_metrics_daily WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM task_accounts WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM assessment_price_history WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM accounts WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM tasks WHERE workspace_id='{WS_P}'")
tasks = {}
for _m,_a,_n,tid,tname,_p,_g,_pr,_c in ACCOUNTS:
    if tid and tid not in tasks: tasks[tid]=tname
for tid,tname in tasks.items():
    sql(f"INSERT INTO tasks(workspace_id,task_id,task_name) VALUES('{WS_P}','{tid}',$${tname}$$)")
for media,aid,name,tid,_tn,_p,_g,_pr,_c in ACCOUNTS:
    sql(f"INSERT INTO accounts(workspace_id,media,account_id,account_name,owner_user_id,lifecycle_stage) "
        f"VALUES('{WS_P}','{media}','{aid}',$${name}$$,'{USER}','stable')")
    if tid:
        sql(f"INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) "
            f"VALUES('{WS_P}','{tid}','{media}','{aid}','2026-08-01')")

print("② 考核价（多版本，验 priceSource / priceVersions）")
for media,aid,_n,tid,_tn,_p,_g,price,_c in ACCOUNTS:
    if not tid: continue
    sql(f"INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) "
        f"VALUES('{WS_P}','{tid}',{price},'2026-08-01') ON CONFLICT DO NOTHING")
sql(f"INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) "
    f"VALUES('{WS_P}','1803240580',36.0,'2026-09-03') ON CONFLICT DO NOTHING")

print("③ 31 天指标（含缺数日、异常日）")
# 业务日 = 上海时间 03:00 日切（与 domain shanghaiTaskBusinessDate 同口径）；灌到业务日当天，窗口才完整（v4，2026-09-09）
today = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8-3)).date(); COEF = 0.7812
rows=[]
for media,aid,_n,tid,_tn,_p,_g,price,_c in ACCOUNTS:
    base = random.uniform(1800,4200)
    for d in range(31):
        ds = today - dt.timedelta(days=30-d)
        # account-2 最近三天故意缺数（验 partial / 显 −）
        if aid=="account-2" and d>=28:
            rows.append((media,aid,ds,None,None,None,None,None,None,False)); continue
        cost = round(base*random.uniform(0.75,1.3),2)
        exposure = int(cost*random.uniform(70,95)); click = int(exposure*random.uniform(0.02,0.045))
        conv = int(click*random.uniform(0.05,0.09)); real = int(conv*random.uniform(0.82,0.97))
        anomaly = (aid=="account-5" and d==25)
        if anomaly: cost*=3.4
        rows.append((media,aid,ds,round(cost,2),exposure,click,conv,real,price,anomaly))
vals=[]
for media,aid,ds,cost,exp,clk,conv,real,price,anom in rows:
    if cost is None:
        vals.append(f"('{WS_P}','{media}','{aid}','{ds}',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false)")
    else:
        cash=round(cost*COEF,2); rcpa=round(cost/real,2) if real else None
        ccpa=round(cash/real,2) if real else None
        space=round(real*price-cash,2) if real and price else None
        gap=round((conv-real)/real,4) if real else None
        f=lambda v:'NULL' if v is None else v
        vals.append(f"('{WS_P}','{media}','{aid}','{ds}',{cost},{exp},{clk},{conv},{real},{f(rcpa)},{cash},{f(ccpa)},{f(space)},{f(gap)},{f(price)},{'true' if anom else 'false'})")
for i in range(0,len(vals),60):
    sql("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,exposure,click,conversion,"
        "real_conversion,real_cpa,cash_cost,cash_cpa,cost_space,gap,assessment_price_snapshot,data_anomaly) VALUES "
        + ",".join(vals[i:i+60]))
print(f"   灌了 {len(vals)} 行")
print("\n完成。账户 6（其中 1 个不按命名规范）、任务 3、31 天指标、缺数 3 天、异常 1 天。")

# ---------- ④ 工作项 / 变更集草稿 / 通知（2026-09-08 追加，让工作台·变更集·通知铃有东西）----------
print("④ 工作项 + 变更集草稿")
sql(f"DELETE FROM changeset_items WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM changesets WHERE workspace_id='{WS_P}'")
sql(f"DELETE FROM work_items WHERE workspace_id='{WS_P}'")
W = [
 # (type, media, account, task, severity, title, status, evidence, diagnosis)
 ("diagnosis","KUAISHOU","account-2","1803240580","P0","现金 CPA 连续 2 日高于考核价：41.0 vs 38.0","open",
  {"snapshot_at":"2026-09-06T08:00:00+08:00","cashCpa":41.0,"price":38.0,"days":2,"realConversion":118},
  {"cause":"bid_too_high","confidence":0.86,"suggestion":"unit 出价下调 5%，先试运行"}),
 ("diagnosis","KUAISHOU","account-5","1278297263","P1","昨日消耗异常放量 3.4 倍，转化未同步上涨","open",
  {"snapshot_at":"2026-09-06T08:00:00+08:00","cost":8213.4,"baseline":2416.0,"realConversion":49},
  {"cause":"budget_spike","confidence":0.74,"suggestion":"核对日预算上限与自动出价"}),
 ("diagnosis","KUAISHOU","account-4","280707655","P1","达标黄区：现金 CPA 贴近考核价（51.2 / 52.0）","processing",
  {"snapshot_at":"2026-09-06T08:00:00+08:00","cashCpa":51.2,"price":52.0},
  {"cause":"margin_thin","confidence":0.66,"suggestion":"观察 1 日，不动"}),
 ("diagnosis","KUAISHOU","account-2","1803240580","P2","最近 3 日现金缺数，达标未判","open",
  {"snapshot_at":"2026-09-06T08:00:00+08:00","missingDays":3},
  {"cause":"data_missing","confidence":None,"suggestion":"等启航离线口径补齐，不补 0"}),
 ("dispatch",None,None,"1278297263","P1","派发：闲鱼DAU 任务本周复盘，请补交承接页转化数据","open",
  {"snapshot_at":"2026-09-06T09:00:00+08:00"},{"cause":None,"confidence":None,"suggestion":None}),
 ("diagnosis","KUAISHOU","account-1","1803240580","opportunity","账户 1 现金 CPA 5.05 远低于考核价 38，有加量空间","open",
  {"snapshot_at":"2026-09-06T08:00:00+08:00","cashCpa":5.05,"price":38.0,"headroom":32.95},
  {"cause":"headroom","confidence":0.71,"suggestion":"日预算 +20%，走变更集"}),
 ("diagnosis","KUAISHOU","account-3","280707655","P2","上周同一规则已处理，本周未再触发","done",
  {"snapshot_at":"2026-08-30T08:00:00+08:00"},{"cause":"resolved","confidence":0.9,"suggestion":None}),
]
ids=[]
for typ,media,acc,task,sev,title,status,ev,dg in W:
    m = f"'{media}'" if media else "NULL"; a = f"'{acc}'" if acc else "NULL"
    resolved = "now()" if status=="done" else "NULL"
    out = sql(f"""INSERT INTO work_items(workspace_id,type,media,account_id,task_id,severity,title,status,evidence_snapshot,diagnosis,assignee,creator,sla_due,resolved_at,last_triggered_at)
      VALUES('{WS_P}','{typ}',{m},{a},'{task}','{sev}',$${title}$$,'{status}',$${json.dumps(ev,ensure_ascii=False)}$$::jsonb,$${json.dumps(dg,ensure_ascii=False)}$$::jsonb,'{USER}','{USER}',now()+interval '1 day',{resolved},now()) RETURNING id""")
    ids.append(out.strip().split("\n")[-1].strip() if out else None)
print(f"   工作项 {len(W)} 条（P0 1 / P1 3 / P2 2 / 机会 1）")
# 变更集草稿：挂在 P0 那条上，3 明细与 fixtures/changesets/dry-run-ok.json 同形
cs = sql(f"""INSERT INTO changesets(workspace_id,work_item_id,media,account_id,title,status,initiator,credential_owner_user_id,ttl_expire_at,reason_code)
  SELECT '{WS_P}', id, 'KUAISHOU','account-2','出价下调 5%（试运行草稿）','draft','{USER}','{USER}', now()+interval '2 hours','cpa_over_target'
  FROM work_items WHERE workspace_id='{WS_P}' AND severity='P0' LIMIT 1 RETURNING id""")
csid = [l for l in cs.strip().split("\n") if "-" in l][-1].strip()
# v1.3 起 from/to 是带类型 JSON（{type,value}），裸数字过不了 preflightDraftItemsSchema（联调实测 500）
for tt,tid,field,fv,tv in [("unit","unit-8801","bid",40,38),("unit","unit-8802","bid",42,39),("account","account-2","daily_budget",3000,3600)]:
    fj=json.dumps({"type":"number","value":fv}); tj=json.dumps({"type":"number","value":tv})
    sql(f"INSERT INTO changeset_items(changeset_id,workspace_id,media,account_id,target_type,target_id,field,from_value,to_value) VALUES('{csid}','{WS_P}','KUAISHOU','account-2','{tt}','{tid}','{field}','{fj}'::jsonb,'{tj}'::jsonb)")
print("   变更集草稿 1 个（3 明细，挂 P0 工作项）")

# ---------- ⑤ 账户授权（没有这一步接口一律返 0 行：账户级授权是硬门）----------
IDENTITY="00000000-0000-4000-8000-000000000090"
sql(f"""INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level)
  SELECT workspace_id,'{IDENTITY}',media,account_id,'preview' FROM accounts WHERE workspace_id='{WS_P}' ON CONFLICT DO NOTHING""")
print("⑤ 授权 6 户（preview）")
print("\n全部完成：账户 6 / 任务 3 / 指标 186 行 / 工作项 7 / 变更集草稿 1 / 授权 6。")

# ---------- ⑥ 演示账号升 admin + 快手 v1 命名规范（归属清洗页要有东西）----------
import os
sql(f"UPDATE workspace_memberships SET role='admin' WHERE identity_id='{IDENTITY}' AND workspace_id='{WS_P}'")
rule=json.load(open(os.path.join(os.path.dirname(__file__),'seed-naming-rule-kuaishou-v1.json'),encoding='utf-8'))
sql(f"DELETE FROM naming_rules WHERE workspace_id='{WS_P}' AND media='KUAISHOU'")
sql(f"""INSERT INTO naming_rules(workspace_id,media,version,segments,separators,effective_from,note)
  VALUES('{WS_P}','KUAISHOU',1,$${json.dumps(rule['segments'],ensure_ascii=False)}$$::jsonb,ARRAY['-','－','_'],'2026-09-01','快手 v1，来源 ka-src-0003 §4.3')""")
print("⑥ 演示账号 → admin；快手 v1 命名规范（13 段）已写入。解析结果需起服务后 POST /api/v1/admin/account-names/reparse {media:KUAISHOU}")
