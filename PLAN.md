# Vigent — 原生多模态 Agent 重构计划

> 调研基础：`pi-mono`（PiAgentCore + pi-ai）、`minimax-cli`、Claude Code 源码、现有 vigent 代码
> 目标：彻底去掉录制/重放范式，构建一个原生多模态 Agent——能理解图片、视频、音频，能生成图片、视频、语音，能控制 macOS 桌面

---

## 一、Vigent 是什么

### 1.1 产品定位

Vigent 是一个**原生多模态 Agent**，不是录制/重放工具，不是单纯的 Computer Use 工具。

核心主张：**感知任意模态的输入 → 推理 → 输出任意模态的内容或动作**

```
输入（Inputs）                    输出（Outputs）
─────────────────                ──────────────────────
文本指令          ┐              ┌ 文本分析 / 回答
图片（本地/URL）  │              │ 生成图片（MiniMax Image）
视频（文件/URL）  ├──[ Agent ]──►│ 生成视频（MiniMax Hailuo）
音频（语音/文件） │              │ 生成语音（MiniMax TTS）
实时屏幕截图      ┘              └ 桌面操作（Computer Use）
```

### 1.2 六大能力模块

| 模块 | 能力描述 | 核心依赖 |
|------|----------|----------|
| **Computer Use** | 截图→理解→操作（点击/输入/滚动/拖拽） | Claude + Swift/Rust native |
| **Vision（图像理解）** | 本地图/URL/截图→描述/OCR/分析 | Claude VLM / Gemini |
| **Video Understanding（视频理解）** | 视频文件→内容分析/时间线/关键帧 | Gemini 2.5 Pro（原生视频）|
| **Video Generation（视频生成）** | 文本/首帧图→生成视频 | MiniMax Hailuo-2.3 |
| **Audio（音频）** | TTS 语音合成 / STT 语音识别 / 音频分析 | MiniMax TTS + Whisper |
| **Image Generation（图像生成）** | 文本→生成图片 / 图片→图片 | MiniMax Image API |

### 1.3 模型路由策略

```
任务类型                    → 首选模型              备选
──────────────────────────────────────────────────────────
Computer Use + 推理         → claude-opus-4-6       claude-sonnet-4-6
图像理解（VLM）             → claude-sonnet-4-6     gemini-2.0-flash
视频理解（短 <30s）         → 提取帧 → Claude        —
视频理解（长 >30s）         → gemini-2.5-pro        gemini-2.0-flash
视频生成                    → MiniMax Hailuo-2.3    Hailuo-2.3-Fast
图像生成                    → MiniMax Image API     —
语音合成（TTS）             → MiniMax TTS           —
语音识别（STT）             → Whisper（本地）        —
本地/离线                   → gemma4:e4b（Ollama）   —
```

### 1.4 输入处理管线

每种输入模态都有独立的预处理管线，统一转换为 LLM 可理解的格式：

```
文本     → 直接传入
图片     → 压缩/缩放 → base64 ImageContent（<5MB）
视频     → [短] 提取帧 → ImageContent[]
         → [长] Gemini File API 上传 → fileUri
音频     → [语音指令] STT → 文本
         → [音频分析] 提取特征 → 文本描述
截图     → 压缩至 1280px / JPEG 0.75 → base64 ImageContent
```

---

## 二、现状诊断（现有代码评估）

### 已有的可复用资产

| 模块 | 位置 | 状态 | 保留价值 |
|------|------|------|----------|
| `packages/native-input` | Rust/enigo napi-rs | ✅ 正常工作 | 高 — 鼠标/键盘控制层 |
| `packages/native-swift` | Swift CLI bridge | ✅ 正常工作 | 高 — 截图/辅助功能/App管理 |
| `packages/core` | 共享 TS 类型 | ⚠️ 仅录制类型 | 低 — 需重写 |
| `packages/agent/src/tools.ts` | 9 个 Computer Use 工具 | ⚠️ 格式错误 | 高 — 逻辑正确，格式要修 |
| `packages/agent/src/modes/natural.ts` | PiAgentCore 集成 | ✅ 架构正确 | 中 — 作为起点 |
| `packages/recorder` | 事件录制器 | ❌ 要删除 | 无 |

### 关键 Bug（即使不大改也要修）

**Bug #1：截图工具返回格式错误**

```typescript
// 当前（错的）—— Anthropic 原始 API 格式
return {
  content: [{
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
  }]
};

// 正确 —— pi-agent-core 的 AgentToolResult 格式
return {
  content: [{ type: 'image', data: base64, mimeType: 'image/jpeg' }],
  details: { width, height }
};
```

**Bug #2：Model 配置缺少 `name` 字段**（pi-ai Model 类型要求）

```typescript
// 当前缺少 name 字段
export const gemma4Model = { id: 'gemma4:e4b', ... }; // ❌

// 正确
export const gemma4Model = { id: 'gemma4:e4b', name: 'Gemma 4 E4B', ... }; // ✅
```

**Bug #3：所有 AgentTool 缺少 `label` 字段**（pi-agent-core 接口要求）

---

## 三、目标架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Vigent SDK / CLI                             │
│  vigent run | vigent video | vigent generate | vigent tts | vigent serve │
└────────┬──────────────────┬───────────────────┬──────────────────────┘
         │                  │                   │
┌────────▼──────────────────▼───────────────────▼────────────────────┐
│                       VigentAgent（核心）                            │
│           基于 @mariozechner/pi-agent-core Agent 类                 │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐  │
│  │ Computer Use│  │ Vision       │  │ Video      │  │ Audio    │  │
│  │ 桌面控制    │  │ 图像理解     │  │ 理解+生成  │  │ TTS+STT  │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘  │
└─────────┼───────────────┼────────────────┼──────────────┼──────────┘
          │               │                │              │
┌─────────▼───────────────▼────────────────▼──────────────▼──────────┐
│                      pi-ai 多模型路由层                               │
│                                                                      │
│  Claude claude-opus-4-6/Sonnet  │  Gemini 2.5 Pro  │  Gemma4 Local  │
│  Computer Use + 推理 + VLM      │  长视频理解        │  离线/隐私      │
│                                                                      │
│              MiniMax API（生成专用）                                  │
│  Hailuo-2.3 视频生成  │  Image API 图像生成  │  TTS 语音合成          │
└──────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────────┐
│                      输入预处理管线                                   │
│  图片 → sharp 压缩  │  视频 → ffmpeg 帧提取 / Gemini File API        │
│  音频 → Whisper STT │  截图 → JPEG 0.75 / 1280px                    │
└─────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────────┐
│                      原生层（macOS，不动）                            │
│      Swift: 截图(ScreenCaptureKit) / Accessibility / App管理         │
│      Rust:  鼠标 / 键盘 / 滚轮 (enigo/napi-rs)                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 设计原则

1. **工具即接口**（from PiAgentCore）：每个 AgentTool 都是独立的、类型安全的、可测试的单元
2. **内容与细节分离**（from PiAgentCore）：`content[]` 给 LLM 看，`details` 给 UI/日志看
3. **事件驱动 UI**（from PiAgentCore）：所有 Agent 状态通过 subscribe() 事件推送，不轮询
4. **异步任务 + 轮询**（from minimax-cli）：长时操作（视频生成、File API 上传）必须支持 `--no-wait` 模式
5. **最小权限**（from Claude Code）：`beforeToolCall` 挡住危险操作，dangerous 工具需审批
6. **流式输出**（from all）：LLM 推理过程实时输出，不要等完成再渲染
7. **模态路由透明**：用户不需要关心哪个模型处理哪种模态，Agent 自动路由

---

## 四、核心数据类型设计

### 3.1 扩展 pi-ai 的 UserMessage 支持视频

pi-ai 当前 `UserMessage.content` 只支持 `TextContent | ImageContent`。视频有两种处理路径：

```typescript
// packages/core/src/types.ts

// 方式 A：多帧展开（短视频 < 60s，直接多张 ImageContent）
// 不需要扩展类型，提取帧后变成 ImageContent[] 即可

// 方式 B：File API 引用（长视频，上传后用 URI 引用）
export interface VideoFileContent {
  type: 'video_file';
  fileUri: string;       // Gemini File API 返回的 uri
  mimeType: string;      // video/mp4 etc.
  durationSeconds?: number;
}

// 方式 C：内联视频（小文件，base64，不推荐超过 20MB）
export interface VideoInlineContent {
  type: 'video_inline';
  data: string;          // base64
  mimeType: string;
}

// 合并到 VigentUserMessage（继承标准 UserMessage + 视频类型）
export type VigentContent = TextContent | ImageContent | VideoFileContent | VideoInlineContent;
```

### 3.2 VigentContext — 带视觉记忆的上下文

