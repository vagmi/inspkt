import { h } from "preact";
import type { PublicItem } from "./api";

/** The rendered widget. Replace this with whatever your embed should show —
 * a form, a booking button, a live counter, etc. */
export function EmbedView({ item }: { item: PublicItem }) {
  return (
    <div class="card">
      <p class="kicker">Mudhal widget</p>
      <h3 class="title">{item.name}</h3>
      {item.description ? <p class="body">{item.description}</p> : null}
    </div>
  );
}
