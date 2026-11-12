// The painted look, shared by every lit material: vertex colours + (optional) per-instance fur colour, world-space brush
// mottling, lighter tops / darker undersides, seasonal tint, snow caps by `snow`, frost / fade (dither) per instance.
import * as THREE from 'three';

export const U = {
  uSnow: { value: 0 }, uTemp: { value: 0 }, uDry: { value: 0 }, uTime: { value: 0 },
  uSnowCol: { value: new THREE.Color(0xf3f8ff) }, uOutScale: { value: 1 },
};

export const NOISE_GLSL = /* glsl */`
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
float snowCover(vec2 xz, float ny, float wet){
  float n = fbm(xz*0.075 + 11.0);
  float s = uSnow*1.3 + (n-0.5)*0.78*(1.0-0.5*uSnow) + (ny-0.85)*0.55 - wet*0.4;
  return smoothstep(0.52, 0.6, s);
}
`;
const DITHER = 'float ditherT(){ return fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }';

const HEAD = /* glsl */`uniform float uSnow; uniform float uTemp; uniform float uDry; uniform float uTime; uniform vec3 uSnowCol; uniform float uOutScale;`;

/** o: {fur, fx, fade, foliage, snowCaps, grass, flower, double} */
export function paintMaterial(o = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const defs = ['#define PAINT'];
    for (const k of ['fur', 'fx', 'foliage', 'snowCaps', 'grass', 'flower']) if (o[k]) defs.push('#define P_' + k.toUpperCase());
    sh.vertexShader = defs.join('\n') + '\n' + sh.vertexShader
      .replace('#include <common>', `#include <common>
${HEAD}
${NOISE_GLSL}
attribute float aMask; varying vec3 vWP; varying float vNY; varying float vMask; varying float vCov;
#ifdef P_FUR
attribute vec3 aFur; varying vec3 vFur;
#endif
#ifdef P_FX
attribute vec4 aFx; varying vec4 vFx;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vCov = 0.0;
#if defined(P_GRASS) || defined(P_FLOWER)
{
  #ifdef USE_INSTANCING
  vec3 iw = (modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
  #else
  vec3 iw = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
  #endif
  float cov = snowCover(iw.xz, 1.0, 0.0); vCov = cov;
  #ifdef P_FLOWER
  transformed *= clamp(1.0 - uDry*1.7 - cov*1.6, 0.0, 1.0);
  #else
  transformed.y *= 1.0 - 0.5*cov; transformed.xz *= 1.0 - 0.15*uDry;
  #endif
}
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0); vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
  wp4 = instanceMatrix*wp4; wn = mat3(instanceMatrix)*wn;
  #endif
  wp4 = modelMatrix*wp4; vWP = wp4.xyz; vNY = normalize(mat3(modelMatrix)*wn).y;
  vMask = aMask;
  #ifdef P_FUR
  vFur = aFur;
  #endif
  #ifdef P_FX
  vFx = aFx;
  #endif
}`);
    sh.fragmentShader = defs.join('\n') + '\n' + sh.fragmentShader
      .replace('#include <common>', `#include <common>
${HEAD}
${NOISE_GLSL}
${DITHER}
varying vec3 vWP; varying float vNY; varying float vMask; varying float vCov;
#ifdef P_FUR
varying vec3 vFur;
#endif
#ifdef P_FX
varying vec4 vFx;
#endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  #ifdef P_FX
  if (vFx.x < 0.999 && vFx.x < ditherT()) discard;
  #endif
  vec3 base = diffuseColor.rgb;
  #ifdef P_FUR
  base = mix(base, base*vFur, vMask);
  #endif
  float pn = fbm(vWP.xz*0.55 + vWP.y*0.7);
  base *= 0.9 + 0.2*pn;
  base *= 0.88 + 0.16*vNY;
  #ifdef P_FOLIAGE
  float gr = clamp((base.g - max(base.r, base.b))*7.0, 0.0, 1.0);
  base = mix(base, base*vec3(1.35, 1.0, 0.5) + vec3(0.04, 0.025, 0.0), gr*uDry*0.6);
  base = mix(base, base*vec3(0.82, 0.94, 1.12), gr*clamp(-uTemp, 0.0, 1.0)*0.55);
  #endif
  #ifdef P_SNOWCAPS
  float thr = 1.0 - uSnow*0.95;
  float cap = smoothstep(thr - 0.14, thr + 0.04, vNY + (fbm(vWP.xz*1.4 + vWP.y*0.9) - 0.5)*0.4) * smoothstep(0.04, 0.22, uSnow);
  base = mix(base, uSnowCol*(0.86 + 0.14*vNY), cap);
  #endif
  #ifdef P_GRASS
  base = mix(base, base*vec3(1.5, 1.15, 0.55) + vec3(0.08, 0.05, 0.0), uDry*0.85);
  base = mix(base, uSnowCol*0.92, vCov*0.75);
  #endif
  #ifdef P_FX
  base = mix(base, vec3(0.72, 0.9, 1.0), vFx.y*0.72);
  base = mix(base, vec3(dot(base, vec3(0.33))), vFx.z*0.6);
  base = mix(base, base*vec3(1.35, 0.82, 0.62), vFx.w*0.55);
  #endif
  diffuseColor.rgb = base;
}`);
  };
  m.customProgramCacheKey = () => 'paint' + JSON.stringify(o);
  return m;
}

/** Inverted-hull outline: back faces pushed along the normal by a distance-scaled width. */
export function outlineMaterial(o = {}) {
  const m = new THREE.MeshBasicMaterial({ color: o.color ?? 0x1d3436, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uOutScale;
${o.fx ? 'attribute vec4 aFx; varying vec4 vFx;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float sc = 1.0; vec4 q = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  sc = length(instanceMatrix[0].xyz); q = instanceMatrix*q;
  #endif
  q = modelMatrix*q;
  float d = distance(q.xyz, cameraPosition);
  float w = clamp(d*0.0025, 0.012, 0.055)*uOutScale/max(sc, 0.08);
  transformed += normalize(normal)*w;
  ${o.fx ? 'vFx = aFx;' : ''}
}`);
    if (o.fx) sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vFx;
float ditherT(){ return fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vFx.x < 0.999 && vFx.x < ditherT()) discard;`);
  };
  m.customProgramCacheKey = () => 'outline' + JSON.stringify(o);
  return m;
}
