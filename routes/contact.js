const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { authMiddleware, deviceAuthMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.post('/bulk-save', deviceAuthMiddleware, async (req, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) return errorResponse(res, 'contacts[] required');

    await Contact.deleteMany({ deviceId: req.deviceId, isSelected: false });
    const docs = contacts.map(c => ({
      deviceId: req.deviceId,
      name: c.name || 'Unknown',
      numbers: c.numbers || [],
      emails: c.emails || [],
      avatarUrl: c.avatarUrl || null
    }));
    const inserted = await Contact.insertMany(docs);
    return successResponse(res, { count: inserted.length }, 'Contacts saved', 201);
  } catch (err) {
    return errorResponse(res, 'Save failed', 500, err);
  }
});

router.get('/list/:deviceId', authMiddleware, async (req, res) => {
  const { search, selected } = req.query;
  const filter = { deviceId: req.params.deviceId };
  if (selected === 'true') filter.isSelected = true;
  if (search) filter.name = { $regex: search, $options: 'i' };
  const list = await Contact.find(filter).sort({ name: 1 }).limit(500);
  return successResponse(res, list);
});

router.post('/select', authMiddleware, async (req, res) => {
  const { ids, action } = req.body;
  const update = {};
  if (action === 'select') { update.isSelected = true; update.isWhitelisted = true; }
  if (action === 'deselect') { update.isSelected = false; update.isWhitelisted = false; }
  if (action === 'whitelist') update.isWhitelisted = true;
  if (action === 'block') update.isBlocked = true;
  await Contact.updateMany({ _id: { $in: ids } }, { $set: update });
  return successResponse(res, null, 'Updated');
});

module.exports = router;
