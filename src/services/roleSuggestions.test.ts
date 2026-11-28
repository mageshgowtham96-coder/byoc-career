import {describe,expect,it} from 'vitest';
import {expandOccupationSearchTermsLocally,getOccupationSuggestions} from './roleSuggestions';
describe('occupation suggestions',()=>{
 it('starts after two characters and recognizes short forms',()=>{
  expect(getOccupationSuggestions('h')).toEqual([]);
  expect(getOccupationSuggestions('HR')).toContain('Recruiter');
  expect(getOccupationSuggestions('Ops')).toContain('Operations Analyst');
 });
 it('expands occupation synonyms locally without AI',()=>{
  expect(expandOccupationSearchTermsLocally('Fraud Risk Analyst')).toContain('fraud analyst');
  expect(expandOccupationSearchTermsLocally('Fraud Analyst')).toContain('fraud risk analyst');
  expect(expandOccupationSearchTermsLocally('HR')).toContain('human resources');
  expect(expandOccupationSearchTermsLocally('Customer Support')).toContain('customer service');
 });
 it('tolerates one-character title typos and includes resume/index titles',()=>{
  expect(getOccupationSuggestions('Nurse')).toContain('Registered Nurse');
  expect(getOccupationSuggestions('Dat Analyst','', ['Data Analyst']).some(x=>x==='Data Analyst')).toBe(true);
 });
});
