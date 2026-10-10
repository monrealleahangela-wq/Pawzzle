import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Info,
  PawPrint,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react';
import {
  SERVICE_ADVISOR_BUDGET_OPTIONS,
  SERVICE_ADVISOR_NEED_OPTIONS,
  SERVICE_ADVISOR_PRIORITY_OPTIONS,
  serviceAdvisorLabel
} from '../constants/serviceAdvisorQuestionnaire';
import { normalizePetProfileType } from '../constants/serviceAdvisorPetContract';
import { dssService, getImageUrl } from '../services/apiService';
import { formatPeso } from '../utils/paymentSummary';

const STEPS = ['Budget', 'Pet type', 'Service needed', 'Priority', 'Review'];
const PET_TYPES = [
  ['dog', 'Dog'],
  ['cat', 'Cat'],
  ['bird', 'Bird'],
  ['rabbit', 'Rabbit'],
  ['hamster', 'Hamster'],
  ['other', 'Other']
];
const DETAIL_OPTIONS = {
  size: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['extra_large', 'Extra Large']],
  coatLength: [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']],
  coatType: [['straight', 'Straight'], ['wavy', 'Wavy'], ['curly', 'Curly'], ['double_coat', 'Double coat'], ['other', 'Other']]
};
const INITIAL_ANSWERS = {
  budget: '',
  petType: '',
  serviceNeed: '',
  priority: '',
  petProfileId: '',
  details: {}
};

const normalizeProfileValue = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
const optionLabel = (options, value) => options.find(([key]) => key === value)?.[1] || value;
const EMPTY_RESULT_COPY = {
  no_seller_services: {
    title: 'No seller services are currently available',
    message: 'There are no active seller-created Services available through Service Advisor right now.'
  },
  no_service_category: {
    title: 'No services are listed in this category yet',
    message: 'Try another service type, or check again after providers add an active Service in this category.'
  },
  store_visibility_unavailable: {
    title: 'No customer-visible provider is available',
    message: 'Services in this category are not currently available from a verified, active provider visible to customers.'
  },
  seller_opt_in_unavailable: {
    title: 'No seller-enabled recommendations in this category',
    message: 'Active Services exist, but providers have not enabled them for Service Advisor recommendations.'
  },
  seller_recommendations_disabled: {
    title: 'Service recommendations are unavailable for this category',
    message: 'Providers currently have Service Advisor recommendations disabled for otherwise eligible Services.'
  },
  no_compatible_services: {
    title: 'No service matches this pet yet',
    message: 'Current seller-configured pet restrictions exclude the selected pet. Adjust the pet details or service type to try again.'
  },
  no_eligible_services: {
    title: 'No eligible service is currently available',
    message: 'No active Service currently satisfies customer visibility, seller participation, and configured pet restrictions.'
  },
  no_service_type: {
    title: 'No eligible service is listed for this type yet',
    message: 'No active Service currently satisfies category, customer visibility, seller participation, and configured pet restrictions.'
  }
};

const emptyResultCopy = result => {
  if (result.status === 'missing_information') return {
    title: 'More pet information is required',
    message: `Pawzzle needs ${(result.missingFields || []).map(field => field.label).join(', ')} to verify seller restrictions without guessing.`
  };
  if (result.status === 'budget_mismatch') return {
    title: 'No compatible service fits this budget',
    message: 'Compatible real services exist, but their comparable persisted prices fall outside your selected band.'
  };
  if (result.status === 'pricing_unavailable') return {
    title: 'Compatible service pricing needs confirmation',
    message: 'Pawzzle found compatible real services, but cannot truthfully compare their current pricing with your selected budget.'
  };
  return EMPTY_RESULT_COPY[result.status] || {
    title: 'No compatible service was found',
    message: 'Adjust your answers and try another search.'
  };
};

