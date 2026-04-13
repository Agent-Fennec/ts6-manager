import api from './client';
import type { WidgetConfig, CreateWidgetRequest, UpdateWidgetRequest } from '@ts6/common';

export const widgetApi = {
  list: (): Promise<WidgetConfig[]> =>
    api.get('/widgets').then((r) => r.data),

  listBanners: (): Promise<WidgetConfig[]> =>
    api.get('/widgets').then((r) => (r.data as WidgetConfig[]).filter((w) => w.type === 'banner')),

  listWidgets: (): Promise<WidgetConfig[]> =>
    api.get('/widgets').then((r) => (r.data as WidgetConfig[]).filter((w) => w.type !== 'banner')),

  create: (data: CreateWidgetRequest): Promise<WidgetConfig> =>
    api.post('/widgets', data).then((r) => r.data),

  update: (id: number, data: UpdateWidgetRequest): Promise<WidgetConfig> =>
    api.patch(`/widgets/${id}`, data).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/widgets/${id}`),

  regenerateToken: (id: number): Promise<WidgetConfig> =>
    api.post(`/widgets/${id}/regenerate-token`).then((r) => r.data),

  /** Returns the public banner PNG URL for a given token */
  bannerPngUrl: (token: string): string =>
    `${window.location.origin}/api/widget/${token}/banner.png`,

  /** Returns the public banner SVG URL for a given token */
  bannerSvgUrl: (token: string): string =>
    `${window.location.origin}/api/widget/${token}/banner.svg`,
};
