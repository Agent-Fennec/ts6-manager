import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { PrismaClient } from '../../generated/prisma/index.js';
import { SshQueryClient } from './ssh-query-client.js';
import { decrypt } from '../utils/crypto.js';

export declare interface EventBridge {
  on(event: 'tsEvent', listener: (configId: number, sid: number, eventName: string, data: Record<string, string>) => void): this;
  on(event: 'sshConnected', listener: (configId: number, sid: number) => void): this;
  on(event: 'sshDisconnected', listener: (configId: number, sid: number) => void): this;
  on(event: 'sshError', listener: (configId: number, sid: number, err: Error) => void): this;
  emit(event: 'tsEvent', configId: number, sid: number, eventName: string, data: Record<string, string>): boolean;
  emit(event: 'sshConnected', configId: number, sid: number): boolean;
  emit(event: 'sshDisconnected', configId: number, sid: number): boolean;
  emit(event: 'sshError', configId: number, sid: number, err: Error): boolean;
}

export class EventBridge extends EventEmitter {
  private connections: Map<string, SshQueryClient> = new Map();

  constructor(private prisma: PrismaClient) {
    super();
  }

  private makeKey(configId: number, sid: number): string {
    return `${configId}:${sid}`;
  }

  async connectServer(configId: number, sid: number): Promise<void> {
    const key = this.makeKey(configId, sid);
    if (this.connections.has(key)) return;

    const serverConfig = await this.prisma.tsServerConfig.findUnique({
      where: { id: configId },
    });

    if (!serverConfig) {
      logger.warn(`[EventBridge] Server config ${configId} not found`);
      return;
    }

    if (!serverConfig.sshUsername || !serverConfig.sshPassword || !serverConfig.sshPort) {
      logger.warn(`[EventBridge] Server config ${configId} has no SSH credentials, skipping SSH connection`);
      return;
    }

    const client = new SshQueryClient({
      host: serverConfig.host,
      port: serverConfig.sshPort,
      username: serverConfig.sshUsername,
      password: decrypt(serverConfig.sshPassword),
    });

    client.on('ready', async () => {
      logger.info(`[EventBridge] SSH connected to ${serverConfig.host}:${serverConfig.sshPort} for sid=${sid}`);
      try {
        await client.registerEvents(sid, serverConfig.queryBotChannel || undefined, serverConfig.sshBotNickname?.trim() || undefined);
        this.emit('sshConnected', configId, sid);
      } catch (err: any) {
        logger.error(`[EventBridge] Failed to register events for ${key}: ${err.message}`);
      }
    });

    client.on('event', (eventName: string, data: Record<string, string>) => {
      this.emit('tsEvent', configId, sid, eventName, data);
    });

    client.on('error', (err: Error) => {
      logger.error(`[EventBridge] SSH error for ${key}: ${err.message}`);
      this.emit('sshError', configId, sid, err);
    });

    client.on('close', () => {
      logger.info(`[EventBridge] SSH disconnected for ${key}`);
      this.emit('sshDisconnected', configId, sid);
    });

    this.connections.set(key, client);

    try {
      await client.connect();
    } catch (err: any) {
      logger.error(`[EventBridge] Initial SSH connection failed for ${key}: ${err.message}`);
      // Auto-reconnect is handled internally by SshQueryClient (unless fatal)
      if (client.hasFatalError) {
        this.connections.delete(key);
      }
    }
  }

  async disconnectServer(configId: number, sid: number): Promise<void> {
    const key = this.makeKey(configId, sid);
    const client = this.connections.get(key);
    if (client) {
      client.destroy();
      this.connections.delete(key);
    }
  }

  isConnected(configId: number, sid: number): boolean {
    const key = this.makeKey(configId, sid);
    const client = this.connections.get(key);
    return client?.isConnected ?? false;
  }

  /**
   * Execute a raw ServerQuery command on an existing (or on-demand) SSH connection.
   * Reuses the same connection used for event listening — no extra server slots.
   */
  async executeCommand(configId: number, sid: number, command: string): Promise<string> {
    const key = this.makeKey(configId, sid);
    let client = this.connections.get(key);

    // Connect on demand if no connection exists yet
    if (!client || !client.isConnected) {
      await this.connectServer(configId, sid);
      client = this.connections.get(key);
      if (!client || !client.isConnected) {
        throw new Error('SSH not connected — check SSH credentials in server settings');
      }
    }

    return client.executeCommand(command);
  }

