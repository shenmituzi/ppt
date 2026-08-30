/**
 * 商城面板：渲染 SHOP 目录、发送购买消息、显示阳光与盲盒结果。
 * 纯 UI 模块：购买走 onBuy 回调（单机/在线由 main 注入）。
 */
import { SHOP, type ShopEntry } from "@pt/shared";

export interface ShopCallbacks {
  onBuy(itemId: string): void;
  onToggle(open: boolean): void;
}

let toastTimer: number | null = null;

export function initShop(getSun: () => number, callbacks: ShopCallbacks) {
  const panel = document.getElementById("shop-panel")!;
  const toast = document.getElementById("toast")!;

  exportToast(toast);

  function render() {
    const sun = getSun();
    const rows = SHOP.map(e => {
      const afford = sun >= e.price;
      return `<button class="shop-row" data-id="${e.id}" ${afford ? "" : "disabled"}>
        <span class="si">${e.icon}</span>
        <span class="sn">${e.name}<small>${e.desc}</small></span>
        <span class="sp">☀️ ${e.price}</span>
      </button>`;
    }).join("");
    panel.innerHTML = `<div class="shop-head">☀️ 阳光 ${sun} —— 商城</div>${rows}`;
    panel.querySelectorAll("button.shop-row").forEach(btn => {
      btn.addEventListener("click", () => {
        callbacks.onBuy(btn.getAttribute("data-id")!);
        render();
      });
    });
  }

  panel.addEventListener("click", () => render());
  render();
  setInterval(render, 1000); // 阳光变化时刷新可购状态
}

function exportToast(toast: HTMLElement) {
  (window as any).__shopToast = (text: string) => {
    toast.textContent = text;
    toast.classList.remove("hidden");
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.add("hidden");
      toast.classList.remove("show");
    }, 2600);
  };
}

export function shopToast(text: string) {
  (window as any).__shopToast?.(text);
}

export type ShopEntryType = ShopEntry;
