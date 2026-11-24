import { test, expect } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
test.beforeEach(async ({ request }) => {
  const login = await request.post("/api/admin/login", {
    data: { pin: "fixture-pin" },
  });
  const { token } = await login.json();
  const response = await request.get("/api/items", {
    headers: { "X-Admin-Token": token },
  });
  for (const item of (await response.json()).items)
    await request.delete("/api/items/" + item.id, {
      headers: { "X-Admin-Token": token },
    });
});
async function enter(page: import("@playwright/test").Page, admin = false) {
  await page.goto("/");
  if (admin) {
    await page.locator("#roleAdmin").click();
    await page.locator("#adminPinInput").fill("fixture-pin");
  }
  await page.locator("#btnEnterSystem").click();
  await expect(page.locator("#gate")).toBeVisible();
}
test("publishes, edits, filters and deletes using the original interaction flow", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await enter(page);
  await page.locator("#enterFound").click();
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#toast")).toHaveText("请先拍照或从相册选择图片");
  await page
    .locator("#fileInput")
    .setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#previewImg")).toHaveClass("show");
  await expect(page.locator("#aiStatus")).not.toHaveClass(/thinking/);
  await page.locator("#description").fill("浏览器测试蓝色水杯");
  await page.locator("#office").selectOption("食堂一层失物招领处");
  await page.locator("#place").fill("食堂门口");
  await page.locator("#contact").fill("测试联系人");
  await page.locator("#contactType").selectOption("邮箱");
  await page.locator("#contactValue").fill("fixture@example.test");
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#panel-history")).toBeVisible();
  const row = page
    .locator(".history-card")
    .filter({ hasText: "浏览器测试蓝色水杯" });
  await expect(row).toBeVisible();
  await row.locator(".btn-edit").click();
  await expect(page.locator("#description")).toHaveValue("浏览器测试蓝色水杯");
  await page.locator("#description").fill("浏览器测试已修改");
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#panel-history")).toBeVisible();
  await page.locator('[data-panel="browse"]').click();
  await page.locator("#searchInput").fill("浏览器测试已修改");
  await expect(page.locator(".item-card")).toHaveCount(1);
  await page.locator(".item-card").click();
  await expect(page.locator("#detailTitle")).toHaveText("浏览器测试已修改");
  await expect(page.locator("#sensitiveBlock")).toBeVisible();
  await page.locator("#closeDetail").click();
  await page.locator("#searchInput").fill("没有这个测试物品");
  await expect(page.locator("#emptyState")).toBeVisible();
  await page.locator("#clearFilters").click();
  await page.locator('[data-panel="history"]').click();
  await page
    .locator(".history-card")
    .filter({ hasText: "浏览器测试已修改" })
    .locator(".btn-del")
    .click();
  await expect(
    page.locator(".history-card").filter({ hasText: "浏览器测试已修改" }),
  ).toHaveCount(0);
});
test("extracts form text locally and handles camera permission failure", async ({
  page,
}) => {
  await enter(page);
  await page.locator("#enterFound").click();
  await page
    .locator("#fillText")
    .fill("食堂门口捡的，交食堂一层失物招领处，联系人小唐，电话13800138000");
  await page.locator("#btnTextExtract").click();
  await expect(page.locator("#office")).toHaveValue("食堂一层失物招领处");
  await expect(page.locator("#place")).toHaveValue("食堂门口");
  await expect(page.locator("#contactValue")).toHaveValue("13800138000");
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new Error("permission denied"));
  });
  await page.locator("#btnCamera").click();
  await expect(page.locator("#toast")).toHaveText(
    "无法打开摄像头，请改用相册上传",
  );
});
test("keeps mobile entry and navigation usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.locator("#enterLost").click();
  await expect(page.locator("#panel-browse")).toBeVisible();
  await page.locator('[data-panel="history"]').click();
  await expect(page.locator("#panel-history")).toBeVisible();
  await page.locator("#backGate").click();
  await expect(page.locator("#gate")).toBeVisible();
});
test("admin can claim, verify, unlock and delete; outsider can unlock and claim", async ({
  page,
  request,
  browser,
}) => {
  const form = {
    ownerId: "pub_browser_fixture",
    description: "管理测试物品",
    office: "图书馆总服务台",
    place: "图书馆二楼",
    image: { name: "fixture.png", mimeType: "image/png", buffer: png },
  };
  const response = await request.post("/api/items", { multipart: form });
  expect(response.status()).toBe(201);
  const { item } = await response.json();
  const outsider = await browser.newPage();
  outsider.on("dialog", (d) => d.accept());
  await outsider.goto("http://127.0.0.1:3188/");
  await outsider.locator("#btnEnterSystem").click();
  await outsider.locator("#enterLost").click();
  await outsider
    .locator(".item-card")
    .filter({ hasText: "管理测试物品" })
    .click();
  await expect(outsider.locator("#privacyNote")).toBeVisible();
  await outsider.locator("#btnClaim").click();
  await expect(outsider.locator("#unlockBox")).toBeVisible();
  for (const [id, value] of Object.entries({
    unlockName: "测试同学",
    unlockIdNo: "test-001",
    unlockContact: "fixture@example.test",
  }))
    await outsider.locator("#" + id).fill(value);
  await outsider.locator("#confirmUnlock").click();
  await expect(outsider.locator("#sensitiveBlock")).toBeVisible();
  await outsider.locator("#btnClaim").click();
  for (const [id, value] of Object.entries({
    claimName: "测试同学",
    claimIdNo: "test-001",
    claimContact: "fixture@example.test",
  }))
    await outsider.locator("#" + id).fill(value);
  await outsider.locator("#confirmClaim").click();
  await expect(outsider.locator("#lockedNote")).toBeVisible();
  await outsider.close();
  page.on("dialog", (d) =>
    d.type() === "prompt" ? d.accept("信息属实，核对通过") : d.accept(),
  );
  await enter(page, true);
  await page.locator("#enterLost").click();
  await page.locator("#navAdmin").click();
  const row = page.locator(".admin-card").filter({ hasText: "管理测试物品" });
  await expect(row.locator(".view-log-item")).toHaveCount(1);
  await row.locator(".btn-toggle-claim").click();
  await expect(row.locator(".badge-open").first()).toHaveText("待认领");
  await row.locator(".btn-view").click();
  await page.locator("#btnVerify").click();
  await expect(page.locator("#btnUnverify")).toBeVisible();
  await page.locator("#btnUnverify").click();
  await expect(page.locator("#btnVerify")).toBeVisible();
  await page.locator("#btnAdminDelete").click();
  await expect(page.locator("#detailModal")).toHaveCount(0);
  expect((await request.get("/api/items/" + item.id)).status()).toBe(404);
});
test("ignores stale AI results after selecting another picture", async ({
  page,
}) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ json: { configured: true, model: "deepseek-flash" } }),
  );
  let calls = 0;
  await page.route("**/api/ai/vision", async (route) => {
    const number = ++calls;
    if (number === 1) await new Promise((r) => setTimeout(r, 300));
    await route
      .fulfill({ json: { text: number === 1 ? "旧图片结果" : "新图片结果" } })
      .catch(() => {});
  });
  await enter(page);
  await page.locator("#enterFound").click();
  await page
    .locator("#fileInput")
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: png });
  await expect.poll(() => calls).toBe(1);
  await page
    .locator("#fileInput")
    .setInputFiles({ name: "b.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#description")).toHaveValue("新图片结果");
  await page.waitForTimeout(400);
  await expect(page.locator("#description")).toHaveValue("新图片结果");
  expect(calls).toBe(2);
});
test("intro submits feedback and links to the actual repository", async ({
  page,
}) => {
  await page.goto("/intro.html");
  await expect(page.locator("#githubLink")).toHaveAttribute(
    "href",
    "https://github.com/lavia123/RDFZ-shiguang",
  );
  await page.locator('[name="message"]').fill("浏览器测试反馈");
  await page.locator("#feedbackForm button").click();
  await expect(page.locator("#formStatus")).toHaveText(
    "已收到，谢谢你的反馈！",
  );
});

test("development server never serves private state or server source", async ({
  request,
}) => {
  for (const url of [
    "/data/items/item_test.json",
    "/.data-ui/items/item_test.json",
    "/src/server/config.ts",
    "/package.json",
    "/.env",
    "/@fs/private/tmp/private-data.json",
    "/api/ai/config",
  ]) {
    const response = await request.get(url);
    expect(response.status()).toBe(404);
  }
});
