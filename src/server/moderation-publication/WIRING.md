# Handoff C → A / B 接线说明

## A 必做

1. 数据锁就绪后 `createModerationPublication({ config, store, resolveActor })`。
2. `business.mountExtraApi((r) => handles.mountRoutes(r))`。
3. **删除** `app.ts` 里旧的 `POST/PATCH /api/items` 直接公开写入，改走 `/api/found-posts*`。
4. **删除** 对 `/uploads` 的无条件 `express.static`；公开图只经 `/api/media/uploads/:name` 或本模块挂载的受控 `/api/uploads/:name`。
5. 列表/详情只展示 `isApprovedVersion(post)` 为真的招领；给 Item 持久化 `revision` + `publication`。
6. 历史未审数据按迁移步骤补审，不能默认当已通过。

## B 注入

```ts
createLostMatching({
  config,
  store,
  resolveActor, // 同 A
  reviewSubmission: handles.reviewSubmission,
  isApprovedVersion: handles.isApprovedVersion,
})
```

生产禁止默认 `allowed` 替身。

## 前端（C 已改 FoundPanel / useFound）

- 先 `POST /api/found-posts/staging` 得 `imageRef`
- 再 `POST /api/found-posts` JSON：`{ description, place, office, imageRef }`
- 编辑：`PATCH /api/found-posts/:id` 带 `baseRevision`
- 审核失败：`422/503` + `{ status, issues: [{ field, message }] }`

## 公共端

调用 `useFound` 返回的 `reset` / `cancel`（dispose）清空表单与进行中请求，避免串台。
