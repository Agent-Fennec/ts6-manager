import type { PrismaClient } from '../../generated/prisma/index.js';
import { logger } from '../utils/logger.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { EventBridge } from './event-bridge.js';
import { FlowRunner } from './flow-runner.js';
import { buildCommand } from '../voice/tslib/commands.js';
import type { Express, Request, Response } from 'express';
import type { WebSocketServer } from 'ws';
import { schedule as cronSchedule, validate as cronValidate, ScheduledTask } from 'node-cron';
import type {
  FlowDefinition, FlowNode, FlowEdge,
  EventTriggerData, CronTriggerData, WebhookTriggerData, CommandTriggerData,
  AnimatedChannelActionData,
  GenerateTokenActionData, SetClientChannelGroupActionData, SetBannerUrlActionData,
} from '@ts6/common';
import { AnimationManager } from './animation-manager.js';
import type { AnimationConfig } from './animation-manager.js';
import type { VoiceBotManager } from '../voice/voice-bot-manager.js';
import { parseQueryResponse } from '@ts6/common';
import crypto from 'crypto';

// Events derived from poll-detected state changes because TS3/TS6 SSH ServerQuery
// does NOT push these via servernotifyregister.
const CLIENT_UPDATED_SYNTHETIC_EVENTS = new Set([
  'notifyclientupdated',
  'client_went_away', 'client_came_back',
  'client_mic_muted', 'client_mic_unmuted',
  'client_sound_muted', 'client_sound_unmuted',
  'client_mic_disabled', 'client_mic_enabled',
  'client_sound_disabled', 'client_sound_enabled',
  'client_group_added', 'client_group_removed',
  'client_recording_started', 'client_recording_stopped', 'client_nickname_changed',
]);

// Fields to track per client for change detection
interface ClientStatusSnapshot {
  client_away: string;
  client_input_muted: string;
  client_output_muted: string;
  client_input_hardware: string;
  client_output_hardware: string;
  client_is_recording: string;
  clid: string;
  cid: string;
  client_nickname: string;
  client_unique_identifier: string;
  client_database_id: string;
  client_servergroups: string;
  client_type: string;
}

const CLIENT_STATUS_POLL_INTERVAL_MS = 5000;

/**
 * Normalize flow data from the frontend editor format to the engine format.
 *
 * Editor format:
 *   node: { id, type: "trigger_event"/"action_kick"/etc, label, config: { eventName, reason, ... }, x, y }
 *   edge: { id, source, sourcePort, target, targetPort }
 *
 * Engine format (matches @ts6/common types):
 *   node: { id, type: "trigger"/"action"/etc, position: {x,y}, data: { triggerType/actionType, label, ...config } }
 *   edge: { id, source, target, sourceHandle }
 *
 * Config field mappings:
 *   trigger_event:   { eventName } → { triggerType:'event', eventName }
 *   trigger_cron:    { cron } → { triggerType:'cron', cronExpression: cron }
 *   trigger_webhook: { path } → { triggerType:'webhook', webhookPath: path }
 *   trigger_command: { command } → { triggerType:'command', commandPrefix:'!', commandName: command }
 *   action_kick:     { reasonid, reason } → { actionType:'kick', reasonId: parseInt(reasonid)||5, reasonMsg: reason }
 *   action_ban:      { time, reason } → { actionType:'ban', duration: time, reason }
 *   action_move:     { channelId } → { actionType:'move', channelId }
 *   action_message:  { targetMode, message } → { actionType:'message', targetMode: modeMap, message }
 *   condition:       { expression } → { nodeType:'condition', expression }
 *   delay:           { delay } → { nodeType:'delay', delayMs: delay }
 *   variable:        { operation, name, value } → { nodeType:'variable', operation, variableName: name, value }
 *   log:             { level, message } → { nodeType:'log', level, message }
 */
