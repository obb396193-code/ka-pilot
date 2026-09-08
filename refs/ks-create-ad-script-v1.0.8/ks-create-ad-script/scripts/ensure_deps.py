#!/usr/bin/env python3
"""
CLI 依赖自动检测与安装。

检测 kuaishou-cli / qihang-cli / qihang-ks-cli / algorithm-cli 是否可用，
缺失时从 skill 自带的 cli/ 副本目录自动 pip install。

目录关系：
  ks-create-ad-script/
  ├── cli/              ← CLI 源码副本
  │   ├── kuaishou-cli/
  │   ├── qihang-cli/
  │   ├── qihang-ks-cli/
  │   └── algorithm-cli/
  └── scripts/
      └── ensure_deps.py  ← 本文件
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys


def _find_skill_cli_dir() -> str:
    """定位 skill 自带的 cli/ 目录（scripts/ 的兄弟目录）。"""
    scripts_dir = os.path.dirname(os.path.abspath(__file__))  # .../scripts
    skill_dir = os.path.dirname(scripts_dir)                   # .../ks-create-ad-script
    return os.path.join(skill_dir, "cli")


def _pip_install(cli_dir: str) -> None:
    """pip install，兼容 externally-managed-environment（容器/沙箱）。"""
    base_cmd = [sys.executable, "-m", "pip", "install", "--quiet", cli_dir]
    result = subprocess.run(base_cmd, capture_output=True, text=True, timeout=120)
    if result.returncode == 0:
        return
    stderr = (result.stderr or "").lower()
    if "externally-managed-environment" in stderr:
        result = subprocess.run(
            base_cmd + ["--break-system-packages"],
            capture_output=True, text=True, timeout=120,
        )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()[:500]
        raise RuntimeError(f"pip install 失败: {err}")


def ensure_cli_deps(cli_names: list[str]) -> None:
    """
    确保指定的 CLI 工具可用，缺失时从 skill 自带的 cli/ 目录安装。

    Args:
        cli_names: CLI 名称列表，需与 cli/ 下子目录名一致。

    Raises:
        RuntimeError: CLI 源码不存在或安装后仍不可用时抛出。
    """
    missing = [name for name in cli_names if not shutil.which(name)]
    if not missing:
        return

    cli_base = _find_skill_cli_dir()
    if not os.path.isdir(cli_base):
        raise RuntimeError(
            f"CLI 依赖缺失: {', '.join(missing)}，且 cli/ 目录不存在: {cli_base}"
        )

    for name in missing:
        cli_dir = os.path.join(cli_base, name)
        if not os.path.isfile(os.path.join(cli_dir, "pyproject.toml")):
            raise RuntimeError(
                f"CLI 依赖缺失: {name}，源码目录不存在或缺少 pyproject.toml: {cli_dir}"
            )

        print(f"[deps] 安装 {name} (from {cli_dir})...")
        _pip_install(cli_dir)

        if not shutil.which(name):
            raise RuntimeError(f"安装 {name} 完成但仍无法找到可执行文件（可能需要刷新 PATH）")

        print(f"[deps] {name} 安装成功")


if __name__ == "__main__":
    cli_list = sys.argv[1:] or ["kuaishou-cli", "qihang-cli", "qihang-ks-cli", "algorithm-cli"]
    try:
        ensure_cli_deps(cli_list)
        print("[deps] 所有 CLI 依赖就绪")
    except RuntimeError as e:
        print(f"[deps] ERROR: {e}", file=sys.stderr)
        sys.exit(1)
