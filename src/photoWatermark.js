const DEFAULT_LOGO = "/ennstal-connect-wordmark.svg";

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
  const pad = Math.max(18, Math.round(width * 0.02));
  const logoWidth = Math.min(Math.max(Math.round(width * 0.20), 150), 340);
  const logoRatio = logo ? ((logo.naturalHeight || logo.height || 70) / (logo.naturalWidth || logo.width || 370)) : (70 / 370);
  const logoHeight = Math.max(28, Math.round(logoWidth * logoRatio));
  const label = mode === "event" ? "Community Fotograf" : "Ennstal Connect";
  const fontSize = Math.max(14, Math.round(width * 0.012));
  const x = width - logoWidth - pad;
  const y = height - logoHeight - fontSize - pad - 6;

  ctx.save();
  ctx.globalAlpha = 0.68;
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = Math.max(2, Math.round(width * 0.002));
  ctx.shadowOffsetY = Math.max(1, Math.round(width * 0.001));

  if (logo) {
    ctx.drawImage(logo, x, y, logoWidth, logoHeight);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.max(18, fontSize + 4)}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("ennstal connect", width - pad, y + logoHeight);
  }

  ctx.globalAlpha = 0.78;
  ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.16));
  ctx.strokeStyle = "rgba(0,0,0,0.46)";
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  const labelY = y + logoHeight + 4;
  ctx.strokeText(label, width - pad, labelY);
  ctx.fillText(label, width - pad, labelY);
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
