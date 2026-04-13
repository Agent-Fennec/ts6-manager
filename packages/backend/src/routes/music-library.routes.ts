import { Router, Request, Response } from 'express';
import { parseIntParam } from '../utils/params.js';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { downloadYouTube, searchYouTube, getYouTubeUrlInfo } from '../voice/audio/youtube.js';
import { validateUrl } from '../utils/url-validator.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

const MUSIC_DIR = process.env.MUSIC_DIR || '/data/music';
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.wma', '.webm'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Ensure music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MUSIC_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

export const musicLibraryRoutes: Router = Router({ mergeParams: true });

musicLibraryRoutes.use(requireRole('admin'));

// GET /songs — List songs for this server
musicLibraryRoutes.get('/songs', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseIntParam(req.params.configId, 'configId');
    const songs = await prisma.song.findMany({
      where: { serverConfigId: configId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(songs);
  } catch (err) { next(err); }
});

// POST /upload — Upload audio file
musicLibraryRoutes.post('/upload', upload.single('file'), async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseIntParam(req.params.configId, 'configId');
    const file = req.file;
    if (!file) throw new AppError(400, 'No file uploaded');

    // Extract duration via ffprobe
    let duration: number | null = null;
    try {
      duration = await getAudioDuration(file.path);
    } catch { /* ignore duration extraction failure */ }

    // Parse title/artist from filename
    const baseName = path.basename(file.originalname, path.extname(file.originalname));
    let title = baseName;
    let artist: string | null = null;
    const dashIdx = baseName.indexOf(' - ');
    if (dashIdx > 0) {
      artist = baseName.substring(0, dashIdx).trim();
      title = baseName.substring(dashIdx + 3).trim();
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        duration,
        filePath: file.path,
        source: 'local',
        fileSize: file.size,
        serverConfigId: configId,
      },
    });

    res.status(201).json(song);
  } catch (err) { next(err); }
});

// DELETE /songs/:id — Delete song
musicLibraryRoutes.delete('/songs/:id', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseIntParam(req.params.id, 'id');
    const song = await prisma.song.findUnique({ where: { id } });
    if (!song) throw new AppError(404, 'Song not found');

    // Remove file from disk
    try {
      if (fs.existsSync(song.filePath)) {
        fs.unlinkSync(song.filePath);
      }
    } catch { /* ignore file deletion failure */ }

    await prisma.song.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /youtube/search — Search YouTube
const YOUTUBE_DOMAINS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com']);

function assertYouTubeUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new AppError(400, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new AppError(400, 'Invalid URL protocol');
  if (!YOUTUBE_DOMAINS.has(parsed.hostname)) throw new AppError(400, 'URL must be a YouTube link');
}

musicLibraryRoutes.post('/youtube/search', async (req: Request, res: Response, next) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') throw new AppError(400, 'query is required');
    if (query.length > 200) throw new AppError(400, 'query too long');
    // Reject embedded flags or URL-like strings
    if (/--|https?:\/\//.test(query)) throw new AppError(400, 'Invalid query');
    const results = await searchYouTube(query, 10);
    res.json(results);
  } catch (err) { next(err); }
});

// POST /youtube/download — Download from YouTube
musicLibraryRoutes.post('/youtube/download', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseIntParam(req.params.configId, 'configId');
    const { url } = req.body;
    if (!url) throw new AppError(400, 'url is required');
    assertYouTubeUrl(url);
    await validateUrl(url);

    const { filePath, info } = await downloadYouTube(url, MUSIC_DIR);
    const fileStats = fs.statSync(filePath);

    // Check if song already exists for this server (by sourceUrl)
    const existing = await prisma.song.findFirst({
      where: { sourceUrl: url, serverConfigId: configId },
    });
    if (existing) {
      return res.json(existing);
    }

    const song = await prisma.song.create({
      data: {
        title: info.title,
        artist: info.artist,
        duration: info.duration,
        filePath,
        source: 'youtube',
        sourceUrl: url,
        fileSize: fileStats.size,
        serverConfigId: configId,
      },
    });

    res.status(201).json(song);
  } catch (err) { next(err); }
});

// POST /youtube/info — Get info about a YouTube URL (video or playlist)
musicLibraryRoutes.post('/youtube/info', async (req: Request, res: Response, next) => {
  try {
    const { url } = req.body;
    if (!url) throw new AppError(400, 'url is required');
    assertYouTubeUrl(url);
    await validateUrl(url);
    const info = await getYouTubeUrlInfo(url);
    res.json(info);
  } catch (err) { next(err); }
});

// POST /youtube/download-batch — Download multiple YouTube videos
musicLibraryRoutes.post('/youtube/download-batch', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseIntParam(req.params.configId, 'configId');
    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) throw new AppError(400, 'urls array is required');
    if (urls.length > 50) throw new AppError(400, 'Too many URLs in batch (max 50)');

    const results: any[] = [];
    const errors: string[] = [];

    for (const url of urls) {
      try {
        assertYouTubeUrl(url);
        await validateUrl(url);
        // Check if already downloaded
        const existing = await prisma.song.findFirst({
          where: { sourceUrl: url, serverConfigId: configId },
        });
        if (existing) {
          results.push(existing);
          continue;
        }

        const { filePath, info } = await downloadYouTube(url, MUSIC_DIR);
        const fileStats = fs.statSync(filePath);

        const song = await prisma.song.create({
          data: {
            title: info.title,
            artist: info.artist,
            duration: info.duration,
            filePath,
            source: 'youtube',
            sourceUrl: url,
            fileSize: fileStats.size,
            serverConfigId: configId,
          },
        });
        results.push(song);
      } catch (err: any) {
        errors.push(`${url}: ${err.message}`);
      }
    }

    res.json({ results, errors, total: urls.length, downloaded: results.length });
  } catch (err) { next(err); }
});

// Helper: get audio duration via ffprobe
function getAudioDuration(filePath: string): Promise<number> {
  const resolvedPath = path.resolve(filePath);
  const resolvedMusicDir = path.resolve(MUSIC_DIR);
  if (!resolvedPath.startsWith(resolvedMusicDir + path.sep) && resolvedPath !== resolvedMusicDir) {
    return Promise.reject(new AppError(400, 'Invalid file path'));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ], { shell: false });

    let output = '';
    proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try {
        const parsed = JSON.parse(output);
        resolve(parseFloat(parsed.format.duration) || 0);
      } catch {
        reject(new Error('Failed to parse ffprobe output'));
      }
    });
    proc.on('error', reject);
  });
}
