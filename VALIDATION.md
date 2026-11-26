# 小米浏览器扩展规范校验报告

- **规范来源**：`MiBrowser-extension-dev-skill-v4-fixed.zip` → `SKILL.md`（能力快照 2026-11-17）
- **校验对象**：`browser-usage-diary/`（浏览器使用日记，Manifest V3）
- **校验时间**：2026-11-26
- **产物**：`browser-usage-diary/browser-usage-diary.zip`（11.5 KB / 11,777 字节，8 个文件）

---

## 一、结论

| 维度 | 结果 |
| --- | --- |
| 机器可校验条款（31 项） | **31 PASS / 0 FAIL** |
| 行为测试（25 项断言） | **25 PASS** |
| 布局审计（13 种视口 × 2 页面） | **26 PASS / 0 溢出** |
| 扩展环境回归（4 项） | **4 PASS** |
| 真机导入与运行 | **已完成**（手机端实机，见第五节） |

---

## 二、逐条校验结果

### §1 权限与执行上下文

| 项 | 结果 | 说明 |
| --- | --- | --- |
| manifest 位于 ZIP 根目录 | PASS | |
| 使用 Manifest V3 | PASS | `manifest_version=3` |
| ZIP 内无多余外层目录 | PASS | 8 个文件全在根，`references` §1 明确要求 |
| 16/48/128 PNG 图标已声明且实际打包 | PASS | `icons` 与 `action.default_icon` 均配置 |
| `action.default_icon` 已配置 | PASS | |
| 声明 `default_popup` | PASS | 据此不注册 `onClicked`，符合 §2 边界 |
| HTML 不使用内联脚本 | PASS | `<script src="popup.js">` 外部引用 |
| HTML 无内联事件属性 | PASS | 无 `onclick` 等 |
| 无 `eval` / `new Function` | PASS | |
| 无远程 JS / 样式 / CSS 资源 / `@import` | PASS | 全部本地 |

### §2 双端可用能力（API 白名单）

实际使用的 chrome API 全部命中白名单：

```
storage.local.get / set, storage.onChanged
tabs.get / query / onActivated / onUpdated / onRemoved
alarms.get / create / onAlarm
runtime.onInstalled / onStartup / lastError
```

| 项 | 结果 |
| --- | --- |
| 所有 `chrome.*` 调用均在 §2 白名单内 | PASS |

> `tabs` 权限的必要性：作品读取 `tab.url` 提取 origin。`references/examples.md` 明确「读取敏感 `tab.url`/`title` 需要相应授权」，故 `tabs` 为最小必要权限，与「权限最小化」不冲突。

### §4 不采用的能力

| 项 | 结果 |
| --- | --- |
| 未使用 bookmarks / history / tabGroups / sessions / notifications / identity / proxy / debugger / desktopCapture / tabCapture / contextMenus / omnibox / privacy / power | PASS |
| 未使用 `tabs.remove` / `tabs.highlight` / `action.setTitle` / `action.getBadgeText` / `idle.queryState` / `storage.managed` / `runtime.reload` | PASS |
| storage 未使用 `managed` 存储区 | PASS |

> 注意：`tabs.onRemoved` 是**事件监听**（§2 白名单内），与 §4 禁用的 `tabs.remove`（主动关闭标签）是两回事。

### §6 提交前自检

| 项 | 结果 | 实测值 |
| --- | --- | --- |
| ZIP 不超过 20MB | PASS | 11.5 KB（解压后 26.2 KB） |
| ZIP 内无签名私钥/可执行文件 | PASS | |
| 作品名称不超过 1000 字 | PASS | 7 字 |
| 作品描述不超过 1000 字 | PASS | 56 字 |
| 权限集合最小化 | PASS | `storage` / `tabs` / `alarms` |
| `tabs` 权限与「读取站点域名」行为一致 | PASS | |
| 演示视频不超过 5MB | PASS | 1.94 MB |
| 演示视频短于 15 秒 | PASS | 11.33 秒 |
| **至少手机或 Pad 一端真实运行** | **PASS** | 手机端实机导入运行，截图 + 录屏见第五节 |

### §0 / §3 布局与端适配

