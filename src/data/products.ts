import type { Product } from "@/lib/types";

/**
 * ATENÇÃO — CATÁLOGO DE DEMONSTRAÇÃO
 * ------------------------------------------------------------------
 * Todos os produtos abaixo são FICTÍCIOS e servem apenas para validar
 * o layout, os filtros, a busca e as páginas de produto do site.
 *
 * Nenhum preço, estoque, garantia, saúde de bateria ou disponibilidade
 * aqui é real. Antes de publicar em produção, substitua este arquivo
 * pelo catálogo real da loja (ou plugue uma fonte de dados/CMS).
 *
 * Todo produto usa `price: null`, o que faz a interface exibir
 * "Consulte" — nenhum valor foi inventado.
 *
 * Estrutura pensada para ser fácil de editar:
 *  - adicionar produto  -> adicione um novo objeto ao array
 *  - remover produto    -> remova o objeto
 *  - marcar vendido      -> available: false
 *  - marcar oferta       -> defina price/oldPrice reais
 *  - marcar destaque     -> featured: true
 *  - trocar categoria    -> altere `category`
 */
export const products: Product[] = [
  // ---------------------------------------------------------------
  // iPhones
  // ---------------------------------------------------------------
  {
    id: "iphone-17-pro-max",
    name: "iPhone 17 Pro Max",
    brand: "Apple",
    category: "iphones",
    model: "iPhone 17 Pro Max",
    storage: "256 GB",
    condition: "novo",
    color: "Titânio",
    price: null,
    oldPrice: null,
    featured: true,
    justArrived: true,
    available: true,
    icon: "iphone",
    description:
      "iPhone 17 Pro Max novo, lacrado. O topo de linha da Apple, com desempenho e câmeras de ponta. Fale com a H2iStore para consultar disponibilidade de cores e condições de pagamento.",
    specifications: [
      { label: "Armazenamento", value: "256 GB" },
      { label: "Condição", value: "Novo, lacrado" },
      { label: "Cor", value: "A confirmar" },
      { label: "Garantia", value: "A confirmar" },
    ],
    relatedIds: [
      "capinha-iphone-demo",
      "carregador-20w-demo",
      "airpods-pro-demo",
      "pelicula-vidro-demo",
    ],
  },
  {
    id: "iphone-17-pro",
    name: "iPhone 17 Pro",
    brand: "Apple",
    category: "iphones",
    model: "iPhone 17 Pro",
    storage: "256 GB",
    condition: "novo",
    color: "Titânio",
    price: null,
    oldPrice: null,
    featured: true,
    justArrived: true,
    available: true,
    icon: "iphone",
    description:
      "iPhone 17 Pro novo, lacrado. Câmera profissional, tela ProMotion e o melhor da performance Apple. Consulte cores disponíveis com a nossa equipe.",
    specifications: [
      { label: "Armazenamento", value: "256 GB" },
      { label: "Condição", value: "Novo, lacrado" },
      { label: "Cor", value: "A confirmar" },
      { label: "Garantia", value: "A confirmar" },
    ],
    relatedIds: [
      "capinha-iphone-demo",
      "carregador-20w-demo",
      "cabo-usb-c-demo",
      "airpods-demo",
    ],
  },
  {
    id: "iphone-16-pro-max",
    name: "iPhone 16 Pro Max",
    brand: "Apple",
    category: "iphones",
    model: "iPhone 16 Pro Max",
    storage: "256 GB",
    condition: "seminovo",
    color: "A confirmar",
    price: null,
    oldPrice: null,
    featured: true,
    available: true,
    icon: "iphone",
    description:
      "iPhone 16 Pro Max seminovo, com procedência verificada pela H2iStore. Excelente custo-benefício para quem quer um iPhone Pro por um valor mais acessível.",
    specifications: [
      { label: "Armazenamento", value: "256 GB" },
      { label: "Condição", value: "Seminovo" },
      { label: "Saúde da bateria", value: "A confirmar" },
      { label: "Acessórios inclusos", value: "A confirmar" },
    ],
    relatedIds: [
      "capinha-iphone-demo",
      "pelicula-vidro-demo",
      "carregador-20w-demo",
      "power-bank-demo",
    ],
  },
  {
    id: "iphone-16-pro",
    name: "iPhone 16 Pro",
    brand: "Apple",
    category: "iphones",
    model: "iPhone 16 Pro",
    storage: "128 GB",
    condition: "seminovo",
    color: "A confirmar",
    price: null,
    oldPrice: null,
    featured: true,
    available: true,
    icon: "iphone",
    description:
      "iPhone 16 Pro seminovo, revisado pela H2iStore. Ótima opção para quem busca um iPhone Pro com excelente desempenho.",
    specifications: [
      { label: "Armazenamento", value: "128 GB" },
      { label: "Condição", value: "Seminovo" },
      { label: "Saúde da bateria", value: "A confirmar" },
      { label: "Acessórios inclusos", value: "A confirmar" },
    ],
    relatedIds: ["capinha-iphone-demo", "cabo-usb-c-demo", "airpods-demo"],
  },
  {
    id: "iphone-15",
    name: "iPhone 15",
    brand: "Apple",
    category: "iphones",
    model: "iPhone 15",
    storage: "128 GB",
    condition: "seminovo",
    color: "A confirmar",
    price: null,
    oldPrice: null,
    featured: false,
    available: true,
    icon: "iphone",
    description:
      "iPhone 15 seminovo, com conector USB-C e ótimo desempenho para o dia a dia. Consulte condições e estado de conservação.",
    specifications: [
      { label: "Armazenamento", value: "128 GB" },
      { label: "Condição", value: "Seminovo" },
      { label: "Saúde da bateria", value: "A confirmar" },
    ],
    relatedIds: ["capinha-iphone-demo", "pelicula-vidro-demo", "cabo-usb-c-demo"],
  },
  {
    id: "iphone-14",
    name: "iPhone 14",
    brand: "Apple",
    category: "iphones",
    model: "iPhone 14",
    storage: "128 GB",
    condition: "seminovo",
    color: "A confirmar",
    price: null,
    oldPrice: null,
    featured: false,
    available: true,
    icon: "iphone",
    description:
      "iPhone 14 seminovo, revisado, com ótimo custo-benefício para quem quer entrar no ecossistema Apple.",
    specifications: [
      { label: "Armazenamento", value: "128 GB" },
      { label: "Condição", value: "Seminovo" },
      { label: "Saúde da bateria", value: "A confirmar" },
    ],
    relatedIds: ["capinha-iphone-demo", "carregador-20w-demo"],
  },

  // ---------------------------------------------------------------
  // Outros celulares — TODO: inserir aparelhos reais disponíveis na H2iStore.
  // ---------------------------------------------------------------
  {
    id: "samsung-galaxy-demo",
    name: "Samsung Galaxy (modelo a definir)",
    brand: "Samsung",
    category: "celulares",
    model: "Galaxy — estrutura de demonstração",
    condition: "seminovo",
    price: null,
    featured: false,
    available: false,
    icon: "android",
    description:
      "Estrutura de catálogo para aparelhos Samsung Galaxy. TODO: inserir modelo, condição e fotos reais quando disponível na loja.",
    specifications: [{ label: "Disponibilidade", value: "Consulte a loja" }],
  },
  {
    id: "motorola-edge-demo",
    name: "Motorola (modelo a definir)",
    brand: "Motorola",
    category: "celulares",
    model: "Edge/Moto — estrutura de demonstração",
    condition: "seminovo",
    price: null,
    featured: false,
    available: false,
    icon: "android",
    description:
      "Estrutura de catálogo para aparelhos Motorola. TODO: inserir modelo, condição e fotos reais quando disponível na loja.",
    specifications: [{ label: "Disponibilidade", value: "Consulte a loja" }],
  },
  {
    id: "xiaomi-redmi-demo",
    name: "Xiaomi (modelo a definir)",
    brand: "Xiaomi",
    category: "celulares",
    model: "Redmi/Poco — estrutura de demonstração",
    condition: "seminovo",
    price: null,
    featured: false,
    available: false,
    icon: "android",
    description:
      "Estrutura de catálogo para aparelhos Xiaomi. TODO: inserir modelo, condição e fotos reais quando disponível na loja.",
    specifications: [{ label: "Disponibilidade", value: "Consulte a loja" }],
  },

  // ---------------------------------------------------------------
  // iPads
  // ---------------------------------------------------------------
  {
    id: "ipad-10-demo",
    name: "iPad (geração a definir)",
    brand: "Apple",
    category: "ipads",
    model: "iPad",
    storage: "64 GB",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "tablet",
    description:
      "iPad ideal para estudo, trabalho e entretenimento. Consulte geração, armazenamento e cor disponíveis na H2iStore.",
    specifications: [
      { label: "Armazenamento", value: "64 GB" },
      { label: "Condição", value: "Novo" },
    ],
    relatedIds: ["capinha-iphone-demo", "carregador-20w-demo", "cabo-usb-c-demo"],
  },
  {
    id: "ipad-air-demo",
    name: "iPad Air (geração a definir)",
    brand: "Apple",
    category: "ipads",
    model: "iPad Air",
    storage: "128 GB",
    condition: "novo",
    price: null,
    featured: true,
    available: true,
    icon: "tablet",
    description:
      "iPad Air com chip Apple potente, ótimo para quem precisa de mais desempenho. Consulte disponibilidade e cores.",
    specifications: [
      { label: "Armazenamento", value: "128 GB" },
      { label: "Condição", value: "Novo" },
    ],
  },
  {
    id: "ipad-pro-demo",
    name: "iPad Pro (geração a definir)",
    brand: "Apple",
    category: "ipads",
    model: "iPad Pro",
    storage: "256 GB",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "tablet",
    description:
      "iPad Pro para quem exige o máximo de performance e tela. Consulte modelo, tamanho de tela e disponibilidade.",
    specifications: [
      { label: "Armazenamento", value: "256 GB" },
      { label: "Condição", value: "Novo" },
    ],
  },

  // ---------------------------------------------------------------
  // MacBooks
  // ---------------------------------------------------------------
  {
    id: "macbook-air-demo",
    name: "MacBook Air (modelo a definir)",
    brand: "Apple",
    category: "macbooks",
    model: "MacBook Air",
    storage: "256 GB SSD",
    condition: "novo",
    price: null,
    featured: true,
    available: true,
    icon: "macbook",
    description:
      "MacBook Air, leve e potente para o dia a dia. Consulte chip, memória e armazenamento disponíveis na H2iStore.",
    specifications: [
      { label: "Armazenamento", value: "256 GB SSD" },
      { label: "Condição", value: "Novo" },
    ],
    relatedIds: ["fone-bluetooth-demo", "cabo-usb-c-demo", "power-bank-demo"],
  },
  {
    id: "macbook-pro-demo",
    name: "MacBook Pro (modelo a definir)",
    brand: "Apple",
    category: "macbooks",
    model: "MacBook Pro",
    storage: "512 GB SSD",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "macbook",
    description:
      "MacBook Pro para quem precisa de alta performance profissional. Consulte configuração e disponibilidade.",
    specifications: [
      { label: "Armazenamento", value: "512 GB SSD" },
      { label: "Condição", value: "Novo" },
    ],
  },

  // ---------------------------------------------------------------
  // Notebooks (multimarca)
  // ---------------------------------------------------------------
  {
    id: "notebook-dell-demo",
    name: "Notebook Dell (modelo a definir)",
    brand: "Dell",
    category: "notebooks",
    model: "Linha a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "notebook",
    description:
      "Notebook Dell para uso profissional e estudos. Consulte processador, memória e armazenamento disponíveis.",
    specifications: [
      { label: "Processador", value: "A confirmar" },
      { label: "Memória RAM", value: "A confirmar" },
      { label: "Armazenamento", value: "A confirmar" },
      { label: "Tela", value: "A confirmar" },
    ],
    relatedIds: ["fone-bluetooth-demo", "carregador-20w-demo", "power-bank-demo"],
  },
  {
    id: "notebook-lenovo-demo",
    name: "Notebook Lenovo (modelo a definir)",
    brand: "Lenovo",
    category: "notebooks",
    model: "Linha a definir",
    condition: "seminovo",
    price: null,
    featured: false,
    available: true,
    icon: "notebook",
    description:
      "Notebook Lenovo com ótimo custo-benefício. Consulte especificações completas com a nossa equipe.",
    specifications: [
      { label: "Processador", value: "A confirmar" },
      { label: "Memória RAM", value: "A confirmar" },
      { label: "Armazenamento", value: "A confirmar" },
      { label: "Tela", value: "A confirmar" },
    ],
  },
  {
    id: "notebook-acer-demo",
    name: "Notebook Acer (modelo a definir)",
    brand: "Acer",
    category: "notebooks",
    model: "Linha a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "notebook",
    description:
      "Notebook Acer para tarefas do dia a dia. Consulte configuração disponível na loja.",
    specifications: [
      { label: "Processador", value: "A confirmar" },
      { label: "Memória RAM", value: "A confirmar" },
      { label: "Armazenamento", value: "A confirmar" },
      { label: "Tela", value: "A confirmar" },
    ],
  },

  // ---------------------------------------------------------------
  // Fones e Áudio
  // ---------------------------------------------------------------
  {
    id: "airpods-pro-demo",
    name: "AirPods Pro",
    brand: "Apple",
    category: "fones",
    model: "AirPods Pro",
    condition: "novo",
    price: null,
    featured: true,
    available: true,
    icon: "earbuds",
    description:
      "AirPods Pro com cancelamento de ruído ativo. Consulte geração disponível e condições de compra.",
    specifications: [{ label: "Condição", value: "Novo, lacrado" }],
  },
  {
    id: "airpods-demo",
    name: "AirPods",
    brand: "Apple",
    category: "fones",
    model: "AirPods",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "earbuds",
    description:
      "AirPods para o dia a dia, com ótima integração ao ecossistema Apple. Consulte geração disponível.",
    specifications: [{ label: "Condição", value: "Novo, lacrado" }],
  },
  {
    id: "fone-bluetooth-demo",
    name: "Fone Bluetooth (modelo a definir)",
    brand: "Diversas marcas",
    category: "fones",
    model: "Modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "headphones",
    description:
      "Fone Bluetooth over-ear para uso diário. Consulte marcas e modelos disponíveis na H2iStore.",
    specifications: [{ label: "Condição", value: "Novo" }],
  },
  {
    id: "earbuds-demo",
    name: "Earbuds Bluetooth (modelo a definir)",
    brand: "Diversas marcas",
    category: "fones",
    model: "Modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "earbuds",
    description:
      "Earbuds intra-auriculares sem fio, ótimos para academia e uso diário. Consulte modelos disponíveis.",
    specifications: [{ label: "Condição", value: "Novo" }],
  },

  // ---------------------------------------------------------------
  // JBL — Som para qualquer momento
  // ---------------------------------------------------------------
  {
    id: "jbl-flip-demo",
    name: "Caixa de Som JBL (linha Flip)",
    brand: "JBL",
    category: "jbl",
    model: "Linha Flip — modelo a definir",
    condition: "novo",
    price: null,
    featured: true,
    available: true,
    icon: "speaker",
    description:
      "Caixa de som JBL portátil, à prova d'água, ideal para levar para qualquer lugar. Consulte modelo e cor disponíveis.",
    specifications: [{ label: "Condição", value: "Novo, lacrado" }],
  },
  {
    id: "jbl-charge-demo",
    name: "Caixa de Som JBL (linha Charge)",
    brand: "JBL",
    category: "jbl",
    model: "Linha Charge — modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "speaker",
    description:
      "Caixa de som JBL com mais potência e autonomia de bateria. Consulte modelo disponível na loja.",
    specifications: [{ label: "Condição", value: "Novo, lacrado" }],
  },
  {
    id: "jbl-fone-demo",
    name: "Fone JBL",
    brand: "JBL",
    category: "jbl",
    model: "Modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "headphones",
    description:
      "Fone JBL com o som característico da marca. Consulte modelo (on-ear, bluetooth ou earbuds) disponível.",
    specifications: [{ label: "Condição", value: "Novo" }],
  },

  // ---------------------------------------------------------------
  // Capinhas — Proteção com estilo
  // ---------------------------------------------------------------
  {
    id: "capinha-iphone-demo",
    name: "Capinha para iPhone",
    brand: "Diversas marcas",
    category: "capinhas",
    model: "Compatível com vários modelos de iPhone",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "case",
    description:
      "Capinha protetora para iPhone, em diversos estilos e cores. Consulte modelos compatíveis disponíveis.",
    specifications: [{ label: "Compatibilidade", value: "Consulte o modelo do seu iPhone" }],
  },
  {
    id: "capinha-samsung-demo",
    name: "Capinha para Samsung",
    brand: "Diversas marcas",
    category: "capinhas",
    model: "Compatível com vários modelos Samsung",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "case",
    description:
      "Capinha protetora para aparelhos Samsung. Consulte modelos compatíveis disponíveis na loja.",
    specifications: [{ label: "Compatibilidade", value: "Consulte o modelo do seu aparelho" }],
  },
  {
    id: "capinha-motorola-demo",
    name: "Capinha para Motorola",
    brand: "Diversas marcas",
    category: "capinhas",
    model: "Compatível com vários modelos Motorola",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "case",
    description:
      "Capinha protetora para aparelhos Motorola. Consulte modelos compatíveis disponíveis.",
    specifications: [{ label: "Compatibilidade", value: "Consulte o modelo do seu aparelho" }],
  },
  {
    id: "capinha-transparente-demo",
    name: "Capinha Transparente Antichoque",
    brand: "Diversas marcas",
    category: "capinhas",
    model: "Vários modelos",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "case",
    description:
      "Capinha transparente antichoque, valoriza o design original do aparelho. Consulte compatibilidade.",
    specifications: [{ label: "Compatibilidade", value: "Consulte o modelo do seu aparelho" }],
  },

  // ---------------------------------------------------------------
  // Acessórios
  // ---------------------------------------------------------------
  {
    id: "carregador-20w-demo",
    name: "Carregador de Parede Rápido",
    brand: "Diversas marcas",
    category: "acessorios",
    model: "USB-C — potência a definir",
    condition: "novo",
    price: null,
    featured: true,
    available: true,
    icon: "charger",
    description:
      "Carregador de parede com carregamento rápido, compatível com iPhone e outros smartphones. Consulte potência disponível.",
    specifications: [{ label: "Conector", value: "USB-C" }],
  },
  {
    id: "cabo-usb-c-demo",
    name: "Cabo USB-C",
    brand: "Diversas marcas",
    category: "acessorios",
    model: "USB-C para USB-C / Lightning",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "cable",
    description:
      "Cabo de dados e carregamento USB-C. Consulte comprimento e conector (Lightning ou USB-C) disponíveis.",
    specifications: [{ label: "Conector", value: "USB-C" }],
  },
  {
    id: "pelicula-vidro-demo",
    name: "Película de Vidro",
    brand: "Diversas marcas",
    category: "acessorios",
    model: "Compatível com vários modelos",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "accessory",
    description:
      "Película de vidro temperado para proteção da tela. Consulte compatibilidade com o seu aparelho.",
    specifications: [{ label: "Compatibilidade", value: "Consulte o modelo do seu aparelho" }],
  },
  {
    id: "power-bank-demo",
    name: "Power Bank",
    brand: "Diversas marcas",
    category: "acessorios",
    model: "Capacidade a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "charger",
    description:
      "Bateria portátil para carregar seu celular em qualquer lugar. Consulte capacidade (mAh) disponível.",
    specifications: [{ label: "Conector", value: "USB-C / USB-A" }],
  },
  {
    id: "suporte-veicular-demo",
    name: "Suporte Veicular para Celular",
    brand: "Diversas marcas",
    category: "acessorios",
    model: "Modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "accessory",
    description:
      "Suporte veicular para celular, prático e seguro. Consulte modelos disponíveis na H2iStore.",
    specifications: [{ label: "Fixação", value: "A confirmar" }],
  },
  {
    id: "adaptador-demo",
    name: "Adaptador USB-C",
    brand: "Diversas marcas",
    category: "acessorios",
    model: "Modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "accessory",
    description:
      "Adaptador USB-C para diferentes necessidades de conexão. Consulte disponibilidade e modelo.",
    specifications: [{ label: "Conector", value: "USB-C" }],
  },

  // ---------------------------------------------------------------
  // Outros produtos tecnológicos
  // ---------------------------------------------------------------
  {
    id: "apple-watch-demo",
    name: "Apple Watch (modelo a definir)",
    brand: "Apple",
    category: "outros",
    model: "Apple Watch",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "watch",
    description:
      "Apple Watch para acompanhar sua saúde e receber notificações no pulso. Consulte modelo e tamanho disponíveis.",
    specifications: [{ label: "Condição", value: "Novo, lacrado" }],
  },
  {
    id: "caixa-som-generica-demo",
    name: "Caixa de Som Bluetooth (outras marcas)",
    brand: "Diversas marcas",
    category: "outros",
    model: "Modelo a definir",
    condition: "novo",
    price: null,
    featured: false,
    available: true,
    icon: "speaker",
    description:
      "Caixa de som bluetooth de outras marcas, além da linha JBL. Consulte opções disponíveis na loja.",
    specifications: [{ label: "Condição", value: "Novo" }],
  },
];

export function getProductById(id: string) {
  return products.find((p) => p.id === id);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  if (product.relatedIds?.length) {
    const explicit = product.relatedIds
      .map((id) => getProductById(id))
      .filter((p): p is Product => Boolean(p));
    if (explicit.length >= limit) return explicit.slice(0, limit);
    const rest = products.filter(
      (p) => p.id !== product.id && !product.relatedIds?.includes(p.id) && p.category === product.category,
    );
    return [...explicit, ...rest].slice(0, limit);
  }

  const sameCategory = products.filter((p) => p.id !== product.id && p.category === product.category);
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

  const others = products.filter((p) => p.id !== product.id && p.category !== product.category && p.featured);
  return [...sameCategory, ...others].slice(0, limit);
}
