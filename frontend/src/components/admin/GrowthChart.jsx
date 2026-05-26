import React, { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  CardTitle,
  CHART_RANGE_OPTIONS,
  CHART_TABS,
  formatChartDate,
  formatDate,
  formatNumber
} from './adminShared'

const GrowthChart = ({ growth = {}, rangeDays = 7, onRangeChange = () => {} }) => {
  const [activeMetric, setActiveMetric] = useState('users')
  const [hoverIndex, setHoverIndex] = useState(null)
  const activeConfig = CHART_TABS.find((tab) => tab.id === activeMetric) || CHART_TABS[0]
  const series = growth[activeMetric] || []
  const max = Math.max(...series.map((item) => item.count || 0), 1)
  const chartWidth = 640
  const chartHeight = 278
  const chartLeft = 48
  const chartRight = 22
  const chartTop = 24
  const chartBottom = 42
  const plotWidth = chartWidth - chartLeft - chartRight
  const plotHeight = chartHeight - chartTop - chartBottom
  const step = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth
  const baseline = chartTop + plotHeight
  const points = series.map((item, index) => {
    const x = chartLeft + index * step
    const y = baseline - ((item.count || 0) / max) * plotHeight
    return { ...item, x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = points.length
    ? `M ${chartLeft} ${baseline} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${chartLeft + plotWidth} ${baseline} Z`
    : ''
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null
  const xLabelIndexes = points.length > 1
    ? [...new Set([0, Math.floor((points.length - 1) * 0.25), Math.floor((points.length - 1) * 0.5), Math.floor((points.length - 1) * 0.75), points.length - 1])]
    : [0]
  const tooltipWidth = 160
  const tooltipHeight = 58
  const tooltipX = hoverPoint ? Math.min(Math.max(hoverPoint.x + 14, chartLeft), chartWidth - tooltipWidth - 8) : 0
  const tooltipY = hoverPoint ? Math.max(hoverPoint.y - tooltipHeight - 12, 8) : 0
  const hoverWidth = Math.max(step, 20)
  const hoverX = hoverPoint ? Math.min(Math.max(chartLeft, hoverPoint.x - hoverWidth / 2), chartLeft + plotWidth - hoverWidth) : chartLeft

  const handleChartHover = (event) => {
    if (!points.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const xInPlot = ((event.clientX - bounds.left) / bounds.width) * plotWidth
    const nextIndex = step > 0 ? Math.round(xInPlot / step) : 0
    setHoverIndex(Math.min(Math.max(nextIndex, 0), points.length - 1))
  }

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'>
      <CardTitle
        icon={BarChart3}
        title='Hiệu suất tăng trưởng'
        subtitle='Theo dõi số lượng từng danh mục theo khoảng thời gian đã chọn'
        action={(
          <select
            value={rangeDays}
            aria-label='Lọc thời gian biểu đồ'
            onChange={(event) => {
              setHoverIndex(null)
              onRangeChange(Number(event.target.value))
            }}
            className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none transition cursor-pointer hover:bg-slate-50 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
          >
            {CHART_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
      />

      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <div className='inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white'>
          {CHART_TABS.map((tab) => {
            const isActive = activeMetric === tab.id
            return (
              <button
                key={tab.id}
                type='button'
                aria-pressed={isActive}
                onClick={() => {
                  setActiveMetric(tab.id)
                  setHoverIndex(null)
                }}
                className={`min-w-fit border-r border-slate-200 px-4 py-2 text-sm font-bold transition last:border-r-0 cursor-pointer ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className='h-80 w-full overflow-visible' onMouseLeave={() => setHoverIndex(null)}>
        <defs>
          <linearGradient id='adminChartBlue' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#0ea5e9' stopOpacity='0.26' />
            <stop offset='100%' stopColor='#0ea5e9' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartGreen' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#10b981' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#10b981' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartViolet' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#8b5cf6' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#8b5cf6' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartRose' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#f43f5e' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#f43f5e' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='adminChartAmber' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='#f59e0b' stopOpacity='0.24' />
            <stop offset='100%' stopColor='#f59e0b' stopOpacity='0' />
          </linearGradient>
          <filter id='adminChartShadow' x='-20%' y='-20%' width='140%' height='160%'>
            <feDropShadow dx='0' dy='8' stdDeviation='8' floodColor='#0f172a' floodOpacity='0.14' />
          </filter>
        </defs>

        {[0, 1, 2, 3, 4].map((line) => {
          const y = chartTop + (plotHeight / 4) * line
          const value = Math.round(max - (max / 4) * line)
          return (
            <g key={line}>
              <line x1={chartLeft} x2={chartLeft + plotWidth} y1={y} y2={y} stroke='#edf2f7' strokeWidth='1' />
              <text x={chartLeft - 12} y={y + 4} textAnchor='end' className='fill-slate-500 text-[11px] font-semibold'>{formatNumber(value)}</text>
            </g>
          )
        })}

        {hoverPoint && (
          <rect
            x={hoverX}
            y={chartTop}
            width={hoverWidth}
            height={plotHeight}
            fill={activeConfig.color}
            opacity='0.07'
            stroke={activeConfig.color}
            strokeOpacity='0.16'
          />
        )}

        {areaPath && <path d={areaPath} fill={`url(#${activeConfig.fill})`} />}
        {linePath && (
          <path
            d={linePath}
            fill='none'
            stroke={activeConfig.color}
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        )}

        <rect
          x={chartLeft}
          y={chartTop}
          width={plotWidth}
          height={plotHeight}
          fill='transparent'
          onMouseEnter={handleChartHover}
          onMouseMove={handleChartHover}
        />

        {xLabelIndexes.map((index) => {
          const point = points[index]
          return point ? (
            <text key={point.date} x={point.x} y={chartHeight - 10} textAnchor='middle' className='fill-slate-500 text-[11px] font-semibold'>
              {formatChartDate(point.date)}
            </text>
          ) : null
        })}

        {hoverPoint && (
          <g pointerEvents='none'>
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r='5' fill='white' stroke={activeConfig.color} strokeWidth='3' />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx='8' fill='white' stroke='#e2e8f0' filter='url(#adminChartShadow)' />
            <text x={tooltipX + 12} y={tooltipY + 22} className='fill-slate-700 text-[11px] font-black'>
              {formatDate(hoverPoint.date)}
            </text>
            <text x={tooltipX + 12} y={tooltipY + 42} className='text-[12px] font-black' fill={activeConfig.color}>
              {activeConfig.metricLabel}: {formatNumber(hoverPoint.count)}
            </text>
          </g>
        )}
      </svg>
    </section>
  )
}

export default GrowthChart
