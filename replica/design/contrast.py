#!/usr/bin/env python3
"""WCAG contrast checker for tokens.json. Prepared by Sara Salem. Copyright Sara Salem 2026."""
import json, sys

def lum(h):
    h = h.lstrip('#')[:6]
    def lin(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(h[i:i+2]) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(a, b):
    l1, l2 = sorted((lum(a), lum(b)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)

t = json.load(open(sys.argv[1]))
fail = 0
for theme in ("color", "color-dark"):
    pal = t.get(theme)
    if not pal:
        continue
    print(f"== {theme}")
    for p in t["pairs"]:
        fg, bg = pal[p["fg"]], pal[p["bg"]]
        if len(fg.lstrip('#')) > 6 or len(bg.lstrip('#')) > 6:
            print(f"  skip {p['fg']} on {p['bg']} (alpha)"); continue
        r = ratio(fg, bg)
        ok = r >= p["min"]
        fail += not ok
        print(f"  {'PASS' if ok else 'FAIL'} {p['fg']:>13} on {p['bg']:<13} {r:5.2f} (min {p['min']})")
print(f"\n{fail} failure(s)")
sys.exit(1 if fail else 0)
