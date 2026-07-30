const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const prisma = require('../prisma');
const { analyzeMedia } = require('./openrouter');
const { createIngestionNotification } = require('./notification');

const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads');

// Valid extensions
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

function initWatcher() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

      const [workspaceId, filename] = parts;
      if (filename.startsWith('trimmed-')) {
        console.log(`Watcher ignoring trimmed temp file: ${filename}`);
        return;
      }
      console.log(`Watcher detected new file: ${filename} in workspace ${workspaceId}`);

      // Verify workspace exists in DB
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (!workspace) {
        console.warn(`Workspace not found for directory: ${workspaceId}. Skipping file ingestion.`);
        return;
      }

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

  return watcher;
}

module.exports = { initWatcher, UPLOADS_DIR };
