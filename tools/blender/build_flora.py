# Trees, rocks, shrubs, grass, clover, brush pile, burrow mound, log for Fur & Fang.
#   blender -b --factory-startup --python tools/blender/build_flora.py -- [--no-preview]
# Writes assets/models/flora.glb (all meshes, base at z = 0, metres; Z up in Blender -> Y up in glTF).
# Vertex colour 'Col' rgb only (alpha = 1). Snow caps, painted mottling and seasonal tint are applied by the shaders.
import bpy, sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from furlib import *
from mathutils import Vector, noise
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
PREVIEW = '--no-preview' not in sys.argv
reset()
V = Vector

def lumps(c, r, n, rnd, spread=0.7, flat=0.7, rs=(0.45, 0.8)):
    """A cloud of overlapping spheres around c -> metaball elements."""
    el = [(V(c), r)]
    for i in range(n):
        a, b = rnd.uniform(0, math.tau), rnd.uniform(-0.3, 0.9)
        d = V((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b) * flat))
        el.append((V(c) + d * r * spread * rnd.uniform(0.4, 1.0), r * rnd.uniform(*rs)))
    return el

def trunk_path(pts, r0, r1, verts=9):
    parts = []
    for i in range(len(pts) - 1):
        t0, t1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
        parts.append(tube(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, verts))
    for i in range(1, len(pts) - 1):
        t = i / (len(pts) - 1)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=verts, ring_count=5, radius=r0 + (r1 - r0) * t, location=pts[i])
        parts.append(bpy.context.active_object)
    return parts

# ------------------------------------------------------------------ trees
def gum(name, seed, height=11.0, lean=0.8):
    """Eucalypt: pale trunk that forks into a few limbs, lumpy drooping blue-green clumps."""
    rnd = random.Random(seed)
    parts, foliage = [], []
    base = V((0, 0, 0))
    h1 = height * 0.38
    p = [base, V((lean * 0.3, 0.1, h1 * 0.4)), V((lean * 0.5, 0.3, h1))]
    parts += trunk_path(p, 0.42, 0.3)
    fork = p[-1]
    limbs = 3
    for k in range(limbs):
        a = k / limbs * math.tau + rnd.uniform(-0.4, 0.4)
        d = V((math.cos(a) * rnd.uniform(0.8, 1.7), math.sin(a) * rnd.uniform(0.8, 1.7), 0))
        mid = fork + d * 0.5 + V((0, 0, height * rnd.uniform(0.18, 0.26)))
        tip = fork + d * 1.2 + V((0, 0, height * rnd.uniform(0.42, 0.56)))
        parts += trunk_path([fork, mid, tip], 0.26, 0.1, 8)
        for j in range(2):
            c = tip + V((rnd.uniform(-1.2, 1.2), rnd.uniform(-1.2, 1.2), rnd.uniform(-0.2, 0.7)))
            foliage += lumps(c, rnd.uniform(1.25, 1.6), 5, rnd, 0.95, 0.55)
    trunk = join(parts, name + '_t')
    # clumps are wide and flatter than a pine's; one metaball field for all of them
    fol = metaball_mesh(name + '_f', foliage, resolution=0.2)
    budget(fol, 1800); budget(trunk, 700)
    fz = max(v.co.z for v in fol.data.vertices)
    def fcol(co, n):
        top = smoothstep(0.25, 0.9, n.z)
        c = mix(srgb(0x4d7d62), srgb(0x93bb7a), top)
        c = mix(c, srgb(0xb4cf7e), 0.5 * smoothstep(0.6, 1.0, co.z / fz) * top)
        w = noise.noise(co * 0.9) * 0.5 + 0.5
        return mix(c, srgb(0x6fa882), 0.35 * w)
    vcolor(fol, fcol)
    def tcol(co, n):
        c = mix(srgb(0xb9a58b), srgb(0xe6d9c0), smoothstep(0.5, 6.0, co.z) * 0.8)
        c = mix(c, srgb(0x9a8270), smoothstep(1.4, 0.0, co.z) * 0.8)                       # darker, rougher base bark
        stripe = noise.noise(V((co.x * 2.5, co.y * 2.5, co.z * 0.5)))
        return mix(c, srgb(0xd8a888), max(0, stripe) * 0.35)
    vcolor(trunk, tcol)
    o = join([trunk, fol], name)
    o.data.update()
    return finish(o, name, ao=0.8)

