# CASA I|R — Auditoria dos PDFs (PDF_AUDIT)

Fontes analisadas, página por página:

| Sigla | Documento | Páginas |
|---|---|---|
| **ARQ** | `APRESENTAÇÃO ARQUITETÔNICO - ROSE E ITAGIBA_REV00.pdf` (A2 Studio) | 17 |
| **INT** | `APRESENTAÇÃO DE INTERIORES - ROSE E ITAGIBA_REV00.pdf` (A2 Studio) | 63 |

Regra de precedência adotada (conforme briefing):

* **ARQ é a fonte primária** para lote, implantação, paredes, aberturas, volumes, alturas, piscina, deck, paisagismo e materiais externos.
* **INT é a fonte primária** para layout interno, mobiliário, marcenaria, acabamentos, iluminação e decoração.
* Quando INT e ARQ divergem quanto a **paredes/aberturas**, prevalece ARQ e o layout de interiores é adaptado (divergências listadas na seção 5).

Todas as coordenadas abaixo estão em **metros**, no sistema da aplicação:
`X` = leste (→ rua), `Z` = sul (↓ na planta), `Y` = altura. Origem = canto noroeste (superior‑esquerdo) do lote na planta baixa ARQ p.2. O norte da planta (topo) é assumido como norte real; não há indicação de norte no PDF (ver suposição A‑01).

---

## 1. Método de extração dimensional

1. A planta baixa ARQ p.2 foi extraída do PDF na resolução nativa (imagem 2581×1172 px).
2. Calibração pelas cotas externas do lote: **40,00 m** (cota “4.000”) = 2331 px → **58,27 px/m**; **18,00 m** (cota “1.800”) = 1048 px → **58,22 px/m**. Escala isotrópica confirmada.
3. As linhas de parede (pretas) foram detectadas por varredura de pixels (runs verticais/horizontais ≥ 40 px). Cada coordenada de parede foi convertida para metros e **conferida contra as cotas internas em vermelho** (350, 160, 280, 360, 160, 350, 475, 110, 535, 540, 430, 260, 400, 90, 350, 325, 285, 160, 795, 505, 500, 250, 385, 105, 670, 650, 150). Todas fecham com erro ≤ 3 cm.
4. As áreas (piscina, praia de areia, deck, gramados, jardim central) foram extraídas por **segmentação de cor** da planta e vetorizadas (Douglas‑Peucker, tolerância ≈ 4 cm). Resultado em `src/data/site.ts`.
5. As plantas de interiores (INT p.4, 12, 18, 29, 34, 40, 44) foram escaladas pelas mesmas cotas de ambiente e giradas para a orientação ARQ (cada uma está em uma orientação diferente — ver tabela 5).

Todas as dimensões ficam centralizadas em `src/data/houseSpec.ts` para correção futura.

---

## 2. Dimensões extraídas (planta ARQ p.2)

### 2.1 Lote e implantação
| Elemento | Valor | Fonte |
|---|---|---|
| Lote | 40,00 × 18,00 m | ARQ p.2 cotas 4.000 / 1.800 |
| Muros de divisa | 0,15 m (cotas “15”) | ARQ p.2 |
| Recuo frontal (gramado/garagem até a rua) | 4,00 m (x 36,0→40,0) | ARQ p.2 cota “400” |
| Faixa lateral sul (brita) | 1,50 m (z 16,35→17,85) | ARQ p.2 cota “150” |
| Faixa lateral norte (brita + grama) | 1,50 m (z 0,15→1,65) | ARQ p.2 cota “150” |
| Bloco íntimo (suítes) | x 17,70→35,35 · z 1,65→6,70 | ARQ p.2 cotas 113+1050+592 / 1765 / 475 |
| Bloco de serviço/social | x 4,67→29,36 · z 11,00→16,35 | ARQ p.2 cotas 450 / 2470 / 505 |
| Sala (Sala de TV) | x 27,87→33,26 · z 6,85→11,00 (5,40 × 4,30 = 23,22 m²) | ARQ p.2 |
| Hall de entrada (varanda) | x 33,41→36,00 · z 6,70→11,15 (2,60 × 4,45 = 11,57 m²) | ARQ p.2 |
| Garagem | x 29,50→36,00 · z 11,14→17,84 (6,50 × 6,70 = 43,55 m²) | ARQ p.2 |

