import React from 'react'
import { Activity, FileWarning, MessageCircle, Sparkles, Target, ThumbsUp, TrendingUp, Users } from 'lucide-react'
import GrowthChart from '../../components/admin/GrowthChart'
import {
  CardTitle,
  MetricCard,
  StatusBadge,
  formatDate,
  formatNumber,
  shortText
} from '../../components/admin/adminShared'

const Overview = ({ growth, growthDays, onGrowthDaysChange, onOpenReports, topPosts = [], totals = {} }) => (
  <div className='space-y-5'>
    <div className='flex flex-wrap gap-2'>
      {['Tat ca', 'Nguoi dung', 'Bai viet', 'Bao cao', 'Tuong tac'].map((label, index) => (
        <button key={label} type='button' className={`rounded-lg border px-4 py-2 text-sm font-bold transition cursor-pointer ${index === 0 ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
          {label}
        </button>
      ))}
    </div>

    <section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-6'>
      <MetricCard label='Tong nguoi dung' value={totals.users} icon={Users} tone='blue' />
      <MetricCard label='Tong bai dang' value={totals.posts} icon={MessageCircle} tone='cyan' />
      <MetricCard label='Tong binh luan' value={totals.comments} icon={Activity} tone='violet' />
      <MetricCard label='Likes/Reactions' value={totals.likesReactions} icon={ThumbsUp} tone='rose' />
      <MetricCard label='Bao cao vi pham' value={totals.reports} icon={FileWarning} tone='amber' note={`${formatNumber(totals.pendingReports)} cho`} />
      <MetricCard label='User moi tuan nay' value={totals.newUsersThisWeek} icon={TrendingUp} tone='emerald' note={`${formatNumber(totals.newUsersToday)} hom nay`} />
    </section>

    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]'>
      <GrowthChart growth={growth} rangeDays={growthDays} onRangeChange={onGrowthDaysChange} />

      <section className='rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
        <CardTitle icon={Target} title='Bao cao can xu ly' subtitle='Uu tien xu ly noi dung dang bi report' />
        <div className='space-y-3'>
          <div className='rounded-xl border border-amber-100 bg-amber-50 p-4'>
            <p className='text-xs font-black uppercase text-amber-700'>Dang cho</p>
            <p className='mt-2 text-3xl font-black text-slate-950'>{formatNumber(totals.pendingReports)}</p>
            <button type='button' onClick={onOpenReports} className='mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white cursor-pointer'>
              Mo kiem duyet
            </button>
          </div>
          <div className='rounded-xl border border-slate-200 p-4'>
            <p className='text-sm font-black text-slate-950'>Tuong tac bai viet</p>
            <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
              <div>
                <p className='text-xs text-slate-500'>Reactions</p>
                <p className='font-black'>{formatNumber(totals.postReactions)}</p>
              </div>
              <div>
                <p className='text-xs text-slate-500'>Shares</p>
                <p className='font-black'>{formatNumber(totals.shares)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section className='rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
      <CardTitle icon={Sparkles} title='Top bai viet tuong tac cao' subtitle='Cac bai viet co tong tuong tac tot nhat gan day' />
      <div className='flex gap-4 overflow-x-auto pb-1'>
        {topPosts.map((post) => (
          <article key={post._id} className='min-w-[17rem] rounded-xl border border-slate-200 bg-white p-4'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <p className='text-xs font-bold text-slate-500'>{formatDate(post.createdAt)}</p>
              <StatusBadge status={post.pending_reports_count > 0 ? 'pending' : 'approved'}>
                {post.pending_reports_count > 0 ? 'Co report' : 'On dinh'}
              </StatusBadge>
            </div>
            <h3 className='line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950'>{shortText(post.content || 'Bai viet media', 90)}</h3>
            <div className='mt-5 grid grid-cols-3 gap-3 text-center text-xs'>
              <div className='rounded-lg bg-rose-50 p-2 text-rose-700'>
                <ThumbsUp className='mx-auto mb-1 size-4' />
                <p className='font-black'>{formatNumber(post.reactions_count + post.old_likes_count)}</p>
                <p>Thich</p>
              </div>
              <div className='rounded-lg bg-cyan-50 p-2 text-cyan-700'>
                <MessageCircle className='mx-auto mb-1 size-4' />
                <p className='font-black'>{formatNumber(post.comments_count)}</p>
                <p>Binh luan</p>
              </div>
              <div className='rounded-lg bg-emerald-50 p-2 text-emerald-700'>
                <Target className='mx-auto mb-1 size-4' />
                <p className='font-black'>{formatNumber(post.total_interactions)}</p>
                <p>Tong</p>
              </div>
            </div>
          </article>
        ))}
        {topPosts.length === 0 && <p className='text-sm text-slate-500'>Chua co du lieu.</p>}
      </div>
    </section>
  </div>
)

export default Overview
