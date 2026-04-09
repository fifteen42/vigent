# Vigent 产品路线图

> 基于多模态 Agent 研究报告 + 现有代码库分析
> 版本：v1.0 | 2026 年 4 月

---

## 目录
1. [现状盘点](#一现状盘点)
2. [定位分析](#二定位分析)
3. [具体用途场景](#三具体用途场景)
4. [发展路线图](#四发展路线图)
5. [技术优先级矩阵](#五技术优先级矩阵)

---

## 一、现状盘点

### 已实现能力

| 能力 | 状态 | 实现方式 |
|------|------|---------|
| 桌面截图 | ✅ | Swift CGDisplayCreateImage |
| 鼠标/键盘控制 | ✅ | Rust enigo + napi-rs |
| 无障碍树查询 | ✅ | Swift Accessibility API |
| 视频理解（短） | ✅ | FFmpeg 帧提取 → Claude |
| 视频理解（长） | ✅ | Gemini File API 直传 |
| 视频生成 | ✅ | MiniMax Hailuo-2.3 |
| 图片生成 | ✅ | MiniMax image-01 |
| TTS 语音合成 | ✅ | MiniMax speech-2.8-hd |
| HTTP Server 模式 | ✅ | SSE 流式输出 |
| 多模型路由 | ✅ | Claude/Gemini/Gemma4 本地 |
| Token 预算管理 | ✅ | 上下文裁剪 + 截图轮转 |
| 权限管理 | ✅ | 风险分级 + 用户审批 |

### 未实现（关键缺口）

| 能力 | 研究显示重要性 | 难度 |
|------|------------|------|
| UI 元素精确 Grounding | 极高（最大技术瓶颈） | 高 |
| 语音识别 STT | 高 | 中 |
| Agent 持久记忆 | 高（长序列任务必需） | 中 |
| 工作流编排（多步骤链） | 高 | 高 |
| 多 Agent 协同 | 中 | 高 |
| 屏幕录制回放 | 中 | 中 |
| SDK / 插件系统 | 中（生态扩展） | 低 |

---

## 二、定位分析

### 市场空白

```
Anthropic Computer Use   → 只有 API，无工具链，无 CLI
OpenAI Operator          → 闭源，只做 Web
Agent S / Open Operator  → 只做桌面，不含生成
Midjourney / Sora        → 只做生成，不做控制
```

**Vigent 的独特价值**：

```
感知（看见屏幕/视频/图片/音频）
    +
生成（生成视频/图片/语音）
    +
控制（操控桌面/浏览器/应用）
    +
可插拔模型（Claude/Gemini/本地）
= 多模态全栈 Agent 工具箱
```

这个组合在开源生态中目前没有竞争者。

### 开源定位

Vigent 应定位为：
- **Core 层**：多模态感知 + 执行框架，给开发者用
- **App 层**：开箱即用的 CLI + HTTP API，给终端用户和自动化工程师用

---

## 三、具体用途场景

### 3.1 创作与内容生产

#### 场景 A：视频脚本 → 完整视频一键生成
```
用户输入：一段视频描述
Vigent 流程：
  1. 用 Claude 将描述扩写为分镜脚本
  2. 每个分镜 → MiniMax 生成片段视频
  3. 用 TTS 生成旁白音频（多种音色可选）
  4. 调用 FFmpeg 合并视频 + 音频
  5. 输出成品 MP4

对应 Fooo 100 个视频的需求
```

#### 场景 B：网页内容 → 新闻简报视频（foresight-news-video 融合）
```
新闻 URL → Vigent run "打开 URL，提取正文" → Claude 总结 → TTS 朗读 → 
Remotion 渲染字幕卡片 → 合成短视频
```

#### 场景 C：截图 → 图文内容分析
```
vigent screenshot | vigent run "分析截图中的 UI 问题并给出改进建议"
```

---

### 3.2 桌面自动化（Computer Use）

#### 场景 D：研究与信息收集
```
vigent run "打开 Safari，搜索 TypeScript 2026 新特性，整理成 Markdown 表格保存到桌面"
```
- 无需写爬虫
- 自动操控浏览器、复制内容、调用编辑器

#### 场景 E：重复性工作流自动化
```
vigent run "打开 Figma，导出所有 Frame 为 PNG，重命名为 component_xxx.png"
vigent run "批量把桌面上的截图上传到飞书文档"
vigent run "打开 Xcode，运行测试，把错误截图发送到 Telegram"
```

#### 场景 F：跨应用数据迁移
```
vigent run "把 Notion 数据库里的任务全部迁移到 Linear"
```
（当没有官方 API 时，Computer Use 是唯一出路）

---

### 3.3 视频理解与分析

#### 场景 G：屏幕录制回看分析
```
vigent video recording.mp4 "这个操作流程有什么问题？如何优化？"
vigent video tutorial.mp4 "列出所有操作步骤"
```

#### 场景 H：用户行为分析
```
vigent video user_session.mp4 "用户在哪些步骤卡顿了？"
```
（产品设计师 / UX 研究场景）

#### 场景 I：教学视频转文字文档
```
vigent video lecture.mp4 "生成完整讲义，包括代码片段和要点"
```

---

### 3.4 语音与多媒体处理

#### 场景 J：批量 TTS 生产
```
vigent tts "第一章：多模态 Agent 概述" --voice Bowen-ZH --output ch1.mp3
vigent tts "Chapter 1: Introduction" --voice English_expressive_narrator --output ch1_en.mp3
```

#### 场景 K：播客 / 有声书自动化
```
把 Markdown 文章 → 逐段 TTS → 合并音频 → 上传到播客平台
```

---

### 3.5 远程自动化与 Agent 集群

#### 场景 L：服务器端 Agent（serve 模式）
```bash
vigent serve --port 3000
# 其他系统通过 HTTP POST /run 下发任务
# SSE 流式获取实时进度
```

应用：
- CI/CD 中自动截图对比测试
- 定时执行桌面任务（如定时导出报表）
- 接受 Telegram 消息触发本地操作

---

## 四、发展路线图

### Phase 1：能力完善（1-2 个月）
**目标：解决最大技术瓶颈，达到"可靠"水平**

#### 1.1 UI Grounding 模块（最高优先级）

研究显示 Grounding 是最大技术瓶颈，当前 Vigent 依赖模型自身猜测坐标，错误率 ~30%。

**方案**：集成 Set-of-Mark（SoM）技术
```
截图 → 检测所有可交互元素 → 为每个元素标数字编号 → 
把标注图传给模型 → 模型输出"点击元素 #7" → 
查表映射到精确坐标
```

实现步骤：
1. 在 Swift 层通过 Accessibility API 获取所有可交互元素 + 坐标
2. 在截图上叠加编号标注（可用 Core Graphics 绘制）
3. 修改 `vision.ts` 的截图工具，返回标注图 + 元素映射表
4. 修改 `input.ts` 的 click 工具，接受元素编号而非绝对坐标

**预期效果**：Grounding 错误率从 ~30% 降到 <10%

#### 1.2 语音识别 STT（Speech-to-Text）

目前 Vigent 支持 TTS（文字→语音），缺少 STT（语音→文字）。

**方案**：集成 Whisper
```
vigent transcribe audio.mp3
vigent run --voice "用语音命令控制电脑"
```

实现：
- 使用 `openai-node` 的 Whisper API，或
- 本地跑 `whisper.cpp`（macOS 上性能良好）

#### 1.3 结构化动作输出

当前模型输出文本 → 解析工具调用。改进：要求模型输出严格 JSON 动作序列。

```json
{
  "action": "click",
  "target": { "elementId": 7, "fallback": { "x": 423, "y": 187 } },
  "reason": "点击提交按钮"
}
```

#### 1.4 错误恢复机制

研究显示长序列任务中错误会快速累积。

实现 `recovery.ts`：
- 检测工具执行失败
- 截图对比验证步骤是否完成
- 自动重试（最多 3 次）
- 记录失败点供人工审查

---

### Phase 2：可靠性与记忆（2-4 个月）
**目标：支持 20+ 步骤的复杂任务，接近生产可用**

#### 2.1 持久化 Agent 记忆

研究显示 50 步 = 100 万 token，成本极高。需要外置记忆系统。

**架构**：
```
工作记忆（当前上下文）
    ↕ 压缩 / 检索
情节记忆（SQLite 本地存储，向量索引）
    ↕ 读写
语义记忆（任务模板库，常用操作序列）
```

实现：
```
packages/memory/
  ├── episodic.ts    # 任务历史存储（SQLite + better-sqlite3）
  ├── semantic.ts    # 知识库（JSON 文件索引）
  └── retriever.ts   # 上下文注入逻辑
```

**关键功能**：
- 记住"上次在哪个 App 做了什么"
- 识别重复任务，直接复用上次成功路径
- 上下文压缩：把长历史压缩为摘要

#### 2.2 工作流编排（Workflow Engine）

支持多步骤任务的声明式定义：

```yaml
# workflows/daily-report.yaml
name: 每日报告
steps:
  - id: fetch_data
    action: vigent run "打开 Excel，复制 A1:D50"
  - id: summarize
    action: vigent run "用 Claude 总结数据"
    depends: fetch_data
  - id: generate_video
    action: vigent generate video "{summary}"
    depends: summarize
  - id: post_telegram
    action: vigent run "发送到 Telegram"
    depends: generate_video
triggers:
  - cron: "0 9 * * *"  # 每天早 9 点
```

#### 2.3 屏幕录制与回放（LensCast 融合）

将 LensCast 的录制能力接入 Vigent：

```
vigent record --output session.mp4     # 录制屏幕
vigent replay session.vigent           # 智能回放（不是坐标回放，是语义回放）
```

**语义回放**（关键差异）：
- 不记录绝对坐标（UI 变化后会失效）
- 记录语义动作（"点击标题为'提交'的按钮"）
- 回放时重新 Grounding

---

### Phase 3：开发者生态（4-6 个月）
**目标：成为开发者构建多模态应用的基础设施**

#### 3.1 SDK 化

将 Vigent 核心能力暴露为 NPM 包：

```typescript
// @vigent/sdk 使用示例
import { VigentClient } from '@vigent/sdk';

const client = new VigentClient({ apiKey: 'sk-...' });

// 截图分析
const result = await client.screenshot.analyze("页面有什么问题？");

// 视频生成
const video = await client.generate.video("未来城市的夜晚");

// 计算机控制
const session = await client.computerUse.session();
await session.run("打开 Safari 搜索 TypeScript");
```

#### 3.2 插件系统

允许社区扩展工具：

```typescript
// 自定义工具示例
vigent.registerTool({
  name: 'send_slack',
  description: '发送消息到 Slack',
  parameters: { channel: string, message: string },
  execute: async ({ channel, message }) => {
    await slack.chat.postMessage({ channel, text: message });
    return { success: true };
  }
});
```

#### 3.3 Web UI 控制台

```
vigent serve --ui
```

打开浏览器控制台：
- 实时查看 Agent 执行过程（截图流）
- 点击审批危险操作
- 查看任务历史和费用统计
- 可视化工作流编辑器

#### 3.4 多 Agent 协同

```typescript
// 专业化 Agent 分工
const manager = new ManagerAgent();          // 任务分解
const webBrowser = new BrowserAgent();       // 浏览器操作
const videoEditor = new VideoAgent();        // 视频处理
const reporter = new ReportAgent();          // 整理输出

manager.delegate(task, [webBrowser, videoEditor, reporter]);
```

---

### Phase 4：平台化（6-12 个月）
**目标：成为 AI 多模态自动化的基础设施平台**

#### 4.1 Cloud Agent 服务

```
vigent cloud run "任务描述" --remote
```

- 用户本地不需要运行任何进程
- 云端弹性资源（GPU）
- 计量计费

#### 4.2 Agent Marketplace

社区贡献的工作流模板市场：
- "YouTube 频道分析"
- "电商商品描述批量生成"
- "设计稿自动切图 + 命名"
- "技术文档自动翻译"

#### 4.3 企业版

- 私有化部署
- 审计日志
- 细粒度权限控制（RBAC）
- 与企业内网系统集成

---

## 五、技术优先级矩阵

| 功能 | 研究重要性 | 实现难度 | 推荐优先级 |
|------|-----------|---------|-----------|
| SoM Grounding | 极高 | 中 | ⭐⭐⭐⭐⭐ |
| 错误恢复机制 | 极高 | 中 | ⭐⭐⭐⭐⭐ |
| STT 语音识别 | 高 | 低 | ⭐⭐⭐⭐ |
| 持久化记忆 | 高 | 中 | ⭐⭐⭐⭐ |
| 工作流引擎 | 高 | 高 | ⭐⭐⭐ |
| Web UI 控制台 | 中 | 中 | ⭐⭐⭐ |
| SDK 化 | 中 | 低 | ⭐⭐⭐ |
| 多 Agent 协同 | 中 | 高 | ⭐⭐ |
| 录制回放 | 中 | 高 | ⭐⭐ |
| 云端服务 | 低（现阶段） | 极高 | ⭐ |

---

## 关键数据参考

来自研究报告的核心数据，在产品决策时应牢记：

- **95%** 的 Agent 初次部署失败 → 可靠性比功能多更重要
- **74.2%** 企业保留人工监督 → 永远提供"人工审批"选项
- **73%** 遭遇提示注入 → 安全不是可选项
- **50 步 = 100 万 token** → 记忆压缩是工程必需
- **Grounding 错误率 ~30%** → SoM 是第一优先
- **OSWorld: 12% → 76% in 2 years** → 技术在快速进步，要在框架层保持模型无关性

---

*本文档应随项目进展持续更新。*
