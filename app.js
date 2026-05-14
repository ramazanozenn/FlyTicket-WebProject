require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

// Models
const Flight = require('./models/Flights');
const Ticket = require('./models/Ticket');
const City = require('./models/City');
const Admin = require('./models/Admin');
const User = require('./models/User');

const app = express();

// --- E-POSTA AYARLARI ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    }
});

const sendETicket = (passengerEmail, ticketDetails) => {
    const mailOptions = {
        from: '"FlyTicket Support" <ramazanozzenn07@gmail.com>',
        to: passengerEmail,
        subject: 'Your E-Ticket Confirmation - ' + ticketDetails.pnr,
        html: `
            <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; max-width: 600px;">
                <h2 style="color: #007bff;">Reservation Successful!</h2>
                <p>Hello <strong>${ticketDetails.name}</strong>, your flight is confirmed.</p>
                <hr>
                <p><strong>Booking Code (PNR):</strong> ${ticketDetails.pnr}</p>
                <p><strong>Seat:</strong> ${ticketDetails.seat}</p>
                <p><strong>Route:</strong> ${ticketDetails.route}</p>
                <br>
                <p>Thank you for choosing FlyTicket. Have a safe flight!</p>
            </div>
        `
    };
    return transporter.sendMail(mailOptions);
};

const generatePNR = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Database Connection
mongoose.connect('mongodb://127.0.0.1:27017/flyticket_db')
    .then(() => console.log('✅ MongoDB Connection Successful'))
    .catch(err => console.error('❌ Connection Error:', err));

// Settings and Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'flyticket_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.isAdmin = req.session.isAdmin || false;
    next();
});

