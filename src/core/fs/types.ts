export type TextFileResult = {
  type: "text";
  file: {
    filePath: string;
    content: string;
    numLines: number;
    startLine: number;
    totalLines: number;
  };
};

export type ImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type ImageFileResult = {
  type: "image";
  file: {
    base64: string;
    type: ImageMimeType;
    originalSize: number;
    dimensions?: {
      originalWidth?: number;
      originalHeight?: number;
      displayWidth?: number;
      displayHeight?: number;
    };
  };
};

export type NotebookFileResult = {
  type: "notebook";
  file: {
    filePath: string;
    cells: unknown[];
  };
};

export type PdfFileResult = {
  type: "pdf";
  file: {
    filePath: string;
    base64: string;
    originalSize: number;
  };
};

export type FileReadResult = TextFileResult | ImageFileResult | NotebookFileResult | PdfFileResult;