function normalizeFlowData(raw: any): FlowDefinition {
  const targetModeMap: Record<string, number> = { client: 1, channel: 2, server: 3 };

  const nodes: FlowNode[] = (raw.nodes || []).map((n: any) => {
    const nodeType: string = n.type || '';

    // Already in engine format?
    if (n.data && (n.data.triggerType || n.data.actionType || n.data.nodeType)) {
      return { ...n, position: n.position || { x: n.x || 0, y: n.y || 0 } };
    }

    const config = n.config || {};
    const label = n.label || nodeType.replace(/_/g, ' ');
    const position = n.position || { x: n.x || 0, y: n.y || 0 };
    let type: string;
    let data: any;

    if (nodeType === 'trigger_event') {
      type = 'trigger';
      let normalizedFilters: Record<string, string> | undefined;
      if (Array.isArray(config.filters)) {
        const filtersRecord: Record<string, string> = {};
        for (const f of config.filters as { field: string; value: string }[]) {
          if (f.field) filtersRecord[f.field] = f.value;
        }
        normalizedFilters = Object.keys(filtersRecord).length > 0 ? filtersRecord : undefined;
      } else {
        normalizedFilters = config.filters as Record<string, string> | undefined;
      }
      data = { triggerType: 'event', label, eventName: config.eventName || '', filters: normalizedFilters };
    } else if (nodeType === 'trigger_cron') {
      type = 'trigger';
      data = { triggerType: 'cron', label, cronExpression: config.cron || config.cronExpression || '', timezone: config.timezone || undefined };
    } else if (nodeType === 'trigger_webhook') {
      type = 'trigger';
      data = { triggerType: 'webhook', label, webhookPath: config.path || config.webhookPath || '', method: config.method || 'POST', secret: config.secret || undefined };
    } else if (nodeType === 'trigger_command') {
      type = 'trigger';
      const cmd = config.command || '';
      const prefix = cmd.startsWith('!') ? '!' : config.commandPrefix || '!';
      const name = cmd.startsWith('!') ? cmd.substring(1) : cmd;
      data = { triggerType: 'command', label, commandPrefix: prefix, commandName: name, channelId: config.channelId ? String(config.channelId) : undefined, };
    } else if (nodeType === 'action_kick') {
      type = 'action';
      data = { actionType: 'kick', label, reasonId: parseInt(config.reasonid) || 5, reasonMsg: config.reason || '' };
    } else if (nodeType === 'action_ban') {
      type = 'action';
      data = { actionType: 'ban', label, duration: config.time || 0, reason: config.reason || '' };
    } else if (nodeType === 'action_move') {
      type = 'action';
      data = { actionType: 'move', label, channelId: config.channelId || config.cid || '' };
    } else if (nodeType === 'action_message') {
      type = 'action';
      data = { actionType: 'message', label, targetMode: targetModeMap[config.targetMode] || 1, message: config.message || '', target: config.target };
    } else if (nodeType === 'action_poke') {
      type = 'action';
      data = { actionType: 'poke', label, message: config.message || '' };
    } else if (nodeType === 'action_channelCreate') {
      type = 'action';
      const params: Record<string, string> = {};
      if (config.channel_name) params.channel_name = config.channel_name;
      if (config.cpid) params.cpid = config.cpid;
      const tmp = String(config.channel_flag_temporary ?? '');
      const semi = String(config.channel_flag_semi_permanent ?? '');
      if (tmp === '1') {
        params.channel_flag_temporary = '1';
      } else if (semi === '1') {
        params.channel_flag_semi_permanent = '1';
      }
      // If neither flag is '1', channel will be permanent (TS3 default)
      if (config.channel_topic) params.channel_topic = config.channel_topic;
      if (config.channel_password) params.channel_password = config.channel_password;
      data = { actionType: 'channelCreate', label, params: { ...params, ...config.params } };
    } else if (nodeType === 'action_channelEdit') {
      type = 'action';
      const params: Record<string, string> = {};
      if (config.channel_name) params.channel_name = config.channel_name;
      if (config.channel_topic) params.channel_topic = config.channel_topic;
      if (config.channel_description) params.channel_description = config.channel_description;
      if (config.channel_maxclients) params.channel_maxclients = config.channel_maxclients;
      if (config.channel_password) params.channel_password = config.channel_password;
      data = { actionType: 'channelEdit', label, channelId: config.channelId || config.cid || '', params: { ...params, ...config.params } };
    } else if (nodeType === 'action_channelDelete') {
      type = 'action';
      data = { actionType: 'channelDelete', label, channelId: config.channelId || config.cid || '', force: !!config.force };
    } else if (nodeType === 'action_groupAdd') {
      type = 'action';
      data = { actionType: 'groupAddClient', label, groupId: config.groupId || '' };
    } else if (nodeType === 'action_groupRemove') {
      type = 'action';
      data = { actionType: 'groupRemoveClient', label, groupId: config.groupId || '' };
    } else if (nodeType === 'action_groupRemoveAll') {
      type = 'action';
      data = { actionType: 'groupRemoveAll', label, keepGroupIds: config.keepGroupIds || '' };
    } else if (nodeType === 'action_groupRestoreList') {
      type = 'action';
      data = { actionType: 'groupRestoreList', label, groupIds: config.groupIds || '', excludeGroupIds: config.excludeGroupIds || '' };
    } else if (nodeType === 'action_webquery') {
      type = 'action';
      data = { actionType: 'webquery', label, command: config.command || '', params: config.params || {}, storeAs: config.storeAs || undefined };
    } else if (nodeType === 'action_webhook') {
      type = 'action';
      data = { actionType: 'webhook', label, url: config.url || '', method: config.method || 'POST', headers: config.headers, body: config.body, storeAs: config.storeAs || undefined };
    } else if (nodeType === 'action_httpRequest') {
      type = 'action';
      data = { actionType: 'httpRequest', label, url: config.url || '', method: config.method || 'GET', headers: config.headers, body: config.body, storeAs: config.storeAs || undefined };
    } else if (nodeType === 'action_afkMover') {
      type = 'action';
      data = { actionType: 'afkMover', label, afkChannelId: config.afkChannelId || '', idleThresholdSeconds: parseInt(config.idleThresholdSeconds) || 300, exemptGroupIds: config.exemptGroupIds || '', checkMuteState: config.checkMuteState === true || config.checkMuteState === 'true' };
    } else if (nodeType === 'action_idleKicker') {
      type = 'action';
      data = { actionType: 'idleKicker', label, idleThresholdSeconds: parseInt(config.idleThresholdSeconds) || 1800, reason: config.reason || '', exemptGroupIds: config.exemptGroupIds || '' };
    } else if (nodeType === 'action_pokeGroup') {
      type = 'action';
      data = { actionType: 'pokeGroup', label, groupId: config.groupId || '', message: config.message || '' };
    } else if (nodeType === 'action_rankCheck') {
      type = 'action';
      data = { actionType: 'rankCheck', label, ranks: config.ranks || '[]' };
    } else if (nodeType === 'action_tempChannelCleanup') {
      type = 'action';
      data = { actionType: 'tempChannelCleanup', label, parentChannelId: config.parentChannelId || '', protectedChannelIds: config.protectedChannelIds || '' };
    } else if (nodeType === 'action_voicePlay') {
      type = 'action';
      data = { actionType: 'voicePlay', label, botId: config.botId || '', songId: config.songId || '', playlistId: config.playlistId || '' };
    } else if (nodeType === 'action_voiceStop') {
      type = 'action';
      data = { actionType: 'voiceStop', label, botId: config.botId || '' };
    } else if (nodeType === 'action_voiceJoinChannel') {
      type = 'action';
      data = { actionType: 'voiceJoinChannel', label, botId: config.botId || '', channelId: config.channelId || '', channelPassword: config.channelPassword || '' };
    } else if (nodeType === 'action_voiceLeaveChannel') {
      type = 'action';
      data = { actionType: 'voiceLeaveChannel', label, botId: config.botId || '' };
    } else if (nodeType === 'action_voiceVolume') {
      type = 'action';
      data = { actionType: 'voiceVolume', label, botId: config.botId || '', volume: config.volume || '50' };
    } else if (nodeType === 'action_voicePauseResume') {
      type = 'action';
      data = { actionType: 'voicePauseResume', label, botId: config.botId || '', action: config.action || 'toggle' };
    } else if (nodeType === 'action_voiceSkip') {
      type = 'action';
      data = { actionType: 'voiceSkip', label, botId: config.botId || '', direction: config.direction || 'next' };
    } else if (nodeType === 'action_voiceSeek') {
      type = 'action';
      data = { actionType: 'voiceSeek', label, botId: config.botId || '', position: config.position || '0' };
    } else if (nodeType === 'action_voiceTts') {
      type = 'action';
      data = { actionType: 'voiceTts', label, botId: config.botId || '', text: config.text || '', language: config.language || '' };
    } else if (nodeType === 'action_animatedChannel') {
      type = 'action';
      data = { actionType: 'animatedChannel', label, channelId: config.channelId || '', text: config.text || '', style: config.style || 'scroll', intervalSeconds: config.intervalSeconds || '3', prefix: config.prefix || '[cspacer]' };
    } else if (nodeType === 'condition') {
      type = 'condition';
      data = { nodeType: 'condition', label, expression: config.expression || '' };
    } else if (nodeType === 'delay') {
      type = 'delay';
      data = { nodeType: 'delay', label, delayMs: config.delay || config.delayMs || 1000 };
    } else if (nodeType === 'variable') {
      type = 'variable';
      data = { nodeType: 'variable', label, operation: config.operation || 'set', variableName: config.name || '', value: config.value || '' };
    } else if (nodeType === 'action_generateCode') {
      type = 'action';
      data = { actionType: 'generateCode', label, length: parseInt(config.length, 10) || 5, storeAs: config.storeAs || 'code', numericOnly: config.numericOnly !== false, };
    } else if (nodeType === 'action_valkeyGet') {
      type = 'action';
      data = { actionType: 'valkeyGet', label, key: config.key || '', storeAs: config.storeAs || 'cachedResult' };
    } else if (nodeType === 'action_valkeySet') {
      type = 'action';
      data = { actionType: 'valkeySet', label, key: config.key || '', value: config.value || '', ttlSeconds: config.ttlSeconds ? parseInt(config.ttlSeconds, 10) : undefined };
    } else if (nodeType === 'action_valkeyDelete') {
      type = 'action';
      data = { actionType: 'valkeyDelete', label, key: config.key || '' };
    } else if (nodeType === 'action_generateToken') {
      type = 'action';
      data = {
        actionType: 'generateToken',
        label,
        tokenType: config.tokenType || '0',
        groupId: config.groupId || '',
        channelId: config.channelId || undefined,
        storeAs: config.storeAs || undefined,
      } as GenerateTokenActionData;
    } else if (nodeType === 'action_setClientChannelGroup') {
      type = 'action';
      data = {
        actionType: 'setClientChannelGroup',
        label,
        channelGroupId: config.channelGroupId || '',
        channelId: config.channelId || '',
        storeAs: config.storeAs || undefined,
      } as SetClientChannelGroupActionData;
    } else if (nodeType === 'action_setBannerUrl') {
      type = 'action';
      data = {
        actionType: 'setBannerUrl',
        label,
        bannerUrl: config.bannerUrl || '',
      } as SetBannerUrlActionData;
    } else if (nodeType === 'log') {
      type = 'log';
      data = { nodeType: 'log', label, level: config.level || 'info', message: config.message || '' };
    } else {
      // Pass through unknown types
      type = nodeType;
      data = { label, ...config };
    }

    return { id: n.id, type, position, data } as FlowNode;
  });

  const edges: FlowEdge[] = (raw.edges || []).map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || e.sourcePort || undefined,
    label: e.label || undefined,
  }));

  return { nodes, edges };
}

