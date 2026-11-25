// Run: node --experimental-strip-types web/scripts/check-layout.mts  (prints the least-visible poster per board width; must stay well above 0%)
import { layoutBoard } from '../src/lib/layout.ts'
const ratios = [[600,800],[800,800],[640,800],[800,450],[600,900],[450,800],[700,990],[800,1000],[1000,300],[300,1000]]
for (const W of [360, 390, 430, 768, 1024, 1280, 1536]) {
  const ps = Array.from({ length: 100 }, (_, i) => ({ id: 'id-' + i * 7919, width: ratios[i % 10][0], height: ratios[i % 10][1] }))
  const { items } = layoutBoard(ps, W)
  let min = 1, minId = ''
  for (const a of items) {
    let vis = 0, tot = 0
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      const x = a.x + (i + .5) / 24 * a.w, y = a.y + (j + .5) / 24 * a.h; tot++
      if (!items.some((b) => b.z > a.z && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) vis++
    }
    if (vis / tot < min) { min = vis / tot; minId = a.id }
  }
  console.log(`width ${W}: min visible area per poster = ${(min * 100).toFixed(0)}%`)
}
