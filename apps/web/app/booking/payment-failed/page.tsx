'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { XCircle, RefreshCw, CreditCard, Phone, Mail, ArrowLeft, Shield } from 'lucide-react'

function PaymentFailedContent() {
  const searchParams = useSearchParams()
  
  const errorCode = searchParams.get('error') || 'UNKNOWN'
  const errorMessage = searchParams.get('message') || 'Your payment could not be processed'
  
  // Build URL to retry payment
  const retryParams = new URLSearchParams(searchParams.toString())
  retryParams.delete('error')
  retryParams.delete('message')
  const retryUrl = `/booking/payment?${retryParams.toString()}`

  const errorDetails: Record<string, { title: string; description: string; suggestions: string[] }> = {
    'CARD_DECLINED': {
      title: 'Card Declined',
      description: 'Your card was declined by your bank.',
      suggestions: [
        'Check that your card details are correct',
        'Ensure you have sufficient funds',
        'Contact your bank if the problem persists',
        'Try using a different payment method'
      ]
    },
    'EXPIRED_CARD': {
      title: 'Card Expired',
      description: 'The card you provided has expired.',
      suggestions: [
        'Use a card with a valid expiration date',
        'Try a different payment method'
      ]
    },
    'INSUFFICIENT_FUNDS': {
      title: 'Insufficient Funds',
      description: 'Your account does not have enough funds for this transaction.',
      suggestions: [
        'Add funds to your account',
        'Try a different card',
        'Use a different payment method'
      ]
    },
    'INVALID_CVV': {
      title: 'Invalid Security Code',
      description: 'The CVV/CVC code entered was incorrect.',
      suggestions: [
        'Check the 3-digit code on the back of your card',
        'For Amex, check the 4-digit code on the front'
      ]
    },
    'NETWORK_ERROR': {
      title: 'Network Error',
      description: 'A network error occurred during payment processing.',
      suggestions: [
        'Check your internet connection',
        'Try again in a few moments',
        'If the problem persists, contact support'
      ]
    },
    'UNKNOWN': {
      title: 'Payment Failed',
      description: 'An unexpected error occurred during payment.',
      suggestions: [
        'Try again with the same payment method',
        'Try a different card or payment method',
        'Contact our support team for assistance'
      ]
    }
  }

  const error = errorDetails[errorCode] || errorDetails['UNKNOWN']

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Error Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-serif font-bold mb-2">{error.title}</h1>
          <p className="text-neutral-400">{error.description}</p>
        </div>

        {/* Error Details */}
        <div className="bg-[#141414] rounded-xl p-6 border border-neutral-800 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#C9A961]" />
            What you can do
          </h2>
          <ul className="space-y-3">
            {error.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-3 text-neutral-300">
                <div className="w-6 h-6 rounded-full bg-[#C9A961]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[#C9A961] text-xs font-semibold">{index + 1}</span>
                </div>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>

        {/* Error Code */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-300 text-sm">
            <span className="font-semibold">Error Code:</span> {errorCode}
          </p>
          {errorMessage && errorMessage !== error.description && (
            <p className="text-red-400/70 text-xs mt-1">{errorMessage}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link 
            href={retryUrl}
            className="flex items-center justify-center gap-2 py-3 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#d4b872] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Link>
          <Link 
            href={`/booking?${retryParams.toString()}`}
            className="flex items-center justify-center gap-2 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Change Payment
          </Link>
        </div>

        {/* Support */}
        <div className="bg-[#141414] rounded-xl p-6 border border-neutral-800 mb-8">
          <h3 className="font-semibold mb-4">Need Help?</h3>
          <p className="text-neutral-400 text-sm mb-4">
            Our support team is available 24/7 to assist you with any payment issues.
          </p>
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
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A961]/30 border-t-[#C9A961] rounded-full animate-spin" />
      </div>
    }>
      <PaymentFailedContent />
    </Suspense>
  )
}
