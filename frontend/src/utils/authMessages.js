export const ACCOUNT_LOCKED_CODE = 'ACCOUNT_LOCKED'
export const ACCOUNT_LOCKED_MESSAGE = 'Tài khoản bị khoá do vi phạm tiêu chuẩn cộng đồng'
export const ACCOUNT_LOCKED_STORAGE_KEY = 'tarous_auth_locked_message'
export const ACCOUNT_LOCKED_TOAST_ID = 'tarous-account-locked'

export const isAccountLockedResponse = (error) => (
  error?.response?.status === 403 &&
  error?.response?.data?.code === ACCOUNT_LOCKED_CODE
)