interface LoadedFlow {
  id: number;
  name: string;
  serverConfigId: number;
  virtualServerId: number;
  flowData: FlowDefinition;
  triggerNodes: FlowNode[];
}

interface CronEntry {
  flowId: number;
  nodeId: string;
  task: ScheduledTask;
}

interface WebhookEntry {
  flowId: number;
  nodeId: string;
  path: string;
  method: string;
  secret?: string;
}

const MAX_CONCURRENT_PER_FLOW = 20;

export class BotEngine {
  private flows: Map<number, LoadedFlow> = new Map();
  private eventBridge: EventBridge;
  private flowRunner: FlowRunner;
  private animationManager: AnimationManager;
  private cronJobs: CronEntry[] = [];
  private webhookEntries: WebhookEntry[] = [];
  private executionCounts: Map<number, number> = new Map();
  private running: boolean = false;

  // Polling state for notifyclientupdated synthetic events (TS3 doesn't push these)
  private statusPollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private clientStatusCache: Map<string, Map<string, ClientStatusSnapshot>> = new Map();

  constructor(
    private prisma: PrismaClient,
    private connectionPool: ConnectionPool,
    private wss: WebSocketServer,
    private app: Express,
  ) {
    this.eventBridge = new EventBridge(prisma);
    this.flowRunner = new FlowRunner(prisma, connectionPool, wss);
    this.animationManager = new AnimationManager();
  }

