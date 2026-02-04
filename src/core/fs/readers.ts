import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { DEFAULT_MAX_LINES, DEFAULT_MAX_LINE_LENGTH, DEFAULT_MAX_READ_BYTES } from "./limits.js";
import type { FileReadResult, ImageMimeType } from "./types.js";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const PDF_EXTENSION = "pdf";
const NOTEBOOK_EXTENSION = "ipynb";

const BINARY_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "aac",
  "m4a",
  "wma",
  "aiff",
  "opus",
  "mp4",
  "avi",
  "mov",
  "wmv",
  "flv",
  "mkv",
  "webm",
  "m4v",
  "mpeg",
  "mpg",
  "zip",
  "rar",
  "tar",
  "gz",
  "bz2",
  "7z",
  "xz",
  "z",
  "tgz",
  "iso",
  "exe",
  "dll",
  "so",
  "dylib",
  "app",
  "msi",
  "deb",
  "rpm",
  "bin",
  "dat",
  "db",
  "sqlite",
  "sqlite3",
  "mdb",
  "idx",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "psd",
  "ai",
  "eps",
  "sketch",
  "fig",
  "xd",
  "blend",
  "obj",
  "3ds",
  "max",
  "class",
  "jar",
  "war",
  "pyc",
  "pyo",
  "rlib",
  "swf",
  "fla",
]);

function toImageMime(ext: string): ImageMimeType {
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function truncateLine(line: string): string {
  if (line.length <= DEFAULT_MAX_LINE_LENGTH) return line;
  return line.slice(0, DEFAULT_MAX_LINE_LENGTH);
}

function formatTextLines(content: string, offset: number, limit: number): {
  content: string;
  numLines: number;
  startLine: number;
  totalLines: number;
} {
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  const start = Math.max(1, offset);
  const startIndex = start - 1;
  const slice = lines.slice(startIndex, startIndex + limit).map(truncateLine);
  return {
    content: slice.join("\n"),
    numLines: slice.length,
    startLine: start,
    totalLines,
  };
}

export interface ReadFileOptions {
  offset?: number;
  limit?: number;
  maxBytes?: number;
}

export async function readFileSmart(filePath: string, options: ReadFileOptions = {}): Promise<FileReadResult> {
  const ext = extname(filePath).toLowerCase().replace(/^\./, "");
  const stats = await stat(filePath);

  if (IMAGE_EXTENSIONS.has(ext)) {
    const buffer = await readFile(filePath);
    return {
      type: "image",
      file: {
        base64: buffer.toString("base64"),
        type: toImageMime(ext),
        originalSize: buffer.length,
      },
    };
  }

  if (ext === PDF_EXTENSION) {
    const buffer = await readFile(filePath);
    return {
      type: "pdf",
      file: {
        filePath,
        base64: buffer.toString("base64"),
        originalSize: buffer.length,
      },
    };
  }

  if (ext === NOTEBOOK_EXTENSION) {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { cells?: unknown[] };
    return {
      type: "notebook",
      file: {
        filePath,
        cells: Array.isArray(parsed.cells) ? parsed.cells : [],
      },
    };
  }

  if (BINARY_EXTENSIONS.has(ext)) {
    throw new Error(
      `This tool cannot read binary files. The file appears to be a binary .${ext} file. Please use appropriate tools for binary file analysis.`
    );
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_READ_BYTES;
  const offset = options.offset ?? 1;
  const limit = options.limit ?? DEFAULT_MAX_LINES;

  if (stats.size > maxBytes && options.offset === undefined && options.limit === undefined) {
    const sizeKb = (stats.size / 1024).toFixed(1);
    const maxKb = (maxBytes / 1024).toFixed(1);
    throw new Error(
      `File content (${sizeKb}KB) exceeds maximum allowed size (${maxKb}KB). Please use offset and limit parameters to read specific portions of the file, or use the GrepTool to search for specific content.`
    );
  }

  const content = await readFile(filePath, "utf8");
  const formatted = formatTextLines(content, offset, limit);

  return {
    type: "text",
    file: {
      filePath,
      content: formatted.content,
      numLines: formatted.numLines,
      startLine: formatted.startLine,
      totalLines: formatted.totalLines,
    },
  };
}
