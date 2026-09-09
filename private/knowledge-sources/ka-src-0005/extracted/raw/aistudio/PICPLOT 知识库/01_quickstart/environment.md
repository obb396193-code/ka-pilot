# 💻 环境搭建与开发配置

本指南旨在帮助新同学快速拉起 PICPLOT 的本地开发环境。

## 1. 基础环境
- **Python**: 3.10 (强制要求)
- **依赖管理**: pip
- **IDE 推荐**: PyCharm (支持 FastAPI Debug 模式)

## 2. 快速安装
在项目根目录下执行：
```bash
sh local_pip_install.sh
```

## 3. 配置文件
项目使用 YAML 格式的配置文件，位于 `src/app/config/` 下或通过环境变量加载。
本地调试时，请确保 `application-local.yml` 中的以下信息已正确配置：
- MySQL 数据库连接
- Redis 地址
- 阿里云 OSS 访问凭证 (AccessKey)
- 内部 API 服务 (IdeaLab, Bailian) 的 Token

## 4. 启动项目
### 4.1 PyCharm 启动 (推荐)
1.  新建 **FastAPI** 运行配置。
2.  Application File: `src/main.py`
3.  Application Name: `app`
4.  Uvicorn Options: `--reload` (启用热更新)

### 4.2 脚本启动
```bash
sh local_gunicorn_restart.sh
```

## 5. 常见路径
- **代码根目录**: `src/`
- **静态资源**: `src/static/`
- **日志输出**: `logs/`