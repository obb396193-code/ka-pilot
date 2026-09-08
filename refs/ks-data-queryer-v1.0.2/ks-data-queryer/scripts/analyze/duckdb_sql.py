"""在内存中用 DuckDB 对 pandas DataFrame 执行 SQL，结果仍为 DataFrame。"""

from __future__ import annotations

import duckdb
import pandas as pd


def query_dataframe(
    df: pd.DataFrame,
    sql: str,
    *,
    table_name: str = "t",
) -> pd.DataFrame:
    """
    将单个 DataFrame 注册为 `table_name`（默认 `t`），执行 SQL，返回新 DataFrame。

    示例::

        df = records_io.load_records_json("account_load_xxx.json")
        out = query_dataframe(df, "SELECT account_id, ds, ctr FROM t WHERE ctr > 0.01")
    """
    con = duckdb.connect(database=":memory:")
    con.register(table_name, df)
    return con.execute(sql).df()


def query_dataframes(
    tables: dict[str, pd.DataFrame],
    sql: str,
) -> pd.DataFrame:
    """
    将多表注册后执行 SQL。`tables` 的 key 为 SQL 中的表名。

    示例::

        query_dataframes(
            {"cur": df_today, "prev": df_yesterday},
            "SELECT cur.account_id, cur.account_cost - prev.account_cost AS delta "
            "FROM cur INNER JOIN prev ON cur.account_id = prev.account_id",
        )
    """
    if not tables:
        raise ValueError("tables 不能为空")
    con = duckdb.connect(database=":memory:")
    for name, df in tables.items():
        con.register(name, df)
    return con.execute(sql).df()


def run_sql(sql: str, **named_frames: pd.DataFrame) -> pd.DataFrame:
    """
    关键字参数为「SQL 中的表名 → DataFrame」::

        run_sql("SELECT * FROM a WHERE ds = '20260414'", a=df)
    """
    return query_dataframes(named_frames, sql)
