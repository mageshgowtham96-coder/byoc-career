import React, { useEffect, useRef, useState } from 'react';
import { useWizardStore } from '../store/useWizardStore';
import {
  askPdfQuestion,
  extractPdfDocument,
  extractPdfPages,
  findPdfText,
  mergePdfFiles,
  renderPdfPage,
  rotatePdfPage,
  type PdfAnswer,
  type PdfTextDocument
} from '../services/pdfWorkspaceService';
import {
  FileText, UploadCloud, Search, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  MessageCircle, Sparkles, RotateCw, Scissors, Combine, Download, ShieldCheck,
  AlertTriangle, Loader2, X, BookOpen
} from 'lucide-react';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const DocumentsTab: React.FC = () => {
  const { groqApiKey, addToast } = useWizardStore();
  const [file, setFile] = useState<File | null>(null);
  const [document, setDocument] = useState<PdfTextDocument | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.15);
  const [query, setQuery] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PdfAnswer | null>(null);
  const [consent, setConsent] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!file || !canvasRef.current) return;
    renderPdfPage(file, page, canvasRef.current, zoom).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not render this PDF page.');
    });
    return () => { cancelled = true; };
  }, [file, page, zoom]);

  const openFile = async (selected: File | undefined) => {
    if (!selected) return;
    setIsLoading(true);
    setError('');
    setAnswer(null);
    setConsent(false);
    try {
      const extracted = await extractPdfDocument(selected);
      setFile(selected);
      setDocument(extracted);
      setPage(1);
      setQuery('');
      if (extracted.isScanned) {
        setError('This looks like a scanned/image-only PDF. Text chat is unavailable because OCR is not enabled yet. Your file has not been uploaded.');
      } else {
        addToast('PDF opened locally. Its contents remain on this device unless you explicitly choose AI chat.', 'success');
      }
    } catch (err: unknown) {
      setFile(null);
      setDocument(null);
      setError(err instanceof Error ? err.message : 'Unable to open this PDF.');
    } finally {
      setIsLoading(false);
    }
  };

  const runQuestion = async () => {
    if (!document || !question.trim() || !consent) return;
    setIsAsking(true);
    setError('');
    setAnswer(null);
    try {
      const result = await askPdfQuestion(document, question, groqApiKey || '');
      setAnswer(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The document question could not be answered.');
    } finally {
      setIsAsking(false);
    }
  };

  const rotateCurrentPage = async () => {
    if (!file) return;
    try {
      const blob = await rotatePdfPage(file, page, 90);
      downloadBlob(blob, file.name.replace(/\.pdf$/i, '') + '-rotated.pdf');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not rotate the page.');
    }
  };

  const splitCurrentPage = async () => {
    if (!file) return;
    try {
      const blob = await extractPdfPages(file, [page]);
      downloadBlob(blob, file.name.replace(/\.pdf$/i, '') + `-page-${page}.pdf`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not extract this page.');
    }
  };

  const runMerge = async () => {
    try {
      const blob = await mergePdfFiles(mergeFiles);
      downloadBlob(blob, 'byoc-merged-document.pdf');
      setMergeFiles([]);
      if (mergeRef.current) mergeRef.current.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not merge these PDFs.');
    }
  };

  const results = document ? findPdfText(document, query) : [];

  return (
    <section className="space-y-5 pb-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sky-300 text-[11px] font-bold uppercase tracking-[0.22em]">
            <BookOpen className="h-4 w-4" /> BYOC document intelligence
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white">PDF Workspace</h1>
          <p className="mt-1 text-sm text-slate-400">Read, search, question and organise career documents on your device.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Local-first processing
        </span>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <input ref={uploadRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void openFile(e.target.files?.[0])} />
        <button type="button" onClick={() => uploadRef.current?.click()} className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-sky-500/40 bg-sky-500/5 px-4 py-5 text-center hover:bg-sky-500/10">
          {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-sky-300" /> : <UploadCloud className="h-6 w-6 text-sky-300" />}
          <span className="text-sm font-semibold text-white">{isLoading ? 'Reading PDF locally…' : file ? 'Choose a different PDF' : 'Choose a PDF to open'}</span>
          <span className="text-xs text-slate-500">PDF only · up to 10 MB · maximum 100 pages · no upload to BYOC servers</span>
        </button>
        {file && document && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-300"><FileText className="h-4 w-4 shrink-0 text-sky-300" /><span className="truncate">{file.name}</span></span>
            <button type="button" onClick={() => { setFile(null); setDocument(null); setAnswer(null); setError(''); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Close PDF"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {document && file && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3">
                <div className="text-xs font-semibold text-slate-300">Page {page} of {document.pageCount}</div>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" disabled={page >= document.pageCount} onClick={() => setPage((p) => Math.min(document.pageCount, p + 1))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-30" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
                  <span className="mx-1 h-5 w-px bg-slate-700" />
                  <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto bg-slate-950 p-3">
                <canvas ref={canvasRef} className="mx-auto h-auto max-w-full bg-white shadow-xl" aria-label={`PDF page ${page}`} />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-800 p-3">
                <button type="button" onClick={() => void rotateCurrentPage()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RotateCw className="h-3.5 w-3.5" /> Rotate page 90°</button>
                <button type="button" onClick={() => void splitCurrentPage()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Scissors className="h-3.5 w-3.5" /> Extract this page</button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white"><Search className="h-4 w-4 text-sky-300" /> Find in document</div>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or phrases…" className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500" />
                <div className="mt-2 text-xs text-slate-500">{query.trim() ? `${results.length} page(s) contain this phrase` : 'Search is performed locally on extracted text.'}</div>
                {results.slice(0, 8).map((item) => (
                  <button key={item.pageNumber} type="button" onClick={() => setPage(item.pageNumber)} className="mt-2 block w-full rounded-lg bg-slate-800/70 p-2 text-left text-xs text-slate-300 hover:bg-slate-800">
                    <span className="font-semibold text-sky-300">Page {item.pageNumber}</span><span className="mt-1 block line-clamp-2">{item.text}</span>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white"><MessageCircle className="h-4 w-4 text-indigo-300" /> Ask this PDF</div>
                {document.isScanned ? (
                  <p className="mt-3 text-xs leading-5 text-amber-200">This file has no extractable text. Scanned-document OCR is not enabled in this version.</p>
                ) : (
                  <>
                    <p className="mt-2 text-xs leading-5 text-slate-400">AI answers use the extracted document text and cite supporting page numbers. Nothing is sent until you opt in and submit a question.</p>
                    <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. Which skills are required for this role?" className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-400" />
                    <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-400">
                      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-indigo-400" />
                      I agree to send this document's extracted text to Groq for this question. This may include personal information in the PDF.
                    </label>
                    <button type="button" disabled={!consent || !question.trim() || isAsking} onClick={() => void runQuestion()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40">
                      {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isAsking ? 'Analysing document…' : 'Ask with Groq AI'}
                    </button>
                  </>
                )}
                {answer && <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{answer.answer}</p><div className="mt-3 flex flex-wrap gap-1.5">{answer.citations.map((citation) => <button key={citation} type="button" onClick={() => setPage(citation)} className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-200">Source · p. {citation}</button>)}</div></div>}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><Combine className="h-4 w-4 text-sky-300" /> Merge PDFs</div>
            <p className="mt-1 text-xs text-slate-500">Select 2–10 PDFs. Files are processed locally; merged output is limited to 100 pages.</p>
            <input ref={mergeRef} type="file" accept="application/pdf,.pdf" multiple onChange={(e) => setMergeFiles(Array.from(e.target.files || []))} className="mt-3 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{mergeFiles.length} PDF(s) selected</span>
              <button type="button" disabled={mergeFiles.length < 2} onClick={() => void runMerge()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-30"><Download className="h-3.5 w-3.5" /> Merge and download</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
