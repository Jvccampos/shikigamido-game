import { Container, Text } from "pixi.js";
export const colors = [0x76d8ec, 0xf29a7a, 0xc7a3ee];
export const label = (text: string, size: number, color = 0xf6e3b7) =>
  new Text({
    text,
    style: {
      fontFamily: "ShikigamidoJP, Alegreya Sans, Arial",
      fontSize: size,
      fill: color,
      fontWeight: "600",
      dropShadow: { alpha: 0.8, blur: 3, distance: 1, color: 0x071614 },
    },
  });

export function clear(container: Container) {
  for (const child of container.removeChildren())
    child.destroy({ children: true });
}
