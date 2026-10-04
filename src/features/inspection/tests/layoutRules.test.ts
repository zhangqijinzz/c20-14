import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import { analyzeLayout, getItemBounds, normalizeRotation } from '../../../shared/layoutRules'

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

  it('returns a healthy state for separated items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100 }
    const second = { ...createItem('keyboard'), x: 800, y: 500 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.status).toBe('clear')
    expect(analysis.coveragePercent).toBeGreaterThan(0)
  })

  it('does not flag rotated items whose bounding boxes overlap but shapes do not touch', () => {
    const plan = createPlan('test', false)
    // 显示器旋转 45° 后轴对齐外框约 530×530，与键盘的外框重叠约 235×90，
    // 但真实形状之间还有约 40mm 空隙，不应报重叠。
    const monitor = { ...createItem('monitor'), x: 430, y: 295, rotation: 45 }
    const keyboard = { ...createItem('keyboard'), x: 730, y: 75 }
    const analysis = analyzeLayout({ ...plan, items: [monitor, keyboard] })
    expect(analysis.overlapIds).toEqual([])
    expect(analysis.outOfBoundsIds).toEqual([])
    expect(analysis.status).toBe('clear')
  })

  it('flags rotated items that genuinely intersect', () => {
    const plan = createPlan('test', false)
    const monitor = { ...createItem('monitor'), x: 430, y: 295, rotation: 45 }
    const keyboard = { ...createItem('keyboard'), x: 630, y: 175 }
    const analysis = analyzeLayout({ ...plan, items: [monitor, keyboard] })
    expect(analysis.overlapIds).toEqual(expect.arrayContaining([monitor.id, keyboard.id]))
    expect(analysis.status).toBe('attention')
  })

  it('keeps the 1mm tolerance for touching items, rotated or not', () => {
    const plan = createPlan('test', false)
    const base = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200 }
    // 水平方向恰好重叠 1mm：不算冲突（保持原有宽容度）
    const touching = { ...createItem('keyboard'), x: 499, y: 150, widthMm: 400, heightMm: 200 }
    expect(analyzeLayout({ ...plan, items: [base, touching] }).overlapIds).toEqual([])
    // 重叠 2mm：算冲突
    const pressing = { ...touching, x: 498 }
    expect(analyzeLayout({ ...plan, items: [base, pressing] }).overlapIds).toEqual(
      expect.arrayContaining([base.id, pressing.id]),
    )
    // 旋转 90° 后宽容度不变
    const rotatedBase = { ...base, rotation: 90 }
    const rotatedTouching = { ...createItem('keyboard'), x: 299, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    expect(analyzeLayout({ ...plan, items: [rotatedBase, rotatedTouching] }).overlapIds).toEqual([])
    const rotatedPressing = { ...rotatedTouching, x: 298 }
    expect(analyzeLayout({ ...plan, items: [rotatedBase, rotatedPressing] }).overlapIds).toEqual(
      expect.arrayContaining([rotatedBase.id, rotatedPressing.id]),
    )
  })

  it('produces identical results for identical layouts', () => {
    const plan = createPlan('test', false)
    const monitor = { ...createItem('monitor'), x: 430, y: 295, rotation: 45 }
    const keyboard = { ...createItem('keyboard'), x: 630, y: 175, rotation: 30 }
    const speaker = { ...createItem('speaker'), x: 1200, y: 500, rotation: 15 }
    const layout = { ...plan, items: [monitor, keyboard, speaker] }
    expect(analyzeLayout(layout)).toEqual(analyzeLayout(layout))
  })
})
