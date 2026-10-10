export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'needs_review';

export type DeliveryStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed';

export type AccountStatus = 'connected' | 'disconnected' | 'expired' | 'error';

export type Platform = 'instagram' | 'facebook' | 'linkedin' | 'x' | 'threads';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface AccountPublic {
  id: string;
  platform: Platform;
  platformAccountId: string;
  username: string;
  displayName: string | null;
  status: AccountStatus;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaPublic {
  id: string;
  cloudinaryPublicId: string;
  secureUrl: string;
  resourceType: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface PostPublic {
  id: string;
  caption: string;
  mediaId: string | null;
  media?: MediaPublic | null;
  scheduledAt: string | null;
  timezone: string;
  status: PostStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  deliveries?: DeliveryPublic[];
}

export interface DeliveryPublic {
  id: string;
  postId: string;
  accountId: string;
  status: DeliveryStatus;
  remotePostId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  account?: AccountPublic | null;
}

export interface DashboardData {
  statistics: {
    totalPosts: number;
    published: number;
    scheduled: number;
    failed: number;
  };
  recentPosts: PostPublic[];
  upcomingPosts: PostPublic[];
  accounts: AccountPublic[];
  recentActivity: DeliveryPublic[];
}

export interface SettingsPublic {
  account: {
    email: string;
    name: string;
    timezone: string;
  };
  instagram: {
    connected: boolean;
    username: string | null;
    tokenStatus: string | null;
  };
  cloudinary: {
    connected: boolean;
    cloudNameMasked: string | null;
    uploadPresetMasked: string;
  };
}