// --- AUTH ROUTES ---

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    try {
        const { name, surname, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, surname, email, password: hashedPassword });
        await newUser.save();
        res.redirect('/login');
    } catch (err) {
        res.status(500).send("Kayıt hatası.");
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = user;
        res.redirect('/');
    } else {
        res.send("Hatalı e-posta veya şifre!");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// --- USER ROUTES ---

app.get('/', async (req, res) => {
    try {
        const { origin, destination, date } = req.query; // date eklendi

        // Geçmiş uçuşları göstermeme kuralı
        let query = { departure_time: { $gte: new Date() } };

        if (origin) query.from_city = { $regex: origin, $options: 'i' };
        if (destination) query.to_city = { $regex: destination, $options: 'i' };

        // TARİH FİLTRESİ (PDF Kuralı)
        if (date) {
            const searchDate = new Date(date);
            const nextDay = new Date(searchDate);
            nextDay.setDate(nextDay.getDate() + 1); // Seçilen günün sonu

            // Hem bugünden büyük olmalı hem de seçilen günün içinde olmalı
            query.departure_time = {
                $gte: searchDate > new Date() ? searchDate : new Date(),
                $lt: nextDay
            };
        }

        const flights = await Flight.find(query).sort({ departure_time: 1 });

        res.render('index', {
            flights,
            now: new Date(),
            origin: origin || '',
            destination: destination || '',
            date: date || ''
        });
    } catch (err) {
        console.error("❌ Flight Search Error:", err);
        res.status(500).send("Error fetching flights.");
    }
});

app.get('/book/:id', async (req, res) => {
    try {
        const flight = await Flight.findById(req.params.id);
        res.render('book_ticket', { flight });
    } catch (err) {
        res.status(404).send("Flight not found.");
    }
});

app.post('/book/:id', async (req, res) => {
    try {
        const flightId = req.params.id;
        const email = req.body.passenger_email.trim().toLowerCase();

        // --- 1. MÜKERRER KAYIT KONTROLÜ ---
        const checkExisting = await Ticket.findOne({
            flight: flightId,
            passenger_email: email
        }).lean();

        if (checkExisting) {
            console.log("⚠️ Blocked: Duplicate booking attempt!");
            return res.send(`
                <script>
                    alert('ERROR: You already have a ticket for this flight! (PNR: ${checkExisting.pnr})');
                    window.location.href = '/';
                </script>
            `);
        }

        // --- 2. UÇUŞ VE KAPASİTE KONTROLÜ ---
        const flight = await Flight.findById(flightId);
        if (!flight || flight.seats_available <= 0) {
            return res.send(`
                <script>
                    alert('ERROR: Sorry, no seats available for this flight.');
                    window.location.href = '/';
                </script>
            `);
        }

        // --- 3. BİLET OLUŞTURMA SÜRECİ ---
        // --- 3. BİLET OLUŞTURMA SÜRECİ (Eşsiz PNR ve Koltuk Kontrolü) ---
        let pnrCode, seatNumber;
        let isUnique = false;
        const seatLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

        // Rastgele üretilen değerler veritabanında var mı diye kontrol eden Mükemmel Mantık
        while (!isUnique) {
            pnrCode = generatePNR();
            seatNumber = `${Math.floor(Math.random() * 30) + 1}${seatLetters[Math.floor(Math.random() * seatLetters.length)]}`;

            const conflict = await Ticket.findOne({
                $or: [
                    { pnr: pnrCode }, // PNR dünyada tek mi?
                    { flight: flightId, seat_number: seatNumber } // Bu uçuşta bu koltuk boş mu?
                ]
            });

            if (!conflict) {
                isUnique = true; // Çakışma yoksa döngüden çık
            }
        }

        const newTicket = new Ticket({
            passenger_name: req.body.passenger_name.trim(),
            passenger_surname: req.body.passenger_surname.trim(),
            passenger_email: email,
            flight: flightId,
            seat_number: seatNumber,
            pnr: pnrCode
        });
        // (Buradan sonrası senin kodunla aynı, await newTicket.save(); vs...)

        // Bilet veritabanına kaydediliyor
        await newTicket.save();

        // Uçak kapasitesi güncelleniyor
        flight.seats_available -= 1;
        await flight.save();

        // --- 4. E-TICKET GÖNDERİMİ (KRİTİK EKSİK) ---
        // try-catch içinde yapıyoruz ki mail gitmezse bile kullanıcı success sayfasını görebilsin
        try {
            await sendETicket(email, {
                name: req.body.passenger_name.trim() + " " + req.body.passenger_surname.trim(),
                pnr: pnrCode,
                seat: seatNumber,
                route: `${flight.from_city} ➔ ${flight.to_city}`
            });
            console.log(`📧 Success: E-ticket sent to ${email}`);
        } catch (mailErr) {
            console.error("❌ Mail Error: System could not send the email.", mailErr);
            // Not: Kullanıcıya burada hata göstermiyoruz, sadece terminale log düşüyoruz.
        }

        // --- 5. BAŞARI SAYFASI (CONFIRMATION PAGE) ---
        res.render('success', {
            ticket: newTicket,
            flight: flight,
            seat: seatNumber,
            pnr: pnrCode
        });

    } catch (err) {
        console.error("❌ Booking Error:", err);
        res.status(500).send("An error occurred during the booking process.");
    }
});


app.get('/my-tickets', async (req, res) => {
    // Kullanıcı giriş yapmamışsa login sayfasına yönlendir
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        // Oturumdaki kullanıcının e-posta adresiyle biletleri bul
        // .populate('flight') ile uçuş bilgilerini (nereden, nereye, saat kaçta) çekiyoruz
        const myTickets = await Ticket.find({
            passenger_email: req.session.user.email
        }).populate('flight');

        res.render('my_tickets', { tickets: myTickets });
    } catch (err) {
        console.error("❌ Fetch Tickets Error:", err);
        res.status(500).send("An error occurred while fetching your tickets.");
    }
});
// --- ADMIN ROUTES ---

app.get('/admin/login', (req, res) => res.render('admin_login'));

app.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Önce kullanıcı adına göre admini buluyoruz
        const admin = await Admin.findOne({ username });

        // Eğer admin varsa ve girilen şifre veritabanındaki hash ile eşleşiyorsa
        if (admin && await bcrypt.compare(password, admin.password)) {
            req.session.isAdmin = true;
            res.redirect('/admin/dashboard');
        } else {
            // Güvenlik için hatayı genel bir mesajla veriyoruz
            res.send("<script>alert('Invalid username or password!'); window.history.back();</script>");
        }
    } catch (err) {
        console.error("❌ Admin Login Error:", err);
        res.status(500).send("An error occurred during login.");
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin/login');
    const flights = await Flight.find();
    const cities = await City.find().sort({ city_name: 1 });
    const tickets = await Ticket.find().populate('flight');
    res.render('admin_dashboard', { flights, cities, tickets });
});

