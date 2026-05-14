import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame, extend, useLoader } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { getImageUrl } from '@/utils/asset'

// 扩展 Three.js 类型
extend({ CanvasTexture: THREE.CanvasTexture })
import type { SceneCharacter, CameraConfig, SceneScreenshot } from '../../types'

interface Scene3DProps {
  panoramaUrl: string | null
  characters: SceneCharacter[]
  camera: CameraConfig
  showGrid: boolean
  gridSize: number
  onCameraChange: (camera: CameraConfig) => void
  onScreenshot: (screenshot: SceneScreenshot) => void
  selectedCharacterId: string | null
  onCharacterSelect: (id: string | null) => void
  onCharacterUpdate: (id: string, updates: Partial<SceneCharacter>) => void
  isPlacingCharacter?: boolean
  onGroundClick?: (position: { x: number; z: number }) => void
}

// 防抖函数
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// 获取 WebGL 最大纹理尺寸
function getMaxTextureSize(): number {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  if (!gl) return 2048
  return (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).MAX_TEXTURE_SIZE) as number
}

// 预加载并缩放纹理 - 使用 useMemo 缓存
function useScaledTexture(url: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const maxSize = getMaxTextureSize()

    const img = new Image()
    const resolvedUrl = getImageUrl(url) || url
    if (resolvedUrl && !resolvedUrl.startsWith('asset://') && !resolvedUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      // 如果图片太大，需要缩放
      if (img.width > maxSize || img.height > maxSize) {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = Math.floor(img.width * scale)
        canvas.height = Math.floor(img.height * scale)

        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

          const newTexture = new THREE.CanvasTexture(canvas)
          newTexture.colorSpace = THREE.SRGBColorSpace
          setTexture(newTexture)
        }
      } else {
        const loader = new THREE.TextureLoader()
        loader.load(url, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          setTexture(tex)
        })
      }
      setIsLoading(false)
    }
    img.onerror = () => {
      console.error('[useScaledTexture] Failed to load image:', url)
      setError('Failed to load image')
      setIsLoading(false)
    }
    img.src = resolvedUrl

    // 清理函数
    return () => {
      if (texture) {
        texture.dispose()
      }
    }
  }, [url]) // 只在 url 变化时重新加载

  return { texture, isLoading, error }
}

// 全景球体 - 使用 React.memo 防止不必要的重渲染
const PanoramaSphere = React.memo(function PanoramaSphere({ url }: { url: string | null }) {
  if (!url) {
    return (
      <Html center>
        <div className="rounded bg-black/50 px-4 py-2 text-sm text-white">
          请上传全景图
        </div>
      </Html>
    )
  }

  const textureUrl = useMemo(() => getImageUrl(url) || url, [url])
  return <PanoramaMesh url={textureUrl} />
})

