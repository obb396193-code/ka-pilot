# KA Pilot 字体对比 Demo 资源说明

本目录只服务于 `apps/ui-layout-demo/font-comparison.html` 的本地视觉比较，不代表已选定正式字体。

| 字体              | 用途                      | 本地来源                                 | 当前处理                                                                      |
| ----------------- | ------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Geist             | shadcn 英文字形参照       | 项目已有 `geist` 包                      | 本地加载                                                                      |
| Inter             | 当前英文字形参照          | 项目已有 `@fontsource-variable/inter` 包 | 本地加载                                                                      |
| Hanken Grotesk    | ContentRadar 风格英文参照 | `@fontsource-variable/hanken-grotesk`    | 本地加载                                                                      |
| Noto Sans SC      | 固定中文字体候选          | `@fontsource-variable/noto-sans-sc`      | 本地加载，OFL-1.1                                                             |
| MiSans            | 固定中英文字体候选        | npm `misans` 字体切片                    | 本地加载 Regular/Medium/Semibold/Bold/Heavy；正式分发前必须按小米官方许可复核 |
| HarmonyOS Sans SC | 固定中英文字体候选        | HarmonyOS Sans 官方资源包                | 本地加载，保留包内许可                                                        |

说明：Geist / Inter + 系统中文两组故意不内置中文，用来观察 macOS 与 Windows 回退字体差异。其余组在页面中加载中文字体文件，用于比较跨平台固定后的效果与资源体积。
