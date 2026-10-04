import type { DeskItem, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'

// 重叠超过 1mm 才算冲突：贴得很近（≤1mm）视为正常摆放。
const OVERLAP_TOLERANCE_MM = 1

interface Point {
  x: number
  y: number
}

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function getItemBounds(item: DeskItem): ItemBounds {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const width = Math.abs(item.widthMm * Math.cos(radians)) + Math.abs(item.heightMm * Math.sin(radians))
  const height = Math.abs(item.widthMm * Math.sin(radians)) + Math.abs(item.heightMm * Math.cos(radians))
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  }
}

// 设备旋转后的真实四角（绕中心旋转），用于精确的重叠判断。
export function getItemCorners(item: DeskItem): Point[] {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2
  const halfWidth = item.widthMm / 2
  const halfHeight = item.heightMm / 2
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => ({
    x: centerX + corner.x * cos - corner.y * sin,
    y: centerY + corner.x * sin + corner.y * cos,
  }))
}

function projectCorners(corners: Point[], axis: Point): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  corners.forEach((corner) => {
    const projection = corner.x * axis.x + corner.y * axis.y
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  })
  return { min, max }
}

// 分离轴定理：对两个旋转矩形，只要在任一分离轴上的投影重叠
// 不超过宽容度，就视为未冲突；全部轴都超过才判定重叠。
// 未旋转时分离轴即 x/y 轴，结果与原来的外框判断完全一致。
export function itemsOverlap(first: DeskItem, second: DeskItem): boolean {
  const firstCorners = getItemCorners(first)
  const secondCorners = getItemCorners(second)
  const axes = [first, second].flatMap((item) => {
    const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return [
      { x: cos, y: sin },
      { x: -sin, y: cos },
    ]
  })
  return axes.every((axis) => {
    const firstRange = projectCorners(firstCorners, axis)
    const secondRange = projectCorners(secondCorners, axis)
    return Math.min(firstRange.max, secondRange.max) - Math.max(firstRange.min, secondRange.min) > OVERLAP_TOLERANCE_MM
  })
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()
  const bounds = new Map(plan.items.map((item) => [item.id, getItemBounds(item)]))

  plan.items.forEach((item) => {
    const itemBounds = bounds.get(item.id)
    if (!itemBounds) return
    if (itemBounds.left < 0 || itemBounds.top < 0 || itemBounds.right > plan.deskWidthMm || itemBounds.bottom > plan.deskHeightMm) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < plan.items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < plan.items.length; nextIndex += 1) {
      const first = plan.items[index]
      const second = plan.items[nextIndex]
      if (itemsOverlap(first, second)) {
        overlapIds.add(first.id)
        overlapIds.add(second.id)
      }
    }
  }

  const occupiedArea = plan.items.reduce((total, item) => total + item.widthMm * item.heightMm, 0)
  const deskArea = plan.deskWidthMm * plan.deskHeightMm
  const coveragePercent = Math.min(100, Math.round((occupiedArea / deskArea) * 100))
  const hasIssue = overlapIds.size > 0 || outOfBoundsIds.size > 0
  return {
    overlapIds: [...overlapIds],
    outOfBoundsIds: [...outOfBoundsIds],
    coveragePercent,
    status: hasIssue ? 'attention' : 'clear',
  }
}

export function clampDeskSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(4000, Math.max(600, Math.round(value)))
}

export function clampItemDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(2000, Math.max(40, Math.round(value)))
}
