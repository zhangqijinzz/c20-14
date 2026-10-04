import type { DeskItem, ItemBounds, ItemPolygon, LayoutAnalysis, Point, WorkspacePlan } from './models'

const OVERLAP_TOLERANCE_MM = 1

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function getItemPolygon(item: DeskItem): ItemPolygon {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const halfWidth = item.widthMm / 2
  const halfHeight = item.heightMm / 2
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => ({
    x: centerX + point.x * cosine - point.y * sine,
    y: centerY + point.x * sine + point.y * cosine,
  }))
}

function getBoundsFromPolygon(polygon: ItemPolygon): ItemBounds {
  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function getItemBounds(item: DeskItem): ItemBounds {
  return getBoundsFromPolygon(getItemPolygon(item))
}

function getPolygonAxes(polygon: ItemPolygon): Point[] {
  return polygon.map((point, index) => {
    const nextPoint = polygon[(index + 1) % polygon.length]
    const edgeX = nextPoint.x - point.x
    const edgeY = nextPoint.y - point.y
    const length = Math.hypot(edgeX, edgeY)
    return { x: -edgeY / length, y: edgeX / length }
  })
}

function projectPolygon(polygon: ItemPolygon, axis: Point): { min: number; max: number } {
  const projections = polygon.map((point) => point.x * axis.x + point.y * axis.y)
  return { min: Math.min(...projections), max: Math.max(...projections) }
}

function projectionsOverlapOnAxis(first: ItemPolygon, second: ItemPolygon, axis: Point): boolean {
  const firstProjection = projectPolygon(first, axis)
  const secondProjection = projectPolygon(second, axis)
  return Math.min(firstProjection.max, secondProjection.max) - Math.max(firstProjection.min, secondProjection.min) > OVERLAP_TOLERANCE_MM
}

export function polygonsOverlap(first: ItemPolygon, second: ItemPolygon): boolean {
  return [...getPolygonAxes(first), ...getPolygonAxes(second)]
    .every((axis) => projectionsOverlapOnAxis(first, second, axis))
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()
  const shapes = new Map(plan.items.map((item) => {
    const polygon = getItemPolygon(item)
    return [item.id, { polygon, bounds: getBoundsFromPolygon(polygon) }]
  }))

  plan.items.forEach((item) => {
    const shape = shapes.get(item.id)
    if (!shape) return
    if (shape.bounds.left < 0 || shape.bounds.top < 0 || shape.bounds.right > plan.deskWidthMm || shape.bounds.bottom > plan.deskHeightMm) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < plan.items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < plan.items.length; nextIndex += 1) {
      const first = plan.items[index]
      const second = plan.items[nextIndex]
      const firstShape = shapes.get(first.id)
      const secondShape = shapes.get(second.id)
      if (firstShape && secondShape && polygonsOverlap(firstShape.polygon, secondShape.polygon)) {
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
    overlapIds: [...overlapIds].sort(),
    outOfBoundsIds: [...outOfBoundsIds].sort(),
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
