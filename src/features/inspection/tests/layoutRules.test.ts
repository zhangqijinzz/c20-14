import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import { analyzeLayout, getItemBounds, getItemPolygon, normalizeRotation, polygonsOverlap } from '../../../shared/layoutRules'

describe('workspace rules', () => {
  it('normalizes rotation and calculates rotated bounds around the item center', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const bounds = getItemBounds(item)
    expect(normalizeRotation(-15)).toBe(345)
    expect(Math.round(bounds.width)).toBe(200)
    expect(Math.round(bounds.height)).toBe(400)
    expect(Math.round(bounds.left)).toBe(200)
  })

  it('detects overlap and out-of-bounds items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 300, y: 150, widthMm: 400, heightMm: 200 }
    const outside = { ...createItem('lamp'), x: 1500, y: 700 }
    const analysis = analyzeLayout({ ...plan, items: [first, second, outside] })
    expect(analysis.overlapIds).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(analysis.outOfBoundsIds).toContain(outside.id)
    expect(analysis.status).toBe('attention')
  })

  it('ignores empty space inside rotated bounding boxes', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('speaker'), x: 85, y: 85, widthMm: 100, heightMm: 100, rotation: 30 }
    const second = { ...createItem('lamp'), x: 180, y: 180, widthMm: 100, heightMm: 100, rotation: -30 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.overlapIds).toEqual([])
    expect(analysis.status).toBe('clear')
  })

  it('uses rotated rectangle shapes when detecting real overlap', () => {
    const first = { ...createItem('speaker'), x: 0, y: 0, widthMm: 100, heightMm: 100, rotation: 0 }
    const second = { ...createItem('lamp'), x: 50, y: 50, widthMm: 100, heightMm: 100, rotation: 45 }
    expect(polygonsOverlap(getItemPolygon(first), getItemPolygon(second))).toBe(true)
  })

  it('keeps the close-placement tolerance for rotated rectangles', () => {
    const first = { ...createItem('speaker'), x: 0, y: 0, widthMm: 100, heightMm: 100, rotation: 0 }
    const second = { ...createItem('lamp'), x: 117.5, y: 0, widthMm: 100, heightMm: 100, rotation: 30 }
    expect(polygonsOverlap(getItemPolygon(first), getItemPolygon(second))).toBe(false)
  })

  it('returns the same result when item order changes', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('speaker'), x: 85, y: 85, widthMm: 100, heightMm: 100, rotation: 30 }
    const second = { ...createItem('lamp'), x: 180, y: 180, widthMm: 100, heightMm: 100, rotation: -30 }
    const direct = analyzeLayout({ ...plan, items: [first, second] })
    const swapped = analyzeLayout({ ...plan, items: [second, first] })
    expect(swapped.overlapIds).toEqual(direct.overlapIds)
  })

  it('returns a healthy state for separated items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100 }
    const second = { ...createItem('keyboard'), x: 800, y: 500 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.status).toBe('clear')
    expect(analysis.coveragePercent).toBeGreaterThan(0)
  })
})
