const DEFAULT_LOGO = "/ennstal-connect-logo.svg";

let logoPromise = null;

function loadLogo(src = DEFAULT_LOGO) {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  return logoPromise;
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {}
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function watermarkPhoto(file, { mode = "standard", maxEdge = 2400, quality = 0.9 } = {}) {
  if (!file || (!String(file.type || "").startsWith("image/") && !/\.(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(String(file.name || "")))) {
    throw new Error("Bitte nur Bilddateien auswählen.");
  }

  const source = await decodeImage(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Bildgröße konnte nicht ermittelt werden.");

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Bildverarbeitung wird von diesem Browser nicht unterstützt.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();

  const logo = await loadLogo();
  const pad = Math.max(16, Math.round(width * 0.018));
  const blockWidth = Math.min(Math.max(Math.round(width * 0.28), 220), 560);
  const logoRatio = logo ? ((logo.naturalHeight || logo.height || 72) / (logo.naturalWidth || logo.width || 300)) : (72 / 300);
  const logoHeight = Math.max(44, Math.round(blockWidth * logoRatio));
  const label = mode === "event" ? "Community Fotograf" : "Ennstal Connect";
  const fontSize = Math.max(16, Math.round(width * 0.014));
  const labelGap = Math.max(10, Math.round(fontSize * 0.6));
  const blockHeight = logoHeight + fontSize + labelGap + 28;
  const x = width - blockWidth - pad;
  const y = height - blockHeight - pad;

  ctx.save();
  ctx.fillStyle = "rgba(10,18,28,0.82)";
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = Math.max(1.2, Math.round(width * 0.0014));
  const radius = Math.max(12, Math.round(blockHeight * 0.14));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, blockWidth, blockHeight, radius);
  else ctx.rect(x, y, blockWidth, blockHeight);
  ctx.fill();
  ctx.stroke();

  if (logo) {
    const innerWidth = blockWidth - 28;
    const innerHeight = Math.min(logoHeight, blockHeight - fontSize - labelGap - 26);
    ctx.globalAlpha = 1;
    ctx.drawImage(logo, x + 14, y + 12, innerWidth, innerHeight);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.max(20, fontSize + 5)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ENNSTAL CONNECT", x + blockWidth / 2, y + Math.max(30, logoHeight / 2));
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x + blockWidth / 2, y + blockHeight - 10);
  ctx.restore();

  let type = "image/webp";
  let blob = await canvasBlob(canvas, type, quality);
  if (!blob) {
    type = "image/jpeg";
    blob = await canvasBlob(canvas, type, quality);
  }
  if (!blob) throw new Error("Wasserzeichen konnte nicht erzeugt werden.");

  return {
    blob,
    file: new File([blob], `watermarked-${Date.now()}.${type === "image/webp" ? "webp" : "jpg"}`, { type }),
    extension: type === "image/webp" ? "webp" : "jpg",
    contentType: type
  };
}