### 2.2 Ambientes (dimensões internas)
| Ambiente | X (m) | Z (m) | Dim. | Área PDF |
|---|---|---|---|---|
| Suíte (dormitório master) | 17,86–21,37 | 1,80–6,55 | 3,50 × 4,75 | 15,94 m² |
| Banho suíte | 21,50–23,10 | 1,80–3,90 | 1,60 × 2,10 | 3,36 m² |
| Closet | 23,25–26,05 (+21,50–23,25 abaixo do banho) | 1,80–6,55 | 2,80 × 4,55 + 1,60 × 2,45 | 17,42 m² |
| Quarto 02 | 26,21–29,81 | 1,80–5,30 | 3,60 × 3,50 | 12,6 m² |
| Banheiro social | 29,96–31,56 | 1,80–5,30 | 1,60 × 3,50 | 5,6 m² |
| Quarto 01 | 31,72–35,22 | 1,80–6,55 | 3,50 × 4,75 | 16,63 m² |
| Circulação íntima | 26,21–31,56 | 5,45–6,55 | 5,35 × 1,10 | 5,89 m² |
| Sala (de TV) | 27,87–33,26 | 6,85–11,00 | 5,40 × 4,30 | 23,22 m² |
| Hall | 33,41–36,00 | 6,70–11,15 | 2,60 × 4,45 | 11,57 m² |
| Sala de Jogos/Escritório | 4,82–8,31 | 11,14–15,14 | 3,50 × 4,00 | 14 m² |
| Depósito | 4,82–8,31 | 15,29–16,19 | 3,50 × 0,90 | 3,15 m² |
| Despensa | 8,46–11,70 | 13,37–16,19 | 3,25 × 2,85 | 9,26 m² |
| Banheiro Externo | 11,86–13,45 | 13,37–16,19 | 1,60 × 2,85 | 4,56 m² |
| Área Gourmet | 13,61–21,55 | 11,14–16,19 | 7,95 × 5,05 | 40,15 m² |
| Cozinha | 21,71–26,70 | 11,14–16,19 | 5,00 × 5,05 | 25,25 m² |
| Circulação serviço | 26,86–29,36 | 11,14–12,19 | 2,50 × 1,05 | 2,63 m² |
| Lavanderia | 26,86–29,36 | 12,34–16,19 | 2,50 × 3,85 | 9,63 m² |
| Garagem | 29,50–36,00 | 11,14–17,84 | 6,50 × 6,70 | 43,55 m² |

### 2.3 Áreas externas (segmentação de cor ARQ p.2)
| Área | Resultado | Observação |
|---|---|---|
| Piscina (orgânica) | 52,2 m², x 1,30–11,77 · z 0,91–8,30 | contorno vetorizado (19 vértices) |
| Praia de areia | 57,7 m² | contorno vetorizado (44 vértices) |
| Deck de madeira (pátio em “L/T”) | 105,6 m² | inclui faixa até o chuveiro externo na divisa norte |
| Jardim Central | x 21,57–25,69 · z 7,83–9,88 (8,5 m²) | gramado + árvore (ARQ p.6) |
| Pérgola sobre o deck (linha tracejada) | x 8,30–17,85 · z 8,97–11,07 | ARQ p.2 tracejado; ARQ p.16 ripado |
| Gramado frontal | x 35,2–40,0 · z 0,17–11,13 | ARQ p.2 |
| Gramado lateral/fundos | x 0,19–4,67 · z 0,17–17,83 (em L) | ARQ p.2 “Grama” |
| Calçamento frontal (piso intertravado) | x 40–43 | ARQ p.2 / p.4 |
| Acesso de veículos (concreto) | x 36–40 · z 11,15–17,85 | ARQ p.2 / p.4 |
| Pisantes (3 placas) | x 36,05–39,6 · z 8,5–10,1 | ARQ p.2 / p.4 |

### 2.4 Alturas (deduzidas — **não há cortes/elevações cotadas nos PDFs**)
| Elemento | Valor adotado | Método |
|---|---|---|
| Pé‑direito ambientes | 2,80 m (forro) | proporção de portas 2,10 m nos renders INT |
| Platibanda dos blocos térreos | 3,70 m | ARQ p.11/12/15: ~1,3× altura da porta‑janela |
| Laje/marquise da garagem + hall | face inferior 3,25 m · topo 4,20 m | ARQ p.5: escala horizontal da fachada (16,2 m = 692 px) aplicada à vertical |
| Volume alto frontal (pórtico) | face inferior laje 5,90 m · topo 7,10 m | ARQ p.4/p.5/p.11 |
| Sala de TV (pé‑direito duplo) | forro 5,50 m | INT p.5‑p.9 (cortinas de piso a teto, ~2× porta pivotante) |
| Porta pivotante | 1,40 × 3,10 m | ARQ p.2 vão 1,39 m; ARQ p.5 133 px de altura |
| Caixa d’água (volume claro sobre despensa/banho externo) | topo 5,00 m | ARQ p.8/p.12/p.16 |
| Muros de divisa | 2,40 m | ARQ p.10/p.13 |
| Piscina | profundidade 1,40 m | padrão residencial (não cotado) |

