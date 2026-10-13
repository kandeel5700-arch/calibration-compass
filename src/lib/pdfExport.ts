import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Convert newer CSS color spaces to sRGB. html2canvas does not support
 * lab()/lch()/oklab()/oklch() in the version used by this app.
 */
function resolveColor(value: string): string {
  if (!value || !/(?:ok)?(?:lch|lab)\s*\(|color\(/i.test(value)) return value;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "#000000";

  try {
    context.fillStyle = "#000000";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return a === 255
      ? "rgb(" + r + ", " + g + ", " + b + ")"
      : "rgba(" + r + ", " + g + ", " + b + ", " + (a / 255).toFixed(3) + ")";
  } catch {
    return "#000000";
  }
}

const MODERN_COLOR = /(?:ok)?(?:lch|lab)\s*\(|color\(/i;
const COLOR_PROPS = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "fill",
  "stroke",
  "textDecorationColor",
  "caretColor",
  "columnRuleColor",
] as const;

function inlineSafeColors(root: HTMLElement) {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of all) {
    const computed = getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const value = (computed as any)[prop] as string | undefined;
      if (value && MODERN_COLOR.test(value)) {
        (el.style as any)[prop] = resolveColor(value);
      }
    }

    // Compound properties can contain color functions html2canvas cannot parse.
    for (const prop of ["backgroundImage", "boxShadow", "textShadow", "filter", "backdropFilter"]) {
      const value = (computed as any)[prop] as string | undefined;
      if (value && MODERN_COLOR.test(value)) (el.style as any)[prop] = "none";
    }
  }
}

export async function exportElementToPDF(
  element: HTMLElement,
  fileName: string,
  opts: { orientation?: "portrait" | "landscape" } = {}
) {
  // Wait for any pending images
  const imgs = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = res;
            img.onerror = res;
          })
    )
  );

  // Clone the element off-screen so we can mutate styles without affecting UI.
  const clone = element.cloneNode(true) as HTMLElement;
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.width = element.scrollWidth + "px";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  inlineSafeColors(clone);

  const bg = resolveColor(
    getComputedStyle(document.body).backgroundColor || "#ffffff"
  );
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
    document.body.removeChild(wrapper);
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
