import { describe,expect,it } from 'vitest';
import type { ApplicationRecord } from '../types';
import { compactRejectedApplication,getApplicationCheckInStage,matchesRejectedApplication } from './applicationLifecycle';

const base:ApplicationRecord={
 id:'app',jobId:'job',company:'Example',role:'Analyst',location:'Remote',workplaceType:'Remote',salary:'',appliedDate:'2026-11-01T00:00:00.000Z',status:'Applied',jobDescriptionRaw:'Full job description '.repeat(40),
 tailoredResumeSnapshot:{id:'snap',jobId:'job',jobTitle:'Analyst',company:'Example',selectedVariantId:'a',variants:[{id:'a',name:'A',badge:'',description:'',tailoredSummary:'',highlightedSkills:[],optimizedBullets:[],coverLetter:'A long letter',interviewPrepQuestions:[]}],tailoredSummary:'summary',highlightedSkills:['Excel'],optimizedBullets:[],coverLetter:'Cover letter',interviewPrepQuestions:[],generationTimestamp:'2026-11-01',authenticityGuaranteed:true,exportedMaterials:[{id:'x',format:'PDF',fileName:'file.pdf',exportedAt:'2026-11-01'}]},
 notes:'',interviewStages:[]
};
describe('application check-in lifecycle',()=>{
 it('returns 7-day check-in after seven days and not before',()=>{
  const now=new Date('2026-11-08T00:00:00Z').getTime();
  expect(getApplicationCheckInStage(base,now)).toBe(7);
  expect(getApplicationCheckInStage(base,now-1)).toBeNull();
 });
 it('returns the 14-day stage and respects acknowledged/snoozed timestamps',()=>{
  const now=new Date('2026-11-15T00:00:00Z').getTime();
  expect(getApplicationCheckInStage({...base,checkIn7AcknowledgedAt:'2026-11-08'},now)).toBe(14);
  expect(getApplicationCheckInStage({...base,checkIn7AcknowledgedAt:'2026-11-08',checkIn14AcknowledgedAt:'2026-11-15'},now)).toBeNull();
  expect(getApplicationCheckInStage({...base,checkIn7AcknowledgedAt:'2026-11-09'},now)).toBe(14);
 });
 it('keeps the rejection fingerprint collision active after compaction',()=>{
  const rejected=compactRejectedApplication(base,'Did not progress');
  expect(matchesRejectedApplication(rejected,'example','Analyst')).toBe(true);
  expect(matchesRejectedApplication(rejected,'Other Company','Analyst')).toBe(false);
 });
 it('compacts rejected application while preserving fingerprint fields and reason',()=>{
  const compact=compactRejectedApplication(base,'Rejected after interview','2026-11-15');
  expect(compact.status).toBe('Rejected');
  expect(compact.company).toBe(base.company);
  expect(compact.role).toBe(base.role);
  expect(compact.appliedDate).toBe(base.appliedDate);
  expect(compact.rejectionReason).toBe('Rejected after interview');
  expect(compact.jobDescriptionRaw.length).toBeLessThanOrEqual(200);
  expect(compact.tailoredResumeSnapshot.variants).toEqual([]);
  expect(compact.tailoredResumeSnapshot.coverLetter).toBe('');
  expect(compact.tailoredResumeSnapshot.optimizedBullets).toEqual([]);
  expect(compact.tailoredResumeSnapshot.exportedMaterials).toEqual([]);
 });
});
