export const REPORT_REASON_OPTIONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Quấy rối' },
  { value: 'hate', label: 'Ngôn từ thù ghét' },
  { value: 'violence', label: 'Bạo lực hoặc đe dọa' },
  { value: 'nudity', label: 'Nội dung nhạy cảm' },
  { value: 'scam', label: 'Lừa đảo' },
  { value: 'other', label: 'Khác' }
]

export const REPORT_REASON_LABELS = {
  ...REPORT_REASON_OPTIONS.reduce((labels, option) => ({
    ...labels,
    [option.value]: option.label
  }), {}),
  violance: 'Bạo lực hoặc đe dọa',
  nuditity: 'Nội dung nhạy cảm'
}

export const getReportReasonLabel = (reason) => REPORT_REASON_LABELS[reason] || reason || 'Khác'
