/** Team remembered on this device for a tournament ("C'est mon équipe"). */
export const myTeamCookie = (code: string) => `os_t_${code}`;
/** Team score code remembered on this device after a captain entered it once. */
export const teamCodeCookie = (code: string, team: number) => `os_tc_${code}_${team}`;

/** Random token of the device that registered a team (hashed in the database). */
export const registrationCookie = (code: string) => `os_reg_${code}`;
