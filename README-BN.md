# Supabase Contact Form (HTML + CSS + JavaScript)

এই প্রজেক্টটি আপনার Supabase Project-এ সংযুক্ত করার জন্য কনফিগার করা আছে।

## ফাইল
- `index.html` — Form markup
- `style.css` — Responsive design
- `app.js` — Supabase submit logic
- `config.js` — Project URL ও publishable key
- `supabase-setup.sql` — Database + RLS setup

## চালানোর ধাপ
1. Supabase Dashboard → SQL Editor-এ `supabase-setup.sql` চালান (টেবিল আগে থাকলে, SQL-এর schema/policy অংশ সাবধানে পর্যালোচনা করুন)।
2. `config.js`-এ আপনার Project URL ও publishable key দিন। এতে ইতিমধ্যে আপনার সংযুক্ত Project-এর URL/key রাখা হয়েছে।
3. `index.html` Live Server দিয়ে খুলুন; অথবা একই ফাইলগুলো যেকোনো static hosting-এ deploy করুন।
4. Submit করে Supabase Dashboard → Table Editor → `contacts`-এ Row এসেছে কি না যাচাই করুন।

## নিরাপত্তা
- `publishable` key browser-এ ব্যবহারের জন্য; `service_role` বা secret key কখনো frontend-এ রাখবেন না।
- Public visitor-এর জন্য শুধু INSERT access দিন, SELECT access নয়।
- এটি basic honeypot ব্যবহার করে; production-এ server-side rate limiting এবং CAPTCHA বিবেচনা করুন।
