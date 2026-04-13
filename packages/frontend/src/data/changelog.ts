export const APP_VERSION = '2.6.0';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: { type: 'feat' | 'fix' | 'perf' | 'chore'; text: string }[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '2.6.0',
    date: '2026-04-12',
    changes: [
      { type: 'feat', text: 'Banners: space-theme redesign — dark starfield background with deterministic star placement, top-right clock (HH:MM), date, client bandwidth panel, and bottom stats bar (Clients / Channels / Uptime)' },
      { type: 'feat', text: 'Banners: per-client personalized banners — each connected user sees their own stats via a ?cuid= query param resolved by the setBannerUrl bot flow action on clientconnect' },
      { type: 'feat', text: 'Banners: "Copy Personalized URL" button copies the URL template with {{client_unique_identifier}} placeholder ready to paste into a setBannerUrl bot action' },
      { type: 'feat', text: 'Bot Flows: new Set Banner URL action node — calls clientedit to set a per-client host banner URL; pairs with the clientconnect trigger for automatic personalization' },
      { type: 'fix',  text: 'Banners: music bots managed by ts6-manager are now excluded from the client info block — human users are shown instead' },
      { type: 'feat', text: 'Banner Editor: background type selector — Solid / Gradient / Stars; gradient end color relabeled "Highlight color" in stars mode; bottom bar visibility toggle' },
    ],
  },
  {
    version: '2.5.0',
    date: '2026-04-12',
    changes: [
      { type: 'feat', text: 'Banners: dynamic server banner feature for TS3 and TS6 — generates a live PNG/SVG image at 630×236 or 921×236' },
      { type: 'feat', text: 'Banners: client table shows per-client upload/download rates, online duration, total connections, and country code' },
      { type: 'feat', text: 'Banners: interactive visual editor with drag-to-reposition elements, color pickers, font size, alignment, and gradient background support' },
      { type: 'feat', text: 'Banners: banner URL shown on management page with one-click copy and inline TS3/TS6 setup instructions' },
    ],
  },
  {
    version: '2.4.0',
    date: '2026-04-07',
    changes: [
      { type: 'feat', text: 'Privilege Keys: added Create Privilege Key dialog with server group dropdown (type 0) and manual channel group + channel ID entry (type 1)' },
      { type: 'fix',  text: 'Server Groups: list is now sorted by TS3 sort order then alphabetically in all views including bot editor dropdowns' },
      { type: 'feat', text: 'Logging: container logs now use pino-pretty for human-readable output (LOG_PRETTY=true baked into Dockerfile)' },
      { type: 'feat', text: 'UI: added changelog dialog accessible from the version badge on login page and sidebar footer' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-04-07',
    changes: [
      { type: 'feat', text: 'AFK Mover: new "checkMuteState" option moves clients with both mic and speakers muted immediately, regardless of idle time' },
      { type: 'feat', text: 'AFK Mover: move-back on unmute — when client unmutes, they are returned to their original channel via Valkey-stored origin' },
      { type: 'fix',  text: 'Bot engine: temp.* variables in conditions (e.g. temp.ci.client_output_muted == 1) now evaluate correctly — numeric strings were not being coerced before expr-eval comparison' },
      { type: 'fix',  text: 'Bot engine: normalizeFlowData now preserves all AFK Mover config fields including checkMuteState — previously dropped on load' },
      { type: 'fix',  text: 'Bot engine: conditions using {{...}} wrappers now evaluate correctly — wrappers are stripped before passing to expr-eval scope' },
      { type: 'fix',  text: 'Bot engine: Valkey GET/SET/DELETE errors are non-fatal — flows continue gracefully when Redis is unavailable' },
      { type: 'feat', text: 'Bot engine: info-level logging for status change detection, event expansion, trigger matching, and condition evaluation results' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-04-07',
    changes: [
      { type: 'feat', text: 'Bot Editor: all channel ID fields replaced with ChannelSelect dropdown — no more typing raw channel IDs' },
      { type: 'feat', text: 'Bot Editor: trigger event filter UI — add key/value filters directly in the node config panel' },
      { type: 'feat', text: 'Settings: Query Bot Channel picker — choose which channel the SSH query bot joins on connect' },
      { type: 'feat', text: 'Settings: Bot Nickname field — set the display name for the query bot' },
      { type: 'feat', text: 'Settings: SSH Bot Nickname field — separate nickname for the SSH voice bot' },
      { type: 'feat', text: 'Settings: Protected Channel IDs field upgraded to multi-select picker with tag badges' },
      { type: 'fix',  text: 'Settings: saving a connection no longer requires re-entering the API key' },
      { type: 'fix',  text: 'Settings: nickname changes are applied to the live TS3 server immediately on save' },
      { type: 'fix',  text: 'Channels API: fixed path to include /vs/ segment (was returning 404)' },
      { type: 'fix',  text: 'SSH query bot: defaults to server default channel when queryBotChannel is unset' },
      { type: 'fix',  text: 'SSH query bot: moves to new channel immediately when queryBotChannel is saved without requiring restart' },
      { type: 'fix',  text: 'Client connect: added 1s delay before clientmove to prevent silent failure when TS3 has not fully seated the client' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-04-06',
    changes: [
      { type: 'feat', text: 'Bot Flows: added Generate Token action node — creates TS3 privilege tokens (server group or channel group type)' },
      { type: 'feat', text: 'Bot Flows: added Set Client Channel Group action node' },
      { type: 'feat', text: 'Bot Flows: added Valkey (Redis) GET / SET / DELETE action nodes for persistent key-value storage across executions' },
      { type: 'feat', text: 'Bot Flows: added Group Remove All and Group Restore List action nodes for role save/restore patterns' },
      { type: 'feat', text: 'Bot Flows: added Generate Code action node — produces random alphanumeric or numeric-only codes' },
      { type: 'feat', text: 'Bot Engine: new synthetic events — client_is_recording, notifyclientupdated with nickname detection' },
      { type: 'feat', text: 'Music Bots: now-playing info written to configurable channel description in real time' },
      { type: 'feat', text: 'Music Bots: query bot joins configurable channel on connect' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-04-04',
    changes: [
      { type: 'chore', text: 'Runtime migrated from Node.js to Bun for faster startup and built-in TypeScript execution' },
      { type: 'chore', text: 'Dependency upgrades across the full stack: node-cron 3→4, Express 4→5, React 18→19, Vite 6→7, Zod 3→4, react-router 6→7, recharts 2→3, TypeScript 5→6, Prisma 6→7 (better-sqlite3 adapter), Tailwind CSS 3→4, tailwind-merge 2→3' },
      { type: 'feat',  text: 'Security: auth routes use async/await, JWT_SECRET missing is now a fatal startup error, parseIntParam helper prevents injection' },
      { type: 'feat',  text: 'Reliability: connection pool health checks, autoStart errors surfaced in UI' },
      { type: 'feat',  text: 'Observability: pino structured logger replaces console.log throughout backend' },
      { type: 'fix',   text: 'Webhook routes updated for Express 5 / path-to-regexp v8 path syntax' },
      { type: 'fix',   text: 'Prisma config: correct datasource.url usage with better-sqlite3 driver adapter' },
      { type: 'fix',   text: 'Startup crash errors now surfaced in logs instead of silently exiting' },
    ],
  },
];
