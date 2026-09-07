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
today = dt.date(2026,9,6); COEF = 0.7812
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
