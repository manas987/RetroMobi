import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useT } from "../../../i18n";

/**
 * One big "take a photo or choose a file" button. Picks files; the caller
 * uploads them. No `capture`: on Android it skips the chooser and opens the
 * camera, so a PDF or a photo already in the gallery couldn't be picked. The
 * chooser offers the camera anyway.
 */
export function DocUpload({
  label,
  accept,
  multiple,
  busy,
  onFiles,
}: {
  label: string;
  accept: string;
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
