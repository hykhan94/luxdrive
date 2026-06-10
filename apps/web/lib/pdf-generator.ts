'use client'

interface BookingData {
  id: string
  customer: string
  route: string
  date: string
  time: string
  vehicle: string
  status: string
  driver: string | null
  fare: number
}

interface CompanyData {
  name: string
  crNumber: string
  vatNumber: string
}

export async function generateBookingPO(booking: BookingData) {
  if (typeof window === 'undefined') return
  
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const poNum = `PO-${booking.id.replace('ACM-', '')}`
  
  doc.setFontSize(20)
  doc.text('LuxDrive', 20, 20)
  doc.setFontSize(10)
  doc.text('Premium Chauffeur Services', 20, 27)
  doc.setFontSize(12)
  doc.text(`PO Number: ${poNum}`, 20, 45)
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 45)
  doc.line(20, 52, 190, 52)
  doc.setFontSize(10)
  doc.text(`Customer: ${booking.customer}`, 20, 65)
  doc.text(`Route: ${booking.route}`, 20, 73)
  doc.text(`Date & Time: ${booking.date} at ${booking.time}`, 20, 81)
  doc.text(`Vehicle: ${booking.vehicle}`, 20, 89)
  doc.text(`Status: ${booking.status.toUpperCase()}`, 20, 97)
  if (booking.driver) doc.text(`Driver: ${booking.driver}`, 20, 105)
  doc.line(20, 115, 190, 115)
  doc.text(`Subtotal: SAR ${booking.fare}`, 140, 125)
  doc.text(`VAT (15%): SAR ${(booking.fare * 0.15).toFixed(2)}`, 140, 133)
  doc.setFontSize(12)
  doc.text(`Total: SAR ${(booking.fare * 1.15).toFixed(2)}`, 140, 145)
  doc.save(`${poNum}.pdf`)
}

export async function generateMonthlyPO(
  poId: string,
  period: string,
  bookings: BookingData[],
  company: CompanyData
) {
  if (typeof window === 'undefined') return
  
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  
  const subtotal = bookings.reduce((sum, b) => sum + b.fare, 0)
  const vat = subtotal * 0.15
  const total = subtotal + vat
  
  doc.setFontSize(20)
  doc.text('LuxDrive', 20, 20)
  doc.setFontSize(10)
  doc.text('Premium Chauffeur Services', 20, 27)
  doc.setFontSize(12)
  doc.text(`PO Number: ${poId}`, 20, 45)
  doc.text(`Period: ${period}`, 20, 53)
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 45)
  doc.line(20, 60, 190, 60)
  doc.setFontSize(10)
  doc.text(`Partner: ${company.name}`, 20, 70)
  doc.text(`CR: ${company.crNumber}`, 20, 78)
  doc.text(`VAT: ${company.vatNumber}`, 20, 86)
  doc.setFontSize(11)
  doc.text('Booking Details', 20, 100)
  doc.setFontSize(9)
  let y = 108
  bookings.slice(0, 10).forEach((b) => {
    doc.text(`${b.id} | ${b.customer} | ${b.route} | SAR ${b.fare}`, 20, y)
    y += 7
  })
  if (bookings.length > 10) {
    doc.text(`... and ${bookings.length - 10} more bookings`, 20, y)
    y += 7
  }
  doc.line(20, y + 5, 190, y + 5)
  doc.setFontSize(10)
  doc.text(`Subtotal: SAR ${subtotal.toLocaleString()}`, 140, y + 15)
  doc.text(`VAT (15%): SAR ${vat.toFixed(2)}`, 140, y + 23)
  doc.setFontSize(12)
  doc.text(`Total: SAR ${total.toFixed(2)}`, 140, y + 35)
  doc.save(`${poId}.pdf`)
}