def conifer(name, seed, height=9.0, tiers=6):
    rnd = random.Random(seed)
    parts = []
    trunk = tube(V((0, 0, 0)), V((0, 0, height * 0.35)), 0.34, 0.2, 8); parts.append(trunk)
    for i in range(tiers):
        t = i / (tiers - 1)
        z0 = height * (0.16 + 0.74 * t * 0.88)
        r = (1 - t * 0.78) * height * 0.30
        h = height * (0.30 - 0.1 * t)
        bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=r, radius2=r * 0.12, depth=h, location=(0, 0, z0 + h / 2))
        c = bpy.context.active_object
        for v in c.data.vertices:    # scalloped skirt + organic wobble
            ang = math.atan2(v.co.y, v.co.x); rr = math.hypot(v.co.x, v.co.y)
            if v.co.z < z0 + 0.1:
                k = 1 + 0.12 * math.sin(ang * 7 + i) + 0.05 * noise.noise(V((ang * 2, i, 0)))
                v.co.x *= k; v.co.y *= k
            v.co.x += 0.1 * noise.noise(V((i, 0.4, v.co.z))); v.co.y += 0.1 * noise.noise(V((i, 1.4, v.co.z)))
        c.data.update()
        sub = c.modifiers.new('s', 'SUBSURF'); sub.levels = 2; apply_all(c)
        parts.append(c)
    o = join(parts, name)
    budget(o, 2200)
    def col(co, n):
        if co.z < height * 0.2 and math.hypot(co.x, co.y) < 0.45: return mix(srgb(0x5b4636), srgb(0x7a6048), smoothstep(0, 1.5, co.z))
        t = co.z / height
        top = smoothstep(-0.2, 0.9, n.z)
        c = mix(srgb(0x2f5f45), srgb(0x5f9158), top)
        c = mix(c, srgb(0x2a5340), smoothstep(0.2, 0.0, t) * 0.5)
        return mix(c, srgb(0x8dbd78), 0.25 * smoothstep(0.7, 1.0, t))
    vcolor(o, col)
    return finish(o, name, ao=0.85)

def wattle(name, seed, height=6.0):
    rnd = random.Random(seed)
    parts = trunk_path([V((0, 0, 0)), V((0.4, 0.1, height * 0.3)), V((0.2, 0.3, height * 0.55))], 0.3, 0.17, 8)
    for k in range(2):
        a = k * math.pi + rnd.uniform(-0.5, 0.5)
        parts += trunk_path([V((0.2, 0.3, height * 0.5)), V((0.2 + math.cos(a) * 1.0, 0.3 + math.sin(a), height * 0.7))], 0.14, 0.08, 7)
    tr = join(parts, name + '_t')
    el = []
    for j in range(5):
        a = j / 5 * math.tau + rnd.uniform(-0.3, 0.3)
        el += lumps(V((0.2 + math.cos(a) * 1.5, 0.3 + math.sin(a) * 1.5, height * rnd.uniform(0.66, 0.82))), rnd.uniform(1.1, 1.4), 4, rnd, 0.8, 0.6)
    el += lumps(V((0.2, 0.3, height * 0.9)), 1.6, 5, rnd, 0.8, 0.6)
    fo = metaball_mesh(name + '_f', el, resolution=0.2)
    budget(fo, 1800); budget(tr, 500)
    def fcol(co, n):
        top = smoothstep(0.0, 0.9, n.z)
        c = mix(srgb(0x4a7a45), srgb(0x82b45a), top)
        f = noise.noise(co * 2.8) + 0.6 * noise.noise(co * 6.0)       # golden wattle blossom puffs
        if f > 0.42 and n.z > -0.2: return mix(srgb(0xf2c93a), srgb(0xffe266), smoothstep(0.42, 0.8, f))
        return c
    vcolor(fo, fcol)
    vcolor(tr, lambda co, n: mix(srgb(0x6a5040), srgb(0x937760), smoothstep(0, 4, co.z)))
    o = join([tr, fo], name)
    return finish(o, name, ao=0.8)

