import { useState, useEffect } from 'react'
import { vendorConfigService } from '@/services/vendor'

export interface ImageModelOption {
  id: string
  name: string
  modelName: string
  vendorId: string
  vendorName: string
}

export function useImageModels() {
  const [models, setModels] = useState<ImageModelOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadModels = async () => {
      try {
        const vendors = await vendorConfigService.getAllVendors()
        const imageModels: ImageModelOption[] = []

        for (const vendor of vendors) {
          if (!vendor.enable) continue

          for (const model of vendor.models) {
            if (model.type === 'image') {
              imageModels.push({
                id: `${vendor.id}:${model.modelName}`,
                name: model.name,
                modelName: model.modelName,
                vendorId: vendor.id,
                vendorName: vendor.name,
              })
            }
          }
        }

        setModels(imageModels)
      } catch (error) {
        console.error('加载图片模型失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadModels()
  }, [])

  return { models, isLoading }
}
