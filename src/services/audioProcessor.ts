/**
 * 音频处理服务
 * 提供音频修剪、格式转换等功能
 */

import { join } from '@tauri-apps/api/path'
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'

import { workspaceService } from './workspace/WorkspaceService'

export interface AudioTrimResult {
  audioUrl: string
  duration: number
  blob: Blob
}

/**
 * 修剪音频
 * @param src 音频源 URL
 * @param start 开始时间（秒）
 * @param end 结束时间（秒）
 * @param savePath 可选的保存路径，如果提供则保存到该路径，否则使用临时目录
 * @returns 修剪后的音频数据
 */
export async function trimAudio(
  src: string,
  start: number,
  end: number,
  savePath?: string
): Promise<AudioTrimResult> {
  // 获取音频数据
  const response = await fetch(src)
  const arrayBuffer = await response.arrayBuffer()

  // 创建 AudioContext
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

  try {
    // 解码音频数据
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // 计算采样点
    const sampleRate = audioBuffer.sampleRate
    const channels = audioBuffer.numberOfChannels
    const startSample = Math.floor(start * sampleRate)
    const endSample = Math.floor(end * sampleRate)
    const newLength = endSample - startSample

    // 创建新的 AudioBuffer
    const newBuffer = audioContext.createBuffer(channels, newLength, sampleRate)

    // 复制数据
    for (let channel = 0; channel < channels; channel++) {
      const oldData = audioBuffer.getChannelData(channel)
      const newData = newBuffer.getChannelData(channel)

      for (let i = 0; i < newLength; i++) {
        const sampleIndex = startSample + i
        const sample = sampleIndex < oldData.length ? oldData[sampleIndex] : 0
        if (sample !== undefined) {
          newData[i] = sample
        }
      }
    }

    // 将 AudioBuffer 转换为 WAV 格式
    const wavBlob = audioBufferToWav(newBuffer)

    // 保存到本地文件
    let audioUrl: string
    if (savePath) {
      // 使用提供的保存路径
      const dirPath =
        savePath.substring(0, savePath.lastIndexOf('/')) ||
        savePath.substring(0, savePath.lastIndexOf('\\'))
      if (dirPath) {
        const dirExists = await exists(dirPath)
        if (!dirExists) {
          await mkdir(dirPath, { recursive: true })
        }
      }
      const arrayBuffer = await wavBlob.arrayBuffer()
      await writeFile(savePath, new Uint8Array(arrayBuffer))
      audioUrl = savePath
    } else {
      const baseDir = await workspaceService.getWorkspacePath()
      const tempDir = await join(baseDir, 'temp', 'audio')
      const dirExists = await exists(tempDir)
      if (!dirExists) {
        await mkdir(tempDir, { recursive: true })
      }
      const fileName = `trimmed_${Date.now()}.wav`
      const filePath = await join(tempDir, fileName)
      const arrayBuffer = await wavBlob.arrayBuffer()
      await writeFile(filePath, new Uint8Array(arrayBuffer))
      audioUrl = filePath
    }

    return {
      audioUrl,
      duration: newLength / sampleRate,
      blob: wavBlob,
    }
  } finally {
    // 关闭 AudioContext
    await audioContext.close()
  }
}

/**
 * 将 AudioBuffer 转换为 WAV 格式的 Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const length = buffer.length * buffer.numberOfChannels * 2 + 44
  const arrayBuffer = new ArrayBuffer(length)
  const view = new DataView(arrayBuffer)
  const channels: Float32Array[] = []
  let offset = 0
  let pos = 0

  // 写入 WAV 头部
  setUint32(0x46464952) // "RIFF"
  setUint32(length - 8) // file length - 8
  setUint32(0x45564157) // "WAVE"

  setUint32(0x20746d66) // "fmt " chunk
  setUint32(16) // length = 16
  setUint16(1) // PCM (uncompressed)
  setUint16(buffer.numberOfChannels)
  setUint32(buffer.sampleRate)
  setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels) // avg. bytes/sec
  setUint16(buffer.numberOfChannels * 2) // block-align
  setUint16(16) // 16-bit (hardcoded in this demo)

  setUint32(0x61746164) // "data" - chunk
  setUint32(length - pos - 4) // chunk length

  // 写入音频数据
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  while (pos < length) {
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i]![offset] || 0))
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0
      view.setInt16(pos, sample, true)
      pos += 2
    }
    offset++
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })

  function setUint16(data: number) {
    view.setUint16(pos, data, true)
    pos += 2
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true)
    pos += 4
  }
}

/**
 * 获取音频时长
 */
export async function getAudioDuration(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(src)
    audio.preload = 'metadata'

    audio.onloadedmetadata = () => {
      resolve(audio.duration)
    }

    audio.onerror = () => {
      reject(new Error('无法加载音频'))
    }

    // 设置超时
    setTimeout(() => {
      reject(new Error('加载音频超时'))
    }, 10000)
  })
}

/**
 * 下载音频文件
 */
export function downloadAudio(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