```typescript
export interface VigentContext {
  // 当前屏幕状态（最新一帧截图，随每次截图工具调用更新）
  currentScreen?: {
    base64: string;
    width: number;
    height: number;
    capturedAt: number;
  };
  
  // 操作历史摘要（被压缩的旧消息）
  actionSummary?: string;
  
  // 任务状态
  taskStatus: 'running' | 'success' | 'failed' | 'waiting_approval';
  
  // 已完成的步骤（用于断点续传）
  completedSteps: string[];
}
```

---

## 五、实施计划（分 5 个 Phase）

---

### Phase 0：清理 + 修 Bug（1-2 天）

**目标**：让现有的 natural mode 能正确跑通，消除已知 Bug

#### 0.1 删除录制/重放代码

```
删除：
  packages/recorder/          (整个目录)
  packages/agent/src/modes/replay.ts
  packages/agent/src/modes/record.ts（如果有）
  packages/core/src/types.ts 中的 ActionEvent, ActionLog

保留：
  packages/native-swift/       (截图 + Accessibility)
  packages/native-input/       (鼠标/键盘)
  packages/agent/src/tools.ts  (修格式后保留)
  packages/agent/src/modes/natural.ts
```

#### 0.2 修复工具返回格式

将 `tools.ts` 中所有工具的 return 格式从 Anthropic 原始格式改为 pi-agent-core 格式：

```typescript
// 修前（screenshotTool）
return {
  content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } }]
};

// 修后
return {
  content: [{ type: 'image' as const, data: result.base64, mimeType: 'image/jpeg' }],
  details: { width: result.width, height: result.height, displayId: result.displayId }
};
```

所有工具都加上 `label` 字段（pi-agent-core 接口要求）：

```typescript
export const screenshotTool: AgentTool = {
  name: 'screenshot',
  label: 'Take Screenshot',     // ← 新增
  description: '...',
  parameters: ...,
  execute: ...
};
```

#### 0.3 修复 Model 配置

```typescript
// packages/agent/src/model.ts
export const gemma4Model: CustomModel = {
  id: 'gemma4:e4b',
  name: 'Gemma 4 E4B',          // ← 新增
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 131072,
  maxTokens: 8192,               // ← 新增
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },  // ← 补全
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStore: false,
    maxTokensField: 'max_tokens',
  },
};
```

#### 0.4 更新 pnpm-workspace 和依赖

```json
// packages/agent/package.json
{
  "dependencies": {
    "@mariozechner/pi-agent-core": "workspace:*" 或 "latest",
    "@mariozechner/pi-ai": "workspace:*" 或 "latest",
    "@sinclair/typebox": "^0.34"
  }
}
```

验收标准：`node packages/agent/dist/index.js run "open calculator"` 能成功运行（配 Ollama + gemma4:e4b）

---

### Phase 1：多模型支持（2-3 天）

**目标**：支持 Claude、Gemini、Gemma4 Local 三条路径，可通过 `--model` 切换

#### 1.1 模型配置中心

新建 `packages/agent/src/models.ts`：

```typescript
import { getModel, type Model } from '@mariozechner/pi-ai';
import type { OpenAICompletionsCompat } from '@mariozechner/pi-ai';

// ===== 云端推理（高质量，推荐用于生产任务）=====

// Claude claude-opus-4-6 — 最强推理能力，Computer Use 最稳定
export const claudeOpus = getModel('anthropic', 'claude-opus-4-6');

// Claude claude-sonnet-4-6 — 速度/质量平衡，日常 Computer Use 首选  
export const claudeSonnet = getModel('anthropic', 'claude-sonnet-4-6');

// Claude claude-haiku-4-5 — 低延迟，适合快速状态验证
export const claudeHaiku = getModel('anthropic', 'claude-haiku-4-5-20251001');

// Gemini 2.5 Pro — 原生视频理解，长上下文（2M token）
// 用 getModel 或自定义配置（取决于 pi-ai 版本是否已收录）
export const gemini25Pro = getModel('google', 'gemini-2.5-pro-preview-05-06');

// Gemini 2.0 Flash — 低成本视频理解，速度快
export const gemini20Flash = getModel('google', 'gemini-2.0-flash');

// ===== 本地推理（离线/隐私优先）=====

// Gemma 4 E4B — 本地多模态，视觉 + 工具调用
export const gemma4Local: Model<'openai-completions'> = {
  id: 'gemma4:e4b',
  name: 'Gemma 4 E4B (Local)',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 131072,
  maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStore: false,
    maxTokensField: 'max_tokens',
  } as OpenAICompletionsCompat,
};

// ===== 模型路由策略 =====

export type VigentModelPreset = 
  | 'best'          // claude-opus-4-6（最强推理）
  | 'fast'          // claude-haiku（低延迟）
  | 'video'         // gemini-2.5-pro（视频理解）
  | 'local'         // gemma4:e4b（离线）
  | 'balanced';     // claude-sonnet（默认）

export function resolveModel(preset: VigentModelPreset | string): Model<any> {
  const presets: Record<VigentModelPreset, Model<any>> = {
    best: claudeOpus,
    fast: claudeHaiku,
    video: gemini25Pro,
    local: gemma4Local,
    balanced: claudeSonnet,
  };
  return presets[preset as VigentModelPreset] ?? claudeSonnet;
}
```

#### 1.2 环境变量配置

新建 `packages/agent/src/config.ts`：

```typescript
export interface VigentConfig {
  model: string;                    // 模型 preset 或 ID
  anthropicApiKey?: string;         // from ANTHROPIC_API_KEY
  googleApiKey?: string;            // from GOOGLE_API_KEY / GEMINI_API_KEY
  ollamaBaseUrl: string;            // from OLLAMA_BASE_URL, default localhost:11434
  permissionMode: 'auto' | 'ask' | 'deny';  // 工具权限模式
  maxSteps: number;                 // 最大循环步数，防止无限循环
  screenshotQuality: number;        // JPEG 质量 0-1
  screenshotMaxWidth: number;       // 截图最大宽度（控制 token 消耗）
}

export function loadConfig(overrides?: Partial<VigentConfig>): VigentConfig {
  return {
    model: process.env.VIGENT_MODEL ?? 'balanced',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    permissionMode: (process.env.VIGENT_PERMISSION ?? 'auto') as any,
    maxSteps: parseInt(process.env.VIGENT_MAX_STEPS ?? '50'),
    screenshotQuality: 0.75,
    screenshotMaxWidth: 1280,
    ...overrides,
  };
}
```

#### 1.3 API Key 动态注入

通过 pi-agent-core 的 `getApiKey` 选项注入：

```typescript
const agent = new Agent({
  initialState: { model: resolveModel(config.model), ... },
  getApiKey: async (provider) => {
    if (provider === 'anthropic') return config.anthropicApiKey;
    if (provider === 'google') return config.googleApiKey;
    return undefined; // ollama 不需要 key
  },
});
```

验收标准：`vigent run --model best "截图看看当前屏幕有什么"` 使用 Claude claude-opus-4-6 正常运行

---

### Phase 2：工具集完善（3-4 天）

**目标**：构建完整的 Computer Use 工具集，覆盖所有 Agent 在 macOS 上需要的原子操作

#### 2.1 工具清单与接口标准

所有工具都 implement `AgentTool<TParameters, TDetails>` 接口（来自 pi-agent-core），**并扩展 Claude Code 中学到的工程属性**：

```typescript
interface AgentTool<TParameters extends TSchema, TDetails = any> {
  name: string;
  label: string;                    // UI 显示用
  description: string;
  parameters: TParameters;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>
  ) => Promise<AgentToolResult<TDetails>>;
  
  // === 来自 Claude Code Tool.ts 的工程增强（可选但推荐）===
  
  /**
   * 工具调用是否并发安全（不产生写副作用）
   * Claude Code 用此属性将工具分批：读安全工具并发执行，写工具串行
   * 默认：false（保守）
   */
  isConcurrencySafe?: boolean;
  
  /**
   * 工具结果最大字符数（超出时持久化到磁盘，向 LLM 发送文件引用而非完整内容）
   * 来自 Claude Code Tool.ts — 防止大型工具结果撑满上下文窗口
   * 
   * 实现策略：
   *   if (JSON.stringify(result.details).length > maxResultSizeChars) {
   *     const filePath = await writeTempFile(result.details);
   *     result.content = [{ type: 'text', text: `Result saved to: ${filePath}` }];
   *   }
   * 
   * 推荐值：run_applescript = 50_000，get_screen_info = 20_000
   */
  maxResultSizeChars?: number;
}
```

**工具并发分组策略**（来自 Claude Code `toolOrchestration.ts`）：

