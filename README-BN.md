# Supabase Contact Form (HTML + CSS + JavaScript)

এই প্রজেক্টটি Supabase-এর `contacts` টেবিলে contact message সংরক্ষণ করে এবং Resend-এর মাধ্যমে ব্যবহারকারীকে automatic confirmation email পাঠাতে পারে।

## ফাইল
- `index.html` — Form markup
- `style.css` — Responsive design
- `app.js` — Contact form submit logic
- `config.js` — Supabase Project URL ও publishable key
- `supabase/functions/contact-auto-reply/index.ts` — Server-side contact insert ও email reply
- `supabase/migrations/202611080001_contact_auto_reply_rate_limit.sql` — Submission rate-limit database setup
- `supabase/functions/razorpay-test/index.ts` — Existing Razorpay test-only checkout

## চালানোর ধাপ

1. আপনার Supabase project-এ আগে থেকেই `contacts` টেবিল ও প্রয়োজনীয় columns (`name`, `email`, `phone`, `subject`, `message`) থাকতে হবে।
2. Supabase Dashboard → SQL Editor-এ `supabase/migrations/202611080001_contact_auto_reply_rate_limit.sql` চালান।
3. Supabase Edge Function `contact-auto-reply` deploy করুন:
   ```sh
   supabase functions deploy contact-auto-reply
   ```
4. Supabase → Edge Functions → Secrets-এ নিচের server-side secrets যোগ করুন:
   - `SUPABASE_URL` — আপনার project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — project service-role secret; শুধু Edge Function secret-এ রাখবেন
   - `RESEND_API_KEY` — Resend API key
   - `AUTO_REPLY_FROM` — Resend-এ verify করা sender, যেমন `Contact Team <hello@your-domain.com>`
5. Resend account-এ sender domain verify করুন এবং email sending সক্রিয় করুন।
6. `config.js`-এ Supabase Project URL ও publishable key দিন। Browser-এ publishable key ব্যবহার করা যায়; service-role key কখনো frontend-এ রাখবেন না।
7. `index.html` Live Server বা static hosting-এ চালান। Function-এর allowed origin বর্তমানে `https://halderrupam844-gif.github.io`; অন্য domain হলে Edge Function-এর `allowedOrigin` পরিবর্তন করে redeploy করুন।

## Auto Reply কীভাবে কাজ করে
- Contact form Edge Function-এ submit হয়; server-side validation ও honeypot check হয়।
- Function Supabase-এর `contacts` table-এ message সংরক্ষণ করে।
- সফল insert-এর পর Resend দিয়ে sender-কে confirmation email পাঠানোর চেষ্টা করে।
- Email provider ব্যর্থ হলেও saved contact হারায় না; UI জানায় যে confirmation email পাঠানো যায়নি।
- একই network/IP hash থেকে প্রতি rolling hour-এ সর্বোচ্চ ৫টি submission অনুমোদিত হয়। এটি অতিরিক্ত spam protection-এর বিকল্প নয়; production-এ CAPTCHA/monitoring-ও বিবেচনা করুন।

## নিরাপত্তা ও নোট
- `SUPABASE_SERVICE_ROLE_KEY` এবং `RESEND_API_KEY` কেবল Supabase Edge Function secrets-এ রাখুন।
- Public visitor-কে contacts table-এ সরাসরি SELECT access দেবেন না।
- Rate-limit migration deploy না করলে Edge Function submission প্রত্যাখ্যান করবে।
- এই Auto Reply একটি confirmation email; এটি inbox-এ reply handling বা support ticket তৈরি করে না।
- Razorpay integration আগের মতোই test mode only; এই feature সেটি পরিবর্তন করে না।
