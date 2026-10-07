import { useStore } from '../app/store'

/** Immediate "Projeto Original × Opção do Cliente" switch (only when there are changes). */
export function CompareBadge() {
  const changes = useStore((s) => Object.keys(s.clientConfig).length)
  const showOriginal = useStore((s) => s.showOriginal)
  const active = useStore((s) => s.activeOption)
  const set = useStore((s) => s.set)
  if (!changes) return null
  return (
    <div className="compare" role="group" aria-label="Comparação">
      <button className={showOriginal ? 'is-active' : ''} onClick={() => set({ showOriginal: true })}>
        Projeto Original
      </button>
      <button className={!showOriginal ? 'is-active' : ''} onClick={() => set({ showOriginal: false })}>
        {active ? `Opção 0${active}` : 'Opção do Cliente'}
      </button>
    </div>
  )
}