```typescript
// packages/agent/src/tools/orchestration.ts

export function partitionToolCalls(tools: AgentTool[], calls: ToolCall[]) {
  const concurrent: ToolCall[] = [];
  const serial: ToolCall[] = [];
  
  for (const call of calls) {
    const tool = tools.find(t => t.name === call.name);
    if (tool?.isConcurrencySafe) {
      concurrent.push(call);
    } else {
      serial.push(call);
    }
  }
  return { concurrent, serial };
}

// 并发执行（最多 10 个）
const MAX_CONCURRENT = parseInt(process.env.VIGENT_MAX_TOOL_CONCURRENCY ?? '10');

// ⚠️ 兄弟取消（来自 Claude Code StreamingToolExecutor.ts）
// 若并发批次中某个工具执行失败，取消其余正在运行的工具
// 防止在错误状态下继续操作屏幕
async function runConcurrentToolsWithSiblingCancel(
  tools: ToolCall[],
  execute: (tool: ToolCall) => Promise<ToolResult>
): Promise<ToolResult[]> {
  const abortController = new AbortController();
  const promises = tools.map(async (tool) => {
    try {
      return await execute(tool);
    } catch (err) {
      abortController.abort(); // 取消兄弟
      throw err;
    }
  });
  return Promise.all(promises);
}
```

**各工具并发属性标注**：

| 工具 | `isConcurrencySafe` | 理由 |
|------|---------------------|------|
| `screenshot` | `true` | 只读，无副作用 |
| `get_element_at` | `true` | 只读 |
| `get_screen_info` | `true` | 只读 |
| `wait` | `true` | 无副作用 |
| `get_clipboard` | `true` | 只读 |
| `click` | `false` | 写操作，影响 UI 状态 |
| `type_text` | `false` | 写操作 |
| `press_key/keys` | `false` | 写操作 |
| `scroll` | `false` | 写操作 |
| `drag` | `false` | 写操作 |
| `run_applescript` | `false` | 高危，必须串行 |

#### 2.2 视觉/观察工具（3 个）

**`screenshot`** — 截图并返回图像（最关键）
```typescript
// 输入：{ scale?: 0-1, maxWidth?: number, displayId?: number }
// 输出 content：[ImageContent]  details：{ width, height, displayId, path? }
// 已存在，只需修格式
```

**`get_element_at`** — 获取坐标处的 UI 元素信息（Accessibility API）
```typescript
// 输入：{ x: number, y: number }
// 输出 content：[TextContent("role: Button, title: OK")]
// details：{ role, title, value, description, isEnabled }
// Swift: Accessibility.getElementAtPoint(x, y)
```

**`get_screen_info`** — 获取屏幕环境信息（无需截图）
```typescript
// 无输入
// 输出：当前前台 App、窗口标题、屏幕分辨率、鼠标位置、已运行 App 列表
// 轻量操作，用于快速定向
```

#### 2.3 输入控制工具（6 个，已有，修格式）

```typescript
// click        — 单击/双击/右击，已有
// type_text    — 输入文本，已有
// press_key    — 单个按键，已有  
// press_keys   — 组合键，已有
// scroll       — 滚轮，已有
// drag         — 拖拽（已有，含动画插值）
```

**修改点**：全部加 `label`，修返回格式，所有 `details` 补充实际执行信息

#### 2.4 App/系统工具（4 个）

**`open_app`** — 已有，修格式

**`focus_app`** — 将指定 App 切换到前台（新增）
```typescript
// 输入：{ name: string }
// Swift: NSWorkspace.shared.frontmostApplication → activate
```

**`run_applescript`** — 执行 AppleScript（高级系统控制）
```typescript
// 输入：{ script: string }
// 高危工具！beforeToolCall 需要 permissionMode=ask 时要求审批
// 可用于：Finder 操作、系统设置、跨 App 自动化
// 执行：child_process.exec('osascript -e ...')
```

**`get_clipboard`** / **`set_clipboard`** — 剪贴板读写（新增）
```typescript
// 读剪贴板内容（文本/图片）
// 写文本到剪贴板
// 配合 Cmd+V 用于复杂文本输入（避免字符编码问题）
```

#### 2.5 等待/验证工具（2 个）

**`wait`** — 等待固定时长（已有）

**`wait_for_change`** — 等待屏幕发生变化（新增）
```typescript
// 输入：{ timeoutMs: number, region?: { x, y, w, h } }
// 每 500ms 截图一次，比较 MD5，发生变化则返回
// 用于等待加载动画、弹窗出现等异步 UI 变化
// details：{ changed: boolean, elapsedMs: number }
```

#### 2.6 工具权限系统

**四步权限流程**（来自 Claude Code `useCanUseTool.tsx`）：

```
1. [Auto] hasPermissionsToUseTool() ── 配置规则检查，直接放行/拒绝
         ↓ 未命中
2. [Classifier] 等待最多 2s 看是否有预测性分类结果
         ↓ 未命中或低置信度
3. [Interactive] 展示工具描述，等待用户 allow/deny/once
         ↓ AbortError
4. [Error] cancelAndAbort 传播中止信号
```

Vigent 简化版：step 1（配置规则）→ step 3（交互确认），跳过分类器。

通过 `beforeToolCall` 实现：

```typescript
// packages/agent/src/permissions.ts

export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

// 危险工具分级
const TOOL_RISK: Record<string, RiskLevel> = {
  screenshot: 'safe',
  get_element_at: 'safe',
  get_screen_info: 'safe',
  wait: 'safe',
  wait_for_change: 'safe',
  click: 'moderate',
  type_text: 'moderate',
  scroll: 'moderate',
  press_key: 'moderate',
  press_keys: 'moderate',
  drag: 'moderate',
  open_app: 'moderate',
  focus_app: 'moderate',
  get_clipboard: 'moderate',
  set_clipboard: 'moderate',
  run_applescript: 'dangerous',    // 可执行任意系统命令
};

export function createPermissionGuard(mode: 'auto' | 'ask' | 'deny') {
  return async ({ toolCall, args }: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> => {
    const risk = TOOL_RISK[toolCall.name] ?? 'dangerous';
    
    if (mode === 'deny' && risk !== 'safe') {
      return { block: true, reason: `Tool '${toolCall.name}' blocked in deny mode` };
    }
    
    if (mode === 'ask' && risk === 'dangerous') {
      // 打印到 stderr，等待用户确认
      const approved = await promptUser(
        `⚠️  Agent wants to run: ${toolCall.name}(${JSON.stringify(args)})\nApprove? [y/N]: `
      );
      if (!approved) {
        return { block: true, reason: 'User denied the action' };
      }
    }
    
    return undefined; // 允许执行
  };
}
```

---

### Phase 3：多模态生成与音频管线（5-7 天）

**目标**：实现视频理解、视频生成、图像生成、音频 TTS/STT 四条管线，让 Agent 能感知和生成所有主流媒体格式

#### 3.0 能力总览

| 子模块 | 方向 | 接口形式 |
|--------|------|----------|
| 视频理解 | 视频文件 → 内容分析 | `analyze_video` 工具 |
| 视频生成 | 文本/首帧 → 视频文件 | `generate_video` 工具 + minimax-cli 模式 |
| 图像生成 | 文本提示 → 图片 | `generate_image` 工具 |
| TTS | 文本 → 语音文件 | `text_to_speech` 工具 |
| STT | 音频文件/麦克风 → 文本 | 输入预处理 |

---

**以下为原有视频理解管线（已有，保留）：**

**目标（视频理解部分）**：让 Agent 能接受视频文件作为输入，提取关键信息并注入上下文

#### 3.1 为什么视频支持复杂

pi-ai 当前 `UserMessage.content` 只支持 `TextContent | ImageContent`，没有视频类型。但各个模型的视频支持方式不同：

| 模型 | 视频支持方式 | 最大长度 | 成本 |
|------|-------------|----------|------|
| Gemini 2.5 Pro | File API（异步上传）| 1 小时 | 低 |
| Gemini 2.0 Flash | File API / inline base64 | 1 小时 / <20MB | 低 |
| Claude 3.x | ❌ 不支持视频 | — | — |
| Claude claude-opus-4-6 | ❌ 不支持视频 | — | — |
| Gemma 4 (Ollama) | ❌ 当前不支持视频 | — | — |

**结论**：视频理解必须路由到 Gemini，其他模型使用多帧展开方案

#### 3.2 双路径架构

```
视频文件输入
     │
     ├──── 时长 < 30s 且大小 < 10MB ──→ 路径 A：多帧展开
     │                                   ↓
     │                             提取 N 帧（8-16 帧）
     │                             → ImageContent[]
     │                             → 任意支持图像的模型
     │
     └──── 时长 >= 30s 或文件较大 ──→ 路径 B：File API
                                     ↓
                                 上传到 Gemini File API
                                 获取 fileUri
                                 → VideoFileContent
                                 → 必须使用 Gemini 模型
```

