/**
 * Service facade for HTTP controllers and MCP tools.
 * MCP must call these exact functions — not duplicate logic in routes.
 */
export { listConnectedAccounts } from './accounts/accountsService';
export { uploadImage as uploadImage } from './media/mediaService';
export {
  createPost,
  schedulePost,
  getPostById as getPostStatus,
  cancelPost,
} from './posts/postsService';
export { publishPost } from './posts/publishService';
