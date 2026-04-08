import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import storeApplicationService from '../../services/storeApplicationService';
import { Building, FileText, Upload, Check, AlertCircle, User, Store, ArrowRight } from 'lucide-react';

const AccountUpgrade = () => {
  const { user, updateUser } = useAuth();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    businessType: '',
    businessLicense: {
      licenseNumber: '',
      issuedDate: '',
      expiryDate: ''
    },
    taxId: '',
    contactInfo: {
      phone: '',
      email: '',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      }
    },
    references: [
      {
        name: '',
        business: '',
        email: '',
        phone: ''
      }
    ],
    certifications: [],
    insurance: {
      provider: '',
      policyNumber: '',
      expiryDate: '',
      coverageAmount: ''
    }
  });
  const [files, setFiles] = useState({
    licenseDocument: null,
    insuranceDocument: null,
    certificationDocuments: []
  });

  useEffect(() => {
    checkExistingApplication();
  }, []);

  const checkExistingApplication = async () => {
    try {
      const data = await storeApplicationService.getUserApplication();
      if (data.application) {
        setApplication(data.application);
      }
    } catch (error) {
      console.error('Error checking application:', error);
    }
  };

  const handleUpgradeRequest = () => {
    setShowApplicationForm(true);
  };

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleAddressChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        address: {
          ...prev.contactInfo.address,
          [field]: value
        }
      }
    }));
  };

  const handleReferenceChange = (index, field, value) => {
    const newReferences = [...formData.references];
    newReferences[index][field] = value;
    setFormData(prev => ({
      ...prev,
      references: newReferences
    }));
  };

  const addReference = () => {
    setFormData(prev => ({
      ...prev,
      references: [
        ...prev.references,
        {
          name: '',
          business: '',
          email: '',
          phone: ''
        }
      ]
    }));
  };

  const removeReference = (index) => {
    const newReferences = formData.references.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      references: newReferences
    }));
  };

  const handleFileChange = (field, file) => {
    setFiles(prev => ({
      ...prev,
      [field]: file
    }));
  };

  const handleCertificationChange = (index, field, value) => {
    const newCertifications = [...formData.certifications];
    newCertifications[index][field] = value;
    setFormData(prev => ({
      ...prev,
      certifications: newCertifications
    }));
  };

  const addCertification = () => {
    setFormData(prev => ({
      ...prev,
      certifications: [
        ...prev.certifications,
        {
          name: '',
          issuingOrganization: '',
          issueDate: '',
          expiryDate: '',
          certificateNumber: ''
        }
      ]
    }));
  };

  const removeCertification = (index) => {
    const newCertifications = formData.certifications.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      certifications: newCertifications
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formDataToSend = new FormData();
      
      // Add form data
      Object.keys(formData).forEach(key => {
        if (key === 'references' || key === 'certifications') {
          formDataToSend.append(key, JSON.stringify(formData[key]));
        } else if (typeof formData[key] === 'object') {
          formDataToSend.append(key, JSON.stringify(formData[key]));
        } else {
          formDataToSend.append(key, formData[key]);
        }
      });

      // Add files
      if (files.licenseDocument) {
        formDataToSend.append('licenseDocument', files.licenseDocument);
      }
      if (files.insuranceDocument) {
        formDataToSend.append('insuranceDocument', files.insuranceDocument);
      }
      files.certificationDocuments.forEach((file, index) => {
        formDataToSend.append(`certificationDocuments`, file);
      });

      const data = await storeApplicationService.submitApplication(formDataToSend);

      toast.success('Application submitted successfully!');
      setApplication(data.application);
      setShowApplicationForm(false);
      
      // Update user role to pending admin
      updateUser({ ...user, role: 'customer', pendingRoleUpgrade: true });
    } catch (error) {
      toast.error('Error submitting application');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-secondary-100 text-primary-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      requires_more_info: 'bg-secondary-100 text-orange-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const canUpgrade = user?.role === 'customer' && !user?.pendingRoleUpgrade;

  if (application) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Upgrade Application</h1>
          <p className="text-gray-600">Track your admin/seller application status</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Application Status</h2>
              <p className="text-gray-600">Submitted on {new Date(application.createdAt).toLocaleDateString()}</p>
            </div>
            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(application.status)}`}>
              {application.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">Business Information</h3>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Business Name</p>
                  <p className="font-medium">{application.businessName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Business Type</p>
                  <p className="font-medium capitalize">{application.businessType}</p>
                </div>
              </div>
            </div>

            {application.verificationScore && (
              <div>
                <h3 className="font-semibold text-gray-900">Verification Score</h3>
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Score</span>
                    <span className="text-lg font-bold">{application.verificationScore}/100</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${application.verificationScore}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {application.reviewNotes && (
              <div>
                <h3 className="font-semibold text-gray-900">Review Notes</h3>
                <p className="mt-2 text-gray-700 bg-gray-50 p-3 rounded-lg">
                  {application.reviewNotes}
                </p>
              </div>
            )}

            {application.status === 'rejected' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-semibold">Application Rejected</span>
                </div>
                <p className="mt-2 text-red-700">
                  Your application was rejected. You can submit a new application with updated information.
                </p>
                <button
                  onClick={() => {
                    setApplication(null);
                    setShowApplicationForm(true);
                  }}
                  className="mt-3 btn btn-primary"
                >
                  Submit New Application
                </button>
              </div>
            )}

            {application.status === 'approved' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="h-5 w-5" />
                  <span className="font-semibold">Application Approved!</span>
                </div>
                <p className="mt-2 text-green-700">
                  Congratulations! Your account has been upgraded to Admin/Seller. You can now access admin features.
                </p>
                <button
                  onClick={() => window.location.href = '/'}
                  className="mt-3 btn btn-primary"
                >
                  Go to Admin Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (showApplicationForm) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Upgrade to Admin/Seller Account</h1>
          <p className="text-gray-600">Apply to become an admin/seller and manage your own store</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Information */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Business Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Business Name *</label>
                <input
                  type="text"
                  required
                  className="input mt-1"
                  placeholder="Enter your business name"
                  value={formData.businessName}
                  onChange={(e) => handleChange('businessName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Business Type *</label>
                <select
                  required
                  className="input mt-1"
                  value={formData.businessType}
                  onChange={(e) => handleChange('businessType', e.target.value)}
                >
                  <option value="">Select business type</option>
                  <option value="pet_store">Pet Store</option>
                  <option value="breeder">Breeder</option>
                  <option value="pet_supplies">Pet Supplies</option>
                  <option value="grooming">Pet Grooming</option>
                  <option value="veterinary">Veterinary Services</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Business License */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Business License</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">License Number *</label>
                <input
                  type="text"
                  required
                  className="input mt-1"
                  placeholder="License number"
                  value={formData.businessLicense.licenseNumber}
                  onChange={(e) => handleChange('businessLicense.licenseNumber', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Issue Date *</label>
                <input
                  type="date"
                  required
                  className="input mt-1"
                  value={formData.businessLicense.issuedDate}
                  onChange={(e) => handleChange('businessLicense.issuedDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expiry Date *</label>
                <input
                  type="date"
                  required
                  className="input mt-1"
                  value={formData.businessLicense.expiryDate}
                  onChange={(e) => handleChange('businessLicense.expiryDate', e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Upload License Document *</label>
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                className="input mt-1"
                onChange={(e) => handleFileChange('licenseDocument', e.target.files[0])}
              />
            </div>
          </div>

          {/* Tax Information */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Tax Information</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tax ID *</label>
              <input
                type="text"
                required
                className="input mt-1"
                placeholder="Tax identification number"
                value={formData.taxId}
                onChange={(e) => handleChange('taxId', e.target.value)}
              />
            </div>
          </div>

          {/* Contact Information */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone *</label>
                <input
                  type="tel"
                  required
                  className="input mt-1"
                  placeholder="Business phone number"
                  value={formData.contactInfo.phone}
                  onChange={(e) => handleChange('contactInfo.phone', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  required
                  className="input mt-1"
                  placeholder="Business email"
                  value={formData.contactInfo.email}
                  onChange={(e) => handleChange('contactInfo.email', e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Business Address *</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Street address"
                    value={formData.contactInfo.address.street}
                    onChange={(e) => handleAddressChange('street', e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="City"
                    value={formData.contactInfo.address.city}
                    onChange={(e) => handleAddressChange('city', e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="State/Province"
                    value={formData.contactInfo.address.state}
                    onChange={(e) => handleAddressChange('state', e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="ZIP/Postal code"
                    value={formData.contactInfo.address.zipCode}
                    onChange={(e) => handleAddressChange('zipCode', e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Country"
                    value={formData.contactInfo.address.country}
                    onChange={(e) => handleAddressChange('country', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* References */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Business References</h2>
              <button
                type="button"
                onClick={addReference}
                className="btn btn-outline text-sm"
              >
                Add Reference
              </button>
            </div>
            {formData.references.map((reference, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Reference {index + 1}</h3>
                  {formData.references.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeReference(index)}
                      className="btn btn-danger text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name *</label>
                    <input
                      type="text"
                      required
                      className="input mt-1"
                      placeholder="Reference name"
                      value={reference.name}
                      onChange={(e) => handleReferenceChange(index, 'name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Business *</label>
                    <input
                      type="text"
                      required
                      className="input mt-1"
                      placeholder="Business name"
                      value={reference.business}
                      onChange={(e) => handleReferenceChange(index, 'business', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email *</label>
                    <input
                      type="email"
                      required
                      className="input mt-1"
                      placeholder="Email address"
                      value={reference.email}
                      onChange={(e) => handleReferenceChange(index, 'email', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone *</label>
                    <input
                      type="tel"
                      required
                      className="input mt-1"
                      placeholder="Phone number"
                      value={reference.phone}
                      onChange={(e) => handleReferenceChange(index, 'phone', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Insurance */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Insurance Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Insurance Provider *</label>
                <input
                  type="text"
                  required
                  className="input mt-1"
                  placeholder="Insurance company name"
                  value={formData.insurance.provider}
                  onChange={(e) => handleChange('insurance.provider', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Policy Number *</label>
                <input
                  type="text"
                  required
                  className="input mt-1"
                  placeholder="Policy number"
                  value={formData.insurance.policyNumber}
                  onChange={(e) => handleChange('insurance.policyNumber', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expiry Date *</label>
                <input
                  type="date"
                  required
                  className="input mt-1"
                  value={formData.insurance.expiryDate}
                  onChange={(e) => handleChange('insurance.expiryDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Coverage Amount *</label>
                <input
                  type="text"
                  required
                  className="input mt-1"
                  placeholder="Coverage amount"
                  value={formData.insurance.coverageAmount}
                  onChange={(e) => handleChange('insurance.coverageAmount', e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Upload Insurance Document *</label>
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                className="input mt-1"
                onChange={(e) => handleFileChange('insuranceDocument', e.target.files[0])}
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
            <button
              type="button"
              onClick={() => setShowApplicationForm(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Account Upgrade</h1>
        <p className="text-gray-600">Upgrade your account to access admin and seller features</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Account */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-full bg-primary-100">
              <User className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Current Account</h2>
              <p className="text-gray-600">Customer Account</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Account Type</span>
              <span className="font-medium">Customer</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Features</span>
              <span className="text-sm">Browse, Shop, Order</span>
            </div>
          </div>
        </div>

        {/* Upgrade Option */}
        <div className="card p-6 border-2 border-primary-200 bg-primary-50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-full bg-primary-100">
              <Store className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Admin/Seller Account</h2>
              <p className="text-gray-600">Full Store Management</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Features</span>
              <span className="text-sm">Sell, Manage, Analytics</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Store Management</span>
              <Check className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Product Listings</span>
              <Check className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Order Management</span>
              <Check className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Analytics Dashboard</span>
              <Check className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <button
            onClick={handleUpgradeRequest}
            disabled={!canUpgrade}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            Upgrade Now
            <ArrowRight className="h-4 w-4" />
          </button>
          {!canUpgrade && (
            <p className="text-sm text-gray-600 text-center mt-2">
              {user?.role !== 'customer' 
                ? 'You already have admin access' 
                : 'You have a pending application'}
            </p>
          )}
        </div>
      </div>

      {/* Requirements */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Requirements for Admin/Seller Account</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Business Requirements</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Valid business license</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Tax identification number</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Business insurance coverage</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Professional references</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Application Process</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="font-bold text-primary-600">1.</span>
                <span>Submit complete application with documents</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-primary-600">2.</span>
                <span>Automatic verification scoring</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-primary-600">3.</span>
                <span>Super admin review and approval</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-primary-600">4.</span>
                <span>Account upgrade activation</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountUpgrade;
