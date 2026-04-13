import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useBanners, useUpdateWidget } from '@/hooks/use-widgets';
import { BannerCanvas } from '@/components/banner/BannerCanvas';
import type { BannerLayout, BannerElement, BannerElementId, BannerSize } from '@ts6/common';
import { DEFAULT_BANNER_LAYOUT } from '@ts6/common';

const ELEMENT_LABELS: Record<BannerElementId, string> = {
  'server-name':      'Server Name',
  'server-host':      'Host:Port',
  'stat-online':      'Online Count',
  'stat-uptime':      'Uptime',
  'stat-channels':    'Channel Count',
  'stat-bandwidth':   'Server Bandwidth',
  'stat-time':        'Clock (HH:MM)',
  'stat-date':        'Date',
  'stat-version':     'Server Version',
  'stat-client-info': 'Client Info Block',
  'client-table':     'Client Table',
  'timestamp':        'Timestamp',
  'custom-text':      'Custom Text',
};

function parseLayout(raw: string | null): BannerLayout {
  if (raw) {
    try { return JSON.parse(raw) as BannerLayout; } catch { /* fallthrough */ }
  }
  return structuredClone(DEFAULT_BANNER_LAYOUT);
}

export default function BannerEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: banners = [] } = useBanners();
  const updateBanner = useUpdateWidget();

  const banner = banners.find((b) => b.id === Number(id));

  const [layout, setLayout] = useState<BannerLayout>(() =>
    parseLayout(banner?.bannerLayout ?? null),
  );
  const [bannerSize, setBannerSize] = useState<BannerSize>('standard');
  const [selectedId, setSelectedId] = useState<BannerElementId | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync when banner loads (async)
  useEffect(() => {
    if (banner) {
      setLayout(parseLayout(banner.bannerLayout));
      setBannerSize(banner.bannerSize as BannerSize);
    }
  }, [banner?.id]);

  const selectedEl = layout.elements.find((e) => e.id === selectedId) ?? null;

  function updateElement(id: BannerElementId, patch: Partial<BannerElement>) {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
    setIsDirty(true);
  }

  function updateLayout(patch: Partial<BannerLayout>) {
    setLayout((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  }

  const handleMove = useCallback((elId: BannerElementId, x: number, y: number) => {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((e) =>
        e.id === elId ? { ...e, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : e,
      ),
    }));
    setIsDirty(true);
  }, []);

  function handleSave() {
    if (!banner) return;
    updateBanner.mutate(
      { id: banner.id, data: { bannerSize, bannerLayout: JSON.stringify(layout) } },
      {
        onSuccess: () => { setIsDirty(false); toast.success('Banner saved'); },
        onError: () => toast.error('Failed to save banner'),
      },
    );
  }

  if (!banner) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  // Scale canvas to fit the center panel (max ~700px wide editor area minus panels)
  const bannerWidth = bannerSize === 'wide' ? 921 : 630;
  const canvasScale = Math.min(1, 640 / bannerWidth);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/banners')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium truncate flex-1">{banner.name}</span>

        <Select value={bannerSize} onValueChange={(v) => { setBannerSize(v as BannerSize); setIsDirty(true); }}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard — 630×236</SelectItem>
            <SelectItem value="wide">Wide — 921×236</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleSave} disabled={updateBanner.isPending || !isDirty}>
          <Save className="h-4 w-4 mr-2" />
          {isDirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — element list */}
        <div className="w-52 shrink-0 border-r flex flex-col overflow-y-auto">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Elements
          </p>
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {layout.elements.map((el) => (
              <button
                key={el.id}
                onClick={() => setSelectedId(el.id === selectedId ? null : el.id)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors ${
                  el.id === selectedId
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
              >
                <span
                  className="shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateElement(el.id, { visible: !el.visible });
                  }}
                >
                  {el.visible
                    ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    : <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </span>
                <span className={el.visible ? '' : 'text-muted-foreground/40'}>
                  {ELEMENT_LABELS[el.id]}
                </span>
              </button>
            ))}
          </div>

          <Separator />

          {/* Background controls */}
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Background
          </p>
          <div className="px-3 space-y-3 pb-3">
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layout.backgroundColor}
                  onChange={(e) => updateLayout({ backgroundColor: e.target.value })}
                  className="h-7 w-10 rounded cursor-pointer border border-input"
                />
                <Input
                  value={layout.backgroundColor}
                  onChange={(e) => updateLayout({ backgroundColor: e.target.value })}
                  className="h-7 text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Style</Label>
              <Select
                value={layout.backgroundType}
                onValueChange={(v) => updateLayout({ backgroundType: v as BannerLayout['backgroundType'] })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="gradient">Gradient</SelectItem>
                  <SelectItem value="stars">Stars</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(layout.backgroundType === 'gradient' || layout.backgroundType === 'stars') && (
              <div className="space-y-1">
                <Label className="text-xs">{layout.backgroundType === 'stars' ? 'Highlight color' : 'Gradient end'}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={layout.backgroundGradientEnd ?? '#1a1f2e'}
                    onChange={(e) => updateLayout({ backgroundGradientEnd: e.target.value })}
                    className="h-7 w-10 rounded cursor-pointer border border-input"
                  />
                  <Input
                    value={layout.backgroundGradientEnd ?? '#1a1f2e'}
                    onChange={(e) => updateLayout({ backgroundGradientEnd: e.target.value })}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={layout.showBottomBar ?? false}
                onCheckedChange={(v) => updateLayout({ showBottomBar: v })}
              />
              <Label className="text-xs">Bottom bar</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accent color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layout.accentColor}
                  onChange={(e) => updateLayout({ accentColor: e.target.value })}
                  className="h-7 w-10 rounded cursor-pointer border border-input"
                />
                <Input
                  value={layout.accentColor}
                  onChange={(e) => updateLayout({ accentColor: e.target.value })}
                  className="h-7 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Center — canvas */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-muted/20">
          <BannerCanvas
            layout={layout}
            bannerSize={bannerSize}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
            scale={canvasScale}
          />
        </div>

        {/* Right panel — selected element properties */}
        <div className="w-52 shrink-0 border-l overflow-y-auto">
          {selectedEl ? (
            <div className="p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {ELEMENT_LABELS[selectedEl.id]}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">X (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={selectedEl.x}
                    onChange={(e) => updateElement(selectedEl.id, { x: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Y (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={selectedEl.y}
                    onChange={(e) => updateElement(selectedEl.id, { y: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Font size</Label>
                <Input
                  type="number"
                  min={7}
                  max={40}
                  value={selectedEl.fontSize}
                  onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedEl.color}
                    onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                    className="h-7 w-10 rounded cursor-pointer border border-input"
                  />
                  <Input
                    value={selectedEl.color}
                    onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Align</Label>
                <Select
                  value={selectedEl.align}
                  onValueChange={(v) => updateElement(selectedEl.id, { align: v as BannerElement['align'] })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedEl.id === 'client-table' && (
                <div className="space-y-1">
                  <Label className="text-xs">Max clients shown</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={selectedEl.maxItems ?? 5}
                    onChange={(e) => updateElement(selectedEl.id, { maxItems: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
              )}

              {selectedEl.id === 'custom-text' && (
                <div className="space-y-1">
                  <Label className="text-xs">Text</Label>
                  <Input
                    value={selectedEl.value ?? ''}
                    onChange={(e) => updateElement(selectedEl.id, { value: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="Your text here"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 text-xs text-muted-foreground text-center mt-6">
              Click an element on the canvas to edit its properties
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
