# 拾光 · 校园失物招领

React、TypeScript、Vite、Tailwind 前端，Express 后端，DeepSeek 图片识别与文字字段提取。保持原项目的页面、交互和业务流程。

## 本机运行

需要 Node.js 24 和 pnpm 11（packageManager 固定版本）。

```sh
pnpm install
pnpm dev
```

打开终端显示的 http://localhost:3080 。一条命令启动前后端；相机需要允许浏览器访问。本机使用 HTTP，不生成自签证书。

不配置 AI 也可浏览。发布、领取和管理员操作需要学校平台身份；平台登录尚未接入，生产环境不会接受浏览器自报的用户 ID 或角色。本地模块测试可在非生产进程设置 `SHIGUANG_TEST_ACTORS=1`，需要连发布表单一起测时再加 `SHIGUANG_TEST_REVIEW=allow`。这两个开关会被生产环境忽略，不是平台登录，也不能在页面上切换管理员。需要 AI 时，把 .env.example 复制为 .env，填写：

```dotenv
DEEPSEEK_API_KEY=你的DeepSeek密钥
```

AI 地址/模型在 src/server/config.ts 统一定义，使用 deepseek-flash；Key 只在后端读取。没有网页配置 Key 或其他服务商入口。不要将真实 .env、Key 或个人数据提交 Git。管理员口令不再授予权限。

## 构建和检查

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

生产服务默认监听 3080，HTTPS 由反向代理或托管平台提供。PORT 可改变监听端口。生产依赖安装前先完成构建，运行只需自包含的 dist/，无需携带 node_modules。GitHub 检查工作流随代码提供，未推送前不代表远程 CI 已执行。

`pnpm test:ui` 用独立 .data-ui/ 数据和服务端测试身份执行浏览器流程，不使用真实 AI；首次需 `pnpm exec playwright install chromium`。若测试环境已有 Chromium，可设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指向它。UI 测试会启动自己的本地服务，测试端口为 3188，不要同时运行多份。

## 数据目录和并发

```text
data/
  items/<id>.json        帖子、认领/核对状态和该帖查看记录
  uploads/<name>         图片
  feedback/<id>.json     反馈
  tmp/                  上传暂存
```

唯一 DATA_DIR 指定数据根目录，默认项目根 data/；相对路径始终按项目根解析，不随启动位置变化。图片地址仍是 /uploads/，但只返回已审核且未撤下版本引用的文件。私有数据没有静态访问入口。代码升级/构建不会清空数据。

同一帖子的完整读改写按 ID 排队，不同帖子可并行；通过同目录临时文件及原子替换避免半写入。一个数据目录仅允许一个服务实例，目录租约锁阻止重复启动；异常退出后租约过期才能接管。不要手动删除仍有效的锁，不支持 cluster、多副本共享或网络盘写入。数据损坏、权限或磁盘错误会失败，不会当空数据覆盖。

替换图片先保存新文件和记录，成功后回收旧图；异常退出可能留下无引用图片，应停服核对后清理，不能据文件时间盲删。

### 备份、搬迁和恢复

先正常停止服务并等写入结束，再整体备份数据目录的 items/、uploads/、feedback/。运行锁和 tmp/ 不作为业务备份。恢复到持久目录，校验记录/图片、设置 DATA_DIR 后启动。运行中直接复制不保证一致。恢复覆盖前保留原目录；环境 Key/管理员配置需在新环境单独设置。

## 从原项目导入

停止旧服务，新服务也不要占用目标目录。目标目录必须为空或不存在：

```sh
pnpm import:data "/原项目目录" "/新项目数据目录"
```

导入读取原 data/store.json 和 uploads/，按帖子拆分查看记录，保留 ID、owner_id、时间、认领/核对状态，校验图片哈希；有 feedback.json 时同时导入。目标已有内容则拒绝覆盖。旧数据库、证书和 AI Key 不导入，源目录不改动。

### 原浏览器身份

旧的 localStorage 匿名 ID 不再代表发布者或领取人。历史帖子不会按浏览器 ID 自动挂到新的平台账号上。物品 ID 保持不变。旧的“管理人员 / admin”领取记录仍按当时的事实保留，不会改写成老师已核验。

## 结构与范围

src/client/ 保存页面、组件、状态和原视觉样式；src/server/ 保存接口、文件存储、上传和 DeepSeek；src/shared/ 保存类型和业务常量。介绍页地址为 /intro.html。

游客可以浏览已审核公开的招领。个人发布、本人登记领取和消息使用平台用户 ID、姓名和班级，不收集手机号。公共终端只发布并在结束或闲置两分钟后清空表单。高价值物品（手机、电脑、平板、耳机、智能手表）只能由管理员在交到老师处之后确认交付。文件存储面向单实例，不提供数据库、多机事务或热备份。学校平台登录尚未接入。

原页面字体来自 Google Fonts，网络不可达时使用 CSS 指定的回退字体。相机权限和系统字体渲染取决于浏览器/设备。未在某个平台实际测试的内容不宣称通过。

## RDFZ Lesson

仓库根目录的 lesson.application.json 声明服务发布方式。平台构建传入 NEXT_PUBLIC_BASE_PATH，前端资源、API、图片及介绍页均挂载在该 Lesson 的路径下。平台入口核对作品访问权限，应用后端仅监听回环地址；保留拾光自身的业务身份。

业务数据默认保存到平台 RDFZ_OPUS_ROOT/data，独立于发布版本；本机仍使用项目 data/，DATA_DIR 可显式覆盖。健康检查不初始化数据或获取数据锁，首次业务请求才获取独占锁；平台更新时先检查候选，再排空并关闭旧版本，最后由新版本接管数据。不能让其他服务同时写这个数据目录。

平台登记使用既有 envFile/envNames 白名单，仅将平台配置的 DEEPSEEK_API_KEY 交给应用后端。无需在本仓库或前端填写密钥，构建环境不接收密钥。`lesson.application.json` 的 `bridge` 不是身份协议。平台仍需提供稳定用户 ID、姓名、班级、登录回传、请求鉴权，以及管理员、公共终端和学生检索的授权方式。
