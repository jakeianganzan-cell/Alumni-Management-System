const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const writePreviewDocument = (previewWindow: Window, body: string, title = "PDF Preview") => {
  previewWindow.document.open();
  previewWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        background: #f3f4f6;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
      }
      .bar {
        align-items: center;
        background: #ffffff;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        gap: 10px;
        justify-content: space-between;
        min-height: 56px;
        padding: 10px 14px;
      }
      .title {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.3;
        min-width: 0;
      }
      .actions {
        display: flex;
        flex-shrink: 0;
        gap: 8px;
      }
      a, button {
        background: #550000;
        border: 0;
        border-radius: 8px;
        color: #ffffff;
        cursor: pointer;
        display: inline-flex;
        font-size: 13px;
        font-weight: 700;
        justify-content: center;
        padding: 9px 12px;
        text-decoration: none;
        white-space: nowrap;
      }
      .secondary {
        background: #ffffff;
        border: 1px solid #d1d5db;
        color: #374151;
      }
      .viewer {
        background: #ffffff;
        height: calc(100dvh - 56px);
        width: 100%;
      }
      iframe {
        border: 0;
        display: block;
        height: 100%;
        width: 100%;
      }
      .message {
        align-items: center;
        display: flex;
        min-height: 100dvh;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      .message-box {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        max-width: 420px;
        padding: 22px;
      }
      .message-title {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .message-text {
        color: #4b5563;
        font-size: 14px;
        line-height: 1.5;
      }
      @media (max-width: 640px) {
        .bar {
          align-items: stretch;
          flex-direction: column;
        }
        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        a, button {
          width: 100%;
        }
        .viewer {
          height: calc(100dvh - 106px);
        }
      }
    </style>
  </head>
  <body>${body}</body>
</html>`);
  previewWindow.document.close();
};

export function openPdfPreviewWindow(title = "PDF Preview") {
  const previewWindow = window.open("", "_blank");

  if (previewWindow) {
    writePreviewDocument(
      previewWindow,
      `<div class="message"><div class="message-box"><div class="message-title">Preparing preview</div><div class="message-text">Generating the PDF file. This tab will update automatically.</div></div></div>`,
      title,
    );
    previewWindow.focus();
  }

  return previewWindow;
}

export function showPdfPreview(previewWindow: Window | null, blob: Blob, fileName = "preview.pdf", title = "PDF Preview") {
  const objectUrl = URL.createObjectURL(blob);
  const isPrintableHtml = blob.type.toLowerCase().includes("text/html");
  const previewTitle = isPrintableHtml ? `${title} - Printable Preview` : title;
  const downloadName = isPrintableHtml ? fileName.replace(/\.pdf$/i, ".html") : fileName;
  const viewerUrl = `${objectUrl}#toolbar=1&navpanes=0`;
  const useNativeMobilePdfViewer =
    !isPrintableHtml &&
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px)").matches;

  if (!previewWindow || previewWindow.closed) {
    const opened = window.open(viewerUrl, "_blank", "noopener,noreferrer");

    if (!opened) {
      window.location.assign(viewerUrl);
    }

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300000);
    return;
  }

  if (useNativeMobilePdfViewer) {
    previewWindow.location.replace(viewerUrl);
    previewWindow.focus();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300000);
    return;
  }

  const escapedTitle = escapeHtml(previewTitle);
  const escapedFileName = escapeHtml(downloadName);
  writePreviewDocument(
    previewWindow,
    `<div class="bar">
      <div class="title">${escapedTitle}</div>
      <div class="actions">
        <a class="secondary" href="${objectUrl}" target="_blank" rel="noopener noreferrer">Open</a>
        <a href="${objectUrl}" download="${escapedFileName}">Download</a>
      </div>
    </div>
    <div class="viewer">
      <iframe src="${viewerUrl}" title="${escapedTitle}"></iframe>
    </div>`,
    previewTitle,
  );
  previewWindow.focus();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300000);
}

export function showPdfPreviewError(previewWindow: Window | null, message: string, title = "PDF Preview") {
  if (!previewWindow || previewWindow.closed) return;

  writePreviewDocument(
    previewWindow,
    `<div class="message"><div class="message-box"><div class="message-title">Preview failed</div><div class="message-text">${escapeHtml(message)}</div></div></div>`,
    title,
  );
}
