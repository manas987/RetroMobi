import { useEffect, useRef, useState } from "react";

/** Ticks down from `seconds` to 0 once started; call `start()` to (re)start it. Same as the website's. */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function start(duration = seconds) {
    const end = Date.now() + Math.max(0, duration) * 1000;
    setRemaining(Math.max(0, Math.ceil(duration)));
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      const next = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemaining(next);
      if (!next && timer.current) clearInterval(timer.current);
    }, 1000);
  }

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  return { remaining, start };
}
