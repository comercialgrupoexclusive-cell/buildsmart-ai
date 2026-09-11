// URL-parameter and env-var driven embed configuration. Read once on
// module import; the host iframe URL doesn't change at runtime.
//
// Recognised params:
//   ?embed=1          enables the postMessage bridge
//   ?readonly=1       hides toolbar / welcome modal
//
// Origin allowlist comes from VITE_EMBED_ALLOWED_ORIGINS (comma-
// separated). Unset means deny all postMessage senders. Use '*' to
// accept any origin (development only — logged as a warning).

function readBooleanParam(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get(name) === '1';
}

function readAllowedOrigins(): string[] {
  const raw = import.meta.env.VITE_EMBED_ALLOWED_ORIGINS as string | undefined;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const embedConfig = {
  embedded: readBooleanParam('embed'),
  readonly: readBooleanParam('readonly'),
  allowedOrigins: readAllowedOrigins()
};

export function originAllowed(origin: string): boolean {
  if (embedConfig.allowedOrigins.includes('*')) {
    if (import.meta.env.DEV) {
      console.warn(
        '[axo:embed] VITE_EMBED_ALLOWED_ORIGINS=* — accepting any origin (dev only).'
      );
    }
    return true;
  }
  // BuildSmart P4.6 Bloco B — esta cópia vendorizada é servida como asset
  // estático dentro do MESMO domínio do app Next.js que a incorpora (ver
  // vendor/axonometra/VENDOR.md), não em outro host. O domínio de produção
  // final (Vercel + eventual domínio próprio) não é conhecido em build time
  // do bundle Vite, então travar a allowlist numa string fixa quebraria em
  // qualquer domínio diferente do previsto — inseguro por fragilidade, não
  // por permissividade. Mesma origem do documento hospedeiro (a página que
  // enviou a mensagem) sempre é aceita: um site não consegue forjar a
  // própria origem, então isso não abre nenhuma superfície nova — é
  // estritamente mais restrito que '*' e não depende de nenhuma lista
  // hardcoded. Origens de terceiros continuam exigindo
  // VITE_EMBED_ALLOWED_ORIGINS explícito.
  if (typeof window !== 'undefined' && origin === window.location.origin) {
    return true;
  }
  return embedConfig.allowedOrigins.includes(origin);
}
