# Map bugs (branch map-bugs)

Tested in headless Chrome (WebGL via SwiftShader) at 1440x900 and 390x844 with touch, against a stateful mocked Supabase (buy / place / move RPCs). Screenshots: `screenshots/map/bugs-*.png`.
Flows checked: load, wheel zoom, zoom buttons, buy item, click-to-place, confirm, reload (persistence), move house via dialog, type coordinates, move house to the east meadow, reload. No console errors.

| # | Defect | Repro | Status |
|---|--------|-------|--------|
| 1 | Zoom percentage out of sync | Zoom with wheel/pinch: toolbar still says 100 %, next +/- jumps | Fixed: world reports `camera.zoom` back (`onZoomChange`) |
| 2 | Whole 3D scene rebuilt on every page re-render | `visibleIds`, `[]` fallbacks were new arrays each render, so `populate()` ran on zoom clicks, typing in search, notices... (villagers reset, jank) | Fixed: `useMemo` for visible ids, stable empty arrays |
| 3 | Trees/flowers stay at the old plot after moving a house | Move a house, decoration stays behind and blocks the view | Fixed: decorations follow the house layout position |
| 4 | Placement click puts the item's top-left corner under the cursor (grid is drawn centered) | Place a 5x5 house by tapping | Fixed: click centers the footprint |
| 5 | Pinch with two fingers can register a tap and move the placement | Two-finger pinch on touch while placing | Fixed: multi-touch gestures ignored for tap, `pointercancel` handled |
| 6 | Items could be placed over the void beside the east meadow (x >= 17, z < -6 or z > 20 when many applications) | Place item at x 20, z -7 | Fixed in `canPlaceMapItem` (+ test) |
| 7 | Decorative trees at x=15.4 / -8.8 overlap placeable cells | Visual only | Open (cosmetic) |
| 8 | Scene rebuild on each placement click (`placement` in populate deps) is still heavy for large villages | Click repeatedly while placing | Open, needs refactor of map files (islands agent) |
| 9 | Server-side `map_shop_place` / `map_move_object` bounds are wider than the client rule from #6 | Direct RPC call | Open (DB untouched, no migrations applied) |
