import { describe, expect, it } from "vitest";
import { pickLabels } from "./tags";

describe("pickLabels", () => {
  it("says event for events and place for food and bars", () => {
    expect(pickLabels("events").no).toBe("Not my ideal event");
    expect(pickLabels("food").no).toBe("Not my ideal place");
    expect(pickLabels("bars").no).toBe("Not my ideal place");
    expect(pickLabels("events").yes).toBe("I\u2019d like to go");
  });
});
