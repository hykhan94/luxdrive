'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Check, Calendar, Clock, MapPin, Car, Download, Plus, Phone, Mail } from 'lucide-react'

const vehicles: Record<string, { name: string; price: number }> = {
  'business-sedan': { name: 'Business Sedan', price: 150 },
  'business-suv': { name: 'Business SUV', price: 200 },
  'first-class': { name: 'First Class', price: 300 },
  'sprinter-class': { name: 'Sprinter Class', price: 500 },
}

function ConfirmationContent() {
  const searchParams = useSearchParams()
  
  const bookingRef = searchParams.get('ref') || 'LUX-XXXXXX'
  const pickup = searchParams.get('pickup') || ''
  const dropoff = searchParams.get('dropoff') || ''
  const date = searchParams.get('date') || ''
  const time = searchParams.get('time') || ''
  const vehicleId = searchParams.get('vehicle') || 'business-sedan'
  
  const vehicle = vehicles[vehicleId] || vehicles['business-sedan']
  const basePrice = vehicle.price
  const vat = basePrice * 0.15
  const total = basePrice + vat

  const handleDownloadReceipt = () => {
    // Create a styled HTML receipt optimized for single page print
    const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LuxDrive Receipt - ${bookingRef}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body { 
      font-family: 'Helvetica Neue', Arial, sans-serif; 
      background: #fff; 
      color: #333; 
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .receipt { 
      max-width: 500px; 
      margin: 0 auto; 
      background: #fff; 
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 24px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .header { text-align: center; border-bottom: 1px solid #e5e5e5; padding-bottom: 16px; margin-bottom: 16px; }
    .logo { color: #C9A961; font-size: 24px; font-weight: bold; letter-spacing: 2px; }
    .tagline { color: #666; font-size: 11px; margin-top: 2px; }
    .ref-label { color: #666; font-size: 10px; margin-top: 12px; text-transform: uppercase; }
    .ref { color: #C9A961; font-size: 20px; font-weight: bold; font-family: monospace; margin-top: 4px; }
    .section { margin-bottom: 16px; }
    .section-title { color: #C9A961; font-size: 10px; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; text-transform: uppercase; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; }
    .value { color: #333; font-weight: 500; text-align: right; max-width: 60%; }
    .total-row { border-top: 1px solid #e5e5e5; padding-top: 10px; margin-top: 10px; }
    .total-label { font-size: 14px; font-weight: bold; color: #333; }
    .total-value { color: #C9A961; font-size: 16px; font-weight: bold; }
    .footer { 
      text-align: center; 
      margin-top: auto; 
      padding-top: 16px; 
      border-top: 1px solid #e5e5e5;
    }
    .footer p { color: #666; font-size: 11px; margin: 3px 0; }
    .footer .website { 
      margin-top: 12px;
      padding: 8px;
      background: #1a1a1a;
      color: #fff;
      border-radius: 4px;
      font-size: 11px;
    }
    @media print { 
      body { padding: 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .receipt { border: 1px solid #ddd; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">LUXDRIVE</div>
      <div class="tagline">Premium Chauffeur Services</div>
      <div class="ref-label">Booking Reference</div>
      <div class="ref">${bookingRef}</div>
    </div>
    
    <div class="section">
      <div class="section-title">Trip Details</div>
      <div class="row"><span class="label">Pickup</span><span class="value">${pickup || 'N/A'}</span></div>
      <div class="row"><span class="label">Drop-off</span><span class="value">${dropoff || 'N/A'}</span></div>
      <div class="row"><span class="label">Date</span><span class="value">${date || 'N/A'}</span></div>
      <div class="row"><span class="label">Time</span><span class="value">${time || 'N/A'}</span></div>
      <div class="row"><span class="label">Vehicle</span><span class="value">${vehicle.name}</span></div>
    </div>
    
    <div class="section">
      <div class="section-title">Payment Summary</div>
      <div class="row"><span class="label">Base Fare</span><span class="value">SAR ${basePrice.toFixed(2)}</span></div>
      <div class="row"><span class="label">VAT (15%)</span><span class="value">SAR ${vat.toFixed(2)}</span></div>
      <div class="row total-row">
        <span class="total-label">Total Paid</span>
        <span class="total-value">SAR ${total.toFixed(2)}</span>
      </div>
    </div>
    
    <div class="footer">
      <p>Thank you for choosing LuxDrive!</p>
      <p>support@luxdrive.sa | +966 11 234 5678</p>
      <div class="website">www.luxdrive.sa</div>
    </div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    // Open receipt in new window for printing/saving as PDF
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(receiptHTML)
      printWindow.document.close()
    }
  }

  const handleAddToCalendar = () => {
    // Parse date and time for calendar event
    const eventDate = new Date(date)
    const [hours, minutes] = time.match(/(\d+):(\d+)/)?.slice(1) || ['12', '00']
    const isPM = time.toLowerCase().includes('pm')
    let hour = parseInt(hours)
    if (isPM && hour !== 12) hour += 12
    if (!isPM && hour === 12) hour = 0
    
    eventDate.setHours(hour, parseInt(minutes), 0, 0)
    
    // Create end time (1 hour after pickup)
    const endDate = new Date(eventDate.getTime() + 60 * 60 * 1000)
    
    // Format for Google Calendar
    const formatDateForCal = (d: Date) => {
      return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    }
    
    const startStr = formatDateForCal(eventDate)
    const endStr = formatDateForCal(endDate)
    
    // Create Google Calendar URL
    const calendarUrl = new URL('https://calendar.google.com/calendar/render')
    calendarUrl.searchParams.set('action', 'TEMPLATE')
    calendarUrl.searchParams.set('text', `LuxDrive: ${pickup} to ${dropoff}`)
    calendarUrl.searchParams.set('dates', `${startStr}/${endStr}`)
    calendarUrl.searchParams.set('details', `Booking Reference: ${bookingRef}\nVehicle: ${vehicle.name}\nTotal: SAR ${total.toFixed(2)}\n\nDriver details will be sent 30 minutes before pickup.`)
    calendarUrl.searchParams.set('location', pickup)
    
    // Open in new tab
    window.open(calendarUrl.toString(), '_blank')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-6">
            <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-serif font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-neutral-400">Your ride has been successfully booked</p>
        </div>

        {/* Booking Reference */}
        <div className="bg-[#141414] rounded-xl p-6 border border-neutral-800 mb-6">
          <div className="text-center mb-6 pb-6 border-b border-neutral-800">
            <p className="text-neutral-400 text-sm mb-1">Booking Reference</p>
            <p className="text-2xl font-mono font-bold text-[#C9A961]">{bookingRef}</p>
          </div>

          {/* Trip Details */}
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#C9A961]/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#C9A961]" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-neutral-500 mb-1">Route</p>
                <p className="font-medium">{pickup}</p>
                <div className="w-0.5 h-4 bg-neutral-700 ml-2 my-1" />
                <p className="font-medium">{dropoff}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#C9A961]/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[#C9A961]" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Date</p>
                <p className="font-medium">{date}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#C9A961]/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-[#C9A961]" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Time</p>
                <p className="font-medium">{time}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#C9A961]/10 flex items-center justify-center">
                <Car className="w-5 h-5 text-[#C9A961]" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Vehicle</p>
                <p className="font-medium">{vehicle.name}</p>
              </div>
            </div>
          </div>

          {/* Price Summary */}
          <div className="mt-6 pt-6 border-t border-neutral-800">
            <div className="flex justify-between text-neutral-400 mb-2">
              <span>Base Fare</span>
              <span>SAR {basePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-neutral-400 mb-2">
              <span>VAT (15%)</span>
              <span>SAR {vat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-neutral-700">
              <span>Total Paid</span>
              <span className="text-[#C9A961]">SAR {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Driver Info Note */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
          <p className="text-blue-400 text-sm">
            Your driver details will be sent to your email and phone 30 minutes before pickup time.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button 
            onClick={handleDownloadReceipt}
            className="flex items-center justify-center gap-2 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Receipt
          </button>
          <button 
            onClick={handleAddToCalendar}
            className="flex items-center justify-center gap-2 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Add to Calendar
          </button>
        </div>

        {/* Support */}
        <div className="bg-[#141414] rounded-xl p-6 border border-neutral-800 mb-8">
          <h3 className="font-semibold mb-4">Need Help?</h3>
          <div className="grid grid-cols-2 gap-4">
            <a href="tel:+966112345678" className="flex items-center gap-3 text-neutral-400 hover:text-[#C9A961] transition-colors">
              <Phone className="w-4 h-4" />
              +966 11 234 5678
            </a>
            <a href="mailto:support@luxdrive.sa" className="flex items-center gap-3 text-neutral-400 hover:text-[#C9A961] transition-colors">
              <Mail className="w-4 h-4" />
              support@luxdrive.sa
            </a>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#d4b872] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Book Another Ride
          </Link>
          <p className="text-neutral-500 text-sm">
            Thank you for choosing LuxDrive
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A961]/30 border-t-[#C9A961] rounded-full animate-spin" />
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  )
}
