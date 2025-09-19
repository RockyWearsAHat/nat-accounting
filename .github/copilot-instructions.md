## Calendar & Scheduling API (2024 Update)

### ModernCalendar Component
- A reusable React component for displaying and scheduling appointments.
- Props:
	- `events`: CalendarEvent[] — events to display
	- `availableSlots`: { start: string, end: string }[] — available appointment slots
	- `onSlotSelect(start, end)`: callback when a user/admin selects a slot
	- `minTime`, `maxTime`, `slotDurationMinutes`, `timezone`: for customization
- Use for both admin and client scheduling interfaces.

### Scheduling API Endpoints
- `GET /api/calendar/available-slots?date=YYYY-MM-DD&duration=MINUTES`
	- Returns all available appointment slots for the given day and duration, ensuring no overlap with existing events.
	- **All calendar feeds set as 'blocking' in the database (see `CalendarConfigModel.busyCalendars`) must be included in the calculation for available timeslots.** This includes both iCloud and Google calendars, as configured in the unified admin interface.
	- The backend should aggregate busy intervals from all blocking calendars (using the merged events endpoint or direct fetch) and exclude any overlapping times from the available slots.
- (Planned) `POST /api/calendar/schedule`
	- Schedule a new appointment (admin only, checks for overlap and working hours)

### Usage
- Use the ModernCalendar component to display events and available slots.
- Use the available-slots endpoint to fetch open times for any day/duration.
- All scheduling logic is reusable and API-driven for future expansion.

### Organization
- All calendar logic is in `frontend/src/components/ModernCalendar.tsx` and `backend/src/routes/calendar.ts`.
- Types in `frontend/src/types/calendar.ts`.
- Unified calendar configuration (including which calendars are considered 'blocking') is stored in the database via `CalendarConfigModel` and managed in the admin interface. The backend must always use this config to determine which calendars to aggregate for busy/available slot calculations.

---
Website theme: Black and White, Modern, Minamilistic, Luxury looking

This is how I want my website layout to be: [LINK]https://www.sagiagency.com/clutch/?utm_source=clutch.co&utm_medium=referral&utm_campaign=featured-listing-consulting-us

There should be
Free consultation:

Requiring:
Name
Email
Phone
Company
Website if applicable

Intake questionnaire (checkboxes/inputs):
Duns Number
Number of Subsidiaries if services needed for
Revenue approx
If they want bookkeeping services approximately how many transactions per month
If they want reconciliations, how many accounts?
Do they need assistance doing a financial clean up?
Do they need assistance with accounting software implementation?
What are their goals?
Do you need assistance creating a website yes/no?

Create a zoom scheduler that sets up meetings for these requested consultations automatically within my working hours (specified within hoursOfOperation.json) cross referenced with my personal calender & already scheduled appointments for available time slots, send an email notification to mayrconsultingservices@gmail.com, schedule a block on my personal calendar, and preferably send a SMS message notification. If they want to reach me by phone I will create google voice eventually.

Pricing guidelines do not include on website. I must give this because it all depends on the company and the services they requested dependant on their size. This site will probably need an admin interface so I can view sensitive company information without the fear of it being leaked.

For me: Pricing Guidelines

Service
Small Business (Revenue < $2M)
Mid-Tier Business (Revenue $2M–$20M)
Bookkeeping (monthly)
$300 – $800
$800 – $1,500
Bank & Credit Reconciliations
$100 – $250 per account
$250 – $500 per account
Financial Statement Preparation (monthly/quarterly)
$250 – $600
$600 – $1,200
Accounting Software Implementation (QuickBooks/Xero)
$500 – $1,200 (one-time)
$1,200 – $2,500 (one-time)
Advisory / Strategic Financial Guidance
$75 – $125/hr
$125 – $175/hr
Accounts Receivable Outsourcing (AR)
$500 – $1,200/month
$1,200 – $2,500/month
Accounts Payable Outsourcing (AP)
$500 – $1,200/month
$1,200 – $2,500/month
Combined AR & AP Package
$900 – $2,000/month
$2,000 – $4,000/month
Cash Flow Forecasting / Budgeting
$300 – $600/month
$600 – $1,200/month
One-Time Financial Clean-Up (catch-up bookkeeping, backlogs, etc.)
$500 – $2,000 (scope-based)
$2,000 – $5,000 (scope-based)

