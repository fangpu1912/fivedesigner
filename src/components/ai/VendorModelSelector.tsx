import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, Bot, Image, Video, Music, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { vendorConfigService } from '@/services/vendor'
import type { VendorConfig } from '@/services/vendor'

type ModelType = 'text' | 'image' | 'video' | 'tts'

interface VendorModelSelectorProps {
  type: ModelType
  value?: string
  onChange?: (vendorId: string, modelName: string, fullValue: string) => void
  disabled?: boolean
  className?: string
}

interface ModelOption {
  vendorId: string
  vendorName: string
  modelName: string
  modelLabel: string
  type: ModelType
  fullValue: string
}

export function VendorModelSelector({
  type,
  value,
  onChange,
  disabled,
  className,
}: VendorModelSelectorProps) {
  const [vendors, setVendors] = useState<VendorConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadVendors()
  }, [])

  const loadVendors = async () => {
    try {
      await vendorConfigService.initialize()
      const allVendors = await vendorConfigService.getAllVendors()
      setVendors(allVendors.filter(v => v.enable))
    } catch (error) {
      console.error('加载供应商失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const modelOptions = useMemo(() => {
    const options: ModelOption[] = []

    for (const vendor of vendors) {
      const models = vendor.models.filter(m => m.type === type)
      for (const model of models) {
        options.push({
          vendorId: vendor.id,
          vendorName: vendor.name,
          modelName: model.modelName,
          modelLabel: model.name,
          type,
          fullValue: `${vendor.id}:${model.modelName}`,
        })
      }
    }

    return options
  }, [vendors, type])

  // 按供应商分组
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {}
    for (const opt of modelOptions) {
      if (!groups[opt.vendorName]) {
        groups[opt.vendorName] = []
      }
      groups[opt.vendorName].push(opt)
    }
    return groups
  }, [modelOptions])

  const selectedOption = useMemo(() => {
    return modelOptions.find(opt => opt.fullValue === value)
  }, [modelOptions, value])

  const handleSelect = (option: ModelOption) => {
    onChange?.(option.vendorId, option.modelName, option.fullValue)
  }

  const getTypeIcon = () => {
    switch (type) {
      case 'text':
        return <Bot className="h-4 w-4" />
      case 'image':
        return <Image className="h-4 w-4" />
      case 'video':
        return <Video className="h-4 w-4" />
      case 'tts':
        return <Music className="h-4 w-4" />
    }
  }

  const getTypeLabel = () => {
    switch (type) {
      case 'text':
        return 'AI 模型'
      case 'image':
        return '图片模型'
      case 'video':
        return '视频模型'
      case 'tts':
        return '语音模型'
    }
  }

  if (isLoading) {
    return (
      <Button variant="outline" disabled className={cn('w-full justify-between', className)}>
        <span className="flex items-center gap-2">
          {getTypeIcon()}
          加载中...
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>
    )
  }

  if (modelOptions.length === 0) {
    return (
      <Button variant="outline" disabled className={cn('w-full justify-between', className)}>
        <span className="flex items-center gap-2 text-muted-foreground">
          {getTypeIcon()}
          暂无可用模型
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-between', className)}
        >
          <span className="flex items-center gap-2 truncate">
            {getTypeIcon()}
            {selectedOption ? (
              <span className="flex items-center gap-2">
                <span className="truncate">{selectedOption.modelLabel}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {selectedOption.vendorName}
                </Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">选择{getTypeLabel()}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 max-h-[60vh] overflow-y-auto" align="start">
        <DropdownMenuLabel>{getTypeLabel()}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(groupedOptions).map(([vendorName, options], groupIndex) => (
          <DropdownMenuGroup key={vendorName}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
              {vendorName}
            </DropdownMenuLabel>
            {options.map((option) => (
              <DropdownMenuItem
                key={option.fullValue}
                onClick={() => handleSelect(option)}
                className={cn(
                  'flex items-center justify-between cursor-pointer py-1.5',
                  value === option.fullValue && 'bg-accent'
                )}
              >
                <span className="font-medium text-sm">{option.modelLabel}</span>
                {value === option.fullValue && <Sparkles className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
