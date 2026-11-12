# Rabbit parts for Fur & Fang. Run:  blender -b --factory-startup --python tools/blender/build_rabbit.py -- [--no-preview]
# Axes: +X = nose, +Z = up, base at z = 0. Vertex colour 'Col': rgb = painted value, alpha = FUR MASK
# (1 = multiplied by the per-instance fur colour in the shader; 0 = fixed colour: eyes, nose, tail, inner ear).
# Parts (separate meshes so ears/hind legs/teeth can be animated per instance):
#   rabbit_body, rabbit_hind_l / _r (pivot at the hip), rabbit_ear_short_l / _r, rabbit_ear_long_l / _r (pivot at the ear base),
#   rabbit_teeth (pivot at the gum). Left = Blender +Y (three.js -Z). Every part except the teeth also has a cheap *_lod twin,
#   used on the low quality tier and for big herds.
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

def body(name='rabbit_body', tri=640, lod=False):
    el = [(Vector((-0.10, 0, 0.33)), 0.37), (Vector((0.06, 0, 0.31)), 0.30), (Vector((0.20, 0, 0.30)), 0.27),
          (Vector((0.34, 0, 0.45)), 0.25), (Vector((0.50, 0, 0.395)), 0.15),
          (Vector((0.45, 0.085, 0.385)), 0.12), (Vector((0.45, -0.085, 0.385)), 0.12)]
    m = metaball_mesh('rb', el, resolution=0.02)
    budget(m, tri)
    extra, spec = [], []
    for s in (-1, 1):
        c = (0.455, s * 0.112, 0.50)
        LR = 4 if lod else None            # ring count for the cheap spheres
        e = ellipsoid(c, 0.047, (1, 0.8, 1.05), 6 if lod else 8, rings=LR)
        extra.append(e)
        if not lod: extra.append(ellipsoid((c[0] + 0.028, c[1] + s * 0.012, c[2] + 0.024), 0.015, seg=5))
        spec.append((Vector(c), 0.047, Vector((c[0] + 0.028, c[1] + s * 0.012, c[2] + 0.024))))
        # front legs + paws
        extra.append(ellipsoid((0.22, s * 0.085, 0.14), 0.07, (0.8, 0.75, 2.1), 5 if lod else 6, rings=3 if lod else None))
        extra.append(ellipsoid((0.25, s * 0.088, 0.035), 0.06, (1.5, 0.9, 0.62), 5 if lod else 6, rings=3 if lod else None))
    extra.append(ellipsoid(NOSE, 0.03, (1, 1.25, 0.9), 5 if lod else 6, rings=3 if lod else None))
    extra.append(ellipsoid(TAIL, 0.105, (1, 1, 1), 6 if lod else 8, rings=4 if lod else None))
    o = join([m] + extra, name)
    def col(co, n):
        for (c, r, hl) in spec:
            if not lod and (co - hl).length < 0.019: return (1, 1, 1, 0)
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
    return finish(o, name, ao=0.55)

def hind(s, name, tri=110, seg=6):
    # one haunch + shank + long foot per side, so the two legs can kick a beat apart
    el = [(Vector((-0.15, s * 0.18, 0.27)), 0.24), (Vector((-0.07, s * 0.19, 0.08)), 0.10)]
    m = metaball_mesh('rh', el, resolution=0.02)
    budget(m, tri)
    foot = ellipsoid((0.0, s * 0.19, 0.045), 0.07, (2.1, 0.8, 0.6), seg, rings=3 if seg < 6 else None)
    o = join([m, foot], name)
    vcolor(o, lambda co, n: fur(0.84 + 0.14 * smoothstep(0.22, 0.0, co.z) - 0.04 * smoothstep(0.2, 0.4, co.z)))
    return finish(o, name, ao=0.5)