app.get('/admin/flights/edit/:id', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin/login');
    try {
        const flight = await Flight.findById(req.params.id);
        const cities = await City.find().sort({ city_name: 1 });

        // --- TIMEZONE DÜZELTMESİ (Türkiye UTC+3) ---
        // Tarihi datetime-local inputunun anlayacağı formata (YYYY-MM-DDThh:mm) çeviriyoruz
        const formatForInput = (dateObj) => {
            // Tarihe 3 saat (milisaniye cinsinden) ekle
            const localTime = new Date(dateObj.getTime() + (3 * 60 * 60 * 1000));
            // ISO formatına çevir ve saniye kısmını at (sadece YYYY-MM-DDThh:mm kalsın)
            return localTime.toISOString().slice(0, 16);
        };

        const depFormatted = formatForInput(flight.departure_time);
        const arrFormatted = formatForInput(flight.arrival_time);

        // Formatted tarihleri de EJS dosyasına gönderiyoruz
        res.render('admin_edit_flight', {
            flight,
            cities,
            depFormatted,
            arrFormatted
        });

    } catch (err) {
        console.error(err);
        res.redirect('/admin/dashboard');
    }
});

app.post('/admin/flights/update/:id', async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).send("Unauthorized!");

    try {
        const flightId = req.params.id;
        const { from_city, to_city, departure_time, arrival_time, price, seats_total } = req.body;

        if (!departure_time || !arrival_time) {
            return res.send("<script>alert('Please select both departure and arrival times!'); window.history.back();</script>");
        }

        const depDate = new Date(departure_time);
        const arrDate = new Date(arrival_time);
        const now = new Date();

        if (from_city === to_city) {
            return res.send("<script>alert('ERROR: Origin and Destination cannot be the same city!'); window.history.back();</script>");
        }

        if (depDate < now) {
            return res.send("<script>alert('ERROR: You cannot schedule a flight in the past!'); window.history.back();</script>");
        }

        // --- ÖZEL KURAL 1: ÇAKIŞMA (Kendisi Hariç!) ---
        const depConflict = await Flight.findOne({
            _id: { $ne: flightId }, // Mevcut uçuşu dışla
            from_city: from_city,
            departure_time: depDate
        });
        if (depConflict) {
            return res.send(`<script>alert('ERROR: Another flight already departs from ${from_city} at this exact time!'); window.history.back();</script>`);
        }

        // --- ÖZEL KURAL 2: ÇAKIŞMA (Kendisi Hariç!) ---
        const arrConflict = await Flight.findOne({
            _id: { $ne: flightId }, // Mevcut uçuşu dışla
            to_city: to_city,
            arrival_time: arrDate
        });
        if (arrConflict) {
            return res.send(`<script>alert('ERROR: Another flight already arrives in ${to_city} at this exact time!'); window.history.back();</script>`);
        }

        const durationMinutes = Math.floor((arrDate.getTime() - depDate.getTime()) / (1000 * 60));
        if (durationMinutes < 30) {
            return res.send(`<script>alert('ERROR: Flight duration must be at least 30 minutes!'); window.history.back();</script>`);
        }

        // --- YENİ KURAL: MAKSİMUM UÇUŞ SÜRESİ KONTROLÜ (Maksimum 4 saat / 240 dakika) ---
        if (durationMinutes > 240) {
            return res.send(`
                <script>alert('ERROR: Domestic flights in Türkiye cannot exceed 4 hours (240 mins)! Currently: ${durationMinutes} min.'); window.history.back();</script>
            `);
        }

        if (Number(price) <= 0 || Number(seats_total) <= 0) {
            return res.send(`<script>alert('ERROR: Price and Seat Capacity must be positive numbers!'); window.history.back();</script>`);
        }

        // --- KOLTUK MANTIĞI: Satılmış biletlerin altına düşemez ---
        const currentFlight = await Flight.findById(flightId);
        const seatDiff = Number(seats_total) - currentFlight.seats_total;
        const newSeatsAvailable = currentFlight.seats_available + seatDiff;

        if (newSeatsAvailable < 0) {
            return res.send(`<script>alert('ERROR: Cannot reduce total capacity! There are already booked tickets exceeding this new capacity.'); window.history.back();</script>`);
        }

        // GÜVENLİ GÜNCELLEME İŞLEMİ
        await Flight.findByIdAndUpdate(flightId, {
            from_city,
            to_city,
            departure_time: depDate,
            arrival_time: arrDate,
            price: Number(price),
            seats_total: Number(seats_total),
            seats_available: newSeatsAvailable
        });

        console.log(`✅ Flight ${flightId} updated securely!`);
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error("❌ Admin Flight Update Error:", err);
        res.status(500).send("Update failed due to server error.");
    }
});

