import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { bookingService, serviceService, voucherService } from '../../services/apiService';
import { toast } from 'react-toastify';
import { Clock, User, MapPin, Phone, Mail, DollarSign, CheckCircle, XCircle, AlertCircle, Filter, Search, Calendar, ArrowLeft, ChevronLeft, ChevronRight, Store, X, Activity, ShieldCheck, TrendingUp, Tag, Ticket } from 'lucide-react';

const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    bookingDate: '',
    startTime: '',
    pet: {
      name: '',
      type: '',
      breed: '',
      age: '',
      weight: ''
    },
    isHomeService: false,
    serviceAddress: {
      street: '',
      city: '',
      province: ''
    },
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [existingBookings, setExistingBookings] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [isVerifyingVoucher, setIsVerifyingVoucher] = useState(false);
  const [myVouchers, setMyVouchers] = useState([]);
  const [showVoucherModal, setShowVoucherModal] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  /* ── multi-step booking form ── */
  const [formStep, setFormStep] = useState(1);

  const stepMeta = [
    { num: 1, label: 'Service', icon: '🛎' },
    { num: 2, label: 'Schedule', icon: '📅' },
    { num: 3, label: 'Your Pet', icon: '🐾' },
    { num: 4, label: 'Confirm', icon: '✅' },
  ];

  const canAdvance = (step) => {
    if (step === 2) return !!bookingForm.bookingDate && !!bookingForm.startTime;
    if (step === 3) return !!(bookingForm.pet.name && bookingForm.pet.type && bookingForm.pet.breed && bookingForm.pet.age && bookingForm.pet.weight);
    return true;
  };

  useEffect(() => {
    fetchBookings();
  }, [filterStatus, searchTerm]);

  useEffect(() => {
    const serviceId = searchParams.get('service');
    if (serviceId) {
      fetchServiceDetails(serviceId);
    }
  }, [searchParams]);

  // Fetch claimed vouchers
  useEffect(() => {
    const fetchVouchers = async () => {
      try {
        const response = await voucherService.getMyVouchers();
        setMyVouchers(response.data.vouchers);
      } catch (error) {
        console.error('Error fetching vouchers:', error);
      }
    };
    if (showBookingForm) fetchVouchers();
  }, [showBookingForm]);

  const fetchServiceDetails = async (serviceId) => {
    try {
      console.log('🔍 Fetching service details for:', serviceId);
      const response = await serviceService.getServiceById(serviceId);
      // Handle various structural possibilities from backend
      const service = response.data?.service || response.data;

      console.log('✅ Service fetched:', service);
      if (!service || !service._id) throw new Error('Invalid service data received');

      setSelectedService(service);
      setShowBookingForm(true);
    } catch (error) {
      console.error('❌ Error fetching service details:', error.response?.data || error.message);
      const errorMsg = error.response?.data?.message || error.message;
      toast.error(`Service load failed: ${errorMsg}`);
      // Fallback: stay on bookings page if service not found
      if (error.response?.status === 404) {
        setShowBookingForm(false);
      }
    }
  };

  const fetchBookings = async () => {
    try {
      const params = {
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchTerm || undefined,
        page: 1,
        limit: 10
      };

      const response = await bookingService.getCustomerBookings(params);
      setBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await bookingService.updateBookingStatus(bookingId, 'cancelled');
      toast.success('Appointment cancelled successfully');
      fetchBookings();
      if (selectedBooking && selectedBooking._id === bookingId) {
        setSelectedBooking(null);
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error('Failed to cancel appointment');
    }
  };

  const getPhaseIndex = (status) => {
    const phases = ['pending', 'confirmed', 'processing', 'completed'];
    return phases.indexOf(status);
  };

  // Fetch existing bookings for the selected service to show availability
  const fetchServiceBookings = async (serviceId, month, year) => {
    try {
      const response = await bookingService.getAllBookings({
        service: serviceId,
        month: month + 1,
        year: year,
        status: 'confirmed,pending'
      });
      setExistingBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching service bookings:', error);
    }
  };

  // Calendar helper functions
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getBookingCountForDate = (day) => {
    if (!day || !selectedService) return 0;

    const year = calendarMonth.getFullYear();
    const month = String(calendarMonth.getMonth() + 1).padStart(2, '0');
    const dayNum = String(day).padStart(2, '0');
    const dateString = `${year}-${month}-${dayNum}`;

    return existingBookings.filter(booking => {
      const bDate = new Date(booking.bookingDate);
      const bDateString = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, '0')}-${String(bDate.getDate()).padStart(2, '0')}`;
      return bDateString === dateString;
    }).length;
  };

  const getBookingsForSelectedDate = () => {
    if (!bookingForm.bookingDate) return [];
    return existingBookings.filter(booking => {
      const bDate = new Date(booking.bookingDate);
      const bDateString = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, '0')}-${String(bDate.getDate()).padStart(2, '0')}`;
      return bDateString === bookingForm.bookingDate;
    });
  };

  const getStoreHoursForDate = (dateStringLocal) => {
    if (!selectedService?.store?.businessHours) return 'Not Available';
    const date = new Date(dateStringLocal);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = dayNames[date.getDay()];
    const hours = selectedService.store.businessHours[currentDay];

    if (!hours || hours.closed) return 'Closed Today';
    return `${hours.open} - ${hours.close}`;
  };

  const isDateFullyBooked = (day) => {
    const count = getBookingCountForDate(day);
    // Dynamic fully booked logic: use maxPetsPerSession if available, else default to 8
    const maxLimit = selectedService?.maxPetsPerSession ? selectedService.maxPetsPerSession * 8 : 8;
    return count >= maxLimit;
  };

  const isDateSelected = (day) => {
    if (!day || !bookingForm.bookingDate) return false;
    // Parse the bookingDate string and create date in local timezone
    const [year, month, dayNum] = bookingForm.bookingDate.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, dayNum); // month-1 because months are 0-indexed

    return selectedDate.getDate() === day &&
      selectedDate.getMonth() === calendarMonth.getMonth() &&
      selectedDate.getFullYear() === calendarMonth.getFullYear();
  };

  const isDatePast = (day) => {
    if (!day) return true;
    const checkDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return checkDate < today;
  };

  const handleDateClick = (day) => {
    if (!day || isDatePast(day)) return;
    // Allow clicking even if fully booked so they can see why/other times

    const selectedDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    // Format date as YYYY-MM-DD in local timezone to avoid timezone offset issues
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dayNum = String(selectedDate.getDate()).padStart(2, '0');
    const localDateString = `${year}-${month}-${dayNum}`;

    setBookingForm({
      ...bookingForm,
      bookingDate: localDateString
    });
  };

  const handlePrevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1));
  };

  // Fetch service bookings when service or month changes
  useEffect(() => {
    if (selectedService && showBookingForm) {
      fetchServiceBookings(selectedService._id, calendarMonth.getMonth(), calendarMonth.getFullYear());
    }
  }, [selectedService, calendarMonth, showBookingForm]);

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-primary-50 text-primary-600',
      confirmed: 'bg-secondary-50 text-secondary-600',
      processing: 'bg-neutral-50 text-neutral-600',
      completed: 'bg-emerald-50 text-emerald-600',
      cancelled: 'bg-rose-50 text-rose-600'
    };
    return colors[status] || 'bg-gray-50 text-gray-600';
  };

  const getStatusIcon = (status) => {
    const icons = {
      pending: <Clock className="h-4 w-4" />,
      confirmed: <CheckCircle className="h-4 w-4" />,
      processing: <AlertCircle className="h-4 w-4" />,
      completed: <CheckCircle className="h-4 w-4" />,
      cancelled: <XCircle className="h-4 w-4" />
    };
    return icons[status] || <AlertCircle className="h-4 w-4" />;
  };

  const handleStatusFilter = (status) => {
    setFilterStatus(status);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setBookingForm(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setBookingForm(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleApplyVoucher = async (codeOverride) => {
    const codeToUse = typeof codeOverride === 'string' ? codeOverride : voucherCode;
    if (!codeToUse || !codeToUse.trim()) {
      toast.error('Please enter a voucher code');
      return;
    }

    setIsVerifyingVoucher(true);
    try {
      const storeId = selectedService.store?._id || selectedService.store;
      let purchaseAmount = selectedService.price;
      if (bookingForm.isHomeService) {
        purchaseAmount += selectedService.homeServicePrice || 0;
      }

      const response = await voucherService.verifyVoucher({
        code: codeToUse.toUpperCase(),
        storeId,
        purchaseAmount
      });

      setAppliedVoucher(response.data.voucher);
      setVoucherCode(codeToUse.toUpperCase());
      toast.success('Voucher applied!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid voucher code');
      setAppliedVoucher(null);
    } finally {
      setIsVerifyingVoucher(false);
    }
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();

    if (!selectedService) {
      toast.error('No service selected');
      return;
    }

    if (!bookingForm.bookingDate || !bookingForm.startTime) {
      toast.error('Please select date and time');
      return;
    }

    setSubmitting(true);

    try {
      // Calculate endTime based on duration
      const duration = selectedService.duration || 60;
      const [hours, minutes] = bookingForm.startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + duration;
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

      const bookingData = {
        serviceId: selectedService._id,
        pet: {
          name: bookingForm.pet.name,
          type: bookingForm.pet.type,
          breed: bookingForm.pet.breed,
          age: parseInt(bookingForm.pet.age),
          weight: parseFloat(bookingForm.pet.weight)
        },
        bookingDate: bookingForm.bookingDate,
        startTime: bookingForm.startTime,
        endTime,
        isHomeService: bookingForm.isHomeService,
        serviceAddress: bookingForm.isHomeService ? bookingForm.serviceAddress : undefined,
        notes: bookingForm.notes,
        voucherCode: appliedVoucher ? voucherCode : null
      };

      await bookingService.createBooking(bookingData);
      toast.success('Booking created successfully!');

      // Reset form and refresh bookings
      setBookingForm({
        bookingDate: '',
        startTime: '',
        pet: { name: '', type: '', breed: '', age: '', weight: '' },
        isHomeService: false,
        serviceAddress: { street: '', city: '', province: '' },
        notes: ''
      });
      setShowBookingForm(false);
      setSelectedService(null);
      fetchBookings();

      // Remove service parameter from URL
      navigate('/bookings', { replace: true });

    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error(error.response?.data?.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToBookings = () => {
    setShowBookingForm(false);
    setSelectedService(null);
    setBookingForm({
      bookingDate: '',
      startTime: '',
      pet: { name: '', type: '', breed: '', age: '', weight: '' },
      isHomeService: false,
      serviceAddress: { street: '', city: '', province: '' },
      notes: ''
    });
    navigate('/bookings', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {showBookingForm && selectedService && (
        <div className="max-w-4xl mx-auto space-y-6 animate-card-appear pb-24 px-1 sm:px-0">

          {/* ── Dark Form Hero ── */}
          <div className="relative bg-slate-900 rounded-[2.5rem] p-6 sm:p-10 overflow-hidden text-white border border-white/5 shadow-2xl">
            <div className="absolute top-0 right-0 w-52 h-52 bg-primary-600/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary-600/10 rounded-full blur-[60px] pointer-events-none" />
            <div className="relative z-10 flex items-start gap-5">
              <button onClick={() => { handleBackToBookings(); setFormStep(1); }}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all shrink-0 border border-white/10">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-primary-400 uppercase tracking-[0.35em] mb-1">Service Appointment</p>
                <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter leading-none mb-3">
                  Book <span className="italic text-primary-400">{selectedService.name}</span>
                </h2>
                <div className="flex flex-wrap gap-3">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest">
                    <Clock className="h-3 w-3 text-primary-400" /> {selectedService.duration || '—'} min
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest">
                    <DollarSign className="h-3 w-3 text-emerald-400" /> ₱{selectedService.price?.toLocaleString()}
                  </span>
                  {selectedService.homeServiceAvailable && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                      <MapPin className="h-3 w-3" /> Home Service Available
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Step Progress ── */}
          <div className="bg-white rounded-[2rem] border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center">
              {stepMeta.map((step, idx) => (
                <React.Fragment key={step.num}>
                  <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => formStep > step.num && setFormStep(step.num)}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black border-2 transition-all ${formStep === step.num ? 'bg-slate-900 text-white border-slate-900 scale-110 shadow-xl' :
                      formStep > step.num ? 'bg-primary-600 text-white border-primary-600' :
                        'bg-slate-50 text-slate-300 border-slate-100'
                      }`}>{formStep > step.num ? '✓' : step.icon}</div>
                    <span className={`text-[8px] font-black uppercase tracking-widest hidden sm:block ${formStep >= step.num ? 'text-slate-700' : 'text-slate-300'
                      }`}>{step.label}</span>
                  </div>
                  {idx < stepMeta.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 rounded-full overflow-hidden bg-slate-100">
                      <div className={`h-full rounded-full transition-all duration-500 ${formStep > step.num ? 'bg-primary-500 w-full' : 'w-0'}`} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <form onSubmit={handleBookingSubmit} className="space-y-4">

            {/* ── STEP 1: Service Overview ── */}
            {formStep === 1 && (
              <div className="space-y-4 animate-card-appear">
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 sm:p-8 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-bl-[3rem] pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.3em] mb-3">Service Details</p>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">{selectedService.name}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6">{selectedService.description || 'Professional pet service by vetted specialists.'}</p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Duration', value: `${selectedService.duration || '—'} min`, icon: Clock },
                        { label: 'Price', value: `₱${selectedService.price?.toLocaleString()}`, icon: DollarSign },
                        { label: 'Provider', value: selectedService.store?.name || 'Elite Partner', icon: Store },
                        { label: 'Location', value: selectedService.store?.contactInfo?.address?.city || 'Local Hub', icon: MapPin },
                        { label: 'Home Visit', value: selectedService.homeServiceAvailable ? 'Available' : 'In-Store Only', icon: Phone },
                        { label: 'Clients', value: 'Vetted', icon: User },
                      ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Icon className="h-3.5 w-3.5 text-primary-500" />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                          </div>
                          <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Requirements Section */}
                    {selectedService.requirements && (
                      <div className="mt-8 p-6 bg-amber-50 rounded-3xl border border-amber-100/50">
                        <div className="flex items-center gap-3 mb-4">
                          <ShieldCheck className="h-5 w-5 text-amber-600" />
                          <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-widest">Customer Requirements</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedService.requirements.split(',').map((req, i) => (
                            <div key={i} className="flex items-start gap-3 bg-white/50 p-3 rounded-xl">
                              <CheckCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-[10px] font-bold text-slate-700 leading-tight uppercase tracking-tight">{req.trim()}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-[9px] font-bold text-amber-700/70 uppercase tracking-widest italic flex items-center gap-2">
                          <AlertCircle className="h-3 w-3" /> Please present these documents to staff upon arrival for verification.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setFormStep(2)}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all active:scale-95">
                  Continue to Schedule →
                </button>
              </div>
            )}

            {/* ── STEP 2: Schedule ── */}
            {formStep === 2 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-card-appear">
                {/* Calendar */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-4 sm:p-6 shadow-sm h-full flex flex-col">
                  <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.3em] mb-1.5">Pick a Date</p>
                  <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={handlePrevMonth}
                      className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-center transition-all border border-slate-100">
                      <ChevronLeft className="h-4 w-4 text-slate-600" />
                    </button>
                    <span className="text-sm font-black text-slate-900 uppercase tracking-widest">
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button type="button" onClick={handleNextMonth}
                      className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-center transition-all border border-slate-100">
                      <ChevronRight className="h-4 w-4 text-slate-600" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className="text-center text-[9px] font-black text-slate-400 uppercase tracking-widest py-1">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {getDaysInMonth(calendarMonth).map((day, index) => {
                      if (!day) return <div key={index} />;
                      const isPast = isDatePast(day);
                      const isFullyBooked = isDateFullyBooked(day);
                      const isSelected = isDateSelected(day);
                      const bookingCount = getBookingCountForDate(day);
                      return (
                        <button key={index} type="button"
                          onClick={() => handleDateClick(day)}
                          disabled={isPast || isFullyBooked}
                          className={`relative h-9 sm:h-11 rounded-xl text-[10px] sm:text-[11px] font-black flex items-center justify-center transition-all ${isSelected ? 'bg-slate-900 text-white shadow-xl scale-110 z-10' :
                            isPast ? 'text-slate-200 cursor-not-allowed' :
                              isFullyBooked ? 'bg-rose-50 text-rose-400 cursor-not-allowed ring-1 ring-rose-100' :
                                bookingCount > 0 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100 hover:bg-amber-100' :
                                  'hover:bg-primary-50 text-slate-700 hover:text-primary-600'
                            }`}>
                          {day}
                          {bookingCount > 0 && !isSelected && (
                            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[7px] font-black flex items-center justify-center ${isFullyBooked ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                              }`}>{bookingCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-50">
                    {[
                      { color: 'bg-slate-900', label: 'Selected' },
                      { color: 'bg-amber-50 ring-1 ring-amber-100', label: 'Partially booked' },
                      { color: 'bg-rose-50 ring-1 ring-rose-100', label: 'Fully booked' },
                      { color: 'bg-slate-50', label: 'Available' },
                    ].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-md ${color}`} />
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Time + availability */}
                  <div className="bg-white rounded-[2.5rem] border border-slate-100 p-4 sm:p-6 shadow-sm">
                    <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.3em] mb-4">Pick a Time</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2">Start Time *</label>
                        <input type="time" name="startTime" value={bookingForm.startTime}
                          onChange={handleFormChange} required
                          className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300 transition-all" />
                      </div>

                      {bookingForm.bookingDate && (
                        <div className={`rounded-2xl p-4 border ${getBookingsForSelectedDate().length > 0 ? 'bg-rose-50/50 border-rose-100' : 'bg-emerald-50/50 border-emerald-100'}`}>
                          <div className="flex items-center gap-2 mb-3">
                            {getBookingsForSelectedDate().length > 0
                              ? <AlertCircle className="h-4 w-4 text-rose-500" />
                              : <CheckCircle className="h-4 w-4 text-emerald-500" />
                            }
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">
                              {getBookingsForSelectedDate().length > 0 ? 'Occupied Slots' : 'Fully Available'}
                            </span>
                          </div>
                          {getBookingsForSelectedDate().length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {getBookingsForSelectedDate().map((b, idx) => (
                                <span key={idx} className="px-3 py-1 bg-rose-100 text-rose-700 text-[9px] font-black rounded-lg">
                                  {b.startTime} – {b.endTime}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[9px] text-emerald-600 font-bold">All time slots are open on this date!</p>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedService.homeServiceAvailable && (
                      <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <div className={`w-12 h-6 rounded-full transition-colors relative ${bookingForm.isHomeService ? 'bg-primary-600' : 'bg-slate-200'}`}
                            onClick={() => handleFormChange({ target: { name: 'isHomeService', type: 'checkbox', checked: !bookingForm.isHomeService } })}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${bookingForm.isHomeService ? 'left-7' : 'left-1'}`} />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Request Home Service</p>
                            <p className="text-[8px] text-slate-400 font-bold">Our specialist will come to your location</p>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>

                  {bookingForm.isHomeService && (
                    <div className="bg-white rounded-[2.5rem] border border-slate-100 p-5 sm:p-7 shadow-sm animate-card-appear">
                      <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.3em] mb-4">Service Address</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { label: 'Street', name: 'serviceAddress.street', placeholder: '123 Paws Ave.' },
                          { label: 'City', name: 'serviceAddress.city', placeholder: 'Dasmariñas' },
                          { label: 'Province', name: 'serviceAddress.province', placeholder: 'Cavite' },
                        ].map(({ label, name, placeholder }) => (
                          <div key={name}>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{label} *</label>
                            <input type="text" name={name}
                              value={name.split('.').reduce((o, k) => (o || {})[k], bookingForm)}
                              onChange={handleFormChange} placeholder={placeholder} required
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setFormStep(1)}
                      className="px-8 py-4 bg-white border border-slate-100 text-slate-600 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-slate-300 transition-all shadow-sm">
                      ← Back
                    </button>
                    <button type="button" onClick={() => canAdvance(2) ? setFormStep(3) : toast.info('Please select a date and time')}
                      className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all active:scale-95 disabled:opacity-50">
                      Continue to Pet Details →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Pet Details ── */}
            {formStep === 3 && (
              <div className="space-y-4 animate-card-appear">
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-5 sm:p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary-50 rounded-2xl flex items-center justify-center text-lg">🐾</div>
                    <div>
                      <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.3em]">Pet Info</p>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Pet Profile</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Pet Name', name: 'pet.name', type: 'text', placeholder: 'e.g. Max', required: true },
                      { label: 'Pet Type', name: 'pet.type', type: 'text', placeholder: 'e.g. Dog, Cat', required: true },
                      { label: 'Breed', name: 'pet.breed', type: 'text', placeholder: 'e.g. Bulldog', required: true },
                      { label: 'Age (years)', name: 'pet.age', type: 'number', placeholder: '1', required: true },
                      { label: 'Weight (kg)', name: 'pet.weight', type: 'number', placeholder: '5.0', required: true, step: '0.1' },
                    ].map(({ label, name, type, placeholder, required, step }) => {
                      const val = name.split('.').reduce((o, k) => (o || {})[k], bookingForm);
                      return (
                        <div key={name}>
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{label}{required && ' *'}</label>
                          <input type={type} name={name} value={val} onChange={handleFormChange}
                            placeholder={placeholder} required={required} step={step}
                            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all" />
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Special Notes (Optional)</label>
                    <textarea name="notes" value={bookingForm.notes} onChange={handleFormChange} rows={3}
                      placeholder="e.g. Sensitive skin, allergic to latex, needs extra calming…"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all resize-none" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setFormStep(2)}
                    className="px-8 py-4 bg-white border border-slate-100 text-slate-600 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-slate-300 transition-all shadow-sm">
                    ← Back
                  </button>
                  <button type="button" onClick={() => canAdvance(3) ? setFormStep(4) : toast.info('Please fill in all pet details')}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all active:scale-95">
                    Review & Confirm →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 4: Confirm ── */}
            {formStep === 4 && (
              <div className="space-y-4 animate-card-appear">
                {/* Summary card */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                  <div className="bg-slate-900 px-6 sm:px-8 py-5">
                    <p className="text-[9px] font-black text-primary-400 uppercase tracking-[0.3em] mb-1">Booking Summary</p>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Confirm Your Appointment</h3>
                  </div>
                  <div className="p-6 sm:p-8 space-y-5">
                    {/* Service block */}
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Service</p>
                      <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-white text-lg shrink-0">🛎</div>
                        <div>
                          <p className="text-sm font-black text-slate-900 uppercase">{selectedService.name}</p>
                          <p className="text-[9px] font-bold text-slate-400">{selectedService.store?.name} · ₱{selectedService.price?.toLocaleString()} · {selectedService.duration} min</p>
                        </div>
                      </div>
                    </div>

                    {/* Schedule block */}
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Schedule</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> Date</p>
                          <p className="text-[11px] font-black text-slate-900 uppercase">
                            {bookingForm.bookingDate ? new Date(bookingForm.bookingDate).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Time</p>
                          <p className="text-[11px] font-black text-slate-900 uppercase">{bookingForm.startTime || '—'}</p>
                        </div>
                        {bookingForm.isHomeService && (
                          <div className="col-span-2 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Home Service Address</p>
                            <p className="text-[11px] font-black text-slate-900 uppercase">
                              {bookingForm.serviceAddress.street}, {bookingForm.serviceAddress.city}, {bookingForm.serviceAddress.province}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pet block */}
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Pet Profile</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ['Name', bookingForm.pet.name],
                          ['Type', bookingForm.pet.type],
                          ['Breed', bookingForm.pet.breed],
                          ['Age', `${bookingForm.pet.age} yr`],
                          ['Weight', `${bookingForm.pet.weight} kg`],
                          ['Notes', bookingForm.notes || 'None'],
                        ].map(([k, v]) => (
                          <div key={k} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{k}</p>
                            <p className="text-[10px] font-black text-slate-900 uppercase truncate">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Voucher section */}
                    <div className="pt-8 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Promotional Voucher</p>
                        {appliedVoucher && (
                          <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest">Active</span>
                        )}
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex gap-3 relative">
                          <div className="relative flex-1 group">
                             <Tag className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${appliedVoucher ? 'text-emerald-500' : 'text-slate-400 group-focus-within:text-primary-500'}`} />
                             <input
                              type="text"
                              placeholder="SECRET CODE..."
                              className={`w-full !pl-16 pr-4 py-4 bg-slate-50 border-2 rounded-2xl outline-none transition-all font-black text-xs uppercase tracking-[0.2em] ${appliedVoucher 
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700' 
                                : 'border-transparent focus:border-primary-500 focus:bg-white text-slate-900 placeholder:text-slate-400'
                              }`}
                              value={voucherCode}
                              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                              disabled={appliedVoucher || isVerifyingVoucher}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={appliedVoucher ? () => { setAppliedVoucher(null); setVoucherCode(''); } : handleApplyVoucher}
                            disabled={isVerifyingVoucher}
                            className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${appliedVoucher
                              ? 'bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white'
                              : 'bg-slate-900 text-white hover:bg-primary-600 shadow-slate-200'
                              }`}
                          >
                            {isVerifyingVoucher ? '...' : appliedVoucher ? 'Eject' : 'Apply'}
                          </button>
                        </div>

                        {!appliedVoucher && myVouchers.length > 0 && (
                          <div className="pt-2">
                             <div className="flex items-center justify-between mb-3 px-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Claimed Vouchers</span>
                                <button 
                                  onClick={() => setShowVoucherModal(true)}
                                  className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline"
                                >
                                  View All Vouchers ({myVouchers.length})
                                </button>
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {myVouchers.slice(0, 2).map((mv) => (
                                  <button
                                    key={mv._id}
                                    onClick={() => handleApplyVoucher(mv.voucher.code)}
                                    className="group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-primary-500 hover:shadow-xl hover:shadow-primary-100 transition-all text-left"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-all shadow-inner">
                                        <Tag size={16} />
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter mb-0.5">{mv.voucher.code}</p>
                                        <p className="text-[9px] font-bold text-primary-600 uppercase tracking-widest">
                                          {mv.voucher.discountType === 'percentage' ? `${mv.voucher.discountValue}% OFF` : `₱${mv.voucher.discountValue} OFF`}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                      <ChevronRight size={14} className="text-primary-600" />
                                    </div>
                                  </button>
                                ))}
                             </div>
                          </div>
                        )}

                        {appliedVoucher && (
                          <div className="mt-4 p-5 bg-emerald-50 rounded-2xl border border-emerald-100 animate-slide-up text-slate-900 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform">
                              <CheckCircle className="w-20 h-20 text-emerald-600" />
                            </div>
                            <div className="flex items-center justify-between relative z-10">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white rounded-2xl text-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-200">
                                  <Tag size={20} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] mb-0.5">{appliedVoucher.code} DEPLOYED</p>
                                  <p className="text-[12px] font-black text-emerald-900 uppercase">Saving ₱{appliedVoucher.discountAmount.toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex flex-col gap-2 pt-5 border-t border-slate-100">
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="text-[9px] font-black uppercase tracking-widest">Subtotal</span>
                        <span className="text-xs font-black">
                          ₱{((selectedService.price || 0) + (bookingForm.isHomeService ? (selectedService.homeServicePrice || 0) : 0)).toLocaleString()}
                        </span>
                      </div>
                      {appliedVoucher && (
                        <div className="flex items-center justify-between text-emerald-600">
                          <span className="text-[9px] font-black uppercase tracking-widest">Discount</span>
                          <span className="text-xs font-black">- ₱{appliedVoucher.discountAmount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Total Amount</span>
                        <span className="text-2xl font-black text-primary-600 tracking-tighter">
                          ₱{Math.max(0, ((selectedService.price || 0) + (bookingForm.isHomeService ? (selectedService.homeServicePrice || 0) : 0) - (appliedVoucher?.discountAmount || 0))).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setFormStep(3)}
                    className="px-8 py-4 bg-white border border-slate-100 text-slate-600 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-slate-300 transition-all shadow-sm">
                    ← Edit
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 py-5 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-2xl shadow-primary-200 hover:bg-primary-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70">
                    {submitting ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                    ) : (
                      <><CheckCircle className="h-4 w-4" /> Confirm Booking</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Existing Bookings Header */}
      {
        !showBookingForm && (
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-1">
            <div>
              <p className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em] mb-1.5">Service Schedule</p>
              <h1 className="text-4xl sm:text-6xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                Booking <span className="text-primary-600 italic">History</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {bookings.length > 0 && (
                <span className="px-4 py-2 bg-primary-50 text-primary-600 border border-primary-100 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                  {bookings.length} Appointment{bookings.length !== 1 ? 's' : ''}
                </span>
              )}
              <Link to="/services" className="group px-6 py-3 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all flex items-center gap-2">
                Book Service <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </header>
        )
      }

      {
        !showBookingForm && bookings.length === 0 && (
          <div className="bg-white rounded-[3rem] border-2 border-dashed border-slate-100 py-24 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
              <Calendar className="h-10 w-10 text-slate-200" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">No Appointments</h2>
            <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest mb-8 max-w-xs mx-auto">Your booking list is empty — begin by browsing available services</p>
            <Link to="/services" className="px-10 py-4 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary-100 hover:bg-primary-700 transition-all">
              Browse Services
            </Link>
          </div>
        )
      }

      {
        !showBookingForm && bookings.length > 0 && (
          <>
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div />

                {/* Mobile Filter Toggle */}
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="md:hidden w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm font-black text-[10px] uppercase tracking-widest text-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary-600" />
                    <span>Search & Filters {(searchTerm || filterStatus !== 'all') && '• Active'}</span>
                  </div>
                  <Search className={`h-4 w-4 transition-transform ${showMobileFilters ? 'rotate-90' : ''}`} />
                </button>
              </div>

              {/* Collapsible Filters for mobile, fixed for desktop */}
              <div className={`${showMobileFilters ? 'block' : 'hidden md:block'} card p-6 border-slate-100 shadow-xl shadow-primary-200/10 mb-8 animate-fade-in`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Booking</label>
                    <div className="relative group">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input pl-10 w-full !bg-slate-50 border-transparent focus:!bg-white font-bold text-sm"
                        placeholder="Search pet or service..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="input w-full !bg-slate-50 border-transparent focus:!bg-white font-bold text-sm"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending Review</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="processing">Currently Processing</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {showMobileFilters && (
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="w-full mt-6 btn btn-primary py-4 text-[10px] font-black uppercase tracking-widest"
                  >
                    Apply Search
                  </button>
                )}
              </div>
            </div>

            {bookings.map((booking) => (
              <div
                key={booking._id}
                className="group bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all flex flex-col relative overflow-hidden animate-slide-up"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[4rem] -translate-y-16 translate-x-16 group-hover:bg-primary-50 transition-colors duration-500" />

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 relative z-10">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none group-hover:text-primary-600 transition-colors">
                        {booking.service?.name || 'Service'}
                      </h3>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-sm border ${getStatusColor(booking.status)}`}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-primary-600" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{new Date(booking.bookingDate).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-primary-600" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{booking.startTime}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Amount</p>
                    <p className="text-2xl font-black text-slate-900 leading-none tracking-tighter">
                      ₱{(booking.totalPrice || 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Subject Asset Manifest */}
                <div className="bg-slate-50/50 rounded-[2rem] p-6 mb-8 border border-slate-100 flex-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 block">Pet Details</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pet Name</p>
                      <p className="text-[11px] font-black text-slate-800 uppercase">{booking.pet?.name || 'UNKNOWN'}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pet Type</p>
                      <p className="text-[11px] font-black text-slate-800 uppercase">{booking.pet?.type || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Breed</p>
                      <p className="text-[11px] font-black text-slate-800 uppercase truncate">{booking.pet?.breed || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-[11px] font-black text-emerald-600 uppercase tracking-tighter">Active</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-slate-50 relative z-10">
                  <div className="flex items-center gap-4">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${booking.store?.contactInfo?.address?.street || ''}, ${booking.store?.contactInfo?.address?.city || ''}, ${booking.store?.contactInfo?.address?.state || ''}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary-300 transition-all group/store"
                    >
                      <Store className="h-3.5 w-3.5 text-primary-600 group-hover/store:scale-110 transition-transform" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none mb-0.5">{booking.store?.name || 'Store'}</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                          <MapPin className="h-2 w-2" /> {booking.store?.contactInfo?.address?.city || 'CAVITE'}
                        </span>
                      </div>
                    </a>
                  </div>

                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => setSelectedBooking(booking)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all active:scale-95"
                    >
                      View Details <ChevronRight className="h-4 w-4" />
                    </button>

                    {booking.status === 'pending' && (
                      <button
                        onClick={() => handleCancelBooking(booking._id)}
                        className="p-4 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-600 hover:text-white transition-all active:scale-95"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )
      }
      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-3xl rounded-[3.5rem] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] animate-slide-up border border-white/20">
            <header className="bg-slate-900 p-10 sm:p-12 text-white flex justify-between items-start relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-10 blur-3xl pointer-events-none">
                <ShieldCheck className="w-64 h-64 text-primary-500" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="px-5 py-2 bg-primary-600 rounded-2xl flex items-center gap-3 shadow-xl shadow-primary-900/40">
                    <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Booking Information</span>
                  </div>
                </div>
                <h3 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none mb-4">#{selectedBooking._id.slice(-12).toUpperCase()}</h3>
                <div className="flex items-center gap-4 text-slate-400">
                  <Activity className="h-4 w-4 text-emerald-500" />
                  <p className="text-[11px] font-black uppercase tracking-[0.3em]">Booking in progress</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="relative z-10 w-16 h-16 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[2rem] flex items-center justify-center transition-all active:scale-90 hover:rotate-90 duration-500 group"
              >
                <X className="h-8 w-8 text-white group-hover:scale-75 transition-transform" />
              </button>
            </header>

            <div className="p-10 sm:p-14 space-y-12 max-h-[60vh] overflow-y-auto no-scrollbar scroll-smooth">
              {/* Status Tracker */}
              <div className="relative pt-4 pb-12">
                <div className="absolute left-[5%] right-[5%] top-1/2 -translate-y-1/2 h-1 bg-slate-100 rounded-full" />
                <div
                  className="absolute left-[5%] top-1/2 -translate-y-1/2 h-1 bg-primary-600 rounded-full transition-all duration-1000 ease-in-out shadow-[0_0_20px_rgba(37,99,235,0.5)]"
                  style={{ width: `${Math.max(0, (getPhaseIndex(selectedBooking.status) / 3) * 90)}%` }}
                />

                <div className="relative z-10 flex justify-between">
                  {['pending', 'confirmed', 'processing', 'completed'].map((phase, idx) => {
                    const currentIdx = getPhaseIndex(selectedBooking.status);
                    const isPassed = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    return (
                      <div key={phase} className="flex flex-col items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl border-4 transition-all duration-700 flex items-center justify-center ${isPassed ? 'bg-primary-600 border-white ring-8 ring-primary-50 shadow-xl' :
                          isCurrent ? 'bg-primary-600 border-white ring-8 ring-primary-50 animate-pulse shadow-xl shadow-primary-200' :
                            'bg-white border-slate-100'
                          }`}>
                          {(isPassed || isCurrent) && <CheckCircle className="h-4 w-4 text-white" />}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg ${isCurrent ? 'bg-slate-900 text-white' : isPassed ? 'text-primary-600 bg-primary-50' : 'text-slate-300'}`}>
                          {phase.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Service Details */}
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 hover:border-primary-200 transition-all group">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] block mb-3 group-hover:text-primary-600 transition-colors">Service</label>
                  <p className="text-[13px] font-black text-slate-900 uppercase leading-none mb-1.5">{selectedBooking.service?.name}</p>
                  <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md border border-primary-100">{selectedBooking.service?.duration} min</span>
                </div>
                <div className="p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 hover:border-emerald-200 transition-all group">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] block mb-3 group-hover:text-emerald-600 transition-colors">Service Location</label>
                  <p className="text-[13px] font-black text-slate-900 uppercase leading-none mb-1.5">
                    {selectedBooking.isHomeService ? 'Home Service' : 'Store Service'}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      selectedBooking.isHomeService
                        ? `${selectedBooking.serviceAddress?.street || ''}, ${selectedBooking.serviceAddress?.city || ''}, ${selectedBooking.serviceAddress?.province || ''}`
                        : `${selectedBooking.store?.contactInfo?.address?.street || ''}, ${selectedBooking.store?.contactInfo?.address?.barangay || ''}, ${selectedBooking.store?.contactInfo?.address?.city || ''}, ${selectedBooking.store?.contactInfo?.address?.state || ''}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-slate-500 hover:text-primary-600 transition-colors uppercase tracking-tight flex items-center gap-1.5 group/venue"
                  >
                    <MapPin className="h-3.5 w-3.5 group-hover/venue:text-primary-600 transition-colors text-emerald-500" />
                    <span className="truncate">
                      {selectedBooking.isHomeService
                        ? `${selectedBooking.serviceAddress?.street}, ${selectedBooking.serviceAddress?.city}`
                        : selectedBooking.store?.contactInfo?.address?.street
                          ? `${selectedBooking.store.contactInfo.address.street}, ${selectedBooking.store.contactInfo.address.city}`
                          : selectedBooking.serviceAddress?.city || 'BASE_FACILITY'}
                    </span>
                  </a>
                </div>
              </div>

              {/* Deployment Slot */}
              <div className="bg-slate-900 p-8 rounded-[3rem] text-white flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/5 rounded-full -translate-y-32 translate-x-32 blur-3xl" />

                <div className="flex items-center gap-6 relative z-10">
                  <div className="w-16 h-16 bg-white/10 rounded-[2rem] flex items-center justify-center border border-white/10 shadow-xl group-hover:bg-primary-600 transition-all duration-700">
                    <Calendar className="h-8 w-8 text-primary-500 group-hover:text-white" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-primary-500 uppercase tracking-[0.4em] block mb-2">Booking Date</label>
                    <p className="text-2xl font-black uppercase tracking-tight">{new Date(selectedBooking.bookingDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right relative z-10">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-2">Time</label>
                  <p className="text-5xl font-black tracking-tighter text-primary-500">{selectedBooking.startTime}</p>
                </div>
              </div>

              {/* Operations Notes & Payload */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-4">
                <div className="lg:col-span-7 space-y-4">
                  <label className="text-[10px] font-black text-slate-900 uppercase tracking-[0.4em] block pl-2">Notes</label>
                  <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 relative group min-h-[160px]">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-primary-600 opacity-30" />
                    <p className="text-[13px] font-bold text-slate-600 leading-relaxed italic">
                      {selectedBooking.notes || "No additional notes provided for this booking."}
                    </p>
                  </div>
                </div>
                <div className="lg:col-span-5 bg-primary-600 rounded-[3rem] p-10 text-white shadow-2xl shadow-primary-200 flex flex-col justify-between group overflow-hidden relative">
                  <div className="absolute top-[-20%] right-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-1000" />
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-10">
                      <div className="px-5 py-2 bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20">
                        Price Breakdown
                      </div>
                      <TrendingUp className="h-6 w-6 text-white/50" />
                    </div>
                    <label className="text-[10px] font-black text-primary-100 uppercase tracking-[0.4em] block mb-4 opacity-70">Payment Summary</label>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[11px] font-black text-white/70 uppercase">
                        <span>Base Price</span>
                        <span>₱{((selectedBooking.totalPrice || 0) + (selectedBooking.discountAmount || 0)).toLocaleString()}</span>
                      </div>
                      {selectedBooking.discountAmount > 0 && (
                        <div className="flex justify-between items-center text-[11px] font-black text-emerald-300 uppercase">
                          <span className="flex items-center gap-1.5"><Tag className="h-3 w-3" /> Discount</span>
                          <span>- ₱{selectedBooking.discountAmount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-end gap-2 border-t border-white/10 pt-4">
                      <span className="text-5xl font-black tracking-tighter">₱{selectedBooking.totalPrice?.toLocaleString()}</span>
                      <span className="text-[14px] font-black text-white/60 uppercase mb-2 tracking-widest">NET</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="p-10 sm:p-14 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-6 relative z-10">
              {selectedBooking.status === 'pending' && (
                <button
                  onClick={() => handleCancelBooking(selectedBooking._id)}
                  className="flex-1 min-w-[280px] px-10 py-6 bg-rose-50 border-2 border-rose-200 text-rose-600 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.4em] shadow-xl shadow-rose-100 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all active:scale-[0.98] group flex items-center justify-center gap-4"
                >
                  <X className="h-5 w-5" />
                  Cancel Booking
                </button>
              )}
              <button
                onClick={() => setSelectedBooking(null)}
                className="flex-1 px-10 py-6 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] hover:bg-primary-600 transition-all active:scale-[0.98]"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
      {/* Voucher Selection Modal */}
      {showVoucherModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in text-slate-900">
          <div className="bg-white rounded-[3rem] max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Your <span className="text-primary-600 italic">Vouchers</span></h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select a claimed discount</p>
              </div>
              <button onClick={() => setShowVoucherModal(false)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar">
              {myVouchers.length > 0 ? (
                myVouchers.map((mv) => (
                  <button
                    key={mv._id}
                    onClick={() => {
                        handleApplyVoucher(mv.voucher.code);
                        setShowVoucherModal(false);
                    }}
                    className="w-full text-left p-6 rounded-3xl border border-slate-100 hover:border-primary-200 bg-slate-50 hover:bg-primary-50 transition-all group relative overflow-hidden"
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary-600 shadow-sm group-hover:bg-primary-600 group-hover:text-white transition-all">
                        <Tag size={20} />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 uppercase tracking-tighter mb-0.5">{mv.voucher.code}</h4>
                        <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest">
                            {mv.voucher.discountType === 'percentage' ? `${mv.voucher.discountValue}% OFF` : `₱${mv.voucher.discountValue} OFF`}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1">Min. Purchase: ₱{mv.voucher.minPurchase}</p>
                      </div>
                    </div>
                    <div className="absolute top-1/2 right-6 -translate-y-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight size={16} className="text-primary-600" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12">
                  <Ticket className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">No claimed vouchers found</p>
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100">
                <button 
                    onClick={() => navigate('/vouchers')}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-primary-600 transition-all"
                >
                    Explore More Discounts
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;
