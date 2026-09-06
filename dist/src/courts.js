const courts = [
    {
        id: "federal-general",
        name: "United States District Court (general baseline)",
        jurisdiction: "federal",
        fontFamily: "Times New Roman",
        fontSizePt: 12,
        lineSpacing: 2,
        marginsInches: { top: 1, right: 1, bottom: 1, left: 1 },
        pageNumbers: "Bottom center",
        pleadingPaper: "Not generally required",
        notes: ["Baseline only. Confirm district local rules, the assigned judge's standing orders, page limits, and filing-event requirements."],
    },
    {
        id: "california-superior-general",
        name: "California Superior Court (general civil baseline)",
        jurisdiction: "california-state",
        fontFamily: "Times New Roman",
        fontSizePt: 12,
        lineSpacing: 1.5,
        marginsInches: { top: 1, right: 0.5, bottom: 1, left: 1 },
        pageNumbers: "Bottom center",
        pleadingPaper: "28-line pleading paper commonly required",
        notes: ["Baseline only. Confirm California Rules of Court, the county local rules, and department-specific requirements."],
    },
    {
        id: "washington-superior-general",
        name: "Washington Superior Court (general civil baseline)",
        jurisdiction: "washington-state",
        fontFamily: "Times New Roman",
        fontSizePt: 12,
        lineSpacing: 2,
        marginsInches: { top: 1, right: 1, bottom: 1, left: 1 },
        pageNumbers: "Bottom center",
        pleadingPaper: "Not generally required",
        notes: ["Baseline only. Confirm Washington court rules, county local rules, and the assigned judicial officer's procedures."],
    },
];
export function detectCourt(text) {
    const lower = text.toLowerCase();
    if (/superior court of (the state of )?california|california superior court/.test(lower))
        return courts[1];
    if (/superior court of (the state of )?washington|washington superior court/.test(lower))
        return courts[2];
    return courts[0];
}
export function getCourt(query) {
    if (!query)
        return courts[0];
    const normalized = query.toLowerCase();
    return courts.find((court) => court.id === normalized)
        ?? courts.find((court) => court.name.toLowerCase().includes(normalized) || normalized.includes(court.jurisdiction))
        ?? courts[0];
}
export function listCourts() { return courts; }
//# sourceMappingURL=courts.js.map