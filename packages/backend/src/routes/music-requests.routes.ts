import { Router, Request, Response, NextFunction } from 'express';
import { parseIntParam } from '../utils/params.js';

export const musicRequestRoutes: Router = Router({ mergeParams: true });

musicRequestRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const configId = parseIntParam(req.params.configId as string, 'configId');

        const requests = await req.app.locals.prisma.musicRequest.findMany({
            where: { serverConfigId: configId },
            orderBy: { requestedAt: 'desc' },
            take: 100,
        });

        res.json(requests);
    } catch (error) {
        next(error);
    }
});
