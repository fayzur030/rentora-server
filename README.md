# rentora-server

## Stripe payments

Configure these environment variables before starting the server:

- `MONGO_CLIENT_URI`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CLIENT_URL` (defaults to `http://localhost:3000`)

The renter-facing client should call `POST /api/bookings/create-checkout-session`
with the booking details, then navigate to the returned `data.redirectUrl`.
Stripe redirects successful payments to `/booking/success` and cancellations to
`/booking/cancel` on `CLIENT_URL`.

Configure Stripe to send `checkout.session.completed` and
`checkout.session.async_payment_succeeded` events to
`/api/webhooks/stripe`. The signed webhook creates the confirmed booking and an
idempotent transaction record in the `payments` collection.
