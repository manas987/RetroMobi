import { useState } from "react";
import { usePreventRemove } from "expo-router";
import { ConfirmSheet, Text } from "@retromobi/mobile-shared";

export function useDiscardChanges(dirty: boolean, busy: boolean) {
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [allowed, setAllowed] = useState(false);
  const disabled = usePreventRemove(!allowed && (dirty || busy), ({ repeat }) => {
    if (!busy) setDiscard(() => repeat);
  });
  return {
    leave: () => { setAllowed(true); disabled(); },
    dialog: <ConfirmSheet open={!!discard} title="Discard your changes?" body={<Text>Your unsaved changes will be lost.</Text>}
      confirmLabel="Discard changes" cancelLabel="Keep editing" danger onClose={() => setDiscard(null)} onConfirm={() => {
        if (!discard) return;
        setAllowed(true);
        setDiscard(null);
        discard();
      }} />,
  };
}
