import { DAY_START_HOUR, NIGHT_START_HOUR, OTHER_PERIOD_WEIGHT } from "../config.js";

/** "day" or "night" for an hour of 0-23. */
export function periodOf(hour) {
    return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? "day" : "night";
}

/** How much a report counts when walking in a period. Reports with no known hour (-1 or missing) count fully in both. */
export function timeWeight(hour, period) {
    return hour === undefined || hour < 0 || periodOf(hour) === period ? 1 : OTHER_PERIOD_WEIGHT;
}

const COLUMBUS_HOUR = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" });

/** The period it is right now in Columbus. */
export function currentPeriod(now = new Date()) {
    return periodOf(Number(COLUMBUS_HOUR.format(now)));
}
