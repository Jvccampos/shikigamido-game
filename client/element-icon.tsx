/** Small vector symbols keep the reference readable without language fonts. */
export function ElementIcon({ element }: { element: string }) {
  return (
    <svg
      className="element-icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {element === "agua" ? (
        <>
          <path d="M16 3C13 9 6 15 6 21a10 10 0 0 0 20 0C26 15 19 9 16 3Z" />
          <path d="M11 21a5 5 0 0 0 5 5" />
        </>
      ) : element === "fogo" ? (
        <>
          <path d="M17 2c2 9-7 9-4 16 3-1 5-4 5-7 5 5 9 8 7 14-3 7-15 7-19 0C2 17 9 12 9 8c1 4 2 5 3 6 0-6 7-7 5-12Z" />
          <path d="M16 20c-7 9 5 12 5 4" />
        </>
      ) : element === "terra" ? (
        <>
          <path d="m3 25 9-19 6 12 4-7 7 14H3Z" />
          <path d="m8 14 4 3 4-3M3 29h26" />
        </>
      ) : element === "vento" ? (
        <>
          <path d="M3 10h17c7 0 7-8 1-8M3 16h23c6 0 6 8 0 8M3 22h12c6 0 6 8 0 8" />
        </>
      ) : (
        <>
          <circle cx="16" cy="16" r="8" />
          <ellipse
            cx="16"
            cy="16"
            rx="15"
            ry="5"
            transform="rotate(-35 16 16)"
          />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
