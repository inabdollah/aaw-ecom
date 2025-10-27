import React, { useState } from 'react';
import Image from 'next/image';

interface CheckoutState {
  contact: {
    email: string;
    phone: string;
  };
  billing: {
    firstName: string;
    lastName: string;
    address: string;
    apartment: string;
    city: string;
    state: string;
    postal: string;
  };
  shipping: string;
  scheduledDate?: string;
  scheduledTime?: string;
  payment: string;
  card: {
    number: string;
    expiry: string;
    cvv: string;
  };
}

const paymentMethods = [
  { id: 'card', label: 'Credit or Debit Card', logo: 'https://tap-assets.b-cdn.net/payment-options/v2/light/mastercard.svg', subLabel: 'Visa, Mastercard, American Express' },
  { id: 'knet', label: 'KNET', logo: 'https://static.aawweb.com/static/version2025092802/frontend/MageSuper/jysk/en_US/Gateway_Tap/images/knet.png' },
  { id: 'tabby', label: 'Tabby', logo: 'https://static.aawweb.com/static/version2025092802/frontend/MageSuper/jysk/en_US/Tabby_Checkout/images/logo_green.png', subLabel: '4 interest-free payments' },
];

const timeSlots = [
  '08:00 AM - 10:00 AM',
  '10:00 AM - 12:00 PM',
  '12:00 PM - 02:00 PM',
  '02:00 PM - 04:00 PM',
  '04:00 PM - 06:00 PM',
];

