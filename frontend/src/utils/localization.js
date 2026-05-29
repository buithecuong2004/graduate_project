const messageMap = {
  // General
  'User not found': 'Không tìm thấy người dùng',
  'Post not found': 'Không tìm thấy bài viết',
  'Comment not found': 'Không tìm thấy bình luận',
  'Live stream not found': 'Không tìm thấy livestream',
  'Live stream has ended': 'Livestream đã kết thúc',
  'Live stream started': 'Đã bắt đầu livestream',
  'Live stream ended': 'Livestream đã kết thúc',
  'You can only end your own live stream': 'Bạn chỉ có thể kết thúc livestream của mình',
  'Comment cannot be empty': 'Bình luận không được để trống',
  'Comment is too long': 'Bình luận quá dài',
  'Invalid reaction': 'Cảm xúc không hợp lệ',
  'Unauthorized': 'Không có quyền truy cập',
  'Success': 'Thành công',
  'Something went wrong': 'Đã có lỗi xảy ra',
  'Internal Server Error': 'Lỗi máy chủ nội bộ',
  'Network Error': 'Lỗi kết nối mạng',
  'Invalid report reason': 'Nội dung báo cáo không hợp lệ',
  'Report already pending': 'Bạn đã gửi báo cáo này',
  'Report submitted': 'Đã gửi báo cáo',
  'You cannot report yourself or your own content': 'Bạn không thể báo cáo chính mình hoặc nội dung của mình',
  'You cannot report this content': 'Bạn không thể báo cáo nội dung này',

  // Authentication
  'Invalid credentials': 'Thông tin đăng nhập không hợp lệ',
  'Email already exists': 'Email đã tồn tại',
  'Username already exists': 'Tên người dùng đã tồn tại',
  'Password is required': 'Vui lòng nhập mật khẩu',
  'Login successful': 'Đăng nhập thành công',
  'Logout successful': 'Đăng xuất thành công',

  // Connections / Friends
  'Follow success': 'Theo dõi thành công',
  'Unfollow success': 'Bỏ theo dõi thành công',
  'Connection request sent': 'Đã gửi lời mời kết bạn',
  'Connection accepted': 'Đã chấp nhận lời mời kết bạn',
  'Connection declined': 'Đã từ chối lời mời kết bạn',
  'Connection removed': 'Đã hủy kết bạn',
  'Request already sent': 'Lời mời đã được gửi trước đó',
  'You are already following this user': 'Bạn đã theo dõi người dùng này rồi',

  // Messages
  'Message sent': 'Đã gửi tin nhắn',
  'Message edited': 'Đã sửa tin nhắn',
  'Message deleted': 'Đã xóa tin nhắn',
  'Message forwarded': 'Đã chuyển tiếp tin nhắn',
  'Select at least one person': 'Vui lòng chọn ít nhất một người',

  // Media
  'Invalid image format. Only JPG, PNG, WebP, GIF allowed': 'Định dạng hình ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG, WebP, GIF',
  'Each image must be less than 10MB': 'Mỗi hình ảnh phải nhỏ hơn 10MB',
  'Invalid video format. Only MP4, WebM, OGG, MOV allowed': 'Định dạng video không hợp lệ. Chỉ chấp nhận MP4, WebM, OGG, MOV',
  'Each video must be less than 100MB': 'Mỗi video phải nhỏ hơn 100MB',
  'Maximum 5 images per message': 'Tối đa 5 hình ảnh cho mỗi tin nhắn',
  'Maximum 3 videos per message': 'Tối đa 3 video cho mỗi tin nhắn',
  'Microphone access denied. Please allow microphone permission.': 'Truy cập micro bị từ chối. Vui lòng cấp quyền sử dụng micro.',

  // Posts / Stories
  'Post created successfully': 'Đăng bài thành công',
  'Post deleted successfully': 'Xóa bài viết thành công',
  'Post liked': 'Đã thích bài viết',
  'Post unliked': 'Đã bỏ thích bài viết',
  'Post shared': 'Đã chia sẻ bài viết',
  'Share removed': 'Đã gỡ chia sẻ',
  'Reaction updated': 'Đã cập nhật cảm xúc',
  'Story created successfully': 'Đăng tin thành công',
  'Comment added': 'Đã thêm bình luận',
  'Comment deleted': 'Đã xóa bình luận',
  'Comment liked': 'Đã thích bình luận',
  'Comment unliked': 'Đã bỏ thích bình luận',
  'Reply added': 'Đã thêm phản hồi',
  'Reply deleted': 'Đã xóa phản hồi',
  'Maximum 4 images allowed per post': 'Tối đa 4 hình ảnh mỗi bài viết',
  'Video size must be less than 500MB': 'Kích thước video phải nhỏ hơn 500MB',
  'Cannot have both video and images in the same post': 'Không thể có cả video và hình ảnh trong cùng một bài',
  'Please add content, images, or a video': 'Vui lòng thêm nội dung, hình ảnh hoặc video',
  'You can only delete your own posts': 'Bạn chỉ có thể xóa bài viết của mình',
  'You can only delete your own comments': 'Bạn chỉ có thể xóa bình luận của mình',
  'You can only delete your own replies': 'Bạn chỉ có thể xóa phản hồi của mình',
  'Vui lòng thêm nội dung, hình ảnh hoặc video': 'Vui lòng thêm nội dung, hình ảnh hoặc video',
  'Tin không còn khả dụng': 'Tin không còn khả dụng',
  'Không thể tải tin': 'Không thể tải tin',
};

/**
 * Localizes an English message to Vietnamese.
 * If no translation is found, returns the original message.
 * @param {string} msg - The English message to localize.
 * @returns {string} - The localized Vietnamese message.
 */
export const localizeMessage = (msg) => {
  if (!msg) return msg;
  return messageMap[msg] || msg;
};

export default localizeMessage;
