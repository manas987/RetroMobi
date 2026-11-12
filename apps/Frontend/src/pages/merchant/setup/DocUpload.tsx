import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useT } from "../../../i18n";

/** One big "take a photo or choose a file" button. Picks files; the caller uploads them. */
export function DocUpload({
  label,
  accept,
  capture,
  multiple,
  busy,
  onFiles,
}: {
  label: string;
  accept: string;
  capture?: boolean;
  multiple?: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="mb-4">
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture: "environment" as const } : {})}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          setNames(files.map((f) => f.name));
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong px-4 text-center text-ink-2 hover:bg-surface-3 disabled:opacity-40"
      >
        <Camera className="h-6 w-6" aria-hidden />
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="text-xs text-ink-3">{busy ? t("common.saving") : names.length ? names.join(", ") : t("common.takePhoto")}</span>
      </button>
    </div>
  );
}
