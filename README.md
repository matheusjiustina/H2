# H2iStore — Seu Mundo Apple

Site institucional e catálogo digital da H2iStore (Paranaíta — MT), construído com Next.js (App Router), TypeScript e Tailwind CSS. O site funciona como catálogo/vitrine: os visitantes navegam pelos produtos e são direcionados ao WhatsApp para negociar.

## Rodando o projeto

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Outros comandos úteis:

```bash
npm run build   # build de produção
npm run start   # roda o build de produção
npm run lint    # checagem de lint/TypeScript
```

## Como editar o catálogo de produtos

Todo o catálogo fica em **`src/data/products.ts`**, como um array de objetos `Product` (tipo definido em `src/lib/types.ts`). Não é necessário mexer em nenhuma página ou componente para atualizar produtos.

- **Adicionar produto**: copie um objeto existente no array e ajuste os campos.
- **Remover produto**: apague o objeto correspondente.
- **Marcar como vendido/indisponível**: `available: false`.
- **Colocar em oferta**: defina `price` e `oldPrice` (em centavos). O preço antigo aparece riscado automaticamente.
- **Marcar como destaque**: `featured: true` (aparece nas seções de destaque da home).
- **Marcar como recém-chegado**: `justArrived: true` (aparece em "Chegou na H2iStore").
- **Trocar de categoria**: altere o campo `category` para um dos slugs definidos em `src/data/categories.ts`.

Campos de preço usam `null` para exibir "Consulte" — é o padrão de todo o catálogo de demonstração atual, já que os preços reais ainda não foram informados.

As categorias (nome, ícone, slug) ficam em **`src/data/categories.ts`**.

As informações de contato (WhatsApp, Instagram, cidade) ficam centralizadas em **`src/lib/site-config.ts`**.

## Imagens de produto

Como ainda não há fotos reais dos produtos, cada item exibe uma ilustração gerada (`src/components/ui/ProductVisual.tsx`) com base no campo `icon` do produto. Quando houver fotos reais, basta trocar esse componente por um `<Image>` apontando para a foto do produto.

## Estrutura

```
src/
  app/                Rotas (App Router): home, catálogo, categoria/[slug], produto/[id], apple, ofertas, sobre, contato
  components/
    layout/            Header, Footer, WhatsApp flutuante
    catalog/            Card de produto, grid, filtros, busca
    home/               Seções da página inicial
    ui/                 Componentes de base (botões, badges, ícones, animações)
  data/
    products.ts         Catálogo de produtos (edite aqui)
    categories.ts        Categorias
  lib/
    types.ts             Tipos TypeScript
    site-config.ts        Dados de contato/loja
    whatsapp.ts           Geração de links do WhatsApp com mensagens prontas
    format.ts             Formatação de preço, slugify
```

## Observação importante

Os produtos em `src/data/products.ts` são **fictícios**, usados apenas para validar o layout (preços, condição, disponibilidade e fotos ilustrativas). Substitua pelo catálogo real antes de divulgar o site.
