import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';

export const banRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};
const getSid = (req: Request) => parseInt(String(req.params.sid));

banRoutes.get('/', async (req: Request, res: Response, next) => {
  try { res.json(await getClient(req).execute(getSid(req), 'banlist')); } catch (err) { next(err); }
});

banRoutes.post('/', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { ip, uid, mytsid, name, banreason, time } = req.body;
    const params: Record<string, string | number> = {};
    if (ip !== undefined) params.ip = String(ip);
    if (uid !== undefined) params.uid = String(uid);
    if (mytsid !== undefined) params.mytsid = String(mytsid);
    if (name !== undefined) params.name = String(name);
    if (banreason !== undefined) params.banreason = String(banreason);
    if (time !== undefined) params.time = Number(time);
    res.status(201).json(await getClient(req).execute(getSid(req), 'banadd', params));
  } catch (err) { next(err); }
});

banRoutes.delete('/:banid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try { res.json(await getClient(req).execute(getSid(req), 'bandel', { banid: String(req.params.banid) })); } catch (err) { next(err); }
});

banRoutes.delete('/', requireRole('admin'), async (req: Request, res: Response, next) => {
  try { res.json(await getClient(req).execute(getSid(req), 'bandelall')); } catch (err) { next(err); }
});