#### 3.3 帧提取模块

新建 `packages/video/src/extractor.ts`（新 package：`@vigent/video`）：

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

export interface VideoInfo {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  fileSizeBytes: number;
  codec: string;
}

export interface ExtractedFrame {
  index: number;
  timestampSeconds: number;
  base64: string;
  mimeType: 'image/jpeg';
}

/**
 * 获取视频元信息（依赖 ffprobe）
 */
export async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams', '-show_format',
    videoPath
  ]);
  
  const info = JSON.parse(stdout);
  const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
  
  return {
    durationSeconds: parseFloat(info.format.duration),
    width: videoStream.width,
    height: videoStream.height,
    fps: eval(videoStream.r_frame_rate),  // "30/1" → 30
    fileSizeBytes: parseInt(info.format.size),
    codec: videoStream.codec_name,
  };
}

/**
 * 提取关键帧
 * 策略：在时间轴上均匀采样 frameCount 帧
 */
export async function extractFrames(
  videoPath: string,
  options: {
    frameCount?: number;       // 总帧数，默认 8
    maxWidth?: number;         // 缩放宽度，默认 1280
    quality?: number;          // JPEG 质量 1-31（越小越好），默认 3
    startSeconds?: number;     // 开始时间，默认 0
    endSeconds?: number;       // 结束时间，默认全长
  } = {}
): Promise<ExtractedFrame[]> {
  const { frameCount = 8, maxWidth = 1280, quality = 3 } = options;
  const info = await getVideoInfo(videoPath);
  
  const start = options.startSeconds ?? 0;
  const end = options.endSeconds ?? info.durationSeconds;
  const duration = end - start;
  
  const outDir = join(tmpdir(), `vigent-frames-${Date.now()}`);
  await import('fs').then(fs => fs.promises.mkdir(outDir, { recursive: true }));
  
  // 使用 fps 滤镜均匀采样
  const targetFps = frameCount / duration;
  
  await execFileAsync('ffmpeg', [
    '-ss', String(start),
    '-to', String(end),
    '-i', videoPath,
    '-vf', `fps=${targetFps},scale=${maxWidth}:-2`,
    '-q:v', String(quality),
    '-frames:v', String(frameCount),
    join(outDir, 'frame_%04d.jpg')
  ]);
  
  // 读取所有帧文件并转 base64
  const frames: ExtractedFrame[] = [];
  for (let i = 1; i <= frameCount; i++) {
    const framePath = join(outDir, `frame_${String(i).padStart(4, '0')}.jpg`);
    if (!existsSync(framePath)) break;
    
    const data = readFileSync(framePath);
    frames.push({
      index: i - 1,
      timestampSeconds: start + (duration * (i - 1) / (frameCount - 1)),
      base64: data.toString('base64'),
      mimeType: 'image/jpeg',
    });
  }
  
  // 清理临时目录
  await import('fs').then(fs => fs.promises.rm(outDir, { recursive: true }));
  
  return frames;
}

/**
 * 短视频路径：提取帧 → ImageContent[]（可直接塞进任意支持图像的模型）
 */
export async function videoToImageContents(
  videoPath: string,
  frameCount = 8
): Promise<Array<{ type: 'image'; data: string; mimeType: string }>> {
  const frames = await extractFrames(videoPath, { frameCount });
  return frames.map(f => ({
    type: 'image' as const,
    data: f.base64,
    mimeType: f.mimeType,
  }));
}
```

#### 3.4 Gemini File API 集成

新建 `packages/video/src/gemini-file-api.ts`：

```typescript
/**
 * Gemini File API：上传视频文件，获取 URI 供后续推理使用
 * 
 * API 文档：https://ai.google.dev/gemini-api/docs/files
 * 上传后的文件有效期：48 小时
 */

export interface UploadedFile {
  name: string;           // 例如 "files/abc123"
  uri: string;            // 例如 "https://generativelanguage.googleapis.com/v1beta/files/abc123"
  mimeType: string;
  sizeBytes: number;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  expirationTime: string; // ISO 8601
}

export async function uploadVideoToGemini(
  videoPath: string,
  apiKey: string,
  onProgress?: (percent: number) => void
): Promise<UploadedFile> {
  const { readFileSync, statSync } = await import('node:fs');
  const { basename } = await import('node:path');
  
  const fileData = readFileSync(videoPath);
  const fileSize = statSync(videoPath).size;
  const mimeType = guessMimeType(videoPath);
  const displayName = basename(videoPath);
  
  // Step 1：初始化上传
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );
  
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('Failed to get upload URL from Gemini');
  
  // Step 2：上传文件体
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileData,
  });
  
  const uploadedFile: { file: UploadedFile } = await uploadRes.json();
  return uploadedFile.file;
}

/**
 * 轮询等待文件处理完成（PROCESSING → ACTIVE）
 */
export async function waitForFileActive(
  fileUri: string,
  apiKey: string,
  maxWaitMs = 120_000
): Promise<UploadedFile> {
  const deadline = Date.now() + maxWaitMs;
  const fileName = fileUri.split('/').pop()!;
  
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}`
    );
    const file: UploadedFile = await res.json();
    
    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') throw new Error('Gemini file processing failed');
    
    await new Promise(r => setTimeout(r, 2000)); // 每 2s 轮询
  }
  
  throw new Error('Timeout waiting for Gemini file to be processed');
}

function guessMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimes: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  };
  return mimes[ext ?? ''] ?? 'video/mp4';
}
```

#### 3.5 视频工具（供 Agent 调用）

在 `packages/agent/src/tools/video-tools.ts` 中新增：

```typescript
// analyze_video — 让 Agent 能理解视频文件
export const analyzeVideoTool: AgentTool = {
  name: 'analyze_video',
  label: 'Analyze Video',
  description: '分析视频文件内容。短视频（<30s）提取多帧理解，长视频上传到云端模型分析。',
  parameters: Type.Object({
    path: Type.String({ description: '视频文件路径' }),
    question: Type.String({ description: '关于视频的问题' }),
    frameCount: Type.Optional(Type.Number({ description: '提取帧数（短视频用），默认 8' })),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    onUpdate?.({ 
      content: [{ type: 'text', text: `正在分析视频：${params.path}` }],
      details: { status: 'loading' }
    });
    
    const info = await getVideoInfo(params.path);
    
    // 根据时长决定策略
    if (info.durationSeconds < 30 && info.fileSizeBytes < 10 * 1024 * 1024) {
      // 短视频：多帧展开
      const imageContents = await videoToImageContents(params.path, params.frameCount ?? 8);
      return {
        content: imageContents,  // ImageContent[]，Agent 框架会自动处理
        details: { strategy: 'frame_extraction', frameCount: imageContents.length, ...info }
      };
    } else {
      // 长视频：这个工具本身不直接分析，而是返回 fileUri 供后续使用
      // 实际分析需在 VigentAgent 层面路由到 Gemini
      return {
        content: [{ type: 'text', text: `视频已就绪，时长 ${info.durationSeconds.toFixed(1)}s，请使用 Gemini 模型分析` }],
        details: { strategy: 'file_api_required', ...info }
      };
    }
  }
};
```

#### 3.6 Gemini 的视频理解入口（单独命令模式）

新建 `packages/agent/src/modes/video.ts`：

```typescript
// vigent video <path> "问题" --model video
export async function runVideoMode(videoPath: string, question: string, config: VigentConfig) {
  const model = resolveModel('video'); // → gemini-2.5-pro
  const info = await getVideoInfo(videoPath);
  
  const agent = new Agent({
    initialState: {
      systemPrompt: VIDEO_ANALYSIS_SYSTEM_PROMPT,
      model,
      tools: [],  // 视频分析模式不需要 Computer Use 工具
    },
    getApiKey: async (provider) => provider === 'google' ? config.googleApiKey : undefined,
  });
  
  let userContent: any[];
  
  if (info.durationSeconds < 30 && info.fileSizeBytes < 10 * 1024 * 1024) {
    // 短视频：多帧
    const frames = await videoToImageContents(videoPath, 12);
    userContent = [
      ...frames,
      { type: 'text', text: question }
    ];
  } else {
    // 长视频：File API
    console.error('[Upload] 上传视频到 Gemini File API...');
    const uploaded = await uploadVideoToGemini(videoPath, config.googleApiKey!);
    await waitForFileActive(uploaded.uri, config.googleApiKey!);
    console.error('[Upload] 完成');
    
    // Gemini 的 UserMessage 需要特殊处理（pi-ai Google provider 的 inlineData 字段）
    // 目前 pi-ai 不支持 videoFileUri 类型，需要用 onPayload 钩子注入
    userContent = [
      { type: 'text', text: question },
      // Note：通过 onPayload 拦截 payload，注入 fileData 部分
    ];
  }
  
  agent.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  });
  
  await agent.prompt({ role: 'user', content: userContent, timestamp: Date.now() });
}
```

