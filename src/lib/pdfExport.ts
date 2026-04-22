import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Capture an HTMLElement into a high-quality multi-page PDF that matches
 * the live design (colors, images, layout) exactly.
 *
 * The element is rendered at 2x scale for crisp output, then sliced
 * across A4 pages if it overflows.
 */
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

  // Resolve actual background color from the page (so PDF matches theme)
  const bg =
    getComputedStyle(document.body).backgroundColor ||
    getComputedStyle(document.documentElement).backgroundColor ||
    "#ffffff";

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: bg,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const orientation = opts.orientation ?? "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 6; // mm
  const usableW = pageW - margin * 2;

  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;

  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  if (imgH <= pageH - margin * 2) {
    pdf.addImage(imgData, "JPEG", margin, margin, imgW, imgH, undefined, "FAST");
  } else {
    // Slice across pages
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
      ctx.drawImage(
        canvas,
        0,
        renderedPx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx
      );
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
