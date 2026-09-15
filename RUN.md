# KA Pilot web 预编译产物（standalone）
源提交：见 SOURCE_SHA。启动（ENV 与原 next dev 相同，如 KA_DATA_BACKEND_ORIGIN 等）：
    HOSTNAME=0.0.0.0 PORT=3000 node apps/web/server.js
不需要 npm install，不需要 next build；内存占用数百 MB。每次 main 上前端/契约有改动都会重新推送本分支，`git fetch` 后重启即可。
