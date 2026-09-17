do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proname like 'admin_%'
        or p.proname like 'head_admin_%'
        or p.proname like 'member_%'
        or p.proname in (
          'accept_friend_request','accept_group_invitation','buy_nickname_color','claim_online_reward',
          'cleanup_expired_profile_statuses_metadata','cleanup_page_reload_events','create_community_group',
          'create_weekly_poll','decline_group_invitation','delete_community_news','delete_group',
          'delete_private_message','expire_temporary_supporters','forum_create_post','forum_create_reply',
          'forum_delete_post','forum_delete_reply','forum_moderator_warn_user','forum_update_own_post',
          'forum_update_post','forum_update_reply','handle_new_user','invite_to_community_group',
          'join_community_group','leave_community_group','log_profile_activity','log_profile_change',
          'mark_messages_read','my_welcome_badges','record_online_activity','record_online_time',
          'report_member_photo','request_community_group_owner_change','reset_role_scoped_permissions',
          'review_community_group_owner_change','send_friend_request','send_private_message',
          'set_user_offline','set_user_online','update_community_news','update_group',
          'update_my_business_profile','update_my_profile','update_online_status','update_updated_at_column',
          'update_user_suspension','vote_weekly_poll'
        )
        or p.proname in (
          'ec_admin_create_regional_ad','ec_admin_online_statistics','ec_admin_update_event_style',
          'ec_can_admin_region','ec_can_manage_community_announcement','ec_can_manage_community_groups',
          'ec_can_manage_homepage_region','ec_can_manage_sidebar_banners','ec_can_upload_popup_images',
          'ec_change_home_region','ec_create_activity','ec_create_regional_community_group',
          'ec_create_regional_weekly_poll','ec_delete_activity','ec_delete_community_announcement',
          'ec_delete_global_community_announcement','ec_demote_global_to_regional_admin',
          'ec_effective_role_for','ec_enforce_rate_limit','ec_forum_create_regional_post',
          'ec_generic_audit_trigger','ec_has_regional_admin_permission','ec_has_regional_permission',
          'ec_head_set_home_region','ec_is_admin','ec_is_forum_moderator','ec_is_global_admin_user',
          'ec_is_head_admin','ec_is_head_admin_user','ec_is_regional_admin','ec_legal_case_hash',
          'ec_list_manageable_community_announcements','ec_log','ec_moderate_delete_activity',
          'ec_my_event_reminders','ec_notify_admin_forum_on_role_change','ec_notify_admin_forum_reply',
          'ec_notify_regional_admin_forum_on_assignment','ec_publish_profile_update',
          'ec_rate_limit_forum_posts','ec_rate_limit_forum_replies','ec_rate_limit_friend_requests',
          'ec_rate_limit_messages','ec_rate_limit_reports','ec_refresh_member_activity',
          'ec_regional_delete_news','ec_regional_homepage_create','ec_regional_homepage_delete',
          'ec_regional_homepage_update','ec_regional_update_news','ec_role_text',
          'ec_save_community_announcement','ec_save_global_community_announcement',
          'ec_send_admin_forum_welcome','ec_send_assignment_message','ec_send_login_verification_prompt',
          'ec_set_global_admin','ec_set_regional_featured_group','ec_set_regional_moderator'
        )
      )
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
  end loop;
end $$;
