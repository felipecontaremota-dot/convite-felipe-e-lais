import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  getDocument,
  OPS,
  type TextItem,
} from "pdfjs-dist/legacy/build/pdf.mjs";
export async function readPdf(bytes: Uint8Array | Blob) {
  const task = getDocument({
    data:
      bytes instanceof Blob
        ? new Uint8Array(await bytes.arrayBuffer())
        : new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const document = await task.promise;
  const pages = [];
  try {
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is TextItem => "str" in item,
      );
      pages.push({
        text: items
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " "),
        items,
        width: page.view[2],
        height: page.view[3],
      });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

export const pdfMonogram = new Uint8Array(
  readFileSync("assets/branding/Monograma Dourado F & L.png"),
);

export async function readPdfImages(blob: Blob) {
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const document = await task.promise;
  const images = [];
  try {
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const operators = await page.getOperatorList();
      for (let i = 0; i < operators.fnArray.length; i++) {
        if (operators.fnArray[i] !== OPS.paintImageXObject) continue;
        const image = page.objs.get(operators.argsArray[i][0]);
        const transformIndex = operators.fnArray
          .slice(0, i)
          .lastIndexOf(OPS.transform);
        const alpha = Uint8Array.from(
          { length: image.width * image.height },
          (_, pixel) => image.data[pixel * 4 + 3],
        );
        images.push({
          page: n,
          width: image.width,
          height: image.height,
          transform: operators.argsArray[transformIndex] as number[],
          rgbaHash: createHash("sha256").update(image.data).digest("hex"),
          alphaHash: createHash("sha256").update(alpha).digest("hex"),
        });
      }
    }
    return images;
  } finally {
    await task.destroy();
  }
}
