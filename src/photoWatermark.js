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
  const pad = Math.max(14, Math.round(width * 0.015));
  const blockWidth = Math.min(Math.max(Math.round(width * 0.22), 180), 480);
  const logoRatio = logo ? ((logo.naturalHeight || logo.height || 72) / (logo.naturalWidth || logo.width || 300)) : (72 / 300);
  const logoHeight = Math.max(36, Math.round(blockWidth * logoRatio));
  const label = mode === "event" ? "Community Fotograf" : "";
  const fontSize = Math.max(14, Math.round(width * 0.012));
  const labelGap = label ? Math.max(8, Math.round(fontSize * 0.55)) : 0;
  const blockHeight = logoHeight + (label ? fontSize + labelGap : 0) + 22;
  const x = width - blockWidth - pad;
  const y = height - blockHeight - pad;

  ctx.save();
  ctx.fillStyle = "rgba(7, 24, 38, 0.70)";
  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.0012));
  const radius = Math.max(10, Math.round(blockHeight * 0.12));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, blockWidth, blockHeight, radius);
  else ctx.rect(x, y, blockWidth, blockHeight);
  ctx.fill();
  ctx.stroke();

  if (logo) {
    const innerWidth = blockWidth - 24;
    const innerHeight = Math.min(logoHeight, blockHeight - (label ? fontSize + labelGap + 22 : 20));
    ctx.globalAlpha = 1;
    ctx.drawImage(logo, x + 12, y + 10, innerWidth, innerHeight);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.max(18, fontSize + 4)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ENNSTAL CONNECT", x + blockWidth / 2, y + Math.max(24, logoHeight / 2));
  }

  if (label) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, x + blockWidth / 2, y + blockHeight - 8);
  }
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