function Calendar({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const selectedDate = value ? (() => {
    const parts = value.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  })() : null;

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dayStr}`;
    onChange(dateString);
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const isSelected = (day: number) => {
    if (!day || !selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear()
    );
  };

  const isToday = (day: number) => {
    if (!day) return false;
    return (
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  return (
    <div className="bg-white p-5" style={{ borderRadius: '4px', boxShadow: 'none' }}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded transition"
        >
          ← Prev
        </button>
        <h3 className="font-bold text-gray-900">
          {monthNames[currentMonth]} {currentYear}
        </h3>
        <button
          onClick={handleNextMonth}
          className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded transition"
        >
          Next →
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="text-center text-xs font-bold text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, idx) => {
          if (!day) {
            return (
              <div
                key={idx}
                className="aspect-square"
              />
            );
          }
          
          return (
            <button
              key={idx}
              data-day={day}
              onClick={(e) => {
                const dayAttr = e.currentTarget.getAttribute('data-day');
                if (dayAttr) {
                  const dayNum = parseInt(dayAttr, 10);
                  handleDateClick(dayNum);
                }
              }}
              className="aspect-square flex items-center justify-center text-sm font-semibold transition"
              style={{
                backgroundColor: isSelected(day) ? '#143c8a' : isToday(day) ? '#f0f4ff' : 'transparent',
                color: isSelected(day) ? 'white' : '#333',
                border: isSelected(day) ? 'none' : isToday(day) ? '2px solid #143c8a' : '1px solid #e5e5e5',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CheckoutDemo() {
  const [checkout, setCheckout] = useState<CheckoutState>({
    contact: { email: '', phone: '' },
    billing: {
      firstName: '',
      lastName: '',
      address: '',
      apartment: '',
      city: '',
      state: '',
      postal: '',
    },
    shipping: 'standard',
    payment: 'knet',
    card: { number: '', expiry: '', cvv: '' },
  });

  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCheckout(prev => ({
      ...prev,
      contact: { ...prev.contact, [name]: value }
    }));
  };

  const handleBillingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCheckout(prev => ({
      ...prev,
      billing: { ...prev.billing, [name]: value }
    }));
  };

  const handleShippingChange = (value: string) => {
    setCheckout(prev => ({ ...prev, shipping: value }));
  };

  const handlePaymentChange = (value: string) => {
    setCheckout(prev => ({ ...prev, payment: value }));
  };

  const handleCardChange = (field: 'number' | 'expiry' | 'cvv', value: string) => {
    setCheckout(prev => ({
      ...prev,
      card: { ...prev.card, [field]: value }
    }));
  };

  const handleDateChange = (date: string) => {
    setCheckout(prev => ({ ...prev, scheduledDate: date }));
  };

  const handleTimeChange = (time: string) => {
    setCheckout(prev => ({ ...prev, scheduledTime: time }));
  };

  return (
    <div style={{ backgroundColor: '#f1f3f5' }} className="min-h-screen">
      {/* Header */}
      <header style={{ 
        borderBottom: '1px solid #e5e7eb'
      }} className="bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex-1">
            <Image 
              src="https://prod.aaw.com/media/logo/stores/14/jysk-logo.png" 
              alt="JYSK" 
              width={100} // Add appropriate width
              height={40} // Add appropriate height
              className="h-10 w-auto"
            />
          </div>
          <div style={{ color: '#6b7280' }} className="text-sm font-medium tracking-wide">
            Checkout
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Checkout Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <div className="bg-white p-7" style={{ borderRadius: '4px' }}>
                <div className="flex items-center gap-2 mb-6">
                    <h2 style={{ color: '#143c8a' }} className="text-xl font-bold">
                      Contact Information
                    </h2>
                  </div>
                  <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={checkout.contact.email}
                          onChange={handleContactChange}
                          placeholder="you@example.com"
                          className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                          style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#143c8a';
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          Phone Number
                        </label>
                        <div className="flex gap-3">
                          <select 
                            className="px-4 py-3 bg-gray-50 text-gray-900 font-medium"
                            style={{ border: '2px solid #e5e7eb', width: '90px', borderRadius: '4px', transition: 'all 0.3s' }}
                          >
                            <option>🇰🇼</option>
                          </select>
                          <input
                            type="tel"
                            name="phone"
                            value={checkout.contact.phone}
                            onChange={handleContactChange}
                            placeholder="(555) 123-4567"
                            className="flex-1 px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                            style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#143c8a';
                              e.currentTarget.style.backgroundColor = '#fff';
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#e5e7eb';
                              e.currentTarget.style.backgroundColor = '#f9fafb';
                            }}
                          />
                        </div>
                      </div>
                  </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-white p-7" style={{ borderRadius: '4px' }}>
                <div className="flex items-center gap-2 mb-6">
                    <h2 style={{ color: '#143c8a' }} className="text-xl font-bold">
                      Shipping Address
                    </h2>
                  </div>
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          First Name
                        </label>
                        <input
                          type="text"
                          name="firstName"
                          value={checkout.billing.firstName}
                          onChange={handleBillingChange}
                          placeholder="John"
                          className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                          style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#143c8a';
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          Last Name
                        </label>
                        <input
                          type="text"
                          name="lastName"
                          value={checkout.billing.lastName}
                          onChange={handleBillingChange}
                          placeholder="Doe"
                          className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                          style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#143c8a';
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        Address
                      </label>
                      <input
                        type="text"
                        name="address"
                        value={checkout.billing.address}
                        onChange={handleBillingChange}
                        placeholder="123 Main St"
                        className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                        style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#143c8a';
                          e.currentTarget.style.backgroundColor = '#fff';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        Apartment, suite, etc. (optional)
                      </label>
                      <input
                        type="text"
                        name="apartment"
                        value={checkout.billing.apartment}
                        onChange={handleBillingChange}
                        placeholder="Apt 4B"
                        className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                        style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#143c8a';
                          e.currentTarget.style.backgroundColor = '#fff';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          City
                        </label>
                        <input
                          type="text"
                          name="city"
                          value={checkout.billing.city}
                          onChange={handleBillingChange}
                          placeholder="Kuwait City"
                          className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                          style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#143c8a';
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          Postal Code
                        </label>
                        <input
                          type="text"
                          name="postal"
                          value={checkout.billing.postal}
                          onChange={handleBillingChange}
                          placeholder="12345"
                          className="w-full px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-500 font-medium"
                          style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#143c8a';
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }}
                        />
                      </div>
                    </div>
                  </div>
            </div>

            {/* Shipping Method */}
            <div className="bg-white p-7" style={{ borderRadius: '4px' }}>
                <div className="flex items-center gap-2 mb-6">
                    <h2 style={{ color: '#143c8a' }} className="text-xl font-bold">
                      Shipping Method
                    </h2>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center p-4 cursor-pointer rounded transition hover:bg-blue-50" style={{ border: '2px solid #e5e7eb', backgroundColor: checkout.shipping === 'express' ? '#f0f4ff' : 'transparent', borderColor: checkout.shipping === 'express' ? '#143c8a' : '#e5e7eb', borderRadius: '4px' }}>
                      <input
                        type="radio"
                        name="shipping"
                        value="express"
                        checked={checkout.shipping === 'express'}
                        onChange={(e) => handleShippingChange(e.target.value)}
                        className="w-5 h-5 cursor-pointer"
                        style={{ accentColor: '#143c8a' }}
                      />
                      <div className="ml-4 flex-1">
                        <div className="font-bold text-gray-900">Express Delivery</div>
                        <div className="text-sm text-gray-600">Arrives in 2-3 business days</div>
                      </div>
                      <div className="font-bold text-gray-900">KWD 12.00</div>
                    </label>

                    <label className="flex items-center p-4 cursor-pointer rounded transition hover:bg-blue-50" style={{ border: '2px solid #e5e7eb', backgroundColor: checkout.shipping === 'standard' ? '#f0f4ff' : 'transparent', borderColor: checkout.shipping === 'standard' ? '#143c8a' : '#e5e7eb', borderRadius: '4px' }}>
                      <input
                        type="radio"
                        name="shipping"
                        value="standard"
                        checked={checkout.shipping === 'standard'}
                        onChange={(e) => handleShippingChange(e.target.value)}
                        className="w-5 h-5 cursor-pointer"
                        style={{ accentColor: '#143c8a' }}
                      />
                      <div className="ml-4 flex-1">
                        <div className="font-bold text-gray-900">Standard Delivery</div>
                        <div className="text-sm text-gray-600">Arrives in 5-7 business days</div>
                      </div>
                      <div className="font-bold text-gray-900">KWD 6.00</div>
                    </label>

                    <label className="flex items-center p-4 cursor-pointer rounded transition hover:bg-blue-50" style={{ border: '2px solid #e5e7eb', backgroundColor: checkout.shipping === 'pickup' ? '#f0f4ff' : 'transparent', borderColor: checkout.shipping === 'pickup' ? '#143c8a' : '#e5e7eb', borderRadius: '4px' }}>
                      <input
                        type="radio"
                        name="shipping"
                        value="pickup"
                        checked={checkout.shipping === 'pickup'}
                        onChange={(e) => handleShippingChange(e.target.value)}
                        className="w-5 h-5 cursor-pointer"
                        style={{ accentColor: '#143c8a' }}
                      />
                      <div className="ml-4 flex-1">
                        <div className="font-bold text-gray-900">Store Pickup</div>
                        <div className="text-sm text-gray-600">Pick up at nearest store</div>
                      </div>
                      <div className="font-bold text-gray-900">Free</div>
                    </label>

                    <div>
                      <label className="flex items-center p-4 cursor-pointer rounded transition hover:bg-blue-50" style={{ border: '2px solid #e5e7eb', backgroundColor: checkout.shipping === 'scheduled' ? '#f0f4ff' : 'transparent', borderColor: checkout.shipping === 'scheduled' ? '#143c8a' : '#e5e7eb', borderRadius: '4px' }}>
                        <input
                          type="radio"
                          name="shipping"
                          value="scheduled"
                          checked={checkout.shipping === 'scheduled'}
                          onChange={(e) => handleShippingChange(e.target.value)}
                          className="w-5 h-5 cursor-pointer"
                          style={{ accentColor: '#143c8a' }}
                        />
                        <div className="ml-4 flex-1">
                          <div className="font-bold text-gray-900">Scheduled Delivery</div>
                          <div className="text-sm text-gray-600">Choose your date and time</div>
                        </div>
                        <div className="font-bold text-gray-900">Free</div>
                      </label>

                      {/* Scheduled Delivery - Calendar and Time Selection */}
                      {checkout.shipping === 'scheduled' && (
                        <div className="space-y-5 mt-4 pl-4 border-l-4 border-blue-400">
                          <div>
                            <Calendar value={checkout.scheduledDate || ''} onChange={handleDateChange} />
                          </div>

                          {checkout.scheduledDate && (
                            <div>
                              <label className="block text-sm font-bold text-gray-800 mb-3">
                                Select Time Slot
                              </label>
                              <div className="grid grid-cols-2 gap-3">
                                {timeSlots.map((slot) => (
                                  <button
                                    key={slot}
                                    onClick={() => handleTimeChange(slot)}
                                    className="p-3 text-sm font-bold transition rounded hover:bg-gray-100"
                                    style={{
                                      border: checkout.scheduledTime === slot ? '2px solid #143c8a' : '2px solid #e5e7eb',
                                      backgroundColor: checkout.scheduledTime === slot ? '#143c8a' : '#f9fafb',
                                      color: checkout.scheduledTime === slot ? 'white' : '#333',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    {slot}
                                  </button>
                                ))}
                              </div>
                              {checkout.scheduledTime && (
                                <div className="mt-4 p-4 bg-green-50 rounded border-l-4 border-green-500">
                                  <p className="text-sm font-semibold text-green-800">
                                    Selected: {checkout.scheduledDate} at {checkout.scheduledTime}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white p-7" style={{ borderRadius: '4px' }}>
                <div className="flex items-center gap-2 mb-6">
                    <h2 style={{ color: '#143c8a' }} className="text-xl font-bold">
                      Payment Method
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {paymentMethods.map((method) => (
                      <div key={method.id}>
                        <label
                          className="flex items-center p-4 cursor-pointer rounded transition hover:bg-gray-50"
                          style={{ 
                            border: '2px solid #e5e7eb',
                            backgroundColor: checkout.payment === method.id ? '#f0f4ff' : 'transparent',
                            borderColor: checkout.payment === method.id ? '#143c8a' : '#e5e7eb',
                            borderRadius: '4px',
                          }}
                        >
                          <input
                            type="radio"
                            name="payment"
                            value={method.id}
                            checked={checkout.payment === method.id}
                            onChange={(e) => handlePaymentChange(e.target.value)}
                            className="w-5 h-5 cursor-pointer flex-shrink-0"
                            style={{ accentColor: '#143c8a' }}
                          />
                          <Image
                            src={method.logo}
                            alt={method.label}
                            width={24} // Adjust width as needed
                            height={24} // Adjust height as needed
                            className="ml-4 flex-shrink-0"
                            style={{ objectFit: 'contain' }}
                          />
                          <div className="ml-3 flex-1">
                            <div className="font-bold text-gray-900">
                              {method.label}
                            </div>
                            {method.subLabel && (
                              <div className="text-xs text-gray-600 font-medium">{method.subLabel}</div>
                            )}
                          </div>
                        </label>

                        {/* Card Details */}
                        {checkout.payment === 'card' && method.id === 'card' && (
                          <div className="space-y-4 mt-3 p-4 bg-gray-50 rounded border border-gray-200">
                            {/* Input Fields */}
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-2">
                                  Card Number
                                </label>
                                <input
                                  type="text"
                                  placeholder="1234 5678 9012 3456"
                                  value={checkout.card.number}
                                  onChange={(e) => handleCardChange('number', e.target.value)}
                                  className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 text-sm font-medium"
                                  style={{ border: '2px solid #e5e7eb', borderRadius: '4px' }}
                                  onFocus={(e) => {
                                    e.currentTarget.style.borderColor = '#143c8a';
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.borderColor = '#e5e7eb';
                                  }}
                                />
                              </div>
                              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 mb-2">
                                    Expiry Date
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="MM/YY"
                                    value={checkout.card.expiry}
                                    onChange={(e) => handleCardChange('expiry', e.target.value)}
                                    className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 text-sm font-medium"
                                    style={{ border: '2px solid #e5e7eb', borderRadius: '4px' }}
                                    onFocus={(e) => {
                                      e.currentTarget.style.borderColor = '#143c8a';
                                    }}
                                    onBlur={(e) => {
                                      e.currentTarget.style.borderColor = '#e5e7eb';
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 mb-2">
                                    CVV
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="123"
                                    value={checkout.card.cvv}
                                    onChange={(e) => handleCardChange('cvv', e.target.value)}
                                    className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 text-sm font-medium"
                                    style={{ border: '2px solid #e5e7eb', borderRadius: '4px' }}
                                    onFocus={(e) => {
                                      e.currentTarget.style.borderColor = '#143c8a';
                                    }}
                                    onBlur={(e) => {
                                      e.currentTarget.style.borderColor = '#e5e7eb';
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Accepted Cards */}
                            <div className="flex gap-3 items-center pt-2 border-t border-gray-200">
                              <span className="text-xs font-semibold text-gray-700">Accepted:</span>
                              <Image
                                src="https://tap-assets.b-cdn.net/payment-options/v2/light/visa.svg"
                                alt="Visa"
                                width={32} // Adjust width as needed
                                height={20} // Adjust height as needed
                                className="h-5 w-auto"
                                style={{ objectFit: 'contain' }}
                              />
                              <Image
                                src="https://tap-assets.b-cdn.net/payment-options/v2/light/mastercard.svg"
                                alt="Mastercard"
                                width={32} // Adjust width as needed
                                height={20} // Adjust height as needed
                                className="h-5 w-auto"
                                style={{ objectFit: 'contain' }}
                              />
                              <Image
                                src="https://tap-assets.b-cdn.net/payment-options/v2/light/american_express.svg"
                                alt="Amex"
                                width={32} // Adjust width as needed
                                height={20} // Adjust height as needed
                                className="h-5 w-auto"
                                style={{ objectFit: 'contain' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Tabby Payment Info */}
                  {checkout.payment === 'tabby' && (
                    <div className="mt-6 pt-6" style={{ borderTop: '1px solid #e5e7eb' }}>
                      <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded border-l-4 border-green-500">
                        <p className="text-sm font-semibold text-green-900">
                          Split your purchase into <span className="font-bold">4 interest-free payments</span> with Tabby.
                        </p>
                      </div>
                    </div>
                  )}
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white sticky top-8" style={{ borderRadius: '4px' }}>
              {/* Order Items */}
              <div className="p-6" style={{ borderBottom: '2px solid #f3f4f6', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                <h3 style={{ color: '#143c8a' }} className="text-lg font-bold mb-6">
                  Order Review
                </h3>

                {/* Product Item */}
                <div className="flex gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <Image
                    src="https://via.placeholder.com/80x80" // Placeholder image
                    alt="Product Image"
                    width={80}
                    height={80}
                    className="flex-shrink-0 rounded"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">
                      Wardrobe VIBY 150x200 3 doors white
                    </div>
                    <div className="text-sm text-gray-600 mt-1 font-medium">Qty: 1</div>
                    <div className="text-lg font-bold text-gray-900 mt-2">
                      KWD 100.00
                    </div>
                  </div>
                </div>

                {/* Promo Code */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-800 mb-3">
                    Promo Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter code"
                      className="flex-1 px-4 py-3 bg-white text-gray-900 placeholder-gray-500 text-sm font-medium"
                      style={{ border: '2px solid #e5e7eb', borderRadius: '4px', transition: 'all 0.3s' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#143c8a';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    />
                    <button
                      style={{ backgroundColor: '#143c8a', borderRadius: '4px', transition: 'all 0.3s' }}
                      className="px-6 py-3 text-white font-bold text-sm hover:bg-blue-800"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="p-6 space-y-4">
                <div className="flex justify-between text-sm font-medium text-gray-600 pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <span>Subtotal</span>
                  <span>KWD 100.00</span>
                </div>
                <div className="flex justify-between text-sm font-medium text-gray-600 pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <span>Shipping</span>
                  <span>
                    {checkout.shipping === 'express' && 'KWD 12.00'}
                    {checkout.shipping === 'standard' && 'KWD 6.00'}
                    {(checkout.shipping === 'scheduled' || checkout.shipping === 'pickup') && 'Free'}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-medium text-gray-600 pb-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <span>Taxes</span>
                  <span>KWD 0.00</span>
                </div>

                <div className="py-4 flex justify-between bg-gradient-to-r from-blue-50 to-blue-100 px-4 rounded mb-4">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-xl text-gray-900">
                    {checkout.shipping === 'express' && 'KWD 112.00'}
                    {checkout.shipping === 'standard' && 'KWD 106.00'}
                    {(checkout.shipping === 'scheduled' || checkout.shipping === 'pickup') && 'KWD 100.00'}
                  </span>
                </div>

                <button
                  style={{ 
                    backgroundColor: '#143c8a', 
                    borderRadius: '4px',
                    transition: 'all 0.3s'
                  }}
                  className="w-full py-4 text-white font-bold text-lg hover:bg-blue-800"
                >
                  Place Order
                </button>

                <div className="text-center text-xs text-gray-600 mt-4 flex items-center justify-center gap-2 font-semibold">
                  <span>🔒</span>
                  <span>100% Secure Payment</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