---

## 3. Matriz de fontes — ARQUITETÔNICO

| PDF | Página | Ambiente / Área | Elementos arquitetônicos | Mobiliário | Materiais | Iluminação | Detalhes visuais importantes | Status 3D |
|---|---|---|---|---|---|---|---|---|
| ARQ | 1 | Capa | — | — | — | — | Logo A2 Studio, “CASA I\|R” | Usado na tela de carregamento (tipografia) |
| ARQ | 2 | **Planta baixa completa** | Todas as paredes, portas, janelas, cotas, áreas; tracejado da pérgola; pilares hachurados (chanfrados) nos pórticos | Mesas, cadeiras, camas, sofá, espreguiçadeiras, mesa com 4 cadeiras na praia, carros na garagem | Grama, brita, deck, areia, água | — | Pilares chanfrados: pórtico frontal (x 35,4–36,4 · z 1,6–3,3), pórtico da sala (x 27,3–27,7), pórtico da suíte (x 17,1–17,7 · z 5,4–7,0), pilar jogos (x 4,7–5,9 · z 10,3–11,0), pilares do hall (x 33,3–33,9) | **Implementado** – base dimensional de `houseSpec.ts` e `site.ts` |
| ARQ | 3 | Mood board “Leve · Moderna · Imponente” | — | — | Pedra seixo branca (fachada), madeira freijó, porcelanato cimentício cinza, pintura off‑white, pintura **cinza fendi/taupe**, esquadria grafite, vidro incolor, areia, água, pedra São Tomé/travertino bege | — | Palmeira imperial/real, folhagens tropicais | **Implementado** – biblioteca `materials.ts` (external_*) |
| ARQ | 4 | **Fachada frontal** (render fotográfico) | Marquise baixa sobre garagem + hall; volume alto com laje em balanço e **brise ripado** na extremidade; pórtico vertical à direita; pilar revestido em pedra; pele de vidro alta; porta pivotante ripada | 2 poltronas de fibra natural no hall | Pintura taupe, pedra seixo/fulget branca, forro de madeira sob as lajes, vidro | Fita LED embutida na laje alta; spots na marquise | Escada de placas de concreto no gramado; monstera/filodendros no canteiro | **Implementado** (`Exterior.tsx`, câmera `fachada_frontal`) |
| ARQ | 5 | Fachada frontal (vista frontal) | Mesmas massas, leitura frontal — usada para proporções horizontais (16,2 m = 692 px) | Carro na garagem, 2 poltronas | Pedra no fundo da garagem com balizadores | Spots no forro da marquise; uplights na pedra | Painel ripado vertical acima da marquise (janela alta da sala) | **Implementado** (câmera `fachada_frontal_02`) |
| ARQ | 6 | **Fachada pátio interno** | Corredor do pátio; pele de vidro de pé‑direito duplo da sala ao fundo; pérgola ripada com spots cilíndricos; caixilhos bronze/grafite | Vaso cerâmico | Deck de madeira, gramado do jardim central, paredes off‑white, pintura taupe | Spots cilíndricos pendentes na pérgola; balizadores de piso | Árvore (copa arredondada) no jardim central | **Implementado** (câmera `patio_interno`) |
| ARQ | 7 | **Fachada posterior** (render) | Pórtico taupe da suíte; volume alto ao fundo; beiral profundo + pérgola sobre gourmet | Mesa redonda de teca + 4 cadeiras, ombrelone branco, espreguiçadeiras duplas | Deck, areia, água turquesa | — | 2 palmeiras na praia; vegetação tropical na divisa | **Implementado** (câmera `fachada_posterior`) |
| ARQ | 8 | Fachada posterior (vista do bloco de serviço) | Portas de correr (gourmet), recuo com **parede de pedra seixo** e porta veneziana (despensa), poltrona suspensa; caixa d’água clara acima | Poltrona suspensa de fibra; 2 espreguiçadeiras | Pedra seixo, pintura taupe/off‑white, esquadria grafite | — | Pérgola ripada sobre o recuo | **Implementado** (câmera `fachada_posterior_02`) |
| ARQ | 9 | Fachada posterior (detalhe) | Idem p.8 aproximado: portas de correr com cortinas, porta veneziana dupla | Poltrona suspensa | Pedra seixo branca, deck | — | Praia de areia com borda orgânica | **Implementado** |
| ARQ | 10 | **Vista lago** | Muros de divisa cinza; parede com painel de pedra e **chuveiro externo** | Mesa redonda + 4 cadeiras teca, ombrelone, espreguiçadeiras | Areia, deck, pedras naturais na borda da piscina | — | 3 palmeiras; maciço de bananeiras/alocásias; pedras ao redor da piscina | **Implementado** (câmera `piscina`) |
| ARQ | 11 | 3D SketchUp — frontal/sul | Volumes reais do modelo; parede sul branca com janelas pequenas; muro | — | Taupe + off‑white | Fita LED na laje alta | Pedra no fundo e na lateral da garagem | **Implementado** – valida massas |
| ARQ | 12 | 3D SketchUp — sudoeste | Bloco de jogos/depósito taupe com janela e porta veneziana; caixa d’água clara; bloco de serviço branco | — | Taupe, off‑white | — | 3 árvores no jardim oeste; bananeiras | **Implementado** |
| ARQ | 13 | 3D SketchUp — aérea noroeste | Relação piscina × praia × deck × blocos; pérgola; pórtico da suíte | Espreguiçadeiras, ombrelone, mesa | — | Uplights no deck | Maciço tropical contínuo nas divisas norte e oeste | **Implementado** (câmera `vista_superior` aproximada) |
| ARQ | 14 | 3D SketchUp — pátio a partir da piscina | Pérgola com spots; pele de vidro alta da sala com pórtico taupe; portas de correr da gourmet; painel de pedra + chuveiro na divisa | Mesa, ombrelone, espreguiçadeiras | — | Uplights nos pilares do pórtico | Árvore no jardim central | **Implementado** |
| ARQ | 15 | 3D SketchUp — nordeste | Volume alto taupe cego na lateral norte com porta‑janela (Quarto 01) e janela basculante (banho social); bloco íntimo branco | — | — | — | Palmeira frontal; canteiro tropical | **Implementado** |
| ARQ | 16 | **Vista superior (cobertura)** | Lajes: bloco íntimo, volume alto (x 29,5–36,4 · z 1,5–14,5) com ripado sobre a garagem, volume claro da sala (x 27,9–29,7), cobertura de serviço, volume de jogos, caixa d’água, pérgola ripada | Ombrelone, espreguiçadeiras | — | — | Palmeiras; 3 árvores na divisa oeste; palmeira e arbustos no jardim frontal | **Implementado** (câmera `vista_superior`) |
| ARQ | 17 | Encerramento | — | — | — | — | — | n/a |

