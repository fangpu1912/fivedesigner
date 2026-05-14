import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Plus, Trash2, Camera, Maximize, Minimize, Grid3X3, Eye, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

interface Scene3DCharacter {
  id: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: number
  color: string
  name: string
  imageUrl?: string
}

interface Scene3DEditorProps {
  backgroundImage?: string
  characters: Scene3DCharacter[]
  onCharactersChange: (characters: Scene3DCharacter[]) => void
  onScreenshot: (dataUrl: string) => void
  selectedCharacterId: string | null
  onSelectCharacter: (id: string | null) => void
  onFullscreenChange?: (isFullscreen: boolean) => void
  screenshotRatio?: string
}

// 颜色池
const COLOR_POOL = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export function Scene3DEditor({
  characters,
  onCharactersChange,
  onScreenshot,
  selectedCharacterId,
  onSelectCharacter,
  onFullscreenChange,
  screenshotRatio = '16:9',
}: Scene3DEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const characterMeshesRef = useRef<Map<string, THREE.Group>>(new Map())
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, z: 0 })
  const groundPlaneRef = useRef<THREE.Mesh | null>(null)

  // UI状态
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [viewMode, setViewMode] = useState<'top' | 'perspective'>('top')
  const [isPlacing, setIsPlacing] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)

  // 初始化3D场景
  useEffect(() => {
    if (!canvasContainerRef.current) return

    const container = canvasContainerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // 场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    // 相机
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    camera.position.set(0, 30, 0)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 控制器
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableRotate = false
    controls.enablePan = true
    controls.enableZoom = true
    controls.maxPolarAngle = 0
    controls.minPolarAngle = 0
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(10, 20, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    scene.add(dirLight)

    // 地面
    const groundGeometry = new THREE.PlaneGeometry(100, 100)
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x2a2a3e,
      transparent: true,
      opacity: 0.8
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    groundPlaneRef.current = ground

    // 网格
    const gridHelper = new THREE.GridHelper(100, 50, 0x444466, 0x333355)
    gridHelper.name = 'grid'
    scene.add(gridHelper)

    // 动画循环
    let animationId: number
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      controls.update()
      
      // 让图片贴图始终面向相机
      characterMeshesRef.current.forEach((mesh) => {
        mesh.children.forEach((child) => {
          if (child.userData.isBillboard && camera) {
            child.lookAt(camera.position)
          }
        })
      })
      
      renderer.render(scene, camera)
    }
    animate()

    // 处理窗口大小变化
    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // 切换视图模式
  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    if (viewMode === 'top') {
      // 顶视图
      camera.position.set(0, 30, 0)
      camera.lookAt(0, 0, 0)
      controls.enableRotate = false
      controls.maxPolarAngle = 0
      controls.minPolarAngle = 0
    } else {
      // 透视视图
      camera.position.set(15, 15, 15)
      camera.lookAt(0, 0, 0)
      controls.enableRotate = true
      controls.maxPolarAngle = Math.PI / 2 - 0.1
      controls.minPolarAngle = 0
    }
    controls.target.set(0, 0, 0)
    controls.update()
  }, [viewMode])

  // 更新网格显示
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const grid = scene.getObjectByName('grid')
    if (grid) {
      grid.visible = showGrid
    }
  }, [showGrid])

  // 创建人物模型 - 简化的小人
  const createCharacterMesh = useCallback((color: string, imageUrl?: string): THREE.Group => {
    const group = new THREE.Group()

    if (imageUrl) {
      // 使用图片贴图
      const textureLoader = new THREE.TextureLoader()
      const texture = textureLoader.load(imageUrl)
      texture.colorSpace = THREE.SRGBColorSpace
      
      const planeGeometry = new THREE.PlaneGeometry(1, 2)
      const planeMaterial = new THREE.MeshBasicMaterial({ 
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        alphaTest: 0.1
      })
      const plane = new THREE.Mesh(planeGeometry, planeMaterial)
      plane.position.y = 1
      plane.userData.isBillboard = true
      group.add(plane)
      
      // 底座圆环
      const baseGeometry = new THREE.RingGeometry(0.4, 0.5, 16)
      const baseMaterial = new THREE.MeshBasicMaterial({ 
        color, 
        transparent: true, 
        opacity: 0.5,
        side: THREE.DoubleSide
      })
      const base = new THREE.Mesh(baseGeometry, baseMaterial)
      base.rotation.x = -Math.PI / 2
      base.position.y = 0.02
      group.add(base)
    } else {
      // 简化小人模型
      const skinColor = '#ffdbac'
      const clothesColor = color
      
      // 头部
      const headGeometry = new THREE.SphereGeometry(0.25, 16, 16)
      const headMaterial = new THREE.MeshLambertMaterial({ color: skinColor })
      const head = new THREE.Mesh(headGeometry, headMaterial)
      head.position.y = 1.7
      head.castShadow = true
      group.add(head)
      
      // 身体
      const bodyGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.7, 12)
      const bodyMaterial = new THREE.MeshLambertMaterial({ color: clothesColor })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.position.y = 1.15
      body.castShadow = true
      group.add(body)
      
      // 左臂
      const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8)
      const armMaterial = new THREE.MeshLambertMaterial({ color: skinColor })
      const leftArm = new THREE.Mesh(armGeometry, armMaterial)
      leftArm.position.set(-0.35, 1.2, 0)
      leftArm.rotation.z = 0.3
      leftArm.castShadow = true
      group.add(leftArm)
      
      // 右臂
      const rightArm = new THREE.Mesh(armGeometry, armMaterial)
      rightArm.position.set(0.35, 1.2, 0)
      rightArm.rotation.z = -0.3
      rightArm.castShadow = true
      group.add(rightArm)
      
      // 左腿
      const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8)
      const legMaterial = new THREE.MeshLambertMaterial({ color: '#1f2937' })
      const leftLeg = new THREE.Mesh(legGeometry, legMaterial)
      leftLeg.position.set(-0.12, 0.4, 0)
      leftLeg.castShadow = true
      group.add(leftLeg)
      
      // 右腿
      const rightLeg = new THREE.Mesh(legGeometry, legMaterial)
      rightLeg.position.set(0.12, 0.4, 0)
      rightLeg.castShadow = true
      group.add(rightLeg)
    }

    // 选中时的外圈
    const ringGeometry = new THREE.RingGeometry(0.6, 0.7, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({ 
      color: '#ffff00', 
      transparent: true, 
      opacity: 0,
      side: THREE.DoubleSide
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    ring.name = 'selectionRing'
    group.add(ring)
    
    return group
  }, [])

  // 创建数字标注
  const createNumberLabel = useCallback((index: number): THREE.Sprite => {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, size, size)

    ctx.fillStyle = 'rgba(30, 64, 175, 0.95)'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 8
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 140px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(index + 1), size / 2, size / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(0.8, 0.8, 1)
    sprite.renderOrder = 999
    sprite.name = 'numberLabel'
    return sprite
  }, [])

  // 更新人物显示
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // 移除已删除的人物
    characterMeshesRef.current.forEach((mesh, id) => {
      if (!characters.find(c => c.id === id)) {
        scene.remove(mesh)
        characterMeshesRef.current.delete(id)
      }
    })

    // 添加或更新人物
    characters.forEach((char, index) => {
      let mesh = characterMeshesRef.current.get(char.id)
      
      if (!mesh) {
        mesh = createCharacterMesh(char.color, char.imageUrl)
        mesh.userData.characterId = char.id
        scene.add(mesh)
        characterMeshesRef.current.set(char.id, mesh)
      }

      // 更新位置（Y固定为0）
      mesh.position.set(char.position.x, 0, char.position.z)
      mesh.rotation.y = char.rotation.y
      mesh.scale.setScalar(char.scale)

      // 选中高亮
      const ring = mesh.getObjectByName('selectionRing') as THREE.Mesh
      if (ring) {
        const mat = ring.material as THREE.MeshBasicMaterial
        mat.opacity = char.id === selectedCharacterId ? 0.8 : 0
      }

      // 添加或更新数字标注（始终在头顶上方）
      let numberLabel = mesh.getObjectByName('numberLabel') as THREE.Sprite
      const labelHeight = char.imageUrl ? 2.3 : 2.2 // 贴图人物更高
      if (!numberLabel) {
        numberLabel = createNumberLabel(index)
        numberLabel.position.y = labelHeight
        mesh.add(numberLabel)
      } else {
        // 更新数字（如果索引变化）
        const oldIndex = parseInt(numberLabel.userData.index || '0')
        if (oldIndex !== index) {
          mesh.remove(numberLabel)
          numberLabel = createNumberLabel(index)
          numberLabel.position.y = labelHeight
          mesh.add(numberLabel)
        } else {
          // 只更新高度（如果有贴图变化）
          numberLabel.position.y = labelHeight
        }
      }
      numberLabel.userData.index = index
    })
  }, [characters, selectedCharacterId, createCharacterMesh, createNumberLabel])

  // 获取鼠标在地面上的位置
  const getGroundPosition = useCallback((clientX: number, clientY: number): { x: number; z: number } | null => {
    const container = canvasContainerRef.current
    const camera = cameraRef.current
    const ground = groundPlaneRef.current
    if (!container || !camera || !ground) return null

    const rect = container.getBoundingClientRect()
    mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, camera)
    
    const intersects = raycasterRef.current.intersectObject(ground)
    if (intersects.length > 0) {
      const firstIntersect = intersects[0]
      if (firstIntersect) {
        return { x: firstIntersect.point.x, z: firstIntersect.point.z }
      }
    }
    return null
  }, [])

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 放置模式：点击空白处添加人物
    if (isPlacing) {
      const pos = getGroundPosition(e.clientX, e.clientY)
      if (pos) {
        addCharacterAt(pos.x, pos.z)
      }
      return
    }

    const container = canvasContainerRef.current
    const camera = cameraRef.current
    if (!container || !camera) return

    const rect = container.getBoundingClientRect()
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, camera)

    // 检测是否点击了人物 - 递归检测所有子对象
    const characterGroups = Array.from(characterMeshesRef.current.values())
    const allMeshes: THREE.Object3D[] = []
    characterGroups.forEach(group => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          allMeshes.push(child)
        }
      })
    })
    
    const intersects = raycasterRef.current.intersectObjects(allMeshes, false)

    if (intersects.length > 0) {
      // 向上查找找到包含characterId的group
      const firstIntersect = intersects[0]
      if (!firstIntersect) return
      let target: THREE.Object3D = firstIntersect.object
      while (target.parent && !target.userData.characterId) {
        target = target.parent
      }
      
      if (target.userData.characterId) {
        const clickedId = target.userData.characterId
        
        // 右键选中人物，然后可以拖动
        e.preventDefault()
        onSelectCharacter(clickedId)
        isDraggingRef.current = true
        
        // 计算拖动偏移
        const char = characters.find(c => c.id === clickedId)
        const groundPos = getGroundPosition(e.clientX, e.clientY)
        if (char && groundPos) {
          dragOffsetRef.current = {
            x: char.position.x - groundPos.x,
            z: char.position.z - groundPos.z
          }
        }
      }
    } else {
      // 点击空白处，取消选择
      onSelectCharacter(null)
    }
  }, [isPlacing, characters, onSelectCharacter, getGroundPosition])

  // 处理鼠标移动（拖动）
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !selectedCharacterId) return

    const groundPos = getGroundPosition(e.clientX, e.clientY)
    if (!groundPos) return

    const newX = groundPos.x + dragOffsetRef.current.x
    const newZ = groundPos.z + dragOffsetRef.current.z

    onCharactersChange(
      characters.map(c => 
        c.id === selectedCharacterId 
          ? { ...c, position: { x: newX, y: 0, z: newZ } }
          : c
      )
    )
  }, [selectedCharacterId, characters, onCharactersChange, getGroundPosition])

  // 处理鼠标释放
  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  // 在指定位置添加人物
  const addCharacterAt = useCallback((x: number, z: number) => {
    const color = COLOR_POOL[characters.length % COLOR_POOL.length] ?? '#3b82f6'
    const newCharacter: Scene3DCharacter = {
      id: `char_${Date.now()}`,
      position: { x, y: 0, z },
      rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
      scale: 1,
      color,
      name: `人物 ${characters.length + 1}`,
    }
    onCharactersChange([...characters, newCharacter])
    onSelectCharacter(newCharacter.id)
    toast({ title: '已添加人物', description: `位置: (${x.toFixed(1)}, ${z.toFixed(1)})` })
  }, [characters, onCharactersChange, onSelectCharacter, toast])

  // 切换放置模式
  const togglePlacing = useCallback(() => {
    setIsPlacing(prev => !prev)
    if (!isPlacing) {
      toast({ title: '放置模式', description: '点击画布任意位置添加人物' })
    }
  }, [isPlacing, toast])

  // 删除选中人物
  const handleDeleteSelected = useCallback(() => {
    if (!selectedCharacterId) return
    onCharactersChange(characters.filter(c => c.id !== selectedCharacterId))
    onSelectCharacter(null)
    toast({ title: '已删除', description: '选中的人物已删除' })
  }, [selectedCharacterId, characters, onCharactersChange, onSelectCharacter, toast])

  // 清空所有
  const handleClearAll = useCallback(() => {
    onCharactersChange([])
    onSelectCharacter(null)
    toast({ title: '已清空', description: '所有人物已删除' })
  }, [onCharactersChange, onSelectCharacter, toast])

  // 截图
  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!renderer || !scene || !camera) return

    renderer.render(scene, camera)
    const originalCanvas = renderer.domElement
    
    // 根据比例裁剪
    let finalCanvas = originalCanvas
    if (screenshotRatio && screenshotRatio !== 'free') {
      const ratioMap: Record<string, number> = {
        '16:9': 16 / 9,
        '4:3': 4 / 3,
        '1:1': 1,
        '9:16': 9 / 16,
        '21:9': 21 / 9,
      }
      const targetRatio = ratioMap[screenshotRatio] || 16 / 9
      
      const cropCanvas = document.createElement('canvas')
      const ctx = cropCanvas.getContext('2d')
      if (ctx) {
        const origWidth = originalCanvas.width
        const origHeight = originalCanvas.height
        const origRatio = origWidth / origHeight
        let cropWidth, cropHeight, cropX, cropY
        
        if (origRatio > targetRatio) {
          cropHeight = origHeight
          cropWidth = origHeight * targetRatio
          cropX = (origWidth - cropWidth) / 2
          cropY = 0
        } else {
          cropWidth = origWidth
          cropHeight = origWidth / targetRatio
          cropX = 0
          cropY = (origHeight - cropHeight) / 2
        }
        
        cropCanvas.width = cropWidth
        cropCanvas.height = cropHeight
        ctx.drawImage(originalCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
        finalCanvas = cropCanvas
      }
    }
    
    const dataUrl = finalCanvas.toDataURL('image/png')
    onScreenshot(dataUrl)
    toast({ title: '截图已保存', description: `比例: ${screenshotRatio}` })
  }, [onScreenshot, toast, screenshotRatio])

  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }, [])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const newFullscreen = !!document.fullscreenElement
      setIsFullscreen(newFullscreen)
      onFullscreenChange?.(newFullscreen)
      
      // 使用更长的延迟确保DOM已经更新
      setTimeout(() => {
        const container = canvasContainerRef.current
        const renderer = rendererRef.current
        const camera = cameraRef.current
        if (container && renderer && camera) {
          // 强制重新计算容器尺寸
          const rect = container.getBoundingClientRect()
          const width = Math.max(1, Math.floor(rect.width))
          const height = Math.max(1, Math.floor(rect.height))
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.render(sceneRef.current!, camera)
        }
      }, 300)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [onFullscreenChange])
  
  // 监听窗口大小变化（用于退出全屏后重新调整）
  useEffect(() => {
    const handleResize = () => {
      const container = canvasContainerRef.current
      const renderer = rendererRef.current
      const camera = cameraRef.current
      if (container && renderer && camera && !document.fullscreenElement) {
        const rect = container.getBoundingClientRect()
        const width = Math.max(1, Math.floor(rect.width))
        const height = Math.max(1, Math.floor(rect.height))
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.render(sceneRef.current!, camera)
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        setIsSpacePressed(true)
        // 禁用控制器，防止拖动时移动视角
        const controls = controlsRef.current
        if (controls) {
          controls.enabled = false
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        const controls = controlsRef.current
        if (controls) {
          controls.target.set(0, 0, 0)
          controls.update()
        }
      }
      if (e.key === 'Escape') {
        setIsPlacing(false)
      }
      // F键全屏
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault()
          toggleFullscreen()
        }
      }
    }
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setIsSpacePressed(false)
        // 重新启用控制器
        const controls = controlsRef.current
        if (controls) {
          controls.enabled = true
        }
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedCharacterId, handleDeleteSelected])

  // 粘贴图片功能
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // 阻止事件冒泡，防止触发画布的粘贴
      e.stopPropagation()

      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item) continue
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile()
          if (blob) {
            const reader = new FileReader()
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string
              if (dataUrl) {
                onScreenshot(dataUrl)
                toast({ title: '图片已粘贴', description: '截图已添加到画布' })
              }
            }
            reader.readAsDataURL(blob)
          }
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [onScreenshot, toast])

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background nowheel" onWheel={(e) => e.stopPropagation()}>
      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b bg-muted/50 p-2">
        <Button 
          variant={isPlacing ? 'default' : 'outline'} 
          size="sm" 
          onClick={togglePlacing}
        >
          <Plus className="mr-1 h-3 w-3" />
          {isPlacing ? '点击放置' : '添加'}
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDeleteSelected}
          disabled={!selectedCharacterId}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          删除
        </Button>
        
        <Button variant="outline" size="sm" onClick={handleClearAll}>
          清空
        </Button>
        
        <div className="h-6 w-px bg-border" />
        
        <Button
          variant={showGrid ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowGrid(!showGrid)}
        >
          <Grid3X3 className="mr-1 h-3 w-3" />
          网格
        </Button>
        
        <Button
          variant={viewMode === 'perspective' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setViewMode(viewMode === 'top' ? 'perspective' : 'top')}
        >
          <Eye className="mr-1 h-3 w-3" />
          {viewMode === 'top' ? '3D' : '顶视'}
        </Button>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {characters.length}
        </div>
        
        <Button variant="outline" size="sm" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize className="mr-1 h-3 w-3" /> : <Maximize className="mr-1 h-3 w-3" />}
          {isFullscreen ? '退出' : '全屏'}
        </Button>
        
        <Button variant="default" size="sm" onClick={handleScreenshot}>
          <Camera className="mr-1 h-3 w-3" />
          截图
        </Button>
      </div>

      {/* 3D画布 */}
      <div 
        ref={canvasContainerRef} 
        className={`relative flex-1 nowheel ${isPlacing ? 'cursor-crosshair' : isSpacePressed ? 'cursor-move' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      />

      {/* 放置模式提示 */}
      {isPlacing && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded bg-blue-500 px-4 py-2 text-sm text-white shadow-lg">
          点击画布任意位置放置人物 • 按 ESC 退出
        </div>
      )}

      {/* 空格键提示 */}
      {isSpacePressed && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded bg-green-500 px-4 py-2 text-sm text-white shadow-lg">
          空格键按住 - 可以自由拖动人物
        </div>
      )}

      {/* 底部提示 */}
      <div className="absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-xs text-white">
        {viewMode === 'top' ? '顶视图' : '3D视图'} • 右键选中 • 空格+拖动 • 滚轮缩放 • F全屏 • Ctrl+V粘贴截图
      </div>
    </div>
  )
}
