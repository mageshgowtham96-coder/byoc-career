import {describe,expect,it} from 'vitest';
import {getOccupationSuggestions} from './roleSuggestions';
describe('occupation suggestions',()=>{
 it('starts after two characters and recognizes short forms',()=>{
  expect(getOccupationSuggestions('h')).toEqual([]);
  expect(getOccupationSuggestions('HR')).toContain('Recruiter');
  expect(getOccupationSuggestions('Ops')).toContain('Operations Analyst');
 });
 it('tolerates one-character title typos and includes resume/index titles',()=>{
  expect(getOccupationSuggestions('Nurse')).toContain('Registered Nurse');
  expect(getOccupationSuggestions('Dat Analyst','', ['Data Analyst']).some(x=>x==='Data Analyst')).toBe(true);
 });
});
