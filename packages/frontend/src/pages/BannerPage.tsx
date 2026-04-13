import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Image, Plus, Copy, User, Trash2, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useBanners, useCreateWidget, useDeleteWidget, useRegenerateWidgetToken } from '@/hooks/use-widgets';
import { useServers } from '@/hooks/use-servers';
import { widgetApi } from '@/api/widget.api';
import type { BannerSize, ServerConfig } from '@ts6/common';
import { DEFAULT_BANNER_LAYOUT } from '@ts6/common';

export default function BannerPage() {
  const { data: banners = [], isLoading } = useBanners();
  const { data: servers = [] } = useServers();
  const createBanner = useCreateWidget();
  const deleteBanner = useDeleteWidget();
  const regenerateToken = useRegenerateWidgetToken();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: '',
    serverConfigId: '',
    virtualServerId: '1',
    bannerSize: 'standard' as BannerSize,
  });

  function handleCreate() {
    if (!form.name || !form.serverConfigId) return;
    createBanner.mutate(
      {
        name: form.name,
        serverConfigId: Number(form.serverConfigId),
        virtualServerId: Number(form.virtualServerId) || 1,
        type: 'banner',
        bannerSize: form.bannerSize,
        bannerLayout: JSON.stringify(DEFAULT_BANNER_LAYOUT),
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ name: '', serverConfigId: '', virtualServerId: '1', bannerSize: 'standard' });
          toast.success('Banner created');
        },
        onError: () => toast.error('Failed to create banner'),
      },
    );
  }

  function copyUrl(token: string) {
    const url = widgetApi.bannerPngUrl(token);
    navigator.clipboard.writeText(url).then(() => toast.success('URL copied to clipboard'));
  }

  function copyPersonalizedUrl(token: string) {
    const url = `${widgetApi.bannerPngUrl(token)}?cuid={{client_unique_identifier}}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Personalized URL copied — paste into setBannerUrl action'));
  }

  function handleRegenerate(id: number) {
    regenerateToken.mutate(id, {
      onSuccess: () => toast.success('Token regenerated — update your banner URL'),
      onError: () => toast.error('Failed to regenerate token'),
    });
  }

  function handleDelete() {
    if (deleteId === null) return;
    deleteBanner.mutate(deleteId, {
      onSuccess: () => { setDeleteId(null); toast.success('Banner deleted'); },
      onError: () => toast.error('Failed to delete banner'),
    });
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Server Banners</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dynamic banners for TS3 and TS6 — set the URL in your server settings
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Banner
        </Button>
      </div>

      {/* Banner list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : banners.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
          <Image className="h-10 w-10 opacity-30" />
          <p className="text-sm">No banners yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {banners.map((banner) => {
            const pngUrl = widgetApi.bannerPngUrl(banner.token);
            const dims = banner.bannerSize === 'wide' ? '921×236' : '630×236';
            return (
              <Card key={banner.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{banner.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{dims}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{pngUrl}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => copyUrl(banner.token)}>
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copy URL
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyPersonalizedUrl(banner.token)}>
                          <User className="h-3.5 w-3.5 mr-1.5" />
                          Copy Personalized URL
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/banners/${banner.id}/edit`}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRegenerate(banner.id)}
                          disabled={regenerateToken.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Rotate Token
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(banner.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    {/* Live preview thumbnail */}
                    <div className="shrink-0 border rounded overflow-hidden" style={{ width: 180, height: 67 }}>
                      <img
                        src={pngUrl}
                        alt="Banner preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  </div>

                  {/* Usage instructions */}
                  <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">TS6:</span> myTS dashboard → Server Settings → Banner URL → paste the URL above</p>
                    <p><span className="font-medium text-foreground">TS3:</span> <code className="bg-muted px-1 rounded font-mono">serveredit virtualserver_hostbanner_url={pngUrl}</code></p>
                    <p><span className="font-medium text-foreground">Per-client:</span> Use the <span className="font-medium text-foreground">setBannerUrl</span> bot action on <code className="bg-muted px-1 rounded font-mono">clientconnect</code> — paste the Personalized URL as the template.</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Banner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="My Server Banner"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Server connection</Label>
              <Select value={form.serverConfigId} onValueChange={(v) => setForm((f) => ({ ...f, serverConfigId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select server…" />
                </SelectTrigger>
                <SelectContent>
                  {(servers as ServerConfig[]).map((s: ServerConfig) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.host})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Virtual server ID</Label>
              <Input
                type="number"
                min={1}
                value={form.virtualServerId}
                onChange={(e) => setForm((f) => ({ ...f, virtualServerId: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Banner size</Label>
              <Select value={form.bannerSize} onValueChange={(v) => setForm((f) => ({ ...f, bannerSize: v as BannerSize }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard — 630×236</SelectItem>
                  <SelectItem value="wide">Wide — 921×236</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createBanner.isPending || !form.name || !form.serverConfigId}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(open: boolean) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete banner?</DialogTitle>
            <DialogDescription>
              The banner URL will stop working immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteBanner.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