app.post('/admin/flights', async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).send("Unauthorized!");

    try {
        const { from_city, to_city, departure_time, arrival_time, price, seats_total } = req.body;

        // 1. VERİ VARLIK KONTROLÜ
        if (!departure_time || !arrival_time) {
            return res.send("<script>alert('Please select both departure and arrival times!'); window.history.back();</script>");
        }

        // ÖNCE DEĞİŞKENLERİ TANIMLIYORUZ
        const depDate = new Date(departure_time);
        const arrDate = new Date(arrival_time);
        const now = new Date(); // Şu anki zamanı alıyoruz

        // 2. MANTIKSAL KONTROLLER

        // Şehirler aynı olamaz
        if (from_city === to_city) {
            return res.send("<script>alert('ERROR: Origin and Destination cannot be the same city!'); window.history.back();</script>");
        }

        // GEÇMİŞ ZAMAN KONTROLÜ (Değişken tanımlandıktan sonra yapıyoruz)
        if (depDate < now) {
            return res.send("<script>alert('ERROR: You cannot schedule a flight in the past!'); window.history.back();</script>");
        }

        // --- ÖZEL KURAL 1: AYNI ŞEHİRDEN AYNI SAATTE KALKIŞ YASAĞI ---
        const depConflict = await Flight.findOne({
            from_city: from_city,
            departure_time: depDate
        });
        if (depConflict) {
            return res.send(`
                <script>alert('ERROR: Another flight already departs from ${from_city} at this exact time!'); window.history.back();</script>
            `);
        }

        // --- ÖZEL KURAL 2: AYNI ŞEHRE AYNI SAATTE İNİŞ YASAĞI ---
        const arrConflict = await Flight.findOne({
            to_city: to_city,
            arrival_time: arrDate
        });
        if (arrConflict) {
            return res.send(`
                <script>alert('ERROR: Another flight already arrives in ${to_city} at this exact time!'); window.history.back();</script>
            `);
        }

        // --- 3. ZAMAN ARALIĞI KONTROLÜ (Minimum 30 dk) ---
        const durationMinutes = Math.floor((arrDate.getTime() - depDate.getTime()) / (1000 * 60));
        if (durationMinutes < 30) {
            return res.send(`
                <script>alert('ERROR: Flight duration must be at least 30 minutes! Currently: ${durationMinutes} min.'); window.history.back();</script>
            `);
        }

        // --- YENİ KURAL: MAKSİMUM UÇUŞ SÜRESİ KONTROLÜ (Maksimum 4 saat / 240 dakika) ---
        if (durationMinutes > 240) {
            return res.send(`
                <script>alert('ERROR: Domestic flights in Türkiye cannot exceed 4 hours (240 mins)! Currently: ${durationMinutes} min.'); window.history.back();</script>
            `);
        }

        // --- 4. FİYAT VE KOLTUK KONTROLÜ ---
        if (Number(price) <= 0 || Number(seats_total) <= 0) {
            return res.send(`
                <script>alert('ERROR: Price and Seat Capacity must be greater than zero!'); window.history.back();</script>
            `);
        }

        // --- 5. KAYIT İŞLEMİ ---
        const newFlight = new Flight({
            from_city,
            to_city,
            departure_time: depDate,
            arrival_time: arrDate,
            price: Number(price),
            seats_total: Number(seats_total),
            seats_available: Number(seats_total)
        });

        await newFlight.save();
        console.log("✅ Flight added with all rules validated!");
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error("❌ Admin Flight Error:", err);
        res.status(500).send("Internal Server Error: " + err.message);
    }
});

app.post('/admin/flights/delete/:id', async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).send("Unauthorized!");

    try {
        const flightId = req.params.id;

        // --- MANTIKSAL KONTROL: Satılmış bilet var mı? ---
        const ticketCount = await Ticket.countDocuments({ flight: flightId });

        if (ticketCount > 0) {
            // Eğer bilet varsa uçuşun silinmesini engelliyoruz
            return res.send(`
                <script>
                    alert('ERROR: Cannot delete this flight! There are ${ticketCount} booked tickets for this flight. Please cancel the tickets first.');
                    window.location.href = '/admin/dashboard';
                </script>
            `);
        }

        // Eğer bilet yoksa güvenle silebiliriz
        await Flight.findByIdAndDelete(flightId);
        console.log("✅ Flight deleted successfully (No tickets were found).");
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error("❌ Flight Deletion Error:", err);
        res.status(500).send("An error occurred while trying to delete the flight.");
    }
});


const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));