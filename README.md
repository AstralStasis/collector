

## 启动

兼容 Node.js 12.20.2 / npm 6.14.11 及以上版本。MySQL 驱动和兼容依赖使用固定版本，锁文件采用 npm 6 可读取的 v1 格式；先执行 npm ci 安装依赖。

在此文件所在的文件夹打开终端，执行：

    npm ci
    npm start

未配置 .env 时保留 SQLite 本地模式。使用 MySQL 请按下节配置后启动。

然后访问 http://127.0.0.1:4173 。这是本地预览地址，未部署到公网。

代码语法检查：

    npm run check

可通过 PORT、HOST 环境变量指定端口与绑定地址；默认只监听本机 127.0.0.1。

## MySQL 接入

目标版本为 MySQL 8.0.24，同时支持更高版本，数据库使用 utf8mb4 / InnoDB。账号、密码哈希、会话、收藏档案、心愿单、计划、偏好和图鉴资料均保存在数据库；浏览器保留离线副本。前端仍通过同源 Node HTTP API 访问，数据库凭据仅保存在服务端。

1. 用数据库管理员账号创建专用库和应用用户（请替换密码；远程部署时将 localhost 改为实际应用来源主机）：

   ```sql
   CREATE DATABASE eorzea_archive CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
   CREATE USER 'eorzea'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
     ON eorzea_archive.* TO 'eorzea'@'localhost';
   ```

2. 将 .env.example 复制为 .env，填写 MYSQL_HOST、MYSQL_PORT、MYSQL_DATABASE、MYSQL_USER、MYSQL_PASSWORD，保留 DATABASE_CLIENT=mysql。也可使用 MYSQL_URL；URL 中的特殊字符需编码。单独的 MYSQL_* 连接字段优先于 URL。不要将 .env 提交到版本库。
3. 执行 npm ci、npm run db:migrate、npm run db:seed、npm start。正常启动也会自动检查迁移并幂等导入 catalog.json，无需重复手工导入；已存在的用户收藏不会被图鉴更新覆盖。
4. 执行 npm run db:health，或访问 /api/health；正常结果包含 database: "mysql"。无法连接时启动失败，不会静默回退 SQLite；运行中健康检查失败返回 HTTP 503。

已针对 MySQL 8.0.24 禁用不完整的 query attributes 协议协商，继续使用参数化预处理语句。远程数据库可设置 MYSQL_SSL=true，启用服务器证书校验；私有 CA 用 MYSQL_SSL_CA 指定 PEM 文件。MYSQL_CONNECTION_LIMIT 默认 10，MYSQL_CONNECT_TIMEOUT 默认 10000 毫秒。迁移和种子导入使用数据库命名锁串行执行；档案保存使用同一连接内的事务与行锁，版本过期返回 409，防止多个窗口覆盖彼此的修改。

### 本机已配置的开发实例

本次接入为本工作区准备了独立 MySQL 开发实例，监听 127.0.0.1:13306，应用库为 eorzea_archive、用户为 eorzea；随机密码已写入本机 .env，没有使用生产连接信息。MySQL 程序与持久化数据位于工作区的 work/mysql-8.0.24-runtime，启动方法见该目录的运行说明。该实例用于本机开发，程序和数据不随 GitHub 仓库分发；重启机器后需先启动 MySQL，再在此目录 npm start。发布到服务器时请自行准备 MySQL 8.0.24 或以上，并替换 .env 中的数据库地址和凭据。

### 兼容、迁移与备份

设置 DATABASE_CLIENT=sqlite、DATABASE_PATH=./data/eorzea.sqlite 可继续使用 SQLite 后端。支持内置 SQLite 的 Node 优先使用原生实现，Node 12 使用无需编译的 sql.js；数据库文件格式仍为 SQLite，目录与档案格式保持兼容。SQLite 文件模式只允许一个应用／运维进程同时打开同一文件，事务提交后持久化并保留回滚语义；MySQL 不受此单实例限制。切换后端不会自动搬运另一数据库中的账号和会话；已有收藏可通过网站的 JSON 导出／导入迁移，原 SQLite 文件不会被删除。需要保留整个账号数据库时，应先停写并备份，再按对应表结构迁移。

SQLite 备份前先停止使用同一数据库文件的应用，再执行 npm run db:backup。遇到数据库锁或未完成的 WAL／journal 时，先确认原进程已停止并使用原 SQLite 环境完成恢复与检查；不要直接删除数据库旁的日志文件。MySQL 请用官方客户端建立登录配置后生成一致性备份，避免把密码放进命令行：

    mysql_config_editor set --login-path=eorzea --host=127.0.0.1 --port=13306 --user=eorzea --password
    mysqldump --login-path=eorzea --single-transaction --no-tablespaces --set-gtid-purged=OFF --result-file=archive.sql eorzea_archive

