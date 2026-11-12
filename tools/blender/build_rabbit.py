# Rabbit parts for Fur & Fang. Run:  blender -b --factory-startup --python tools/blender/build_rabbit.py -- [--no-preview]
# Axes: +X = nose, +Z = up, base at z = 0. Vertex colour 'Col': rgb = painted value, alpha = FUR MASK
# (1 = multiplied by the per-instance fur colour in the shader; 0 = fixed colour: eyes, nose, tail, inner ear).
# Parts (separate meshes so ears/hind legs/teeth can be animated per instance):
#   rabbit_body, rabbit_hind (pivot at the hip), rabbit_ears_short, rabbit_ears_long (pivot at the ear base), rabbit_teeth (pivot at the gum)
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from furlib import *
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
PREVIEW = '--no-preview' not in sys.argv
reset()

HIP = (-0.14, 0.0, 0.30)
EAR_BASE = (0.27, 0.0, 0.60)
GUM = (0.585, 0.0, 0.352)
NOSE = (0.612, 0, 0.405)
TAIL = (-0.36, 0, 0.36)

def fur(g, a=1.0): return (g, g, g, a)

def body():
    el = [(Vector((-0.10, 0, 0.33)), 0.37), (Vector((0.06, 0, 0.31)), 0.30), (Vector((0.20, 0, 0.30)), 0.27),
          (Vector((0.34, 0, 0.45)), 0.25), (Vector((0.50, 0, 0.395)), 0.15),
          (Vector((0.45, 0.085, 0.385)), 0.12), (Vector((0.45, -0.085, 0.385)), 0.12)]
    m = metaball_mesh('rb', el, resolution=0.02)
    budget(m, 640)
    extra, spec = [], []
    for s in (-1, 1):
        c = (0.455, s * 0.112, 0.50)
        e = ellipsoid(c, 0.047, (1, 0.8, 1.05), 8)
        h = ellipsoid((c[0] + 0.028, c[1] + s * 0.012, c[2] + 0.024), 0.015, seg=5)
        extra += [e, h]; spec.append((Vector(c), 0.047, Vector((c[0] + 0.028, c[1] + s * 0.012, c[2] + 0.024))))
        # front legs + paws
        extra.append(ellipsoid((0.22, s * 0.085, 0.14), 0.07, (0.8, 0.75, 2.1), 6))
        extra.append(ellipsoid((0.25, s * 0.088, 0.035), 0.06, (1.5, 0.9, 0.62), 6))
    extra.append(ellipsoid(NOSE, 0.03, (1, 1.25, 0.9), 6))
    extra.append(ellipsoid(TAIL, 0.105, (1, 1, 1), 8))
    o = join([m] + extra, 'rabbit_body')
    def col(co, n):
        for (c, r, hl) in spec:
            if (co - hl).length < 0.019: return (1, 1, 1, 0)
            if (co - c).length < r * 1.2: return (0.09, 0.07, 0.07, 0)
        if (co - Vector(NOSE)).length < 0.045: return (0.93, 0.55, 0.58, 0)
        if (co - Vector(TAIL)).length < 0.14 and co.x < -0.3: return (0.98, 0.97, 0.95, 0)
        belly = smoothstep(0.30, 0.14, co.z)
        face = smoothstep(0.40, 0.55, co.x)
        g = 0.80 + 0.2 * belly + 0.10 * face * smoothstep(0.45, 0.34, co.z)
        g -= 0.07 * smoothstep(0.30, 0.52, co.z) * smoothstep(0.30, 0.0, abs(co.y)) * (1 - face)
        if co.z < 0.075 and co.x > 0.1: g += 0.04          # paws
        return fur(max(0.0, min(1.0, g)))
    vcolor(o, col)
    return finish(o, 'rabbit_body', ao=0.55)

def hind():
    el = [(Vector((-0.15, 0.18, 0.27)), 0.24), (Vector((-0.15, -0.18, 0.27)), 0.24),
          (Vector((-0.07, 0.19, 0.08)), 0.10), (Vector((-0.07, -0.19, 0.08)), 0.10)]
    m = metaball_mesh('rh', el, resolution=0.02)
    budget(m, 200)
    feet = [ellipsoid((0.0, s * 0.19, 0.045), 0.07, (2.1, 0.8, 0.6), 6) for s in (-1, 1)]
    o = join([m] + feet, 'rabbit_hind')
    vcolor(o, lambda co, n: fur(0.84 + 0.14 * smoothstep(0.22, 0.0, co.z) - 0.04 * smoothstep(0.2, 0.4, co.z)))
    return finish(o, 'rabbit_hind', ao=0.5)

def ears(name, length, width, lean):
    parts = []
    for s in (-1, 1):
        o = ellipsoid((0, 0, 0), 1.0, (0.034, width, length * 0.5), 10)
        for v in o.data.vertices:
            t = max(0.0, min(1.0, v.co.z / length + 0.5))
            v.co.y *= 1 - 0.40 * t * t * t + 0.15 * math.sin(t * 3.0)
            v.co.x += 0.03 * (1 - 4 * (t - 0.5) ** 2) * 0.5 - 0.0     # slight cup
            v.co.z += length * 0.5
        o.data.update()
        tilt_toward(o, (0, 0, 0), (math.radians(s * 14), math.radians(lean), 0))
        o.location = (EAR_BASE[0], s * 0.075, EAR_BASE[2] - 0.02)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        parts.append(o)
    o = join(parts, name)
    def col(co, n):
        t = (co.z - EAR_BASE[2]) / length
        if n.x > 0.25 and t < 0.9: return (0.96, 0.64, 0.67, 0.0)
        return fur(0.78 + 0.12 * smoothstep(0.0, 1.0, t))
    vcolor(o, col)
    return finish(o, name, ao=0.3)

def teeth():
    parts = [ellipsoid((GUM[0], s * 0.014, GUM[2] - 0.04), 0.024, (0.5, 0.5, 2.0), 6) for s in (-1, 1)]
    o = join(parts, 'rabbit_teeth')
    vcolor(o, lambda co, n: (0.98, 0.95, 0.82, 0))
    return finish(o, 'rabbit_teeth', ao=0.0)

parts = [body(), hind(), ears('rabbit_ears_short', 0.22, 0.062, 0.25), ears('rabbit_ears_long', 0.46, 0.062, 0.45), teeth()]
for p in parts: print(p.name, stats(p))
out = os.path.join(ROOT, 'assets', 'models', 'rabbit.glb')
os.makedirs(os.path.dirname(out), exist_ok=True)
export(parts, out)
if PREVIEW:
    def assemble(names, rot, tag):
        cs = []
        for p in parts:
            if p.name in names:
                c = p.copy(); c.data = p.data.copy(); link(c); cs.append(c)
        o = join(cs, tag)
        o.rotation_euler = (0, 0, math.radians(rot)); return o
    views = [assemble(('rabbit_body', 'rabbit_hind', 'rabbit_ears_long', 'rabbit_teeth'), rot, 'v%d' % i) for i, rot in enumerate((0, -50, -125))]
    views += [assemble(('rabbit_body', 'rabbit_hind', 'rabbit_ears_short', 'rabbit_teeth'), rot, 'w%d' % i) for i, rot in enumerate((0, -50, -125))]
    preview_dir = os.path.join(ROOT, 'playtest-shots'); os.makedirs(preview_dir, exist_ok=True)
    preview(views, os.path.join(preview_dir, 'blender-rabbit.png'), ground=0x8fb86a, cols=3, spacing=1.2, cam_dist=2.4)
