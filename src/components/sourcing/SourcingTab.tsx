import React, { useState } from 'react';
import { getMatchWarningMessage } from '../../utils/matchWarning';
import { useWizardStore } from '../../store/useWizardStore';
import {
  jobSearchEngine,
  calculateHonestMatch,
  sanitizeExternalHttpUrl,
  mergePortalShortcuts,
  buildPortalShortcutUrl,
  jobsEveryHourAdapter,
  fetchAndExtractJobFromUrl,
  type JobSearchResult
} from '../../services/jobSearchService';
import type { JobPosting, ApplicationRecord, JobSourcePortal } from '../../types';
import { getOccupationSuggestions } from '../../services/roleSuggestions';
import { expandOccupationSearchTermsWithGemini } from '../../services/geminiService';
import {
  Search,
  MapPin,
  DollarSign,
  PlusCircle,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  FileText,
  Briefcase,
  TrendingUp,
  ShieldAlert,
  History,
  BookmarkCheck,
  Globe,
  RefreshCw,
  ExternalLink,
  Link2,
  Trash2,
  X
} from 'lucide-react';

export const SourcingTab: React.FC = () => {
  const {
    jobs,
    setJobs,
    geminiApiKey,
    selectedJobId,
    setSelectedJobId,
    masterResume,
    hasMasterResume,
    setActiveTab,
    addJob,
    checkRejectionCollision,
    isJobPreviouslyTracked,
    candidatePreferences,
    setCandidatePreferences,
    addPortalShortcut,
    removePortalShortcut,
    updateJobUrl,
    addToast
  } = useWizardStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [workplaceFilter, setWorkplaceFilter] = useState<'All' | 'Remote' | 'Hybrid' | 'On-site'>('All');
  const [portalFilter, setPortalFilter] = useState<JobSourcePortal>('All');
  const [optionalLocation, setOptionalLocation] = useState(
    candidatePreferences?.preferredLocations?.[0] || ''
  );
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [liveSearchReport, setLiveSearchReport] = useState<JobSearchResult | null>(null);
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [occupationSuggestionsOpen,setOccupationSuggestionsOpen]=useState(false);
  const [isDiscoveringJobs,setIsDiscoveringJobs]=useState(false);
  const [jobUrlInput,setJobUrlInput]=useState('');
  const [isAutoImporting,setIsAutoImporting]=useState(false);

  // Portal Shortcut Builder & Inline Listing URL Editor
  const [showAddShortcutForm, setShowAddShortcutForm] = useState(false);
  const [shortcutName, setShortcutName] = useState('');
  const [shortcutUrl, setShortcutUrl] = useState('');
  const [editingUrlJobId, setEditingUrlJobId] = useState<string | null>(null);
  const [inlineUrlDraft, setInlineUrlDraft] = useState('');

  // Rejection collision alert modal state
  const [collisionRecord, setCollisionRecord] = useState<{ job: JobPosting; pastApp: ApplicationRecord } | null>(null);

  // New Custom Job Form State (clean unassumed inputs)
  const [customTitle, setCustomTitle] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customSource, setCustomSource] = useState('User Import');
  const [customLocation, setCustomLocation] = useState('');
  const [customWorkplace, setCustomWorkplace] = useState<'Remote' | 'Hybrid' | 'On-site' | 'Unspecified'>('Unspecified');
  const [customSalary, setCustomSalary] = useState('');
  const [customSkills, setCustomSkills] = useState('');
  const [customRawJD, setCustomRawJD] = useState('');

  const portalShortcuts = React.useMemo(
    () => mergePortalShortcuts(candidatePreferences?.portalShortcuts),
    [candidatePreferences?.portalShortcuts]
  );

  const resumeIngested = hasMasterResume();

  const occupationSuggestions=React.useMemo(()=>getOccupationSuggestions(searchQuery,masterResume?.rawText||'',jobs.map(j=>j.title)),[searchQuery,masterResume?.rawText,jobs]);
  const handleDiscoverJobs=async(title=searchQuery)=>{
    setIsDiscoveringJobs(true);
    try{
      const expanded=await expandOccupationSearchTermsWithGemini(title,geminiApiKey);
      const allDiscovered=await jobsEveryHourAdapter.discover('',800);
      const terms=expanded.map(t=>t.toLowerCase());
      const results=allDiscovered.filter(job=>terms.some(term=>job.title.toLowerCase().includes(term)||term.split(' ').every(word=>job.title.toLowerCase().includes(word))||job.company.toLowerCase().includes(term)||job.jobDescriptionRaw.toLowerCase().includes(term))).slice(0,120);
      const merged=[...jobs];
      for(const job of results)if(!merged.some(x=>x.id===job.id))merged.push(job);
      setJobs(merged);
      setSearchQuery(title);
      setLiveSearchReport({jobs:results,totalFound:results.length,sourcesQueried:['JobsEveryHour (cross-industry categories)'],locationNotice:'JobsEveryHour listings are indexed locally. Full descriptions are retrieved on selection; incomplete listings remain unscored.',lastUpdated:new Date().toISOString()});
      addToast({type:results.length?'success':'info',title:results.length?'Jobs Indexed':'No Results',message:`Found ${results.length} discovery listing(s) across occupational categories.`});
    }catch(err){addToast({type:'warning',message:err instanceof Error?err.message:'Job discovery unavailable.'});}
    finally{setIsDiscoveringJobs(false);}
  };
  const handleAutoImportUrl=async(url=jobUrlInput)=>{
    setIsAutoImporting(true);
    try{
      const extracted=await fetchAndExtractJobFromUrl(url,geminiApiKey);
      const match=calculateHonestMatch(extracted,masterResume);
      const fullJob={...extracted,fitScore:match.score,matchedKeywords:match.matchedKeywords,missingKeywords:match.missingKeywords,fitStatusText:match.statusText};
      addJob(fullJob);setSelectedJobId(fullJob.id);setJobUrlInput('');
      addToast({type:'success',title:'Job Imported Automatically',message:`Retrieved the job description for ${fullJob.title}. Match score: ${match.score===null?'Unavailable':match.score+'%'}.`});
    }catch(err){addToast({type:'warning',title:'Automatic Import Failed',message:err instanceof Error?err.message:'Please paste the full job description manually.'});setShowAddJobModal(true);setCustomUrl(url);}
    finally{setIsAutoImporting(false);}
  };

  const handleRunLiveSearch = async () => {
    setIsSearchingLive(true);
    try {
      const res = await jobSearchEngine.executeLiveSearch(
        {
          query: searchQuery.trim() || undefined,
          location: optionalLocation.trim() || undefined,
          workplaceType: workplaceFilter,
          portal: portalFilter,
          profession: candidatePreferences?.profession,
          targetRole: candidatePreferences?.targetRole,
          skills: masterResume?.skills.technical
        },
        masterResume,
        jobs
      );
      setLiveSearchReport(res);

      if (res.jobs.length > 0) {
        addToast({
          type: 'success',
          title: 'Stored Positions Updated',
          message: `Showing ${res.jobs.length} position(s). Queried: ${res.sourcesQueried.join(', ')}.`
        });
      } else {
        addToast({
          type: 'info',
          title: 'No Matching Stored Positions',
          message: 'No saved or imported positions match these filters. Add a job description or adjust your search.'
        });
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Stored-position search failed.'
      });
    } finally {
      setIsSearchingLive(false);
    }
  };

  const filteredJobs = React.useMemo(() => {
    const qLower = searchQuery.toLowerCase().trim();
    const locFilter = optionalLocation.trim().toLowerCase();
    return jobs
      .map((job) => {
        const match = calculateHonestMatch(job, masterResume);
        return {
          ...job,
          fitScore: match.score,
          matchedKeywords: match.matchedKeywords,
          missingKeywords: match.missingKeywords
        };
      })
      .filter((job) => {
        if (qLower) {
          const matches =
            job.title.toLowerCase().includes(qLower) ||
            job.company.toLowerCase().includes(qLower) ||
            job.location.toLowerCase().includes(qLower) ||
            (job.skillsRequired && job.skillsRequired.some((s) => s.toLowerCase().includes(qLower))) ||
            (job.jobDescriptionRaw && job.jobDescriptionRaw.toLowerCase().includes(qLower));
          if (!matches) return false;
        }
        if (locFilter && !job.location.toLowerCase().includes(locFilter)) return false;
        if (workplaceFilter !== 'All' && job.workplaceType.toLowerCase() !== workplaceFilter.toLowerCase()) {
          return false;
        }
        if (portalFilter !== 'All') {
          if (portalFilter !== 'User Import') {
            const matchPortal = (job.source || '').toLowerCase().includes(portalFilter.toLowerCase()) ||
              (job.url || '').toLowerCase().includes(portalFilter.toLowerCase());
            if (!matchPortal) return false;
          }
        }
        return true;
      })
      .sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
  }, [jobs, searchQuery, workplaceFilter, portalFilter, masterResume, optionalLocation]);

  const handleSelectJob = async (job: JobPosting) => {
    // Check Rejection Deduplication Guard
    const check = checkRejectionCollision(job.company, job.title);
    if (check.isCollision && check.pastRecord) {
      setCollisionRecord({ job, pastApp: check.pastRecord });
      addToast({
        type: 'warning',
        title: 'Previous Rejection History Located for this Role',
        message: `A past rejection was recorded for ${job.title} at ${job.company}. Review history logs to avoid wasteful repeated submissions.`
      });
      return;
    }

    if(job.source==='JobsEveryHour'&&!job.jobDescriptionRaw){
      setSelectedJobId(job.id);
      try{
        const resolved=await fetchAndExtractJobFromUrl(job.url,geminiApiKey);
        const match=calculateHonestMatch(resolved,masterResume);
        const full={...job,...resolved,id:job.id,fitScore:match.score,matchedKeywords:match.matchedKeywords,missingKeywords:match.missingKeywords,fitStatusText:match.statusText};
        setJobs(jobs.map(j=>j.id===job.id?full:j));
        addToast({type:'success',title:'Full Job Description Retrieved',message:'This listing is now scored against your resume.'});
      }catch(err){addToast({type:'warning',title:'Could Not Retrieve Full JD',message:err instanceof Error?err.message:'Paste the full JD manually to score this role.'});setCustomTitle(job.title);setCustomCompany(job.company);setCustomUrl(job.url);setShowAddJobModal(true);}
      return;
    }
    setSelectedJobId(job.id);
    addToast({
      type: 'info',
      title: 'Target Position Set',
      message: `Selected ${job.title} at ${job.company} for Vetting & Customization.`
    });
  };

  const handleCreateCustomJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customCompany.trim() || !customRawJD.trim()) {
      addToast({
        type: 'warning',
        message: 'Job Title, Company, and Raw Job Description are required.'
      });
      return;
    }

    // Check Rejection Collision for custom jobs as well
    const check = checkRejectionCollision(customCompany.trim(), customTitle.trim());
    if (check.isCollision && check.pastRecord) {
      addToast({
        type: 'warning',
        title: 'Previous Rejection History Located for this Role',
        message: `You previously recorded a rejection for this company and position on ${new Date(check.pastRecord.appliedDate).toLocaleDateString()}.`
      });
    }

    const rawUrlInput = customUrl.trim();
    const cleanListingUrl = rawUrlInput ? sanitizeExternalHttpUrl(rawUrlInput) : null;
    if (rawUrlInput && !cleanListingUrl) {
      addToast({
        type: 'warning',
        title: 'Invalid Listing URL',
        message: 'Listing URL must start with https:// or http:// (or leave blank to attach later).'
      });
      return;
    }

    const chosenSource = customSource.trim() || 'User Import';

    const skillsArray = customSkills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const honest = calculateHonestMatch(
      {
        id: 'temp',
        title: customTitle.trim(),
        company: customCompany.trim(),
        location: customLocation.trim() || 'Location Unspecified',
        workplaceType: customWorkplace,
        salary: customSalary.trim() || 'Undisclosed',
        postedDate: 'Just now',
        source: chosenSource,
        url: cleanListingUrl || '#',
        skillsRequired: skillsArray,
        fitScore: null,
        matchedKeywords: [],
        missingKeywords: [],
        experienceLevel: 'Unspecified',
        jobDescriptionRaw: customRawJD.trim()
      },
      masterResume
    );

    const newJob: JobPosting = {
      id: 'custom-' + Date.now(),
      title: customTitle.trim(),
      company: customCompany.trim(),
      location: customLocation.trim() || 'Location Unspecified',
      workplaceType: customWorkplace,
      salary: customSalary.trim() || 'Undisclosed',
      postedDate: 'Just now',
      source: chosenSource,
      url: cleanListingUrl || '#',
      skillsRequired: skillsArray,
      fitScore: honest.score,
      matchedKeywords: honest.matchedKeywords,
      missingKeywords: honest.missingKeywords,
      experienceLevel: 'Unspecified',
      jobDescriptionRaw: customRawJD.trim() // Mandatory Raw JD Caching
    };

    addJob(newJob);
    setShowAddJobModal(false);
    setCustomTitle('');
    setCustomCompany('');
    setCustomUrl('');
    setCustomSource('User Import');
    setCustomLocation('');
    setCustomSalary('');
    setCustomWorkplace('Unspecified');
    setCustomRawJD('');
    setCustomSkills('');

    addToast({
      type: 'success',
      title: 'Custom Opportunity Ingested',
      message: `Cached raw text${cleanListingUrl ? ' and posting link' : ''} for ${newJob.title} at ${newJob.company}.`
    });
  };

  const handleSaveShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = addPortalShortcut({
      name: shortcutName,
      searchUrlTemplate: shortcutUrl
    });
    if (ok) {
      setShortcutName('');
      setShortcutUrl('');
      setShowAddShortcutForm(false);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-sky-400" />
            <span>Opportunity Sourcing & Role Upgrade Engine</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Discover roles with autonomous tier upgrade highlighting and raw description caching.
          </p>
        </div>

        <button
          onClick={() => setShowAddJobModal(true)}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add Custom Job Description</span>
        </button>
      </div>

      {/* Mandatory Resume Ingestion Warning Banner */}
      {!resumeIngested && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-200">
                Fit scores are unavailable until your master resume and job skill criteria exist.
              </h4>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Upload your resume in Intake (and ensure a posting lists required skills) to compute verified keyword matching and ATS gap metrics—never generic or invented scores.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('intake')}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0"
          >
            Add Master Resume
          </button>
        </div>
      )}

      {/* Local Position Filters */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-indigo-950/20 to-slate-900/90 border border-slate-800 text-xs space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <label htmlFor="sourcing-location-filter" className="font-bold text-white">
            Filter by location:
          </label>
          <input
            id="sourcing-location-filter"
            type="text"
            aria-label="Filter saved and imported positions by location"
            value={optionalLocation}
            onChange={(e) => {
              const value = e.target.value;
              setOptionalLocation(value);
              setCandidatePreferences({ preferredLocations: value.trim() ? [value.trim()] : [] });
            }}
            placeholder="City or region (e.g. Bengaluru)"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-52"
          />
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          BYOC searches positions already saved in your workspace or manually imported. External portal shortcuts open their websites; job listings are not fetched from those sites.
        </p>
      </div>

      {/* Stored Position Source Filter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>Position Sources</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono tabular-nums">
            {filteredJobs.length} role{filteredJobs.length === 1 ? '' : 's'} shown
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(['All', 'User Import'] as JobSourcePortal[]).map((portal) => {
            const isSelectedPortal = portalFilter === portal;
            return (
              <button
                key={portal}
                type="button"
                onClick={() => setPortalFilter(portal)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isSelectedPortal
                    ? 'bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-sky-400/40'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/70'
                }`}
              >
                <span>{portal}</span>
              </button>
            );
          })}
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Search Status:</strong> Search and matching operate only on locally stored and manually imported positions. Use an external portal shortcut below to find a listing, then paste its job description and link into BYOC.
        </div>

      {/* External Portal Shortcuts (Shortcut Only — No Live API) */}
        <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                <span>External Portal Shortcuts</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300">
                  Shortcut Only · No Live Feed
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Opens the portal search in a new tab using your current query (BYOC never scrapes sites or fetches Glassdoor results without an official API).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddShortcutForm(!showAddShortcutForm)}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{showAddShortcutForm ? 'Close' : 'Add Portal Shortcut'}</span>
            </button>
          </div>

          {showAddShortcutForm && (
            <form onSubmit={handleSaveShortcut} className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Portal Name
                </label>
                <input
                  type="text"
                  value={shortcutName}
                  onChange={(e) => setShortcutName(e.target.value)}
                  placeholder="e.g. Wellfound or Company Careers"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div className="sm:col-span-6">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Search URL ({'{query}'} optional)
                </label>
                <input
                  type="url"
                  value={shortcutUrl}
                  onChange={(e) => setShortcutUrl(e.target.value)}
                  placeholder="https://wellfound.com/jobs?q={query}"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {portalShortcuts.map((shortcut) => {
              const effectiveQuery =
                searchQuery.trim() ||
                candidatePreferences?.targetRole?.trim() ||
                candidatePreferences?.profession?.trim() ||
                masterResume?.skills.technical[0] ||
                'software engineer';
              const targetHref = buildPortalShortcutUrl(shortcut.searchUrlTemplate, effectiveQuery);
              if (!targetHref) return null;

              return (
                <div
                  key={shortcut.id}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-800/90 border border-slate-700/80 pl-2.5 pr-1.5 py-1 text-xs"
                  title={shortcut.note || shortcut.name}
                >
                  <a
                    href={targetHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-slate-200 hover:text-sky-300 font-semibold transition"
                  >
                    <span>{shortcut.name}</span>
                    {shortcut.id === 'portal-glassdoor' && (
                      <span className="text-[10px] font-mono text-amber-300/90">(External Only)</span>
                    )}
                    <ExternalLink className="w-3 h-3 text-sky-400" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSource(shortcut.name);
                      setShowAddJobModal(true);
                    }}
                    title={`Paste job listing from ${shortcut.name}`}
                    className="ml-1 px-1.5 py-0.5 rounded-md bg-slate-900 hover:bg-indigo-600/30 text-[10px] text-indigo-300 font-mono transition cursor-pointer"
                  >
                    +Paste
                  </button>
                  {!shortcut.isBuiltIn && (
                    <button
                      type="button"
                      aria-label={`Remove ${shortcut.name} shortcut`}
                      onClick={() => removePortalShortcut(shortcut.id)}
                      className="p-0.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search & Workplace Filter Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={occupationSuggestionsOpen&&occupationSuggestions.length>0}
            aria-controls="occupation-suggestions"
            value={searchQuery}
            onFocus={()=>setOccupationSuggestionsOpen(true)}
            onChange={(e) => {setSearchQuery(e.target.value);setOccupationSuggestionsOpen(true);}}
            onKeyDown={(e)=>{if(e.key==='Escape')setOccupationSuggestionsOpen(false);if(e.key==='Enter'&&searchQuery.trim()){setOccupationSuggestionsOpen(false);void handleDiscoverJobs(searchQuery.trim());}}}
            placeholder="Occupation / job title (type 2+ letters)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {occupationSuggestionsOpen&&occupationSuggestions.length>0&&(
            <div id="occupation-suggestions" role="listbox" className="absolute z-30 top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              {occupationSuggestions.map((suggestion,i)=><button key={suggestion} type="button" role="option" aria-selected={false} onClick={()=>{setSearchQuery(suggestion);setOccupationSuggestionsOpen(false);void handleDiscoverJobs(suggestion);}} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-indigo-600/30 border-b border-slate-800 last:border-0">{suggestion}</button>)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={()=>void handleDiscoverJobs()} disabled={isDiscoveringJobs||searchQuery.trim().length<2} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs disabled:opacity-50">{isDiscoveringJobs?'Discovering…':'Discover Jobs (All Fields)'}</button>
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/80">
            {(['All', 'Remote', 'Hybrid', 'On-site'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setWorkplaceFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  workplaceFilter === type
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleRunLiveSearch()}
            disabled={isSearchingLive}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSearchingLive ? 'animate-spin' : ''}`} />
            <span>{isSearchingLive ? 'Searching stored positions...' : 'Search Stored Positions'}</span>
          </button>
        </div>
      </div>

      <p className="-mt-1 text-[11px] text-slate-400">
        {workplaceFilter === 'All'
          ? 'All shows saved and imported roles of any workplace type.'
          : `${workplaceFilter} filters saved and imported positions only.`}
      </p>

      <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-2xl border border-sky-500/30 bg-sky-950/20">
        <Link2 className="w-4 h-4 text-sky-400 mt-2 shrink-0" />
        <input value={jobUrlInput} onChange={e=>setJobUrlInput(e.target.value)} placeholder="Paste job URL to auto-import the full description" className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white" />
        <button type="button" disabled={isAutoImporting||!jobUrlInput.trim()} onClick={()=>void handleAutoImportUrl()} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold disabled:opacity-50">{isAutoImporting?'Reading…':'Paste Job URL to Auto-Import'}</button>
      </div>

      {/* Local Position Search Feedback */}
      {liveSearchReport && (
        <div
          className="p-3 rounded-xl border text-xs space-y-1 bg-slate-900/80 border-slate-700/80 text-slate-300"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-white">
              Sources Queried: {liveSearchReport.sourcesQueried.join(' · ')}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {new Date(liveSearchReport.lastUpdated).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">{liveSearchReport.locationNotice}</p>
        </div>
      )}

      {/* Opportunities List */}
      <div className="space-y-4">
        {filteredJobs.length === 0 ? (
          jobs.length === 0 ? (
            <div className="p-10 rounded-3xl bg-slate-800/50 border border-slate-700/80 text-center max-w-xl mx-auto my-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">
                {liveSearchReport ? 'No matching stored positions found' : 'No job listings added yet'}
              </h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                {liveSearchReport
                  ? 'No saved or imported positions match your current filters. Adjust your keywords or location, or paste a job description from an external portal.'
                  : 'BYOC does not invent job postings. Paste a job description from an external portal to get started.'}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddJobModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Paste Target Job Description</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunLiveSearch()}
                  disabled={isSearchingLive}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <Search className="w-4 h-4 text-sky-400" />
                  <span>{isSearchingLive ? 'Searching stored positions...' : 'Search Stored Positions'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-slate-800/40 border border-slate-800 text-center">
              <p className="text-xs text-slate-400 mb-3">No matching opportunities found for your criteria.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setPortalFilter('All');
                  setWorkplaceFilter('All');
                  setOptionalLocation('');
                  setCandidatePreferences({ preferredLocations: [] });
                }}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold mr-2 cursor-pointer"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => setShowAddJobModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                Paste Another Job Description
              </button>
            </div>
          )
        ) : (
          filteredJobs.map((job) => {
            const isSelected = selectedJobId === job.id;
            const isUpgrade = Boolean(job.isRoleUpgrade);
            const isPreviouslyTracked = isJobPreviouslyTracked(job.company, job.title);
            const matchWarning = getMatchWarningMessage(job);

            return (
              <div
                key={job.id}
                className={`p-5 rounded-3xl border transition-all relative overflow-hidden ${
                  isPreviouslyTracked
                    ? 'border-purple-500/40 bg-slate-800/50 opacity-90'
                    : isUpgrade
                    ? 'border-indigo-500/80 bg-gradient-to-br from-slate-800 via-slate-800/90 to-indigo-950/30 shadow-xl shadow-indigo-950/40'
                    : isSelected
                    ? 'border-sky-500 bg-slate-800 shadow-xl shadow-sky-950/30 ring-1 ring-sky-500/50'
                    : 'border-slate-800 bg-slate-800/70 hover:border-slate-700 hover:bg-slate-800/90'
                }`}
              >
                {/* Glowing Top Accent for Role Upgrade */}
                {isUpgrade && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500" />
                )}

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono font-bold text-sky-400">
                        {job.company}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-[11px] text-slate-400">{job.postedDate}</span>

                      {/* Source Portal Chip */}
                      <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50 text-[10px] font-mono font-semibold flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5 text-indigo-400" />
                        <span>{job.source}</span>
                      </span>

                      {/* Sourcing Collision Filter Tag */}
                      {isPreviouslyTracked && (
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold font-mono tracking-wide flex items-center gap-1 shadow-sm">
                          <BookmarkCheck className="w-3 h-3 text-purple-400" />
                          <span>Previously Tracked</span>
                        </span>
                      )}

                      {/* Distinct Glowing Visual Badge for Role Upgrade */}
                      {isUpgrade && (
                        <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-indigo-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold font-mono tracking-wide flex items-center gap-1 shadow-sm">
                          <TrendingUp className="w-3 h-3 text-amber-400" />
                          <span>⭐ Unlocked Career Upgrade</span>
                        </span>
                      )}

                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold font-mono">
                          Target Selected
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-white mb-2">
                      {job.title}
                    </h3>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        {job.location} ({job.workplaceType})
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <DollarSign className="w-3.5 h-3.5" />
                        {job.salary}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Level: {job.experienceLevel}
                      </span>
                    </div>
                  </div>

                  {/* Honest Fit Score Badge */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
                    {resumeIngested && job.fitScore !== null ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-white font-mono">{job.fitScore}%</span>
                          <span className="text-[10px] uppercase font-bold text-emerald-400">Match</span>
                        </div>
                        <div className="w-24 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-400 to-indigo-500"
                            style={{ width: `${job.fitScore}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {job.matchedKeywords.length}/{job.skillsRequired.length} Verified
                        </span>
                      </>
                    ) : (
                      <div className="text-right">
                        <span className="px-2 py-1 rounded-lg bg-slate-700/60 border border-slate-600/50 text-[10px] font-mono text-amber-300 block">
                          Insufficient profile data
                        </span>
                        <span className="text-[9px] text-slate-500 mt-0.5 block">
                          {!resumeIngested ? 'Upload resume in Intake' : 'No job skill criteria specified'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {matchWarning && (
                  <div
                    role="status"
                    className="mt-4 mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <p className="leading-relaxed">{matchWarning}</p>
                    </div>
                    <p className="mt-1 pl-6 text-[11px] text-amber-200/80">
                      This is an advisory only. You can still continue to Tailor Kit or mark the job as Applied.
                    </p>
                  </div>
                )}

                {/* Role Upgrade Analytical Micro-Gap Analysis Overlay */}
                {isUpgrade && job.roleUpgradeReason && (
                  <div className="mb-4 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      <span>Role-Growth Analysis ({job.pastTitleMatchRef || 'Senior -> Staff Upgrade'})</span>
                    </div>
                    <p className="text-slate-200 leading-snug">
                      {job.roleUpgradeReason}
                    </p>
                    {job.roleUpgradeGapAnalysis && (
                      <p className="text-sky-300/80 text-[11px] pt-1 border-t border-indigo-500/20">
                        <strong>Bridge Strategy:</strong> {job.roleUpgradeGapAnalysis}
                      </p>
                    )}
                  </div>
                )}

                {/* Skills tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {job.skillsRequired.map((s, i) => {
                    const isMatched = job.matchedKeywords.includes(s);
                    return (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                          isMatched
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-slate-900 border-slate-700/80 text-slate-400'
                        }`}
                      >
                        {isMatched && '✓ '}
                        {s}
                      </span>
                    );
                  })}
                </div>

                {/* Raw JD Preview */}
                <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
                  {job.jobDescriptionRaw}
                </p>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
                  {isPreviouslyTracked ? (
                    <div
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/80 cursor-not-allowed select-none"
                      title="Role is already recorded in your Tracking Pipeline. Duplicate selection disabled to prevent resifting fatigue."
                    >
                      <BookmarkCheck className="w-3.5 h-3.5 text-purple-400" />
                      <span>Already in Tracking</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleSelectJob(job)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : isUpgrade
                          ? 'bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white shadow-md'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{isSelected ? 'Active Target Position' : 'Set as Target'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedJobId(job.id);
                      setActiveTab('vetting');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <span>Vetting Analysis</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {(() => {
                    const validJobUrl = sanitizeExternalHttpUrl(job.url);
                    if (validJobUrl) {
                      return (
                        <a
                          href={validJobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open Listing</span>
                        </a>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUrlJobId(editingUrlJobId === job.id ? null : job.id);
                          setInlineUrlDraft('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Attach Link</span>
                      </button>
                    );
                  })()}

                  <button
                    onClick={() => {
                      setSelectedJobId(job.id);
                      if (!resumeIngested) {
                        addToast({
                          type: 'warning',
                          title: 'Action Gated',
                          message: 'Add your master resume in the Intake tab to unlock AI tailoring.'
                        });
                      }
                      setActiveTab('customization');
                    }}
                    title={
                      !resumeIngested
                        ? 'Add your master resume in the Intake tab to unlock AI tailoring'
                        : 'Tailor application kit for this position'
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold transition cursor-pointer ml-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    <span>Tailor Kit</span>
                  </button>
                </div>

                {editingUrlJobId === job.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (updateJobUrl(job.id, inlineUrlDraft)) {
                        setEditingUrlJobId(null);
                        setInlineUrlDraft('');
                      }
                    }}
                    className="mt-2.5 flex items-center gap-2 pt-2.5 border-t border-slate-700/50"
                  >
                    <input
                      type="url"
                      value={inlineUrlDraft}
                      onChange={(e) => setInlineUrlDraft(e.target.value)}
                      placeholder="https://company.com/careers/role-id"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-sky-500"
                      required
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                    >
                      Save Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingUrlJobId(null)}
                      className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rejection Deduplication Collision Warning Modal */}
      {collisionRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-800 border-2 border-rose-500/60 rounded-3xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setCollisionRecord(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Rejection History Located</h3>
                <p className="text-xs text-rose-300 font-mono">Deduplication Guard Intercept</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              You previously logged a rejection for <strong>{collisionRecord.job.title}</strong> at <strong>{collisionRecord.job.company}</strong> on{' '}
              {new Date(collisionRecord.pastApp.appliedDate).toLocaleDateString()}.
            </p>

            {collisionRecord.pastApp.rejectionReason && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-400 mb-4">
                <strong>Historical Reason:</strong> {collisionRecord.pastApp.rejectionReason}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setSelectedJobId(collisionRecord.job.id);
                  setCollisionRecord(null);
                  setActiveTab('tracking');
                }}
                className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <History className="w-4 h-4" />
                <span>Review Historical Timeline Logs in Tracking</span>
              </button>

              <button
                onClick={() => {
                  // Explicit user override
                  setSelectedJobId(collisionRecord.job.id);
                  setCollisionRecord(null);
                  addToast({ type: 'info', message: 'Target set despite past rejection history.' });
                }}
                className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white text-xs font-semibold transition"
              >
                Proceed & Re-Target Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Custom Job Description */}
      {showAddJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl relative text-left my-8">
            <h3 className="text-lg font-bold text-white mb-1">
              Add Custom Job Description
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Raw JD will be cached permanently so you can access it even if the online posting expires.
            </p>

            <form onSubmit={handleCreateCustomJob} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Lead Software Engineer"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    placeholder="e.g. Acme Tech"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Original Listing URL (Optional, Recommended)
                  </label>
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://www.glassdoor.com/job-listing/..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Portal Source Label
                  </label>
                  <select
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="User Import">User Import (Direct Paste)</option>
                    {portalShortcuts.map((ps) => (
                      <option key={ps.id} value={ps.name}>
                        {ps.name}
                      </option>
                    ))}
                    <option value="Company Careers">Company Careers Page</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Workplace Type
                  </label>
                  <select
                    value={customWorkplace}
                    onChange={(e) => setCustomWorkplace(e.target.value as 'Remote' | 'Hybrid' | 'On-site' | 'Unspecified')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Unspecified">Unspecified</option>
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="On-site">On-site</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="e.g. San Francisco, CA"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Salary Band
                  </label>
                  <input
                    type="text"
                    value={customSalary}
                    onChange={(e) => setCustomSalary(e.target.value)}
                    placeholder="e.g. $170k - $200k"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Required Skills (Comma separated)
                </label>
                <input
                  type="text"
                  value={customSkills}
                  onChange={(e) => setCustomSkills(e.target.value)}
                  placeholder="TypeScript, React, Node.js, GraphQL, Docker"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Raw Job Description Text *
                </label>
                <textarea
                  rows={6}
                  value={customRawJD}
                  onChange={(e) => setCustomRawJD(e.target.value)}
                  placeholder="Paste the full JD text (About company, Responsibilities, Requirements, Benefits)..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setShowAddJobModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Save & Cache Opportunity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
