// Heat-shimmer + warm grade: only used while the valley is hot (the scene renders to a MSAA target, then a refracting quad).
import * as THREE from 'three';

export function createPost(renderer) {
  let rt = null;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scn = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uHeat: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uHeat; varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  float amp = 0.0042*uHeat*(0.3 + 0.7*smoothstep(0.95, 0.25, uv.y));
  uv.x += sin(uv.y*95.0 + uTime*2.3 + sin(uv.x*13.0 + uTime*0.8)*1.7)*amp;
  uv.y += sin(uv.x*70.0 + uTime*1.9)*amp*0.45;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.9), uHeat);
  c = mix(c, vec3(1.0, 0.93, 0.78), uHeat*0.07*smoothstep(0.75, 0.45, vUv.y));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
  });
  scn.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return {
    resize(w, h) {
      if (rt) rt.dispose();
      rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    },
    render(scene, camera, time, heat) {
      if (!rt) return false;
      mat.uniforms.tDiffuse.value = rt.texture; mat.uniforms.uTime.value = time; mat.uniforms.uHeat.value = heat;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(scn, cam);
      return true;
    },
    dispose() { if (rt) rt.dispose(); mat.dispose(); },
  };
}
