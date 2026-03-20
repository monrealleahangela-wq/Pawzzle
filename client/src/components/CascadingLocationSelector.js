import React, { useState, useEffect } from 'react';
import {
  COUNTRIES,
  PHILIPPINE_PROVINCES,
  getCitiesByProvince,
  getBarangaysByCity,
  DEFAULT_COUNTRY
} from '../constants/locationConstants';

const CascadingLocationSelector = ({ address, onAddressChange, disabled = false }) => {
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  // Update cities when province changes
  useEffect(() => {
    if (address.province) {
      const availableCities = getCitiesByProvince(address.province);
      setCities(availableCities);
      
      // Reset city and barangay if current city is not in the new province
      if (address.city && !availableCities.find(c => c.value === address.city)) {
        onAddressChange({
          ...address,
          city: '',
          barangay: ''
        });
      }
    } else {
      setCities([]);
    }
  }, [address.province]);

  // Update barangays when city changes
  useEffect(() => {
    if (address.city) {
      const availableBarangays = getBarangaysByCity(address.city);
      setBarangays(availableBarangays);
      
      // Reset barangay if current barangay is not in the new city
      if (address.barangay && !availableBarangays.find(b => b.value === address.barangay)) {
        onAddressChange({
          ...address,
          barangay: ''
        });
      }
    } else {
      setBarangays([]);
    }
  }, [address.city]);

  const handleChange = (field, value) => {
    let newAddress = { ...address, [field]: value };
    
    // Reset dependent fields
    if (field === 'country' && value !== 'PH') {
      // For non-Philippines, clear province/city/barangay or keep as manual entry
      newAddress = { ...newAddress, province: '', city: '', barangay: '' };
    }
    if (field === 'province') {
      newAddress = { ...newAddress, city: '', barangay: '' };
    }
    if (field === 'city') {
      newAddress = { ...newAddress, barangay: '' };
    }
    
    onAddressChange(newAddress);
  };

  const isPhilippines = address.country === 'PH' || !address.country;

  return (
    <div className="space-y-4">
      {/* Country Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Country *
        </label>
        <select
          value={address.country || DEFAULT_COUNTRY}
          onChange={(e) => handleChange('country', e.target.value)}
          disabled={disabled}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          required
        >
          {COUNTRIES.map(country => (
            <option key={country.value} value={country.value}>
              {country.label}
            </option>
          ))}
        </select>
      </div>

      {/* Street Address */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Street Address *
        </label>
        <input
          type="text"
          value={address.street || ''}
          onChange={(e) => handleChange('street', e.target.value)}
          disabled={disabled}
          placeholder="House number, street name, building"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          required
        />
      </div>

      {/* Philippines-specific fields */}
      {isPhilippines ? (
        <>
          {/* Province Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Province *
            </label>
            <select
              value={address.province || ''}
              onChange={(e) => handleChange('province', e.target.value)}
              disabled={disabled}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            >
              <option value="">Select Province</option>
              {PHILIPPINE_PROVINCES.map(province => (
                <option key={province.value} value={province.value}>
                  {province.label}
                </option>
              ))}
            </select>
          </div>

          {/* City Selection - Depends on Province */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City/Municipality *
            </label>
            <select
              value={address.city || ''}
              onChange={(e) => handleChange('city', e.target.value)}
              disabled={disabled || !address.province || cities.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-gray-100"
              required
            >
              <option value="">
                {!address.province 
                  ? 'Select Province First' 
                  : cities.length === 0 
                    ? 'No cities available' 
                    : 'Select City'}
              </option>
              {cities.map(city => (
                <option key={city.value} value={city.value}>
                  {city.label}
                </option>
              ))}
            </select>
          </div>

          {/* Barangay Selection - Depends on City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Barangay *
            </label>
            <select
              value={address.barangay || ''}
              onChange={(e) => handleChange('barangay', e.target.value)}
              disabled={disabled || !address.city || barangays.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-gray-100"
              required
            >
              <option value="">
                {!address.city 
                  ? 'Select City First' 
                  : barangays.length === 0 
                    ? 'No barangays available' 
                    : 'Select Barangay'}
              </option>
              {barangays.map(barangay => (
                <option key={barangay.value} value={barangay.value}>
                  {barangay.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        // For non-Philippines, show manual entry fields
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State/Province *
            </label>
            <input
              type="text"
              value={address.province || ''}
              onChange={(e) => handleChange('province', e.target.value)}
              disabled={disabled}
              placeholder="State or Province"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City *
            </label>
            <input
              type="text"
              value={address.city || ''}
              onChange={(e) => handleChange('city', e.target.value)}
              disabled={disabled}
              placeholder="City"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
        </>
      )}

      {/* ZIP Code */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ZIP Code *
        </label>
        <input
          type="text"
          value={address.zipCode || ''}
          onChange={(e) => handleChange('zipCode', e.target.value)}
          disabled={disabled}
          placeholder="ZIP/Postal Code"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          required
        />
      </div>
    </div>
  );
};

export default CascadingLocationSelector;
