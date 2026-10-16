import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';

export const addressDisplayText = address => String(
  address?.formattedAddress || address?.full || [
    address?.street, address?.barangay, address?.city,
    address?.province || address?.state, address?.zipCode || address?.postalCode
  ].filter(Boolean).join(', ') || ''
);

export const addressFromSuggestion = suggestion => {
  if (suggestion?.formattedAddress) {
    const coordinates = suggestion.coordinates;
    const validCoordinates = Number.isFinite(Number(coordinates?.lat))
      && Number.isFinite(Number(coordinates?.lng));
    return {
      formattedAddress: String(suggestion.formattedAddress).trim(),
      street: String(suggestion.street || ''),
      barangay: String(suggestion.barangay || ''),
      city: String(suggestion.city || ''),
      province: String(suggestion.province || suggestion.state || ''),
      zipCode: String(suggestion.zipCode || suggestion.postalCode || ''),
      country: String(suggestion.country || 'Philippines'),
      ...(suggestion.placeId ? { placeId: String(suggestion.placeId) } : {}),
      ...(validCoordinates ? { coordinates: { lat: Number(coordinates.lat), lng: Number(coordinates.lng) } } : {})
    };
  }
  const details = suggestion?.address || {};
  const lat = Number(suggestion?.lat);
  const lng = Number(suggestion?.lon);
  return {
    formattedAddress: String(suggestion?.display_name || '').trim(),
    street: details.road || details.pedestrian || details.suburb || '',
    barangay: details.neighbourhood || details.village || details.quarter || '',
    city: details.city || details.town || details.municipality || '',
    province: details.state || details.region || '',
    zipCode: details.postcode || '',
    country: details.country || 'Philippines',
    ...(suggestion?.place_id != null ? { placeId: String(suggestion.place_id) } : {}),
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { coordinates: { lat, lng } } : {})
  };
};

export default function DeliveryAddressInput({ id, label, value, onChange, required = false, searchSuggestions }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [text, setText] = useState(() => addressDisplayText(value));
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef(0);

  useEffect(() => {
    setText(addressDisplayText(value));
  }, [value]);

  useEffect(() => {
    const query = text.trim();
    const alreadySelected = query === addressDisplayText(value)
      && Boolean(value?.placeId || value?.coordinates);
    if (!open || query.length < 3 || alreadySelected || typeof searchSuggestions !== 'function') {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchSuggestions(query, { signal: controller.signal });
        if (requestRef.current === requestId) {
          setSuggestions(Array.isArray(rows) ? rows : []);
          setActiveIndex(-1);
        }
      } catch (error) {
        if (error.name !== 'AbortError' && requestRef.current === requestId) setSuggestions([]);
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, searchSuggestions, text, value]);

  const typeAddress = event => {
    const next = event.target.value;
    setText(next);
    setOpen(true);
    setActiveIndex(-1);
    // Typed text is authoritative. Any coordinates/place ID belonged to the
    // previous selection and must not remain attached to a different address.
    onChange({ formattedAddress: next });
  };

  const selectSuggestion = suggestion => {
    const selected = addressFromSuggestion(suggestion);
    setText(selected.formattedAddress);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(selected);
  };

  const onKeyDown = event => {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const clear = () => {
    setText('');
    setSuggestions([]);
    setOpen(false);
    onChange({ formattedAddress: '' });
  };

  const listId = `${inputId}-suggestions`;
  return <label htmlFor={inputId} className="relative block text-xs font-bold text-slate-700 dark:text-slate-200">
    <span>{label}{required ? ' *' : ''}</span>
    <span className="relative mt-1 block">
      <MapPin aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
      <input
        id={inputId}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onChange={typeAddress}
        onKeyDown={onKeyDown}
        placeholder="Type an address or select a suggestion"
        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-16 text-sm font-medium text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
      {loading && <Loader2 aria-label="Searching addresses" size={16} className="absolute right-10 top-3.5 animate-spin text-slate-400" />}
      {text && <button type="button" aria-label={`Clear ${label}`} onMouseDown={event => event.preventDefault()} onClick={clear} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15}/></button>}
    </span>
    {open && suggestions.length > 0 && <ul id={listId} role="listbox" className="absolute z-[3000] mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
      {suggestions.map((suggestion, index) => <li
        id={`${listId}-${index}`}
        key={suggestion.place_id || suggestion.placeId || `${addressDisplayText(suggestion) || suggestion.display_name}-${index}`}
        role="option"
        aria-selected={activeIndex === index}
        onMouseDown={event => { event.preventDefault(); selectSuggestion(suggestion); }}
        onMouseEnter={() => setActiveIndex(index)}
        className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-medium leading-5 ${activeIndex === index ? 'bg-primary-50 text-primary-800 dark:bg-primary-950 dark:text-primary-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
      >{addressDisplayText(suggestion) || suggestion.display_name}</li>)}
    </ul>}
    <span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">
      Selecting an authorized suggestion saves its verified map position. Editing the text removes the old map position.
    </span>
  </label>;
}
