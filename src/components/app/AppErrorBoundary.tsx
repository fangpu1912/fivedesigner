import { Component, type ErrorInfo, type ReactNode } from 'react'

import { AlertTriangle, RefreshCw, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || '应用发生了未知错误。',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render error:', error, errorInfo)
  }

  private handleReload = () => {
    // 清除错误状态，尝试恢复而不是刷新页面
    this.setState({ hasError: false, errorMessage: '' })
  }

  private handleGoToSettings = () => {
    window.location.href = '#/settings'
    // 延迟刷新，让用户看到错误信息
    setTimeout(() => {
      window.location.reload()
    }, 100)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <Card className="w-full max-w-2xl border-destructive/20 shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">应用遇到了阻塞性错误</CardTitle>
              <CardDescription className="text-sm leading-6">
                我们已经拦截了这次崩溃，避免整个界面白屏。你可以先刷新应用继续工作，再去设置页检查工作区和
                AI 配置是否完整。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              {this.state.errorMessage}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={this.handleReload}>
                <RefreshCw className="mr-2 h-4 w-4" />
                尝试恢复
              </Button>
              <Button variant="outline" onClick={this.handleGoToSettings}>
                <Settings className="mr-2 h-4 w-4" />
                打开系统设置
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
}
