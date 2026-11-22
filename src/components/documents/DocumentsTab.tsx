import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  FileText, Upload, Download, RotateCw, Scissors, ArrowUpDown,
  MessageCircle, Send, Trash2, ShieldCheck, AlertTriangle, Loader2, ExternalLink
} from 'lucide-react';
import { useWizardStore } from '../../store/useWizardStore';
import { useAuthLocale } from '../../i18n/authLocale';
import { extractResumeFile } from '../../services/extractionService';
import { askDocumentQuestionWithGemini } from '../../services/documentIntelligenceService';
import { openSavedFileExternally, saveBlobToDownloads } from '../../services/exporterService';
import {
  createPdfBlob, extractPdfPages, inspectPdf, mergePdfs, reorderPdfPages, rotatePdfPage,
  type PdfInspection,
  parsePdfPageNumbers
} from '../../services/pdfWorkspaceService';

interface ChatEntry { question: string; answer: string; }

export const DocumentsTab: React.FC = () => {
  const { t } = useAuthLocale();
  const { geminiApiKey, addToast } = useWizardStore();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<PdfInspection | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [nativeSavedUri, setNativeSavedUri] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [extractionMessage, setExtractionMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pageNumber, setPageNumber] = useState('1');
  const [pageList, setPageList] = useState('1');
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const setCurrentPdf = async (nextFile: File, nextText?: string) => {
    const metadata = await inspectPdf(nextFile);
    const url = URL.createObjectURL(nextFile);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return url;
    });
    setFile(nextFile);
    setNativeSavedUri('');
    setInspection(metadata);
    setExtractedText(nextText ?? '');
    setExtractionMessage(nextText ? 'Selectable text extracted locally. Nothing has been sent to an AI provider.' : 'No readable text was extracted. This may be a scanned or complex PDF; OCR is not included yet.');
    setChat([]);
    setError('');
  };

  const handleUpload = async (selected: FileList | null) => {
    if (!selected?.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const files = Array.from(selected);
      if (files.length > 1) {
        const bytes = await mergePdfs(files);
        const mergedFile = new File([createPdfBlob(bytes)], 'BYOC_Merged_Document.pdf', { type: 'application/pdf' });
        const extraction = await extractResumeFile(mergedFile);
        await setCurrentPdf(mergedFile, extraction.success ? extraction.rawText : '');
        if (!extraction.success) setExtractionMessage(extraction.error || 'The merged PDF has no locally readable text. OCR is not available yet.');
        addToast({ type: 'success', message: `Merged ${files.length} PDFs locally.` });
      } else {
        const nextFile = files[0];
        const extraction = await extractResumeFile(nextFile);
        await setCurrentPdf(nextFile, extraction.success ? extraction.rawText : '');
        if (!extraction.success) setExtractionMessage(extraction.error || 'No readable text was found. OCR is not available in this version.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The PDF could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const applyPdfBytes = async (bytes: Uint8Array, name: string) => {
    const nextFile = new File([createPdfBlob(bytes)], name, { type: 'application/pdf' });
    const extraction = await extractResumeFile(nextFile);
    await setCurrentPdf(nextFile, extraction.success ? extraction.rawText : '');
    if (!extraction.success) setExtractionMessage(extraction.error || 'No readable text was found in the resulting PDF.');
    addToast({ type: 'success', message: 'PDF operation completed locally. Review and download the result.' });
  };

  const runOperation = async (operation: () => Promise<void>) => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try { await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : 'The PDF operation failed.'); }
    finally { setBusy(false); }
  };

  const handleRotate = () => runOperation(async () => {
    const bytes = await rotatePdfPage(file!, Number(pageNumber), 90);
    await applyPdfBytes(bytes, 'BYOC_Rotated.pdf');
  });

  const handleExtract = () => runOperation(async () => {
    const pages = parsePdfPageNumbers(pageList);
    const bytes = await extractPdfPages(file!, pages);
    await applyPdfBytes(bytes, 'BYOC_Extracted_Pages.pdf');
  });

  const handleReorder = () => runOperation(async () => {
    const pages = parsePdfPageNumbers(pageList);
    const bytes = await reorderPdfPages(file!, pages);
    await applyPdfBytes(bytes, 'BYOC_Reordered.pdf');
  });

  const savePdfToDownloads = async (): Promise<string> => {
    if (!file) throw new Error('Choose a PDF before saving.');
    const saved = await saveBlobToDownloads(file, inspection?.fileName || 'BYOC_Document.pdf', 'application/pdf');
    setNativeSavedUri(saved.uri);
    return saved.uri;
  };

  const handleSaveToDownloads = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      await savePdfToDownloads();
      addToast({ type: 'success', message: 'PDF saved to Downloads/BYOC on this device.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the PDF to Downloads/BYOC.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenSeparately = async () => {
    if (!file || busy) return;
    if (!isAndroidNative) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uri = nativeSavedUri || await savePdfToDownloads();
      await openSavedFileExternally(uri, 'application/pdf');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the saved PDF in another app.');
    } finally {
      setBusy(false);
    }
  };

  const handleAsk = async () => {
    if (!file || busy || !question.trim()) return;
    if (!geminiApiKey.trim()) {
      setError('Add and test your Gemini API key in Settings before using document chat. Local PDF tools remain available.');
      return;
    }
    const submittedQuestion = question.trim();
    setBusy(true);
    setError('');
    try {
      const answer = await askDocumentQuestionWithGemini(file, extractedText, submittedQuestion, geminiApiKey);
      setChat((items) => [...items, { question: submittedQuestion, answer }]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document chat failed. Your PDF remains unchanged.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    setFile(null);
    setNativeSavedUri('');
    setInspection(null);
    setPreviewUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return ''; });
    setExtractedText('');
    setExtractionMessage('');
    setChat([]);
    setError('');
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-300">BYOC / DOCUMENT INTELLIGENCE</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{t('PDF Workspace')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Read, inspect and organise career documents. Local tools work without an AI key.</p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/15">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{file ? t('Open / merge PDFs') : t('Choose PDF')}</span>
          <input className="sr-only" type="file" accept=".pdf,application/pdf" multiple disabled={busy} onChange={(event) => { void handleUpload(event.target.files); event.currentTarget.value = ''; }} />
        </label>
      </header>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100/90">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p><strong>{t('Local by default.')}</strong> PDF operations and text extraction happen on this device. BYOC does not save this document or chat automatically. The original PDF and your question are sent to Google only when you submit a question below.</p>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {!file ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-5 py-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-sky-300" />
          <h2 className="mt-3 text-lg font-semibold text-white">{t('Your document workspace')}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Choose a PDF to preview it, inspect its pages, extract selected pages, rotate pages, reorder pages or ask questions about its readable text.</p>
          <p className="mt-3 text-xs text-slate-500">PDF only · 10 MB maximum · 250 pages maximum</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{inspection?.fileName}</p>
                <p className="text-xs text-slate-400">{inspection?.pageCount} pages · {((inspection?.fileSize || 0) / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={handleRemove} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs text-slate-300 hover:bg-slate-800"><Trash2 className="h-4 w-4" />Remove</button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
                <span>Document preview</span>
                {isAndroidNative ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleOpenSeparately()} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-sky-500 px-3 font-semibold text-white disabled:opacity-50">
                      <ExternalLink className="h-4 w-4" />Open Separately
                    </button>
                    <button type="button" onClick={() => void handleSaveToDownloads()} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-600 px-3 font-semibold text-slate-100 disabled:opacity-50">
                      <Download className="h-4 w-4" />Save to Downloads/BYOC
                    </button>
                  </div>
                ) : previewUrl && <button type="button" onClick={() => void handleOpenSeparately()} className="inline-flex items-center gap-1 text-sky-300">Open separately <ExternalLink className="h-3 w-3" /></button>}
              </div>
              {isAndroidNative ? (
                <div className="h-[min(68vh,760px)] min-h-[360px] overflow-y-auto bg-slate-950 p-4">
                  {extractedText ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-100">{extractedText}</pre>
                  ) : (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">{extractionMessage || 'No selectable text is available in this PDF. A scanned document needs OCR before text preview is possible.'}</p>
                  )}
                </div>
              ) : (
                <iframe title="PDF document preview" src={previewUrl} className="h-[min(68vh,760px)] min-h-[360px] w-full bg-white" />
              )}
              <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">{isAndroidNative ? 'Text preview is extracted locally. Open Separately saves a copy first, then opens it in an installed PDF viewer.' : 'PDF preview support depends on the browser.'}</p>
            </div>
            <p className="rounded-lg bg-slate-900/60 p-3 text-xs text-slate-400">{extractionMessage}</p>
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Scissors className="h-4 w-4 text-sky-300" />{t('Page tools')}</h2>
              <label className="mt-3 block text-xs text-slate-400">Page number(s), comma separated</label>
              <input value={pageList} onChange={(event) => setPageList(event.target.value)} placeholder="1, 3, 5" className="mt-1 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={handleExtract} className="min-h-10 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 disabled:opacity-50">Extract pages</button>
                <button type="button" disabled={busy} onClick={handleReorder} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 disabled:opacity-50"><ArrowUpDown className="h-3.5 w-3.5" />Reorder</button>
              </div>
              <label className="mt-3 block text-xs text-slate-400">Rotate page</label>
              <div className="mt-1 flex gap-2">
                <input type="number" min="1" max={inspection?.pageCount || 1} value={pageNumber} onChange={(event) => setPageNumber(event.target.value)} className="min-h-10 w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" />
                <button type="button" disabled={busy} onClick={handleRotate} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 disabled:opacity-50"><RotateCw className="h-4 w-4" />Rotate 90°</button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4 text-violet-300" />{t('Ask this PDF')}</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Optional AI assistance using Gemini. When you submit, the original PDF (including its page images) and your question are sent to Google. Do not include documents you do not want to share with that provider. AI answers can be incomplete or wrong; verify important details against the PDF.</p>
              <div className="mt-3 space-y-2">
                {chat.map((entry, index) => <div key={index} className="space-y-1 rounded-lg bg-slate-950/70 p-3 text-xs"><p className="font-semibold text-sky-200">You: {entry.question}</p><p className="whitespace-pre-wrap text-slate-200">{entry.answer}</p></div>)}
              </div>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} placeholder="What skills or qualifications are listed?" className="mt-3 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
              <button type="button" disabled={busy || !question.trim() || !file} onClick={() => void handleAsk()} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Ask Gemini</button>
              {!geminiApiKey && <p className="mt-2 text-[11px] text-amber-200">Configure Gemini in Settings to enable document chat. Local PDF tools do not need it.</p>}
            </section>

            <a href={previewUrl} download={inspection?.fileName || 'BYOC_Document.pdf'} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-800"><Download className="h-4 w-4" />{t('Download current PDF')}</a>
            {inspection?.title && <p className="text-xs text-slate-500">Title: {inspection.title}</p>}
          </div>
        </div>
      )}
      {busy && <p role="status" className="text-center text-xs text-sky-200">Processing locally…</p>}
    </section>
  );
};
