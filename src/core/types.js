// @ts-check
// تعريفات الأنواع المشتركة (JSDoc فقط، بلا منطق وقت التشغيل).
// تُستورد في ملفات أخرى هكذا: /** @typedef {import('./types.js').Session} Session */

/** @typedef {'morning'|'evening'} Period */
/** @typedef {'timer'|'manual'|'migrated'} Source */

/**
 * @typedef {object} Session
 * @property {string} id
 * @property {string} date YYYY-MM-DD
 * @property {Period} period
 * @property {number} minutes
 * @property {number|null} startedAt
 * @property {string} source
 * @property {string|null} subject
 * @property {string} note
 * @property {number} createdAt
 */

/**
 * @typedef {object} Subject
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {boolean} archived
 */

/**
 * @typedef {object} DayOff
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {string} [note]
 * @property {string} [type]
 */

/**
 * @typedef {object} Exam
 * @property {string} id
 * @property {string} name
 * @property {string} date
 */

/**
 * @typedef {object} DayTarget
 * @property {number} morningMins
 * @property {number} eveningMins
 */

/**
 * @typedef {object} PlanVersion
 * @property {string} effectiveFrom
 * @property {Record<number, DayTarget>} targets
 * @property {number|null} [weeklyMins]
 */

/**
 * @typedef {object} Plan
 * @property {PlanVersion[]} versions
 */

/**
 * @typedef {object} TimerSettings
 * @property {number} focusMins
 * @property {number} shortMins
 * @property {number} longMins
 * @property {number} longEvery
 * @property {boolean} sound
 * @property {boolean} notify
 */

/**
 * @typedef {object} Settings
 * @property {string} trackingStart
 * @property {number} freezesPerMonth
 * @property {TimerSettings} timer
 */

/**
 * @typedef {object} AchievementsState
 * @property {Record<string, string>} unlocked
 */

/**
 * @typedef {object} State
 * @property {number} schemaVersion
 * @property {Session[]} sessions
 * @property {Record<string, {quality: string}>} dayMeta
 * @property {Subject[]} subjects
 * @property {DayOff[]} dayOffs
 * @property {Exam[]} exams
 * @property {AchievementsState} achievements
 * @property {Plan} plan
 * @property {Settings} settings
 */

/**
 * واجهة التخزين المحقونة (getItem/setItem/removeItem).
 * @typedef {object} StorageLike
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

export {};

// ---- تعريفات status/stats/analytics (مضافة) ----

/**
 * @typedef {object} DayTotals
 * @property {number} morningMins
 * @property {number} eveningMins
 * @property {number} totalMins
 * @property {number} count
 */

/** @typedef {Record<string, DayTotals>} DayIndex فهرس تاريخ → مجاميع اليوم */

/** @typedef {'future'|'default'|'completed'|'compensated'|'failed'|'frozen'|'excused'|'rest'} DayStatus */

/** @typedef {Record<string, {quality: string}>} DayMeta */

/**
 * @typedef {object} Timeline
 * @property {Map<string, DayStatus>} statuses
 * @property {number} streak
 * @property {Record<string, number>} freezesUsed
 */

/**
 * سياق الحساب (يبنيه createContext) مع خانتي التخزين المؤقت الداخليتين.
 * @typedef {object} EvalCtx
 * @property {DayIndex} index
 * @property {Plan} plan
 * @property {string} trackingStart
 * @property {string} today
 * @property {DayOff[]} [dayOffs]
 * @property {number} [freezesPerMonth]
 * @property {Map<string, DayOff>} [_dayOffIndex]
 * @property {Timeline} [_timeline]
 */

/** @typedef {{ from: string, to: string }} DateRange */