---

#### 3.7 视频生成工具（MiniMax Hailuo-2.3）

新建 `packages/agent/src/tools/generate-video.ts`：

```typescript
export const generateVideoTool: AgentTool = {
  name: 'generate_video',
  label: 'Generate Video',
  description: '根据文字描述（或首帧图片）生成视频，使用 MiniMax Hailuo-2.3 模型。',
  isConcurrencySafe: false,
  parameters: Type.Object({
    prompt: Type.String({ description: '视频内容描述' }),
    firstFramePath: Type.Optional(Type.String({ description: '首帧图片路径（可选，增强控制感）' })),
    download: Type.Optional(Type.String({ description: '保存路径，如 ./output.mp4' })),
    noWait: Type.Optional(Type.Boolean({ description: '立即返回 taskId，不等待完成' })),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 调用 minimax-cli 的视频生成 API（或直接集成 HTTP 调用）
    // 1. POST /video/generation 获取 taskId
    // 2. 轮询 GET /query/video_generation?task_id=xxx 直到 Success
    // 3. 调用 /files/retrieve 获取 download_url
    // 4. 下载到本地
    
    const { videoGenerateEndpoint, videoTaskEndpoint, fileRetrieveEndpoint } = await import('../client/minimax');
    
    onUpdate?.({
      content: [{ type: 'text', text: `[MiniMax] 提交视频生成任务...` }],
      details: { status: 'submitting', prompt: params.prompt }
    });
    
    // ... 实现 minimax-cli 相同的 poll 逻辑（参照 minimax-cli/src/commands/video/generate.ts）
    
    return {
      content: [{ type: 'text', text: `视频已生成：${localPath}` }],
      details: { taskId, filePath: localPath, durationMs: elapsed }
    };
  }
};
```

**关键设计**：
- 轮询间隔 5s，超时跟随全局 timeout 配置
- `noWait: true` 时立即返回 `{ taskId }`，Agent 可稍后用 `check_video_task` 查询
- 首帧图片自动 base64 编码（与 minimax-cli 一致）

---

#### 3.8 图像生成工具（MiniMax Image API）

新建 `packages/agent/src/tools/generate-image.ts`：

```typescript
export const generateImageTool: AgentTool = {
  name: 'generate_image',
  label: 'Generate Image',
  description: '根据文字描述生成图片，返回图片内容供后续工具或用户查看。',
  isConcurrencySafe: false,
  parameters: Type.Object({
    prompt: Type.String({ description: '图片内容描述' }),
    aspectRatio: Type.Optional(Type.String({ description: '宽高比，如 16:9、1:1（默认 1:1）' })),
    download: Type.Optional(Type.String({ description: '保存路径，如 ./output.png' })),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // POST https://api.minimax.io/v1/image_generation
    // 返回 base64 图片数据，直接作为 ImageContent 返回给 LLM
    
    const response = await fetch('https://api.minimax.io/v1/image_generation', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'image-01', prompt: params.prompt, aspect_ratio: params.aspectRatio ?? '1:1' })
    });
    
    const data = await response.json();
    const imageBase64 = data.data.image_base64; // 假设 API 返回 base64
    
    return {
      content: [{ type: 'image' as const, data: imageBase64, mimeType: 'image/png' }],
      details: { prompt: params.prompt, savedTo: params.download }
    };
  }
};
```

---

#### 3.9 音频管线（TTS + STT）

**TTS（文字转语音）** — 新建 `packages/agent/src/tools/text-to-speech.ts`：

```typescript
export const textToSpeechTool: AgentTool = {
  name: 'text_to_speech',
  label: 'Text to Speech',
  description: '将文字转换为语音文件，使用 MiniMax TTS API。',
  isConcurrencySafe: false,
  parameters: Type.Object({
    text: Type.String({ description: '要转换的文字' }),
    voiceId: Type.Optional(Type.String({ description: '音色 ID（默认：female-shaonv）' })),
    download: Type.String({ description: '保存路径，如 ./output.mp3' }),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 调用 MiniMax TTS API（参照 minimax-cli/src/commands/tts/）
    // POST /v1/t2a_v2 → 获取音频 base64 或流
    // 保存到 params.download
    
    return {
      content: [{ type: 'text', text: `语音已保存：${params.download}` }],
      details: { voiceId: params.voiceId, textLength: params.text.length, path: params.download }
    };
  }
};
```

**支持音色**（来自 MiniMax TTS API，`memory/reference-minimax-tts.md` 有完整列表）：
- `female-shaonv` — 少女音（甜美）
- `male-qn-qingse` — 青涩青年
- `audiobook-female-1` — 有声书女主
- 共 20+ 预设音色

**STT（语音转文字）** — 作为输入预处理而非 Agent 工具：

```typescript
// packages/agent/src/input/stt.ts
// 使用 Whisper（本地）或 OpenAI Whisper API
export async function transcribeAudio(audioPath: string): Promise<string> {
  // 方式 A：本地 Whisper（离线优先）
  // whisper <audioPath> --output_format txt
  // 方式 B：OpenAI API whisper-1 模型
  // POST /v1/audio/transcriptions
}

// vigent 命令行处理：
// vigent run --audio ./command.mp3
// → transcribeAudio() → 文本 → agent.prompt(text)
```

---

### Phase 4：核心推理循环增强（3-4 天）

**目标**：让 Agent 的推理质量和可靠性达到生产水平

#### 4.1 视觉状态机（Grounded Action Loop）

这是和纯 LLM 对话最大的区别。Computer Use Agent 必须在每个操作后确认状态：

```
用户任务
   ↓
[observe] 截图 → 理解当前状态
   ↓
[plan]    决定下一步操作
   ↓
[act]     执行操作（click / type / etc.）
   ↓
[verify]  截图 → 确认操作是否成功
   ↓
[loop]    任务完成？→ 结束 : → 回到 observe
```

系统 Prompt 需要明确引导这个循环：

```typescript
// packages/agent/src/prompts.ts

export const COMPUTER_USE_SYSTEM_PROMPT = `
You are Vigent, a macOS Computer Use Agent. You control the computer by calling tools.

## Your Loop
1. **Observe**: Always start by calling \`screenshot\` to see the current screen state
2. **Plan**: Think about what needs to be done based on what you see
3. **Act**: Call ONE action tool (click, type_text, press_keys, etc.)
4. **Verify**: Call \`screenshot\` again to confirm the action worked
5. **Continue**: Loop until the task is complete

## Rules
- NEVER assume an action worked without verifying via screenshot
- If an action fails, try alternative approaches (different coordinates, different keys)
- Use \`get_element_at\` to understand UI elements before clicking
- Use \`wait\` (500-2000ms) after opening apps or triggering UI changes
- Be precise with coordinates — they are absolute screen pixels
- When typing text, first click the input field, then type

## Completion
Say "Task completed." when done. Say "Task failed: <reason>" if you cannot proceed.
`.trim();
```

#### 4.2 Context 窗口管理

截图是重量级内容（每张 1280px JPEG @0.75 quality ≈ 150-400KB，base64 后约 200-533KB，折合约 50,000-133,000 tokens）。
需要主动管理。Claude Code 的策略是在 `contextWindow - 13,000 tokens` 时触发自动压缩。

**Token 计算正确公式**（来自 Claude Code `apiLimits.ts` 推导）：

```
base64字符数 → bytes：bytes = base64Chars × 0.75
bytes → tokens（Anthropic）：tokens = bytes / (0.125 × 4) = bytes / 0.5 = bytes × 2

// 更精确：
// 1 token ≈ 4 bytes（文本）
// 图像：Anthropic 按 (ceil(width/32) × ceil(height/32)) × 2 个 token
// 粗估：base64Chars × 0.75 / 0.5 = base64Chars × 1.5（tokens 数量）
```

新建 `packages/agent/src/context-manager.ts`：

```typescript
import type { AgentMessage } from '@mariozechner/pi-agent-core';

// API 图像限制（来自 Claude Code constants/apiLimits.ts）
export const IMAGE_MAX_BASE64_BYTES = 5 * 1024 * 1024;   // 5MB base64 上限
export const IMAGE_MAX_DIMENSION = 2000;                  // 最大宽/高（px）
export const IMAGE_TARGET_RAW_BYTES = 3.75 * 1024 * 1024; // 目标原始大小
export const MAX_MEDIA_PER_REQUEST = 100;                 // 单次请求最大图像数