  setVoiceBotManager(manager: VoiceBotManager): void {
    this.flowRunner.setVoiceBotManager(manager);

    // Listen for nowPlaying events to update channel descriptions
    manager.on('nowPlaying', async (botId: number) => {
      try {
        const bot = await this.prisma.musicBot.findUnique({ where: { id: botId } });
        // Check AppSetting for nowPlayingEnabled — stored as "nowPlayingEnabled_<botId>", default true
        const enabledSetting = await this.prisma.appSetting.findUnique({ where: { key: `nowPlayingEnabled_${botId}` } });
        if (enabledSetting?.value === 'false') return;
        const channelId = bot?.nowPlayingChannelId ?? bot?.defaultChannel;
        if (!channelId || !bot?.serverConfigId) return;

        const voiceBot = manager.getBot(botId);
        if (!voiceBot) {
          const client = this.connectionPool.getClient(bot.serverConfigId);
          await client.executePost(1, 'channeledit', { cid: channelId, channel_description: '[b]🎵 Now Playing[/b]\n[i]Nothing playing[/i]' });
          return;
        }

        const nowPlaying = voiceBot.nowPlaying;
        const queueItems = voiceBot.queue.getAll();
        const upcoming = queueItems.slice(0, 5);

        let bb = '[center][size=14][color=#00aaff]▬▬▬▬▬ 🎵 Now Playing ▬▬▬▬▬[/color][/size]\n\n';
        if (nowPlaying) {
          bb += `[size=16][b]${nowPlaying.title}[/b][/size]\n`;
          if (nowPlaying.artist) bb += `[size=13][color=#7ec8e3]${nowPlaying.artist}[/color][/size]\n`;
        } else {
          bb += '[i]Nothing playing[/i]\n';
        }
        if (upcoming.length > 0) {
          bb += `\n[size=13][color=#004e8c]▬▬▬▬▬ 📋 Up Next ▬▬▬▬▬[/color][/size]\n`;
          upcoming.forEach((q: any, i: number) => {
            bb += `[color=#aaaaaa]${i + 1}.[/color] ${q.title}${q.artist ? ` [color=#aaaaaa]—[/color] ${q.artist}` : ''}\n`;
          });
          if (queueItems.length > 5) bb += `[color=#666666][i]... and ${queueItems.length - 5} more[/i][/color]\n`;
        }
        bb += '[/center]';

        voiceBot.sendRawCommand(buildCommand('channeledit', { cid: channelId, channel_description: bb }));
      } catch (err: any) {
        logger.warn(`[BotEngine] Failed to update now-playing channel description for bot ${botId}:`, err.message);
      }
    });
  }

  getEventBridge(): EventBridge {
    return this.eventBridge;
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Always register event listener (even if no flows yet — flows can be enabled later)
    this.eventBridge.on('tsEvent', this.onTsEvent.bind(this));

    // Once the SSH event bot has renamed itself (TS6 Query), rename the WebQuery HTTP API
    // session and move it to the bot channel using config from DB.
    this.eventBridge.on('sshConnected', async (configId: number, sid: number) => {
      if (!this.connectionPool.hasClient(configId)) return;
      const client = this.connectionPool.getClient(configId);

      // Fetch config once for both nickname and channel
      const serverCfg = await this.prisma.tsServerConfig.findUnique({ where: { id: configId } });
      const botNickname = serverCfg?.queryBotNickname?.trim() || 'TS6 Server';

      // Rename WebQuery session (may already have that name — ignore error)
      try {
        await client.executePost(sid, 'clientupdate', { client_nickname: botNickname });
      } catch {
        // "nickname already in use" is expected if session is already named correctly
      }

      // Move WebQuery session to the bot channel
      try {
        const whoamiRaw = await client.execute(sid, 'whoami');
        const whoamiData = Array.isArray(whoamiRaw) ? whoamiRaw[0] : whoamiRaw;
        const clid = whoamiData?.client_id ?? whoamiData?.clid;
        if (clid) {
          const botChannel = serverCfg?.queryBotChannel ?? '752';
          await client.executePost(sid, 'clientmove', { clid: Number(clid), cid: Number(botChannel) });
          logger.info(`[BotEngine] WebQuery session moved to channel ${botChannel}`);
        }
      } catch (err: any) {
        logger.warn(`[BotEngine] WebQuery move failed for config ${configId}: ${err?.message ?? err}`);
      }
    });

    await this.loadFlows();

    if (this.flows.size === 0) {
      logger.info('[BotEngine] No enabled flows found, engine idle (will activate when flows are enabled)');
      this.running = true;
      return;
    }

    // Setup SSH connections for all unique server+vserver pairs (non-blocking)
    this.setupSshConnections();

    // Start client status polling for pairs that need it (synthetic notifyclientupdated events)
    for (const flow of this.flows.values()) {
      this.syncStatusPollingForPair(flow.serverConfigId, flow.virtualServerId);
    }

    // Setup cron jobs
    this.setupCronJobs();

    // Build webhook registry
    this.buildWebhookRegistry();

    // Start animations for all loaded flows
    for (const flow of this.flows.values()) {
      this.startAnimationsForFlow(flow.id, flow.serverConfigId, flow.virtualServerId);
    }

    this.running = true;

    const sshCount = this.eventBridge.getConnectedKeys().length;
    logger.info(`[BotEngine] Started with ${this.flows.size} flow(s), ${sshCount} SSH connection(s), ${this.cronJobs.length} cron job(s), ${this.webhookEntries.length} webhook(s)`);

    this.broadcast('bot:engine:started', { flowCount: this.flows.size });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.animationManager.stopAll();
    this.teardownCronJobs();
    this.stopAllStatusPolling();
    this.webhookEntries = [];
    this.eventBridge.removeAllListeners('tsEvent');
    this.flows.clear();
    this.executionCounts.clear();
  }

  async enableFlow(flowId: number): Promise<void> {
    logger.info(`[BotEngine] Enabling flow ${flowId}...`);
    const dbFlow = await this.prisma.botFlow.findUnique({ where: { id: flowId } });
    if (!dbFlow || !dbFlow.enabled) {
      logger.info(`[BotEngine] Flow ${flowId} not found or not enabled in DB`);
      return;
    }

    try {
      const raw = JSON.parse(dbFlow.flowData);
      const flowData = normalizeFlowData(raw);
      const triggerNodes = flowData.nodes.filter(n => n.type === 'trigger');

      const hasAnimations = flowData.nodes.some(n => n.type === 'action' && (n.data as any).actionType === 'animatedChannel');
      logger.info(`[BotEngine] Flow ${flowId} ('${dbFlow.name}'): ${triggerNodes.length} trigger(s), ${flowData.nodes.length} node(s), ${flowData.edges.length} edge(s)${hasAnimations ? ', has animations' : ''}`);

      if (triggerNodes.length === 0 && !hasAnimations) {
        logger.warn(`[BotEngine] Flow ${flowId} has no trigger nodes and no animations — nothing to activate`);
      }

      for (const t of triggerNodes) {
        const td = t.data as any;
        logger.info(`[BotEngine]   Trigger: type=${td.triggerType}, ${td.triggerType === 'event' ? `event=${td.eventName}` : td.triggerType === 'cron' ? `cron=${td.cronExpression}` : td.triggerType === 'command' ? `cmd=${td.commandPrefix}${td.commandName}` : `webhook=${td.webhookPath}`}`);
      }

      this.flows.set(flowId, {
        id: dbFlow.id,
        name: dbFlow.name,
        serverConfigId: dbFlow.serverConfigId,
        virtualServerId: dbFlow.virtualServerId,
        flowData,
        triggerNodes,
      });

      // Ensure SSH connection exists for event/command triggers
      const hasEventTrigger = triggerNodes.some(t => {
        const td = t.data as any;
        return td.triggerType === 'event' || td.triggerType === 'command';
      });

      if (hasEventTrigger) {
        logger.info(`[BotEngine] Flow needs SSH — connecting to server ${dbFlow.serverConfigId}, sid=${dbFlow.virtualServerId}...`);
        if (!this.eventBridge.isConnected(dbFlow.serverConfigId, dbFlow.virtualServerId)) {
          // Non-blocking: SSH connects in background, events will flow once connected
          this.eventBridge.connectServer(dbFlow.serverConfigId, dbFlow.virtualServerId).catch(err => {
            logger.error(`[BotEngine] SSH connection failed for ${dbFlow.serverConfigId}:${dbFlow.virtualServerId}: ${err.message}`);
          });
        } else {
          logger.info(`[BotEngine] SSH already connected for ${dbFlow.serverConfigId}:${dbFlow.virtualServerId}`);
        }
        // NEW: start/stop per-channel command listeners for this pair
        this.syncCommandListenersForPair(dbFlow.serverConfigId, dbFlow.virtualServerId);
      }

      // Sync client status polling (for notifyclientupdated synthetic events)
      this.syncStatusPollingForPair(dbFlow.serverConfigId, dbFlow.virtualServerId);

      // Setup cron jobs for this flow
      this.setupCronJobsForFlow(flowId);

      // Add webhook entries for this flow
      this.buildWebhookRegistryForFlow(flowId);

      // Start animations for any animatedChannel action nodes
      this.startAnimationsForFlow(flowId, dbFlow.serverConfigId, dbFlow.virtualServerId);

      logger.info(`[BotEngine] Flow ${flowId} ('${dbFlow.name}') enabled successfully`);
    } catch (err: any) {
      logger.error(`[BotEngine] Failed to enable flow ${flowId}: ${err.message}`);
    }
  }

  async disableFlow(flowId: number): Promise<void> {
    const disabledFlow = this.flows.get(flowId);
    this.animationManager.stopAnimation(flowId);
    this.teardownCronJobs(flowId);
    this.webhookEntries = this.webhookEntries.filter(w => w.flowId !== flowId);
    this.flows.delete(flowId);
    this.executionCounts.delete(flowId);

    // Sync client status polling — may stop the poller if no more flows need it
    if (disabledFlow) {
      this.syncStatusPollingForPair(disabledFlow.serverConfigId, disabledFlow.virtualServerId);
    }

    // Check if any remaining flows use the same SSH connections
    await this.cleanupUnusedSshConnections();

    logger.info(`[BotEngine] Flow ${flowId} disabled`);
  }

  async reloadFlow(flowId: number): Promise<void> {
    const flow = this.flows.get(flowId);
    if (flow) {
      // Flow was active — disable then re-enable
      await this.disableFlow(flowId);
      const dbFlow = await this.prisma.botFlow.findUnique({ where: { id: flowId } });
      if (dbFlow?.enabled) {
        await this.enableFlow(flowId);
      }
    }
  }

  handleWebhookRequest(req: Request, res: Response): void {
    const webhookPath = String(req.params.path || req.params[0] || '');
    const method = req.method.toUpperCase();
    const providedSecret = String(req.headers['x-webhook-secret'] || req.query.secret || '');

    const matching = this.webhookEntries.filter(w =>
      w.path === webhookPath && (w.method === method || w.method === 'ANY')
    );

    // Always run the same loop regardless of whether path matched — prevents
    // timing oracle that distinguishes "path not found" from "wrong secret".
    let triggered = 0;
    for (const wh of matching) {
      if (!wh.secret) continue;

      const secretBuf = Buffer.from(wh.secret);
      const providedBuf = Buffer.from(providedSecret);
      if (secretBuf.length !== providedBuf.length || !crypto.timingSafeEqual(secretBuf, providedBuf)) {
        continue;
      }

      const flow = this.flows.get(wh.flowId);
      if (!flow) continue;

      const webhookData: Record<string, string> = {
        webhook_path: webhookPath,
        webhook_method: method,
        webhook_body: JSON.stringify(req.body || {}),
        webhook_query: JSON.stringify(req.query || {}),
      };

      this.executeFlow(flow, wh.nodeId, 'webhook', webhookData);
      triggered++;
    }

    // Same response regardless of reason (not found / wrong secret)
    if (triggered === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json({ triggered });
  }

  getFlow(flowId: number): LoadedFlow | undefined {
    return this.flows.get(flowId);
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.eventBridge.destroy();
    this.broadcast('bot:engine:stopped', {});
  }

  // --- Private Methods ---

  private async loadFlows(): Promise<void> {
    const dbFlows = await this.prisma.botFlow.findMany({ where: { enabled: true } });

    for (const dbFlow of dbFlows) {
      try {
        const raw = JSON.parse(dbFlow.flowData);
        const flowData = normalizeFlowData(raw);
        const triggerNodes = flowData.nodes.filter(n => n.type === 'trigger');
        const hasAnimations = flowData.nodes.some(n => n.type === 'action' && (n.data as any).actionType === 'animatedChannel');

        if (triggerNodes.length === 0 && !hasAnimations) {
          logger.warn(`[BotEngine] Flow ${dbFlow.id} ('${dbFlow.name}') has no trigger nodes and no animations, skipping`);
          continue;
        }

        this.flows.set(dbFlow.id, {
          id: dbFlow.id,
          name: dbFlow.name,
          serverConfigId: dbFlow.serverConfigId,
          virtualServerId: dbFlow.virtualServerId,
          flowData,
          triggerNodes,
        });
      } catch (err: any) {
        logger.error(`[BotEngine] Failed to parse flow ${dbFlow.id}: ${err.message}`);
      }
    }
  }

  private setupSshConnections(): void {
    const serverPairs = new Set<string>();
    for (const flow of this.flows.values()) {
      serverPairs.add(`${flow.serverConfigId}:${flow.virtualServerId}`);
    }

    for (const pair of serverPairs) {
      const [configId, sid] = pair.split(':').map(Number);
      // Non-blocking: don't await SSH connections during startup
      this.eventBridge.connectServer(configId, sid).catch(err => {
        logger.error(`[BotEngine] SSH connection failed for ${pair}: ${err.message}`);
      });
      this.syncCommandListenersForPair(configId, sid);
    }
  }

  private async cleanupUnusedSshConnections(): Promise<void> {
    const neededPairs = new Set<string>();
    for (const flow of this.flows.values()) {
      neededPairs.add(`${flow.serverConfigId}:${flow.virtualServerId}`);
    }

    // 1) cleanup unused ssh connections
    for (const key of this.eventBridge.getConnectedKeys()) {
      if (!neededPairs.has(key)) {
        const [configId, sid] = key.split(':').map(Number);
        await this.eventBridge.disconnectServer(configId, sid);
      }
    }

    // 2) sync command listeners per pair
    for (const pair of neededPairs) {
      const [configId, sid] = pair.split(':').map(Number);
      this.syncCommandListenersForPair(configId, sid);
    }

    // 3) delete command listener for unused pairs
    for (const cmdKey of this.eventBridge.getCommandListenerKeys()) {
      // expected: `${configId}:${sid}:cmd:${channelId}`
      const m = cmdKey.match(/^(\d+):(\d+):cmd:(\d+)$/);
      if (!m) continue;

      const configId = Number(m[1]);
      const sid = Number(m[2]);
      const channelId = Number(m[3]);

      const pairKey = `${configId}:${sid}`;
      if (!neededPairs.has(pairKey)) {
        await this.eventBridge.disconnectCommandListener(configId, sid, channelId);
      }
    }
  }

  /** Immediately apply updated bot nicknames to all active sessions for a config. */
  async applyNicknameChanges(configId: number, queryBotNickname?: string, sshBotNickname?: string, queryBotChannel?: string): Promise<void> {
    const pairs = this.eventBridge.getConnectedKeys()
      .filter(k => k.startsWith(`${configId}:`))
      .map(k => parseInt(k.split(':')[1], 10));

    for (const sid of pairs) {
      if (queryBotNickname !== undefined) {
        try {
          const nickname = queryBotNickname.trim() || 'TS6 Server';
          await this.connectionPool.getClient(configId).executePost(sid, 'clientupdate', { client_nickname: nickname });
        } catch { /* "nickname already in use" is expected */ }
      }
      if (sshBotNickname !== undefined) {
        try {
          await this.eventBridge.renameSshBot(configId, sid, sshBotNickname.trim() || 'TS6 Query');
        } catch { /* ignore if SSH session not reachable */ }
      }
      if (queryBotChannel !== undefined && queryBotChannel.trim()) {
        try {
          await this.eventBridge.moveSshBot(configId, sid, queryBotChannel.trim());
        } catch { /* ignore if move fails (wrong channel, permissions, etc.) */ }
      }
    }
  }

  /**
   * Expand a notifyclientupdated event into named synthetic events.
   *
   * @param eventName  Raw TS3 event name (only 'notifyclientupdated' is expanded).
   * @param data       Full event data available to condition expressions.
   * @param changedFields  When provided (poll-synthesized events), only fields in this
   *                   set are used to determine which synthetic names to emit.  When
   *                   absent (real TS3 events), all fields in data are used — preserving
   *                   the original behaviour for any future raw notifyclientupdated events.
   */
  private expandClientUpdatedEvents(
    eventName: string,
    data: Record<string, string>,
    changedFields?: ReadonlySet<string>,
  ): string[] {
    if (eventName !== 'notifyclientupdated') return [eventName];

    // When changedFields is provided (poll path), only emit a synthetic event for a
    // field if that field actually changed in this poll cycle.  This prevents spurious
    // re-fires of e.g. client_mic_muted when only client_output_muted changed.
    const shouldExpand = (field: string): boolean =>
      changedFields === undefined || changedFields.has(field);

    const mappings: [field: string, value: string, synthetic: string][] = [
      ['client_away',           '1', 'client_went_away'],
      ['client_away',           '0', 'client_came_back'],
      ['client_input_muted',    '1', 'client_mic_muted'],
      ['client_input_muted',    '0', 'client_mic_unmuted'],
      ['client_output_muted',   '1', 'client_sound_muted'],
      ['client_output_muted',   '0', 'client_sound_unmuted'],
      ['client_input_hardware', '0', 'client_mic_disabled'],
      ['client_input_hardware', '1', 'client_mic_enabled'],
      ['client_output_hardware','0', 'client_sound_disabled'],
      ['client_output_hardware','1', 'client_sound_enabled'],
      ['client_is_recording',   '1', 'client_recording_started'],
      ['client_is_recording',   '0', 'client_recording_stopped'],
    ];

    const extra: string[] = [eventName];
    for (const [field, value, synthetic] of mappings) {
      if (shouldExpand(field) && data[field] === value) extra.push(synthetic);
    }
    return extra;
  }

  private onTsEvent(
    configId: number,
    sid: number,
    eventName: string,
    data: Record<string, string>,
    changedFields?: ReadonlySet<string>,
  ): void {
    const expandedNames = this.expandClientUpdatedEvents(eventName, data, changedFields);
    if (expandedNames.length > 1 || (expandedNames.length === 1 && expandedNames[0] !== eventName)) {
      logger.info(`[BotEngine] Event ${eventName} expanded to: [${expandedNames.join(', ')}]`);
    }
    for (const flow of this.flows.values()) {
      if (flow.serverConfigId !== configId || flow.virtualServerId !== sid) continue;

      for (const triggerNode of flow.triggerNodes) {
        const triggerData = triggerNode.data as any;

        // Event trigger
        if (triggerData.triggerType === 'event') {
          const eventTrigger = triggerData as EventTriggerData;
          if (!expandedNames.includes(eventTrigger.eventName)) continue;

          // Apply filters
          if (eventTrigger.filters) {
            let matches = true;
            for (const [key, value] of Object.entries(eventTrigger.filters)) {
              if (data[key] !== value) { matches = false; break; }
            }
            if (!matches) {
              logger.info(`[BotEngine] Flow ${flow.id} trigger '${eventTrigger.eventName}' skipped — filter mismatch`);
              continue;
            }
          }

          logger.info(`[BotEngine] Flow ${flow.id} ('${flow.name}') trigger matched: ${eventTrigger.eventName}`);
          this.executeFlow(flow, triggerNode.id, 'event', data);
        }

        // Command trigger (special case of text message)
        if (triggerData.triggerType === 'command' && eventName === 'notifytextmessage') {
          const cmdTrigger = triggerData as CommandTriggerData;

          // Backward-compat:
          // - if trigger has NO channelId => only react to base connection events
          // - if trigger HAS channelId => only react if event came from that cmd listener OR matches target
          const sourceListenerCid = data.__cmd_listener_channel_id;

          if (!cmdTrigger.channelId) {
            if (sourceListenerCid) continue;
          } else {
            const required = String(cmdTrigger.channelId);

            // For channel-specific commands: only accept events coming from the dedicated cmd listener
            if (!sourceListenerCid) continue;
            if (sourceListenerCid !== required) continue;
          }

          const msg = data.msg || '';
          const fullCommand = (cmdTrigger.commandPrefix || '!') + cmdTrigger.commandName;
          if (!msg.startsWith(fullCommand)) continue;

          const afterCmd = msg.substring(fullCommand.length);
          if (afterCmd.length > 0 && afterCmd[0] !== ' ') continue;

          const args = afterCmd.trim();
          const enrichedData = {
            ...data,
            command_args: args,
            command_name: cmdTrigger.commandName,
            command_channel_id: data.__cmd_listener_channel_id || cmdTrigger.channelId || data.target || '',
          };

          const invoker =
            data.clid ||
            data.invokerid ||
            data.invoker_id ||
            data.invokerId ||
            data.client_id ||
            data.clientId;

          if (invoker && !data.clid) {

            (enrichedData as any).clid = String(invoker);
          }

          this.executeFlow(flow, triggerNode.id, 'command', enrichedData);
        }
      }
    }
  }


  private getNeededCommandChannelIds(configId: number, sid: number): number[] {
    const ids = new Set<number>();

    for (const flow of this.flows.values()) {
      if (flow.serverConfigId !== configId || flow.virtualServerId !== sid) continue;

      for (const t of flow.triggerNodes) {
        const td: any = t.data;
        if (td?.triggerType === 'command' && td.channelId) {
          const n = parseInt(String(td.channelId), 10);
          if (Number.isFinite(n) && n > 0) ids.add(n);
        }
      }
    }
    return Array.from(ids);
  }

  private syncCommandListenersForPair(configId: number, sid: number): void {
    const needed = new Set(this.getNeededCommandChannelIds(configId, sid));
    const existing = new Set(this.eventBridge.getCommandListenerChannelIds(configId, sid));

    for (const cid of needed) {
      if (!existing.has(cid)) {
        this.eventBridge.connectCommandListener(configId, sid, cid).catch(err => {
          logger.error(`[BotEngine] CMD listener connect failed for ${configId}:${sid}:${cid}: ${err.message}`);
        });
      }
    }

    for (const cid of existing) {
      if (!needed.has(cid)) {
        this.eventBridge.disconnectCommandListener(configId, sid, cid).catch(() => { });
      }
    }
  }


  private executeFlow(flow: LoadedFlow, triggerNodeId: string, triggerType: string, eventData: Record<string, string>): void {
    logger.info(`[BotEngine] Executing flow ${flow.id} ('${flow.name}') triggered by ${triggerType}`);

    // Rate limiting
    const current = this.executionCounts.get(flow.id) || 0;
    if (current >= MAX_CONCURRENT_PER_FLOW) {
      logger.warn(`[BotEngine] Flow ${flow.id} rate limited (${current} concurrent executions)`);
      return;
    }
    this.executionCounts.set(flow.id, current + 1);

    // Extract timezone from the trigger node (if cron trigger has one)
    const triggerNode = flow.flowData.nodes.find(n => n.id === triggerNodeId);
    const triggerData = triggerNode?.data as any;
    const timezone = triggerData?.timezone as string | undefined;

    this.flowRunner.execute(flow, triggerNodeId, triggerType, eventData, timezone)
      .catch(err => {
        logger.error(`[BotEngine] Flow ${flow.id} execution error: ${err.message}`);
      })
      .finally(() => {
        const count = this.executionCounts.get(flow.id) || 1;
        this.executionCounts.set(flow.id, count - 1);
      });
  }

  private setupCronJobs(): void {
    for (const flow of this.flows.values()) {
      this.setupCronJobsForFlow(flow.id);
    }
  }

  private setupCronJobsForFlow(flowId: number): void {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    for (const triggerNode of flow.triggerNodes) {
      const triggerData = triggerNode.data as any;
      if (triggerData.triggerType !== 'cron') continue;

      const cronData = triggerData as CronTriggerData;
      if (!cronValidate(cronData.cronExpression)) {
        logger.error(`[BotEngine] Invalid cron expression '${cronData.cronExpression}' in flow ${flowId}`);
        continue;
      }

      const task = cronSchedule(cronData.cronExpression, () => {
        this.executeFlow(flow, triggerNode.id, 'cron', {});
      }, {
        timezone: cronData.timezone || 'UTC',
      });

      this.cronJobs.push({ flowId, nodeId: triggerNode.id, task });
    }
  }

  private buildWebhookRegistry(): void {
    for (const flow of this.flows.values()) {
      this.buildWebhookRegistryForFlow(flow.id);
    }
  }

  private buildWebhookRegistryForFlow(flowId: number): void {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    for (const triggerNode of flow.triggerNodes) {
      const triggerData = triggerNode.data as any;
      if (triggerData.triggerType !== 'webhook') continue;

      const whData = triggerData as WebhookTriggerData;
      this.webhookEntries.push({
        flowId,
        nodeId: triggerNode.id,
        path: whData.webhookPath,
        method: whData.method || 'POST',
        secret: whData.secret || undefined,
      });
    }
  }

  private teardownCronJobs(flowId?: number): void {
    const toRemove = flowId !== undefined
      ? this.cronJobs.filter(j => j.flowId === flowId)
      : this.cronJobs;

    for (const entry of toRemove) {
      entry.task.stop();
    }

    this.cronJobs = flowId !== undefined
      ? this.cronJobs.filter(j => j.flowId !== flowId)
      : [];
  }

  private startAnimationsForFlow(flowId: number, serverConfigId: number, virtualServerId: number): void {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    const animNodes = flow.flowData.nodes.filter(
      n => n.type === 'action' && (n.data as any).actionType === 'animatedChannel'
    );

    if (animNodes.length === 0) return;

    try {
      const client = this.connectionPool.getClient(serverConfigId);

      for (const node of animNodes) {
        const d = node.data as AnimatedChannelActionData;
        const config: AnimationConfig = {
          channelId: d.channelId,
          text: d.text,
          style: d.style || 'scroll',
          intervalSeconds: parseInt(d.intervalSeconds) || 3,
          prefix: d.prefix || '[cspacer]',
        };

        this.animationManager.startAnimation(flowId, virtualServerId, config, client);
      }
    } catch (err: any) {
      logger.error(`[BotEngine] Failed to start animations for flow ${flowId}: ${err.message}`);
    }
  }

  // --- Client Status Polling (for notifyclientupdated synthetic events) ---
  // TS3/TS6 SSH ServerQuery does not push notifyclientupdated via servernotifyregister.
  // We poll clientlist -away -voice every 5 seconds and synthesize the events.

  private pairNeedsStatusPolling(configId: number, sid: number): boolean {
    for (const flow of this.flows.values()) {
      if (flow.serverConfigId !== configId || flow.virtualServerId !== sid) continue;
      for (const t of flow.triggerNodes) {
        const td = t.data as any;
        if (td?.triggerType === 'event' && CLIENT_UPDATED_SYNTHETIC_EVENTS.has(td.eventName)) {
          return true;
        }
      }
    }
    return false;
  }

  private startStatusPollingForPair(configId: number, sid: number): void {
    const key = `${configId}:${sid}`;
    if (this.statusPollTimers.has(key)) return;

    logger.info(`[BotEngine] Starting client status poller for ${key} (interval=${CLIENT_STATUS_POLL_INTERVAL_MS}ms)`);

    const timer = setInterval(() => {
      this.pollClientStatus(configId, sid).catch(err => {
        logger.warn(`[BotEngine] Client status poll failed for ${key}: ${err.message}`);
      });
    }, CLIENT_STATUS_POLL_INTERVAL_MS);

    this.statusPollTimers.set(key, timer);
  }

  private stopStatusPollingForPair(configId: number, sid: number): void {
    const key = `${configId}:${sid}`;
    const timer = this.statusPollTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.statusPollTimers.delete(key);
      this.clientStatusCache.delete(key);
      logger.info(`[BotEngine] Stopped client status poller for ${key}`);
    }
  }

  private stopAllStatusPolling(): void {
    for (const [key, timer] of this.statusPollTimers) {
      clearInterval(timer);
      logger.info(`[BotEngine] Stopped client status poller for ${key}`);
    }
    this.statusPollTimers.clear();
    this.clientStatusCache.clear();
  }

  private syncStatusPollingForPair(configId: number, sid: number): void {
    if (this.pairNeedsStatusPolling(configId, sid)) {
      this.startStatusPollingForPair(configId, sid);
    } else {
      this.stopStatusPollingForPair(configId, sid);
    }
  }

  private async pollClientStatus(configId: number, sid: number): Promise<void> {
    const key = `${configId}:${sid}`;

    // Use the SSH event-bridge connection (same one used for event listening)
    let raw: string;
    try {
      raw = await this.eventBridge.executeCommand(configId, sid, 'clientlist -away -voice -groups -uid');
    } catch {
      // SSH not yet connected — silently skip until it is
      return;
    }

    // parseQueryResponse handles pipe-separated entries (one per client)
    const currentClients = parseQueryResponse(raw)
      .filter(c => c.clid && c.client_type !== '1'); // skip query clients

    const pairCache = this.clientStatusCache.get(key) ?? new Map<string, ClientStatusSnapshot>();

    const currentClidSet = new Set(currentClients.map(c => c.clid));

    for (const current of currentClients) {
      const clid = current.clid;
      const prev = pairCache.get(clid);

      // Build a snapshot of trackable fields (default '0' if missing)
      const snapshot: ClientStatusSnapshot = {
        clid,
        cid: current.cid ?? '',
        client_nickname: current.client_nickname ?? '',
        client_unique_identifier: current.client_unique_identifier ?? '',
        client_database_id: current.client_database_id ?? '',
        client_servergroups: current.client_servergroups ?? '',
        client_type: current.client_type ?? '0',
        client_away: current.client_away ?? '0',
        client_input_muted: current.client_input_muted ?? '0',
        client_output_muted: current.client_output_muted ?? '0',
        client_input_hardware: current.client_input_hardware ?? '1',
        client_output_hardware: current.client_output_hardware ?? '1',
        client_is_recording: current.client_is_recording ?? '0',
      };

      if (!prev) {
        // First poll — populate cache, don't emit events (no "before" state to compare)
        pairCache.set(clid, snapshot);
        continue;
      }

      // Detect which status fields changed
      const changed: Record<string, string> = {};
      const trackedFields: (keyof ClientStatusSnapshot)[] = [
        'client_away', 'client_input_muted', 'client_output_muted',
        'client_input_hardware', 'client_output_hardware', 'client_is_recording',
      ];
      for (const field of trackedFields) {
        if (snapshot[field] !== prev[field]) {
          changed[field] = snapshot[field];
        }
      }

      if (Object.keys(changed).length > 0) {
        // Snapshot already holds the current values for all fields — use it directly.
        // Passing changedFields restricts synthetic event name expansion to only the
        // fields that actually changed, preventing spurious re-fires.
        const eventData: Record<string, string> = { ...snapshot };
        logger.info(`[BotEngine] Client ${clid} status changed on ${key}: ${JSON.stringify(changed)}`);
        this.onTsEvent(configId, sid, 'notifyclientupdated', eventData, new Set(Object.keys(changed)));
      }

      // Detect server group membership changes (client_group_added / client_group_removed).
      // One event is fired per changed group so flows can condition on {{event.sgid}}.
      if (snapshot.client_servergroups !== prev.client_servergroups) {
        const prevGroups = new Set(prev.client_servergroups.split(',').filter(Boolean));
        const currGroups = new Set(snapshot.client_servergroups.split(',').filter(Boolean));
        const base: Record<string, string> = { ...snapshot };

        for (const sgid of currGroups) {
          if (!prevGroups.has(sgid)) {
            logger.debug(`[BotEngine] Client ${clid} added to group ${sgid} on ${key}`);
            this.onTsEvent(configId, sid, 'client_group_added', { ...base, sgid });
          }
        }
        for (const sgid of prevGroups) {
          if (!currGroups.has(sgid)) {
            logger.debug(`[BotEngine] Client ${clid} removed from group ${sgid} on ${key}`);
            this.onTsEvent(configId, sid, 'client_group_removed', { ...base, sgid });
          }
        }
      }

      // Detect nickname changes
      if (snapshot.client_nickname !== prev.client_nickname) {
        logger.debug(`[BotEngine] Client ${clid} nickname changed on ${key}: '${prev.client_nickname}' → '${snapshot.client_nickname}'`);
        this.onTsEvent(configId, sid, 'client_nickname_changed', { ...snapshot });
      }

      pairCache.set(clid, snapshot);
    }

    // Remove departed clients from cache
    for (const clid of pairCache.keys()) {
      if (!currentClidSet.has(clid)) {
        pairCache.delete(clid);
      }
    }

    this.clientStatusCache.set(key, pairCache);
  }

  private broadcast(type: string, payload: any): void {
    const msg = JSON.stringify({ type, ...payload });
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(msg);
      }
    });
  }
}
