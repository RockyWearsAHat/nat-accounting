## Design System (Jan 2025 - Neobrutalism + Glassmorphism)

### Overview
The site uses a modern design system combining **Neobrutalism** (bold borders, hard shadows, flat colors) with **Dark Mode** aesthetics and **Glassmorphism** effects for cards/modals. All colors are CSS variables for easy light/dark mode switching.

### Color Palette
#FFFFFF - #000000 - Pure White to Black Gradient (Any shades of gray in between, MAIN TONES, USE OTHER TONES FOR ACCENT COLORS)
#798C8C - Muted Teal Gray Darker
#AEBFBE - Teal Gray, Middle Tone
#D0D9D4 - Light Teal Gray
#F2EFDF - Off white
#59554C - Dark tone

The dark tone should be the main background color, with the lighter tones used for cards, text, and accents to create a modern, professional look.

### Styling principles
Ensure that every component works together to build a complete well organized piece. This is a work of art you are the painter of, use simple code in creative ways to create stunnning visuals. Always use CSS variables for colors, fonts, spacing, and shadows to ensure consistency.

### Project Vision

Build a premium, modern website inspired by the minimalist luxury feel of https://www.sagiagency.com/, but with far more creative freedom and visual experimentation.
You may use advanced CSS techniques, unique interactions, micro-animations, and high-end visual polish — the vibe of Fireship’s clever micro-UI tricks and the silent Indian developer YouTubers who build insane CSS animations.

### STYLING PATTERN