恢复示例：在 mysql --login-path=eorzea eorzea_archive 会话中执行 SOURCE /absolute/path/archive.sql;。恢复到空库时可能需要管理员临时授予 DROP 权限。备份包含账号和会话，应妥善保管。MySQL 模式下 npm run db:backup 会明确提示使用 mysqldump，不会生成误导性的 SQLite 备份文件。

### 验证

    npm run check
    npm test

默认运行 SQLite 回归；设置 MYSQL_TEST_URL 为一个预先创建的专用测试库连接 URL 后，npm test 同时执行真实 MySQL 存储与 HTTP 集成测试。不要指向生产库；测试会幂等导入图鉴并删除自己创建的测试用户，不会 DROP 或 TRUNCATE 表。

## 已实现

- 按用户思维导图组织 12 类进度，共 3,414 个条目：136 件绝本武器、101 件战职肝武、55 件生产采集工具、355 个坐骑、584 个宠物、107 件鸟甲、886 首乐谱、475 张九宫幻卡、61 件面部配饰、52 件时尚配饰、401 套肖像教材和 201 个表情动作。九类普通收藏使用同步时的 API 全量列表，装备保留既有终阶段范围。
- 可兑换的独占物品列表：174 个条目，按双色宝石、金碟币、同盟徽章、兵团徽章和怪物狩猎的战利品组织。双色宝石包含 5.0、6.0、7.0 共 18 个地区。只将资料源所列获取途径均为对应货币兑换的收藏列入独占清单；活动限定兑换仍保留活动条件。
- 获取方式 → 资料片 → 强化／绝本系列 → 职业按顺序联动，只显示匹配选项，并自动清除失效的下游选择。筛选、搜索和进度统计使用完整目录；图鉴每批显示 96 条，可继续加载，避免数千张卡片同时阻塞页面。
- 全局中文/英文/职业缩写/系列/获取方式搜索，分类切换，已收藏/未收藏、资料片、获取途径、职业与系列筛选，多种排序，以及卡片/列表视图。
- 藏品详情包含 API 的说明、背景、引语、物品编号、交易状态、坐骑属性、宠物萌宠之王数据、幻卡点数、来源关联编号，以及可展开的完整原始 JSON；未提供的字段与 false、0 分开显示。
- 已收藏标记、心愿单、收集计划联动。标记收藏后自动移出心愿单，计划项显示完成状态。
- 本地偏好规划：按分类推荐未收藏目标，支持排除付费与优先心愿单，每次最多生成 3 个目标。
- 档案昵称、服务器备注、本地持久化、JSON 导入导出，以及有二次确认的清空操作。
- 右上角网站修改公告，按日期展示功能更新、体验优化与问题修复；支持空状态、键盘导航、搜索快捷键、对话框焦点管理和减少动态效果。
- 所有图片随项目存储，站点运行不依赖第三方图片服务器或在线字体。

## 武器与工具收录范围

- 战斗职业武器共 237 件：101 件历代肝武终阶段物品，覆盖黄道、元灵、优雷卡、义军、曼德维尔、幻影六个系列；136 件绝本武器，覆盖绝巴哈姆特、绝究极神兵、绝亚历山大、绝龙诗、绝欧米茄、绝伊甸、绝妖星乱舞七个系列。
- 生产采集工具共 55 件：五个强化系列各含八种制作职业和采矿工、园艺工、捕鱼人三种采集职业。导图要求的天钢、莫雯、宇宙均已覆盖，卢奇斯与辉煌作为原有补充系列保留。
- 按实际游戏物品独立记录，骑士剑与盾分别计数；本次收录系列终阶段，不包含每个中间强化阶段。后续版本新增阶段需要继续更新数据。
- 本轮新增 240 件真实条目；中文名按游戏物品编号或中文版 FFXIV Collect 核对，保留英文副标题及原始获取文本供检索。原有获取说明中的 117 条英文名称已中文化，任务、副本、商人、地点和货币按游戏表编号核对。详情可查看「中文名依据」。中文文本存在不等于该内容已经在国服开放，版本与可获取状态按国际服资料说明。
- 武器和工具按游戏物品 ID 与 API 匹配，279 件已更新真实社区持有率；13 面 API 未单列的骑士盾保留原资料，持有率使用空值并显示「暂无数据」，不冒充 0%。
- 本轮扩充前的 631 个条目 key 与本地档案格式完整保留；绝本和肝武拆分分类不会重置收藏、心愿或计划。旧 #weapons 地址兼容跳转到战职肝武。



## API 目录同步

在项目目录执行：

    npm run catalog:sync

命令获取九类普通收藏及装备列表的英文／简体中文数据，按分类和 API 编号匹配，保存完整返回字段并下载缺少的本地图片；全部校验成功后才原子替换 catalog.json。API 请求或图片失败不会替换目录。既有 key、中文自定义名称、收藏档案及已收录的终阶段装备保留；API 缺少的条目保留并标注，不能据此当成删除或零持有率。原始列表缓存在被 Git 忽略的 data/collect-cache，图片缓存位于 data/collect-assets。

