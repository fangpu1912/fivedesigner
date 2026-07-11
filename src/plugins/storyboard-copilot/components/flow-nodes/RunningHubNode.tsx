import { memo, useCallback, useState, useEffect, useRef, useMemo } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Workflow, Wallet, Search, Loader2, AlertCircle, Volume2, RefreshCw, Square, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getImageUrl, getAudioUrl, getVideoUrl } from '@/utils/asset'
import { useToast } from '@/hooks/useToast'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { vendorConfigService } from '@/services/vendor'
import { canvasEvents } from '../../utils/canvasEvents'

import type { RunningHubNodeData, RhParamValue } from '../../types'
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

// ========== fieldType → valueType 映射 ==========
function inferValueType(fieldType: string | undefined): 'text' | 'number' | 'image' | 'video' | 'audio' {
  const t = String(fieldType || '').toUpperCase()
  if (t === 'IMAGE') return 'image'
  if (t === 'VIDEO') return 'video'
  if (t === 'AUDIO') return 'audio'
  if (t === 'NUMBER' || t === 'FLOAT' || t === 'INTEGER' || t === 'INT') return 'number'
  return 'text'
}

// ========== 已知字段选项词典（兜底）==========
const KNOWN_FIELD_OPTIONS: Record<string, Array<string | number>> = {
  aspectRatio: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3', '21:9', '9:21', '1:4', '4:1', '1:8', '8:1'],
  aspect_ratio: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3', '21:9', '9:21'],
  ratio: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3'],
  resolution: ['1k', '2k', '4k', '8k'],
  size: ['512', '768', '1024', '1280', '1536', '2048'],
  mode: ['text2img', 'img2img'],
  quality: ['low', 'medium', 'high', 'best'],
  instanceType: ['default', 'plus', 'pro'],
  instance_type: ['default', 'plus', 'pro'],
  precision: ['fp16', 'fp32', 'bf16'],
  scheduler: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform'],
  sampler: ['euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpmpp_2m', 'dpmpp_sde', 'ddim', 'uni_pc'],
}

// ========== 提取字段选项列表 ==========
function extractFieldOptions(it: Record<string, unknown>): Array<string | number> | null {
  const candidates = [
    it.fieldData, it.options, it.list, it.values, it.enum,
    it.choices, it.items, it.selectOptions, it.dropdown,
  ]
  for (const c of candidates) {
    if (!Array.isArray(c) || c.length === 0) continue
    if (c.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return c as Array<string | number>
    }
    if (c.every((x) => x && typeof x === 'object' && ('value' in x || 'label' in x || 'name' in x))) {
      return c.map((x: Record<string, unknown>) => (x.value ?? x.label ?? x.name) as string | number).filter((v) => v != null)
    }
  }
  const t = String(it.fieldType || '').toUpperCase()
  if ((t === 'LIST' || t === 'SELECT' || t === 'DROPDOWN' || t === 'COMBO' || t === 'ENUM') && Array.isArray(it.fieldValue)) {
    const arr = it.fieldValue
    if (arr.length > 0 && arr.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return arr as Array<string | number>
    }
  }
  const fname = String(it.fieldName || it.name || '').trim()
  if (fname) {
    const direct = KNOWN_FIELD_OPTIONS[fname]
    if (direct) return direct
    const lower = fname.toLowerCase()
    for (const k in KNOWN_FIELD_OPTIONS) {
      if (k.toLowerCase() === lower) return KNOWN_FIELD_OPTIONS[k]!
    }
  }
  return null
}

// 取字段默认值
function extractDefaultValue(it: Record<string, unknown>): string {
  let v = it.fieldValue
  if (Array.isArray(v)) v = v[0]
  if (v == null) return ''
  return typeof v === 'object' ? '' : String(v)
}

const paramKey = (nodeId: string, fieldName: string) => `${nodeId}::${fieldName}`