// 自动压缩阈值（来自 Claude Code autoCompact.ts）
// 在剩余 BUFFER_TOKENS 时触发压缩
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;

// 估算 messages 的 token 数（正确公式）
export function estimateTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
      for (const block of content) {
        if (block.type === 'text') {
          total += block.text.length / 4;  // ~4 chars per token
        }
        if (block.type === 'image') {
          // base64Chars × 0.75 = bytes，bytes × 2 ≈ tokens（Anthropic 估算）
          total += (block.data.length * 0.75) * 2;
        }
      }
    } else if (msg.role === 'assistant') {
      for (const block of (msg as any).content) {
        if (block.type === 'text') total += block.text.length / 4;
      }
    }
  }
  return Math.round(total);
}

// 裁剪旧截图：保留最近 N 张，将旧截图替换为文字摘要
export async function pruneScreenshots(
  messages: AgentMessage[],
  options: {
    keepRecentScreenshots: number;  // 保留最近几张截图（默认 3）
    maxTokens: number;              // 超过此 token 数才触发裁剪（默认 50000）
  } = { keepRecentScreenshots: 3, maxTokens: 50_000 }
): Promise<AgentMessage[]> {
  if (estimateTokens(messages) < options.maxTokens) {
    return messages;  // 未超限，不裁剪
  }
  
  // 找到所有包含截图的 user 消息
  const screenshotIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'toolResult') {
      const content = (msg as any).content ?? [];
      if (content.some((c: any) => c.type === 'image')) {
        screenshotIndices.push(i);
      }
    }
  }
  
  // 保留最近 N 张，将之前的截图替换为文字占位
  const keepFrom = screenshotIndices.length - options.keepRecentScreenshots;
  const indicesToPrune = new Set(screenshotIndices.slice(0, Math.max(0, keepFrom)));
  
  return messages.map((msg, i) => {
    if (!indicesToPrune.has(i)) return msg;
    
    // 替换 ImageContent 为文字占位（来自 Claude Code compact.ts：stripImagesFromMessages）
    const newContent = ((msg as any).content ?? []).map((c: any) => {
      if (c.type === 'image') {
        // 与 Claude Code 一致：用 [image] 替换（紧凑，不解释）
        return { type: 'text', text: '[image]' };
      }
      return c;
    });
    
    return { ...msg, content: newContent };
  });
}
```

注入到 Agent 的 `transformContext`：

```typescript
const agent = new Agent({
  ...,
  transformContext: (messages, signal) => pruneScreenshots(messages, {
    keepRecentScreenshots: 3,
    // 触发阈值：contextWindow - AUTOCOMPACT_BUFFER_TOKENS
    // Claude claude-opus-4-6：200k - 13k = 187k tokens
    // 保守设为 100k，给推理和工具结果留足空间
    maxTokens: 100_000,
  }),
});
```

#### 4.3 步数限制与安全保障

```typescript
// 通过 beforeToolCall 实现步数统计
let actionCount = 0;
const MAX_ACTIONS = config.maxSteps;

const agent = new Agent({
  ...,
  beforeToolCall: async ({ toolCall, args, context }) => {
    // 1. 统计操作步数（排除 screenshot/wait 等观察工具）
    const isActionTool = ['click', 'type_text', 'press_key', 'press_keys', 'scroll', 'drag', 'run_applescript'].includes(toolCall.name);
    if (isActionTool) {
      actionCount++;
      if (actionCount > MAX_ACTIONS) {
        return { block: true, reason: `Max action limit (${MAX_ACTIONS}) reached` };
      }
    }
    
    // 2. 权限审批（dangerous 工具）
    const guard = createPermissionGuard(config.permissionMode);
    return guard({ toolCall, args, context } as any);
  },
});
```

#### 4.4 错误恢复

通过 `afterToolCall` 检测失败并注入提示：

```typescript
const agent = new Agent({
  ...,
  afterToolCall: async ({ toolCall, result, isError }) => {
    if (isError) {
      // 工具执行失败时，追加建议文本
      return {
        content: [
          ...result.content,
          { type: 'text', text: `⚠️ Tool '${toolCall.name}' failed. Consider: 1) Verify coordinates via screenshot 2) Check app is focused 3) Try alternative approach` }
        ],
      };
    }
    return undefined;
  },
});
```

#### 4.5 Token Budget 追踪（来自 Claude Code tokenBudget.ts）

长任务中 context 消耗会接近上限，Claude Code 用 `BudgetTracker` 实现软预警：

```typescript
// packages/agent/src/budget-tracker.ts

export interface BudgetStatus {
  usedTokens: number;
  maxTokens: number;
  usedPercent: number;
  isApproachingLimit: boolean;  // usedPercent > 0.9
  isDiminishing: boolean;       // 剩余 < 500 tokens
}

export class BudgetTracker {
  private maxTokens: number;
  
  constructor(contextWindow: number, bufferTokens = 13_000) {
    this.maxTokens = contextWindow - bufferTokens;
  }
  
  check(messages: AgentMessage[]): BudgetStatus {
    const usedTokens = estimateTokens(messages);
    const usedPercent = usedTokens / this.maxTokens;
    const remaining = this.maxTokens - usedTokens;
    
    return {
      usedTokens,
      maxTokens: this.maxTokens,
      usedPercent,
      isApproachingLimit: usedPercent > 0.9,    // COMPLETION_THRESHOLD
      isDiminishing: remaining < 500,            // DIMINISHING_THRESHOLD
    };
  }
}
```

接入 Agent 的 `beforeToolCall`，在 budget 告急时注入系统提示：

```typescript
const budget = new BudgetTracker(200_000 /* claude-opus-4-6 */);

beforeToolCall: async ({ context }) => {
  const status = budget.check(context.messages);
  if (status.isDiminishing) {
    return { block: true, reason: 'Context window almost full. Please wrap up the task.' };
  }
  // 接近上限时，下次 transformContext 会触发更激进的截图裁剪
  return undefined;
}
```

---

### Phase 5：CLI 界面与 SDK 封装（2-3 天）

**目标**：让 Vigent 既是好用的 CLI 工具，又是可嵌入的 Node.js SDK

#### 5.1 CLI 命令结构

参考 minimax-cli 的 `defineCommand` 模式重写 CLI：

```
# ── Computer Use ──────────────────────────────────────────────
vigent run "打开 Safari 并搜索 Claude"       # 桌面自动化任务
vigent run --model best "..."                # 指定模型
vigent run --permission ask "..."            # 每步操作前询问
vigent run --max-steps 20 "..."             # 限制步数
vigent run --audio ./cmd.mp3 "..."          # 语音指令输入（STT）

# ── 视频 ──────────────────────────────────────────────────────
vigent video ./demo.mp4 "视频里发生了什么"   # 视频理解（短视频帧提取）
vigent video ./long.mp4 "..." --model video  # 长视频（Gemini File API）
vigent generate video "一只猫在草地上跑"     # 文生视频（MiniMax Hailuo）
vigent generate video "..." --first-frame img.jpg  # 首帧控制
vigent generate video "..." --no-wait       # 提交后立即返回 taskId

# ── 图像 ──────────────────────────────────────────────────────
vigent generate image "夕阳下的海浪"        # 文生图（MiniMax Image）
vigent describe ./photo.jpg "这张图里有什么" # 图片理解（VLM）

# ── 音频 ──────────────────────────────────────────────────────
vigent tts "你好，我是 Vigent" --voice female-shaonv --out hello.mp3
vigent transcribe ./recording.mp3           # 语音转文字

# ── 调试 / 服务 ───────────────────────────────────────────────
vigent screenshot                           # 截图并输出路径
vigent info                                 # 环境信息（权限、可用模型、API key 状态）
vigent serve --port 3000                    # HTTP 模式（SSE 流式）
```

#### 5.2 实时 TUI 输出

参考 pi-mono `packages/tui` 的输出方案，打印每个 Agent 事件：

```typescript
// packages/agent/src/ui/terminal.ts

export function createTerminalUI(agent: Agent) {
  agent.subscribe((event) => {
    switch (event.type) {
      case 'agent_start':
        console.error('\n🤖 Vigent starting...\n');
        break;
        
      case 'message_update':
        if (event.assistantMessageEvent.type === 'text_delta') {
          process.stdout.write(event.assistantMessageEvent.delta);
        }
        break;
        
      case 'tool_execution_start':
        console.error(`\n  ⚙️  ${event.toolName}(${formatArgs(event.args)})`);
        break;
        
      case 'tool_execution_end':
        if (event.isError) {
          console.error(`  ❌ Error`);
        } else {
          console.error(`  ✅ Done`);
        }
        break;
        
      case 'agent_end':
        console.error('\n\n✅ Task completed.\n');
        break;
    }
  });
}
```

#### 5.3 HTTP Server 模式

参考 minimax-cli 的 HTTP 模式思路，新建 `packages/agent/src/modes/serve.ts`：

```typescript
// vigent serve --port 3000
// POST /run { task: "打开 Safari", model: "balanced", maxSteps: 30 }
// → SSE stream of AgentEvents

