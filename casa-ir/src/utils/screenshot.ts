/**
 * "CAPTURAR IMAGEM" — NORMAL or ALTA QUALIDADE.
 * High quality temporarily raises the render resolution (up to 4K wide),
 * the shadow-map size and the AO/MSAA sampling, then restores everything.
 * The UI and the selection highlight are hidden; camera, finishes and the
 * time of day are kept exactly as on screen.
 */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useStore } from '../app/store'
import { renderState } from '../scene/renderState'

type CaptureFn = (hq: boolean) => Promise<void>
let captureImpl: CaptureFn | null = null

export function captureImage(hq = false) {
  return captureImpl ? captureImpl(hq) : Promise.resolve()
}

const frames = (n: number) => new Promise<void>((r) => {
  const step = (k: number) => (k <= 0 ? r() : requestAnimationFrame(() => step(k - 1)))
  step(n)
})

export function CaptureBridge() {
  const { gl, size, setDpr } = useThree()
  useEffect(() => {
    captureImpl = async (hq) => {
      const st = useStore.getState()
      st.notify(hq ? 'Gerando imagem em alta qualidade…' : 'Capturando imagem…')
      useStore.setState({ capturing: true, captureHQ: hq })
      const prev = gl.getPixelRatio()
      const target = hq ? Math.min(3840 / size.width, 4096 / size.height, 3) : Math.max(prev, Math.min(2, 2560 / size.width))
      setDpr(target)
      await frames(hq ? 8 : 3)
      const url = await new Promise<string>((res) => {
        renderState.capture = res
      })
      setDpr(prev)
      useStore.setState({ capturing: false, captureHQ: false })
      const s = useStore.getState()
      const label = s.showOriginal ? 'projeto-original' : s.activeOption ? `opcao-0${s.activeOption}` : Object.keys(s.clientConfig).length ? 'personalizado' : 'projeto-original'
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const a = document.createElement('a')
      a.href = url
      a.download = `CASA-IR_${s.time}_${label}${hq ? '_HQ' : ''}_${stamp}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      s.notify('Imagem capturada')
    }
    return () => {
      captureImpl = null
    }
  }, [gl, size, setDpr])
  return null
}
