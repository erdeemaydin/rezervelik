# Mocked Features & Required API Implementations

This document details the features that currently rely on mock data, placeholder UI, or `console.log` intercepts in the backend. It outlines the necessary API endpoints, webhooks, and third-party integrations required to bring these features to production.

---

## 1. Payments & Transactions
**Status:** UI Implemented (`/dashboard/payments`). Backend currently mocked.
**Goal:** Integrate a Turkish payment provider (PayTR) to process reservation deposits and capture transaction logs for the tenant dashboard.

### Required APIs to Implement:
*   `POST /api/payments/init`
    *   **Payload:** `{ reservationId: UUID, amount: number, currency: string }`
    *   **Action:** Calls the PayTR API to generate an iframe token for the checkout page.
    *   **Response:** `{ token: string, iframeUrl: string }`
*   `POST /api/webhooks/paytr`
    *   **Payload:** PayTR webhook payload (`status`, `merchant_oid`, `total_amount`, `hash`).
    *   **Action:** Validates the cryptographic hash using the `MERCHANT_KEY`. If successful, updates the `Reservation` status to `isPaid: true` and creates a `Transaction` record in the database.
*   `GET /api/transactions`
    *   **Action:** Fetches the list of completed, pending, and failed transactions for the tenant to display in the UI.

---

## 2. Reviews & AI Auto-Reply
**Status:** UI Implemented (`/dashboard/reviews`). Backend currently mocked.
**Goal:** Pull real reviews from Google Business Profile and provide an interface to auto-generate AI replies or manually respond.

### Required APIs to Implement:
*   `GET /api/reviews`
    *   **Action:** Fetches cached reviews from the database (synced via Google API).
*   `POST /api/reviews/sync`
    *   **Action:** Triggers a background job to pull the latest reviews from the Google Business Profile API.
*   `POST /api/reviews/:id/reply`
    *   **Payload:** `{ replyText: string }`
    *   **Action:** Posts the reply to the review via the Google Business Profile API.
*   `POST /api/reviews/:id/ai-draft`
    *   **Action:** Sends the review text to an LLM (e.g., OpenAI, Claude) with a prompt to generate a polite, context-aware reply draft. Returns the draft text.

---

## 3. SMS & WhatsApp Notifications
**Status:** Backend `console.log` placeholder implemented (`waitTimeController.ts`). UI implemented.
**Goal:** Send real SMS messages to guests for waitlist updates ("10 minutes until your table is ready") and reservation reminders (No-show prevention).

### Required APIs to Implement:
*   `POST /api/notifications/send` (Internal/Service layer)
    *   **Payload:** `{ phone: string, message: string }`
    *   **Action:** Integrates with an SMS provider (e.g., Twilio, MessageBird, or a local Turkish provider like Netgsm) to dispatch the message.
*   **Waitlist Hook Integration:** Update the `updateWaitlistStatus` controller to actually call this service when a waitlist entry status changes to `NOTIFIED`.
*   **Reservation Reminder Cron Job:** Implement a background worker (e.g., using `node-cron` or BullMQ) that runs hourly to find reservations happening in 24 hours and triggers the SMS service.