---

## 4. Matriz de fontes — INTERIORES

| PDF | Página | Ambiente / Área | Elementos arquitetônicos | Mobiliário | Materiais | Iluminação | Detalhes visuais importantes | Status 3D |
|---|---|---|---|---|---|---|---|---|
| INT | 1 | Capa | — | — | — | — | “CASA I R – Projeto de Interiores” | n/a |
| INT | 2 | Conceito | — | — | Madeira, pedras, tecidos com textura | “Iluminação cênica” | Atemporal · Sofisticado · Acolhedor · Bem‑estar; atmosfera de resort | Diretriz de toda a paleta |
| INT | 3 | Mood board – conceito | — | Vasos cerâmicos verdes, carrinho de bagagem | **Terrazzo bege**, **nogueira**, **travertino**, muxarabi de madeira, pedra seixo bege, louça branca | Nicho com LED | Gourmet com forro de madeira e pendentes de palha | Biblioteca de materiais |
| INT | 4 | **Planta – Sala de TV** (girada 90°; topo = oeste) | Vidro de piso a teto (oeste), porta pivotante (leste), portas nos cantos NO e SO | Sofá em L off‑white (parede norte), 2 poltronas terracota, 3 mesas laterais de madeira, rack longo (parede sul), tapete bege | Porcelanato bege grande formato | — | Planta (costela‑de‑adão/ficus) junto ao sofá | **Implementado** (`TvRoom.tsx`) |
| INT | 5 | Sala de TV – vista p/ oeste | **Pé‑direito duplo**, pele de vidro com caixilho bronze, cortinas linho + voil | Poltronas terracota, sofá chaise, mesa lateral pedestal nogueira | Parede norte com **textura de linho bege + blocos verticais de nogueira** em relevo; parede da TV grafite | Sanca com fita LED quente, spots, **cluster de pendentes de vidro âmbar (gota)** | Vista para árvore do pátio | **Implementado** – câmera `tv_view_01` |
| INT | 6 | Sala de TV – parede da TV (sul) | Painel grafite recuado emoldurado por **placas de travertino** com retroiluminação LED; porta lateral (circulação) | Rack suspenso nogueira com tampo travertino; poltronas | Travertino, grafite, nogueira | LED perimetral no painel, sanca | Faixa de forro cinza com spots junto à parede | **Implementado** – `tv_view_02` |
| INT | 7 | Sala de TV – parede norte | Porta no canto NO (para a circulação íntima), cassete de ar | Sofá modular off‑white, poltronas, mesas laterais | Parede de linho + 26 blocos de nogueira | Pendentes âmbar, sanca | Ficus lyrata em vaso | **Implementado** – `tv_view_03` |
| INT | 8 | Sala de TV – vista diagonal | Pele de vidro alta, forro grafite na faixa | idem | idem | idem | idem | **Implementado** – `tv_view_04` |
| INT | 9 | Sala de TV – vista p/ leste | Porta pivotante ripada grafite (≈3,1 m), janela alta com voil ao lado | Sofá, poltronas, rack | idem | idem | — | **Implementado** – `tv_view_05` |
| INT | 10 | Sala de TV – detalhe do rack | — | Rack: nicho grafite + gavetas nogueira com puxador couro/latão | **Travertino com furos** (tampo), nogueira | LED no painel | Livros, vaso de vidro, difusor | **Implementado** (geometria do rack) |
| INT | 11 | Sala de TV – detalhe poltrona | — | Poltrona bouclé terracota, encosto em rolos, braço curvo em madeira | Linho/bouclé terracota, nogueira | — | Cortina cinza | **Implementado** (`Armchair` procedural) |
| INT | 12 | **Planta – Lavanderia** (girada 90°; topo = oeste) | Porta‑janela de correr (sul), porta para circulação (norte) | Bancada com 2 tanques (leste), máquina de abrir por cima, bancada c/ máquina (oeste), torre de armários, nicho de madeira | **Terrazzo/granilite bege** no piso, granito preto | — | — | **Implementado** (`Laundry.tsx`) |
| INT | 13 | Lavanderia – vista p/ sul | Porta de correr com vista para **bananeiras** | Bancadas, armários superiores, nicho aberto, torre | Nogueira (base), laca areia (superiores), granito preto, travertino | Fita LED sob armários | Cesto de fibra | **Implementado** – `laundry_view_01` |
| INT | 14 | Lavanderia – elevação tanques | — | 2 cubas inox, lava‑e‑seca + lavadora | Nogueira, laca areia, terrazzo backsplash | LED sob armário e nicho | Planta pendente | **Implementado** – `laundry_view_02` |
| INT | 15 | Lavanderia – elevação oposta | Painel de nogueira até o forro | Banco de madeira + cesto, gaveteiro, torre de armários | Laca areia, nogueira, granito | LED + spots duplos | Ganchos para roupas | **Implementado** |
| INT | 16 | Lavanderia – detalhe | — | Equipamento (cilindro) sobre granito | Granito preto, laca areia | LED linear | — | **Implementado** (simplificado) |
| INT | 17 | Lavanderia – vista técnica | — | Torre com prateleiras, vassouras | — | — | — | **Implementado** |
| INT | 18 | **Planta – Cozinha e Gourmet** (girada 180°) | Parede de vidro entre cozinha e gourmet; janelas sobre pias (sul) | Cozinha: ilha nogueira+granito, mesa com tampo de vidro + 6 cadeiras, L de bancadas, torre de forno, geladeira, cristaleira. Gourmet: mesa de madeira 10 lugares, **ilha orgânica** granito preto + 3 banquetas, churrasqueira, adega | Porcelanato bege 120×120 | — | — | **Implementado** (`Kitchen.tsx`, `Gourmet.tsx`) |
| INT | 19 | Cozinha – vista p/ leste | Sanca perimetral | Torre de armários laca, coifa revestida em terrazzo, ilha, mesa | Nogueira (painéis), laca greige, terrazzo, granito preto | Sanca LED, spots, **5 pendentes globo âmbar** | Cortinas de linho | **Implementado** – `kitchen_view_01` |
| INT | 20 | Cozinha – vista p/ sul | Janela horizontal sobre a pia | Geladeira inox, nicho com prateleiras, cadeiras estofadas off‑white | idem | idem | Planta pendente | **Implementado** – `kitchen_view_02` |
| INT | 21 | Cozinha – vista p/ sudeste (sem mobiliário) | Rodapé em terrazzo | L de bancadas, forno, lava‑louças | idem | idem | — | **Implementado** |
| INT | 22 | Cozinha – vista p/ norte | Portas de correr para o pátio | **Cristaleira** (vidro + laca) sobre painel de nogueira | idem | Pendentes âmbar | — | **Implementado** – `kitchen_view_03` |
| INT | 23 | Cozinha – vista p/ oeste | Porta de correr de vidro para a gourmet | Ilha | idem | idem | Gourmet visível ao fundo | **Implementado** |
| INT | 24 | Gourmet – vista p/ oeste | **Forro de madeira**, abertura total para o pátio com pilar | Mesa cavalete de madeira, cadeiras de **corda verde‑oliva**, ilha | Freijó, terrazzo, granito preto | **2 ventiladores com pás de palha**, pendente cônico de palha | Piscina visível | **Implementado** – `gourmet_view_01` |
| INT | 25 | Gourmet – elevação sul (com mobiliário) | — | Adega, armários laca, bancada, churrasqueira, ilha + banquetas | Nogueira, laca, terrazzo, granito | LED em prateleiras, **3 pendentes cônicos de palha** | Plantas pendentes | **Implementado** – `gourmet_view_02` |
| INT | 26 | Gourmet – elevação sul (sem mobiliário) | Churrasqueira em coluna de terrazzo com moldura granito | Adega, nicho com prateleiras | idem | LED | — | **Implementado** |
| INT | 27 | Gourmet – vista p/ norte | Pilar, parede com **TV**; árvore externa | Ilha, mesa 10 lugares | idem | Ventiladores, pendentes | Ombrelone e piscina ao fundo | **Implementado** – `gourmet_view_03` |
| INT | 28 | Gourmet – vista p/ leste | Porta de vidro para cozinha | Ilha orgânica + banquetas de corda | idem | Pendentes cônicos | — | **Implementado** |
| INT | 29 | **Planta – Banho externo** | Porta, janela, box | Bancada suspensa, bacia, chuveiro | **Porcelanato travertino** (piso e paredes) | — | — | **Implementado** (`ExternalBathroom.tsx`) |
| INT | 30 | Banho externo – vista geral | Janela basculante no box | Bancada de travertino, espelho orgânico, cestos | Travertino, **parede de seixos** | Fita LED vertical, spots | Prateleiras na pedra | **Implementado** – `extbath_view_01` |
| INT | 31 | Banho externo – box | Painel de travertino retroiluminado sobre parede de seixos | Ducha quadrada | idem | LED perimetral | Nicho com prateleiras | **Implementado** |
| INT | 32 | Banho externo – vista oposta | — | Bacia suspensa, toalheiro | idem | LED vertical | — | **Implementado** |
| INT | 33 | **Depósito** | — | Estantes metálicas pretas com prateleiras cinza, bicicletas, escada | Piso amadeirado, parede branca | Plafon LED | — | **Implementado** (`StorageRoom.tsx`) |
| INT | 34 | **Planta – Sala de jogos** | Vidro em 3 lados (ver divergência D‑03) | Mesa redonda preta + 6 cadeiras, sofá bouclé preto, 2 mesas laterais, tapete de couro, armário/estante | Piso amadeirado | — | — | **Implementado** (`GameRoom.tsx`) |
| INT | 35 | Sala de jogos – estante | Marcenaria taupe com nichos iluminados | Mesa redonda, cadeiras pretas, sofá, guitarra no nicho | Laca taupe, painel travertino | **Perfis LED lineares** no forro, pendente tambor preto, sanca | Cortinas de linho | **Implementado** – `game_view_01` |
| INT | 36 | Sala de jogos – vista longitudinal | Porta de correr de vidro (vista piscina) | Cadeira de escritório, mesa, sofá | Paredes taupe | LED linear, pendente | Violões e quadros na parede | **Implementado** – `game_view_02` |
| INT | 37 | Sala de jogos – estante (detalhe) | — | Bancada com teclado (piano) | Travertino, laca taupe | LED em prateleiras | Guitarra vermelha | **Implementado** |
| INT | 38 | Sala de jogos – escrivaninha | — | Cadeira giratória preta, teclado | Travertino | LED | Esculturas pretas, livros | **Implementado** |
| INT | 39 | Sala de jogos – parede de violões | Entre cortinas | Sofá bouclé preto, 2 mesas laterais | Parede taupe | Split, LED | 2 violões + 8 quadros | **Implementado** |
| INT | 40 | **Planta – Banho social** (girada; topo = leste) | Box no extremo norte com janela, porta ao sul | Bacia, bancada com cuba | Porcelanato marmorizado bege | — | — | **Implementado** (`SocialBathroom.tsx`) |
| INT | 41 | Banho social – bancada | Painel **ripado taupe** atrás da bancada | Gabinete taupe, cuba de apoio, bacia | Quartzo bege, porcelanato marmorizado | **Espelho retroiluminado**, arandelas de vidro com latão, sanca | — | **Implementado** – `socialbath_view_01` |
| INT | 42 | Banho social – box | Box de vidro com porta de correr | — | idem | Nicho iluminado | — | **Implementado** |
| INT | 43 | Banho social – box (detalhe) | Janela de correr | — | idem | Spots | — | **Implementado** |
| INT | 44 | **Planta – Suíte master** (girada 180°) | Dormitório, closet, banho; janelas para o pátio (closet), porta de vidro oeste (deck/piscina) | Cama king, criados ovais, rack com TV em pórtico de latão, poltrona caramelo, tapete listrado, closet em “U”, penteadeira | Porcelanato bege | — | — | **Implementado** (`MasterSuite.tsx`, `MasterCloset.tsx`, `MasterBathroom.tsx`) |
| INT | 45 | Closet – corredor | Espelhos nas portas do fundo | Armários laca, penteadeira nogueira, cadeira bouclé | Laca greige com **puxadores quadrados dourados**, nogueira | **Perfil LED em moldura retangular** no forro | Espelho redondo suspenso em latão | **Implementado** – `closet_view_01` |
| INT | 46 | Closet – nicho central | — | Nicho nogueira com prateleiras iluminadas + gaveteiro | idem | LED nas prateleiras | Bolsas, caixas | **Implementado** – `closet_view_02` |
| INT | 47 | Closet – penteadeira | Porta do banho | Penteadeira, espelho redondo suspenso com LED | Papel de parede geométrico mármore | — | — | **Implementado** |
| INT | 48 | Closet – nicho (perspectiva) | — | idem | idem | idem | — | **Implementado** |
| INT | 49‑51 | Closet – vistas técnicas | Estrutura interna (cabideiros, sapateira) | — | — | — | — | Considerado (portas fechadas no 3D) |
| INT | 52‑54 | Closet – penteadeira (fotos) | — | Bancada nogueira + quartzo, cuba de apoio | — | Espelho com LED | Papel de parede marmorizado | **Implementado** |
| INT | 55 | **Banho suíte** – box | Janela, box | Bacia suspensa, ducha dourada | **Porcelanato pedra cinza** + **revestimento 3D “cápsula” taupe** | Nicho iluminado | Metais **dourado escovado** | **Implementado** – `masterbath_view_01` |
| INT | 56 | Banho suíte – box (detalhe) | Vidro com perfil dourado | — | idem | — | — | **Implementado** |
| INT | 57 | **Suíte master** – vista p/ oeste | Porta para o closet, cortina | Cama, criado, rack, TV | Painel de **tecido texturizado cinza** com moldura e LED, painel nogueira | Sanca LED, spots | Abajures dourados | **Implementado** – `master_view_01` |
| INT | 58 | Suíte – cabeceira | Painel nogueira com porta embutida | Cama estofada, 2 criados ovais com pés dourados, abajures | Tecido cinza, nogueira, papel de parede bege | LED | — | **Implementado** – `master_view_02` |
| INT | 59 | Suíte – cabeceira (diagonal) | idem | idem | idem | idem | — | **Implementado** |
| INT | 60 | Suíte – TV | Porta de vidro para o deck/piscina | Rack laca com puxadores dourados, **TV em pórtico de latão suspenso** à frente das cortinas | — | LED sob rack | Vista da piscina e maciço tropical | **Implementado** – `master_view_03` |
| INT | 61 | Suíte – TV (diagonal) | idem | Poltrona caramelo | — | — | — | **Implementado** |
| INT | 62 | Suíte – vista p/ sul | Split | Poltrona caramelo + mesa lateral, rack | Papel de parede bege | Sanca | Planta | **Implementado** |
| INT | 63 | Encerramento | — | — | — | — | — | n/a |

