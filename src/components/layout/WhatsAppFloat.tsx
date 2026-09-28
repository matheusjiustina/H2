import { genericWhatsAppLink } from "@/lib/whatsapp";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function WhatsAppFloat() {
  return (
    <a
      href={genericWhatsAppLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fale com a H2iStore no WhatsApp"
      className="group fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 text-white shadow-[0_10px_30px_-8px_rgba(37,211,102,0.6)] transition-transform duration-200 hover:scale-105 sm:bottom-6 sm:right-6 sm:p-4"
    >
      <WhatsAppIcon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:max-w-[180px] group-hover:pr-1">
        Fale com a H2iStore
      </span>
    </a>
  );
}
