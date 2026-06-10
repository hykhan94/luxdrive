'use client'

import { useState } from 'react'
import { 
  Crown, 
  Star, 
  Gift, 
  Cake, 
  History, 
  ChevronRight,
  Check,
  Car,
  Sparkles
} from 'lucide-react'

// Mock user loyalty data - in real app would come from API
const mockLoyaltyData = {
  currentPoints: 1250,
  totalEarned: 2500,
  tier: 'Silver' as const,
  tierProgress: 75, // percentage to next tier
  pointsToNextTier: 250,
  nextTier: 'Gold',
  pointsExpireIn: 45, // days
  birthdayMonth: 4, // April (current month for demo - change based on current date)
  transactions: [
    { id: 't1', date: '2026-03-28', description: 'Trip to King Khalid Airport', points: 45, type: 'earned' as const },
    { id: 't2', date: '2026-03-25', description: 'Business Sedan Booking', points: 35, type: 'earned' as const },
    { id: 't3', date: '2026-03-20', description: 'Redeemed: Free Economy Ride', points: -500, type: 'redeemed' as const },
    { id: 't4', date: '2026-03-15', description: 'First Class Booking', points: 75, type: 'earned' as const },
    { id: 't5', date: '2026-03-10', description: 'Referral Bonus', points: 100, type: 'earned' as const },
  ],
}

const tiers = [
  { name: 'Bronze', minPoints: 0, maxPoints: 500, color: 'from-amber-700 to-amber-900', benefits: ['1 point per SAR 10', 'Birthday discount 10%'] },
  { name: 'Silver', minPoints: 501, maxPoints: 1500, color: 'from-gray-400 to-gray-600', benefits: ['1.25 points per SAR 10', 'Birthday discount 15%', 'Priority booking'] },
  { name: 'Gold', minPoints: 1501, maxPoints: 3000, color: 'from-yellow-500 to-yellow-700', benefits: ['1.5 points per SAR 10', 'Birthday discount 20%', 'Free upgrades', 'Dedicated support'] },
  { name: 'Platinum', minPoints: 3001, maxPoints: 999999, color: 'from-gray-300 to-gray-500', benefits: ['2 points per SAR 10', 'Birthday discount 25%', 'Free upgrades', 'VIP lounge access', '24/7 concierge'] },
]

const rewards = [
  { id: 'r1', name: 'Free Economy Ride', points: 500, vehicle: 'Economy Sedan', icon: Car },
  { id: 'r2', name: 'Free Business Sedan', points: 1000, vehicle: 'Business Sedan', icon: Car },
  { id: 'r3', name: 'Free Business SUV', points: 1500, vehicle: 'Business SUV', icon: Car },
  { id: 'r4', name: 'Free First Class', points: 2500, vehicle: 'First Class', icon: Crown },
]

const tierColors: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  Bronze: { bg: 'bg-amber-900/20', text: 'text-amber-500', border: 'border-amber-700/50', gradient: 'from-amber-700 to-amber-900' },
  Silver: { bg: 'bg-gray-500/20', text: 'text-gray-300', border: 'border-gray-500/50', gradient: 'from-gray-400 to-gray-600' },
  Gold: { bg: 'bg-[#C9A961]/20', text: 'text-[#C9A961]', border: 'border-[#C9A961]/50', gradient: 'from-[#C9A961] to-yellow-700' },
  Platinum: { bg: 'bg-gray-300/20', text: 'text-gray-200', border: 'border-gray-400/50', gradient: 'from-gray-300 to-gray-500' },
}

