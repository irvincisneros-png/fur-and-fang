# Shared helpers for DeepSwell's cosy-style model sets (run inside Blender: see tools/blender/build_sets.py).
# Style rules: chunky rounded shapes, matte, pastel vertex colours, soft gradients toward growing tips/edges.
# Axes: Blender +Z up, +X forward; glTF export converts to three.js (+Y up). Units: metres, base at z = 0.
import bpy, bmesh, math, random
from mathutils import Vector, noise, Color

# ---------------------------------------------------------------- scene / colour utilities
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def srgb(h):
    return tuple(((h >> s) & 255) / 255 for s in (16, 8, 0))

def lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def vcolor(obj, fn):
    """Point colour attribute 'Col' from fn(co, normal) -> sRGB tuple."""
    me = obj.data
    for a in list(me.color_attributes): me.color_attributes.remove(a)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        c = fn(v.co, v.normal)
        a = c[3] if len(c) > 3 else 1.0          # alpha = fur mask (1 = tinted by the instance fur colour)
        r, g, b = lin(c[:3])
        attr.data[v.index].color = (r, g, b, a)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = 0

def vcolor_faces(obj, fn):
    """Colour per face (face-corner domain, from the face centre): crisp panel and stripe edges."""
    me = obj.data
    for a in list(me.color_attributes): me.color_attributes.remove(a)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        r, g, b = lin(fn(poly.center, poly.normal))
        for li in poly.loop_indices: attr.data[li].color = (r, g, b, 1.0)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = 0

_mat = None
def vc_material():
    global _mat
    try:
        if _mat and _mat.name in bpy.data.materials: return _mat
    except ReferenceError:  # removed when the scene was reset for the next site
        pass
    m = bpy.data.materials.new('VC')
    nt = m.node_tree if m.node_tree else None
    if nt is None:
        m.use_nodes = True; nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    _mat = m
    return m

AO_STRENGTH = 0.8

def bake_ao(obj, strength=None):
    """Bake ambient occlusion (Cycles) into the vertex colours: crevices, branch forks, undersides and the contact
    with the ground darken softly. A temporary ground plane under the model gives the base its contact shadow."""
    strength = AO_STRENGTH if strength is None else strength
    if strength <= 0 or not obj.data.color_attributes.get('Col'): return obj
    sc = bpy.context.scene
    others = [o for o in sc.objects if o is not obj and o.type == 'MESH']
    for o in others: o.hide_render = True
    zmin = min(v.co.z for v in obj.data.vertices)
    bpy.ops.mesh.primitive_plane_add(size=50, location=(0, 0, zmin - 0.002)); ground = bpy.context.active_object
    if sc.world is None: sc.world = bpy.data.worlds.new('bakeworld')
    size = max(obj.dimensions) or 1
    sc.world.light_settings.distance = max(0.05, size * 0.35)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 20; sc.cycles.device = 'CPU'
    me = obj.data
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    col = me.color_attributes['Col']
    if col.domain == 'CORNER':
        for loop in me.loops:
            k = 1 - strength * (1 - ao.data[loop.vertex_index].color[0])
            c = col.data[loop.index].color
            col.data[loop.index].color = (c[0] * k, c[1] * k, c[2] * k, c[3])
    else:
        for i in range(len(col.data)):
            k = 1 - strength * (1 - ao.data[i].color[0])
            c = col.data[i].color
            col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, c[3])
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['Col']
    bpy.data.objects.remove(ground)
    for o in others: o.hide_render = False
    return obj

def finish(obj, name, ao=None):
    obj.name = name; obj.data.name = name
    for p in obj.data.polygons: p.use_smooth = True
    obj.data.materials.clear(); obj.data.materials.append(vc_material())
    bake_ao(obj, ao)
    return obj

def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj

def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def decimate(obj, ratio):
    if ratio >= 1: return
    d = obj.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio; apply_all(obj)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name
    return o

def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)

def budget(obj, max_tris):
    """Decimate down to roughly max_tris triangles."""
    t = tris(obj)
    if t > max_tris: decimate(obj, max_tris / t)
    return obj

