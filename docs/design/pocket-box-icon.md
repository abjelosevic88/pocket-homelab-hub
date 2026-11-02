# Pocket Box icon

On 2026-11-02 the owner chose "Sparkle": an open white box with five app tiles swirling up out of it and little white sparkles, on a cyan-to-blue squircle (the orange first version was switched to cyan-to-blue the same day to match pockethomelab.com). It matches the illustrated style of the other Pocket app icons. It replaces the Lament-style gold box (used briefly the same day) and the earlier graphite box with a cyan opening.

Source: `e_box()` in the Pocket icon generator (`pocket-icons/make2.py`), which also writes the flat (`f_box`) and full-bleed versions. `pocket-box-readme.svg` is the same SVG.

Every PNG is rendered from that SVG with rsvg-convert:

| File | Size | Source |
|---|---|---|
| `pocket-box.png` (main UI image) | 512 px | squircle |
| `icon-192.png`, `icon-512.png` | 192 and 512 px | squircle |
| `pocket-box-favicon.png` | 32 px | squircle |
| `apple-touch-icon.png` | 180 px | full-bleed |
| `icon-maskable-512.png` | 512 px | full-bleed, artwork scaled to 78% so it stays inside the safe circle |

`favicon.svg` embeds the 512 px PNG for older shortcuts. The original graphite artwork is kept in `pocket-box-original.png`.
