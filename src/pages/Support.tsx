import { Heart, Coffee, Sparkles, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function Support() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* 标题区域 */}
        <div className="text-center space-y-3">
          <Badge variant="secondary" className="mb-2">
            <Heart className="w-3 h-3 mr-1 text-red-500" />
            支持开发者
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">
            喜欢这个项目？
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            您的支持将帮助项目持续改进，开发更多实用功能
          </p>
        </div>

        {/* 赞赏卡片 */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-2">
              {/* 左侧：说明文字 */}
              <div className="p-8 space-y-6 border-r">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Coffee className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">您的支持将用于</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>持续优化产品功能和用户体验</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>购买服务器和 API 服务保持项目运行</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>开发更多实用的新功能</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">特别感谢</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        每一份支持都让我能走得更远，感谢您的认可与鼓励
                      </p>
                    </div>
                  </div>
                </div>

                <Button variant="outline" className="w-full" asChild>
                  <a
                    href="https://github.com/your-repo/fivedesigner"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    在 GitHub 上支持我们
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </Button>
              </div>

              {/* 右侧：赞赏码 */}
              <div className="p-8 flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5">
                <div className="relative">
                  {/* 装饰光环 */}
                  <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 rounded-full blur-2xl opacity-60" />

                  {/* 二维码卡片 */}
                  <div className="relative bg-white rounded-xl p-6 shadow-lg">
                    <img
                      src="/support-qrcode.png"
                      alt="赞赏码"
                      className="w-64 h-64 object-contain"
                    />
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-sm font-medium">扫码赞赏</p>
                  <p className="text-xs text-muted-foreground mt-1">金额不限，心意无价</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 底部提示 */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            感谢您的每一份支持 ❤️
          </p>
        </div>
      </div>
    </div>
  )
}
