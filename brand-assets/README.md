# FATS — Starter Brand Asset Pack

This vector recreation is based on the selected AI-generated FATS brand identity board, and is not the original native vector artwork. It has been cleaned and traced into paths. Visually verify proportions before brand launch, and refine in Inkscape/Figma if you need a final master logo.

## Best files

- `icon.svg` — primary full-color scalable icon (gradient)
- `icon-flat.svg` — primary icon with solid brand palette colors
- `icon-dark.svg` — monochrome ink icon
- `icon-white.svg` — monochrome white icon for dark surfaces
- `logo-horizontal.svg` — horizontal full-color brand lockup
- `logo-horizontal-flat.svg` — flat-color lockup
- `logo-horizontal-dark.svg` / `logo-horizontal-white.svg` — monochrome lockups
- `icon-{size}.png` — transparent PNG icons in common sizes
- `logo-horizontal-512.png`, `logo-horizontal-1024.png` — transparent lockup PNG
- `favicon.ico` — browser favicon sizes 16, 32, 48
- `apple-touch-icon.png` — 180px square white-backed iOS icon

## Integration with Next.js App Router

Copy `icon.svg` into `apps/web/src/app/icon.svg` (after inspecting the existing icon) or put `favicon.ico` in `apps/web/src/app/favicon.ico`. Copy `apple-touch-icon.png` to `apps/web/src/app/apple-icon.png`.
For a large visual logo in React, use `/public/brand/logo-horizontal.svg` and render using next/image or <img>; ensure width and height are assigned.

## Chrome extension (Manifest V3)

Use icon PNGs at 16, 32, 48, and 128. Example manifest icons:
`"icons": {"16":"icons/icon-16.png", "32":"icons/icon-32.png", "48":"icons/icon-48.png", "128":"icons/icon-128.png"}`

## Colors

Ink #202C3B | Blue #427DAB | Mint #42AD93 | Amber #E6AE68

Notes: Icon uses traced SVG outlines and gradient; lockup wordmark letters are vector outlines, while the small subtitle remains SVG text with Lato/Arial fallback. To make this strictly self-contained on all devices, convert the subtitle to outlines in Inkscape.
