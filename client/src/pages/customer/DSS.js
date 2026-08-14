import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowRight, CheckCircle2, ChevronDown, Heart, Info, Scale, ShieldCheck } from 'lucide-react';
import { dssService, getImageUrl } from '../../services/apiService';

const CustomerDSS = () => {
  const [insights, setInsights] = useState(null);
  const [selectedPet, setSelectedPet] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    dssService.getCustomerInsights()
      .then(({ data }) => {
        setInsights(data);
        if (data.myPets?.length) setSelectedPet(data.myPets[0]._id);
      })
      .catch(() => toast.error('Unable to load your pet profiles.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPet) return;
    setMatching(true);
    dssService.getServiceRecommendations({ petId: selectedPet })
      .then(({ data }) => setResult(data))
      .catch((error) => {
        setResult(null);
        toast.error(error.response?.data?.message || 'Unable to calculate recommendations.');
      })
      .finally(() => setMatching(false));
  }, [selectedPet]);

  if (loading) return <div className="min-h-[45vh] grid place-items-center text-sm font-semibold text-slate-500">Loading service advisor…</div>;

  const pets = insights?.myPets || [];

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-20">
      <section className="rounded-2xl border border-slate-200 bg-slate-900 text-white p-5 md:p-7">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center shrink-0"><Scale size={18} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Decision support system</p>
            <h1 className="text-xl md:text-2xl font-black mt-1">Find services suited to your pet</h1>
            <p className="text-xs md:text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">Recommendations use your saved pet profile, stated needs and completed service history. Every score includes a visible calculation—no AI or hidden prediction is used.</p>
          </div>
        </div>
      </section>

      {!pets.length ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Heart className="mx-auto text-slate-300" size={28} />
          <h2 className="font-bold text-slate-900 mt-3">Add a pet profile first</h2>
          <p className="text-sm text-slate-500 mt-1">The advisor needs actual pet information to compare compatible services.</p>
          <Link to="/profile" className="inline-flex mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold">Manage pet profiles</Link>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="text-xs font-bold text-slate-700" htmlFor="advisor-pet">Pet to match</label>
            <div className="relative mt-2 max-w-sm">
              <select id="advisor-pet" value={selectedPet} onChange={(e) => setSelectedPet(e.target.value)} className="w-full h-10 appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500">
                {pets.map((pet) => <option key={pet._id} value={pet._id}>{pet.name} · {pet.type}{pet.breed ? ` · ${pet.breed}` : ''}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
          </section>

          {matching ? <div className="py-10 text-center text-sm text-slate-500">Calculating matches from configured criteria…</div> : (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div><h2 className="text-base font-black text-slate-900">Recommended services</h2><p className="text-xs text-slate-500">Ordered by deterministic match score.</p></div>
                <Link to="/services" className="text-xs font-bold text-primary-700 hover:underline">Browse all services</Link>
              </div>
              {!result?.recommendations?.length ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No active service currently has compatible recommendation criteria. You can still browse the full service catalog.</div>
              ) : result.recommendations.map((item) => (
                <article key={item.service._id} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition">
                  <div className="flex gap-4">
                    {item.service.images?.[0] && <img src={getImageUrl(item.service.images[0])} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div><h3 className="text-sm font-black text-slate-900">{item.service.name}</h3><p className="text-xs text-slate-500">{item.service.store?.name || 'Service provider'} · ₱{Number(item.service.price || 0).toLocaleString()}</p></div>
                        <div className="text-right"><p className="text-lg font-black text-primary-700">{item.score}%</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.matchLevel} match</p></div>
                      </div>
                      <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
                        {item.explanations.map((text) => <li key={text} className="flex gap-1.5 text-xs text-slate-600"><CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />{text}</li>)}
                      </ul>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                        <p><strong>Why:</strong> {item.why}</p>
                        <p className="mt-1"><strong>Based on:</strong> {(item.basedOn || []).join(' · ')}</p>
                        <p className="mt-1 text-primary-700"><strong>Recommended action:</strong> {item.recommendedAction}</p>
                      </div>
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer font-bold text-slate-600">View score calculation</summary>
                        <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-slate-400"><th className="py-1">Criterion</th><th>Weight</th><th>Result</th><th>Points</th></tr></thead><tbody>{item.calculation.map((row) => <tr key={row.criterion} className="border-t border-slate-100"><td className="py-1.5 capitalize">{row.criterion.replace(/([A-Z])/g, ' $1')}</td><td>{row.weight}</td><td>{row.matched ? 'Matched' : 'Not matched'}</td><td>{row.points}</td></tr>)}</tbody></table></div>
                      </details>
                      <Link to={`/bookings?service=${item.service._id}`} className="inline-flex items-center gap-1.5 mt-3 h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-primary-700">Book this service <ArrowRight size={13} /></Link>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      <section className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex gap-3"><Info size={18} className="text-primary-600 shrink-0" /><div><h2 className="text-xs font-bold">How scoring works</h2><p className="text-xs text-slate-500 mt-1 leading-relaxed">Only explicitly available profile data is scored. Missing or unknown fields are excluded from the denominator rather than guessed. Store Owners configure criteria and weights, and incompatible services are filtered out.</p></div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3"><ShieldCheck size={18} className="text-amber-700 shrink-0" /><div><h2 className="text-xs font-bold text-amber-900">Service guidance only</h2><p className="text-xs text-amber-800 mt-1 leading-relaxed">This tool does not diagnose health conditions or replace veterinary advice. Contact a licensed veterinarian for medical or health concerns.</p></div></div>
      </section>
    </div>
  );
};

export default CustomerDSS;
