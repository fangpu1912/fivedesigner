# FiveDesigner

<p align="center">
  <img src="https://raw.githubusercontent.com/yourusername/fivedesigner/main/assets/logo.png" alt="FiveDesigner Logo" width="120">
</p>

<p align="center">
  <strong>AI驱动的影视内容生产工作台</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#技术架构">技术架构</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#贡献指南">贡献指南</a>
</p>

---

## 简介

FiveDesigner 是一个面向影视创作者的一站式 AI 内容生产工具，基于 React + Tauri 构建的桌面应用。它打通了从剧本创作到成片输出的完整 workflow：

- 📝 **剧本创作** — AI 辅助的小说/剧本生成与结构化分析
- 🎭 **资产管理** — 角色、场景、道具的统一管理与提示词生成
- 🎬 **分镜设计** — 可视化分镜编排，支持 AI 生图/生视频
- 🔊 **配音合成** — 多音色 TTS 配音与情绪控制
- 🎥 **样片审阅** — 视频预览、标注与迭代

## 功能特性

| 模块 | 功能描述 |
|------|---------|
| **项目管理** | 多项目、多剧集管理，支持剧集间资产复用 |
| **灵感创作** | 输入主题自动生成完整角色、场景、分镜方案 |
| **对标分析** | 上传参考视频，AI 反向工程提取可复用要素 |
| **分镜流水线** | 剧本 → 分镜 → 图片 → 视频的自动化生产 |
| **AI 供应商** | 支持多家 AI 服务（图像/视频/语音生成）|
| **工作流编排** | 可视化节点编辑器，自定义生成 pipeline |

## 快速开始

### 环境要求

- Node.js 18+
- Rust 1.70+ (Tauri 需要)
- Windows 10+/macOS 11+/Linux

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 前端开发
npm run dev

# 桌面端开发（需要 Rust 环境）
npm run tauri:dev
```

### 构建应用

```bash
# 构建桌面应用
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 技术架构

```
┌─────────────────────────────────────────┐
│              UI Layer                   │
│     React 18 + TypeScript + Vite       │
├─────────────────────────────────────────┤
│           State Management              │
│  Zustand (UI State) + React Query      │
│         (Server State)                  │
├─────────────────────────────────────────┤
│         Persistence Layer               │
│    Tauri SQLite + Secure Store         │
├─────────────────────────────────────────┤
│           Backend Layer                 │
│         Tauri / Rust                    │
└─────────────────────────────────────────┘
```

### 核心依赖

- **前端框架**: React 18, TypeScript 5, Vite 5
- **桌面框架**: Tauri 2.0
- **UI 组件**: Radix UI, Tailwind CSS, shadcn/ui
- **状态管理**: Zustand, TanStack Query
- **AI 集成**: 多供应商统一接口（图像/视频/语音/文本生成）

## 项目结构

```
src/
├── components/          # 业务组件与基础 UI
│   ├── ai/             # AI 相关组件（生成面板、参数配置）
│   ├── analysis/       # 分析工具（灵感创作、对标分析）
│   ├── asset/          # 资产管理（角色、场景、道具）
│   ├── storyboard/     # 分镜相关组件
│   └── ui/             # 基础 UI 组件（shadcn）
├── pages/              # 页面级功能模块
├── hooks/              # React Query hooks + 业务逻辑
├── services/           # 服务层（AI、存储、工作区）
│   ├── vendor/         # AI 供应商集成
│   └── agent/          # Agent 编排与工具
├── db/                 # SQLite 数据库操作
├── store/              # Zustand 状态管理
└── types/              # TypeScript 类型定义
```

## 开发指南

### 代码规范

```bash
# 运行类型检查
npm run typecheck

# 运行 ESLint
npm run lint

# 运行测试
npm run test:run
```

### 添加 AI 供应商

在 `src/services/vendor/codes/` 目录下创建新的供应商实现，参考现有供应商的接口规范。

### 数据库迁移

项目使用 SQLite 存储，数据库 schema 定义在 `src/db/schema.ts`。首次启动会自动初始化。

## 贡献指南

欢迎提交 Issue 和 PR！请遵循以下流程：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 提交规范

- 使用英文描述 commit 信息
- 格式：`<type>(<scope>): <subject>`
- 类型：feat/fix/docs/style/refactor/test/chore

## 安全说明

- API Keys 通过 Tauri Secure Store 加密存储，不会明文保存在代码或配置文件中
- 用户项目数据存储在本地 SQLite 数据库，不会上传云端
- 建议定期备份 `src-tauri/` 目录下的数据文件

## 许可证

[MIT](LICENSE) © FiveDesigner Contributors

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [shadcn/ui](https://ui.shadcn.com/) - 高质量的 React 组件库
- [Radix UI](https://www.radix-ui.com/) - 无障碍 UI 原语
