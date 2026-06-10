'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Lock, Check, Calendar, Clock, MapPin, Car, AlertCircle, X } from 'lucide-react'

const vehicles: Record<string, { name: string; price: number }> = {
  'business-sedan': { name: 'Business Sedan', price: 150 },
  'business-suv': { name: 'Business SUV', price: 200 },
  'first-class': { name: 'First Class', price: 300 },
  'sprinter-class': { name: 'Sprinter Class', price: 500 },
}

// Detect card type based on number
function getCardType(number: string): string {
  const cleanNumber = number.replace(/\s/g, '')
  if (/^4/.test(cleanNumber)) return 'visa'
  if (/^5[1-5]/.test(cleanNumber)) return 'mastercard'
  if (/^3[47]/.test(cleanNumber)) return 'amex'
  if (/^6(?:011|5)/.test(cleanNumber)) return 'discover'
  if (/^9/.test(cleanNumber)) return 'mada'
  return 'generic'
}

function PaymentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [isCardFlipped, setIsCardFlipped] = useState(false)
  
  // Card form state
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  
  // Error states
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showError, setShowError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  
  // Get booking data from params
  const pickup = searchParams.get('pickup') || ''
  const dropoff = searchParams.get('dropoff') || ''
  const date = searchParams.get('date') || ''
  const time = searchParams.get('time') || ''
  const vehicleId = searchParams.get('vehicle') || 'business-sedan'
  const bookingType = searchParams.get('type') || 'oneway'
  const duration = searchParams.get('duration') || ''
  
  const vehicle = vehicles[vehicleId] || vehicles['business-sedan']
  const basePrice = vehicle.price
  const vat = basePrice * 0.15
  const total = basePrice + vat

  const cardType = getCardType(cardNumber)

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    return parts.length ? parts.join(' ') : value
  }

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  // Validate card details
  const validateCard = () => {
    const newErrors: Record<string, string> = {}
    
    // Card number validation
    const cleanNumber = cardNumber.replace(/\s/g, '')
    if (!cleanNumber) {
      newErrors.cardNumber = 'Card number is required'
    } else if (cleanNumber.length < 15 || cleanNumber.length > 16) {
      newErrors.cardNumber = 'Invalid card number length'
    } else if (!/^\d+$/.test(cleanNumber)) {
      newErrors.cardNumber = 'Card number must contain only digits'
    }
    
    // Name validation
    if (!cardName.trim()) {
      newErrors.cardName = 'Cardholder name is required'
    } else if (cardName.trim().length < 3) {
      newErrors.cardName = 'Please enter full name'
    }
    
    // Expiry validation
    if (!expiry) {
      newErrors.expiry = 'Expiry date is required'
    } else {
      const [month, year] = expiry.split('/')
      const monthNum = parseInt(month)
      const yearNum = parseInt('20' + year)
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      
      if (monthNum < 1 || monthNum > 12) {
        newErrors.expiry = 'Invalid month'
      } else if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
        newErrors.expiry = 'Card has expired'
      }
    }
    
    // CVV validation
    if (!cvv) {
      newErrors.cvv = 'CVV is required'
    } else if (cvv.length < 3 || cvv.length > 4) {
      newErrors.cvv = 'Invalid CVV'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handlePayment = async () => {
    if (paymentMethod === 'card') {
      if (!validateCard()) {
        setErrorMessage('Please correct the errors in your card details')
        setShowError(true)
        return
      }
    }
    
    setIsProcessing(true)
    setShowError(false)
    
    // Simulate PayTabs payment processing
    await new Promise(resolve => setTimeout(resolve, 2500))
    
    // Simulate random failure for demo (10% chance)
    if (Math.random() < 0.1) {
      setIsProcessing(false)
      // Redirect to payment failed page
      const failParams = new URLSearchParams(searchParams.toString())
      failParams.set('error', 'CARD_DECLINED')
      failParams.set('message', 'Your payment could not be processed. Please try again.')
      router.push(`/booking/payment-failed?${failParams.toString()}`)
      return
    }
    
    // Generate booking reference
    const bookingRef = 'LUX-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    
    // Redirect to confirmation page
    const params = new URLSearchParams(searchParams.toString())
    params.set('ref', bookingRef)
    router.push(`/booking/confirmation?${params.toString()}`)
  }

  // Format display values for card visual
  const displayCardNumber = cardNumber || '•••• •••• •••• ••••'
  const displayName = cardName || 'YOUR NAME'
  const displayExpiry = expiry || 'MM/YY'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Error Toast */}
      {showError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className="flex items-center gap-3 px-6 py-4 bg-red-500/20 border border-red-500/50 rounded-xl backdrop-blur-md">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-200">{errorMessage}</p>
            <button onClick={() => setShowError(false)} className="ml-2 text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href={`/booking/details?${searchParams.toString()}`} className="inline-flex items-center gap-2 text-neutral-400 hover:text-[#C9A961] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Details
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {['Vehicle', 'Details', 'Payment'].map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                index <= 2 ? 'bg-[#C9A961] text-black' : 'bg-neutral-800 text-neutral-500'
              }`}>
                {index < 2 ? <Check className="w-4 h-4" /> : index + 1}
              </div>
              <span className={index <= 2 ? 'text-white' : 'text-neutral-500'}>{step}</span>
              {index < 2 && <div className="w-12 h-0.5 bg-[#C9A961]" />}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-2xl font-serif font-bold mb-2">Payment</h1>
              <p className="text-neutral-400">Complete your booking securely via PayTabs</p>
            </div>

            {/* Payment Methods */}
            <div className="bg-[#141414] rounded-xl p-6 border border-neutral-800">
              <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
              
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { id: 'card', label: 'Card', icon: CreditCard },
                  { id: 'mada', label: 'Mada', icon: null, img: '/images/mada.png' },
                  { id: 'apple', label: 'Apple Pay', icon: null, text: '' },
                  { id: 'stc', label: 'STC Pay', icon: null, text: 'STC' },
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                      paymentMethod === method.id
                        ? 'border-[#C9A961] bg-[#C9A961]/10'
                        : 'border-neutral-700 hover:border-neutral-600'
                    }`}
                  >
                    {method.icon && <method.icon className="w-6 h-6 text-[#C9A961]" />}
                    {method.text !== undefined && !method.icon && (
                      <span className="text-lg font-bold">{method.text || '🍎'}</span>
                    )}
                    <span className="text-xs text-neutral-300">{method.label}</span>
                  </button>
                ))}
              </div>

              {(paymentMethod === 'card' || paymentMethod === 'mada') && (
                <div className="space-y-6">
                  {/* Interactive Credit Card Visual */}
                  <div className="flex justify-center mb-6">
                    <div 
                      className="relative w-[340px] h-[200px] perspective-1000"
                      style={{ perspective: '1000px' }}
                    >
                      <div 
                        className={`relative w-full h-full transition-transform duration-500 preserve-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}
                        style={{ 
                          transformStyle: 'preserve-3d',
                          transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                        }}
                      >
                        {/* Card Front */}
                        <div 
                          className="absolute w-full h-full rounded-2xl p-6 backface-hidden"
                          style={{ 
                            backfaceVisibility: 'hidden',
                            background: cardType === 'visa' 
                              ? 'linear-gradient(135deg, #1a1f71 0%, #2d3a8c 100%)'
                              : cardType === 'mastercard'
                              ? 'linear-gradient(135deg, #0f0f0f 0%, #2a2a2a 100%)'
                              : cardType === 'mada'
                              ? 'linear-gradient(135deg, #004d40 0%, #00796b 100%)'
                              : 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)'
                          }}
                        >
                          {/* Card Type Logo */}
                          <div className="flex justify-between items-start mb-8">
                            <div className="w-12 h-8 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-md" />
                            <div className="text-white text-sm font-bold uppercase tracking-wider">
                              {cardType === 'generic' ? 'CREDIT' : cardType.toUpperCase()}
                            </div>
                          </div>
                          
                          {/* Card Number */}
                          <div className="text-white text-xl font-mono tracking-wider mb-6">
                            {displayCardNumber}
                          </div>
                          
                          {/* Card Details */}
                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-neutral-400 text-[10px] uppercase mb-1">Card Holder</p>
                              <p className="text-white font-medium tracking-wide uppercase text-sm">
                                {displayName}
                              </p>
                            </div>
                            <div>
                              <p className="text-neutral-400 text-[10px] uppercase mb-1">Expires</p>
                              <p className="text-white font-medium text-sm">{displayExpiry}</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Card Back */}
                        <div 
                          className="absolute w-full h-full rounded-2xl backface-hidden"
                          style={{ 
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)'
                          }}
                        >
                          {/* Magnetic Strip */}
                          <div className="w-full h-12 bg-neutral-800 mt-6" />
                          
                          {/* CVV Area */}
                          <div className="px-6 mt-6">
                            <div className="bg-white h-10 rounded flex items-center justify-end px-4">
                              <span className="text-black font-mono">{cvv || '•••'}</span>
                            </div>
                            <p className="text-neutral-500 text-xs mt-2 text-right">CVV</p>
                          </div>
                          
                          <div className="px-6 mt-4">
                            <p className="text-neutral-500 text-xs">
                              This card is property of LuxDrive Bank. If found, please return to any branch.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Input Fields */}
                  <div className="space-y-4">
                    {/* Card Number */}
                    <div>
                      <label className="block text-sm text-neutral-400 mb-2">Card Number</label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => {
                            setCardNumber(formatCardNumber(e.target.value))
                            if (errors.cardNumber) setErrors(prev => ({...prev, cardNumber: ''}))
                          }}
                          onFocus={() => setIsCardFlipped(false)}
                          placeholder="1234 5678 9012 3456"
                          maxLength={19}
                          className={`w-full pl-10 pr-4 py-3 bg-neutral-900 border rounded-lg focus:outline-none text-white placeholder-neutral-600 transition-colors ${
                            errors.cardNumber ? 'border-red-500 focus:border-red-500' : 'border-neutral-700 focus:border-[#C9A961]'
                          }`}
                        />
                      </div>
                      {errors.cardNumber && (
                        <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errors.cardNumber}
                        </p>
                      )}
                    </div>

                    {/* Card Name */}
                    <div>
                      <label className="block text-sm text-neutral-400 mb-2">Cardholder Name</label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => {
                          setCardName(e.target.value.toUpperCase())
                          if (errors.cardName) setErrors(prev => ({...prev, cardName: ''}))
                        }}
                        onFocus={() => setIsCardFlipped(false)}
                        placeholder="JOHN DOE"
                        className={`w-full px-4 py-3 bg-neutral-900 border rounded-lg focus:outline-none text-white placeholder-neutral-600 uppercase transition-colors ${
                          errors.cardName ? 'border-red-500 focus:border-red-500' : 'border-neutral-700 focus:border-[#C9A961]'
                        }`}
                      />
                      {errors.cardName && (
                        <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errors.cardName}
                        </p>
                      )}
                    </div>

                    {/* Expiry & CVV */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-2">Expiry Date</label>
                        <input
                          type="text"
                          value={expiry}
                          onChange={(e) => {
                            setExpiry(formatExpiry(e.target.value))
                            if (errors.expiry) setErrors(prev => ({...prev, expiry: ''}))
                          }}
                          onFocus={() => setIsCardFlipped(false)}
                          placeholder="MM/YY"
                          maxLength={5}
                          className={`w-full px-4 py-3 bg-neutral-900 border rounded-lg focus:outline-none text-white placeholder-neutral-600 transition-colors ${
                            errors.expiry ? 'border-red-500 focus:border-red-500' : 'border-neutral-700 focus:border-[#C9A961]'
                          }`}
                        />
                        {errors.expiry && (
                          <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {errors.expiry}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-2">CVV</label>
                        <input
                          type="text"
                          value={cvv}
                          onChange={(e) => {
                            setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))
                            if (errors.cvv) setErrors(prev => ({...prev, cvv: ''}))
                          }}
                          onFocus={() => setIsCardFlipped(true)}
                          onBlur={() => setIsCardFlipped(false)}
                          placeholder="123"
                          maxLength={4}
                          className={`w-full px-4 py-3 bg-neutral-900 border rounded-lg focus:outline-none text-white placeholder-neutral-600 transition-colors ${
                            errors.cvv ? 'border-red-500 focus:border-red-500' : 'border-neutral-700 focus:border-[#C9A961]'
                          }`}
                        />
                        {errors.cvv && (
                          <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {errors.cvv}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'apple' && (
                <div className="text-center py-8">
                  <p className="text-neutral-400 mb-4">Click the button below to pay with Apple Pay</p>
                  <button className="inline-flex items-center gap-2 px-8 py-3 bg-black border border-neutral-700 rounded-lg text-white font-semibold hover:bg-neutral-900 transition-colors">
                    <span className="text-xl">🍎</span> Pay with Apple Pay
                  </button>
                </div>
              )}

              {paymentMethod === 'stc' && (
                <div className="text-center py-8">
                  <p className="text-neutral-400 mb-4">You will be redirected to STC Pay to complete payment</p>
                  <button className="inline-flex items-center gap-2 px-8 py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700 transition-colors">
                    <span className="text-xl">📱</span> Pay with STC Pay
                  </button>
                </div>
              )}
            </div>

            {/* Security Note */}
            <div className="flex items-center gap-3 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
              <Lock className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm text-white font-medium">Secure Payment via PayTabs</p>
                <p className="text-xs text-neutral-400">
                  Your payment information is encrypted with 256-bit SSL. We never store your card details.
                </p>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-[#141414] rounded-xl p-6 border border-neutral-800 sticky top-6">
              <h2 className="text-xl font-serif font-bold mb-6">Order Summary</h2>
              
              {/* Trip Details */}
              <div className="space-y-4 mb-6 pb-6 border-b border-neutral-800">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#C9A961] mt-1" />
                  <div>
                    <p className="text-xs text-neutral-500">Route</p>
                    <p className="text-sm">{pickup} {bookingType === 'oneway' ? `→ ${dropoff}` : `(${duration})`}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-[#C9A961] mt-1" />
                  <div>
                    <p className="text-xs text-neutral-500">Date & Time</p>
                    <p className="text-sm">{date} at {time}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Car className="w-4 h-4 text-[#C9A961] mt-1" />
                  <div>
                    <p className="text-xs text-neutral-500">Vehicle</p>
                    <p className="text-sm">{vehicle.name}</p>
                  </div>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-neutral-400">
                  <span>Base Fare</span>
                  <span>SAR {basePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>VAT (15%)</span>
                  <span>SAR {vat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t border-neutral-800">
                  <span>Total</span>
                  <span className="text-[#C9A961]">SAR {total.toFixed(2)}</span>
                </div>
              </div>

              {/* Pay Button */}
              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="w-full py-4 bg-[#C9A961] text-black font-semibold rounded-lg transition-all duration-300 hover:bg-[#d4b872] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Pay SAR {total.toFixed(2)}
                  </>
                )}
              </button>

              <p className="text-xs text-neutral-500 text-center mt-4">
                By completing this payment, you agree to our Terms of Service
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A961]/30 border-t-[#C9A961] rounded-full animate-spin" />
      </div>
    }>
      <PaymentContent />
    </Suspense>
  )
}
