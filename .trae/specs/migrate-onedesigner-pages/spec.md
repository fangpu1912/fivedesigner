# FiveDesigner 功能完善 Spec

## Why
基于 OneDesigner 的功能设计，结合 FiveDesigner 已有架构，实现商业化、工程化、模块化的 AI 视频创作工具。

## 设计原则

### 商业化
- 核心功能买断制，高级功能增值包
- 本地优先，数据隐私保护
- 支持多平台 AI 服务，用户自备 API Key

### 工程化
- TypeScript 严格模式
- ESLint + Prettier 代码规范
- 分层架构，职责清晰
- 单元测试 + E2E 测试

### 模块化
- 核心功能模块化
- AI 服务适配器模式
- 插件系统架构
- 工作流可配置

### 规范化
- 统一的错误处理
- 统一的日志系统
- 统一的状态管理
- 统一的 API 接口

## 技术架构

### 分层架构
```
┌─────────────────────────────────────────────────────────────────────┐
│                           UI Layer                                   │
│  React Components (pages/, components/)                              │
│  - 声明式 UI，无业务逻辑                                              │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Application Layer                             │
│                   Custom Hooks (hooks/)                              │
│   - 业务逻辑封装                                                      │
│   - 状态协调                                                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        State Layer                                   │
│           React Query + Zustand (store/)                             │
│   - Server State: React Query (唯一数据源)                           │
│   - UI State: Zustand (轻量级，不持久化)                              │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Service Layer                                 │
│                   Services (services/)                               │
│   - AI 服务适配器                                                    │
│   - 存储服务                                                          │
│   - 工作流服务                                                        │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Platform Layer                                │
│                     Tauri / Rust                                     │
│   - SQLite 数据库                                                    │
│   - HTTP 代理                                                        │
│   - 文件系统                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### AI 服务适配器模式
```typescript
interface AIProvider {
  name: string;
  type: 'image' | 'video' | 'audio' | 'chat';
  
  generate(request: GenerateRequest): Promise<GenerateResult>;
  getModels(): AIModel[];
  validateConfig(): Promise<boolean>;
}

class AIProviderFactory {
  static create(config: AIConfig): AIProvider {
    switch (config.provider) {
      case 'openai': return new OpenAIProvider(config);
      case 'stability': return new StabilityProvider(config);
      case 'runway': return new RunwayProvider(config);
      case 'kling': return new KlingProvider(config);
      case 'jimeng': return new JimengProvider(config);
      case 'veo3': return new Veo3Provider(config);
      case 'comfyui': return new ComfyUIProvider(config);
      default: throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}
```

### 插件系统架构
```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  type: 'ai-provider' | 'workflow' | 'export' | 'tool';
  
  install(context: PluginContext): Promise<void>;
  uninstall(): Promise<void>;
  activate(): void;
  deactivate(): void;
}

interface PluginContext {
  registerAIProvider(provider: AIProvider): void;
  registerWorkflow(workflow: WorkflowTemplate): void;
  registerExportFormat(format: ExportFormat): void;
  showNotification(message: string, type: 'success' | 'error' | 'info'): void;
}
```

## What Changes

### 核心功能模块

#### 1. 项目管理模块 (已有，需完善)
- 项目 CRUD
- 剧集管理
- 项目设置
- 导入导出

#### 2. 脚本创作模块 (新增)
- 富文本编辑器 (TipTap)
- AI 辅助写作
- 大纲生成
- 资产提取

#### 3. 分镜绘制模块 (完善)
- 分镜网格展示
- AI 图片生成 (多平台适配)
- ComfyUI 集成
- 批量处理
- 参考图管理

#### 4. 视频生成模块 (完善)
- 多平台视频生成
- 首帧/尾帧设置
- 批量生成
- 进度跟踪

#### 5. 配音模块 (完善)
- 角色管理
- TTS 语音合成
- 音频编辑
- 批量处理

#### 6. 工作流模块 (新增)
- 可视化工作流编辑
- 预设模板
- 自动化执行
- 任务调度

#### 7. 资产管理模块 (完善)
- 资产库
- 资产引用
- 资产搜索
- 资产导入导出

#### 8. 设置模块 (完善)
- AI 服务配置
- 工作流配置
- 主题设置
- 快捷键设置

## Impact
- Affected specs: 所有模块
- Affected code: services/, hooks/, components/, pages/

## ADDED Requirements

### Requirement: AI 服务统一接口
系统应提供统一的 AI 服务接口，支持多平台适配。

#### Scenario: 图片生成
- **WHEN** 用户选择 AI 模型并输入提示词
- **THEN** 系统通过适配器调用对应平台 API 生成图片

#### Scenario: 视频生成
- **WHEN** 用户配置首帧图片和提示词
- **THEN** 系统通过适配器调用视频生成 API

### Requirement: 工作流自动化
系统应支持可视化工作流编辑和自动化执行。

#### Scenario: 创建工作流
- **WHEN** 用户拖拽节点创建工作流
- **THEN** 系统保存工作流配置

#### Scenario: 执行工作流
- **WHEN** 用户触发工作流执行
- **THEN** 系统按顺序执行各节点任务

### Requirement: 脚本 AI 辅助
系统应提供 AI 辅助脚本创作功能。

#### Scenario: 大纲生成
- **WHEN** 用户输入故事概念
- **THEN** 系统调用 AI 生成分镜大纲

#### Scenario: 资产提取
- **WHEN** 用户提交脚本
- **THEN** 系统自动提取角色、场景、道具

### Requirement: 插件系统
系统应支持插件扩展。

#### Scenario: 安装插件
- **WHEN** 用户安装 AI 服务插件
- **THEN** 系统注册新的 AI 提供商

## MODIFIED Requirements

### Requirement: 数据存储
系统使用 SQLite 数据库存储数据，支持复杂查询和关系。

### Requirement: 状态管理
- Server State: React Query 管理服务端数据
- UI State: Zustand 管理 UI 状态
- 严格分离，单一数据源
