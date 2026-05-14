const ALLOWED_VENDOR_METHODS = new Set([
  'textRequest',
  'imageRequest',
  'videoRequest',
  'ttsRequest',
  'voiceCloneUploadRequest',
  'voiceCloneRequest',
])

const zipImage = async (base64, maxSize) => {
  if (!base64) return ''
  let cleanBase64 = base64
  if (base64.includes(',')) {
    cleanBase64 = base64.split(',')[1] ?? ''
  }
  cleanBase64 = cleanBase64.replace(/\s/g, '')
  if (!cleanBase64) return base64
  try {
    const size = atob(cleanBase64).length
    if (size <= maxSize) return base64
  } catch {}
  return base64
}

const zipImageResolution = async (base64, _targetResolution) => {
  return base64
}

const Buffer = {
  from: (data, encoding) => {
    if (typeof data === 'string') {
      if (encoding === 'base64') {
        let cleanData = data
        if (data.includes(',')) {
          cleanData = data.split(',')[1] ?? ''
        }
        cleanData = cleanData.replace(/\s/g, '')
        if (!cleanData) return new Uint8Array(0)
        try {
          const binary = atob(cleanData)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
          }
          return bytes
        } catch {
          return new Uint8Array(0)
        }
      }
      const bytes = new Uint8Array(data.length)
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i)
      }
      return bytes
    }
    return data
  },
}

const pollTask = async (pollFn, options = {}) => {
  const { interval = 2000, maxAttempts = 150 } = options
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await pollFn()
    if (result.completed) return { data: result.data, error: result.error }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return { error: '轮询超时，请稍后查看结果' }
}

const mockRequire = (name) => {
  if (name === 'axios') {
    return {
      post: async (url, data, options) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: options?.headers || {},
          body: JSON.stringify(data),
        })
        const responseData = await response.json()
        return { data: responseData }
      },
    }
  }
  return {}
}

const pendingCalls = new Map()

function bridgeCall(method, args) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    pendingCalls.set(id, { resolve, reject })
    self.postMessage({ type: 'api-call', id, method, args })
  })
}

const readFile = async (filePath) => {
  return bridgeCall('readFile', [filePath])
}

const tauriInvoke = async (cmd, args) => {
  return bridgeCall('tauriInvoke', [cmd, args])
}

const urlToBase64 = async (url) => {
  return bridgeCall('urlToBase64', [url])
}

self.onmessage = async (e) => {
  const data = e.data

  if (data.type === 'api-response' && data.id) {
    const pending = pendingCalls.get(data.id)
    if (pending) {
      pendingCalls.delete(data.id)
      if (data.error) {
        pending.reject(new Error(data.error))
      } else {
        pending.resolve(data.result)
      }
    }
    return
  }

  if (data.type === 'execute') {
    const { id, code, config, method, model, input } = data

    try {
      if (!ALLOWED_VENDOR_METHODS.has(method)) {
        throw new Error('不允许的供应商方法: ' + method)
      }

      const vendorModule = { exports: {} }

      let vendorFactory
      try {
        vendorFactory = new Function(
          'module',
          'exports',
          'require',
          'zipImage',
          'zipImageResolution',
          'Buffer',
          'readFile',
          'pollTask',
          'tauriInvoke',
          'urlToBase64',
          code
        )
      } catch (syntaxError) {
        throw new Error(
          '供应商代码语法错误: ' +
            (syntaxError instanceof Error ? syntaxError.message : String(syntaxError))
        )
      }

      try {
        vendorFactory(
          vendorModule,
          vendorModule.exports,
          mockRequire,
          zipImage,
          zipImageResolution,
          Buffer,
          readFile,
          pollTask,
          tauriInvoke,
          urlToBase64
        )
      } catch (execError) {
        throw new Error(
          '执行供应商代码失败: ' +
            (execError instanceof Error ? execError.message : String(execError))
        )
      }

      const VendorClass = vendorModule.exports.Vendor
      if (!VendorClass) {
        throw new Error('供应商代码中未找到Vendor类，请检查代码是否包含 module.exports = { Vendor }')
      }

      let vendor
      try {
        vendor = new VendorClass(config)
      } catch (constructorError) {
        throw new Error(
          'Vendor构造函数错误: ' +
            (constructorError instanceof Error ? constructorError.message : String(constructorError))
        )
      }

      if (typeof vendor[method] !== 'function') {
        throw new Error('供应商代码中未找到方法: ' + method)
      }

      let methodFn
      try {
        methodFn = await vendor[method](model)
      } catch (methodError) {
        throw new Error(
          '获取方法 ' + method + ' 失败: ' +
            (methodError instanceof Error ? methodError.message : String(methodError))
        )
      }

      if (typeof methodFn !== 'function') {
        throw new Error('方法 ' + method + ' 返回的不是函数，返回类型: ' + typeof methodFn)
      }

      const result = await methodFn(input)

      self.postMessage({ type: 'result', id, success: true, data: result })
    } catch (error) {
      self.postMessage({
        type: 'result',
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
