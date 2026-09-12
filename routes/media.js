const express = require('express');
const router = express.Router();
const Media = require('../models/Media');
const cloudinary = require('cloudinary').v2;
const { authMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.get('/list/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const filter = { deviceId: req.params.deviceId };
    if (type) filter.mediaType = type;
    const list = await Media.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    return successResponse(res, list);
  } catch (err) {
    return errorResponse(res, 'Fetch failed', 500, err);
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return errorResponse(res, 'Not found', 404);

    if (media.publicId) {
      await cloudinary.uploader.destroy(media.publicId, {
        resource_type: 'auto'
      });
    }
    await Media.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Deleted from cloud + DB');
  } catch (err) {
    return errorResponse(res, 'Delete failed', 500, err);
  }
});

router.get('/stats/:deviceId', authMiddleware, async (req, res) => {
  const stats = await Media.aggregate([
    { $match: { deviceId: req.params.deviceId } },
    { $group: { _id: '$mediaType', count: { $sum: 1 } } }
  ]);
  return successResponse(res, stats);
});

module.exports = router;
