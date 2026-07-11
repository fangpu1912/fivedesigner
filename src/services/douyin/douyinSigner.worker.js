// 抖音 a_bogus 签名 Worker
// 严格 ES5 语法:禁用 ?. ?? 模板字符串 class => import
// 主线程通过 init 消息传入 a_bogus.js 源码字符串,eval 后缓存 generate_a_bogus
var generateFn = null

self.onmessage = function (e) {
  var m = e.data
  if (!m) return

  if (m.type === 'init') {
    try {
      (0, eval)(m.code)
      generateFn = generate_a_bogus
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String(err && err.message ? err.message : err) })
    }
    return
  }

  if (m.type !== 'sign') return

  if (!generateFn) {
    self.postMessage({ type: 'result', id: m.id, success: false, error: 'signer not ready' })
    return
  }

  try {
    var value = generateFn(m.query, m.userAgent)
    self.postMessage({ type: 'result', id: m.id, success: true, data: value })
  } catch (err) {
    self.postMessage({ type: 'result', id: m.id, success: false, error: String(err && err.message ? err.message : err) })
  }
}
