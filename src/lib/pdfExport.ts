import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const MODERN_COLOR = /(?:ok)?(?:lch|lab)\s*\(|color\(/i;
const COLOR_PROPS = new Set([
  "color", "background-color", "border-top-color", "border-right-color",
  "border-bottom-color", "border-left-color", "outline-color", "fill", "stroke",
  "text-decoration-color", "caret-color", "column-rule-color",
]);

/** Convert CSS Color 4 values to sRGB bytes so html2canvas never parses lab()/lch(). */
function resolveColor(value: string): string {
  if (!MODERN_COLOR.test(value)) return value;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#000000";
  try {
    ctx.fillStyle = "#000000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255
      ? "rgb(" + r + ", " + g + ", " + b + ")"
      : "rgba(" + r + ", " + g + ", " + b + ", " + (a / 255).toFixed(3) + ")";
  } catch {
    return "#000000";
  }
}

/** Sanitize every computed declaration, including generated ::before/::after content. */
function inlineSafeColors(root: HTMLElement): HTMLStyleElement | undefined {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const pseudoRules: string[] = [];
  const sanitize = (style: CSSStyleDeclaration, apply: (name: string, value: string) => void) => {
    for (let i = 0; i < style.length; i++) {
      const name = style.item(i);
      if (name.startsWith("--")) continue;
      const value = style.getPropertyValue(name);
      if (!MODERN_COLOR.test(value)) continue;
      apply(name, COLOR_PROPS.has(name) ? resolveColor(value) : "initial");
    }
  };

  nodes.forEach((el, index) => {
    sanitize(getComputedStyle(el), (name, value) => el.style.setProperty(name, value, "important"));
    for (const pseudo of ["::before", "::after"]) {
      const computed = getComputedStyle(el, pseudo);
      const declarations: string[] = [];
      sanitize(computed, (name, value) => declarations.push(name + ":" + value + " !important"));
      if (declarations.length) {
        el.setAttribute("data-pdf-safe-color", String(index));
        pseudoRules.push('[data-pdf-safe-color="' + index + '"]' + pseudo + "{" + declarations.join(";") + "}");
      }
    }
  });

  if (!pseudoRules.length) return;
  const style = document.createElement("style");
  style.textContent = pseudoRules.join("\n");
  document.head.appendChild(style);
  return style;
}

export async function exportElementToPDF(
  element: HTMLElement,
  fileName: string,
  opts: { orientation?: "portrait" | "landscape" } = {}
) {
  const imgs = Array.from(element.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((res) => {
    img.onload = res;
    img.onerror = res;
  })));

  const clone = element.cloneNode(true) as HTMLElement;
  const direction = getComputedStyle(element).direction;
  clone.setAttribute("dir", direction);
  clone.style.direction = direction;
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.width = element.scrollWidth + "px";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  const pseudoStyle = inlineSafeColors(clone);
  const bg = resolveColor(getComputedStyle(document.body).backgroundColor || "#ffffff");
  wrapper.style.background = bg;

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: bg,
      logging: false,
      windowWidth: element.scrollWidth,
    });
  } finally {
    wrapper.remove();
    pseudoStyle?.remove();
  }

  const orientation = opts.orientation ?? "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const usableW = pageW - margin * 2;
  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  if (imgH <= pageH - margin * 2) {
    pdf.addImage(imgData, "JPEG", margin, margin, imgW, imgH, undefined, "FAST");
  } else {
    const pageHeightPx = ((pageH - margin * 2) * canvas.width) / usableW;
    let renderedPx = 0;
    let pageIndex = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
      const sliceMm = (sliceHeightPx * usableW) / canvas.width;
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(sliceData, "JPEG", margin, margin, imgW, sliceMm, undefined, "FAST");
      renderedPx += sliceHeightPx;
      pageIndex++;
    }
  }

  pdf.save(fileName);
}
