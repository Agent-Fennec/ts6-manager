import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tokensApi } from '@/api/bans.api';
import { useServerStore } from '@/stores/server.store';
import { useServerGroups } from '@/hooks/use-groups';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound, Trash2, Copy, Plus } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

export default function Tokens() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  const { data, isLoading } = useQuery({ queryKey: ['tokens', c, s], queryFn: () => tokensApi.list(c!, s!), enabled: !!c && !!s });
  const { data: groupsData } = useServerGroups();
  const qc = useQueryClient();

  const deleteToken = useMutation({ mutationFn: (token: string) => tokensApi.delete(c!, s!, token), onSuccess: () => qc.invalidateQueries({ queryKey: ['tokens'] }) });
  const createToken = useMutation({ mutationFn: (body: any) => tokensApi.add(c!, s!, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tokens'] }); setShowCreate(false); resetForm(); } });

  const [showCreate, setShowCreate] = useState(false);
  const [tokenType, setTokenType] = useState<'0' | '1'>('0');
  const [groupId, setGroupId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [description, setDescription] = useState('');

  // type '1' = regular server groups; type '2' = channel groups in TS3 group types
  const serverGroups = useMemo(() => (Array.isArray(groupsData) ? groupsData.filter((g: any) => String(g.type) === '1') : []), [groupsData]);
  const tokens = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  function resetForm() { setTokenType('0'); setGroupId(''); setChannelId(''); setDescription(''); }

  function handleCreate() {
    if (!groupId) { toast.error('Select a group'); return; }
    if (tokenType === '1' && !channelId) { toast.error('Channel ID is required for channel group tokens'); return; }
    createToken.mutate(
      { tokentype: tokenType, tokenid1: groupId, tokenid2: tokenType === '1' ? channelId : 0, tokendescription: description },
      { onSuccess: (res: any) => toast.success(`Token created: ${res?.token ?? ''}`) },
    );
  }

  const columns: ColumnDef<any>[] = useMemo(() => [
    { accessorKey: 'token', header: 'Token', cell: ({ getValue }) => (
      <div className="flex items-center gap-1">
        <span className="font-mono-data text-xs truncate max-w-[200px]">{getValue() as string}</span>
        <button onClick={() => { navigator.clipboard.writeText(getValue() as string); toast.success('Copied'); }} className="p-1 hover:bg-muted rounded"><Copy className="h-3 w-3 text-muted-foreground" /></button>
      </div>
    )},
    { accessorKey: 'token_type', header: 'Type', cell: ({ getValue }) => <span className="text-xs">{(getValue() as number) === 0 ? 'Server Group' : 'Channel Group'}</span> },
    { accessorKey: 'token_id1', header: 'Group ID', cell: ({ getValue }) => <span className="font-mono-data text-xs">{getValue() as number}</span> },
    { accessorKey: 'token_description', header: 'Description', cell: ({ getValue }) => <span className="text-xs">{(getValue() as string) || '-'}</span> },
    { id: 'actions', header: '', cell: ({ row }) => (
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteToken.mutate(row.original.token, { onSuccess: () => toast.success('Token deleted') })}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    )},
  ], [deleteToken]);

  if (!c || !s) return <EmptyState icon={KeyRound} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Privilege Keys</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create Key
        </Button>
      </div>

      <DataTable columns={columns} data={tokens} searchKey="token_description" searchPlaceholder="Search tokens..." />

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Privilege Key</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={tokenType} onValueChange={(v) => { setTokenType(v as '0' | '1'); setGroupId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Server Group</SelectItem>
                  <SelectItem value="1">Channel Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tokenType === '0' ? 'Server Group' : 'Channel Group ID'}</Label>
              {tokenType === '0' ? (
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                  <SelectContent>
                    {serverGroups.map((g: any) => (
                      <SelectItem key={g.sgid} value={String(g.sgid)}>{g.name} (#{g.sgid})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="Channel Group ID (cgid)" />
              )}
            </div>
            {tokenType === '1' && (
              <div className="space-y-1.5">
                <Label>Channel ID</Label>
                <Input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="Channel ID (cid)" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. New member key" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createToken.isPending}>
              {createToken.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
