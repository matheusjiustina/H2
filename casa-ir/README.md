# CASA I|R — Visualização Arquitetônica Interativa 3D

Experiência 3D em tempo real (navegador) para o cliente percorrer a CASA I|R
antes da obra: fachadas, pátio interno, piscina, todos os ambientes internos,
passeio em primeira pessoa e configurador de acabamentos com
**“Restaurar projeto original”**.

Reconstruída a partir de dois documentos do escritório A2 Studio:

| Fonte | Uso |
|---|---|
| `APRESENTAÇÃO ARQUITETÔNICO - ROSE E ITAGIBA_REV00.pdf` (17 p.) | geometria, implantação, paredes, aberturas, volumes, piscina, paisagismo, materiais externos |
| `APRESENTAÇÃO DE INTERIORES - ROSE E ITAGIBA_REV00.pdf` (63 p.) | layout interno, mobiliário, marcenaria, acabamentos, iluminação |

A auditoria página-a-página, as dimensões extraídas, a reconciliação entre os
dois PDFs e todas as suposições estão em **[`docs/PDF_AUDIT.md`](docs/PDF_AUDIT.md)**.

## Rodar

```bash
cd casa-ir
npm install
npm run dev        # http://localhost:5173
npm run build      # build de produção em dist/ (estático, pode ser hospedado em qualquer CDN)
npm run preview
```

Parâmetros de URL úteis:

* `?q=high|medium|low` — força a qualidade (padrão: automática)
* `?dev` — modo desenvolvedor (FPS, draw calls, posição da câmera). Nunca visível ao cliente sem o parâmetro.

## Controles

| | Desktop | Celular / tablet |
|---|---|---|
| Vista livre (exterior) | arrastar = girar · botão direito = deslocar · roda = zoom | 1 dedo = girar · 2 dedos = zoom/deslocar |
| Vistas de ambiente | arrastar = olhar ao redor | arrastar = olhar ao redor |
| Passeio | clique para capturar o mouse · W A S D / setas · Shift acelera · Esc libera | joystick à esquerda · arrastar para olhar |
| Personalizar | clique em um objeto | toque em um objeto |

## Arquitetura do código

```
src/
  app/           App (Canvas + carregamento) e store (Zustand)
  data/          FONTE ÚNICA DE DADOS
    houseSpec.ts   cotas, ambientes, paredes + aberturas, volumes, alturas, sol
    site.ts        polígonos do terreno (piscina, praia, deck, gramados) + paisagismo
    materials.ts   catálogo de acabamentos (FINISHES) e slots de material (SLOTS)
    configuration.ts objetos selecionáveis, ORIGINAL_PROJECT, (de)serialização JSON
    cameras.ts     vistas curadas (equivalentes às imagens dos PDFs)
  architecture/  GeoBuilder (geometria mesclada por material), construtor da casa
  materials/     texturas procedurais (canvas) e biblioteca de materiais em tempo real
  furniture/     mobiliário procedural (assentos, mesas, luminárias, louças, plantas…)
  rooms/         um componente por ambiente, com cabeçalho de rastreabilidade
  scene/         Scene, House, Exterior, Interior, Pool, Landscaping, Lighting, Sky, Site
  controls/      câmera orbital/presets, passeio com colisão, colisores
  configurator/  seleção (picking) e destaque
  ui/            interface em português
  utils/         captura de imagem em alta resolução
```

### Princípios

* **Geometria 100 % 3D** — nenhuma imagem dos PDFs é usada como fachada.
* **Um mesh por slot de material**: arquitetura e mobiliário são mesclados por
  material (poucas draw calls) e móveis repetidos usam instancing.
* **Slots de material**: a geometria referencia slots (`sofa_tv_fabric`,
  `cabinet_kitchen`, `external_facade_primary`…). Trocar um acabamento altera
  o material do slot *in place* — só os objetos ligados àquele slot mudam.
* **ORIGINAL_PROJECT** = todos os slots no acabamento padrão definido a partir
  dos PDFs. A configuração do cliente é apenas um mapa `slot → acabamento`,
  serializável em JSON; a arquitetura nunca muda entre opções.
* **Luzes**: “pool” de luzes pontuais de tamanho fixo reatribuídas às âncoras
  de iluminação mais próximas da câmera (sem recompilação de shaders).

## Como corrigir uma dimensão

Todas as medidas estão em metros em `src/data/houseSpec.ts`
(origem = canto noroeste do lote; X → rua, Z → sul):

* parede: edite o retângulo `r: [x1, z1, x2, z2]` em `WALLS`;
* porta/janela: edite `{ a, b, sill, top, kind }` (coordenadas absolutas ao longo da parede);
* ambiente: edite `rects` em `ROOMS` (piso, forro e materiais acompanham);
* alturas globais: `HEIGHTS`.

Cada ambiente em `src/rooms/*.tsx` cita as páginas dos PDFs que o originaram.
