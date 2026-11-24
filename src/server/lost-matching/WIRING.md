# Handoff B → A 接线说明

## 装配

1. 数据目录租约拿到之后调用 `createLostMatching({ config, store, resolveActor, reviewSubmission, isApprovedVersion, matchAi? })`。
2. `business.mountExtraApi((r) => handles.mountRoutes(r))`。
3. `handles.scheduler.start()`；关闭时先 `await handles.scheduler.stop()`，再释放文件锁。
4. 健康检查路径不要调用上述逻辑。

## 依赖注入

| 依赖 | 来源 |
| --- | --- |
| `resolveActor` | A 的平台身份；本地测试可用 `createTestResolveActor` |
| `reviewSubmission` / `isApprovedVersion` | C；未接入时生产必须 `unavailable`，禁止默认 allowed |
| `matchAi` | 默认 DeepSeek；测试传入假模型 |

## 前端

- 组件：`LostPanel`、`MessagesPanel`
- 面板名：`lost`、`messages`
- 现有「浏览招领」保留为 `browse`，与发寻物分离

## 接口

- `/api/lost-posts` GET/POST，`/api/lost-posts/:id` GET/PATCH
- `/api/messages` GET，`/api/messages/:id` GET，`.../read`、`.../dismiss` POST
