async function safe(label, request, fallback = null) {
  const { data, error } = await request;

  if (error) {
    console.error(label, error);
    return fallback;
  }

  return data ?? fallback;
}

async function loadAll() {
  if (!user?.id) return;

  setLoading(true);

  try {
    const profileData = await safe(
      "Profil laden",
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle(),
      null
    );

    setProfile(profileData);

    const [
      membersData,
      newsData,
      forumData,
      permissionsData
    ] = await Promise.all([
      safe(
        "Mitglieder laden",
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        []
      ),

      safe(
        "News laden",
        supabase
          .from("news")
          .select(`
            *,
            profiles (
              id,
              nickname,
              first_name,
              last_name,
              avatar_url,
              role
            )
          `)
          .order("created_at", { ascending: false }),
        []
      ),

      safe(
        "Forum laden",
        supabase
          .from("forum_posts")
          .select(`
            *,
            profiles (
              id,
              nickname,
              first_name,
              last_name,
              avatar_url,
              role
            )
          `)
          .order("created_at", { ascending: false }),
        []
      ),

      safe(
        "Berechtigungen laden",
        supabase
          .from("user_permissions")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        {}
      )
    ]);

    setMembers(membersData);
    setNews(newsData);
    setForumPosts(forumData);
    setPermissions(permissionsData || {});
  } finally {
    setLoading(false);
  }
}
