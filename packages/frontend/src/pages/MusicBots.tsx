import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { musicRequestsApi } from '@/api/music-requests.api';
import { useMusicBots, useCreateMusicBot, useUpdateMusicBot, useDeleteMusicBot, usePlaySong, usePlayUrl, useEnqueue, useLoadPlaylist } from '@/hooks/use-music-bots';
import { useSongs as useSongsHook } from '@/hooks/use-music-library';
import { useRadioStations, useRadioPresets, useCreateRadioStation, useDeleteRadioStation, usePlayRadio } from '@/hooks/use-radio-stations';
import { usePlaylists } from '@/hooks/use-playlists';
import { useServers } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import {
  Music, Plus, Play, Radio, Clock,
  FileAudio, ListMusic, Video,
  Music2, Trash2,
} from 'lucide-react';
import { VideoStreamTab } from '@/components/video/VideoStreamTab';
import { toast } from 'sonner';
import type { MusicBotSummary, PlaylistSummary, SongInfo, RadioStationInfo, RadioPreset, YouTubeSearchResult } from '@ts6/common';

// Extracted components
import { BotCard } from './music-bots/BotCard';
import { QueuePanel } from './music-bots/QueuePanel';
import { PlaylistPanel } from './music-bots/PlaylistPanel';
import { MusicLibraryPanel } from './music-bots/MusicLibraryPanel';

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Play Song Dialog ─────────────────────────────────────────────────────────

