# StoryVerse

项目同时保留 Windows 浏览器开发版和 Android Debug 版。两者共用同一套故事、人物、场景、记忆与聊天页面代码。

## 启动方式

双击 `start-storyverse.bat`。

启动后请保留弹出的黑色命令窗口，StoryVerse 会自动在默认浏览器中打开：

`http://127.0.0.1:4173`

关闭命令窗口即可停止本地服务。如果浏览器没有自动出现，也可以手动复制上面的地址打开。

## Android Debug APK

双击 `build-android-debug.bat` 可重新构建 Debug APK。构建时会自动将项目根目录中最新的网页文件打包进 APK，不需要手动复制代码。

APK 输出位置：`android\app\build\outputs\apk\debug`

## 已完成功能

- 创建、编辑和删除故事
- 创建、编辑和删除人物
- 新人物自动生成对应私聊
- 创建持续存在的故事场景，并分别设置允许进入和当前在场人物
- 私聊与场景聊天记录本地保存
- 每个故事拥有独立的“我”，可设置姓名、性别、年龄、身份和外貌
- 管理多个 OpenAI 兼容格式接口
- 保存接口时自动读取该接口的模型列表
- 接口设置中可直接测试 API 连通性，并区分地址不可达、密钥无效、模型接口不受支持等情况
- 遇到部分平台与 Python OpenSSL 不兼容的 `unexpected EOF` 时，会自动切换到 Windows Schannel HTTPS 兼容模式
- 用指定接口和模型创建多个智能体
- 为每个 AI 人物选择不同的智能体
- API 模型读取与聊天请求的友好错误提示
- 场景聊天自动选择回复人物、回复数量和顺序
- 角色性格、身份、关系和说话方式进入 AI 角色设定
- AI 不得替用户说话或决定用户行为
- 故事共同记忆的查看、新增、修改和删除
- 每条故事记忆记录明确的知情人物
- 不知情人物不会收到对应秘密的 AI 提示
- 聊天右上角进入“当前场景”，可设置环境介绍
- AI 在每轮对话后自动总结当前记忆，并按时间节点加入场景记忆时间线
- 场景记忆默认只让当前聊天中的人物知晓，也可手动修改知情人物
- 安卓端长按聊天气泡、电脑网页右键聊天气泡，可复制、重新生成、编辑或删除
- 可在“设置 → 高级设置”中按需开启本地调试数据采集
- 每次采集使用全局唯一 `record_id`，支持统计、重复标注、CSV / JSON 导出
- 长按已记录的用户消息可标注“判断正确 / 判断错误 / 暂不判断”；错误可选回复人、离场、入场或其他类型
- Android 可通过系统文件选择器保存调试数据，或分享到其他应用
- 删除消息使用菜单内二次确认；重新生成不会把旧回答再次发给模型
- 自动清理 AI 回复开头重复的“人物名：”
- 未连接 API 时可使用内置示例回复测试完整流程

## 数据保存

故事、人物、场景、NPC、消息、记忆和接口设置保存在当前浏览器或 Android WebView 的本机存储中。清理应用数据或浏览器站点数据会删除这些内容。

两类数据分别保存：

- 正常业务数据：`storyverse-data-v2`
- 调试 / 训练数据：`storyverse-debug-data-v1`

调试数据采集默认关闭。清空调试数据不会删除故事或聊天；导出文件不包含 API Key、Token 和模型服务鉴权信息。

## 当前世界结构

底部导航固定为“故事 / 聊天 / 设置”。人物、场景、记忆和故事设定都从具体故事主页进入。

- 故事：彼此隔离的持续世界
- 人物：属于故事，可在私聊和多个场景中保持同一身份
- 私聊：用户与一个主要人物的一对一交流
- 场景：拥有介绍、状态、准入人物、在场人物、固定 NPC、聊天和场景记忆
- NPC：属于具体场景的辅助角色，不会重复创建正式人物
- 记忆：记录知情人物；不在场的人不会自动知道场景中发生的事情

