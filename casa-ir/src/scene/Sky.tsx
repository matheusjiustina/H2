import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { lightState } from './Lighting'

/** Background sky dome with a smooth day/night blend and soft fog. */
export function Sky() {
  const { scene } = useThree()
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uNight: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `uniform float uNight; varying vec3 vP;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
          void main(){
            float h = clamp(vP.y, -0.2, 1.0);
            vec3 dTop = vec3(0.16,0.36,0.72);
            vec3 dHor = vec3(0.58,0.71,0.86);
            vec3 nTop = vec3(0.012,0.02,0.045);
            vec3 nHor = vec3(0.07,0.085,0.13);
            vec3 day = mix(dHor, dTop, pow(max(h,0.0), 0.7));
            vec3 nig = mix(nHor, nTop, pow(max(h,0.0), 0.5));
            vec3 sunDir = normalize(vec3(-0.64, 0.67, -0.37));
            float sd = max(dot(vP, sunDir), 0.0);
            day += vec3(1.0,0.92,0.78) * (pow(sd, 600.0)*6.0 + pow(sd, 12.0)*0.12);
            float star = step(0.9985, hash(floor(vP*420.0))) * smoothstep(0.05, 0.4, h);
            nig += vec3(star) * 0.8;
            vec3 c = mix(day, nig, uNight);
            if (vP.y < 0.0) c = mix(c, c*0.7, clamp(-vP.y*4.0,0.0,1.0));
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  const fog = useMemo(() => new THREE.Fog('#d3dfe8', 140, 520), [])
  useMemo(() => {
    scene.fog = fog
  }, [scene, fog])
  useFrame(() => {
    const n = lightState.night
    mat.uniforms.uNight.value = n
    fog.color.setRGB(THREE.MathUtils.lerp(0.83, 0.05, n), THREE.MathUtils.lerp(0.87, 0.06, n), THREE.MathUtils.lerp(0.91, 0.1, n))
  })
  return (
    <mesh material={mat} scale={900} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  )
}