def ear(s, name, length, width, lean, seg=10):
    parts = []
    if True:
        o = ellipsoid((0, 0, 0), 1.0, (0.034, width, length * 0.5), seg, rings=5 if seg < 10 else None)
        for v in o.data.vertices:
            t = max(0.0, min(1.0, v.co.z / length + 0.5))
            v.co.y *= 1 - 0.40 * t * t * t + 0.15 * math.sin(t * 3.0)
            v.co.x += 0.03 * (1 - 4 * (t - 0.5) ** 2) * 0.5 - 0.0     # slight cup
            v.co.z += length * 0.5
        o.data.update()
        tilt_toward(o, (0, 0, 0), (math.radians(-s * 9), math.radians(lean), 0))     # tips lean a little apart
        o.location = (EAR_BASE[0], s * 0.075, EAR_BASE[2] - 0.02)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        parts.append(o)
    o = parts[0]; o.name = name
    def col(co, n):
        t = (co.z - EAR_BASE[2]) / length
        if n.x > 0.25 and t < 0.9: return (0.96, 0.64, 0.67, 0.0)
        return fur(0.78 + 0.12 * smoothstep(0.0, 1.0, t))
    vcolor(o, col)
    return finish(o, name, ao=0.3)

def teeth():
    parts = [ellipsoid((GUM[0], s * 0.014, GUM[2] - 0.04), 0.026, (0.55, 0.62, 2.0), 5, rings=4) for s in (-1, 1)]
    o = join(parts, 'rabbit_teeth')
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)   # bake the position: export() zeroes object locations, which used to park the teeth inside the body
    vcolor(o, lambda co, n: (0.98, 0.95, 0.82, 0))
    return finish(o, 'rabbit_teeth', ao=0.0)

parts = [body()]
for s_, tag in ((1, 'l'), (-1, 'r')):
    parts.append(hind(s_, 'rabbit_hind_' + tag))
    parts.append(ear(s_, 'rabbit_ear_short_' + tag, 0.22, 0.062, 0.25))
    parts.append(ear(s_, 'rabbit_ear_long_' + tag, 0.46, 0.062, 0.45))
parts.append(teeth())
lods = [body('rabbit_body_lod', 230, True)]
for s_, tag in ((1, 'l'), (-1, 'r')):
    lods.append(hind(s_, 'rabbit_hind_%s_lod' % tag, 44, 5))
    lods.append(ear(s_, 'rabbit_ear_short_%s_lod' % tag, 0.22, 0.062, 0.25, 6))
    lods.append(ear(s_, 'rabbit_ear_long_%s_lod' % tag, 0.46, 0.062, 0.45, 6))
for p in parts + lods: print(p.name, stats(p))
out = os.path.join(ROOT, 'assets', 'models', 'rabbit.glb')
os.makedirs(os.path.dirname(out), exist_ok=True)
export(parts + lods, out)
if PREVIEW:
    def assemble(src, names, rot, tag):
        cs = []
        for p in src:
            if p.name in names:
                c = p.copy(); c.data = p.data.copy(); link(c); cs.append(c)
        o = join(cs, tag)
        o.rotation_euler = (0, 0, math.radians(rot)); return o
    LONG = ('rabbit_body', 'rabbit_hind_l', 'rabbit_hind_r', 'rabbit_ear_long_l', 'rabbit_ear_long_r', 'rabbit_teeth')
    SHORT = ('rabbit_body', 'rabbit_hind_l', 'rabbit_hind_r', 'rabbit_ear_short_l', 'rabbit_ear_short_r', 'rabbit_teeth')
    LOD = ('rabbit_body_lod', 'rabbit_hind_l_lod', 'rabbit_hind_r_lod', 'rabbit_ear_long_l_lod', 'rabbit_ear_long_r_lod')
    views = [assemble(parts, LONG, rot, 'v%d' % i) for i, rot in enumerate((0, -50, -125))]
    views += [assemble(parts, SHORT, rot, 'w%d' % i) for i, rot in enumerate((0, -50))]
    views += [assemble(lods, LOD, -50, 'lod')]
    preview_dir = os.path.join(ROOT, 'playtest-shots'); os.makedirs(preview_dir, exist_ok=True)
    preview(views, os.path.join(preview_dir, 'blender-rabbit.png'), ground=0x8fb86a, cols=3, spacing=1.2, cam_dist=2.4)
