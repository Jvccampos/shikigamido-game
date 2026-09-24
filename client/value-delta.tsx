import { useEffect, useRef, useState } from "preact/hooks";

/** Floats a brief "+n" or "−n" beside a counter whenever its value changes. */
export function ValueDelta({ value }: { value: number }) {
  const previous = useRef(value);
  const [shown, setShown] = useState<{ amount: number; id: number } | null>(
    null,
  );
  useEffect(() => {
    const amount = value - previous.current;
    previous.current = value;
    if (!amount) return;
    setShown((last) => ({ amount, id: (last?.id ?? 0) + 1 }));
    const timer = setTimeout(() => setShown(null), 1200);
    return () => clearTimeout(timer);
  }, [value]);
  if (!shown) return null;
  return (
    <span
      key={shown.id}
      className={`value-delta ${shown.amount > 0 ? "gain" : "loss"}`}
      aria-hidden="true"
    >
      {shown.amount > 0 ? `+${shown.amount}` : `−${-shown.amount}`}
    </span>
  );
}
