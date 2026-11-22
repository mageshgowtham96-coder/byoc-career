import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  FileText, Upload, Download, RotateCw, Scissors, ArrowUpDown,
  MessageCircle, Send, Trash2, ShieldCheck, AlertTriangle, Loader2, ExternalLink,
  Sparkles, KeyRound, ChevronDown, ChevronUp
} from 'lucide-react';
import { useWizardStore, syncVaultFromStoreNow } from '../../store/useWizardStore';
import { useAuthLocale } from '../../i18n/authLocale';
import { extractResumeFile } from '../../services/extractionService';
import { analyzePdfDocument, askPdfWithGemini, type DocumentAnalysis } from '../../services/documentIntelligenceService';
import { openSavedFileExternally, saveBlobToDownloads } from '../../services/exporterService';
import {
  createPdfBlob, extractPdfPages, inspectPdf, mergePdfs, reorderPdfPages, rotatePdfPage,
  type PdfInspection,
  parsePdfPageNumbers
} from '../../services/pdfWorkspaceService';

interface ChatEntry { question: string; answer: string; }

export const DocumentsTab: React.FC = () => {
  const { t } = useAuthLocale();
  const { geminiApiKey, setGeminiApiKey, addToast } = useWizardStore();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<PdfInspection | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [nativeSavedUri, setNativeSavedUri] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [extractionMessage, setExtractionMessage] = useState('');
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pageNumber, setPageNumber] = useState('1');
  const [pageList, setPageList] = useState('1');
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [keyDraft, setKeyDraft] = useState(geminiApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [showSourceText, setShowSourceText] = useState(false);
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  useEffect(() => setKeyDraft(geminiApiKey || ''), [geminiApiKey]);
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
    setExtractionMessage(nextText
      ? 'Selectable text was extracted locally. It has not been sent to Google.'
      : 'Local text extraction could not read this PDF. Gemini can inspect the original PDF, including scanned pages, when you explicitly request analysis.');
    setAnalysis(null);
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
        addToast({ type: 'success', message: `Merged ${files.length} PDFs locally. Run document analysis when ready.` });
      } else {
        const nextFile = files[0];
        const extraction = await extractResumeFile(nextFile);
        await setCurrentPdf(nextFile, extraction.success ? extraction.rawText : '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The PDF could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = async () => {
    if (!file || busy) return;
    if (!geminiApiKey.trim()) {
      setError('Save a Gemini API key below before analyzing this document.');
      return;
    }
    setBusy(true);
    setError('');
    setAnalysis(null);
    try {
      const result = await analyzePdfDocument(file, geminiApiKey);
      setAnalysis(result);
      addToast({ type: 'success', title: 'Document analysis ready', message: 'Gemini analyzed the original PDF. Review extracted facts against the source before using them.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveGeminiKey = async () => {
    const trimmed = keyDraft.trim();
    setGeminiApiKey(trimmed);
    const saved = await syncVaultFromStoreNow();
    addToast({
      type: trimmed ? 'success' : 'info',
      title: trimmed ? 'Gemini key saved' : 'Gemini key cleared',
      message: trimmed
        ? saved ? 'The key is saved in your encrypted on-device vault.' : 'The key is active for this session; vault persistence could not be confirmed.'
        : 'Document AI is disabled until a key is configured.'
    });
  };

  const applyPdfBytes = async (bytes: Uint8Array, name: string) => {
    const nextFile = new File([createPdfBlob(bytes)], name, { type: 'application/pdf' });
    const extraction = await extractResumeFile(nextFile);
    await setCurrentPdf(nextFile, extraction.success ? extraction.rawText : '');
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
      setError('Save a Gemini API key below before asking questions.');
      return;
    }
    const submittedQuestion = question.trim();
    setBusy(true);
    setError('');
    try {
      const answer = await askPdfWithGemini(file, submittedQuestion, geminiApiKey);
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
    setAnalysis(null);
    setChat([]);
    setError('');
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-300">BYOC / DOCUMENT INTELLIGENCE</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{t('Document Intelligence')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Upload the original PDF. BYOC identifies its real document type and builds the results page from the sections and evidence actually found.</p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/15">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{file ? t('Open / merge PDFs') : t('Choose PDF')}</span>
          <input className="sr-only" type="file" accept=".pdf,application/pdf" multiple disabled={busy} onChange={(event) => { void handleUpload(event.target.files); event.currentTarget.value = ''; }} />
        </label>
      </header>

      <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-100/90">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <p><strong>Local until you choose AI.</strong> The PDF preview and editing tools stay on this device. When you select Analyze or ask a question, BYOC sends the original PDF to Google's Gemini API using your key. Google processes the document under the terms of your AI Studio/API account. BYOC does not send it automatically or store the PDF in a BYOC server.</p>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {!file ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-5 py-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-sky-300" />
          <h2 className="mt-3 text-lg font-semibold text-white">Your document workspace</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Choose a PDF. BYOC will first open it locally; you decide whether to ask Gemini to understand the document.</p>
          <p className="mt-3 text-xs text-slate-500">PDF only · 10 MB maximum · 250 pages maximum</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
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
                <span>Original document preview</span>
                {isAndroidNative ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleOpenSeparately()} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-sky-500 px-3 font-semibold text-white disabled:opacity-50"><ExternalLink className="h-4 w-4" />Open Separately</button>
                    <button type="button" onClick={() => void handleSaveToDownloads()} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-600 px-3 font-semibold text-slate-100 disabled:opacity-50"><Download className="h-4 w-4" />Save to Downloads/BYOC</button>
                  </div>
                ) : previewUrl && <button type="button" onClick={() => void handleOpenSeparately()} className="inline-flex items-center gap-1 text-sky-300">Open separately <ExternalLink className="h-3 w-3" /></button>}
              </div>
              {isAndroidNative ? (
                <div className="h-[min(68vh,760px)] min-h-[360px] overflow-y-auto bg-slate-950 p-4">
                  {extractedText ? <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-100">{extractedText}</pre> : <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">{extractionMessage}</p>}
                </div>
              ) : <iframe title="PDF document preview" src={previewUrl} className="h-[min(68vh,760px)] min-h-[360px] w-full bg-white" />}
              <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">{isAndroidNative ? 'Local text preview. Open Separately saves a copy first, then opens it in an installed PDF viewer.' : 'PDF preview is rendered by your browser.'}</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-xs text-slate-400">{extractionMessage}</p>
              {extractedText && <button type="button" onClick={() => setShowSourceText((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">{showSourceText ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {showSourceText ? 'Hide' : 'Inspect'} locally extracted text</button>}
              {showSourceText && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">{extractedText}</pre>}
            </div>

            {analysis && (
              <section aria-label="Document understanding results" className="space-y-4 rounded-2xl border border-indigo-400/30 bg-slate-900/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">Gemini document understanding</p>
                    <h2 className="mt-1 text-lg font-bold text-white">{analysis.title || analysis.documentType}</h2>
                    <p className="mt-1 text-xs text-slate-400">Detected document type: {analysis.documentType}</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">Generated from this PDF</span>
                </div>
                {analysis.summary && <p className="text-sm leading-6 text-slate-200">{analysis.summary}</p>}
                {analysis.keyFacts.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-300">Key facts found</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {analysis.keyFacts.map((fact, index) => <article key={index} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">{fact.label}</p>
                        <p className="mt-1 text-sm font-medium text-white">{fact.value}</p>
                        {fact.evidence && <p className="mt-2 border-l-2 border-slate-600 pl-2 text-[11px] italic text-slate-400">“{fact.evidence}”</p>}
                        {fact.page && <p className="mt-1 text-[10px] text-slate-500">Page {fact.page}</p>}
                      </article>)}
                    </div>
                  </div>
                )}
                {analysis.sections.map((section, index) => <article key={index} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                  <h3 className="text-sm font-bold text-white">{section.heading}</h3>
                  {section.content && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">{section.content}</p>}
                  {section.items.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-300">{section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}
                </article>)}
                {analysis.warnings.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <h3 className="text-xs font-bold text-amber-200">Needs human verification</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100">{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
                </div>}
                <p className="text-[10px] leading-relaxed text-slate-500">AI interpretation is a draft, not verified truth. Evidence quotes and page references should be checked against the original PDF. Nothing is saved to the Master Resume automatically.</p>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-indigo-300" />Understand this document</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Gemini receives the original PDF—not only the text BYOC's local parser managed to extract. It can interpret page images and scanned content. Results are shaped around the document's actual sections, not a fixed resume template.</p>
              <button type="button" disabled={busy || !geminiApiKey.trim()} onClick={() => void handleAnalyze()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Analyze original PDF
              </button>
              {!geminiApiKey.trim() && <p className="mt-2 text-[11px] text-amber-200">Configure Gemini below to enable document understanding.</p>}
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-sky-300" />Gemini API key</h2>
              <label htmlFor="document-gemini-key" className="mt-3 block text-xs text-slate-400">Your key is stored in the encrypted BYOC device vault.</label>
              <div className="mt-1 flex gap-2">
                <input id="document-gemini-key" type={showKey ? 'text' : 'password'} autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="Paste Gemini API key" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white" />
                <button type="button" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey((value) => !value)} className="rounded-lg border border-slate-700 px-3 text-slate-300">{showKey ? 'Hide' : 'Show'}</button>
              </div>
              <button type="button" onClick={() => void handleSaveGeminiKey()} disabled={keyDraft.trim() === (geminiApiKey || '').trim()} className="mt-2 min-h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-xs font-semibold text-slate-100 disabled:opacity-50">Save key in encrypted vault</button>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Gemini API free-tier data-use terms may differ from paid-tier terms. Do not send sensitive documents unless you are comfortable with Google's applicable terms. No provider failover occurs.</p>
            </section>

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
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4 text-violet-300" />Ask this PDF</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Each question is answered from the original PDF, not a truncated local text excerpt. The PDF is sent to Google again when you submit a question.</p>
              <div className="mt-3 space-y-2">
                {chat.map((entry, index) => <div key={index} className="space-y-1 rounded-lg bg-slate-950/70 p-3 text-xs"><p className="font-semibold text-sky-200">You: {entry.question}</p><p className="whitespace-pre-wrap text-slate-200">{entry.answer}</p></div>)}
              </div>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} placeholder="What skills or qualifications are listed?" className="mt-3 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
              <button type="button" disabled={busy || !question.trim() || !geminiApiKey.trim()} onClick={() => void handleAsk()} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Ask Gemini</button>
            </section>

            <a href={previewUrl} download={inspection?.fileName || 'BYOC_Document.pdf'} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-800"><Download className="h-4 w-4" />{t('Download current PDF')}</a>
            {inspection?.title && <p className="text-xs text-slate-500">PDF metadata title: {inspection.title}</p>}
          </div>
        </div>
      )}
      {busy && <p role="status" className="text-center text-xs text-sky-200">Working with the selected document…</p>}
    </section>
  );
};
