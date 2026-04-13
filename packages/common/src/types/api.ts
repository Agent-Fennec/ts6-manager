// REST API Types between Frontend <-> Backend

// Auth
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'moderator' | 'viewer';
}

// Server Connection Config
export interface ServerConfig {
  id: number;
  name: string;
  host: string;
  webqueryPort: number;
  useHttps: boolean;
  sshPort: number;
  hasSshCredentials: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface CreateServerConfig {
  name: string;
  host: string;
  webqueryPort: number;
  apiKey: string;
  useHttps: boolean;
  sshPort: number;
  sshUsername?: string;
  sshPassword?: string;
}

export interface UpdateServerConfig {
  name?: string;
  host?: string;
  webqueryPort?: number;
  apiKey?: string;
  useHttps?: boolean;
  sshPort?: number;
  sshUsername?: string;
  sshPassword?: string;
  enabled?: boolean;
}

// Dashboard
export interface DashboardData {
  serverName: string;
  platform: string;
  version: string;
  onlineUsers: number;
  maxClients: number;
  uptime: number;
  channelCount: number;
  bandwidth: {
    incoming: number;
    outgoing: number;
  };
  packetloss: number;
  ping: number;
}

// Channel operations
export interface CreateChannelRequest {
  channel_name: string;
  channel_topic?: string;
  channel_description?: string;
  channel_password?: string;
  cpid?: number;
  channel_order?: number;
  channel_codec?: number;
  channel_codec_quality?: number;
  channel_maxclients?: number;
  channel_maxfamilyclients?: number;
  channel_flag_permanent?: number;
  channel_flag_semi_permanent?: number;
  channel_flag_temporary?: number;
  channel_flag_default?: number;
  channel_needed_talk_power?: number;
}

export interface MoveChannelRequest {
  cpid: number;
  order?: number;
}

// Client actions
export interface KickClientRequest {
  reasonid: 4 | 5; // 4=channel, 5=server
  reasonmsg?: string;
}

export interface BanClientRequest {
  time?: number; // seconds, 0=permanent
  banreason?: string;
}

export interface MoveClientRequest {
  cid: number;
  cpw?: string;
}

export interface PokeClientRequest {
  msg: string;
}

export interface MessageRequest {
  targetmode: 1 | 2 | 3; // 1=client, 2=channel, 3=server
  target?: number;
  msg: string;
}

// Ban
export interface CreateBanRequest {
  ip?: string;
  name?: string;
  uid?: string;
  time?: number;
  banreason?: string;
}

// Token
export interface CreateTokenRequest {
  tokentype: 0 | 1; // 0=server group, 1=channel group tokens)
  tokenid1: number; // group id
  tokenid2: number; // channel id (for channel group tokens)
  tokendescription?: string;
}

// Group operations
export interface CreateGroupRequest {
  name: string;
  type?: number;
}

export interface GroupMemberAction {
  cldbid: number;
}

// Permission operations
export interface SetPermissionRequest {
  permid?: number;
  permsid?: string;
  permvalue: number;
  permnegated?: number;
  permskip?: number;
}

// User management (webapp)
export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  role: 'admin' | 'moderator' | 'viewer';
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: 'admin' | 'moderator' | 'viewer';
  enabled?: boolean;
  password?: string;
}

// Generic API response wrapper
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code?: number;
  details?: string;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

// === Server Widget / Banner ===

export type WidgetTheme = 'dark' | 'light' | 'transparent' | 'neon' | 'military' | 'minimal';
export type WidgetType = 'widget' | 'banner';
export type BannerSize = 'standard' | 'wide'; // 630×236 or 921×236

export type BannerElementId =
  | 'server-name'
  | 'server-host'
  | 'stat-online'
  | 'stat-uptime'
  | 'stat-channels'
  | 'stat-bandwidth'
  | 'stat-time'        // HH:MM clock
  | 'stat-date'        // DD.MM.YYYY date
  | 'stat-version'     // server version string
  | 'stat-client-info' // top-client bandwidth + connection block
  | 'client-table'
  | 'timestamp'
  | 'custom-text';

export interface BannerElement {
  id: BannerElementId;
  visible: boolean;
  x: number; // 0–100 (% of banner width)
  y: number; // 0–100 (% of banner height)
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  maxItems?: number;   // client-table: max rows
  showColumns?: BannerClientColumn[]; // client-table: which columns
  value?: string;      // custom-text: content
}

export type BannerClientColumn = 'country' | 'nickname' | 'upload' | 'download' | 'online-time' | 'connections';

export interface BannerLayout {
  backgroundType: 'solid' | 'gradient' | 'stars';
  backgroundColor: string;
  backgroundGradientEnd?: string;
  accentColor: string;
  showBottomBar?: boolean;
  elements: BannerElement[];
}

