# Swarnkar Garba Mahotsav 2026 - PAAS Booking and QR Scanner

This project is a minimal Node.js + Express app to handle PAAS ticket bookings, QR generation, admin verification, and gate scanning.

Features:
- Booking form: name, mobile, UTR, upload payment screenshot
- Admin panel (password: ADMIN) to review bookings, approve (activate) QR, disable, delete, and create quick gate passes
- Gate scanner endpoint protected by scanner password 'admin' to consume up to 4 entries per QR
- QR generation and ticket download
- Retrieve ticket by UTR

How to run:
1. Install dependencies: npm install
2. Start: npm start
3. Open http://localhost:3000/
4. Admin panel: http://localhost:3000/admin.html (password: ADMIN)

Notes:
- This is a simple implementation for local or server deployment. For production you should add proper authentication, sanitization, HTTPS, scalability and backup.
- Mobile-friendly front-end is included in public/.
- UPI payment verification is manual: admin must check screenshot and approve.

Contact/Support:
- Phone/UPI: 8385963066 (Deepak Soni)
- Venue: Moti Chowk, Jodhpur
