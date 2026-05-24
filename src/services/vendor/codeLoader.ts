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
import kimiCode from './codes/kimi.js?raw'
import runninghubCode from './codes/runninghub.js?raw'

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
  kimi: kimiCode,
  runninghub: runninghubCode,
}

export function getVendorCode(vendorId: string): string | undefined {
  return vendorCodes[vendorId]
}

export function registerVendorCode(vendorId: string, code: string): void {
  vendorCodes[vendorId] = code
}

export default vendorCodes
