import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userService } from '../../services/apiService';
import {
  DollarSign,
  Truck,
  Save,
  Settings,
  Shield,
  Zap,
  Globe,
  Settings2,
  Building,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const AdminSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    freeShipping: true,
    shippingFee: 0,
    freeShippingThreshold: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await userService.getAdminSettings();
      if (response.data) {
        setSettings(response.data);
      }
    } catch (error) {
      toast.error('Failed to load settings');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await userService.updateAdminSettings(settings);
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: field === 'freeShipping' ? value : Number(value)
    }));
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings2 className="h-3 w-3 text-primary-600" />
            <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : SETTINGS</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
            Global <br /> <span className="text-primary-600 italic">Settings</span>
          </h1>
          <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Manage platform fees and shipping costs</p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
        >
          {loading ? <Zap className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Shipping */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-[1.2rem] flex items-center justify-center">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Shipping Settings</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Set delivery fees and rules</p>
              </div>
            </div>

            <div className="space-y-10">
              {/* Free Shipping Toggle */}
              <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[1.8rem] border border-slate-100">
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Free Shipping (Global)</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Disable all delivery fees for customers</p>
                </div>
                <input
                  type="checkbox" checked={settings.freeShipping}
                  onChange={(e) => handleInputChange('freeShipping', e.target.checked)}
                  className="w-12 h-6 bg-slate-200 rounded-full appearance-none checked:bg-primary-600 transition-all cursor-pointer relative after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all checked:after:translate-x-6 shadow-inner"
                />
              </div>

              {/* Fee Structure */}
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity duration-300 ${settings.freeShipping ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm">
                  <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest block mb-4">Standard Delivery Fee (₱)</label>
                  <div className="input-container">
                    <span className="input-icon text-slate-300 font-black text-[11px]">₱</span>
                    <input
                      type="number" value={settings.shippingFee}
                      onChange={(e) => handleInputChange('shippingFee', e.target.value)}
                      className="input input-with-icon bg-slate-50 border-none rounded-xl text-[12px] font-black uppercase tracking-widest focus:ring-2 focus:ring-primary-500 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm">
                  <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest block mb-4">Free Shipping Minimum (₱)</label>
                  <div className="input-container">
                    <span className="input-icon text-slate-300 font-black text-[11px]">₱</span>
                    <input
                      type="number" value={settings.freeShippingThreshold}
                      onChange={(e) => handleInputChange('freeShippingThreshold', e.target.value)}
                      className="input input-with-icon bg-slate-50 border-none rounded-xl text-[12px] font-black uppercase tracking-widest focus:ring-2 focus:ring-primary-500 placeholder:text-slate-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Information */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl">
            <Globe className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10 animate-pulse" />
            <div className="relative z-10">
              <h3 className="text-[11px] font-black text-primary-500 uppercase tracking-[0.4em] mb-6">Business Identity</h3>
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 p-5 rounded-xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5">Connected Store</p>
                    <p className="text-lg font-black tracking-tighter truncate max-w-[150px]">{user?.store?.name || 'Not Linked'}</p>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 p-5 rounded-xl flex items-center gap-4">
                  <div className={`w-10 h-10 ${user?.store?.verificationStatus === 'verified' ? 'bg-emerald-600' : 'bg-amber-600'} rounded-xl flex items-center justify-center shrink-0`}>
                    {user?.store?.verificationStatus === 'verified' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5">Status</p>
                    <p className="text-lg font-black tracking-tighter uppercase">{user?.store?.verificationStatus || 'Unknown'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
