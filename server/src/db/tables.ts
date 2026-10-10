/** Prefixed table names — avoid collisions on shared Hostinger databases. */
export const T = {
  users: 'rs_users',
  accounts: 'rs_accounts',
  oauthStates: 'rs_oauth_states',
  media: 'rs_media',
  posts: 'rs_posts',
  deliveries: 'rs_deliveries',
} as const;
