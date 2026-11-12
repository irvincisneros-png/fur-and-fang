# Red fox parts for Fur & Fang (separate meshes, animated by pivots in src/render/foxes.js).
#   blender -b --factory-startup --python tools/blender/build_fox.py -- [--no-preview]
# +X nose, +Z up, feet at z = 0 when assembled with PIVOTS below.
# Parts: fox_body (origin at ground), fox_head (origin = neck joint), fox_tail_a (origin = tail root, set INSIDE the rump so the
#   brush never gaps), fox_tail_b (origin = mid-tail joint, TAIL_MID behind the root), fox_leg (origin = hip; hangs to z = -0.5)
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from furlib import *
from mathutils import Vector
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
PREVIEW = '--no-preview' not in sys.argv
reset()
NECK = (0.60, 0, 0.74); TAILB = (-0.50, 0, 0.64); TAIL_MID = (-0.40, 0, -0.03)
ORANGE, DEEP, CREAM, SOCK, DARK = srgb(0xe0702c), srgb(0xc9591e), srgb(0xf6e9d0), srgb(0x3b2822), srgb(0x16110f)

def body():
    el = [(Vector((-0.40, 0, 0.58)), 0.36), (Vector((-0.08, 0, 0.55)), 0.32), (Vector((0.26, 0, 0.60)), 0.34), (Vector((0.48, 0, 0.68)), 0.24)]
    m = metaball_mesh('fb', el, resolution=0.03)
    budget(m, 900)
    # fill leg stubs at the hips so the pivots read as shoulders and thighs
    stubs = [ellipsoid((x, s * 0.14, 0.50), 0.13, (1.0, 0.8, 1.1), 8) for x in (-0.40, 0.40) for s in (-1, 1)]
    o = join([m] + stubs, 'fox_body')
    def col(co, n):
        belly = smoothstep(0.50, 0.30, co.z)
        chest = smoothstep(0.30, 0.55, co.x) * smoothstep(0.62, 0.42, co.z)
        top = smoothstep(0.55, 0.85, co.z)
        c = mix(ORANGE, DEEP, top * 0.7)
        c = mix(c, CREAM, max(belly * 0.85, chest * 0.9))
        return c
    vcolor(o, col)
    return finish(o, 'fox_body', ao=0.55)

def head():
    parts = [ellipsoid((0.16, 0, 0.06), 0.17, (1.0, 0.95, 0.92), 10),
             ellipsoid((0.35, 0, 0.02), 0.11, (1.55, 0.8, 0.75), 9),
             ellipsoid((0.20, 0.0, -0.02), 0.12, (1.0, 1.0, 0.7), 8)]
    for s in (-1, 1):
        parts.append(ellipsoid((0.15, s * 0.115, 0.0), 0.085, (1.1, 0.8, 0.9), 7))     # cheek fluff
        # ears: pointed cones
        e = ellipsoid((0, 0, 0), 0.1, (0.55, 0.95, 2.3), 8)
        for v in e.data.vertices:
            t = (v.co.z + 0.23) / 0.46
            v.co.y *= max(0.15, 1 - 0.8 * t * t); v.co.x *= max(0.3, 1 - 0.6 * t)
        tilt_toward(e, (0, 0, 0), (math.radians(s * 14), math.radians(-12), 0))
        e.location = (0.07, s * 0.095, 0.22); bpy.ops.object.transform_apply(location=True)
        parts.append(e)
        parts.append(ellipsoid((0.235, s * 0.085, 0.115), 0.022, (1, 0.6, 1), 6))        # eyes
    nose = ellipsoid((0.485, 0, 0.035), 0.032, (1, 1.1, 0.9), 6)
    parts.append(nose)
    o = join(parts, 'fox_head')
    def col(co, n):
        if (co - Vector((0.485, 0, 0.035))).length < 0.04: return DARK
        for s in (-1, 1):
            if (co - Vector((0.235, s * 0.085, 0.115))).length < 0.032: return DARK
        if co.z > 0.2 and abs(co.x - 0.07) < 0.2:                                           # ears
            if n.x > 0.3: return mix(CREAM, ORANGE, 0.2)
            return mix(SOCK, DARK, 0.2)
        under = smoothstep(0.02, -0.05, co.z)
        cheek = smoothstep(0.10, 0.18, abs(co.y)) * smoothstep(0.1, 0.25, co.x)
        c = mix(ORANGE, DEEP, smoothstep(0.1, 0.22, co.z) * 0.6)
        c = mix(c, CREAM, max(under, cheek * 0.9))
        return c
    vcolor(o, col)
    return finish(o, 'fox_head', ao=0.5)

