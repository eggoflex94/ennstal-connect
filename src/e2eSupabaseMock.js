const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";
const REGION_ID = "00000000-0000-4000-8000-000000000010";

function roleFromLocation() {
  const value = new URL(window.location.href).searchParams.get("e2eRole") || "MEMBER";
  return ["MEMBER", "ADMIN", "HEAD_ADMIN"].includes(value) ? value : "MEMBER";
}

function currentProfile() {
  const role = roleFromLocation();
  return {
    id: USER_ID,
    nickname: role === "HEAD_ADMIN" ? "E2E Hauptadmin" : role === "ADMIN" ? "E2E Admin" : "E2E Mitglied",
    first_name: "E2E",
    last_name: "Test",
    role,
    account_status: "ACTIVE",
    account_badge: null,
    home_region_id: REGION_ID,
    avatar_url: null,
    profile_layout: "standard",
    is_online: true,
    last_active_at: new Date().toISOString(),
    presence_device: "DESKTOP",
    hide_online_status: false,
    is_test_account: false,
    privacy_settings: {},
    rules_accepted_at: new Date().toISOString(),
    community_points: 42,
    purchase_points: 0,
    total_online_seconds: 3600
  };
}

function otherProfile() {
  return {
    id: OTHER_ID,
    nickname: "E2E Testperson",
    first_name: "Test",
    last_name: "Person",
    role: "MEMBER",
    account_status: "ACTIVE",
    account_badge: null,
    home_region_id: REGION_ID,
    avatar_url: null,
    profile_layout: "standard",
    is_online: true,
    last_active_at: new Date().toISOString(),
    presence_device: "DESKTOP",
    hide_online_status: false,
    is_test_account: false,
    privacy_settings: {},
    rules_accepted_at: new Date().toISOString()
  };
}

function rowsFor(table, single) {
  const me = currentProfile();
  const other = otherProfile();
  const rows = {
    profiles: [me, other],
    regions: [{ id: REGION_ID, slug: "ennstal", name: "Ennstal", short_name: "Ennstal", description: "E2E Region", accent: "#ffffff", sort_order: 1, is_active: true }],
    community_rule_acceptances: [{ user_id: USER_ID, rules_version: "2026-09-05", accepted_at: new Date().toISOString() }],
    regional_admin_assignments: roleFromLocation() === "ADMIN" ? [{ user_id: USER_ID, region_id: REGION_ID, active: true }] : [],
    regional_moderation_assignments: [],
    user_blocks: [],
    user_feature_locks: [],
    friendships: [],
    messages: [{ id: "msg-e2e", sender_id: OTHER_ID, receiver_id: USER_ID, content: "E2E Nachricht", is_read: false, created_at: new Date().toISOString() }],
    homepage_sections: [{ id: "home-e2e", region_id: REGION_ID, is_visible: true, sort_order: 1, title: "E2E Startseite", content: "Stabilitätstest", frame_style: "standard" }],
    user_reports: [],
    news: [{ id: "news-e2e", region_id: REGION_ID, title: "E2E Neuigkeit", content: "Test", created_at: new Date().toISOString() }],
    community_events: [{ id: "event-e2e", region_id: REGION_ID, title: "E2E Event", event_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() }],
    community_ads: [{ id: "ad-e2e", region_id: REGION_ID, title: "E2E Anzeige", is_active: true, created_at: new Date().toISOString() }],
    member_photos: [{ id: "photo-e2e", user_id: OTHER_ID, image_url: "/ennstal-connect-logo-v2.png", created_at: new Date().toISOString() }],
    member_photo_likes: [],
    member_photo_comments: [],
    community_event_rsvps: [],
    profile_visits: [],
    forum_posts: [{ id: "post-e2e", author_id: OTHER_ID, region_id: REGION_ID, title: "E2E Forum", content: "Testbeitrag", created_at: new Date().toISOString() }],
    forum_replies: [],
    profile_activity: [],
    public_profile_updates: [],
    community_requests: [],
    user_permissions: [{ user_id: USER_ID, manage_members: true, manage_points: true, manage_messages: true, manage_media: true, manage_roles: true, manage_admins: true, view_profile_visits: true, manage_news: true, manage_groups: true, manage_events: true, manage_marketplace: true, manage_friend_requests: true, manage_homepage: true, manage_reports: true }],
    notifications: []
  }[table] || [];

  if (!single) return rows;
  if (table === "profiles") return rows[0] || null;
  return rows[0] || null;
}

function makeQuery(table) {
  let single = false;
  let head = false;
  const query = new Proxy({}, {
    get(_target, key) {
      if (key === "then") {
        return (resolve, reject) => Promise.resolve({
          data: head ? null : rowsFor(table, single),
          error: null,
          count: head ? 0 : undefined
        }).then(resolve, reject);
      }
      if (key === "maybeSingle" || key === "single") {
        return () => { single = true; return query; };
      }
      if (key === "select") {
        return (_columns, options = {}) => { head = options?.head === true; return query; };
      }
      return () => query;
    }
  });
  return query;
}

function rpcData(name) {
  switch (name) {
    case "community_member_directory":
    case "admin_full_member_directory":
    case "admin_member_directory":
      return [currentProfile(), otherProfile()];
    case "ec_region_group_directory":
    case "community_group_directory":
      return [];
    case "ec_region_weekly_poll_current":
    case "weekly_poll_current":
      return null;
    case "ec_region_featured_community_group":
    case "featured_community_group":
      return null;
    case "my_welcome_badges":
      return [];
    case "community_activity_progress":
      return { score: 42, level: "Aktiv", next_score: 75, prestige: null, prestige_next_score: 300, components: { online: 1 }, red_unlocked: false, blue_unlocked: false };
    case "my_suspension_details":
      return { suspended: false };
    case "member_notification_settings":
      return [{ notify_message_popup: true, notify_friend_request_popup: true, notify_forum_reply_popup: true }];
    case "get_admin_log":
      return [];
    case "admin_get_permissions":
      return {};
    default:
      return [];
  }
}

export function createE2EMockSupabase() {
  const user = { id: USER_ID, email: "e2e@example.test", user_metadata: {} };
  return {
    auth: {
      async getSession() { return { data: { session: { user, access_token: "e2e-token" } }, error: null }; },
      async getUser() { return { data: { user }, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async signOut() { return { error: null }; },
      async signInWithPassword() { return { data: { user, session: { user, access_token: "e2e-token" } }, error: null }; },
      async signUp() { return { data: { user, session: { user, access_token: "e2e-token" } }, error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: { user }, error: null }; }
    },
    from(table) { return makeQuery(table); },
    async rpc(name) { return { data: rpcData(name), error: null }; },
    channel() {
      const channel = {
        on() { return channel; },
        subscribe() { return channel; }
      };
      return channel;
    },
    async removeChannel() { return "ok"; },
    storage: {
      from() {
        return {
          async upload() { return { data: { path: "e2e/mock.png" }, error: null }; },
          getPublicUrl() { return { data: { publicUrl: "/ennstal-connect-logo-v2.png" } }; },
          async remove() { return { data: [], error: null }; }
        };
      }
    }
  };
}
