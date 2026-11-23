import React, { useState } from 'react';
import type { DocumentFollowUpQuestion } from '../../types';

interface DocumentFollowUpPanelProps {
  questions: DocumentFollowUpQuestion[];
  onSubmit: (answers: Array<{ question: string; answer: string }>) => void;
}

export const DocumentFollowUpPanel: React.FC<DocumentFollowUpPanelProps> = ({ questions, onSubmit }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (questions.length === 0) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const completed = questions
      .map((item) => ({ question: item.question, answer: (answers[item.id] || '').trim() }))
      .filter((item) => item.answer.length > 0);
    if (completed.length > 0) onSubmit(completed);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
      <h5 className="text-xs font-bold text-amber-200">Questions generated from gaps in this document</h5>
      <p className="mt-1 text-[11px] text-slate-400">Answer only what is true. Your replies are stored as user-provided evidence, not as facts found in the uploaded file.</p>
      <div className="mt-3 space-y-3">
        {questions.map((item) => (
          <label key={item.id} className="block">
            <span className="text-xs font-medium text-white">{item.question}</span>
            {item.reason && <span className="mt-0.5 block text-[11px] text-slate-400">{item.reason}</span>}
            <textarea rows={2} value={answers[item.id] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" placeholder="Your answer (optional)" />
          </label>
        ))}
      </div>
      <button type="submit" disabled={!Object.values(answers).some((answer) => answer.trim())} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">Add answers to my review</button>
    </form>
  );
};
