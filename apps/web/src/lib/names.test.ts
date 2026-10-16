import { describe, expect, it } from "vitest";
import { publicPlayerLine, publicPlayerName, publicTeamLabel } from "./names";

const dupont = { first_name: "Jean", last_name: "Dupont" };
const martin = { first_name: "élodie", last_name: "Martin" };

describe("public names", () => {
  it("shows full names or initials as the organizer chose", () => {
    expect(publicPlayerName(dupont, "full")).toBe("Jean Dupont");
    expect(publicPlayerName(martin, "initials")).toBe("É. M.");
  });
  it("labels a team by its name, its players or its number", () => {
    expect(publicTeamLabel({ name: "Cassis FC", number: 4 }, [dupont], "full")).toBe("Cassis FC");
    expect(publicTeamLabel({ name: null, number: 27 }, [dupont, martin], "full")).toBe("Dupont / Martin");
    expect(publicTeamLabel({ name: null, number: 27 }, [dupont, martin], "initials")).toBe("J. D. / É. M.");
    expect(publicTeamLabel({ name: null, number: 27 }, [], "full")).toBe("#27");
  });
  it("writes a player on a draw sheet as « NOM PRÉNOM » in capitals, or initials in the same order", () => {
    expect(publicPlayerLine(dupont, "full")).toBe("DUPONT JEAN");
    expect(publicPlayerLine(martin, "full")).toBe("MARTIN ÉLODIE");
    expect(publicPlayerLine(martin, "initials")).toBe("M. É.");
    expect(publicPlayerLine({ first_name: " ", last_name: "Durand " }, "full")).toBe("DURAND");
  });
});
