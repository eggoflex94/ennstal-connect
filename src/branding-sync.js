import { supabase } from "./supabaseClient";

const applyBranding = ({ title, favicon_svg: faviconSvg } = {}) => {
  if (title) document.title = title;
  if (!faviconSvg) return;

  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }

  icon.type = "image/svg+xml";
  icon.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(faviconSvg)}`;
};

async function syncBranding() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("app_branding")
    .select("title,favicon_svg")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.warn("App-Branding konnte nicht aus Supabase geladen werden:", error.message);
    return;
  }

  applyBranding(data);
}

void syncBranding();
