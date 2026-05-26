export const ACCOUNT_LOCKED_CODE = 'ACCOUNT_LOCKED'
export const ACCOUNT_LOCKED_MESSAGE = 'Tài khoản bị khoá do vi phạm tiêu chuẩn cộng đồng'

export const sendAccountLocked = (res) => (
    res.status(403).json({
        success: false,
        code: ACCOUNT_LOCKED_CODE,
        message: ACCOUNT_LOCKED_MESSAGE
    })
)