| 项 | 结果 | 说明 |
| --- | --- | --- |
| 布局按容器宽度，非端类型写死 | PASS | 7 个媒体查询（320/360/400/480/600 + 横屏 + 减少动效） |
| 含 600px 分界 | PASS | 对应 §0 的 compact / wide 语义 |
| popup 容器自适应 (`width:100%` + `max-width`) | PASS | 上限 420px，窄容器自动收缩 |

### 旧内核兼容性（目标 Chromium 70）

| 项 | 结果 |
| --- | --- |
| CSS 未使用 `clamp()` / `min()` / `max()` / flex `gap` / 逻辑属性 | PASS |
| `chrome.storage` 使用 callback 形式，不依赖 Promise 版 API | PASS |

---

## 三、本次按规范做的修复

| # | 问题 | 依据 | 处理 |
| --- | --- | --- | --- |
| 1 | `background.js` 全用 `chrome.storage.local.get().then()`，Promise 形式需 Chrome 95+ | §2 存储能力 / 目标端版本不确定 | 改为 callback 形式，外部仍保留 Promise 链做串行化；行为测试 25/25 无回归 |
| 2 | 缺少 600px 布局档，与 §0 的 compact/wide 分界不对应 | §0、§3 | 补 `@media (min-width:600px)`，加大内边距与字号 |
| 3 | README 未标注目标端与测试状态 | §6「准确标注已测试端与版本」 | 增加「目标端与测试状态」表与「兼容性取舍」小节 |
| 4 | README 包体积过期（8.2 KB） | §6 | 更新为 11.5 KB |
| 5 | 提交包内容过期（仍是旧 CSS/JS） | §5「本地修改后重新打包」 | 重新打包，统一 LF，manifest 在根 |
| 6 | `build.sh` 依赖系统 `zip` 命令，本机没有会先删包再失败 | §5 可复现打包 | 改用 Python `zipfile` 固定时间戳打包，同一份源码重复打包字节一致 |

---

## 四、真机验收结果（1.1.0）

| 验证环境 | 结论 |
| --- | --- |
| 桌面 Edge 158（解包加载） | 计时、隐私、持久化、popup 四态全部通过 |
| 手机端实机（Chromium 70 内核）导入 ZIP | **通过**：弹窗实时累加、今日柱状图无横向溢出、切页签与清空确认正常 |
| 素材一致性 | ZIP / 截图 / 视频均为 1.1.0：截图 28 秒 · 3 站点 → 视频末帧 1 分钟 · 4 站点，同一台设备连续累计 |

真机素材（已入库 `browser-usage-diary/`）：

| 文件 | 规格 |
| --- | --- |
| `demo.mp4` | 444×960，11.33 秒，1.94 MB，H.264 High + AAC 44.1k，`moov` 前置 |
| `screenshots/real-device-popup.jpg` | 弹窗实拍，今日 28 秒 / 3 站点 |
| `screenshots/real-device-video-end.jpg` | 视频末帧，今日 1 分钟 / 4 站点 |

> 原始录屏是 HEVC（hvc1）。Windows 未安装 HEVC 视频扩展时无法播放，评审很可能打不开，因此转码为 H.264 High（CRF 24，`+faststart`），并做完整解码校验（`-f null` 无错误），末帧与原始素材逐像素一致。

### 复现步骤（§5）

1. 把 `browser-usage-diary.zip` 放进手机 / Pad 可选择的文件夹
2. 浏览器 → 扩展程序页 → 导入本地扩展文件 → 选择该 ZIP（不需解压）
3. 启用后浏览几个网站，点扩展入口查看今日柱状图
4. 切「近 7 天」、试「清空今日数据」二次确认，重开 popup / 重启浏览器确认数据保留

---

## 五、产物路径

| 产物 | 路径 |
| --- | --- |
| 提交包 | `browser-usage-diary/browser-usage-diary.zip`（11.5 KB，v1.1.0） |
| 源码 | `browser-usage-diary/`（manifest / background.js / popup.* / icons） |
| 校验脚本 | `adb-test/validate-skill.py` |
| 行为测试 | `adb-test/harness.js`（25 项） |
| 多视口审计 | `adb-test/layout-audit.js`（13 视口） |
| 扩展环境验证 | `adb-test/verify-ext-popup.js` |
