/**
 * Sense release labels accepted by the QSEoW thumbnail command.
 *
 * Keep this list beside the selector map so a new release cannot be accepted by Commander without
 * also having a browser selector for the logout fallback.
 */
export const QSEOW_SENSE_VERSIONS = Object.freeze([
    'pre-2022-Nov',
    '2022-Nov',
    '2023-Feb',
    '2023-May',
    '2023-Aug',
    '2023-Nov',
    '2024-Feb',
    '2024-May',
    '2024-Nov',
    '2025-May',
    '2025-Nov',
    '2026-May',
]);

/** The release used when no Sense version is specified. */
export const DEFAULT_QSEOW_SENSE_VERSION = '2026-May';

const HUB_USER_PAGE_BUTTON_PRE_2022_NOV = 'xpath/.//*[@id="hub-sidebar"]/div[1]/div[1]/div/div/div';
const HUB_USER_PAGE_BUTTON_2022_NOV =
    'xpath/.//*[@id="q-hub-toolbar"]/header/div/div[5]/div/div/div/button';
const HUB_USER_PAGE_BUTTON_2023_FEB =
    'xpath/.//*[@id="q-hub-toolbar"]/header/div/div[5]/div/div/div/button/span/span';
const HUB_USER_PAGE_BUTTON_MODERN =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';

const HUB_LOGOUT_BUTTON_PRE_2022_NOV =
    'xpath/.//*[@id="q-hub-user-popover-override"]/ng-transclude/div[2]/button';
const HUB_LOGOUT_BUTTON_2022_NOV =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';
const HUB_LOGOUT_BUTTON_2023_FEB =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[5]/span[2]';
const HUB_LOGOUT_BUTTON_2023_MAY =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';
const HUB_LOGOUT_BUTTON_2025_MAY =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[4]/span[2]';
const HUB_LOGOUT_BUTTON_2025_NOV =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[5]/span[2]';

const HUB_SELECTORS_BY_SENSE_VERSION = Object.freeze({
    'pre-2022-Nov': {
        userMenuButton: HUB_USER_PAGE_BUTTON_PRE_2022_NOV,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_PRE_2022_NOV,
    },
    '2022-Nov': {
        userMenuButton: HUB_USER_PAGE_BUTTON_2022_NOV,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2022_NOV,
    },
    '2023-Feb': {
        userMenuButton: HUB_USER_PAGE_BUTTON_2023_FEB,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_FEB,
    },
    '2023-May': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_MAY,
    },
    '2023-Aug': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_MAY,
    },
    '2023-Nov': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_MAY,
    },
    '2024-Feb': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_MAY,
    },
    '2024-May': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_MAY,
    },
    '2024-Nov': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2023_MAY,
    },
    '2025-May': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2025_MAY,
    },
    '2025-Nov': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2025_NOV,
    },
    '2026-May': {
        userMenuButton: HUB_USER_PAGE_BUTTON_MODERN,
        // The 2026-May server verified for #883 has the same four-item menu as 2025-May.
        legacyLogoutButton: HUB_LOGOUT_BUTTON_2025_MAY,
    },
});

/**
 * Returns the hub selectors for a QSEoW Sense release.
 *
 * @param {string} senseVersion - Qlik Sense release label.
 *
 * @returns {{userMenuButton: string, legacyLogoutButton: string}|undefined} Hub selectors, or
 *     `undefined` for an unsupported release.
 */
export const getQseowHubSelectors = (senseVersion) => HUB_SELECTORS_BY_SENSE_VERSION[senseVersion];
