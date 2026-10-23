import { Buffer } from "node:buffer";
// A real QR matrix in a synthetic Y4M camera stream, using the same QR dependency
// as react-native-qrcode-svg. No decoder, credentials or external services are mocked.
import QRCode from "qrcode";
import { writeFileSync } from "node:fs";
const qr = QRCode.create(process.argv[3], { errorCorrectionLevel: "M" });
const width = 640,
  height = 480,
  scale = 8,
  size = qr.modules.size;
const y = Buffer.alloc(width * height, 235),
  uv = Buffer.alloc((width * height) / 4, 128);
const left = Math.floor((width - size * scale) / 2),
  top = Math.floor((height - size * scale) / 2);
for (let row = 0; row < size; row++)
  for (let col = 0; col < size; col++)
    if (qr.modules.data[row * size + col])
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          y[(top + row * scale + dy) * width + left + col * scale + dx] = 16;
const frame = Buffer.concat([Buffer.from("FRAME\n"), y, uv, uv]);
writeFileSync(
  process.argv[2],
  Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`),
    ...Array(60).fill(frame),
  ]),
);