export const DEFAULT_BANNER_LAYOUT: BannerLayout = {
  backgroundType: 'stars',
  backgroundColor: '#0b1322',
  backgroundGradientEnd: '#0f1f3d',
  accentColor: '#e6edf3',
  showBottomBar: true,
  elements: [
    { id: 'server-name',      visible: true,  x: 50, y: 45, fontSize: 22, color: '#e6edf3', align: 'center' },
    { id: 'stat-time',        visible: true,  x: 97, y: 22, fontSize: 30, color: '#e6edf3', align: 'right' },
    { id: 'stat-date',        visible: true,  x: 97, y: 36, fontSize: 10, color: '#8b949e', align: 'right' },
    { id: 'stat-version',     visible: true,  x: 97, y: 5,  fontSize: 8,  color: '#4a5568', align: 'right' },
    { id: 'stat-client-info', visible: true,  x: 3,  y: 5,  fontSize: 9,  color: '#c9d1d9', align: 'left' },
    { id: 'stat-online',      visible: false, x: 3,  y: 23, fontSize: 11, color: '#8b949e', align: 'left' },
    { id: 'stat-uptime',      visible: false, x: 3,  y: 32, fontSize: 11, color: '#8b949e', align: 'left' },
    { id: 'stat-channels',    visible: false, x: 38, y: 23, fontSize: 11, color: '#8b949e', align: 'left' },
    { id: 'stat-bandwidth',   visible: false, x: 38, y: 32, fontSize: 11, color: '#8b949e', align: 'left' },
    { id: 'client-table',     visible: false, x: 3,  y: 44, fontSize: 10, color: '#e6edf3', align: 'left',
      maxItems: 5, showColumns: ['country', 'nickname', 'upload', 'download', 'online-time', 'connections'] },
    { id: 'server-host',      visible: false, x: 3,  y: 85, fontSize: 9,  color: '#8b949e', align: 'left' },
    { id: 'timestamp',        visible: false, x: 97, y: 85, fontSize: 9,  color: '#8b949e', align: 'right' },
    { id: 'custom-text',      visible: false, x: 50, y: 85, fontSize: 9,  color: '#8b949e', align: 'center', value: '' },
  ],
};

export interface WidgetConfig {
  id: number;
  name: string;
  token: string;
  serverConfigId: number;
  virtualServerId: number;
  theme: WidgetTheme;
  type: WidgetType;
  bannerSize: BannerSize;
  bannerLayout: string | null; // JSON-serialised BannerLayout
  showChannelTree: boolean;
  showClients: boolean;
  hideEmptyChannels: boolean;
  maxChannelDepth: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWidgetRequest {
  name: string;
  serverConfigId: number;
  virtualServerId?: number;
  type?: WidgetType;
  theme?: WidgetTheme;
  bannerSize?: BannerSize;
  bannerLayout?: string;
  showChannelTree?: boolean;
  showClients?: boolean;
  hideEmptyChannels?: boolean;
  maxChannelDepth?: number;
}

export interface UpdateWidgetRequest {
  name?: string;
  theme?: WidgetTheme;
  bannerSize?: BannerSize;
  bannerLayout?: string;
  showChannelTree?: boolean;
  showClients?: boolean;
  hideEmptyChannels?: boolean;
  maxChannelDepth?: number;
}

/** A single client entry included in banner data */
export interface BannerClient {
  clid: number;
  uid: string;             // client_unique_identifier — used for personalized banner URL routing
  nickname: string;
  country: string;         // 2-letter ISO code, e.g. "US"
  onlineDuration: number;  // seconds
  totalConnections: number;
  uploadBytesLastMin: number;
  downloadBytesLastMin: number;
}

export interface WidgetData {
  serverName: string;
  serverHost: string;
  serverPort: number;
  onlineUsers: number;
  maxClients: number;
  uptime: number;
  channelCount: number;
  serverUploadBytesLastMin: number;
  serverDownloadBytesLastMin: number;
  platform: string;
  version: string;
  theme: WidgetTheme;
  type: WidgetType;
  bannerSize: BannerSize;
  bannerLayout: string | null;
  showChannelTree: boolean;
  showClients: boolean;
  channelTree: WidgetChannelNode[];
  bannerClients: BannerClient[];
  fetchedAt: string;
}

export interface WidgetChannelNode {
  cid: number;
  name: string;
  hasPassword: boolean;
  isspacer: boolean;
  spacerType: 'line' | 'dotline' | 'dashline' | 'center' | 'left' | 'right' | 'none';
  spacerText: string;
  clients: WidgetClient[];
  children: WidgetChannelNode[];
}

export interface WidgetClient {
  clid: number;
  nickname: string;
  isAway: boolean;
  isMuted: boolean;
}
