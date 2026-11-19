/**
 * Local, no-network role suggestions for the job search combobox.
 * Suggestions are prompts, not an allow-list: custom text is always searchable.
 */
const ROLE_SUGGESTIONS = [
  'Fraud Analyst',
  'Fraud & Risk Analyst',
  'Fraud Operations Analyst',
  'Fraud Investigator',
  'Fraud Prevention Analyst',
  'Transaction Monitoring Analyst',
  'AML Analyst',
  'KYC Analyst',
  'Financial Crime Analyst',
  'Chargeback Analyst',
  'Risk Analyst',
  'Compliance Analyst',
  'Anti-Money Laundering Specialist',
  'Data Analyst',
  'Business Analyst',
  'Operations Analyst',
  'Customer Support Specialist',
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'QA Engineer',
  'Cybersecurity Analyst',
  'SOC Analyst',
  'Product Analyst',
  'Project Coordinator'
] as const;

export function getRoleSuggestions(query: string, limit = 7): string[] {
  const normalized = query.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
  if (normalized.length < 2) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return ROLE_SUGGESTIONS
    .map((role, index) => {
      const candidate = role.toLowerCase();
      const score = tokens.reduce((total, token) => {
        if (candidate.startsWith(token)) return total + 4;
        if (candidate.split(/[^a-z0-9+#]+/).some((word) => word.startsWith(token))) return total + 3;
        if (candidate.includes(token)) return total + 1;
        return total;
      }, 0);
      return { role, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map((item) => item.role);
}
