import React, { useState, useEffect, useCallback } from 'react';
import { bookingService } from '../../services/apiService';
import { CheckCircle, XCircle } from 'lucide-react';
import { formatTime12h } from '../../utils/timeFormatters';

const BookingCalendar = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [bookingModal, setBookingModal] = useState(null);

  const fetchBookings = useCallback(async () => {
    try {
      const response = await bookingService.getCustomerBookings({
        month: currentMonth.getMonth() + 1,
        year: currentMonth.getFullYear()
      });
      setBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchBookings();
    // Socket notifications provide the immediate path elsewhere; this is a low-frequency fallback.
    const interval = setInterval(() => {
      if (!document.hidden) fetchBookings();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

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

  const isDateBooked = (day) => {
    if (!day) return false;
    
    const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return bookings.some(booking => {
      const bookingDate = new Date(booking.bookingDate);
      return bookingDate.toDateString() === checkDate.toDateString();
    });
  };

  const getBookingStatus = (day) => {
    if (!day) return null;
    
    const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const booking = bookings.find(b => {
      const bookingDate = new Date(b.bookingDate);
      return bookingDate.toDateString() === checkDate.toDateString();
    });
    
    return booking ? booking.status : null;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDateClick = (day) => {
    if (!day || isDateBooked(day)) return;
    
    const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(checkDate);
    
    const booking = bookings.find(b => {
      const bookingDate = new Date(b.bookingDate);
      return bookingDate.toDateString() === checkDate.toDateString();
    });
    
    if (booking) {
      setBookingModal(booking);
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const days = getDaysInMonth(currentMonth);
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Booking Calendar</h1>
        <p className="text-gray-600">View available dates and your bookings</p>
      </div>

      {/* Calendar Navigation */}
      <div className="card p-4">
        <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="btn btn-outline px-3 sm:px-5"
          >
            <span aria-hidden="true">←</span><span className="hidden sm:inline"> Previous</span>
          </button>
          <h2 className="min-w-0 text-center text-base font-semibold text-gray-900 dark:text-white sm:text-xl">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
          <button
            onClick={handleNextMonth}
            className="btn btn-outline px-3 sm:px-5"
          >
            <span className="hidden sm:inline">Next </span><span aria-hidden="true">→</span>
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid min-w-0 grid-cols-7 gap-0.5 sm:gap-1">
          {/* Day headers */}
          {dayNames.map(day => (
            <div key={day} className="min-w-0 truncate p-1 text-center text-[10px] font-medium text-gray-700 dark:text-slate-300 sm:p-2 sm:text-sm">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="contents">
              {week.map((day, dayIndex) => {
                const isBooked = isDateBooked(day);
                const status = getBookingStatus(day);
                const isSelected = selectedDate && day && 
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString() === 
                  selectedDate.toDateString();

                return (
                  <div
                    key={dayIndex}
                    onClick={() => handleDateClick(day)}
                    className={`
                      relative min-w-0 p-1 h-14 sm:p-2 sm:h-20 border border-gray-200 cursor-pointer
                      ${!day ? 'bg-white hover:bg-gray-50' : 'bg-gray-50'}
                      ${isBooked ? 'bg-red-50 border-red-200' : ''}
                      ${isSelected ? 'ring-2 ring-primary-500' : ''}
                    `}
                  >
                    {day && (
                      <>
                        <div className="text-sm font-medium text-gray-900">{day}</div>
                        {isBooked && (
                          <div className="mt-1">
                            <div title={status} className={`max-w-full truncate text-[8px] px-0.5 py-0.5 rounded-full sm:px-1 sm:text-xs ${
                              status === 'confirmed' ? 'bg-primary-100 text-primary-800' :
                              status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {status === 'confirmed' && <CheckCircle className="h-3 w-3 inline" />}
                              {status === 'completed' && <CheckCircle className="h-3 w-3 inline" />}
                              {status === 'cancelled' && <XCircle className="h-3 w-3 inline" />}
                              <span className="ml-1">{status}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs sm:gap-4 sm:text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-white border border-gray-200"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200"></div>
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary-100 text-primary-800 rounded-full flex items-center justify-center">
              <CheckCircle className="h-3 w-3" />
            </div>
            <span>Confirmed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 text-green-800 rounded-full flex items-center justify-center">
              <CheckCircle className="h-3 w-3" />
            </div>
            <span>Completed</span>
          </div>
        </div>
      </div>

      {/* Selected Date Bookings */}
      {bookingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="min-w-0 w-full max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto bg-white dark:bg-slate-900 rounded-lg p-4 sm:p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Booking for {new Date(bookingModal.bookingDate).toLocaleDateString()}
              </h3>
              <button
                onClick={() => setBookingModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-gray-900">Service</h4>
                <p className="text-gray-600">{bookingModal.service?.name}</p>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900">Status</h4>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                  bookingModal.status === 'confirmed' ? 'bg-primary-100 text-primary-800' :
                  bookingModal.status === 'completed' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {bookingModal.status === 'confirmed' && <CheckCircle className="h-3 w-3" />}
                  {bookingModal.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                  {bookingModal.status === 'cancelled' && <XCircle className="h-3 w-3" />}
                  <span className="ml-1">{bookingModal.status}</span>
                </span>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900">Time</h4>
                <p className="text-gray-600">{formatTime12h(bookingModal.startTime)}</p>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900">Location</h4>
                <p className="text-gray-600">{bookingModal.location}</p>
              </div>
            </div>
            
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setBookingModal(null)}
                className="btn btn-outline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingCalendar;
