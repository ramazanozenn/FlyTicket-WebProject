# ✈️ FlyTicket - Full Stack Flight Booking System

FlyTicket is a comprehensive web application developed for the **CENG 3502: Dynamic Web Programming** final project. It provides a complete solution for an airline company, allowing customers to search and book flights while giving admins full control over flight management.

## 🚀 Key Features

### User Side (Customer)
* **Flight Search:** Users can filter available flights by origin, destination, and date using an integrated date picker.
* **Booking System:** Complete ticket purchase flow by entering passenger details.
* **Seat Selection:** Optional seat selection during the booking process (Bonus Feature).
* **Booking Confirmation:** A dedicated success page displaying PNR, seat number, and flight details.
* **E-Ticket Download:** Users can print or download their reservation as a PDF/E-Ticket directly from the confirmation page.
* **Email Notifications:** Automatic e-ticket confirmation sent via SMTP (Bonus Feature).

### Admin Side (Admin Panel)
* **Secure Authentication:** Login-protected dashboard for flight operations.
* **Flight Management:** Full CRUD (Create, Read, Update, Delete) capabilities for flight scheduling.
* **Booking Oversight:** Ability to view all ticket bookings made through the system.

---

## 🛠️ Technologies Used

* **Frontend:** EJS (Embedded JavaScript), Bootstrap 5, FontAwesome, CSS3.
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB & Mongoose.
* **Authentication:** Bcrypt (Hashing) & Express-Session.
* **Other:** Nodemailer for automated emails.

---

## ⚙️ How to Run the Project

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ramazanozenn/FlyTicket-WebProject.git
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:** Create a `.env` file in the root directory and add your MongoDB URI and Email credentials.

4. **Database Initialization:**
   * Ensure MongoDB is running locally.
   * Import JSON files from the `db_backup` folder for initial data (81 Cities and sample flights).

5. **Start the server:**
   ```bash
   node app.js
   ```

6. **Access:** Open `http://localhost:3000` in your browser.

---

## 🔐 Admin Login Credentials

To access the Admin Dashboard (`/admin/login`):
* **Username:** admin
* **Password:** 3003

---

## 📂 Project Structure & Rules
* **Database Models:** Includes City (81 cities), Flight, Ticket, and Admin schemas.
* **Flight Rules:** Backend validation ensures no two flights depart from or arrive at the same city at the same hour.

**Developed by Ramazan Özen** *Computer Engineering Student at Muğla Sıtkı Koçman University*