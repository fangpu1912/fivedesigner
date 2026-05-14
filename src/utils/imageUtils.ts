import { readFileBase64 } from '@/services/tauri'

export function resolveAssetPath(assetUrl: string): string | null {
  try {
    if (assetUrl.startsWith('asset://')) {
      const urlObj = new URL(assetUrl)
      const decoded = decodeURIComponent(urlObj.pathname)
      return decoded.startsWith('/') ? decoded.slice(1) : decoded
    }
    if (assetUrl.includes('asset.localhost')) {
      const urlObj = new URL(assetUrl)
      const decoded = decodeURIComponent(urlObj.pathname)
      return decoded.startsWith('/') ? decoded.slice(1) : decoded
    }
    return null
  } catch {
    return null
  }
}

export async function imagePathToBase64(imagePath: string): Promise<string> {
  if (!imagePath) return ''

  if (imagePath.startsWith('data:image')) {
    return imagePath
  }

  if (imagePath.startsWith('asset://') || imagePath.includes('asset.localhost')) {
    const filePath = resolveAssetPath(imagePath)
    if (filePath) {
      try {
        const base64 = await readFileBase64(filePath)
        if (base64) {
          const mimeType = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
          return `data:${mimeType};base64,${base64}`
        }
      } catch {
        // conversion failed
      }
    }
    return ''
  }

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }

  try {
    const base64 = await readFileBase64(imagePath)
    if (!base64) return ''

    const mimeType = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
    return `data:${mimeType};base64,${base64}`
  } catch {
    return ''
  }
}

export function convertToAspectRatio(width?: number, height?: number): string {
  if (!width || !height) return '1:1'

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height)
  const rw = width / divisor
  const rh = height / divisor

  if (rw <= 16 && rh <= 16) return `${rw}:${rh}`
  if (Math.abs(width / height - 16 / 9) < 0.05) return '16:9'
  if (Math.abs(width / height - 9 / 16) < 0.05) return '9:16'
  if (Math.abs(width / height - 4 / 3) < 0.05) return '4:3'
  if (Math.abs(width / height - 3 / 4) < 0.05) return '3:4'
  if (Math.abs(width / height - 1) < 0.05) return '1:1'
  if (Math.abs(width / height - 21 / 9) < 0.05) return '21:9'

  return `${width}:${height}`
}
