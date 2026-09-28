import type { ReactElement } from "react";
import type { IconKey } from "@/lib/types";

interface IconProps {
  className?: string;
}

function IphoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="6.5" y="2" width="11" height="20" rx="2.6" stroke="currentColor" />
      <rect x="9.5" y="4.1" width="5" height="1.1" rx="0.55" fill="currentColor" />
      <circle cx="12" cy="19" r="0.9" fill="currentColor" />
    </svg>
  );
}

function AndroidIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="6.5" y="2" width="11" height="20" rx="2" stroke="currentColor" />
      <circle cx="12" cy="4.6" r="0.7" fill="currentColor" />
      <rect x="9.8" y="18.2" width="4.4" height="0.9" rx="0.45" fill="currentColor" />
    </svg>
  );
}

function TabletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="3.5" y="2.5" width="17" height="19" rx="2.4" stroke="currentColor" />
      <circle cx="12" cy="19" r="0.8" fill="currentColor" />
    </svg>
  );
}

function MacbookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="5" y="4" width="14" height="9.6" rx="1" stroke="currentColor" />
      <path d="M2.5 18.2h19l-1.6 2.3a1.8 1.8 0 0 1-1.5.8H5.6a1.8 1.8 0 0 1-1.5-.8z" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

function NotebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="4.5" y="3.5" width="15" height="10.2" rx="1" stroke="currentColor" />
      <path d="M2 17.8h20v1a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.8z" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

function HeadphonesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" stroke="currentColor" strokeLinecap="round" />
      <rect x="2.8" y="13" width="4" height="6.2" rx="1.6" stroke="currentColor" />
      <rect x="17.2" y="13" width="4" height="6.2" rx="1.6" stroke="currentColor" />
    </svg>
  );
}

function EarbudsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="6" y="7" width="4.2" height="6" rx="2" stroke="currentColor" />
      <path d="M8.1 13v3.2a1.7 1.7 0 0 0 1.7 1.7" stroke="currentColor" strokeLinecap="round" />
      <rect x="13.8" y="7" width="4.2" height="6" rx="2" stroke="currentColor" />
      <path d="M15.9 13v3.2a1.7 1.7 0 0 0 1.7 1.7" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="4" y="6" width="16" height="12" rx="4" stroke="currentColor" />
      <circle cx="9.5" cy="12" r="2.6" stroke="currentColor" />
      <circle cx="16.3" cy="9.3" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CaseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="6.5" y="2" width="11" height="20" rx="2.6" stroke="currentColor" strokeDasharray="1.5 2.2" />
      <rect x="8.7" y="4.3" width="6.6" height="10" rx="1.2" stroke="currentColor" />
    </svg>
  );
}

function ChargerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <path d="M8 2v5M12 2v5" stroke="currentColor" strokeLinecap="round" />
      <path d="M6 7h8v4a4 4 0 0 1-4 4 4 4 0 0 1-4-4z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M10 15v3M8 21h4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function CableIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="2.2" y="9.5" width="3.4" height="5" rx="1" stroke="currentColor" />
      <path d="M5.6 12c3 0 3-4 6-4s3 8 6 8" stroke="currentColor" strokeLinecap="round" />
      <rect x="18.4" y="14.5" width="3.4" height="5" rx="1" stroke="currentColor" />
    </svg>
  );
}

function WatchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <rect x="8" y="7" width="8" height="10" rx="2.4" stroke="currentColor" />
      <path d="M9.5 7V4.4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M9.5 17v2.6a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V17" stroke="currentColor" />
      <path d="M14.5 10.3v1.3l1 .6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function AccessoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <path d="M12 2.5l7.5 3.2v6c0 5-3.2 7.9-7.5 9.3-4.3-1.4-7.5-4.3-7.5-9.3v-6z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GenericIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.4}>
      <path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M3.7 7.2 12 11.4l8.3-4.2M12 11.4v9.7" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS: Record<IconKey, (props: IconProps) => ReactElement> = {
  iphone: IphoneIcon,
  android: AndroidIcon,
  tablet: TabletIcon,
  macbook: MacbookIcon,
  notebook: NotebookIcon,
  headphones: HeadphonesIcon,
  earbuds: EarbudsIcon,
  speaker: SpeakerIcon,
  case: CaseIcon,
  charger: ChargerIcon,
  cable: CableIcon,
  watch: WatchIcon,
  accessory: AccessoryIcon,
  generic: GenericIcon,
};

export function CategoryIcon({ icon, className }: { icon: IconKey; className?: string }) {
  const Icon = ICONS[icon] ?? GenericIcon;
  return <Icon className={className} />;
}