def remove_islands(obj, keep_ratio=0.04):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    seen, groups = set(), []
    for v in bm.verts:
        if v.index in seen: continue
        stack, g = [v], []
        seen.add(v.index)
        while stack:
            a = stack.pop(); g.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); stack.append(b)
        groups.append(g)
    n = len(bm.verts)
    bmesh.ops.delete(bm, geom=[v for g in groups if len(g) < n * keep_ratio for v in g], context='VERTS')
    bm.to_mesh(obj.data); bm.free()

def metaball_mesh(name, elems, resolution=0.04, threshold=0.5):
    """elems: list of (co, radius) -> one smooth blobby mesh."""
    mb = bpy.data.metaballs.new(name + '_mb'); mb.resolution = resolution; mb.render_resolution = resolution; mb.threshold = threshold
    o = link(bpy.data.objects.new(name + '_mbo', mb))
    for el in elems:
        co, r = el[0], el[1]
        e = mb.elements.new(); e.co = co; e.radius = r
        if len(el) > 2:   # (co, r, (sx, sy, sz)) -> ellipsoid
            e.type = 'ELLIPSOID'; e.size_x, e.size_y, e.size_z = el[2]
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    m = bpy.context.view_layer.objects.active
    for ob in list(bpy.data.objects):
        if ob.type == 'META': bpy.data.objects.remove(ob)
    remove_islands(m)
    return m

def mesh_from_bm(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me))

def tube(a, b, r0, r1, verts=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o

# ---------------------------------------------------------------- export and review render
def export(objs, path):
    for o in objs: o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0); o.scale = (1, 1, 1)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_materials='NONE', export_yup=True)
    try: bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
    except TypeError: bpy.ops.export_scene.gltf(**kw, export_colors=True)
    print('EXPORTED', path, {o.name: tris(o) for o in objs})

def preview(objs, path, ground=0xead7ad, sky=0x9fd8e8, cols=5, spacing=1.6, cam_dist=None):
    """Grid layout + EEVEE review render (game-like 3/4 view)."""
    n = len(objs)
    rows = (n + cols - 1) // cols
    for i, o in enumerate(objs):
        o.location = ((i % cols - (cols - 1) / 2) * spacing, (rows - 1 - i // cols - (rows - 1) / 2) * spacing, 0)
    sc = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.01)); g = bpy.context.active_object
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin(srgb(ground)), 1)
    g.data.materials.append(gm)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin(srgb(sky)), 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5; sun.angle = math.radians(12)
    so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = (math.radians(40), math.radians(15), math.radians(30))
    cam = bpy.data.cameras.new('cam'); cam.lens = 35
    co = link(bpy.data.objects.new('cam', cam)); sc.camera = co
    span = max(cols, rows) * spacing
    dist = cam_dist or span * 0.95
    co.location = (0, -dist * 1.05, dist * 0.75); co.rotation_euler = (math.radians(55), 0, 0)
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try: sc.render.engine = eng; break
        except TypeError: pass
    sc.render.resolution_x, sc.render.resolution_y = 1400, 800
    vts = [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items]
    sc.view_settings.view_transform = 'AgX' if 'AgX' in vts else 'Standard'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for ob in (g, so, co): bpy.data.objects.remove(ob)

# ---------------------------------------------------------------- Fur & Fang additions
def ellipsoid(c, r, s=(1, 1, 1), seg=14, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(6, seg // 2), radius=r, location=c)
    o = bpy.context.active_object; o.scale = s; o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o

def tilt_toward(o, pivot, rot):
    """Rotate mesh data about a pivot (euler rot) in place."""
    from mathutils import Euler
    R = Euler(rot).to_matrix()
    p = Vector(pivot)
    for v in o.data.vertices: v.co = R @ (v.co - p) + p
    o.data.update()
    return o

def stats(o):
    zs = [v.co.z for v in o.data.vertices]; xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]
    return 'tris=%d  x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]' % (tris(o), min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
