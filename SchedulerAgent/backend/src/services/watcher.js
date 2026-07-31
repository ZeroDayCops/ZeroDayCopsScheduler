const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const { analyzeMedia } = require('./openrouter');
const { createIngestionNotification } = require('./notification');

const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads');

// Valid extensions
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

async function initWatcher() {
  let chokidar;
  try {
    const mod = await import('chokidar');
    chokidar = mod.default || mod;
  } catch (e) {
    console.warn('[WATCHER] Chokidar ESM import failed or not supported in this runtime environment:', e.message);
    return null;
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    try {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch (mkdirErr) {
      console.warn('[WATCHER] Could not create UPLOADS_DIR (read-only filesystem on Vercel):', mkdirErr.message);
      return null;
    }
  }
  console.log(`Initializing chokidar watcher on: ${UPLOADS_DIR}`);

  // Watch uploads directory recursively, ignore hidden files
  const watcher = chokidar.watch(UPLOADS_DIR, {

    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  });

  watcher.on('add', async (filePath) => {
    try {
      const relative = path.relative(UPLOADS_DIR, filePath);
      const parts = relative.split(path.sep);

      // We expect the path to be: workspaceId/filename
      if (parts.length !== 2) {
        return;
      }

      const [folderIdentifier, filename] = parts;
      if (filename.startsWith('trimmed-')) {
        console.log(`Watcher ignoring trimmed temp file: ${filename}`);
        return;
      }
      console.log(`Watcher detected new file: ${filename} in workspace directory ${folderIdentifier}`);

      // Verify workspace exists in DB by ID first, then fallback to brandName / slug matching
      let workspace = await prisma.workspace.findUnique({
        where: { id: folderIdentifier },
      });

      if (!workspace) {
        workspace = await prisma.workspace.findFirst({
          where: {
            OR: [
              { brandName: folderIdentifier },
              { brandName: { equals: folderIdentifier, mode: 'insensitive' } },
            ],
          },
        });
      }

      if (!workspace) {
        console.warn(`Workspace not found for directory: ${folderIdentifier}. Skipping file ingestion.`);
        return;
      }

      const workspaceId = workspace.id;

      // Check file extension
      const ext = path.extname(filename).toLowerCase();
      let mediaType;
      if (IMAGE_EXTS.includes(ext)) {
        mediaType = 'IMAGE';
      } else if (VIDEO_EXTS.includes(ext)) {
        mediaType = 'VIDEO';
      } else {
        console.warn(`Unsupported file type: ${filename}. Skipping ingestion.`);
        return;
      }

      // Check if media row already exists for this exact workspace + path (to avoid duplicates)
      const existing = await prisma.media.findFirst({
        where: {
          workspaceId,
          filepath: filePath,
        },
      });

      if (existing) {
        console.log(`Media row already exists for file: ${filename}. Skipping.`);
        return;
      }

      // Create database row synchronously
      const media = await prisma.media.create({
        data: {
          workspaceId,
          filename,
          filepath: filePath,
          mediaType,
          status: 'NEW',
        },
      });

      // Emit ingestion started notification
      createIngestionNotification(media).catch((err) => {
        console.error(`[WATCHER] Failed to create ingestion notification for ${filename}:`, err);
      });

      console.log(`Created Media row for ${filename} with status NEW. Triggering OpenRouter analysis async.`);

      // Trigger OpenRouter analysis asynchronously (non-blocking)
      analyzeMedia(media.id).catch((err) => {
        console.error(`Error in async OpenRouter analysis for media ${media.id}:`, err);
      });

    } catch (err) {
      console.error(`Watcher error processing file ${filePath}:`, err);
    }
  });

  watcher.on('error', (error) => {
    console.error(`Chokidar watcher error:`, error);
  });

  // Run initial stuck-media reconciliation sweep when watcher initializes
  reconcileStuckMedia().catch((recErr) => {
    console.error('[WATCHER RECONCILE ERROR]:', recErr.message);
  });

  return watcher;
}

/**
 * Sweeps the database for any Media rows stuck in ANALYZING for > 10 minutes
 * and flips them to FAILED to prevent silent hanging.
 */
async function reconcileStuckMedia() {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckRows = await prisma.media.findMany({
      where: {
        status: 'ANALYZING',
        updatedAt: { lte: tenMinutesAgo },
      },
    });

    if (stuckRows.length > 0) {
      console.log(`[WATCHER RECONCILE] Found ${stuckRows.length} media row(s) stuck in ANALYZING. Flipping to FAILED...`);
      for (const row of stuckRows) {
        await prisma.media.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            statusDetail: null,
            aiMasterJson: { error: 'Media analysis processing timed out (stuck in ANALYZING > 10m).' },
          },
        });
        console.log(`[WATCHER RECONCILE] Set Media ${row.id} (${row.filename}) to FAILED.`);
      }
    }
  } catch (err) {
    console.error('[WATCHER RECONCILE] Reconciliation sweep failed:', err.message);
  }
}

module.exports = { initWatcher, reconcileStuckMedia, UPLOADS_DIR };