function PlaySongDialog({ botId, onClose, onPlaySong, onPlayUrl, onEnqueue, onLoadPlaylist }: {
  botId: number | null;
  onClose: () => void;
  onPlaySong: (songId: number) => void;
  onPlayUrl: (url: string) => void;
  onEnqueue: (songId: number) => void;
  onLoadPlaylist: (playlistId: number) => void;
}) {
  const { selectedConfigId } = useServerStore();
  const { data: servers } = useServers();
  const [serverId, setServerId] = useState<number | null>(selectedConfigId);
  const configId = serverId || selectedConfigId;
  const { data: playlists } = usePlaylists();
  const { data: history = [] } = useQuery({
    queryKey: ['music-requests', configId],
    queryFn: () => musicRequestsApi.list(configId!),
    enabled: !!configId,
  });
  const [tab, setTab] = useState<'songs' | 'playlists' | 'history'>('songs');
  const [filter, setFilter] = useState('');

  const { data: songs } = useSongsHook(configId);

  const serverList = Array.isArray(servers) ? servers : [];
  const songList = (Array.isArray(songs) ? songs : []) as SongInfo[];
  const playlistList = (Array.isArray(playlists) ? playlists : []) as PlaylistSummary[];

  const filtered = filter
    ? songList.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()) || (s.artist || '').toLowerCase().includes(filter.toLowerCase()))
    : songList;

  return (
    <Dialog open={botId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Play Music</DialogTitle>
          <DialogDescription>Select a song or playlist to play on this bot.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Button variant={tab === 'songs' ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
            onClick={() => setTab('songs')}
          >
            <FileAudio className="h-3 w-3 mr-1" /> Songs
          </Button>
          <Button variant={tab === 'playlists' ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
            onClick={() => setTab('playlists')}
          >
            <ListMusic className="h-3 w-3 mr-1" /> Playlists
          </Button>
          <Button variant={tab === 'history' ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
            onClick={() => setTab('history')}
          >
            <Clock className="h-3 w-3 mr-1" /> History
          </Button>
          <div className="flex-1" />
          {tab === 'songs' && (
            <Select value={String(configId || '')} onValueChange={(v) => setServerId(parseInt(v))}>
              <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="Server..." /></SelectTrigger>
              <SelectContent>
                {serverList.map((s) => (
                  <SelectItem key={(s as { id: number }).id} value={String((s as { id: number }).id)}>{(s as { name: string }).name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {tab === 'songs' && (
          <>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter songs..."
              className="h-8 text-xs"
            />
            <div className="flex-1 max-h-[400px] mt-2 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No songs found. Upload songs in the Library tab first.</p>
              ) : filtered.map((song) => (
                <div key={song.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/30 transition-colors rounded group">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{song.title}</p>
                    {song.artist && <p className="text-[10px] text-muted-foreground truncate">{song.artist}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(song.duration)}</span>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="default" size="sm" className="h-6 text-[10px] px-2"
                      onClick={() => onPlaySong(song.id)}
                    >
                      <Play className="h-3 w-3 mr-0.5" /> Play
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                      onClick={() => onEnqueue(song.id)}
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Queue
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'playlists' && (
          <div className="flex-1 max-h-[400px] overflow-y-auto">
            {playlistList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No playlists. Create one in the Playlists tab.</p>
            ) : playlistList.map((pl) => (
              <div key={pl.id} className="flex items-center gap-2 py-2 px-2 hover:bg-muted/30 transition-colors rounded group">
                <ListMusic className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{pl.name}</p>
                  <p className="text-[10px] text-muted-foreground">{pl.songCount} song{pl.songCount !== 1 ? 's' : ''}</p>
                </div>
                <Button variant="default" size="sm" className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onLoadPlaylist(pl.id)}
                >
                  <Play className="h-3 w-3 mr-0.5" /> Load & Play
                </Button>
              </div>
            ))}
          </div>
        )}

        {tab === 'history' && (
          <div className="flex-1 max-h-[400px] overflow-y-auto">
            {(history as Array<{ id: string | number; title: string; url: string }>).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No music requests found. Use !play in chat to build history.</p>
            ) : (history as Array<{ id: string | number; title: string; url: string }>).map((req) => (
              <div key={req.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/30 transition-colors rounded group">
                <Music2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" title={req.title}>{req.title}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="default" size="sm" className="h-6 text-[10px] px-2"
                    onClick={() => onPlayUrl(req.url)}
                  >
                    <Play className="h-3 w-3 mr-0.5" /> Play
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bots Tab ────────────────────────────────────────────────────────────────

function BotsTab() {
  const { data, isLoading } = useMusicBots();
  const { data: servers } = useServers();
  const { selectedConfigId } = useServerStore();
  const createBot = useCreateMusicBot();
  const updateBot = useUpdateMusicBot();
  const deleteBot = useDeleteMusicBot();
  const playSong = usePlaySong();
  const playUrl = usePlayUrl();
  const enqueueSong = useEnqueue();
  const loadPlaylist = useLoadPlaylist();

  const [showCreate, setShowCreate] = useState(false);
  const [editBot, setEditBot] = useState<MusicBotSummary | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showPlayDialog, setShowPlayDialog] = useState<number | null>(null);

  // Create form
  const [form, setForm] = useState({
    name: '', serverConfigId: '', nickname: 'MusicBot', serverPassword: '', defaultChannel: '', channelPassword: '', voicePort: 9987, volume: 50, autoStart: false, nowPlayingChannelId: '',
  });

  const bots = Array.isArray(data) ? data : [];
  const serverList = Array.isArray(servers) ? servers : [];

  if (isLoading) return <PageLoader />;

  const handleCreate = () => {
    const configId = parseInt(form.serverConfigId);
    if (!configId) { toast.error('Please select a server'); return; }
    createBot.mutate({
      name: form.name,
      serverConfigId: configId,
      nickname: form.nickname || 'MusicBot',
      serverPassword: form.serverPassword || undefined,
      defaultChannel: form.defaultChannel || undefined,
      channelPassword: form.channelPassword || undefined,
      voicePort: form.voicePort,
      volume: form.volume,
      autoStart: form.autoStart,
      nowPlayingChannelId: form.nowPlayingChannelId || undefined,
    }, {
      onSuccess: () => { toast.success('Music bot created'); setShowCreate(false); resetForm(); },
      onError: () => toast.error('Failed to create bot'),
    });
  };

  const handleUpdate = () => {
    if (!editBot) return;
    updateBot.mutate({ id: editBot.id, data: {
      name: form.name,
      nickname: form.nickname,
      serverPassword: form.serverPassword || undefined,
      defaultChannel: form.defaultChannel || undefined,
      channelPassword: form.channelPassword || undefined,
      voicePort: form.voicePort,
      volume: form.volume,
      autoStart: form.autoStart,
      nowPlayingChannelId: form.nowPlayingChannelId || undefined,
    }}, {
      onSuccess: () => { toast.success('Bot updated'); setEditBot(null); },
      onError: () => toast.error('Failed to update bot'),
    });
  };

  const resetForm = () => setForm({ name: '', serverConfigId: '', nickname: 'MusicBot', serverPassword: '', defaultChannel: '', channelPassword: '', voicePort: 9987, volume: 50, autoStart: false, nowPlayingChannelId: '' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{bots.length} music bot{bots.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Bot
        </Button>
      </div>

      {bots.length === 0 ? (
        <EmptyState icon={Music} title="No music bots yet" description="Create your first voice bot to play music on your TeamSpeak server." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bots.map((bot: MusicBotSummary) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onEdit={() => {
                setForm({
                  name: bot.name,
                  serverConfigId: String(bot.serverConfigId),
                  nickname: bot.nickname,
                  serverPassword: (bot as MusicBotSummary & { serverPassword?: string }).serverPassword || '',
                  defaultChannel: bot.defaultChannel || '',
                  channelPassword: (bot as MusicBotSummary & { channelPassword?: string }).channelPassword || '',
                  voicePort: bot.voicePort ?? 9987,
                  volume: bot.volume,
                  autoStart: bot.autoStart,
                  nowPlayingChannelId: bot.nowPlayingChannelId || '',
                });
                setEditBot(bot);
              }}
              onDelete={() => setDeleteId(bot.id)}
              onPlay={() => setShowPlayDialog(bot.id)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate || editBot !== null} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditBot(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editBot ? 'Edit Music Bot' : 'New Music Bot'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Music Bot" />
            </div>
            {!editBot && (
              <div>
                <Label className="text-xs">Server</Label>
                <Select value={form.serverConfigId} onValueChange={(v) => setForm({ ...form, serverConfigId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select server..." /></SelectTrigger>
                  <SelectContent>
                    {serverList.map((s) => (
                      <SelectItem key={(s as { id: number }).id} value={String((s as { id: number }).id)}>{(s as { name: string }).name} ({(s as { host: string }).host})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Voice Port</Label>
              <Input type="number" value={form.voicePort} onChange={(e) => setForm({ ...form, voicePort: parseInt(e.target.value) || 9987 })} placeholder="9987" />
            </div>
            <div>
              <Label className="text-xs">Nickname</Label>
              <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="MusicBot" />
            </div>
            <div>
              <Label className="text-xs">Server Password</Label>
              <Input type="password" value={form.serverPassword} onChange={(e) => setForm({ ...form, serverPassword: e.target.value })} placeholder="Leave empty if none" />
            </div>
            <div>
              <Label className="text-xs">Default Channel</Label>
              <Input value={form.defaultChannel} onChange={(e) => setForm({ ...form, defaultChannel: e.target.value })} placeholder="Channel name or ID (optional)" />
            </div>
            <div>
              <Label className="text-xs">Now Playing Channel ID</Label>
              <Input value={form.nowPlayingChannelId} onChange={(e) => setForm({ ...form, nowPlayingChannelId: e.target.value })} placeholder="Channel ID to update with now playing (optional)" />
            </div>
            <div>
              <Label className="text-xs">Channel Password</Label>
              <Input type="password" value={form.channelPassword} onChange={(e) => setForm({ ...form, channelPassword: e.target.value })} placeholder="Leave empty if none" />
            </div>
            <div>
              <Label className="text-xs">Volume ({form.volume}%)</Label>
              <Slider value={[form.volume]} max={100} step={1} onValueChange={([v]) => setForm({ ...form, volume: v })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.autoStart} onCheckedChange={(v) => setForm({ ...form, autoStart: v })} />
              <Label className="text-xs">Auto-start on server startup</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditBot(null); }}>Cancel</Button>
            <Button onClick={editBot ? handleUpdate : handleCreate} disabled={!form.name || (!editBot && !form.serverConfigId) || createBot.isPending || updateBot.isPending}>
              {editBot ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Music Bot?"
        description="This will permanently delete this music bot and disconnect it from the server."
        onConfirm={() => {
          if (deleteId) deleteBot.mutate(deleteId, { onSuccess: () => { toast.success('Bot deleted'); setDeleteId(null); } });
        }}
        destructive
      />

      {/* Play Song Dialog */}
      <PlaySongDialog
        botId={showPlayDialog}
        onClose={() => setShowPlayDialog(null)}
        onPlaySong={(songId) => {
          if (showPlayDialog) {
            playSong.mutate({ botId: showPlayDialog, songId }, {
              onSuccess: () => { toast.success('Playing'); setShowPlayDialog(null); },
              onError: () => toast.error('Failed to play song'),
            });
          }
        }}
        onPlayUrl={(url) => {
          if (showPlayDialog) {
            playUrl.mutate({ botId: showPlayDialog, url }, {
              onSuccess: () => { toast.success('Playing URL'); setShowPlayDialog(null); },
              onError: () => toast.error('Failed to play URL'),
            });
          }
        }}
        onEnqueue={(songId) => {
          if (showPlayDialog) {
            enqueueSong.mutate({ botId: showPlayDialog, songId }, {
              onSuccess: () => toast.success('Added to queue'),
              onError: () => toast.error('Failed to enqueue'),
            });
          }
        }}
        onLoadPlaylist={(playlistId) => {
          if (showPlayDialog) {
            loadPlaylist.mutate({ botId: showPlayDialog, playlistId, clearFirst: true }, {
              onSuccess: () => { toast.success('Playlist loaded'); setShowPlayDialog(null); },
              onError: () => toast.error('Failed to load playlist'),
            });
          }
        }}
      />
    </div>
  );
}

// ─── Radio Tab ───────────────────────────────────────────────────────────────

function RadioTab() {
  const { selectedConfigId } = useServerStore();
  const { data: servers } = useServers();
  const [serverId, setServerId] = useState<number | null>(selectedConfigId);
  const configId = serverId || selectedConfigId;

  const { data: stations, isLoading } = useRadioStations(configId);
  const { data: presets } = useRadioPresets(configId);
  const createStation = useCreateRadioStation();
  const deleteStation = useDeleteRadioStation();
  const playRadio = usePlayRadio();

  const { data: bots } = useMusicBots();
  const runningBots = (Array.isArray(bots) ? bots : []).filter(
    (b: MusicBotSummary) => b.status !== 'stopped' && b.status !== 'error'
  );

  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', url: '', genre: '' });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const serverList = Array.isArray(servers) ? servers : [];
  const stationList = (Array.isArray(stations) ? stations : []) as RadioStationInfo[];
  const presetList = (Array.isArray(presets) ? presets : []) as RadioPreset[];

  // Auto-select first running bot
  useEffect(() => {
    if (!selectedBotId && runningBots.length > 0) {
      setSelectedBotId(runningBots[0].id);
    }
  }, [runningBots, selectedBotId]);

  const handleAddStation = () => {
    if (!configId || !addForm.name || !addForm.url) return;
    createStation.mutate({
      configId,
      data: { name: addForm.name, url: addForm.url, genre: addForm.genre || undefined },
    }, {
      onSuccess: () => { toast.success('Station added'); setShowAdd(false); setAddForm({ name: '', url: '', genre: '' }); },
      onError: () => toast.error('Failed to add station'),
    });
  };

  const handleAddPreset = (preset: RadioPreset) => {
    if (!configId) return;
    createStation.mutate({
      configId,
      data: { name: preset.name, url: preset.url, genre: preset.genre },
    }, {
      onSuccess: () => toast.success(`Added: ${preset.name}`),
      onError: () => toast.error(`Failed to add: ${preset.name}`),
    });
  };

  const handlePlay = (stationId: number) => {
    if (!selectedBotId) {
      toast.error('Select a running bot first');
      return;
    }
    playRadio.mutate({ botId: selectedBotId, stationId }, {
      onSuccess: () => toast.success('Playing radio'),
      onError: () => toast.error('Failed to play radio'),
    });
  };

  if (!configId) {
    return <EmptyState icon={Radio} title="Select a server" description="Choose a server to manage radio stations." />;
  }

  return (
    <div className="space-y-4">
      {/* Server + Bot selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={String(configId)} onValueChange={(v) => setServerId(parseInt(v))}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Server..." /></SelectTrigger>
          <SelectContent>
            {serverList.map((s) => (
              <SelectItem key={(s as { id: number }).id} value={String((s as { id: number }).id)}>{(s as { name: string }).name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-6" />

        <Label className="text-xs text-muted-foreground">Play on:</Label>
        <Select
          value={selectedBotId ? String(selectedBotId) : ''}
          onValueChange={(v) => setSelectedBotId(parseInt(v))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={runningBots.length === 0 ? 'No running bots' : 'Select bot...'} />
          </SelectTrigger>
          <SelectContent>
            {runningBots.map((b: MusicBotSummary) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => setShowPresets(true)}>
          <Radio className="h-4 w-4 mr-1" /> Presets
        </Button>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Station
        </Button>
      </div>

      {runningBots.length === 0 && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-xs text-amber-500">Start a music bot first to play radio stations.</p>
        </div>
      )}

      {/* Station List */}
      {isLoading ? <PageLoader /> : stationList.length === 0 ? (
        <EmptyState icon={Radio} title="No radio stations" description="Add stations manually or from presets to start streaming." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {stationList.map((station) => (
            <Card key={station.id} className="group hover:border-primary/30 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Radio className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{station.name}</p>
                  {station.genre && (
                    <Badge variant="outline" className="text-[9px] mt-0.5">{station.genre}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="default"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePlay(station.id)}
                    disabled={!selectedBotId || playRadio.isPending}
                  >
                    <Play className="h-4 w-4 ml-0.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setDeleteId(station.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Station Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Radio Station</DialogTitle>
            <DialogDescription>Add a custom internet radio station by providing its stream URL.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Station name" />
            </div>
            <div>
              <Label className="text-xs">Stream URL</Label>
              <Input value={addForm.url} onChange={(e) => setAddForm({ ...addForm, url: e.target.value })} placeholder="https://stream.example.com/live" />
            </div>
            <div>
              <Label className="text-xs">Genre (optional)</Label>
              <Input value={addForm.genre} onChange={(e) => setAddForm({ ...addForm, genre: e.target.value })} placeholder="Pop, Rock, Electronic..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAddStation} disabled={!addForm.name || !addForm.url || createStation.isPending}>
              Add Station
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Presets Dialog */}
      <Dialog open={showPresets} onOpenChange={setShowPresets}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-auto">
          <DialogHeader>
            <DialogTitle>Radio Presets</DialogTitle>
            <DialogDescription>Add popular radio stations with one click.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 max-h-[400px] overflow-y-auto">
            {presetList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No presets available.</p>
            ) : presetList.map((preset, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/50 transition-colors rounded">
                <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{preset.name}</p>
                  <p className="text-[10px] text-muted-foreground">{preset.genre}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                  onClick={() => handleAddPreset(preset)}
                  disabled={createStation.isPending}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresets(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Radio Station?"
        description="This will remove this station from your list."
        onConfirm={() => {
          if (deleteId && configId) deleteStation.mutate({ configId, id: deleteId }, {
            onSuccess: () => { toast.success('Station removed'); setDeleteId(null); },
          });
        }}
        destructive
      />
    </div>
  );
}

// ─── Video Streaming Tab ─────────────────────────────────────────────────────

function VideoTab() {
  const { data } = useMusicBots();
  const bots = Array.isArray(data) ? data : [];
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);

  // Auto-select first running bot
  const runningBots = bots.filter((b: MusicBotSummary) => b.status !== 'stopped' && b.status !== 'error');
  useEffect(() => {
    if (!selectedBotId && runningBots.length > 0) {
      setSelectedBotId(runningBots[0].id);
    }
  }, [runningBots, selectedBotId]);

  const selectedBot = bots.find((b: MusicBotSummary) => b.id === selectedBotId);

  return (
    <div className="space-y-4">
      {bots.length === 0 ? (
        <EmptyState icon={Video} title="No bots available" description="Create a music bot first, then use it for video streaming." />
      ) : (
        <>
          {/* Bot selector */}
          <div className="flex items-center gap-3">
            <Label className="shrink-0">Select Bot:</Label>
            <Select
              value={selectedBotId ? String(selectedBotId) : ''}
              onValueChange={(v) => setSelectedBotId(parseInt(v))}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose a bot..." />
              </SelectTrigger>
              <SelectContent>
                {bots.map((b: MusicBotSummary) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} — {b.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedBot ? (
            <VideoStreamTab botId={selectedBot.id} botStatus={selectedBot.status} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a bot to manage video streaming.</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MusicBots() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Music Bots</h1>
        </div>
      </div>

      <Tabs defaultValue="bots" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bots"><Music2 className="h-3.5 w-3.5 mr-1.5" /> Bots</TabsTrigger>
          <TabsTrigger value="queue"><ListMusic className="h-3.5 w-3.5 mr-1.5" /> Queue</TabsTrigger>
          <TabsTrigger value="video"><Video className="h-3.5 w-3.5 mr-1.5" /> Video</TabsTrigger>
          <TabsTrigger value="library"><FileAudio className="h-3.5 w-3.5 mr-1.5" /> Library</TabsTrigger>
          <TabsTrigger value="playlists"><ListMusic className="h-3.5 w-3.5 mr-1.5" /> Playlists</TabsTrigger>
          <TabsTrigger value="radio"><Radio className="h-3.5 w-3.5 mr-1.5" /> Radio</TabsTrigger>
        </TabsList>

        <TabsContent value="bots"><BotsTab /></TabsContent>
        <TabsContent value="queue"><QueuePanel /></TabsContent>
        <TabsContent value="video"><VideoTab /></TabsContent>
        <TabsContent value="library"><MusicLibraryPanel /></TabsContent>
        <TabsContent value="playlists"><PlaylistPanel /></TabsContent>
        <TabsContent value="radio"><RadioTab /></TabsContent>
      </Tabs>
    </div>
  );
}
