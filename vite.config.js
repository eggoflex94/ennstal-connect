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
