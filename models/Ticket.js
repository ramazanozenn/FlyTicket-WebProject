const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    passenger_name: { type: String, required: true },
    passenger_surname: { type: String, required: true },
    passenger_email: { type: String, required: true },
    flight: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight', required: true },
    seat_number: { type: String, required: true },
    pnr: { type: String, required: true } // PNR eklemeyi unutma
});

// BURASI KRİTİK: Değişken adın ticketSchema olduğu için burada da ticketSchema kullanmalısın
ticketSchema.index({ flight: 1, passenger_email: 1 }, { unique: true });

module.exports = mongoose.model('Ticket', ticketSchema);