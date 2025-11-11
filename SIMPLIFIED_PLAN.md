# Simplified Invoice Generator Plan

## Current Situation
The pricing calculator has become overly complex with:
- AI blueprint generation
- Multiple data layers (deterministic parser + AI overlay)
- Complex mapping wizard
- Unnecessary abstraction

## What You Actually Need
**Simple Invoice Generator:**
1. Upload Excel file with services and rates
2. Select client size (Solo/Small/Mid-Market)
3. Select price point (Low/Midpoint/High)
4. Check which services to include
5. Set quantities
6. Generate invoice with totals

## Proposed Simplified Architecture

### 1. Excel File Structure (Based on current data)
Your Excel has:
- **Row 9-39**: Service rows with columns:
  - Column A: Select checkbox
  - Column B: Quantity
  - Column C: Tier
  - Column D: Service name
  - Column E: Billing cadence
  - Columns F-K: Price rates (Solo Low/High, Small Low/High, Mid Low/High)
  - Column P: Type (Monthly/One-time)

### 2. Simple Backend (`/api/invoice`)
```typescript
// One endpoint to read Excel and return services
GET /api/invoice/services
- Returns: List of services with their rate bands

// One endpoint to calculate invoice
POST /api/invoice/calculate
- Input: Client size, price point, selected services with quantities
- Output: Line items with prices, subtotals, total

// One endpoint to export
POST /api/invoice/export
- Input: Same as calculate + client details
- Output: PDF or Excel file
```

### 3. Simple Frontend
One clean form:
```
Client Details:
- Name, Company, Email
- Client Size: [Solo/Startup | Small Business | Mid-Market]
- Price Point: [Low | Midpoint | High]

Services:
[✓] Bookkeeping (Qty: 1) - $800
[✓] Payroll Setup (Qty: 1) - $300
[ ] KPI Dashboard (Qty: 1) - $2000
...

Totals:
Monthly: $1,100
One-time: $0
Grand Total: $1,100

[Generate Invoice] [Save as Draft]
```

## Implementation Steps

1. **Remove complexity**: Delete AI blueprint, mapping wizard, multiple data layers
2. **Simple Excel reader**: Direct XLSX reading with hardcoded column positions
3. **Clean UI**: One form component with checkboxes and totals
4. **PDF export**: Use existing workbook + fill in values → export

## Benefits
- 10x less code
- No AI costs
- Faster load times
- Easier to maintain
- Does exactly what you need

Would you like me to implement this simplified version?
