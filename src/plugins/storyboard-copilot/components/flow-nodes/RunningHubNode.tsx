import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Workflow, Wallet, Search, Play, Loader2, AlertCircle, Video, Volume2, RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getImageUrl, getAudioUrl } from '@/utils/asset'
import { useToast } from '@/hooks/useToast'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { vendorConfigService } from '@/services/vendor'
import { canvasEvents } from '../../utils/canvasEvents'

import type { RunningHubNodeData } from '../../types'
import type { VendorConfig } from '@/services/vendor/types'
import {
  getNodeContainerClass,
  getSourceHandleClass,
  getTargetHandleClass,
  NODE_MIN_WIDTH,
  NODE_MIN_HEIGHT,
} from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface RunningHubNodeProps extends NodeProps {
  data: RunningHubNodeData
}

const RH_BASE_URL = 'https://www.runninghub.cn'

function inferValueType(fieldType: string): 'text' | 'number' | 'image' | 'video' | 'audio' {
  const t = fieldType?.toUpperCase()
  if (t === 'IMAGE') return 'image'
  if (t === 'VIDEO') return 'video'
  if (t === 'AUDIO') return 'audio'
  if (t === 'NUMBER' || t === 'FLOAT' || t === 'INTEGER') return 'number'
  return 'text'
}

function extractFieldOptions(field: Record<string, unknown>): string[] {
  for (const key of ['options', 'selectOptions', 'enumValues', 'listValues', 'values']) {
    const val = field[key]
    if (Array.isArray(val)) return val.map(String)
  }
  const dict: Record<string, string[]> = {
    sampler_name: ['euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpm_fast', 'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde', 'dpmpp_2m', 'dpmpp_2m_sde', 'ddim', 'uni_pc'],
    scheduler: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform'],
    ckpt_name: [],
  }
  const fieldName = String(field.fieldName || field.name || '')
  if (dict[fieldName]?.length) return dict[fieldName]
  return []
}

