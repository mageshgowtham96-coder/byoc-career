/** Cross-industry role suggestions. Free-text roles are always allowed. */
const OCCUPATIONS = [
  'Accountant','Accounting Assistant','Accounts Payable Specialist','Accounts Receivable Specialist','Auditor','Tax Analyst','Financial Analyst','Bank Teller','Banking Operations Analyst','Credit Analyst','Fraud Risk Analyst','Transaction Monitoring Analyst','Compliance Analyst','Risk Analyst',
  'Registered Nurse','Nurse Practitioner','Medical Assistant','Healthcare Administrator','Pharmacist','Medical Coder','Clinical Research Coordinator','Physician','Dentist','Physiotherapist','Radiology Technician','Lab Technician','Caregiver','Patient Coordinator',
  'Retail Associate','Store Manager','Retail Operations Manager','Merchandiser','Cashier','Inventory Associate','Customer Service Representative','Customer Support Specialist','Call Center Agent','Sales Associate','Sales Representative','Account Executive','Business Development Representative','Sales Manager','Marketing Specialist','Digital Marketing Manager','SEO Specialist','Content Writer','Social Media Manager','Graphic Designer',
  'Human Resources Assistant','HR Generalist','Recruiter','Talent Acquisition Specialist','Payroll Specialist','Office Administrator','Administrative Assistant','Executive Assistant','Operations Analyst','Operations Manager','Business Analyst','Project Coordinator','Project Manager','Program Manager','Product Manager',
  'Teacher','Teaching Assistant','School Administrator','Academic Coordinator','Tutor','Instructional Designer','Professor','Education Counselor',
  'Logistics Coordinator','Supply Chain Analyst','Warehouse Associate','Warehouse Manager','Delivery Driver','Procurement Specialist','Purchasing Manager','Transport Manager',
  'Electrician','Plumber','Carpenter','Mechanic','HVAC Technician','Construction Manager','Civil Engineer','Quality Inspector','Manufacturing Technician','Production Supervisor','Safety Officer',
  'Software Engineer','Frontend Developer','Backend Developer','Full Stack Developer','QA Engineer','Quality Assurance Analyst','Test Automation Engineer','IT Support Specialist','System Administrator','Network Engineer','Data Analyst','Data Scientist','Database Administrator','Cybersecurity Analyst','UX Designer','Technical Writer'
];
const SHORT_FORMS: Record<string,string[]> = {
  hr:['Human Resources Assistant','HR Generalist','Recruiter','Talent Acquisition Specialist'],
  qa:['QA Engineer','Quality Assurance Analyst','Test Automation Engineer','Quality Inspector'],
  ops:['Operations Analyst','Operations Manager','Retail Operations Manager','Logistics Coordinator'],
  admin:['Administrative Assistant','Office Administrator','Executive Assistant'],
  acct:['Accountant','Accounting Assistant','Financial Analyst'],
  csr:['Customer Service Representative','Customer Support Specialist'],
  bd:['Business Development Representative','Account Executive'],
  dev:['Software Engineer','Frontend Developer','Backend Developer'],
  rn:['Registered Nurse'],
  pm:['Project Manager','Product Manager','Program Manager'],
  ba:['Business Analyst','Banking Operations Analyst'],
  ae:['Account Executive'],
  ta:['Talent Acquisition Specialist','Recruiter']
};
const normalize = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function distance(a:string,b:string):number {
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let diag=prev[0]; prev[0]=i;
    for(let j=1;j<=b.length;j++){const old=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diag+(a[i-1]===b[j-1]?0:1));diag=old;}
  }
  return prev[b.length];
}
export function getOccupationSuggestions(query:string, resumeText='', cachedJobTitles:string[]=[]):string[] {
  const q=normalize(query); if(q.length<2)return [];
  const candidates=[...OCCUPATIONS,...cachedJobTitles,...resumeText.split(/[\\n,;|]/).map(x=>x.trim()).filter(x=>x.length>2)];
  const expanded=SHORT_FORMS[q]||[];
  const unique=[...new Set([...candidates,...expanded].map(x=>x.trim()).filter(Boolean))];
  return unique.map(title=>{
    const n=normalize(title), words=n.split(' ');
    const prefix=n.startsWith(q)?0:words.some(w=>w.startsWith(q))?1:2;
    const typo=Math.min(distance(q,n),...words.map(w=>distance(q,w)));
    const contains=n.includes(q)||q.split(' ').every(w=>n.includes(w));
    return {title,score:contains?prefix*100+typo:typo*100+prefix};
  }).filter(x=>normalize(x.title)!==q).filter(x=>normalize(x.title).includes(q)||distance(q,normalize(x.title))<=1||normalize(x.title).split(' ').some(w=>distance(q,w)<=1)||expanded.includes(x.title))
    .sort((a,b)=>a.score-b.score||a.title.localeCompare(b.title)).slice(0,9).map(x=>x.title);
}
export const OCCUPATION_CATALOG = OCCUPATIONS;
