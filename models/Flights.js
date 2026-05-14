const mongoose = require('mongoose');

const flightSchema = new mongoose.Schema({
    from_city: { type: String, required: true },
    to_city: { type: String, required: true },
    departure_time: { type: Date, required: true },
    arrival_time: { type: Date, required: true },
    price: { type: Number, required: true },
    seats_total: { type: Number, required: true },
    seats_available: { type: Number, required: true }
});

module.exports = mongoose.model('Flight', flightSchema);