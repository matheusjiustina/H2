import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { lightState, SKY_GLSL, skyUniforms, syncSkyUniforms } from './timeOfDay'

/** Background sky dome (day / golden hour / night) + very light aerial haze. */
export function Sky() {
  const { scene } = useThree()
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: skyUniforms(),
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `${SKY_GLSL}
          varying vec3 vP;
          void main(){
            vec3 d = normalize(vP);
            vec3 c = skyColor(d, 6.0);
            float star = step(0.9986, hash13(floor(d*420.0))) * smoothstep(0.05, 0.4, d.y) * uNight;
            c += vec3(star) * 0.7;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  const fog = useMemo(() => new THREE.Fog('#d3dfe8', 160, 560), [])
  useMemo(() => {
    scene.fog = fog
  }, [scene, fog])
  const cols = useMemo(() => ({ day: new THREE.Color('#cdd9e3'), set: new THREE.Color('#d8b9a0'), nig: new THREE.Color('#0d1119') }), [])
  const tmpC = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    syncSkyUniforms(mat.uniforms as ReturnType<typeof skyUniforms>)
    fog.color.copy(cols.day).multiplyScalar(lightState.day).add(tmpC.copy(cols.set).multiplyScalar(lightState.sunset)).add(tmpC.copy(cols.nig).multiplyScalar(lightState.night))
  })
  return (
    <mesh material={mat} scale={900} frustumCulled={false} renderOrder={-10} userData={{ noPick: true }}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  )
}
