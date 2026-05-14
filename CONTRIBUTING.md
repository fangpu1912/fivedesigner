# 贡献指南

感谢你对 FiveDesigner 的兴趣！我们欢迎各种形式的贡献。

## 如何贡献

### 报告 Bug

1. 使用 GitHub Issues 提交
2. 使用 Bug 报告模板
3. 提供复现步骤、期望行为和实际行为
4. 附上截图或录屏（如有）

### 提交功能请求

1. 先搜索是否已有类似请求
2. 描述功能的用例和价值
3. 如果可能，提供实现思路

### 提交代码

1. **Fork** 本仓库
2. **创建分支**: `git checkout -b feature/your-feature-name`
3. **提交更改**: `git commit -m 'feat: add some feature'`
4. **推送分支**: `git push origin feature/your-feature-name`
5. **创建 Pull Request**

## 开发规范

### 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型 (type)**:
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式（不影响代码运行的变动）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建过程或辅助工具的变动

**示例**:
```
feat(storyboard): add batch export function

Support exporting multiple storyboards as ZIP with images and metadata.

Closes #123
```

### 代码风格

- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 组件使用函数式组件 + Hooks
- 状态管理优先使用 React Query（服务端状态）和 Zustand（UI 状态）

### 测试

- 新功能请添加单元测试
- 运行 `npm run test:run` 确保通过

## 项目结构

```
src/
├── components/    # 组件
├── pages/         # 页面
├── hooks/         # React Hooks
├── services/      # 服务层
├── db/            # 数据库操作
├── store/         # 状态管理
└── types/         # 类型定义
```

## 需要帮助？

- 查看 [README.md](README.md)
- 在 Discussions 中提问
- 加入社区交流

## 行为准则

- 尊重他人
- 接受建设性批评
- 关注对社区最有利的事情
