const crypto = require('crypto');

const generatePairCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateDeviceToken = () => crypto.randomBytes(32).toString('hex');

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const isTimeInRange = (currentTime, startTime, endTime) => {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const cur = toMin(currentTime);
  const start = toMin(startTime);
  const end = toMin(endTime);
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
};

const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const errorResponse = (res, message = 'Error', statusCode = 400, error = null) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
    details: error ? error.message || error : null
  });
};

module.exports = {
  generatePairCode,
  generateDeviceToken,
  getDistance,
  isTimeInRange,
  successResponse,
  errorResponse
};