def tail_col(co, n, tip_x):
    c = mix(ORANGE, DEEP, smoothstep(-0.05, 0.1, co.z) * 0.6)
    return mix(c, CREAM, smoothstep(tip_x + 0.14, tip_x, co.x))

def tail_a():
    # root half: starts thin inside the rump (the origin is the pivot) and fattens toward the middle of the brush
    el = []
    for i in range(6):
        t = i / 5
        el.append((Vector((0.03 - 0.43 * t, 0, -0.03 * t)), 0.15 + 0.15 * math.sin(math.pi * 0.5 * t)))
    m = metaball_mesh('fta', el, resolution=0.028)
    budget(m, 260)
    vcolor(m, lambda co, n: tail_col(co, n, -9))
    return finish(m, 'fox_tail_a', ao=0.3)

def tail_b():
    # tip half: origin at the mid-tail joint, overlapping tail_a so a bend never opens a seam
    el = []
    for i in range(7):
        t = i / 6
        el.append((Vector((0.04 - 0.52 * t, 0, -0.02 * t)), 0.30 - 0.19 * t * t))
    m = metaball_mesh('ftb', el, resolution=0.028)
    budget(m, 300)
    xs = [v.co.x for v in m.data.vertices]
    vcolor(m, lambda co, n: tail_col(co, n, min(xs) + 0.02))
    return finish(m, 'fox_tail_b', ao=0.3)

def leg():
    parts = [ellipsoid((0, 0, -0.10), 0.12, (0.9, 0.7, 1.35), 8), ellipsoid((0.0, 0, -0.30), 0.065, (0.7, 0.7, 2.2), 7),
             ellipsoid((0.06, 0, -0.47), 0.065, (1.7, 0.95, 0.7), 7)]
    o = join(parts, 'fox_leg')
    vcolor(o, lambda co, n: mix(ORANGE, SOCK, smoothstep(-0.2, -0.32, co.z)))
    return finish(o, 'fox_leg', ao=0.5)

parts = [body(), head(), tail_a(), tail_b(), leg()]
for p in parts: print(p.name, stats(p))
export(parts, os.path.join(ROOT, 'assets', 'models', 'fox.glb'))
if PREVIEW:
    def assemble(rot, tag):
        cs = []
        def cp(p, loc=(0, 0, 0), sx=1):
            c = p.copy(); c.data = p.data.copy(); link(c); c.location = loc; c.scale = (1, sx, 1)
            bpy.context.view_layer.objects.active = c; bpy.ops.object.select_all(action='DESELECT'); c.select_set(True)
            bpy.ops.object.transform_apply(location=True, scale=True); cs.append(c)
        P = {p.name: p for p in parts}
        cp(P['fox_body']); cp(P['fox_head'], NECK); cp(P['fox_tail_a'], TAILB); cp(P['fox_tail_b'], tuple(TAILB[i] + TAIL_MID[i] for i in range(3)))
        for x in (-0.40, 0.40):
            for s in (-1, 1): cp(P['fox_leg'], (x, s * 0.15, 0.5))
        o = join(cs, tag); o.rotation_euler = (0, 0, math.radians(rot)); return o
    views = [assemble(r, 'v%d' % i) for i, r in enumerate((0, -40, -130))]
    preview(views, os.path.join(ROOT, 'playtest-shots', 'blender-fox.png'), ground=0x8fb86a, cols=3, spacing=2.2, cam_dist=4.5)
