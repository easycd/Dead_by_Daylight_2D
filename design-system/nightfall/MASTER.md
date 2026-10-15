# NIGHTFALL interface

UI/UX Pro Max reviewed: dark minimal style, visible focus, readable contrast, semantic forms, drag alternatives. The generated 3D/cyberpunk showcase did not fit this survival game; use the verified UX rules with this project-specific art direction.

- Forest black #0c1210, panel #17201b, foreground #f0f1e7, secondary text #acb9ac, light moss accent #d2dfa2, danger #f0a18b.
- Preserve Korean system fonts. Body/form text 14–16px, secondary 12–13px, short HUD captions 10px. Tabular timers. Never encode health exclusively by color.
- 8px spacing rhythm, quiet borders, 6–8px corners. One prominent lobby action. No extra image/font dependencies.
- Lobby: identity → create/join → room information. Equipment can fold. Explain why game start is unavailable.
- HUD: objective top center, survivors left, events right, current work bottom center, equipment above minimap. Role-specific shortcuts.
- Chat: translucent dark surface, channel label, draggable header, direction-key move and position button, folding with unread count. Preserve channel restrictions and reading scroll.
- Inputs/actions: visible focus, guide focus containment/return, pending entry feedback, clear empty/error states. Reduced-motion CSS.
- Responsive: inspect 375, 768, 1024, 1440 widths and landscape. Keyboard and mouse remain necessary for game movement; responsive layout is not mobile touch gameplay support.

## 데바데2D login / lobby override · 2026-10-15

User-requested black and red horror direction supersedes the forest palette on lobby surfaces. Skill design-system output suggested arcade pixel fonts and green CTAs, which do not fit this request. A focused style search verified minimal grid/contrast guidance; UX search verified visible keyboard focus. Project-specific direction: black #09090b, panel #131215, crimson CTA #b72438 with white text, light red accent #f1848c, secondary #b6adb0. Keep Korean system fonts. Use an inline SVG forest, red moon and silhouette, with no external image/font dependency and no flashing effects.

- Brand: 데바데2D in browser title, header, hero and match HUD. Preserve internal identifiers and existing storage keys.
- Layout: brand/status/account in header; atmosphere and rules on left; one active account/lobby/wardrobe/waiting panel on right. Narrow screens stack naturally.
- Controls: 44px minimum actions, 48px fields, explicit labels, password reveal, native autocomplete and paste; pale red visible focus. Red buttons carry white text. Errors contain text and a border.
- CSS override is scoped under #lobby; match health colors and visibility remain distinct.
