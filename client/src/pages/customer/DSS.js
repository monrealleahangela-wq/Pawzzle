import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Heart, Home, Info, PawPrint, RefreshCw, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { dssService, getImageUrl } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';

const steps = ['Your Budget', 'Your Space', 'Your Home', 'Your Lifestyle', 'Pet Preferences'];
const options = {
  monthlyBudget: [
    ['under_1000', 'Under ₱1,000/month'], ['1000_3000', '₱1,000–₱3,000/month'],
    ['3000_5000', '₱3,000–₱5,000/month'], ['5000_10000', '₱5,000–₱10,000/month'],
    ['above_10000', 'Above ₱10,000/month'], ['not_sure', 'Not sure']
  ],
  purchaseBudget: [
    ['under_5000', 'Under ₱5,000'], ['5000_10000', '₱5,000–₱10,000'],
    ['10000_25000', '₱10,000–₱25,000'], ['above_25000', 'Above ₱25,000'], ['not_sure', 'Not sure']
  ],
  space: [
    ['limited_room', 'Small room / limited indoor space'], ['apartment', 'Apartment / condominium'],
    ['small_house', 'Small house'], ['medium_house', 'Medium house'], ['large_house', 'Large house'],
    ['outdoor_space', 'House with outdoor space'], ['not_sure', 'Not sure']
  ],
  lifestyle: [
    ['calm', 'Calm and quiet'], ['energetic', 'Playful and energetic'], ['affectionate', 'Affectionate and cuddly'],
    ['independent', 'Independent'], ['social', 'Social and outgoing'], ['outdoor', 'Outdoor / active lifestyle'],
    ['low_maintenance', 'Low-maintenance preference'], ['grooming', 'Comfortable with regular grooming'],
    ['training', 'Comfortable with training needs'], ['interactive', 'Wants an interactive companion']
  ],
  species: [['dog', 'Dog'], ['cat', 'Cat'], ['bird', 'Bird'], ['fish', 'Fish'], ['rabbit', 'Rabbit'], ['hamster', 'Hamster'], ['reptile', 'Reptile'], ['other', 'Other']],
  sizes: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['extra_large', 'Extra Large']]
};

const initialPreferences = {
  monthlyBudget: '', purchaseBudget: '', space: '', homeOwnership: '', livingArrangement: '', housingType: '',
  petRestrictions: '', existingPets: '', lifestyle: [], preferredSpecies: [], preferredSizes: []
};