export default function MembershipRewards() {
  const [activeTab, setActiveTab] = useState<'overview' | 'rewards' | 'history'>('overview')
  const [showRedeemModal, setShowRedeemModal] = useState(false)
  const [selectedReward, setSelectedReward] = useState<typeof rewards[0] | null>(null)

  const currentMonth = new Date().getMonth() + 1 // 1-12
  const isBirthdayMonth = currentMonth === mockLoyaltyData.birthdayMonth
  const tierStyle = tierColors[mockLoyaltyData.tier]
  const currentTierData = tiers.find(t => t.name === mockLoyaltyData.tier)

  const handleRedeem = (reward: typeof rewards[0]) => {
    setSelectedReward(reward)
    setShowRedeemModal(true)
  }

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#C9A961]/20 flex items-center justify-center">
            <Crown className="w-5 h-5 text-[#C9A961]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Membership & Rewards</h2>
            <p className="text-sm text-gray-400">Earn points on every ride</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-neutral-900 p-1 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: Star },
          { id: 'rewards', label: 'Rewards', icon: Gift },
          { id: 'history', label: 'History', icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id 
                ? 'bg-[#C9A961] text-black' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Loyalty Card */}
          <div className={`relative overflow-hidden rounded-2xl border ${tierStyle.border} bg-gradient-to-br ${tierStyle.gradient} p-6`}>
            <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
              <Crown className="w-full h-full" />
            </div>
            
            <div className="flex items-center gap-3 mb-6">
              <Crown className="w-8 h-8 text-white" />
              <div>
                <p className="text-white/80 text-sm">Current Tier</p>
                <p className="text-2xl font-bold text-white">{mockLoyaltyData.tier}</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-white/80 text-sm mb-1">Points Balance</p>
              <p className="text-4xl font-bold text-white">{mockLoyaltyData.currentPoints.toLocaleString()}</p>
              <p className="text-white/60 text-xs mt-1">Points expire in {mockLoyaltyData.pointsExpireIn} days</p>
            </div>

            {/* Progress to next tier */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/80">{mockLoyaltyData.tier}</span>
                <span className="text-white/80">{mockLoyaltyData.nextTier}</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${mockLoyaltyData.tierProgress}%` }}
                />
              </div>
              <p className="text-white/60 text-xs mt-2">
                {mockLoyaltyData.pointsToNextTier} points to {mockLoyaltyData.nextTier}
              </p>
            </div>
          </div>

          {/* Tier Benefits & Birthday */}
          <div className="space-y-4">
            {/* Birthday Reward Card */}
            {isBirthdayMonth ? (
              <div className="relative overflow-hidden p-5 bg-gradient-to-r from-[#C9A961]/20 to-[#C9A961]/5 border-2 border-[#C9A961] rounded-xl">
                <div className="absolute -top-6 -right-6 text-6xl opacity-20">
                  <Cake className="w-24 h-24 text-[#C9A961]" />
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#C9A961]/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🎂</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#C9A961] mb-1">Happy Birthday Month!</h3>
                    <p className="text-gray-300 text-sm mb-3">Enjoy 20% off on all rides this month</p>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#C9A961] text-black text-sm font-semibold rounded-lg">
                      <Sparkles className="w-4 h-4" />
                      Code: BDAY20
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <Cake className="w-5 h-5 text-gray-400" />
                  <h3 className="text-white font-medium">Birthday Reward</h3>
                </div>
                <p className="text-gray-400 text-sm">Enjoy 20% off on your birthday month!</p>
              </div>
            )}

            {/* Tier Benefits */}
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h3 className="text-white font-medium mb-3">Your {mockLoyaltyData.tier} Benefits</h3>
              <div className="space-y-2">
                {currentTierData?.benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-[#C9A961]" />
                    <span className="text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Points Info */}
            <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl">
              <p className="text-gray-400 text-sm">
                <span className="text-[#C9A961] font-medium">Earn 1 point</span> for every SAR 10 spent
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rewards Tab */}
      {activeTab === 'rewards' && (
        <div className="space-y-6">
          {/* Points Balance Banner */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#C9A961]/10 via-neutral-900 to-[#C9A961]/10 border border-[#C9A961]/30 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#C9A961]/20 flex items-center justify-center">
                <Star className="w-6 h-6 text-[#C9A961]" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Your Points Balance</p>
                <p className="text-2xl font-bold text-white">{mockLoyaltyData.currentPoints.toLocaleString()} <span className="text-[#C9A961] text-lg font-medium">pts</span></p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-gray-500 text-xs">Tier</p>
              <p className={`text-lg font-semibold ${tierStyle.text}`}>{mockLoyaltyData.tier}</p>
            </div>
          </div>

          {/* Rewards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rewards.map((reward) => {
            const canRedeem = mockLoyaltyData.currentPoints >= reward.points
            return (
              <div 
                key={reward.id}
                className={`p-5 rounded-xl border transition-all ${
                  canRedeem 
                    ? 'bg-neutral-900 border-neutral-700 hover:border-[#C9A961]' 
                    : 'bg-neutral-900/50 border-neutral-800 opacity-60'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#C9A961]/10 flex items-center justify-center mb-4">
                  <reward.icon className="w-6 h-6 text-[#C9A961]" />
                </div>
                <h4 className="text-white font-medium mb-1">{reward.name}</h4>
                <p className="text-gray-500 text-sm mb-3">{reward.vehicle}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[#C9A961] font-bold">{reward.points.toLocaleString()} pts</span>
                  <button
                    onClick={() => canRedeem && handleRedeem(reward)}
                    disabled={!canRedeem}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      canRedeem
                        ? 'bg-[#C9A961] text-black hover:bg-[#d4b872]'
                        : 'bg-neutral-800 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Redeem
                  </button>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-white font-medium">Points History</h3>
          </div>
          <div className="divide-y divide-neutral-800">
            {mockLoyaltyData.transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.type === 'earned' ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}>
                    {tx.type === 'earned' ? (
                      <Star className="w-4 h-4 text-green-400" />
                    ) : (
                      <Gift className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-white text-sm">{tx.description}</p>
                    <p className="text-gray-500 text-xs">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                </div>
                <span className={`font-semibold ${tx.type === 'earned' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'earned' ? '+' : ''}{tx.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redeem Modal */}
      {showRedeemModal && selectedReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowRedeemModal(false)} />
          <div className="relative w-full max-w-md mx-4 bg-[#0f0f0f] border border-neutral-800 rounded-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-semibold text-white mb-2">Confirm Redemption</h3>
            <p className="text-gray-400 mb-6">
              Redeem <span className="text-[#C9A961] font-semibold">{selectedReward.points.toLocaleString()} points</span> for a {selectedReward.name}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRedeemModal(false)}
                className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // In real app, call API to redeem
                  setShowRedeemModal(false)
                }}
                className="flex-1 px-4 py-3 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#d4b872] transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
