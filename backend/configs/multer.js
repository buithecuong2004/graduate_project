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
  const allowedAudioTypes = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedAudioTypes]

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only images, videos and audio are allowed'))
  }
}

export const upload = multer({
  storage,
  limits,
  fileFilter
})