使用上次完整缓存重建，仍会校验并补齐图片：

    npm run catalog:sync -- --offline

检查、补齐当前目录的本地图片：

    npm run catalog:assets

大图沿用 API 提供的坐骑／宠物展示图；乐谱与肖像列表使用共享本地图标，幻卡使用本地卡面图标，完整远端图片地址仍保存在原始字段。不会为了预览下载全部肖像大图，运行时也不会请求外链图片。更新后重启 Node 进程，使启动时的幂等种子导入和内存目录同时刷新；仅执行 db:seed 不会刷新已经运行的进程。旧浏览器刷新后即可继续使用原收藏记录。

API 未提供的说明或获取途径会明确显示缺失，肖像教材尤为常见；中文翻译不等于国服可获取。社区持有率是用户样本，不能用于推断掉落率或发布时间。

## 数据说明

首次访问会创建有明确标识的演示档案。点击「管理收藏档案 → 清空演示，开始收藏」即可从零记录。未连接游戏账号，不进行角色自动同步。收藏数据先写入当前浏览器的 localStorage，再同步到服务端数据库。注册账号后可在其他浏览器登录同步；未注册访客依赖当前会话 Cookie。离线修改会在恢复连接后重试，请定期导出备份。

副本掉落具有随机性；前置任务、队伍、货币、等级等条件以游戏内为准。九类普通收藏覆盖同步时的 API 列表，特殊装备仅收录终阶段，不代表完整游戏数据库。已有中文别称和用户更名保留，API 名称在详情中另列。

资料同步日期：2026-11-27。普通收藏通过九组英文／简体中文完整列表同步，逐组校验 count、results.length 和双语 ID 集合；本轮新增 2,783 条。沿用既有策略，暂不纳入 mounts-419（2026 圣芒星节）和 minions-560（2027 降神节），具体原因记录在 meta.apiSync.deferred。API 的版本号和 0% 持有率都不是活动开放标志，不据此自动排除其他收藏。

8.0 Evercold 尚未发售，官方公布正式发行日期为 2027-02-23。首页背景已更换为 8.0 官方预告插画；背景版本与已上线条目版本分开标注。

资料来源：

- FFXIV Collect 社区 API：https://ffxivcollect.com/api/ （简体中文参数 language=chs；卡牌接口为 triad/cards）
- API 文档：https://documenter.getpostman.com/view/1779678/TzXzDHM1
- 游戏图标：XIVAPI https://v2.xivapi.com/
- 武器与工具系列/物品编号：FFXIV Collect 源数据 https://github.com/fae-industries/ffxiv-collect/tree/3d73861a4c811c1dc1290b2a003016d53e462d53/lib/tasks/relics
- 新增条目的中文游戏名：https://github.com/thewakingsands/ffxiv-datamining-cn/tree/ae29be8b21a32329e3356709422427540bf7e364 （按游戏表行 ID / 物品 ID 精确匹配，未按英文猜译）
- 背景插画：8.0 Evercold 官方媒体页 https://na.finalfantasyxiv.com/evercold/media/
- 最新补丁记录：https://na.finalfantasyxiv.com/lodestone/topics/detail/27a249e737d7b041332c7018949035b03d62c081
- 8.0 官方发行说明：https://na.finalfantasyxiv.com/evercold/

社区持有率来自 FFXIV Collect 用户样本，不代表掉落率或所有玩家的数据。

本项目为非官方同人原型，与 SQUARE ENIX 无隶属关系。游戏相关图像、名称及商标归各权利人所有。公开上线前请确认素材使用符合官方素材使用条款。

© SQUARE ENIX CO., LTD. All Rights Reserved.

## 文件结构

- index.html：页面入口
- style.css：视觉与响应式样式
- app.js：图鉴、收藏状态、筛选、规划与备份逻辑
- catalog.json：3,414 个条目的结构化资料、完整 API 快照、兑换路径、版本、中文名依据和图片来源
- assets/：本地游戏图片与背景
- server.mjs / server/：同源静态服务、账号与收藏 API、SQLite / MySQL 存储
- database/mysql/：MySQL 幂等建表迁移；database/migrations/：SQLite 迁移
- .env.example：MySQL 连接和部署配置示例
- scripts/sync-collect-catalog.mjs / sync-collect-assets.mjs：可重复的数据同步与本地图片校验
- tests/：目录同步、双后端存储与真实 HTTP 集成测试

仅使用离线收藏时可静态托管前端；账号登录与跨设备同步需要运行本项目 Node 后端并连接数据库，通过同源反向代理提供 HTTPS。生产部署设置 PUBLIC_ORIGIN、NODE_ENV=production 和安全 Cookie。
