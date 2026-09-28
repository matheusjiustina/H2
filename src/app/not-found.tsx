import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center py-20">
      <Container className="flex max-w-lg flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-600">Erro 404</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Página não encontrada</h1>
        <p className="text-gray">
          O produto ou a página que você procura não existe ou foi removido do catálogo.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/"
            className="rounded-full bg-dark px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105"
          >
            Voltar ao início
          </Link>
          <Link
            href="/catalogo"
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-dark"
          >
            Ver catálogo
          </Link>
        </div>
      </Container>
    </div>
  );
}
