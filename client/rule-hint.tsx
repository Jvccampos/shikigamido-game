import { useEffect, useId, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { keywordParts } from "../shared/keyword-help.js";

export function RuleHint({
  label,
  detail,
  tone = "neutral",
}: {
  label: string;
  detail: string;
  tone?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const outside = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node)) dismiss();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [!!position]);
  const show = () => {
    const r = button.current!.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(innerWidth - 292, r.left)),
      top: r.bottom + 8,
    });
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`rule-hint ${tone}`}
        aria-describedby={position ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setPosition(null)}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === "Escape" && position) {
            e.stopPropagation();
            setPosition(null);
          }
        }}
      >
        {label}
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="rule-tooltip"
            style={{
              left: position.left,
              top: Math.min(position.top, innerHeight - 175),
            }}
          >
            <b>{label}</b>
            <span>{detail}</span>
          </div>,
          button.current?.closest("dialog") || document.body,
        )}
    </>
  );
}
export function KeywordText({ text }: { text: string }) {
  return (
    <>
      {keywordParts(text).map((part, i) =>
        part.detail ? (
          <RuleHint key={i} label={part.text} detail={part.detail} />
        ) : (
          part.text
        ),
      )}
    </>
  );
}