Use ONLY the brand colors already defined above in the [color palette](#color-palette) section. Reference these with global css variables so they can be easily tuned later on.
Every gradient, animation, and effect should derive from those colors — no unapproved hues.

FOR REFERENCE PLEASE SEE src/client/pages/NewHome.tsx & src/client/pages/NewHome.module.css FOR STYLING EXAMPLES AND GOOD DESIGN IMPLEMENTATIONS

### Design Philosophy

Think:
Minimalist + Premium + Experimental + High-Aesthetic.

Copilot should:

Embrace whitespace

Use bold typography

Leverage motion as a storytelling tool

Mix subtle luxury with visually interesting enhancements

Add tasteful micro-interactions (hover glows, text reveals, masked transitions)

Make small “wow” moments without becoming noisy

Use advanced CSS (clip-path, mix-blend-mode, container queries, scroll-linked animations, fancy gradients, gooey effects, subtle motion blur, etc.) when appropriate

Creative Guidelines

You have permission to be creative as long as it stays premium, not chaotic.

Encouraged

Smooth scroll animations

Text mask reveals

Underline animations

Liquid hover effects

Parallax scrolling

Layered depth effects

Grid layouts with staggered animation

Magnetic buttons

Split-text animations

“Reveal on scroll” elements

Soft gradients generated using the brand palette

Lottie-style animations (CSS or JS)

Creative transitions between sections

Animated geometric shapes/particles that remain subtle and elegant

Not Encouraged

Overly neon visuals

Cartoonish effects

Loud rainbow colors

UI that feels chaotic or cluttered

Anything that dilutes the luxury aesthetic

Typography

Use modern sans-serif fonts.
Large, bold headings.
Minimal tracking.
Comfortable body spacing.

Typography should feel intentional, clean, and artistic — like a boutique studio.

Layout

Use a component structure similar to:

Hero

Capabilities / Services

Case Studies / Work Gallery

About Section

Testimonials or Social Proof (optional)

CTA

Footer

But feel free to enhance these with:

Animations

Interactive containers

Scroll-linked transforms

Layered depth

### Core Files
- **`src/client/styles/theme.css`** - Central design system with all CSS variables
- **`src/client/index.html`** - Imports theme.css and Google Fonts (Space Grotesk)
- **`src/client/pages/AdminPanel.module.css`** - Admin-specific component styles

### Color System (CSS Variables)

**Background Colors:**
- `--color-bg-primary`: #0a0a0f (deep dark blue-black)
- `--color-bg-secondary`: #13131a (slightly lighter)
- `--color-bg-tertiary`: #1a1a24 (card backgrounds)
- `--color-bg-elevated`: #21212e (elevated elements)

**Text Colors:**
- `--color-text-primary`: #ffffff (pure white)
- `--color-text-secondary`: #b4b4c8 (muted purple-gray)
- `--color-text-tertiary`: #7a7a8f (even more muted)
- `--color-text-inverse`: #0a0a0f (for light backgrounds)

**Accent Colors:**
- `--color-accent-blue`: #00d9ff (electric cyan - primary)
- `--color-accent-red`: #ff0055 (hot pink-red - secondary)
- `--color-accent-purple`: #aa00ff (electric purple)
- `--color-accent-green`: #00ff88 (neon green)
- `--color-accent-yellow`: #ffdd00 (bright yellow)

**Semantic Colors:**
- `--color-success`: #00ff88
- `--color-warning`: #ffdd00
- `--color-error`: #ff0055
- `--color-info`: #00d9ff

### Neobrutalism Elements

**Borders:**
- Thick borders (3px-8px) with `--border-color-primary` (cyan) or `--border-color-secondary` (red)
- Sharp corners (`--radius-brutal: 0px`) for most elements
- Slightly rounded (`--radius-sm: 4px`) for inputs/cards

**Shadows (Hard/Offset):**
- `--shadow-brutal-sm`: 3px 3px 0 (cyan/red)
- `--shadow-brutal-md`: 5px 5px 0 (cyan/red)
- `--shadow-brutal-lg`: 8px 8px 0 (cyan/red)
- Hover states: increase offset to 8px 8px 0
- Active states: reduce to 2px 2px 0

**Button Styling:**
```css
.brutal-button {
  background: var(--color-accent-blue);
  border: var(--border-width-thick) solid var(--color-text-primary);
  box-shadow: var(--shadow-brutal-md);
  text-transform: uppercase;
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
}
```

### Glassmorphism Elements

**Glass Cards:**
- `background: var(--glass-bg)` - rgba(19, 19, 26, 0.75)
- `backdrop-filter: var(--glass-blur)` - blur(20px)
- `border: var(--border-width-thin) solid var(--glass-border)` - semi-transparent
- Used for modals, consultation form container, admin settings cards

### Typography System

**Fonts:**
- `--font-sans`: System font stack (body text)
- `--font-display`: "Space Grotesk" (headers, important text)
- `--font-mono`: SF Mono, Monaco (code snippets)

**Sizes:**
- `--font-size-xs`: 0.75rem (12px)
- `--font-size-sm`: 0.875rem (14px)
- `--font-size-base`: 1rem (16px)
- `--font-size-xl`: 1.25rem (20px)
- `--font-size-2xl`: 1.5rem (24px)
- `--font-size-3xl`: 1.875rem (30px)
- `--font-size-4xl`: 2.25rem (36px)
- `--font-size-5xl`: 3rem (48px)
- `--font-size-6xl`: 3.75rem (60px)

**Gradient Text:**
```css
background: linear-gradient(135deg, var(--color-accent-blue) 0%, var(--color-accent-purple) 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### Spacing System (8px base)
- `--space-xs`: 4px
- `--space-sm`: 8px
- `--space-md`: 16px
- `--space-lg`: 24px
- `--space-xl`: 32px
- `--space-2xl`: 48px
- `--space-3xl`: 64px
- `--space-4xl`: 96px

### Abstract Background Shapes
The site uses animated, blurred radial gradients in the background:
- `body::before` - Blue gradient (top-right, 600px)
- `body::after` - Red gradient (bottom-left, 500px)
- `opacity: 0.12`, `filter: blur(80px)`
- Animated with `@keyframes float` for subtle movement

### Component Patterns

**Homepage:**
- Hero section with gradient title text
- Services grid with brutal card hover effects
- Glassmorphism consultation form container

**AdminPanel:**
- Tab navigation with neobrutalism buttons
- Settings cards with glassmorphism
- Calendar chip styling with color pickers
- Form elements with proper spacing and borders

**ConsultationForm:**
- Sectioned layout with clear headings
- Brutal checkboxes with emoji labels
- Large button with hover/active shadow transitions

### Light Mode (Future)
All colors have light mode overrides in `[data-theme="light"]` selector in theme.css. Not currently implemented but structure is ready.

### Usage Guidelines
1. Always use CSS variables instead of hardcoded colors
2. Use `--font-display` for headings, `--font-sans` for body
3. Apply brutal shadows to interactive elements (buttons, cards)
4. Use glassmorphism for overlays and elevated surfaces
5. Maintain consistent spacing with `--space-*` variables
6. Apply gradient text to hero/important headings

---

## Calendar & Scheduling System (2025 Architecture)

### Core Calendar Architecture 

**MongoDB-Cached Calendar System** - The primary calendar system using MongoDB for persistent, fast calendar data access:
- **CachedEventModel** (`src/server/models/CachedEvent.ts`) - MongoDB schema for all calendar events
- **CalendarSyncService** (`src/server/services/CalendarSyncService.ts`) - Background sync service for iCloud/Google calendars
- **CalendarCache React Context** (`src/client/lib/CalendarCache.tsx`) - React context for instant calendar access

**Performance Characteristics:**
- Initial load: ~10ms (MongoDB cached data served immediately)
- Background sync: Triggered after each response to keep cache fresh
- No frontend caching: Always fetch fresh from MongoDB cache
- Progressive loading: Business hours immediate, events load after
- Cache-first pattern: Serve → trigger background sync → update context
- Automatic calendar configuration application

### WeeklyCalendar Component (`src/client/components/WeeklyCalendar.tsx`)
- Professional calendar view with iCloud-style design
- **Current Implementation**: Uses `/api/cached/all` directly for fastest loading, falls back to `/api/merged/all`
- **Loading UX**: Business hours display immediately, minimal loading overlay, no frontend caching
- **Features**: Event hover states, overlapping event handling, business hours integration
- **Modals**: Integrates with DayEventsModal, ScheduleAppointmentModal, EventModal
- **Styling**: Professional black/white theme with proper contrast and typography

### Scheduling API Endpoints

**Primary Availability Endpoint**:
- `GET /api/availability?date=YYYY-MM-DD&duration=MINUTES&buffer=MINUTES`
	- **MongoDB-based** using CachedEventModel for instant response (~10-50ms)
	- **Calendar Configuration Aware** - only considers events from calendars marked as 'blocking'
	- **RRULE Expansion** - properly handles recurring events with RRULE expansion
	- **All-day Event Exclusion** - excludes all-day events from blocking appointments  
	- **UTC Storage/MT Business Hours** - events stored in UTC, compared against Mountain Time business hours
	- **Current Status**: ✅ Fixed and working correctly (returns 7 available slots for test dates)

**Calendar Management Endpoints**:
- `POST /api/calendar/schedule` - Schedule appointments (admin only, with overlap checking)
- `GET /api/cached/all` - Get all cached events (instant response with background sync)
- `POST /api/cached/sync/trigger` - Manual sync trigger (admin only)
- `POST /api/cached/sync/reset` - Force full calendar resync (admin only)

### Cache-First Architecture (Dec 2024)

**Implementation Pattern:**
All calendar endpoints now follow cache-first pattern for optimal UX:
1. **Serve from cache immediately** - MongoDB cached data returned instantly  
2. **Trigger background sync** - Fresh data fetched after response sent
3. **Update context** - CalendarEventsContext updated when cache changes
4. **No blocking waits** - Users never wait for sync operations

**Key Endpoints Using Pattern:**
- `/api/availability` - Instant slot calculation from cache + background sync
- `/api/merged/*` - Fast unified calendar data + background refresh  
- `/api/cached/*` - Direct cache access with sync triggers
- All endpoints serve immediately, sync in background

**Frontend Optimizations:**
- **No frontend caching** - Always fetch fresh from MongoDB (fast enough)
- **Progressive loading** - Business hours immediate, skeleton events during load
- **Context updates** - CalendarEventsContext automatically updates on changes
- **Optimistic UI** - Immediate updates for user actions, background confirmation

### Calendar Configuration System

**CalendarConfigModel** (`src/server/models/CalendarConfig.ts`)**:
- **busyCalendars**: Array of calendar URLs that should block appointment availability
- **calendarColors**: Object mapping calendar URLs to display colors
- **Applied During Sync**: CalendarSyncService now properly applies configuration during sync
- **Recent Fix**: Sync service was hardcoding `blocking: true` - now respects calendar configuration

**Configuration Management**:
- Admin interface at `/admin` allows toggling calendar busy/blocking status
- Color overrides supported for all calendars (iCloud and Google)
- Configuration changes trigger background resync to update cached events

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

When testing ensure that the dev server is run with isBackground: true, `npm run dev` will always kill any existing processes and start a new one, it will write to the server.log file, be careful when restarting the server as the server.log is recreated each time. Always use isBackground: true for curls and other testing commands to ensure that terminals don't overlap and interfere with each other. When testing ensure efficient console management, I am currently running into consistent "The terminal process failed to launch: A native exception occurred during launch (posix_spawnp failed.)." errors during testing and iteration, ensure proper management to avoid this.

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

When making edits or additions, consider how they fit into the overall architecture and design principles outlined in this document. Ensure that new code adheres to the established guidelines for maintainability, scalability, and user experience and all features link into each other properly and are used repetedly when needed, the memory bank should assist as like a notepad for available functions and endpoints, ensure to keep this updated so you can pull upon if there is already a function that does this or if there is a way to slightly modify an existing function rather than writing a whole new block. Ensure the usage of helper and smaller functions that perform specific small tasks and and utilities when operations must be performed repetedly, use descriptive names, good comments, and the simplest correct logic least prone to errors and issues inside of functions [no race cases, no ten nested if statements, etc etc, ensure clean, READABLE, *MAINTAINABLE*, **GOOD** CODE]. Be careful of errors that arise and ensure to fix the error that is actually stated [if this is a good and the correct solve]. Use relative fetches, remember fetch("/api/...") => fetch("baseurl.com/api/...") according to fetch standard as long as you are fetching internally, just use the first option `fetch("/api/endpoint")` and it will work properly in both dev and production. Ensure that all code is written in TypeScript and modern ES module syntax.

### Testing & Authentication
The dev server will (or should) always run on http://localhost:4000. Please only use npm run dev to start/restart the server, it already kills any existing processes and then starts a new server which will write to the ./server.log file. Output from the server logs can be found in the server.log file. Be careful when restarting the dev server as the server.log is recreated each time npm run dev is ran. You have to run `npm run dev` as isBackground: true and subsequent curls as isBackground: true, ALWAYS, if possible clean up terminals but more importantly you need to make sure that the dev server doesn't get killed when you run curls or other commands.

When testing authenticated endpoints, you can use the `curl` command with the `-b cookie.txt` option to include the authentication cookie stored in `cookie.txt`. You can use the credentials  alexwaldmann2004@gmail.com and password Debletar29? to login and write the cookie to cookie.txt to authenticate any request that needs to be authenticated. When running testing commands, ensure to use `isBackground: true` for the dev server (ran with `npm run dev`), as well as `isBackground: true` for testing commands (curls, sleeps, whatever you want to do to test), but you need to ensure that terminals don't overlap and interfere with each other. If you need to restart the server you can just run `npm run dev` again, it will kill the old process and start a new one. If you need to stop the server you can just use ctrl+c in the terminal running it. When testing, ensure the information you need is recieved, when done with testing ensure to clean this up.

### Guidelines
Just know that the database is in UTC time, and the everything in the frontend should run on mountain time (the local timezone for this computer). Quick load times, good UX and UI, and snappy interactable helpful components are the name of the game. Ensure everything is linked together and works as one. Unified color scheme, consistent styling rules, across the entire site ensure great quality and high standards.

### Calendar Synchronization & Caching (Dec 2024 - Major Fixes)

**CalendarSyncService Improvements**:
- **Fixed Configuration Application**: Sync service now properly applies calendar configuration (blocking status, colors) from CalendarConfigModel during sync
- **iCloud Sync**: Uses CalDAV with proper RRULE expansion and timezone handling  
- **Google Sync**: Uses Google Calendar API with sync tokens for incremental updates
- **Configuration Awareness**: Both providers now check CalendarConfigModel for `busyCalendars` and `calendarColors` during sync
- **Event Storage**: Events stored with proper `blocking` and `color` properties based on calendar configuration

**Key Fix Applied (Dec 2024)**:
```typescript
// Before: Hardcoded blocking status
blocking: true

// After: Configuration-aware blocking status  
const config = await CalendarConfigModel.findOne();
const isBlocking = config?.busyCalendars?.includes(calendarUrl) || false;
blocking: isBlocking
```

**Availability Endpoint Optimization**:
- **Fixed Architecture**: Now uses MongoDB cache exclusively (~10-50ms response)
- **Proper Event Filtering**: `blocking: { $ne: false }` - only includes blocking events
- **RRULE Expansion**: Correctly expands recurring events for target date
- **Timezone Handling**: Events stored in UTC, compared against Mountain Time business hours
- **Result**: Now correctly returns 7 available slots instead of incorrectly showing 20+ slots

### Zoom Meeting Integration (Dec 2024)

**Purpose:**
Automatically create Zoom meetings when scheduling appointments, with proper cleanup to prevent orphaned meetings.

**Key Components:**

**1. ZoomService (`src/server/services/ZoomService.ts`)**
- **Server-to-Server OAuth authentication** using Account ID, Client ID, and Client Secret (updated from JWT)
- Creates meetings via Zoom REST API with automatic password generation
- Supports meeting deletion for cleanup
- Automatic token refresh with caching (60s buffer)
- Requires environment variables: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`

**2. Zoom API Routes (`src/server/routes/zoom.ts`)**
- `POST /api/zoom/create-meeting` - Create meeting (requires auth)
- `DELETE /api/zoom/meeting/:meetingId` - Delete meeting (requires auth)  
- `GET /api/zoom/status` - Check API configuration

**3. ScheduleAppointmentModal Integration**
- "Create Zoom" button generates meeting immediately (not on schedule)
- Meeting link auto-populates in Video Call Link field
- Modal cancellation automatically deletes unused Zoom meetings
- Meeting ID stored with appointment for future management

**4. Backend Storage**
- Zoom meeting ID stored as `X-ZOOM-MEETING-ID` custom property in iCal events
- Enables future meeting management and cleanup

**Setup Requirements:**
1. Create Zoom App at https://marketplace.zoom.us/develop/create
2. Choose "Server-to-Server OAuth" app type
3. Set scopes: `meeting:write`, `meeting:read`, `meeting:delete`
4. Get credentials from app and set environment variables:
   ```
   ZOOM_ACCOUNT_ID=your_account_id_here
   ZOOM_CLIENT_ID=your_client_id_here
   ZOOM_CLIENT_SECRET=your_client_secret_here
   ```

**Current Status:**
- ✅ Backend API implemented and tested
- ✅ Frontend UI integrated with auto-cleanup
- ✅ Meeting data stored with appointments
- ✅ Server-to-Server OAuth authentication working
- ✅ Production ready with configured credentials

**Usage Flow:**
1. User opens Schedule Appointment Modal
2. User selects date and time (or available slot)
3. User clicks "Create Zoom" button (only enabled when time is selected)
4. Zoom meeting created with actual appointment time and details
5. Video URL field populated with join link
6. User schedules appointment → meeting time already correctly set
7. If user cancels modal → meeting automatically deleted

**Recent Improvements (Dec 2024):**
- ✅ **Actual Scheduled Meetings**: Zoom meetings now created with the real appointment time instead of placeholder times
- ✅ **Smart UI**: "Create Zoom" button only enabled when date and time are selected
- ✅ **Better Feedback**: Shows scheduled time and meeting ID in success message
- ✅ **Validation**: Prevents creating meetings without proper appointment time selected
- ✅ **Full Deletion**: Meeting deletion now completely removes events from source calendars (iCloud/Google) and cache, not soft delete

### Meetings Management System (Dec 2024)

**Purpose:**
Comprehensive meeting management interface for admins to view, manage, and control scheduled appointments with integrated Zoom functionality.

**Core Components:**

**1. MeetingsSection Component (`src/client/components/MeetingsSection.tsx`)**
- **Two-Tab Interface**: "Scheduled" and "Requested" meetings with counters
- **Scheduled Meetings**: Lists all future appointments from calendar events
- **Meeting Controls**: Join meeting, reschedule, and cancel/delete functionality  
- **Meeting Details**: Client name, date/time, location, description, Zoom info
- **Status Indicators**: Past meetings dimmed, upcoming meetings highlighted
- **Professional Styling**: Consistent with existing admin panel design

**2. Meetings API Routes (`src/server/routes/meetings.ts`)**
- **GET /api/meetings/scheduled**: Fetches future appointments from CachedEventModel
- **GET /api/meetings/:meetingId**: Get specific meeting details
- **DELETE /api/meetings/:meetingId**: Cancel meeting and delete associated Zoom meeting
- **Smart Filtering**: Only shows Business calendar events and events with video URLs
- **Client Info Extraction**: Parses client names and emails from meeting summaries/descriptions

**3. AdminPanel Integration**
- **Replaced ConsultationsList**: Old static consultation list replaced with dynamic meetings management
- **Real-time Updates**: Meeting actions trigger calendar refresh and config updates
- **Integrated Workflow**: Works seamlessly with ScheduleAppointmentModal and calendar systems

**Key Features:**
- **Join Meeting Button**: Direct links to Zoom meetings for active appointments
- **Full Event Deletion**: Completely removes meetings from source calendars (iCloud/Google) and cache
- **Automatic Zoom Cleanup**: Deleting meetings also removes associated Zoom meetings
- **Past/Future Distinction**: Visual indicators for meeting status
- **Client Information**: Extracted from meeting summaries and descriptions
- **Professional UI**: Clean, intuitive interface matching admin panel design
- **Error Handling**: Graceful error states and loading indicators

**Current Status:**
- ✅ Scheduled meetings tab fully functional
- ✅ Meeting details display with all relevant information
- ✅ Join, reschedule, and delete controls working
- ✅ Zoom integration with automatic cleanup
- ✅ Professional styling consistent with admin panel
- ⚠️ Requested meetings tab implemented but waiting for consultation request system enhancement

**Architecture Integration:**
- **Data Source**: CachedEventModel from MongoDB calendar cache
- **Authentication**: Requires admin authentication for all endpoints
- **Calendar Sync**: Integrates with existing calendar configuration and sync systems
- **Zoom Integration**: Uses ZoomService for meeting lifecycle management

---

### Client Profile & Portal System (Jan 2025)

**Purpose:**
Comprehensive client-facing portal where users can manage appointments, request services, view invoices, and interact with the business through a professional self-service interface.

**Core Components:**

**1. ClientProfile Component (`src/client/pages/ClientProfile.tsx`)**
- **Three-Tab Interface**: Appointments, Service Requests, and Invoices
- **User Dashboard**: Welcome header with company name, email, and website
- **Real-time Data**: Loads from API on mount and refreshes after actions
- **Tab Counters**: Shows pending items count in badges (appointments, pending requests, unpaid invoices)
- **Professional UI**: Black background theme matching site aesthetic
- **Responsive Design**: Mobile-friendly layout with proper breakpoints

**2. Client API Routes (`src/server/routes/client.ts`)**
- **GET /api/client/appointments**: Fetches user's appointments (searches by email in event description/summary)
- **DELETE /api/client/appointments/:id**: Cancel appointment (soft delete with marker)
- **POST /api/client/appointments/:id/reschedule-request**: Submit reschedule request (adds note to event)
- **GET /api/client/requests**: Fetch user's service requests from ServiceRequestModel
- **POST /api/client/requests**: Create new service request
- **GET /api/client/invoices**: Fetch user's invoices from InvoiceModel
- **GET /api/client/invoices/:id**: Get single invoice details
- **POST /api/client/invoices/:id/pay**: Mark invoice as paid (simulated payment for now)
- **Authentication**: All endpoints require `requireAuth` middleware

**3. ClientScheduleModal Component (`src/client/components/ClientScheduleModal.tsx`)**
- **Purpose**: Allow clients to self-schedule appointments through availability API
- **Features**:
  * Date picker with minimum date validation (today)
  * Automatic available slot loading via `/api/availability`
  * Visual slot selection with highlight states
  * Client name and email collection
  * Optional notes field for discussion topics
  * Real-time validation and error handling
- **UX**: Portal-based modal with black theme, loading states, and clear CTAs
- **Integration**: Calls `/api/calendar/schedule` to create appointment

**4. ServiceRequestModal Component (`src/client/components/ServiceRequestModal.tsx`)**
- **Purpose**: Let clients request accounting services with checkbox selection
- **Services Available**:
  * Bookkeeping (monthly)
  * Bank & Credit Reconciliations
  * Financial Statement Preparation
  * Accounting Software Implementation
  * Advisory / Strategic Financial Guidance
  * AR/AP Management
  * Cash Flow Forecasting / Budgeting
  * One-Time Financial Clean-Up
  * Tax Preparation, Payroll Services, Other
- **Features**:
  * Multi-select checkboxes with selection counter
  * Additional notes textarea for detailed requirements
  * Creates ServiceRequest in MongoDB with pending status
  * Portal-based modal matching site theme

**5. Database Models**

**ServiceRequestModel** (`src/server/models/ServiceRequest.ts`):
- **Fields**: userId, userEmail, services[], status, notes, adminNotes, estimatedCost
- **Statuses**: pending, approved, in-progress, completed, rejected
- **Timestamps**: createdAt, updatedAt (auto-managed)

**InvoiceModel** (`src/server/models/Invoice.ts`):
- **Fields**: userId, userEmail, invoiceNumber, status, lineItems[], subtotal, tax, total, dueDate, paidDate
- **Line Items**: description, quantity, unitPrice, amount
- **Statuses**: draft, sent, paid, overdue, cancelled
- **Auto-generation**: Invoice number (INV-YYYY-####) created via pre-save hook

**6. Routing & Authentication**

**App Router Integration** (`src/client/pages/App.tsx`):
- **ClientRoute**: Protected route requiring any authenticated user (not just admin)
- **Route**: `/profile` renders ClientProfile component
- **Navigation**: "My Profile" link appears in nav for non-admin users
- **Auto-redirect**: Unauthenticated users redirected to `/login`

**Key Features:**
- **Appointment Management**: View upcoming/past appointments, join Zoom meetings, cancel/reschedule
- **Service Requests**: Submit and track service requests with status updates
- **Invoice Portal**: View invoices, payment status, and pay online (placeholder for payment integration)
- **Self-Service**: Clients can schedule appointments without admin intervention
- **Professional Design**: Black/white theme with clean typography and intuitive UX
- **Real-time Updates**: Data refreshes after user actions (schedule, cancel, pay)
- **Responsive**: Works on desktop and mobile devices

**Current Status:**
- ✅ Client profile page fully functional with three tabs
- ✅ Appointment listing and management working
- ✅ Schedule appointment modal with availability integration
- ✅ Service request system with MongoDB persistence
- ✅ Invoice viewing system (payment integration TODO)
- ✅ Professional black theme matching site design
- ✅ Protected routing and authentication
- ⚠️ Payment processor integration needed for actual invoice payments
- ⚠️ Admin notification system for new requests (TODO)

**Architecture Integration:**
- **Authentication**: Uses existing JWT auth system with role-based access
- **Calendar System**: Integrates with MongoDB-cached calendar for appointment data
- **Data Persistence**: ServiceRequest and Invoice models in MongoDB
- **API Design**: RESTful endpoints with proper error handling
- **Frontend State**: React hooks for local state, http utility for API calls

**Document Management System (Jan 2025):**
- **Storage**: MongoDB GridFS for binary file storage with metadata
- **Access Control**: User-scoped (userId) + admin override - users can only access their own files, admins can access all
- **File Operations**: 
  - Upload (POST /api/client/documents/upload) - supports folder and folderColor metadata
  - List (GET /api/client/documents) - user's own documents
  - Download (GET /api/client/documents/:id) - with access validation
  - Delete (DELETE /api/client/documents/:id) - with ownership check
  - Admin lazy loading (GET /api/client/documents/admin/users) - returns user summaries with document counts
  - Admin user documents (GET /api/client/documents/admin/user/:userId) - loads specific user's documents
- **Folder System**:
  - Move to folder (POST /api/client/documents/folder/move) - batch update file metadata
  - List folders (GET /api/client/documents/folders?userId=X) - unique folders with counts
  - Rename folder (POST /api/client/documents/folder/rename) - updates all files in folder
  - Delete folder (DELETE /api/client/documents/folder/:folderName) - removes folder from all files
  - Metadata: folder (string name), folderColor (hex color)
- **Metadata Update Pattern**: Download → Delete → Re-upload (because GridFSBucket.rename doesn't support metadata parameter)
- **File Validation**: 50MB size limit, restricted to common document types (PDF, DOC, DOCX, XLS, XLSX, images, CSV, TXT)
- **Metadata Structure**: userId, uploadedBy (email), description, contentType, uploadDate, file length, folder, folderColor
- **Frontend Integration**: 
  - ClientProfile documents tab with upload button, file cards, download/delete actions
  - AdminDocumentsSection with two-phase lazy loading (user list → user documents)
  - Folder filtering with colored chips
  - Multi-select with checkboxes and batch move operations
  - Move to folder modal with name input, color picker, and existing folder quick-select
- **GridFS Buckets**: Uses "documents" bucket in MongoDB for file chunks and metadata
- **Security**: requireAuth middleware on all routes, ownership verification before download/delete
- **Performance**: Lazy loading architecture - admin view loads only user summaries first, then documents on-demand when user selected

**Future Enhancements:**
- Stripe/payment processor integration for invoice payments
- Email notifications to admin on new service requests
- Client dashboard with metrics (upcoming appointments, outstanding invoices)
- Document upload for service requests (tax docs, financial statements)
- Real-time chat or messaging system between client and admin

---

### Memory Bank
FEEL FREE TO WRITE TO THIS FILE, I ACTUALLY WOULD PREFER YOU TO KEEP THIS FILE UPDATED WITH NEW HELPFUL INFORMATION, BASICALLY AS A REFERENCE. YOU DON'T NEED TO WRITE FIXES/BUG REPORTS OR ANYTHING, BUT WRITE A SUMMARY OF WHAT THE FUNCTION IS, THE ENDPOINT IT CAN BE CALLED AT (IF APPLICABLE) & POSSIBLY FILE LOCATION FOR SIMPLER IMPORTS WHEN REFERENCING, THE PARAMETERS IT TAKES, AND HOW IT ACTUALLY WORKS INTERNALLY, WHAT DOES IT CALL, WHAT FUNCTIONS DOES IT RELY ON. THIS WILL BE HELPFUL TO MAINTAIN DRY CODE AND DEBUG ISSUES E.G. MULTIPLE FUNCTIONS ARE FAILING, THEY MIGHT SHARE A CALL TO ANOTHER FUNCTION THAT IS SILENTLY FAILING, ETC. ALL OF THIS DOCUMENTATION INFORMATION THAT YOU SHOULD REMEMBER CAN BE WRITTEN BELOW IN THE

MEMORY // DOCUMENTATION
==========================

### MongoDB-Cached Calendar System with Sync Tokens (Dec 2024)

**Architecture Overview:**
Complete cache-first calendar system with MongoDB storage, sync token management, and instant React state updates. Designed for 0ms load times and minimal API calls.

**Core Components:**

**1. CachedEventModel (`src/server/models/CachedEvent.ts`)**
- MongoDB schema for storing all calendar events locally
- Supports iCloud, Google, and local events with unified interface  
- Includes soft delete, ETag tracking, and automatic cleanup (30-day TTL for deleted events)
- Indexed for fast queries: event identity, date ranges, sync timestamps, provider filtering

**2. SyncTokenModel (`src/server/models/SyncToken.ts`)**
- Tracks incremental sync state for each calendar (iCloud CalDAV sync-token, Google syncToken)
- Handles error backoff, sync scheduling, and prevents concurrent syncs
- Statistics tracking: event counts, sync duration, error rates
- Calendar-level enable/disable and status monitoring

**3. CalendarSyncService (`src/server/services/CalendarSyncService.ts`)**
- **Incremental sync**: Uses sync tokens to fetch only changed events since last sync
- **Parallel processing**: Syncs multiple calendars concurrently with rate limiting
- **Smart error handling**: Exponential backoff, automatic retry scheduling  
- **Background operation**: 5-minute intervals, doesn't block user requests
- **Provider support**: iCloud CalDAV sync-collection REPORT, Google Calendar API syncToken

**4. Cached API Router (`src/server/routes/cached.ts`)**
- **Instant responses**: Serves from MongoDB cache (typically <10ms)
- **Background sync trigger**: Automatically starts sync if data >5min old
- **Endpoints**:
  - `GET /api/cached/all` - All events with background refresh
  - `GET /api/cached/range?start=DATE&end=DATE` - Date range filtering
  - `GET /api/cached/day?date=DATE` - Single day events
  - `GET /api/cached/sync/status` - Sync statistics and health
  - `POST /api/cached/sync/trigger` - Manual sync (admin)
  - `POST /api/cached/events` - Add local events

**5. React CalendarCache Context (`src/client/lib/CalendarCache.tsx`)**
- **Zero-latency loading**: Instant UI updates with cached data
- **Optimistic updates**: Add/edit/delete events immediately in UI
- **Background refresh**: 30-second polling for external calendar changes
- **Smart caching**: Prevents redundant API calls, deduplicates events
- **Hooks**: `useCalendarCache()`, `useCachedEvents()`, `useDayEvents()`

**Performance Characteristics:**
- **Initial load**: 0ms (cached data served instantly)
- **User actions**: 0ms (optimistic updates)
- **External sync**: 30-60s background polling
- **API response time**: <10ms from MongoDB cache
- **Sync efficiency**: Only changed events transferred (via sync tokens)
- **Background sync**: 5-minute intervals, non-blocking

**Sync Token Implementation:**
- **iCloud**: Uses CalDAV `sync-collection` REPORT with server-provided sync tokens
- **Google**: Uses Calendar API `events.list` with `syncToken` parameter for incremental updates
- **Incremental updates**: Only fetches events modified since last sync token
- **Full sync fallback**: If sync token invalid/expired, performs complete calendar refresh
- **Change detection**: ETag comparison and last-modified timestamps for conflict resolution

**Database Indexes:**
- Event identity: `{ eventId: 1, provider: 1 }` (unique)
- Date queries: `{ start: 1, end: 1 }` for fast range searches
- Sync management: `{ syncedAt: 1 }`, `{ lastModified: 1 }`
- Calendar filtering: `{ calendarId: 1 }`, `{ deleted: 1 }`
- TTL cleanup: Auto-delete soft-deleted events after 30 days

**Error Handling:**
- **Sync failures**: Exponential backoff (5min → 60min max)
- **API rate limits**: Built-in delay and retry logic
- **Network issues**: Graceful degradation, cached data remains available
- **Data conflicts**: Last-write-wins with timestamp comparison
- **Invalid sync tokens**: Automatic full resync fallback

**Development Notes:**
- Background sync starts automatically on server init
- Sync tokens initialized from calendar configuration
- Compatible with Netlify serverless (no persistent processes required)
- Admin interface shows sync status, statistics, and manual controls
- Events are normalized across providers for consistent frontend interface

**Usage Examples:**
```typescript
// React component with instant loading
const { events, addEvent, isLoading } = useCachedEvents();

// Add event with immediate UI update
addEvent(newEvent); // Shows instantly in UI
// Background API call syncs to server

// Day-specific events
const { events: dayEvents } = useDayEvents(selectedDate);

// Manual sync trigger (admin)
const { triggerSync } = useCalendarCache();
await triggerSync(); // Forces immediate sync
```

**Monitoring & Admin:**
- `GET /api/cached/sync/status` - Health dashboard data
- Sync statistics: success rates, event counts, sync duration
- Error tracking: consecutive failures, last error messages  
- Calendar status: active/inactive, last sync timestamps
- Manual controls: force sync, reset sync tokens, full resync

---

### iCloud Calendar Router (`backend/src/routes/icloud.ts`)

---

### Current Component Architecture (Dec 2024)

**Core Calendar Components**:

**1. WeeklyCalendar** (`src/client/components/WeeklyCalendar.tsx`)
- **Primary calendar view** with professional iCloud-style design  
- **Data Source**: Uses `/api/merged/all` for unified iCloud + Google events
- **Features**: 7-day week view, event hover states, overlapping event handling, business hours display
- **Event Management**: Integrates with DayEventsModal, ScheduleAppointmentModal, EventModal
- **State Management**: Local state with background refresh every 30 seconds
- **Performance**: ~5-minute client-side caching with background updates

**2. DayEventsModal** (`src/client/components/DayEventsModal.tsx`)
- **Day detail view** with event list and mini calendar visualization
- **Portal Rendering**: Uses React Portal for proper modal overlay
- **Navigation**: Previous/Next day navigation with callback support
- **Event Actions**: Quick busy/non-busy toggle, event deletion
- **Layout**: Two-panel design (event controls + mini calendar)
- **Time Display**: Scrollable 7am-9pm grid with synchronized time labels

**3. ScheduleAppointmentModal** (`src/client/components/ScheduleAppointmentModal.tsx`)
- **Appointment creation interface** with overlap detection and Zoom integration
- **Availability Integration**: Fetches available slots from `/api/availability`
- **Overlap Detection**: Real-time validation against existing events (fixed timezone issues)
- **Zoom Integration**: "Create Zoom" button for instant meeting creation with auto-cleanup
- **Form Validation**: Proper time validation and conflict checking
- **Recent Fixes**: Fixed false overlap warnings, corrected timezone display

**4. CalendarCache Context** (`src/client/lib/CalendarCache.tsx`)
- **React Context** for centralized calendar state management
- **Instant Loading**: 0ms load times with cached MongoDB data
- **Optimistic Updates**: Immediate UI updates for add/edit/delete operations
- **Background Sync**: 30-second polling for external calendar changes
- **API Integration**: Uses `/api/cached/*` endpoints for data operations

### API Architecture Summary

**Primary Data Flow**:
1. **Background Sync**: CalendarSyncService syncs iCloud/Google → MongoDB cache
2. **Client Requests**: React components fetch from cache-first endpoints  
3. **Real-time Updates**: Optimistic updates + background sync for consistency
4. **Configuration Application**: All sync operations respect CalendarConfigModel settings

**Endpoint Categories**:
- **`/api/cached/*`** - MongoDB cache operations (primary data source)
- **`/api/merged/*`** - Unified calendar data (used by WeeklyCalendar)  
- **`/api/icloud/*`** - Direct iCloud operations (config, colors, admin actions)
- **`/api/google/*`** - Google Calendar integration
- **`/api/availability`** - Appointment slot calculation (cache-based)
- **`/api/calendar/schedule`** - Appointment creation with overlap checking
- **`/api/zoom/*`** - Meeting creation and management

**Recent Architecture Improvements**:
- ✅ Calendar configuration now properly applied during sync
- ✅ Availability endpoint optimized with MongoDB cache
- ✅ Timezone handling fixed (UTC storage → MT business hours)
- ✅ Zoom integration with OAuth authentication and auto-cleanup
- ✅ Event filtering respects calendar busy/blocking configuration

---

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
- **Fixed RRULE timezone expansion bug** - Root cause fix in rruleExpander.ts where DTSTART parsing now preserves original timezone context from iCal DTSTART;TZID=America/Denver fields instead of double-converting UTC times

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
- **RRULE timezone preservation**: Extracts original DTSTART;TZID from raw iCal data to prevent double timezone conversion during expansion

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

### Document Management Router (`src/server/routes/documents.ts`)

**Purpose:**
GridFS-based file storage system for client documents with strict access control. Provides upload, download, delete, and list operations with user-scoped security.

**Endpoints:**
- `POST /api/client/documents/upload` - Upload document with multer middleware (requires auth)
- `GET /api/client/documents` - List user's documents (admin sees all, users see only their own)
- `GET /api/client/documents/:id` - Download specific document with access validation
- `DELETE /api/client/documents/:id` - Delete document with ownership check

**Security & Access Control:**
- All endpoints require `requireAuth` middleware (JWT-based authentication)
- **User Scoping**: Users can only access documents where `metadata.userId` matches their user ID
- **Admin Override**: Admins (`role === 'admin'`) can access all documents regardless of ownership
- **Ownership Verification**: Download and delete operations verify ownership before allowing action
- Returns 403 Forbidden if non-admin tries to access another user's file

**File Upload Configuration:**
- **Storage**: Memory storage (buffered) then streamed to GridFS
- **Size Limit**: 50MB maximum file size
- **Allowed Types**: PDF, DOC/DOCX, XLS/XLSX, JPEG/PNG/GIF, TXT, CSV
- **Metadata**: Stores userId, uploadedBy (email), description (optional), contentType
- **GridFS Bucket**: Uses "documents" bucket in MongoDB

**GridFS Implementation:**
- **Helper Function**: `getGridFSBucket()` returns configured GridFS bucket instance
- **Upload Stream**: Creates readable stream from buffer, pipes to GridFS with metadata
- **Download Stream**: Pipes file from GridFS directly to HTTP response with proper headers
- **Delete**: Uses `bucket.delete(fileId)` which removes both metadata and chunks
- **Type Compatibility**: Uses `as any` cast to handle version mismatch between mongoose's mongodb and standalone mongodb package

**Response Formats:**
- **Upload Success**: `{ success: true, fileId: string, filename: string }`
- **List Documents**: Array of `{ _id, filename, uploadDate, length, contentType, metadata }`
- **Download**: Binary stream with Content-Type, Content-Disposition, Content-Length headers
- **Delete Success**: `{ success: true, message: "Document deleted successfully" }`
- **Errors**: `{ error: string }` with appropriate HTTP status codes

**Error Handling:**
- 400 Bad Request: No file uploaded
- 403 Forbidden: Access denied (user trying to access another user's file)
- 404 Not Found: File doesn't exist
- 500 Internal Server Error: Upload/download/delete failures

**Dependencies:**
- `multer` for multipart form handling
- `mongodb` GridFSBucket for file storage
- `mongoose` for MongoDB connection access
- `requireAuth` middleware for authentication

**See also:**
- ClientProfile component (frontend UI for document management)
- client.ts router (related client-facing endpoints)

---

### DayEventsModal Component (`src/client/components/DayEventsModal.tsx`)

**Purpose:**
Modal overlay component that displays detailed day view with events from both iCloud and Google calendars. Uses React Portal for proper modal rendering and matches WeeklyCalendar structure with professional styling.

**Key Features:**
- **React Portal Implementation**: Renders as true modal overlay at document.body level using `createPortal`
- **Event Controls Panel**: Left sidebar (400px) with event list, business hours info, and quick actions
- **Mini Calendar View**: Right panel with scrollable 7am-9pm time grid showing precise event positioning
- **Navigation**: Previous/Next day buttons with optional `onNavigateDay` callback prop
- **Professional Styling**: Matches WeeklyCalendar design with proper modal overlay, backdrop blur, and consistent colors
- **Business Hours Integration**: Green/red horizontal lines for opening/closing times
- **Event Management**: Quick actions for marking busy/non-busy and deleting events
- **Synchronized Scrolling**: Time labels and calendar content scroll together for perfect alignment

**Props Interface:**
```typescript
interface DayEventsModalProps {
  day: number;
  month: number;
  year: number;
  events: CalendarEvent[];
  config: CalendarConfig | null;
  hours?: { [day: string]: { raw: string; startMinutes: number; endMinutes: number }; } | null;
  onClose: () => void;
  onConfigUpdate: () => void;
  onNavigateDay?: (direction: 'prev' | 'next') => void;
  footer?: React.ReactNode;
}
```

**Recent Fixes (Dec 2024):**
- **Fixed modal overlay rendering** - Now uses `createPortal(jsx, document.body)` to render at document root instead of inline
- **Fixed TypeScript interface** - Added optional `onNavigateDay` prop to match WeeklyCalendar usage
- **Fixed navigation functionality** - Proper callback handling for day navigation when parent provides handler
- **Maintained existing design** - Two-panel layout with event controls and mini calendar preserved
- **Fixed build optimization** - No longer generates scattered build artifacts in src folder
- **Fixed time alignment and scrolling** - Time labels now scroll with calendar content using unified scrollable container
- **Fixed border consistency** - Removed duplicate borders and aligned styling with WeeklyCalendar

**Current Status:**
- ✅ Modal displays as proper overlay using React Portal
- ✅ TypeScript compilation working without errors
- ✅ Professional styling matching WeeklyCalendar design
- ✅ Business hours lines working (green opening, red closing)
- ✅ Scrollable 7am-9pm time grid with synchronized time labels
- ✅ Event controls panel with quick actions
- ✅ Navigation buttons with callback support
- ✅ Perfect time alignment between labels and hour lines

**Technical Implementation:**
- **Synchronized Scrolling**: Uses nested grid containers where both time column and day content scroll together in unified container
- **Grid Layout Structure**: `display: 'grid', gridTemplateColumns: '80px 1fr'` for consistent alignment
- **Scroll Container**: Single scrollable div containing both time labels and calendar content to maintain perfect alignment
- **Border Management**: Consistent 1px borders matching WeeklyCalendar styling without duplication

**Dependencies:**
- `react` with `createPortal` from "react-dom"
- `calendar.module.css` for modal styling classes
- Parent component must provide event data and config
- Optional navigation callback for day switching

**Usage Example:**
```tsx
{selectedDay !== null && createPortal(
  <DayEventsModal
    day={selectedDay}
    month={currentMonth}
    year={currentYear}
    events={dayEvents}
    config={calendarConfig}
    hours={businessHours}
    onClose={() => setSelectedDay(null)}
    onConfigUpdate={handleConfigUpdate}
    onNavigateDay={(direction) => navigateToDay(direction)}
  />,
  document.body
)}
```

**See also:**
- WeeklyCalendar component (parent integration)
- EventModal and ScheduleAppointmentModal (child modals)

---

### AdminDocumentsSection Component (`src/client/components/AdminDocumentsSection.tsx`)

**Purpose:**
Efficient admin interface for managing client documents with lazy loading architecture and comprehensive folder organization system. Displays user list first, then loads specific user's documents on-demand.

**Architecture:**
- **Two-Phase Loading**: Phase 1 shows user summaries with document counts, Phase 2 loads full documents when user selected
- **Folder Organization**: Full CRUD operations for folders (create via move, filter, rename, delete)
- **Multi-Select**: Checkbox-based selection for batch operations
- **Performance**: Loads only metadata initially, ~90% reduction in initial data transfer compared to old "load all" approach

**Key Features:**
- **User List View**: Shows all clients with document counts, click to drill down
- **Document View**: Shows selected user's documents with folder filtering
- **Back Button Navigation**: Easy return to user list
- **Folder Chips**: Color-coded folder filters showing document counts
- **Multi-Select Checkboxes**: Select multiple files for batch operations
- **Move to Folder Modal**: Create new folders or choose existing, with color picker
- **File Actions**: Download and delete buttons per file
- **Optimistic UI**: Immediate updates after folder operations

**State Management:**
```typescript
const [users, setUsers] = useState<UserSummary[]>([]);           // Phase 1: User summaries
const [selectedUser, setSelectedUser] = useState<UserDocuments | null>(null);  // Phase 2: Full documents
const [folders, setFolders] = useState<Folder[]>([]);            // Available folders for user
const [selectedFolder, setSelectedFolder] = useState<string | null>(null);  // Active folder filter
const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());  // Multi-select state
const [showFolderModal, setShowFolderModal] = useState(false);   // Move to folder UI
```

**API Integration:**
- `GET /api/client/documents/admin/users` - Load user summaries (Phase 1)
- `GET /api/client/documents/admin/user/:userId` - Load user documents (Phase 2)
- `GET /api/client/documents/folders?userId=X` - Get folders for user
- `POST /api/client/documents/folder/move` - Move files to folder
- `DELETE /api/client/documents/:id` - Delete file

**User Flow:**
1. Admin loads page → sees list of all clients with document counts
2. Clicks client → loads that client's documents and folders
3. Can filter by folder using colored chips
4. Select files with checkboxes → "Move to Folder" button appears
5. Click move → modal opens with folder name input, color picker, existing folders
6. Confirm → files moved, view refreshes with updated folders
7. Back button → returns to client list

**Performance Characteristics:**
- **Initial Load**: ~50ms (only user summaries, no document data)
- **User Selection**: ~100ms (loads single user's documents)
- **Old Approach**: ~2-5s (loaded all users + all documents upfront)
- **Improvement**: ~95% faster initial load for admins with many clients

**Props:** None (standalone admin section)

**Styling:** `AdminDocumentsSection.module.css` - Black/white luxury theme matching admin panel

**Integration:**
Used in `AdminPanel.tsx` as one of the admin dashboard sections alongside meetings, calendar config, etc.

**Recent Architecture Change (Jan 2025):**
Completely refactored from "load everything upfront" to lazy loading + folder system. Old component loaded all users with all documents on mount (inefficient for scale). New component loads user summaries first, then documents on-demand when admin clicks specific user.

**Technical Implementation:**
- **Folder Filtering**: Client-side filtering of loaded documents by selected folder
- **Multi-Select Logic**: Set-based selection state for efficient add/remove operations
- **Modal Portal**: Move to folder modal prevents background scroll and provides clean UX
- **Optimistic Updates**: Reloads user documents after folder operations to show latest state
- **Error Handling**: Graceful fallback with retry button if API calls fail

**Dependencies:**
- `http` utility for authenticated API calls
- React hooks for state management
- GridFS backend for file storage
- MongoDB for folder metadata persistence

**See also:**
- documents.ts router (backend folder CRUD operations)
- ClientProfile component (client-facing document view)

---

### ScheduleAppointmentModal Overlap Detection Fix (Dec 2024)

**Issue Fixed:**
The ScheduleAppointmentModal was showing false "overlap" warnings when users selected pre-validated available time slots from the availability API. The component was also not correctly detecting real overlaps when users entered custom times.

**Root Cause:**
The overlap detection logic was running for both selected time slots (which are already validated as non-overlapping by the backend) and custom time entries, causing false positives.

**Solution Implemented:**
- **Conditional Overlap Checking**: Only run overlap detection when user manually enters a custom time (`selectedSlot` is null)
- **Available Slot Protection**: When a user selects from available slots, skip overlap detection entirely since backend guarantees these are non-overlapping
- **Improved Event Filtering**: Only check overlap against blocking events (`ev.blocking !== false`)
- **Proper Timezone Conversion**: Events from API (UTC) converted to Mountain Time for comparison with user input

**Key Code Changes:**
```typescript
// Only check for overlaps when user manually enters a custom time
if (selectedSlot) {
  setOverlapWarning(null);
  return;
}

const overlap = events.find(ev => {
  // Skip non-blocking events
  if (ev.blocking === false) return false;
  
  // Convert UTC events to local timezone for comparison
  const evStart = DateTime.fromISO(ev.start).setZone(TIMEZONE);
  const evEnd = ev.end ? DateTime.fromISO(ev.end).setZone(TIMEZONE) : evStart.plus({ minutes: 30 });
  
  return (start < evEnd && end > evStart);
});
```

**Dependencies:**
- `selectedSlot` state tracks which available slot is selected
- `/api/icloud/day` provides events for overlap checking
- Luxon DateTime for timezone conversions
- `useEffect` dependency on `selectedSlot` prevents false warnings

**Final Fix (Dec 2024):**
Fixed the root cause of false overlap warnings by correcting timezone interpretation in overlap detection. The issue was that events from the API were being double-converted from UTC to Mountain Time, causing "Mgt 5850" at 12:25 PM to appear as 6:25 AM in overlap calculations.

**Solution:**
```typescript
// Correct approach: Parse API times as local Mountain Time (remove Z suffix)
const evStartStr = ev.start.replace('Z', '');
const evStart = DateTime.fromISO(evStartStr, { zone: TIMEZONE });
```

**Current Status:**
- ✅ Available time slots no longer show false overlap warnings
- ✅ Custom time entries use correct timezone interpretation
- ✅ Events at 12:25 PM no longer cause false overlaps with 6:30 AM appointments
- ✅ Calendar display and overlap detection now use consistent timezone logic
- ✅ Only blocking events cause overlap warnings

---

### Comprehensive Codebase Cleanup (Dec 2024)

**Major Cleanup Initiatives Completed:**

**1. Calendar Configuration System Fixes**
- ✅ **Fixed CalendarSyncService**: Now properly applies calendar configuration (blocking status, colors) during sync instead of hardcoding values
- ✅ **Availability Endpoint Optimization**: Correctly returns 7 available slots instead of 20+ by respecting calendar blocking status
- ✅ **Configuration-Aware Event Storage**: Events now stored with proper `blocking` and `color` properties based on CalendarConfigModel

**2. API Endpoint Organization**
- ✅ **Primary Data Flow Established**: Background Sync → MongoDB Cache → Cache-First Endpoints → React Components
- ✅ **Endpoint Categories Clarified**:
  - `/api/cached/*` - MongoDB cache operations (primary data source)
  - `/api/merged/*` - Unified calendar data (used by WeeklyCalendar)
  - `/api/icloud/*` - Direct iCloud operations (config, admin actions)
  - `/api/google/*` - Google Calendar integration
  - `/api/availability` - Appointment slot calculation (cache-based)
  - `/api/calendar/schedule` - Appointment creation with overlap checking
  - `/api/zoom/*` - Meeting creation and management

**3. Calendar System Architecture**
- ✅ **MongoDB-Cached Primary System**: Fast cache-first architecture with background sync
- ✅ **Sync Token Management**: Incremental updates using CalDAV sync-tokens and Google syncTokens
- ✅ **React Context Integration**: CalendarCache provides instant loading with optimistic updates
- ✅ **Professional UI Components**: WeeklyCalendar, DayEventsModal, ScheduleAppointmentModal with consistent design

**4. Build System & Performance**
- ✅ **Clean Build Artifacts**: All compilation output goes to `dist/` folder only
- ✅ **TypeScript Configuration**: Proper ESM setup with `noEmit: true` preventing source pollution
- ✅ **Rollup ESM Compilation**: Server TypeScript properly compiled to ESM with correct `.js` extensions
- ✅ **Asset Optimization**: Code splitting, pre-bundling, compression for optimal performance

**5. Documentation & Memory Bank Updates**
- ✅ **Architecture Documentation**: Comprehensive current system descriptions
- ✅ **Component References**: Detailed prop interfaces, usage examples, technical implementations
- ✅ **API Endpoint Documentation**: Full parameter lists, response formats, usage patterns
- ✅ **Recent Fixes Cataloged**: All major bug fixes and improvements documented with before/after code

**Current System State:**
- **Primary Calendar Architecture**: MongoDB-cached system with 0ms load times
- **Background Sync**: 5-minute intervals with sync token management
- **UI Performance**: Instant updates with optimistic UI changes
- **Admin Interface**: Calendar configuration, sync triggers, system monitoring
- **Production Ready**: Netlify deployment with proper caching, compression, security headers

---

---

### Build System Optimizations (Dec 2024)

**Root TypeScript Configuration (`tsconfig.json`):**
- **Modern ESM setup**: ES2022 target with bundler module resolution
- **Type checking only**: `noEmit: true` - compilation handled by build tools
- **Universal coverage**: Includes all TypeScript files in project
- **Clean excludes**: Excludes dist, node_modules, and backup files

**Vite Configuration (`vite.config.ts`):**
- **Clean builds**: `emptyOutDir: true` ensures dist folder is cleaned before each build
- **Code splitting**: Separate chunks for React vendor libs and date utilities
- **Performance optimizations**: ESNext target, esbuild minification, sourcemaps disabled for production
- **Asset optimization**: 4KB inline limit, CSS code splitting enabled
- **Dependency pre-bundling**: React, React-DOM, date-fns optimized for faster dev server startup

**Rollup Configuration (`rollup.config.mjs`):**
- **ESM compilation**: Compiles TypeScript server files to proper ESM with `.js` extensions
- **Module preservation**: Uses `preserveModules: true` to maintain file structure
- **External dependencies**: Marks all node_modules and built-ins as external
- **Glob pattern inputs**: Uses `globSync("src/server/**/*.ts")` for automatic file discovery, eliminating manual maintenance
- **Smart filtering**: Excludes `.d.ts` and `.test.ts` files automatically

**Package Scripts:**
- `build`: Full build using `tsc` (type checking) + `vite build` (client) + `rollup` (server)
- `start`: Production server with `NODE_ENV=production node dist/server/index.js`
- `start:dev`: Development server using `tsx` for direct TypeScript execution
- `build:netlify`: Full production build with compression
- `compress`: Creates gzipped versions of JS and CSS files
- `analyze`: Bundle size analysis for optimization

**Netlify Deployment (`netlify.toml`):**
- **SPA routing**: Wildcard redirect to index.html for client-side routing
- **Aggressive caching**: 1-year cache for assets, revalidation for HTML
- **Security headers**: XSS protection, content-type enforcement, referrer policy
- **Compression**: Pre-gzip assets for optimal transfer speeds
- **Resource preloading**: Critical CSS and JS files preloaded in HTML headers

**Recent Fixes (Dec 2024):**
- ✅ All build artifacts now go to `dist/` folder only
- ✅ No scattered `.js`, `.d.ts`, `.map` files in `src/` folders
- ✅ TypeScript configuration prevents source pollution with `noEmit: true`
- ✅ Rollup properly compiles server TypeScript to ESM with correct `.js` extensions
- ✅ Server runs successfully in production with proper ESM module resolution
- ✅ Optimized chunk splitting reduces bundle sizes
- ✅ Netlify configuration enables maximum performance
- ✅ Glob wildcard patterns eliminate manual file listing maintenance
- ✅ Calendar border issues fixed - removed timeColumn border-right to prevent doubling with dayColumn borders
- ✅ Day modal time alignment fixed - time labels now scroll synchronously with calendar content
- ✅ All-day section border consistency - removed duplicate border-bottom from allDayTimeColumn

**Calendar Component Border Fixes:**
- **timeColumn Border Removal**: Removed `border-right: 1px solid #1e1e24` from `.timeColumn` to prevent doubling with `.dayColumn` borders
- **allDayTimeColumn Border Fix**: Removed `border-bottom: 1px solid #1e1e24` from `.allDayTimeColumn` to prevent doubling with wrapper borders
- **Consistent Visual Hierarchy**: All calendar components now share identical border thickness and styling patterns
- **Day Modal Alignment**: Restructured DayEventsModal to use unified scrolling container ensuring perfect time label alignment with hour grid lines

**Build Performance:**
- Client build: ~535ms with optimized dependencies
- Server build: ~5.6s with Rollup ESM compilation
- Asset sizes: 147KB main bundle, 142KB React vendor (gzipped ~46KB each)
- Clean separation: Client assets in `dist/client/`, server in `dist/server/`

**Key Technical Solutions:**
- **ESM Import Resolution**: Rollup automatically adds `.js` extensions to compiled imports
- **Module Resolution**: Uses `bundler` mode for TypeScript with proper external handling
- **Production Server**: Automatically starts when `NODE_ENV=production` is set
- **Development Workflow**: Uses `tsx` for direct TypeScript execution in development

---

### Fixed Availability Endpoint (`backend/src/routes/availability-simple.ts`)

**Purpose:**
Fast, accurate calculation of available appointment slots using MongoDB cached events. Architecture completely rewritten (Dec 2024) to use the cached router instead of direct iCloud API calls.

**Endpoint:**
- `GET /api/availability?date=YYYY-MM-DD&duration=MINUTES&buffer=MINUTES` — Returns available appointment slots

**Current Architecture (Fixed Dec 2024):**
- **MongoDB Cache First**: Uses CachedEventModel directly for instant event retrieval
- **All-Day Event Exclusion**: Filters out all-day events from blocking appointments
- **UTC Storage Handling**: Events stored in UTC, properly converted to Mountain Time for business hour comparison
- **Timezone Aware**: Business hours in Mountain Time, events converted from UTC storage
- **Blocking Filter**: Only considers events where `blocking !== false`

**Performance:**
- **Response Time**: ~10-50ms (direct MongoDB query)
- **No External API Calls**: Uses cached events exclusively
- **Business Hours**: 7 AM - 5 PM Mountain Time (configurable)

**Current Status (Dec 2024):**
- ✅ Architecture simplified to use MongoDB cache exclusively
- ✅ Timezone handling fixed for UTC storage → MT business hours
- ✅ All-day events properly excluded from blocking
- ✅ Event filtering correctly respects calendar configuration
- ✅ **Calendar Sync Fixed**: CalendarSyncService now properly applies blocking/color config during sync
- ✅ **Result**: Now correctly returns 7 available slots for test dates (previously showed 20+ incorrect slots)

**Major Fix Applied (Dec 2024):**
Fixed CalendarSyncService to respect calendar configuration instead of hardcoding blocking status:
```typescript
// Before: All events hardcoded as blocking
blocking: true

// After: Configuration-aware blocking
const config = await CalendarConfigModel.findOne();
const isBlocking = config?.busyCalendars?.includes(calendarUrl) || false;
blocking: isBlocking
```

**Code Example:**
```typescript
// Current implementation uses direct MongoDB query with proper filtering
const events = await CachedEventModel.find({
  deleted: { $ne: true },
  allDay: { $ne: true }, // Exclude all-day events
  blocking: { $ne: false }, // Only blocking events
  $or: [/* date range queries */]
}).lean();
```

**Dependencies:**
- `CachedEventModel` for MongoDB event storage
- `CalendarSyncService` for proper event sync with configuration
- `dayjs` with UTC and timezone plugins
- Mountain Time timezone (`America/Denver`)

**See also:**
- CachedEventModel (MongoDB schema)
- CalendarSyncService (properly applies calendar configuration)
- Cached router (/api/cached/day) for event retrieval

---

### Smart Pricing Calculator (Nov 2025)

**Architecture Overview:**
AI-powered spreadsheet pricing engine backed by an Excel workbook (e.g., `Pricing_Calculator_and_Quote.xlsx`) uploaded through the admin panel. The system uses OpenAI to analyze workbook structure and generate service metadata from the primary calculator sheet, then applies admin controls and overrides for final calculations. Persisted defaults and blueprints live in MongoDB, and the admin UI provides live recalculations, exports, and email delivery.

**Important:** The pricing workbook is NOT stored in the repository. Admins must upload it through the Workbook Mapping Wizard in the admin panel. The workbook is stored in MongoDB as a Buffer for Netlify-friendly stateless deployment.

**Data Flow:**
1. **Workbook Upload** → Admin uploads Excel workbook through Workbook Mapping Wizard (stored in MongoDB)
2. **Workbook Mapping Wizard** → Configures which sheet/columns the AI should analyze (focuses on primary calculator sheet)
3. **AI Blueprint Generation** → OpenAI analyzes the PRIMARY sheet only and generates service metadata (names, tiers, rate bands, billing cadence) using resolved cell values
4. **Deterministic Parser** → Reads raw Excel cell values as foundation (fallback when AI unavailable)
5. **Blueprint Overlay** → Enriches parsed data with AI-generated metadata + admin overrides from PricingSettings
6. **Admin Controls** → Simple UI for toggling services, adjusting quantities, overriding rates per line item

**Core Server Modules:**

1. **`src/server/pricing/workbookMapping.ts`**
  - Defines `PricingWorkbookMapping` structure that tells the AI where to look in the workbook
  - Column mappings (select: "A", quantity: "B", tier: "D", service: "E", billing: "F", rate columns, etc.)
  - Used by both AI blueprint analysis and deterministic parser as fallback
  - `DEFAULT_PRICING_WORKBOOK_MAPPING` provides sensible defaults for standard workbook layouts

2. **`src/server/pricing/aiBlueprintGenerator.ts`**
  - `generatePricingBlueprintWithAI()` sends workbook snapshot to OpenAI for structural analysis
  - **Focuses on PRIMARY sheet only** (typically Calculator sheet) - ignores secondary sheets like Quote Builder
  - Uses **resolved/calculated cell values** from Excel formulas (including cross-sheet references)
  - Returns `PricingBlueprint` with service metadata (names, tiers, billing cadence, rate bands, descriptions)
  - Uses OpenAI JSON schema enforcement for consistent output structure
  - Prompt guardrails require concrete service names, numeric price bands, proper billing cadence

3. **`src/server/pricing/deterministicBlueprint.ts`**
  - `generateDeterministicPricingBlueprint()` creates fallback blueprint when OpenAI unavailable
  - Reads workbook directly using mapping configuration without AI interpretation
  - Always runs automatically in `runWorkbookAnalysis()` as backup for AI failures

4. **`src/server/pricing/parser.ts`**
  - Core pricing calculation engine with workbook parsing and Excel formula evaluation
  - **`extractLineItems()`**: Deterministically reads Excel rows using mapping configuration (foundation layer)
  - **`applyBlueprintOverridesToLineItems()`**: Enriches parsed data with AI blueprint + admin overrides from PricingSettings
  - **`calculatePricing()`**: Computes totals with xlsx-calc formula evaluation
  - **Two-Layer System**: Deterministic parse provides raw data → Blueprint overlay adds intelligence + customization

5. **`src/server/pricing/blueprintOverrides.ts`**
  - Merges AI-generated blueprint with admin-configured overrides from PricingSettings
  - `mergeBlueprintWithOverrides()` combines base blueprint with custom modifications
  - `mapServicesByRow()` indexes services by row number for efficient lookup
  - `sanitizeBlueprintOverrides()` validates and normalizes override data

6. **`src/server/models/PricingWorkbook.ts`**
  - Single-document collection that stores the latest pricing workbook (`data` Buffer + metadata) for Netlify friendliness
  - Stores both `blueprint` (AI-generated) and `blueprintOverrides` (admin customizations)
  - Updated whenever admins finish the mapping wizard so subsequent requests never depend on local disk

7. **`src/server/models/PricingSettings.ts`**
  - Stores single-document defaults (client size, price point) and per-line overrides (selected state, quantity, custom rates)
  - Update timestamps and optional export recipients
  - **No maintenance toggles** - maintenance pricing now handled by dedicated workbook sections

8. **`src/server/routes/pricing.ts`**
  - `GET /api/pricing` → bootstrap metadata, saved settings, and resolved defaults
  - `POST /api/pricing/calculate` → recalculates totals for the provided selections
  - `PUT /api/pricing/settings` → persists admin defaults and overrides
  - `POST /api/pricing/export` → returns XLSX/CSV (base64) and optionally emails the quote using `MailService`
  - `PUT /api/pricing/workbook` → accepts the sanitized mapping plus optional base64 workbook payload, persists to Mongo, invalidates caches, refreshes metadata, **triggers AI blueprint analysis**
  - All endpoints require `requireAuth` + `requireAdmin`

9. **`src/server/services/MailService.ts`**
  - Thin SMTP wrapper (env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`)
  - `sendPricingQuoteEmail` emails attached quotes with totals summary; throws when SMTP is not configured to surface actionable errors to the UI

**Frontend Components & Types:**

- `src/client/components/PricingCalculatorAdmin.tsx`
  - Primary admin interface for pricing calculator with AI-powered line item controls
  - Calls `/api/pricing` on mount, rendering either the calculator or a setup CTA when workbook metadata is missing; the CTA launches the workbook wizard directly
  - Maintains local form state (client size, price point, quote meta, per-line overrides), triggers recalculations via `/api/pricing/calculate`
  - Surfaces AI blueprint metadata, mapping summaries, and computed totals
  - Supports saving defaults, exporting XLSX/CSV, emailing quotes
  - Uses `PricingCalculatorAdmin.module.css` for minimal black/white luxe styling

- `src/client/components/WorkbookMappingWizard.tsx`
  - **Purpose**: Configure what the AI should analyze (not manual deterministic parsing)
  - Full-screen modal configuration canvas with left-hand workbook preview/upload rail and right-hand mapping form
  - Drag-and-drop or file picker upload hydrates preview and stages the workbook
  - **Analyze Button**: Admins must explicitly press "Analyze [filename]" to invoke `onUploadWorkbook` and trigger AI blueprint analysis
  - Mapping fields (sheets, key cells, totals, ranges, columns, rate segments, quote cells) edit in-place
  - Changes track against sanitized baseline and enable "Save Mapping" CTA only when modifications exist
  - `createEmptyWorkbookMapping()` helper generates fully shaped default mapping
  - `sanitizeMapping(mapping)` keeps sheet names and cell addresses normalized

- `src/client/components/SpreadsheetPreview.tsx`
  - Reusable virtualized sheet preview with sticky headers and highlight states for columns/rows/cells
  - Provides click callbacks that the wizard consumes to assign mapping fields
  - Grows to fill the column, keeps grid scrollable inside modal
  - Styles live in `SpreadsheetPreview.module.css` with luxe black/white grid aesthetics

- `src/client/types/pricing.ts`
  - Shared client-side types matching API payloads/responses (client sizes, line metadata, totals, settings, form payloads, blueprint structures)

**Workbook Mapping Notes:**
- **Purpose**: Tells AI where to look in workbook for analysis (not for manual deterministic parsing)
- Calculator sheet columns map to selection (`A`), quantity (`B`), tier (`D`), service (`E`), billing (`F`), rate tables (`G`–`O`), computed unit price (`R`), line total (`S`), and type (`T`)
- Totals cells: `B32` monthly, `B33` one-time, `B35` month-one grand total, `B36` ongoing monthly
- Quote Builder sheet cells updated with `quoteDetails` (`B5` client name, `B6` company, `B7` prepared by, `E5` size, `E6` price point, `E7` optional email)
- AI analyzes workbook structure using this mapping to generate service metadata
- Deterministic parser uses same mapping as fallback when AI unavailable

**Excel Function Shims:**
- `ensureCalcFunctionsRegistered()` registers shims for `_xlfn.ANCHORARRAY`, `_xlfn.FILTER`, `_xlws.FILTER`, and `FILTER` to keep `xlsx-calc` aligned with Excel 365 formulas.
- The FILTER shim performs a best-effort row filtering (supports 1D/2D arrays) and falls back to `ifEmpty` or `[]` when no rows survive.

- **Workbook Mapping Wizard (Jan 2025 refresh):**
  - Launches from the Pricing admin card and opens `WorkbookMappingWizard` (modal rendered via portal) with a single consolidated configuration interface.
  - Workbook uploads stage the file and prompt the admin to confirm the calculator sheet; clicking **Analyze** sends the staged payload plus the current mapping to `onUploadWorkbook`, keeping the preview available for edits before analysis.
  - Mapping inputs live-update the `PricingWorkbookMapping` structure; the wizard displays blueprint output and warnings alongside the preview for quick iteration.
- Service rules and overrides continue to flow through the blueprint endpoints described above (triggered outside this simplified wizard when needed).

**Usage Flow:**
1. Admin loads `/admin` → `PricingCalculatorAdmin` hits `/api/pricing`; when metadata is missing it shows a “Launch Setup Wizard” CTA instead of rendering the calculator, honouring the no-default-workbook rule.
2. If the CTA is used, the workbook wizard accepts an upload/mapping and persists it via `PUT /api/pricing/workbook`; on success the bootstrap refreshes automatically so the calculator unlocks immediately.
3. Once metadata is available, changes to toggles/quantities/overrides trigger recalculations via `/api/pricing/calculate` and totals update live.
4. `Save Defaults` writes to `PricingSettingsModel` ensuring future sessions preload custom options.
5. `Export` downloads XLSX/CSV and, when configured, emails attachment via `MailService` in one action.
6. Workbook uploads stage locally first; once the admin presses **Analyze**, the wizard forwards the payload through `PUT /api/pricing/workbook`, keeping Netlify deployments stateless while ensuring metadata refreshes instantly for admins.
  - `PricingCalculatorAdmin` wires `handleWorkbookUploadDuringWizard` into the wizard so analyses run on-demand while still refreshing stored mapping/blueprint payloads; status messaging surfaces any AI blueprint warnings that come back with the response.

**Environment Requirements:**
- Ensure new dependencies (`xlsx`, `xlsx-calc`, `nodemailer`) are available in Netlify build.
- Configure SMTP env vars for email features; API gracefully errors when unset so UI can notify admins.

- **Pricing Blueprint Initiative (Nov 2025)**:
  - `src/server/pricing/blueprint.ts` defines portable blueprint types (`PricingBlueprint`, `PricingServiceBlueprint`, `PricingWorkbookSnapshot`, etc.) used to describe services, rate bands, modifiers, and flattened workbook data.
  - **MAJOR UPDATE (Dec 2024)**: Flexible rate band structure - AI now discovers actual price point names from workbook instead of forcing into predefined low/high/maintenance template
  - `src/server/pricing/workbookAnalyzer.ts` exposes `extractWorkbookSnapshot` / `extractWorkbookSnapshotFromBuffer` utilities to flatten Excel worksheets into typed snapshots (headers, data, validations) for downstream AI-assisted analysis.
  - `src/server/pricing/aiBlueprintGenerator.ts` provides `generatePricingBlueprintWithAI()` which accepts a workbook snapshot and an OpenAI-compatible client to request a structured pricing blueprint using JSON schema enforcement. The module intentionally uses a lightweight `OpenAIClientLike` interface so we can plug in the official SDK or mocks in tests.
  - **Prompt Guardrails (Nov 2025)**: The AI prompt now explicitly requires concrete service names, billing cadence, and numeric price bands. It skips section dividers, strips currency symbols before populating `rateBands`, and can still surface maintenance pricing when a workbook column provides it—but the downstream parser now treats that column as optional.
  - **chargeType Field (Dec 2024)**: New `chargeType` field captures TRUE charge timing (recurring | one-time) separate from descriptive `billingCadence`. AI intelligently determines chargeType from billing keywords:
    - recurring: Monthly, Quarterly, Annual, Retainer, Ongoing, Per Month
    - one-time: Project, Session, Per Project, As Needed, One-time, Setup, Onboarding, Implementation, Initial
    - **Note**: Setup/onboarding fees are ONE-TIME charges (they don't recur), even though they happen at the beginning
  - **Flexible Rate Bands (Dec 2024)**: `rateBands` changed from fixed `{low, high, maintenance}` to flexible `Record<string, number | null>`. AI discovers actual price point names (e.g., bronze/silver/gold, startup/growth/enterprise, basic/standard/premium) instead of forcing into predetermined structure.
  - **Deterministic Rate Resolution (Nov 2025)**: Pricing calculations no longer rely on Excel formulas for defaults. `resolveBaseUnitPrice` derives baseline unit prices from the configured low/high rate bands, and maintenance-specific helpers have been removed now that maintenance is handled by standalone workbook sections.
  - Future work: wire these utilities into the admin pricing flow to auto-generate service catalogs when the workbook structure changes, then layer manual overrides on top of the generated blueprint.
  - `src/server/pricing/deterministicBlueprint.ts` adds `generateDeterministicPricingBlueprint()` which builds a read-only blueprint directly from the workbook snapshot and current mapping. `runWorkbookAnalysis()` now calls this automatically whenever OpenAI is unavailable or fails, so admins always see an immediate summary after uploading a workbook.
  
**Key Architectural Benefits:**
- **No More Rigid Templates**: System adapts to ANY workbook structure (bronze/silver/gold, startup/growth/enterprise, etc.)
- **Accurate Charge Timing**: chargeType ensures one-time fees go to correct subtotal regardless of descriptive billing label
- **Future-Proof**: Can handle workbooks with different segment names, price point structures, and billing models without code changes
- **Backward Compatible**: Legacy low/high/maintenance structure still supported via mapping layer in parser.ts
---

### Admin Access UX Refresh (Jan 2025)

Purpose:
Remove the dedicated `/admin` route and let admins switch between Admin Dashboard and Client View directly within `/profile`.

Changes:
- Admins land on `/profile` and see a two-button switcher: "Admin Dashboard" and "Client View".
- Selection persists in `localStorage` under key `adminView`.
- Visiting `admin.<domain>` defaults the switcher to Admin Dashboard; `client.<domain>` defaults to Client View.

Implementation:
- `AdminClientSwitcher` (inline in `src/client/pages/App.tsx`)
  - Renders the switcher and toggles between `<AdminPanel />` and `<ClientProfile />`.
  - No props; relies on authenticated `user` from App state.

Routing:
- `/admin` route removed.
- `/profile` now hosts both admin and client experiences (admin-gated).
- Subdomain root redirects: `admin.*` and `client.*` both redirect to `/profile` with default view set accordingly.

Header Navigation:
- Shows a single `/profile` link for authenticated users (label "Profile" for admins, "My Profile" for standard users).

---

### Cross-Subdomain Auth & CORS (Jan 2025)

Updates:
- CORS (`src/server/index.ts`):
  - Allows `http://localhost:4000`, `http://localhost:5173`.
  - Allows any `*.localhost:<port>` (e.g., `admin.localhost:4000`, `client.localhost:4000`).
  - Allows any subdomain of `mayrconsultingservices.com`.
  - Includes `https://mayraccountingservices.netlify.app`.
  - `credentials: true` kept; reduces noisy dev logs; blocks true unknown origins in production.
- Cookie Domain (`src/server/routes/auth.ts`):
  - Sets cookie domain to `.localhost` for hosts ending with `localhost`, enabling cookie sharing across `admin.localhost` and `client.localhost`.
  - Keeps host-only cookies for bare `localhost` and IPs.

---
