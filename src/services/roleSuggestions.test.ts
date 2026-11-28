import {describe,expect,it} from 'vitest';
import {expandOccupationSearchTermsLocally,getOccupationSuggestions} from './roleSuggestions';
describe('occupation suggestions',()=>{
 it('starts after two characters and recognizes short forms',()=>{
  expect(getOccupationSuggestions('h')).toEqual([]);
  expect(getOccupationSuggestions('HR')).toContain('Recruiter');
  expect(getOccupationSuggestions('Ops')).toContain('Operations Analyst');
 });
 it('expands occupation synonyms locally without AI',()=>{\n  expect(expandOccupationSearchTermsLocally('Fraud Risk Analyst')).toContain('fraud analyst');\n  expect(expandOccupationSearchTermsLocally('Fraud Analyst')).toContain('fraud risk analyst');\n  expect(expandOccupationSearchTermsLocally('HR')).toContain('human resources');\n  expect(expandOccupationSearchTermsLocally('Customer Support')).toContain('customer service');\n });\n it('tolerates one-character title typos and includes resume/index titles',()=>{
  expect(getOccupationSuggestions('Nurse')).toContain('Registered Nurse');
  expect(getOccupationSuggestions('Dat Analyst','', ['Data Analyst']).some(x=>x==='Data Analyst')).toBe(true);
 });
});
