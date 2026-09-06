# Node.js का आधिकारिक हल्का वर्ज़न उपयोग करें
FROM node:18-alpine

# ऐप के लिए फोल्डर बनाएं
WORKDIR /app

# पैकेज फाइलें कॉपी करें
COPY package*.json ./

# डिपेंडेंसी इंस्टॉल करें
RUN npm install

# बाकी सारा कोड कॉपी करें
COPY . .

# पोर्ट सेट करें जो Render उपयोग करेगा
ENV PORT=10000
EXPOSE 10000

# सर्वर शुरू करने की कमांड
CMD ["npm", "start"]
