# Dost: a health friend for elderly parents, on WhatsApp

**Send a photo. Get one checked list.**

Dost helps families look after an elderly parent from another city. The parent uses only WhatsApp: no app, no OTP, nothing to install. The family member (the "child") sees everything in a simple web app.

> Dost organises information and reminders. It does not give medical advice.

## The problem (from conversations with families)

| What we heard | Evidence |
|---|---|
| Elders forget or mix up medicines | One parent took the same tablet twice |
| They can't read prescription slips or lab reports | The chemist reads the handwriting for them |
| Phones and apps are hard | 5 of 7 fear making a costly mistake |
| Phone reminders don't stick, meal routines do | 0 of 7 use phone reminders; meal-time habits work |
| The child worries and is willing to pay | To test at ₹299/month |

## How it works

1. **Child sets up** one parent: name, WhatsApp number, language, meal times. One question per screen.
2. **Parent sends a photo** of a prescription or lab report on WhatsApp and gets *"I'm reading it now"* straight away.
3. **Claude reads it**, including handwritten Indian prescriptions with shorthand like `1-0-1`, `BD`, `HS`, "after food", and turns it into **one list by meal**. Duplicates are flagged, and unclear items are marked **"Please check"**.
4. **Child approves** every item. Nothing is reminded until it's approved.
5. **Meal reminders** go out on WhatsApp as one image showing that meal's medicines (photo of the tablet and where it's kept) with the list as the caption. The parent replies **1 Taken · 2 Later · 3 My list**.
6. **Child's app** shows each dose (taken, pending or missed), 7-day adherence, alerts, and **Reports**: each test shown as High / Low / In range against the range printed on the report, with its trend over time.

**Languages:** English and Malayalam text. Replies mirror the parent's language. Malayalam voice notes work both ways (Sarvam AI): a voice note in is transcribed and handled like text, and the reply comes back as one voice note. In `/demo`, tap 🎤 to record from the browser mic.

## Guardrails

- **Never diagnoses, never changes a dose, never says to stop or start a medicine.** Medical questions get "please ask your doctor", and the child is alerted.
- **Double-dose protection in code:** if a dose is already marked taken, Dost says "You already took it at 9:05, please don't take another" and alerts the child.
- **Emergency words** (chest pain, fell, can't breathe…, in English and Malayalam): "Please call 112 / 108 now, or call your child", plus an urgent alert.
- **Human in the loop:** every medicine read from a photo stays pending until the child approves it.
- **Lab results** are compared only with the range printed on the report, and flagged as "worth asking your doctor".
- **Prompt-injection safe:** text inside photos or messages is treated as data, never as instructions.

## Try it

- **`/demo`** (the default page at `/`): split screen with a WhatsApp-style chat (the parent) next to the child's app. Numbered quick-demo chips replay `public/samples/demo_script.json` (prescription, approve, reminder, double-dose, duplicate, lab report, medical question, emergency). Runs in dry mode: nothing is sent to WhatsApp.
- **`/app`:** the child's app (Home, Medicines, Reports, Timeline, Settings).
- **`/setup`:** first-time setup.
- **WhatsApp:** point the Twilio sandbox webhook at `<public URL>/whatsapp` and set `SEND_MODE=live`.

## Built with

- **Claude Code** (built on the day) and the **Claude API** (`claude-sonnet-5-5`) for reading prescriptions and lab reports, understanding replies, and writing flags
- **Twilio WhatsApp Sandbox** for WhatsApp messaging
- **Sarvam AI** for Malayalam speech-to-text (saaras:v4) and text-to-speech (bulbul:v3)
- Node.js, Express, SQLite (better-sqlite3), Tailwind, inline SVG charts, sharp (reminder collages), node-cron, ffmpeg-static
- Cloudflare Tunnel for the public demo link

## What's mocked

- **"Continue with Google"** just continues; there's no real login (the buildathon asked for no login on demos).
- **Time:** "Simulate time" fires a meal reminder immediately, and "+30 min" jumps ahead (Later → re-remind, 60 min unanswered → missed).
- **The chat in `/demo` is simulated:** it runs the exact same handler as the real WhatsApp webhook, in dry mode. Twilio's free trial only allows pre-approved template messages to start conversations, so the stage demo doesn't depend on it. Live WhatsApp works through the sandbox (`SEND_MODE=live`).
- **WhatsApp number:** the Twilio sandbox number; production needs an approved WhatsApp Business number.
- **Tablet pictures:** generated SVG tablets (shape × colour) chosen by the family, or their own photo. No brand images are scraped.
- **Sample data:** Amma's history is seeded for the demo.
- **Phone calls** for missed doses aren't built yet.
- **Doctor-visit reminders** aren't built yet. The next visit is shown on the dashboard only.

## Next

doctor-visit reminders with "questions to ask" · real Google login · more languages (Hindi, Tamil, Kannada) · call escalation for missed doses · weekly family summary · more than one parent.

## Run locally

```bash
npm install
cp .env.example .env   # fill in keys
npm start              # http://localhost:3000
```