# ------------------------------------------------------------------ rocks
def rock(name, seed, size=(1.0, 0.85, 0.6), faceted=0.35, moss=0.0, tone=0xa6a39a, sub=3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=0.5)
    o = bpy.context.active_object
    rnd = random.Random(seed)
    for v in o.data.vertices:
        p = v.co.copy()
        d = noise.noise(p * 2.0 + V((seed * 3.1, 0, 0))) * 0.25 + noise.noise(p * 4.5 + V((0, seed, 1))) * 0.07
        p = p * (1 + d)
        # flat-ish planes: snap a little toward a coarse grid in direction space for facets
        if faceted:
            n = p.normalized()
            q = V((round(n.x * 2.2) / 2.2, round(n.y * 2.2) / 2.2, round(n.z * 2.2) / 2.2))
            if q.length > 0.01: p = p.lerp(q.normalized() * p.length, faceted * 0.4)
        v.co = V((p.x * size[0], p.y * size[1], p.z * size[2]))
        v.co.z = max(v.co.z, -0.14 * size[2])
    o.data.update()
    zmin = min(v.co.z for v in o.data.vertices)
    for v in o.data.vertices: v.co.z -= zmin - 0.0 + (0.05 * size[2])
    o.data.update()
    t, b = srgb(tone), mix(srgb(tone), srgb(0x6a6a70), 0.45)
    def col(co, n):
        c = mix(b, t, smoothstep(-0.5, 0.8, n.z))
        c = mix(c, srgb(0xc7b8a2), 0.18 * max(0, noise.noise(co * 1.5)))
        if moss > 0:
            m = smoothstep(0.55 - moss * 0.3, 0.8, n.z) * (0.6 + 0.6 * noise.noise(co * 3 + V((seed, 0, 0))))
            c = mix(c, srgb(0x6f9a52), min(1, m * moss * 1.6))
        return c
    vcolor(o, col)
    return finish(o, name, ao=0.8)

# ------------------------------------------------------------------ small plants
def shrub(name, seed, size=1.0, berries=False, tone=0x5f9a55):
    rnd = random.Random(seed)
    el = []
    for i in range(7):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0, 0.55) * size
        el += lumps((math.cos(a) * r, math.sin(a) * r, 0.45 * size * rnd.uniform(0.7, 1.2)), 0.38 * size, 3, rnd, 0.8, 0.6)
    o = metaball_mesh(name, el, resolution=0.07 * size)
    budget(o, 900)
    for v in o.data.vertices: v.co.z = max(v.co.z, 0.0)
    o.data.update()
    pts = [V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.2, 1.0))).normalized() * 0.6 * size for _ in range(16)] if berries else []
    t, b = srgb(tone), srgb(0x3a6f48)
    def col(co, n):
        c = mix(b, t, smoothstep(-0.2, 0.9, n.z) * 0.9 + 0.1 * noise.noise(co * 4))
        c = mix(c, srgb(0x9cc46a), 0.2 * smoothstep(0.5, 1.0, co.z / (0.9 * size)))
        for p in pts:
            if (co - V((p.x, p.y, p.z + 0.1))).length < 0.075 * size: return srgb(0xd9453f)
        return c
    vcolor(o, col)
    return finish(o, name, ao=0.8)

def blade_mesh(name, seed, count, height, width, spread, lean, base, tip, segs=3, flowers=None):
    rnd = random.Random(seed)
    bm = bmesh.new()
    for i in range(count):
        a = i / count * math.tau + rnd.uniform(-0.4, 0.4)
        r0 = rnd.uniform(0.0, spread)
        px, py = math.cos(a) * r0, math.sin(a) * r0
        h = height * rnd.uniform(0.7, 1.15)
        lx, ly = math.cos(a) * lean * rnd.uniform(0.6, 1.2), math.sin(a) * lean * rnd.uniform(0.6, 1.2)
        side = V((-math.sin(a), math.cos(a), 0))
        rows = []
        for s in range(segs + 1):
            t = s / segs
            w = width * (1 - t * t * 0.98) * 0.5
            c = V((px + lx * t * t * h, py + ly * t * t * h, h * t))
            rows.append((bm.verts.new(c - side * w), bm.verts.new(c + side * w)))
        for s in range(segs):
            l0, r0_ = rows[s]; l1, r1 = rows[s + 1]
            if s == segs - 1:
                bm.faces.new((l0, r0_, r1))                    # pointed tip
            else:
                bm.faces.new((l0, r0_, r1, l1))
    o = mesh_from_bm(bm, name)
    parts = [o]
    fl = []
    if flowers:
        for k in range(flowers[0]):
            a = rnd.uniform(0, math.tau); r0 = rnd.uniform(0.05, spread)
            c = V((math.cos(a) * r0, math.sin(a) * r0, height * rnd.uniform(0.75, 1.0)))
            parts.append(tube(V((c.x, c.y, 0)), c, 0.012, 0.01, 4))
            f = ellipsoid(c, flowers[1], (1, 1, 0.7), 6); parts.append(f); fl.append((c, flowers[2][k % len(flowers[2])]))
    o = join(parts, name) if len(parts) > 1 else o
    b, t = srgb(base), srgb(tip)
    zmax = height
    def col(co, n):
        for c, fc in fl:
            if (co - c).length < flowers[1] * 1.3: return srgb(fc)
        return mix(b, t, smoothstep(0.0, 1.0, co.z / zmax) ** 0.8)
    vcolor(o, col)
    return finish(o, name, ao=0.0)

