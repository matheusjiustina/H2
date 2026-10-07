/**
 * OPÇÕES — save up to three finish combinations (OPÇÃO 01/02/03), compare
 * with the original project, export / import as JSON. Geometry never changes:
 * only the configuration map (slot → finish) is stored.
 */
import { useRef } from 'react'
import { useStore } from '../app/store'
import { parseConfig, serializeConfig } from '../data/configuration'
import { IconClose } from './icons'

export function OptionsPanel() {
  const set = useStore((s) => s.set)
  const options = useStore((s) => s.options)
  const active = useStore((s) => s.activeOption)
  const clientConfig = useStore((s) => s.clientConfig)
  const showOriginal = useStore((s) => s.showOriginal)
  const saveOption = useStore((s) => s.saveOption)
  const loadOption = useStore((s) => s.loadOption)
  const clearOption = useStore((s) => s.clearOption)
  const notify = useStore((s) => s.notify)
  const fileRef = useRef<HTMLInputElement>(null)
  const changes = Object.keys(clientConfig).length

  const exportJson = () => {
    const name = active ? `Opção 0${active}` : 'Configuração do cliente'
    const blob = new Blob([serializeConfig(clientConfig, name)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `CASA-IR_${active ? `opcao-0${active}` : 'configuracao'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (f: File) => {
    const cfg = parseConfig(await f.text())
    if (!cfg) return notify('Arquivo inválido')
    set({ clientConfig: cfg, showOriginal: false, activeOption: null })
    notify('Configuração importada')
  }

  return (
    <aside className="panel" aria-label="Opções">
      <div className="panel__head">
        <div>
          <div className="eyebrow">Comparar e salvar</div>
          <h2>Opções</h2>
        </div>
        <button className="icon-btn" onClick={() => set({ panel: null })} aria-label="Fechar">
          <IconClose />
        </button>
      </div>
      <div className="panel__body">
        <div className="seg seg--big">
          <button className={showOriginal ? 'is-active' : ''} onClick={() => set({ showOriginal: true })}>
            Projeto Original
          </button>
          <button className={!showOriginal ? 'is-active' : ''} onClick={() => set({ showOriginal: false })}>
            Opção do Cliente
          </button>
        </div>
        <p className="status">{changes ? `${changes} acabamento(s) alterado(s) na opção atual.` : 'A opção atual é idêntica ao projeto original.'}</p>
        {([1, 2, 3] as const).map((n) => {
          const o = options[n]
          return (
            <div key={n} className={`option${active === n ? ' is-active' : ''}`}>
              <div className="option__title">
                Opção 0{n}
                <small>{o ? `${Object.keys(o.config).length} alteração(ões) · ${new Date(o.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'vazia'}</small>
              </div>
              <div className="option__actions">
                <button className="btn btn--sm" onClick={() => saveOption(n)}>
                  Salvar
                </button>
                <button className="btn btn--sm btn--ghost" disabled={!o} onClick={() => loadOption(n)}>
                  Carregar
                </button>
                <button className="btn btn--sm btn--ghost" disabled={!o} onClick={() => clearOption(n)} aria-label={`Limpar opção 0${n}`}>
                  Limpar
                </button>
              </div>
            </div>
          )
        })}
        <div className="row">
          <button className="btn btn--ghost" onClick={exportJson}>
            Exportar JSON
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Importar JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        <p className="hint">As opções ficam salvas neste navegador. Use “Exportar JSON” para enviar a combinação ao arquiteto junto com a imagem capturada.</p>
      </div>
    </aside>
  )
}