const RadioGrid = ({ name, values, value, onChange }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {values.map(([key, label]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(name, key)} className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${value === key ? 'border-primary-600 bg-primary-50 text-primary-800 ring-1 ring-primary-600 dark:bg-primary-950/40 dark:text-primary-200' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{label}</button>)}
  </div>
);

const MultiGrid = ({ name, values, selected, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {values.map(([key, label]) => {
      const active = selected.includes(key);
      return <button key={key} type="button" aria-pressed={active} onClick={() => onChange(name, active ? selected.filter(item => item !== key) : [...selected, key])} className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold transition ${active ? 'border-primary-600 bg-primary-50 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{label}</button>;
    })}
  </div>
);

const SelectField = ({ label, name, value, onChange, values }) => <label className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}<select value={value} onChange={event => onChange(name, event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Select an option</option>{values.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;

const ServiceAdvisor = ({ insights }) => {
  const pets = useMemo(() => insights?.myPets || [], [insights]);
  const [selectedPet, setSelectedPet] = useState(pets[0]?._id || '');
  const [result, setResult] = useState(null);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    if (!selectedPet && pets[0]?._id) setSelectedPet(pets[0]._id);
  }, [pets, selectedPet]);

  useEffect(() => {
    if (!selectedPet) return;
    setMatching(true);
    dssService.getServiceRecommendations({ petId: selectedPet })
      .then(({ data }) => setResult(data))
      .catch(error => {
        setResult(null);
        toast.error(error.response?.data?.message || 'Unable to calculate service recommendations.');
      })
      .finally(() => setMatching(false));
  }, [selectedPet]);

  if (!pets.length) return <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"><Heart className="mx-auto text-slate-300" size={28} /><h2 className="mt-3 font-bold text-slate-900 dark:text-white">Add a pet profile first</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The service advisor needs an owned pet profile to compare configured service criteria.</p><Link to="/profile" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-primary-700">Manage pet profiles</Link></section>;

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <label className="text-xs font-bold text-slate-700 dark:text-slate-200" htmlFor="advisor-pet">Pet to match</label>
      <div className="relative mt-2 max-w-sm"><select id="advisor-pet" value={selectedPet} onChange={event => setSelectedPet(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white">{pets.map(pet => <option key={pet._id} value={pet._id}>{pet.name} · {pet.type}{pet.breed ? ` · ${pet.breed}` : ''}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" /></div>
    </section>
    {matching ? <div className="py-10 text-center text-sm text-slate-500">Calculating service matches…</div> : <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-black text-slate-900 dark:text-white">Recommended services</h2><p className="text-xs text-slate-500 dark:text-slate-400">The existing deterministic service scoring workflow remains unchanged.</p></div><Link to="/services" className="text-xs font-bold text-primary-700 dark:text-primary-300">Browse all services</Link></div>
      {!result?.recommendations?.length ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">No active service currently has compatible recommendation criteria.</div> : result.recommendations.map(item => <article key={item.service._id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex gap-4">{item.service.images?.[0] && <img src={getImageUrl(item.service.images[0])} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-sm font-black text-slate-900 dark:text-white">{item.service.name}</h3><p className="text-xs text-slate-500">{item.service.store?.name || 'Service provider'} · {formatPeso(item.service.price)}</p></div><div className="text-right"><p className="text-lg font-black text-primary-700 dark:text-primary-300">{item.score}%</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.matchLevel} match</p></div></div><ul className="mt-3 grid gap-1.5 sm:grid-cols-2">{item.explanations.map(text => <li key={text} className="flex gap-1.5 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />{text}</li>)}</ul><Link to={`/bookings?service=${item.service._id}`} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white dark:bg-primary-700">Book this service <ArrowRight size={13} /></Link></div></div>
      </article>)}
    </section>}
  </div>;
};

const CustomerDSS = () => {
  const [mode, setMode] = useState('pet');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    dssService.getCustomerInsights()
      .then(({ data }) => {
        setInsights(data);
        const saved = data.myPets || [];
        const types = [...new Set(saved.map(pet => String(pet.type || '').toLowerCase()))];
        const existingPets = saved.length > 1 ? 'multiple' : types.includes('dog') ? 'dogs' : types.includes('cat') ? 'cats' : saved.length ? 'other' : 'none';
        setPreferences(current => ({ ...current, existingPets }));
      })
      .catch(() => toast.error('Unable to load Customer DSS information.'))
      .finally(() => setLoading(false));
  }, []);

  const update = (name, value) => setPreferences(current => ({ ...current, [name]: value }));
  const stepReady = useMemo(() => [
    Boolean(preferences.monthlyBudget && preferences.purchaseBudget),
    Boolean(preferences.space),
    Boolean(preferences.homeOwnership && preferences.livingArrangement && preferences.housingType && preferences.petRestrictions && preferences.existingPets),
    preferences.lifestyle.length > 0,
    true
  ][step], [preferences, step]);

  const findMatches = async () => {
    setMatching(true);
    try {
      const response = await dssService.getPetRecommendations(preferences);
      setResult(response.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to calculate pet compatibility recommendations.');
    } finally {
      setMatching(false);
    }
  };

  const adjustPreferences = () => { setResult(null); setStep(0); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  if (loading) return <div className="grid min-h-[45vh] place-items-center text-sm font-semibold text-slate-500">Loading Customer DSS…</div>;

  const question = [
    <div className="space-y-5"><div><h2 className="text-base font-black text-slate-900 dark:text-white">Monthly pet-care budget</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Questionnaire bands only—not official veterinary cost estimates.</p></div><RadioGrid name="monthlyBudget" values={options.monthlyBudget} value={preferences.monthlyBudget} onChange={update} /><div><h2 className="text-base font-black text-slate-900 dark:text-white">Maximum one-time listing price</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This is evaluated separately because Pawzzle stores listing prices, not monthly ownership costs.</p></div><RadioGrid name="purchaseBudget" values={options.purchaseBudget} value={preferences.purchaseBudget} onChange={update} /></div>,
    <div className="space-y-4"><div><h2 className="text-base font-black text-slate-900 dark:text-white">How much living space is available?</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Space is compared only when the listing contains enough size and temperament evidence.</p></div><RadioGrid name="space" values={options.space} value={preferences.space} onChange={update} /></div>,
    <div className="space-y-4"><div><h2 className="text-base font-black text-slate-900 dark:text-white">Tell us about your home</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Housing permission is treated as a real constraint, not a decorative score.</p></div><div className="grid gap-3 sm:grid-cols-2"><SelectField label="Home ownership" name="homeOwnership" value={preferences.homeOwnership} onChange={update} values={[["own","Own"],["rent","Rent"],["family","Live with family"],["other","Other"]]} /><SelectField label="Living arrangement" name="livingArrangement" value={preferences.livingArrangement} onChange={update} values={[["alone","Living alone"],["family","With parents / family"],["shared","Shared household"],["other","Other"]]} /><SelectField label="Housing type" name="housingType" value={preferences.housingType} onChange={update} values={[["house","House"],["apartment","Apartment / condominium"],["other","Other"]]} /><SelectField label="Pet restrictions" name="petRestrictions" value={preferences.petRestrictions} onChange={update} values={[["allowed","Pets are allowed"],["restricted","Pets may have restrictions"],["not_sure","Not sure"],["not_allowed","Pets are not currently allowed"]]} /><SelectField label="Existing pets" name="existingPets" value={preferences.existingPets} onChange={update} values={[["none","No other pets"],["dogs","Dogs"],["cats","Cats"],["other","Other pets"],["multiple","Multiple pets"]]} /></div></div>,
    <div className="space-y-4"><div><h2 className="text-base font-black text-slate-900 dark:text-white">What kind of companion fits your lifestyle?</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose all that apply. These are preferences—not a psychological assessment.</p></div><MultiGrid name="lifestyle" values={options.lifestyle} selected={preferences.lifestyle} onChange={update} /></div>,
    <div className="space-y-5"><div><h2 className="text-base font-black text-slate-900 dark:text-white">Optional pet preferences</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Species selections filter candidates. Size selections contribute to compatibility scoring.</p></div><div><p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">Preferred species</p><MultiGrid name="preferredSpecies" values={options.species} selected={preferences.preferredSpecies} onChange={update} /></div><div><p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">Preferred size</p><MultiGrid name="preferredSizes" values={options.sizes} selected={preferences.preferredSizes} onChange={update} /></div></div>
  ][step];

  return <div className="mx-auto max-w-6xl space-y-5 pb-20">
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white md:p-7"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Scale size={18} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Decision support system</p><h1 className="mt-1 text-xl font-black md:text-2xl">Pet Compatibility Assessment</h1><p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-300 md:text-sm">Transparent, deterministic recommendations from your selections and actual available Pawzzle listing data. No AI, diagnosis, or guaranteed match.</p></div></div></section>

    <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label="Customer DSS tools"><button role="tab" aria-selected={mode === 'pet'} onClick={() => setMode('pet')} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold ${mode === 'pet' ? 'bg-primary-700 text-white' : 'text-slate-600 dark:text-slate-300'}`}><PawPrint className="mr-1.5 inline h-4 w-4" />Pet Matching</button><button role="tab" aria-selected={mode === 'service'} onClick={() => setMode('service')} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold ${mode === 'service' ? 'bg-primary-700 text-white' : 'text-slate-600 dark:text-slate-300'}`}><Sparkles className="mr-1.5 inline h-4 w-4" />Service Advisor</button></div>

    {mode === 'service' ? <ServiceAdvisor insights={insights} /> : result ? <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Your Pet Matches</p><h2 className="text-xl font-black text-slate-900 dark:text-white">Recommended pets</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ranked by compatibility among eligible current listings. Scores apply only to evaluated factors.</p></div><button onClick={adjustPreferences} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"><RefreshCw size={14} />Adjust Preferences</button></div>
      {!result.recommendations?.length ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"><PawPrint className="mx-auto text-slate-300" size={30} /><h3 className="mt-3 font-black text-slate-900 dark:text-white">No suitable matches were found</h3><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">Based on your current preferences and available listings. Budget, species preference, availability, and Store visibility may have limited the result.</p><button onClick={adjustPreferences} className="mt-4 rounded-xl bg-primary-700 px-4 py-2 text-xs font-bold text-white">Adjust Preferences</button></div> : result.recommendations.map((item, index) => <article key={item.pet._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div className="grid md:grid-cols-[190px_minmax(0,1fr)]">{item.pet.images?.[0] ? <img src={getImageUrl(item.pet.images[0])} alt={item.pet.name} className="h-48 w-full object-cover md:h-full" /> : <div className="grid h-44 place-items-center bg-slate-100 text-slate-400 dark:bg-slate-800"><PawPrint size={32} /></div>}<div className="min-w-0 p-4 md:p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">{index === 0 ? item.matchLevel : `Rank ${index + 1} · ${item.matchLevel}`}</p><h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{item.pet.name}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{item.pet.species} · {item.pet.breed || 'Breed not specified'} · {item.pet.age} {item.pet.ageUnit} · {item.pet.store?.name}</p><p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{formatPeso(item.pet.price)} <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">· Available</span></p></div><div className="rounded-xl bg-primary-50 px-4 py-2 text-right dark:bg-primary-950/40"><p className="text-xl font-black text-primary-800 dark:text-primary-200">{item.score}%</p><p className="text-[10px] font-bold uppercase text-primary-700 dark:text-primary-300">Compatibility Score</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{item.evidenceCoverage}% evidence coverage</p></div></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2"><div><h4 className="text-xs font-black text-slate-800 dark:text-slate-100">Why This Matches</h4>{item.reasons.length ? <ul className="mt-2 space-y-1.5">{item.reasons.map(reason => <li key={reason} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />{reason}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No strong positive factor could be confirmed from the available fields.</p>}</div><div><h4 className="text-xs font-black text-slate-800 dark:text-slate-100">Important Considerations</h4><ul className="mt-2 space-y-1.5">{[...item.considerations, ...item.unknowns].map(text => <li key={text} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><Info size={13} className="mt-0.5 shrink-0 text-amber-600" />{text}</li>)}</ul></div></div>
        <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800"><summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-200">Recommendation factors and score calculation</summary><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead className="text-slate-500"><tr><th className="py-1">Factor</th><th>Weight</th><th>Evidence</th><th>Score</th></tr></thead><tbody>{item.calculation.map(row => <tr key={row.criterion} className="border-t border-slate-200 dark:border-slate-700"><td className="py-2 font-semibold">{row.label}</td><td>{row.weight}</td><td>{row.evaluated ? row.explanation : 'Limited information'}</td><td>{row.score === null ? 'Unknown' : `${row.score}%`}</td></tr>)}</tbody></table></div></details>
        <Link to={`/pets/${item.pet._id}`} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white dark:bg-primary-700">View Pet <ArrowRight size={14} /></Link></div></div></article>)}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><ShieldCheck className="mr-2 inline h-4 w-4" />{result.disclaimer}</div>
    </section> : <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="mb-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Step {step + 1} of {steps.length}</p><p className="text-xs font-semibold text-slate-500">{steps[step]}</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div></div>
      {question}
      <div className="mt-6 flex flex-wrap justify-between gap-2"><button type="button" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 disabled:invisible dark:border-slate-700 dark:text-slate-200"><ArrowLeft size={14} />Back</button>{step < steps.length - 1 ? <button type="button" disabled={!stepReady} onClick={() => setStep(current => current + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-700 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Continue <ArrowRight size={14} /></button> : <button type="button" disabled={matching || !stepReady} onClick={findMatches} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-700 px-4 text-xs font-bold text-white disabled:opacity-40">{matching ? 'Analyzing Your Matches…' : 'Find My Pet Matches'} <PawPrint size={14} /></button>}</div>
    </section>}

    <section className="grid gap-3 md:grid-cols-2"><div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><Info size={18} className="shrink-0 text-primary-600" /><div><h2 className="text-xs font-bold text-slate-900 dark:text-white">How scoring works</h2><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Unknown fields are excluded rather than guessed. Evidence coverage is shown separately so a high score with limited data is never hidden.</p></div></div><div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"><Home size={18} className="shrink-0 text-amber-700 dark:text-amber-300" /><div><h2 className="text-xs font-bold text-amber-900 dark:text-amber-100">Decision support, not certainty</h2><p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">Confirm housing rules, care needs, temperament, and health information directly with the Store and qualified professionals before deciding.</p></div></div></section>
  </div>;
};

export default CustomerDSS;