def clover(name, seed):
    rnd = random.Random(seed)
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.0, depth=0.1, location=(0, 0, 0.0))
    d = bpy.context.active_object
    for v in d.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if v.co.z > 0: v.co.z = 0.06 * (1 - 0.8 * r * r)
        if r > 0.5: v.co.x *= 1 + 0.18 * noise.noise(v.co * 3); v.co.y *= 1 + 0.18 * noise.noise(v.co * 3 + V((4, 0, 0)))
    d.data.update(); parts.append(d)
    fl = []
    for i in range(46):
        a = rnd.uniform(0, math.tau); r = math.sqrt(rnd.uniform(0, 0.9))
        c = V((math.cos(a) * r, math.sin(a) * r, 0.06))
        for k in range(3):
            ka = a + k * 2.1 + rnd.uniform(-0.3, 0.3)
            parts.append(ellipsoid(c + V((math.cos(ka) * 0.06, math.sin(ka) * 0.06, 0.07)), 0.06, (1, 0.9, 0.35), 6))
        if i % 4 == 0:
            f = c + V((0, 0, 0.16)); parts.append(ellipsoid(f, 0.05, (1, 1, 0.9), 6)); fl.append(f)
    o = join(parts, name); budget(o, 1600)
    def col(co, n):
        for f in fl:
            if (co - f).length < 0.065: return srgb(0xfaf4ee) if (f.x * 7 + f.y * 3) % 2 > 0.6 else srgb(0xf4d3e6)
        if co.z < 0.04: return srgb(0x3f7a3a)
        return mix(srgb(0x4f9c4a), srgb(0x84cc5c), smoothstep(0.04, 0.12, co.z))
    vcolor(o, col)
    return finish(o, name, ao=0.5)

def brush_pile(name, seed):
    rnd = random.Random(seed)
    sticks = []
    for i in range(24):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.0, 0.7); L = rnd.uniform(0.9, 1.5)
        c = V((math.cos(a) * r, math.sin(a) * r, 0.1 + rnd.uniform(0, 0.5) * (1 - r)))
        ta = rnd.uniform(0, math.tau); tilt = rnd.uniform(0.3, 0.9)
        d = V((math.cos(ta) * math.cos(tilt), math.sin(ta) * math.cos(tilt), math.sin(tilt))) * L / 2
        sticks.append(tube(c - d, c + d, 0.045, 0.03, 6))
    st = join(sticks, name + '_s')
    el = []
    for i in range(10):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0, 0.65)
        el += lumps((math.cos(a) * r, math.sin(a) * r, 0.3 + 0.35 * (1 - r)), 0.3, 2, rnd, 0.7, 0.6)
    lv = metaball_mesh(name + '_l', el, resolution=0.06)
    for v in lv.data.vertices: v.co.z = max(v.co.z, 0.0)
    budget(lv, 700); budget(st, 600)
    vcolor(st, lambda co, n: mix(srgb(0x6b4d33), srgb(0x9a7a56), (noise.noise(co * 6) + 1) / 2))
    vcolor(lv, lambda co, n: mix(srgb(0x587f45), srgb(0x93b25a), smoothstep(0.1, 0.9, n.z) * 0.8))
    o = join([st, lv], name)
    return finish(o, name, ao=0.7)

