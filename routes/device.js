// Backend Route for Device Deletion
app.delete('/api/device/remove/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        // MongoDB se device ko delete karein
        const deletedDevice = await Device.findOneAndDelete({ deviceId });
        
        if (!deletedDevice) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }

        // Associated pair codes ya logs bhi clean kar sakte hain
        await PairCode.deleteMany({ deviceId });

        res.json({ success: true, message: 'Device deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
