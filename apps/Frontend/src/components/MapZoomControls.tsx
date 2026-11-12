import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

const mapControlSurfaceClass = "bg-surface text-ink flex items-center justify-center hover:bg-surface-3 transition-colors";
export const mapControlButtonClass = `w-11 h-11 ${mapControlSurfaceClass}`;
export const mapControlShadowClass = "shadow-[0_2px_8px_rgba(18,22,26,0.18)]";

export function MapZoomControls({ onZoomIn, onZoomOut, children, compact = false }: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  children?: ReactNode;
  compact?: boolean;
}) {
  const buttonClass = compact ? `h-10 w-9 ${mapControlSurfaceClass}` : mapControlButtonClass;
  const iconClass = compact ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <div className={`rounded-full bg-surface ${mapControlShadowClass} overflow-hidden flex flex-col divide-y divide-line`}>
      {children}
      <button type="button" onClick={onZoomIn} className={buttonClass} aria-label="Zoom in">
        <Plus className={iconClass} />
      </button>
      <button type="button" onClick={onZoomOut} className={buttonClass} aria-label="Zoom out">
        <Minus className={iconClass} />
      </button>
    </div>
  );
}