// 球体网格 - 使用 React.memo，降低细分度
const PanoramaMesh = React.memo(function PanoramaMesh({ url }: { url: string }) {
  const { texture, isLoading, error } = useScaledTexture(url)

  if (isLoading) {
    return (
      <Html center>
        <div className="rounded bg-black/50 px-4 py-2 text-sm text-white">
          加载中...
        </div>
      </Html>
    )
  }

  if (error || !texture) {
    return (
      <Html center>
        <div className="rounded bg-red-500/50 px-4 py-2 text-sm text-white">
          加载失败
        </div>
      </Html>
    )
  }

  return (
    <mesh scale={[-1, 1, 1]}>
      {/* 降低球体细分度以减少 GPU 负担 */}
      <sphereGeometry args={[10, 32, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  )
})

// 人物精灵 - 使用 React.memo
const CharacterSprite = React.memo(function CharacterSprite({
  character,
  isSelected,
  onSelect,
}: {
  character: SceneCharacter
  isSelected: boolean
  onSelect: () => void
}) {
  const textureUrl = useMemo(() => getImageUrl(character.imageUrl) || character.imageUrl, [character.imageUrl])
  const texture = useLoader(THREE.TextureLoader, textureUrl)
  texture.colorSpace = THREE.SRGBColorSpace

  const z = useMemo(() =>
    character.layer === 'foreground' ? -3 : character.layer === 'background' ? -7 : -5,
    [character.layer]
  )

  return (
    <mesh
      position={[character.position.x, character.position.y || 0, z]}
      rotation={[0, character.rotation, 0]}
      scale={character.scale}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <planeGeometry args={[0.5, 0.75]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.1} side={THREE.DoubleSide} />
      {isSelected && (
        <Html center>
          <div className="pointer-events-none h-12 w-8 -translate-y-1/2 rounded border-2 border-primary" />
        </Html>
      )}
    </mesh>
  )
})

// 相机控制 - 使用防抖
function CameraController({
  camera,
  onChange,
}: {
  camera: CameraConfig
  onChange: (camera: CameraConfig) => void
}) {
  const { camera: threeCamera } = useThree()
  const controlsRef = useRef<any>(null)
  const lastUpdateRef = useRef(0)

  // 使用防抖，每 100ms 最多更新一次
  const debouncedOnChange = useMemo(
    () =>
      debounce((pos: THREE.Vector3, target: THREE.Vector3) => {
        onChange({
          position: { x: pos.x, y: pos.y, z: pos.z },
          target: { x: target.x, y: target.y, z: target.z },
          fov: 75,
        })
      }, 100),
    [onChange]
  )

  useFrame(() => {
    if (controlsRef.current) {
      const now = Date.now()
      // 限制更新频率
      if (now - lastUpdateRef.current > 100) {
        const pos = threeCamera.position
        const target = controlsRef.current.target
        debouncedOnChange(pos, target)
        lastUpdateRef.current = now
      }
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={false}
      enableRotate={true}
      minDistance={0.1}
      maxDistance={0.1}
      target={[camera.target.x, camera.target.y, camera.target.z]}
    />
  )
}

// 场景 - 使用 React.memo
const Scene = React.memo(function Scene({
  panoramaUrl,
  characters,
  camera,
  selectedCharacterId,
  onCharacterSelect,
  onCameraChange,
}: {
  panoramaUrl: string | null
  characters: SceneCharacter[]
  camera: CameraConfig
  selectedCharacterId: string | null
  onCharacterSelect: (id: string | null) => void
  onCameraChange: (camera: CameraConfig) => void
}) {
  return (
    <>
      {/* 全景 */}
      <PanoramaSphere url={panoramaUrl} />

      {/* 人物 */}
      {characters.map((char) => (
        <CharacterSprite
          key={char.id}
          character={char}
          isSelected={char.id === selectedCharacterId}
          onSelect={useCallback(() => onCharacterSelect(char.id), [char.id, onCharacterSelect])}
        />
      ))}

      {/* 相机 */}
      <CameraController camera={camera} onChange={onCameraChange} />

      {/* 灯光 */}
      <ambientLight intensity={1} />
    </>
  )
})

// 主组件
export function Scene3D({
  panoramaUrl,
  characters,
  camera,
  showGrid,
  gridSize,
  onCameraChange,
  onScreenshot,
  selectedCharacterId,
  onCharacterSelect,
  onCharacterUpdate,
}: Scene3DProps) {
  void showGrid
  void gridSize
  void onScreenshot
  void onCharacterUpdate

  // 使用 useMemo 缓存 WebGL 检测结果
  const { hasWebGL, maxTextureSize: _maxTextureSize } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    const maxSize = gl ? (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).MAX_TEXTURE_SIZE) as number : 0
    return { hasWebGL: !!gl, maxTextureSize: maxSize }
  }, []) // 只在组件挂载时检测一次

  if (!hasWebGL) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-white">
        <p>您的浏览器不支持 WebGL</p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-black">
      <Canvas
        camera={{ position: [0, 0, 0], fov: 75, near: 0.01, far: 100 }}
        gl={{ preserveDrawingBuffer: true, antialias: false, alpha: false }}
        dpr={1}
      >
        <Scene
          panoramaUrl={panoramaUrl}
          characters={characters}
          camera={camera}
          selectedCharacterId={selectedCharacterId}
          onCharacterSelect={onCharacterSelect}
          onCameraChange={onCameraChange}
        />
      </Canvas>
    </div>
  )
}
