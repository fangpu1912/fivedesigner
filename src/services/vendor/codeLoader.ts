/**
 * 供应商代码加载器
 * 从单独的文件加载供应商代码，避免在 seedData.ts 中使用字符串模板
 */

import toonflowCode from './codes/toonflow.js?raw'
import volcengineCode from './codes/volcengine.js?raw'
import minimaxCode from './codes/minimax.js?raw'
import openaiCode from './codes/openai.js?raw'
import klingaiCode from './codes/klingai.js?raw'
import viduCode from './codes/vidu.js?raw'
import deepseekCode from './codes/deepseek.js?raw'
import googleCode from './codes/google.js?raw'
import modelscopeCode from './codes/modelscope.js?raw'
import geekaiCode from './codes/geekai.js?raw'

// 供应商代码映射
const vendorCodes: Record<string, string> = {
  toonflow: toonflowCode,
  volcengine: volcengineCode,
  minimax: minimaxCode,
  openai: openaiCode,
  klingai: klingaiCode,
  vidu: viduCode,
  deepseek: deepseekCode,
  google: googleCode,
  modelscope: modelscopeCode,
  geekai: geekaiCode,
}

/**
 * 获取供应商代码
 * @param vendorId 供应商ID
 * @returns 供应商代码字符串
 */
export function getVendorCode(vendorId: string): string | undefined {
  return vendorCodes[vendorId]
}

/**
 * 注册供应商代码
 * @param vendorId 供应商ID
 * @param code 代码字符串
 */
export function registerVendorCode(vendorId: string, code: string): void {
  vendorCodes[vendorId] = code
}

export default vendorCodes
