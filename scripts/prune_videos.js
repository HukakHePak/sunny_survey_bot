const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Prune local ./data/videos by count or total size.
// Configuration via env:
// VIDEO_STORE_DIR (default ./data/videos)
// VIDEO_STORE_MAX_FILES (default 1000)
// VIDEO_STORE_MAX_BYTES (default 5_000_000_000 ~5GB)

const videosDir = process.env.VIDEO_STORE_DIR || path.join(__dirname, '..', 'data', 'videos');
const maxFiles = Number(process.env.VIDEO_STORE_MAX_FILES || 1000);
const maxBytes = Number(process.env.VIDEO_STORE_MAX_BYTES || 5000000000);

function getFilesSortedByMtime(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    return { path: p, mtime: stat.mtimeMs, size: stat.size };
  }).sort((a,b) => a.mtime - b.mtime);
}

function prune() {
  const files = getFilesSortedByMtime(videosDir);
  let totalBytes = files.reduce((s, f) => s + f.size, 0);
  console.log('Videos dir:', videosDir, 'files:', files.length, 'sizeBytes:', totalBytes);

  const toRemove = [];
  // remove oldest until below maxFiles
  while (files.length - toRemove.length > maxFiles && files.length > 0) {
    toRemove.push(files.shift());
  }
  // remove oldest until below maxBytes
  while (totalBytes > maxBytes && files.length > 0) {
    const f = files.shift();
    if (!f) break;
    toRemove.push(f);
    totalBytes -= f.size;
  }

  if (toRemove.length === 0) {
    console.log('No files to prune');
    return;
  }

  console.log('Pruning files:', toRemove.length);
  for (const f of toRemove) {
    try { fs.unlinkSync(f.path); console.log('Deleted', f.path); } catch (e) { console.warn('Failed to delete', f.path, e.message); }
  }
}

prune();