export const RunningHubNode = memo(({ id, data, selected }: RunningHubNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const { upstreamImage, upstreamVideo, upstreamAudio } = useUpstreamData(id)
  const enlargedHandles = useEnlargedHandles(id)

  const isWallet = data.useWallet
  const nodeTitle = isWallet ? 'RH钱包应用' : 'RunningHub'
  const accentColor = isWallet ? 'text-violet-500' : 'text-cyan-500'

  const [localWebappId, setLocalWebappId] = useState(data.webappId || '')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [rhVendor, setRhVendor] = useState<VendorConfig | null>(null)

  useEffect(() => {
    vendorConfigService.initialize().then(() => {
      vendorConfigService.getVendor('runninghub').then(v => {
        if (v) setRhVendor(v)
      })
    })
  }, [])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  const getApiKey = useCallback((): string => {
    if (!rhVendor) return ''
    const inputValues = rhVendor.inputValues || {}
    if (isWallet) return inputValues.walletApiKey || ''
    return inputValues.apiKey || ''
  }, [isWallet, rhVendor])

  const getBaseUrl = useCallback((): string => {
    return rhVendor?.inputValues?.baseUrl || RH_BASE_URL
  }, [rhVendor])

  const rhRequest = useCallback(async (path: string, body: Record<string, unknown>, method = 'POST') => {
    const apiKey = getApiKey()
    const baseUrl = getBaseUrl()
    const url = baseUrl + path
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body)
    }
    const response = await fetch(url, options)
    const result = await response.json()
    if (result.code !== undefined && result.code !== 0 && result.code !== 200) {
      throw new Error(result.msg || result.message || JSON.stringify(result))
    }
    return result
  }, [getApiKey, getBaseUrl])

  const handleFetchAppInfo = useCallback(async () => {
    const webappId = localWebappId.trim()
    if (!webappId) {
      toast({ title: '请输入 webappId', variant: 'destructive' })
      return
    }
    try {
      updateNodeData(id, { ...data, webappId, status: 'submitting' as const })
      const apiKey = getApiKey()
      const baseUrl = getBaseUrl()
      const url = `${baseUrl}/api/webapp/apiCallDemo?apiKey=${encodeURIComponent(apiKey)}&webappId=${encodeURIComponent(webappId)}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await response.json()
      if (result.code !== undefined && result.code !== 0 && result.code !== 200) {
        throw new Error(result.msg || result.message || JSON.stringify(result))
      }
      const appInfo = result.data || result
      const nodeInfoList = appInfo?.nodeInfoList || []
      const paramValues: Record<string, { value: string; sourceFromUpstream?: boolean }> = {}
      for (const node of nodeInfoList) {
        const fields = node.fields || node.fieldInfoList || []
        for (const field of fields) {
          const fieldName = field.fieldName || field.name
          if (!fieldName) continue
          const vtype = inferValueType(field.fieldType || field.type || '')
          if (vtype === 'image' || vtype === 'video' || vtype === 'audio') {
            paramValues[`${node.nodeId}.${fieldName}`] = { value: '', sourceFromUpstream: true }
          } else {
            paramValues[`${node.nodeId}.${fieldName}`] = { value: String(field.fieldValue ?? field.defaultValue ?? '') }
          }
        }
      }
      updateNodeData(id, { ...data, webappId, appInfo, paramValues, status: 'idle' as const })
      toast({ title: '获取应用信息成功' })
    } catch (error) {
      updateNodeData(id, { ...data, webappId, status: 'error' as const, errorMessage: String(error) })
      toast({ title: '获取应用信息失败', description: String(error), variant: 'destructive' })
    }
  }, [localWebappId, data, id, rhRequest, toast, updateNodeData])

  const handleUploadAsset = useCallback(async (url: string): Promise<string> => {
    const apiKey = getApiKey()
    const baseUrl = getBaseUrl()
    try {
      const assetUrl = url.startsWith('asset://') || url.startsWith('http') ? url : getImageUrl(url) || url
      const response = await fetch(assetUrl)
      const blob = await response.blob()
      const formData = new FormData()
      formData.append('file', blob, 'upload.png')
      const uploadUrl = baseUrl + '/task/openapi/upload'
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      })
      const uploadData = await uploadRes.json()
      if (uploadData.code !== undefined && uploadData.code !== 0 && uploadData.code !== 200) {
        throw new Error(uploadData.msg || '上传失败')
      }
      return uploadData.data?.fileName || uploadData.fileName || ''
    } catch {
      return url
    }
  }, [getApiKey, getBaseUrl])

  const handleSubmit = useCallback(async () => {
    if (!data.webappId) {
      toast({ title: '请先输入 webappId 并获取应用信息', variant: 'destructive' })
      return
    }
    const apiKey = getApiKey()
    if (!apiKey) {
      toast({ title: `请先在供应商设置中配置${isWallet ? '钱包' : ''}API密钥`, variant: 'destructive' })
      return
    }

    try {
      updateNodeData(id, { ...data, status: 'submitting' as const, errorMessage: undefined })

      const nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: string }> = []
      const appInfo = data.appInfo as { nodeInfoList?: Array<Record<string, unknown>> } | undefined
      const nodeList = appInfo?.nodeInfoList || []

      for (const node of nodeList) {
        const nodeId = String(node.nodeId || '')
        const fields = (node.fields || node.fieldInfoList || []) as Array<Record<string, unknown>>
        for (const field of fields) {
          const fieldName = String(field.fieldName || field.name || '')
          if (!fieldName) continue
          const key = `${nodeId}.${fieldName}`
          const param = data.paramValues?.[key]
          if (!param) continue

          let fieldValue = param.value

          const vtype = inferValueType(String(field.fieldType || field.type || ''))
          if ((vtype === 'image' || vtype === 'video' || vtype === 'audio') && param.sourceFromUpstream) {
            let upstreamUrl = ''
            if (vtype === 'image') upstreamUrl = upstreamImage || param.value
            else if (vtype === 'video') upstreamUrl = upstreamVideo || param.value
            else if (vtype === 'audio') upstreamUrl = upstreamAudio || param.value
            if (upstreamUrl) {
              fieldValue = await handleUploadAsset(upstreamUrl)
            }
          } else if ((vtype === 'image' || vtype === 'video' || vtype === 'audio') && fieldValue) {
            fieldValue = await handleUploadAsset(fieldValue)
          }

          if (vtype === 'number' && fieldValue) {
            const num = Number(fieldValue)
            if (!isNaN(num)) fieldValue = String(num)
          }

          nodeInfoList.push({ nodeId, fieldName, fieldValue })
        }
      }

      const result = await rhRequest('/task/openapi/ai-app/run', {
        webappId: data.webappId,
        nodeInfoList,
      })

      const taskId = result.data?.taskId
      if (!taskId) {
        throw new Error('提交任务失败: ' + JSON.stringify(result))
      }

      updateNodeData(id, { ...data, status: 'polling' as const, taskId })

      let pollCount = 0
      const maxPolls = 480
      pollTimerRef.current = setInterval(async () => {
        pollCount++
        if (pollCount > maxPolls) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          updateNodeData(id, { ...data, status: 'error' as const, errorMessage: '任务超时' })
          return
        }
        try {
          const queryResult = await rhRequest('/task/openapi/outputs', { taskId })
          const outputs = queryResult.data?.outputs || queryResult.data?.results || []
          const status = queryResult.data?.status || ''

          if (status === 'SUCCESS' || (Array.isArray(outputs) && outputs.length > 0)) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)

            let imageUrl: string | null = null
            let videoUrl: string | null = null
            let audioUrl: string | null = null

            for (const output of outputs) {
              const url = output.url || output.outputUrl || output.videoUrl || output.imageUrl || output.audioUrl || ''
              if (!url) continue
              const lower = url.toLowerCase()
              if (lower.match(/\.(mp4|webm|mov|avi)(\?|$)/) || output.type === 'video') {
                videoUrl = url
              } else if (lower.match(/\.(wav|mp3|ogg|flac|m4a)(\?|$)/) || output.type === 'audio') {
                audioUrl = url
              } else {
                imageUrl = url
              }
            }

            updateNodeData(id, {
              ...data,
              status: 'success' as const,
              imageUrl,
              videoUrl,
              audioUrl,
            })

            if (videoUrl) {
              canvasEvents.emit({ type: 'addResultNode', videoUrl, sourceNodeId: id, sourceHandleId: 'output' })
            } else if (audioUrl) {
              canvasEvents.emit({ type: 'addResultNode', audioUrl, sourceNodeId: id, sourceHandleId: 'output' })
            } else if (imageUrl) {
              canvasEvents.emit({ type: 'addResultNode', imageUrl, sourceNodeId: id, sourceHandleId: 'output' })
            }

            toast({ title: '任务完成' })
          } else if (status === 'FAILED') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            updateNodeData(id, { ...data, status: 'error' as const, errorMessage: queryResult.data?.failReason || '任务失败' })
            toast({ title: '任务失败', variant: 'destructive' })
          }
        } catch (err) {
          if (pollCount >= 3) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            updateNodeData(id, { ...data, status: 'error' as const, errorMessage: String(err) })
          }
        }
      }, 5000)
    } catch (error) {
      updateNodeData(id, { ...data, status: 'error' as const, errorMessage: String(error) })
      toast({ title: '提交任务失败', description: String(error), variant: 'destructive' })
    }
  }, [data, id, isWallet, getApiKey, rhRequest, handleUploadAsset, upstreamImage, upstreamVideo, upstreamAudio, toast, updateNodeData])

  const handleReset = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    updateNodeData(id, {
      ...data,
      status: 'idle',
      taskId: undefined,
      errorMessage: undefined,
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
    })
  }, [data, id, updateNodeData])

  const appInfo = data.appInfo as { nodeInfoList?: Array<Record<string, unknown>> } | undefined
  const nodeList = appInfo?.nodeInfoList || []

  const statusLabel: Record<string, string> = {
    idle: '就绪',
    submitting: '提交中',
    polling: '执行中',
    success: '完成',
    error: '错误',
  }

  const statusColor: Record<string, string> = {
    idle: 'text-muted-foreground',
    submitting: 'text-yellow-500',
    polling: 'text-blue-500',
    success: 'text-green-500',
    error: 'text-red-500',
  }

  return (
    <div
      className={getNodeContainerClass(selected)}
      style={{ width: 380, minHeight: 300 }}
    >
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium border-b bg-muted/30 node-header">
        <div className="flex items-center gap-1.5">
          {isWallet ? (
            <Wallet className={cn("h-3.5 w-3.5", accentColor)} />
          ) : (
            <Workflow className={cn("h-3.5 w-3.5", accentColor)} />
          )}
          <span>{nodeTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn("text-[10px]", statusColor[data.status])}>
            {statusLabel[data.status]}
          </span>
          {data.status !== 'idle' && (
            <button
              onClick={handleReset}
              onPointerDown={e => e.stopPropagation()}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="重置"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 420 }}>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Webapp ID</label>
          <div className="flex gap-1">
            <input
              value={localWebappId}
              onChange={e => setLocalWebappId(e.target.value)}
              onPointerDown={e => e.stopPropagation()}
              placeholder="输入应用 ID"
              className="flex-1 h-6 text-xs px-2 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleFetchAppInfo}
              onPointerDown={e => e.stopPropagation()}
              disabled={data.status === 'submitting'}
              className="h-6 px-2 rounded text-[10px] bg-muted hover:bg-muted/80 flex items-center gap-1"
            >
              <Search className="h-3 w-3" />
              获取
            </button>
          </div>
        </div>

        {nodeList.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            <label className="text-[10px] text-muted-foreground font-medium">工作流参数</label>
            {nodeList.map((node) => {
              const nodeId = String(node.nodeId || '')
              const fields = (node.fields || node.fieldInfoList || []) as Array<Record<string, unknown>>
              return (
                <div key={nodeId} className="space-y-1">
                  <div className="text-[9px] text-muted-foreground/70 font-medium">
                    节点: {String(node.title || node.nodeName || nodeId)}
                  </div>
                  {fields.map((field) => {
                    const fieldName = String(field.fieldName || field.name || '')
                    if (!fieldName) return null
                    const key = `${nodeId}.${fieldName}`
                    const param = data.paramValues?.[key]
                    if (!param) return null
                    const vtype = inferValueType(String(field.fieldType || field.type || ''))
                    const options = extractFieldOptions(field)

                    return (
                      <div key={key} className="pl-2 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] text-muted-foreground flex-1 truncate">
                            {String(field.title || field.label || fieldName)}
                            <span className="ml-1 text-muted-foreground/50">({vtype})</span>
                          </label>
                          {(vtype === 'image' || vtype === 'video' || vtype === 'audio') && (
                            <label className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={!!param.sourceFromUpstream}
                                onChange={e => {
                                  const newParams = { ...data.paramValues, [key]: { ...param, sourceFromUpstream: e.target.checked } }
                                  updateNodeData(id, { ...data, paramValues: newParams })
                                }}
                                onPointerDown={e => e.stopPropagation()}
                                className="h-2.5 w-2.5"
                              />
                              上游
                            </label>
                          )}
                        </div>
                        {options.length > 0 ? (
                          <select
                            value={param.value}
                            onChange={e => {
                              const newParams = { ...data.paramValues, [key]: { ...param, value: e.target.value } }
                              updateNodeData(id, { ...data, paramValues: newParams })
                            }}
                            onPointerDown={e => e.stopPropagation()}
                            className="w-full h-5 text-[10px] px-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">--</option>
                            {options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={param.value}
                            onChange={e => {
                              const newParams = { ...data.paramValues, [key]: { ...param, value: e.target.value } }
                              updateNodeData(id, { ...data, paramValues: newParams })
                            }}
                            onPointerDown={e => e.stopPropagation()}
                            placeholder={vtype === 'image' ? '图片URL' : vtype === 'video' ? '视频URL' : vtype === 'audio' ? '音频URL' : ''}
                            className="w-full h-5 text-[10px] px-1.5 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {data.errorMessage && (
          <div className="flex items-start gap-1.5 p-1.5 rounded bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="text-[9px] break-all">{data.errorMessage}</span>
          </div>
        )}

        {(data.imageUrl || data.videoUrl || data.audioUrl) && (
          <div className="space-y-1 border-t pt-2">
            <label className="text-[10px] text-muted-foreground font-medium">输出结果</label>
            {data.imageUrl && (
              <div className="rounded overflow-hidden bg-muted/50 h-24">
                <img src={getImageUrl(data.imageUrl) || ''} alt="输出" className="w-full h-full object-contain" />
              </div>
            )}
            {data.videoUrl && (
              <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/50">
                <Video className="h-3 w-3 text-blue-500" />
                <span className="text-[9px] text-muted-foreground truncate">{data.videoUrl}</span>
              </div>
            )}
            {data.audioUrl && (
              <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/50">
                <Volume2 className="h-3 w-3 text-green-500" />
                <audio src={getAudioUrl(data.audioUrl) || ''} controls className="h-6 w-full" />
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          onPointerDown={e => e.stopPropagation()}
          disabled={data.status === 'submitting' || data.status === 'polling' || !data.webappId}
          className={cn(
            "w-full h-7 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
            (data.status === 'submitting' || data.status === 'polling')
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {data.status === 'submitting' || data.status === 'polling' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {data.status === 'submitting' ? '提交中...' : '执行中...'}
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              执行工作流
            </>
          )}
        </button>
      </div>

      <Handle
        type="target"
        id="input"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
        style={{ top: '50%' }}
      />

      <Handle
        type="source"
        id="output"
        position={Position.Right}
        className={getSourceHandleClass(undefined, enlargedHandles.source)}
        style={{ top: '50%' }}
      />

      <NodeResizeHandle
        minWidth={NODE_MIN_WIDTH}
        minHeight={NODE_MIN_HEIGHT}
        maxWidth={600}
        maxHeight={800}
      />
    </div>
  )
})

RunningHubNode.displayName = 'RunningHubNode'
