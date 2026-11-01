import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A centered overlay dialog. Exists so editing one card in a grid (Branches,
 * etc.) doesn't grow that grid cell and visually stretch its row-mate — CSS
 * grid rows size to the tallest cell in the row, so inline-expanding content
 * made an untouched sibling card look like it had expanded too.
 */
export function Modal({
  open,
  onClose,
  title,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Wider cap for content that needs more than a single form column, e.g. a
   *  two-section booking detail. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1100] bg-ink/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-[1101] w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-panel bg-surface p-5 shadow-[0_24px_48px_rgba(18,22,26,0.18)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
            <Dialog.Close className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-3 transition-colors text-ink-2">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
