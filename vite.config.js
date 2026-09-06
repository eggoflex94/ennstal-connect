import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function nativeMemberCardPlugin() {
  return {
    name: "ennstal-native-member-card",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/App.jsx")) return null;

      const importLine = 'import MemberCardView from "./MemberCardView.jsx";\n';
      let next = code.includes(importLine.trim()) ? code : code.replace(
        'import { preparePrivilegedAction, supabase, supabaseUnavailableMessage } from "./supabaseClient";\n',
        'import { preparePrivilegedAction, supabase, supabaseUnavailableMessage } from "./supabaseClient";\n' + importLine
      );

      const startMarker = 'function MemberCard({ member, profile, friendships, onOpen, onMessage }) {';
      const endMarker = '\nfunction FriendRequests({ incoming, sent, memberById, respond, cancel })';
      const start = next.indexOf(startMarker);
      const end = next.indexOf(endMarker, start);
      if (start < 0 || end < 0) throw new Error("MemberCard renderer markers not found; build stopped before changing production output.");

      next = next.slice(0, start) +
        'function MemberCard(props) { return <MemberCardView {...props}/>; }\n' +
        next.slice(end + 1);

      // Region is mandatory for new registrations. Keep the patch build-time so the
      // large legacy App.jsx stays untouched while the regional architecture is introduced.
      const oldMetadata = 'gender: String(f.get("gender") || "").trim() } } })';
      const newMetadata = 'gender: String(f.get("gender") || "").trim(), home_region_slug: String(f.get("home_region_slug") || "ennstal").trim() } } })';
      if (!next.includes(oldMetadata)) throw new Error("Registration metadata marker not found; regional build stopped safely.");
      next = next.replace(oldMetadata, newMetadata);

      const oldRegisterFields = '<select name="gender" defaultValue="" required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><input name="email"';
      const newRegisterFields = '<select name="gender" defaultValue="" required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><label className="region-register-label">Deine Heimatregion<small>Hier wirst du Hauptmitglied. Forum, regionale Verwaltung und regionale Inhalte richten sich danach.</small><select name="home_region_slug" defaultValue="ennstal" required><option value="ennstal">Ennstal</option><option value="leoben-bruck-muerzzuschlag">Leoben – Bruck – Mürzzuschlag</option><option value="salzkammergut">Salzkammergut</option></select></label><input name="email"';
      if (!next.includes(oldRegisterFields)) throw new Error("Registration form marker not found; regional build stopped safely.");
      next = next.replace(oldRegisterFields, newRegisterFields);

      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  plugins: [nativeMemberCardPlugin(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("qrcode")) return "qrcode-vendor";
          if (id.includes("lucide-react")) return "icons-vendor";
          return "vendor";
        },
      },
    },
  },
});