  getConnectedKeys(): string[] {
    return Array.from(this.connections.keys());
  }

  async renameSshBot(configId: number, sid: number, nickname: string): Promise<void> {
    const key = `${configId}:${sid}`;
    const client = this.connections.get(key);
    if (!client?.isConnected) return;
    const escaped = nickname.replace(/ /g, '\\s');
    await client.executeCommand(`clientupdate client_nickname=${escaped}`);
  }

  async moveSshBot(configId: number, sid: number, channelId: string): Promise<void> {
    const key = `${configId}:${sid}`;
    const client = this.connections.get(key);
    if (!client?.isConnected) return;
    const whoami = await client.executeCommand('whoami');
    const m = whoami.match(/(?:clid|client_id)=(\d+)/);
    if (!m) return;
    await client.executeCommand(`clientmove clid=${m[1]} cid=${channelId}`);
  }

  private commandListeners: Map<string, SshQueryClient> = new Map();

  private makeCmdKey(configId: number, sid: number, channelId: number): string {
    return `${configId}:${sid}:cmd:${channelId}`;
  }

  async connectCommandListener(configId: number, sid: number, channelId: number): Promise<void> {
    const key = this.makeCmdKey(configId, sid, channelId);
    if (this.commandListeners.has(key)) return;

    const serverConfig = await this.prisma.tsServerConfig.findUnique({ where: { id: configId } });
    if (!serverConfig?.sshUsername || !serverConfig.sshPassword || !serverConfig.sshPort) return;

    const client = new SshQueryClient({
      host: serverConfig.host,
      port: serverConfig.sshPort,
      username: serverConfig.sshUsername,
      password: decrypt(serverConfig.sshPassword),
    });

    client.on('ready', async () => {
      logger.info(`[EventBridge] CMD listener SSH connected for ${key}`);
      try {
        await client.registerCommandListener(sid, channelId);
      } catch (err: any) {
        logger.error(`[EventBridge] CMD listener register failed for ${key}: ${err.message}`);
      }
    });

    client.on('event', (eventName: string, data: Record<string, string>) => {
      // Marker so engine can keep backward compatibility:
      // triggers WITHOUT channelId should only react to base connection events
      const enriched = { ...data, __cmd_listener_channel_id: String(channelId) };
      this.emit('tsEvent', configId, sid, eventName, enriched);
    });

    client.on('error', (err: Error) => logger.error(`[EventBridge] CMD listener SSH error for ${key}: ${err.message}`));
    client.on('close', () => logger.info(`[EventBridge] CMD listener SSH disconnected for ${key}`));

    this.commandListeners.set(key, client);
    try { await client.connect(); } catch (err: any) {
      logger.error(`[EventBridge] CMD listener initial connect failed for ${key}: ${err.message}`);
      if (client.hasFatalError) this.commandListeners.delete(key);
    }
  }

  async disconnectCommandListener(configId: number, sid: number, channelId: number): Promise<void> {
    const key = this.makeCmdKey(configId, sid, channelId);
    const client = this.commandListeners.get(key);
    if (client) {
      client.destroy();
      this.commandListeners.delete(key);
    }
  }

  getCommandListenerChannelIds(configId: number, sid: number): number[] {
    const prefix = `${configId}:${sid}:cmd:`;
    return Array.from(this.commandListeners.keys())
      .filter(k => k.startsWith(prefix))
      .map(k => parseInt(k.substring(prefix.length), 10))
      .filter(n => Number.isFinite(n) && n > 0);
  }

  getCommandListenerKeys(): string[] {
    return Array.from(this.commandListeners.keys());
  }

  destroy(): void {
  // existing "base" SSH connections
    for (const client of this.connections.values()) {
      client.destroy();
    }
    this.connections.clear();

    // NEW: command listener SSH connections
    for (const client of this.commandListeners.values()) {
      client.destroy();
    }
    this.commandListeners.clear();

    this.removeAllListeners();
  }
}
