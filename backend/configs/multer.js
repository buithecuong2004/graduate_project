import multer from "multer";

const storage = multer.diskStorage({})

// File size limits
const limits = {
  fileSize: 500 * 1024 * 1024, // 500MB max file size
}

// File filter to validate MIME types
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg']
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes]

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only images and videos are allowed'))
  }
}

export const upload = multer({
  storage,
  limits,
  fileFilter
})