Small Business (<$2M revenue): Usually fewer than 10 employees, lower invoice/payment volume (<100 monthly), and basic reporting needs.

Mid-Tier ($2M–$20M revenue): 10–100 employees, higher transaction volume (100–500+ invoices/month), more complex reporting, may need multi-entity or consolidated financials.

DEPENDING ON THE INFORMATION THE CLIENT ANSWERED GIVE ME AN ESTIMATE OF THE COST AND A BREAKOWN OF ALL SERVICES NECESSARY, IDEALLY IT'D BE NICE TO ALSO HAVE AN ADMIN INTERFACE TO VIEW ALL THIS INFORMATION.

How to Present on Your Website
Instead of only listing hourly/monthly rates, bundle services into tiered packages:
Starter (Small Business Focus): Basic bookkeeping + reconciliations + monthly financials (DON'T DISPLAY PRICE BUT DEPENDING ON SERVICES NEEDED ESTIMATE $750–$1,200/month).

Growth (Mid-Tier Focus): Full bookkeeping + AR/AP outsourcing + advisory check-in (AGAIN DO NOT DISPLAY THE PRICE BUT DEPENDING ON SERVICES NEEDED ESTIMATE BETWEEN $2,000–$3,500/month).

Premium (CFO Lite): Everything in Growth + forecasting + KPI dashboards + quarterly strategy sessions (ONCE AGAIN, THIS IS INTERNAL, DO NOT DISPLAY THE PRICES TO THE CUSTOMER THIS IS TO DRAW PEOPLE IN NOT CLOSE A DEAL, BUT FOR ADMINS ESTIMATE AROUND $3,500–$5,000+/month DEPENDING ON SERVICES).

Professionalize this site, make it clean, interesting, and very helpful to the end user and additionally me as the admin.


## Guidelines for All Code
Always prioritize addressing root causes of issues rather than quick fixes. Strive for clean, maintainable, and well-documented code that adheres to best practices. Do not half complete requests/responses, do not write comments to insert something later, you can note todos and things that need to be addressed, but always ensure that everything is done up to par is left half done or incomplete (e.g. //Paste rest of code here. "Here's my plan that aligns with exactly what you're asking, I don't need clarification, except to proceed" and then I say "proceed" or "yes" or "continue" and you go on a side tangent. "This will for sure fix it" when the actual BAD CODE is not addressed <- DO NOT DO THIS. Remember, my words first and foremost are the most important information for what I want. Remember that all bad code must be code first, meaning that there is always behavior that has been WRITTEN already if there are bugs or issues. Remember to complete requests). Ensure issues are addressed from their underlying cause -- not just symptoms, code must be well structured, maintainable, controllable with internal controls, and scalable.

This codebase is a modern web application using React, TypeScript, Vite for the frontend, and Express with TypeScript for the backend. It is structured as a monorepo with shared types and utilities ideally it should be built and ready to deploy on netlify. All code should be written in TypeScript and modern ES module syntax.

All components, styles, and API routes should be well written with DRY principles, in each request
search for appropriate places to reuse code, and enable refactoring and modularity. In a large codebase like this it is key to keep things clean and maintainable, as well as memorable and clear. It is easy to lose track of this so ensure that you are always on your A game when composing, planning, and writing. Always think about the future and how this code will be used and expanded upon.

Always answer every part of a request in full, I will guide you but use this document as your main guiding principles for how to complete requests, I will give you ideas but you must expand and elaborate upon them based upon the rules and relevant information in this document. Please keep this document updated as a documentation so reusable functions and components can be referenced in the future and items can easily be reused and are known about to be reused.

Styling should be minimal, clean, professional, sleek, stylish, modern, and MOST IMPORTANTLY, good to use. A bad design makes it hard for users to do anything on the site, they don't know where to look, what to click, and they often will leave before we can even propose anything. A good design makes it easy for users to do what they need to do, important and key information large and in a place they will look, good choices that allow them to know what they can click. This makes using the site much easier, they can acomplish their goal quickly and easily. Always think about the user experience and how to make it as smooth and seamless as possible.

Always plan your implementation with a clear todo list that addresses every aspect of my request, and then implement it in a clean and professional manner, you can ask for a reivew of the plan, but once a plan is in motion do not stop until the goal you understand is achieved. Always complete your entire todo list in full, do not leave anything out or a request half finished. Ensure that everything is done to the absolute best of your ability.