const ChoiceGrid = ({ label, options, value, onChange, columns = 'sm:grid-cols-2' }) => (
  <fieldset>
    <legend className="sr-only">{label}</legend>
    <div className={`grid gap-2 ${columns}`}>
      {options.map(option => {
        const key = option.value ?? option[0];
        const text = option.label ?? option[1];
        const description = option.description;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={`min-h-12 rounded-xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${selected
              ? 'border-primary-600 bg-primary-50 text-primary-900 ring-1 ring-primary-600 dark:bg-primary-950/40 dark:text-primary-100'
              : 'border-slate-200 bg-white text-slate-800 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}
          >
            <span className="block text-sm font-bold">{text}</span>
            {description && <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">{description}</span>}
          </button>
        );
      })}
    </div>
  </fieldset>
);

const ResultPrice = ({ pricing }) => {
  if (!pricing || pricing.status === 'unknown') return <span>Price requires provider confirmation</span>;
  if (pricing.status === 'range' && pricing.minPrice !== pricing.maxPrice) {
    return <span>{formatPeso(pricing.minPrice)}–{formatPeso(pricing.maxPrice)}</span>;
  }
  return <span>{formatPeso(pricing.minPrice)}</span>;
};

const ResultCard = ({ item, alternative = false }) => (
  <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <div className="grid sm:grid-cols-[140px_minmax(0,1fr)]">
      {item.service.images?.[0]
        ? <img src={getImageUrl(item.service.images[0])} alt="" className="h-36 w-full object-cover sm:h-full" />
        : <div className="grid h-32 place-items-center bg-slate-100 text-slate-400 dark:bg-slate-800"><PawPrint size={28} /></div>}
      <div className="min-w-0 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">{String(item.service.category || '').replace(/_/g, ' ')}</p>
            <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">{item.service.name}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.service.store?.name || 'Service provider'}{item.service.duration ? ` · ${item.service.duration} min` : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-primary-700 dark:text-primary-300"><ResultPrice pricing={item.pricing} /></p>
            <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${alternative ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {alternative ? 'Outside selected budget' : 'Budget compatible'}
            </p>
          </div>
        </div>
        {item.service.description && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.service.description}</p>}
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {item.explanations.map(text => <li key={text} className="flex gap-1.5 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />{text}</li>)}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/services/${item.service._id}`} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700 dark:text-slate-200">View details</Link>
          {!alternative && <Link to={`/bookings?service=${item.service._id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-primary-700">Book service <ArrowRight size={13} /></Link>}
        </div>
      </div>
    </div>
  </article>
);

const ServiceAdvisorQuestionnaire = ({ insights }) => {
  const pets = useMemo(() => insights?.myPets || [], [insights]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(INITIAL_ANSWERS);
  const [requirements, setRequirements] = useState([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsError, setRequirementsError] = useState('');
  const [result, setResult] = useState(null);
  const [matching, setMatching] = useState(false);
  const [requestError, setRequestError] = useState('');
  const requirementsRequest = useRef(0);
  const recommendationRequest = useRef(0);

  const updateAnswers = patch => {
    recommendationRequest.current += 1;
    setResult(null);
    setRequestError('');
    setMatching(false);
    setAnswers(current => ({ ...current, ...patch }));
  };

  useEffect(() => {
    if (!answers.petType || !answers.serviceNeed) {
      setRequirements([]);
      setRequirementsError('');
      return undefined;
    }
    const requestId = ++requirementsRequest.current;
    setRequirementsLoading(true);
    setRequirementsError('');
    dssService.getServiceAdvisorRequirements({ petType: answers.petType, serviceNeed: answers.serviceNeed })
      .then(({ data }) => {
        if (requestId === requirementsRequest.current) setRequirements(data.fields || []);
      })
      .catch(error => {
        if (requestId === requirementsRequest.current) {
          setRequirements([]);
          setRequirementsError(error.response?.data?.message || 'Unable to load service requirements.');
        }
      })
      .finally(() => {
        if (requestId === requirementsRequest.current) setRequirementsLoading(false);
      });
    return () => { requirementsRequest.current += 1; };
  }, [answers.petType, answers.serviceNeed]);

  const selectPetProfile = profileId => {
    if (!profileId) {
      updateAnswers({ petProfileId: '' });
      return;
    }
    const profile = pets.find(pet => pet._id === profileId);
    if (!profile) return;
    const details = { ...answers.details };
    const size = normalizeProfileValue(profile.size);
    const coatLength = normalizeProfileValue(profile.coat?.length);
    const coatType = normalizeProfileValue(profile.coat?.type);
    if (DETAIL_OPTIONS.size.some(([value]) => value === size)) details.size = size;
    if (DETAIL_OPTIONS.coatLength.some(([value]) => value === coatLength)) details.coatLength = coatLength;
    if (DETAIL_OPTIONS.coatType.some(([value]) => value === coatType)) details.coatType = coatType;
    updateAnswers({ petProfileId: profileId, petType: normalizePetProfileType(profile.type), details });
  };

  const updateDetail = (field, value) => updateAnswers({ details: { ...answers.details, [field]: value } });
  const conditionalReady = requirements.every(requirement => Boolean(answers.details[requirement.field]));
  const stepReady = [
    Boolean(answers.budget),
    Boolean(answers.petType),
    Boolean(answers.serviceNeed),
    Boolean(answers.priority) && conditionalReady && !requirementsLoading && !requirementsError,
    true
  ][step];

  const findServices = async () => {
    const requestId = ++recommendationRequest.current;
    setMatching(true);
    setRequestError('');
    setResult(null);
    try {
      const { data } = await dssService.getServiceRecommendations({
        budget: answers.budget,
        petType: answers.petType,
        serviceNeed: answers.serviceNeed,
        priority: answers.priority,
        ...(answers.petProfileId ? { petProfileId: answers.petProfileId } : {}),
        details: answers.details
      });
      if (requestId === recommendationRequest.current) setResult(data);
    } catch (error) {
      if (requestId === recommendationRequest.current) setRequestError(error.response?.data?.message || 'Unable to calculate service recommendations.');
    } finally {
      if (requestId === recommendationRequest.current) setMatching(false);
    }
  };

  const adjustAnswers = () => {
    recommendationRequest.current += 1;
    setResult(null);
    setRequestError('');
    setMatching(false);
    setStep(0);
  };

  const questions = [
    <div className="space-y-4" key="budget">
      <div><h2 className="text-lg font-black text-slate-900 dark:text-white">What's your budget for this service?</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">We compare this with each seller's persisted base or rule-adjusted price.</p></div>
      <ChoiceGrid label="Service budget" options={SERVICE_ADVISOR_BUDGET_OPTIONS} value={answers.budget} onChange={budget => updateAnswers({ budget })} />
    </div>,
    <div className="space-y-4" key="pet-type">
      <div><h2 className="text-lg font-black text-slate-900 dark:text-white">What type of pet do you have?</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a type directly, or use one of your saved pet profiles to prefill known details.</p></div>
      {pets.length > 0 && <label className="block max-w-md text-xs font-bold text-slate-700 dark:text-slate-200" htmlFor="advisor-profile">Use a saved pet profile (optional)<span className="relative mt-1.5 block"><select id="advisor-profile" value={answers.petProfileId} onChange={event => selectPetProfile(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Enter details manually</option>{pets.map(pet => <option key={pet._id} value={pet._id}>{pet.name} · {pet.type}{pet.breed ? ` · ${pet.breed}` : ''}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" /></span></label>}
      <ChoiceGrid label="Pet type" options={PET_TYPES} value={answers.petType} onChange={petType => updateAnswers({ petType, petProfileId: '' })} columns="grid-cols-2 sm:grid-cols-3" />
    </div>,
    <div className="space-y-4" key="service-needed">
      <div><h2 className="text-lg font-black text-slate-900 dark:text-white">What service are you looking for?</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">These choices map directly to Pawzzle's real seller Service categories.</p></div>
      <ChoiceGrid label="Service needed" options={SERVICE_ADVISOR_NEED_OPTIONS} value={answers.serviceNeed} onChange={serviceNeed => updateAnswers({ serviceNeed })} />
    </div>,
    <div className="space-y-5" key="priority">
      <div><h2 className="text-lg font-black text-slate-900 dark:text-white">What matters most to you?</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your priority changes ordering only. It never bypasses seller-configured eligibility restrictions.</p></div>
      <ChoiceGrid label="Recommendation priority" options={SERVICE_ADVISOR_PRIORITY_OPTIONS} value={answers.priority} onChange={priority => updateAnswers({ priority })} />
      {requirementsLoading && <p className="text-sm text-slate-500" role="status">Checking service requirements…</p>}
      {requirementsError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100" role="alert">{requirementsError}</div>}
      {!requirementsLoading && requirements.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20"><div className="flex gap-2"><Info size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" /><div className="min-w-0 flex-1"><h3 className="text-sm font-black text-amber-950 dark:text-amber-100">A little more information is needed</h3><p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">Some eligible seller services use these attributes as hard requirements. Pawzzle will not guess them.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{requirements.map(requirement => <label key={requirement.field} className="text-xs font-bold text-amber-950 dark:text-amber-100">{requirement.label}<select value={answers.details[requirement.field] || ''} onChange={event => updateDetail(requirement.field, event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-amber-800 dark:bg-slate-950 dark:text-white"><option value="">Select {requirement.label.toLowerCase()}</option>{(DETAIL_OPTIONS[requirement.field] || requirement.options.map(value => [value, String(value).replace(/_/g, ' ')])).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div></div></div></div>}
    </div>,
    <div className="space-y-4" key="review">
      <div><h2 className="text-lg font-black text-slate-900 dark:text-white">Review and find services</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pawzzle will query eligible real Services only after you confirm.</p></div>
      <dl className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
        {[
          ['Budget', serviceAdvisorLabel(SERVICE_ADVISOR_BUDGET_OPTIONS, answers.budget), 0],
          ['Pet type', optionLabel(PET_TYPES, answers.petType), 1],
          ['Service needed', serviceAdvisorLabel(SERVICE_ADVISOR_NEED_OPTIONS, answers.serviceNeed), 2],
          ['Priority', serviceAdvisorLabel(SERVICE_ADVISOR_PRIORITY_OPTIONS, answers.priority), 3]
        ].map(([label, value, editStep]) => <div key={label} className="flex items-center justify-between gap-3 px-4 py-3"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{value}</dd></div><button type="button" onClick={() => setStep(editStep)} className="rounded-lg px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950/30" aria-label={`Edit ${label.toLowerCase()}`}>Edit</button></div>)}
        {requirements.map(requirement => <div key={requirement.field} className="flex items-center justify-between gap-3 px-4 py-3"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{requirement.label}</dt><dd className="mt-0.5 text-sm font-bold capitalize text-slate-900 dark:text-white">{String(answers.details[requirement.field] || '').replace(/_/g, ' ')}</dd></div><button type="button" onClick={() => setStep(3)} className="rounded-lg px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950/30" aria-label={`Edit ${requirement.label.toLowerCase()}`}>Edit</button></div>)}
      </dl>
    </div>
  ];

  if (result || requestError) {
    const noMatches = result && result.status !== 'matches';
    const emptyState = noMatches ? emptyResultCopy(result) : null;
    return (
      <section className="space-y-4" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Service Advisor results</p><h2 className="text-xl font-black text-slate-900 dark:text-white">{result?.recommendations?.length ? 'Recommended services' : 'Your service matches'}</h2></div><button type="button" onClick={adjustAnswers} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700 dark:text-slate-200"><RefreshCw size={14} />Adjust answers</button></div>
        {requestError && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100" role="alert"><h3 className="font-black">Service Advisor could not load results</h3><p className="mt-1 text-sm">{requestError}</p><button type="button" onClick={findServices} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white dark:bg-primary-700"><RefreshCw size={14} />Try again</button></div>}
        {noMatches && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900"><Search className="mx-auto text-slate-300" size={30} /><h3 className="mt-3 font-black text-slate-900 dark:text-white">{emptyState.title}</h3><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">{emptyState.message}</p>{result.status === 'missing_information' && <button type="button" onClick={() => { setResult(null); setStep(3); }} className="mt-4 rounded-xl bg-primary-700 px-4 py-2.5 text-xs font-bold text-white">Add pet details</button>}</div>}
        {result?.recommendations?.map(item => <ResultCard key={item.service._id} item={item} />)}
        {result?.pricingUnknown?.length > 0 && <section className="space-y-3"><div><h3 className="text-base font-black text-slate-900 dark:text-white">Pricing requires confirmation</h3><p className="text-xs text-slate-500 dark:text-slate-400">These compatible services do not have a fully comparable persisted price.</p></div>{result.pricingUnknown.map(item => <ResultCard key={item.service._id} item={item} alternative />)}</section>}
        {result?.budgetAlternatives?.length > 0 && <section className="space-y-3"><div><h3 className="text-base font-black text-slate-900 dark:text-white">Compatible alternatives outside your budget</h3><p className="text-xs text-slate-500 dark:text-slate-400">Shown separately so they are not misrepresented as budget matches.</p></div>{result.budgetAlternatives.map(item => <ResultCard key={item.service._id} item={item} alternative />)}</section>}
        {result?.disclaimer && <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Info size={13} className="mr-1.5 inline" />{result.disclaimer}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-5 gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}><span className="sr-only">Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>{STEPS.map((name, index) => <div key={name} className="min-w-0"><div className={`h-1.5 rounded-full ${index <= step ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'}`} /><p className={`mt-1 hidden truncate text-[10px] font-bold sm:block ${index === step ? 'text-primary-700 dark:text-primary-300' : 'text-slate-500'}`}>{name}</p></div>)}</div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40 sm:p-5">{questions[step]}</div>
      <div className="flex items-center justify-between gap-3"><button type="button" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700 dark:text-slate-200"><ArrowLeft size={15} />Back</button>{step < STEPS.length - 1 ? <button type="button" onClick={() => setStep(current => Math.min(STEPS.length - 1, current + 1))} disabled={!stepReady} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary-700 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">Continue <ArrowRight size={15} /></button> : <button type="button" onClick={findServices} disabled={matching} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary-700 px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">{matching ? 'Finding services…' : 'Find Matching Services'} <Sparkles size={15} /></button>}</div>
    </section>
  );
};

export default ServiceAdvisorQuestionnaire;
