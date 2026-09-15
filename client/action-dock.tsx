import type { ComponentChildren } from "preact";

export function ActionDock({ children }: { children: ComponentChildren }) {
  return (
    <section className="action-dock" aria-label="Ação da carta">
      {children}
    </section>
  );
}
