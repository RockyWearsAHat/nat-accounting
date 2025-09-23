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

## NOTE FOR EVERY EDIT
Make sure to keep this copilot-instructions.md file updated with any new reusable components, functions, or utilities you create. This will help maintain a comprehensive reference for future development and ensure consistency across the codebase. Always document the purpose, props, and usage of new components or functions clearly in this file. Continue to refine, consolidate and expand this document as is necessary as the project evolves, ensuring it remains a valuable resource for anyone working on the codebase.

When making edits or additions, consider how they fit into the overall architecture and design principles outlined in this document. Ensure that new code adheres to the established guidelines for maintainability, scalability, and user experience.

## Publishing Environment
This site will be deployed on netlify, this means 4096 characters of build environment variables, and a serverless environment, no shared values between requests, and no persistent storage except externally (in databases or locally or whatever). Ensure that the build is optimized and efficient to meet these constraints. Which leads me to the...

## Guidelines for ALL Code
Always prioritize writing proper, idiomatic, compilable & buildable code. When issues do arise, ensure you are addressing root causes of issues. Strive for clean, maintainable, and well-documented code that adheres to best practices. Do not half complete requests/responses, do not write comments to insert something later, you can note todos and things that need to be addressed, but always ensure that everything is done up to par is left half done or incomplete (e.g. //Paste rest of code here. "Here's my plan that aligns with exactly what you're asking, I don't need clarification, except to proceed" and then I say "proceed" or "yes" or "continue" and you go on a side tangent. "This will for sure fix it" when the actual BAD CODE is not addressed <- DO NOT DO THIS. Remember, my words first and foremost are the most important information for what I want. Remember that all bad code must be code first, meaning that there is always behavior that has been WRITTEN already if there are bugs or issues. Remember to complete requests). Ensure issues are addressed from their underlying cause -- not just symptoms, code must be well structured, maintainable, controllable with internal controls, and scalable.

This codebase is a modern web application using React, TypeScript, Vite for the frontend, and Express with TypeScript for the backend. It is structured as a monorepo with shared types and utilities ideally it should be built and ready to deploy on netlify. All code should be written in TypeScript and modern ES module syntax.

All components, styles, and API routes should be well written with DRY principles, in each request
search for appropriate places to reuse code, and enable refactoring and modularity. In a large codebase like this it is key to keep things clean and maintainable, as well as memorable and clear. It is easy to lose track of this so ensure that you are always on your A game when composing, planning, and writing. Always think about the future and how this code will be used and expanded upon.

Always answer every part of a request in full, I will guide you but use this document as your main guiding principles for how to complete requests, I will give you ideas but you must expand and elaborate upon them based upon the rules and relevant information in this document. Please keep this document updated as a documentation so reusable functions and components can be referenced in the future and items can easily be reused and are known about to be reused.

Styling should be minimal, clean, professional, sleek, stylish, modern, and MOST IMPORTANTLY, good to use. A bad design makes it hard for users to do anything on the site, they don't know where to look, what to click, and they often will leave before we can even propose anything. A good design makes it easy for users to do what they need to do, important and key information large and in a place they will look, good choices that allow them to know what they can click. This makes using the site much easier, they can acomplish their goal quickly and easily. Always think about the user experience and how to make it as smooth and seamless as possible.

Always plan your implementation with a clear todo list that addresses every aspect of my request, and then implement it in a clean and professional manner, you can ask for a reivew of the plan, but once a plan is in motion do not stop until the goal you understand is achieved. Always complete your entire todo list in full, do not leave anything out or a request half finished. Ensure that everything is done to the absolute best of your ability.

When errors are encountered, always fix them cleanly with functionality maintained, ensure you understand the context and what the code is trying to accomplish, you don't need to ask for permission to fix and don't be scared of breaking code as long as you ensure you are cleaning it up and fixing it.

When something like "there are build errors" or "there are runtime errors" or "the code doesn't work" is said, then repeat changing testing and validating until everything is fixed and working properly. Do not stop until everything is working properly. Always ensure that you are addressing the root cause of issues and continue to retest and iterate. Do not ask for my permission to run cleanups when you find issues, just do it. Always ensure that you are understanding what is going wrong comprehensively and fixing the root cause of the issue and not just its symptoms.

When making edits or additions, consider how they fit into the overall architecture and design principles outlined in this document. Ensure that new code adheres to the established guidelines for maintainability, scalability, and user experience and all features link into each other properly and are used repetedly when needed, the memory bank should assist as like a notepad for available functions and endpoints, ensure to keep this updated so you can pull upon if there is already a function that does this or if there is a way to slightly modify an existing function rather than writing a whole new block. Ensure the usage of helper and smaller functions that perform specific small tasks and and utilities when operations must be performed repetedly, use descriptive names, good comments, and the simplest correct logic least prone to errors and issues inside of functions [no race cases, no ten nested if statements, etc etc, ensure clean, READABLE, *MAINTAINABLE*, **GOOD** CODE].

You can use the credentials alexwaldmann2004@gmail.com and password Debletar29? and write the cookie to cookie.txt to authenticate any request that needs to be authenticated. When running testing commands, ensure to use isBackground: true for the dev server as well as isBackground: true for testing commands (curls, sleeps, whatever you want to do to test), but you need to ensure that terminals don't overlap and interfere with each other.

FEEL FREE TO WRITE TO THIS FILE, I ACTUALLY WOULD PREFER YOU TO KEEP THIS FILE UPDATED WITH NEW HELPFUL INFORMATION, BASICALLY AS A REFERENCE. YOU DON'T NEED TO WRITE FIXES/BUG REPORTS OR ANYTHING, BUT WRITE A SUMMARY OF WHAT THE FUNCTION IS, THE ENDPOINT IT CAN BE CALLED AT (IF APPLICABLE) & POSSIBLY FILE LOCATION FOR SIMPLER IMPORTS WHEN REFERENCING, THE PARAMETERS IT TAKES, AND HOW IT ACTUALLY WORKS INTERNALLY, WHAT DOES IT CALL, WHAT FUNCTIONS DOES IT RELY ON. THIS WILL BE HELPFUL TO MAINTAIN DRY CODE AND DEBUG ISSUES E.G. MULTIPLE FUNCTIONS ARE FAILING, THEY MIGHT SHARE A CALL TO ANOTHER FUNCTION THAT IS SILENTLY FAILING, ETC. ALL OF THIS DOCUMENTATION INFORMATION THAT YOU SHOULD REMEMBER CAN BE WRITTEN BELOW IN THE

MEMORY // DOCUMENTATION
==========================

### iCloud Calendar Router (`backend/src/routes/icloud.ts`)

**Purpose:**
Fetch, parse, and serve iCloud calendar events (with RRULE expansion) for admin users, using a cache-first, background-update pattern. All endpoints require admin authentication and are Netlify/serverless compatible.

**Endpoints:**
- `GET /api/icloud/status` — Test iCloud connection and return calendar discovery status
- `GET /api/icloud/config` — Return all calendar configurations (both iCloud and Google calendars)
- `POST /api/icloud/config` — Update calendar busy/blocking status
- `GET /api/icloud/week?start=YYYY-MM-DD&end=YYYY-MM-DD` — Returns all events in the week range. Cache-first, background update.
- `GET /api/icloud/day?date=YYYY-MM-DD` — Returns all events for a single day. Cache-first, background update.
- `GET /api/icloud/month?year=YYYY&month=MM` — Returns all events for a month. Cache-first, background update.
- `GET /api/icloud/all` — Returns all events for the next 90 days. Cache-first, background update.

**Cache Pattern:**
- In-memory cache (per Netlify/serverless instance) keyed by query params.
- If cache hit: returns cached events immediately, triggers background refresh.
- If cache miss: fetches from iCloud, caches, and returns fresh events.

**Recent Fixes (Dec 2024):**
- Fixed calendar discovery by migrating from legacy tsdav `createDAVClient` to new `DAVClient` class
- Fixed event title extraction by handling `\r\n` line endings in iCal data
- Fixed recurring events by properly implementing RRULE expansion with rrule package
- Fixed calendar toggle behavior in config endpoint - now returns all calendars after updates
- Fixed frontend integration where calendars weren't showing due to API changes
- **Fixed calendar color system** - Now uses proper color priority: user override > fetched colors > stored colors > iOS-style defaults
- **Fixed PROPFIND TypeError** - Improved PROPFIND response structure handling for calendar-color properties
- **Fixed disappearing events** - Changed WeeklyCalendar filtering to show ALL configured calendars, not just busy ones
- **Fixed event color inheritance** - Events now properly inherit colors from their parent calendars in both iCloud and Google integrations
- **Fixed Google calendar dark colors** - Automatically brightens dark colors like `#202124` to ensure visibility
- **Eliminated generated fallback colors** - Removed random color generation in favor of curated iOS color palette

**Current Status:**
- ✅ iCloud authentication working (7 calendars discovered)
- ✅ Event titles properly extracted from SUMMARY field
- ✅ Recurring events expanded correctly using RRULE
- ✅ Calendar configuration management working
- ✅ Calendar colors working with proper override system and iOS-style defaults
- ✅ Google calendar colors automatically brightened if too dark
- ✅ Color override system allows users to customize any calendar color
- ✅ Timezone handling working with Mountain Time default (configurable via admin)

**Reusable Utilities:**
- `getIcloudCreds()`: Returns Apple ID credentials from environment variables
- `createCacheKey(...args: string[])`: Generates a cache key from arguments
- `getCachedEvents(key: string)`: Returns cached events for a key, or null
- `setCachedEvents(key: string, events: any[], ttlSeconds = 300)`: Caches events for a key
- `parseICalDate(val: string)`: Parses iCal date strings to JS Date (handles YYYYMMDD and YYYYMMDDTHHMMSS formats)
- `parseICalEvents(objs: any[], from: Date, to: Date)`: Parses and expands iCal events including RRULE recurrence, extracts SUMMARY and UID with proper line ending handling
- `fetchAndCacheEvents(from: Date, to: Date, cacheKey: string)`: Fetches events from iCloud using DAVClient, parses with calendar metadata, and caches

**Key Implementation Details:**
- Uses tsdav v1.1.0+ `DAVClient` class (not legacy createDAVClient)
- Login required before calling `fetchCalendars()` or `fetchCalendarObjects()`
- RRULE expansion using `rrulestr` from rrule package for recurring events
- Event parsing handles `\r\n` line endings common in iCal data
- Calendar discovery works without props parameter (props parameter returns empty results)

**Admin Auth:**
- All endpoints use `requireAdmin` middleware (checks `req.user.role === 'admin'`)

**Dependencies:**
- `tsdav` v1.1.0+ for CalDAV/iCloud access (DAVClient, DAVNamespace)
- `rrule` for recurrence expansion
- MongoDB CalendarConfigModel for calendar configuration storage

**TODO:**
- Implement proper CalDAV-based calendar color fetching using Apple CalDAV extensions
- Improve timezone handling to properly parse VTIMEZONE data from iCal files
- Add calendar color caching to reduce API calls

**See also:**
- Google calendar router (similar patterns for event fetching and caching)

---

### WeeklyCalendar Component (`src/client/components/WeeklyCalendar.tsx`)

**Purpose:**
React component that displays a weekly calendar view with events from both iCloud and Google calendars. Handles event filtering, timezone conversion, and visual styling.

**Key Features:**
- Fetches events from `/api/merged/week` endpoint (combines iCloud + Google)
- Displays events in Mountain Time (configurable via timezone prop)
- Shows ALL configured calendars, with visual distinction between busy/non-busy
- Supports event overlap visualization with striped patterns
- Handles event color inheritance from parent calendars

**Recent Fixes (Dec 2024):**
- **Fixed disappearing events issue** - Changed filtering logic from `busySet.has(ev.calendarUrl)` to `configuredCalendars.has(ev.calendarUrl)` to show ALL configured calendars, not just busy ones
- **Fixed color consistency** - Events now properly inherit calendar colors via priority: user override > event color > default
- **Fixed business hours filtering** - Removed filtering that excluded events outside business hours (8AM-6PM). Now ALL events display regardless of time
- **Fixed timezone conversion issues** - Improved handling of different datetime formats (UTC vs local time)
- **Performance optimization** - Added server-side filtering capability with calendarUrls parameter (can be enabled/disabled)
- Visual distinction maintained: busy calendar events use full color, non-busy use shaded color (`shadeColor(baseColor, -30)`)

**Current Issues (Sept 2025):**
- Google events missing when server-side filtering enabled
- Timezone conversion causing 6-hour shift (3:30 PM → 9:30 AM) suggesting UTC vs local time confusion
- Server-side filtering temporarily disabled for debugging

**Event Filtering Logic:**
```typescript
const relevantEvents = events.filter((ev) => {
  if (!config) return true; // show until config loaded
  
  // Filter out declined events
  if (ev.responseStatus === 'declined' || ev.status === 'declined') {
    return false;
  }
  
  // Show events from ANY configured calendar (not just busy ones)
  return configuredCalendars.has(ev.calendarUrl) || (ev.uid && forcedBusy.has(ev.uid));
});
```

**Timezone Handling:**
- Uses `date-fns-tz` for timezone conversion to Mountain Time
- Handles both UTC and local time input formats
- Business hours no longer filter out events, only affect grid display

**Dependencies:**
- `/api/merged/week` endpoint for unified event data
- CalendarConfig for calendar settings and colors
- date-fns-tz for timezone handling

---