def mound(name, seed):
    rnd = random.Random(seed)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=12, radius=1.0)
    o = bpy.context.active_object
    for v in o.data.vertices:
        p = v.co
        k = 1 + 0.12 * noise.noise(p * 2.2 + V((seed, 0, 0)))
        v.co = V((p.x * k * 1.0, p.y * k * 0.95, max(p.z, -0.1) * 0.48 * k))
        if v.co.z < 0: v.co.z = 0.0
    o.data.update()
    hole_c = V((0.62, 0.0, 0.2))
    hole = ellipsoid(hole_c, 0.30, (0.45, 1.0, 1.0), 10)
    o = join([o, hole], name)
    def col(co, n):
        if (co - hole_c).length < 0.34 and co.x > 0.5: return srgb(0x2a1d16)
        c = mix(srgb(0x8f6c4a), srgb(0xb88f62), smoothstep(-0.2, 0.9, n.z))
        return mix(c, srgb(0x6e8a46), 0.5 * smoothstep(0.25, 0.0, math.hypot(co.x, co.y) - 0.7) * smoothstep(0.25, 0.4, co.z) * 0 + 0.45 * smoothstep(0.7, 1.0, math.hypot(co.x, co.y)))
    vcolor(o, col)
    return finish(o, name, ao=0.8)

def log(name, seed):
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.38, depth=3.2)
    o = bpy.context.active_object
    o.rotation_euler = (0, math.pi / 2, 0); bpy.ops.object.transform_apply(rotation=True)
    for v in o.data.vertices:
        v.co.z += 0.34; v.co.y *= 1 + 0.12 * noise.noise(v.co * 2); v.co.z += 0.05 * noise.noise(v.co * 3 + V((2, 0, 0)))
    o.data.update()
    sub = o.modifiers.new('s', 'SUBSURF'); sub.levels = 1; apply_all(o)
    def col(co, n):
        if abs(co.x) > 1.55: return mix(srgb(0xc9a672), srgb(0x8d6b45), smoothstep(0.0, 0.3, math.hypot(co.y, co.z - 0.34)))
        c = mix(srgb(0x6e5239), srgb(0x927153), (noise.noise(co * 5) + 1) / 2)
        return mix(c, srgb(0x6f9a52), 0.8 * smoothstep(0.35, 0.8, n.z) * (0.6 + 0.4 * noise.noise(co * 3)))
    vcolor(o, col)
    return finish(o, name, ao=0.8)

# ------------------------------------------------------------------ build everything
objs = [
    gum('gum_a', 1, 11.0, 0.9), gum('gum_b', 7, 8.5, -0.7), conifer('pine_a', 2, 10.0, 6), conifer('pine_b', 5, 6.5, 5),
    wattle('wattle_a', 3, 6.0),
    rock('rock_a', 1, (1.1, 0.9, 0.7)), rock('rock_b', 2, (0.8, 0.7, 0.5), 0.5, 0.0, 0xb4aca2), rock('rock_c', 3, (1.3, 1.0, 0.55), 0.3, 0.5, 0x9d9a94),
    rock('boulder_a', 4, (3.2, 2.7, 2.4), 0.45, 0.8, 0xa29d94, 4), rock('boulder_b', 9, (2.4, 2.8, 1.9), 0.5, 0.5, 0xb0a79a, 4),
    shrub('shrub_a', 1, 1.0), shrub('shrub_b', 4, 0.8, True, 0x6aa357),
    blade_mesh('grass_tuft', 1, 9, 0.55, 0.075, 0.16, 0.22, 0x3f8f3c, 0xb7dd6a),
    blade_mesh('grass_tall', 2, 12, 0.9, 0.09, 0.22, 0.32, 0x3a8a40, 0xa8d46a),
    blade_mesh('flower_tuft', 3, 6, 0.4, 0.07, 0.13, 0.18, 0x3f8f3c, 0xa6d466, flowers=(4, 0.045, (0xfff6e0, 0xffd54a, 0xf59bc4, 0xffffff))),
    clover('clover_patch', 1), brush_pile('brush_pile', 2), mound('burrow_mound', 3), log('log_a', 1),
]
for o in objs: print(o.name, stats(o))
export(objs, os.path.join(ROOT, 'assets', 'models', 'flora.glb'))
if PREVIEW:
    for i, o in enumerate(objs): pass
    preview(objs, os.path.join(ROOT, 'playtest-shots', 'blender-flora.png'), ground=0x8fb86a, cols=7, spacing=7.5, cam_dist=48)