---

## 5. Reconciliação ARQ × INT (orientação das plantas de interiores)

| Planta INT | Rotação aplicada | Divergências e decisão |
|---|---|---|
| p.4 Sala de TV | 90° horário (topo = oeste) | Consistente com ARQ (sofá na parede norte, porta pivotante na leste). |
| p.12 Lavanderia | 90° horário (topo = oeste) | Consistente. |
| p.18 Cozinha/Gourmet | 180° | Consistente; cooktop da gourmet: ARQ x≈17,9 × INT x≈19,8 → **adotado INT** (layout de interiores prevalece para marcenaria). |
| p.29 Banho externo | — | **D‑01**: INT mostra porta na parede longa; ARQ mostra porta na parede norte (curta). **Adotado ARQ** (porta norte); bancada, bacia e box reposicionados ao longo da parede leste, mantendo os acabamentos INT. |
| p.34 Sala de jogos | — | **D‑03**: INT mostra vidro em 3 lados incluindo a parede sul, que no ARQ é parede comum ao depósito. **Adotado ARQ**: estante/escrivaninha na parede oeste, janela com cortinas na parede norte, porta de vidro na parte norte da parede leste; parede de violões/quadros na parede leste (trecho sul). |
| p.40 Banho social | 90° anti‑horário (topo = leste) | Consistente (box ao norte, porta ao sul). |
| p.44 Suíte master | 180° | Consistente com ARQ. |

