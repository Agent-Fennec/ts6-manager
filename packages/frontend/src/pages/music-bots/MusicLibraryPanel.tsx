import { useState, useRef } from 'react';
import { useSongs, useUploadSong, useDeleteSong, useYouTubeSearch, useYouTubeDownload, useYouTubeInfo, useYouTubeDownloadBatch } from '@/hooks/use-music-library';
import { useServers } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Music, Upload, Search, Download, PlayCircle, FileAudio, Link, X, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/utils';
import type { SongInfo, YouTubeSearchResult } from '@ts6/common';

function formatTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicLibraryPanel() {
  const { selectedConfigId } = useServerStore();
  const { data: servers } = useServers();
  const [libServerId, setLibServerId] = useState<number | null>(selectedConfigId);
  const configId = libServerId || selectedConfigId;

  const { data: songs, isLoading } = useSongs(configId);
  const uploadSong = useUploadSong();
  const deleteSong = useDeleteSong();
  const ytSearch = useYouTubeSearch();
  const ytDownload = useYouTubeDownload();
  const ytInfo = useYouTubeInfo();
  const ytBatchDownload = useYouTubeDownloadBatch();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ytResults, setYtResults] = useState<YouTubeSearchResult[]>([]);
  const [showYt, setShowYt] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [urlInfo, setUrlInfo] = useState<{ type: 'video' | 'playlist'; items: YouTubeSearchResult[] } | null>(null);
  const [selectedUrlIds, setSelectedUrlIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  const serverList = Array.isArray(servers) ? servers : [];
  const songList = (Array.isArray(songs) ? songs : []) as SongInfo[];
  const filtered = filter
    ? songList.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()) || (s.artist || '').toLowerCase().includes(filter.toLowerCase()))
    : songList;

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !configId) return;
    Array.from(files).forEach((file) => {
      const formData = new FormData();
      formData.append('file', file);
      uploadSong.mutate({ configId, formData }, {
        onSuccess: () => toast.success(`Uploaded: ${file.name}`),
        onError: () => toast.error(`Failed to upload: ${file.name}`),
      });
    });
    e.target.value = '';
  };

  const handleYtSearch = () => {
    if (!searchQuery.trim() || !configId) return;
    ytSearch.mutate({ configId, query: searchQuery }, {
      onSuccess: (data) => {
        const results = data as YouTubeSearchResult[] | { results: YouTubeSearchResult[] };
        setYtResults(Array.isArray(results) ? results : (results as { results: YouTubeSearchResult[] }).results || []);
        setShowYt(true);
      },
      onError: () => toast.error('YouTube search failed'),
    });
  };

  const handleYtDownload = (url: string) => {
    if (!configId) return;
    ytDownload.mutate({ configId, url }, {
      onSuccess: () => toast.success('Download started'),
      onError: () => toast.error('Download failed'),
    });
  };

  const sourceIcon = (source: string) => {
    switch (source) {
      case 'youtube': return <PlayCircle className="h-3 w-3" />;
      case 'url': return <Link className="h-3 w-3" />;
      default: return <FileAudio className="h-3 w-3" />;
    }
  };

  const handleLoadUrl = () => {
    if (!ytUrl.trim() || !configId) return;
    ytInfo.mutate({ configId, url: ytUrl }, {
      onSuccess: (data) => {
        const info = data as { type: 'video' | 'playlist'; items: YouTubeSearchResult[] };
        setUrlInfo(info);
        if (info.type === 'playlist') {
          setSelectedUrlIds(new Set(info.items.map((i) => i.id)));
        }
      },
      onError: () => toast.error('Failed to load URL info'),
    });
  };

  const handleBatchDownload = () => {
    if (!configId || !urlInfo) return;
    const ids = Array.from(selectedUrlIds);
    const urls = ids.map((id) => `https://youtube.com/watch?v=${id}`);
    setBatchProgress(`Downloading 0/${urls.length}...`);
    ytBatchDownload.mutate({ configId, urls }, {
      onSuccess: (data) => {
        const result = data as { downloaded: number; total: number; errors?: string[] };
        setBatchProgress(null);
        toast.success(`Downloaded ${result.downloaded}/${result.total} songs`);
        if (result.errors?.length) toast.error(`${result.errors.length} failed`);
        setUrlInfo(null);
        setYtUrl('');
      },
      onError: () => { setBatchProgress(null); toast.error('Batch download failed'); },
    });
  };

  const toggleUrlSelect = (id: string) => {
    setSelectedUrlIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!configId) {
    return <EmptyState icon={Music} title="Select a server" description="Choose a server to manage its music library." />;
  }

  return (
    <div className="space-y-4">
      {/* Server selector + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={String(configId)} onValueChange={(v) => setLibServerId(parseInt(v))}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Server..." /></SelectTrigger>
          <SelectContent>
            {serverList.map((s) => (
              <SelectItem key={(s as { id: number }).id} value={String((s as { id: number }).id)}>{(s as { name: string }).name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter songs..."
          className="w-48"
        />
        <input ref={fileInputRef} type="file" accept="audio/*" multiple hidden onChange={handleUpload} />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadSong.isPending}>
          <Upload className="h-4 w-4 mr-1" /> {uploadSong.isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </div>

      {/* YouTube URL / Playlist Paste */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadUrl()}
                placeholder="Paste YouTube URL or Playlist URL..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleLoadUrl} disabled={ytInfo.isPending || !ytUrl.trim()}>
              {ytInfo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
              Load
            </Button>
            {urlInfo && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setUrlInfo(null); setYtUrl(''); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* URL Info Results */}
          {urlInfo && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  {urlInfo.type === 'playlist' ? `Playlist (${urlInfo.items.length} videos)` : 'Single Video'}
                </Badge>
                {urlInfo.type === 'playlist' && (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]"
                      onClick={() => setSelectedUrlIds(new Set(urlInfo.items.map((i) => i.id)))}
                    >
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]"
                      onClick={() => setSelectedUrlIds(new Set())}
                    >
                      Deselect All
                    </Button>
                    <Button variant="default" size="sm" className="h-7 text-xs"
                      onClick={handleBatchDownload}
                      disabled={selectedUrlIds.size === 0 || ytBatchDownload.isPending}
                    >
                      {ytBatchDownload.isPending ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {batchProgress || 'Downloading...'}</>
                      ) : (
                        <><Download className="h-3 w-3 mr-1" /> Download {selectedUrlIds.size} Selected</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <ScrollArea className="max-h-60">
                {urlInfo.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-2 py-1.5 rounded transition-colors ${
                      urlInfo.type === 'playlist'
                        ? `cursor-pointer ${selectedUrlIds.has(item.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => urlInfo.type === 'playlist' && toggleUrlSelect(item.id)}
                  >
                    {urlInfo.type === 'playlist' && (
                      <input
                        type="checkbox"
                        checked={selectedUrlIds.has(item.id)}
                        onChange={() => toggleUrlSelect(item.id)}
                        className="shrink-0 accent-primary"
                      />
                    )}
                    {item.thumbnail && (
                      <img src={item.thumbnail} alt="" className="h-8 w-12 rounded object-cover shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{item.artist} - {formatTime(item.duration)}</p>
                    </div>
                    {urlInfo.type === 'video' && (
                      <Button variant="default" size="sm" className="h-7 text-xs shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleYtDownload(`https://youtube.com/watch?v=${item.id}`); }}
                        disabled={ytDownload.isPending}
                      >
                        <Download className="h-3 w-3 mr-1" /> Download
                      </Button>
                    )}
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* YouTube Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleYtSearch()}
            placeholder="Search YouTube..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleYtSearch} disabled={ytSearch.isPending || !searchQuery.trim()}>
          {ytSearch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
          Search
        </Button>
      </div>

      {/* YouTube Results */}
      {showYt && ytResults.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">YouTube Results ({ytResults.length})</CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowYt(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-60 overflow-y-auto">
              {ytResults.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors">
                  {r.thumbnail && (
                    <img src={r.thumbnail} alt="" className="h-10 w-14 rounded object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground">{r.artist} - {formatTime(r.duration)}</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                    onClick={() => handleYtDownload(`https://youtube.com/watch?v=${r.id}`)}
                    disabled={ytDownload.isPending}
                  >
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Song List */}
      {isLoading ? <PageLoader /> : filtered.length === 0 ? (
        <EmptyState icon={Music} title="No songs yet" description="Upload audio files or download from YouTube to build your library." />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-2 px-3 py-2 bg-muted/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Title</span>
            <span className="w-20 text-right">Duration</span>
            <span className="w-16 text-center">Source</span>
            <span className="w-16 text-right">Size</span>
            <span className="w-16" />
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {filtered.map((song) => (
              <div key={song.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-2 px-3 py-2 hover:bg-muted/30 transition-colors items-center border-t border-border/50">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{song.title}</p>
                  {song.artist && <p className="text-[10px] text-muted-foreground truncate">{song.artist}</p>}
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right">{formatTime(song.duration)}</span>
                <span className="w-16 flex justify-center">
                  <Badge variant="outline" className="text-[9px] gap-1">{sourceIcon(song.source)} {song.source}</Badge>
                </span>
                <span className="text-xs text-muted-foreground w-16 text-right">{song.fileSize ? formatBytes(song.fileSize) : '-'}</span>
                <div className="w-16 flex justify-end">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(song.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Song?"
        description="This will permanently remove this song from the library."
        onConfirm={() => {
          if (deleteId && configId) deleteSong.mutate({ configId, songId: deleteId }, {
            onSuccess: () => { toast.success('Song deleted'); setDeleteId(null); },
          });
        }}
        destructive
      />
    </div>
  );
}
