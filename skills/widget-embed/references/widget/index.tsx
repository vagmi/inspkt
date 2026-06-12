// inspkt embeddable widget. Usage on any site:
//   <div data-inspkt="ITEM_ID"></div>
//   <script src="https://<app-host>/widget.js" async></script>
// Renders each tagged element in an isolated shadow root.
import { h, render } from "preact";
import { apiBase, fetchItem } from "./api";
import { EmbedView } from "./embed-view";
import { styles } from "./styles";

const SCRIPT_SRC =
  (document.currentScript as HTMLScriptElement | null)?.src ??
  (
    document.querySelector(
      'script[src*="widget.js"]',
    ) as HTMLScriptElement | null
  )?.src ??
  window.location.href;

const BASE = apiBase(SCRIPT_SRC);

async function mount(el: HTMLElement) {
  if (el.dataset.inspktMounted) return;
  el.dataset.inspktMounted = "1";

  const id = el.dataset.inspkt;
  if (!id) return;

  const shadow = el.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);

  const root = document.createElement("div");
  shadow.appendChild(root);
  root.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const item = await fetchItem(BASE, id);
    root.innerHTML = "";
    render(h(EmbedView, { item }), root);
  } catch (err) {
    console.error("[inspkt] failed to load", id, err);
    root.innerHTML = "";
  }
}

function scan() {
  document
    .querySelectorAll<HTMLElement>("[data-inspkt]")
    .forEach((el) => void mount(el));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scan);
} else {
  scan();
}
