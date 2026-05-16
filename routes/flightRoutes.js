const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');
const Ticket = require('../models/Ticket'); // Required for creating tickets after payment

// Home Page - List All Flights
router.get('/', async (req, res) => {
    try {
        const flights = await Flight.find(); // Fetch all flights from database
        res.render('index', { flights, now: new Date() });
    } catch (err) {
        res.status(500).send("Database Error!");
    }
});

// Booking Page - Display the booking form for a specific flight
router.get('/book/:id', async (req, res) => {
    try {
        const flight = await Flight.findById(req.params.id);
        if (!flight) {
            return res.status(404).send("Flight not found!");
        }
        res.render('book_ticket', { flight, user: req.session.user || null });
    } catch (err) {
        res.status(500).send("Server Error!");
    }
});

// Process Booking & Secure Payment Validation
router.post('/book/:id', async (req, res) => {
    try {
        const flight = await Flight.findById(req.params.id);
        if (!flight) {
            return res.status(404).send("Flight not found!");
        }

        const { 
            passenger_name, 
            passenger_surname, 
            passenger_email, 
            cabin_class,
            card_holder_name,
            card_number,
            expiry_date,
            cvc 
        } = req.body;

        // 1. Validate Cardholder Name (Letters and spaces only)
        const nameRegex = /^[A-Za-z ]+$/;
        if (!nameRegex.test(card_holder_name)) {
            return res.status(400).send("Validation Error: Cardholder name must contain letters only.");
        }

        // 2. Validate Card Number (Exactly 16 digits)
        const cardRegex = /^[0-9]{16}$/;
        if (!cardRegex.test(card_number)) {
            return res.status(400).send("Validation Error: Invalid card number. It must be exactly 16 digits.");
        }

        // 3. Validate CVC (Exactly 3 digits)
        const cvcRegex = /^[0-9]{3}$/;
        if (!cvcRegex.test(cvc)) {
            return res.status(400).send("Validation Error: Invalid CVC. It must be exactly 3 digits.");
        }

        // Calculate final price based on cabin class selection
        let finalPrice = flight.price;
        if (cabin_class === 'Business') finalPrice += 500;
        else if (cabin_class === 'First') finalPrice += 1200;

        // Generate a random 6-character PNR code for the ticket
        const pnr = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create and save the new ticket into the database
        const newTicket = new Ticket({
            flight_id: flight._id,
            passenger_name,
            passenger_surname,
            passenger_email,
            cabin_class,
            pnr,
            price: finalPrice,
            booking_date: new Date()
        });

        await newTicket.save();

        // Redirect to success page with the newly created ticket ID
        res.redirect(`/booking-success/${newTicket._id}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred while processing your booking.");
    }
});

// Booking Success Page
router.get('/booking-success/:ticketId', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.ticketId).populate('flight_id');
        if (!ticket) {
            return res.status(404).send("Ticket record not found!");
        }
        res.render('success', { ticket });
    } catch (err) {
        res.status(500).send("Server Error!");
    }
});

module.exports = router;