示例流程：在私聊中提到“一起去喝咖啡”，AI 回复下方会出现“前往咖啡厅”。点击后会复用或创建咖啡厅，将当前人物加入场景，并由固定 NPC“店长”欢迎用户。

API 密钥不会写入项目代码，也不会发送给 StoryVerse 之外的服务；聊天时只会由本地代理转发到你填写的接口地址。

## 代码结构

```text
StoryVerse/
├─ index.html                    # 页面入口及脚本、样式加载顺序
├─ app.js                        # 基础数据模型、通用表单/CRUD 与完整回归自测
├─ world-v3.js                   # 世界基础层：场景/NPC、通用页面、弹窗与绑定
├─ world-v4.js                   # 当前交互层：移动、事件、导入、Prompt 与发送
├─ modules/
│  ├─ core/
│  │  ├─ storage.js              # localStorage JSON 读写
│  │  └─ record-id.js            # 全局唯一调试记录 ID
│  ├─ ai/
│  │  ├─ api-client.js           # OpenAI-Compatible 聊天请求
│  │  └─ prompt-builder.js       # 当前角色 Prompt 拼装
│  ├─ memory/
│  │  └─ memory-query.js         # 按人物知情范围查询记忆
│  └─ debug/
│     ├─ debug-data.js           # 独立采集、统计、标注及导出格式
│     ├─ debug-ui.js             # 高级设置与手机端反馈交互
│     └─ debug-ui.css            # 调试页面样式
├─ server.py                     # Windows 静态服务与 AI API 本地代理
├─ android-adapter.js            # Web fetch 与 Android Java Bridge 的适配层
└─ android/app/src/main/
   ├─ AndroidManifest.xml        # 应用、联网权限和导出 Provider 声明
   └─ java/.../
      ├─ MainActivity.java       # WebView、API 代理、系统保存与分享
      └─ ExportFileProvider.java # 只读分享临时文件，不暴露业务数据
```

当前运行的是一条分层调用链，并非两套并行系统。`app.js` 保留仍被使用的基础数据、表单和 CRUD；`world-v3.js` 提供世界与场景基础能力；`world-v4.js` 是唯一的当前聊天交互入口。已经被覆盖的旧聊天选择、旧 Prompt、旧 API 请求、旧记忆请求和旧发送流程已删除。存储、API、Prompt、记忆查询和调试数据则已迁入职责单一的模块。

## 初学者阅读顺序

1. 先看 `index.html`，理解文件加载顺序。
2. 看 `modules/core/storage.js` 和 `record-id.js`，熟悉最小、独立模块。
3. 看 `app.js` 开头的数据结构、`load()`、`save()`、基础表单和 CRUD；聊天核心已不在这里。
4. 看 `modules/ai/api-client.js`，再对照 `server.py` 或 Android 的 `MainActivity.java`，理解一次模型请求如何转发。
5. 看 `modules/ai/prompt-builder.js` 与 `modules/memory/memory-query.js`，理解角色上下文和知情记忆如何进入 Prompt。
6. 浏览 `world-v3.js` 的迁移函数和 `bind()`，了解场景基础层如何接住旧数据与通用交互。
7. 看 `world-v4.js` 的 `semanticTransition()`、`systemPrompt()` 和 `sendMessage()`，串起唯一的当前聊天流程。
8. 最后看 `modules/debug/debug-data.js` 和 `debug-ui.js`，理解如何在不改变业务判断的前提下记录、标注和导出数据。

## 自测

- 完整旧功能：打开 `http://127.0.0.1:4173/?selftest=1`
- 调试数据模块：打开 `http://127.0.0.1:4173/?debugselftest=1`
- Android：在 `android` 目录执行 `lintDebug assembleDebug`，或双击 `build-android-debug.bat` 构建 Debug APK

## 当前阶段边界

当前同时支持 Windows 浏览器开发版和 Android Debug APK。项目尚未加入 RAG、向量数据库、Tool Calling、PyTorch 意图模型或正式评测流水线；调试数据模块只是为这些后续学习方向准备可靠、可标注的数据基础。