---

## 6. Suposições documentadas

| ID | Suposição | Justificativa | Onde corrigir |
|---|---|---|---|
| A‑01 | Topo da planta = Norte | Nenhuma rosa dos ventos; implica sol da tarde na piscina (adequado ao hemisfério sul) | `src/data/houseSpec.ts` → `SUN` |
| A‑02 | Pé‑direito 2,80 m nos ambientes | Sem cortes; proporção porta 2,10 m nos renders | `HEIGHTS.ceiling` |
| A‑03 | Platibanda 3,70 m; marquise 3,25/4,20 m; volume alto 5,90/7,10 m | Proporções medidas em ARQ p.4/5/11/15 | `HEIGHTS` |
| A‑04 | Sala de TV com pé‑direito duplo (forro 5,50 m) | INT p.5‑9 e pele de vidro alta ARQ p.6/p.14 | `HEIGHTS.salaCeiling` |
| A‑05 | Espessura de paredes 0,15 m (internas e externas) | Linhas duplas da planta = 9 px ≈ 0,15 m | `WALL_T` |
| A‑06 | Pele de vidro frontal à frente do Quarto 01 tratada como vidro com fundo opaco acima do forro | Render ARQ p.4/5 mostra vidro alto; planta mostra quarto atrás | `Exterior.tsx` |
| A‑07 | Quarto 01 e Quarto 02 **não possuem projeto de interiores** nos PDFs | Mobiliados com o que aparece na planta ARQ (cama, criados, armário) em acabamento neutro; marcados como “não detalhado” | `rooms/Bedrooms.tsx` |
| A‑08 | Profundidade da piscina 1,40 m; borda em pedra natural no lado das divisas | Não cotado; ARQ p.10/p.13 | `site.ts` / `Pool.tsx` |
| A‑09 | Muros de divisa 2,40 m em cinza | ARQ p.10/p.13 | `HEIGHTS.boundaryWall` |
| A‑10 | Chuveiro externo na divisa norte em x≈13,7 | Símbolo na planta ARQ p.2 + ARQ p.10/p.14 | `Landscaping.tsx` |
| A‑11 | Acesso garagem → casa pelo hall (o hall é aberto para a garagem a partir de x 34,4) | Linha da parede norte da garagem termina em x 34,4 na planta | `houseSpec.ts` |
| A‑12 | Circulação de serviço liga Sala (porta x 27,8–28,9), Cozinha e Lavanderia | Arcos de porta na planta ARQ | `houseSpec.ts` |
| A‑13 | Parede da TV da gourmet no trecho leste da fachada norte | INT p.27 (TV em parede cega) × ARQ (vidro contínuo) — compromisso: 2 vãos de vidro + 1 trecho cego | `houseSpec.ts` |
| A‑14 | Texturas são procedurais (geradas em canvas) para não depender de arquivos externos; cores calibradas pelos renders | — | `src/materials/textures.ts` |

---

## 7. Status geral de implementação

Todos os ambientes listados no briefing e todos os encontrados na auditoria foram modelados:
Sala de TV · Lavanderia · Cozinha · Área Gourmet · Banho Externo · Despensa · Depósito · Sala de Jogos · Banho Social · Suíte Master (dormitório, closet, banho) · Quarto 01 · Quarto 02 · Circulações (íntima e serviço) · Hall · Garagem · Pátio interno / Jardim central · Deck · Praia de areia · Piscina · Jardins · Chuveiro externo · Fachada frontal · Fachada posterior · Fachadas laterais · Volume alto/pórtico · Marquise · Pérgolas · Caixa d’água · Muros de divisa · Calçada e rua.

A rastreabilidade por ambiente (array `sources`) está em `src/data/houseSpec.ts → ROOMS` e é exibida no painel de ambientes.
