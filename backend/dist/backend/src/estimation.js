export function buildEstimate(req) {
    if (!req.revenueApprox)
        return undefined; // need at least revenue to bracket
    const revenueBracket = req.revenueApprox < 2000000 ? "small" : "mid";
    const ranges = [];
    const push = (service, low, high, cadence, notes) => {
        ranges.push({ service, low, high, cadence, notes });
    };
    if (req.wantsBookkeeping) {
        push("Bookkeeping", revenueBracket === "small" ? 300 : 800, revenueBracket === "small" ? 800 : 1500, "monthly", volumeNote(req.transactionsPerMonth));
    }
    if (req.wantsReconciliations && req.reconciliationAccounts) {
        const perLow = revenueBracket === "small" ? 100 : 250;
        const perHigh = revenueBracket === "small" ? 250 : 500;
        push("Bank & Credit Reconciliations", perLow * req.reconciliationAccounts, perHigh * req.reconciliationAccounts, "monthly", `${req.reconciliationAccounts} accounts`);
    }
    if (req.wantsFinancials) {
        push("Financial Statement Preparation", revenueBracket === "small" ? 250 : 600, revenueBracket === "small" ? 600 : 1200, "monthly/quarterly");
    }
    if (req.wantsSoftwareImplementation) {
        push("Accounting Software Implementation", revenueBracket === "small" ? 500 : 1200, revenueBracket === "small" ? 1200 : 2500, "one-time");
    }
    if (req.wantsAdvisory) {
        push("Advisory / Strategic Financial Guidance (estimate)", revenueBracket === "small" ? 75 : 125, revenueBracket === "small" ? 125 : 175, "hourly");
    }
    if (req.wantsAR) {
        push("Accounts Receivable Outsourcing", revenueBracket === "small" ? 500 : 1200, revenueBracket === "small" ? 1200 : 2500, "monthly");
    }
    if (req.wantsAP) {
        push("Accounts Payable Outsourcing", revenueBracket === "small" ? 500 : 1200, revenueBracket === "small" ? 1200 : 2500, "monthly");
    }
    if (req.wantsAR && req.wantsAP) {
        push("Combined AR & AP Package", revenueBracket === "small" ? 900 : 2000, revenueBracket === "small" ? 2000 : 4000, "monthly");
    }
    if (req.wantsForecasting) {
        push("Cash Flow Forecasting / Budgeting", revenueBracket === "small" ? 300 : 600, revenueBracket === "small" ? 600 : 1200, "monthly");
    }
    if (req.wantsCleanup) {
        push("One-Time Financial Clean-Up", revenueBracket === "small" ? 500 : 2000, revenueBracket === "small" ? 2000 : 5000, "scope-based");
    }
    let suggestedPackage;
    const monthlyServices = ranges.filter((r) => r.cadence.includes("monthly") || r.cadence.includes("monthly/"));
    const count = monthlyServices.length;
    if (count <= 3)
        suggestedPackage = "Starter";
    else if (count <= 6)
        suggestedPackage = "Growth";
    else
        suggestedPackage = "Premium";
    return { revenueBracket, ranges, suggestedPackage };
}
function volumeNote(tx) {
    if (!tx)
        return undefined;
    if (tx < 100)
        return "<100 tx/mo";
    if (tx < 500)
        return "100-500 tx/mo";
    return "500+ tx/mo";
}