export const RunningHubNode = memo(({ id, data, selected }: RunningHubNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const { upstreamImage, upstreamVideo, upstreamAudio, upstreamText } = useUpstreamData(id)
  const enlargedHandles = useEnlargedHandles(id)

  const isWallet = data.useWallet
  const nodeTitle = isWallet ? 'RH钱包应用' : 'RunningHub'
  const accentColor = isWallet ? 'text-violet-500' : 'text-cyan-500'
  const accentRing = isWallet ? 'border-violet-400' : 'border-cyan-400'
  const accentBtn = isWallet
    ? 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-200'
    : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200'

  const [localWebappId, setLocalWebappId] = useState(data.webappId || '')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRejectRef = useRef<((error?: Error) => void) | null>(null)
  const activeTaskIdRef = useRef<string>(data.taskId ? String(data.taskId) : '')
  const stopRequestedRef = useRef(false)
  const cancelInFlightRef = useRef(false)
  const [cancelling, setCancelling] = useState(false)
  const [fetchingInfo, setFetchingInfo] = useState(false)
  const [rhVendor, setRhVendor] = useState<VendorConfig | null>(null)
  const autoFetchedRef = useRef(false)

  const update = useCallback((patch: Partial<RunningHubNodeData>) => {
    updateNodeData(id, { ...data, ...patch })
  }, [data, id, updateNodeData])

  useEffect(() => {
    vendorConfigService.initialize().then(() => {
      vendorConfigService.getVendor('runninghub').then(v => {
        if (v) setRhVendor(v)
      })
    })
  }, [])

  const stopPoll = useCallback((reason?: Error) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (reason && pollRejectRef.current) {
      const reject = pollRejectRef.current
      pollRejectRef.current = null
      reject(reason)
    }
  }, [])

  useEffect(() => () => stopPoll(new Error('已取消')), [stopPoll])

  useEffect(() => {
    if (data.taskId) activeTaskIdRef.current = String(data.taskId)
  }, [data.taskId])

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

  // 扁平化 nodeInfoList（兼容 RH 返回的嵌套结构）
  const flatNodeInfoList = useMemo((): Array<Record<string, unknown>> => {
    const appInfo = data.appInfo as { nodeInfoList?: Array<Record<string, unknown>> } | undefined
    const raw = appInfo?.nodeInfoList || []
    const out: Array<Record<string, unknown>> = []
    for (const node of raw) {
      const nodeId = String(node.nodeId || '')
      const fields = (node.fields || node.fieldInfoList || []) as Array<Record<string, unknown>>
      if (fields.length > 0) {
        for (const field of fields) {
          out.push({ ...field, nodeId, fieldName: field.fieldName || field.name })
        }
      } else if (node.fieldName) {
        out.push(node)
      }
    }
    return out
  }, [data.appInfo])

  // 计算每个 media 字段在同 kind 下的索引
  const fieldKindIndex = useMemo(() => {
    const m: Record<string, number> = {}
    const counters: Record<string, number> = { image: 0, video: 0, audio: 0 }
    for (const it of flatNodeInfoList) {
      const vt = inferValueType(it.fieldType as string)
      if (vt === 'image' || vt === 'video' || vt === 'audio') {
        const fieldName = String(it.fieldName || '')
        if (!fieldName) continue
        const idx = counters[vt] ?? 0
        counters[vt] = idx + 1
        m[paramKey(String(it.nodeId), fieldName)] = idx
      }
    }
    return m
  }, [flatNodeInfoList])

  // 按 kind 顺序取上游素材 url
  // FiveDesigner 的 useUpstreamData 只返回单个 url，idx 参数保留以兼容未来扩展
  const findUpstreamUrl = useCallback((kind: 'image' | 'video' | 'audio' | 'text', _idx = 0): string => {
    if (kind === 'text') return upstreamText || ''
    if (kind === 'image') return upstreamImage || ''
    if (kind === 'video') return upstreamVideo || ''
    if (kind === 'audio') return upstreamAudio || ''
    return ''
  }, [upstreamImage, upstreamVideo, upstreamAudio, upstreamText])

  // 实时同步上游 url 到媒体字段（三态逻辑）
  useEffect(() => {
    if (flatNodeInfoList.length === 0) return
    const next = { ...data.paramValues }
    let changed = false
    const counters: Record<string, number> = { image: 0, video: 0, audio: 0 }
    for (const it of flatNodeInfoList) {
      const vt = inferValueType(it.fieldType as string)
      if (vt !== 'image' && vt !== 'video' && vt !== 'audio') continue
      const fieldName = String(it.fieldName || '')
      if (!fieldName) continue
      const k = paramKey(String(it.nodeId), fieldName)
      const cur = next[k]
      const idx = counters[vt] ?? 0
      counters[vt] = idx + 1
      const upUrl = findUpstreamUrl(vt, idx)
      if (!upUrl) continue
      if (cur?.sourceFromUpstream === false) continue
      if (cur?.sourceFromUpstream === true) {
        if (upUrl !== cur.value) {
          next[k] = { ...cur, value: upUrl }
          changed = true
        }
      } else {
        next[k] = { value: upUrl, sourceFromUpstream: true }
        changed = true
      }
    }
    if (changed) update({ paramValues: next })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upstreamImage, upstreamVideo, upstreamAudio, flatNodeInfoList])

  // 同步重算 paramValues（handleRun 用，避免 state 异步陷阱）
  const computeFreshValuesNow = useCallback((): Record<string, RhParamValue> => {
    const next: Record<string, RhParamValue> = { ...data.paramValues }
    const counters: Record<string, number> = { image: 0, video: 0, audio: 0 }
    for (const it of flatNodeInfoList) {
      const vt = inferValueType(it.fieldType as string)
      if (vt !== 'image' && vt !== 'video' && vt !== 'audio') continue
      const fieldName = String(it.fieldName || '')
      if (!fieldName) continue
      const k = paramKey(String(it.nodeId), fieldName)
      const cur = next[k]
      const idx = counters[vt] ?? 0
      counters[vt] = idx + 1
      if (cur?.sourceFromUpstream === false) continue
      const upUrl = findUpstreamUrl(vt, idx)
      if (!upUrl) continue
      next[k] = { value: upUrl, sourceFromUpstream: true }
    }
    return next
  }, [data.paramValues, flatNodeInfoList, findUpstreamUrl])

  const setParam = useCallback((k: string, patch: Partial<RhParamValue>) => {
    const cur = data.paramValues[k] || { value: '' }
    const next = { ...data.paramValues, [k]: { ...cur, ...patch } }
    update({ paramValues: next })
  }, [data.paramValues, update])

  // 上传媒体资产到 RH，转成内部 fileName
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

  // 拉取应用信息
  const handleFetchAppInfo = useCallback(async (): Promise<{
    list: Array<Record<string, unknown>>
    paramValues: Record<string, RhParamValue>
  } | null> => {
    const webappId = localWebappId.trim()
    if (!webappId) {
      toast({ title: '请输入 webappId', variant: 'destructive' })
      return null
    }
    setFetchingInfo(true)
    try {
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
      const rawList = (appInfo?.nodeInfoList || []) as Array<Record<string, unknown>>

      // 扁平化
      const list: Array<Record<string, unknown>> = []
      for (const node of rawList) {
        const nodeId = String(node.nodeId || '')
        const fields = (node.fields || node.fieldInfoList || []) as Array<Record<string, unknown>>
        if (fields.length > 0) {
          for (const field of fields) {
            list.push({ ...field, nodeId, fieldName: field.fieldName || field.name })
          }
        } else if (node.fieldName) {
          list.push(node)
        }
      }

      const next: Record<string, RhParamValue> = { ...data.paramValues }
      const counters: Record<string, number> = { image: 0, video: 0, audio: 0 }
      for (const it of list) {
        const k = paramKey(String(it.nodeId), String(it.fieldName))
        const vt = inferValueType(it.fieldType as string)
        if (k in next) continue
        if (vt === 'image' || vt === 'video' || vt === 'audio') {
          const idx = counters[vt] ?? 0
          counters[vt] = idx + 1
          const upUrl = findUpstreamUrl(vt, idx)
          next[k] = { value: upUrl || '', sourceFromUpstream: true }
        } else {
          next[k] = { value: extractDefaultValue(it) }
        }
      }
      update({ webappId, appInfo, paramValues: next, status: 'idle' })
      toast({ title: '获取应用信息成功' })
      return { list, paramValues: next }
    } catch (error) {
      update({ webappId, status: 'error', errorMessage: String(error) })
      toast({ title: '获取应用信息失败', description: String(error), variant: 'destructive' })
      return null
    } finally {
      setFetchingInfo(false)
    }
  }, [localWebappId, data.paramValues, getApiKey, getBaseUrl, findUpstreamUrl, toast, update])

  // 自动拉取：第一次有上游素材时静默拉一次
  useEffect(() => {
    if (autoFetchedRef.current) return
    if (!localWebappId) return
    if (data.appInfo) return
    if (fetchingInfo) return
    const hasUpstream = upstreamImage || upstreamVideo || upstreamAudio || upstreamText
    if (!hasUpstream) return
    autoFetchedRef.current = true
    void handleFetchAppInfo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localWebappId, upstreamImage, upstreamVideo, upstreamAudio, upstreamText, data.appInfo])

  // 构建原始 nodeInfoList
  const buildRawNodeInfoList = useCallback((
    overrideValues?: Record<string, RhParamValue>,
  ): Array<{ nodeId: string; fieldName: string; fieldValue: string; valueType: string }> => {
    const out: Array<{ nodeId: string; fieldName: string; fieldValue: string; valueType: string }> = []
    const values = overrideValues ?? data.paramValues
    for (const it of flatNodeInfoList) {
      const nodeId = String(it.nodeId || '')
      const fieldName = String(it.fieldName || '')
      if (!nodeId || !fieldName) continue
      const k = paramKey(nodeId, fieldName)
      const vt = inferValueType(it.fieldType as string)
      const v = values[k]?.value
      const finalVal = v != null && v !== '' ? v : extractDefaultValue(it)
      out.push({ nodeId, fieldName, fieldValue: finalVal, valueType: vt })
    }
    return out
  }, [flatNodeInfoList, data.paramValues])

  // 提交前处理：媒体 url 转 fileName
  const resolveNodeInfoList = useCallback(async (raw: Array<{ nodeId: string; fieldName: string; fieldValue: string; valueType: string }>): Promise<Array<{ nodeId: string; fieldName: string; fieldValue: string | number }>> => {
    const out: Array<{ nodeId: string; fieldName: string; fieldValue: string | number }> = []
    for (const it of raw) {
      const { nodeId, fieldName, fieldValue, valueType } = it
      if (!nodeId || !fieldName) continue
      let fv: string | number = fieldValue
      if (valueType === 'image' || valueType === 'video' || valueType === 'audio') {
        let v = String(fieldValue || '').trim()
        // 多行兼容：只取首行
        if (v.includes('\n')) {
          v = v.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || ''
        }
        // 兜底：如果值不是 url 但上游有对应媒体，强制用上游 url
        const isUrlLike = /^https?:\/\//i.test(v) || v.startsWith('/files/') || v.startsWith('/output/') || v.startsWith('/input/')
        if (!isUrlLike) {
          const k = paramKey(nodeId, fieldName)
          const cur = data.paramValues[k]
          if (cur?.sourceFromUpstream !== false) {
            const idx = fieldKindIndex[k] ?? 0
            const upUrl = findUpstreamUrl(valueType as 'image' | 'video' | 'audio', idx)
            if (upUrl) v = upUrl
          }
        }
        if (!v) continue
        if (isUrlLike || /^https?:\/\//i.test(v)) {
          fv = await handleUploadAsset(v)
        } else {
          fv = v
        }
      } else if (valueType === 'number') {
        const num = Number(fieldValue)
        fv = Number.isFinite(num) ? num : fieldValue
      }
      out.push({ nodeId, fieldName, fieldValue: fv })
    }
    return out
  }, [data.paramValues, fieldKindIndex, findUpstreamUrl, handleUploadAsset])

  // Promise 化轮询
  const startPolling = useCallback((taskId: string): Promise<void> => {
    stopPoll(new Error('已取消'))
    return new Promise<void>((resolve, reject) => {
      let elapsed = 0
      let settled = false
      const POLL_INT = 5000
      const MAX = 480
      const finish = (ok: boolean, error?: Error) => {
        if (settled) return
        settled = true
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
        pollRejectRef.current = null
        if (activeTaskIdRef.current === taskId) activeTaskIdRef.current = ''
        if (ok) resolve()
        else reject(error || new Error('RH 轮询失败'))
      }
      pollRejectRef.current = (error?: Error) => finish(false, error || new Error('已取消'))
      pollTimerRef.current = setInterval(async () => {
        elapsed += 1
        if (elapsed > MAX) {
          update({ status: 'error', errorMessage: '轮询超时' })
          finish(false, new Error('轮询超时'))
          return
        }
        try {
          const r = await rhRequest('/task/openapi/outputs', { taskId })
          const rData = r.data || {}
          const outputs = rData.outputs || rData.results || []
          const rStatus = rData.status || ''
          if (rStatus === 'SUCCESS' || (Array.isArray(outputs) && outputs.length > 0 && rStatus !== 'FAILED')) {
            const list: string[] = []
            for (const o of outputs) {
              const u = o.url || o.outputUrl || o.videoUrl || o.imageUrl || o.audioUrl || ''
              if (u) list.push(u)
            }
            const isImg = (u: string) => /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(u)
            const isVid = (u: string) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(u)
            const isAud = (u: string) => /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(u)
            const firstImg = list.find(isImg)
            const firstVid = list.find(isVid)
            const firstAud = list.find(isAud)
            const patch: Partial<RunningHubNodeData> = { status: 'success', urls: list }
            if (firstImg) patch.imageUrl = firstImg
            if (firstVid) patch.videoUrl = firstVid
            if (firstAud) patch.audioUrl = firstAud
            if (!firstImg && !firstVid && !firstAud && list[0]) patch.imageUrl = list[0]
            update(patch)
            if (patch.videoUrl) {
              canvasEvents.emit({ type: 'addResultNode', videoUrl: patch.videoUrl, sourceNodeId: id, sourceHandleId: 'output' })
            } else if (patch.audioUrl) {
              canvasEvents.emit({ type: 'addResultNode', audioUrl: patch.audioUrl, sourceNodeId: id, sourceHandleId: 'output' })
            } else if (patch.imageUrl) {
              canvasEvents.emit({ type: 'addResultNode', imageUrl: patch.imageUrl, sourceNodeId: id, sourceHandleId: 'output' })
            }
            toast({ title: '任务完成' })
            finish(true)
          } else if (rStatus === 'FAILED') {
            let reason: string
            const fr = rData.failReason
            if (fr == null) {
              reason = `RH 失败 code=${r.code}`
            } else if (typeof fr === 'string') {
              reason = fr
            } else {
              try {
                reason = (fr as Record<string, unknown>).exception_message as string || (fr as Record<string, unknown>).message as string || JSON.stringify(fr)
              } catch {
                reason = `RH 失败 code=${r.code}`
              }
            }
            update({ status: 'error', errorMessage: reason })
            toast({ title: '任务失败', description: reason, variant: 'destructive' })
            finish(false, new Error(reason))
          } else {
            update({ status: 'polling', rhCode: r.code })
          }
        } catch (e) {
          if (elapsed >= 3) {
            update({ status: 'error', errorMessage: String(e) })
            finish(false, e instanceof Error ? e : new Error(String(e)))
          }
        }
      }, POLL_INT)
    })
  }, [rhRequest, stopPoll, update, toast, id])

  const handleRun = useCallback(async () => {
    stopRequestedRef.current = false
    if (!data.webappId) {
      // 兜底：还没拉过 appInfo 且上游有素材，先同步拉一次
      if (localWebappId && (upstreamImage || upstreamVideo || upstreamAudio || upstreamText)) {
        const r = await handleFetchAppInfo()
        if (!r) return
      } else {
        toast({ title: '请先输入 webappId 并获取应用信息', variant: 'destructive' })
        return
      }
    }
    const apiKey = getApiKey()
    if (!apiKey) {
      toast({ title: `请先在供应商设置中配置${isWallet ? '钱包' : ''}API密钥`, variant: 'destructive' })
      return
    }

    // 同步重算 paramValues，避免 state 异步陷阱
    const effectiveValues = computeFreshValuesNow()
    if (Object.keys(effectiveValues).length > 0) {
      update({ paramValues: effectiveValues })
    }
    update({ status: 'submitting', errorMessage: undefined, urls: [], taskId: undefined })

    try {
      const rawList = buildRawNodeInfoList(effectiveValues)
      const nodeInfoList = await resolveNodeInfoList(rawList)
      const result = await rhRequest('/task/openapi/ai-app/run', {
        webappId: data.webappId,
        nodeInfoList,
        ...(data.instanceType ? { instanceType: data.instanceType } : {}),
      })
      const taskId = result.data?.taskId
      if (!taskId) {
        throw new Error('提交任务失败: ' + JSON.stringify(result))
      }
      activeTaskIdRef.current = String(taskId)

      if (stopRequestedRef.current) {
        try {
          setCancelling(true)
          await rhRequest('/task/openapi/cancel', { taskId })
          stopPoll(new Error('已取消'))
          stopRequestedRef.current = false
          activeTaskIdRef.current = ''
          update({ status: 'idle', taskId: '', errorMessage: undefined })
          return
        } catch (cancelError) {
          update({ status: 'polling', taskId, errorMessage: `取消失败：${String(cancelError)}` })
        } finally {
          setCancelling(false)
        }
      }

      update({ status: 'polling', taskId })
      await startPolling(taskId)
    } catch (error) {
      if (stopRequestedRef.current || (error instanceof Error && error.message === '已取消')) {
        update({ status: 'idle', taskId: '' })
        return
      }
      update({ status: 'error', errorMessage: String(error) })
      toast({ title: '提交任务失败', description: String(error), variant: 'destructive' })
    }
  }, [data.webappId, data.instanceType, localWebappId, upstreamImage, upstreamVideo, upstreamAudio, upstreamText, isWallet, getApiKey, computeFreshValuesNow, update, buildRawNodeInfoList, resolveNodeInfoList, rhRequest, stopPoll, startPolling, handleFetchAppInfo, toast])

  const handleStop = useCallback(async () => {
    stopRequestedRef.current = true
    const tid = String(activeTaskIdRef.current || data.taskId || '').trim()
    if (!tid) {
      update({ errorMessage: '正在等待 RH taskId，拿到后会立即取消后台任务' })
      return
    }
    if (cancelInFlightRef.current) return
    cancelInFlightRef.current = true
    setCancelling(true)
    update({ errorMessage: '正在请求取消 RH 后台任务...' })
    try {
      await rhRequest('/task/openapi/cancel', { taskId: tid })
      stopPoll(new Error('已取消'))
      stopRequestedRef.current = false
      activeTaskIdRef.current = ''
      update({ status: 'idle', taskId: '', errorMessage: undefined })
      toast({ title: '已取消任务' })
    } catch (error) {
      update({
        status: data.status === 'submitting' ? 'submitting' : 'polling',
        errorMessage: `取消失败：${String(error)}`,
      })
      toast({ title: '取消失败', description: String(error), variant: 'destructive' })
    } finally {
      cancelInFlightRef.current = false
      setCancelling(false)
    }
  }, [data.taskId, data.status, rhRequest, stopPoll, update, toast])

  const handleReset = useCallback(() => {
    stopPoll(new Error('已取消'))
    update({
      status: 'idle',
      taskId: undefined,
      errorMessage: undefined,
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
      urls: [],
    })
  }, [stopPoll, update])

  const isBusy = data.status === 'submitting' || data.status === 'polling' || cancelling

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
      className={cn(getNodeContainerClass(selected), selected && accentRing)}
      style={{ width: 380, minHeight: 300 }}
    >
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium border-b bg-muted/30 node-header">
        <div className="flex items-center gap-1.5">
          {isWallet ? (
            <Wallet className={cn('h-3.5 w-3.5', accentColor)} />
          ) : (
            <Workflow className={cn('h-3.5 w-3.5', accentColor)} />
          )}
          <span>{nodeTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('text-[10px]', statusColor[data.status])}>
            {cancelling ? '取消中...' : statusLabel[data.status]}
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
              disabled={fetchingInfo}
              className="h-6 px-2 rounded text-[10px] bg-muted hover:bg-muted/80 flex items-center gap-1"
            >
              {fetchingInfo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              获取
            </button>
          </div>
        </div>

        {/* 参数表单 */}
        {flatNodeInfoList.length > 0 && (
          <div
            className="space-y-2 border-t pt-2 nowheel nodrag"
            onWheelCapture={e => e.stopPropagation()}
          >
            <label className="text-[10px] text-muted-foreground font-medium">
              工作流参数 ({flatNodeInfoList.length})
            </label>
            <div className="space-y-2 max-h-[260px] overflow-auto overscroll-contain">
              {flatNodeInfoList.map((it, i) => {
                const nodeId = String(it.nodeId || '')
                const fieldName = String(it.fieldName || '')
                if (!fieldName) return null
                const k = paramKey(nodeId, fieldName)
                const param = data.paramValues[k] || { value: extractDefaultValue(it) }
                const vtype = inferValueType(it.fieldType as string)
                const options = extractFieldOptions(it)
                const isMedia = vtype === 'image' || vtype === 'video' || vtype === 'audio'

                return (
                  <div key={i} className="space-y-0.5 pb-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="font-medium truncate flex-1">{fieldName}</span>
                      <span className="text-muted-foreground/50">{vtype}</span>
                      <span className="text-muted-foreground/30">#{nodeId}</span>
                    </div>
                    {isMedia ? (
                      <>
                        <div className="flex items-center gap-1 text-[9px]">
                          <label className="flex items-center gap-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!param.sourceFromUpstream}
                              onChange={e => setParam(k, { sourceFromUpstream: e.target.checked })}
                              onPointerDown={e => e.stopPropagation()}
                              className="h-2.5 w-2.5"
                            />
                            从上游自动获取
                          </label>
                          {param.sourceFromUpstream && (
                            <button
                              onClick={() => {
                                const u = findUpstreamUrl(vtype, fieldKindIndex[k] ?? 0)
                                if (u) setParam(k, { value: u })
                              }}
                              onPointerDown={e => e.stopPropagation()}
                              className="flex items-center gap-0.5 text-cyan-500 hover:text-cyan-400"
                              title="重新同步上游 url"
                            >
                              <RefreshCw className="h-2.5 w-2.5" /> 同步
                            </button>
                          )}
                        </div>
                        <input
                          value={param.value}
                          onChange={e => setParam(k, { value: e.target.value })}
                          onPointerDown={e => e.stopPropagation()}
                          placeholder={param.sourceFromUpstream ? '(从上游自动填入)' : `${vtype} url 或 fileName`}
                          readOnly={!!param.sourceFromUpstream}
                          className={cn(
                            'w-full h-5 text-[10px] px-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-ring',
                            param.sourceFromUpstream
                              ? 'bg-cyan-500/10 border-cyan-500/30 cursor-not-allowed'
                              : 'border-input bg-background'
                          )}
                        />
                      </>
                    ) : options && options.length > 0 ? (
                      <select
                        value={param.value}
                        onChange={e => setParam(k, { value: e.target.value })}
                        onPointerDown={e => e.stopPropagation()}
                        className="w-full h-5 text-[10px] px-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {param.value && !options.some(o => String(o) === String(param.value)) && (
                          <option value={param.value}>(当前) {param.value}</option>
                        )}
                        {!param.value && <option value="">(选择)</option>}
                        {options.map((opt, oi) => (
                          <option key={oi} value={String(opt)}>{String(opt)}</option>
                        ))}
                      </select>
                    ) : vtype === 'number' ? (
                      <input
                        type="number"
                        value={param.value}
                        onChange={e => setParam(k, { value: e.target.value })}
                        onPointerDown={e => e.stopPropagation()}
                        placeholder={extractDefaultValue(it)}
                        className="w-full h-5 text-[10px] px-1.5 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <textarea
                        value={param.value}
                        onChange={e => setParam(k, { value: e.target.value })}
                        onPointerDown={e => e.stopPropagation()}
                        placeholder={extractDefaultValue(it) || '文本参数'}
                        rows={2}
                        className="w-full text-[10px] px-1.5 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 实例类型 */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">实例类型(可选)</label>
          <select
            value={data.instanceType || ''}
            onChange={e => update({ instanceType: e.target.value })}
            onPointerDown={e => e.stopPropagation()}
            className="w-full h-6 text-xs px-2 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">默认</option>
            <option value="plus">plus</option>
          </select>
        </div>

        {data.errorMessage && (
          <div className="flex items-start gap-1.5 p-1.5 rounded bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="text-[9px] break-all">{data.errorMessage}</span>
          </div>
        )}

        {/* 输出结果 */}
        {(data.imageUrl || data.videoUrl || data.audioUrl) && (
          <div className="space-y-1 border-t pt-2">
            <label className="text-[10px] text-muted-foreground font-medium">
              输出结果 {data.urls && data.urls.length > 0 ? `(${data.urls.length})` : ''}
            </label>
            {data.imageUrl && (
              <div className="rounded overflow-hidden bg-muted/50 h-24">
                <img src={getImageUrl(data.imageUrl) || ''} alt="输出" className="w-full h-full object-contain" />
              </div>
            )}
            {data.videoUrl && (
              <div className="rounded overflow-hidden bg-muted/50">
                <video src={getVideoUrl(data.videoUrl) || ''} controls className="w-full max-h-32" />
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

        {/* 运行/停止按钮 */}
        {!isBusy ? (
          <button
            onClick={handleRun}
            onPointerDown={e => e.stopPropagation()}
            disabled={!data.webappId}
            className={cn(
              'w-full h-7 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
              data.webappId ? accentBtn : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            <Sparkles className="h-3 w-3" />
            {isWallet ? '运行钱包工作流' : '运行工作流'}
          </button>
        ) : (
          <button
            onClick={handleStop}
            onPointerDown={e => e.stopPropagation()}
            className="w-full h-7 rounded text-xs font-medium flex items-center justify-center gap-1.5 bg-zinc-500/20 hover:bg-zinc-500/30 text-zinc-200 transition-colors"
          >
            <Square className="h-3 w-3" />
            {cancelling ? '取消中...' : '停止'}
          </button>
        )}

        {isBusy && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {cancelling ? '正在取消 RH 后台任务...' : data.status === 'submitting' ? '提交任务...' : '轮询中'}
            {data.taskId && <span className="ml-auto text-muted-foreground/50">{String(data.taskId).slice(0, 10)}…</span>}
          </div>
        )}
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
