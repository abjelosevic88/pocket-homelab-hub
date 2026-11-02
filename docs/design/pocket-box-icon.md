# Pocket Box icon

On 2026-11-02 the owner chose a Hellraiser-style Lament Configuration box (option 3, "Lift", from a set of six). It replaces the earlier open-lid graphite box with a cyan opening.

The box is drawn in gold line on a black squircle. Each face has a frame, a medallion with a solid diamond, and corner rays. The lid is lifted a few pixels, with a thin red glow coming from inside.

Source: `e_box()` in the Pocket icon generator (`pocket-icons/make2.py`), which also writes the flat (`f_box`) and full-bleed versions. `pocket-box-readme.svg` is the same SVG.

Every PNG is rendered from that SVG with rsvg-convert:

| File | Size | Source |
|---|---|---|
| `pocket-box.png` (main UI image) | 512 px | squircle |
| `icon-192.png`, `icon-512.png` | 192 and 512 px | squircle |
| `pocket-box-favicon.png` | 32 px | squircle |
| `apple-touch-icon.png` | 180 px | full-bleed |
| `icon-maskable-512.png` | 512 px | full-bleed; the box sits inside the 80% safe circle |

`favicon.svg` embeds the 512 px PNG for older shortcuts. The previous artwork is kept in `pocket-box-original.png`.
