import { useStore } from '../app/store'

export function Loading() {
  const progress = useStore((s) => s.progress)
  const label = useStore((s) => s.progressLabel)
  return (
    <div className="loading">
      <div className="loading__inner">
        <div className="loading__brand">
          CASA <span>I|R</span>
        </div>
        <div className="loading__text">Carregando experiência 3D...</div>
        <div className="loading__bar">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="loading__meta">
          {label} · {Math.round(progress * 100)}%
        </div>
      </div>
    </div>
  )
}
