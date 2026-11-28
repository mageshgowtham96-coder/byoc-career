import type { ApplicationRecord } from '../types';
export type ApplicationCheckInStage = 7 | 14 | null;
export function getApplicationCheckInStage(app:Pick<ApplicationRecord,'status'|'appliedDate'|'followUpDate'|'notes'|'checkIn7AcknowledgedAt'|'checkIn14AcknowledgedAt'>,now=Date.now()):ApplicationCheckInStage {
 if(app.status!=='Applied')return null;
 const days=Math.floor((now-new Date(app.appliedDate).getTime())/(24*60*60*1000));
 if(days>=14&&!app.checkIn14AcknowledgedAt)return 14;
 if(days>=7&&!app.checkIn7AcknowledgedAt)return 7;
 return null;
}
export function compactRejectedApplication(app:ApplicationRecord,reason='Did not progress',now=new Date().toISOString()):ApplicationRecord {
 const jd=(app.jobDescriptionRaw||'').replace(/\s+/g,' ').trim();
 const snapshot=app.tailoredResumeSnapshot;
 return {...app,status:'Rejected',rejectionReason:reason||app.rejectionReason||'Did not progress',rejectionDate:app.rejectionDate||now,lastActivityDate:now,jobDescriptionRaw:jd.length>200?jd.slice(0,197)+'…':jd,
 tailoredResumeSnapshot:{...snapshot,variants:[],tailoredSummary:(snapshot.tailoredSummary||'').slice(0,200),highlightedSkills:(snapshot.highlightedSkills||[]).slice(0,10),optimizedBullets:[],coverLetter:'',interviewPrepQuestions:[],exportedMaterials:[]}};
}

export function matchesRejectedApplication(app:Pick<ApplicationRecord,'status'|'company'|'role'>,company:string,role:string):boolean {
 if(app.status!=='Rejected')return false;
 const c=company.toLowerCase().trim(),r=role.toLowerCase().trim(),ac=app.company.toLowerCase().trim(),ar=app.role.toLowerCase().trim();
 return (ac===c||ac.includes(c)||c.includes(ac))&&(ar===r||ar.includes(r)||r.includes(ar));
}
