const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');

// Ana Sayfa - Uçuş Listeleme
router.get('/', async (req, res) => {
    try {
        const flights = await Flight.find(); // Tüm uçuşları çek
        res.render('index', { flights, now: new Date() });
    } catch (err) {
        res.status(500).send("Database Error!");
    }
});

module.exports = router;