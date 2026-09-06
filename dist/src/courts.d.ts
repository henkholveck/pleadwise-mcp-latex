import type { CourtRule } from "./types.js";
export declare function detectCourt(text: string): CourtRule;
export declare function getCourt(query?: string): CourtRule;
export declare function listCourts(): CourtRule[];