import { createServer } from 'node:http';

export function startServer(port: number, config: VigentConfig) {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404); res.end(); return;
    }
    
    // 读取 body
    const body = await readBody(req);
    const { task, model, maxSteps, permissionMode } = JSON.parse(body);
    
    // 设置 SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    // 创建 Agent 并订阅事件
    const agent = createVigentAgent({ ...config, model: model ?? config.model });
    agent.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    
    await agent.prompt(task);
    res.end();
  });
  
  server.listen(port, () => {
    console.error(`Vigent server running on http://localhost:${port}`);
  });
}
```

#### 5.4 SDK 导出

新建 `packages/sdk/src/index.ts`（或直接从 agent package 导出）：

```typescript
// @vigent/sdk — 供其他项目集成
export { VigentAgent, createVigentAgent } from './agent.js';
export type { VigentConfig, VigentModelPreset } from './config.js';
export { resolveModel } from './models.js';
export * from './tools/index.js';          // 所有 AgentTool 定义
export * from '@vigent/video';             // 视频摄取工具
```

使用示例：

```typescript
import { createVigentAgent } from '@vigent/sdk';

const agent = createVigentAgent({
  model: 'balanced',
  permissionMode: 'ask',
  maxSteps: 20,
});

agent.subscribe((event) => {
  if (event.type === 'tool_execution_start') {
    console.log(`Executing: ${event.toolName}`);
  }
});

await agent.prompt('打开 Chrome 并打开 google.com');
```

---

## 六、关键技术决策

### 6.1 为什么不用 Vercel AI SDK

| | Vercel AI SDK | pi-agent-core + pi-ai |
|--|--|--|
| 多模型 provider | 少 | 多（20+，含 Ollama/MiniMax）|
| 工具 return 支持图像 | 有限 | 支持 ImageContent |
| 流式事件粒度 | 中 | 极细（每个 delta、toolcall 生命周期）|
| 拦截 hooks | `experimental_prepareToolCall` | `beforeToolCall` + `afterToolCall` |
| 思维链（thinking）| 有限 | 全面支持 |
| 浏览器端运行 | 支持 | 支持（proxy 模式）|

**结论**：pi-agent-core 在 Computer Use + 多模态场景的细粒度控制上更适合

### 6.2 截图 token 控制策略

每张 1280px JPEG 截图（JPEG quality=0.75）约消耗：
- Claude（Anthropic）：`ceil(w/32) × ceil(h/32) × 2` tokens，1280×800 ≈ 3,200 tokens
- Gemini：按实际像素数，约 250-800 tokens

在 200k 上下文的 claude-opus-4-6 中，可以容纳约 60 张截图（100k / 1,600 平均）。实际任务每 3-5 步截图一次，50 步约 15-20 张，总体可控。

**多策略图像压缩管线**（来自 Claude Code `imageResizer.ts`）：

新建 `packages/agent/src/utils/image-compress.ts`：

```typescript
import sharp from 'sharp';  // 或 @ant/image-processor-napi（native，更快）

// API 硬限制
const MAX_BASE64_BYTES = 5 * 1024 * 1024;   // 5MB
const MAX_DIMENSION = 2000;                 // px
const TARGET_RAW_BYTES = 3.75 * 1024 * 1024; // 3.75MB 目标

/**
 * 多策略压缩截图，确保在 API 限制内
 * 策略顺序（来自 Claude Code）：
 *   1. 按最大宽度缩放（100% → 75% → 50% → 25%）
 *   2. PNG：调色板优化（compressionLevel:9, palette:true, colors:64）
 *   3. JPEG：质量降级（80 → 60 → 40 → 20）
 *   4. 兜底：400×400 @ JPEG quality:20
 */
export async function compressScreenshot(
  buffer: Buffer,
  options: {
    maxWidth?: number;        // 默认 1280
    jpegQuality?: number;     // 默认 0.75（同 Claude Code）
  } = {}
): Promise<Buffer> {
  const { maxWidth = 1280, jpegQuality = 0.75 } = options;
  
  const metadata = await sharp(buffer).metadata();
  const origWidth = metadata.width ?? 1920;
  const origHeight = metadata.height ?? 1080;
  
  // Step 1：按比例缩放（渐进式）
  const scales = [1.0, 0.75, 0.5, 0.25];
  for (const scale of scales) {
    const targetWidth = Math.min(Math.round(origWidth * scale), maxWidth, MAX_DIMENSION);
    const targetHeight = Math.round(origHeight * (targetWidth / origWidth));
    
    const resized = await sharp(buffer)
      .resize(targetWidth, targetHeight, { fit: 'inside' })
      .jpeg({ quality: Math.round(jpegQuality * 100) })
      .toBuffer();
    
    // 检查 base64 大小（base64 = bytes × 4/3）
    if (resized.length * (4/3) <= MAX_BASE64_BYTES) {
      return resized;
    }
  }
  
  // Step 2：JPEG 质量降级
  for (const quality of [80, 60, 40, 20]) {
    const compressed = await sharp(buffer)
      .resize(Math.min(origWidth, maxWidth, MAX_DIMENSION), null, { fit: 'inside' })
      .jpeg({ quality })
      .toBuffer();
    if (compressed.length * (4/3) <= MAX_BASE64_BYTES) return compressed;
  }
  
  // Step 3：兜底 400×400 @ quality:20
  return sharp(buffer)
    .resize(400, 400, { fit: 'inside' })
    .jpeg({ quality: 20 })
    .toBuffer();
}
```

**注意**：`sharp` 是原生模块，需在 build 时 bundle 正确平台版本。Claude Code 用 lazy import `await import('sharp')` 避免启动时崩溃。

### 6.3 多模型协同（进阶）

单个任务可以使用多个模型：

```typescript
// 模式：Gemini 理解视频 → Claude 执行 Computer Use
const videoUnderstandingResult = await runVideoAnalysis(videoPath, gemini25Pro);

// 将 Gemini 的分析结果作为上下文，用 Claude 执行操作
const agent = createVigentAgent({ model: 'balanced' });
await agent.prompt(`
基于以下视频分析，帮我完成任务：
${videoUnderstandingResult}

任务：...
`);
```

### 6.4 为什么保留 Swift Bridge 而非纯 TypeScript

macOS Computer Use 有些能力只能通过 Swift/Objective-C 访问：
- `ScreenCaptureKit`：高效全屏截图（比 CGDisplayCreateImage 更快）
- `AXUIElement`：Accessibility API，获取 UI 树、按钮位置、文本内容
- `NSWorkspace`：App 管理（列出运行中的 App、前台切换）
- `CGEvent tap`（已删除，不再需要）

Swift bridge 以 stdio 子进程方式与 TypeScript 通信，这个设计可以保留。

---

## 七、依赖清单

### 新增依赖

```json
// packages/video/package.json（新 package）
{
  "name": "@vigent/video",
  "dependencies": {}
  // 依赖 ffmpeg + ffprobe 作为系统级工具（brew install ffmpeg）
  // 不需要 npm 依赖，直接 child_process 调用
}

// packages/agent/package.json
{
  "dependencies": {
    "@mariozechner/pi-agent-core": "^0.x",
    "@mariozechner/pi-ai": "^0.x",
    "@sinclair/typebox": "^0.34",
    "@vigent/core": "workspace:*",
    "@vigent/native-input": "workspace:*",
    "@vigent/native-swift": "workspace:*",
    "@vigent/video": "workspace:*"  // ← 新增
  }
}
```

### 系统依赖

```bash
# 视频/音频处理（必须）
brew install ffmpeg         # 视频帧提取 + 音频转换

# 图像压缩（npm 安装 sharp 时自动下载 native binary）
# sharp: npm install sharp

# STT 语音识别（可选，local 模式）
brew install openai-whisper  # 或 pip install openai-whisper
# 或直接用 OpenAI Whisper API（cloud 模式，不需要安装）

# 本地 LLM（可选，local 模式需要）
brew install ollama
ollama pull gemma4:e4b
```

### 外部 API

| API | 用途 | 获取地址 |
|-----|------|----------|
| Anthropic | Claude Computer Use + VLM | console.anthropic.com |
| Google AI | Gemini 视频理解 + File API | aistudio.google.com |
| MiniMax | 视频生成 / 图像生成 / TTS | platform.minimax.io |
| OpenAI（可选）| Whisper STT（cloud 模式）| platform.openai.com |

### 环境变量

```bash
# 推理模型
ANTHROPIC_API_KEY=sk-ant-...        # Claude（balanced/best/fast 模式）
GOOGLE_API_KEY=AIza...              # Gemini（video 理解模式）
OLLAMA_BASE_URL=http://localhost:11434  # 本地模型（默认值）

