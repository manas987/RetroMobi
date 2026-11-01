import { useEffect, useRef, useState } from "react";

/** Ticks down from `seconds` to 0 once started; call `start()` to (re)start it. */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    setRemaining(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  return { remaining, start };
}
