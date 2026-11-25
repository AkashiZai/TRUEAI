/**
 * Client-Side Visual PII Redaction Engine (HTML5 Canvas)
 * Masks personal phone numbers / contact columns directly on the user's device
 * BEFORE any image pixels leave the browser to Google Gemini Vision API.
 */

export const REDACTION_PRESETS = [
  {
    id: 'phone-column',
    label: 'ปิดคอลัมน์เบอร์โทรด้านขวา (อัตโนมัติ)',
    // Normalized [0..1] coordinates relative to image dimensions
    boxes: [{ x: 0.77, y: 0.21, w: 0.21, h: 0.72, tag: 'PDPA · PHONE REDACTED' }],
  },
  {
    id: 'header-and-phone',
    label: 'ปิดหัวบิล + คอลัมน์เบอร์โทร',
    boxes: [
      { x: 0.03, y: 0.14, w: 0.94, h: 0.06, tag: 'PDPA · HEADER REDACTED' },
      { x: 0.77, y: 0.21, w: 0.21, h: 0.72, tag: 'PDPA · PHONE REDACTED' },
    ],
  },
  {
    id: 'custom-only',
    label: 'ลากปิดเองบนภาพเท่านั้น',
    boxes: [],
  },
];

/**
 * Renders an image onto an offscreen canvas, burns solid blackout bars over
 * all active redaction boxes, and returns a clean redacted PNG Data URL.
 */
export function applyVisualRedaction(rawImageDataUrl, boxes = []) {
  return new Promise((resolve, reject) => {
    if (!rawImageDataUrl) {
      resolve(null);
      return;
    }
    if (!boxes || boxes.length === 0) {
      resolve(rawImageDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      for (const box of boxes) {
        const bx = Math.round(box.x * canvas.width);
        const by = Math.round(box.y * canvas.height);
        const bw = Math.round(box.w * canvas.width);
        const bh = Math.round(box.h * canvas.height);

        // Solid opaque dark pine-charcoal blackout (zero pixel leakage)
        ctx.fillStyle = '#0b1913';
        ctx.fillRect(bx, by, bw, bh);

        // Subtle crisp border + PDPA stamp inside box
        ctx.strokeStyle = '#6ee7b7';
        ctx.lineWidth = Math.max(1.5, canvas.width * 0.002);
        ctx.strokeRect(bx + 1, by + 1, Math.max(0, bw - 2), Math.max(0, bh - 2));

        if (bw > 60 && bh > 22) {
          ctx.save();
          ctx.fillStyle = '#6ee7b7';
          const fontSize = Math.max(10, Math.min(13, Math.round(bw * 0.085)));
          ctx.font = `bold ${fontSize}px "IBM Plex Sans Thai", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label = box.tag || 'PDPA REDACTED';
          if (bh > bw * 1.6) {
            ctx.translate(bx + bw / 2, by + bh / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(label, 0, 0);
          } else {
            ctx.fillText(label, bx + bw / 2, by + bh / 2);
          }
          ctx.restore();
        }
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => reject(err);
    img.src = rawImageDataUrl;
  });
}