# 生成 API
MINIMAX_API_KEY=...                 # 视频生成 / 图像生成 / TTS
MINIMAX_GROUP_ID=...                # MiniMax 账户 Group ID
OPENAI_API_KEY=sk-...               # 可选：Whisper STT cloud 模式

# Agent 行为
VIGENT_MODEL=balanced               # 默认推理模型
VIGENT_PERMISSION=auto              # 权限模式：auto/ask/deny
VIGENT_MAX_STEPS=50                 # 最大操作步数
VIGENT_MAX_TOOL_CONCURRENCY=10      # 并发工具上限
```

---

## 八、验收标准（分阶段）

### Phase 0 完成标准
- [ ] `vigent run "截一张当前屏幕"` 成功执行（gemma4:e4b）
- [ ] 截图工具返回格式正确（Agent 能看到图像内容）

### Phase 1 完成标准
- [ ] `vigent run --model best "打开备忘录"` 使用 Claude claude-opus-4-6
- [ ] `vigent run --model local "..."` 使用 Gemma4 本地

### Phase 2 完成标准
- [ ] 所有 9 个工具 + 新增 4 个工具（get_element_at, get_screen_info, run_applescript, wait_for_change）正常工作
- [ ] `--permission ask` 模式下 dangerous 工具会询问用户
- [ ] `vigent run "打开 Safari 并搜索 Anthropic"` 完整运行成功（claude-sonnet-4-6）

### Phase 3 完成标准
- [ ] `vigent video ./test.mp4 "视频里有什么"` 短视频（< 30s）成功分析
- [ ] `vigent video ./long.mp4 "..."` 长视频通过 Gemini File API 成功分析
- [ ] `vigent generate video "一只猫在睡觉"` 生成视频并保存到本地
- [ ] `vigent generate image "夕阳下的海浪"` 生成图片并返回路径
- [ ] `vigent tts "你好，我是 Vigent" --voice female-shaonv --out hello.mp3` 生成语音文件
- [ ] Agent 可在任务中调用 `generate_video`、`generate_image`、`text_to_speech` 三个工具

### Phase 4 完成标准
- [ ] 超过 80k tokens 时自动裁剪旧截图
- [ ] 操作失败时 Agent 能感知并自动重试
- [ ] `--max-steps 5` 超限后 Agent 优雅停止

### Phase 5 完成标准
- [ ] `vigent serve` 启动 HTTP 服务，`POST /run` 接收任务并 SSE 流式返回
- [ ] `@vigent/sdk` 可以在其他项目中 `import { createVigentAgent }` 使用

---

## 九、文件结构（重构后）

```
vigent/
├── packages/
│   ├── core/                     # 共享类型（重写）
│   │   └── src/types.ts          # VigentContent, VigentContext, ScreenshotResult 等
│   │
│   ├── native-input/             # Rust/enigo（不动）
│   ├── native-swift/             # Swift bridge（保留 + 扩展 Accessibility）
│   │
│   ├── video/                    # 新增：视频摄取管线
│   │   └── src/
│   │       ├── extractor.ts      # ffmpeg 帧提取
│   │       ├── gemini-file-api.ts # File API 上传
│   │       └── index.ts
│   │
│   └── agent/                    # 主 Agent 包（重写）
│       └── src/
│           ├── index.ts           # CLI 入口
│           ├── config.ts          # 配置
│           ├── models.ts          # 模型配置
│           ├── permissions.ts     # 权限系统
│           ├── context-manager.ts # 上下文压缩
│           ├── prompts.ts         # System prompts
│           ├── tools/
│           │   ├── vision.ts      # screenshot, get_element_at, get_screen_info
│           │   ├── input.ts       # click, type_text, press_key/keys, scroll, drag
│           │   ├── system.ts      # open_app, focus_app, run_applescript, clipboard
│           │   ├── timing.ts      # wait, wait_for_change
│           │   ├── video.ts       # analyze_video
│           │   └── index.ts
│           ├── modes/
│           │   ├── run.ts         # vigent run (Computer Use)
│           │   ├── video.ts       # vigent video (视频问答)
│           │   └── serve.ts       # vigent serve (HTTP)
│           └── ui/
│               └── terminal.ts   # TUI 输出
│
├── pnpm-workspace.yaml
├── package.json
└── PLAN.md
```

---

## 十、来自 Claude Code 源码的关键工程洞察

> 调研 `/Users/futingfei/workspace/claude-code/` 源码后补充。以下是对 Vigent 架构有直接影响的发现。

### 9.1 Computer Use：直接工具 vs MCP Server 架构

**重要发现**：Claude Code 主代码库（CLI/代码编辑器版本）**没有**内置截图/鼠标/键盘工具——Computer Use 是独立产品线，以 MCP Server（`@ant/computer-use-mcp`）形式提供，通过 `WEB_BROWSER_TOOL` 等 feature flag 控制。Vigent 的 Computer Use 工具是正确的独立实现，不需要参照 Claude Code 的 CU 代码。

Claude Code 将 Computer Use 包装成 **MCP Server**（`@ant/computer-use-mcp`），由 TypeScript 客户端通过 JSON-RPC 调用，服务端内部用 Rust（enigo）和 Swift（ScreenCaptureKit）。

Vigent 当前是**直接工具**方式（Native 模块直接在进程内调用）。两种方式对比：

| | Claude Code（MCP Server）| Vigent（直接工具）|
|--|--|--|
| 进程隔离 | 是（独立子进程）| 否（同进程）|
| 崩溃影响 | 子进程崩溃不影响主进程 | Native 崩溃导致全程崩溃 |
| 延迟 | 有 IPC 开销（~1-5ms）| 最低 |
| 调试 | 可独立启动、测试 | 需配合整个 Agent |
| 复用性 | 任何 MCP 客户端可用 | 只在 Vigent 内 |

**建议**：Vigent 目前规模小，保持直接工具方式。如果将来要开放给第三方（其他 MCP host），可迁移到 MCP Server 架构。

### 9.2 图像尺寸计算与 API 限制常量

来自 `constants/apiLimits.ts`：

```typescript
// packages/agent/src/constants.ts
export const API_IMAGE_MAX_BASE64_BYTES = 5 * 1024 * 1024;  // 5MB base64 硬限制
export const IMAGE_MAX_DIMENSION = 2000;                     // 单边最大 2000px
export const IMAGE_TARGET_RAW_BYTES = 3.75 * 1024 * 1024;   // 3.75MB 原始大小目标
export const API_MAX_MEDIA_PER_REQUEST = 100;                // 单次请求最多 100 张图

// 坐标缩放（截图分辨率 → 实际操作坐标）
// Claude Code executor.ts 的 targetImageSize() 逻辑：
export function scaleCoordinates(
  x: number, y: number,
  screenWidth: number, screenHeight: number,
  imageWidth: number, imageHeight: number
): { x: number; y: number } {
  return {
    x: Math.round(x * screenWidth / imageWidth),
    y: Math.round(y * screenHeight / imageHeight),
  };
}
```

**重要**：Agent 截图时如果缩放了尺寸（如 1920px → 1280px），LLM 返回的坐标需要按比例放大回实际屏幕坐标，否则点击偏移。Vigent 的 `click` 工具需实现此缩放。

### 9.3 截图质量的统一

Claude Code 和 Vigent 都用 **JPEG quality = 0.75**，这是个经过实践验证的平衡点：
- 文本、UI 元素清晰可读（LLM 能识别按钮标签）
- 文件体积可控（一般 100-400KB）
- 不做无意义的"提高质量"调整

### 9.4 工具并发上限

来自 Claude Code `toolOrchestration.ts`：

```typescript
const MAX_CONCURRENT_TOOLS = parseInt(process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY ?? '10');
```

Vigent 中对应：`VIGENT_MAX_TOOL_CONCURRENCY`，默认 10，只对 `isConcurrencySafe: true` 的工具生效。

---

## 十一、开发顺序建议

建议从 Phase 0 → 1 → 2 线性推进，每个 Phase 都有明确的可验证里程碑。Phase 3 和 Phase 4 可以并行推进（视频摄取和上下文管理相互独立）。Phase 5 放最后。

整体工作量估算：**10-15 个工作日**，每天 2-4 小时实际编码时间。

最高优先级：**Phase 0 的 Bug 修复**，因为即使不做任何新功能，修完这些 Bug 后现有的 natural mode 就能正确运行，能立即验证整体方向。
